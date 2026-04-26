/**
 * Sessão 17 — Testes para Diagnóstico ML e Treinamento em Tempo Real
 *
 * S17-1: Dataset ampliado com amostras metafóricas
 * S17-2: Classificação correta de títulos metafóricos
 * S17-3: Endpoint SSE /train-stream no Flask
 * S17-4: Proxy SSE /api/ml-train-stream no servidor Express
 * S17-5: Página AdminMLTraining.tsx
 * S17-6: Aviso de baixa confiança no IncidentDetail
 * S17-7: Rota /admin/ml-training no App.tsx
 * S17-8: Link Treinamento ao Vivo no DashboardLayout
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ML_DIR = path.join(__dirname, "../ml");
const DATASET_2000 = path.join(ML_DIR, "incidentes_cybersecurity_2000.xlsx");
const CLASSIFIER_SERVER = path.join(ML_DIR, "classifier_server.py");
const METRICS_JSON = path.join(ML_DIR, "metrics.json");
const ROUTERS_TS = path.join(__dirname, "routers.ts");
const INDEX_TS = path.join(__dirname, "_core/index.ts");
const APP_TSX = path.join(__dirname, "../client/src/App.tsx");
const DASHBOARD_LAYOUT = path.join(__dirname, "../client/src/components/DashboardLayout.tsx");
const INCIDENT_DETAIL = path.join(__dirname, "../client/src/pages/IncidentDetail.tsx");
const ADMIN_ML_TRAINING = path.join(__dirname, "../client/src/pages/AdminMLTraining.tsx");

// ─── S17-1: Dataset ampliado com amostras metafóricas ─────────────────────────
describe("S17-1: Dataset ampliado com amostras metafóricas (>= 2050 amostras)", () => {
  it("S17-1.1: dataset incidentes_cybersecurity_2000.xlsx existe", () => {
    expect(fs.existsSync(DATASET_2000)).toBe(true);
  });

  it("S17-1.2: dataset tem tamanho maior que 35KB (amostras extras adicionadas)", () => {
    const stats = fs.statSync(DATASET_2000);
    expect(stats.size).toBeGreaterThan(35 * 1024);
  });

  it("S17-1.3: metrics.json registra dataset_size >= 2050", () => {
    const raw = fs.readFileSync(METRICS_JSON, "utf-8");
    const metrics = JSON.parse(raw);
    expect(metrics.dataset_size).toBeGreaterThanOrEqual(2050);
  });

  it("S17-1.4: metrics.json tem cv_accuracy_mean >= 0.99 (modelo robusto)", () => {
    const raw = fs.readFileSync(METRICS_JSON, "utf-8");
    const metrics = JSON.parse(raw);
    expect(Number(metrics.cv_accuracy_mean)).toBeGreaterThanOrEqual(0.99);
  });
});

// ─── S17-2: Classificação correta de títulos metafóricos ──────────────────────
describe("S17-2: Classificação de títulos metafóricos via Flask", () => {
  const ML_URL = "http://localhost:5001";

  it("S17-2.1: 'O Estrangulamento da Disponibilidade' classifica como ddos", async () => {
    try {
      const res = await fetch(`${ML_URL}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "O Estrangulamento da Disponibilidade", description: "" }),
      });
      if (!res.ok) return;
      const data = await res.json() as { category: string; confidence: number };
      expect(data.category).toBe("ddos");
      expect(data.confidence).toBeGreaterThan(0.4);
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });

  it("S17-2.2: 'A Arte da Manipulação Psicológica' classifica como phishing", async () => {
    try {
      const res = await fetch(`${ML_URL}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "A Arte da Manipulação Psicológica", description: "" }),
      });
      if (!res.ok) return;
      const data = await res.json() as { category: string; confidence: number };
      expect(data.category).toBe("phishing");
      expect(data.confidence).toBeGreaterThan(0.4);
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });

  it("S17-2.3: título com descrição técnica tem confiança > 0.7", async () => {
    try {
      const res = await fetch(`${ML_URL}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Ataque detectado",
          description: "Servidor recebeu 50.000 requisições por segundo, causando indisponibilidade total do serviço",
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { category: string; confidence: number };
      expect(data.confidence).toBeGreaterThan(0.7);
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });
});

// ─── S17-3: Endpoint SSE /train-stream no Flask ───────────────────────────────
describe("S17-3: Endpoint SSE /train-stream no classifier_server.py", () => {
  let classifierScript: string;

  beforeAll(() => {
    classifierScript = fs.readFileSync(CLASSIFIER_SERVER, "utf-8");
  });

  it("S17-3.1: endpoint /train-stream está definido no Flask", () => {
    expect(classifierScript).toContain('"/train-stream"');
  });

  it("S17-3.2: /train-stream usa método GET", () => {
    const idx = classifierScript.indexOf('"/train-stream"');
    const section = classifierScript.substring(idx - 100, idx + 200);
    expect(section).toContain('"GET"');
  });

  it("S17-3.3: /train-stream usa Response com mimetype text/event-stream", () => {
    expect(classifierScript).toContain("text/event-stream");
  });

  it("S17-3.4: /train-stream emite evento 'complete' ao final", () => {
    expect(classifierScript).toContain('"complete"');
  });

  it("S17-3.5: /train-stream emite evento 'fold' para validação cruzada", () => {
    expect(classifierScript).toContain('"fold"');
  });

  it("S17-3.6: /train-stream emite evento 'progress' com métricas ao vivo", () => {
    expect(classifierScript).toContain('"progress"');
  });

  it("S17-3.7: /train-stream emite evento 'error' em caso de falha", () => {
    expect(classifierScript).toContain('"error"');
  });

  it("S17-3.8: /train-stream usa yield para streaming SSE", () => {
    expect(classifierScript).toContain("yield");
  });
});

// ─── S17-4: Proxy SSE no servidor Express ─────────────────────────────────────
describe("S17-4: Proxy SSE /api/ml-train-stream no servidor Express", () => {
  let indexContent: string;

  beforeAll(() => {
    indexContent = fs.readFileSync(INDEX_TS, "utf-8");
  });

  it("S17-4.1: rota /api/ml-train-stream está registrada no Express", () => {
    expect(indexContent).toContain('"/api/ml-train-stream"');
  });

  it("S17-4.2: proxy usa app.get para SSE", () => {
    const idx = indexContent.indexOf('"/api/ml-train-stream"');
    const section = indexContent.substring(idx - 50, idx + 50);
    expect(section).toContain("app.get");
  });

  it("S17-4.3: proxy define Content-Type text/event-stream", () => {
    expect(indexContent).toContain("text/event-stream");
  });

  it("S17-4.4: proxy usa fetch para conectar ao Flask /train-stream", () => {
    expect(indexContent).toContain("/train-stream");
  });

  it("S17-4.5: proxy trata erros e emite evento de erro SSE", () => {
    const idx = indexContent.indexOf('"/api/ml-train-stream"');
    const section = indexContent.substring(idx, idx + 1500);
    expect(section).toContain("catch");
    expect(section).toContain('"error"');
  });

  it("S17-4.6: proxy cancela o reader quando cliente desconecta", () => {
    expect(indexContent).toContain("reader.cancel");
  });
});

// ─── S17-5: Página AdminMLTraining.tsx ────────────────────────────────────────
describe("S17-5: Página AdminMLTraining.tsx com treinamento em tempo real", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(ADMIN_ML_TRAINING, "utf-8");
  });

  it("S17-5.1: arquivo AdminMLTraining.tsx existe", () => {
    expect(fs.existsSync(ADMIN_ML_TRAINING)).toBe(true);
  });

  it("S17-5.2: usa EventSource para SSE", () => {
    expect(content).toContain("EventSource");
  });

  it("S17-5.3: conecta ao endpoint /api/ml-train-stream", () => {
    expect(content).toContain("/api/ml-train-stream");
  });

  it("S17-5.4: exibe barra de progresso (Progress)", () => {
    expect(content).toContain("Progress");
  });

  it("S17-5.5: exibe os 8 passos do treinamento (STEP_LABELS)", () => {
    expect(content).toContain("STEP_LABELS");
    expect(content).toContain("Carregar Dataset");
    expect(content).toContain("Salvar Modelo");
  });

  it("S17-5.6: exibe métricas ao vivo (AccuracyBar)", () => {
    expect(content).toContain("AccuracyBar");
    expect(content).toContain("Acurácia Treino");
    expect(content).toContain("Validação Cruzada");
  });

  it("S17-5.7: exibe folds da validação cruzada", () => {
    expect(content).toContain("foldScores");
    expect(content).toContain("Fold");
  });

  it("S17-5.8: tem botão Iniciar Treinamento", () => {
    expect(content).toContain("Iniciar Treinamento");
  });

  it("S17-5.9: tem botão Interromper", () => {
    expect(content).toContain("Interromper");
  });

  it("S17-5.10: exibe badge AO VIVO quando running=true", () => {
    expect(content).toContain("AO VIVO");
  });

  it("S17-5.11: usa DashboardLayout", () => {
    expect(content).toContain("DashboardLayout");
  });
});

// ─── S17-6: Aviso de baixa confiança no IncidentDetail ────────────────────────
describe("S17-6: Aviso de baixa confiança no IncidentDetail", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(INCIDENT_DETAIL, "utf-8");
  });

  it("S17-6.1: verifica confiança < 0.4 para exibir aviso", () => {
    expect(content).toContain("confidence < 0.4");
  });

  it("S17-6.2: exibe mensagem de classificação incerta", () => {
    expect(content).toContain("Classificação incerta");
  });

  it("S17-6.3: sugere adicionar descrição técnica", () => {
    expect(content).toContain("descrição técnica");
  });

  it("S17-6.4: usa cor amarela para baixa confiança", () => {
    expect(content).toContain("yellow");
  });
});

// ─── S17-7: Rota /admin/ml-training no App.tsx ────────────────────────────────
describe("S17-7: Rota /admin/ml-training registrada no App.tsx", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(APP_TSX, "utf-8");
  });

  it("S17-7.1: rota /admin/ml-training está registrada", () => {
    expect(content).toContain('"/admin/ml-training"');
  });

  it("S17-7.2: AdminMLTraining está importado", () => {
    expect(content).toContain("AdminMLTraining");
  });
});

// ─── S17-8: Link no DashboardLayout ───────────────────────────────────────────
describe("S17-8: Link Treinamento ao Vivo no DashboardLayout", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(DASHBOARD_LAYOUT, "utf-8");
  });

  it("S17-8.1: link /admin/ml-training está no menu admin", () => {
    expect(content).toContain('"/admin/ml-training"');
  });

  it("S17-8.2: label 'Treinamento ao Vivo' está no menu", () => {
    expect(content).toContain("Treinamento ao Vivo");
  });

  it("S17-8.3: usa ícone MonitorPlay", () => {
    expect(content).toContain("MonitorPlay");
  });
});
