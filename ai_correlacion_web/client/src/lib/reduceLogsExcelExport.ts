import { buildFlowJourneyNarrative, extractFlowNodeDetails, getFlowNodeDetailsWithFallback } from "@/lib/flowGraph";
import { formatBytes, formatDateTimeLocale, formatPercentFine } from "@/lib/format";
import type { AnalysisJobDetail } from "@shared/analysis";
import { listHeuristicsOutsideTa0005 } from "@shared/analysis";
import {
  getFileInterpretation,
  getFileRecommendation,
  type FileMonitor,
} from "@/pages/reduceLogsMonitor";
import * as XLSX from "xlsx";

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "queued":
      return "Na fila";
    case "uploading":
      return "Enviando";
    case "running":
      return "Processando";
    case "completed":
      return "Concluído";
    case "failed":
      return "Falhou";
    default:
      return "Sem processamento";
  }
}

function getSemaforoLabel(file: FileMonitor) {
  if (file.processingStatus === "failed") return "Falhou";
  if (file.processingStatus === "queued" || file.processingStatus === "uploading") return "Aguardando";
  if (file.triggerCount > 0 || file.suspiciousEventCount > 0) return "Preservado";
  if (file.processingStatus === "completed") return "Revisar";
  return "Em análise";
}

function safeFilePart(value: string) {
  return value.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim().slice(0, 96);
}

export type ReduceLogsFileExportExtra = {
  lastActivity: string;
  timeInStage: string;
};

export function downloadReduceLogsExcelWorkbook(params: {
  jobId: string | null;
  jobDisplayName: string;
  files: FileMonitor[];
  fileExtra?: Map<string, ReduceLogsFileExportExtra>;
  exportedAt?: Date;
}): void {
  const { jobId, jobDisplayName, files } = params;
  const exportedAt = params.exportedAt ?? new Date();
  const extra = params.fileExtra ?? new Map<string, ReduceLogsFileExportExtra>();

  const trackingHeaders = [
    "Arquivo",
    "Estado upload",
    "% upload",
    "Estado processamento",
    "% processamento",
    "Etapa atual",
    "Passo atual",
    "Última atividade",
    "Tempo na etapa atual",
    "Tamanho antes",
    "Tamanho depois",
    "Redução %",
    "Eventos suspeitos",
    "Gatilhos",
    "Semáforo",
    "Última mensagem operacional",
  ];

  const trackingRows = files.map((file) => {
    const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
    const meta = extra.get(file.fileName);
    return [
      file.fileName,
      getStatusLabel(file.uploadStatus),
      file.uploadProgress,
      getStatusLabel(file.processingStatus),
      file.processingProgress == null ? "—" : file.processingProgress,
      file.currentStage,
      file.currentStep,
      meta?.lastActivity ?? "—",
      meta?.timeInStage ? `Na etapa atual há ${meta.timeInStage}` : "—",
      formatBytes(file.originalBytes),
      formatBytes(file.reducedBytes),
      formatPercentFine(reduction),
      file.suspiciousEventCount,
      file.triggerCount,
      getSemaforoLabel(file),
      file.lastMessage,
    ];
  });

  const suggestionsHeaders = [
    "Arquivo",
    "Estado processamento",
    "Leitura / passo atual",
    "Interpretação",
    "Ação sugerida",
  ];

  const suggestionsRows = files.map((file) => [
    file.fileName,
    getStatusLabel(file.processingStatus),
    file.currentStep,
    getFileInterpretation(file),
    getFileRecommendation(file),
  ]);

  const metaRows = [
    ["Job", jobId ?? "—"],
    ["Nome da validação", jobDisplayName],
    ["Exportado em", exportedAt.toLocaleString("pt-BR")],
    ["N.º de ficheiros", String(files.length)],
  ];

  const wb = XLSX.utils.book_new();

  const wsMeta = XLSX.utils.aoa_to_sheet(metaRows);
  wsMeta["!cols"] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, "Resumo");

  const wsTrack = XLSX.utils.aoa_to_sheet([trackingHeaders, ...trackingRows]);
  wsTrack["!cols"] = [
    { wch: 48 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 16 },
    { wch: 28 },
    { wch: 36 },
    { wch: 26 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 56 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTrack, "Acompanhamento");

  const wsSug = XLSX.utils.aoa_to_sheet([suggestionsHeaders, ...suggestionsRows]);
  wsSug["!cols"] = [{ wch: 48 }, { wch: 18 }, { wch: 36 }, { wch: 64 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsSug, "Sugestões");

  const stamp = safeFilePart(
    `${exportedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${jobId ?? "lote"}`,
  );
  XLSX.writeFile(wb, `reducao-contradef-${stamp}.xlsx`);
}

/** Exporta interpretação, indicadores, MITRE, heurísticas, APIs, fluxo e eventos para integração (SIEM, relatórios, etc.). */
export function downloadReduceLogsAnalysisExcel(params: {
  detail: AnalysisJobDetail;
  jobId: string | null;
  exportedAt?: Date;
}): void {
  const exportedAt = params.exportedAt ?? new Date();
  const d = params.detail;
  const jobId = params.jobId;

  const summaryRows: (string | number)[][] = [
    ["Campo", "Valor"],
    ["Job", jobId ?? "—"],
    ["Nome da validação", d.job.sampleName ?? "—"],
    ["SHA-256 amostra", d.job.sampleSha256 ?? "—"],
    ["Estado do job", d.job.status],
    ["Progresso %", d.job.progress],
    ["Etapa (job)", d.job.stage],
    ["Mensagem (job)", d.job.message ?? "—"],
    ["Classificação", d.classification],
    ["Nível de risco", d.riskLevel],
    ["Fase comportamental", d.currentPhase],
    ["Criado em", formatDateTimeLocale(d.job.createdAt)],
    ["Atualizado em", formatDateTimeLocale(d.job.updatedAt)],
    ["Concluído em", d.job.completedAt ? formatDateTimeLocale(d.job.completedAt) : "—"],
    ["Exportado em", exportedAt.toLocaleString("pt-BR")],
    ["Insight (título)", d.insight?.title ?? "—"],
    ["Modelo resumo", d.insight?.modelName ?? "—"],
  ];

  const indicatorRows: (string | number)[][] = [
    ["Indicador", "Valor"],
    [
      "Redução (linhas)",
      `${d.metrics.originalLineCount} → ${d.metrics.reducedLineCount} (${formatPercentFine(d.metrics.reductionPercent)})`,
    ],
    ["Bytes antes", formatBytes(d.metrics.originalBytes)],
    ["Bytes depois", formatBytes(d.metrics.reducedBytes)],
    ["Eventos suspeitos (métricas)", d.metrics.suspiciousEventCount],
    ["Gatilhos (métricas)", d.metrics.triggerCount],
    ["Ficheiros enviados (métricas)", d.metrics.uploadedFileCount],
    [
      "Heurísticas fora de TA0005",
      listHeuristicsOutsideTa0005(d.techniques).join("; ") || "—",
    ],
  ];

  const mitreHeaders = ["ID", "Técnica_MITRE", "URL", "Evidencia_logs"];
  const mitreRows = d.mitreDefenseEvasion.techniques.map((t) => [
    t.id,
    t.name,
    t.url,
    t.heuristicEvidence.join("; "),
  ]);

  const heuristicRows = [["Heuristica"], ...d.techniques.map((h) => [h])];
  const apiRows = [["API_suspeita"], ...d.suspiciousApis.map((a) => [a])];
  const recoRows = [["Recomendacao"], ...d.recommendations.map((r) => [r])];

  const interpretationRows = [
    ["Titulo", d.insight?.title ?? "—"],
    ["Resumo_Markdown", d.insight?.summaryMarkdown ?? "—"],
  ];

  const nodeHeaders = ["id", "label", "kind", "severity"];
  const nodeRows = [nodeHeaders, ...d.flowGraph.nodes.map((n) => [n.id, n.label, n.kind, n.severity])];
  const edgeHeaders = ["source", "target", "relation", "evidence"];
  const edgeRows = [
    edgeHeaders,
    ...d.flowGraph.edges.map((e) => [e.source, e.target, e.relation, e.evidence ?? ""]),
  ];

  const artHeaders = ["label", "tipo", "caminho_relativo", "bytes"];
  const artRows = [
    artHeaders,
    ...d.artifacts.map((a) => [
      a.label,
      a.artifactType,
      a.relativePath,
      a.sizeBytes ?? "—",
    ]),
  ];

  const evHeaders = ["tipo_evento", "etapa", "mensagem", "progresso", "criado_em"];
  const evRows = [
    evHeaders,
    ...d.events.slice(0, 250).map((e) => [
      e.eventType,
      e.stage ?? "—",
      e.message ?? "—",
      e.progress ?? "—",
      formatDateTimeLocale(e.createdAt),
    ]),
  ];

  const wb = XLSX.utils.book_new();

  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSum["!cols"] = [{ wch: 28 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsSum, "Resumo");

  const wsInd = XLSX.utils.aoa_to_sheet(indicatorRows);
  wsInd["!cols"] = [{ wch: 36 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInd, "Indicadores");

  const wsMitre = XLSX.utils.aoa_to_sheet([mitreHeaders, ...mitreRows]);
  wsMitre["!cols"] = [{ wch: 12 }, { wch: 36 }, { wch: 52 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsMitre, "MITRE_TA0005");

  const wsHeur = XLSX.utils.aoa_to_sheet(heuristicRows);
  wsHeur["!cols"] = [{ wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsHeur, "Heuristicas");

  const wsApi = XLSX.utils.aoa_to_sheet(apiRows);
  wsApi["!cols"] = [{ wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsApi, "APIs_suspeitas");

  const wsReco = XLSX.utils.aoa_to_sheet(recoRows);
  wsReco["!cols"] = [{ wch: 96 }];
  XLSX.utils.book_append_sheet(wb, wsReco, "Recomendacoes");

  const wsInterp = XLSX.utils.aoa_to_sheet(interpretationRows);
  wsInterp["!cols"] = [{ wch: 18 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInterp, "Interpretacao");

  const wsN = XLSX.utils.aoa_to_sheet(nodeRows);
  wsN["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsN, "Fluxo_nos");

  const wsE = XLSX.utils.aoa_to_sheet(edgeRows);
  wsE["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 22 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsE, "Fluxo_arestas");

  const wsArt = XLSX.utils.aoa_to_sheet(artRows);
  wsArt["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 48 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsArt, "Artefatos");

  const wsEv = XLSX.utils.aoa_to_sheet(evRows);
  wsEv["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 56 }, { wch: 10 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsEv, "Eventos");

  const stamp = safeFilePart(
    `${exportedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${jobId ?? "analise"}`,
  );
  XLSX.writeFile(wb, `analise-reducao-contradef-${stamp}.xlsx`);
}

const EXCEL_CELL_SAFE = 32000;

/** Excel focado na jornada por fase (narrativa + fases + APIs + ligações). */
export function downloadReduceLogsFlowExcel(params: {
  detail: AnalysisJobDetail;
  jobId: string | null;
  exportedAt?: Date;
}): void {
  const exportedAt = params.exportedAt ?? new Date();
  const d = params.detail;
  const jobId = params.jobId;

  const narrative = buildFlowJourneyNarrative({
    flowGraph: d.flowGraph,
    classification: d.classification,
    riskLevel: d.riskLevel,
    currentPhase: d.currentPhase,
  });

  const phaseHeaders = ["Fase", "Identificacao", "Evidencias_agregadas", "APIs", "Heuristicas"];
  const phaseRows = d.flowGraph.nodes
    .filter((n) => n.kind === "phase")
    .map((n) => {
      const det = getFlowNodeDetailsWithFallback(n, d.flowGraph);
      const ev = det.evidence ?? "—";
      return [
        n.label,
        det.identification ?? "—",
        ev.length > EXCEL_CELL_SAFE ? `${ev.slice(0, EXCEL_CELL_SAFE)}…` : ev,
        det.suspiciousApis.join("; "),
        det.techniques.join("; "),
      ];
    });

  const apiHeaders = ["id", "rotulo", "fase", "identificacao", "evidencia", "APIs"];
  const apiRows = d.flowGraph.nodes
    .filter((n) => n.kind === "api")
    .map((n) => {
      const det = extractFlowNodeDetails(n.metadata);
      const ev = det.evidence ?? "";
      return [
        n.id,
        n.label,
        det.stage ?? "—",
        det.identification ?? "—",
        ev.length > EXCEL_CELL_SAFE ? `${ev.slice(0, EXCEL_CELL_SAFE)}…` : ev,
        det.suspiciousApis.join("; "),
      ];
    });

  const verdictRow = d.flowGraph.nodes.filter((n) => n.kind === "verdict").map((n) => {
    const det = extractFlowNodeDetails(n.metadata);
    return [n.id, n.label, det.identification ?? "—", det.evidence ?? "—"];
  });

  const edgeHeaders = ["origem", "destino", "relacao", "evidencia"];
  const edgeRows = d.flowGraph.edges.map((e) => {
    const ev = e.evidence ?? "";
    return [
      e.source,
      e.target,
      e.relation,
      ev.length > EXCEL_CELL_SAFE ? `${ev.slice(0, EXCEL_CELL_SAFE)}…` : ev,
    ];
  });

  const wb = XLSX.utils.book_new();

  const nar = narrative.length > EXCEL_CELL_SAFE ? `${narrative.slice(0, EXCEL_CELL_SAFE)}…` : narrative;
  const wsNar = XLSX.utils.aoa_to_sheet([
    ["Narrativa_jornada"],
    [nar],
    [],
    ["Job", jobId ?? "—"],
    ["Exportado_em", exportedAt.toLocaleString("pt-BR")],
  ]);
  wsNar["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsNar, "Narrativa");

  const wsPh = XLSX.utils.aoa_to_sheet([phaseHeaders, ...phaseRows]);
  wsPh["!cols"] = [{ wch: 22 }, { wch: 72 }, { wch: 80 }, { wch: 48 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsPh, "Fases");

  const wsApi = XLSX.utils.aoa_to_sheet([apiHeaders, ...apiRows]);
  wsApi["!cols"] = [{ wch: 36 }, { wch: 28 }, { wch: 18 }, { wch: 56 }, { wch: 72 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsApi, "Nos_API");

  const wsVer = XLSX.utils.aoa_to_sheet([["id", "rotulo", "identificacao", "evidencia"], ...verdictRow]);
  wsVer["!cols"] = [{ wch: 28 }, { wch: 36 }, { wch: 72 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsVer, "Veredito");

  const wsEd = XLSX.utils.aoa_to_sheet([edgeHeaders, ...edgeRows]);
  wsEd["!cols"] = [{ wch: 36 }, { wch: 36 }, { wch: 22 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(wb, wsEd, "Ligacoes");

  const stamp = safeFilePart(
    `${exportedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${jobId ?? "fluxo"}`,
  );
  XLSX.writeFile(wb, `fluxo-malware-contradef-${stamp}.xlsx`);
}
