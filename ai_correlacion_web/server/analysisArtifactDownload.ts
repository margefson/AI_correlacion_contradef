import type { Express, Request, Response } from "express";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import { LOG_HEURISTIC_STAGE_ORDER, MUST_CHANGE_PASSWORD_ERR_MSG } from "../shared/const";
import { resolveLocalArtifactPath } from "./artifactLocalStore";
import { getSessionUserFromRequest } from "./_core/context";
import type { User } from "../drizzle/schema";
import { getAnalysisInsight, getAnalysisJobByJobId, listAnalysisArtifacts } from "./db";

const REDUCED_LOGS_RELATIVE_PATH = "reports/reduced-logs.json";
const PRESERVATION_REPORT_SAMPLE_LINES = 45;
const PRESERVATION_MAX_LINE_CHARS = 240;

function formatBytesForReport(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "0 B";
  }
  if (n < 1024) {
    return `${Math.round(n)} B`;
  }
  const u = ["KB", "MB", "GB", "TB"] as const;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]!}`;
}

function readStageMap(row: Record<string, unknown> | undefined, key: string): Record<string, number> | null {
  if (!row) {
    return null;
  }
  const raw = row[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildStageSection(
  fileRow: Record<string, unknown> | undefined,
  originalLineCount: number,
  reducedLineCount: number,
): string[] {
  const orig = fileRow ? readStageMap(fileRow, "originalLinesByStage") : null;
  const kept = fileRow ? readStageMap(fileRow, "keptLinesByStage") : null;
  if (!orig || !kept) {
    return [
      "Contagem de linhas por fase (heurística) — indisponível",
      "-----------------------------------------------------------------",
      "Análise anterior a esta métrica: volte a concluir o lote (ou reprocessar) para obter a tabela de",
      "descartes por fase, gerada a partir do mesmo motor que classifica cada linha (Inicialização, Evasão, …).",
      "",
    ];
  }

  const stageOrder = LOG_HEURISTIC_STAGE_ORDER as readonly string[];
  const allNames = new Set([...Object.keys(orig), ...Object.keys(kept)]);
  const ordered: string[] = [];
  for (const s of stageOrder) {
    if (allNames.has(s)) {
      ordered.push(s);
      allNames.delete(s);
    }
  }
  for (const s of Array.from(allNames).sort((a, b) => a.localeCompare(b, "pt"))) {
    ordered.push(s);
  }

  const out: string[] = [
    "Linhas lidas e linhas mantidas, por fase (heurística no log original)",
    "-----------------------------------------------------------------",
    "Para cada fase: [lidas] = linhas do ficheiro classificadas nessa coluna; [mantidas] = dessas, as que",
    "entram no log reduzido; [descartadas] e a % referem-se apenas às linhas dessa fase (não ao ficheiro inteiro).",
    "",
  ];
  for (const st of ordered) {
    const o = orig[st] ?? 0;
    const k = kept[st] ?? 0;
    const d = Math.max(0, o - k);
    const pctLidas = o > 0 ? (100 * d) / o : 0;
    out.push(
      `  [${st}]  lidas: ${o.toLocaleString("pt-PT")}  |  mantidas: ${k.toLocaleString("pt-PT")}  |  descartadas: ${d.toLocaleString("pt-PT")}  (${pctLidas.toFixed(1)} % do que foi lido nesta fase)`,
    );
  }
  out.push("");

  const sumOrig = Object.values(orig).reduce((a, b) => a + b, 0);
  const sumKept = Object.values(kept).reduce((a, b) => a + b, 0);
  if (originalLineCount > 0 && Math.abs(sumOrig - originalLineCount) > 0) {
    out.push(
      `  (Reconciliação: soma de linhas por fase = ${sumOrig.toLocaleString("pt-PT")}; contagem global = ${originalLineCount.toLocaleString("pt-PT")})`,
      "",
    );
  }
  if (reducedLineCount > 0 && Math.abs(sumKept - reducedLineCount) > 0) {
    out.push(
      `  (Reconciliação: soma de «mantidas» por fase = ${sumKept.toLocaleString("pt-PT")}; linhas no reduzido = ${reducedLineCount.toLocaleString("pt-PT")})`,
      "",
    );
  }

  return out;
}

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
    if (user.mustChangePassword) {
      res.status(403).send(MUST_CHANGE_PASSWORD_ERR_MSG);
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
    if (user.mustChangePassword) {
      res.status(403).send(MUST_CHANGE_PASSWORD_ERR_MSG);
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

  /**
   * Texto de apoio: por que o ficheiro encolheu, métricas e amostra das linhas mantidas (download .txt).
   * Complementa o ficheiro `…reduced.txt` (conteúdo completo do log reduzido).
   */
  app.get("/api/analysis-artifacts/preservation-report", async (req: Request, res: Response) => {
    const user = await getSessionUserFromRequest(req);
    if (!user) {
      res.status(401).send("Authentication required");
      return;
    }
    if (user.mustChangePassword) {
      res.status(403).send(MUST_CHANGE_PASSWORD_ERR_MSG);
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

    const insight = await getAnalysisInsight(jobId);
    const summary = insight?.summaryJson && typeof insight.summaryJson === "object" && !Array.isArray(insight.summaryJson)
      ? (insight.summaryJson as Record<string, unknown>)
      : null;

    let oLines = 0;
    let oBytes = 0;
    let rLines = 0;
    let rBytes = 0;
    let sEvt = 0;
    let tCnt = 0;
    let fileMetricsRow: Record<string, unknown> | undefined;
    if (summary) {
      const fm = summary.fileMetrics;
      if (Array.isArray(fm)) {
        const row = fm.find(
          (x) => x && typeof x === "object" && (x as Record<string, unknown>).fileName === fileName,
        ) as Record<string, unknown> | undefined;
        if (row) {
          fileMetricsRow = row;
          oLines = typeof row.originalLineCount === "number" ? row.originalLineCount : 0;
          rLines = typeof row.reducedLineCount === "number" ? row.reducedLineCount : 0;
          oBytes = typeof row.originalBytes === "number" ? row.originalBytes : 0;
          rBytes = typeof row.reducedBytes === "number" ? row.reducedBytes : 0;
          sEvt = typeof row.suspiciousEventCount === "number" ? row.suspiciousEventCount : 0;
          tCnt = typeof row.triggerCount === "number" ? row.triggerCount : 0;
        }
      }
    }

    const keptBytes = entry.keptLines.reduce(
      (acc, ln) => acc + Buffer.byteLength(typeof ln.text === "string" ? ln.text : "", "utf8"),
      0,
    );
    const keptN = entry.keptLines.length;
    const linesKept = Math.min(PRESERVATION_REPORT_SAMPLE_LINES, entry.keptLines.length);
    const sample = entry.keptLines.slice(0, linesKept);
    const lines: string[] = [
      "Contradef — relatório de preservação (resumo)",
      "===========================================",
      "",
      `Lote (jobId): ${jobId}`,
      `Ficheiro: ${fileName}`,
      `Amostra: primeiras ${linesKept} de ${keptN} linhas mantidas no ficheiro reduzido`,
      "",
      "Como a redução funciona (resumido)",
      "----------------------------------",
      "O motor percorre o log de origem e mantém linhas com gatilhos, APIs sensíveis ou sinais heurísticos,",
      "e remove ou não conserva o restante conforme regras de ruído. Por isso o tamanho em bytes pode cair",
      "de forma muito acentuada (ex.: GB → MB) quando a maior parte do ficheiro era tráfego rotineiro,",
      "repetitivo ou sem correspondência de interesse, desde que a linha em causa não fosse necessária",
      "para a cadeia de contexto (vizinhança) em torno de um evento assinalado.",
      "",
      "Métricas associadas a este ficheiro (lote concluído)",
      "--------------------------------------------------",
      `  Linhas (origem / depois, no resumo do job): ${oLines} → ${rLines}`,
      `  Tamanho (origem / depois, no resumo do job): ${formatBytesForReport(oBytes)} → ${formatBytesForReport(rBytes)}`,
      `  Sinais: ${sEvt} eventos assinalados, ${tCnt} gatilho(s) de relevo`,
      `  Soma UTF-8 dos textos das ${keptN} linhas no artefato (excl. newlines de junção): ≈${formatBytesForReport(keptBytes)}`,
      "",
    ];

    if (summary) {
      const m = summary.metrics;
      if (m && typeof m === "object" && !Array.isArray(m)) {
        const glob = m as Record<string, unknown>;
        const ol = typeof glob.originalLineCount === "number" ? glob.originalLineCount : 0;
        const rl = typeof glob.reducedLineCount === "number" ? glob.reducedLineCount : 0;
        if (ol > 0 || rl > 0) {
          const rp = typeof glob.reductionPercent === "number" ? glob.reductionPercent : 0;
          lines.push(
            "Métricas do lote (agregado no resumo, todos os ficheiros)",
            "--------------------------------------------------",
            `  Linhas (lote, antes → depois): ${ol} → ${rl}  |  % de linhas removida (global, agregada): ≈${rp.toFixed(1)} %`,
            "",
          );
        }
      }
    }

    lines.push(
      ...buildStageSection(fileMetricsRow, oLines, rLines),
    );

    if (summary) {
      const fg = summary.flowGraph;
      if (fg && typeof fg === "object" && !Array.isArray(fg) && "summary" in fg) {
        const sum = (fg as { summary?: { totalSuspiciousEvents?: number; pathLength?: number; phases?: string[] } })
          .summary;
        if (sum && (typeof sum.totalSuspiciousEvents === "number" || Array.isArray(sum.phases))) {
          const gLines: string[] = [
            "Grafo de correlação (resumo — não tamanho de ficheiro)",
            "-------------------------------------------",
            "  Isto descreve a jornada analítica agregada; a redução concreta de linhas está na tabela por fase acima.",
          ];
          if (typeof sum.totalSuspiciousEvents === "number") {
            gLines.push(
              `  Eventos (linhas) no conjunto alimentado ao grafo (corte interno de exportação): ${sum.totalSuspiciousEvents}.`,
            );
          }
          if (Array.isArray(sum.phases) && sum.phases.length) {
            gLines.push(`  Fases com nós: ${(sum.phases as string[]).join(" → ")}.`);
          }
          gLines.push("");
          lines.push(...gLines);
        }
      }
    }

    lines.push(
      "A coluna “Depois / Reduzido” no painel de acompanhamento reflete o volume do texto agregado que",
      "sobrou após a filtragem, não a cópia integral do ficheiro bruto (que pode ser maiormente tráfego).",
      "",
      "Amostra das linhas mantidas (nº de linha = posição aprox. no ficheiro original, quando conhecida)",
      "-----------------------------------------------------------------",
    );

    for (const k of sample) {
      if (!k || typeof k !== "object") {
        continue;
      }
      const n = typeof k.lineNumber === "number" ? k.lineNumber : 0;
      let t = typeof k.text === "string" ? k.text : "";
      if (t.length > PRESERVATION_MAX_LINE_CHARS) {
        t = `${t.slice(0, PRESERVATION_MAX_LINE_CHARS)} […]`;
      }
      lines.push(`L${n}: ${t}`);
    }

    lines.push(
      "",
      "Para a versão completa do log reduzido, use a descarga “log reduzido” (.reduced.txt) do mesmo ficheiro.",
      "",
    );

    const body = lines.join("\n");
    const safe = basename(fileName).replace(/[^\w.\-]+/g, "_") || "log";
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.preservacao.txt"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  });
}
