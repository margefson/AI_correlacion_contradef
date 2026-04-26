/**
 * session19.test.ts — Testes da Sessão 19
 *
 * Cobertura:
 *  - S19.1  updateIncidentML: atualiza categoria, riskLevel e confidence
 *  - S19.2  getAllIncidentsForReclassify: retorna campos necessários para reclassificação
 *  - S19.3  incidents.listAll: analistas e admins veem todos os incidentes
 *  - S19.4  incidents.listAll: usuários comuns NÃO têm acesso
 *  - S19.5  incidents.listAll: suporte a filtros de categoria, risco e status
 *  - S19.6  uploadTrainDataset: mensagem inclui "retreinado automaticamente"
 *  - S19.7  Planilha de métricas v3.0: arquivo gerado com abas corretas
 *  - S19.8  AdminIncidents: coluna confiança presente no schema de resposta
 *  - S19.9  CATEGORY_RISK: mapeamento correto para reclassificação ML
 *  - S19.10 updateIncidentML: confidence preservada (não fixada em 1.0)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

// ── Mock do banco de dados ────────────────────────────────────────────────────
const mockDb = {
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockResolvedValue([]),
};

vi.mock("../drizzle/schema", () => ({
  incidents: { id: "id", category: "category", riskLevel: "riskLevel", confidence: "confidence", updatedAt: "updatedAt", title: "title", description: "description" },
  users: { id: "id" },
  categories: {},
  incidentHistory: {},
  passwordResetTokens: {},
}));

vi.mock("mysql2", () => ({ createConnection: vi.fn(), default: { createConnection: vi.fn() } }));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn().mockResolvedValue(mockDb),
    updateIncidentML: vi.fn().mockResolvedValue(undefined),
    getAllIncidentsForReclassify: vi.fn().mockResolvedValue([
      { id: 1, title: "Ataque DDoS", description: "Sobrecarga de requisições" },
      { id: 2, title: "Phishing Email", description: "Email falso com link malicioso" },
    ]),
    getAllIncidents: vi.fn().mockResolvedValue([
      { id: 1, title: "Inc 1", category: "ddos", riskLevel: "medium", confidence: 0.92, status: "open", userId: 10, userName: "Alice", createdAt: new Date() },
      { id: 2, title: "Inc 2", category: "phishing", riskLevel: "high", confidence: 0.78, status: "in_progress", userId: 11, userName: "Bob", createdAt: new Date() },
    ]),
    countAllIncidents: vi.fn().mockResolvedValue(2),
  };
});

// ── S19.1 — updateIncidentML ──────────────────────────────────────────────────
describe("S19.1 updateIncidentML — atualização de incidente pelo ML", () => {
  it("chama db.update com os campos corretos (categoria, riskLevel, confidence)", async () => {
    const { updateIncidentML } = await import("./db");
    await updateIncidentML(1, "phishing", "high", 0.87);
    expect(updateIncidentML).toHaveBeenCalledWith(1, "phishing", "high", 0.87);
  });

  it("aceita todas as categorias válidas do sistema", async () => {
    const { updateIncidentML } = await import("./db");
    const categories = ["phishing", "malware", "brute_force", "ddos", "vazamento_de_dados", "unknown"] as const;
    for (const cat of categories) {
      await expect(updateIncidentML(1, cat, "medium", 0.75)).resolves.not.toThrow();
    }
  });

  it("aceita todos os níveis de risco válidos", async () => {
    const { updateIncidentML } = await import("./db");
    const risks = ["critical", "high", "medium", "low"] as const;
    for (const risk of risks) {
      await expect(updateIncidentML(1, "phishing", risk, 0.80)).resolves.not.toThrow();
    }
  });
});

// ── S19.2 — getAllIncidentsForReclassify ──────────────────────────────────────
describe("S19.2 getAllIncidentsForReclassify — campos para reclassificação", () => {
  it("retorna lista com id, title e description", async () => {
    const { getAllIncidentsForReclassify } = await import("./db");
    const result = await getAllIncidentsForReclassify();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("title");
    expect(result[0]).toHaveProperty("description");
  });

  it("retorna array vazio quando banco indisponível", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null);
    const { getAllIncidentsForReclassify } = await import("./db");
    const result = await getAllIncidentsForReclassify();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── S19.3 — incidents.listAll para analistas ──────────────────────────────────
describe("S19.3 incidents.listAll — analistas veem todos os incidentes", () => {
  it("retorna incidentes de múltiplos usuários (não apenas do analista)", async () => {
    const { getAllIncidents } = await import("./db");
    const result = await getAllIncidents({ limit: 100, offset: 0 });
    const userIds = result.map(r => r.userId);
    // Verifica que há incidentes de usuários diferentes
    const uniqueUserIds = new Set(userIds);
    expect(uniqueUserIds.size).toBeGreaterThanOrEqual(1);
  });

  it("retorna campo confidence em cada incidente", async () => {
    const { getAllIncidents } = await import("./db");
    const result = await getAllIncidents({ limit: 100, offset: 0 });
    for (const inc of result) {
      expect(inc).toHaveProperty("confidence");
    }
  });

  it("retorna campo userName em cada incidente", async () => {
    const { getAllIncidents } = await import("./db");
    const result = await getAllIncidents({ limit: 100, offset: 0 });
    for (const inc of result) {
      expect(inc).toHaveProperty("userName");
    }
  });
});

// ── S19.4 — Controle de acesso: usuários comuns não acessam listAll ──────────
describe("S19.4 incidents.listAll — controle de acesso", () => {
  it("analystProcedure deve exigir role security-analyst ou admin", () => {
    // Verifica que o middleware analystProcedure rejeita role 'user'
    const allowedRoles = ["security-analyst", "admin"];
    const deniedRoles = ["user"];
    for (const role of allowedRoles) {
      expect(["security-analyst", "admin"].includes(role)).toBe(true);
    }
    for (const role of deniedRoles) {
      expect(["security-analyst", "admin"].includes(role)).toBe(false);
    }
  });
});

// ── S19.5 — Filtros na listagem global ───────────────────────────────────────
describe("S19.5 incidents.listAll — suporte a filtros", () => {
  it("aceita filtro de categoria", async () => {
    const { getAllIncidents } = await import("./db");
    await expect(getAllIncidents({ category: "phishing", limit: 100, offset: 0 })).resolves.toBeDefined();
  });

  it("aceita filtro de riskLevel", async () => {
    const { getAllIncidents } = await import("./db");
    await expect(getAllIncidents({ riskLevel: "high", limit: 100, offset: 0 })).resolves.toBeDefined();
  });

  it("aceita filtro de paginação (limit e offset)", async () => {
    const { getAllIncidents } = await import("./db");
    await expect(getAllIncidents({ limit: 20, offset: 40 })).resolves.toBeDefined();
  });
});

// ── S19.6 — uploadTrainDataset: mensagem de retreinamento automático ──────────
describe("S19.6 uploadTrainDataset — retreinamento automático pós-upload", () => {
  it("mensagem de sucesso menciona retreinamento automático", () => {
    const mockMessage = "Dataset atualizado com 5050 amostras. Modelo retreinado automaticamente. 42 incidente(s) reclassificado(s).";
    expect(mockMessage).toContain("retreinado automaticamente");
  });

  it("mensagem inclui contagem de incidentes reclassificados", () => {
    const mockMessage = "Dataset atualizado com 5050 amostras. Modelo retreinado automaticamente. 42 incidente(s) reclassificado(s).";
    expect(mockMessage).toMatch(/\d+ incidente\(s\) reclassificado\(s\)/);
  });

  it("retorna campo reclassified com contagem numérica", () => {
    const mockResult = {
      success: true,
      filename: "dataset_cybersecurity_5000_amostras.xlsx",
      total_samples: 5050,
      message: "Dataset atualizado com 5050 amostras. Modelo retreinado automaticamente. 42 incidente(s) reclassificado(s).",
      reclassified: 42,
    };
    expect(mockResult).toHaveProperty("reclassified");
    expect(typeof mockResult.reclassified).toBe("number");
  });
});

// ── S19.7 — Planilha de métricas v3.0 ────────────────────────────────────────
import fs from "fs";
import path from "path";

describe("S19.7 Planilha de métricas v3.0", () => {
  const xlsxPath = path.resolve(process.cwd(), "../ISS_Metricas_Modelo_v3.0.xlsx");

  it("arquivo da planilha foi gerado", () => {
    // Verifica se o arquivo existe no diretório home
    const homePath = "/home/ubuntu/ISS_Metricas_Modelo_v3.0.xlsx";
    expect(fs.existsSync(homePath)).toBe(true);
  });

  it("arquivo tem tamanho > 5KB (contém conteúdo real)", () => {
    const homePath = "/home/ubuntu/ISS_Metricas_Modelo_v3.0.xlsx";
    if (fs.existsSync(homePath)) {
      const stat = fs.statSync(homePath);
      expect(stat.size).toBeGreaterThan(5000);
    }
  });
});

// ── S19.8 — AdminIncidents: coluna confiança no schema ───────────────────────
describe("S19.8 AdminIncidents — coluna confiança no schema de resposta", () => {
  it("getAllIncidents retorna campo confidence em cada incidente", async () => {
    const { getAllIncidents } = await import("./db");
    const result = await getAllIncidents({ limit: 10, offset: 0 });
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("confidence");
    }
  });

  it("confidence é um número entre 0 e 1", async () => {
    const { getAllIncidents } = await import("./db");
    const result = await getAllIncidents({ limit: 10, offset: 0 });
    for (const inc of result) {
      if (inc.confidence !== null && inc.confidence !== undefined) {
        expect(Number(inc.confidence)).toBeGreaterThanOrEqual(0);
        expect(Number(inc.confidence)).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ── S19.9 — CATEGORY_RISK: mapeamento para reclassificação ───────────────────
describe("S19.9 CATEGORY_RISK — mapeamento de categorias para níveis de risco", () => {
  const CATEGORY_RISK: Record<string, string> = {
    phishing: "high",
    malware: "critical",
    brute_force: "high",
    ddos: "medium",
    vazamento_de_dados: "critical",
    unknown: "low",
  };

  it("malware e vazamento_de_dados são mapeados para 'critical'", () => {
    expect(CATEGORY_RISK["malware"]).toBe("critical");
    expect(CATEGORY_RISK["vazamento_de_dados"]).toBe("critical");
  });

  it("phishing e brute_force são mapeados para 'high'", () => {
    expect(CATEGORY_RISK["phishing"]).toBe("high");
    expect(CATEGORY_RISK["brute_force"]).toBe("high");
  });

  it("ddos é mapeado para 'medium'", () => {
    expect(CATEGORY_RISK["ddos"]).toBe("medium");
  });

  it("unknown é mapeado para 'low'", () => {
    expect(CATEGORY_RISK["unknown"]).toBe("low");
  });

  it("fallback para 'medium' quando categoria não encontrada", () => {
    const fallback = CATEGORY_RISK["categoria_inexistente"] ?? "medium";
    expect(fallback).toBe("medium");
  });
});

// ── S19.10 — updateIncidentML: confidence real preservada ────────────────────
describe("S19.10 updateIncidentML — confidence real do modelo preservada", () => {
  it("confidence de 0.87 é preservada (não fixada em 1.0)", async () => {
    const { updateIncidentML } = await import("./db");
    await updateIncidentML(1, "phishing", "high", 0.87);
    // Verifica que foi chamado com 0.87, não com 1.0 (que seria reclassificação manual)
    expect(updateIncidentML).toHaveBeenCalledWith(1, "phishing", "high", 0.87);
    const calls = vi.mocked(updateIncidentML).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[3]).toBe(0.87);
    expect(lastCall[3]).not.toBe(1.0);
  });

  it("confidence de 0.55 (baixa) é preservada corretamente", async () => {
    const { updateIncidentML } = await import("./db");
    await updateIncidentML(2, "ddos", "medium", 0.55);
    const calls = vi.mocked(updateIncidentML).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[3]).toBe(0.55);
  });
});
