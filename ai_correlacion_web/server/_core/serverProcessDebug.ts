import { access, statfs } from "node:fs/promises";
import os, { freemem, loadavg, tmpdir, totalmem } from "node:os";
import { join } from "node:path";

import type { ServerProcessDebugSnapshot } from "../../shared/analysis";

/** Alinhado a `WORK_TMP_ROOT` em `analysisService` (extração / redução). */
const WORK_TMP_ROOT = process.env.CONTRADEF_WORK_TMP?.trim()
  ? process.env.CONTRADEF_WORK_TMP.trim()
  : process.platform === "win32"
    ? join("E:\\", "contradef-tmp", "analysis")
    : join(tmpdir(), "contradef-tmp", "analysis");

function mb(n: number) {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

async function firstExistingPath(candidates: string[]) {
  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return tmpdir();
}

/**
 * Lido no pedido tRPC `analysis.detail` quando o cliente envia `X-Contradef-Client-Debug: 1` e
 * `CONTRADEF_SERVER_DEBUG=1` no processo. Ajuda a diagnosticar OOM, disco cheio, etc. em produção.
 */
export async function getServerProcessDebugSnapshot(): Promise<ServerProcessDebugSnapshot> {
  const mem = process.memoryUsage();
  const workPath = await firstExistingPath([
    WORK_TMP_ROOT,
    join(tmpdir(), "contradef-tmp", "analysis"),
    tmpdir(),
  ]);
  const la = loadavg();
  const snap: ServerProcessDebugSnapshot = {
    capturedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: {
        rss: mb(mem.rss),
        heapUsed: mb(mem.heapUsed),
        heapTotal: mb(mem.heapTotal),
        external: mb(mem.external),
      },
    },
    os: {
      freememMb: Math.round(freemem() / 1024 / 1024),
      totalmemMb: Math.round(totalmem() / 1024 / 1024),
      loadavg: [la[0] ?? 0, la[1] ?? 0, la[2] ?? 0] as [number, number, number],
    },
    workDir: { path: workPath },
  };

  try {
    const s = await statfs(workPath);
    const bsize = BigInt(s.bsize);
    const bavail = BigInt(s.bavail);
    const freeBytes = Number(bavail * bsize);
    snap.workDir.freeSpaceGb = Math.round((freeBytes / 1024 ** 3) * 100) / 100;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    snap.workDir.error = message;
  }

  snap.os.cpuCount = os.cpus().length;

  return snap;
}
