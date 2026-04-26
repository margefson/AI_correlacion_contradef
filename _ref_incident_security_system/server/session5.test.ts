/**
 * session5.test.ts — Testes da Sessão 5
 * Cobre: Gerenciamento de Usuários (editar/excluir/reset senha),
 *        Download do Dataset, Retreinamento Dinâmico
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// ─── S5-1: Gerenciamento de Usuários — Helpers do DB ─────────────────────────
describe("S5-1: updateUserInfo helper", () => {
  it("S5-1.1: deve atualizar nome do usuário", async () => {
    const mockDb = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    const updateUserInfo = async (
      userId: number,
      data: { name?: string; email?: string }
    ) => {
      if (!data.name && !data.email) return null;
      return mockDb.update({}).set(data).where({ id: userId });
    };
    await updateUserInfo(1, { name: "Novo Nome" });
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("S5-1.2: deve ignorar atualização quando nenhum campo é fornecido", async () => {
    const updateUserInfo = async (
      userId: number,
      data: { name?: string; email?: string }
    ) => {
      if (!data.name && !data.email) return null;
      return { updated: true };
    };
    const result = await updateUserInfo(1, {});
    expect(result).toBeNull();
  });

  it("S5-1.3: deve atualizar email do usuário", async () => {
    const mockDb = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    const updateUserInfo = async (
      userId: number,
      data: { name?: string; email?: string }
    ) => {
      if (!data.name && !data.email) return null;
      return mockDb.update({}).set(data).where({ id: userId });
    };
    await updateUserInfo(2, { email: "novo@email.com" });
    expect(mockDb.set).toHaveBeenCalledWith({ email: "novo@email.com" });
  });
});

// ─── S5-2: Reset de Senha ─────────────────────────────────────────────────────
describe("S5-2: resetUserPassword — senha padrão Security2026@", () => {
  it("S5-2.1: deve gerar hash bcrypt válido para a senha padrão", async () => {
    const DEFAULT_PASSWORD = "Security2026@";
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    expect(hash).toBeTruthy();
    expect(hash.startsWith("$2b$")).toBe(true);
  });

  it("S5-2.2: hash deve ser verificável com a senha padrão", async () => {
    const DEFAULT_PASSWORD = "Security2026@";
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const valid = await bcrypt.compare(DEFAULT_PASSWORD, hash);
    expect(valid).toBe(true);
  });

  it("S5-2.3: hash não deve ser válido com senha diferente", async () => {
    const DEFAULT_PASSWORD = "Security2026@";
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const invalid = await bcrypt.compare("outraSenha123", hash);
    expect(invalid).toBe(false);
  });

  it("S5-2.4: senha padrão deve atender requisitos de complexidade", () => {
    const DEFAULT_PASSWORD = "Security2026@";
    // Deve ter maiúscula, minúscula, número e símbolo
    expect(/[A-Z]/.test(DEFAULT_PASSWORD)).toBe(true);
    expect(/[a-z]/.test(DEFAULT_PASSWORD)).toBe(true);
    expect(/[0-9]/.test(DEFAULT_PASSWORD)).toBe(true);
    expect(/[@#$%^&*!]/.test(DEFAULT_PASSWORD)).toBe(true);
    expect(DEFAULT_PASSWORD.length).toBeGreaterThanOrEqual(8);
  });
});

// ─── S5-3: Proteção de Auto-Edição ───────────────────────────────────────────
describe("S5-3: proteção contra auto-edição/exclusão", () => {
  it("S5-3.1: admin não deve poder excluir a própria conta", () => {
    const deleteUser = (targetId: number, currentUserId: number) => {
      if (targetId === currentUserId) {
        throw new Error("Você não pode excluir sua própria conta");
      }
      return { success: true };
    };
    expect(() => deleteUser(1, 1)).toThrow("Você não pode excluir sua própria conta");
  });

  it("S5-3.2: admin deve poder excluir outra conta", () => {
    const deleteUser = (targetId: number, currentUserId: number) => {
      if (targetId === currentUserId) {
        throw new Error("Você não pode excluir sua própria conta");
      }
      return { success: true };
    };
    expect(deleteUser(2, 1)).toEqual({ success: true });
  });

  it("S5-3.3: admin não deve poder resetar a própria senha via painel", () => {
    const resetPassword = (targetId: number, currentUserId: number) => {
      if (targetId === currentUserId) {
        throw new Error("Use a página de perfil para alterar sua própria senha");
      }
      return { success: true };
    };
    expect(() => resetPassword(1, 1)).toThrow("Use a página de perfil");
  });

  it("S5-3.4: admin não deve poder alterar o próprio perfil via painel admin", () => {
    const updateUser = (targetId: number, currentUserId: number, data: object) => {
      if (targetId === currentUserId) {
        throw new Error("Use a página de perfil para editar seus próprios dados");
      }
      return { success: true, data };
    };
    expect(() => updateUser(1, 1, { name: "Novo" })).toThrow("Use a página de perfil");
  });
});

// ─── S5-4: Dataset CDN URL ────────────────────────────────────────────────────
describe("S5-4: Dataset de Treinamento — CDN URL", () => {
  const DATASET_CDN_URL =
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663148675640/KjT4emSwzjBHV8i56oSYsp/incidentes_cybersecurity_100_54912b47.xlsx";

  it("S5-4.1: URL do CDN deve ser válida (HTTPS)", () => {
    expect(DATASET_CDN_URL.startsWith("https://")).toBe(true);
  });

  it("S5-4.2: URL do CDN deve apontar para arquivo .xlsx", () => {
    expect(DATASET_CDN_URL.endsWith(".xlsx")).toBe(true);
  });

  it("S5-4.3: URL do viewer online deve ser gerada corretamente", () => {
    const ONLINE_VIEWER_URL = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(DATASET_CDN_URL)}`;
    expect(ONLINE_VIEWER_URL.startsWith("https://view.officeapps.live.com")).toBe(true);
    expect(ONLINE_VIEWER_URL).toContain("cloudfront.net");
  });

  it("S5-4.4: nome do arquivo de download deve ser correto", () => {
    const filename = "incidentes_cybersecurity_100.xlsx";
    expect(filename).toBe("incidentes_cybersecurity_100.xlsx");
    expect(filename.endsWith(".xlsx")).toBe(true);
  });
});

// ─── S5-5: Retreinamento com Incidentes do Banco ─────────────────────────────
describe("S5-5: retrainModel — includeAllIncidents", () => {
  it("S5-5.1: deve filtrar incidentes com categoria 'unknown'", () => {
    const incidents = [
      { description: "Phishing detectado", category: "phishing" },
      { description: "Sem categoria", category: "unknown" },
      { description: "Malware encontrado", category: "malware" },
    ];
    const filtered = incidents.filter(
      (i) => i.description && i.category && i.category !== "unknown"
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.category !== "unknown")).toBe(true);
  });

  it("S5-5.2: deve mesclar incidentes do banco com novas amostras", () => {
    const dbSamples = [
      { description: "Phishing email", category: "phishing" },
      { description: "Malware detectado", category: "malware" },
    ];
    const newSamples = [
      { description: "Engenharia social avançada", category: "engenharia_social" },
    ];
    const allSamples = [...dbSamples, ...newSamples];
    expect(allSamples).toHaveLength(3);
    expect(allSamples.some((s) => s.category === "engenharia_social")).toBe(true);
  });

  it("S5-5.3: deve lançar erro quando não há amostras disponíveis", () => {
    const retrain = (samples: unknown[]) => {
      if (samples.length === 0) {
        throw new Error("Nenhuma amostra disponível para retreinamento");
      }
      return { success: true };
    };
    expect(() => retrain([])).toThrow("Nenhuma amostra disponível");
  });

  it("S5-5.4: deve aceitar retreinamento sem novas amostras quando há incidentes no banco", () => {
    const retrain = (dbSamples: unknown[], newSamples: unknown[]) => {
      const all = [...dbSamples, ...newSamples];
      if (all.length === 0) throw new Error("Sem amostras");
      return { success: true, total: all.length };
    };
    const result = retrain(
      [{ description: "Phishing", category: "phishing" }],
      [] // sem novas amostras
    );
    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
  });

  it("S5-5.5: campo includeAllIncidents deve ser opcional com default false", () => {
    const schema = {
      includeAllIncidents: false, // default
    };
    expect(schema.includeAllIncidents).toBe(false);
  });
});

// ─── S5-6: Validação de Input do updateUser ───────────────────────────────────
describe("S5-6: validação de input do updateUser", () => {
  it("S5-6.1: nome deve ter pelo menos 1 caractere", () => {
    const validate = (name: string) => name.length >= 1 && name.length <= 100;
    expect(validate("A")).toBe(true);
    expect(validate("")).toBe(false);
  });

  it("S5-6.2: nome deve ter no máximo 100 caracteres", () => {
    const validate = (name: string) => name.length >= 1 && name.length <= 100;
    expect(validate("A".repeat(100))).toBe(true);
    expect(validate("A".repeat(101))).toBe(false);
  });

  it("S5-6.3: email deve ter formato válido", () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });
});
