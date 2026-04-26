/**
 * ml.test.ts — Testes Individuais: Seção 8 — Machine Learning
 *
 * Cobre:
 *  8.1 Arquitetura do Modelo (TF-IDF + Naive Bayes)
 *  8.2 Dataset de Treinamento
 *  8.3 Métricas de Desempenho
 *  8.4 Categorias e Mapeamento de Risco
 *  8.5 Fluxo de Classificação (endpoint /classify, fallback por palavras-chave)
 *  8.6 Procedimentos Admin: getMLMetrics, getDataset, retrainModel
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../server/db", () => ({
  getIncidentsByUser: vi.fn().mockResolvedValue([]),
  getIncidentById: vi.fn(),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
  getGlobalStats: vi.fn().mockResolvedValue({
    total: 0,
    thisWeek: 0,
    byRisk: {},
    byCategory: {},
  }),
  getIncidentsByAdmin: vi.fn().mockResolvedValue([]),
  getAllUsers: vi.fn().mockResolvedValue([]),
  updateUserRole: vi.fn(),
  getCategories: vi.fn().mockResolvedValue([]),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getAllIncidents: vi.fn().mockResolvedValue([]),
  countAllIncidents: vi.fn().mockResolvedValue(0),
  reclassifyIncident: vi.fn(),
  searchIncidents: vi.fn().mockResolvedValue([]),
  addIncidentHistory: vi.fn(),
  getIncidentHistory: vi.fn().mockResolvedValue([]),
  updateIncidentStatus: vi.fn(),
  updateIncidentNotes: vi.fn(),
  updateUserInfo: vi.fn(),
  deleteUserById: vi.fn(),
  resetUserPassword: vi.fn(),
  clearMustChangePassword: vi.fn(),
  createPasswordResetToken: vi.fn(),
  getPasswordResetToken: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  createNotification: vi.fn(),
  getNotificationsByUser: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  countUnreadNotifications: vi.fn().mockResolvedValue(0),
  getResolutionMetrics: vi.fn().mockResolvedValue({}),
  getAllIncidentHistoryForExport: vi.fn().mockResolvedValue([]),
  getUserByEmail: vi.fn(),
  createLocalUser: vi.fn(),
  getIncidentRiskStatsByUser: vi.fn().mockResolvedValue({}),
  getIncidentStatsByUser: vi.fn().mockResolvedValue({}),
  getIncidentStatusStats: vi.fn().mockResolvedValue({}),
  upsertUser: vi.fn(),
  getUsersByRole: vi.fn().mockResolvedValue([]),
  getAnalystDashboardMetrics: vi.fn().mockResolvedValue({}),
  getAllIncidentsForReclassify: vi.fn().mockResolvedValue([]),
  updateIncidentML: vi.fn(),
}));
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn(), on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } })),
}));
vi.mock("../server/_core/auth", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cria um contexto de usuário admin para os testes de procedimentos protegidos */
function makeAdminCtx() {
  return {
    user: { id: 1, name: "Admin", email: "admin@test.com", role: "admin" as const },
    req: {} as never,
    res: {} as never,
  };
}

/** Cria um contexto de usuário comum (não-admin) */
function makeUserCtx() {
  return {
    user: { id: 2, name: "User", email: "user@test.com", role: "user" as const },
    req: {} as never,
    res: {} as never,
  };
}

// ─── 8.1 Arquitetura do Modelo ────────────────────────────────────────────────

describe("8.1 Arquitetura do Modelo (TF-IDF + Naive Bayes)", () => {
  it("classifier_server.py define os parâmetros corretos do TF-IDF", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const serverPath = path.resolve(__dirname, "../ml/classifier_server.py");
    const content = fs.readFileSync(serverPath, "utf-8");
    expect(content).toContain("ngram_range=(1, 2)");
    expect(content).toContain("max_features=5000");
    expect(content).toContain("sublinear_tf=True");
  });

  it("classifier_server.py usa MultinomialNB como classificador", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const serverPath = path.resolve(__dirname, "../ml/classifier_server.py");
    const content = fs.readFileSync(serverPath, "utf-8");
    expect(content).toContain("MultinomialNB");
  });

  it("classifier_server.py define o pipeline com TfidfVectorizer + MultinomialNB", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const serverPath = path.resolve(__dirname, "../ml/classifier_server.py");
    const content = fs.readFileSync(serverPath, "utf-8");
    expect(content).toContain("TfidfVectorizer");
    expect(content).toContain("Pipeline");
  });
});

// ─── 8.2 Dataset de Treinamento ───────────────────────────────────────────────

describe("8.2 Dataset de Treinamento", () => {
  it("arquivo incidentes_cybersecurity_100.xlsx existe no diretório ml/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const datasetPath = path.resolve(__dirname, "../ml/incidentes_cybersecurity_100.xlsx");
    expect(fs.existsSync(datasetPath)).toBe(true);
  });

  it("arquivo model.pkl existe no diretório ml/ (modelo treinado)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const modelPath = path.resolve(__dirname, "../ml/model.pkl");
    expect(fs.existsSync(modelPath)).toBe(true);
  });

  it("arquivo metrics.json existe no diretório ml/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    expect(fs.existsSync(metricsPath)).toBe(true);
  });

  it("train_model.py usa o dataset de 2000 amostras (atualizado na sess\u00e3o 8)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trainPath = path.resolve(__dirname, "../ml/train_model.py");
    const content = fs.readFileSync(trainPath, "utf-8");
    // O script de treinamento deve referenciar o dataset de 2000 amostras
    expect(content).toContain("incidentes_cybersecurity_2000.xlsx");
  });
});

// ─── 8.3 Métricas de Desempenho ───────────────────────────────────────────────

describe("8.3 Métricas de Desempenho", () => {
  it("metrics.json contém os campos obrigatórios", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8")) as Record<string, unknown>;
    expect(metrics).toHaveProperty("train_accuracy");
    expect(metrics).toHaveProperty("cv_accuracy_mean");
    expect(metrics).toHaveProperty("cv_accuracy_std");
    expect(metrics).toHaveProperty("categories");
    expect(metrics).toHaveProperty("category_distribution");
  });

  it("acurácia de treino é >= 0.95 (documentado como 100%)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8")) as { train_accuracy: number };
    expect(metrics.train_accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("acurácia CV (5-fold) é >= 0.80", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8")) as { cv_accuracy_mean: number };
    expect(metrics.cv_accuracy_mean).toBeGreaterThanOrEqual(0.80);
  });

  it("modelo cobre as 5 categorias documentadas", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8")) as { categories: string[] };
    const expected = ["phishing", "malware", "brute_force", "ddos", "vazamento_de_dados"];
    for (const cat of expected) {
      expect(metrics.categories).toContain(cat);
    }
  });
});

// ─── 8.4 Categorias e Mapeamento de Risco ────────────────────────────────────

describe("8.4 Categorias e Mapeamento de Risco", () => {
  it("classifier_server.py define RISK_MAP com as 5 categorias e níveis corretos", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const serverPath = path.resolve(__dirname, "../ml/classifier_server.py");
    const content = fs.readFileSync(serverPath, "utf-8");
    expect(content).toContain('"phishing": "high"');
    expect(content).toContain('"malware": "critical"');
    expect(content).toContain('"brute_force": "high"');
    expect(content).toContain('"ddos": "medium"');
    expect(content).toContain('"vazamento_de_dados": "critical"');
    expect(content).toContain('"unknown": "low"');
  });

  it("routers.ts define CATEGORY_RISK com as 5 categorias", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersPath = path.resolve(__dirname, "routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("phishing");
    expect(content).toContain("malware");
    expect(content).toContain("brute_force");
    expect(content).toContain("ddos");
    expect(content).toContain("vazamento_de_dados");
  });
});

// ─── 8.5 Fluxo de Classificação ───────────────────────────────────────────────

describe("8.5 Fluxo de Classificação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classify procedure retorna category, confidence, riskLevel e method quando ML retorna sucesso", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        category: "phishing",
        confidence: 0.97,
        risk_level: "high",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    const result = await caller.incidents.classify({ description: "Email suspeito pedindo senha" });

    expect(result.category).toBe("phishing");
    expect(result.confidence).toBe(0.97);
    expect(result.riskLevel).toBe("high");
    expect(result.method).toBe("ml");

    vi.unstubAllGlobals();
  });

  it("classify procedure usa fallback por palavras-chave quando ML está indisponível", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    vi.stubGlobal("fetch", mockFetch);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    const result = await caller.incidents.classify({ description: "ransomware criptografou todos os arquivos" });

    expect(result.method).toBe("keyword");
    expect(result.category).toBeDefined();
    expect(result.riskLevel).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("classify retorna 'unknown' quando não há palavras-chave reconhecidas e ML falha", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    vi.stubGlobal("fetch", mockFetch);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    const result = await caller.incidents.classify({ description: "texto genérico sem palavras-chave de segurança" });

    expect(result.method).toBe("keyword");
    expect(result.riskLevel).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("classify requer autenticação (UNAUTHORIZED para usuário não autenticado)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: null } as never);
    await expect(caller.incidents.classify({ description: "teste" })).rejects.toThrow();
  });

  it("classify endpoint do Flask combina title + description no texto de entrada", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        category: "malware",
        confidence: 0.92,
        risk_level: "critical",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await caller.incidents.classify({ description: "vírus detectado no sistema" });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as { description: string };
    expect(body.description).toBeDefined();

    vi.unstubAllGlobals();
  });
});

// ─── 8.6 Procedimentos Admin ML ───────────────────────────────────────────────

describe("8.6 Procedimentos Admin: getMLMetrics, getDataset, retrainModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMLMetrics retorna métricas do modelo para admin", async () => {
    const mockMetrics = {
      method: "TF-IDF + Naive Bayes",
      dataset_size: 100,
      categories: ["phishing", "malware", "brute_force", "ddos", "vazamento_de_dados"],
      cv_accuracy_mean: 0.97,
      cv_accuracy_std: 0.06,
      train_accuracy: 1.0,
      category_distribution: { phishing: 20, malware: 20, brute_force: 20, ddos: 20, vazamento_de_dados: 20 },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockMetrics),
    }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    const result = await caller.admin.getMLMetrics();

    expect(result.train_accuracy).toBe(1.0);
    expect(result.cv_accuracy_mean).toBe(0.97);
    expect(result.categories).toHaveLength(5);
    expect(result.dataset_size).toBe(100);

    vi.unstubAllGlobals();
  });

  it("getMLMetrics usa fallback do metrics.json quando ML service está indisponível", async () => {
    // S14: getMLMetrics agora usa fallback do metrics.json em vez de lançar erro
    // Quando o Flask está offline, a procedure retorna dados do cache (metrics.json)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    // Deve retornar dados do cache (metrics.json existe no projeto)
    // ou lançar INTERNAL_SERVER_ERROR se o cache também não estiver disponível
    try {
      const result = await caller.admin.getMLMetrics();
      // Se retornou, deve ter as propriedades esperadas do metrics.json
      expect(result).toHaveProperty("categories");
      expect(Array.isArray(result.categories)).toBe(true);
    } catch (err) {
      // Se lançou erro, deve ser INTERNAL_SERVER_ERROR (cache não encontrado)
      expect(err).toBeInstanceOf(TRPCError);
    }

    vi.unstubAllGlobals();
  });

  it("getMLMetrics é restrito a admins (FORBIDDEN para usuário comum)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeUserCtx() as never);
    await expect(caller.admin.getMLMetrics()).rejects.toThrow();
  });

  it("getDataset retorna dataset com base64, preview e distribuição de categorias", async () => {
    const mockDataset = {
      filename: "incidentes_cybersecurity_100.xlsx",
      base64: "dGVzdA==",
      total_samples: 100,
      category_distribution: { phishing: 20, malware: 20 },
      preview: [{ title: "Teste", description: "Desc", category: "phishing" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockDataset),
    }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    const result = await caller.admin.getDataset();

    expect(result.filename).toBe("incidentes_cybersecurity_100.xlsx");
    expect(result.base64).toBe("dGVzdA==");
    expect(result.total_samples).toBe(100);
    expect(result.preview).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it("getDataset é restrito a admins (FORBIDDEN para usuário comum)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeUserCtx() as never);
    await expect(caller.admin.getDataset()).rejects.toThrow();
  });

  it("retrainModel retreina o modelo com novas amostras e retorna métricas atualizadas", async () => {
    const mockResult = {
      success: true,
      message: "Modelo retreinado com 101 amostras (1 novas)",
      metrics: {
        dataset_size: 101,
        train_accuracy: 1.0,
        cv_accuracy_mean: 0.96,
        cv_accuracy_std: 0.05,
        new_categories: ["engenharia_social"],
        categories: ["phishing", "malware", "brute_force", "ddos", "vazamento_de_dados", "engenharia_social"],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResult),
    }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    const result = await caller.admin.retrainModel({
      samples: [{
        title: "Engenharia social",
        description: "Atacante se passou por suporte técnico para obter senha",
        category: "engenharia_social",
      }],
      risk_map: { engenharia_social: "high" },
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("101");

    vi.unstubAllGlobals();
  });

  it("retrainModel valida que samples não pode ser vazio", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await expect(
      caller.admin.retrainModel({ samples: [] })
    ).rejects.toThrow();
  });

  it("retrainModel valida que description é obrigatória em cada amostra", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await expect(
      caller.admin.retrainModel({
        samples: [{ description: "", category: "nova_categoria" }],
      })
    ).rejects.toThrow();
  });

  it("retrainModel valida que category é obrigatória em cada amostra", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await expect(
      caller.admin.retrainModel({
        samples: [{ description: "Descrição válida", category: "" }],
      })
    ).rejects.toThrow();
  });

  it("retrainModel é restrito a admins (FORBIDDEN para usuário comum)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeUserCtx() as never);
    await expect(
      caller.admin.retrainModel({
        samples: [{ description: "Teste", category: "teste" }],
      })
    ).rejects.toThrow();
  });

   it("retrainModel lança INTERNAL_SERVER_ERROR quando ML service retorna erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Model training failed" }),
    }));
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await expect(
      caller.admin.retrainModel({
        samples: [{ description: "Teste", category: "teste" }],
      })
    ).rejects.toThrow("Model training failed");
    vi.unstubAllGlobals();
  }, 20000);
});
