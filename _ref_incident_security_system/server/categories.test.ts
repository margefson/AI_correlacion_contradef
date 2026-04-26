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
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
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

// ─── Mock notification ────────────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mockAdminUser = {
  id: 1,
  openId: "admin-open-id",
  name: "Admin User",
  email: "admin@test.com",
  passwordHash: null,
  loginMethod: "local",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  isActive: true,
};

const mockRegularUser = {
  ...mockAdminUser,
  id: 2,
  openId: "user-open-id",
  email: "user@test.com",
  role: "user" as const,
};

function makeAdminCtx(): TrpcContext {
  return {
    user: mockAdminUser,
    req: {} as never,
    res: {} as never,
  };
}

function makeUserCtx(): TrpcContext {
  return {
    user: mockRegularUser,
    req: {} as never,
    res: {} as never,
  };
}

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    req: {} as never,
    res: {} as never,
  };
}

const mockCategory = {
  id: 1,
  name: "Phishing",
  description: "Ataques de phishing via e-mail",
  color: "#f87171",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Categories CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── LIST ─────────────────────────────────────────────────────────────────
  describe("categories.list", () => {
    it("deve retornar lista de categorias para usuário não autenticado (público)", async () => {
      vi.mocked(db.listCategories).mockResolvedValue([mockCategory]);

      const caller = appRouter.createCaller(makeAnonCtx());
      const result = await caller.categories.list();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Phishing");
      expect(db.listCategories).toHaveBeenCalledOnce();
    });

    it("deve retornar lista vazia quando não há categorias", async () => {
      vi.mocked(db.listCategories).mockResolvedValue([]);

      const caller = appRouter.createCaller(makeAnonCtx());
      const result = await caller.categories.list();

      expect(result).toHaveLength(0);
    });

    it("deve retornar lista de categorias para usuário autenticado", async () => {
      vi.mocked(db.listCategories).mockResolvedValue([mockCategory, { ...mockCategory, id: 2, name: "Malware" }]);

      const caller = appRouter.createCaller(makeUserCtx());
      const result = await caller.categories.list();

      expect(result).toHaveLength(2);
    });
  });

  // ─── CREATE ───────────────────────────────────────────────────────────────
  describe("categories.create", () => {
    it("deve criar categoria quando admin", async () => {
      vi.mocked(db.createCategory).mockResolvedValue(mockCategory);

      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.create({
        name: "Phishing",
        description: "Ataques de phishing",
        color: "#f87171",
      });

      expect(result?.name).toBe("Phishing");
      expect(db.createCategory).toHaveBeenCalledWith("Phishing", "Ataques de phishing", "#f87171");
    });

    it("deve criar categoria sem descrição e cor opcionais", async () => {
      vi.mocked(db.createCategory).mockResolvedValue({ ...mockCategory, name: "Ransomware", description: null, color: "#22d3ee" });

      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.create({ name: "Ransomware" });

      expect(result?.name).toBe("Ransomware");
      expect(db.createCategory).toHaveBeenCalledWith("Ransomware", undefined, undefined);
    });

    it("deve rejeitar criação por usuário não-admin com FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeUserCtx());

      await expect(
        caller.categories.create({ name: "Test" })
      ).rejects.toThrow("FORBIDDEN");

      expect(db.createCategory).not.toHaveBeenCalled();
    });

    it("deve rejeitar criação por usuário não autenticado com UNAUTHORIZED", async () => {
      const caller = appRouter.createCaller(makeAnonCtx());

      await expect(
        caller.categories.create({ name: "Test" })
      ).rejects.toThrow();
    });

    it("deve rejeitar nome com menos de 2 caracteres", async () => {
      const caller = appRouter.createCaller(makeAdminCtx());

      await expect(
        caller.categories.create({ name: "A" })
      ).rejects.toThrow();

      expect(db.createCategory).not.toHaveBeenCalled();
    });

    it("deve rejeitar nome com mais de 100 caracteres", async () => {
      const caller = appRouter.createCaller(makeAdminCtx());
      const longName = "A".repeat(101);

      await expect(
        caller.categories.create({ name: longName })
      ).rejects.toThrow();

      expect(db.createCategory).not.toHaveBeenCalled();
    });
  });

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  describe("categories.update", () => {
    it("deve atualizar categoria quando admin", async () => {
      const updated = { ...mockCategory, name: "Phishing Avançado" };
      vi.mocked(db.updateCategory).mockResolvedValue(updated);

      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.update({
        id: 1,
        name: "Phishing Avançado",
      });

      expect(result?.name).toBe("Phishing Avançado");
      expect(db.updateCategory).toHaveBeenCalledWith(1, {
        name: "Phishing Avançado",
        description: undefined,
        color: undefined,
        isActive: undefined,
      });
    });

    it("deve atualizar apenas os campos fornecidos", async () => {
      const updated = { ...mockCategory, color: "#60a5fa" };
      vi.mocked(db.updateCategory).mockResolvedValue(updated);

      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.update({ id: 1, color: "#60a5fa" });

      expect(result?.color).toBe("#60a5fa");
    });

    it("deve rejeitar atualização por usuário não-admin com FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeUserCtx());

      await expect(
        caller.categories.update({ id: 1, name: "Hacked" })
      ).rejects.toThrow("FORBIDDEN");

      expect(db.updateCategory).not.toHaveBeenCalled();
    });

    it("deve rejeitar atualização por usuário não autenticado com UNAUTHORIZED", async () => {
      const caller = appRouter.createCaller(makeAnonCtx());

      await expect(
        caller.categories.update({ id: 1, name: "Hacked" })
      ).rejects.toThrow();
    });

    it("deve permitir desativar categoria (isActive: false)", async () => {
      const deactivated = { ...mockCategory, isActive: false };
      vi.mocked(db.updateCategory).mockResolvedValue(deactivated);

      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.update({ id: 1, isActive: false });

      expect(result?.isActive).toBe(false);
    });
  });

  // ─── DELETE ───────────────────────────────────────────────────────────────
  describe("categories.delete", () => {
    it("deve excluir (soft delete) categoria quando admin", async () => {
      vi.mocked(db.deleteCategory).mockResolvedValue({ success: true });

      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.delete({ id: 1 });

      expect(result.success).toBe(true);
      expect(db.deleteCategory).toHaveBeenCalledWith(1);
    });

    it("deve rejeitar exclusão por usuário não-admin com FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeUserCtx());

      await expect(
        caller.categories.delete({ id: 1 })
      ).rejects.toThrow("FORBIDDEN");

      expect(db.deleteCategory).not.toHaveBeenCalled();
    });

    it("deve rejeitar exclusão por usuário não autenticado com UNAUTHORIZED", async () => {
      const caller = appRouter.createCaller(makeAnonCtx());

      await expect(
        caller.categories.delete({ id: 1 })
      ).rejects.toThrow();
    });
  });

  // ─── RBAC Summary ─────────────────────────────────────────────────────────
  describe("controle de acesso (RBAC)", () => {
    it("list: público (sem autenticação)", async () => {
      vi.mocked(db.listCategories).mockResolvedValue([]);
      const caller = appRouter.createCaller(makeAnonCtx());
      await expect(caller.categories.list()).resolves.toBeDefined();
    });

    it("create: apenas admin", async () => {
      const userCaller = appRouter.createCaller(makeUserCtx());
      await expect(userCaller.categories.create({ name: "Test" }))
        .rejects.toThrow("FORBIDDEN");
    });

    it("update: apenas admin", async () => {
      const userCaller = appRouter.createCaller(makeUserCtx());
      await expect(userCaller.categories.update({ id: 1, name: "Test" }))
        .rejects.toThrow("FORBIDDEN");
    });

    it("delete: apenas admin", async () => {
      const userCaller = appRouter.createCaller(makeUserCtx());
      await expect(userCaller.categories.delete({ id: 1 }))
        .rejects.toThrow("FORBIDDEN");
    });
  });
});

// ─── Bug Regression Tests ────────────────────────────────────────────────────
describe("regressão de bugs corrigidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // BUG FIX: INSERT categories falhava quando description era undefined
  // O frontend agora passa string vazia ("") em vez de undefined
  describe("BUG-001: INSERT category com description vazia", () => {
    it("cria categoria com description como string vazia (não undefined)", async () => {
      const mockCat = { id: 10, name: "Engenharia Social", description: "", color: "#22d3ee", isActive: true, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(db.createCategory).mockResolvedValue(mockCat);
      const caller = appRouter.createCaller(makeAdminCtx());
      // Simula o que o frontend agora envia: description como "" (não undefined)
      const result = await caller.categories.create({ name: "Engenharia Social", description: "", color: "#22d3ee" });
      expect(result).toBeDefined();
      expect(result.name).toBe("Engenharia Social");
      // Verifica que createCategory foi chamado com string vazia
      expect(vi.mocked(db.createCategory)).toHaveBeenCalledWith("Engenharia Social", "", "#22d3ee");
    });

    it("cria categoria sem description (campo omitido) - usa default do schema", async () => {
      const mockCat = { id: 11, name: "Ransomware", description: null, color: "#f87171", isActive: true, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(db.createCategory).mockResolvedValue(mockCat);
      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.categories.create({ name: "Ransomware", color: "#f87171" });
      expect(result).toBeDefined();
      expect(result.name).toBe("Ransomware");
    });

    it("não permite criar categoria com nome duplicado (erro do DB)", async () => {
      vi.mocked(db.createCategory).mockRejectedValue(new Error("Duplicate entry 'Phishing'"));
      const caller = appRouter.createCaller(makeAdminCtx());
      await expect(caller.categories.create({ name: "Phishing" }))
        .rejects.toThrow();
    });
  });

  // BUG FIX: Rota /admin/users retornava 404 (página não existia)
  // A página AdminUsers.tsx foi criada e registrada no App.tsx
  describe("BUG-002: admin.listUsers e admin.updateUserRole", () => {
    it("admin.listUsers: retorna lista de usuários para admin", async () => {
      const mockUsers = [
        { id: 1, name: "Admin User", email: "admin@test.com", role: "admin" as const, loginMethod: "email", isActive: true, createdAt: new Date(), lastSignedIn: new Date() },
        { id: 2, name: "Regular User", email: "user@test.com", role: "user" as const, loginMethod: "email", isActive: true, createdAt: new Date(), lastSignedIn: new Date() },
      ];
      vi.mocked(db.getAllUsers).mockResolvedValue(mockUsers);
      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.admin.listUsers();
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("admin");
      expect(result[1].role).toBe("user");
    });

    it("admin.listUsers: bloqueia acesso de usuário comum (FORBIDDEN)", async () => {
      const caller = appRouter.createCaller(makeUserCtx());
      await expect(caller.admin.listUsers()).rejects.toThrow();
    });

    it("admin.listUsers: bloqueia acesso anônimo (UNAUTHORIZED)", async () => {
      const caller = appRouter.createCaller(makeAnonCtx());
      await expect(caller.admin.listUsers()).rejects.toThrow();
    });

    it("admin.updateUserRole: promove usuário para admin", async () => {
      vi.mocked(db.updateUserRole).mockResolvedValue(undefined);
      const caller = appRouter.createCaller(makeAdminCtx());
      const result = await caller.admin.updateUserRole({ userId: 2, role: "admin" });
      expect(result).toEqual({ success: true });
    });

    it("admin.updateUserRole: não permite admin alterar seu próprio perfil (BAD_REQUEST)", async () => {
      const caller = appRouter.createCaller(makeAdminCtx());
      // makeAdminCtx() usa id: 1
      await expect(caller.admin.updateUserRole({ userId: 1, role: "user" }))
        .rejects.toThrow();
    });

    it("admin.updateUserRole: bloqueia usuário comum (FORBIDDEN)", async () => {
      const caller = appRouter.createCaller(makeUserCtx());
      await expect(caller.admin.updateUserRole({ userId: 3, role: "admin" }))
        .rejects.toThrow();
    });
  });
});
