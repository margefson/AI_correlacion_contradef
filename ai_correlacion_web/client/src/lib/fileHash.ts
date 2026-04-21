/** Limite para cálculo de SHA-256 no navegador (evita esgotar memória). */
const MAX_SAMPLE_BYTES = 512 * 1024 * 1024;

/**
 * Calcula o SHA-256 completo do ficheiro e devolve 64 caracteres hex minúsculos.
 * Use para correlacionar com a GUI do VirusTotal (`/gui/file/<sha256>`).
 */
export async function computeSha256HexFromFile(file: File): Promise<string> {
  if (file.size > MAX_SAMPLE_BYTES) {
    throw new Error(
      `Ficheiro demasiado grande para calcular o hash aqui (máx. ${Math.round(MAX_SAMPLE_BYTES / (1024 * 1024))} MB). Cole o SHA-256 manualmente.`,
    );
  }

  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
