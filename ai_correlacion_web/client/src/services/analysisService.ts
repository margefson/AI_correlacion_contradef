import type { LogType } from "@/pages/reduceLogsMonitor";

export type UploadInitResponse = {
  sessionId: string;
  maxChunkBytes: number;
  files: Array<{
    fileId: string;
    fileName: string;
    logType: LogType;
    sizeBytes: number;
    chunkCount?: number;
    reused?: boolean;
    storageSessionId?: string;
    storageFileId?: string;
  }>;
};

export type UploadApiError = {
  message?: string;
};

export type UploadCapabilitiesResponse = {
  mode?: string;
  maxChunkBytes?: number;
  storageConfigured?: boolean;
};

export type UploadCompletionFilePayload = {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  logType: LogType;
  chunkCount: number;
  lastModifiedMs: number;
  uploadDurationMs: number;
  reused: boolean;
  storageSessionId?: string;
  storageFileId?: string;
};

type UploadInitRequest = {
  analysisName: string;
  focusTerms: string;
  focusRegexes: string;
  origin: string;
  files: Array<{
    fileName: string;
    sizeBytes: number;
    logType: LogType;
    lastModifiedMs: number;
  }>;
};

type UploadCompleteRequest = {
  sessionId: string;
  analysisName: string;
  focusTerms: string;
  focusRegexes: string;
  origin: string;
  /** SHA-256 (64 hex) do binário analisado — opcional, para VirusTotal e notas. */
  sampleSha256?: string;
  files: UploadCompletionFilePayload[];
};

type LegacyUploadRequest = {
  analysisName: string;
  focusTerms: string;
  focusRegexes: string;
  origin: string;
  sampleSha256?: string;
  files: File[];
};

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) as T : {} as T;
}

export async function initReduceLogsUpload(payload: UploadInitRequest) {
  const response = await fetch("/api/reduce-logs/upload/init", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse<UploadInitResponse | UploadApiError>(response);
  if (!response.ok || !("sessionId" in data)) {
    throw new Error((data as UploadApiError | undefined)?.message ?? "Não foi possível preparar o upload do lote.");
  }
  return data;
}

export async function getReduceLogsUploadCapabilities() {
  const response = await fetch("/api/reduce-logs/upload/capabilities", {
    method: "GET",
    credentials: "include",
  });
  const data = await readJsonResponse<UploadCapabilitiesResponse | UploadApiError>(response);
  if (!response.ok) {
    throw new Error((data as UploadApiError | undefined)?.message ?? "Não foi possível consultar as capacidades de upload.");
  }
  return data as UploadCapabilitiesResponse;
}

export async function uploadReduceLogsChunk(sessionId: string, fileId: string, chunkIndex: number, chunk: Blob) {
  const response = await fetch(
    `/api/reduce-logs/upload/chunk?sessionId=${encodeURIComponent(sessionId)}&fileId=${encodeURIComponent(fileId)}&chunkIndex=${chunkIndex}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk,
    },
  );
  const data = await readJsonResponse<{ message?: string; uploadProgress?: number }>(response);
  if (!response.ok) {
    throw new Error(data?.message ?? "Falha ao enviar um bloco do arquivo.");
  }
  return data;
}

export async function completeReduceLogsUpload(payload: UploadCompleteRequest) {
  const response = await fetch("/api/reduce-logs/upload/complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse<{ message?: string; job?: { jobId?: string | null } }>(response);
  if (!response.ok) {
    throw new Error(data?.message ?? "Não foi possível iniciar a redução após o upload.");
  }
  return data;
}

function buildReduceLogsLegacyFormData(payload: LegacyUploadRequest) {
  const formData = new FormData();
  formData.append("analysisName", payload.analysisName);
  formData.append("focusTerms", payload.focusTerms);
  formData.append("focusRegexes", payload.focusRegexes);
  formData.append("origin", payload.origin);
  if (payload.sampleSha256?.trim()) {
    formData.append("sampleSha256", payload.sampleSha256.trim());
  }
  payload.files.forEach((file) => formData.append("logs", file, file.name));
  return formData;
}

/**
 * `fetch` com multipart não expõe progresso de upload. Com XHR, o evento
 * `upload` permite mostrar barra/percentagem (modo directo / legacy).
 */
export function uploadReduceLogsLegacyWithProgress(
  payload: LegacyUploadRequest,
  onProgress?: (info: { loaded: number; total: number; percent: number }) => void,
): Promise<{ message?: string; job?: { jobId?: string | null } }> {
  const formData = buildReduceLogsLegacyFormData(payload);
  const totalBytesHint = payload.files.reduce((s, f) => s + f.size, 0);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/reduce-logs/upload");
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.upload.addEventListener("progress", (e) => {
      if (!onProgress) return;
      const total = e.lengthComputable && e.total > 0 ? e.total : totalBytesHint;
      const loaded = e.loaded;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      onProgress({ loaded, total, percent });
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = (xhr.responseText ? JSON.parse(xhr.responseText) : {}) as {
            message?: string;
            job?: { jobId?: string | null };
          };
          resolve(data);
        } catch {
          reject(new Error("Resposta inválida do servidor após o envio do lote."));
        }
        return;
      }
      let msg = "Não foi possível iniciar o upload legado.";
      try {
        const data = JSON.parse(xhr.responseText || "{}") as { message?: string };
        if (data?.message) msg = data.message;
      } catch {
        /* ignore */
      }
      reject(new Error(msg));
    });
    xhr.addEventListener("error", () => {
      reject(new Error("Falha de rede ao enviar o lote (verifique a ligação e tente de novo)."));
    });
    xhr.addEventListener("abort", () => {
      reject(new Error("Envio interrompido."));
    });
    xhr.send(formData);
  });
}

export async function uploadReduceLogsLegacy(payload: LegacyUploadRequest) {
  const formData = buildReduceLogsLegacyFormData(payload);

  const response = await fetch("/api/reduce-logs/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await readJsonResponse<{ message?: string; job?: { jobId?: string | null } }>(response);
  if (!response.ok) {
    throw new Error(data?.message ?? "Não foi possível iniciar o upload legado.");
  }
  return data;
}
