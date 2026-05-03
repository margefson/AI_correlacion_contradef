import type { FlowGraph } from "../shared/analysis";
import {
  buildContradefFlowchartMermaid,
  buildContradefMindmapMermaid,
} from "../shared/flowGraphMermaidDiagrams";

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
  const flowchartBody = buildContradefFlowchartMermaid(flowGraph);
  const mindmapBody = buildContradefMindmapMermaid(flowGraph, classification);

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
  lines.push(flowchartBody);
  lines.push("```");
  lines.push("");
  lines.push("## 2. Mapa mental (fases e APIs da jornada)");
  lines.push("");
  lines.push("```mermaid");
  lines.push(mindmapBody);
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}
