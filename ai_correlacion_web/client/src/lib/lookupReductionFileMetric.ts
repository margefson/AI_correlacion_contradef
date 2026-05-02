import type { ReductionFileMetric } from "@shared/analysis";

/**
 * Associa um `fileName` de evidência (ex. metadatos do fluxo) a uma entrada de `detail.fileMetrics`.
 */
export function lookupReductionFileMetric(
  fileMetrics: readonly ReductionFileMetric[] | undefined,
  fileName: string,
): ReductionFileMetric | null {
  if (!fileMetrics?.length || !fileName.trim()) {
    return null;
  }

  const norm = fileName.replace(/\\/g, "/").trim();
  const base = norm.split("/").pop();

  const direct = fileMetrics.find((m) => m.fileName === norm || m.fileName === fileName);
  if (direct) return direct;

  const byTail = fileMetrics.filter((m) => {
    const mn = m.fileName.replace(/\\/g, "/");
    return mn.endsWith(norm) || (base !== undefined && mn.split("/").pop() === base);
  });
  if (byTail.length === 1) return byTail[0]!;

  const rough = base
    ? fileMetrics.find((m) => {
        const mb = m.fileName.replace(/\\/g, "/").split("/").pop();
        return mb === base;
      })
    : null;

  return rough ?? null;
}
