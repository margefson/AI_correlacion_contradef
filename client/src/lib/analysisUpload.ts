export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const GATEWAY_SINGLE_REQUEST_MAX_BYTES = 30 * 1024 * 1024;
export const CHUNK_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_BATCH_UPLOAD_FILES = 10;

const SEVEN_Z_SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] as const;

export type AnalysisUploadInput = {
  file: File;
  focusFunction: string;
  focusTerms: string[];
  focusRegexes: string[];
  origin?: string;
};

export type AnalysisUploadBatchInput = Omit<AnalysisUploadInput, "file"> & {
  files: File[];
};

export type AnalysisUploadResult = {
  jobId: string;
  [key: string]: unknown;
};

export type UploadRetryStage = "session" | "chunk" | "complete";

export type AnalysisUploadOptions = {
  onUploadProgress?: (progress: number) => void;
  onUploadRetry?: (attempt: number, stage: UploadRetryStage, error: Error) => void;
};

export type AnalysisUploadBatchOptions = {
  onFileStart?: (file: File, fileIndex: number, fileCount: number) => void;
  onFileProgress?: (file: File, progress: number, fileIndex: number, fileCount: number) => void;
  onFileRetry?: (file: File, attempt: number, stage: UploadRetryStage, error: Error, fileIndex: number, fileCount: number) => void;
  onFileSuccess?: (file: File, result: AnalysisUploadResult, fileIndex: number, fileCount: number) => void;
  onFileError?: (file: File, error: Error, fileIndex: number, fileCount: number) => void;
};

export type AnalysisArchiveInspection = {
  ok: boolean;
  message: string;
  remainingBytes: number;
  usesChunkedTransport: boolean;
  chunkCount: number;
};

type UploadSession = {
  uploadId: string;
  archiveName: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  maxArchiveBytes: number;
  directTransportMaxBytes: number;
  focusFunction: string;
  receivedChunkIndexes?: number[];
  updatedAt?: number;
};

const UPLOAD_SESSION_STORAGE_PREFIX = "ai-correlacion-upload-session";

function extractResponseMessage(status: number, responseText: string): string {
  const trimmed = responseText.trim();

  if (!trimmed) {
    if (status === 401) {
      return "Sua sessão expirou. Faça login novamente antes de enviar o arquivo.";
    }
    if (status === 413) {
      return `O arquivo excede o limite operacional de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB suportado pela aplicação atual.`;
    }
    return "O backend não retornou uma mensagem legível para esta submissão.";
  }

  try {
    const parsed = JSON.parse(trimmed) as { message?: string };
    if (parsed?.message) return parsed.message;
  } catch {
    // A resposta pode ser HTML ou texto puro; tratamos abaixo com fallback amigável.
  }

  if (trimmed.startsWith("<")) {
    if (status === 413) {
      return `O arquivo excede o limite por requisição do domínio publicado. O cliente passou a enviar o pacote em partes para contornar esse bloqueio, mas o gateway interrompeu uma requisição antes da resposta JSON.`;
    }
    return "O servidor devolveu uma página HTML inesperada em vez de JSON. A requisição não foi processada pelo endpoint de upload esperado.";
  }

  return trimmed;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  const message = extractResponseMessage(response.status, responseText);

  if (!response.ok) {
    throw new Error(message);
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(message);
  }
}

async function postJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseJsonResponse<T>(response);
}

async function getJson<T>(url: string) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse<T>(response);
}

async function postForm<T>(url: string, formData: FormData) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  return parseJsonResponse<T>(response);
}

function normalizeUploadError(error: unknown) {
  return error instanceof Error ? error : new Error("Falha operacional ao transferir o arquivo para análise.");
}

function buildStoredUploadSessionKey(input: AnalysisUploadInput) {
  return [
    UPLOAD_SESSION_STORAGE_PREFIX,
    input.file.name,
    input.file.size,
    input.file.lastModified,
    input.focusFunction,
  ].join("::");
}

function readStoredUploadSessionId(storageKey: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey);
}

function persistStoredUploadSessionId(storageKey: string, uploadId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, uploadId);
}

function clearStoredUploadSessionId(storageKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
}

function chunkByteLength(chunkIndex: number, chunkSize: number, totalBytes: number) {
  const start = chunkIndex * chunkSize;
  const end = Math.min(totalBytes, start + chunkSize);
  return Math.max(0, end - start);
}

async function recoverUploadSession(input: AnalysisUploadInput, storageKey: string) {
  const storedUploadId = readStoredUploadSessionId(storageKey);
  if (!storedUploadId) return null;

  try {
    const session = await getJson<UploadSession>(`/api/analysis/upload-sessions/${storedUploadId}`);
    if (
      session.archiveName !== input.file.name ||
      session.totalBytes !== input.file.size ||
      session.focusFunction !== input.focusFunction
    ) {
      clearStoredUploadSessionId(storageKey);
      return null;
    }

    return session;
  } catch {
    clearStoredUploadSessionId(storageKey);
    return null;
  }
}

async function runWithRetry<T>(
  operation: () => Promise<T>,
  stage: UploadRetryStage,
  onRetry: AnalysisUploadOptions["onUploadRetry"],
  maxAttempts = 3,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = normalizeUploadError(error);
      if (attempt >= maxAttempts) break;
      onRetry?.(attempt + 1, stage, lastError);
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 400));
    }
  }

  throw lastError ?? new Error("Falha operacional ao transferir o arquivo para análise.");
}

async function hasValidSevenZipSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, SEVEN_Z_SIGNATURE.length).arrayBuffer());
  if (header.length < SEVEN_Z_SIGNATURE.length) return false;
  return SEVEN_Z_SIGNATURE.every((byte, index) => header[index] === byte);
}

export async function inspectAnalysisArchive(file: File): Promise<AnalysisArchiveInspection> {
  const remainingBytes = Math.max(0, MAX_ARCHIVE_BYTES - file.size);
  const usesChunkedTransport = file.size > GATEWAY_SINGLE_REQUEST_MAX_BYTES;
  const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES));

  if (!file.name.toLowerCase().endsWith(".7z")) {
    return {
      ok: false,
      message: "A plataforma aceita apenas arquivos .7z nesta etapa.",
      remainingBytes,
      usesChunkedTransport,
      chunkCount,
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      message: "O arquivo selecionado está vazio.",
      remainingBytes,
      usesChunkedTransport,
      chunkCount,
    };
  }

  if (file.size > MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      message: `O arquivo excede o limite operacional de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB suportado pela aplicação atual.`,
      remainingBytes,
      usesChunkedTransport,
      chunkCount,
    };
  }

  const signatureIsValid = await hasValidSevenZipSignature(file);
  if (!signatureIsValid) {
    return {
      ok: false,
      message: "O pacote selecionado não apresenta a assinatura binária esperada de um arquivo 7z válido.",
      remainingBytes,
      usesChunkedTransport,
      chunkCount,
    };
  }

  return {
    ok: true,
    message: usesChunkedTransport
      ? `Assinatura 7z validada. O envio ocorrerá em ${chunkCount} partes seguras para contornar o limite por requisição do domínio publicado.`
      : "Assinatura 7z validada. O arquivo pode seguir pelo fluxo protegido desta aplicação.",
    remainingBytes,
    usesChunkedTransport,
    chunkCount,
  };
}

export async function uploadAnalysisArchive(
  input: AnalysisUploadInput,
  options: AnalysisUploadOptions = {},
): Promise<AnalysisUploadResult> {
  const inspection = await inspectAnalysisArchive(input.file);
  if (!inspection.ok) {
    throw new Error(inspection.message);
  }

  const storageKey = buildStoredUploadSessionKey(input);
  let session = await recoverUploadSession(input, storageKey);

  if (!session) {
    options.onUploadProgress?.(0);
    session = await runWithRetry(
      () => postJson<UploadSession>("/api/analysis/upload-sessions", {
        archiveName: input.file.name,
        totalBytes: input.file.size,
        focusFunction: input.focusFunction,
        focusTerms: input.focusTerms,
        focusRegexes: input.focusRegexes,
        origin: input.origin,
      }),
      "session",
      options.onUploadRetry,
    );
    persistStoredUploadSessionId(storageKey, session.uploadId);
  }

  const chunkSize = Math.max(1, Math.min(session.chunkSize || CHUNK_UPLOAD_MAX_BYTES, CHUNK_UPLOAD_MAX_BYTES));
  const receivedChunkIndexes = new Set(session.receivedChunkIndexes ?? []);
  let uploadedBytes = Array.from(receivedChunkIndexes).reduce(
    (sum, chunkIndex) => sum + chunkByteLength(chunkIndex, chunkSize, input.file.size),
    0,
  );

  options.onUploadProgress?.(
    uploadedBytes > 0 ? Math.max(1, Math.min(99, Math.round((uploadedBytes / input.file.size) * 100))) : 0,
  );

  for (let chunkIndex = 0, start = 0; start < input.file.size; start += chunkSize, chunkIndex += 1) {
    if (receivedChunkIndexes.has(chunkIndex)) {
      continue;
    }

    const end = Math.min(input.file.size, start + chunkSize);
    const formData = new FormData();
    formData.append("chunk", input.file.slice(start, end), `${input.file.name}.part-${chunkIndex}`);
    formData.append("chunkIndex", String(chunkIndex));

    await runWithRetry(
      () => postForm(`/api/analysis/upload-sessions/${session.uploadId}/chunks`, formData),
      "chunk",
      options.onUploadRetry,
    );

    receivedChunkIndexes.add(chunkIndex);
    uploadedBytes += chunkByteLength(chunkIndex, chunkSize, input.file.size);
    options.onUploadProgress?.(Math.max(1, Math.min(99, Math.round((uploadedBytes / input.file.size) * 100))));
  }

  const createdJob = await runWithRetry(
    () => postJson<AnalysisUploadResult>(`/api/analysis/upload-sessions/${session.uploadId}/complete`, {}),
    "complete",
    options.onUploadRetry,
  );
  clearStoredUploadSessionId(storageKey);
  options.onUploadProgress?.(100);
  return createdJob;
}

export async function uploadAnalysisArchiveBatch(
  input: AnalysisUploadBatchInput,
  options: AnalysisUploadBatchOptions = {},
) {
  const files = input.files.slice(0, MAX_BATCH_UPLOAD_FILES);
  const results: Array<{ file: File; result?: AnalysisUploadResult; error?: Error }> = [];

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex]!;
    options.onFileStart?.(file, fileIndex, files.length);
    try {
      const result = await uploadAnalysisArchive(
        {
          file,
          focusFunction: input.focusFunction,
          focusTerms: input.focusTerms,
          focusRegexes: input.focusRegexes,
          origin: input.origin,
        },
        {
          onUploadProgress: (progress) => options.onFileProgress?.(file, progress, fileIndex, files.length),
          onUploadRetry: (attempt, stage, error) => options.onFileRetry?.(file, attempt, stage, error, fileIndex, files.length),
        },
      );

      options.onFileSuccess?.(file, result, fileIndex, files.length);
      results.push({ file, result });
    } catch (error) {
      const normalizedError = normalizeUploadError(error);
      options.onFileError?.(file, normalizedError, fileIndex, files.length);
      results.push({ file, error: normalizedError });
    }
  }

  return results;
}
