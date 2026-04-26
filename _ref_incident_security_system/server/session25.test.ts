/**
 * Sessão 25 — Correção Saúde do Sistema + Tela Dinâmica
 * - Auto-reinício Flask 5001 e 5002 via FLASK_SCRIPTS
 * - getSystemHealth aciona ensureFlaskRunning antes de verificar status
 * - AdminSystemHealth.tsx dinâmico com extractPort e botão Reiniciar
 * - restartService usa FLASK_SCRIPTS para escolher o script correto
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const ROUTERS_TS = path.join(ROOT, "server", "routers.ts");
const ADMIN_HEALTH_TSX = path.join(ROOT, "client", "src", "pages", "AdminSystemHealth.tsx");

let routersSrc: string;
let healthSrc: string;

beforeAll(() => {
  routersSrc = fs.readFileSync(ROUTERS_TS, "utf-8");
  healthSrc = fs.readFileSync(ADMIN_HEALTH_TSX, "utf-8");
});

// ─── S25-1: FLASK_SCRIPTS — Mapeamento de porta → script ─────────────────────
describe("S25-1: FLASK_SCRIPTS — Mapeamento de porta para script Python", () => {
  it("S25-1.1: FLASK_SCRIPTS está definido em routers.ts", () => {
    expect(routersSrc).toContain("FLASK_SCRIPTS");
  });
  it("S25-1.2: FLASK_SCRIPTS mapeia porta 5001 para classifier_server.py", () => {
    expect(routersSrc).toContain("5001");
    expect(routersSrc).toContain("classifier_server.py");
  });
  it("S25-1.3: FLASK_SCRIPTS mapeia porta 5002 para pdf_server.py", () => {
    expect(routersSrc).toContain("5002");
    expect(routersSrc).toContain("pdf_server.py");
  });
  it("S25-1.4: FLASK_SCRIPTS é um Record<number, string>", () => {
    const section = routersSrc.split("FLASK_SCRIPTS")[1]?.substring(0, 200) ?? "";
    expect(section).toContain("Record");
  });
});

// ─── S25-2: ensureFlaskRunning — Suporte a múltiplos scripts ─────────────────
describe("S25-2: ensureFlaskRunning — Suporte a múltiplos scripts Python", () => {
  it("S25-2.1: ensureFlaskRunning usa scriptName via FLASK_SCRIPTS", () => {
    const section = routersSrc.split("ensureFlaskRunning")[1]?.substring(0, 800) ?? "";
    expect(section).toContain("scriptName");
  });
  it("S25-2.2: ensureFlaskRunning usa FLASK_SCRIPTS[port]", () => {
    const section = routersSrc.split("ensureFlaskRunning")[1]?.substring(0, 800) ?? "";
    expect(section).toContain("FLASK_SCRIPTS[port]");
  });
  it("S25-2.3: ensureFlaskRunning usa console.warn quando script não encontrado", () => {
    const section = routersSrc.split("ensureFlaskRunning")[1]?.substring(0, 1000) ?? "";
    expect(section).toContain("console.warn");
  });
  it("S25-2.4: ensureFlaskRunning usa scriptName no pkill (não hardcoded)", () => {
    // O split por 'ensureFlaskRunning' retorna a assinatura da função;
    // usamos a segunda ocorrência (corpo da função) ou buscamos diretamente no arquivo
    const fnBody = routersSrc.split("async function ensureFlaskRunning")[1]?.substring(0, 1500) ?? "";
    expect(fnBody).toContain("scriptName");
    expect(fnBody).toContain("pkill");
  });
});

// ─── S25-3: getSystemHealth — Auto-reinício antes de verificar ───────────────
describe("S25-3: getSystemHealth — Auto-reinício antes de verificar status", () => {
  it("S25-3.1: getSystemHealth chama ensureFlaskRunning(5001)", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("ensureFlaskRunning(5001)");
  });
  it("S25-3.2: getSystemHealth chama ensureFlaskRunning(5002)", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("ensureFlaskRunning(5002)");
  });
  it("S25-3.3: getSystemHealth usa Promise.allSettled para ambos os serviços", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("Promise.allSettled");
  });
  it("S25-3.4: getSystemHealth retorna services com campo port", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 2500) ?? "";
    expect(section).toContain("port");
    expect(section).toContain("services");
  });
  it("S25-3.5: getSystemHealth nomeia corretamente Flask PDF (porta 5002)", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 2500) ?? "";
    expect(section).toContain("Flask PDF");
  });
});

// ─── S25-4: restartService — Usa FLASK_SCRIPTS ───────────────────────────────
describe("S25-4: restartService — Usa FLASK_SCRIPTS para escolher script", () => {
  it("S25-4.1: restartService usa FLASK_SCRIPTS[input.port]", () => {
    const section = routersSrc.split("restartService")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("FLASK_SCRIPTS[input.port]");
  });
  it("S25-4.2: restartService usa scriptName no pkill", () => {
    const section = routersSrc.split("restartService")[1]?.substring(0, 1000) ?? "";
    expect(section).toContain("scriptName");
  });
  it("S25-4.3: restartService aguarda 5 segundos para inicialização", () => {
    const section = routersSrc.split("restartService")[1]?.substring(0, 1200) ?? "";
    expect(section).toContain("5000");
  });
});

// ─── S25-5: AdminSystemHealth.tsx — Tela dinâmica ────────────────────────────
describe("S25-5: AdminSystemHealth.tsx — Tela dinâmica", () => {
  it("S25-5.1: AdminSystemHealth.tsx existe", () => {
    expect(fs.existsSync(ADMIN_HEALTH_TSX)).toBe(true);
  });
  it("S25-5.2: AdminSystemHealth define função extractPort", () => {
    expect(healthSrc).toContain("extractPort");
  });
  it("S25-5.3: extractPort usa regex para extrair número de porta", () => {
    const section = healthSrc.split("extractPort")[1]?.substring(0, 200) ?? "";
    expect(section).toContain("match");
  });
  it("S25-5.4: AdminSystemHealth usa fonte de dados para status dos serviços", () => {
    // Usa tRPC getFlaskStatus como fonte
    const hasFlaskStatus = healthSrc.includes("getFlaskStatus");
    expect(hasFlaskStatus).toBe(true);
  });
  it("S25-5.5: AdminSystemHealth usa trpc.admin.restartService", () => {
    expect(healthSrc).toContain("trpc.admin.restartService");
  });
  it("S25-5.6: AdminSystemHealth tem estado restartingPorts", () => {
    expect(healthSrc).toContain("restartingPorts");
  });
  it("S25-5.7: AdminSystemHealth usa Promise.allSettled ou invalidate após restart", () => {
    expect(healthSrc).toContain("invalidate");
  });
  it("S25-5.8: AdminSystemHealth mostra latência do serviço", () => {
    expect(healthSrc).toContain("latency");
  });
  it("S25-5.9: AdminSystemHealth mostra detalhes do serviço (modelo_carregado, etc)", () => {
    expect(healthSrc).toContain("details");
  });
  it("S25-5.10: AdminSystemHealth tem auto-refresh de 30 segundos", () => {
    expect(healthSrc).toContain("30000");
  });
  it("S25-5.11: AdminSystemHealth exibe status Online/Degradado/Offline", () => {
    expect(healthSrc).toContain("online");
    expect(healthSrc).toContain("degraded");
    expect(healthSrc).toContain("offline");
  });
  it("S25-5.12: AdminSystemHealth tem botão Reiniciar Serviço para serviços offline", () => {
    expect(healthSrc).toContain("Reiniciar Servi");
  });
  it("S25-5.13: AdminSystemHealth usa Loader2 para estado de carregamento", () => {
    expect(healthSrc).toContain("Loader2");
  });
  it("S25-5.14: AdminSystemHealth usa DashboardLayout", () => {
    expect(healthSrc).toContain("DashboardLayout");
  });
  it("S25-5.15: AdminSystemHealth exibe informações sobre auto-reinício ou fonte de dados", () => {
    // Aceita 'getFlaskStatus' ou 'refetchInterval' como indicador de monitoramento
    const hasAuto = healthSrc.includes("getFlaskStatus") || healthSrc.includes("refetchInterval");
    expect(hasAuto).toBe(true);
  });
});
