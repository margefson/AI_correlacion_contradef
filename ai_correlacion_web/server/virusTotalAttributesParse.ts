import type { VirusTotalAnalysisStats } from "../shared/virusTotalReport";
import { virusTotalAnalysisStatsSchema } from "../shared/virusTotalReport";

export type VtReputationScanSummary = {
  stats: VirusTotalAnalysisStats | null;
  lastAnalysisDate: number | null;
  threatNamesSample: string[];
  categoriesSample: string[];
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Extrai `last_analysis_stats`, data, categorias e amostras de decisões das engines —
 * igual para objeto URL, Domain e IP na API VT v3.
 */
export function extractVtReputationScanSummary(attributes: Record<string, unknown>): VtReputationScanSummary {
  const statsParsed = virusTotalAnalysisStatsSchema.safeParse(attributes.last_analysis_stats);
  const stats = statsParsed.success ? statsParsed.data : null;

  const threatNamesSample: string[] = [];
  const res = attributes.last_analysis_results as unknown;
  if (res && typeof res === "object") {
    for (const [, entry] of Object.entries(res)) {
      if (threatNamesSample.length >= 15) break;
      if (!entry || typeof entry !== "object") continue;
      const nm = str((entry as { result?: unknown }).result);
      const cat = str((entry as { category?: unknown }).category);
      const engine = str((entry as { engine_name?: unknown }).engine_name);

      let line = "";
      if (nm && nm !== "clean" && nm !== "unrated") {
        line = cat ? `[${cat}] ${nm}` : nm;
        if (engine) line += ` (${engine})`;
      } else if (cat === "malicious" || cat === "suspicious") {
        line = engine ? `[${cat}] (${engine})` : `[${cat}]`;
      }
      if (line) threatNamesSample.push(line.slice(0, 260));
    }
  }

  const categoriesSample =
    attributes.categories != null && typeof attributes.categories === "object"
      ? Object.keys(attributes.categories as Record<string, unknown>).slice(0, 24)
      : [];

  return {
    stats,
    lastAnalysisDate: num(attributes.last_analysis_date),
    threatNamesSample,
    categoriesSample,
  };
}
