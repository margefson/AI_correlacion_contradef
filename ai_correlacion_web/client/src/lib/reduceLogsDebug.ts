/** Ative com: localStorage.setItem("contradef_reduce_logs_debug", "1") e recarregue. Desligue: removeItem ou "0". */
const STORAGE_KEY = "contradef_reduce_logs_debug";

export function isReduceLogsDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim().toLowerCase() ?? "";
    return raw === "1" || raw === "true" || raw === "yes";
  } catch {
    return false;
  }
}
