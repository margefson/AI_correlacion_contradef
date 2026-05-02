import type { AnalysisJobDetail } from "@shared/analysis";

function safeFilePart(value: string) {
  return value.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim().slice(0, 96);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function stampForFilename(exportedAt: Date): string {
  return exportedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Nó apenas o grafo (fases, APIs suspeitas, veredito) como na UI/API `flowGraph`. */
export function downloadAnalysisFlowGraphJson(params: {
  detail: AnalysisJobDetail;
  jobId: string | null;
  exportedAt?: Date;
}): void {
  const exportedAt = params.exportedAt ?? new Date();
  const jobId = params.jobId ?? "sem-job";
  const d = params.detail;

  const payload = {
    _exportSchema: "contradef.flowGraph.v1" as const,
    exportedAt: exportedAt.toISOString(),
    jobId,
    sampleName: d.job.sampleName ?? null,
    sampleSha256: d.job.sampleSha256 ?? null,
    jobStatus: d.job.status,
    flowGraph: d.flowGraph,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const name = `fluxo-malware-${stampForFilename(exportedAt)}-${safeFilePart(jobId)}.json`;
  triggerBlobDownload(blob, name);
}

/**
 * Payload completo gravado pelo servidor (`insight.summaryJson`), com envelope para trilha da exportação.
 * Se não houver `summaryJson`, inclui síntese a partir dos campos do detail (út em jobs incompletos).
 */
export function downloadAnalysisSummaryJson(params: {
  detail: AnalysisJobDetail;
  jobId: string | null;
  exportedAt?: Date;
}): void {
  const exportedAt = params.exportedAt ?? new Date();
  const jobId = params.jobId ?? "sem-job";
  const d = params.detail;
  const raw = d.insight?.summaryJson;

  const summaryFromInsight =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  const synthesized: Record<string, unknown> = {
    flowGraph: d.flowGraph,
    metrics: d.metrics,
    classification: d.classification,
    riskLevel: d.riskLevel,
    currentPhase: d.currentPhase,
    suspiciousApis: d.suspiciousApis,
    techniques: d.techniques,
    recommendations: d.recommendations,
    mitreDefenseEvasion: d.mitreDefenseEvasion,
    _note:
      "`insight.summaryJson` não estava disponível como objeto neste detail; campos foram reconstruídos a partir da resposta `analysis.detail`.",
  };

  const payload = {
    _exportSchema: "contradef.analysisSummary.v1" as const,
    exportedAt: exportedAt.toISOString(),
    jobId,
    sampleName: d.job.sampleName ?? null,
    sampleSha256: d.job.sampleSha256 ?? null,
    jobStatus: d.job.status,
    insight: d.insight
      ? {
          title: d.insight.title,
          modelName: d.insight.modelName,
          riskLevel: d.insight.riskLevel,
        }
      : null,
    summaryJsonSource: summaryFromInsight ? ("insight.summaryJson" as const) : ("synthesizedFromDetail" as const),
    summaryJson: summaryFromInsight ?? synthesized,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const name = `resumo-analise-${stampForFilename(exportedAt)}-${safeFilePart(jobId)}.json`;
  triggerBlobDownload(blob, name);
}
