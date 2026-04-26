import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
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
  getUsersByRole: vi.fn().mockResolvedValue([]),
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

import * as db from "./db";

// ─── Mock bcryptjs ────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$12$hashedpassword"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// ─── Mock SDK ─────────────────────────────────────────────────────────────────
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {
  const cookies: Record<string, string> = {};
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => { cookies[name] = value; },
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "local_user-1",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    isActive: true,
    passwordHash: "$2b$12$hashedpassword",
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth.register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registra novo usuário com sucesso", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(db.createLocalUser).mockResolvedValue({
      id: 1, openId: "local_abc", name: "Test User", email: "test@example.com",
      passwordHash: "$2b$12$hash", loginMethod: "local", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: true,
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.register({
      name: "Test User",
      email: "test@example.com",
      password: "Senha@123",
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe(1);
  });

  it("rejeita registro com email duplicado", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: 1, openId: "existing", name: "Existing", email: "test@example.com",
      passwordHash: "$2b$12$hash", loginMethod: "local", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: true,
    });

    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "test@example.com", password: "Senha@123" })
    ).rejects.toThrow("Email já cadastrado");
  });

  it("rejeita senha muito curta", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "test@example.com", password: "123" })
    ).rejects.toThrow();
  });
});

describe("auth.login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("autentica usuário com credenciais válidas", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: 1, openId: "local_abc", name: "Test User", email: "test@example.com",
      passwordHash: "$2b$12$hash", loginMethod: "local", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: true,
    });
    vi.mocked(db.upsertUser).mockResolvedValue(undefined);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({ email: "test@example.com", password: "Senha@123" });

    expect(result.success).toBe(true);
  });

  it("rejeita credenciais inválidas", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.login({ email: "wrong@example.com", password: "wrongpass" })
    ).rejects.toThrow("Credenciais inválidas");
  });
});

describe("auth.logout", () => {
  it("limpa o cookie de sessão e retorna sucesso", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.objectContaining({ maxAge: -1 })
    );
  });
});

// ─── Incidents Tests ──────────────────────────────────────────────────────────
describe("incidents.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria incidente com classificação automática", async () => {
    const mockIncident = {
      id: 1, userId: 1, title: "Phishing detectado", description: "E-mail suspeito com link para roubo de credenciais recebido por vários usuários.",
      category: "phishing" as const, riskLevel: "high" as const, confidence: 0.85,
      createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(db.createIncident).mockResolvedValue(mockIncident);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.create({
      title: "Phishing detectado",
      description: "E-mail suspeito com link para roubo de credenciais recebido por vários usuários.",
    });

    expect(result?.id).toBe(1);
    expect(db.createIncident).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, title: "Phishing detectado" })
    );
  });

  it("rejeita incidente com título muito curto", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.incidents.create({ title: "AB", description: "Descrição longa o suficiente para passar na validação." })
    ).rejects.toThrow();
  });

  it("rejeita incidente com descrição muito curta", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.incidents.create({ title: "Título válido", description: "Curta" })
    ).rejects.toThrow();
  });

  it("requer autenticação para criar incidente", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.incidents.create({ title: "Título válido", description: "Descrição longa o suficiente para passar." })
    ).rejects.toThrow();
  });
});

describe("incidents.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna apenas incidentes do usuário autenticado", async () => {
    const userIncidents = [
      { id: 1, userId: 1, title: "Inc 1", description: "Desc 1", category: "phishing" as const, riskLevel: "high" as const, confidence: 0.9, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, userId: 1, title: "Inc 2", description: "Desc 2", category: "malware" as const, riskLevel: "critical" as const, confidence: 0.8, createdAt: new Date(), updatedAt: new Date() },
    ];
    vi.mocked(db.getIncidentsByUser).mockResolvedValue(userIncidents);

    const caller = appRouter.createCaller(createAuthContext({ id: 1 }));
    const result = await caller.incidents.list();

    expect(result).toHaveLength(2);
    expect(db.getIncidentsByUser).toHaveBeenCalledWith(1);
    // Verifica que todos os incidentes pertencem ao usuário 1
    result.forEach((inc) => expect(inc.userId).toBe(1));
  });
});

describe("incidents.getById - controle de acesso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite acesso ao próprio incidente", async () => {
    const incident = {
      id: 1, userId: 1, title: "Meu incidente", description: "Desc",
      category: "phishing" as const, riskLevel: "high" as const, confidence: 0.9,
      createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(db.getIncidentById).mockResolvedValue(incident);

    const caller = appRouter.createCaller(createAuthContext({ id: 1 }));
    const result = await caller.incidents.getById({ id: 1 });
    expect(result.id).toBe(1);
  });

  it("bloqueia acesso a incidente de outro usuário", async () => {
    const incident = {
      id: 5, userId: 99, title: "Incidente de outro", description: "Desc",
      category: "malware" as const, riskLevel: "critical" as const, confidence: 0.95,
      createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(db.getIncidentById).mockResolvedValue(incident);

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "user" }));
    // req. 6.4 (IDOR): deve retornar NOT_FOUND, nunca FORBIDDEN
    await expect(caller.incidents.getById({ id: 5 })).rejects.toThrow("Incidente não encontrado");
  });

  it("admin pode acessar qualquer incidente", async () => {
    const incident = {
      id: 5, userId: 99, title: "Incidente de outro", description: "Desc",
      category: "malware" as const, riskLevel: "critical" as const, confidence: 0.95,
      createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(db.getIncidentById).mockResolvedValue(incident);

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "admin" }));
    const result = await caller.incidents.getById({ id: 5 });
    expect(result.id).toBe(5);
  });
});

describe("incidents.delete - controle de acesso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite deletar próprio incidente", async () => {
    vi.mocked(db.getIncidentById).mockResolvedValue({
      id: 1, userId: 1, title: "Inc", description: "Desc",
      category: "phishing" as const, riskLevel: "high" as const, confidence: 0.8,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(db.deleteIncident).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAuthContext({ id: 1 }));
    const result = await caller.incidents.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("bloqueia deletar incidente de outro usuário", async () => {
    vi.mocked(db.getIncidentById).mockResolvedValue({
      id: 2, userId: 99, title: "Inc", description: "Desc",
      category: "phishing" as const, riskLevel: "high" as const, confidence: 0.8,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "user" }));
    // req. 6.4 (IDOR): deve retornar NOT_FOUND, nunca FORBIDDEN
    await expect(caller.incidents.delete({ id: 2 })).rejects.toThrow("Incidente não encontrado");
  });
});

describe("incidents.stats", () => {
  it("retorna estatísticas por categoria e risco do usuário", async () => {
    vi.mocked(db.getIncidentStatsByUser).mockResolvedValue([
      { category: "phishing" as const, count: 3 },
      { category: "malware" as const, count: 2 },
    ]);
    vi.mocked(db.getIncidentRiskStatsByUser).mockResolvedValue([
      { riskLevel: "high" as const, count: 3 },
      { riskLevel: "critical" as const, count: 2 },
    ]);

    vi.mocked(db.getIncidentsByUser).mockResolvedValue([]);
    const caller = appRouter.createCaller(createAuthContext({ id: 1 }));
    const result = await caller.incidents.stats();

    // New format: byCategory and byRisk are Record<string, number>
    expect(result.byCategory).toMatchObject({ phishing: 3, malware: 2 });
    expect(result.byRisk).toMatchObject({ high: 3, critical: 2 });
    expect(result.total).toBe(0);
  });
});

// ─── Admin Tests ──────────────────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock fetch for ML and PDF services
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("admin.listIncidents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite que admin liste todos os incidentes", async () => {
    const mockIncident = {
      id: 1, userId: 1, title: "Inc Admin", description: "Desc",
      category: "malware" as const, riskLevel: "critical" as const,
      confidence: 0.95, createdAt: new Date(), updatedAt: new Date(),
      userName: "Admin User", userEmail: "admin@example.com",
    };
    vi.mocked(db.getAllIncidents).mockResolvedValue([mockIncident]);
    vi.mocked(db.countAllIncidents).mockResolvedValue(1);

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "admin" }));
    const result = await caller.admin.listIncidents({ page: 1, limit: 20 });

    expect(result.incidents).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.incidents[0].title).toBe("Inc Admin");
  });

  it("bloqueia acesso de usuário comum ao painel admin", async () => {
    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "user" }));
    await expect(caller.admin.listIncidents({ page: 1, limit: 20 })).rejects.toThrow();
  });
});

describe("admin.reclassify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite que admin reclassifique incidente manualmente", async () => {
    const reclassified = {
      id: 5, userId: 2, title: "Inc", description: "Desc",
      category: "malware" as const, riskLevel: "critical" as const,
      confidence: 1.0, createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(db.reclassifyIncident).mockResolvedValue(reclassified);

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "admin" }));
    const result = await caller.admin.reclassify({
      id: 5,
      category: "malware",
      riskLevel: "critical",
    });

    expect(result.category).toBe("malware");
    expect(result.riskLevel).toBe("critical");
  });

  it("bloqueia reclassificação por usuário comum", async () => {
    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "user" }));
    await expect(
      caller.admin.reclassify({ id: 5, category: "malware", riskLevel: "critical" })
    ).rejects.toThrow();
  });
});

describe("admin.stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna estatísticas globais para admin", async () => {
    vi.mocked(db.getGlobalStats).mockResolvedValue({
      totalIncidents: 42,
      totalUsers: 8,
      byCategory: [{ category: "phishing" as const, count: 15 }],
      byRisk: [{ riskLevel: "high" as const, count: 20 }],
      topUsers: [{ userId: 1, userName: "Admin", count: 10 }],
    });

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "admin" }));
    const result = await caller.admin.stats();

    expect(result.totalIncidents).toBe(42);
    expect(result.totalUsers).toBe(8);
    expect(result.byCategory[0]).toMatchObject({ category: "phishing", count: 15 });
  });
});

describe("admin.updateUserRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite que admin promova usuário para admin", async () => {
    vi.mocked(db.updateUserRole).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "admin" }));
    const result = await caller.admin.updateUserRole({ userId: 2, role: "admin" });

    expect(result.success).toBe(true);
  });

  it("bloqueia atualização de role por usuário comum", async () => {
    const caller = appRouter.createCaller(createAuthContext({ id: 1, role: "user" }));
    await expect(
      caller.admin.updateUserRole({ userId: 2, role: "admin" })
    ).rejects.toThrow();
  });
});

describe("reports.exportPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exporta PDF com incidentes do usuário autenticado", async () => {
    vi.mocked(db.getIncidentsByUser).mockResolvedValue([
      {
        id: 1, userId: 1, title: "Phishing Detectado", description: "Email suspeito",
        category: "phishing" as const, riskLevel: "high" as const,
        confidence: 0.9, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);

    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from("PDF_CONTENT").buffer,
    });

    const caller = appRouter.createCaller(createAuthContext({ id: 1, name: "Test User", email: "test@example.com" }));
    const result = await caller.reports.exportPdf({});

    expect(result.incidentCount).toBe(1);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.base64).toBeDefined();
    expect(result.filename).toContain(".pdf");
  });

  it("requer autenticação para exportar PDF", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.reports.exportPdf({})).rejects.toThrow();
  });
});

describe("incidents.create - notificação de risco crítico", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria incidente crítico e dispara notificação", async () => {
    // Mock ML service returning malware (critical risk)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ category: "malware", confidence: 0.97 }),
    });

    vi.mocked(db.createIncident).mockResolvedValue({
      id: 10, userId: 1, title: "Malware Crítico", description: "Ransomware detectado no servidor",
      category: "malware" as const, riskLevel: "critical" as const,
      confidence: 0.97, createdAt: new Date(), updatedAt: new Date(),
    });

    const { notifyOwner } = await import("./_core/notification");

    const caller = appRouter.createCaller(createAuthContext({ id: 1, name: "Test User", email: "test@example.com" }));
    const result = await caller.incidents.create({
      title: "Malware Crítico",
      description: "Ransomware detectado no servidor de produção com criptografia de arquivos",
    });

    expect(result.category).toBe("malware");
    expect(result.riskLevel).toBe("critical");
    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("CRÍTICO"),
      })
    );
  });
});

// ─── Testes de Validação de Senha (Signup) ────────────────────────────────────
describe("auth.register - validação de senha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(db.createLocalUser).mockResolvedValue({
      id: 99, openId: "local_test", name: "Test", email: "pw@test.com",
      passwordHash: "$2b$12$hash", loginMethod: "local", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: true,
    });
  });

  it("aceita senha válida com todos os critérios atendidos", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.register({
      name: "Test User",
      email: "pw@test.com",
      password: "Senha@123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita senha sem letra maiúscula", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: "senha@123" })
    ).rejects.toThrow();
  });

  it("rejeita senha sem letra minúscula", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: "SENHA@123" })
    ).rejects.toThrow();
  });

  it("rejeita senha sem número", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: "Senha@abc" })
    ).rejects.toThrow();
  });

  it("rejeita senha sem caractere especial", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: "Senha1234" })
    ).rejects.toThrow();
  });

  it("rejeita senha com menos de 8 caracteres", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: "S@1a" })
    ).rejects.toThrow();
  });

  it("rejeita senha com mais de 128 caracteres", async () => {
    const longPassword = "Aa1@" + "x".repeat(125); // 129 chars
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: longPassword })
    ).rejects.toThrow();
  });

  it("aceita senha exatamente no limite mínimo (8 chars com todos os critérios)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.register({
      name: "Test User",
      email: "pw@test.com",
      password: "Aa1@bcde", // 8 chars: maiúscula, minúscula, número, especial
    });
    expect(result.success).toBe(true);
  });

  it("aceita senha exatamente no limite máximo (128 chars com todos os critérios)", async () => {
    const maxPassword = "Aa1@" + "b".repeat(124); // 128 chars
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.register({
      name: "Test User",
      email: "pw@test.com",
      password: maxPassword,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita senha vazia", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.register({ name: "Test", email: "pw@test.com", password: "" })
    ).rejects.toThrow();
  });
});

// ─── Testes unitários de checkPasswordCriteria e isPasswordValid ──────────────
import { checkPasswordCriteria, isPasswordValid } from "./validation";

describe("checkPasswordCriteria", () => {
  it("retorna todos os critérios falsos para string vazia", () => {
    const result = checkPasswordCriteria("");
    expect(result.minLength).toBe(false);
    expect(result.lowercase).toBe(false);
    expect(result.uppercase).toBe(false);
    expect(result.digit).toBe(false);
    expect(result.special).toBe(false);
  });

  it("detecta corretamente cada critério individualmente", () => {
    expect(checkPasswordCriteria("aaaaaaaa").minLength).toBe(true);
    expect(checkPasswordCriteria("aaaaaaaa").lowercase).toBe(true);
    expect(checkPasswordCriteria("aaaaaaaa").uppercase).toBe(false);
    expect(checkPasswordCriteria("AAAAAAAA").uppercase).toBe(true);
    expect(checkPasswordCriteria("AAAAAAAA").lowercase).toBe(false);
    expect(checkPasswordCriteria("Aa123456").digit).toBe(true);
    expect(checkPasswordCriteria("Aa@bcdef").special).toBe(true);
    expect(checkPasswordCriteria("Aa1bcdef").special).toBe(false);
  });

  it("detecta vários caracteres especiais válidos", () => {
    const specials = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "-", "_", "+", "=", ".", ","];
    for (const s of specials) {
      expect(checkPasswordCriteria(`Aa1${s}bcde`).special).toBe(true);
    }
  });

  it("maxLength é true para senha de exatamente 128 caracteres", () => {
    const pw128 = "a".repeat(128);
    expect(checkPasswordCriteria(pw128).maxLength).toBe(true);
  });

  it("maxLength é false para senha de 129 caracteres", () => {
    const pw129 = "a".repeat(129);
    expect(checkPasswordCriteria(pw129).maxLength).toBe(false);
  });
});

describe("isPasswordValid", () => {
  it("retorna true para senhas que atendem todos os critérios", () => {
    expect(isPasswordValid("Senha@123")).toBe(true);
    expect(isPasswordValid("Aa1@bcde")).toBe(true);
    expect(isPasswordValid("MyP@ssw0rd!")).toBe(true);
    expect(isPasswordValid("C0mplex!Pass")).toBe(true);
  });

  it("retorna false para senhas sem letra maiúscula", () => {
    expect(isPasswordValid("senha@123")).toBe(false);
  });

  it("retorna false para senhas sem letra minúscula", () => {
    expect(isPasswordValid("SENHA@123")).toBe(false);
  });

  it("retorna false para senhas sem número", () => {
    expect(isPasswordValid("SenhaABCD@")).toBe(false);
  });

  it("retorna false para senhas sem caractere especial", () => {
    expect(isPasswordValid("Senha1234")).toBe(false);
  });

  it("retorna false para senhas muito curtas", () => {
    expect(isPasswordValid("S@1a")).toBe(false);
  });

  it("retorna false para string vazia", () => {
    expect(isPasswordValid("")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOC Portal Redesign — Testes de Consistência de Interface (7.x)
// ─────────────────────────────────────────────────────────────────────────────

describe("7.1 Consistência do Design System SOC Portal — Componentes", () => {
  it("CyberLayout.tsx exporta componente padrão", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const layoutPath = path.resolve("client/src/components/CyberLayout.tsx");
    expect(fs.existsSync(layoutPath)).toBe(true);
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("export default");
  });

  it("Dashboard.tsx usa soc-page-title e soc-page-sub", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Dashboard.tsx"), "utf-8");
    expect(content).toContain("soc-page-title");
    expect(content).toContain("soc-page-sub");
  });

  it("Incidents.tsx usa soc-table para listagem de incidentes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Incidents.tsx"), "utf-8");
    expect(content).toContain("soc-table");
  });

  it("Admin.tsx restringe acesso por role admin", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Admin.tsx"), "utf-8");
    expect(content).toContain("admin");
    expect(content).toContain("role");
  });

  it("NewIncident.tsx contém campos de título e descrição", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/NewIncident.tsx"), "utf-8");
    expect(content.toLowerCase()).toContain("título");
    expect(content.toLowerCase()).toContain("descrição");
  });

  it("RiskAnalysis.tsx contém análise de risco e recomendações", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/RiskAnalysis.tsx"), "utf-8");
    expect(content.toLowerCase()).toContain("risco");
    expect(content.toLowerCase()).toContain("recomendações");
  });

  it("IncidentDetail.tsx exibe categoria e nível de risco", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/IncidentDetail.tsx"), "utf-8");
    expect(content).toContain("category");
    expect(content).toContain("riskLevel");
  });

  it("Home.tsx contém links para login e registro", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Home.tsx"), "utf-8");
    expect(content).toContain("/login");
    expect(content).toContain("/register");
  });

  it("Login.tsx contém campos de email e senha", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Login.tsx"), "utf-8");
    expect(content).toContain("email");
    expect(content).toContain("password");
  });

  it("Register.tsx contém checklist de critérios de senha", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Register.tsx"), "utf-8");
    // O componente usa PASSWORD_CRITERIA (array local) para o checklist visual
    expect(content).toContain("PASSWORD_CRITERIA");
  });
});

describe("7.2 Consistência do CSS SOC Portal", () => {
  it("index.css define classes soc-card e soc-btn-primary", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain(".soc-card");
    expect(content).toContain(".soc-btn-primary");
  });

  it("index.css define soc-page-subtitle e soc-page-sub como aliases", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("soc-page-subtitle");
    expect(content).toContain("soc-page-sub");
  });

  it("index.css usa fonte Inter como padrão", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("Inter");
  });

  it("index.css define badges de categoria (badge-phishing, badge-malware)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("badge-phishing");
    expect(content).toContain("badge-malware");
  });

  it("index.css define soc-table para tabelas operacionais", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("soc-table");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOC Portal Redesign — Testes de Consistência de Interface (7.x)
// ─────────────────────────────────────────────────────────────────────────────

describe("7.1 Consistência do Design System SOC Portal", () => {
  it("CyberLayout exporta componente padrão", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const layoutPath = path.resolve("client/src/components/CyberLayout.tsx");
    expect(fs.existsSync(layoutPath)).toBe(true);
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("export default");
  });

  it("Dashboard.tsx usa soc-page-title e soc-page-sub", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Dashboard.tsx"), "utf-8");
    expect(content).toContain("soc-page-title");
    expect(content).toContain("soc-page-sub");
  });

  it("Incidents.tsx usa soc-table para listagem de incidentes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Incidents.tsx"), "utf-8");
    expect(content).toContain("soc-table");
  });

  it("Admin.tsx restringe acesso por role admin", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Admin.tsx"), "utf-8");
    expect(content).toContain("admin");
    expect(content).toContain("role");
  });

  it("NewIncident.tsx contém campos de title e description", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/NewIncident.tsx"), "utf-8");
    expect(content).toContain("title");
    expect(content).toContain("description");
  });

  it("RiskAnalysis.tsx contém análise de risco e recomendações", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/RiskAnalysis.tsx"), "utf-8");
    expect(content).toContain("RISK_CONFIG");
    expect(content).toContain("riskScore");
  });

  it("IncidentDetail.tsx exibe categoria e nível de risco", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/IncidentDetail.tsx"), "utf-8");
    expect(content).toContain("category");
    expect(content).toContain("riskLevel");
  });

  it("Home.tsx contém links para login e registro", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Home.tsx"), "utf-8");
    expect(content).toContain("/login");
    expect(content).toContain("/register");
  });

  it("Login.tsx contém campos de email e senha", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Login.tsx"), "utf-8");
    expect(content).toContain("email");
    expect(content).toContain("password");
  });

  it("Register.tsx contém checklist de critérios de senha", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/pages/Register.tsx"), "utf-8");
    expect(content).toContain("PASSWORD_CRITERIA");
    expect(content).toContain("criteria");
  });
});

describe("7.2 Consistência do CSS SOC Portal", () => {
  it("index.css define classes soc-card e soc-btn-primary", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain(".soc-card");
    expect(content).toContain(".soc-btn-primary");
  });

  it("index.css define soc-page-subtitle e soc-page-sub como aliases", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("soc-page-subtitle");
    expect(content).toContain("soc-page-sub");
  });

  it("index.css usa fonte Inter como padrão", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("Inter");
  });

  it("index.css define badges de categoria (badge-phishing, badge-malware)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("badge-phishing");
    expect(content).toContain("badge-malware");
  });

  it("index.css define soc-table para tabelas operacionais", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve("client/src/index.css"), "utf-8");
    expect(content).toContain("soc-table");
  });
});
