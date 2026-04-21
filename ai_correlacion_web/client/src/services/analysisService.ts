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
  files: UploadCompletionFilePayload[];
};

type LegacyUploadRequest = {
  analysisName: string;
  focusTerms: string;
  focusRegexes: string;
  origin: string;
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

export async function uploadReduceLogsLegacy(payload: LegacyUploadRequest) {
  const formData = new FormData();
  formData.append("analysisName", payload.analysisName);
  formData.append("focusTerms", payload.focusTerms);
  formData.append("focusRegexes", payload.focusRegexes);
  formData.append("origin", payload.origin);
  payload.files.forEach((file) => formData.append("logs", file, file.name));

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
