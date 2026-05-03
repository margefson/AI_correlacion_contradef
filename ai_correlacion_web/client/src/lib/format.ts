/** Human-readable bytes (B–TB). */
export function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Integer percent 0–100 (ex.: progresso de job). */
export function formatPercentRounded(value?: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

/** Percentual com decimais (ex.: redução por arquivo). */
export function formatPercentFine(value?: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(100, value)).toFixed(value >= 10 ? 1 : 2)}%`;
}

/** Fuso de Manaus (Amazonas); instantes vindos do servidor (UTC ISO) aparecem na hora local da região. */
export const TIME_ZONE_MANAUS = "America/Manaus";

/** Data/hora compacta pt-BR. Passe `timeZone` para forçar um fuso (ex.: `TIME_ZONE_MANAUS`). */
export function formatDateTimeShort(
  value?: Date | string | number | null,
  options?: Pick<Intl.DateTimeFormatOptions, "timeZone" | "timeZoneName">,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    ...options,
  });
}

/** Alias para relatórios e listagens no fuso de Manaus (UTC−4). */
export function formatDateTimeManaus(value?: Date | string | number | null): string {
  return formatDateTimeShort(value, { timeZone: TIME_ZONE_MANAUS });
}

/** `toLocaleString("pt-BR")` completo (eventos de job). */
export function formatDateTimeLocale(value?: Date | string | number | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

export function formatDurationMs(value?: number | null): string {
  if (!value || value <= 0) return "—";
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
