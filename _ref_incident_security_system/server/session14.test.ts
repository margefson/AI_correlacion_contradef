/**
 * session14.test.ts — Testes de Regressão: Sessão 14
 *
 * Cobre as correções implementadas na Sessão 14:
 *  S14-1: Fallback de métricas ML via metrics.json quando Flask offline
 *  S14-2: Labels corretas no AdminML (Acurácia Treinamento / Acurácia Avaliação)
 *  S14-3: URLs CDN para download dos datasets (sem dependência do Flask)
 *  S14-4: Tratamento gracioso de erros nas procedures ML
 *  S14-5: Tipo MLMetrics extraído para reutilização no fallback
 *  S14-6: Procedures getDataset e getEvalDataset com fallback via metrics.json
 *  S14-7: Procedure evaluateModel com timeout e mensagem de erro clara
 *  S14-8: Procedure retrainModel com timeout de 2 minutos e mensagem clara
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import fs from "fs";
import path from "path";

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROUTERS_TS = path.resolve(__dirname, "routers.ts");
const ADMIN_ML_TSX = path.resolve(__dirname, "../client/src/pages/AdminML.tsx");
const METRICS_JSON = path.resolve(__dirname, "../ml/metrics.json");

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../server/db", () => ({
  getIncidentsByUser: vi.fn().mockResolvedValue([]),
  getIncidentById: vi.fn(),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
  getGlobalStats: vi.fn().mockResolvedValue({ total: 0, thisWeek: 0, byRisk: {}, byCategory: {} }),
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
vi.mock("../server/_core/auth", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock("../server/email", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("../server/_core/notification", () => ({
  notifyOwner: vi.fn(),
}));

vi.mock("../server/pdf", () => ({
  generatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn(), on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } })),
}));
function makeAdminCtx() {
  return {
    user: { id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" },
    req: { headers: {} },
    res: { setHeader: vi.fn(), cookie: vi.fn() },
  };
}

// ─── S14-1: Fallback de métricas ML via metrics.json ─────────────────────────
describe("S14-1: Fallback de métricas ML via metrics.json", () => {
  it("S14-1.1: metrics.json existe no projeto", () => {
    expect(fs.existsSync(METRICS_JSON)).toBe(true);
  });

  it("S14-1.2: metrics.json contém campos de treinamento e avaliação", () => {
    const raw = fs.readFileSync(METRICS_JSON, "utf-8");
    const metrics = JSON.parse(raw);
    expect(metrics).toHaveProperty("categories");
    expect(metrics).toHaveProperty("training");
    expect(metrics).toHaveProperty("train_accuracy");
    expect(metrics.training).toHaveProperty("train_accuracy");
    expect(metrics.training).toHaveProperty("dataset_size");
  });

  it("S14-1.3: metrics.json contém avaliação com eval_accuracy", () => {
    const raw = fs.readFileSync(METRICS_JSON, "utf-8");
    const metrics = JSON.parse(raw);
    expect(metrics).toHaveProperty("evaluation");
    if (metrics.evaluation) {
      expect(metrics.evaluation).toHaveProperty("eval_accuracy");
      expect(typeof metrics.evaluation.eval_accuracy).toBe("number");
    }
  });

  it("S14-1.4: routers.ts define função readMetricsJson para fallback", () => {
    const src = fs.readFileSync(ROUTERS_TS, "utf-8");
    expect(src).toContain("readMetricsJson");
    expect(src).toContain("METRICS_JSON_PATH");
  });

  it("S14-1.5: routers.ts importa fs e path para leitura do metrics.json", () => {
    const src = fs.readFileSync(ROUTERS_TS, "utf-8");
    expect(src).toContain("import fs from");
    expect(src).toContain("import path from");
  });
});

// ─── S14-2: Labels corretas no AdminML ───────────────────────────────────────
describe("S14-2: Labels corretas no AdminML", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ADMIN_ML_TSX, "utf-8"); });

  it("S14-2.1: AdminML usa label 'Acurácia Treinamento' (não 'Acurácia CV')", () => {
    expect(src).toContain("Acurácia Treinamento");
    expect(src).not.toContain("Acurácia CV");
  });

  it("S14-2.2: AdminML usa label 'Acurácia Avaliação' (não 'Acurácia Eval')", () => {
    expect(src).toContain("Acurácia Avaliação");
    expect(src).not.toContain("Acurácia Eval");
  });

  it("S14-2.3: AdminML exibe train_accuracy para Acurácia Treinamento", () => {
    expect(src).toContain("train_accuracy");
  });

  it("S14-2.4: AdminML exibe eval_accuracy para Acurácia Avaliação", () => {
    expect(src).toContain("eval_accuracy");
  });
});

// ─── S14-3: URLs CDN para download dos datasets ───────────────────────────────
describe("S14-3: URLs CDN para download dos datasets", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ADMIN_ML_TSX, "utf-8"); });

  it("S14-3.1: AdminML define DATASET_CDN_URL para download do dataset de treino", () => {
    expect(src).toContain("DATASET_CDN_URL");
    expect(src).toContain("cloudfront.net");
  });

  it("S14-3.2: AdminML define EVAL_DATASET_CDN_URL para download do dataset de avaliação", () => {
    expect(src).toContain("EVAL_DATASET_CDN_URL");
  });

  it("S14-3.3: AdminML tem função handleDownloadDataset para dataset de treino", () => {
    expect(src).toContain("handleDownloadDataset");
    expect(src).toContain("incidentes_cybersecurity_2000.xlsx");
  });

  it("S14-3.4: AdminML tem função handleDownloadEvalDataset para dataset de avaliação", () => {
    expect(src).toContain("handleDownloadEvalDataset");
    expect(src).toContain("incidentes_cybersecurity_100.xlsx");
  });

  it("S14-3.5: download usa URL CDN direta (não chama Flask para base64)", () => {
    // Verifica que handleDownloadDataset usa a URL CDN, não chama trpc
    const idx = src.indexOf("handleDownloadDataset");
    const section = src.substring(idx, idx + 300);
    expect(section).toContain("DATASET_CDN_URL");
    expect(section).not.toContain("trpc");
  });
});

// ─── S14-4: Tratamento gracioso de erros nas procedures ML ───────────────────
describe("S14-4: Tratamento gracioso de erros nas procedures ML", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S14-4.1: getMLMetrics usa try/catch para tratamento gracioso", () => {
    const idx = src.indexOf("getMLMetrics:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("try {");
    expect(section).toContain("} catch");
  });

  it("S14-4.2: getDataset usa try/catch para tratamento gracioso", () => {
    const idx = src.indexOf("getDataset:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("try {");
    expect(section).toContain("} catch");
  });

  it("S14-4.3: getEvalDataset usa try/catch para tratamento gracioso", () => {
    const idx = src.indexOf("getEvalDataset:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("try {");
    expect(section).toContain("} catch");
  });

  it("S14-4.4: evaluateModel tem mensagem de erro clara em português", () => {
    const idx = src.indexOf("evaluateModel:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("Serviço ML indisponível");
  });

  it("S14-4.5: retrainModel tem mensagem de erro clara em português", () => {
    // S14: janela de 2200 chars pois retrainModel tem validação de amostras antes do try/catch
    const idx = src.indexOf("retrainModel:");
    const section = src.substring(idx, idx + 2200);
    expect(section).toContain("Serviço ML indisponível");
  });
});

// ─── S14-5: Tipo MLMetrics extraído para reutilização ────────────────────────
describe("S14-5: Tipo MLMetrics extraído para reutilização no fallback", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S14-5.1: routers.ts define tipo MLMetrics separado", () => {
    expect(src).toContain("type MLMetrics = {");
  });

  it("S14-5.2: MLMetrics inclui campo training com dataset_size e train_accuracy", () => {
    const idx = src.indexOf("type MLMetrics");
    const section = src.substring(idx, idx + 1200);
    expect(section).toContain("training:");
    expect(section).toContain("dataset_size:");
    expect(section).toContain("train_accuracy:");
  });

  it("S14-5.3: MLMetrics inclui campo evaluation nullable", () => {
    const idx = src.indexOf("type MLMetrics");
    const section = src.substring(idx, idx + 1600);
    expect(section).toContain("evaluation:");
    expect(section).toContain("| null");
  });

  it("S14-5.4: MLMetrics inclui campos legados para compatibilidade", () => {
    const idx = src.indexOf("type MLMetrics");
    const section = src.substring(idx, idx + 1500);
    expect(section).toContain("cv_accuracy_mean:");
    expect(section).toContain("category_distribution:");
  });
});

// ─── S14-6: Fallback de getDataset e getEvalDataset via metrics.json ─────────
describe("S14-6: Fallback de getDataset e getEvalDataset via metrics.json", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S14-6.1: getDataset fallback retorna filename 'incidentes_cybersecurity_2000.xlsx'", () => {
    const idx = src.indexOf("getDataset:");
    const section = src.substring(idx, idx + 800);
    expect(section).toContain("incidentes_cybersecurity_2000.xlsx");
  });

  it("S14-6.2: getEvalDataset fallback retorna filename 'incidentes_cybersecurity_100.xlsx'", () => {
    // S14: janela de 1000 chars pois o filename está no bloco catch
    const idx = src.indexOf("getEvalDataset:");
    const section = src.substring(idx, idx + 1000);
    expect(section).toContain("incidentes_cybersecurity_100.xlsx");
  });

  it("S14-6.3: getDataset fallback usa readMetricsJson para total_samples", () => {
    const idx = src.indexOf("getDataset:");
    const section = src.substring(idx, idx + 800);
    expect(section).toContain("readMetricsJson");
  });

  it("S14-6.4: getEvalDataset fallback usa readMetricsJson para total_samples", () => {
    const idx = src.indexOf("getEvalDataset:");
    const section = src.substring(idx, idx + 800);
    expect(section).toContain("readMetricsJson");
  });
});

// ─── S14-7: Procedure evaluateModel com timeout ───────────────────────────────
describe("S14-7: Procedure evaluateModel com timeout e tratamento de erro", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S14-7.1: evaluateModel usa AbortSignal.timeout", () => {
    const idx = src.indexOf("evaluateModel:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("AbortSignal.timeout");
  });

  it("S14-7.2: evaluateModel tem timeout de 30 segundos", () => {
    const idx = src.indexOf("evaluateModel:");
    const section = src.substring(idx, idx + 600);
    expect(section).toContain("30000");
  });

  it("S14-7.3: evaluateModel captura erro de conexão e lança TRPCError claro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await expect(caller.admin.evaluateModel()).rejects.toThrow("Serviço ML indisponível");
    vi.unstubAllGlobals();
  }, 20000);
});

// ─── S14-8: Procedure retrainModel com timeout ────────────────────────────────
describe("S14-8: Procedure retrainModel com timeout de 2 minutos", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTERS_TS, "utf-8"); });

  it("S14-8.1: retrainModel usa AbortSignal.timeout", () => {
    // S14: janela de 2200 chars pois retrainModel tem validação de amostras antes do try/catch
    const idx = src.indexOf("retrainModel:");
    const section = src.substring(idx, idx + 2200);
    expect(section).toContain("AbortSignal.timeout");
  });

  it("S14-8.2: retrainModel tem timeout de 120 segundos (2 minutos)", () => {
    const idx = src.indexOf("retrainModel:");
    const section = src.substring(idx, idx + 2200);
    expect(section).toContain("120000");
  });

  it("S14-8.3: retrainModel captura erro de conexão e lança TRPCError claro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(makeAdminCtx() as never);
    await expect(
      caller.admin.retrainModel({ samples: [{ description: "Teste", category: "phishing" }] })
    ).rejects.toThrow("Serviço ML indisponível");

    vi.unstubAllGlobals();
  }, 20000);
});
