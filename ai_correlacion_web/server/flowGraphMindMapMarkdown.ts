import type { FlowGraph } from "../shared/analysis";

/** Identificadores Mermaid (apenas `[A-Za-z0-9_]`) estáveis por id do grafo */
function mermaidNodeId(graphId: string): string {
  const base = graphId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "node";
  return /^[0-9]/.test(base) ? `n_${base}` : `n_${base}`;
}

function escMermaidLabel(s: string, max = 160): string {
  return s
    .replace(/\r?\n/g, " ")
    .replace(/"/g, "#quot;")
    .replace(/\|/g, "\\|")
    .trim()
    .slice(0, max);
}

function escMindmapToken(s: string, max = 120): string {
  return s
    .replace(/\r?\n/g, " ")
    .replace(/[()]/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Markdown com dois blocos Mermaid: (1) fluxograma dirigido fiel às arestas do `flowGraph`;
 * (2) mindmap hierárquico por fase → APIs (arestas `phase:` → `event:`).
 */
export function renderMalwareFlowMapMarkdown(params: {
  flowGraph: FlowGraph;
  classification: string;
  sampleName?: string | null;
}): string {
  const { flowGraph, classification, sampleName } = params;
  const nodes = flowGraph.nodes;
  const edges = flowGraph.edges;
  const idMap = new Map(nodes.map((n) => [n.id, mermaidNodeId(n.id)]));

  const lines: string[] = [];
  lines.push("# Mapa do fluxo do malware");
  lines.push("");
  lines.push(
    `> Gerado automaticamente a partir do grafo de correlação (\`reports/flow-graph.json\`). **Classificação:** ${classification}.`,
  );
  if (sampleName?.trim()) {
    lines.push(`> **Amostra:** ${sampleName.trim()}.`);
  }
  lines.push(
    "> Visualize com suporte a [Mermaid](https://mermaid.js.org/) (VS Code, GitHub, Obsidian) ou copie cada bloco para [mermaid.live](https://mermaid.live).",
  );
  lines.push("");
  lines.push("## 1. Diagrama dirigido (fases, jornada e veredito)");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart TB");
  lines.push("  classDef phase fill:#1e3a5f,stroke:#60a5fa,color:#e0f2fe;");
  lines.push("  classDef api fill:#14532d,stroke:#4ade80,color:#dcfce7;");
  lines.push("  classDef verdict fill:#4c1d95,stroke:#c084fc,color:#f3e8ff;");

  const phaseMids: string[] = [];
  const apiMids: string[] = [];
  const verdictMids: string[] = [];

  for (const n of nodes) {
    const mid = idMap.get(n.id)!;
    const label = escMermaidLabel(n.label);
    if (n.kind === "verdict") {
      lines.push(`  ${mid}{{"${label}"}}`);
      verdictMids.push(mid);
    } else if (n.kind === "phase") {
      lines.push(`  ${mid}["${label}"]`);
      phaseMids.push(mid);
    } else {
      lines.push(`  ${mid}("${label}")`);
      apiMids.push(mid);
    }
  }

  if (phaseMids.length) lines.push(`  class ${phaseMids.join(",")} phase;`);
  if (apiMids.length) lines.push(`  class ${apiMids.join(",")} api;`);
  if (verdictMids.length) lines.push(`  class ${verdictMids.join(",")} verdict;`);

  for (const e of edges) {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (!s || !t) continue;
    const rel = escMermaidLabel(e.relation, 72);
    lines.push(`  ${s} -->|"${rel}"| ${t}`);
  }

  lines.push("```");
  lines.push("");
  lines.push("## 2. Mapa mental (fases e APIs da jornada)");
  lines.push("");
  lines.push("```mermaid");
  lines.push("mindmap");

  const verdictNode = nodes.find((n) => n.kind === "verdict");
  const rootLabel = escMindmapToken(verdictNode?.label ?? `Descoberta: ${classification}`, 100);
  lines.push(`  root((${rootLabel}))`);

  const phaseKeyToLabel = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind === "phase") phaseKeyToLabel.set(n.id, n.label);
  }

  const phaseToApis = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.source.startsWith("phase:")) continue;
    const tgt = nodes.find((n) => n.id === e.target);
    if (!tgt || tgt.kind !== "api") continue;
    const phaseLabel = phaseKeyToLabel.get(e.source) ?? e.source;
    const key = phaseLabel;
    const list = phaseToApis.get(key) ?? [];
    if (!list.includes(tgt.label)) list.push(tgt.label);
    phaseToApis.set(key, list);
  }

  const phaseOrder = nodes.filter((n) => n.kind === "phase").map((n) => n.label);
  const seenPhaseInMap = new Set<string>();

  for (const label of phaseOrder) {
    const apis = phaseToApis.get(label);
    seenPhaseInMap.add(label);
    const token = escMindmapToken(label, 80);
    lines.push(`    ${token}`);
    if (apis?.length) {
      for (const api of apis) {
        lines.push(`      ${escMindmapToken(api, 100)}`);
      }
    } else {
      lines.push(`      ${escMindmapToken("(sem API na jornada resumida)", 80)}`);
    }
  }

  for (const pl of Array.from(phaseToApis.keys())) {
    if (!seenPhaseInMap.has(pl)) {
      lines.push(`    ${escMindmapToken(pl, 80)}`);
      for (const api of phaseToApis.get(pl) ?? []) {
        lines.push(`      ${escMindmapToken(api, 100)}`);
      }
    }
  }

  lines.push("```");
  lines.push("");
  return lines.join("\n");
}
