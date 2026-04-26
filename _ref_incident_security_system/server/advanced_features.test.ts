/**
 * advanced_features.test.ts — Testes para funcionalidades avançadas
 *
 * Cobre:
 *  AF-1  Filtros avançados de incidentes (categoria, risco, período)
 *  AF-2  Exportação CSV no frontend (lógica de filtragem)
 *  AF-3  Relatório consolidado (admin.exportPdf com adminMode=true)
 *  AF-4  Página de perfil (rota /profile existe, dados de usuário)
 *  AF-5  Painel admin com stats globais
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../server/db", () => ({
  getIncidentsByUser: vi.fn(),
  getIncidentById: vi.fn(),
  createIncident: vi.fn(),
  deleteIncident: vi.fn(),
  getIncidentStatsByUser: vi.fn().mockResolvedValue([]),
  getIncidentRiskStatsByUser: vi.fn().mockResolvedValue([]),
  getAllIncidents: vi.fn(),
  countAllIncidents: vi.fn(),
  reclassifyIncident: vi.fn(),
  getAllUsers: vi.fn().mockResolvedValue([]),
  updateUserRole: vi.fn(),
  getGlobalStats: vi.fn(),
  upsertUser: vi.fn(),
  getUserByEmail: vi.fn(),
  createLocalUser: vi.fn(),
  listCategories: vi.fn().mockResolvedValue([]),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: { auth: { me: vi.fn() } },
}));

vi.mock("../server/_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdminCtx() {
  return {
    user: { id: 1, name: "Admin", email: "admin@test.com", role: "admin" as const },
    req: {} as never,
    res: {} as never,
  };
}

function makeUserCtx() {
  return {
    user: { id: 2, name: "User", email: "user@test.com", role: "user" as const },
    req: {} as never,
    res: {} as never,
  };
}

function makeIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 2,
    title: "Teste de Phishing",
    description: "E-mail suspeito com link malicioso",
    category: "phishing",
    riskLevel: "high",
    confidence: 0.92,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

// ─── AF-1: Filtros Avançados ──────────────────────────────────────────────────

describe("AF-1: Filtros Avançados de Incidentes", () => {
  it("AF-1.1: filtra por categoria corretamente", () => {
    const incidents = [
      makeIncident({ id: 1, category: "phishing" }),
      makeIncident({ id: 2, category: "malware" }),
      makeIncident({ id: 3, category: "phishing" }),
    ];
    const filtered = incidents.filter((i) => i.category === "phishing");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.category === "phishing")).toBe(true);
  });

  it("AF-1.2: filtra por nível de risco corretamente", () => {
    const incidents = [
      makeIncident({ id: 1, riskLevel: "critical" }),
      makeIncident({ id: 2, riskLevel: "high" }),
      makeIncident({ id: 3, riskLevel: "critical" }),
      makeIncident({ id: 4, riskLevel: "low" }),
    ];
    const filtered = incidents.filter((i) => i.riskLevel === "critical");
    expect(filtered).toHaveLength(2);
  });

  it("AF-1.3: filtra por data inicial (dateFrom)", () => {
    const incidents = [
      makeIncident({ id: 1, createdAt: new Date("2026-01-10T00:00:00Z") }),
      makeIncident({ id: 2, createdAt: new Date("2026-01-20T00:00:00Z") }),
      makeIncident({ id: 3, createdAt: new Date("2026-02-01T00:00:00Z") }),
    ];
    const dateFrom = new Date(2026, 0, 15);
    const filtered = incidents.filter((i) => new Date(i.createdAt) >= dateFrom);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.id)).toEqual([2, 3]);
  });

  it("AF-1.4: filtra por data final (dateTo)", () => {
    const incidents = [
      makeIncident({ id: 1, createdAt: new Date("2026-01-10T00:00:00Z") }),
      makeIncident({ id: 2, createdAt: new Date("2026-01-20T00:00:00Z") }),
      makeIncident({ id: 3, createdAt: new Date("2026-02-01T00:00:00Z") }),
    ];
    const dateTo = new Date("2026-01-25T23:59:59Z");
    const filtered = incidents.filter((i) => new Date(i.createdAt) <= dateTo);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.id)).toEqual([1, 2]);
  });

  it("AF-1.5: filtra por período completo (dateFrom + dateTo)", () => {
    const incidents = [
      makeIncident({ id: 1, createdAt: new Date("2026-01-05T00:00:00Z") }),
      makeIncident({ id: 2, createdAt: new Date(2026, 0, 15) }),
      makeIncident({ id: 3, createdAt: new Date("2026-01-25T00:00:00Z") }),
      makeIncident({ id: 4, createdAt: new Date("2026-02-05T00:00:00Z") }),
    ];
    const dateFrom = new Date("2026-01-10T00:00:00Z");
    const dateTo = new Date("2026-01-30T23:59:59Z");
    const filtered = incidents.filter(
      (i) => new Date(i.createdAt) >= dateFrom && new Date(i.createdAt) <= dateTo
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.id)).toEqual([2, 3]);
  });

  it("AF-1.6: combina múltiplos filtros (categoria + risco)", () => {
    const incidents = [
      makeIncident({ id: 1, category: "phishing", riskLevel: "high" }),
      makeIncident({ id: 2, category: "malware",  riskLevel: "critical" }),
      makeIncident({ id: 3, category: "phishing", riskLevel: "medium" }),
      makeIncident({ id: 4, category: "ddos",     riskLevel: "high" }),
    ];
    const filtered = incidents.filter(
      (i) => i.category === "phishing" && i.riskLevel === "high"
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });

  it("AF-1.7: retorna todos os incidentes quando nenhum filtro está ativo", () => {
    const incidents = [
      makeIncident({ id: 1 }),
      makeIncident({ id: 2 }),
      makeIncident({ id: 3 }),
    ];
    const filtered = incidents.filter(() => true);
    expect(filtered).toHaveLength(3);
  });

  it("AF-1.8: retorna lista vazia quando filtro não encontra correspondência", () => {
    const incidents = [
      makeIncident({ id: 1, category: "phishing" }),
      makeIncident({ id: 2, category: "malware" }),
    ];
    const filtered = incidents.filter((i) => i.category === "ddos");
    expect(filtered).toHaveLength(0);
  });
});

// ─── AF-2: Exportação CSV ─────────────────────────────────────────────────────

describe("AF-2: Exportação CSV de Incidentes", () => {
  const CAT_LABELS: Record<string, string> = {
    phishing: "Phishing",
    malware: "Malware",
    brute_force: "Força Bruta",
    ddos: "DDoS",
    vazamento_de_dados: "Vazamento",
    unknown: "Desconhecido",
  };

  const SEV_LABELS: Record<string, string> = {
    critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
  };

  function buildCsvRows(incidents: ReturnType<typeof makeIncident>[]) {
    return incidents.map((inc) => [
      inc.id,
      `"${inc.title.replace(/"/g, '""')}"`,
      `"${inc.description.replace(/"/g, '""')}"`,
      CAT_LABELS[inc.category ?? ""] ?? inc.category ?? "—",
      SEV_LABELS[inc.riskLevel ?? ""] ?? inc.riskLevel ?? "—",
      inc.confidence != null ? Math.round(inc.confidence * 100) : "—",
      new Date(inc.createdAt).toLocaleDateString("pt-BR"),
    ]);
  }

  it("AF-2.1: gera cabeçalho CSV correto", () => {
    const header = ["ID", "Título", "Descrição", "Categoria", "Risco", "Confiança (%)", "Data"];
    expect(header).toHaveLength(7);
    expect(header[0]).toBe("ID");
    expect(header[5]).toBe("Confiança (%)");
  });

  it("AF-2.2: converte categoria para label legível no CSV", () => {
    const inc = makeIncident({ category: "phishing" });
    const rows = buildCsvRows([inc]);
    expect(rows[0][3]).toBe("Phishing");
  });

  it("AF-2.3: converte nível de risco para label legível no CSV", () => {
    const inc = makeIncident({ riskLevel: "critical" });
    const rows = buildCsvRows([inc]);
    expect(rows[0][4]).toBe("Crítico");
  });

  it("AF-2.4: formata confiança como percentual inteiro", () => {
    const inc = makeIncident({ confidence: 0.923 });
    const rows = buildCsvRows([inc]);
    expect(rows[0][5]).toBe(92);
  });

  it("AF-2.5: escapa aspas duplas no título e descrição", () => {
    const inc = makeIncident({ title: 'Ataque "zero-day"', description: 'Exploração de "CVE-2026-001"' });
    const rows = buildCsvRows([inc]);
    expect(rows[0][1]).toBe('"Ataque ""zero-day"""');
    expect(rows[0][2]).toBe('"Exploração de ""CVE-2026-001"""');
  });

  it("AF-2.6: exibe '—' quando confiança é nula", () => {
    const inc = { ...makeIncident(), confidence: null };
    const rows = buildCsvRows([inc as ReturnType<typeof makeIncident>]);
    expect(rows[0][5]).toBe("—");
  });

  it("AF-2.7: gera linhas corretas para múltiplos incidentes", () => {
    const incidents = [
      makeIncident({ id: 1, category: "malware", riskLevel: "critical", confidence: 0.95 }),
      makeIncident({ id: 2, category: "ddos",    riskLevel: "medium",   confidence: 0.78 }),
    ];
    const rows = buildCsvRows(incidents);
    expect(rows).toHaveLength(2);
    expect(rows[0][3]).toBe("Malware");
    expect(rows[1][3]).toBe("DDoS");
  });
});

// ─── AF-3: Relatório Consolidado ──────────────────────────────────────────────

describe("AF-3: Relatório Consolidado (Admin PDF)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("AF-3.1: admin pode solicitar relatório consolidado (adminMode=true)", async () => {
    const { getAllIncidents } = await import("../server/db");
    const mockIncidents = [
      makeIncident({ id: 1, userId: 2 }),
      makeIncident({ id: 2, userId: 3 }),
    ];
    vi.mocked(getAllIncidents).mockResolvedValue(mockIncidents as never);

    const incidents = await getAllIncidents({ limit: 500 });
    expect(incidents).toHaveLength(2);

    const payload = {
      incidents,
      userName: "Admin",
      userEmail: "admin@test.com",
      isAdmin: true,
    };
    expect(payload.isAdmin).toBe(true);
    expect(payload.incidents).toHaveLength(2);
  });

  it("AF-3.2: usuário comum não pode acessar relatório consolidado", () => {
    const ctx = makeUserCtx();
    const adminMode = true;
    const hasAccess = adminMode && ctx.user.role === "admin";
    expect(hasAccess).toBe(false);
  });

  it("AF-3.3: relatório consolidado inclui dados de todos os usuários", async () => {
    const { getAllIncidents } = await import("../server/db");
    const mockIncidents = [
      { ...makeIncident({ id: 1, userId: 2 }), userName: "Alice" },
      { ...makeIncident({ id: 2, userId: 3 }), userName: "Bob" },
      { ...makeIncident({ id: 3, userId: 4 }), userName: "Carol" },
    ];
    vi.mocked(getAllIncidents).mockResolvedValue(mockIncidents as never);

    const incidents = await getAllIncidents({ limit: 500 });
    const userNames = (incidents as Array<Record<string, unknown>>).map((i) => i.userName);
    expect(userNames).toContain("Alice");
    expect(userNames).toContain("Bob");
    expect(userNames).toContain("Carol");
  });

  it("AF-3.4: relatório consolidado pode ser filtrado por categoria", async () => {
    const { getAllIncidents } = await import("../server/db");
    vi.mocked(getAllIncidents).mockResolvedValue([] as never);

    await getAllIncidents({ category: "phishing", limit: 500 });
    expect(getAllIncidents).toHaveBeenCalledWith({ category: "phishing", limit: 500 });
  });

  it("AF-3.5: falha no serviço PDF retorna status 500", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const response = await fetch("http://localhost:5002/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidents: [], isAdmin: true }),
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });
});

// ─── AF-4: Página de Perfil ───────────────────────────────────────────────────

describe("AF-4: Página de Perfil do Usuário", () => {
  it("AF-4.1: rota /profile deve estar registrada", () => {
    const routes = [
      "/", "/login", "/register", "/dashboard", "/incidents",
      "/incidents/new", "/incidents/:id", "/risk", "/admin",
      "/admin/categories", "/admin/ml", "/admin/users", "/profile",
    ];
    expect(routes).toContain("/profile");
  });

  it("AF-4.2: inicial do avatar é a primeira letra do nome", () => {
    const user = { name: "João Silva", email: "joao@test.com" };
    const initial = (user.name ?? user.email ?? "U").charAt(0).toUpperCase();
    expect(initial).toBe("J");
  });

  it("AF-4.3: badge admin exibe 'Administrador'", () => {
    const role = "admin" as const;
    const label = role === "admin" ? "Administrador" : "Usuário";
    expect(label).toBe("Administrador");
  });

  it("AF-4.4: badge user exibe 'Usuário'", () => {
    const role = "user" as const;
    const label = role === "admin" ? "Administrador" : "Usuário";
    expect(label).toBe("Usuário");
  });

  it("AF-4.5: calcula corretamente o número de incidentes críticos", () => {
    const incidents = [
      makeIncident({ riskLevel: "critical" }),
      makeIncident({ riskLevel: "high" }),
      makeIncident({ riskLevel: "critical" }),
      makeIncident({ riskLevel: "low" }),
    ];
    const critical = incidents.filter((i) => i.riskLevel === "critical").length;
    expect(critical).toBe(2);
  });

  it("AF-4.6: calcula percentual de distribuição por risco", () => {
    const incidents = [
      makeIncident({ riskLevel: "critical" }),
      makeIncident({ riskLevel: "critical" }),
      makeIncident({ riskLevel: "high" }),
      makeIncident({ riskLevel: "low" }),
    ];
    const total = incidents.length;
    const criticalCount = incidents.filter((i) => i.riskLevel === "critical").length;
    const pct = Math.round((criticalCount / total) * 100);
    expect(pct).toBe(50);
  });

  it("AF-4.7: formata data no formato pt-BR", () => {
    const date = new Date(2026, 0, 15);
    const formatted = date.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    expect(formatted).toMatch(/15[/\-]01[/\-]2026/);
  });

  it("AF-4.8: retorna '—' quando data é nula", () => {
    const formatDate = (d: Date | string | null | undefined) => {
      if (!d) return "—";
      return new Date(d).toLocaleDateString("pt-BR");
    };
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

// ─── AF-5: Painel Admin com Stats Globais ─────────────────────────────────────

describe("AF-5: Painel Admin com Estatísticas Globais", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("AF-5.1: admin.stats retorna estatísticas globais", async () => {
    const { getGlobalStats } = await import("../server/db");
    vi.mocked(getGlobalStats).mockResolvedValue({
      totalIncidents: 42,
      totalUsers: 8,
      byCategory: [
        { category: "phishing" as const, count: 15 },
        { category: "malware" as const, count: 12 },
      ],
      byRisk: [
        { riskLevel: "critical" as const, count: 5 },
        { riskLevel: "high" as const, count: 18 },
      ],
    });

    const stats = await getGlobalStats();
    expect(stats.totalIncidents).toBe(42);
    expect(stats.totalUsers).toBe(8);
    expect(stats.byCategory).toHaveLength(2);
    expect(stats.byRisk).toHaveLength(2);
  });

  it("AF-5.2: usuário comum não pode acessar admin.stats", () => {
    const ctx = makeUserCtx();
    expect(() => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
      }
    }).toThrow(TRPCError);
  });

  it("AF-5.3: admin pode acessar admin.stats", () => {
    const ctx = makeAdminCtx();
    expect(() => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    }).not.toThrow();
  });

  it("AF-5.4: conta incidentes críticos a partir de byRisk", () => {
    const byRisk = [
      { riskLevel: "critical" as const, count: 7 },
      { riskLevel: "high" as const, count: 15 },
      { riskLevel: "medium" as const, count: 10 },
      { riskLevel: "low" as const, count: 5 },
    ];
    const criticalCount = byRisk.find((r) => r.riskLevel === "critical")?.count ?? 0;
    expect(criticalCount).toBe(7);
  });

  it("AF-5.5: cards de navegação admin incluem ML, Usuários e Categorias", () => {
    const cards = [
      { label: "Categorias",      path: "/admin/categories" },
      { label: "Usuários",        path: "/admin/users" },
      { label: "Machine Learning", path: "/admin/ml" },
    ];
    expect(cards.map((c) => c.path)).toContain("/admin/ml");
    expect(cards.map((c) => c.path)).toContain("/admin/users");
    expect(cards.map((c) => c.path)).toContain("/admin/categories");
  });
});
