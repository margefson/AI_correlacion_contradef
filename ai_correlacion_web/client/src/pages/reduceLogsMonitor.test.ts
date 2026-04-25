import { describe, expect, it } from "vitest";

import {
  buildMonitoredFiles,
  getFileInterpretation,
  getFileRecommendation,
  type DetailFileMonitor,
  type SubmittedFileMonitor,
} from "./reduceLogsMonitor";

describe("reduceLogsMonitor", () => {
  it("mantém um arquivo reaproveitado por nome/label em fila sem pedir novo upload", () => {
    const submittedFiles: SubmittedFileMonitor[] = [
      {
        fileName: "TraceInstructions.log",
        logType: "TraceInstructions",
        sizeBytes: 4096,
        uploadProgress: 100,
        uploadStatus: "completed",
        uploadReused: true,
        uploadDurationMs: 0,
      },
    ];

    const monitored = buildMonitoredFiles(submittedFiles, []);

    expect(monitored[0]).toEqual(expect.objectContaining({
      fileName: "TraceInstructions.log",
      processingStatus: "queued",
      currentStage: "Arquivo reaproveitado do servidor",
      currentStep: "Aguardando reprocessamento do artefato já persistido",
      uploadReused: true,
    }));
    expect(getFileInterpretation(monitored[0])).toMatch(/reaproveitado do servidor/i);
    expect(getFileRecommendation(monitored[0])).toMatch(/não reenviar/i);
  });

  it("prioriza os detalhes do job quando o backend já iniciou o processamento em background", () => {
    const submittedFiles: SubmittedFileMonitor[] = [
      {
        fileName: "TraceMemory.log",
        logType: "TraceMemory",
        sizeBytes: 8192,
        uploadProgress: 100,
        uploadStatus: "completed",
        uploadReused: false,
        uploadDurationMs: 1500,
      },
    ];
    const detailFiles: DetailFileMonitor[] = [
      {
        fileName: "TraceMemory.log",
        logType: "TraceMemory",
        status: "running",
        progress: 42,
        currentStage: "Redução heurística",
        currentStep: "Filtrando eventos e consolidando sinais críticos",
        lastMessage: "Processamento heurístico em andamento.",
        originalBytes: 8192,
        reducedBytes: 2048,
        uploadDurationMs: 1500,
      },
    ];

    const monitored = buildMonitoredFiles(submittedFiles, detailFiles);

    expect(monitored[0]).toEqual(expect.objectContaining({
      processingStatus: "running",
      processingProgress: 42,
      currentStage: "Redução heurística",
      currentStep: "Filtrando eventos e consolidando sinais críticos",
      lastMessage: "Processamento heurístico em andamento.",
    }));
    expect(getFileInterpretation(monitored[0])).toMatch(/redução está em curso/i);
    expect(getFileRecommendation(monitored[0])).toMatch(/etapa atual/i);
  });

  it("gera conclusão coerente quando o job já terminou", () => {
    const monitored = buildMonitoredFiles([], [
      {
        fileName: "TraceFcnCall.log",
        logType: "TraceFcnCall",
        status: "completed",
        progress: 100,
        originalBytes: 1000,
        reducedBytes: 200,
        suspiciousEventCount: 3,
        triggerCount: 1,
      },
    ]);

    expect(monitored[0]).toEqual(expect.objectContaining({
      processingStatus: "completed",
      processingProgress: 100,
      currentStage: "Resultado consolidado",
      currentStep: "Redução concluída",
    }));
    expect(getFileInterpretation(monitored[0])).toMatch(/preservou sinais relevantes/i);
    expect(getFileRecommendation(monitored[0])).toMatch(/priorize este log/i);
  });

  it("associa o progresso de upload local ao nome de ficheiro com caminho vindo do servidor (basename)", () => {
    const submittedFiles: SubmittedFileMonitor[] = [
      {
        fileName: "contradef.1.TraceInstructions.cdf",
        logType: "TraceInstructions",
        sizeBytes: 1_000_000,
        uploadProgress: 42,
        uploadStatus: "uploading",
      },
    ];
    const detailFiles: DetailFileMonitor[] = [
      {
        fileName: "Pasta-ample/contradef.1.TraceInstructions.cdf",
        logType: "TraceInstructions",
        status: "queued",
        progress: 0,
        originalBytes: 1_000_000,
      },
    ];
    const monitored = buildMonitoredFiles(submittedFiles, detailFiles);
    expect(monitored).toHaveLength(2);
    const pathRow = monitored.find((f) => f.fileName.includes("Pasta-ample"))!;
    expect(pathRow.uploadProgress).toBe(42);
    expect(pathRow.uploadStatus).toBe("uploading");
  });

  it("oculta o contêiner .7z quando o backend já retornou logs extraídos", () => {
    const submittedFiles: SubmittedFileMonitor[] = [
      {
        fileName: "Full-Execution-Sample-1.7z",
        logType: "Unknown",
        sizeBytes: 38 * 1024 * 1024,
        uploadProgress: 100,
        uploadStatus: "completed",
      },
    ];
    const detailFiles: DetailFileMonitor[] = [
      { fileName: "contradef.2956.FunctionInterceptor.cdf", status: "queued", progress: 8 },
      { fileName: "contradef.2956.TraceInstructions.cdf", status: "queued", progress: 8 },
    ];

    const monitored = buildMonitoredFiles(submittedFiles, detailFiles);

    expect(monitored.map((file) => file.fileName)).toEqual([
      "contradef.2956.FunctionInterceptor.cdf",
      "contradef.2956.TraceInstructions.cdf",
    ]);
  });
});
