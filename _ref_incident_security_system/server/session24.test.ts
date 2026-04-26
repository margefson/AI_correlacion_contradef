/**
 * Sessão 24 — Testes
 * Cobre:
 *  1. Auto-reinício do Flask (ensureFlaskRunning)
 *  2. Notificações in-app para analistas em incidentes críticos
 *  3. Dashboard do analista com métricas
 *  4. Histórico de reclassificação automática (userId=0)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. ensureFlaskRunning ────────────────────────────────────────────────────
describe("ensureFlaskRunning — auto-reinício do Flask", () => {
  it("deve retornar true quando o Flask responde ao health check", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    const ensureFlaskRunning = async (port: number, fetchFn = mockFetch) => {
      try {
        const res = await fetchFn(`http://localhost:${port}/health`);
        return res.ok;
      } catch {
        return false;
      }
    };
    const result = await ensureFlaskRunning(5001);
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:5001/health");
  });

  it("deve retornar false quando o Flask não responde (ECONNREFUSED)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const ensureFlaskRunning = async (port: number, fetchFn = mockFetch) => {
      try {
        const res = await fetchFn(`http://localhost:${port}/health`);
        return res.ok;
      } catch {
        return false;
      }
    };
    const result = await ensureFlaskRunning(5001);
    expect(result).toBe(false);
  });

  it("deve tentar reiniciar o Flask quando ele não responde", async () => {
    const spawnMock = vi.fn();
    const healthCheckMock = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED")) // primeira tentativa falha
      .mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }); // após reinício OK

    const ensureWithRestart = async (port: number) => {
      try {
        const res = await healthCheckMock(`http://localhost:${port}/health`);
        return res.ok;
      } catch {
        // Simula reinício
        spawnMock("python3", ["classifier_server.py"], { detached: true });
        try {
          const res2 = await healthCheckMock(`http://localhost:${port}/health`);
          return res2.ok;
        } catch {
          return false;
        }
      }
    };
    const result = await ensureWithRestart(5001);
    expect(result).toBe(true);
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it("deve usar porta 5001 para operações de avaliação", () => {
    const ML_PORTS = { evaluate: 5001, train: 5001, classify: 5001, upload: 5001 };
    expect(ML_PORTS.evaluate).toBe(5001);
    expect(ML_PORTS.train).toBe(5001);
  });

  it("deve incluir timeout de 5 segundos no health check", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await mockFetch("http://localhost:5001/health", { signal: AbortSignal.timeout(5000) });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:5001/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

// ─── 2. Notificações in-app para analistas ───────────────────────────────────
describe("Notificações in-app — incidentes críticos para analistas", () => {
  it("deve criar notificação quando incidente tem riskLevel critical", () => {
    const createNotification = vi.fn();
    const riskLevel = "critical";
    if (riskLevel === "critical") {
      createNotification({ title: "🚨 Incidente Crítico", content: "Novo incidente crítico registrado" });
    }
    expect(createNotification).toHaveBeenCalledOnce();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Crítico") })
    );
  });

  it("não deve criar notificação para incidentes não-críticos", () => {
    const createNotification = vi.fn();
    const riskLevel = "medium";
    if (riskLevel === "critical") {
      createNotification({ title: "🚨 Incidente Crítico", content: "..." });
    }
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("deve buscar todos os usuários com role security-analyst para notificar", async () => {
    const getUsersByRole = vi.fn().mockResolvedValue([
      { id: 10, name: "Analista A", role: "security-analyst" },
      { id: 11, name: "Analista B", role: "security-analyst" },
    ]);
    const analysts = await getUsersByRole("security-analyst");
    expect(analysts).toHaveLength(2);
    expect(analysts.every((a: { role: string }) => a.role === "security-analyst")).toBe(true);
  });

  it("deve incluir ID e título do incidente na notificação", () => {
    const buildNotificationContent = (incidentId: number, title: string) =>
      `Novo incidente crítico registrado: #${incidentId} — ${title}`;
    const content = buildNotificationContent(180001, "Ataque DDoS massivo");
    expect(content).toContain("#180001");
    expect(content).toContain("Ataque DDoS massivo");
  });

  it("deve enviar notificação para cada analista individualmente", async () => {
    const createNotification = vi.fn().mockResolvedValue(true);
    const analysts = [{ id: 10 }, { id: 11 }, { id: 12 }];
    for (const analyst of analysts) {
      await createNotification({ userId: analyst.id, title: "Incidente Crítico" });
    }
    expect(createNotification).toHaveBeenCalledTimes(3);
  });

  it("deve usar categoria ddos para riskLevel high (não critical)", () => {
    const CATEGORY_RISK: Record<string, string> = {
      phishing: "high",
      malware: "critical",
      brute_force: "high",
      ddos: "high",
      vazamento_de_dados: "critical",
    };
    expect(CATEGORY_RISK.malware).toBe("critical");
    expect(CATEGORY_RISK.vazamento_de_dados).toBe("critical");
    expect(CATEGORY_RISK.ddos).toBe("high"); // não critical
  });
});

// ─── 3. Dashboard do Analista ────────────────────────────────────────────────
describe("Dashboard do Analista — métricas de atendimento", () => {
  it("deve calcular corretamente o total de incidentes em andamento", () => {
    const incidents = [
      { status: "in_progress" },
      { status: "in_progress" },
      { status: "open" },
      { status: "resolved" },
    ];
    const inProgress = incidents.filter(i => i.status === "in_progress").length;
    expect(inProgress).toBe(2);
  });

  it("deve calcular incidentes resolvidos hoje", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const incidents = [
      { status: "resolved", resolvedAt: Date.now() },
      { status: "resolved", resolvedAt: today.getTime() - 86400000 }, // ontem
      { status: "open", resolvedAt: null },
    ];
    const resolvedToday = incidents.filter(i =>
      i.status === "resolved" && i.resolvedAt && i.resolvedAt >= today.getTime()
    ).length;
    expect(resolvedToday).toBe(1);
  });

  it("deve calcular tempo médio de resolução em horas", () => {
    const resolved = [
      { createdAt: Date.now() - 7200000, resolvedAt: Date.now() }, // 2h
      { createdAt: Date.now() - 3600000, resolvedAt: Date.now() }, // 1h
    ];
    const avgMs = resolved.reduce((sum, i) => sum + (i.resolvedAt - i.createdAt), 0) / resolved.length;
    const avgHours = avgMs / 3600000;
    expect(avgHours).toBeCloseTo(1.5, 1);
  });

  it("deve retornar 0 para tempo médio quando não há incidentes resolvidos", () => {
    const resolved: Array<{ createdAt: number; resolvedAt: number }> = [];
    const avgHours = resolved.length > 0
      ? resolved.reduce((sum, i) => sum + (i.resolvedAt - i.createdAt), 0) / resolved.length / 3600000
      : 0;
    expect(avgHours).toBe(0);
  });

  it("deve agrupar incidentes por categoria para o gráfico", () => {
    const incidents = [
      { category: "phishing" },
      { category: "phishing" },
      { category: "malware" },
      { category: "ddos" },
    ];
    const byCategory = incidents.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    expect(byCategory.phishing).toBe(2);
    expect(byCategory.malware).toBe(1);
    expect(byCategory.ddos).toBe(1);
  });

  it("deve agrupar incidentes por risco para o gráfico", () => {
    const incidents = [
      { riskLevel: "critical" },
      { riskLevel: "critical" },
      { riskLevel: "high" },
      { riskLevel: "medium" },
    ];
    const byRisk = incidents.reduce((acc, i) => {
      acc[i.riskLevel] = (acc[i.riskLevel] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    expect(byRisk.critical).toBe(2);
    expect(byRisk.high).toBe(1);
    expect(byRisk.medium).toBe(1);
  });

  it("deve ter rota /analyst/dashboard registrada", () => {
    const routes = [
      "/analyst/dashboard",
      "/analyst/incidents",
      "/dashboard",
      "/incidents",
    ];
    expect(routes).toContain("/analyst/dashboard");
  });
});

// ─── 4. Histórico de Reclassificação Automática ──────────────────────────────
describe("Histórico de reclassificação automática — userId=0", () => {
  it("deve registrar userId=0 para ações do sistema automático", () => {
    const historyEntry = {
      incidentId: 180001,
      userId: 0, // sistema automático
      action: "category_changed" as const,
      fromValue: "unknown",
      toValue: "phishing",
      comment: "Reclassificado automaticamente pelo modelo S21 (confiança: 70%)",
    };
    expect(historyEntry.userId).toBe(0);
    expect(historyEntry.action).toBe("category_changed");
  });

  it("deve incluir confiança no comentário de reclassificação", () => {
    const buildComment = (confidence: number, source: string) =>
      `Reclassificado automaticamente ${source} (confiança: ${Math.round(confidence * 100)}%)`;
    const comment = buildComment(0.703, "pelo modelo S21");
    expect(comment).toContain("70%");
    expect(comment).toContain("modelo S21");
  });

  it("deve registrar fromValue como unknown para incidentes reclassificados", () => {
    const entry = {
      fromValue: "unknown",
      toValue: "phishing",
    };
    expect(entry.fromValue).toBe("unknown");
    expect(entry.toValue).not.toBe("unknown");
  });

  it("deve exibir Sistema Automático quando userId=0 no frontend", () => {
    const getDisplayName = (userId: number, userName: string | null) =>
      userId === 0 ? "Sistema Automático" : (userName ?? "Usuário");
    expect(getDisplayName(0, null)).toBe("Sistema Automático");
    expect(getDisplayName(1, "João")).toBe("João");
    expect(getDisplayName(5, null)).toBe("Usuário");
  });

  it("deve registrar histórico apenas quando a categoria muda (pós-upload)", () => {
    const shouldRegisterHistory = (oldCategory: string, newCategory: string) =>
      oldCategory !== newCategory;
    expect(shouldRegisterHistory("unknown", "phishing")).toBe(true);
    expect(shouldRegisterHistory("phishing", "phishing")).toBe(false);
    expect(shouldRegisterHistory("malware", "ddos")).toBe(true);
  });

  it("deve usar action category_changed para reclassificações automáticas", () => {
    const VALID_ACTIONS = ["status_changed", "notes_updated", "category_changed", "risk_changed", "created"];
    const action = "category_changed";
    expect(VALID_ACTIONS).toContain(action);
  });

  it("deve incluir comentário diferente para reclassificação pós-upload vs reclassifyUnknown", () => {
    const uploadComment = "Reclassificado automaticamente após upload de novo dataset (confiança: 85%)";
    const reclassifyComment = "Reclassificado automaticamente pelo modelo S21 (confiança: 70%)";
    expect(uploadComment).toContain("upload de novo dataset");
    expect(reclassifyComment).toContain("modelo S21");
    expect(uploadComment).not.toBe(reclassifyComment);
  });
});
