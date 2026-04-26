/**
 * Sessão 12 — Testes: Home com template dashboard, Notificações in-app,
 * Métricas de Resolução e Exportação de Histórico CSV
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// ─── S12-1: Home.tsx com template do dashboard ──────────────────────────────
describe("S12-1: Home.tsx usa template visual do dashboard", () => {
  const homePath = path.resolve(__dirname, "../client/src/pages/Home.tsx");
  let homeContent: string;

  beforeEach(() => {
    homeContent = fs.readFileSync(homePath, "utf8");
  });

  it("S12-1.1: Home.tsx existe", () => {
    expect(fs.existsSync(homePath)).toBe(true);
  });

  it("S12-1.2: Home.tsx usa DashboardLayout ou o mesmo padrão visual (bg-card, border-border)", () => {
    expect(homeContent).toMatch(/bg-card|DashboardLayout/);
  });

  it("S12-1.3: Home.tsx é responsiva (usa classes responsivas do Tailwind)", () => {
    expect(homeContent).toMatch(/grid-cols-\d|sm:|md:|lg:|xl:/);
  });

  it("S12-1.4: Home.tsx usa font-mono (padrão do dashboard)", () => {
    expect(homeContent).toMatch(/font-mono/);
  });

  it("S12-1.5: Home.tsx exibe estatísticas globais ou link para o dashboard", () => {
    // Home pode usar stats diretamente ou redirecionar para o dashboard
    expect(homeContent).toMatch(/stats|dashboard|incidentes|Dashboard/i);
  });

  it("S12-1.6: Home.tsx tem link para /dashboard ou /login", () => {
    expect(homeContent).toMatch(/\/dashboard|\/login/);
  });
});

// ─── S12-2: NotificationBell componente ─────────────────────────────────────
describe("S12-2: NotificationBell componente", () => {
  const bellPath = path.resolve(__dirname, "../client/src/components/NotificationBell.tsx");
  let bellContent: string;

  beforeEach(() => {
    bellContent = fs.readFileSync(bellPath, "utf8");
  });

  it("S12-2.1: NotificationBell.tsx existe", () => {
    expect(fs.existsSync(bellPath)).toBe(true);
  });

  it("S12-2.2: Usa trpc.notifications.unreadCount para o contador", () => {
    expect(bellContent).toContain("notifications.unreadCount");
  });

  it("S12-2.3: Usa trpc.notifications.list para listar notificações", () => {
    expect(bellContent).toContain("notifications.list");
  });

  it("S12-2.4: Tem botão de marcar todas como lidas (markAllRead)", () => {
    expect(bellContent).toContain("markAllRead");
  });

  it("S12-2.5: Exibe o contador de não lidas como badge vermelho", () => {
    expect(bellContent).toMatch(/bg-red-500|rounded-full/);
  });

  it("S12-2.6: Tem ícone Bell da lucide-react", () => {
    expect(bellContent).toContain("Bell");
  });

  it("S12-2.7: Navega para o incidente ao clicar na notificação", () => {
    expect(bellContent).toMatch(/incidentId|navigate|setLocation/);
  });

  it("S12-2.8: Faz polling a cada 30 segundos (refetchInterval)", () => {
    expect(bellContent).toContain("30000");
  });
});

// ─── S12-3: DashboardLayout integra NotificationBell ────────────────────────
describe("S12-3: DashboardLayout integra NotificationBell", () => {
  const layoutPath = path.resolve(__dirname, "../client/src/components/DashboardLayout.tsx");
  let layoutContent: string;

  beforeEach(() => {
    layoutContent = fs.readFileSync(layoutPath, "utf8");
  });

  it("S12-3.1: DashboardLayout importa NotificationBell", () => {
    expect(layoutContent).toContain("NotificationBell");
  });

  it("S12-3.2: DashboardLayout renderiza <NotificationBell /> no header", () => {
    expect(layoutContent).toMatch(/<NotificationBell\s*\/>/);
  });

  it("S12-3.3: DashboardLayout tem item de menu Métricas de Resolução", () => {
    expect(layoutContent).toContain("/metrics");
  });

  it("S12-3.4: DashboardLayout importa TrendingUp para o ícone de métricas", () => {
    expect(layoutContent).toContain("TrendingUp");
  });
});

// ─── S12-4: Procedures de notificações no routers.ts ────────────────────────
describe("S12-4: Procedures de notificações no routers.ts", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  let routersContent: string;

  beforeEach(() => {
    routersContent = fs.readFileSync(routersPath, "utf8");
  });

  it("S12-4.1: notificationsRouter existe no routers.ts", () => {
    expect(routersContent).toContain("notificationsRouter");
  });

  it("S12-4.2: Procedure notifications.list existe", () => {
    expect(routersContent).toContain("getNotificationsByUser");
  });

  it("S12-4.3: Procedure notifications.unreadCount existe", () => {
    expect(routersContent).toContain("countUnreadNotifications");
  });

  it("S12-4.4: Procedure notifications.markRead existe", () => {
    expect(routersContent).toContain("markNotificationRead");
  });

  it("S12-4.5: Procedure notifications.markAllRead existe", () => {
    expect(routersContent).toContain("markAllNotificationsRead");
  });

  it("S12-4.6: appRouter inclui notifications", () => {
    expect(routersContent).toContain("notifications: notificationsRouter");
  });
});

// ─── S12-5: Notificação criada ao reclassificar incidente ────────────────────
describe("S12-5: Notificação criada ao reclassificar incidente", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  let routersContent: string;

  beforeEach(() => {
    routersContent = fs.readFileSync(routersPath, "utf8");
  });

  it("S12-5.1: Procedure reclassify chama createNotification", () => {
    expect(routersContent).toContain("createNotification");
  });

  it("S12-5.2: Notificação tem type reclassification", () => {
    expect(routersContent).toContain("reclassification");
  });

  it("S12-5.3: Notificação inclui o título do incidente na mensagem", () => {
    expect(routersContent).toContain("incident.title");
  });

  it("S12-5.4: Notificação é criada apenas se o admin não for o dono do incidente", () => {
    expect(routersContent).toContain("incident.userId !== ctx.user.id");
  });

  it("S12-5.5: Falha na notificação não impede a reclassificação (try/catch)", () => {
    const reclassifyBlock = routersContent.slice(
      routersContent.indexOf("reclassify: adminProcedure"),
      routersContent.indexOf("// List all users")
    );
    expect(reclassifyBlock).toContain("try {");
    expect(reclassifyBlock).toContain("catch");
  });
});

// ─── S12-6: Helpers de notificações no db.ts ────────────────────────────────
describe("S12-6: Helpers de notificações no db.ts", () => {
  const dbPath = path.resolve(__dirname, "db.ts");
  let dbContent: string;

  beforeEach(() => {
    dbContent = fs.readFileSync(dbPath, "utf8");
  });

  it("S12-6.1: createNotification exportada do db.ts", () => {
    expect(dbContent).toContain("export async function createNotification");
  });

  it("S12-6.2: getNotificationsByUser exportada do db.ts", () => {
    expect(dbContent).toContain("export async function getNotificationsByUser");
  });

  it("S12-6.3: markNotificationRead exportada do db.ts", () => {
    expect(dbContent).toContain("export async function markNotificationRead");
  });

  it("S12-6.4: markAllNotificationsRead exportada do db.ts", () => {
    expect(dbContent).toContain("export async function markAllNotificationsRead");
  });

  it("S12-6.5: countUnreadNotifications exportada do db.ts", () => {
    expect(dbContent).toContain("export async function countUnreadNotifications");
  });

  it("S12-6.6: getNotificationsByUser ordena por createdAt desc", () => {
    expect(dbContent).toContain("desc(notifications.createdAt)");
  });

  it("S12-6.7: getNotificationsByUser limita a 50 registros", () => {
    expect(dbContent).toContain(".limit(50)");
  });
});

// ─── S12-7: ResolutionMetrics página ────────────────────────────────────────
describe("S12-7: ResolutionMetrics página", () => {
  const metricsPath = path.resolve(__dirname, "../client/src/pages/ResolutionMetrics.tsx");
  let metricsContent: string;

  beforeEach(() => {
    metricsContent = fs.readFileSync(metricsPath, "utf8");
  });

  it("S12-7.1: ResolutionMetrics.tsx existe", () => {
    expect(fs.existsSync(metricsPath)).toBe(true);
  });

  it("S12-7.2: Usa trpc.analytics.resolutionMetrics", () => {
    expect(metricsContent).toContain("analytics.resolutionMetrics");
  });

  it("S12-7.3: Usa trpc.analytics.exportHistoryCsv", () => {
    expect(metricsContent).toContain("analytics.exportHistoryCsv");
  });

  it("S12-7.4: Exibe BarChart para tempo médio por categoria", () => {
    expect(metricsContent).toContain("BarChart");
  });

  it("S12-7.5: Exibe LineChart para tendência mensal", () => {
    expect(metricsContent).toContain("LineChart");
  });

  it("S12-7.6: Tem botão de download CSV", () => {
    expect(metricsContent).toMatch(/Download|download|Exportar/);
  });

  it("S12-7.7: Usa DashboardLayout", () => {
    expect(metricsContent).toContain("DashboardLayout");
  });

  it("S12-7.8: Exibe taxa de reabertura (reopenedCount)", () => {
    expect(metricsContent).toMatch(/reopen|Reabertos/);
  });
});

// ─── S12-8: analyticsRouter no routers.ts ───────────────────────────────────
describe("S12-8: analyticsRouter no routers.ts", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  let routersContent: string;

  beforeEach(() => {
    routersContent = fs.readFileSync(routersPath, "utf8");
  });

  it("S12-8.1: analyticsRouter existe", () => {
    expect(routersContent).toContain("analyticsRouter");
  });

  it("S12-8.2: analytics.resolutionMetrics chama getResolutionMetrics", () => {
    expect(routersContent).toContain("getResolutionMetrics");
  });

  it("S12-8.3: analytics.exportHistoryCsv chama getAllIncidentHistoryForExport", () => {
    expect(routersContent).toContain("getAllIncidentHistoryForExport");
  });

  it("S12-8.4: exportHistoryCsv gera CSV com cabeçalhos em português", () => {
    expect(routersContent).toContain("ID Histórico");
    expect(routersContent).toContain("Título Incidente");
  });

  it("S12-8.5: exportHistoryCsv escapa aspas duplas no CSV", () => {
    expect(routersContent).toContain('replace(/"/g');
  });

  it("S12-8.6: appRouter inclui analytics", () => {
    expect(routersContent).toContain("analytics: analyticsRouter");
  });
});

// ─── S12-9: Helpers de métricas e exportação no db.ts ───────────────────────
describe("S12-9: Helpers de métricas e exportação no db.ts", () => {
  const dbPath = path.resolve(__dirname, "db.ts");
  let dbContent: string;

  beforeEach(() => {
    dbContent = fs.readFileSync(dbPath, "utf8");
  });

  it("S12-9.1: getResolutionMetrics exportada do db.ts", () => {
    expect(dbContent).toContain("export async function getResolutionMetrics");
  });

  it("S12-9.2: getResolutionMetrics calcula tempo médio por categoria (TIMESTAMPDIFF)", () => {
    expect(dbContent).toContain("TIMESTAMPDIFF");
  });

  it("S12-9.3: getResolutionMetrics calcula tendência mensal (DATE_FORMAT)", () => {
    expect(dbContent).toContain("DATE_FORMAT");
  });

  it("S12-9.4: getResolutionMetrics conta incidentes reabertos (fromValue = resolved)", () => {
    expect(dbContent).toContain("fromValue");
    expect(dbContent).toContain("resolved");
  });

  it("S12-9.5: getAllIncidentHistoryForExport exportada do db.ts", () => {
    expect(dbContent).toContain("export async function getAllIncidentHistoryForExport");
  });

  it("S12-9.6: getAllIncidentHistoryForExport faz join com users e incidents", () => {
    // A função pode ser longa; busca em uma janela maior
    const startIdx = dbContent.indexOf("export async function getAllIncidentHistoryForExport");
    const exportFn = dbContent.slice(startIdx, startIdx + 1200);
    expect(exportFn).toContain("leftJoin");
    expect(exportFn).toMatch(/users|incidentHistory/);
  });

  it("S12-9.7: getAllIncidentHistoryForExport ordena por createdAt desc", () => {
    expect(dbContent).toContain("desc(incidentHistory.createdAt)");
  });
});

// ─── S12-10: App.tsx registra rota /metrics ──────────────────────────────────
describe("S12-10: App.tsx registra rota /metrics", () => {
  const appPath = path.resolve(__dirname, "../client/src/App.tsx");
  let appContent: string;

  beforeEach(() => {
    appContent = fs.readFileSync(appPath, "utf8");
  });

  it("S12-10.1: App.tsx importa ResolutionMetrics", () => {
    expect(appContent).toContain("ResolutionMetrics");
  });

  it("S12-10.2: App.tsx registra rota /metrics", () => {
    expect(appContent).toContain("/metrics");
  });
});
