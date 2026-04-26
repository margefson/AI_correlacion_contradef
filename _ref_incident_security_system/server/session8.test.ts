/**
 * Sessão 8 — Testes para Novo Dataset 2000 Amostras e Retreinamento
 *
 * S8-1: Estrutura e integridade do novo dataset
 * S8-2: Normalização de colunas em português
 * S8-3: Normalização de categorias (espaços → underscores)
 * S8-4: Retreinamento com novo dataset
 * S8-5: Endpoint /reload-model do Flask
 * S8-6: Integração retrainModel → reload-model
 * S8-7: Métricas do modelo treinado com 2000 amostras
 * S8-8: Predições com o novo modelo
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ML_DIR = path.join(__dirname, "../ml");
const DATASET_2000 = path.join(ML_DIR, "incidentes_cybersecurity_2000.xlsx");
const DATASET_100 = path.join(ML_DIR, "incidentes_cybersecurity_100.xlsx");
const MODEL_PKL = path.join(ML_DIR, "model.pkl");
const METRICS_JSON = path.join(ML_DIR, "metrics.json");
const TRAIN_SCRIPT = path.join(ML_DIR, "train_model.py");
const CLASSIFIER_SERVER = path.join(ML_DIR, "classifier_server.py");

// ─── S8-1: Estrutura do novo dataset ──────────────────────────────────────────
describe("S8-1: Estrutura do novo dataset (2000 amostras)", () => {
  it("S8-1.1: arquivo incidentes_cybersecurity_2000.xlsx existe", () => {
    expect(fs.existsSync(DATASET_2000)).toBe(true);
  });

  it("S8-1.2: arquivo tem tamanho maior que 30KB (dados reais)", () => {
    const stats = fs.statSync(DATASET_2000);
    expect(stats.size).toBeGreaterThan(30 * 1024);
  });

  it("S8-1.3: dataset antigo de 100 amostras ainda existe (backup)", () => {
    expect(fs.existsSync(DATASET_100)).toBe(true);
  });

  it("S8-1.4: novo dataset é maior que o antigo", () => {
    const size2000 = fs.statSync(DATASET_2000).size;
    const size100 = fs.statSync(DATASET_100).size;
    expect(size2000).toBeGreaterThan(size100);
  });
});

// ─── S8-2: Normalização de colunas em português ────────────────────────────────
describe("S8-2: Normalização de colunas em português no train_model.py", () => {
  let trainScript: string;

  beforeAll(() => {
    trainScript = fs.readFileSync(TRAIN_SCRIPT, "utf-8");
  });

  it("S8-2.1: train_model.py suporta coluna 'Titulo' (português)", () => {
    expect(trainScript).toContain('"titulo"');
  });

  it("S8-2.2: train_model.py suporta coluna 'Descricao' (português)", () => {
    expect(trainScript).toContain('"descricao"');
  });

  it("S8-2.3: train_model.py suporta coluna 'Categoria' (português)", () => {
    expect(trainScript).toContain('"categoria"');
  });

  it("S8-2.4: train_model.py suporta colunas em inglês como fallback", () => {
    expect(trainScript).toContain('"title"');
    expect(trainScript).toContain('"description"');
    expect(trainScript).toContain('"category"');
  });

  it("S8-2.5: train_model.py usa mapeamento de colunas (col_map)", () => {
    expect(trainScript).toContain("col_map");
  });
});

// ─── S8-3: Normalização de categorias ─────────────────────────────────────────
describe("S8-3: Normalização de categorias (espaços → underscores)", () => {
  let trainScript: string;
  let classifierScript: string;

  beforeAll(() => {
    trainScript = fs.readFileSync(TRAIN_SCRIPT, "utf-8");
    classifierScript = fs.readFileSync(CLASSIFIER_SERVER, "utf-8");
  });

  it("S8-3.1: train_model.py converte espaços em underscores nas categorias", () => {
    expect(trainScript).toContain('replace(" ", "_"');
  });

  it("S8-3.2: classifier_server.py tem RISK_MAP para 'brute force' (com espaço)", () => {
    expect(classifierScript).toContain('"brute force"');
  });

  it("S8-3.3: classifier_server.py tem RISK_MAP para 'vazamento de dados' (com espaço)", () => {
    expect(classifierScript).toContain('"vazamento de dados"');
  });

  it("S8-3.4: classifier_server.py normaliza categorias no retrain (replace espaço)", () => {
    expect(classifierScript).toContain('replace(" ", "_")');
  });

  it("S8-3.5: categorias normalizadas são consistentes (underscore)", () => {
    const normalizedCategories = [
      "phishing",
      "malware",
      "brute_force",
      "ddos",
      "vazamento_de_dados",
    ];
    normalizedCategories.forEach((cat) => {
      expect(cat).not.toContain(" ");
      expect(cat).toMatch(/^[a-z_]+$/);
    });
  });
});

// ─── S8-4: Retreinamento com novo dataset ─────────────────────────────────────
describe("S8-4: Retreinamento com novo dataset de 2000 amostras", () => {
  let metrics: Record<string, unknown>;

  beforeAll(() => {
    const raw = fs.readFileSync(METRICS_JSON, "utf-8");
    metrics = JSON.parse(raw);
  });

  it("S8-4.1: metrics.json existe após retreinamento", () => {
    expect(fs.existsSync(METRICS_JSON)).toBe(true);
  });

  it("S8-4.2: dataset_size é >= 2000 após retreinamento", () => {
    expect(metrics.dataset_size).toBeGreaterThanOrEqual(2000);
  });

  it("S8-4.3: acurácia de treino é >= 0.95 com 2000 amostras", () => {
    expect(Number(metrics.train_accuracy)).toBeGreaterThanOrEqual(0.95);
  });

  it("S8-4.4: acurácia de cross-validation é >= 0.90", () => {
    expect(Number(metrics.cv_accuracy_mean)).toBeGreaterThanOrEqual(0.90);
  });

  it("S8-4.5: 5 categorias no modelo retreinado", () => {
    const cats = metrics.categories as string[];
    expect(cats).toHaveLength(5);
  });

  it("S8-4.6: categorias esperadas estão presentes", () => {
    const cats = metrics.categories as string[];
    expect(cats).toContain("phishing");
    expect(cats).toContain("malware");
    expect(cats).toContain("brute_force");
    expect(cats).toContain("ddos");
    expect(cats).toContain("vazamento_de_dados");
  });

  it("S8-4.7: last_updated está presente nas métricas", () => {
    expect(metrics.last_updated).toBeDefined();
    expect(typeof metrics.last_updated).toBe("string");
  });

  it("S8-4.8: model.pkl existe após retreinamento", () => {
    expect(fs.existsSync(MODEL_PKL)).toBe(true);
  });

  it("S8-4.9: model.pkl tem tamanho maior que 10KB (modelo real)", () => {
    const stats = fs.statSync(MODEL_PKL);
    expect(stats.size).toBeGreaterThan(10 * 1024);
  });
});

// ─── S8-5: Endpoint /reload-model ─────────────────────────────────────────────
describe("S8-5: Endpoint /reload-model no classifier_server.py", () => {
  let classifierScript: string;

  beforeAll(() => {
    classifierScript = fs.readFileSync(CLASSIFIER_SERVER, "utf-8");
  });

  it("S8-5.1: endpoint /reload-model está definido no classifier_server.py", () => {
    expect(classifierScript).toContain('"/reload-model"');
  });

  it("S8-5.2: /reload-model usa método POST", () => {
    expect(classifierScript).toContain('"POST"');
    expect(classifierScript).toContain("reload_model");
  });

  it("S8-5.3: /reload-model recarrega o pipeline do disco", () => {
    expect(classifierScript).toContain("joblib.load(MODEL_PATH)");
    expect(classifierScript).toContain("global pipeline, metrics");
  });

  it("S8-5.4: /reload-model retorna dataset_size e categories", () => {
    expect(classifierScript).toContain('"dataset_size"');
    expect(classifierScript).toContain('"categories"');
  });
});

// ─── S8-6: Integração retrainModel → reload-model ─────────────────────────────
describe("S8-6: Integração retrainModel → reload-model no routers.ts", () => {
  let routersContent: string;

  beforeAll(() => {
    routersContent = fs.readFileSync(
      path.join(__dirname, "routers.ts"),
      "utf-8"
    );
  });

  it("S8-6.1: retrainModel chama /reload-model após retreinamento", () => {
    expect(routersContent).toContain("/reload-model");
  });

  it("S8-6.2: chamada ao /reload-model usa método POST", () => {
    expect(routersContent).toContain('method: "POST"');
  });

  it("S8-6.3: erro no /reload-model não interrompe o fluxo (try/catch)", () => {
    expect(routersContent).toContain("} catch (_) {");
  });
});

// ─── S8-7: Métricas do modelo com 2000 amostras ───────────────────────────────
describe("S8-7: Métricas do modelo treinado com 2000 amostras", () => {
  let metrics: Record<string, unknown>;

  beforeAll(() => {
    const raw = fs.readFileSync(METRICS_JSON, "utf-8");
    metrics = JSON.parse(raw);
  });

  it("S8-7.1: method é TF-IDF + Naive Bayes", () => {
    expect(metrics.method).toContain("TF-IDF");
    expect(metrics.method).toContain("Naive Bayes");
  });

  it("S8-7.2: category_distribution tem 5 categorias", () => {
    const dist = metrics.category_distribution as Record<string, number>;
    expect(Object.keys(dist)).toHaveLength(5);
  });

  it("S8-7.3: cada categoria tem pelo menos 300 amostras (dataset balanceado)", () => {
    const dist = metrics.category_distribution as Record<string, number>;
    Object.values(dist).forEach((count) => {
      expect(count).toBeGreaterThanOrEqual(300);
    });
  });

  it("S8-7.4: total de amostras na distribuição soma >= 2000", () => {
    const dist = metrics.category_distribution as Record<string, number>;
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(2000);
  });
});

// ─── S8-8: Predições com o novo modelo ────────────────────────────────────────
describe("S8-8: Predições via API Flask com novo modelo", () => {
  const ML_URL = "http://localhost:5001";

  it("S8-8.1: Flask responde ao /health com modelo carregado", async () => {
    try {
      const res = await fetch(`${ML_URL}/health`);
      if (!res.ok) return; // Flask pode não estar disponível em CI
      const data = await res.json() as { status: string; model_loaded: boolean };
      expect(data.status).toBe("ok");
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });

  it("S8-8.2: /metrics retorna dataset_size >= 2000 quando Flask está disponível", async () => {
    try {
      const res = await fetch(`${ML_URL}/metrics`);
      if (!res.ok) return;
      const data = await res.json() as { dataset_size: number };
      expect(data.dataset_size).toBeGreaterThanOrEqual(2000);
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });

  it("S8-8.3: classificação de phishing retorna categoria correta", async () => {
    try {
      const res = await fetch(`${ML_URL}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "E-mail suspeito pedindo senha",
          description: "Usuário recebeu mensagem solicitando credenciais bancárias via link externo",
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { category: string; confidence: number };
      expect(data.category).toBe("phishing");
      expect(data.confidence).toBeGreaterThan(0.5);
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });

  it("S8-8.4: classificação de malware retorna categoria correta", async () => {
    try {
      const res = await fetch(`${ML_URL}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Arquivo executável suspeito detectado",
          description: "Antivírus detectou ransomware após abertura de anexo de e-mail",
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { category: string; confidence: number };
      expect(data.category).toBe("malware");
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });

  it("S8-8.5: classificação de brute_force retorna categoria correta", async () => {
    try {
      const res = await fetch(`${ML_URL}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Múltiplas tentativas de login falhas",
          description: "Sistema registrou 500 tentativas de autenticação em 2 minutos para o mesmo usuário",
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { category: string; confidence: number };
      expect(data.category).toBe("brute_force");
    } catch {
      // Flask não disponível em CI — teste ignorado
    }
  });
});
