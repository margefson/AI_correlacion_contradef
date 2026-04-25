/**
 * Ative com: `localStorage.setItem("contradef_reduce_logs_debug", "1")` e recarregue. Desligue: `removeItem` ou `"0"`.
 * Em **produção**, o snapshot de memória/disco do servidor também exige `CONTRADEF_SERVER_DEBUG=1` no processo
 * (ex.: variável no Render) — senão a API não anexa `serverProcessDebug` ao `analysis.detail`.
 */
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

/** Enviado com cada pedido tRPC para o servidor poder anexar métricas ao detalhe do job. */
export function getTrpcClientDebugHeaders(): Record<string, string> {
  if (!isReduceLogsDebugEnabled()) {
    return {};
  }
  return { "X-Contradef-Client-Debug": "1" };
}
