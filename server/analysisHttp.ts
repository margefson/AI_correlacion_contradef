import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import multer from "multer";
import {
  CHUNK_UPLOAD_HARD_MAX_BYTES,
  CHUNK_UPLOAD_SAFE_MAX_BYTES,
  GATEWAY_SINGLE_REQUEST_MAX_BYTES as DIRECT_MULTIPART_TRANSPORT_MAX_BYTES,
  OPERATIONAL_ARCHIVE_MAX_BYTES,
} from "../shared/analysis";
import { getAnalysisJobDetail, startAnalysisJobFromArchive } from "./analysisService";
import { listAnalysisJobs } from "./db";
import { sdk } from "./_core/sdk";

export const CHUNK_UPLOAD_MAX_BYTES = CHUNK_UPLOAD_SAFE_MAX_BYTES;

const UPLOAD_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const UPLOAD_SESSION_ROOT = path.join(os.tmpdir(), "ai-correlacion-upload-sessions");

const directUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DIRECT_MULTIPART_TRANSPORT_MAX_BYTES,
    files: 1,
  },
});

const chunkUploadRaw = express.raw({
  type: "application/octet-stream",
  limit: CHUNK_UPLOAD_HARD_MAX_BYTES,
});

type UploadCompletionStatus = "open" | "finalizing" | "completed" | "failed";

type UploadSessionMeta = {
  uploadId: string;
  archiveName: string;
  totalBytes: number;
  totalChunks: number;
  focusFunction: string;
  focusTerms: string[];
  focusRegexes: string[];
  origin?: string;
  createdByUserId: number;
  createdAt: number;
  updatedAt: number;
  receivedChunkIndexes: number[];
  completionStatus: UploadCompletionStatus;
  finalizedJobId?: string;
  completionError?: string | null;
};

const runningUploadFinalizations = new Map<string, Promise<void>>();

function buildUploadSessionResponse(meta: UploadSessionMeta) {
  return {
    uploadId: meta.uploadId,
    archiveName: meta.archiveName,
    totalBytes: meta.totalBytes,
    chunkSize: CHUNK_UPLOAD_SAFE_MAX_BYTES,
    totalChunks: meta.totalChunks,
    maxArchiveBytes: OPERATIONAL_ARCHIVE_MAX_BYTES,
    directTransportMaxBytes: DIRECT_MULTIPART_TRANSPORT_MAX_BYTES,
    focusFunction: meta.focusFunction,
    receivedChunkIndexes: meta.receivedChunkIndexes,
    updatedAt: meta.updatedAt,
    completionStatus: meta.completionStatus,
    finalizedJobId: meta.finalizedJobId ?? null,
    completionError: meta.completionError ?? null,
  };
}

function parseListField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Aceita fallback em CSV simples para compatibilidade.
  }

  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseNumericField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function respondJsonError(res: Response, status: number, message: string, code: string, details?: unknown) {
  return res.status(status).json({
    message,
    code,
    details: details ?? null,
  });
}

function parseChunkIndex(req: Request) {
  return parseNumericField(req.header("x-chunk-index") ?? req.query?.chunkIndex);
}

async function resolveAuthenticatedUser(req: Request, res: Response) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    respondJsonError(
      res,
      401,
      "Sua sessão expirou ou não está autenticada. Faça login novamente antes de enviar o arquivo.",
      "UNAUTHORIZED",
    );
    return null;
  }
}

function extractMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Ocorreu uma falha inesperada ao iniciar a análise.";
}

function mapErrorStatus(message: string): number {
  const normalized = message.toLowerCase();

  if (normalized.includes("limite")) return 413;
  if (
    normalized.includes("não autenticada") ||
    normalized.includes("não autenticado") ||
    normalized.includes("sessão") ||
    normalized.includes("login")
  ) {
    return 401;
  }
  if (
    normalized.includes("arquivo") ||
    normalized.includes("base64") ||
    normalized.includes("função") ||
    normalized.includes("envie um arquivo") ||
    normalized.includes("vazio")
  ) {
    return 400;
  }

  return 500;
}

function chunkFilename(index: number) {
  return `${index.toString().padStart(4, "0")}.part`;
}

function sessionDirectory(uploadId: string) {
  return path.join(UPLOAD_SESSION_ROOT, uploadId);
}

function sessionMetaPath(uploadId: string) {
  return path.join(sessionDirectory(uploadId), "session.json");
}

function sessionChunkDirectory(uploadId: string) {
  return path.join(sessionDirectory(uploadId), "chunks");
}

async function ensureUploadSessionRoot() {
  await fs.mkdir(UPLOAD_SESSION_ROOT, { recursive: true });
}

async function removeUploadSession(uploadId: string) {
  await fs.rm(sessionDirectory(uploadId), { recursive: true, force: true });
}

async function writeUploadSession(meta: UploadSessionMeta) {
  await ensureUploadSessionRoot();
  await fs.mkdir(sessionChunkDirectory(meta.uploadId), { recursive: true });
  await fs.writeFile(sessionMetaPath(meta.uploadId), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
}

async function readUploadSession(uploadId: string) {
  const raw = await fs.readFile(sessionMetaPath(uploadId), "utf-8");
  return JSON.parse(raw) as UploadSessionMeta;
}

async function cleanupExpiredUploadSessions() {
  await ensureUploadSessionRoot();
  const entries = await fs.readdir(UPLOAD_SESSION_ROOT, { withFileTypes: true }).catch(() => []);
  const now = Date.now();

  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const uploadId = entry.name;
    try {
      const meta = await readUploadSession(uploadId);
      if (now - meta.updatedAt > UPLOAD_SESSION_TTL_MS) {
        await removeUploadSession(uploadId);
      }
    } catch {
      await removeUploadSession(uploadId);
    }
  }));
}

function normalizeReceivedChunkIndexes(indexes: number[], totalChunks: number) {
  return Array.from(new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0 && index < totalChunks))).sort((a, b) => a - b);
}

async function finalizeUploadSession(uploadId: string, userId: number) {
  const running = runningUploadFinalizations.get(uploadId);
  if (running) return running;

  const finalizePromise = (async () => {
    let meta = await readUploadSession(uploadId);
    if (meta.createdByUserId !== userId) {
      throw new Error("Esta sessão de upload pertence a outro usuário autenticado.");
    }

    const missingChunkIndexes = Array.from({ length: meta.totalChunks }, (_, index) => index).filter(
      (index) => !meta.receivedChunkIndexes.includes(index),
    );

    if (missingChunkIndexes.length > 0) {
      meta.updatedAt = Date.now();
      meta.completionStatus = "failed";
      meta.completionError = "Ainda existem partes pendentes neste upload em lote. Reenvie as partes faltantes antes de concluir.";
      await writeUploadSession(meta);
      return;
    }

    try {
      const buffers: Buffer[] = [];
      let totalBufferBytes = 0;

      for (let index = 0; index < meta.totalChunks; index += 1) {
        const chunkBuffer = await fs.readFile(path.join(sessionChunkDirectory(uploadId), chunkFilename(index)));
        buffers.push(chunkBuffer);
        totalBufferBytes += chunkBuffer.length;
      }

      if (totalBufferBytes !== meta.totalBytes) {
        meta.updatedAt = Date.now();
        meta.completionStatus = "failed";
        meta.completionError = "O arquivo remontado não corresponde ao tamanho original informado na sessão.";
        await writeUploadSession(meta);
        return;
      }

      const createdJob = await startAnalysisJobFromArchive({
        archiveName: meta.archiveName,
        archiveBuffer: Buffer.concat(buffers, totalBufferBytes),
        focusFunction: meta.focusFunction,
        focusTerms: meta.focusTerms,
        focusRegexes: meta.focusRegexes,
        origin: meta.origin,
        createdByUserId: userId,
      });

      meta = await readUploadSession(uploadId).catch(() => meta);
      meta.updatedAt = Date.now();
      meta.completionStatus = "completed";
      meta.finalizedJobId = typeof createdJob?.jobId === "string" ? createdJob.jobId : uploadId;
      meta.completionError = null;
      await writeUploadSession(meta);
      await fs.rm(sessionChunkDirectory(uploadId), { recursive: true, force: true });
    } catch (caught) {
      meta = await readUploadSession(uploadId).catch(() => meta);
      meta.updatedAt = Date.now();
      meta.completionStatus = "failed";
      meta.completionError = extractMessage(caught);
      await writeUploadSession(meta);
    }
  })().finally(() => {
    runningUploadFinalizations.delete(uploadId);
  });

  runningUploadFinalizations.set(uploadId, finalizePromise);
  return finalizePromise;
}

async function buildStreamSnapshot(selectedJobId?: string) {
  const jobs = await listAnalysisJobs({ limit: 50 });
  const detail = selectedJobId ? await getAnalysisJobDetail(selectedJobId).catch(() => null) : null;

  return {
    emittedAt: Date.now(),
    jobs,
    detail,
  };
}

export function registerAnalysisHttpRoutes(app: Express) {
  app.get("/api/analysis/stream", async (req, res) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) return;

    const selectedJobId = typeof req.query.jobId === "string" ? req.query.jobId.trim() : "";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let closed = false;

    const sendEvent = async () => {
      if (closed) return;

      try {
        const snapshot = await buildStreamSnapshot(selectedJobId || undefined);
        res.write("event: snapshot\n");
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      } catch (error) {
        res.write("event: error\n");
        res.write(`data: ${JSON.stringify({ message: extractMessage(error) })}\n\n`);
      }
    };

    const heartbeat = setInterval(() => {
      if (closed) return;
      res.write("event: heartbeat\n");
      res.write(`data: ${JSON.stringify({ emittedAt: Date.now() })}\n\n`);
    }, 15000);

    const streamInterval = setInterval(() => {
      void sendEvent();
    }, 3000);

    void sendEvent();

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      clearInterval(streamInterval);
      res.end();
    });
  });

  app.get("/api/analysis/upload-sessions/:uploadId", async (req, res) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) return;

    await cleanupExpiredUploadSessions();

    const uploadId = typeof req.params.uploadId === "string" ? req.params.uploadId.trim() : "";
    if (!uploadId) {
      return respondJsonError(res, 400, "Identificador de sessão de upload ausente.", "MISSING_UPLOAD_ID");
    }

    let meta: UploadSessionMeta;
    try {
      meta = await readUploadSession(uploadId);
    } catch {
      return respondJsonError(res, 404, "A sessão de upload informada não foi encontrada ou expirou.", "UPLOAD_SESSION_NOT_FOUND");
    }

    if (meta.createdByUserId !== user.id) {
      return respondJsonError(res, 403, "Esta sessão de upload pertence a outro usuário autenticado.", "UPLOAD_SESSION_FORBIDDEN");
    }

    return res.status(200).json(buildUploadSessionResponse(meta));
  });

  app.post("/api/analysis/upload-sessions", async (req, res) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) return;

    await cleanupExpiredUploadSessions();

    const archiveName = typeof req.body?.archiveName === "string" ? req.body.archiveName.trim() : "";
    const totalBytes = parseNumericField(req.body?.totalBytes);
    const focusFunction = typeof req.body?.focusFunction === "string" ? req.body.focusFunction.trim() : "";
    const focusTerms = parseListField(req.body?.focusTerms);
    const focusRegexes = parseListField(req.body?.focusRegexes);
    const origin = typeof req.body?.origin === "string" && req.body.origin.trim() ? req.body.origin.trim() : undefined;

    if (!archiveName.toLowerCase().endsWith(".7z")) {
      return respondJsonError(res, 400, "Envie um arquivo .7z válido para iniciar a análise.", "INVALID_ARCHIVE_NAME");
    }
    if (!totalBytes || totalBytes <= 0) {
      return respondJsonError(res, 400, "O tamanho total do arquivo não foi informado corretamente.", "INVALID_ARCHIVE_SIZE");
    }
    if (totalBytes > OPERATIONAL_ARCHIVE_MAX_BYTES) {
      return respondJsonError(
        res,
        413,
        `O arquivo excede o limite operacional de ${Math.round(OPERATIONAL_ARCHIVE_MAX_BYTES / (1024 * 1024))} MB suportado pela aplicação atual.`,
        "FILE_TOO_LARGE",
      );
    }
    if (!focusFunction) {
      return respondJsonError(
        res,
        400,
        "Informe a função de interesse antes de enviar o pacote para análise.",
        "MISSING_FOCUS_FUNCTION",
      );
    }

    const uploadId = randomUUID();
    const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_UPLOAD_SAFE_MAX_BYTES));
    const meta: UploadSessionMeta = {
      uploadId,
      archiveName,
      totalBytes,
      totalChunks,
      focusFunction,
      focusTerms,
      focusRegexes,
      origin,
      createdByUserId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      receivedChunkIndexes: [],
      completionStatus: "open",
      finalizedJobId: undefined,
      completionError: null,
    };

    await writeUploadSession(meta);

    return res.status(200).json(buildUploadSessionResponse(meta));
  });

  app.post("/api/analysis/upload-sessions/:uploadId/chunks", (req, res) => {
    chunkUploadRaw(req, res, async (error) => {
      if (error) {
        const message = extractMessage(error);
        const isTooLarge = /too large|entity too large|request entity too large|payload too large|limit/i.test(message);
        return respondJsonError(
          res,
          isTooLarge ? 413 : 400,
          isTooLarge
            ? `Cada parte do upload em lote deve permanecer abaixo de ${Math.round(CHUNK_UPLOAD_HARD_MAX_BYTES / (1024 * 1024))} MB.`
            : "Não foi possível processar a parte bruta enviada pelo navegador.",
          isTooLarge ? "CHUNK_TOO_LARGE" : "CHUNK_PARSE_ERROR",
          message,
        );
      }

      const user = await resolveAuthenticatedUser(req, res);
      if (!user) return;

      const uploadId = typeof req.params.uploadId === "string" ? req.params.uploadId.trim() : "";
      if (!uploadId) {
        return respondJsonError(res, 400, "Identificador de sessão de upload ausente.", "MISSING_UPLOAD_ID");
      }

      let meta: UploadSessionMeta;
      try {
        meta = await readUploadSession(uploadId);
      } catch {
        return respondJsonError(res, 404, "A sessão de upload informada não foi encontrada ou expirou.", "UPLOAD_SESSION_NOT_FOUND");
      }

      if (meta.createdByUserId !== user.id) {
        return respondJsonError(res, 403, "Esta sessão de upload pertence a outro usuário autenticado.", "UPLOAD_SESSION_FORBIDDEN");
      }

      const chunkIndex = parseChunkIndex(req);
      if (chunkIndex === null || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
        return respondJsonError(res, 400, "O índice da parte enviada é inválido para esta sessão.", "INVALID_CHUNK_INDEX");
      }

      const chunkBuffer = Buffer.isBuffer(req.body) ? req.body : null;
      if (!chunkBuffer?.length) {
        return respondJsonError(res, 400, "Nenhuma parte do arquivo foi recebida nesta requisição.", "MISSING_CHUNK_FILE");
      }

      const chunkPath = path.join(sessionChunkDirectory(uploadId), chunkFilename(chunkIndex));
      await fs.mkdir(sessionChunkDirectory(uploadId), { recursive: true });
      await fs.writeFile(chunkPath, chunkBuffer);

      meta.updatedAt = Date.now();
      meta.receivedChunkIndexes = normalizeReceivedChunkIndexes([...meta.receivedChunkIndexes, chunkIndex], meta.totalChunks);
      if (meta.completionStatus !== "completed") {
        meta.completionStatus = "open";
        meta.completionError = null;
        meta.finalizedJobId = undefined;
      }
      await writeUploadSession(meta);

      return res.status(200).json({
        uploadId,
        receivedChunks: meta.receivedChunkIndexes.length,
        totalChunks: meta.totalChunks,
      });
    });
  });

  app.post("/api/analysis/upload-sessions/:uploadId/complete", async (req, res) => {
    const user = await resolveAuthenticatedUser(req, res);
    if (!user) return;

    const uploadId = typeof req.params.uploadId === "string" ? req.params.uploadId.trim() : "";
    if (!uploadId) {
      return respondJsonError(res, 400, "Identificador de sessão de upload ausente.", "MISSING_UPLOAD_ID");
    }

    let meta: UploadSessionMeta;
    try {
      meta = await readUploadSession(uploadId);
    } catch {
      return respondJsonError(res, 404, "A sessão de upload informada não foi encontrada ou expirou.", "UPLOAD_SESSION_NOT_FOUND");
    }

    if (meta.createdByUserId !== user.id) {
      return respondJsonError(res, 403, "Esta sessão de upload pertence a outro usuário autenticado.", "UPLOAD_SESSION_FORBIDDEN");
    }

    if (meta.completionStatus === "completed" && meta.finalizedJobId) {
      return res.status(200).json({ jobId: meta.finalizedJobId });
    }

    const missingChunkIndexes = Array.from({ length: meta.totalChunks }, (_, index) => index).filter(
      (index) => !meta.receivedChunkIndexes.includes(index),
    );

    if (missingChunkIndexes.length > 0) {
      return respondJsonError(
        res,
        400,
        "Ainda existem partes pendentes neste upload em lote. Reenvie as partes faltantes antes de concluir.",
        "MISSING_CHUNKS",
        { missingChunkIndexes },
      );
    }

    if (meta.completionStatus !== "finalizing") {
      meta.updatedAt = Date.now();
      meta.completionStatus = "finalizing";
      meta.completionError = null;
      await writeUploadSession(meta);
      void finalizeUploadSession(uploadId, user.id);
    }

    return res.status(202).json(buildUploadSessionResponse(meta));
  });

  app.post("/api/analysis/upload", (req, res) => {
    directUpload.single("archive")(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return respondJsonError(
            res,
            413,
            `O arquivo excede o limite de transporte por requisição de ${Math.round(DIRECT_MULTIPART_TRANSPORT_MAX_BYTES / (1024 * 1024))} MB. Use o fluxo em partes do formulário para arquivos maiores.`,
            "FILE_TOO_LARGE",
          );
        }

        return respondJsonError(
          res,
          400,
          "Não foi possível processar o upload multipart enviado pelo navegador.",
          "UPLOAD_PARSE_ERROR",
          error.code,
        );
      }

      if (error) {
        return respondJsonError(
          res,
          400,
          "Falha ao processar o upload do arquivo selecionado.",
          "UPLOAD_ERROR",
          extractMessage(error),
        );
      }

      const user = await resolveAuthenticatedUser(req, res);
      if (!user) return;

      const archive = req.file;
      if (!archive) {
        return respondJsonError(
          res,
          400,
          "Selecione um arquivo .7z antes de iniciar a análise.",
          "MISSING_FILE",
        );
      }

      const focusFunction = typeof req.body.focusFunction === "string" ? req.body.focusFunction.trim() : "";
      if (!focusFunction) {
        return respondJsonError(
          res,
          400,
          "Informe a função de interesse antes de enviar o pacote para análise.",
          "MISSING_FOCUS_FUNCTION",
        );
      }

      try {
        const createdJob = await startAnalysisJobFromArchive({
          archiveName: archive.originalname || "amostra.7z",
          archiveBuffer: archive.buffer,
          focusFunction,
          focusTerms: parseListField(req.body.focusTerms),
          focusRegexes: parseListField(req.body.focusRegexes),
          origin: typeof req.body.origin === "string" ? req.body.origin : undefined,
          createdByUserId: user.id,
        });

        return res.status(200).json(createdJob);
      } catch (caught) {
        const message = extractMessage(caught);
        return respondJsonError(res, mapErrorStatus(message), message, "UPLOAD_SUBMISSION_FAILED");
      }
    });
  });
}
