export const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;

export type AnalysisUploadInput = {
  file: File;
  focusFunction: string;
  focusTerms: string[];
  focusRegexes: string[];
  origin?: string;
};

export type AnalysisUploadResult = {
  jobId: string;
  [key: string]: unknown;
};

export type AnalysisUploadOptions = {
  onUploadProgress?: (progress: number) => void;
};

function extractResponseMessage(status: number, responseText: string): string {
  const trimmed = responseText.trim();

  if (!trimmed) {
    if (status === 401) {
      return "Sua sessão expirou. Faça login novamente antes de enviar o arquivo.";
    }
    if (status === 413) {
      return `O arquivo excede o limite operacional de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB aceito pelo domínio publicado.`;
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
      return `O arquivo excede o limite operacional de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB aceito pelo domínio publicado. O gateway interrompeu o upload antes de o endpoint JSON processar a requisição.`;
    }
    return "O servidor devolveu uma página HTML inesperada em vez de JSON. A requisição não foi processada pelo endpoint de upload esperado.";
  }

  return trimmed;
}

export function uploadAnalysisArchive(
  input: AnalysisUploadInput,
  options: AnalysisUploadOptions = {},
): Promise<AnalysisUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("archive", input.file, input.file.name);
    formData.append("focusFunction", input.focusFunction);
    formData.append("focusTerms", JSON.stringify(input.focusTerms));
    formData.append("focusRegexes", JSON.stringify(input.focusRegexes));
    if (input.origin) {
      formData.append("origin", input.origin);
    }

    xhr.open("POST", "/api/analysis/upload");
    xhr.withCredentials = true;
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      options.onUploadProgress?.(progress);
    };

    xhr.onload = () => {
      const responseText = typeof xhr.responseText === "string" ? xhr.responseText : "";
      const message = extractResponseMessage(xhr.status, responseText);

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(message));
        return;
      }

      try {
        const parsed = JSON.parse(responseText) as AnalysisUploadResult;
        resolve(parsed);
      } catch {
        reject(new Error(message));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Falha de rede ao transferir o arquivo para o backend web."));
    };

    xhr.onabort = () => {
      reject(new Error("O envio do arquivo foi interrompido antes da criação do job."));
    };

    xhr.send(formData);
  });
}
