export type LogType = "FunctionInterceptor" | "TraceFcnCall" | "TraceMemory" | "TraceInstructions" | "TraceDisassembly" | "Unknown";
export type ProcessingStatus = "queued" | "uploading" | "running" | "completed" | "failed";

export type SubmittedFileMonitor = {
  fileName: string;
  logType: LogType;
  sizeBytes: number;
  uploadProgress: number;
  uploadStatus: ProcessingStatus;
  uploadFileId?: string;
  uploadDurationMs?: number;
  uploadReused?: boolean;
};

export type DetailFileMonitor = {
  fileName: string;
  logType?: LogType | string;
  status?: ProcessingStatus | string;
  progress?: number;
  currentStage?: string;
  currentStep?: string;
  lastMessage?: string;
  originalLineCount?: number;
  reducedLineCount?: number;
  originalBytes?: number;
  reducedBytes?: number;
  suspiciousEventCount?: number;
  triggerCount?: number;
  uploadDurationMs?: number;
  uploadReused?: boolean;
};

export type FileMonitor = {
  fileName: string;
  logType: LogType;
  sizeBytes: number;
  uploadProgress: number;
  uploadStatus: ProcessingStatus;
  processingStatus: ProcessingStatus;
  /** `null` = percentagem ainda desconhecida (evita marcos enganadores como 20 %/45 %). */
  processingProgress: number | null;
  currentStage: string;
  currentStep: string;
  lastMessage: string;
  originalLineCount: number;
  reducedLineCount: number;
  originalBytes: number;
  reducedBytes: number;
  suspiciousEventCount: number;
  triggerCount: number;
  uploadDurationMs: number;
  uploadReused: boolean;
};

export function isArchiveContainerFile(fileName: string) {
  const lowered = fileName.toLowerCase();
  return lowered.endsWith(".7z") || lowered.endsWith(".zip") || lowered.endsWith(".rar");
}

/** Último segmento (Windows/macOS/Unix) — alinha p.ex. `Pasta/x.cdf` com `x.cdf` do input do browser. */
function logFileBasename(fileName: string): string {
  const parts = fileName.split(/[/\\]/);
  return parts.at(-1) ?? fileName;
}

/**
 * Faz corresponder a linha da grelha (nome vindo do servidor) ao estado de upload local pelo nome
 * completo; se não houver, tenta o basename quando for inequívoco.
 */
function resolveLocalForRow(
  fileName: string,
  localByFullName: Map<string, SubmittedFileMonitor>,
  submittedList: SubmittedFileMonitor[],
): SubmittedFileMonitor | undefined {
  const direct = localByFullName.get(fileName);
  if (direct) return direct;
  const base = logFileBasename(fileName);
  const byBase = submittedList.filter((f) => logFileBasename(f.fileName) === base);
  if (byBase.length === 1) return byBase[0]!;
  return undefined;
}

export function inferLogType(fileName: string): LogType {
  const lowered = fileName.toLowerCase();
  if (lowered.includes("functioninterceptor") || lowered.includes("function_interceptor")) return "FunctionInterceptor";
  if (lowered.includes("tracefcncall") || lowered.includes("trace_fcn_call")) return "TraceFcnCall";
  if (lowered.includes("tracememory") || lowered.includes("trace_memory")) return "TraceMemory";
  if (lowered.includes("traceinstructions") || lowered.includes("trace_instructions")) return "TraceInstructions";
  if (lowered.includes("tracedisassembly") || lowered.includes("trace_disassembly")) return "TraceDisassembly";
  return "Unknown";
}

/**
 * % mostrada na coluna "Reduzido": após conclusão, redução real de volume; antes disso, 0% ou o progresso
 * de leitura/heurística (0–100) para não mostrar 100% por engano com `reducedBytes === 0`.
 */
export function getFileReductionDisplayPercent(file: FileMonitor): number {
  if (file.originalBytes <= 0) {
    return 0;
  }
  if (file.processingStatus === "completed") {
    return Math.max(0, Math.min(100, 100 * (1 - file.reducedBytes / file.originalBytes)));
  }
  if (file.processingStatus === "failed") {
    return 0;
  }
  if (file.reducedBytes > 0 && file.reducedBytes < file.originalBytes) {
    return Math.max(0, Math.min(100, 100 * (1 - file.reducedBytes / file.originalBytes)));
  }
  if (file.processingStatus === "running" && file.processingProgress != null) {
    return Math.max(0, Math.min(100, file.processingProgress));
  }
  return 0;
}

export function getFileInterpretation(file: FileMonitor) {
  if (file.uploadStatus === "failed" || file.processingStatus === "failed") {
    return "O fluxo foi interrompido antes da consolidação final e exige nova submissão ou revisão do arquivo.";
  }
  if (file.uploadStatus === "uploading") {
    return file.sizeBytes >= 1024 * 1024 * 1024
      ? "O envio em partes ainda está em andamento; arquivos multi-GB podem levar mais tempo antes de entrar na fila analítica."
      : "O arquivo ainda está sendo transmitido ao servidor e ainda não entrou na etapa heurística.";
  }
  if (file.processingStatus === "queued") {
    return file.uploadReused
      ? "O arquivo foi reaproveitado do servidor e já entrou na fila do lote atual; a próxima atualização deve abrir a leitura heurística sem novo envio."
      : "O arquivo já foi recebido integralmente e aguarda a abertura da etapa heurística do lote atual.";
  }
  if (file.processingStatus === "running") {
    return "A redução está em curso e a leitura final depende da conclusão da etapa atual indicada no painel operacional.";
  }
  if (file.triggerCount > 0 || file.suspiciousEventCount > 0) {
    return "A redução preservou sinais relevantes para triagem posterior e priorização investigativa.";
  }
  return "A redução terminou sem destaque crítico explícito, exigindo revisão contextual antes do veredito final.";
}

export function getFileRecommendation(file: FileMonitor) {
  if (file.uploadStatus === "failed" || file.processingStatus === "failed") {
    return "Reenvie apenas este log, valide integridade do arquivo e confirme se o tipo inferido corresponde ao artefato da Contradef.";
  }
  if (file.uploadStatus === "uploading") {
    return file.sizeBytes >= 1024 * 1024 * 1024
      ? "Mantenha a guia aberta até o envio em partes alcançar 100%; o processamento só começa após o recebimento integral do lote."
      : "Acompanhe o progresso do envio (barra ou % por ficheiro) até 100% antes de esperar métricas de redução ou eventos preservados.";
  }
  if (file.processingStatus === "queued") {
    return file.uploadReused
      ? "Não reenviar este arquivo. Acompanhe apenas a fila do lote e aguarde a mudança para leitura heurística neste mesmo painel."
      : "O upload terminou. Aguarde a fila do lote e acompanhe a transição para leitura heurística neste mesmo painel.";
  }
  if (file.processingStatus === "running") {
    return "Use a etapa atual e a mensagem operacional para verificar se o arquivo está em leitura, filtragem heurística ou consolidação do resultado reduzido.";
  }
  if (file.triggerCount > 0 || file.suspiciousEventCount > 0) {
    return "Priorize este log na análise posterior, pois a redução manteve gatilhos e sinais críticos úteis para interpretação do comportamento.";
  }
  return "Conclua a revisão de contexto e compare este resultado com os demais logs do mesmo lote antes de encerrar o parecer.";
}

export function buildMonitoredFiles(submittedFiles: SubmittedFileMonitor[], detailFiles: DetailFileMonitor[]) {
  /** A grelha de acompanhamento é só para logs; nunca listar o .7z/.zip/.rar (após extração, as linhas vêm do detalhe do servidor). */
  const detailRows = detailFiles.filter((file) => !isArchiveContainerFile(file.fileName));
  const normalizedSubmitted = submittedFiles.filter((file) => !isArchiveContainerFile(file.fileName));

  const detailMap = new Map(detailRows.map((file) => [file.fileName, file]));
  const localMap = new Map(normalizedSubmitted.map((file) => [file.fileName, file]));
  const allNames = Array.from(new Set([
    ...normalizedSubmitted.map((file) => file.fileName),
    ...detailRows.map((file) => file.fileName),
  ]));

  return allNames.map((fileName) => {
    const local = resolveLocalForRow(fileName, localMap, normalizedSubmitted);
    const detail = detailMap.get(fileName);
    const processingStatus = (detail?.status as ProcessingStatus | undefined)
      ?? (local?.uploadStatus === "failed" ? "failed" : "queued");
    const processingProgress: number | null = typeof detail?.progress === "number" && Number.isFinite(detail.progress)
      ? detail.progress
      : processingStatus === "completed"
        ? 100
        : processingStatus === "failed"
          ? 0
          : processingStatus === "running"
            ? null
            : 0;
    const uploadStatus = local?.uploadStatus ?? (detail ? "completed" : "queued");
    const uploadReused = detail?.uploadReused ?? local?.uploadReused ?? false;
    const isPreUpload = local?.uploadStatus === "uploading" && (local?.uploadProgress ?? 0) === 0;
    const fallbackStage = isPreUpload
      ? "A preparar envio (servidor)"
      : uploadStatus === "uploading"
        ? "Enviando arquivo em partes"
        : uploadStatus === "failed"
        ? "Falha no envio"
        : processingStatus === "failed"
          ? "Falha no processamento"
          : processingStatus === "running"
            ? "Processamento heurístico em andamento"
            : processingStatus === "completed"
              ? "Resultado consolidado"
              : uploadReused
                ? "Arquivo reaproveitado do servidor"
                : uploadStatus === "completed"
                  ? "Arquivo recebido"
                  : "Aguardando processamento";
    const fallbackStep = isPreUpload
      ? "Aguardar definição da sessão (init)"
      : uploadStatus === "uploading"
        ? "Upload robusto em andamento"
        : uploadStatus === "failed"
        ? "Reenvio necessário"
        : processingStatus === "failed"
          ? "Falha na consolidação do arquivo"
          : processingStatus === "running"
            ? "Leitura heurística e consolidação em curso"
            : processingStatus === "completed"
              ? "Redução concluída"
              : uploadReused
                ? "Aguardando reprocessamento do artefato já persistido"
                : uploadStatus === "completed"
                  ? "Aguardando início do lote"
                  : "Na fila";
    const fallbackMessage = isPreUpload
      ? `A preparar a sessão de envio (contactar o servidor) — ainda sem bytes de ${fileName} transmitidos.`
      : uploadStatus === "uploading"
        ? `Transmitindo ${fileName} em partes.`
        : uploadStatus === "failed"
        ? `O envio de ${fileName} falhou antes do processamento.`
        : processingStatus === "failed"
          ? `O processamento de ${fileName} falhou antes da consolidação final.`
          : processingStatus === "running"
            ? `O arquivo ${fileName} está em processamento heurístico no lote atual.`
            : processingStatus === "completed"
              ? `Arquivo ${fileName} processado com sucesso e consolidado para revisão.`
              : uploadReused
                ? `Arquivo ${fileName} reaproveitado do servidor e aguardando início do reprocessamento.`
                : `Arquivo ${fileName} recebido integralmente e aguardando processamento.`;

    return {
      fileName,
      logType: (detail?.logType as LogType | undefined) ?? local?.logType ?? inferLogType(fileName),
      sizeBytes: detail?.originalBytes ?? local?.sizeBytes ?? 0,
      uploadProgress: local?.uploadProgress ?? 100,
      uploadStatus,
      processingStatus,
      processingProgress,
      uploadDurationMs: detail?.uploadDurationMs ?? local?.uploadDurationMs ?? 0,
      uploadReused,
      currentStage: detail?.currentStage ?? fallbackStage,
      currentStep: detail?.currentStep ?? fallbackStep,
      lastMessage: detail?.lastMessage ?? fallbackMessage,
      originalLineCount: detail?.originalLineCount ?? 0,
      reducedLineCount: detail?.reducedLineCount ?? 0,
      originalBytes: detail?.originalBytes ?? local?.sizeBytes ?? 0,
      reducedBytes: detail?.reducedBytes ?? 0,
      suspiciousEventCount: detail?.suspiciousEventCount ?? 0,
      triggerCount: detail?.triggerCount ?? 0,
    } satisfies FileMonitor;
  });
}
