/**
 * Identificador VirusTotal para `GET /api/v3/urls/{url_id}` conforme VT v3
 * ([documentação oficial](https://developers.virustotal.com/reference/url)): UTF-8
 * → Base64 URL-safe RFC 4648 §5, sem caracteres `=`.
 */
export function virusTotalUrlIdentifier(url: string): string {
  const trimmed = url.trim();
  let binary = "";
  const chunk = new TextEncoder().encode(trimmed);
  chunk.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
