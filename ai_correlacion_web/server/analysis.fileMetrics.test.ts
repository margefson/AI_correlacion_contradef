import { describe, expect, it } from "vitest";

import { buildLiveFileMetrics } from "./analysisService";

describe("buildLiveFileMetrics", () => {
  it("reconstrói a etapa mais recente por arquivo a partir de eventos de fila, redução heurística, consolidação e conclusão", () => {
    const fileName = "TraceInstructions.log";
    const events = [
      {
        eventType: "file-queued",
        stage: "fila do lote",
        message: `${fileName} entrou na fila de redução do lote atual.`,
        progress: 8,
        payloadJson: {
          fileName,
          logType: "TraceInstructions",
          status: "queued",
          fileProgress: 0,
          currentStage: "Fila do lote",
          currentStep: "Aguardando vez para reduzir",
        },
      },
      {
        eventType: "file-start",
        stage: "preparando redução",
        message: `Iniciando a preparação de ${fileName}.`,
        progress: 26,
        payloadJson: {
          fileName,
          logType: "TraceInstructions",
          status: "running",
          fileProgress: 10,
          currentStage: "Preparação do arquivo",
          currentStep: "Validando cabeçalho e contexto do log",
        },
      },
      {
        eventType: "file-stage",
        stage: "redução heurística",
        message: `Aplicando filtragem heurística em ${fileName}.`,
        progress: 35,
        payloadJson: {
          fileName,
          logType: "TraceInstructions",
          status: "running",
          fileProgress: 45,
          currentStage: "Redução heurística",
          currentStep: "Filtrando linhas e preservando gatilhos críticos",
        },
      },
      {
        eventType: "file-stage",
        stage: "consolidação do resultado",
        message: `Consolidando métricas e artefatos reduzidos de ${fileName}.`,
        progress: 44,
        payloadJson: {
          fileName,
          logType: "TraceInstructions",
          status: "running",
          fileProgress: 82,
          currentStage: "Consolidação",
          currentStep: "Agregando métricas e preparando artefatos",
          originalLineCount: 120,
          reducedLineCount: 24,
          originalBytes: 8192,
          reducedBytes: 2048,
          suspiciousEventCount: 3,
          triggerCount: 1,
        },
      },
    ];

    const inFlightMetrics = buildLiveFileMetrics(events, {}, "running");

    expect(inFlightMetrics).toHaveLength(1);
    expect(inFlightMetrics[0]).toEqual(expect.objectContaining({
      fileName,
      status: "running",
      progress: 82,
      currentStage: "Consolidação",
      currentStep: "Agregando métricas e preparando artefatos",
      originalLineCount: 120,
      reducedLineCount: 24,
      originalBytes: 8192,
      reducedBytes: 2048,
      suspiciousEventCount: 3,
      triggerCount: 1,
    }));

    const completedMetrics = buildLiveFileMetrics([
      ...events,
      {
        eventType: "file-complete",
        stage: "Sinais críticos preservados",
        message: `${fileName} concluído: 24/120 linhas mantidas após a redução.`,
        progress: 88,
        payloadJson: {
          fileName,
          logType: "TraceInstructions",
          status: "completed",
          fileProgress: 100,
          currentStage: "Arquivo concluído",
          currentStep: "Sinais críticos preservados",
          originalLineCount: 120,
          reducedLineCount: 24,
          originalBytes: 8192,
          reducedBytes: 2048,
          suspiciousEventCount: 3,
          triggerCount: 1,
        },
      },
    ], {}, "completed");

    expect(completedMetrics[0]).toEqual(expect.objectContaining({
      fileName,
      status: "completed",
      progress: 100,
      currentStage: "Arquivo concluído",
      currentStep: "Sinais críticos preservados",
      suspiciousEventCount: 3,
      triggerCount: 1,
    }));
  });
});
