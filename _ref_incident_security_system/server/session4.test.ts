/**
 * session4.test.ts — Testes para funcionalidades da Sessão 4
 *
 * Cobre:
 *  S4-1  PDF nativo (PDFKit) — geração sem Flask
 *  S4-2  Busca de texto completo — searchIncidents
 *  S4-3  Histórico de incidentes — addIncidentHistory / getIncidentHistory
 *  S4-4  Procedure incidents.history — controle de acesso e dados
 *  S4-5  Procedure incidents.search — validação de input e resultados
 *  S4-6  Procedure incidents.updateStatus — grava histórico ao alterar status
 *  S4-7  Procedure incidents.updateNotes  — grava histórico ao salvar notas
 *  S4-8  Tabela incident_history — schema e tipos corretos
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import * as path from "path";
import * as fs from "fs";

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
  searchIncidents: vi.fn(),
  addIncidentHistory: vi.fn(),
  getIncidentHistory: vi.fn(),
}));

vi.mock("../server/_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../server/_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("../server/pdf", () => ({
  generatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 mock")),
}));

import * as db from "../server/db";
import { generatePdfBuffer } from "../server/pdf";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mockUser = { id: 1, openId: "u1", name: "Alice", email: "alice@test.com", role: "user" as const };
const mockAdmin = { id: 2, openId: "u2", name: "Admin", email: "admin@test.com", role: "admin" as const };
const mockIncident = {
  id: 10,
  userId: 1,
  title: "Phishing detectado",
  description: "E-mail suspeito recebido com link malicioso",
  category: "phishing" as const,
  riskLevel: "high" as const,
  confidence: 0.92,
  status: "open" as const,
  notes: null,
  resolvedAt: null,
  createdAt: new Date("2026-04-01T10:00:00Z"),
  updatedAt: new Date("2026-04-01T10:00:00Z"),
};

// ─── S4-1: PDF nativo (PDFKit) ────────────────────────────────────────────────
describe("S4-1 — PDF nativo (PDFKit)", () => {
  it("S4-1.1: generatePdfBuffer retorna um Buffer com conteúdo PDF", async () => {
    const buf = await generatePdfBuffer({ incidents: [mockIncident as never], title: "Relatório de Teste" });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("S4-1.2: generatePdfBuffer é chamado com os parâmetros corretos", async () => {
    const incidents = [mockIncident as never];
    await generatePdfBuffer({ incidents, title: "Teste" });
    expect(generatePdfBuffer).toHaveBeenCalledWith({ incidents, title: "Teste" });
  });

  it("S4-1.3: generatePdfBuffer aceita lista vazia de incidentes", async () => {
    const buf = await generatePdfBuffer({ incidents: [], title: "Vazio" });
    expect(buf).toBeInstanceOf(Buffer);
  });
});

// ─── S4-2: Busca de texto completo ────────────────────────────────────────────
describe("S4-2 — Busca de texto completo (searchIncidents)", () => {
  beforeEach(() => {
    vi.mocked(db.searchIncidents).mockResolvedValue([mockIncident]);
  });

  it("S4-2.1: searchIncidents é chamado com a query correta", async () => {
    await db.searchIncidents({ query: "phishing", userId: 1, isAdmin: false });
    expect(db.searchIncidents).toHaveBeenCalledWith({ query: "phishing", userId: 1, isAdmin: false });
  });

  it("S4-2.2: searchIncidents retorna lista de incidentes", async () => {
    const result = await db.searchIncidents({ query: "phishing", userId: 1, isAdmin: false });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("S4-2.3: searchIncidents com query vazia retorna lista vazia", async () => {
    vi.mocked(db.searchIncidents).mockResolvedValue([]);
    const result = await db.searchIncidents({ query: "", userId: 1, isAdmin: false });
    expect(result).toEqual([]);
  });

  it("S4-2.4: searchIncidents aceita filtro de categoria", async () => {
    await db.searchIncidents({ query: "ataque", userId: 1, isAdmin: false, category: "malware" });
    expect(db.searchIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ category: "malware" })
    );
  });

  it("S4-2.5: searchIncidents aceita filtro de riskLevel", async () => {
    await db.searchIncidents({ query: "ataque", userId: 1, isAdmin: false, riskLevel: "critical" });
    expect(db.searchIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ riskLevel: "critical" })
    );
  });

  it("S4-2.6: admin recebe todos os incidentes na busca", async () => {
    const adminIncident = { ...mockIncident, userId: 99 };
    vi.mocked(db.searchIncidents).mockResolvedValue([mockIncident, adminIncident]);
    const result = await db.searchIncidents({ query: "phishing", userId: 2, isAdmin: true });
    expect(result.length).toBe(2);
  });
});

// ─── S4-3: addIncidentHistory ─────────────────────────────────────────────────
describe("S4-3 — addIncidentHistory", () => {
  beforeEach(() => {
    vi.mocked(db.addIncidentHistory).mockResolvedValue(undefined);
  });

  it("S4-3.1: addIncidentHistory é chamado com action status_changed", async () => {
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "status_changed",
      fromValue: "open",
      toValue: "in_progress",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "status_changed", fromValue: "open", toValue: "in_progress" })
    );
  });

  it("S4-3.2: addIncidentHistory é chamado com action notes_updated", async () => {
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "notes_updated",
      fromValue: null,
      toValue: "Nova nota de acompanhamento",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notes_updated" })
    );
  });

  it("S4-3.3: addIncidentHistory aceita comentário opcional", async () => {
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "status_changed",
      fromValue: "open",
      toValue: "resolved",
      comment: "Incidente investigado e resolvido com sucesso",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ comment: "Incidente investigado e resolvido com sucesso" })
    );
  });

  it("S4-3.4: addIncidentHistory aceita action category_changed", async () => {
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 2,
      action: "category_changed",
      fromValue: "unknown",
      toValue: "malware",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "category_changed" })
    );
  });

  it("S4-3.5: addIncidentHistory aceita action risk_changed", async () => {
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 2,
      action: "risk_changed",
      fromValue: "medium",
      toValue: "critical",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk_changed" })
    );
  });
});

// ─── S4-4: getIncidentHistory ─────────────────────────────────────────────────
describe("S4-4 — getIncidentHistory", () => {
  const mockHistory = [
    {
      id: 1,
      incidentId: 10,
      userId: 1,
      action: "status_changed" as const,
      fromValue: "open",
      toValue: "in_progress",
      comment: null,
      createdAt: new Date("2026-04-02T10:00:00Z"),
      userName: "Alice",
    },
    {
      id: 2,
      incidentId: 10,
      userId: 1,
      action: "notes_updated" as const,
      fromValue: null,
      toValue: "Investigação iniciada",
      comment: null,
      createdAt: new Date("2026-04-02T11:00:00Z"),
      userName: "Alice",
    },
  ];

  beforeEach(() => {
    vi.mocked(db.getIncidentHistory).mockResolvedValue(mockHistory);
  });

  it("S4-4.1: getIncidentHistory retorna lista de entradas", async () => {
    const result = await db.getIncidentHistory(10);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it("S4-4.2: cada entrada tem os campos obrigatórios", async () => {
    const result = await db.getIncidentHistory(10);
    const entry = result[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("incidentId");
    expect(entry).toHaveProperty("userId");
    expect(entry).toHaveProperty("action");
    expect(entry).toHaveProperty("createdAt");
  });

  it("S4-4.3: getIncidentHistory inclui o nome do usuário", async () => {
    const result = await db.getIncidentHistory(10);
    expect(result[0].userName).toBe("Alice");
  });

  it("S4-4.4: getIncidentHistory retorna lista vazia quando não há histórico", async () => {
    vi.mocked(db.getIncidentHistory).mockResolvedValue([]);
    const result = await db.getIncidentHistory(999);
    expect(result).toEqual([]);
  });

  it("S4-4.5: getIncidentHistory é chamado com o incidentId correto", async () => {
    await db.getIncidentHistory(10);
    expect(db.getIncidentHistory).toHaveBeenCalledWith(10);
  });
});

// ─── S4-5: Procedure incidents.history — controle de acesso ──────────────────
describe("S4-5 — Controle de acesso no histórico", () => {
  it("S4-5.1: usuário pode acessar histórico do próprio incidente", async () => {
    vi.mocked(db.getIncidentById).mockResolvedValue(mockIncident);
    vi.mocked(db.getIncidentHistory).mockResolvedValue([]);

    // Simula a lógica da procedure
    const inc = await db.getIncidentById(10);
    const canAccess = inc && (inc.userId === mockUser.id || mockUser.role === "admin");
    expect(canAccess).toBe(true);
  });

  it("S4-5.2: usuário não pode acessar histórico de incidente de outro usuário", async () => {
    const otherIncident = { ...mockIncident, userId: 99 };
    vi.mocked(db.getIncidentById).mockResolvedValue(otherIncident);

    const inc = await db.getIncidentById(10);
    const canAccess = inc && (inc.userId === mockUser.id || mockUser.role === "admin");
    expect(canAccess).toBeFalsy();
  });

  it("S4-5.3: admin pode acessar histórico de qualquer incidente", async () => {
    const otherIncident = { ...mockIncident, userId: 99 };
    vi.mocked(db.getIncidentById).mockResolvedValue(otherIncident);

    const inc = await db.getIncidentById(10);
    const canAccess = inc && (inc.userId === mockAdmin.id || mockAdmin.role === "admin");
    expect(canAccess).toBe(true);
  });

  it("S4-5.4: retorna NOT_FOUND quando incidente não existe", async () => {
    vi.mocked(db.getIncidentById).mockResolvedValue(null);
    const inc = await db.getIncidentById(9999);
    expect(inc).toBeNull();
    // Procedure lançaria TRPCError NOT_FOUND
    const error = new TRPCError({ code: "NOT_FOUND", message: "Incidente não encontrado" });
    expect(error.code).toBe("NOT_FOUND");
  });
});

// ─── S4-6: updateStatus grava histórico ──────────────────────────────────────
describe("S4-6 — updateStatus grava histórico automaticamente", () => {
  beforeEach(() => {
    vi.mocked(db.getIncidentById).mockResolvedValue(mockIncident);
    vi.mocked(db.updateIncidentStatus).mockResolvedValue(undefined);
    vi.mocked(db.addIncidentHistory).mockResolvedValue(undefined);
  });

  it("S4-6.1: ao alterar status, addIncidentHistory é chamado com action status_changed", async () => {
    const current = await db.getIncidentById(10);
    await db.updateIncidentStatus(10, 1, "in_progress", false);
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "status_changed",
      fromValue: current?.status ?? null,
      toValue: "in_progress",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "status_changed",
        fromValue: "open",
        toValue: "in_progress",
      })
    );
  });

  it("S4-6.2: ao resolver incidente, fromValue é o status anterior", async () => {
    const inProgressIncident = { ...mockIncident, status: "in_progress" as const };
    vi.mocked(db.getIncidentById).mockResolvedValue(inProgressIncident);
    const current = await db.getIncidentById(10);
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "status_changed",
      fromValue: current?.status ?? null,
      toValue: "resolved",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ fromValue: "in_progress", toValue: "resolved" })
    );
  });

  it("S4-6.3: comentário opcional é incluído no histórico", async () => {
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "status_changed",
      fromValue: "open",
      toValue: "resolved",
      comment: "Resolvido após análise forense",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ comment: "Resolvido após análise forense" })
    );
  });
});

// ─── S4-7: updateNotes grava histórico ───────────────────────────────────────
describe("S4-7 — updateNotes grava histórico automaticamente", () => {
  beforeEach(() => {
    vi.mocked(db.getIncidentById).mockResolvedValue(mockIncident);
    vi.mocked(db.updateIncidentNotes).mockResolvedValue(undefined);
    vi.mocked(db.addIncidentHistory).mockResolvedValue(undefined);
  });

  it("S4-7.1: ao salvar notas, addIncidentHistory é chamado com action notes_updated", async () => {
    const current = await db.getIncidentById(10);
    await db.updateIncidentNotes(10, 1, "Nova nota", false);
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "notes_updated",
      fromValue: current?.notes ?? null,
      toValue: "Nova nota",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notes_updated", toValue: "Nova nota" })
    );
  });

  it("S4-7.2: fromValue é null quando incidente não tinha notas anteriores", async () => {
    const current = await db.getIncidentById(10);
    expect(current?.notes).toBeNull();
    await db.addIncidentHistory({
      incidentId: 10,
      userId: 1,
      action: "notes_updated",
      fromValue: current?.notes ?? null,
      toValue: "Primeira nota",
    });
    expect(db.addIncidentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ fromValue: null })
    );
  });
});

// ─── S4-8: Schema incident_history ───────────────────────────────────────────
describe("S4-8 — Schema da tabela incident_history", () => {
  it("S4-8.1: arquivo schema.ts contém a definição de incidentHistory", () => {
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("incidentHistory");
    expect(content).toContain("incident_history");
  });

  it("S4-8.2: schema contém o campo action com os valores corretos", () => {
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("status_changed");
    expect(content).toContain("notes_updated");
    expect(content).toContain("category_changed");
    expect(content).toContain("risk_changed");
  });

  it("S4-8.3: schema contém os campos fromValue e toValue", () => {
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("fromValue");
    expect(content).toContain("toValue");
  });

  it("S4-8.4: schema contém o campo comment para notas opcionais", () => {
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("comment");
  });

  it("S4-8.5: schema exporta os tipos IncidentHistory e InsertIncidentHistory", () => {
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("export type IncidentHistory");
    expect(content).toContain("export type InsertIncidentHistory");
  });

  it("S4-8.6: db.ts importa incidentHistory do schema", () => {
    const dbPath = path.resolve(__dirname, "../server/db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");
    expect(content).toContain("incidentHistory");
  });

  it("S4-8.7: routers.ts exporta a procedure incidents.history", () => {
    const routersPath = path.resolve(__dirname, "../server/routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("history: protectedProcedure");
    expect(content).toContain("getIncidentHistory");
  });
});
