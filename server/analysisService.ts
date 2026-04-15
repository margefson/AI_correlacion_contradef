import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  addAnalysisEvent,
  createAnalysisJob,
  getAnalysisCommit,
  getAnalysisInsight,
  getAnalysisJobByJobId,
  listAnalysisArtifacts,
  listAnalysisEvents,
  listAnalysisJobs,
  replaceAnalysisArtifacts,
  updateAnalysisJob,
  upsertAnalysisCommit,
  upsertAnalysisInsight,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import type { AnalysisArtifactDto, CorrelationGraph } from "../shared/analysis";

const execFileAsync = promisify(execFile);

const DEFAULT_PIPELINE_BASE_URL = process.env.CDF_PIPELINE_API_URL || "http://127.0.0.1:8765";
const DEFAULT_PIPELINE_REPOSITORY = process.env.CDF_PIPELINE_REPO_PATH || "/home/ubuntu/repos/AI_correlacion_contradef";
const DEFAULT_PIPELINE_BRANCH = process.env.CDF_PIPELINE_BRANCH || "main";
const DEFAULT_GITHUB_REPOSITORY = process.env.CDF_PIPELINE_GITHUB_REPOSITORY || "margefson/AI_correlacion_contradef";
const JOB_SYNC_INTERVAL_MS = 4000;
const MAX_SUMMARY_CONTEXT_LENGTH = 18000;
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_LOG_TAIL_LENGTH = 12000;
const runningSyncs = new Map<string, Promise<unknown>>();
const pollingTimers = new Map<string, NodeJS.Timeout>();

export type StartAnalysisJobInput = {
  archiveName: string;
  archiveBase64: string;
  focusFunction: string;
  focusTerms?: string[];
  focusRegexes?: string[];
  createdByUserId?: number;
  origin?: string;
};

export type StartAnalysisJobArchiveInput = {
  archiveName: string;
  archiveBuffer: Buffer;
  focusFunction: string;
  focusTerms?: string[];
  focusRegexes?: string[];
  createdByUserId?: number;
  origin?: string;
};

type LegacyStatusPayload = {
  state?: string;
  progress?: number;
  stage?: string;
  message?: string;
  archive?: string;
  focus_terms?: string[];
  focus_regexes?: string[];
  updated_at?: string;
};

type LegacyEventPayload = {
  timestamp?: string;
  type?: string;
  event_type?: string;
  level?: string;
  stage?: string;
  message?: string;
  progress?: number;
  [key: string]: unknown;
};

type LegacyArtifactPayload = {
  path: string;
  relative_path: string;
  size_bytes?: number;
};

function decodeBase64(input: string): Buffer {
  const normalized = input.includes(",") ? input.split(",").pop() ?? input : input;
  const trimmed = normalized.trim();
  if (!trimmed || trimmed.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(trimmed)) {
    throw new Error("O conteúdo enviado não está em base64 válido.");
  }
  return Buffer.from(trimmed, "base64");
}

function validateArchiveInput(params: { archiveName: string; archiveBuffer: Buffer }) {
  if (!params.archiveName.toLowerCase().endsWith(".7z")) {
    throw new Error("Envie um arquivo .7z válido para iniciar a análise.");
  }
  if (!params.archiveBuffer.length) {
    throw new Error("O arquivo enviado está vazio.");
  }
  if (params.archiveBuffer.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`O arquivo excede o limite suportado de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB.`);
  }
}

function normalizeCsvValues(values: string[] | undefined, fallbackValue: string): string[] {
  const normalized = (values ?? []).map((item) => item.trim()).filter(Boolean);
  if (normalized.length > 0) return normalized;
  return [fallbackValue.trim()].filter(Boolean);
}

function resolvePipelineUrl(endpoint: string): string {
  return `${DEFAULT_PIPELINE_BASE_URL.replace(/\/$/, "")}${endpoint}`;
}

function buildResultPath(jobId: string, origin?: string): string {
  const relative = `/jobs/${jobId}`;
  if (!origin) return relative;
  return `${origin.replace(/\/$/, "")}${relative}`;
}

function mapJobStatus(state?: string): "queued" | "running" | "completed" | "failed" | "cancelled" {
  switch ((state || "").toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "completed":
    case "success":
    case "done":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "running";
  }
}

function detectArtifactType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".md") return "markdown";
  if (ext === ".docx") return "docx";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".svg") return "image";
  if (ext === ".log") return "log";
  return "file";
}

function detectMimeType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".json") return "application/json";
  if (ext === ".md") return "text/markdown";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".log" || ext === ".txt") return "text/plain";
  return "application/octet-stream";
}

function buildArtifactLabel(relativePath: string): string {
  const filename = path.basename(relativePath);
  return filename.replace(/[_-]+/g, " ").replace(/\.[^.]+$/, "").trim() || filename;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Falha ao chamar pipeline (${response.status} ${response.statusText}): ${detail}`);
  }
  return (await response.json()) as T;
}

async function readArtifactText(filePath: string, limit = MAX_SUMMARY_CONTEXT_LENGTH): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return content.length > limit ? `${content.slice(-limit)}\n\n[conteúdo truncado]` : content;
}

async function maybeMirrorArtifact(jobId: string, artifact: LegacyArtifactPayload, shouldMirror: boolean) {
  if (!shouldMirror) {
    return {
      artifactType: detectArtifactType(artifact.relative_path),
      label: buildArtifactLabel(artifact.relative_path),
      relativePath: artifact.relative_path,
      sourcePath: artifact.path,
      storageUrl: null,
      storageKey: null,
      mimeType: detectMimeType(artifact.relative_path),
      sizeBytes: artifact.size_bytes ?? null,
    } satisfies AnalysisArtifactDto;
  }

  try {
    const fileBuffer = await fs.readFile(artifact.path);
    const uploaded = await storagePut(
      `analysis-results/${jobId}/${path.basename(artifact.relative_path)}`,
      fileBuffer,
      detectMimeType(artifact.relative_path)
    );

    return {
      artifactType: detectArtifactType(artifact.relative_path),
      label: buildArtifactLabel(artifact.relative_path),
      relativePath: artifact.relative_path,
      sourcePath: artifact.path,
      storageUrl: uploaded.url,
      storageKey: uploaded.key,
      mimeType: detectMimeType(artifact.relative_path),
      sizeBytes: artifact.size_bytes ?? null,
    } satisfies AnalysisArtifactDto;
  } catch (error) {
    console.warn("[Analysis] Não foi possível espelhar artefato para storage:", artifact.path, error);
    return {
      artifactType: detectArtifactType(artifact.relative_path),
      label: buildArtifactLabel(artifact.relative_path),
      relativePath: artifact.relative_path,
      sourcePath: artifact.path,
      storageUrl: null,
      storageKey: null,
      mimeType: detectMimeType(artifact.relative_path),
      sizeBytes: artifact.size_bytes ?? null,
    } satisfies AnalysisArtifactDto;
  }
}

async function submitArchiveToPipeline(params: {
  archiveName: string;
  archiveBuffer: Buffer;
  focusTerms: string[];
  focusRegexes: string[];
}) {
  const form = new FormData();
  const archiveBytes = new Uint8Array(params.archiveBuffer);
  form.append("archive", new Blob([archiveBytes], { type: "application/x-7z-compressed" }), params.archiveName);
  form.append("focus_terms", params.focusTerms.join(", "));
  form.append("focus_regexes", params.focusRegexes.join(", "));

  return fetchJson<{
    job_id: string;
    status_url: string;
    events_url: string;
    artifacts_url: string;
  }>(resolvePipelineUrl("/jobs/upload"), {
    method: "POST",
    body: form,
  });
}

async function generateInsight(jobId: string) {
  const job = await getAnalysisJobByJobId(jobId);
  if (!job) return null;

  await updateAnalysisJob(jobId, { llmSummaryStatus: "running" });

  try {
    const artifacts = await listAnalysisArtifacts(jobId);
    const jsonArtifact = artifacts.find((artifact) => artifact.relativePath.toLowerCase().endsWith(".json"));
    const markdownArtifact = artifacts.find((artifact) => artifact.relativePath.toLowerCase().endsWith(".md"));
    const stdoutPath = path.join(DEFAULT_PIPELINE_REPOSITORY, "data", "jobs_api", jobId, "process.stdout.log");
    const stderrPath = path.join(DEFAULT_PIPELINE_REPOSITORY, "data", "jobs_api", jobId, "process.stderr.log");

    const jsonContent = jsonArtifact?.sourcePath ? await readArtifactText(jsonArtifact.sourcePath).catch(() => "") : "";
    const markdownContent = markdownArtifact?.sourcePath ? await readArtifactText(markdownArtifact.sourcePath).catch(() => "") : "";
    const stdoutContent = await readArtifactText(stdoutPath, 8000).catch(() => "");
    const stderrContent = await readArtifactText(stderrPath, 4000).catch(() => "");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Você é um analista sênior de malware. Produza um resumo técnico, objetivo e interpretativo em português a partir de artefatos reais de uma execução instrumentada. Não invente fatos ausentes e destaque apenas o que puder ser inferido dos artefatos fornecidos.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Job: ${job.jobId}`,
                `Amostra: ${job.sampleName}`,
                `Função de interesse: ${job.focusFunction}`,
                `Status final: ${job.status}`,
                `Etapa final: ${job.stage}`,
                "Artefato JSON de correlação:",
                jsonContent || "(não disponível)",
                "Artefato Markdown do job:",
                markdownContent || "(não disponível)",
                "Trecho de stdout do processamento:",
                stdoutContent || "(não disponível)",
                "Trecho de stderr do processamento:",
                stderrContent || "(não disponível)",
              ].join("\n\n"),
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "analysis_insight",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              riskLevel: { type: "string" },
              summaryMarkdown: { type: "string" },
              keyFunctions: {
                type: "array",
                items: { type: "string" },
              },
              confidenceNotes: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["title", "riskLevel", "summaryMarkdown", "keyFunctions", "confidenceNotes"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message.content;
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

    await upsertAnalysisInsight(jobId, {
      jobId,
      modelName: response.model,
      riskLevel: parsed.riskLevel,
      title: parsed.title,
      summaryMarkdown: parsed.summaryMarkdown,
      summaryJson: parsed,
    });

    await updateAnalysisJob(jobId, { llmSummaryStatus: "completed" });
    return parsed;
  } catch (error) {
    console.error("[Analysis] Falha ao gerar insight por LLM:", error);
    await updateAnalysisJob(jobId, { llmSummaryStatus: "failed" });
    throw error;
  }
}

async function commitJobArtifacts(jobId: string) {
  const job = await getAnalysisJobByJobId(jobId);
  if (!job) return null;

  await updateAnalysisJob(jobId, { commitStatus: "running" });
  await upsertAnalysisCommit(jobId, {
    jobId,
    repository: DEFAULT_GITHUB_REPOSITORY,
    branch: DEFAULT_PIPELINE_BRANCH,
    status: "running",
  });

  const targetDir = path.join(DEFAULT_PIPELINE_REPOSITORY, "data", "jobs_api", jobId);
  const commitMessage = `feat: add analysis artifacts for ${job.sampleName} (${job.focusFunction}) [job ${jobId}]`;

  try {
    await fs.access(targetDir);
    await execFileAsync("git", ["-C", DEFAULT_PIPELINE_REPOSITORY, "add", path.relative(DEFAULT_PIPELINE_REPOSITORY, targetDir)]);

    const status = await execFileAsync("git", ["-C", DEFAULT_PIPELINE_REPOSITORY, "status", "--porcelain", path.relative(DEFAULT_PIPELINE_REPOSITORY, targetDir)]);
    if (!status.stdout.trim()) {
      await upsertAnalysisCommit(jobId, {
        jobId,
        repository: DEFAULT_GITHUB_REPOSITORY,
        branch: DEFAULT_PIPELINE_BRANCH,
        status: "skipped",
        commitMessage: "Nenhuma alteração nova para versionar.",
        detailsJson: { reason: "no_changes" },
      });
      await updateAnalysisJob(jobId, { commitStatus: "skipped" });
      return { status: "skipped" as const };
    }

    let commitHash = "";
    try {
      const commitResult = await execFileAsync("git", ["-C", DEFAULT_PIPELINE_REPOSITORY, "commit", "-m", commitMessage]);
      const hashResult = await execFileAsync("git", ["-C", DEFAULT_PIPELINE_REPOSITORY, "rev-parse", "HEAD"]);
      commitHash = hashResult.stdout.trim();
      await execFileAsync("git", ["-C", DEFAULT_PIPELINE_REPOSITORY, "push", "origin", DEFAULT_PIPELINE_BRANCH]);

      await upsertAnalysisCommit(jobId, {
        jobId,
        repository: DEFAULT_GITHUB_REPOSITORY,
        branch: DEFAULT_PIPELINE_BRANCH,
        commitHash,
        commitMessage,
        status: "completed",
        detailsJson: { commitStdout: commitResult.stdout },
      });
      await updateAnalysisJob(jobId, { commitStatus: "completed" });
      return { status: "completed" as const, commitHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await upsertAnalysisCommit(jobId, {
        jobId,
        repository: DEFAULT_GITHUB_REPOSITORY,
        branch: DEFAULT_PIPELINE_BRANCH,
        commitHash: commitHash || null,
        commitMessage,
        status: "failed",
        detailsJson: { error: errorMessage },
      });
      await updateAnalysisJob(jobId, { commitStatus: "failed" });
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await upsertAnalysisCommit(jobId, {
      jobId,
      repository: DEFAULT_GITHUB_REPOSITORY,
      branch: DEFAULT_PIPELINE_BRANCH,
      status: "failed",
      commitMessage,
      detailsJson: { error: errorMessage },
    });
    await updateAnalysisJob(jobId, { commitStatus: "failed" });
    throw error;
  }
}

async function finalizeSuccessfulJob(jobId: string) {
  const job = await getAnalysisJobByJobId(jobId);
  if (!job) return;

  if (job.llmSummaryStatus === "pending" || job.llmSummaryStatus === "failed") {
    try {
      await generateInsight(jobId);
    } catch (error) {
      console.warn("[Analysis] Insight pós-processamento falhou:", error);
    }
  }

  const refreshedJob = await getAnalysisJobByJobId(jobId);
  if (refreshedJob && (refreshedJob.commitStatus === "pending" || refreshedJob.commitStatus === "failed")) {
    try {
      await commitJobArtifacts(jobId);
    } catch (error) {
      console.warn("[Analysis] Commit automático falhou:", error);
    }
  }

  const finalJob = await getAnalysisJobByJobId(jobId);
  if (finalJob) {
    const insight = await getAnalysisInsight(jobId);
    await notifyOwner({
      title: `Análise concluída: ${finalJob.sampleName} · ${finalJob.focusFunction}`,
      content: [
        `A amostra **${finalJob.sampleName}** com foco em **${finalJob.focusFunction}** foi concluída com sucesso.`,
        `Link para os resultados: ${finalJob.resultPath || buildResultPath(jobId)}`,
        insight?.title ? `Resumo: ${insight.title}` : "Resumo interpretativo disponível no painel do job.",
      ].join("\n\n"),
    }).catch((error) => console.warn("[Analysis] Notificação ao proprietário falhou:", error));
  }
}

async function synchronizeEvents(jobId: string, remoteEvents: LegacyEventPayload[]) {
  const localEvents = await listAnalysisEvents(jobId, 1000);
  const alreadyPersisted = localEvents.length;
  const pendingEvents = remoteEvents.slice(alreadyPersisted);

  for (const event of pendingEvents) {
    await addAnalysisEvent({
      jobId,
      eventType: String(event.event_type || event.type || event.level || "info"),
      stage: typeof event.stage === "string" ? event.stage : null,
      message: typeof event.message === "string" ? event.message : JSON.stringify(event),
      progress: typeof event.progress === "number" ? event.progress : null,
      payloadJson: event,
    });
  }
}

async function synchronizeArtifacts(jobId: string, remoteArtifacts: LegacyArtifactPayload[], shouldMirror: boolean) {
  const existingArtifacts = await listAnalysisArtifacts(jobId);
  const canReuseMirrors = existingArtifacts.length > 0 && existingArtifacts.every((artifact) => !!artifact.storageUrl);
  const mapped = [];
  for (const artifact of remoteArtifacts) {
    mapped.push(await maybeMirrorArtifact(jobId, artifact, shouldMirror && !canReuseMirrors));
  }

  await replaceAnalysisArtifacts(
    jobId,
    mapped.map((artifact) => ({
      jobId,
      artifactType: artifact.artifactType,
      label: artifact.label,
      relativePath: artifact.relativePath,
      sourcePath: artifact.sourcePath,
      storageUrl: artifact.storageUrl,
      storageKey: artifact.storageKey,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes ?? null,
    }))
  );
}

function startJobPolling(jobId: string) {
  if (pollingTimers.has(jobId)) return;

  const timer = setInterval(() => {
    syncAnalysisJob(jobId).catch((error) => {
      console.warn(`[Analysis] Erro ao sincronizar job ${jobId}:`, error);
    });
  }, JOB_SYNC_INTERVAL_MS);

  pollingTimers.set(jobId, timer);
}

function stopJobPolling(jobId: string) {
  const timer = pollingTimers.get(jobId);
  if (timer) {
    clearInterval(timer);
    pollingTimers.delete(jobId);
  }
}

export async function startAnalysisJobFromArchive(input: StartAnalysisJobArchiveInput) {
  const focusTerms = normalizeCsvValues(input.focusTerms, input.focusFunction);
  const focusRegexes = (input.focusRegexes ?? []).map((item) => item.trim()).filter(Boolean);
  validateArchiveInput({ archiveName: input.archiveName, archiveBuffer: input.archiveBuffer });
  const sampleName = path.parse(input.archiveName).name;

  const archiveUpload = await storagePut(
    `analysis-inputs/${sampleName}/${input.archiveName}`,
    input.archiveBuffer,
    "application/x-7z-compressed"
  );

  const pipelineJob = await submitArchiveToPipeline({
    archiveName: input.archiveName,
    archiveBuffer: input.archiveBuffer,
    focusTerms,
    focusRegexes,
  });

  const job = await createAnalysisJob({
    jobId: pipelineJob.job_id,
    pipelineJobId: pipelineJob.job_id,
    sampleName,
    sourceArchiveName: input.archiveName,
    sourceArchiveUrl: archiveUpload.url,
    sourceArchiveStorageKey: archiveUpload.key,
    focusFunction: input.focusFunction,
    focusTermsJson: focusTerms,
    focusRegexesJson: focusRegexes,
    status: "queued",
    progress: 0,
    stage: "submitted",
    message: "Job enviado para o pipeline Python e aguardando processamento.",
    pipelineBaseUrl: DEFAULT_PIPELINE_BASE_URL,
    pipelineJobPath: pipelineJob.status_url,
    resultPath: buildResultPath(pipelineJob.job_id, input.origin),
    llmSummaryStatus: "pending",
    commitStatus: "pending",
    stdoutTail: null,
    stderrTail: null,
    createdByUserId: input.createdByUserId,
  });

  await addAnalysisEvent({
    jobId: pipelineJob.job_id,
    eventType: "submitted",
    stage: "submitted",
    message: "Upload concluído e job encaminhado ao pipeline Python.",
    progress: 0,
    payloadJson: {
      statusUrl: pipelineJob.status_url,
      eventsUrl: pipelineJob.events_url,
      artifactsUrl: pipelineJob.artifacts_url,
    },
  });

  startJobPolling(pipelineJob.job_id);
  await syncAnalysisJob(pipelineJob.job_id).catch((error) => {
    console.warn("[Analysis] Sincronização inicial falhou:", error);
  });

  return job ?? getAnalysisJobByJobId(pipelineJob.job_id);
}

export async function startAnalysisJob(input: StartAnalysisJobInput) {
  const archiveBuffer = decodeBase64(input.archiveBase64);
  return startAnalysisJobFromArchive({
    archiveName: input.archiveName,
    archiveBuffer,
    focusFunction: input.focusFunction,
    focusTerms: input.focusTerms,
    focusRegexes: input.focusRegexes,
    createdByUserId: input.createdByUserId,
    origin: input.origin,
  });
}

export async function syncAnalysisJob(jobId: string) {
  if (runningSyncs.has(jobId)) {
    return runningSyncs.get(jobId);
  }

  const syncPromise = (async () => {
    const job = await getAnalysisJobByJobId(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} não encontrado na aplicação web.`);
    }

    const [statusPayload, eventsPayload, artifactsPayload, stdoutPayload, stderrPayload] = await Promise.all([
      fetchJson<LegacyStatusPayload>(resolvePipelineUrl(`/jobs/${jobId}/status`)),
      fetchJson<{ job_id: string; events: LegacyEventPayload[] }>(resolvePipelineUrl(`/jobs/${jobId}/events`)),
      fetchJson<{ job_id: string; artifacts: LegacyArtifactPayload[] }>(resolvePipelineUrl(`/jobs/${jobId}/artifacts`)),
      fetchJson<{ job_id: string; stdout: string }>(resolvePipelineUrl(`/jobs/${jobId}/stdout`)),
      fetchJson<{ job_id: string; stderr: string }>(resolvePipelineUrl(`/jobs/${jobId}/stderr`)),
    ]);

    const mappedStatus = mapJobStatus(statusPayload.state);
    const shouldMirrorArtifacts = mappedStatus === "completed";

    await updateAnalysisJob(jobId, {
      status: mappedStatus,
      progress: typeof statusPayload.progress === "number" ? statusPayload.progress : job.progress,
      stage: statusPayload.stage || job.stage,
      message: statusPayload.message || job.message,
      sourceArchiveUrl: job.sourceArchiveUrl,
      resultPath: job.resultPath,
      errorMessage: mappedStatus === "failed" ? statusPayload.message || job.errorMessage : null,
      stdoutTail: (stdoutPayload.stdout || "").slice(-MAX_LOG_TAIL_LENGTH),
      stderrTail: (stderrPayload.stderr || "").slice(-MAX_LOG_TAIL_LENGTH),
      completedAt: mappedStatus === "completed" || mappedStatus === "failed" || mappedStatus === "cancelled"
        ? (job.completedAt ?? new Date())
        : null,
    });

    await synchronizeEvents(jobId, eventsPayload.events || []);
    await synchronizeArtifacts(jobId, artifactsPayload.artifacts || [], shouldMirrorArtifacts);

    if (mappedStatus === "completed") {
      stopJobPolling(jobId);
      if (job.status !== "completed") {
        await finalizeSuccessfulJob(jobId);
      }
    }

    if (mappedStatus === "failed" || mappedStatus === "cancelled") {
      stopJobPolling(jobId);
    }

    return getAnalysisJobDetail(jobId);
  })();

  runningSyncs.set(jobId, syncPromise);

  try {
    return await syncPromise;
  } finally {
    runningSyncs.delete(jobId);
  }
}

export async function syncActiveAnalysisJobs() {
  const jobs = await listAnalysisJobs({ limit: 100 });
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");
  for (const job of activeJobs) {
    startJobPolling(job.jobId);
    await syncAnalysisJob(job.jobId).catch((error) => {
      console.warn(`[Analysis] Falha ao sincronizar job ativo ${job.jobId}:`, error);
    });
  }
  return activeJobs.length;
}

export async function loadCorrelationGraph(jobId: string): Promise<CorrelationGraph | null> {
  const artifacts = await listAnalysisArtifacts(jobId);
  const jsonArtifact = artifacts.find((artifact) => artifact.relativePath.toLowerCase().endsWith(".json"));
  if (!jsonArtifact?.sourcePath) return null;

  try {
    const raw = await fs.readFile(jsonArtifact.sourcePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return {
        nodes: parsed.nodes as CorrelationGraph["nodes"],
        edges: parsed.edges as CorrelationGraph["edges"],
        summary: typeof parsed.summary === "object" && parsed.summary ? parsed.summary as Record<string, unknown> : undefined,
      };
    }

    const flow = Array.isArray(parsed.flow) ? parsed.flow as Array<Record<string, unknown>> : [];
    if (flow.length > 0) {
      const nodes = new Map<string, { id: string; label: string; kind: string; metadata?: Record<string, unknown> }>();
      const edges: CorrelationGraph["edges"] = [];

      for (const item of flow) {
        const source = String(item.source || item.from || item.parent || "unknown_source");
        const target = String(item.target || item.to || item.child || "unknown_target");
        const relation = String(item.relation || item.edge || "correlates_with");

        if (!nodes.has(source)) {
          nodes.set(source, { id: source, label: source, kind: "function" });
        }
        if (!nodes.has(target)) {
          nodes.set(target, { id: target, label: target, kind: "function" });
        }

        edges.push({
          source,
          target,
          relation,
          weight: typeof item.weight === "number" ? item.weight : null,
          evidence: typeof item.evidence === "string" ? item.evidence : null,
          metadata: item,
        });
      }

      return {
        nodes: Array.from(nodes.values()),
        edges,
        summary: parsed,
      };
    }

    return {
      nodes: [],
      edges: [],
      summary: parsed,
    };
  } catch (error) {
    console.warn("[Analysis] Não foi possível carregar o grafo de correlação:", error);
    return null;
  }
}

export async function getAnalysisJobDetail(jobId: string) {
  const [job, events, artifacts, insight, commit, graph] = await Promise.all([
    getAnalysisJobByJobId(jobId),
    listAnalysisEvents(jobId, 1000),
    listAnalysisArtifacts(jobId),
    getAnalysisInsight(jobId),
    getAnalysisCommit(jobId),
    loadCorrelationGraph(jobId),
  ]);

  return {
    job,
    events: [...events].reverse(),
    artifacts,
    insight,
    commit,
    graph,
  };
}
