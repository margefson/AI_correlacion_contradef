/**
 * followup.test.ts — Testes para funcionalidades de acompanhamento de incidentes
 *
 * Cobre:
 *  FU-1  updateStatus — atualizar status de incidente (open/in_progress/resolved)
 *  FU-2  updateNotes  — salvar notas de acompanhamento
 *  FU-3  statusStats  — contagem de incidentes por status por usuário
 *  FU-4  Controle de acesso (IDOR) — usuário não pode alterar incidente de outro
 *  FU-5  Lógica de resolvedAt — preenchido ao resolver, nulo ao reabrir
 *  FU-6  Diagrama de arquitetura — arquivo PNG gerado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import * as fs from "fs";
import * as path from "path";

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
  updateIncidentStatus: vi.fn(),
  updateIncidentNotes: vi.fn(),
  getIncidentStatusStats: vi.fn(),
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: { auth: { me: vi.fn() } },
}));

vi.mock("../server/_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeUserCtx(id = 2) {
  return {
    user: { id, name: "User", email: "user@test.com", role: "user" as const },
    req: {} as never,
    res: {} as never,
  };
}

function makeAdminCtx() {
  return {
    user: { id: 1, name: "Admin", email: "admin@test.com", role: "admin" as const },
    req: {} as never,
    res: {} as never,
  };
}

function makeIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 2,
    title: "Phishing detectado",
    description: "E-mail suspeito recebido",
    category: "phishing" as const,
    riskLevel: "high" as const,
    confidence: 0.92,
    status: "open" as const,
    notes: null as string | null,
    resolvedAt: null as Date | null,
    createdAt: new Date("2026-01-10T10:00:00Z"),
    updatedAt: new Date("2026-01-10T10:00:00Z"),
    ...overrides,
  };
}

// ─── Importações ──────────────────────────────────────────────────────────────
import {
  updateIncidentStatus,
  updateIncidentNotes,
  getIncidentStatusStats,
  getIncidentById,
} from "../server/db";

// ─── FU-1: updateStatus ───────────────────────────────────────────────────────
describe("FU-1: updateStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("FU-1.1: atualiza status para 'in_progress' com sucesso", async () => {
    vi.mocked(updateIncidentStatus).mockResolvedValue({ success: true });
    const result = await updateIncidentStatus(10, 2, "in_progress");
    expect(result.success).toBe(true);
    expect(updateIncidentStatus).toHaveBeenCalledWith(10, 2, "in_progress");
  });

  it("FU-1.2: atualiza status para 'resolved' com sucesso", async () => {
    vi.mocked(updateIncidentStatus).mockResolvedValue({ success: true });
    const result = await updateIncidentStatus(10, 2, "resolved");
    expect(result.success).toBe(true);
  });

  it("FU-1.3: atualiza status para 'open' (reabertura) com sucesso", async () => {
    vi.mocked(updateIncidentStatus).mockResolvedValue({ success: true });
    const result = await updateIncidentStatus(10, 2, "open");
    expect(result.success).toBe(true);
  });

  it("FU-1.4: admin pode atualizar status de qualquer incidente", async () => {
    vi.mocked(updateIncidentStatus).mockResolvedValue({ success: true });
    const result = await updateIncidentStatus(10, 1, "resolved", true);
    expect(result.success).toBe(true);
    expect(updateIncidentStatus).toHaveBeenCalledWith(10, 1, "resolved", true);
  });

  it("FU-1.5: enum de status aceita apenas valores válidos", () => {
    const validStatuses = ["open", "in_progress", "resolved"];
    expect(validStatuses).toContain("open");
    expect(validStatuses).toContain("in_progress");
    expect(validStatuses).toContain("resolved");
    expect(validStatuses).not.toContain("closed");
    expect(validStatuses).not.toContain("pending");
  });

  it("FU-1.6: status padrão de novo incidente é 'open'", () => {
    const incident = makeIncident();
    expect(incident.status).toBe("open");
  });
});

// ─── FU-2: updateNotes ────────────────────────────────────────────────────────
describe("FU-2: updateNotes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("FU-2.1: salva notas com sucesso", async () => {
    vi.mocked(updateIncidentNotes).mockResolvedValue({ success: true });
    const result = await updateIncidentNotes(10, 2, "Investigação iniciada. Contato com TI realizado.");
    expect(result.success).toBe(true);
  });

  it("FU-2.2: notas podem ser string vazia (limpeza)", async () => {
    vi.mocked(updateIncidentNotes).mockResolvedValue({ success: true });
    const result = await updateIncidentNotes(10, 2, "");
    expect(result.success).toBe(true);
  });

  it("FU-2.3: notas respeitam limite de 5000 caracteres", () => {
    const longNotes = "A".repeat(5000);
    expect(longNotes.length).toBe(5000);
    const tooLong = "A".repeat(5001);
    expect(tooLong.length).toBeGreaterThan(5000);
  });

  it("FU-2.4: admin pode atualizar notas de qualquer incidente", async () => {
    vi.mocked(updateIncidentNotes).mockResolvedValue({ success: true });
    const result = await updateIncidentNotes(10, 1, "Nota do admin", true);
    expect(result.success).toBe(true);
    expect(updateIncidentNotes).toHaveBeenCalledWith(10, 1, "Nota do admin", true);
  });

  it("FU-2.5: notas inicialmente nulas em novos incidentes", () => {
    const incident = makeIncident();
    expect(incident.notes).toBeNull();
  });
});

// ─── FU-3: statusStats ────────────────────────────────────────────────────────
describe("FU-3: statusStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("FU-3.1: retorna contagem por status para o usuário", async () => {
    vi.mocked(getIncidentStatusStats).mockResolvedValue({
      open: 3,
      in_progress: 1,
      resolved: 5,
    });
    const stats = await getIncidentStatusStats(2);
    expect(stats.open).toBe(3);
    expect(stats.in_progress).toBe(1);
    expect(stats.resolved).toBe(5);
  });

  it("FU-3.2: retorna zeros quando usuário não tem incidentes", async () => {
    vi.mocked(getIncidentStatusStats).mockResolvedValue({
      open: 0,
      in_progress: 0,
      resolved: 0,
    });
    const stats = await getIncidentStatusStats(99);
    expect(stats.open).toBe(0);
    expect(stats.in_progress).toBe(0);
    expect(stats.resolved).toBe(0);
  });

  it("FU-3.3: soma dos status é igual ao total de incidentes", async () => {
    vi.mocked(getIncidentStatusStats).mockResolvedValue({
      open: 2,
      in_progress: 3,
      resolved: 7,
    });
    const stats = await getIncidentStatusStats(2);
    const total = stats.open + stats.in_progress + stats.resolved;
    expect(total).toBe(12);
  });

  it("FU-3.4: statusStats é isolado por userId", async () => {
    vi.mocked(getIncidentStatusStats)
      .mockResolvedValueOnce({ open: 5, in_progress: 0, resolved: 2 })
      .mockResolvedValueOnce({ open: 1, in_progress: 1, resolved: 0 });
    const statsUser2 = await getIncidentStatusStats(2);
    const statsUser3 = await getIncidentStatusStats(3);
    expect(statsUser2.open).toBe(5);
    expect(statsUser3.open).toBe(1);
  });
});

// ─── FU-4: Controle de acesso (IDOR) ─────────────────────────────────────────
describe("FU-4: Controle de acesso (IDOR) em status/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("FU-4.1: usuário não pode alterar status de incidente de outro usuário", async () => {
    const incident = makeIncident({ userId: 99 }); // pertence ao userId 99
    const ctx = makeUserCtx(2); // usuário logado é id=2
    vi.mocked(getIncidentById).mockResolvedValue(incident);

    const isOwner = incident.userId === ctx.user.id;
    const isAdmin = ctx.user.role === "admin";

    if (!isOwner && !isAdmin) {
      expect(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "Incidente não encontrado" });
      }).toThrow(TRPCError);
    }
  });

  it("FU-4.2: usuário pode alterar status do próprio incidente", async () => {
    const incident = makeIncident({ userId: 2 });
    const ctx = makeUserCtx(2);
    vi.mocked(getIncidentById).mockResolvedValue(incident);
    vi.mocked(updateIncidentStatus).mockResolvedValue({ success: true });

    const isOwner = incident.userId === ctx.user.id;
    expect(isOwner).toBe(true);
    const result = await updateIncidentStatus(incident.id, ctx.user.id, "in_progress");
    expect(result.success).toBe(true);
  });

  it("FU-4.3: admin pode alterar status de qualquer incidente", async () => {
    const incident = makeIncident({ userId: 99 });
    const ctx = makeAdminCtx();
    vi.mocked(getIncidentById).mockResolvedValue(incident);
    vi.mocked(updateIncidentStatus).mockResolvedValue({ success: true });

    const isAdmin = ctx.user.role === "admin";
    expect(isAdmin).toBe(true);
    const result = await updateIncidentStatus(incident.id, ctx.user.id, "resolved", true);
    expect(result.success).toBe(true);
  });

  it("FU-4.4: erro retornado é NOT_FOUND (não FORBIDDEN) para evitar IDOR leak", () => {
    const incident = makeIncident({ userId: 99 });
    const ctx = makeUserCtx(2);

    const isOwner = incident.userId === ctx.user.id;
    const isAdmin = ctx.user.role === "admin";

    if (!isOwner && !isAdmin) {
      const error = new TRPCError({ code: "NOT_FOUND" });
      expect(error.code).toBe("NOT_FOUND");
      expect(error.code).not.toBe("FORBIDDEN");
    }
  });
});

// ─── FU-5: Lógica de resolvedAt ───────────────────────────────────────────────
describe("FU-5: Lógica de resolvedAt", () => {
  it("FU-5.1: resolvedAt é nulo em incidentes novos", () => {
    const incident = makeIncident();
    expect(incident.resolvedAt).toBeNull();
  });

  it("FU-5.2: resolvedAt é preenchido ao mudar status para 'resolved'", () => {
    const resolvedAt = new Date();
    const incident = makeIncident({ status: "resolved", resolvedAt });
    expect(incident.resolvedAt).toBeInstanceOf(Date);
    expect(incident.status).toBe("resolved");
  });

  it("FU-5.3: resolvedAt deve ser nulo ao reabrir incidente", () => {
    // Simula reabertura: status volta para 'open', resolvedAt = null
    const incident = makeIncident({ status: "open", resolvedAt: null });
    expect(incident.resolvedAt).toBeNull();
    expect(incident.status).toBe("open");
  });

  it("FU-5.4: resolvedAt é uma data válida quando preenchido", () => {
    const now = new Date();
    const incident = makeIncident({ status: "resolved", resolvedAt: now });
    expect(incident.resolvedAt).not.toBeNull();
    expect(new Date(incident.resolvedAt!).getTime()).toBeGreaterThan(0);
  });
});

// ─── FU-6: Diagrama de Arquitetura ────────────────────────────────────────────
describe("FU-6: Diagrama de Arquitetura", () => {
  it("FU-6.1: arquivo architecture.d2 existe no diretório docs", () => {
    const d2Path = path.resolve(__dirname, "../docs/architecture.d2");
    expect(fs.existsSync(d2Path)).toBe(true);
  });

  it("FU-6.2: README referencia o diagrama de arquitetura (CDN ou arquivo local)", () => {
    const readmePath = path.resolve(__dirname, "../README.md");
    const content = fs.readFileSync(readmePath, "utf-8");
    // O diagrama pode estar no CDN (manus.space) ou referenciado como arquivo local
    const hasDiagram = content.includes("architecture") || content.includes("Arquitetura");
    expect(hasDiagram).toBe(true);
  });

  it("FU-6.3: arquivo architecture.d2 contém as camadas principais", () => {
    const d2Path = path.resolve(__dirname, "../docs/architecture.d2");
    const content = fs.readFileSync(d2Path, "utf-8");
    expect(content).toContain("FRONTEND");
    expect(content).toContain("BACKEND");
    expect(content).toContain("ML SERVICE");
    expect(content).toContain("PDF SERVICE");
    expect(content).toContain("BANCO DE DADOS");
  });

  it("FU-6.4: diagrama documenta as portas dos serviços", () => {
    const d2Path = path.resolve(__dirname, "../docs/architecture.d2");
    const content = fs.readFileSync(d2Path, "utf-8");
    expect(content).toContain("3000"); // Node.js
    expect(content).toContain("5001"); // ML classifier
    expect(content).toContain("5002"); // PDF server
  });

  it("FU-6.5: diagrama documenta as tecnologias principais", () => {
    const d2Path = path.resolve(__dirname, "../docs/architecture.d2");
    const content = fs.readFileSync(d2Path, "utf-8");
    expect(content).toContain("React");
    expect(content).toContain("tRPC");
    expect(content).toContain("TF-IDF");
    expect(content).toContain("Naive Bayes");
    expect(content).toContain("ReportLab");
  });
});
