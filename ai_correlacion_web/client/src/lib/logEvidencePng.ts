/** Trecho numerado para visualização/export PNG (linhas reduzidas com `lineNumber` original). */
export type KeptLogLine = { lineNumber: number; text: string };

const MAX_LINE_CHARS = 118;
const CONTEXT_LINES_AFTER = 22;

export function truncateLogLine(raw: string, maxChars = MAX_LINE_CHARS): string {
  const trimmed = raw.replace(/\r/g, "");
  const t = trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
  return t;
}

/**
 * Índice 0-based da linha em `keptLines` que melhor corresponde a `originalLineNumber`
 * (igual à lógica do recorte do trecho).
 */
function resolveKeptLineIndex(keptLines: KeptLogLine[], originalLineNumber: number): number {
  let idx = keptLines.findIndex((l) => l.lineNumber === originalLineNumber);
  if (idx < 0) {
    idx = keptLines.findIndex((l) => l.lineNumber >= originalLineNumber);
  }
  if (idx < 0) {
    idx = keptLines.reduce((best, cur, i) => {
      const d = Math.abs(cur.lineNumber - originalLineNumber);
      const bd = Math.abs(keptLines[best]!.lineNumber - originalLineNumber);
      return d < bd ? i : best;
    }, 0);
  }
  return idx;
}

/**
 * Linha **física** (1-based) no ficheiro `.reduced.txt` gerado por `keptLines.join("\\n")`,
 * para a evidência com número de linha no **original** `originalLineNumber`.
 */
export function physicalLineInReducedTxt(keptLines: KeptLogLine[], originalLineNumber: number): number | null {
  if (!keptLines.length) return null;
  const idx = resolveKeptLineIndex(keptLines, originalLineNumber);
  return idx + 1;
}

/**
 * Extrai uma janela em torno da linha de evidência para assemelhar ao recorte manual no editor.
 * `highlightPhysicalLine` / `physicalLineNumbers` = posição no `.reduced.txt` (1-based), alinhada ao download.
 */
export function sliceKeptLinesAroundAnchor(
  keptLines: KeptLogLine[],
  anchorLine: number,
): {
  lines: KeptLogLine[];
  highlightLine: number;
  highlightPhysicalLine: number;
  physicalLineNumbers: number[];
} {
  if (!keptLines.length) {
    return { lines: [], highlightLine: anchorLine, highlightPhysicalLine: 0, physicalLineNumbers: [] };
  }

  const idx = resolveKeptLineIndex(keptLines, anchorLine);
  const start = Math.max(0, idx - 1);
  const endExclusive = Math.min(keptLines.length, idx + CONTEXT_LINES_AFTER);
  const slice = keptLines.slice(start, endExclusive);
  const lines = slice.map((l) => ({
    lineNumber: l.lineNumber,
    text: l.text,
  }));
  const physicalLineNumbers = slice.map((_, i) => start + i + 1);
  const anchor = keptLines[idx]!;
  return {
    lines,
    highlightLine: anchor.lineNumber,
    highlightPhysicalLine: idx + 1,
    physicalLineNumbers,
  };
}

/** Trecho numerado do log **original** (artefato `source/…` no servidor). */
export async function fetchOriginalLogSnippetLines(
  jobId: string,
  fileName: string,
  anchorLine: number,
): Promise<{ lines: KeptLogLine[]; highlightLine: number }> {
  const qs = new URLSearchParams({
    jobId,
    fileName,
    anchorLine: String(anchorLine),
    beforeLines: "2",
    afterLines: String(CONTEXT_LINES_AFTER),
  });
  const url = `/api/analysis-artifacts/original-log-snippet?${qs.toString()}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t.trim() || `${res.status} ao carregar trecho do log original`);
  }
  const raw: unknown = await res.json();
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { lines?: unknown }).lines)) {
    throw new Error("Resposta de trecho do log original inválida");
  }
  const arr = (raw as { lines: unknown[] }).lines;
  const lines = arr.map((entry) => {
    if (!entry || typeof entry !== "object") return { lineNumber: 0, text: "" };
    const ob = entry as { lineNumber?: unknown; text?: unknown };
    const ln = typeof ob.lineNumber === "number" && Number.isFinite(ob.lineNumber) ? ob.lineNumber : 0;
    const text = typeof ob.text === "string" ? ob.text : "";
    return { lineNumber: ln, text };
  });
  const hlRaw = (raw as { highlightLine?: unknown }).highlightLine;
  const highlightLine =
    typeof hlRaw === "number" && Number.isFinite(hlRaw)
      ? hlRaw
      : lines.find((l) => l.lineNumber > 0)?.lineNumber ?? anchorLine;
  return { lines, highlightLine };
}

export async function fetchReducedLogKeptLines(jobId: string, fileName: string): Promise<KeptLogLine[]> {
  const qs = new URLSearchParams({ jobId, fileName, format: "json" });
  const url = `/api/analysis-artifacts/reduced-log-by-file?${qs.toString()}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `${res.status} ao carregar linhas reduzidas`);
  }
  const raw: unknown = await res.json();
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { keptLines?: unknown }).keptLines)) {
    throw new Error("Resposta de log reduzido inválida");
  }
  const arr = (raw as { keptLines: unknown[] }).keptLines;
  return arr.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return { lineNumber: 0, text: "" };
    }
    const ob = entry as { lineNumber?: unknown; text?: unknown };
    const ln = typeof ob.lineNumber === "number" && Number.isFinite(ob.lineNumber) ? ob.lineNumber : 0;
    const text = typeof ob.text === "string" ? ob.text : "";
    return { lineNumber: ln, text };
  });
}

export type EvidencePngFooterMode = "original" | "reduced";

const FOOTER_TOP_GAP = 6;

function truncateForCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  const ell = "…";
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const cand = `${text.slice(0, mid)}${ell}`;
    if (ctx.measureText(cand).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, Math.max(0, lo))}${ell}`;
}

/**
 * Rasteriza um bloco de log (estilo editor escuro) em PNG (`data:image/png;base64,…`).
 * Rodapé âmbar = original íntegro; verde = trecho preservado no reduzido.
 * @param gutterReduced — coluna esquerda com linha física no `.reduced.txt`; `pairWithOriginalLine: false` só mostra a física.
 */
export function renderLogSnippetLinesToPngDataUrl(
  lines: KeptLogLine[],
  highlightLineNumber: number,
  footer?: {
    mode: EvidencePngFooterMode;
    /** Uma linha curta (contagem / correlação). */
    line?: string;
  },
  gutterReduced?:
    | null
    | {
        physicalByRow: number[];
        /** Por omissão `true`: `<física>|<orig>`; `false`: só o n.º físico. */
        pairWithOriginalLine?: boolean;
      },
): string {
  if (typeof document === "undefined") {
    throw new Error("renderLogSnippetLinesToPngDataUrl exige DOM (canvas)");
  }

  const padX = 14;
  const padY = 14;
  const font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
  const lh = 19;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D indisponível");
  }

  ctx.font = font;

  const useReducedGutter =
    gutterReduced &&
    gutterReduced.physicalByRow.length === lines.length &&
    gutterReduced.physicalByRow.every((n) => n > 0);

  const displayRows = lines.map((l, i) => {
    let gutterText = String(l.lineNumber);
    if (useReducedGutter && gutterReduced!.physicalByRow[i] !== undefined) {
      const phys = gutterReduced!.physicalByRow[i]!;
      const pair = gutterReduced!.pairWithOriginalLine !== false;
      gutterText = pair ? `${phys}|${l.lineNumber}` : String(phys);
    }
    return {
      gutterText,
      txt: truncateLogLine(l.text),
      highlight: l.lineNumber === highlightLineNumber,
    };
  });

  let gutterW = 56;
  for (const row of displayRows) {
    gutterW = Math.max(gutterW, Math.ceil(ctx.measureText(row.gutterText).width) + 20);
  }
  gutterW = Math.min(Math.max(gutterW, 48), 118);

  let maxInnerW = 320;
  for (const row of displayRows) {
    const tw = ctx.measureText(row.txt).width;
    maxInnerW = Math.max(maxInnerW, gutterW + padX * 2, tw + gutterW + padX + 24);
  }
  maxInnerW = Math.min(Math.ceil(maxInnerW), 980);

  const bodyW = gutterW + maxInnerW;
  const w = padX * 2 + bodyW;

  const textRows = Math.max(displayRows.length, 1);
  const footerBand = footer ? 30 : 0;
  const h = padY * 2 + lh * textRows + footerBand;

  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = font;
  ctx.textBaseline = "top";

  const bg = "#0b1220";
  const gutterBg = "#070b14";
  const textCol = "#e2e8f0";
  const dimCol = "#64748b";
  const hiBg = "#155e75";
  const hiText = "#ecfeff";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  let y = padY;
  for (let i = 0; i < displayRows.length; i++) {
    const row = displayRows[i]!;
    const yy = y;
    if (row.highlight) {
      ctx.fillStyle = hiBg;
      ctx.fillRect(padX, yy - 2, bodyW + padX / 2, lh + 1);
      ctx.fillStyle = hiText;
    } else {
      ctx.fillStyle = gutterBg;
      ctx.fillRect(padX, yy - 2, gutterW, lh + 1);
      ctx.fillStyle = bg;
      ctx.fillRect(padX + gutterW, yy - 2, bodyW - gutterW + padX / 2, lh + 1);
    }

    ctx.fillStyle = row.highlight ? dimCol : dimCol;
    ctx.textAlign = "right";
    ctx.fillText(row.gutterText, padX + gutterW - 6, yy);

    ctx.textAlign = "left";
    ctx.fillStyle = row.highlight ? hiText : textCol;
    ctx.fillText(row.txt, padX + gutterW + 10, yy);
    y += lh;
  }

  if (footer) {
    const fy = padY + lh * textRows + FOOTER_TOP_GAP;
    const isOrig = footer.mode === "original";
    const fg = isOrig ? "#fffbeb" : "#ecfdf5";
    const fb = isOrig ? "#c2410c" : "#047857";
    const bw = bodyW + padX / 2;
    ctx.fillStyle = fb;
    ctx.fillRect(padX, fy, bw, footerBand - FOOTER_TOP_GAP);

    const footerFont = "600 11px ui-sans-serif, system-ui, Segoe UI, sans-serif";
    const innerW = bw - 20;
    const defaultLabel = isOrig ? "ORIGINAL" : "REDUZIDO";
    const full = footer.line?.trim() ? footer.line.trim() : defaultLabel;

    ctx.font = footerFont;
    ctx.textAlign = "left";
    ctx.fillStyle = fg;
    ctx.fillText(truncateForCanvas(ctx, full, innerW), padX + 10, fy + 9);
  }

  return canvas.toDataURL("image/png");
}

export function pngDataUrlToDownloadFilename(fileName: string, lineNumber: number, tag?: string): string {
  const base = fileName.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 72) || "evidencia";
  const clean = tag?.replace(/[^\w-]+/g, "").slice(0, 16);
  const suf = clean ? `_${clean}` : "";
  return `${base}_L${lineNumber}${suf}.png`;
}
