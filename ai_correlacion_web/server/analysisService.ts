import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { chmodSync, createReadStream, createWriteStream, existsSync } from "node:fs";
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";
import { promisify } from "node:util";

import { path7za } from "7zip-bin";
import { nanoid } from "nanoid";

import {
  addAnalysisEvent,
  createAnalysisJob,
  getAnalysisInsight,
  getAnalysisJobByJobId,
  listAnalysisArtifacts,
  listAnalysisEvents,
  listAnalysisJobs,
  replaceAnalysisArtifacts,
  updateAnalysisJob,
  upsertAnalysisInsight,
} from "./db";
import { copyTempFileToLocalArtifact, localArtifactExists, persistJobArtifactBuffer } from "./artifactLocalStore";
import { invokeLLM } from "./_core/llm";
import { getServerProcessDebugSnapshot } from "./_core/serverProcessDebug";
import { storageGetBuffer, storagePut } from "./storage";
import { normalizeOptionalSampleSha256 } from "../shared/virusTotal";
import {
  buildMitreDefenseEvasion,
  type AnalysisArtifactDto,
  type AnalysisInsightDto,
  type AnalysisJobDetail,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type MalwareCategory,
  type ReductionFileMetric,
  type ReductionMetrics,
  type RiskLevel,
  type SupportedLogType,
} from "../shared/analysis";

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_ARTIFACT_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 20;
const MAX_EVENTS = 320;
const DEFAULT_FOCUS = "Contradef log intelligence";
const ARCHIVE_EXTENSIONS = new Set([".7z", ".zip", ".rar"]);
const TEXT_LOG_EXTENSIONS = new Set([".cdf", ".csv", ".txt", ".log", ".json"]);
const execFileAsync = promisify(execFile);

function isNoSpaceError(error: unknown): boolean {
  const e = error as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer };
  if (e?.code === "ENOSPC") {
    return true;
  }
  const blob = [e?.message, e?.stderr, e?.stdout]
    .map((part) => (Buffer.isBuffer(part) ? part.toString("utf-8") : (part as string | undefined) ?? ""))
    .join(" ");
  return /enospc|no space left|espaço insuficiente|write could not be completed|NSPOSIXErrorDomain.*28|errno:\s*28/i.test(
    blob,
  );
}

const WORK_TMP_ROOT = process.env.CONTRADEF_WORK_TMP?.trim()
  ? process.env.CONTRADEF_WORK_TMP.trim()
  : process.platform === "win32"
    ? join("E:\\", "contradef-tmp", "analysis")
    : join(tmpdir(), "contradef-tmp", "analysis");

let sevenZipExecutablePrepared = false;
/** Linux (e.g. Render): 7zip-bin often lacks +x; spawn fails with EACCES until chmod. */
function ensure7zaExecutable(): void {
  if (sevenZipExecutablePrepared) return;
  sevenZipExecutablePrepared = true;
  if (process.platform === "win32") return;
  try {
    if (path7za && existsSync(path7za)) {
      chmodSync(path7za, 0o755);
    }
  } catch {
    /* already executable or read-only */
  }
}

const suspiciousApis = [
  "IsDebuggerPresent",
  "CheckRemoteDebuggerPresent",
  "NtQueryInformationProcess",
  "VirtualProtect",
  "VirtualAlloc",
  "WriteProcessMemory",
  "CreateRemoteThread",
  "Sleep",
  "EnumSystemFirmwareTables",
  "GetTickCount",
  "RtlQueryPerformanceCounter",
  "NtDelayExecution",
  "GetProcAddress",
  "WriteFile",
  "URLDownloadToFile",
  "WinHttpSendRequest",
  "InternetOpenUrl",
  "RegSetValue",
  "CreateFile",
  "DeleteFile",
];

const stageOrder = [
  "Inicialização",
  "Evasão",
  "Desempacotamento",
  "Execução maliciosa",
  "Persistência",
  "Exfiltração",
];

type LogParseProgress = {
  jobId: string;
  fileLabel: string;
  sizeBytes?: number;
  logType: SupportedLogType;
};

type ParseProgressState = {
  lineCount: number;
  byteWeight: number;
  logLines: string[];
  lastFlushMs: number;
  lastFlushedBytes: number;
};

function formatBytesPt(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

const PARSE_PROGRESS_MIN_MS = 2500;
const PARSE_PROGRESS_LINE_STRIDE = 100_000;
/** Em ficheiros muito grandes, emitir leitura mesmo entre marcos de linha, para a UI não marcar falso “sem actualização” durante fases longas. */
const PARSE_PROGRESS_BYTE_STRIDE = 32 * 1024 * 1024;

type ParseProgressStrideConfig = {
  minMs: number;
  lineStride: number;
  byteStride: number;
};

/** Ficheiros multi‑GB: flush mais frequente (menos tempo entre % e eventos file-stage). */
function getAdaptiveParseConfig(sizeBytes: number | undefined): ParseProgressStrideConfig {
  const bs = typeof sizeBytes === "number" && sizeBytes > 0 ? sizeBytes : 0;
  const gb = bs / 1024 ** 3;
  if (gb >= 2) {
    return { minMs: 1000, lineStride: 12_000, byteStride: 4 * 1024 * 1024 };
  }
  if (gb >= 0.5) {
    return { minMs: 1200, lineStride: 25_000, byteStride: 8 * 1024 * 1024 };
  }
  return {
    minMs: PARSE_PROGRESS_MIN_MS,
    lineStride: PARSE_PROGRESS_LINE_STRIDE,
    byteStride: PARSE_PROGRESS_BYTE_STRIDE,
  };
}
const PARSE_LOG_MAX_LINES = 40;
/** Cede o event loop do Node; reduz risco de timeout do alojamento e de “congelamento” noutros pedidos durante ficheiros multi‑GB. */
const PARSE_YIELD_EVERY_LINES = (() => {
  const n = Number.parseInt(process.env.CONTRADEF_PARSE_YIELD_EVERY ?? "4096", 10);
  return Number.isFinite(n) && n >= 200 ? n : 4096;
})();
/** Uma linha de vários MB pode rebentar memória ou atrasar muito o regex; truncar para processamento. */
const MAX_LOG_LINE_CODE_UNITS = 512_000;

/** Marca 45% = início da heurística no fluxo; ~88% = fim da leitura; consolidação 82–100% vem dos eventos finais. Uma casa decimal evita “preso” no mesmo inteiro durante GB lidos. */
function computeProgressPercentWhileParsing(
  byteWeight: number,
  lineCount: number,
  sizeBytes: number | undefined,
): number {
  if (sizeBytes && sizeBytes > 0) {
    const t = Math.min(1, byteWeight / sizeBytes);
    return Math.min(88, Math.round((45 + t * 43) * 10) / 10);
  }
  if (lineCount > 0) {
    return Math.min(88, 45 + Math.min(30, Math.floor(lineCount / 1_000_000)));
  }
  return 45;
}

function shouldReportParseProgress(
  state: ParseProgressState,
  options: { force: boolean },
  config: ParseProgressStrideConfig,
): boolean {
  if (state.lineCount < 1) {
    return false;
  }
  if (options.force) {
    return true;
  }
  const now = Date.now();
  const sinceLast = state.lastFlushMs === 0 ? Number.POSITIVE_INFINITY : now - state.lastFlushMs;
  const lineStride = Math.max(1, config.lineStride);
  const hitLineStride = state.lineCount > 0 && state.lineCount % lineStride === 0;
  const hitByteStride = state.byteWeight - state.lastFlushedBytes >= config.byteStride;
  return sinceLast >= config.minMs || hitLineStride || hitByteStride;
}

async function maybeFlushParseProgress(
  state: ParseProgressState,
  progress: LogParseProgress,
  options: { force: boolean },
): Promise<void> {
  const { lineCount, byteWeight } = state;
  if (lineCount < 1) {
    return;
  }
  const stride = getAdaptiveParseConfig(progress.sizeBytes);
  if (!shouldReportParseProgress(state, options, stride)) {
    return;
  }
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${lineCount.toLocaleString("pt-PT")} linhas · ${formatBytesPt(byteWeight)} lidos (UTF-8 aprox.)`;
  state.logLines.push(line);
  if (state.logLines.length > PARSE_LOG_MAX_LINES) {
    state.logLines.shift();
  }
  state.lastFlushMs = Date.now();
  state.lastFlushedBytes = state.byteWeight;

  const fileProgress = computeProgressPercentWhileParsing(byteWeight, lineCount, progress.sizeBytes);
  const msg = `A processar ${progress.fileLabel}: ${lineCount.toLocaleString("pt-PT")} linhas…`;
  const liveStep = `Leitura: ${lineCount.toLocaleString("pt-PT")} linhas · ${formatBytesPt(byteWeight)} (≈${fileProgress}%)`;
  const stdoutTail = [`Leitura em curso: ${progress.fileLabel}`, ...state.logLines].join("\n");
  const jobEventProgress = Math.min(90, Math.round(38 + fileProgress * 0.55));

  /**
   * A linha `analysisJobs.progress` alimenta a fila (Centro / listagens). Só tínhamos `startProgress`
   * ao trocar de ficheiro; durante MB/GB a ler, o valor ficava "preso" (ex. 60% no 5.º/6 ficheiros).
   */
  await updateAnalysisJob(progress.jobId, {
    message: msg,
    stdoutTail,
    progress: jobEventProgress,
  });

  /**
   * Em ficheiros de vários GB, `fileProgress` fica muitos minutos no mesmo valor inteiro (ex. 46%)
   * enquanto as linhas/lidos sobem. Omitir o evento nesses flush criava a sensação (e na UI) de
   * “processo parado / sem actualização” — ainda com `updateAnalysisJob` a correr.
   */
  await addAnalysisEvent({
    jobId: progress.jobId,
    eventType: "file-stage",
    stage: "redução heurística",
    message: msg,
    progress: jobEventProgress,
    payloadJson: {
      fileName: progress.fileLabel,
      logType: progress.logType,
      status: "running",
      fileProgress,
      currentStage: "Redução heurística",
      currentStep: liveStep,
      lastMessage: msg,
      originalBytes: typeof progress.sizeBytes === "number" && progress.sizeBytes > 0 ? progress.sizeBytes : 0,
    },
  });
}

let logLineTruncationWarned = false;

function truncateOversizeLogLine(rawLine: string): string {
  if (rawLine.length <= MAX_LOG_LINE_CODE_UNITS) {
    return rawLine;
  }
  if (!logLineTruncationWarned) {
    logLineTruncationWarned = true;
    console.warn(
      "[Analysis] Linha de log excede o tamanho máximo para processamento; a truncar (evita gargalos e OOM).",
    );
  }
  return `${rawLine.slice(0, MAX_LOG_LINE_CODE_UNITS)}[… linha truncada: >${MAX_LOG_LINE_CODE_UNITS} carateres]`;
}

type StartAnalysisLogInput = {
  fileName: string;
  logType?: SupportedLogType;
  base64?: string;
  tempFilePath?: string;
  sizeBytes?: number;
  uploadSessionId?: string;
  uploadFileId?: string;
  uploadChunkCount?: number;
  uploadedByUserId?: number;
  uploadDurationMs?: number;
  uploadReused?: boolean;
};

type StartAnalysisJobInput = {
  analysisName: string;
  focusTerms?: string[];
  focusRegexes?: string[];
  logFiles: StartAnalysisLogInput[];
  createdByUserId?: number;
  origin?: string;
  /** SHA-256 do ficheiro da amostra (não dos logs), para ligar a relatórios como VirusTotal. */
  sampleSha256?: string | null;
};

type NormalizedEvent = {
  eventType: string;
  stage: string;
  message: string;
  logType: SupportedLogType;
  fileName: string;
  lineNumber: number;
  suspiciousApis: string[];
  suspicious: boolean;
  trigger: boolean;
  addresses: string[];
  techniqueTags: string[];
};

type AnalysisComputationResult = {
  events: NormalizedEvent[];
  artifacts: AnalysisArtifactDto[];
  insight: AnalysisInsightDto;
  summaryJson: Record<string, unknown>;
  metrics: ReductionMetrics;
  fileMetrics: ReductionFileMetric[];
  flowGraph: FlowGraph;
  classification: MalwareCategory;
  riskLevel: RiskLevel;
  currentPhase: string;
  suspiciousApis: string[];
  techniques: string[];
  recommendations: string[];
};

type ProcessedLogLine = {
  rawLine: string;
  normalizedLine: string;
  lineNumber: number;
  logType: SupportedLogType;
  fileName: string;
  apis: string[];
  addresses: string[];
  stage: string;
  techniqueTags: string[];
  suspicious: boolean;
  trigger: boolean;
};

type ParsedLogResult = {
  logType: SupportedLogType;
  keptLines: Array<{ lineNumber: number; text: string }>;
  events: NormalizedEvent[];
  suspiciousApis: string[];
  techniqueTags: string[];
  originalLineCount: number;
  reducedLineCount: number;
  originalBytes: number;
  reducedBytes: number;
  suspiciousEventCount: number;
  triggerCount: number;
};

function decodeBase64(input: string) {
  const normalized = input.includes(",") ? input.split(",").pop() ?? input : input;
  const trimmed = normalized.trim();
  if (!trimmed) {
    throw new Error("Um dos arquivos enviados está vazio ou em formato base64 inválido.");
  }
  return Buffer.from(trimmed, "base64");
}

function inferLogType(fileName: string, provided?: SupportedLogType): SupportedLogType {
  if (provided && provided !== "Unknown") return provided;
  const lowered = fileName.toLowerCase();
  if (lowered.includes("functioninterceptor") || lowered.includes("function_interceptor")) return "FunctionInterceptor";
  if (lowered.includes("tracefcncall") || lowered.includes("trace_fcn_call")) return "TraceFcnCall";
  if (lowered.includes("tracememory") || lowered.includes("trace_memory")) return "TraceMemory";
  if (lowered.includes("traceinstructions") || lowered.includes("trace_instructions")) return "TraceInstructions";
  if (lowered.includes("tracedisassembly") || lowered.includes("trace_disassembly")) return "TraceDisassembly";
  return "Unknown";
}

function buildUploadedChunkStorageKey(userId: number, sessionId: string, fileId: string, chunkIndex: number) {
  return `reduce-logs-chunks/${userId}/${sessionId}/${fileId}/chunk-${String(chunkIndex).padStart(6, "0")}.part`;
}

function hasChunkUploadReference(logFile: StartAnalysisLogInput) {
  return Boolean(
    logFile.uploadSessionId
      && logFile.uploadFileId
      && Number.isInteger(logFile.uploadChunkCount)
      && (logFile.uploadChunkCount ?? 0) > 0
      && typeof logFile.uploadedByUserId === "number"
      && Number.isFinite(logFile.uploadedByUserId)
  );
}

function isArchiveContainerFile(fileName: string) {
  return ARCHIVE_EXTENSIONS.has(extname(fileName).toLowerCase());
}

function isLikelyTextLogFile(fileName: string) {
  if (TEXT_LOG_EXTENSIONS.has(extname(fileName).toLowerCase())) return true;
  return inferLogType(fileName) !== "Unknown";
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursively(fullPath);
    }
    return [fullPath];
  }));
  return nested.flat();
}

async function createWorkTempDir(prefix: string) {
  const candidates = [WORK_TMP_ROOT, tmpdir()];
  let lastError: unknown = null;
  for (const baseDir of candidates) {
    try {
      await mkdir(baseDir, { recursive: true });
      return await mkdtemp(join(baseDir, prefix));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Não foi possível criar diretório temporário para processamento.");
}

async function materializeArchiveInput(logFile: StartAnalysisLogInput): Promise<{ archivePath: string; cleanupDir: string | null }> {
  if (logFile.tempFilePath) {
    return { archivePath: logFile.tempFilePath, cleanupDir: null };
  }

  if (hasChunkUploadReference(logFile)) {
    const tempDir = await createWorkTempDir("contradef-archive-src-");
    const archivePath = join(tempDir, basename(logFile.fileName));
    const writer = createWriteStream(archivePath);

    await new Promise<void>(async (resolvePromise, rejectPromise) => {
      writer.on("error", rejectPromise);
      writer.on("finish", resolvePromise);

      try {
        for (let chunkIndex = 0; chunkIndex < (logFile.uploadChunkCount ?? 0); chunkIndex += 1) {
          const chunkKey = buildUploadedChunkStorageKey(
            logFile.uploadedByUserId as number,
            logFile.uploadSessionId as string,
            logFile.uploadFileId as string,
            chunkIndex,
          );
          const chunkDownload = await storageGetBuffer(chunkKey);
          writer.write(chunkDownload.buffer);
        }
        writer.end();
      } catch (error) {
        writer.destroy();
        rejectPromise(error);
      }
    });

    return { archivePath, cleanupDir: tempDir };
  }

  if (logFile.base64) {
    const decoded = decodeBase64(logFile.base64);
    const tempDir = await createWorkTempDir("contradef-archive-src-");
    const archivePath = join(tempDir, basename(logFile.fileName));
    await writeFile(archivePath, decoded);
    return { archivePath, cleanupDir: tempDir };
  }

  throw new Error(`O arquivo compactado ${logFile.fileName} não possui conteúdo submetido.`);
}

async function expandArchiveContainer(logFile: StartAnalysisLogInput): Promise<StartAnalysisLogInput[]> {
  const { archivePath, cleanupDir } = await materializeArchiveInput(logFile);
  const extractRoot = await createWorkTempDir("contradef-archive-extract-");

  try {
    ensure7zaExecutable();
    await execFileAsync(path7za, ["x", "-y", `-o${extractRoot}`, archivePath], { windowsHide: true });
    const allFiles = await listFilesRecursively(extractRoot);
    const extractedLogs = await Promise.all(
      allFiles
        .filter((filePath) => isLikelyTextLogFile(filePath))
        .map(async (filePath) => {
          const relName = relative(extractRoot, filePath).replace(/\\/g, "/");
          const fileStats = await stat(filePath);
          return {
            fileName: relName || basename(filePath),
            logType: inferLogType(filePath, logFile.logType),
            tempFilePath: filePath,
            sizeBytes: fileStats.size,
            uploadDurationMs: logFile.uploadDurationMs,
            uploadReused: logFile.uploadReused,
          } satisfies StartAnalysisLogInput;
        }),
    );

    if (!extractedLogs.length) {
      throw new Error(`O contêiner ${logFile.fileName} não contém logs suportados para análise.`);
    }

    return extractedLogs;
  } catch (error) {
    if (isNoSpaceError(error)) {
      throw new Error(
        `Falha ao descompactar ${logFile.fileName}: espaço insuficiente no volume temporário (extração 7z). ` +
          `No Render, o disco do contentor é pequeno; defina CONTRADEF_WORK_TMP, reduza o 7z ou descompacte ficheiros maiores. ` +
          `Mensagem original: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao descompactar ${logFile.fileName}: ${message}`);
  } finally {
    if (cleanupDir) {
      await rm(cleanupDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function normalizeSubmittedLogs(input: StartAnalysisJobInput): Promise<StartAnalysisJobInput> {
  const expanded = await Promise.all(input.logFiles.map(async (logFile) => {
    if (!isArchiveContainerFile(logFile.fileName)) return [logFile];
    return expandArchiveContainer(logFile);
  }));

  const normalized = expanded.flat();
  if (!normalized.length) {
    throw new Error("Nenhum log válido foi encontrado após preparar os arquivos enviados.");
  }
  if (normalized.length > MAX_FILES) {
    throw new Error(`Após descompactar os contêineres, o lote contém ${normalized.length} arquivos. O máximo permitido é ${MAX_FILES}.`);
  }

  return {
    ...input,
    logFiles: normalized,
  };
}

function detectApis(line: string) {
  return suspiciousApis.filter((api) => line.includes(api));
}

function extractAddresses(line: string) {
  return Array.from(new Set(line.match(/0x[0-9a-fA-F]+/g) ?? []));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function determineStage(line: string, apis: string[]): string {
  const lowered = line.toLowerCase();
  if (apis.some((api) => ["IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess", "Sleep", "EnumSystemFirmwareTables", "GetTickCount", "RtlQueryPerformanceCounter"].includes(api)) || lowered.includes("sandbox") || lowered.includes("debug")) {
    return "Evasão";
  }
  if (apis.some((api) => ["VirtualProtect", "VirtualAlloc", "WriteProcessMemory", "CreateRemoteThread"].includes(api)) || lowered.includes("rw") && lowered.includes("rx") || lowered.includes("execute_read")) {
    return "Desempacotamento";
  }
  if (lowered.includes("regsetvalue") || lowered.includes("autorun") || lowered.includes("runonce") || lowered.includes("schtasks")) {
    return "Persistência";
  }
  if (lowered.includes("winhttp") || lowered.includes("internetopen") || lowered.includes("sendrequest") || lowered.includes("socket") || lowered.includes("c2") || lowered.includes("exfil")) {
    return "Exfiltração";
  }
  if (apis.length > 0 || lowered.includes("writefile") || lowered.includes("createfile") || lowered.includes("dropper") || lowered.includes("payload")) {
    return "Execução maliciosa";
  }
  return "Inicialização";
}

function detectTechniqueTags(line: string, apis: string[]) {
  const lowered = line.toLowerCase();
  const tags = new Set<string>();

  if (apis.some((api) => ["IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess"].includes(api)) || lowered.includes("debugger")) {
    tags.add("Anti-debug");
  }
  if (apis.includes("EnumSystemFirmwareTables") || lowered.includes("waet") || lowered.includes("hpet") || lowered.includes("virtualbox") || lowered.includes("vmware") || lowered.includes("hypervisor")) {
    tags.add("Detecção de VM");
  }
  if (apis.includes("Sleep") || lowered.includes("delay") || /sleep\s*[:=]?\s*\d{4,}/i.test(line)) {
    tags.add("Atraso deliberado");
  }
  if (apis.includes("VirtualProtect") || apis.includes("VirtualAlloc") || lowered.includes("rw") && lowered.includes("rx") || lowered.includes("page_execute")) {
    tags.add("Transição RW→RX");
  }
  if (apis.includes("WriteProcessMemory") || apis.includes("CreateRemoteThread")) {
    tags.add("Injeção de código");
  }
  if (apis.includes("GetTickCount") || apis.includes("RtlQueryPerformanceCounter") || lowered.includes("rdpmc") || lowered.includes("performance counter")) {
    tags.add("Verificação de overhead");
  }
  if (lowered.includes("writefile") || lowered.includes("deletefile") || lowered.includes("encrypt") || lowered.includes("ransom")) {
    tags.add("Manipulação de arquivos");
  }
  if (lowered.includes("winhttp") || lowered.includes("internetopen") || lowered.includes("socket") || lowered.includes("http") || lowered.includes("dns")) {
    tags.add("Comunicação de rede");
  }
  if (lowered.includes("regsetvalue") || lowered.includes("runonce") || lowered.includes("autorun") || lowered.includes("persistence")) {
    tags.add("Persistência");
  }

  return Array.from(tags);
}

function isTriggerLine(line: string, apis: string[]) {
  const lowered = line.toLowerCase();
  if (apis.includes("VirtualProtect") && ((lowered.includes("rw") && lowered.includes("rx")) || lowered.includes("execute_read"))) {
    return true;
  }
  if (apis.includes("VirtualAlloc") && lowered.includes("execute")) {
    return true;
  }
  if (apis.includes("WriteProcessMemory") || apis.includes("CreateRemoteThread")) {
    return true;
  }
  return false;
}

function inferTransitionRelation(event: NormalizedEvent) {
  const apis = new Set(event.suspiciousApis);
  const lowered = event.message.toLowerCase();
  if (["IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess"].some((api) => apis.has(api))) {
    return "checagem anti-debug";
  }
  if (apis.has("EnumSystemFirmwareTables") || lowered.includes("wmi") || lowered.includes("vm")) {
    return "checagem anti-VM";
  }
  if (apis.has("GetTickCount") || apis.has("RtlQueryPerformanceCounter")) {
    return "checagem anti-overhead";
  }
  if (apis.has("VirtualAlloc")) {
    return "preparação de memória";
  }
  if (apis.has("VirtualProtect")) {
    return "transição RW->RX (unpacking)";
  }
  if (apis.has("WriteProcessMemory") || apis.has("CreateRemoteThread")) {
    return "injeção/execução remota";
  }
  if (lowered.includes("tracefcncall.m1")) return "origem por call direta";
  if (lowered.includes("tracefcncall.m2")) return "origem por salto indireto";
  return "progressão da execução";
}

function classifyMalware(techniques: Set<string>, events: NormalizedEvent[]): MalwareCategory {
  const scores: Record<MalwareCategory, number> = {
    Trojan: 1,
    Spyware: 0,
    Ransomware: 0,
    Backdoor: 0,
    Unknown: 0,
  };

  Array.from(techniques).forEach((technique) => {
    if (["Anti-debug", "Detecção de VM", "Atraso deliberado", "Transição RW→RX"].includes(technique)) {
      scores.Trojan += 2;
    }
    if (["Comunicação de rede", "Injeção de código"].includes(technique)) {
      scores.Backdoor += 2;
    }
    if (["Persistência", "Manipulação de arquivos"].includes(technique)) {
      scores.Backdoor += 1;
      scores.Ransomware += 1;
    }
  });

  const content = events.map((event) => event.message.toLowerCase()).join(" \n ");
  if (/(encrypt|ransom|shadow copy|deletefile|rename)/i.test(content)) scores.Ransomware += 4;
  if (/(credential|keylog|screenshot|browser|clipboard|spy)/i.test(content)) scores.Spyware += 4;
  if (/(socket|c2|http|https|winhttp|internetopen|remote|connectback)/i.test(content)) scores.Backdoor += 3;
  if (/(packed|vmprotect|stub|dropper|payload)/i.test(content)) scores.Trojan += 2;

  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] as MalwareCategory | undefined;
  return winner ?? "Unknown";
}

function deriveRiskLevel(techniques: Set<string>, triggerCount: number, suspiciousCount: number): RiskLevel {
  if (triggerCount >= 2 || techniques.size >= 5 || suspiciousCount >= 20) return "critical";
  if (triggerCount >= 1 || techniques.size >= 3 || suspiciousCount >= 10) return "high";
  if (techniques.size >= 2 || suspiciousCount >= 5) return "medium";
  return "low";
}

function deriveCurrentPhase(events: NormalizedEvent[]) {
  const discovered = new Set(events.map((event) => event.stage));
  let current = "Inicialização";
  for (const stage of stageOrder) {
    if (discovered.has(stage)) current = stage;
  }
  return current;
}

function buildFlowGraph(
  events: NormalizedEvent[],
  currentPhase: string,
  classification: MalwareCategory,
  riskLevel: RiskLevel,
): FlowGraph {
  const phaseNodes: FlowNode[] = [];
  const phaseEdges: FlowEdge[] = [];
  const eventNodes: FlowNode[] = [];
  const eventEdges: FlowEdge[] = [];

  const orderedStages = stageOrder.filter((stage) => events.some((event) => event.stage === stage));
  orderedStages.forEach((stage, index) => {
    phaseNodes.push({
      id: `phase:${stage}`,
      label: stage,
      kind: "phase",
      severity: stage === currentPhase ? "high" : "medium",
      metadata: { current: stage === currentPhase },
    });
    if (index > 0) {
      phaseEdges.push({
        source: `phase:${orderedStages[index - 1]}`,
        target: `phase:${stage}`,
        relation: "evolui para",
      });
    }
  });

  const suspiciousJourney = events.filter((event) => event.suspicious).slice(0, 28);
  suspiciousJourney.forEach((event, index) => {
    const apiLabel = event.suspiciousApis[0] ?? event.eventType;
    const nodeId = `event:${index}:${apiLabel}`;
    const identifiedBy = event.suspiciousApis.length
      ? `API sensível detectada (${event.suspiciousApis.join(", ")})`
      : `Evidência ${event.eventType}`;
    const identification = event.trigger
      ? `${identifiedBy}; linha marcada como gatilho heurístico.`
      : `${identifiedBy}; linha marcada como evidência suspeita.`;

    eventNodes.push({
      id: nodeId,
      label: apiLabel,
      kind: "api",
      severity: event.trigger ? "critical" : "high",
      metadata: {
        sourceFile: event.fileName,
        sourceLogType: event.logType,
        sourceLineNumber: event.lineNumber,
        stage: event.stage,
        identifiedBy,
        identification,
        trigger: event.trigger,
        suspiciousApis: event.suspiciousApis,
        techniques: event.techniqueTags,
        evidence: event.message,
      },
    });
    eventEdges.push({
      source: `phase:${event.stage}`,
      target: nodeId,
      relation: event.trigger ? "gatilho" : "evidência",
      evidence: event.message,
    });

    if (index > 0) {
      const previous = suspiciousJourney[index - 1];
      const previousLabel = previous?.suspiciousApis[0] ?? previous?.eventType ?? "anterior";
      eventEdges.push({
        source: `event:${index - 1}:${previousLabel}`,
        target: nodeId,
        relation: inferTransitionRelation(event),
        evidence: `${previous?.fileName ?? "arquivo anterior"} -> ${event.fileName}`,
        metadata: {
          sourceFile: event.fileName,
          sourceLogType: event.logType,
        },
      });
    }
  });

  if (eventNodes.length > 0) {
    const lastNode = eventNodes[eventNodes.length - 1];
    const verdictNodeId = "verdict:discovery";
    eventNodes.push({
      id: verdictNodeId,
      label: `Descoberta: ${classification}`,
      kind: "verdict",
      severity: riskLevel === "critical" ? "critical" : riskLevel === "high" ? "high" : "medium",
      metadata: {
        classification,
        riskLevel,
        currentPhase,
        identifiedBy: "Correlação completa do caminho observado",
        identification: "Veredito final produzido após encadear os nós e validar as evidências preservadas.",
        sourceFile: (lastNode?.metadata as Record<string, unknown> | undefined)?.sourceFile ?? null,
      },
    });
    eventEdges.push({
      source: lastNode.id,
      target: verdictNodeId,
      relation: "leva ao veredito",
    });
  }

  const apiEventNodes = eventNodes.filter((n) => n.kind === "api");
  const trimEvidenceSnippet = (value: string, max = 450) => {
    const t = value.trim();
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  };

  for (const phaseNode of phaseNodes) {
    const connectedEvents = apiEventNodes.filter((n) =>
      eventEdges.some((e) => e.source === phaseNode.id && e.target === n.id),
    );
    const base = (phaseNode.metadata ?? {}) as Record<string, unknown>;
    const stageName = phaseNode.label;

    if (connectedEvents.length === 0) {
      phaseNode.metadata = {
        ...base,
        stage: stageName,
        identification:
          `Fase «${stageName}» sem evidências suspeitas ligadas na jornada reduzida: nenhuma API ou gatilho heurístico foi associado a esta coluna (atividade não classificada como suspeita, lacuna nos logs ou fase só de transição).`,
        evidence:
          "Não há mensagens de eventos suspeitos agregadas a esta fase. Use as outras colunas do diagrama ou o painel operacional por ficheiro para mais detalhe.",
        identifiedBy: "Agregação automática da jornada (Contradef)",
      };
      continue;
    }

    const apis = Array.from(
      new Set(
        connectedEvents.flatMap((n) => {
          const m = n.metadata as Record<string, unknown>;
          const arr = m.suspiciousApis;
          if (Array.isArray(arr) && arr.length) {
            return arr.filter((x): x is string => typeof x === "string");
          }
          return [n.label];
        }),
      ),
    );

    const techniques = Array.from(
      new Set(
        connectedEvents.flatMap((n) => {
          const m = n.metadata as Record<string, unknown>;
          const arr = m.techniques;
          return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
        }),
      ),
    );

    const evidenceSnippets = connectedEvents
      .map((n) => {
        const m = n.metadata as Record<string, unknown>;
        return typeof m.evidence === "string" ? trimEvidenceSnippet(m.evidence) : "";
      })
      .filter(Boolean);

    const triggerCount = connectedEvents.filter((n) => {
      const m = n.metadata as Record<string, unknown>;
      return m.trigger === true;
    }).length;

    phaseNode.metadata = {
      ...base,
      stage: stageName,
      identification:
        `Fase «${stageName}» agrega ${connectedEvents.length} evidência(s) suspeita(s) na jornada (${triggerCount} gatilho(s) heurístico(s)): sequência de APIs e comportamentos correlacionados sob esta etapa antes do veredito.`,
      evidence: evidenceSnippets.join("\n\n---\n\n"),
      identifiedBy: `Correlação por fase: ${apis.slice(0, 14).join(", ")}${apis.length > 14 ? "…" : ""}`,
      suspiciousApis: apis,
      techniques,
    };
  }

  return {
    nodes: [...phaseNodes, ...eventNodes],
    edges: [...phaseEdges, ...eventEdges],
    summary: {
      phases: orderedStages,
      totalSuspiciousEvents: events.filter((event) => event.suspicious).length,
      pathLength: eventNodes.length,
    },
  };
}

function buildRecommendations(techniques: string[], classification: MalwareCategory) {
  const recommendations = new Set<string>();
  recommendations.add("Priorizar a revisão dos eventos marcados como gatilho para validar o instante de desempacotamento ou evasão.");
  recommendations.add("Correlacionar os artefatos reduzidos com o log bruto para preservar evidências antes de aprofundar a engenharia reversa.");
  if (techniques.includes("Anti-debug") || techniques.includes("Verificação de overhead")) {
    recommendations.add("Executar a amostra em ambiente com contramedidas anti-DBI e validar discrepâncias temporais observadas nos logs.");
  }
  if (techniques.includes("Detecção de VM")) {
    recommendations.add("Comparar o comportamento com uma execução em host menos instrumentado para confirmar evasão dependente de virtualização.");
  }
  if (classification === "Backdoor") {
    recommendations.add("Inspecionar conexões de rede, DNS e possíveis domínios de C2 extraídos das evidências de execução.");
  }
  if (classification === "Ransomware") {
    recommendations.add("Verificar rapidamente operações sobre arquivos, indicadores de criptografia e possíveis alvos de impacto em disco.");
  }
  return Array.from(recommendations);
}

function buildFallbackSummary(params: {
  analysisName: string;
  classification: MalwareCategory;
  riskLevel: RiskLevel;
  currentPhase: string;
  techniques: string[];
  suspiciousApis: string[];
  metrics: ReductionMetrics;
}) {
  const techniqueText = params.techniques.length ? params.techniques.join(", ") : "nenhuma técnica relevante detectada";
  const apiText = params.suspiciousApis.length ? params.suspiciousApis.join(", ") : "nenhuma API sensível identificada";
  return `# Veredito da análise\n\nA amostra **${params.analysisName}** foi classificada preliminarmente como **${params.classification}**, com nível de risco **${params.riskLevel}** e fase atual estimada em **${params.currentPhase}**.\n\nAs principais heurísticas observadas nos logs foram: **${techniqueText}**. As APIs com maior relevância analítica foram: **${apiText}**.\n\nO módulo de redução manteve **${params.metrics.reducedLineCount}** de **${params.metrics.originalLineCount}** linhas, resultando em uma redução aproximada de **${params.metrics.reductionPercent.toFixed(1)}%**. Esse recorte privilegia eventos críticos e contextos vizinhos aos gatilhos heurísticos, especialmente transições de memória e chamadas indicativas de evasão.\n\n## MITRE ATT&CK (TA0005)\n\nComportamentos compatíveis com **Defense Evasion** são correlacionados automaticamente à tática [TA0005](https://attack.mitre.org/tactics/TA0005/) na interface, com ID e nome da técnica Enterprise conforme a matriz oficial — separando a **categoria da amostra** (Trojan, Backdoor, etc.) das **técnicas de evasão** observadas.\n\n## Recomendação inicial\n\nRevisar o fluxo reduzido em conjunto com o grafo e a linha do tempo para confirmar o ponto exato em que o malware altera seu comportamento, concentrando a investigação nas chamadas sensíveis e nos artefatos produzidos logo após os gatilhos.`;
}

async function generateInsight(params: {
  analysisName: string;
  classification: MalwareCategory;
  riskLevel: RiskLevel;
  currentPhase: string;
  techniques: string[];
  suspiciousApis: string[];
  metrics: ReductionMetrics;
  flowGraph: FlowGraph;
  notableEvents: NormalizedEvent[];
  recommendations: string[];
}) {
  const fallbackMarkdown = buildFallbackSummary(params);
  const payload = {
    analysisName: params.analysisName,
    classification: params.classification,
    riskLevel: params.riskLevel,
    currentPhase: params.currentPhase,
    techniques: params.techniques,
    suspiciousApis: params.suspiciousApis,
    metrics: params.metrics,
    recommendations: params.recommendations,
    notableEvents: params.notableEvents.slice(0, 20).map((event) => ({
      stage: event.stage,
      message: event.message,
      fileName: event.fileName,
      logType: event.logType,
      suspiciousApis: event.suspiciousApis,
    })),
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Você é um analista de malware especializado em interpretar logs da Contradef. Produza uma saída JSON objetiva e tecnicamente consistente.",
        },
        {
          role: "user",
          content: `Com base no seguinte resumo estruturado, gere um veredito técnico em português para um analista de segurança: ${JSON.stringify(payload)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "contradef_analysis_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              classification: { type: "string", enum: ["Trojan", "Spyware", "Ransomware", "Backdoor", "Unknown"] },
              riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
              currentPhase: { type: "string" },
              techniques: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
              summaryMarkdown: { type: "string" }
            },
            required: ["title", "classification", "riskLevel", "currentPhase", "techniques", "recommendations", "summaryMarkdown"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!parsed) {
      throw new Error("A resposta do modelo veio vazia.");
    }

    return {
      title: parsed.title as string,
      classification: parsed.classification as MalwareCategory,
      riskLevel: parsed.riskLevel as RiskLevel,
      currentPhase: parsed.currentPhase as string,
      techniques: Array.isArray(parsed.techniques) ? parsed.techniques as string[] : params.techniques,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations as string[] : params.recommendations,
      summaryMarkdown: typeof parsed.summaryMarkdown === "string" ? parsed.summaryMarkdown : fallbackMarkdown,
      modelName: response.model ?? "default-llm",
    };
  } catch (error) {
    console.warn("[Analysis] Falha ao gerar resumo com LLM, usando fallback determinístico.", error);
    return {
      title: `Resumo interpretativo de ${params.analysisName}`,
      classification: params.classification,
      riskLevel: params.riskLevel,
      currentPhase: params.currentPhase,
      techniques: params.techniques,
      recommendations: params.recommendations,
      summaryMarkdown: fallbackMarkdown,
      modelName: "deterministic-fallback",
    };
  }
}

function validateSubmission(input: StartAnalysisJobInput) {
  if (!input.analysisName.trim()) {
    throw new Error("Informe um nome para a análise.");
  }
  if (!input.logFiles.length) {
    throw new Error("Envie ao menos um arquivo de log da Contradef para iniciar a análise.");
  }
  if (input.logFiles.length > MAX_FILES) {
    throw new Error(`Envie no máximo ${MAX_FILES} arquivos por análise.`);
  }

  const trimmedHash = typeof input.sampleSha256 === "string" ? input.sampleSha256.trim() : "";
  if (trimmedHash) {
    const normalized = normalizeOptionalSampleSha256(trimmedHash);
    if (!normalized) {
      throw new Error("SHA-256 da amostra inválido: use exatamente 64 caracteres hexadecimais (hash do ficheiro executável, não dos logs).");
    }
    input.sampleSha256 = normalized;
  } else {
    input.sampleSha256 = null;
  }

  for (const logFile of input.logFiles) {
    if (!logFile.base64 && !logFile.tempFilePath && !hasChunkUploadReference(logFile)) {
      throw new Error(`O arquivo ${logFile.fileName} não possui conteúdo submetido.`);
    }
  }
}

async function uploadArtifact(jobId: string, relativePath: string, content: Buffer | string, mimeType: string) {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const uploaded = await storagePut(`contradef-analysis/${jobId}/${relativePath}`, buffer, mimeType);
  return {
    relativePath,
    storageUrl: uploaded.url,
    storageKey: uploaded.key,
    sizeBytes: buffer.byteLength,
  };
}

async function uploadArtifactOptional(
  jobId: string,
  relativePath: string,
  content: Buffer | string,
  mimeType: string,
): Promise<{
  relativePath: string;
  storageUrl: string | null;
  storageKey: string | null;
  sizeBytes: number;
}> {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  try {
    return await uploadArtifact(jobId, relativePath, buffer, mimeType);
  } catch (error) {
    console.warn(`[Analysis] Não foi possível persistir o artefato ${relativePath} no storage compartilhado.`, error);
    try {
      await persistJobArtifactBuffer(jobId, relativePath, buffer);
    } catch (persistError) {
      console.warn(`[Analysis] Falha ao gravar cópia local do artefato ${relativePath}.`, persistError);
    }
    return {
      relativePath,
      storageUrl: null,
      storageKey: null,
      sizeBytes: buffer.byteLength,
    };
  }
}

function computeMetrics(params: {
  originalLineCount: number;
  reducedLineCount: number;
  originalBytes: number;
  reducedBytes: number;
  suspiciousEventCount: number;
  triggerCount: number;
  uploadedFileCount: number;
}): ReductionMetrics {
  const reductionPercent = params.originalLineCount > 0
    ? ((params.originalLineCount - params.reducedLineCount) / params.originalLineCount) * 100
    : 0;

  return {
    originalLineCount: params.originalLineCount,
    reducedLineCount: params.reducedLineCount,
    originalBytes: params.originalBytes,
    reducedBytes: params.reducedBytes,
    reductionPercent: Math.max(0, Math.min(100, reductionPercent)),
    suspiciousEventCount: params.suspiciousEventCount,
    triggerCount: params.triggerCount,
    uploadedFileCount: params.uploadedFileCount,
  };
}

function buildProcessedLine(rawLine: string, fileName: string, logType: SupportedLogType, lineNumber: number): ProcessedLogLine {
  const normalizedLine = normalizeWhitespace(rawLine);
  const apis = detectApis(normalizedLine);
  const addresses = extractAddresses(normalizedLine);
  const stage = determineStage(normalizedLine, apis);
  const techniqueTags = detectTechniqueTags(normalizedLine, apis);
  const trigger = isTriggerLine(normalizedLine, apis);
  const suspicious = trigger || apis.length > 0 || techniqueTags.length > 0;

  return {
    rawLine,
    normalizedLine,
    lineNumber,
    logType,
    fileName,
    apis,
    addresses,
    stage,
    techniqueTags,
    suspicious,
    trigger,
  };
}

function toNormalizedEvent(item: ProcessedLogLine): NormalizedEvent {
  return {
    eventType: item.apis[0] ?? item.techniqueTags[0] ?? "log-evidence",
    stage: item.stage,
    message: item.normalizedLine || item.rawLine,
    logType: item.logType,
    fileName: item.fileName,
    lineNumber: item.lineNumber,
    suspiciousApis: item.apis,
    suspicious: item.suspicious,
    trigger: item.trigger,
    addresses: item.addresses,
    techniqueTags: item.techniqueTags,
  };
}

function createLogCollector(fileName: string, logType: SupportedLogType, perFileEventLimit: number) {
  const keepLineMap = new Map<number, string>();
  const previousLines: ProcessedLogLine[] = [];
  const lastLines: ProcessedLogLine[] = [];
  const firstLines: ProcessedLogLine[] = [];
  const suspiciousApiSet = new Set<string>();
  const techniqueSet = new Set<string>();
  const events: NormalizedEvent[] = [];

  let futureContextBudget = 0;
  let originalLineCount = 0;
  let approximateOriginalBytes = 0;
  let suspiciousEventCount = 0;
  let triggerCount = 0;

  const rememberLine = (item: ProcessedLogLine) => {
    if (item.rawLine.trim().length > 0) {
      keepLineMap.set(item.lineNumber, item.rawLine);
    }
  };

  const consume = (rawLine: string) => {
    originalLineCount += 1;
    approximateOriginalBytes += Buffer.byteLength(rawLine, "utf-8") + 1;

    const item = buildProcessedLine(rawLine, fileName, logType, originalLineCount);

    item.apis.forEach((api) => suspiciousApiSet.add(api));
    item.techniqueTags.forEach((tag) => techniqueSet.add(tag));

    if (item.lineNumber <= 25) {
      firstLines.push(item);
    }
    if (item.lineNumber <= 3) {
      rememberLine(item);
    }
    if (futureContextBudget > 0) {
      rememberLine(item);
      futureContextBudget -= 1;
    }

    if (item.suspicious) {
      suspiciousEventCount += 1;
      previousLines.forEach(rememberLine);
      rememberLine(item);
      futureContextBudget = 4;
      if (events.length < perFileEventLimit && (item.normalizedLine || item.rawLine)) {
        events.push(toNormalizedEvent(item));
      }
    }

    if (item.trigger) {
      triggerCount += 1;
    }

    previousLines.push(item);
    if (previousLines.length > 4) {
      previousLines.shift();
    }

    lastLines.push(item);
    if (lastLines.length > 2) {
      lastLines.shift();
    }
  };

  const finalize = (exactOriginalBytes?: number): ParsedLogResult => {
    lastLines.forEach(rememberLine);

    if (keepLineMap.size === 0) {
      firstLines.slice(0, Math.min(25, firstLines.length)).forEach(rememberLine);
    }

    const keptLines = Array.from(keepLineMap.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([lineNumber, text]) => ({ lineNumber, text }))
      .filter((entry) => entry.text.trim().length > 0);

    const reducedBytes = Buffer.byteLength(keptLines.map((entry) => entry.text).join("\n"), "utf-8");

    return {
      logType,
      keptLines,
      events,
      suspiciousApis: Array.from(suspiciousApiSet),
      techniqueTags: Array.from(techniqueSet),
      originalLineCount,
      reducedLineCount: keptLines.length,
      originalBytes: exactOriginalBytes ?? approximateOriginalBytes,
      reducedBytes,
      suspiciousEventCount,
      triggerCount,
    };
  };

  return {
    consume,
    finalize,
  };
}

async function analyzeSingleLogFile(
  logFile: StartAnalysisLogInput,
  perFileEventLimit: number,
  progress?: LogParseProgress,
): Promise<ParsedLogResult> {
  const logType = inferLogType(logFile.fileName, logFile.logType);
  const collector = createLogCollector(logFile.fileName, logType, perFileEventLimit);
  const st: ParseProgressState = { lineCount: 0, byteWeight: 0, logLines: [], lastFlushMs: 0, lastFlushedBytes: 0 };

  const bump = async (rawLine: string) => {
    const line = truncateOversizeLogLine(rawLine);
    collector.consume(line);
    st.lineCount += 1;
    st.byteWeight += Buffer.byteLength(line, "utf-8");
    if (st.lineCount % PARSE_YIELD_EVERY_LINES === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (progress) {
      await maybeFlushParseProgress(st, progress, { force: false });
    }
  };

  if (logFile.tempFilePath) {
    const reader = createInterface({
      input: createReadStream(logFile.tempFilePath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of reader) {
      await bump(rawLine);
    }

    if (progress && st.lineCount > 0) {
      await maybeFlushParseProgress(st, progress, { force: true });
    }
    return collector.finalize(logFile.sizeBytes);
  }

  if (hasChunkUploadReference(logFile)) {
    const decoder = new StringDecoder("utf8");
    let pendingLine = "";

    for (let chunkIndex = 0; chunkIndex < (logFile.uploadChunkCount ?? 0); chunkIndex += 1) {
      const chunkKey = buildUploadedChunkStorageKey(
        logFile.uploadedByUserId as number,
        logFile.uploadSessionId as string,
        logFile.uploadFileId as string,
        chunkIndex,
      );
      const chunkDownload = await storageGetBuffer(chunkKey);
      if (!chunkDownload.buffer.byteLength) {
        throw new Error(`O bloco ${chunkIndex} de ${logFile.fileName} foi encontrado vazio no armazenamento compartilhado.`);
      }

      pendingLine += decoder.write(chunkDownload.buffer);
      const lines = pendingLine.split(/\r?\n/);
      pendingLine = lines.pop() ?? "";
      for (const line of lines) {
        await bump(line);
      }
    }

    pendingLine += decoder.end();
    if (pendingLine.length > 0) {
      await bump(pendingLine);
    }

    if (progress && st.lineCount > 0) {
      await maybeFlushParseProgress(st, progress, { force: true });
    }
    return collector.finalize(logFile.sizeBytes);
  }

  if (!logFile.base64) {
    throw new Error(`O arquivo ${logFile.fileName} não possui conteúdo submetido.`);
  }

  const buffer = decodeBase64(logFile.base64);
  if (!buffer.length) {
    throw new Error(`O arquivo ${logFile.fileName} está vazio.`);
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(`O arquivo ${logFile.fileName} excede o limite inline de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB. Use o envio robusto da área Reduzir Logs para arquivos grandes.`);
  }

  const text = buffer.toString("utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    await bump(rawLine);
  }

  if (progress && st.lineCount > 0) {
    await maybeFlushParseProgress(st, progress, { force: true });
  }
  return collector.finalize(buffer.byteLength);
}

async function buildSourceArtifact(jobId: string, logFile: StartAnalysisLogInput, logType: SupportedLogType): Promise<AnalysisArtifactDto> {
  const rel = `source/${logFile.fileName}`;
  const base: AnalysisArtifactDto = {
    artifactType: "source-log",
    label: `${logType} bruto`,
    relativePath: rel,
    sourcePath: logFile.fileName,
    storageUrl: null,
    storageKey: null,
    mimeType: "text/plain",
    sizeBytes: logFile.sizeBytes ?? 0,
  };

  try {
    if (logFile.tempFilePath) {
      const st = await stat(logFile.tempFilePath);
      base.sizeBytes = st.size;
      if (st.size <= MAX_SOURCE_ARTIFACT_UPLOAD_BYTES) {
        const sourceBuffer = await readFile(logFile.tempFilePath);
        try {
          const uploaded = await uploadArtifact(jobId, rel, sourceBuffer, "text/plain");
          return { ...base, relativePath: uploaded.relativePath, storageUrl: uploaded.storageUrl, storageKey: uploaded.storageKey, sizeBytes: uploaded.sizeBytes };
        } catch {
          await persistJobArtifactBuffer(jobId, rel, sourceBuffer);
          return { ...base, storageUrl: null, storageKey: null, sizeBytes: sourceBuffer.byteLength };
        }
      }
      await copyTempFileToLocalArtifact(jobId, rel, logFile.tempFilePath);
      return { ...base, storageUrl: null, storageKey: null, sizeBytes: st.size };
    }

    if (logFile.base64) {
      const decoded = decodeBase64(logFile.base64);
      base.sizeBytes = decoded.byteLength;
      if (decoded.byteLength <= MAX_SOURCE_ARTIFACT_UPLOAD_BYTES) {
        try {
          const uploaded = await uploadArtifact(jobId, rel, decoded, "text/plain");
          return { ...base, relativePath: uploaded.relativePath, storageUrl: uploaded.storageUrl, storageKey: uploaded.storageKey, sizeBytes: uploaded.sizeBytes };
        } catch {
          await persistJobArtifactBuffer(jobId, rel, decoded);
          return { ...base, storageUrl: null, storageKey: null };
        }
      }
      await persistJobArtifactBuffer(jobId, rel, decoded);
      return { ...base, storageUrl: null, storageKey: null };
    }

    return base;
  } catch (error) {
    console.warn(`[Analysis] Não foi possível preparar o artefato bruto de ${logFile.fileName}.`, error);
    return base;
  }
}

async function cleanupSubmittedTempFiles(logFiles: StartAnalysisLogInput[]) {
  const tempPaths = Array.from(new Set(logFiles
    .map((logFile) => logFile.tempFilePath)
    .filter((tempFilePath): tempFilePath is string => Boolean(tempFilePath))));

  await Promise.all(tempPaths.map(async (tempFilePath) => {
    await unlink(tempFilePath).catch(() => undefined);
  }));
}

function createEmptyReductionFileMetric(fileName: string, logType?: SupportedLogType): ReductionFileMetric {
  return {
    fileName,
    logType: inferLogType(fileName, logType),
    status: "queued",
    progress: 0,
    currentStage: "Aguardando processamento",
    currentStep: "Na fila",
    lastMessage: "Arquivo recebido e aguardando processamento.",
    originalLineCount: 0,
    reducedLineCount: 0,
    originalBytes: 0,
    reducedBytes: 0,
    suspiciousEventCount: 0,
    triggerCount: 0,
    uploadDurationMs: 0,
    uploadReused: false,
  };
}

function readNumericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type BuildLiveFileMetricEvent = {
  eventType: string | null;
  stage: string | null;
  message: string | null;
  progress: number | null;
  payloadJson: unknown;
  id?: number | null;
  createdAt?: Date | null;
};

/** DB e store em memória devolvem eventos mais recentes primeiro; o fold precisa da ordem cronológica. */
function sortEventsForLiveMetricsChronologically(events: BuildLiveFileMetricEvent[]) {
  return [...events]
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const ta = a.event.createdAt ? new Date(a.event.createdAt).getTime() : 0;
      const tb = b.event.createdAt ? new Date(b.event.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      const ia = typeof a.event.id === "number" ? a.event.id : 0;
      const ib = typeof b.event.id === "number" ? b.event.id : 0;
      if (ia !== ib) return ia - ib;
      return a.index - b.index;
    })
    .map(({ event }) => event);
}

export function buildLiveFileMetrics(
  events: BuildLiveFileMetricEvent[],
  summaryJson: Record<string, unknown>,
  jobStatus: string,
) {
  const fileMap = new Map<string, ReductionFileMetric>();

  const submissionPayload = events.find((event) => event.eventType === "submission")?.payloadJson;
  const submittedFileNames = submissionPayload && !Array.isArray(submissionPayload) && Array.isArray((submissionPayload as Record<string, unknown>).fileNames)
    ? ((submissionPayload as Record<string, unknown>).fileNames as unknown[]).filter((entry): entry is string => typeof entry === "string")
    : [];

  submittedFileNames.forEach((fileName) => {
    fileMap.set(fileName, createEmptyReductionFileMetric(fileName));
  });

  if (Array.isArray(summaryJson.fileMetrics)) {
    summaryJson.fileMetrics.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const fileName = typeof entry.fileName === "string" ? entry.fileName : null;
      if (!fileName) return;
      const previous = fileMap.get(fileName) ?? createEmptyReductionFileMetric(fileName, entry.logType as SupportedLogType | undefined);
      fileMap.set(fileName, {
        ...previous,
        logType: (entry.logType as SupportedLogType | undefined) ?? previous.logType,
        status: (entry.status as ReductionFileMetric["status"] | undefined) ?? (jobStatus === "completed" ? "completed" : previous.status),
        progress: typeof entry.progress === "number" ? entry.progress : (jobStatus === "completed" ? 100 : previous.progress),
        currentStage: typeof entry.currentStage === "string" ? entry.currentStage : previous.currentStage,
        currentStep: typeof entry.currentStep === "string" ? entry.currentStep : previous.currentStep,
        lastMessage: typeof entry.lastMessage === "string" ? entry.lastMessage : previous.lastMessage,
        originalLineCount: readNumericValue(entry.originalLineCount),
        reducedLineCount: readNumericValue(entry.reducedLineCount),
        originalBytes: readNumericValue(entry.originalBytes),
        reducedBytes: readNumericValue(entry.reducedBytes),
        suspiciousEventCount: readNumericValue(entry.suspiciousEventCount),
        triggerCount: readNumericValue(entry.triggerCount),
        uploadDurationMs: readNumericValue(entry.uploadDurationMs),
        uploadReused: Boolean(entry.uploadReused),
      });
    });
  }

  sortEventsForLiveMetricsChronologically(events).forEach((event) => {
    const payload = event.payloadJson && !Array.isArray(event.payloadJson) ? event.payloadJson as Record<string, unknown> : null;
    if (!payload) return;

    const fileName = typeof payload.fileName === "string" ? payload.fileName : null;
    if (!fileName) return;

    const previous = fileMap.get(fileName) ?? createEmptyReductionFileMetric(fileName, payload.logType as SupportedLogType | undefined);
    const nextStatus = event.eventType === "file-complete"
      ? "completed"
      : event.eventType === "file-failed"
        ? "failed"
        : event.eventType === "error"
          ? "failed"
          : event.eventType === "file-queued"
            ? "queued"
            : event.eventType === "file-start" || event.eventType === "file-stage"
              ? "running"
              : previous.status;

    fileMap.set(fileName, {
      ...previous,
      logType: (payload.logType as SupportedLogType | undefined) ?? previous.logType,
      status: nextStatus,
      progress: typeof payload.fileProgress === "number"
        ? payload.fileProgress
        : typeof event.progress === "number"
          ? event.progress
          : previous.progress,
      currentStage: typeof payload.currentStage === "string"
        ? payload.currentStage
        : event.stage ?? previous.currentStage,
      currentStep: typeof payload.currentStep === "string"
        ? payload.currentStep
        : previous.currentStep,
      lastMessage: event.message ?? previous.lastMessage,
      originalLineCount: typeof payload.originalLineCount === "number" ? payload.originalLineCount : previous.originalLineCount,
      reducedLineCount: typeof payload.reducedLineCount === "number" ? payload.reducedLineCount : previous.reducedLineCount,
      originalBytes: typeof payload.originalBytes === "number" ? payload.originalBytes : previous.originalBytes,
      reducedBytes: typeof payload.reducedBytes === "number" ? payload.reducedBytes : previous.reducedBytes,
      suspiciousEventCount: typeof payload.suspiciousEventCount === "number" ? payload.suspiciousEventCount : previous.suspiciousEventCount,
      triggerCount: typeof payload.triggerCount === "number" ? payload.triggerCount : previous.triggerCount,
      uploadDurationMs: typeof payload.uploadDurationMs === "number" ? payload.uploadDurationMs : previous.uploadDurationMs,
      uploadReused: typeof payload.uploadReused === "boolean" ? payload.uploadReused : previous.uploadReused,
    });
  });

  if (jobStatus === "running" && Array.isArray(summaryJson.fileMetrics)) {
    (summaryJson.fileMetrics as unknown[]).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const entry = raw as Record<string, unknown>;
      const fileName = typeof entry.fileName === "string" ? entry.fileName : null;
      if (!fileName) return;
      const sProg = entry.progress;
      if (typeof sProg !== "number" || !Number.isFinite(sProg)) return;
      const current = fileMap.get(fileName);
      if (!current) return;
      const p0 = current.progress ?? 0;
      const merged = Math.max(p0, sProg);
      if (merged > p0) {
        const take = sProg >= p0;
        fileMap.set(fileName, {
          ...current,
          progress: merged,
          currentStage: take && typeof entry.currentStage === "string" && entry.currentStage
            ? (entry.currentStage as string)
            : current.currentStage,
          currentStep: take && typeof entry.currentStep === "string" && entry.currentStep
            ? (entry.currentStep as string)
            : current.currentStep,
          lastMessage: take && typeof entry.lastMessage === "string" && entry.lastMessage
            ? (entry.lastMessage as string)
            : current.lastMessage,
        });
      }
    });
  }

  if (jobStatus === "completed") {
    fileMap.forEach((value, fileName) => {
      fileMap.set(fileName, {
        ...value,
        status: value.status === "failed" ? "failed" : "completed",
        progress: value.status === "failed" ? value.progress : 100,
        currentStage: value.status === "failed" ? value.currentStage : "Arquivo concluído",
        currentStep: value.status === "failed" ? value.currentStep : (value.triggerCount > 0 || value.suspiciousEventCount > 0 ? "Sinais críticos preservados" : "Redução concluída"),
        lastMessage: value.lastMessage || `Redução concluída para ${fileName}.`,
      });
    });
  }

  return Array.from(fileMap.values()).sort((left, right) => left.fileName.localeCompare(right.fileName));
}

async function analyzeLogs(input: StartAnalysisJobInput, jobId: string): Promise<AnalysisComputationResult> {
  const normalizedEvents: NormalizedEvent[] = [];
  const suspiciousApiSet = new Set<string>();
  const techniqueSet = new Set<string>();
  const reducedLogEntries: Array<{ fileName: string; logType: SupportedLogType; keptLines: Array<{ lineNumber: number; text: string }> }> = [];
  const fileMetrics: ReductionFileMetric[] = [];

  const artifacts: AnalysisArtifactDto[] = [];
  let originalLineCount = 0;
  let reducedLineCount = 0;
  let originalBytes = 0;
  let reducedBytes = 0;
  let triggerCount = 0;

  const perFileEventLimit = Math.max(1, Math.ceil(MAX_EVENTS / Math.max(1, input.logFiles.length)));

  for (const queuedFile of input.logFiles) {
    const queuedLogType = inferLogType(queuedFile.fileName, queuedFile.logType);
    await addAnalysisEvent({
      jobId,
      eventType: "file-queued",
      stage: "fila do lote",
      message: `${queuedFile.fileName} entrou na fila de redução do lote atual.`,
      progress: 8,
      payloadJson: {
        fileName: queuedFile.fileName,
        logType: queuedLogType,
        status: "queued",
        fileProgress: 0,
        currentStage: "Fila do lote",
        currentStep: "Aguardando vez para reduzir",
        lastMessage: `${queuedFile.fileName} aguardando processamento.`,
        originalBytes: queuedFile.sizeBytes ?? 0,
        uploadDurationMs: queuedFile.uploadDurationMs ?? 0,
        uploadReused: queuedFile.uploadReused ?? false,
      },
    });
  }

  for (let index = 0; index < input.logFiles.length; index += 1) {
    const logFile = input.logFiles[index]!;
    const fileOrdinal = index + 1;
    const startProgress = Math.min(90, 20 + Math.round((index / Math.max(1, input.logFiles.length)) * 60));
    const inferredLogType = inferLogType(logFile.fileName, logFile.logType);

    try {
      await updateAnalysisJob(jobId, {
        status: "running",
        progress: startProgress,
        stage: `reduzindo arquivo ${fileOrdinal}/${input.logFiles.length}`,
        message: `Processando ${logFile.fileName}.`,
        llmSummaryStatus: "running",
        stdoutTail: null,
      });

      await addAnalysisEvent({
        jobId,
        eventType: "file-start",
        stage: "preparando redução",
        message: `Iniciando a preparação de ${logFile.fileName}.`,
        progress: startProgress,
        payloadJson: {
          fileName: logFile.fileName,
          logType: inferredLogType,
          status: "running",
          fileProgress: 10,
          currentStage: "Preparação do arquivo",
          currentStep: "Validando cabeçalho e contexto do log",
          lastMessage: `Preparando ${logFile.fileName} para redução heurística.`,
          originalBytes: logFile.sizeBytes ?? 0,
        },
      });

      await addAnalysisEvent({
        jobId,
        eventType: "file-stage",
        stage: "redução heurística",
        message: `Aplicando filtragem heurística em ${logFile.fileName}.`,
        progress: Math.min(90, startProgress + 8),
        payloadJson: {
          fileName: logFile.fileName,
          logType: inferredLogType,
          status: "running",
          fileProgress: 45,
          currentStage: "Redução heurística",
          currentStep: "Filtrando linhas e preservando gatilhos críticos",
          lastMessage: `Filtragem heurística em andamento para ${logFile.fileName}.`,
          originalBytes: logFile.sizeBytes ?? 0,
        },
      });

      const parsed = await analyzeSingleLogFile(logFile, perFileEventLimit, {
        jobId,
        fileLabel: logFile.fileName,
        sizeBytes: logFile.sizeBytes,
        logType: inferredLogType,
      });

      parsed.suspiciousApis.forEach((api) => suspiciousApiSet.add(api));
      parsed.techniqueTags.forEach((tag) => techniqueSet.add(tag));

      triggerCount += parsed.triggerCount;
      originalLineCount += parsed.originalLineCount;
      reducedLineCount += parsed.reducedLineCount;
      originalBytes += parsed.originalBytes;
      reducedBytes += parsed.reducedBytes;

      reducedLogEntries.push({
        fileName: logFile.fileName,
        logType: parsed.logType,
        keptLines: parsed.keptLines,
      });

      await addAnalysisEvent({
        jobId,
        eventType: "file-stage",
        stage: "consolidação do resultado",
        message: `Consolidando métricas e artefatos reduzidos de ${logFile.fileName}.`,
        progress: Math.min(94, startProgress + 20),
        payloadJson: {
          fileName: logFile.fileName,
          logType: parsed.logType,
          status: "running",
          fileProgress: 82,
          currentStage: "Consolidação",
          currentStep: "Agregando métricas e preparando artefatos",
          lastMessage: `Consolidando o resultado reduzido de ${logFile.fileName}.`,
          originalLineCount: parsed.originalLineCount,
          reducedLineCount: parsed.reducedLineCount,
          originalBytes: parsed.originalBytes,
          reducedBytes: parsed.reducedBytes,
          suspiciousEventCount: parsed.suspiciousEventCount,
          triggerCount: parsed.triggerCount,
        },
      });

      const completionStep = parsed.triggerCount > 0 || parsed.suspiciousEventCount > 0
        ? "Sinais críticos preservados"
        : "Redução concluída";
      const completionMessage = `${logFile.fileName} concluído: ${parsed.reducedLineCount}/${parsed.originalLineCount} linhas mantidas após a redução.`;

      fileMetrics.push({
        fileName: logFile.fileName,
        logType: parsed.logType,
        status: "completed",
        progress: 100,
        currentStage: "Arquivo concluído",
        currentStep: completionStep,
        lastMessage: completionMessage,
        originalLineCount: parsed.originalLineCount,
        reducedLineCount: parsed.reducedLineCount,
        originalBytes: parsed.originalBytes,
        reducedBytes: parsed.reducedBytes,
        suspiciousEventCount: parsed.suspiciousEventCount,
        triggerCount: parsed.triggerCount,
        uploadDurationMs: logFile.uploadDurationMs ?? 0,
        uploadReused: logFile.uploadReused ?? false,
      });

      const endProgress = Math.min(95, 25 + Math.round((fileOrdinal / Math.max(1, input.logFiles.length)) * 60));
      await addAnalysisEvent({
        jobId,
        eventType: "file-complete",
        stage: completionStep,
        message: completionMessage,
        progress: endProgress,
        payloadJson: {
          fileName: logFile.fileName,
          logType: parsed.logType,
          status: "completed",
          fileProgress: 100,
          currentStage: "Arquivo concluído",
          currentStep: completionStep,
          lastMessage: completionMessage,
          originalLineCount: parsed.originalLineCount,
          reducedLineCount: parsed.reducedLineCount,
          originalBytes: parsed.originalBytes,
          reducedBytes: parsed.reducedBytes,
          suspiciousEventCount: parsed.suspiciousEventCount,
          triggerCount: parsed.triggerCount,
        },
      });

      normalizedEvents.push(...parsed.events);
      artifacts.push(await buildSourceArtifact(jobId, logFile, parsed.logType));
    } catch (caught) {
      const base = caught instanceof Error ? caught.message : String(caught);
      const userMsg = isNoSpaceError(caught)
        ? `Falha em ${logFile.fileName}: espaço em disco insuficiente ou volume temporário cheio. ` +
            "Em alojamento (p.ex. Render), o disco do contentor é limitado: defina CONTRADEF_WORK_TMP, suba o plano, ou reduza/fragmente o 7z. " +
            `Detalhe: ${base}`
        : `Falha em ${logFile.fileName}: ${base}`;
      await addAnalysisEvent({
        jobId,
        eventType: "file-failed",
        stage: "falha no arquivo",
        message: userMsg,
        progress: startProgress,
        payloadJson: {
          fileName: logFile.fileName,
          logType: inferredLogType,
          status: "failed",
          fileProgress: 45,
          currentStage: "Falha",
          currentStep: isNoSpaceError(caught) ? "Espaço de disco" : "Erro de processamento",
          lastMessage: userMsg,
          originalBytes: logFile.sizeBytes ?? 0,
        },
      });
      fileMetrics.push({
        fileName: logFile.fileName,
        logType: inferredLogType,
        status: "failed",
        progress: 0,
        currentStage: "Falha",
        currentStep: isNoSpaceError(caught) ? "Espaço de disco" : "Erro de processamento",
        lastMessage: userMsg,
        originalLineCount: 0,
        reducedLineCount: 0,
        originalBytes: logFile.sizeBytes ?? 0,
        reducedBytes: 0,
        suspiciousEventCount: 0,
        triggerCount: 0,
        uploadDurationMs: logFile.uploadDurationMs ?? 0,
        uploadReused: logFile.uploadReused ?? false,
      });
      continue;
    }
  }

  if (fileMetrics.length > 0 && fileMetrics.every((m) => m.status === "failed")) {
    throw new Error(
      fileMetrics.map((m) => m.lastMessage ?? m.fileName).join(" | ") || "Falha em todos os arquivos do lote.",
    );
  }

  const sortedEvents = normalizedEvents.slice(0, MAX_EVENTS);
  const classification = classifyMalware(techniqueSet, sortedEvents);
  const currentPhase = deriveCurrentPhase(sortedEvents);
  const metrics = computeMetrics({
    originalLineCount,
    reducedLineCount,
    originalBytes,
    reducedBytes,
    suspiciousEventCount: sortedEvents.length,
    triggerCount,
    uploadedFileCount: input.logFiles.length,
  });
  const riskLevel = deriveRiskLevel(techniqueSet, triggerCount, sortedEvents.length);
  const flowGraph = buildFlowGraph(sortedEvents, currentPhase, classification, riskLevel);
  const techniques = Array.from(techniqueSet);
  const suspiciousApisList = Array.from(suspiciousApiSet);
  const recommendations = buildRecommendations(techniques, classification);
  const insight = await generateInsight({
    analysisName: input.analysisName,
    classification,
    riskLevel,
    currentPhase,
    techniques,
    suspiciousApis: suspiciousApisList,
    metrics,
    flowGraph,
    notableEvents: sortedEvents,
    recommendations,
  });

  const summaryJson = {
    classification: insight.classification,
    riskLevel: insight.riskLevel,
    currentPhase: insight.currentPhase,
    techniques,
    mitreDefenseEvasion: buildMitreDefenseEvasion(techniques, suspiciousApisList),
    suspiciousApis: suspiciousApisList,
    recommendations: insight.recommendations,
    metrics,
    fileMetrics,
    flowGraph,
  };

  const reportArtifact = await uploadArtifactOptional(jobId, "reports/final-report.md", insight.summaryMarkdown, "text/markdown");
  artifacts.push({
    artifactType: "report",
    label: "Relatório final",
    relativePath: reportArtifact.relativePath,
    sourcePath: null,
    storageUrl: reportArtifact.storageUrl,
    storageKey: reportArtifact.storageKey,
    mimeType: "text/markdown",
    sizeBytes: reportArtifact.sizeBytes,
  });

  const reducedArtifact = await uploadArtifactOptional(
    jobId,
    "reports/reduced-logs.json",
    JSON.stringify(reducedLogEntries, null, 2),
    "application/json",
  );
  artifacts.push({
    artifactType: "reduced-log",
    label: "Logs reduzidos",
    relativePath: reducedArtifact.relativePath,
    sourcePath: null,
    storageUrl: reducedArtifact.storageUrl,
    storageKey: reducedArtifact.storageKey,
    mimeType: "application/json",
    sizeBytes: reducedArtifact.sizeBytes,
  });

  const graphArtifact = await uploadArtifactOptional(
    jobId,
    "reports/flow-graph.json",
    JSON.stringify(flowGraph, null, 2),
    "application/json",
  );
  artifacts.push({
    artifactType: "graph",
    label: "Fluxo consolidado",
    relativePath: graphArtifact.relativePath,
    sourcePath: null,
    storageUrl: graphArtifact.storageUrl,
    storageKey: graphArtifact.storageKey,
    mimeType: "application/json",
    sizeBytes: graphArtifact.sizeBytes,
  });

  return {
    events: sortedEvents,
    artifacts,
    insight,
    summaryJson,
    metrics,
    fileMetrics,
    flowGraph,
    classification,
    riskLevel,
    currentPhase,
    suspiciousApis: suspiciousApisList,
    techniques,
    recommendations,
  };
}

async function processAnalysisJob(jobId: string, input: StartAnalysisJobInput, sourceLogFiles: StartAnalysisLogInput[] = input.logFiles) {
  await updateAnalysisJob(jobId, {
    status: "running",
    progress: 20,
    stage: "reduzindo e correlacionando logs",
    message: "Identificando APIs sensíveis, gatilhos heurísticos e sequências suspeitas.",
    llmSummaryStatus: "running",
  });

  try {
    const result = await analyzeLogs(input, jobId);

    await replaceAnalysisArtifacts(jobId, result.artifacts.map((artifact: typeof result.artifacts[number]) => ({
      jobId,
      artifactType: artifact.artifactType,
      label: artifact.label,
      relativePath: artifact.relativePath,
      sourcePath: artifact.sourcePath ?? null,
      storageUrl: artifact.storageUrl ?? null,
      storageKey: artifact.storageKey ?? null,
      mimeType: artifact.mimeType ?? null,
      sizeBytes: artifact.sizeBytes ?? null,
    })));

    await Promise.all(result.events.map((event: typeof result.events[number], index: number) => addAnalysisEvent({
      jobId,
      eventType: event.eventType,
      stage: event.stage,
      message: event.message,
      progress: Math.min(95, 25 + Math.round((index / Math.max(1, result.events.length)) * 60)),
      payloadJson: {
        fileName: event.fileName,
        logType: event.logType,
        lineNumber: event.lineNumber,
        suspiciousApis: event.suspiciousApis,
        trigger: event.trigger,
        addresses: event.addresses,
        techniqueTags: event.techniqueTags,
      },
    })));

    await upsertAnalysisInsight(jobId, {
      jobId,
      modelName: result.insight.modelName,
      riskLevel: result.insight.riskLevel,
      title: result.insight.title,
      summaryMarkdown: result.insight.summaryMarkdown,
      summaryJson: result.summaryJson,
    });

    const failedNames = result.fileMetrics.filter((m) => m.status === "failed").map((m) => m.fileName);
    const summaryLine = `Classificação sugerida: ${result.classification}. Risco ${result.riskLevel}.`;
    await updateAnalysisJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "análise concluída",
      message: failedNames.length
        ? `${summaryLine} Arquivos não processados: ${failedNames.join(", ")}.`
        : summaryLine,
      llmSummaryStatus: "completed",
      completedAt: new Date(),
      stdoutTail: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada durante a análise.";
    await updateAnalysisJob(jobId, {
      status: "failed",
      progress: 100,
      stage: "falha",
      message,
      errorMessage: message,
      llmSummaryStatus: "failed",
      completedAt: new Date(),
      stdoutTail: null,
    });
    await addAnalysisEvent({
      jobId,
      eventType: "error",
      stage: "falha",
      message,
      progress: 100,
      payloadJson: null,
    });
  } finally {
    await cleanupSubmittedTempFiles([...sourceLogFiles, ...input.logFiles]);
  }
}

export async function startAnalysisJob(input: StartAnalysisJobInput) {
  const normalizedInput = await normalizeSubmittedLogs(input);
  validateSubmission(normalizedInput);
  const jobId = `ctr-${nanoid(10)}`;
  const sourceName = `${normalizedInput.analysisName.trim().replace(/\s+/g, "-").toLowerCase()}.bundle`;

  await createAnalysisJob({
    jobId,
    pipelineJobId: null,
    sampleName: normalizedInput.analysisName.trim(),
    sampleSha256: normalizedInput.sampleSha256 ?? null,
    sourceArchiveName: sourceName,
    sourceArchiveUrl: null,
    sourceArchiveStorageKey: null,
    focusFunction: DEFAULT_FOCUS,
    focusTermsJson: normalizedInput.focusTerms ?? [],
    focusRegexesJson: normalizedInput.focusRegexes ?? [],
    status: "queued",
    progress: 5,
    stage: "recebendo logs",
    message: "Os arquivos foram recebidos e a análise heurística será iniciada.",
    stdoutTail: null,
    stderrTail: null,
    pipelineBaseUrl: null,
    pipelineJobPath: null,
    resultPath: normalizedInput.origin ? `${normalizedInput.origin.replace(/\/$/, "")}/?job=${jobId}` : `/jobs/${jobId}`,
    errorMessage: null,
    llmSummaryStatus: "pending",
    commitStatus: "skipped",
    createdByUserId: input.createdByUserId ?? null,
    completedAt: null,
  });

  await addAnalysisEvent({
    jobId,
    eventType: "submission",
    stage: "recebendo logs",
    message: `${normalizedInput.logFiles.length} arquivo(s) recebidos para análise automatizada da Contradef.`,
    progress: 5,
    payloadJson: {
      analysisName: normalizedInput.analysisName,
      fileNames: normalizedInput.logFiles.map((file) => file.fileName),
    },
  });

  void processAnalysisJob(jobId, normalizedInput, input.logFiles);
  return getAnalysisJobDetail(jobId);
}

async function enrichArtifactsWithDownloadUrl(
  jobId: string,
  rows: Awaited<ReturnType<typeof listAnalysisArtifacts>>,
): Promise<AnalysisArtifactDto[]> {
  return Promise.all(rows.map(async (row) => {
    const dto: AnalysisArtifactDto = {
      artifactType: row.artifactType,
      label: row.label,
      relativePath: row.relativePath,
      sourcePath: row.sourcePath,
      storageUrl: row.storageUrl,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      downloadUrl: null,
    };
    if (row.storageUrl) {
      dto.downloadUrl = row.storageUrl;
      return dto;
    }
    if (await localArtifactExists(jobId, row.relativePath)) {
      dto.downloadUrl = `/api/analysis-artifacts/download?${new URLSearchParams({ jobId, relativePath: row.relativePath }).toString()}`;
    }
    return dto;
  }));
}

export async function getAnalysisJobDetail(
  jobId: string,
  options?: { includeServerProcess?: boolean },
): Promise<AnalysisJobDetail | null> {
  const job = await getAnalysisJobByJobId(jobId);
  if (!job) return null;

  const [events, artifactRows, insight] = await Promise.all([
    listAnalysisEvents(jobId, 500),
    listAnalysisArtifacts(jobId),
    getAnalysisInsight(jobId),
  ]);
  const artifacts = await enrichArtifactsWithDownloadUrl(jobId, artifactRows);

  const summaryJson = insight?.summaryJson && !Array.isArray(insight.summaryJson) ? insight.summaryJson as Record<string, unknown> : {};
  const metrics = (summaryJson.metrics as ReductionMetrics | undefined) ?? {
    originalLineCount: 0,
    reducedLineCount: 0,
    originalBytes: 0,
    reducedBytes: 0,
    reductionPercent: 0,
    suspiciousEventCount: 0,
    triggerCount: 0,
    uploadedFileCount: 0,
  };
  const flowGraph = (summaryJson.flowGraph as FlowGraph | undefined) ?? { nodes: [], edges: [] };

  const base: AnalysisJobDetail = {
    job,
    events: events.slice().reverse().map((event) => ({
      eventType: event.eventType,
      stage: event.stage,
      message: event.message,
      progress: event.progress,
      payloadJson: (event.payloadJson as Record<string, unknown> | unknown[] | null | undefined) ?? null,
      createdAt: event.createdAt,
    })),
    artifacts,
    insight: insight
      ? {
          title: insight.title,
          riskLevel: (insight.riskLevel as RiskLevel | null | undefined) ?? null,
          classification: (summaryJson.classification as MalwareCategory | undefined) ?? null,
          currentPhase: (summaryJson.currentPhase as string | undefined) ?? null,
          summaryMarkdown: insight.summaryMarkdown,
          summaryJson: (insight.summaryJson as Record<string, unknown> | unknown[] | null | undefined) ?? null,
          modelName: insight.modelName,
        }
      : null,
    flowGraph,
    metrics,
    fileMetrics: buildLiveFileMetrics(events, summaryJson, job.status),
    suspiciousApis: Array.isArray(summaryJson.suspiciousApis) ? summaryJson.suspiciousApis as string[] : [],
    techniques: Array.isArray(summaryJson.techniques) ? summaryJson.techniques as string[] : [],
    mitreDefenseEvasion: buildMitreDefenseEvasion(
      Array.isArray(summaryJson.techniques) ? summaryJson.techniques as string[] : [],
      Array.isArray(summaryJson.suspiciousApis) ? summaryJson.suspiciousApis as string[] : [],
    ),
    recommendations: Array.isArray(summaryJson.recommendations) ? summaryJson.recommendations as string[] : [],
    classification: (summaryJson.classification as MalwareCategory | undefined) ?? "Unknown",
    riskLevel: (summaryJson.riskLevel as RiskLevel | undefined) ?? "low",
    currentPhase: (summaryJson.currentPhase as string | undefined) ?? "Inicialização",
  };
  if (options?.includeServerProcess) {
    return {
      ...base,
      serverProcessDebug: await getServerProcessDebugSnapshot(),
    };
  }
  return base;
}

export async function syncAnalysisJob(jobId: string) {
  return getAnalysisJobDetail(jobId);
}

export async function syncActiveAnalysisJobs(options?: { createdByUserId?: number }) {
  const jobs = await listAnalysisJobs({
    status: ["queued", "running"],
    limit: 100,
    ...(options?.createdByUserId != null ? { createdByUserId: options.createdByUserId } : {}),
  });
  return jobs.map((job) => job.jobId);
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function getReductionBaselineMetrics() {
  const metricsPath = resolve(process.cwd(), "reduction_test_output", "reduction_metrics.json");
  const manifestRootCandidates = [
    "/home/ubuntu/reference_repo/AI_correlacion_contradef-main/data/manifests",
    "/home/ubuntu/reference_repo/AI_correlacion_contradef-main/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/manifests",
    "/home/ubuntu/reference_repo/AI_correlacion_contradef-main/data/jobs_generic_test/20260414_180214_full_execution_sample_1_isdebuggerpresent-virtualprotect/output/manifests",
  ];

  const datasetManifestPath = await resolveFirstExistingPath(
    manifestRootCandidates.map((root) => `${root}/dataset_manifest.json`),
  );
  const compressionManifestPath = await resolveFirstExistingPath(
    manifestRootCandidates.map((root) => `${root}/compression_manifest.json`),
  );

  const emptyCombined = {
    original_lines: 0,
    reduced_lines: 0,
    original_bytes: 0,
    reduced_bytes: 0,
    reduction_percent: 0,
  };

  const sampleSelectiveTest = {
    available: false,
    errorMessage: null as string | null,
    trigger_address: null as string | null,
    files: [] as Array<{
      file: string;
      original_lines: number;
      reduced_lines: number;
      original_bytes: number;
      reduced_bytes: number;
    }>,
    combined: emptyCombined,
  };

  try {
    const raw = await readFile(metricsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      trigger_address?: string;
      files?: Array<{
        file: string;
        original_lines: number;
        reduced_lines: number;
        original_bytes: number;
        reduced_bytes: number;
      }>;
      combined?: typeof emptyCombined;
    };

    sampleSelectiveTest.available = true;
    sampleSelectiveTest.trigger_address = parsed.trigger_address ?? null;
    sampleSelectiveTest.files = parsed.files ?? [];
    sampleSelectiveTest.combined = parsed.combined ?? emptyCombined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao carregar o teste seletivo em C++.";
    sampleSelectiveTest.errorMessage = `Não foi possível carregar o teste seletivo em C++: ${message}`;
  }

  const realDatasetCompression = {
    available: false,
    errorMessage: null as string | null,
    dataset_directory: null as string | null,
    file_count: 0,
    total_original_size: 0,
    total_compressed_size: 0,
    reduction_percent: 0,
    source_files_materialized: false,
    compressed_files_materialized: false,
    artifacts: [] as Array<{
      file: string;
      original_size: number;
      compressed_size: number;
      reduction_percent: number;
      compression_level: number;
      source_path: string;
      compressed_path: string;
      source_available_in_workspace: boolean;
      compressed_available_in_workspace: boolean;
      source_sha256: string | null;
      compressed_sha256: string | null;
    }>,
  };

  try {
    if (!datasetManifestPath || !compressionManifestPath) {
      throw new Error("Os manifestos do dataset real não foram encontrados em nenhum dos diretórios esperados do workspace.");
    }

    const [datasetRaw, compressionRaw] = await Promise.all([
      readFile(datasetManifestPath, "utf8"),
      readFile(compressionManifestPath, "utf8"),
    ]);

    const datasetManifest = JSON.parse(datasetRaw) as Array<{
      file: string;
      path: string;
      size_bytes: number;
      sha256: string;
    }>;
    const compressionManifest = JSON.parse(compressionRaw) as {
      dataset_directory?: string;
      file_count?: number;
      total_original_size?: number;
      total_compressed_size?: number;
      artifacts?: Array<{
        source: string;
        compressed: string;
        original_size: number;
        compressed_size: number;
        compression_level: number;
        source_sha256?: string;
        compressed_sha256?: string;
      }>;
    };

    const datasetByFile = new Map(datasetManifest.map((entry) => [entry.file, entry]));
    const artifacts = await Promise.all((compressionManifest.artifacts ?? []).map(async (artifact) => {
      const file = basename(artifact.source);
      const datasetEntry = datasetByFile.get(file);
      const reductionPercent = artifact.original_size > 0
        ? 100 * (1 - artifact.compressed_size / artifact.original_size)
        : 0;
      const sourceAvailableInWorkspace = await pathExists(artifact.source);
      const compressedAvailableInWorkspace = await pathExists(artifact.compressed);

      return {
        file,
        original_size: datasetEntry?.size_bytes ?? artifact.original_size,
        compressed_size: artifact.compressed_size,
        reduction_percent: reductionPercent,
        compression_level: artifact.compression_level,
        source_path: artifact.source,
        compressed_path: artifact.compressed,
        source_available_in_workspace: sourceAvailableInWorkspace,
        compressed_available_in_workspace: compressedAvailableInWorkspace,
        source_sha256: datasetEntry?.sha256 ?? artifact.source_sha256 ?? null,
        compressed_sha256: artifact.compressed_sha256 ?? null,
      };
    }));

    realDatasetCompression.available = true;
    realDatasetCompression.dataset_directory = compressionManifest.dataset_directory ?? null;
    realDatasetCompression.file_count = compressionManifest.file_count ?? artifacts.length;
    realDatasetCompression.total_original_size = compressionManifest.total_original_size ?? artifacts.reduce((sum, artifact) => sum + artifact.original_size, 0);
    realDatasetCompression.total_compressed_size = compressionManifest.total_compressed_size ?? artifacts.reduce((sum, artifact) => sum + artifact.compressed_size, 0);
    realDatasetCompression.reduction_percent = realDatasetCompression.total_original_size > 0
      ? 100 * (1 - realDatasetCompression.total_compressed_size / realDatasetCompression.total_original_size)
      : 0;
    realDatasetCompression.source_files_materialized = artifacts.length > 0 && artifacts.every((artifact) => artifact.source_available_in_workspace);
    realDatasetCompression.compressed_files_materialized = artifacts.length > 0 && artifacts.every((artifact) => artifact.compressed_available_in_workspace);
    realDatasetCompression.artifacts = artifacts;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao carregar os manifestos do dataset real.";
    realDatasetCompression.errorMessage = `Não foi possível carregar os manifestos do dataset real: ${message}`;
  }

  return {
    available: sampleSelectiveTest.available || realDatasetCompression.available,
    errorMessage: sampleSelectiveTest.available || realDatasetCompression.available
      ? null
      : sampleSelectiveTest.errorMessage ?? realDatasetCompression.errorMessage,
    trigger_address: sampleSelectiveTest.trigger_address,
    files: sampleSelectiveTest.files,
    combined: sampleSelectiveTest.combined,
    sampleSelectiveTest,
    realDatasetCompression,
  };
}
