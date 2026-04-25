import type { Express, Request, Response } from "express";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import { resolveLocalArtifactPath } from "./artifactLocalStore";
import { getSessionUserFromRequest } from "./_core/context";
import type { User } from "../drizzle/schema";
import { getAnalysisJobByJobId, listAnalysisArtifacts } from "./db";

const REDUCED_LOGS_RELATIVE_PATH = "reports/reduced-logs.json";

function isGlobalAnalysisScope(user: User) {
  return user.role === "admin";
}

function canAccessJob(user: User, job: { createdByUserId: number | null }): boolean {
  if (isGlobalAnalysisScope(user)) {
    return true;
  }
  return job.createdByUserId != null && job.createdByUserId === user.id;
}

export function registerAnalysisArtifactDownloadRoute(app: Express) {
  app.get("/api/analysis-artifacts/download", async (req: Request, res: Response) => {
    const user = await getSessionUserFromRequest(req);
    if (!user) {
      res.status(401).send("Authentication required");
      return;
    }

    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : "";
    const relativePath = typeof req.query.relativePath === "string" ? req.query.relativePath : "";
    if (!jobId || !relativePath) {
      res.status(400).send("Missing jobId or relativePath");
      return;
    }

    const job = await getAnalysisJobByJobId(jobId);
    if (!job) {
      res.status(404).send("Job not found");
      return;
    }
    if (!canAccessJob(user, job)) {
      res.status(403).send("Forbidden");
      return;
    }

    const artifacts = await listAnalysisArtifacts(jobId);
    const match = artifacts.find((a) => a.relativePath === relativePath);
    if (!match) {
      res.status(404).send("Artifact not found");
      return;
    }

    let diskPath: string;
    try {
      diskPath = resolveLocalArtifactPath(jobId, relativePath);
    } catch {
      res.status(400).send("Invalid artifact path");
      return;
    }

    try {
      const st = await stat(diskPath);
      const safeName = basename(relativePath).replace(/[^\w.\-]+/g, "_") || "artifact";
      res.status(200);
      res.setHeader("Content-Type", match.mimeType ?? "application/octet-stream");
      res.setHeader("Content-Length", String(st.size));
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("Cache-Control", "no-store");
      createReadStream(diskPath).pipe(res);
    } catch {
      res.status(404).send("Arquivo não encontrado no disco local do servidor");
    }
  });

  /**
   * Extrai o texto reduzido de um ficheiro a partir de `reports/reduced-logs.json` (cópia local do job).
   * Permite comparar com o log original, ficheiro a ficheiro.
   */
  app.get("/api/analysis-artifacts/reduced-log-by-file", async (req: Request, res: Response) => {
    const user = await getSessionUserFromRequest(req);
    if (!user) {
      res.status(401).send("Authentication required");
      return;
    }

    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : "";
    const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
    if (!jobId || !fileName) {
      res.status(400).send("Missing jobId or fileName");
      return;
    }

    const job = await getAnalysisJobByJobId(jobId);
    if (!job) {
      res.status(404).send("Job not found");
      return;
    }
    if (!canAccessJob(user, job)) {
      res.status(403).send("Forbidden");
      return;
    }

    let diskPath: string;
    try {
      diskPath = resolveLocalArtifactPath(jobId, REDUCED_LOGS_RELATIVE_PATH);
    } catch {
      res.status(400).send("Invalid path");
      return;
    }

    let raw: string;
    try {
      raw = await readFile(diskPath, "utf8");
    } catch {
      res
        .status(404)
        .send("Artefato de logs reduzidos indisponível no servidor (sem cópia local).");
      return;
    }

    type ReducedEntry = { fileName: string; keptLines: Array<{ lineNumber: number; text: string }> };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      res.status(500).send("Formato de artefato inválido");
      return;
    }
    if (!Array.isArray(parsed)) {
      res.status(500).send("Formato de artefato inválido");
      return;
    }

    const entry = (parsed as ReducedEntry[]).find((e) => e && typeof e === "object" && e.fileName === fileName);
    if (!entry || !Array.isArray(entry.keptLines)) {
      res
        .status(404)
        .send("Nenhum trecho reduzido registado para este arquivo neste lote (ou ainda em processamento).");
      return;
    }

    const text = entry.keptLines
      .map((line) => (line && typeof line.text === "string" ? line.text : ""))
      .join("\n");

    const safe = basename(fileName).replace(/[^\w.\-]+/g, "_") || "log";
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.reduced.txt"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(text);
  });
}
