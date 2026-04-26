/**
 * Testes individuais para as Recomendações de Segurança Contextualizadas (Seção 7.5)
 *
 * Verifica que cada categoria de incidente ativa a recomendação correta:
 * - Malware → Isolamento de Sistemas Comprometidos
 * - Vazamento de Dados → Notificação ao DPO e Avaliação LGPD
 * - Phishing → Reforço de Treinamento de Conscientização
 * - Força Bruta → Bloqueio Automático após Falhas de Login
 * - DDoS → Revisão de Rate Limiting e CDN
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  createLocalUser: vi.fn(),
  upsertUser: vi.fn(),
  createIncident: vi.fn(),
  getIncidentsByUser: vi.fn(),
  getIncidentById: vi.fn(),
  deleteIncident: vi.fn(),
  getIncidentStatsByUser: vi.fn(),
  getIncidentRiskStatsByUser: vi.fn(),
  getGlobalStats: vi.fn(),
  getAllIncidents: vi.fn(),
  countAllIncidents: vi.fn(),
  reclassifyIncident: vi.fn(),
  getAllUsers: vi.fn(),
  updateUserRole: vi.fn(),
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));
import * as db from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "local_user-1",
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    passwordHash: null,
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function mockStatsForCategory(category: string, count: number = 1) {
  vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
    { category: category as "malware", count },
  ]);
  vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([
    { riskLevel: "high" as const, count },
  ]);
  vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);
}

// ─── Testes de Recomendações por Categoria (Seção 7.5) ───────────────────────

describe("7.5 Recomendações de Segurança Contextualizadas", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── 7.5.1 Malware ──────────────────────────────────────────────────────────
  describe("7.5.1 Malware → Isolamento de Sistemas Comprometidos", () => {
    it("ativa recomendação de isolamento quando há incidentes de malware", async () => {
      mockStatsForCategory("malware", 2);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);

      const rec = result.recommendations.find((r: { category: string }) => r.category === "malware");
      expect(rec).toBeDefined();
      expect(rec!.title).toBe("Isolamento de Sistemas Comprometidos");
    });

    it("recomendação de malware tem prioridade crítica", async () => {
      mockStatsForCategory("malware", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "malware");
      expect(rec!.priority).toBe("critical");
    });

    it("recomendação de malware inclui ação de isolamento e varredura", async () => {
      mockStatsForCategory("malware", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "malware");
      expect(rec!.action).toContain("Isolar");
      expect(rec!.description).toContain("malware");
    });

    it("recomendação de malware inclui a contagem de incidentes", async () => {
      mockStatsForCategory("malware", 3);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "malware");
      expect(rec!.count).toBe(3);
    });
  });

  // ── 7.5.2 Vazamento de Dados ───────────────────────────────────────────────
  describe("7.5.2 Vazamento de Dados → Notificação ao DPO e Avaliação LGPD", () => {
    it("ativa recomendação de DPO/LGPD quando há incidentes de vazamento", async () => {
      mockStatsForCategory("vazamento_de_dados", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "vazamento_de_dados");
      expect(rec).toBeDefined();
      expect(rec!.title).toBe("Notificação ao DPO e Avaliação LGPD");
    });

    it("recomendação de vazamento tem prioridade crítica", async () => {
      mockStatsForCategory("vazamento_de_dados", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "vazamento_de_dados");
      expect(rec!.priority).toBe("critical");
    });

    it("recomendação de vazamento menciona LGPD e DPO", async () => {
      mockStatsForCategory("vazamento_de_dados", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "vazamento_de_dados");
      expect(rec!.description).toContain("LGPD");
      expect(rec!.description).toContain("DPO");
    });

    it("recomendação de vazamento menciona prazo de 72h para notificação", async () => {
      mockStatsForCategory("vazamento_de_dados", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "vazamento_de_dados");
      expect(rec!.action).toContain("72h");
    });
  });

  // ── 7.5.3 Phishing ─────────────────────────────────────────────────────────
  describe("7.5.3 Phishing → Reforço de Treinamento de Conscientização", () => {
    it("ativa recomendação de treinamento quando há incidentes de phishing", async () => {
      mockStatsForCategory("phishing", 5);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "phishing");
      expect(rec).toBeDefined();
      expect(rec!.title).toBe("Reforço de Treinamento de Conscientização");
    });

    it("recomendação de phishing tem prioridade alta", async () => {
      mockStatsForCategory("phishing", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "phishing");
      expect(rec!.priority).toBe("high");
    });

    it("recomendação de phishing menciona MFA e treinamento", async () => {
      mockStatsForCategory("phishing", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "phishing");
      expect(rec!.action).toContain("MFA");
      expect(rec!.action).toContain("treinamentos");
    });
  });

  // ── 7.5.4 Força Bruta ──────────────────────────────────────────────────────
  describe("7.5.4 Força Bruta → Bloqueio Automático após Falhas de Login", () => {
    it("ativa recomendação de bloqueio quando há incidentes de força bruta", async () => {
      mockStatsForCategory("brute_force", 3);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "brute_force");
      expect(rec).toBeDefined();
      expect(rec!.title).toBe("Bloqueio Automático após Falhas de Login");
    });

    it("recomendação de força bruta tem prioridade alta", async () => {
      mockStatsForCategory("brute_force", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "brute_force");
      expect(rec!.priority).toBe("high");
    });

    it("recomendação de força bruta menciona lockout e CAPTCHA", async () => {
      mockStatsForCategory("brute_force", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "brute_force");
      expect(rec!.action).toContain("lockout");
      expect(rec!.action).toContain("CAPTCHA");
    });

    it("recomendação de força bruta menciona 5 tentativas como limite", async () => {
      mockStatsForCategory("brute_force", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "brute_force");
      expect(rec!.action).toContain("5 tentativas");
    });
  });

  // ── 7.5.5 DDoS ─────────────────────────────────────────────────────────────
  describe("7.5.5 DDoS → Revisão de Rate Limiting e CDN", () => {
    it("ativa recomendação de CDN quando há incidentes de DDoS", async () => {
      mockStatsForCategory("ddos", 2);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "ddos");
      expect(rec).toBeDefined();
      expect(rec!.title).toBe("Revisão de Rate Limiting e CDN");
    });

    it("recomendação de DDoS tem prioridade alta", async () => {
      mockStatsForCategory("ddos", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "ddos");
      expect(rec!.priority).toBe("high");
    });

    it("recomendação de DDoS menciona CDN e rate limiting", async () => {
      mockStatsForCategory("ddos", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "ddos");
      expect(rec!.action).toContain("CDN");
      expect(rec!.description).toContain("rate limiting");
    });

    it("recomendação de DDoS menciona auto-scaling", async () => {
      mockStatsForCategory("ddos", 1);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "ddos");
      expect(rec!.action).toContain("auto-scaling");
    });
  });

  // ── 7.5.6 Múltiplas Categorias ─────────────────────────────────────────────
  describe("7.5.6 Múltiplas Categorias Simultâneas", () => {
    it("retorna múltiplas recomendações quando há múltiplas categorias", async () => {
      vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
        { category: "phishing" as const, count: 3 },
        { category: "malware" as const, count: 2 },
        { category: "ddos" as const, count: 1 },
      ]);
      vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      expect(result.recommendations.length).toBe(3);
    });

    it("ordena recomendações com prioridade crítica antes das de alta prioridade", async () => {
      vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
        { category: "phishing" as const, count: 3 },   // high
        { category: "malware" as const, count: 2 },    // critical
        { category: "ddos" as const, count: 1 },       // high
      ]);
      vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      // Malware (critical) deve vir primeiro
      expect(result.recommendations[0].category).toBe("malware");
      expect(result.recommendations[0].priority).toBe("critical");
    });

    it("não retorna recomendações para categorias sem incidentes", async () => {
      vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
        { category: "phishing" as const, count: 0 },
      ]);
      vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      expect(result.recommendations.length).toBe(0);
    });

    it("não retorna recomendações para categorias desconhecidas", async () => {
      vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
        { category: "unknown_category" as "malware", count: 5 },
      ]);
      vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      expect(result.recommendations.length).toBe(0);
    });
  });

  // ── 7.5.7 Estrutura dos Dados de Recomendação ──────────────────────────────
  describe("7.5.7 Estrutura dos Dados de Recomendação", () => {
    it("cada recomendação contém os campos obrigatórios: category, count, title, description, priority, action", async () => {
      mockStatsForCategory("phishing", 2);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations[0];
      expect(rec).toHaveProperty("category");
      expect(rec).toHaveProperty("count");
      expect(rec).toHaveProperty("title");
      expect(rec).toHaveProperty("description");
      expect(rec).toHaveProperty("priority");
      expect(rec).toHaveProperty("action");
    });

    it("campo priority é um dos valores esperados: critical, high, medium, low", async () => {
      vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
        { category: "phishing" as const, count: 1 },
        { category: "malware" as const, count: 1 },
        { category: "ddos" as const, count: 1 },
        { category: "brute_force" as const, count: 1 },
        { category: "vazamento_de_dados" as const, count: 1 },
      ]);
      vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const validPriorities = ["critical", "high", "medium", "low"];
      for (const rec of result.recommendations) {
        expect(validPriorities).toContain(rec.priority);
      }
    });

    it("campo count corresponde ao número real de incidentes da categoria", async () => {
      mockStatsForCategory("malware", 7);
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      const rec = result.recommendations.find((r: { category: string }) => r.category === "malware");
      expect(rec!.count).toBe(7);
    });

    it("stats retorna campo recommendations mesmo quando não há incidentes", async () => {
      vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([]);
      vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.incidents.stats();

      expect(result).toHaveProperty("recommendations");
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBe(0);
    });
  });
});
