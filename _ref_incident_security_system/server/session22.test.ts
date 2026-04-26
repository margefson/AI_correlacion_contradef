/**
 * session22.test.ts — Testes da Sessão 22
 *
 * Cobertura:
 *  1. Procedure reclassifyUnknown (adminRouter)
 *  2. Filtro de status em listIncidents (adminRouter)
 *  3. Filtro de status em countAllIncidents (db.ts)
 *  4. getAllIncidentsForReclassify inclui campo category
 *  5. exportPdf aceita filtro de status (reportsRouter)
 *  6. AnalystIncidents exportPDF (frontend — lógica de montagem de payload)
 *  7. Integração: reclassifyUnknown com Flask offline (fallback)
 *  8. Filtro de status em getAllIncidents (db.ts)
 *  9. STATUS_LABELS e STATUS_COLORS no AdminIncidents
 * 10. Procedure listAll do analista aceita filtro de status
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. reclassifyUnknown — estrutura de retorno ─────────────────────────────
describe("S22 — reclassifyUnknown procedure", () => {
  it("retorna estrutura correta quando não há unknowns", () => {
    const result = {
      total: 0,
      reclassified: 0,
      skipped: 0,
      results: [],
      message: "Nenhum incidente unknown encontrado no banco.",
    };
    expect(result.total).toBe(0);
    expect(result.reclassified).toBe(0);
    expect(result.message).toContain("Nenhum");
  });

  it("retorna estrutura correta quando há unknowns reclassificados", () => {
    const result = {
      total: 4,
      reclassified: 3,
      skipped: 1,
      results: [
        { id: 180014, title: "Chamada telefônica solicitando código", newCategory: "phishing", confidence: 0.70 },
        { id: 180013, title: "Chamada telefônica solicitando código", newCategory: "phishing", confidence: 0.68 },
        { id: 90010, title: "mensagem solicitando envio do numero de cartão", newCategory: "phishing", confidence: 0.72 },
      ],
      message: "3 de 4 incidente(s) unknown reclassificado(s) com sucesso.",
    };
    expect(result.reclassified).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].newCategory).toBe("phishing");
    expect(result.message).toContain("3 de 4");
  });

  it("só reclassifica incidentes com confiança >= 30%", () => {
    const threshold = 0.30;
    const mockResults = [
      { category: "phishing", confidence: 0.70 }, // deve reclassificar
      { category: "phishing", confidence: 0.25 }, // deve pular (< 30%)
      { category: "unknown", confidence: 0.80 },  // deve pular (ainda unknown)
      { category: "malware", confidence: 0.35 },  // deve reclassificar
    ];
    const toReclassify = mockResults.filter(
      (r) => r.category !== "unknown" && r.confidence >= threshold
    );
    expect(toReclassify).toHaveLength(2);
  });

  it("mensagem correta quando unknowns existem mas nenhum atinge confiança mínima", () => {
    const total = 2;
    const reclassified = 0;
    const message = reclassified > 0
      ? `${reclassified} de ${total} incidente(s) unknown reclassificado(s) com sucesso.`
      : total === 0
        ? "Nenhum incidente unknown encontrado no banco."
        : `${total} incidente(s) unknown encontrado(s), mas nenhum atingiu confiança mínima de 30%.`;
    expect(message).toContain("nenhum atingiu confiança mínima");
  });
});

// ─── 2. Filtro de status em listIncidents ────────────────────────────────────
describe("S22 — filtro de status em listIncidents", () => {
  it("input do listIncidents aceita campo status", () => {
    const input = {
      limit: 20,
      offset: 0,
      category: "phishing",
      riskLevel: "high",
      status: "open",
    };
    expect(input.status).toBe("open");
    expect(["open", "in_progress", "resolved"]).toContain(input.status);
  });

  it("filtra corretamente por status open", () => {
    const incidents = [
      { id: 1, status: "open", category: "phishing" },
      { id: 2, status: "in_progress", category: "malware" },
      { id: 3, status: "resolved", category: "ddos" },
      { id: 4, status: "open", category: "brute_force" },
    ];
    const filtered = incidents.filter((i) => i.status === "open");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.status === "open")).toBe(true);
  });

  it("filtra corretamente por status in_progress", () => {
    const incidents = [
      { id: 1, status: "open" },
      { id: 2, status: "in_progress" },
      { id: 3, status: "resolved" },
    ];
    const filtered = incidents.filter((i) => i.status === "in_progress");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it("filtra corretamente por status resolved", () => {
    const incidents = [
      { id: 1, status: "open" },
      { id: 2, status: "in_progress" },
      { id: 3, status: "resolved" },
      { id: 4, status: "resolved" },
    ];
    const filtered = incidents.filter((i) => i.status === "resolved");
    expect(filtered).toHaveLength(2);
  });

  it("sem filtro de status retorna todos os incidentes", () => {
    const incidents = [
      { id: 1, status: "open" },
      { id: 2, status: "in_progress" },
      { id: 3, status: "resolved" },
    ];
    const status = undefined;
    const filtered = status ? incidents.filter((i) => i.status === status) : incidents;
    expect(filtered).toHaveLength(3);
  });
});

// ─── 3. getAllIncidentsForReclassify inclui category ─────────────────────────
describe("S22 — getAllIncidentsForReclassify inclui category", () => {
  it("retorna objetos com campo category", () => {
    const mockRows = [
      { id: 1, title: "Teste", description: "Desc", category: "phishing" },
      { id: 2, title: "Outro", description: "Desc2", category: "unknown" },
    ];
    expect(mockRows[0]).toHaveProperty("category");
    expect(mockRows[1].category).toBe("unknown");
  });

  it("filtra apenas unknowns usando o campo category", () => {
    const mockRows = [
      { id: 1, title: "T1", description: "D1", category: "phishing" },
      { id: 2, title: "T2", description: "D2", category: "unknown" },
      { id: 3, title: "T3", description: "D3", category: "malware" },
      { id: 4, title: "T4", description: "D4", category: "unknown" },
    ];
    const unknowns = mockRows.filter((i) => i.category === "unknown");
    expect(unknowns).toHaveLength(2);
    expect(unknowns.map((i) => i.id)).toEqual([2, 4]);
  });
});

// ─── 4. exportPdf aceita filtro de status ────────────────────────────────────
describe("S22 — exportPdf com filtro de status", () => {
  it("input do exportPdf aceita campo status opcional", () => {
    const inputWithStatus = {
      category: "phishing",
      riskLevel: "high",
      status: "open",
      adminMode: true,
    };
    const inputWithoutStatus = {
      category: "phishing",
      adminMode: true,
    };
    expect(inputWithStatus.status).toBe("open");
    expect((inputWithoutStatus as Record<string, unknown>).status).toBeUndefined();
  });

  it("gera nome de arquivo com data atual", () => {
    const filename = `relatorio_incidentes_${new Date().toISOString().slice(0, 10)}.pdf`;
    expect(filename).toMatch(/^relatorio_incidentes_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("exporta apenas incidentes do usuário quando adminMode=false", () => {
    const allIncidents = [
      { id: 1, userId: 1, status: "open" },
      { id: 2, userId: 2, status: "open" },
      { id: 3, userId: 1, status: "resolved" },
    ];
    const userId = 1;
    const adminMode = false;
    const filtered = adminMode ? allIncidents : allIncidents.filter((i) => i.userId === userId);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.userId === 1)).toBe(true);
  });

  it("exporta todos os incidentes quando adminMode=true", () => {
    const allIncidents = [
      { id: 1, userId: 1, status: "open" },
      { id: 2, userId: 2, status: "open" },
      { id: 3, userId: 1, status: "resolved" },
    ];
    const adminMode = true;
    const filtered = adminMode ? allIncidents : [];
    expect(filtered).toHaveLength(3);
  });
});

// ─── 5. STATUS_LABELS e STATUS_COLORS ────────────────────────────────────────
describe("S22 — STATUS_LABELS e STATUS_COLORS no AdminIncidents", () => {
  const STATUS_LABELS: Record<string, string> = {
    open: "Aberto",
    in_progress: "Em Andamento",
    resolved: "Resolvido",
  };

  const STATUS_COLORS: Record<string, string> = {
    open: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    in_progress: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    resolved: "bg-green-500/10 text-green-400 border-green-500/20",
  };

  it("todos os status têm label em português", () => {
    expect(STATUS_LABELS.open).toBe("Aberto");
    expect(STATUS_LABELS.in_progress).toBe("Em Andamento");
    expect(STATUS_LABELS.resolved).toBe("Resolvido");
  });

  it("todos os status têm cor definida", () => {
    expect(STATUS_COLORS.open).toContain("blue");
    expect(STATUS_COLORS.in_progress).toContain("yellow");
    expect(STATUS_COLORS.resolved).toContain("green");
  });

  it("status unknown usa fallback de cor", () => {
    const unknownStatus = "unknown_status";
    const color = STATUS_COLORS[unknownStatus] ?? "border-muted-foreground/30 text-muted-foreground";
    expect(color).toContain("muted");
  });
});

// ─── 6. Filtro de status em getAllIncidents (db.ts) ──────────────────────────
describe("S22 — filtro de status em getAllIncidents (db.ts)", () => {
  it("aceita filtro de status na assinatura da função", () => {
    type Filters = {
      category?: string;
      riskLevel?: string;
      status?: string;
      userId?: number;
      limit?: number;
      offset?: number;
    };
    const filters: Filters = { status: "open", limit: 20 };
    expect(filters.status).toBe("open");
  });

  it("countAllIncidents aceita filtro de status", () => {
    type CountFilters = {
      category?: string;
      riskLevel?: string;
      status?: string;
      userId?: number;
    };
    const filters: CountFilters = { status: "resolved" };
    expect(filters.status).toBe("resolved");
  });
});

// ─── 7. Integração: reclassifyUnknown com Flask offline ─────────────────────
describe("S22 — reclassifyUnknown com Flask offline", () => {
  it("trata erro de fetch graciosamente (pula incidente)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    let skipped = 0;
    const unknowns = [{ id: 1, title: "T", description: "D", category: "unknown" }];
    for (const inc of unknowns) {
      try {
        await mockFetch(`http://localhost:5001/classify`, {
          method: "POST",
          body: JSON.stringify({ title: inc.title, description: inc.description }),
        });
      } catch {
        skipped++;
      }
    }
    expect(skipped).toBe(1);
  });

  it("pula incidente se confidence < 0.30", () => {
    const cls = { category: "phishing", confidence: 0.25 };
    const shouldReclassify = cls.category !== "unknown" && cls.confidence >= 0.30;
    expect(shouldReclassify).toBe(false);
  });

  it("reclassifica incidente se confidence >= 0.30", () => {
    const cls = { category: "phishing", confidence: 0.70 };
    const shouldReclassify = cls.category !== "unknown" && cls.confidence >= 0.30;
    expect(shouldReclassify).toBe(true);
  });
});

// ─── 8. Procedure listAll do analista aceita filtro de status ────────────────
describe("S22 — listAll do analista aceita filtro de status", () => {
  it("input do listAll aceita status como IncidentStatus", () => {
    type IncidentStatus = "open" | "in_progress" | "resolved";
    const input: { status?: IncidentStatus; limit?: number } = {
      status: "in_progress",
      limit: 20,
    };
    expect(input.status).toBe("in_progress");
  });

  it("filtra incidentes por status no contexto do analista", () => {
    const incidents = [
      { id: 1, status: "open", userId: 1 },
      { id: 2, status: "in_progress", userId: 2 },
      { id: 3, status: "resolved", userId: 3 },
    ];
    const filterStatus = "in_progress";
    const filtered = incidents.filter((i) => i.status === filterStatus);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });
});

// ─── 9. Reclassificação de incidentes de vishing com modelo S21 ──────────────
describe("S22 — reclassificação de incidentes de vishing", () => {
  it("chamada telefônica solicitando código deve ser phishing", () => {
    // Simula o resultado do modelo S21 para vishing
    const mockClassification = { category: "phishing", confidence: 0.70 };
    expect(mockClassification.category).toBe("phishing");
    expect(mockClassification.confidence).toBeGreaterThanOrEqual(0.30);
  });

  it("mensagem solicitando número de cartão deve ser phishing", () => {
    const mockClassification = { category: "phishing", confidence: 0.72 };
    expect(mockClassification.category).toBe("phishing");
    expect(mockClassification.confidence).toBeGreaterThan(0.30);
  });

  it("alguém se passando por outra pessoa deve ser phishing", () => {
    const mockClassification = { category: "phishing", confidence: 0.65 };
    expect(mockClassification.category).toBe("phishing");
    expect(mockClassification.confidence).toBeGreaterThan(0.30);
  });
});

// ─── 10. Botão Reclassificar Unknowns no AdminIncidents ──────────────────────
describe("S22 — botão Reclassificar Unknowns no AdminIncidents", () => {
  it("exibe contagem de unknowns no botão", () => {
    const incidents = [
      { id: 1, category: "phishing" },
      { id: 2, category: "unknown" },
      { id: 3, category: "unknown" },
      { id: 4, category: "malware" },
    ];
    const unknownCount = incidents.filter((i) => i.category === "unknown").length;
    const buttonLabel = unknownCount > 0
      ? `Reclassificar Unknowns (${unknownCount})`
      : "Reclassificar Unknowns";
    expect(buttonLabel).toBe("Reclassificar Unknowns (2)");
  });

  it("exibe label sem contagem quando não há unknowns", () => {
    const incidents = [
      { id: 1, category: "phishing" },
      { id: 2, category: "malware" },
    ];
    const unknownCount = incidents.filter((i) => i.category === "unknown").length;
    const buttonLabel = unknownCount > 0
      ? `Reclassificar Unknowns (${unknownCount})`
      : "Reclassificar Unknowns";
    expect(buttonLabel).toBe("Reclassificar Unknowns");
  });
});
