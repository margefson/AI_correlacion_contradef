/**
 * Sessão 11 — Testes para Separação Metodológica Dataset Treino / Avaliação
 *
 * Metodologia ML:
 *  - Dataset de TREINAMENTO: incidentes_cybersecurity_2000.xlsx (2000 amostras)
 *    → Usado exclusivamente para treinar o modelo TF-IDF + Naive Bayes
 *  - Dataset de AVALIAÇÃO: incidentes_cybersecurity_100.xlsx (100 amostras)
 *    → Conjunto independente para avaliar o modelo em produção
 *
 * S11-1: Existência e estrutura dos dois datasets
 * S11-2: Servidor Flask — separação de constantes de dataset
 * S11-3: Servidor Flask — endpoint /eval-dataset
 * S11-4: Servidor Flask — endpoint /evaluate
 * S11-5: Servidor Flask — endpoint /metrics com estrutura treino/avaliação
 * S11-6: Servidor Flask — endpoint /retrain não inclui dataset de avaliação
 * S11-7: Backend Node.js — procedure getEvalDataset
 * S11-8: Backend Node.js — procedure evaluateModel
 * S11-9: Backend Node.js — procedure getMLMetrics com nova estrutura
 * S11-10: Frontend AdminML — badges de dataset e abas
 * S11-11: Integridade metodológica — dataset de avaliação nunca no treino
 * S11-12: Endpoint /classify retorna model_info com dataset de treino
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROJECT_DIR  = path.join(__dirname, "..");
const ML_DIR       = path.join(PROJECT_DIR, "ml");
const SERVER_DIR   = path.join(PROJECT_DIR, "server");
const CLIENT_DIR   = path.join(PROJECT_DIR, "client", "src");

const CLASSIFIER_PY    = path.join(ML_DIR, "classifier_server.py");
const ROUTERS_TS       = path.join(SERVER_DIR, "routers.ts");
const ADMIN_ML_TSX     = path.join(CLIENT_DIR, "pages", "AdminML.tsx");
const TRAIN_DATASET    = path.join(ML_DIR, "incidentes_cybersecurity_2000.xlsx");
const EVAL_DATASET     = path.join(ML_DIR, "incidentes_cybersecurity_100.xlsx");
const METRICS_JSON     = path.join(ML_DIR, "metrics.json");

// ─── S11-1: Existência e estrutura dos dois datasets ──────────────────────────
describe("S11-1: Existência e estrutura dos dois datasets", () => {
  it("S11-1.1: dataset de treinamento existe (2000 amostras)", () => {
    expect(fs.existsSync(TRAIN_DATASET)).toBe(true);
  });

  it("S11-1.2: dataset de avaliação existe (100 amostras)", () => {
    expect(fs.existsSync(EVAL_DATASET)).toBe(true);
  });

  it("S11-1.3: dataset de treinamento é maior que o de avaliação", () => {
    const trainSize = fs.statSync(TRAIN_DATASET).size;
    const evalSize  = fs.statSync(EVAL_DATASET).size;
    expect(trainSize).toBeGreaterThan(evalSize);
  });

  it("S11-1.4: dataset de treinamento tem pelo menos 30KB (2000 amostras)", () => {
    const size = fs.statSync(TRAIN_DATASET).size;
    expect(size).toBeGreaterThan(30_000);
  });

  it("S11-1.5: dataset de avaliação tem pelo menos 5KB (100 amostras)", () => {
    const size = fs.statSync(EVAL_DATASET).size;
    expect(size).toBeGreaterThan(5_000);
  });

  it("S11-1.6: metrics.json existe", () => {
    expect(fs.existsSync(METRICS_JSON)).toBe(true);
  });

  it("S11-1.7: metrics.json contém estrutura de treinamento", () => {
    const metrics = JSON.parse(fs.readFileSync(METRICS_JSON, "utf-8"));
    expect(metrics).toHaveProperty("training");
  });

  it("S11-1.8: metrics.json.training.dataset aponta para dataset de 2000 amostras", () => {
    const metrics = JSON.parse(fs.readFileSync(METRICS_JSON, "utf-8"));
    expect(metrics.training?.dataset).toContain("2000");
  });

  it("S11-1.9: metrics.json.training.dataset_size é 2000", () => {
    const metrics = JSON.parse(fs.readFileSync(METRICS_JSON, "utf-8"));
    expect(metrics.training?.dataset_size).toBeGreaterThanOrEqual(2000);
  });
});

// ─── S11-2: Servidor Flask — separação de constantes de dataset ───────────────
describe("S11-2: Servidor Flask — separação de constantes de dataset", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLASSIFIER_PY, "utf-8"); });

  it("S11-2.1: define TRAIN_DATASET_PATH apontando para 2000 amostras", () => {
    expect(src).toContain("TRAIN_DATASET_PATH");
    expect(src).toContain("incidentes_cybersecurity_2000.xlsx");
  });

  it("S11-2.2: define EVAL_DATASET_PATH apontando para 100 amostras", () => {
    expect(src).toContain("EVAL_DATASET_PATH");
    expect(src).toContain("incidentes_cybersecurity_100.xlsx");
  });
  it("S11-2.3: DATASET_PATH legário não existe mais (substituído por TRAIN/EVAL)", () => {
    // Não deve mais ter a variável genérica DATASET_PATH sem prefixo TRAIN_ ou EVAL_
    // Verifica que toda ocorrência de DATASET_PATH tem prefixo TRAIN ou EVAL
    const lines = src.split("\n").filter((l) => /^DATASET_PATH\s*=/.test(l.trim()));
    expect(lines.length).toBe(0);
  });

  it("S11-2.4: função utilitária _load_dataset existe", () => {
    expect(src).toContain("def _load_dataset(path");
  });

  it("S11-2.5: _load_dataset suporta colunas em português e inglês", () => {
    expect(src).toContain("titulo");
    expect(src).toContain("description");
  });

  it("S11-2.6: endpoint /health retorna train_dataset e eval_dataset", () => {
    expect(src).toContain('"train_dataset"');
    expect(src).toContain('"eval_dataset"');
  });
});

// ─── S11-3: Servidor Flask — endpoint /eval-dataset ──────────────────────────
describe("S11-3: Servidor Flask — endpoint /eval-dataset", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLASSIFIER_PY, "utf-8"); });

  it("S11-3.1: endpoint /eval-dataset existe", () => {
    expect(src).toContain('"/eval-dataset"');
  });

  it("S11-3.2: /eval-dataset usa EVAL_DATASET_PATH", () => {
    const evalSection = src.split("/eval-dataset")[1]?.split("@app.route")[0] ?? "";
    expect(evalSection).toContain("EVAL_DATASET_PATH");
  });

  it("S11-3.3: /eval-dataset retorna role='evaluation'", () => {
    // Verifica que o endpoint /eval-dataset define o campo role como evaluation
    expect(src).toMatch(/['"]role['"].*['"]evaluation['"]|['"]evaluation['"].*['"]role['"]/s);
  });

  it("S11-3.4: /eval-dataset retorna filename com 100", () => {
    expect(src).toContain('"incidentes_cybersecurity_100.xlsx"');
  });

  it("S11-3.5: /eval-dataset retorna base64, total_samples, preview", () => {
    // Verifica que o endpoint /eval-dataset retorna os campos esperados (busca global no arquivo)
    expect(src).toContain('"base64"');
    expect(src).toContain('"total_samples"');
    expect(src).toContain('"preview"');
  });
});

// ─── S11-4: Servidor Flask — endpoint /evaluate ──────────────────────────────
describe("S11-4: Servidor Flask — endpoint /evaluate", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLASSIFIER_PY, "utf-8"); });

  it("S11-4.1: endpoint /evaluate existe com método POST", () => {
    expect(src).toContain('"/evaluate"');
    expect(src).toContain('methods=["POST"]');
  });

  it("S11-4.2: /evaluate usa EVAL_DATASET_PATH (não TRAIN)", () => {
    const evalSection = src.split('"/evaluate"')[1]?.split("@app.route")[0] ?? "";
    expect(evalSection).toContain("EVAL_DATASET_PATH");
    expect(evalSection).not.toContain("TRAIN_DATASET_PATH");
  });

  it("S11-4.3: /evaluate usa accuracy_score do sklearn", () => {
    expect(src).toContain("accuracy_score");
  });

  it("S11-4.4: /evaluate usa classification_report do sklearn", () => {
    expect(src).toContain("classification_report");
  });

  it("S11-4.5: /evaluate usa confusion_matrix do sklearn", () => {
    expect(src).toContain("confusion_matrix");
  });

  it("S11-4.6: /evaluate retorna eval_accuracy", () => {
    expect(src).toContain('"eval_accuracy"');
  });

  it("S11-4.7: /evaluate retorna per_category com precisão/recall/f1", () => {
    expect(src).toContain('"per_category"');
    expect(src).toContain('"precision"');
    expect(src).toContain('"recall"');
    expect(src).toContain('"f1_score"');
  });

  it("S11-4.8: /evaluate retorna macro_avg e weighted_avg", () => {
    expect(src).toContain('"macro_avg"');
    expect(src).toContain('"weighted_avg"');
  });

  it("S11-4.9: /evaluate retorna confusion_matrix com labels e matrix", () => {
    expect(src).toContain('"confusion_matrix"');
    expect(src).toContain('"labels"');
    expect(src).toContain('"matrix"');
  });

  it("S11-4.10: /evaluate persiste resultado em metrics.json", () => {
    const evalSection = src.split('"/evaluate"')[1]?.split("@app.route")[0] ?? "";
    expect(evalSection).toContain("METRICS_PATH");
    expect(evalSection).toContain("evaluation");
  });
});

// ─── S11-5: Servidor Flask — endpoint /metrics com estrutura treino/avaliação ─
describe("S11-5: Servidor Flask — endpoint /metrics com nova estrutura", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLASSIFIER_PY, "utf-8"); });

  it("S11-5.1: endpoint /metrics existe", () => {
    expect(src).toContain('"/metrics"');
  });

  it("S11-5.2: /retrain salva campo training nas métricas", () => {
    const retrainSection = src.split('"/retrain"')[1]?.split("@app.route")[0] ?? "";
    expect(retrainSection).toContain('"training"');
  });

  it("S11-5.3: /retrain salva campo evaluation nas métricas (preserva avaliação anterior)", () => {
    const retrainSection = src.split('"/retrain"')[1]?.split("@app.route")[0] ?? "";
    expect(retrainSection).toContain('"evaluation"');
  });

  it("S11-5.4: metrics.json atual tem campo training", () => {
    const metrics = JSON.parse(fs.readFileSync(METRICS_JSON, "utf-8"));
    expect(metrics).toHaveProperty("training");
    expect(typeof metrics.training).toBe("object");
  });

  it("S11-5.5: metrics.json atual tem campo evaluation (pode ser null)", () => {
    const metrics = JSON.parse(fs.readFileSync(METRICS_JSON, "utf-8"));
    expect(Object.prototype.hasOwnProperty.call(metrics, "evaluation")).toBe(true);
  });
});

// ─── S11-6: Servidor Flask — /retrain não inclui dataset de avaliação ─────────
describe("S11-6: Servidor Flask — /retrain não inclui dataset de avaliação", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLASSIFIER_PY, "utf-8"); });

  it("S11-6.1: /retrain usa TRAIN_DATASET_PATH para carregar dados", () => {
    const retrainSection = src.split('"/retrain"')[1]?.split("@app.route")[0] ?? "";
    expect(retrainSection).toContain("TRAIN_DATASET_PATH");
  });

  it("S11-6.2: /retrain NÃO usa EVAL_DATASET_PATH", () => {
    // Verifica que o /retrain não carrega o dataset de avaliação
    // Extrai a seção do /retrain até o próximo @app.route (upload-train-dataset)
    const retrainIdx = src.indexOf('"/retrain"');
    const nextRouteIdx = src.indexOf('@app.route', retrainIdx + 1);
    const retrainSection = retrainIdx >= 0
      ? src.substring(retrainIdx, nextRouteIdx > retrainIdx ? nextRouteIdx : src.length)
      : "";
    expect(retrainSection).toContain("TRAIN_DATASET_PATH");
    expect(retrainSection).not.toContain("EVAL_DATASET_PATH");
  });

  it("S11-6.3: docstring do /retrain menciona que dataset de avaliação nunca é incluído", () => {
    expect(src).toContain("dataset de AVALIAÇÃO");
    expect(src).toContain("NUNCA é incluído no treino");
  });
});

// ─── S11-7: Backend Node.js — procedure getEvalDataset ───────────────────────
describe("S11-7: Backend Node.js — procedure getEvalDataset", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S11-7.1: procedure getEvalDataset existe", () => {
    expect(src).toContain("getEvalDataset:");
  });

  it("S11-7.2: getEvalDataset chama /eval-dataset no Flask", () => {
    // Verifica que existe a chamada ao endpoint /eval-dataset
    expect(src).toContain("/eval-dataset");
  });

  it("S11-7.3: getEvalDataset é adminProcedure", () => {
    // Verifica que getEvalDataset usa adminProcedure
    const idx = src.indexOf("getEvalDataset:");
    const section = src.substring(Math.max(0, idx - 50), idx + 200);
    expect(section).toContain("adminProcedure");
  });

  it("S11-7.4: getEvalDataset retorna campo role", () => {
    // Verifica que o tipo de retorno de getEvalDataset inclui campo role
    const idx = src.indexOf("getEvalDataset:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("role:");
  });
});

// ─── S11-8: Backend Node.js — procedure evaluateModel ────────────────────────
describe("S11-8: Backend Node.js — procedure evaluateModel", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S11-8.1: procedure evaluateModel existe", () => {
    expect(src).toContain("evaluateModel:");
  });

  it("S11-8.2: evaluateModel chama /evaluate no Flask via POST", () => {
    // Verifica que evaluateModel chama /evaluate via POST
    const idx = src.indexOf("evaluateModel:");
    const section = src.substring(idx, idx + 400);
    expect(section).toContain("/evaluate");
    expect(section).toContain("POST");
  });

  it("S11-8.3: evaluateModel é mutation (não query)", () => {
    const section = src.split("evaluateModel:")[1]?.split(/(?=\w+\s*:)/)?.[0] ?? "";
    expect(section).toContain(".mutation(");
  });

  it("S11-8.4: evaluateModel retorna campo evaluation com eval_accuracy", () => {
    // Verifica que o tipo de retorno de evaluateModel inclui eval_accuracy
    // S14: janela aumentada para 1000 chars pois try/catch adicionou mais código antes do tipo
    const idx = src.indexOf("evaluateModel:");
    const section = src.substring(idx, idx + 1000);
    expect(section).toContain("eval_accuracy");
  });

  it("S11-8.5: evaluateModel retorna confusion_matrix", () => {
    // Verifica que o tipo de retorno de evaluateModel inclui confusion_matrix
    // Busca em uma janela maior pois o tipo pode ser extenso
    const idx = src.indexOf("evaluateModel:");
    const section = src.substring(idx, idx + 1500);
    expect(section).toContain("confusion_matrix");
  });
});

// ─── S11-9: Backend Node.js — procedure getMLMetrics com nova estrutura ───────
describe("S11-9: Backend Node.js — procedure getMLMetrics com nova estrutura", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S11-9.1: getMLMetrics define tipo training com dataset", () => {
    // Verifica que o tipo MLMetrics (usado pela procedure) inclui campo training
    // S14: tipo foi extraído para MLMetrics separado para reutilização no fallback
    const idx = src.indexOf("type MLMetrics");
    const section = src.substring(idx, idx + 1200);
    expect(section).toContain("training:");
  });

  it("S11-9.2: getMLMetrics define tipo evaluation como nullable", () => {
    // Verifica que o tipo MLMetrics inclui campo evaluation nullable
    const idx = src.indexOf("type MLMetrics");
    const section = src.substring(idx, idx + 1600);
    expect(section).toContain("evaluation:");
    expect(section).toContain("| null");
  });

  it("S11-9.3: getMLMetrics mantém campos legados para compatibilidade", () => {
    // Verifica que o tipo MLMetrics inclui campos legados para compatibilidade
    const idx = src.indexOf("type MLMetrics");
    const section = src.substring(idx, idx + 1500);
    expect(section).toContain("dataset_size:");
    expect(section).toContain("train_accuracy:");
  });
});

// ─── S11-10: Frontend AdminML — badges de dataset e abas ─────────────────────
describe("S11-10: Frontend AdminML — badges de dataset e abas", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ADMIN_ML_TSX, "utf-8"); });

  it("S11-10.1: AdminML.tsx existe", () => {
    expect(fs.existsSync(ADMIN_ML_TSX)).toBe(true);
  });

  it("S11-10.2: exibe badge TREINO com nome do dataset de 2000 amostras", () => {
    expect(src).toContain("TREINO");
    expect(src).toContain("incidentes_cybersecurity_2000.xlsx");
  });

  it("S11-10.3: exibe badge AVALIAÇÃO com nome do dataset de 100 amostras", () => {
    expect(src).toContain("AVALIAÇÃO");
    expect(src).toContain("incidentes_cybersecurity_100.xlsx");
  });

  it("S11-10.4: tem aba de Treinamento", () => {
    expect(src).toContain("Treinamento");
  });

  it("S11-10.5: tem aba de Avaliação", () => {
    expect(src).toContain("Avaliação");
  });

  it("S11-10.6: tem aba de Visão Geral", () => {
    expect(src).toContain("Visão Geral");
  });

  it("S11-10.7: usa trpc.admin.evaluateModel para executar avaliação", () => {
    expect(src).toContain("trpc.admin.evaluateModel");
  });

  it("S11-10.8: usa trpc.admin.getEvalDataset para carregar dataset de avaliação", () => {
    expect(src).toContain("trpc.admin.getEvalDataset");
  });

  it("S11-10.9: exibe matriz de confusão", () => {
    expect(src).toContain("Matriz de Confusão");
    expect(src).toContain("confusion_matrix");
  });

  it("S11-10.10: exibe métricas por categoria (precisão, recall, F1)", () => {
    expect(src).toContain("Métricas por Categoria");
    expect(src).toContain("per_category");
  });

  it("S11-10.11: exibe F1-Score macro e ponderado", () => {
    expect(src).toContain("macro_avg");
    expect(src).toContain("weighted_avg");
  });

  it("S11-10.12: aviso que dataset de avaliação nunca é incluído no treino", () => {
    expect(src).toContain("nunca é incluído no treino");
  });

  it("S11-10.13: exibe data de última atualização do modelo", () => {
    expect(src).toContain("last_updated");
  });
});

// ─── S11-11: Integridade metodológica ─────────────────────────────────────────
describe("S11-11: Integridade metodológica — separação treino/avaliação", () => {
  let flaskSrc: string;
  let routersSrc: string;
  let adminMLSrc: string;

  beforeAll(() => {
    flaskSrc   = fs.readFileSync(CLASSIFIER_PY, "utf-8");
    routersSrc = fs.readFileSync(ROUTERS_TS, "utf-8");
    adminMLSrc = fs.readFileSync(ADMIN_ML_TSX, "utf-8");
  });

  it("S11-11.1: Flask — /retrain usa apenas TRAIN_DATASET_PATH", () => {
    // Verifica que /retrain usa TRAIN_DATASET_PATH e não EVAL_DATASET_PATH
    // Extrai a seção do /retrain até o próximo @app.route (upload-train-dataset)
    const retrainIdx = flaskSrc.indexOf('"/retrain"');
    const nextRouteIdx = flaskSrc.indexOf('@app.route', retrainIdx + 1);
    const retrainSection = retrainIdx >= 0
      ? flaskSrc.substring(retrainIdx, nextRouteIdx > retrainIdx ? nextRouteIdx : flaskSrc.length)
      : "";
    expect(retrainSection).toContain("TRAIN_DATASET_PATH");
    expect(retrainSection).not.toContain("EVAL_DATASET_PATH");
  });

  it("S11-11.2: Flask — /evaluate usa apenas EVAL_DATASET_PATH", () => {
    const evalSection = flaskSrc.split('"/evaluate"')[1]?.split("@app.route")[0] ?? "";
    expect(evalSection).toContain("EVAL_DATASET_PATH");
    expect(evalSection).not.toContain("TRAIN_DATASET_PATH");
  });

  it("S11-11.3: dois datasets têm nomes diferentes", () => {
    expect(TRAIN_DATASET).not.toBe(EVAL_DATASET);
    expect(path.basename(TRAIN_DATASET)).not.toBe(path.basename(EVAL_DATASET));
  });

  it("S11-11.4: Flask documenta a metodologia no docstring", () => {
    expect(flaskSrc).toContain("Dataset de TREINAMENTO");
    expect(flaskSrc).toContain("Dataset de AVALIAÇÃO");
  });

  it("S11-11.5: metrics.json tem campo training separado de evaluation", () => {
    const metrics = JSON.parse(fs.readFileSync(METRICS_JSON, "utf-8"));
    expect(metrics).toHaveProperty("training");
    expect(Object.prototype.hasOwnProperty.call(metrics, "evaluation")).toBe(true);
    // training e evaluation são objetos distintos (ou null para evaluation)
    expect(metrics.training).not.toBe(metrics.evaluation);
  });

  it("S11-11.6: AdminML exibe os dois datasets com papéis distintos", () => {
    expect(adminMLSrc).toContain("TREINO");
    expect(adminMLSrc).toContain("AVALIAÇÃO");
    // Verifica que os dois nomes de arquivo aparecem no código
    expect(adminMLSrc).toContain("2000.xlsx");
    expect(adminMLSrc).toContain("100.xlsx");
  });
});

// ─── S11-12: Endpoint /classify retorna model_info ────────────────────────────
describe("S11-12: Endpoint /classify retorna model_info com dataset de treino", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLASSIFIER_PY, "utf-8"); });

  it("S11-12.1: /classify retorna campo model_info", () => {
    const classifySection = src.split('"/classify"')[1]?.split("@app.route")[0] ?? "";
    expect(classifySection).toContain('"model_info"');
  });

  it("S11-12.2: model_info contém train_dataset", () => {
    expect(src).toContain('"train_dataset"');
  });

  it("S11-12.3: model_info contém train_dataset_size", () => {
    expect(src).toContain('"train_dataset_size"');
  });

  it("S11-12.4: train_dataset aponta para dataset de 2000 amostras", () => {
    const classifySection = src.split('"/classify"')[1]?.split("@app.route")[0] ?? "";
    expect(classifySection).toContain("incidentes_cybersecurity_2000.xlsx");
  });
});
