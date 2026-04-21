const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Normaliza um SHA-256 em minúsculas ou retorna null se vazio/ inválido.
 * O [VirusTotal](https://www.virustotal.com/gui/home/upload) identifica ficheiros na GUI por hash (tipicamente SHA-256).
 */
export function normalizeOptionalSampleSha256(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return SHA256_HEX.test(trimmed) ? trimmed : null;
}

/** URL da ficha do ficheiro na GUI do VirusTotal (hash SHA-256). */
export function virusTotalGuiFileUrl(sha256Lowercase: string): string {
  return `https://www.virustotal.com/gui/file/${sha256Lowercase}`;
}

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value.trim());
}
