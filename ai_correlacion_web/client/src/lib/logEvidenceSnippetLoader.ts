import type { ReductionFileMetric } from "@shared/analysis";
import { lookupReductionFileMetric } from "@/lib/lookupReductionFileMetric";
import {
  fetchOriginalLogSnippetLines,
  fetchReducedLogKeptLines,
  physicalLineInReducedTxt,
  pngDataUrlToDownloadFilename,
  renderLogSnippetLinesToPngDataUrl,
  sliceKeptLinesAroundAnchor,
} from "@/lib/logEvidencePng";

const pngCache = new Map<string, string>();
const SNIPPET_CACHE_MAX = 52;

export type EvidenceSnippetKind = "original" | "reduced";

/** Controla texto do rodapé / margens do PNG rasterizado para não misturar origem na vista isolada. */
export type EvidencePngPurpose =
  | "single-original"
  | "single-reduced"
  | "compare-original"
  | "compare-reduced";

export type EvidenceLineRef = { originalLine: number; reducedTxtLine?: number };

export type LoadedLogEvidenceSnippet = {
  pngDataUrl: string;
  lineRef: EvidenceLineRef;
};

function stashPng(fullKey: string, dataUrl: string) {
  if (pngCache.size >= SNIPPET_CACHE_MAX) {
    const stale = pngCache.keys().next().value;
    if (stale !== undefined) pngCache.delete(stale);
  }
  pngCache.set(fullKey, dataUrl);
}

function metricCachePart(m: ReductionFileMetric | null): string {
  return m ? `${m.originalLineCount}_${m.reducedLineCount}` : "_";
}

/** Carrega raster em cache por job/ficheiro/âncora/modo/texto aplicado ao PNG. */
export async function loadLogEvidenceSnippetCached(input: {
  jobId: string;
  fileName: string;
  anchorLine: number;
  snippetKind: EvidenceSnippetKind;
  purpose: EvidencePngPurpose;
  fileMetricRows: readonly ReductionFileMetric[];
}): Promise<{ ok: true; data: LoadedLogEvidenceSnippet } | { ok: false; message: string }> {
  const { jobId, fileName, anchorLine, snippetKind, purpose, fileMetricRows } = input;
  const matched = lookupReductionFileMetric(fileMetricRows, fileName);
  const mPart = metricCachePart(matched);

  try {
    if (snippetKind === "original") {
      const r = await fetchOriginalLogSnippetLines(jobId, fileName, anchorLine);
      const hl = r.highlightLine;
      if (!r.lines.length) {
        return { ok: false, message: "Trecho do original vazio." };
      }

      let reducedTxtLine: number | undefined;
      try {
        const kept = await fetchReducedLogKeptLines(jobId, fileName);
        if (kept.length) {
          const pl = physicalLineInReducedTxt(kept, hl);
          if (pl != null) reducedTxtLine = pl;
        }
      } catch {
        /* opcional */
      }

      const ext = `orig_${purpose}_${reducedTxtLine ?? "na"}`;
      const fullKey = `v3\u0000${snippetKind}\u0000${jobId}\u0000${fileName}\u0000${anchorLine}\u0000${mPart}\u0000${ext}`;
      const hit = pngCache.get(fullKey);
      if (hit) {
        return { ok: true, data: { pngDataUrl: hit, lineRef: { originalLine: hl, reducedTxtLine } } };
      }

      let footer: string;
      if (purpose === "compare-original") {
        footer = `ORIGINAL · L${hl} (painel compare)`;
      } else {
        footer = `ORIGINAL · L${hl} no íntegro (source)`;
      }

      const dataUrl = renderLogSnippetLinesToPngDataUrl(r.lines, hl, { mode: "original", line: footer }, null);

      stashPng(fullKey, dataUrl);
      return { ok: true, data: { pngDataUrl: dataUrl, lineRef: { originalLine: hl, reducedTxtLine } } };
    }

    const kept = await fetchReducedLogKeptLines(jobId, fileName);
    if (!kept.length) {
      return {
        ok: false,
        message: "Sem linhas reduzidas registadas neste lote.",
      };
    }

    const r = sliceKeptLinesAroundAnchor(kept, anchorLine);
    if (!r.lines.length) {
      return { ok: false, message: "Trecho reduzido vazio." };
    }

    let footerReduced: string;
    let gutter: { physicalByRow: number[]; pairWithOriginalLine?: boolean } | null;

    if (purpose === "single-reduced") {
      footerReduced = `REDUZIDO · linha ${r.highlightPhysicalLine} no .reduced.txt`;
      gutter = {
        physicalByRow: r.physicalLineNumbers,
        pairWithOriginalLine: false,
      };
    } else {
      footerReduced = `REDUZIDO · física ${r.highlightPhysicalLine} · orig.L${r.highlightLine} (compare)`;
      gutter = {
        physicalByRow: r.physicalLineNumbers,
        pairWithOriginalLine: true,
      };
    }

    const ext = `red_${purpose}_${kept.length}_${r.highlightPhysicalLine}`;
    const fullKey = `v3\u0000${snippetKind}\u0000${jobId}\u0000${fileName}\u0000${anchorLine}\u0000${mPart}\u0000${ext}`;
    const hit = pngCache.get(fullKey);
    if (hit) {
      return {
        ok: true,
        data: {
          pngDataUrl: hit,
          lineRef: { originalLine: r.highlightLine, reducedTxtLine: r.highlightPhysicalLine },
        },
      };
    }

    const dataUrl = renderLogSnippetLinesToPngDataUrl(
      r.lines,
      r.highlightLine,
      { mode: "reduced", line: footerReduced },
      gutter,
    );
    stashPng(fullKey, dataUrl);

    return {
      ok: true,
      data: {
        pngDataUrl: dataUrl,
        lineRef: { originalLine: r.highlightLine, reducedTxtLine: r.highlightPhysicalLine },
      },
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao gerar evidência.",
    };
  }
}

export function pngDownloadNameForEvidence(
  fileName: string,
  anchorLine: number,
  snippetKind: EvidenceSnippetKind,
  suffix?: "compare",
): string {
  const mid = snippetKind + (suffix ? `-${suffix}` : "");
  return pngDataUrlToDownloadFilename(fileName, anchorLine, mid);
}
