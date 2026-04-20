import express, { type Express, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import Busboy from "busboy";
import { nanoid } from "nanoid";

import type { SupportedLogType } from "../../shared/analysis";
import { startAnalysisJob } from "../analysisService";
import { storageGetBuffer, storagePutExact } from "../storage";
import { createContext } from "./context";

const TEMP_UPLOAD_DIR = join(tmpdir(), "contradef-reduce-logs");
const MAX_MULTIPART_FILES = 20;
const MAX_MULTIPART_FILE_BYTES = 6 * 1024 * 1024 * 1024;
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const REDUCE_UPLOAD_MODE = "stateless-storage-v2";
const CACHE_MANIFEST_VERSION = 1;

type TempUploadedLog = {
  fileName: string;
  tempFilePath: string;
  logType: SupportedLogType;
  sizeBytes: number;
};

type CachedUploadManifest = {
  version: number;
  fileFingerprint: string;
  fileName: string;
  logType: SupportedLogType;
  sizeBytes: number;
  lastModifiedMs: number;
  chunkCount: number;
  storageSessionId: string;
  storageFileId: string;
  uploadedByUserId: number;
  uploadedAt: string;
};

type PreparedUploadFile = {
  fileId: string;
  fileName: string;
  logType: SupportedLogType;
  sizeBytes: number;
  chunkCount?: number;
  lastModifiedMs?: number;
  uploadDurationMs?: number;
  uploadReused?: boolean;
  storageSessionId?: string;
  storageFileId?: string;
  fileFingerprint?: string;
};

function parseTextInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCsvInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseCsvInput(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function inferLogType(fileName: string): SupportedLogType {
  const lowered = fileName.toLowerCase();
  if (lowered.includes("functioninterceptor") || lowered.includes("function_interceptor")) return "FunctionInterceptor";
  if (lowered.includes("tracefcncall") || lowered.includes("trace_fcn_call")) return "TraceFcnCall";
  if (lowered.includes("tracememory") || lowered.includes("trace_memory")) return "TraceMemory";
  if (lowered.includes("traceinstructions") || lowered.includes("trace_instructions")) return "TraceInstructions";
  if (lowered.includes("tracedisassembly") || lowered.includes("trace_disassembly")) return "TraceDisassembly";
  return "Unknown";
}

function buildErrorPayload(status: number, message: string, extra?: Record<string, unknown>) {
  return {
    status,
    message,
    ...extra,
  };
}

async function cleanupTempFiles(tempPaths: string[]) {
  await Promise.all(tempPaths.map(async (tempPath) => {
    await unlink(tempPath).catch(() => undefined);
  }));
}

async function resolveAuthenticatedUser(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as Parameters<typeof createContext>[0]);
  if (!ctx.user) {
    res.status(401).json(buildErrorPayload(401, "Autentique-se para enviar logs para redução."));
    return null;
  }

  return ctx.user;
}

function serializePreparedFile(file: PreparedUploadFile) {
  return {
    fileId: file.fileId,
    fileName: file.fileName,
    logType: file.logType,
    sizeBytes: file.sizeBytes,
    chunkCount: file.chunkCount,
    reused: file.uploadReused ?? false,
    storageSessionId: file.storageSessionId,
    storageFileId: file.storageFileId,
  };
}

function buildChunkStorageKey(userId: number, sessionId: string, fileId: string, chunkIndex: number) {
  return `reduce-logs-chunks/${userId}/${sessionId}/${fileId}/chunk-${String(chunkIndex).padStart(6, "0")}.part`;
}

function buildFileFingerprint(userId: number, fileName: string, sizeBytes: number, lastModifiedMs: number) {
  return createHash("sha256")
    .update(`${userId}:${fileName}:${sizeBytes}:${lastModifiedMs}`)
    .digest("hex")
    .slice(0, 24);
}

function buildManifestStorageKey(userId: number, fileFingerprint: string) {
  return `reduce-logs-cache/${userId}/${fileFingerprint}/manifest.json`;
}

async function tryLoadCachedManifest(userId: number, fileFingerprint?: string) {
  if (!fileFingerprint) return null;

  try {
    const download = await storageGetBuffer(buildManifestStorageKey(userId, fileFingerprint));
    const parsed = JSON.parse(download.buffer.toString("utf8")) as Partial<CachedUploadManifest>;
    if (
      parsed?.version !== CACHE_MANIFEST_VERSION
      || !parsed.fileName
      || !parsed.storageSessionId
      || !parsed.storageFileId
      || !Number.isFinite(parsed.sizeBytes)
      || !Number.isInteger(parsed.chunkCount)
      || (parsed.chunkCount ?? 0) <= 0
    ) {
      return null;
    }

    return parsed as CachedUploadManifest;
  } catch {
    return null;
  }
}

async function persistCachedManifest(userId: number, file: PreparedUploadFile) {
  if (!file.fileFingerprint || !file.lastModifiedMs || !file.chunkCount) {
    return;
  }

  const manifest: CachedUploadManifest = {
    version: CACHE_MANIFEST_VERSION,
    fileFingerprint: file.fileFingerprint,
    fileName: file.fileName,
    logType: file.logType,
    sizeBytes: file.sizeBytes,
    lastModifiedMs: file.lastModifiedMs,
    chunkCount: file.chunkCount,
    storageSessionId: file.storageSessionId ?? "",
    storageFileId: file.storageFileId ?? file.fileId,
    uploadedByUserId: userId,
    uploadedAt: new Date().toISOString(),
  };

  if (!manifest.storageSessionId || !manifest.storageFileId) {
    return;
  }

  await storagePutExact(
    buildManifestStorageKey(userId, file.fileFingerprint),
    JSON.stringify(manifest, null, 2),
    "application/json",
  );
}

function normalizePreparedFiles(
  requestedFiles: Array<{
    fileId?: unknown;
    fileName?: unknown;
    sizeBytes?: unknown;
    logType?: unknown;
    chunkCount?: unknown;
    lastModifiedMs?: unknown;
    uploadDurationMs?: unknown;
    reused?: unknown;
    storageSessionId?: unknown;
    storageFileId?: unknown;
    fileFingerprint?: unknown;
  }>,
  generateIds: boolean,
): PreparedUploadFile[] {
  if (!requestedFiles.length) {
    throw new Error("Envie ao menos um arquivo de log para iniciar a redução.");
  }

  if (requestedFiles.length > MAX_MULTIPART_FILES) {
    throw new Error(`Envie no máximo ${MAX_MULTIPART_FILES} arquivos por análise.`);
  }

  return requestedFiles.map((file) => {
    const fileName = basename(parseTextInput(file?.fileName) || `log-${nanoid(6)}.cdf`);
    const sizeBytes = Number(file?.sizeBytes ?? 0);
    const explicitLogType = parseTextInput(file?.logType);
    const logType = (explicitLogType || inferLogType(fileName)) as SupportedLogType;
    const fileId = generateIds ? nanoid(12) : parseTextInput(file?.fileId);
    const chunkCountValue = file?.chunkCount;
    const chunkCount = chunkCountValue === undefined ? undefined : Number(chunkCountValue);
    const lastModifiedMs = parseOptionalFiniteNumber(file?.lastModifiedMs);
    const uploadDurationMs = parseOptionalFiniteNumber(file?.uploadDurationMs);
    const uploadReused = Boolean(file?.reused);
    const storageSessionId = parseTextInput(file?.storageSessionId);
    const storageFileId = parseTextInput(file?.storageFileId);
    const fileFingerprint = parseTextInput(file?.fileFingerprint);

    if (!fileId) {
      throw new Error(`O arquivo ${fileName} não possui identificador de upload válido.`);
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new Error(`O arquivo ${fileName} não possui tamanho válido para upload.`);
    }

    if (sizeBytes > MAX_MULTIPART_FILE_BYTES) {
      throw new Error(`O arquivo ${fileName} excede o limite de ${Math.round(MAX_MULTIPART_FILE_BYTES / (1024 * 1024 * 1024))} GB por arquivo.`);
    }

    if (chunkCount !== undefined) {
      if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
        throw new Error(`O arquivo ${fileName} não informou uma quantidade válida de blocos.`);
      }

      const minimumChunkCount = Math.ceil(sizeBytes / MAX_CHUNK_BYTES);
      if (chunkCount < minimumChunkCount) {
        throw new Error(`O arquivo ${fileName} informou menos blocos do que o necessário para ${sizeBytes} bytes.`);
      }
    }

    return {
      fileId,
      fileName,
      logType,
      sizeBytes,
      chunkCount,
      lastModifiedMs,
      uploadDurationMs,
      uploadReused,
      storageSessionId: storageSessionId || undefined,
      storageFileId: storageFileId || undefined,
      fileFingerprint: fileFingerprint || undefined,
    };
  });
}

async function startJobFromPreparedFiles(input: {
  analysisName: string;
  focusTerms: string[];
  focusRegexes: string[];
  origin?: string;
  createdByUserId: number;
  preparedFiles: PreparedUploadFile[];
  sessionId: string;
}) {
  for (const file of input.preparedFiles) {
    if (!file.chunkCount) {
      throw new Error(`O arquivo ${file.fileName} não informou quantos blocos foram enviados.`);
    }
  }

  return startAnalysisJob({
    analysisName: input.analysisName,
    focusTerms: input.focusTerms,
    focusRegexes: input.focusRegexes,
    origin: input.origin,
    createdByUserId: input.createdByUserId,
    logFiles: input.preparedFiles.map((file) => ({
      fileName: file.fileName,
      logType: file.logType,
      sizeBytes: file.sizeBytes,
      uploadSessionId: file.storageSessionId || input.sessionId,
      uploadFileId: file.storageFileId || file.fileId,
      uploadChunkCount: file.chunkCount,
      uploadedByUserId: input.createdByUserId,
      uploadDurationMs: file.uploadDurationMs,
      uploadReused: file.uploadReused,
    })),
  });
}

async function handleLegacyMultipartUpload(req: Request, res: Response, userId: number) {
  await mkdir(TEMP_UPLOAD_DIR, { recursive: true });

  const uploadedLogs: TempUploadedLog[] = [];
  const tempPaths: string[] = [];
  const fileWritePromises: Promise<void>[] = [];
  const fields = {
    analysisName: "",
    focusTerms: "",
    focusRegexes: "",
    origin: "",
  };

  let fatalError: Error | null = null;

  try {
    req.setTimeout(0);
    res.setTimeout(0);

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: MAX_MULTIPART_FILES,
        fileSize: MAX_MULTIPART_FILE_BYTES,
      },
    });

    busboy.on("field", (name, value) => {
      if (name === "analysisName") fields.analysisName = value;
      if (name === "focusTerms") fields.focusTerms = value;
      if (name === "focusRegexes") fields.focusRegexes = value;
      if (name === "origin") fields.origin = value;
    });

    busboy.on("filesLimit", () => {
      fatalError = new Error(`Envie no máximo ${MAX_MULTIPART_FILES} arquivos por análise.`);
    });

    busboy.on("file", (fieldName, fileStream, info) => {
      if (fieldName !== "logs") {
        fileStream.resume();
        return;
      }

      const originalName = basename(info.filename || `log-${nanoid(6)}.cdf`);
      const tempFilePath = join(TEMP_UPLOAD_DIR, `${Date.now()}-${nanoid(8)}-${originalName}`);
      tempPaths.push(tempFilePath);

      const writeStream = createWriteStream(tempFilePath);
      let sizeBytes = 0;
      let limited = false;

      const filePromise = new Promise<void>((resolve, reject) => {
        fileStream.on("data", (chunk: Buffer) => {
          sizeBytes += chunk.length;
        });

        fileStream.on("limit", () => {
          limited = true;
          fatalError = new Error(`O arquivo ${originalName} excede o limite de ${Math.round(MAX_MULTIPART_FILE_BYTES / (1024 * 1024 * 1024))} GB por arquivo.`);
          writeStream.destroy();
          fileStream.resume();
        });

        fileStream.on("error", reject);
        writeStream.on("error", (error) => {
          if (limited) {
            resolve();
            return;
          }
          reject(error);
        });

        writeStream.on("finish", () => {
          if (!limited) {
            uploadedLogs.push({
              fileName: originalName,
              tempFilePath,
              logType: inferLogType(originalName),
              sizeBytes,
            });
          }
          resolve();
        });
      });

      fileStream.pipe(writeStream);
      fileWritePromises.push(filePromise);
    });

    await new Promise<void>((resolve, reject) => {
      busboy.on("error", reject);
      busboy.on("finish", resolve);
      req.pipe(busboy);
    });

    await Promise.all(fileWritePromises);

    if (fatalError) {
      throw fatalError;
    }

    if (!uploadedLogs.length) {
      throw new Error("Envie ao menos um arquivo de log para iniciar a redução.");
    }

    const result = await startAnalysisJob({
      analysisName: fields.analysisName,
      focusTerms: parseCsvInput(fields.focusTerms),
      focusRegexes: parseCsvInput(fields.focusRegexes),
      origin: fields.origin || undefined,
      createdByUserId: userId,
      logFiles: uploadedLogs.map((file) => ({
        fileName: file.fileName,
        logType: file.logType,
        tempFilePath: file.tempFilePath,
        sizeBytes: file.sizeBytes,
      })),
    });

    res.json(result);
  } catch (error) {
    await cleanupTempFiles(tempPaths);
    const message = error instanceof Error ? error.message : "Não foi possível receber os logs enviados para redução.";
    res.status(400).json(buildErrorPayload(400, message));
  }
}

export function registerReduceLogsUploadRoute(app: Express) {
  app.get("/api/reduce-logs/upload/capabilities", async (_req: Request, res: Response) => {
    res.json({
      mode: REDUCE_UPLOAD_MODE,
      maxChunkBytes: MAX_CHUNK_BYTES,
      methods: {
        init: "POST",
        chunk: ["POST", "PUT"],
        complete: "POST",
      },
      supports: {
        cachedReuse: true,
        uploadDuration: true,
      },
      routes: [
        "/api/reduce-logs/upload",
        "/api/reduce-logs/upload/init",
        "/api/reduce-logs/upload/chunk",
        "/api/reduce-logs/upload/complete",
      ],
    });
  });

  app.post("/api/reduce-logs/upload", async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) {
      return;
    }

    await handleLegacyMultipartUpload(req, res, Number(user.id));
  });

  app.post("/api/reduce-logs/upload/init", async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) {
      return;
    }

    const body = req.body as {
      files?: Array<{ fileName?: unknown; sizeBytes?: unknown; logType?: unknown; lastModifiedMs?: unknown }>;
    };

    try {
      const sessionId = nanoid(18);
      const requestedFiles = normalizePreparedFiles(Array.isArray(body?.files) ? body.files : [], true);
      const preparedFiles = await Promise.all(requestedFiles.map(async (file) => {
        const fileFingerprint = file.lastModifiedMs
          ? buildFileFingerprint(Number(user.id), file.fileName, file.sizeBytes, file.lastModifiedMs)
          : undefined;
        const cachedManifest = await tryLoadCachedManifest(Number(user.id), fileFingerprint);

        if (cachedManifest
          && cachedManifest.fileName === file.fileName
          && cachedManifest.sizeBytes === file.sizeBytes
          && cachedManifest.lastModifiedMs === file.lastModifiedMs
        ) {
          return {
            ...file,
            chunkCount: cachedManifest.chunkCount,
            uploadReused: true,
            storageSessionId: cachedManifest.storageSessionId,
            storageFileId: cachedManifest.storageFileId,
            fileFingerprint,
            fileId: cachedManifest.storageFileId,
          } satisfies PreparedUploadFile;
        }

        return {
          ...file,
          uploadReused: false,
          storageSessionId: sessionId,
          storageFileId: file.fileId,
          fileFingerprint,
        } satisfies PreparedUploadFile;
      }));

      res.json({
        mode: REDUCE_UPLOAD_MODE,
        sessionId,
        maxChunkBytes: MAX_CHUNK_BYTES,
        files: preparedFiles.map(serializePreparedFile),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível preparar a sessão de upload do lote.";
      res.status(400).json(buildErrorPayload(400, message));
    }
  });

  const chunkBodyParser = express.raw({ type: "application/octet-stream", limit: `${MAX_CHUNK_BYTES}b` });

  const handleChunkUpload = async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) {
      return;
    }

    const sessionId = parseTextInput(req.query.sessionId);
    const fileId = parseTextInput(req.query.fileId);
    const chunkIndex = Number(req.query.chunkIndex ?? -1);

    if (!sessionId) {
      res.status(400).json(buildErrorPayload(400, "A sessão informada para upload em partes é inválida."));
      return;
    }

    if (!fileId) {
      res.status(400).json(buildErrorPayload(400, "O identificador do arquivo em upload é inválido."));
      return;
    }

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      res.status(400).json(buildErrorPayload(400, "O índice do bloco enviado é inválido."));
      return;
    }

    const chunk = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!chunk.byteLength) {
      res.status(400).json(buildErrorPayload(400, `O bloco ${chunkIndex} chegou vazio.`));
      return;
    }

    if (chunk.byteLength > MAX_CHUNK_BYTES) {
      res.status(413).json(buildErrorPayload(413, `O bloco enviado excede o limite de ${Math.round(MAX_CHUNK_BYTES / (1024 * 1024))} MB.`));
      return;
    }

    try {
      const storageKey = buildChunkStorageKey(Number(user.id), sessionId, fileId, chunkIndex);
      await storagePutExact(storageKey, chunk, "application/octet-stream");
      res.json({
        mode: REDUCE_UPLOAD_MODE,
        sessionId,
        fileId,
        chunkIndex,
        storageKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Não foi possível persistir o bloco ${chunkIndex} no armazenamento compartilhado.`;
      res.status(500).json(buildErrorPayload(500, message));
    }
  };

  app.post("/api/reduce-logs/upload/chunk", chunkBodyParser, handleChunkUpload);
  app.put("/api/reduce-logs/upload/chunk", chunkBodyParser, handleChunkUpload);

  app.post("/api/reduce-logs/upload/complete", async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) {
      return;
    }

    const body = req.body as {
      sessionId?: unknown;
      analysisName?: unknown;
      focusTerms?: unknown;
      focusRegexes?: unknown;
      origin?: unknown;
      files?: Array<{
        fileId?: unknown;
        fileName?: unknown;
        sizeBytes?: unknown;
        logType?: unknown;
        chunkCount?: unknown;
        lastModifiedMs?: unknown;
        uploadDurationMs?: unknown;
        reused?: unknown;
        storageSessionId?: unknown;
        storageFileId?: unknown;
      }>;
    };

    try {
      const sessionId = parseTextInput(body?.sessionId);
      if (!sessionId) {
        throw new Error("A sessão de upload informada para concluir o lote é inválida.");
      }

      const requestedFiles = normalizePreparedFiles(Array.isArray(body?.files) ? body.files : [], false).map((file) => ({
        ...file,
        storageSessionId: file.storageSessionId || sessionId,
        storageFileId: file.storageFileId || file.fileId,
        fileFingerprint: file.lastModifiedMs
          ? buildFileFingerprint(Number(user.id), file.fileName, file.sizeBytes, file.lastModifiedMs)
          : undefined,
      }));

      await Promise.all(requestedFiles.map((file) => persistCachedManifest(Number(user.id), file)));

      const result = await startJobFromPreparedFiles({
        sessionId,
        analysisName: parseTextInput(body?.analysisName) || "Redução Contradef",
        focusTerms: parseCsvInput(body?.focusTerms),
        focusRegexes: parseCsvInput(body?.focusRegexes),
        origin: parseTextInput(body?.origin) || undefined,
        createdByUserId: Number(user.id),
        preparedFiles: requestedFiles,
      });

      res.json({
        mode: REDUCE_UPLOAD_MODE,
        sessionId,
        files: requestedFiles.map(serializePreparedFile),
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a redução após a montagem do lote enviado.";
      res.status(400).json(buildErrorPayload(400, message));
    }
  });
}
