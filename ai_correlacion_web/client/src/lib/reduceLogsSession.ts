const LEGACY_KEY = "contradef_reduce_logs_active_job_id";
const TRACKED_KEY = "contradef_reduce_logs_tracked_job_ids_v2";
const SELECTED_KEY = "contradef_reduce_logs_selected_job_id_v2";

const JOB_ID_RE = /^ctr-[A-Za-z0-9_-]+$/;
export const MAX_TRACKED_LOTS = 30;

function readLegacyJobIdStorage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(LEGACY_KEY)?.trim() ?? "";
    return JOB_ID_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function parseIdList(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((e): e is string => typeof e === "string" && JOB_ID_RE.test(e));
  } catch {
    return [];
  }
}

function normalizeTrackedIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (JOB_ID_RE.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.slice(0, MAX_TRACKED_LOTS);
}

/**
 * Todos os lotes a acompanhar nesta página (navegador). Não apaga jobs no servidor.
 */
export function readTrackedJobIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const fromV2 = parseIdList(localStorage.getItem(TRACKED_KEY));
    if (fromV2.length) {
      return normalizeTrackedIds(fromV2);
    }
    const legacy = readLegacyJobIdStorage();
    if (legacy) {
      try {
        localStorage.setItem(TRACKED_KEY, JSON.stringify([legacy]));
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* */
      }
      return [legacy];
    }
  } catch {
    /* */
  }
  return [];
}

export function writeTrackedJobIds(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  const norm = normalizeTrackedIds(ids);
  try {
    if (!norm.length) {
      localStorage.removeItem(TRACKED_KEY);
      return;
    }
    localStorage.setItem(TRACKED_KEY, JSON.stringify(norm));
  } catch {
    /* quota / private */
  }
}

export function readSelectedJobId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(SELECTED_KEY)?.trim() ?? "";
    return JOB_ID_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeSelectedJobId(jobId: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (!jobId || !JOB_ID_RE.test(jobId)) {
      localStorage.removeItem(SELECTED_KEY);
      return;
    }
    localStorage.setItem(SELECTED_KEY, jobId);
  } catch {
    /* */
  }
}

export function prependTrackedJobId(id: string) {
  if (!JOB_ID_RE.test(id)) {
    return;
  }
  const cur = readTrackedJobIds();
  writeTrackedJobIds(nextTrackedAfterPrepend(id, cur));
}

export function nextTrackedAfterPrepend(jobId: string, prev: string[]): string[] {
  return normalizeTrackedIds([jobId, ...prev.filter((x) => x !== jobId)]);
}

export function removeTrackedJobIdFromStorage(id: string) {
  const cur = readTrackedJobIds().filter((j) => j !== id);
  writeTrackedJobIds(cur);
  const sel = readSelectedJobId();
  if (sel === id) {
    writeSelectedJobId(cur[0] ?? null);
  }
}

// --- legado: compat; preferir readTrackedJobIds + selected ---

export function readPersistedReduceLogsJobId(): string | null {
  const ids = readTrackedJobIds();
  return ids[0] ?? null;
}

export function writePersistedReduceLogsJobId(jobId: string) {
  if (typeof window === "undefined" || !JOB_ID_RE.test(jobId)) {
    return;
  }
  prependTrackedJobId(jobId);
  writeSelectedJobId(jobId);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* */
  }
}

/** Chamado ao iniciar envio: já não apaga a lista; só limpa a chave legada. */
export function clearPersistedReduceLogsJobId() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* */
  }
}
