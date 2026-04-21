export function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Falha ao ler o arquivo selecionado."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Falha ao converter o arquivo para base64."));
    reader.readAsDataURL(file);
  });
}

export function calculateReductionPercent(original?: number | null, reduced?: number | null): number {
  if (!original || original <= 0 || typeof reduced !== "number") return 0;
  return Math.max(0, Math.min(100, (1 - reduced / original) * 100));
}
