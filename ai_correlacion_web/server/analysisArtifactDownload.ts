import type { Express, Request, Response } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { resolveLocalArtifactPath } from "./artifactLocalStore";
import { getSessionUserFromRequest } from "./_core/context";
import { listAnalysisArtifacts } from "./db";

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
}
