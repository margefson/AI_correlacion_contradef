import pako from "pako";

/** Estado mínimo compatível com o Mermaid Live Editor (`serializeState` → JSON → deflate → base64url). */
function buildLiveEditorStatePayload(code: string): string {
  const state = {
    code: code.trim(),
    mermaid: JSON.stringify({ theme: "default" }),
    updateDiagram: true,
    rough: false,
    grid: true,
    panZoom: true,
  };
  return JSON.stringify(state);
}

function uint8ArrayToBase64Url(u8: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Link para abrir no [Mermaid AI Live](https://mermaid.ai/live) com `#pako:` (mesmo formato do editor oficial). */
export function buildMermaidAiLiveViewUrl(diagramDefinition: string): string {
  const json = buildLiveEditorStatePayload(diagramDefinition);
  const deflated = pako.deflate(new TextEncoder().encode(json), { level: 9 });
  return `https://mermaid.ai/live/view#pako:${uint8ArrayToBase64Url(deflated)}`;
}
