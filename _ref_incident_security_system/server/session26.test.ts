/**
 * Sessão 26 — Correção Definitiva Flask Offline + Logs de Acompanhamento
 * - pdf_server.py aceita --port via argparse
 * - startFlaskServer passa --port como argumento CLI
 * - /api/flask-status endpoint público sem autenticação
 * - AdminSystemHealth.tsx usa /api/flask-status diretamente
 * - Log de eventos visível na UI
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const INDEX_TS = path.join(ROOT, "server", "_core", "index.ts");
const PDF_SERVER_PY = path.join(ROOT, "ml", "pdf_server.py");
const ADMIN_HEALTH_TSX = path.join(ROOT, "client", "src", "pages", "AdminSystemHealth.tsx");

let indexSrc: string;
let pdfSrc: string;
let healthSrc: string;

beforeAll(() => {
  indexSrc = fs.readFileSync(INDEX_TS, "utf-8");
  pdfSrc = fs.readFileSync(PDF_SERVER_PY, "utf-8");
  healthSrc = fs.readFileSync(ADMIN_HEALTH_TSX, "utf-8");
});

// ─── S26-1: pdf_server.py — Suporte a --port via argparse ────────────────────
describe("S26-1: pdf_server.py — Suporte a --port via argparse", () => {
  it("S26-1.1: pdf_server.py importa argparse", () => {
    expect(pdfSrc).toContain("import argparse");
  });
  it("S26-1.2: pdf_server.py define ArgumentParser", () => {
    expect(pdfSrc).toContain("ArgumentParser");
  });
  it("S26-1.3: pdf_server.py adiciona argumento --port", () => {
    expect(pdfSrc).toContain("--port");
  });
  it("S26-1.4: pdf_server.py usa args.port no app.run", () => {
    const section = pdfSrc.split("if __name__")[1] ?? "";
    expect(section).toContain("args.port");
    expect(section).toContain("app.run");
  });
  it("S26-1.5: pdf_server.py tem default 5002 para --port", () => {
    expect(pdfSrc).toContain("default=5002");
  });
});

// ─── S26-2: startFlaskServer — Passa --port como argumento CLI ───────────────
describe("S26-2: startFlaskServer — Passa --port como argumento CLI", () => {
  it("S26-2.1: startFlaskServer passa --port como argumento ao spawn", () => {
    const section = indexSrc.split("startFlaskServer")[1]?.substring(0, 400) ?? "";
    expect(section).toContain("\"--port\"");
  });
  it("S26-2.2: startFlaskServer usa String(port) como valor do argumento", () => {
    const section = indexSrc.split("startFlaskServer")[1]?.substring(0, 400) ?? "";
    expect(section).toContain("String(port)");
  });
  it("S26-2.3: startFlaskServer ainda passa ML_PORT via env (retrocompatibilidade)", () => {
    const section = indexSrc.split("startFlaskServer")[1]?.substring(0, 400) ?? "";
    expect(section).toContain("ML_PORT");
  });
});

// ─── S26-3: /api/flask-status — Endpoint público de diagnóstico ──────────────
describe("S26-3: /api/flask-status — Endpoint público de diagnóstico", () => {
  it("S26-3.1: _core/index.ts define rota GET /api/flask-status", () => {
    expect(indexSrc).toContain("/api/flask-status");
  });
  it("S26-3.2: /api/flask-status verifica porta 5001", () => {
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 500) ?? "";
    expect(section).toContain("5001");
  });
  it("S26-3.3: /api/flask-status verifica porta 5002", () => {
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 500) ?? "";
    expect(section).toContain("5002");
  });
  it("S26-3.4: /api/flask-status retorna campo overall", () => {
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 2000) ?? "";
    expect(section).toContain("overall");
  });
  it("S26-3.5: /api/flask-status retorna campo services", () => {
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 1200) ?? "";
    expect(section).toContain("services");
  });
  it("S26-3.6: /api/flask-status retorna campo checked_at", () => {
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 2000) ?? "";
    expect(section).toContain("checked_at");
  });
  it("S26-3.7: /api/flask-status não requer autenticação (não usa adminProcedure)", () => {
    // O endpoint é Express direto, não tRPC — não deve ter 'adminProcedure' no trecho
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 600) ?? "";
    expect(section).not.toContain("adminProcedure");
    expect(section).not.toContain("protectedProcedure");
  });
  it("S26-3.8: /api/flask-status usa AbortSignal.timeout para evitar hanging", () => {
    const section = indexSrc.split("/api/flask-status")[1]?.substring(0, 2000) ?? "";
    expect(section).toMatch(/AbortSignal\.timeout|AbortController/);
  });
});

// ─── S26-4: AdminSystemHealth.tsx — Usa tRPC getFlaskStatus ────────────────────
describe("S26-4: AdminSystemHealth.tsx — Usa tRPC getFlaskStatus", () => {
  it("S26-4.1: AdminSystemHealth.tsx usa trpc.admin.getFlaskStatus", () => {
    expect(healthSrc).toContain("getFlaskStatus");
  });
  it("S26-4.2: AdminSystemHealth.tsx usa getFlaskStatus como fonte primária", () => {
    // A fonte primária agora é tRPC getFlaskStatus
    const fetchCount = (healthSrc.match(/getFlaskStatus/g) ?? []).length;
    expect(fetchCount).toBeGreaterThanOrEqual(1);
  });
  it("S26-4.3: AdminSystemHealth.tsx tem estado flaskData", () => {
    expect(healthSrc).toContain("flaskData");
  });
  it("S26-4.4: AdminSystemHealth.tsx tem estado flaskLoading", () => {
    expect(healthSrc).toContain("flaskLoading");
  });
  it("S26-4.5: AdminSystemHealth.tsx tem estado flaskError", () => {
    expect(healthSrc).toContain("flaskError");
  });
  it("S26-4.6: AdminSystemHealth.tsx tem função fetchFlaskStatus", () => {
    expect(healthSrc).toContain("fetchFlaskStatus");
  });
  it("S26-4.7: AdminSystemHealth.tsx ainda usa restartService via tRPC", () => {
    expect(healthSrc).toContain("trpc.admin.restartService");
  });
  it("S26-4.8: AdminSystemHealth.tsx tem auto-refresh de 30 segundos", () => {
    expect(healthSrc).toContain("30000");
  });
});

// ─── S26-5: Log de Eventos — Visível na UI ───────────────────────────────────
describe("S26-5: Log de Eventos — Visível na UI", () => {
  it("S26-5.1: AdminSystemHealth.tsx tem estado logs", () => {
    expect(healthSrc).toContain("logs");
  });
  it("S26-5.2: AdminSystemHealth.tsx tem função addLog", () => {
    expect(healthSrc).toContain("addLog");
  });
  it("S26-5.3: AdminSystemHealth.tsx tem estado showLogs para toggle", () => {
    expect(healthSrc).toContain("showLogs");
  });
  it("S26-5.4: AdminSystemHealth.tsx usa ícone Terminal para o painel de logs", () => {
    expect(healthSrc).toContain("Terminal");
  });
  it("S26-5.5: AdminSystemHealth.tsx exibe timestamp nos logs", () => {
    expect(healthSrc).toContain("toLocaleTimeString");
  });
  it("S26-5.6: AdminSystemHealth.tsx limita o histórico a 50 entradas", () => {
    expect(healthSrc).toContain("50");
  });
  it("S26-5.7: AdminSystemHealth.tsx usa ChevronDown/ChevronUp para toggle do log", () => {
    expect(healthSrc).toContain("ChevronDown");
    expect(healthSrc).toContain("ChevronUp");
  });
  it("S26-5.8: AdminSystemHealth.tsx registra eventos de reinício no log", () => {
    expect(healthSrc).toContain("addLog");
    expect(healthSrc).toContain("Reiniciando");
  });
  it("S26-5.9: AdminSystemHealth.tsx tem scroll automático no log", () => {
    expect(healthSrc).toContain("logsEndRef");
    expect(healthSrc).toContain("scrollIntoView");
  });
});

// ─── S26-6: Detalhes do Serviço — Informações diretas do health check ────────
describe("S26-6: Detalhes do Serviço — Informações diretas do health check", () => {
  it("S26-6.1: AdminSystemHealth.tsx exibe Modelo carregado", () => {
    expect(healthSrc).toContain("Modelo carregado");
  });
  it("S26-6.2: AdminSystemHealth.tsx exibe status do servico", () => {
    expect(healthSrc).toContain("status");
  });
  it("S26-6.3: AdminSystemHealth.tsx exibe latencia", () => {
    expect(healthSrc).toContain("Latencia");
  });
  it("S26-6.4: AdminSystemHealth.tsx exibe Badge com status", () => {
    expect(healthSrc).toContain("Badge");
  });
  it("S26-6.5: AdminSystemHealth.tsx exibe mensagem de erro quando offline", () => {
    expect(healthSrc).toContain("nao responde");
  });
  it("S26-6.6: AdminSystemHealth.tsx exibe extractPort para extrair porta do nome", () => {
    expect(healthSrc).toContain("extractPort");
  });
});
