import type { FlowGraph, FlowNode } from "@shared/analysis";

type MetadataRecord = Record<string, unknown>;

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export type FlowNodeDetails = {
  sourceFile: string | null;
  sourceLogType: string | null;
  sourceLineNumber: number | null;
  stage: string | null;
  identifiedBy: string | null;
  identification: string | null;
  evidence: string | null;
  trigger: boolean | null;
  suspiciousApis: string[];
  techniques: string[];
  /** Nós de fase: nota quando ficheiro/linha é agregado a partir de várias evidências. */
  phaseOriginNote: string | null;
};

export function extractFlowNodeDetails(metadata: unknown): FlowNodeDetails {
  const record = (metadata ?? {}) as MetadataRecord;
  return {
    sourceFile: asText(record.sourceFile) ?? asText(record.fileName),
    sourceLogType: asText(record.sourceLogType) ?? asText(record.logType),
    sourceLineNumber: asNumber(record.sourceLineNumber) ?? asNumber(record.lineNumber),
    stage: asText(record.stage),
    identifiedBy: asText(record.identifiedBy),
    identification: asText(record.identification),
    evidence: asText(record.evidence) ?? asText(record.message),
    trigger: typeof record.trigger === "boolean" ? record.trigger : null,
    suspiciousApis: asTextList(record.suspiciousApis),
    techniques: asTextList(record.techniques),
    phaseOriginNote: null,
  };
}

/**
 * Para um nó de fase, deriva ficheiro/tipo/linha a partir das evidências API ligadas no grafo
 * (o servidor agrega a fase e não grava origem única no metadata da fase).
 */
function aggregatePhaseLogOrigin(connected: FlowNode[]): Pick<FlowNodeDetails, "sourceFile" | "sourceLogType" | "sourceLineNumber" | "phaseOriginNote"> {
  if (!connected.length) {
    return { sourceFile: null, sourceLogType: null, sourceLineNumber: null, phaseOriginNote: null };
  }

  const details = connected.map((n) => extractFlowNodeDetails(n.metadata));
  const withFile = details.filter((d) => d.sourceFile);
  if (!withFile.length) {
    return {
      sourceFile: null,
      sourceLogType: null,
      sourceLineNumber: null,
      phaseOriginNote:
        "As evidências API desta fase não incluem ficheiro de log no grafo; abra o separador operacional ou o nó de API correspondente.",
    };
  }

  const byFile = new Map<string, FlowNodeDetails[]>();
  for (const d of withFile) {
    const f = d.sourceFile!;
    const list = byFile.get(f) ?? [];
    list.push(d);
    byFile.set(f, list);
  }

  const files = Array.from(byFile.keys());
  const primaryFile = files[0]!;
  const primaryList = byFile.get(primaryFile)!;

  const sourceFile =
    files.length === 1 ? primaryFile : `${primaryFile} (+${files.length - 1} outro(s))`;

  const logTypes = Array.from(
    new Set(primaryList.map((d) => d.sourceLogType).filter(Boolean) as string[]),
  );
  let sourceLogType: string | null = null;
  if (logTypes.length === 1) {
    sourceLogType = logTypes[0]!;
  } else if (logTypes.length > 1) {
    sourceLogType = `${logTypes[0]} (+${logTypes.length - 1})`;
  }

  const lines = primaryList.map((d) => d.sourceLineNumber).filter((x): x is number => x != null);
  const uniqLines = Array.from(new Set(lines)).sort((a, b) => a - b);
  let sourceLineNumber: number | null = null;
  let phaseOriginNote: string | null = null;

  if (files.length === 1 && uniqLines.length === 1) {
    sourceLineNumber = uniqLines[0]!;
  } else if (files.length === 1 && uniqLines.length > 1) {
    phaseOriginNote = `Várias linhas neste ficheiro nas evidências da fase (ex.: ${uniqLines[0]}–${uniqLines[uniqLines.length - 1]}). Clique num nó de API para ver cada linha.`;
  } else if (files.length > 1) {
    phaseOriginNote = "Vários ficheiros de log nas evidências desta fase; mostra-se o primeiro como referência. Abra um nó de API para o detalhe exacto.";
  }

  return { sourceFile, sourceLogType, sourceLineNumber, phaseOriginNote };
}

/** Detalhes do nó; para fases sem texto no servidor (jobs antigos), reconstrói a partir das APIs ligadas. */
export function getFlowNodeDetailsWithFallback(node: FlowNode | null | undefined, graph: FlowGraph | null | undefined): FlowNodeDetails {
  if (!node) {
    return extractFlowNodeDetails(undefined);
  }
  const direct = extractFlowNodeDetails(node.metadata);

  if (node.kind !== "phase") {
    return direct;
  }

  const connected =
    graph?.nodes.length
      ? graph.nodes.filter(
          (n) =>
            n.kind === "api"
            && graph.edges.some((e) => e.source === node.id && e.target === n.id),
        )
      : [];

  const aggregate = aggregatePhaseLogOrigin(connected);

  const withPhaseOrigin = (d: FlowNodeDetails): FlowNodeDetails => ({
    ...d,
    sourceFile: d.sourceFile ?? aggregate.sourceFile,
    sourceLogType: d.sourceLogType ?? aggregate.sourceLogType,
    sourceLineNumber: d.sourceLineNumber ?? aggregate.sourceLineNumber,
    phaseOriginNote: d.phaseOriginNote ?? aggregate.phaseOriginNote,
  });

  if (!graph?.nodes.length) {
    return withPhaseOrigin({
      ...direct,
      stage: direct.stage ?? node.label,
      identification: direct.identification ?? `Fase «${node.label}»: sem grafo disponível para reconstruir o resumo.`,
      evidence: direct.evidence ?? "—",
      identifiedBy: direct.identifiedBy,
      suspiciousApis: direct.suspiciousApis,
      techniques: direct.techniques,
      trigger: direct.trigger,
    });
  }

  if (connected.length === 0) {
    return withPhaseOrigin({
      ...direct,
      stage: direct.stage ?? node.label,
      identification:
        direct.identification
        ?? `Fase «${node.label}» sem evidências suspeitas ligadas na jornada reduzida (coluna vazia no diagrama ou job gravado antes do resumo por fase).`,
      evidence:
        direct.evidence
        ?? "Selecione uma API noutra coluna ou reprocesse o lote para atualizar os metadados agregados da fase.",
      identifiedBy: direct.identifiedBy ?? "Reconstrução no cliente (fallback)",
      suspiciousApis: direct.suspiciousApis,
      techniques: direct.techniques,
      trigger: direct.trigger,
      phaseOriginNote:
        direct.phaseOriginNote
        ?? (!direct.identification ? "Sem ligações fase → API no grafo para agregar origem no log." : null),
    });
  }

  const apis = Array.from(
    new Set(
      connected.flatMap((n) => {
        const d = extractFlowNodeDetails(n.metadata);
        return d.suspiciousApis.length ? d.suspiciousApis : [n.label];
      }),
    ),
  );
  const techniques = Array.from(new Set(connected.flatMap((n) => extractFlowNodeDetails(n.metadata).techniques)));
  const snippets = connected
    .map((n) => extractFlowNodeDetails(n.metadata).evidence)
    .filter((x): x is string => Boolean(x && x.trim()));
  const triggers = connected.filter((n) => extractFlowNodeDetails(n.metadata).trigger === true).length;

  if (direct.identification) {
    return withPhaseOrigin({
      ...direct,
    });
  }

  return withPhaseOrigin({
    ...direct,
    stage: node.label,
    identification:
      `Fase «${node.label}» (reconstruída a partir do grafo): ${connected.length} evidência(s), ${triggers} gatilho(s); APIs: ${apis.slice(0, 14).join(", ")}${apis.length > 14 ? "…" : ""}.`,
    evidence: snippets.slice(0, 10).join("\n\n---\n\n"),
    identifiedBy: `Ligações fase → API no grafo (${apis.length} rotulos distintos)`,
    suspiciousApis: apis,
    techniques,
    trigger: null,
  });
}

/** Texto contínuo para o painel «Caminho até à identificação» e exportações. */
export function buildFlowJourneyNarrative(detail: {
  flowGraph: FlowGraph;
  classification: string;
  riskLevel: string;
  currentPhase: string;
}): string {
  const g = detail.flowGraph;
  const summary = g.summary && typeof g.summary === "object" ? (g.summary as Record<string, unknown>) : null;
  const phasesFromSummary = summary?.phases;
  const phasesRaw = Array.isArray(phasesFromSummary)
    ? (phasesFromSummary as string[])
    : g.nodes.filter((n) => n.kind === "phase").map((n) => n.label);

  const lines: string[] = [];
  lines.push("Resumo da jornada observada nos logs reduzidos (Contradef)");
  lines.push("");
  lines.push(
    `Classificação: ${detail.classification}. Nível de risco: ${detail.riskLevel}. Fase comportamental mais avançada: «${detail.currentPhase}».`,
  );
  lines.push("");
  lines.push(
    "Da esquerda para a direita, cada coluna é uma fase da execução inferida. Dentro de cada fase, as APIs e etiquetas são evidências suspeitas preservadas pela redução; a sequência encadeia-se até ao nó de veredito.",
  );
  lines.push("");

  for (const ph of phasesRaw) {
    const node = g.nodes.find((n) => n.id === `phase:${ph}`);
    if (!node) continue;
    const det = getFlowNodeDetailsWithFallback(node, g);
    lines.push(`• ${ph}: ${det.identification ?? "—"}`);
  }

  const verdict = g.nodes.find((n) => n.kind === "verdict");
  if (verdict) {
    const vd = extractFlowNodeDetails(verdict.metadata);
    lines.push("");
    lines.push(`Identificação final (veredito): ${vd.identification ?? verdict.label}`);
  }

  return lines.join("\n");
}
