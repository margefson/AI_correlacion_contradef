const STORAGE_KEY = "contradef_reduce_logs_active_job_id";

const JOB_ID_RE = /^ctr-[A-Za-z0-9_-]+$/;

export function readPersistedReduceLogsJobId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    return JOB_ID_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writePersistedReduceLogsJobId(jobId: string) {
  if (typeof window === "undefined" || !JOB_ID_RE.test(jobId)) return;
  try {
    localStorage.setItem(STORAGE_KEY, jobId);
  } catch {
    /* quota / private mode */
  }
}

/** Chamado ao iniciar um novo envio para não reabrir o job anterior se a página for recarregada a meio do upload. */
export function clearPersistedReduceLogsJobId() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
