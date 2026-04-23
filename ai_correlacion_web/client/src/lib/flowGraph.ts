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
  };
}

/** Detalhes do nó; para fases sem texto no servidor (jobs antigos), reconstrói a partir das APIs ligadas. */
export function getFlowNodeDetailsWithFallback(node: FlowNode | null | undefined, graph: FlowGraph | null | undefined): FlowNodeDetails {
  if (!node) {
    return extractFlowNodeDetails(undefined);
  }
  const direct = extractFlowNodeDetails(node.metadata);
  if (node.kind !== "phase" || direct.identification) {
    return direct;
  }
  if (!graph?.nodes.length) {
    return {
      ...direct,
      stage: direct.stage ?? node.label,
      identification: `Fase «${node.label}»: sem grafo disponível para reconstruir o resumo.`,
      evidence: "—",
      identifiedBy: null,
      suspiciousApis: [],
      techniques: [],
      sourceFile: null,
      sourceLogType: null,
      sourceLineNumber: null,
      trigger: null,
    };
  }

  const connected = graph.nodes.filter(
    (n) =>
      n.kind === "api"
      && graph.edges.some((e) => e.source === node.id && e.target === n.id),
  );

  if (connected.length === 0) {
    return {
      ...direct,
      stage: direct.stage ?? node.label,
      identification:
        `Fase «${node.label}» sem evidências suspeitas ligadas na jornada reduzida (coluna vazia no diagrama ou job gravado antes do resumo por fase).`,
      evidence:
        "Selecione uma API noutra coluna ou reprocesse o lote para atualizar os metadados agregados da fase.",
      identifiedBy: "Reconstrução no cliente (fallback)",
      suspiciousApis: [],
      techniques: [],
      sourceFile: null,
      sourceLogType: null,
      sourceLineNumber: null,
      trigger: null,
    };
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

  return {
    ...direct,
    stage: node.label,
    identification:
      `Fase «${node.label}» (reconstruída a partir do grafo): ${connected.length} evidência(s), ${triggers} gatilho(s); APIs: ${apis.slice(0, 14).join(", ")}${apis.length > 14 ? "…" : ""}.`,
    evidence: snippets.slice(0, 10).join("\n\n---\n\n"),
    identifiedBy: `Ligações fase → API no grafo (${apis.length} rotulos distintos)`,
    suspiciousApis: apis,
    techniques,
    sourceFile: null,
    sourceLogType: null,
    sourceLineNumber: null,
    trigger: null,
  };
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
