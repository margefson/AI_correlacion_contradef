import type { Express, Request, Response } from "express";
import multer from "multer";
import { getAnalysisJobDetail, startAnalysisJobFromArchive } from "./analysisService";
import { listAnalysisJobs } from "./db";
import { sdk } from "./_core/sdk";

export const MULTIPART_TRANSPORT_MAX_BYTES = 30 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MULTIPART_TRANSPORT_MAX_BYTES,
    files: 1,
  },
});

function parseListField(value: unknown): string[] {
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

function respondJsonError(res: Response, status: number, message: string, code: string, details?: unknown) {
  return res.status(status).json({
    message,
    code,
    details: details ?? null,
  });
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
  if (normalized.includes("não autenticada") || normalized.includes("não autenticado") || normalized.includes("sessão") || normalized.includes("login")) return 401;
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
        res.write(`event: snapshot\n`);
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      } catch (error) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: extractMessage(error) })}\n\n`);
      }
    };

    const heartbeat = setInterval(() => {
      if (closed) return;
      res.write(`event: heartbeat\n`);
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
  app.post("/api/analysis/upload", (req, res) => {
    upload.single("archive")(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return respondJsonError(
            res,
            413,
            `O arquivo excede o limite operacional de ${Math.round(MULTIPART_TRANSPORT_MAX_BYTES / (1024 * 1024))} MB aceito pelo domínio publicado.`,
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
