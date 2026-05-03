import { describe, expect, it } from "vitest";

import { renderMalwareFlowMapMarkdown } from "./flowGraphMindMapMarkdown";

describe("renderMalwareFlowMapMarkdown", () => {
  it("inclui flowchart e mindmap a partir de um grafo mínimo", () => {
    const md = renderMalwareFlowMapMarkdown({
      classification: "Trojan",
      sampleName: "teste",
      flowGraph: {
        nodes: [
          { id: "phase:Evasão", label: "Evasão", kind: "phase", severity: "medium" },
          { id: "event:0:IsDebuggerPresent", label: "IsDebuggerPresent", kind: "api", severity: "high" },
          { id: "verdict:discovery", label: "Descoberta: Trojan", kind: "verdict", severity: "high" },
        ],
        edges: [
          { source: "phase:Evasão", target: "event:0:IsDebuggerPresent", relation: "evidência" },
          { source: "event:0:IsDebuggerPresent", target: "verdict:discovery", relation: "leva ao veredito" },
        ],
      },
    });
    expect(md).toContain("# Mapa do fluxo do malware");
    expect(md).toContain("flowchart TB");
    expect(md).toContain("mindmap");
    expect(md).toContain("IsDebuggerPresent");
    expect(md).toContain("Trojan");
  });
});
