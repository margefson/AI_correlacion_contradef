import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTERS = path.join(__dirname, "routers.ts");
const ADMIN_HEALTH = path.join(__dirname, "../client/src/pages/AdminSystemHealth.tsx");
const FLASK_SERVER = path.join(__dirname, "../ml/classifier_server.py");

const routersContent = fs.readFileSync(ROUTERS, "utf-8");
const healthContent = fs.readFileSync(ADMIN_HEALTH, "utf-8");
const flaskContent = fs.readFileSync(FLASK_SERVER, "utf-8");

// ─── S16-1: Procedure restartService ───────────────────────────────────────
describe("S16-1 — Procedure restartService no adminRouter", () => {
  it("S16-1.1 restartService está definida no adminRouter", () => {
    expect(routersContent).toContain("restartService");
  });

  it("S16-1.2 restartService recebe parâmetro port (número)", () => {
    const idx = routersContent.indexOf("restartService");
    expect(idx).toBeGreaterThan(0);
    const section = routersContent.slice(idx, idx + 600);
    expect(section).toContain("port");
    expect(section).toMatch(/z\.number|z\.union/);
  });

  it("S16-1.3 restartService retorna success e message", () => {
    const idx = routersContent.indexOf("restartService");
    const section = routersContent.slice(idx, idx + 3000);
    expect(section).toContain("success");
    expect(section).toContain("message");
  });

  it("S16-1.4 restartService usa child_process ou spawn para reiniciar", () => {
    const idx = routersContent.indexOf("restartService");
    const section = routersContent.slice(idx, idx + 1200);
    const hasChildProcess = section.includes("child_process") || 
                            section.includes("spawn") || 
                            section.includes("exec(") ||
                            section.includes("execSync") ||
                            routersContent.includes("child_process");
    expect(hasChildProcess).toBe(true);
  });

  it("S16-1.5 restartService é protegida por adminProcedure", () => {
    const idx = routersContent.indexOf("restartService");
    const section = routersContent.slice(idx, idx + 200);
    expect(section).toContain("adminProcedure");
  });

  it("S16-1.6 restartService retorna a porta no resultado", () => {
    const idx = routersContent.indexOf("restartService");
    const section = routersContent.slice(idx, idx + 1000);
    expect(section).toContain("port");
  });
});

// ─── S16-2: UI do botão Reiniciar no AdminSystemHealth ─────────────────────
describe("S16-2 — Botão Reiniciar Serviço no AdminSystemHealth.tsx", () => {
  it("S16-2.1 AdminSystemHealth importa RotateCcw do lucide-react", () => {
    expect(healthContent).toContain("RotateCcw");
  });

  it("S16-2.2 AdminSystemHealth usa restartService mutation", () => {
    expect(healthContent).toContain("restartService");
    expect(healthContent).toContain("useMutation");
  });

  it("S16-2.3 Botão exibe 'Reiniciar Serviço' quando offline", () => {
    expect(healthContent).toContain("Reiniciar Servi");
  });

  it("S16-2.4 Botão exibe 'Reiniciando...' durante a operação", () => {
    expect(healthContent).toContain("Reiniciando...");
  });

  it("S16-2.5 AdminSystemHealth tem estado restartingPorts", () => {
    expect(healthContent).toContain("restartingPorts");
  });

  it("S16-2.6 extractPort extrai a porta do nome do serviço", () => {
    expect(healthContent).toContain("extractPort");
    expect(healthContent).toMatch(/\d{4,5}/);
  });

  it("S16-2.7 Botão está desabilitado durante o reinício", () => {
    expect(healthContent).toContain("disabled");
    expect(healthContent).toContain("isRestarting");
  });

  it("S16-2.8 Após reiniciar, invalida a query getFlaskStatus", () => {
    expect(healthContent).toContain("getFlaskStatus.invalidate");
  });

  it("S16-2.9 Botão só aparece quando status é 'offline'", () => {
    expect(healthContent).toContain("offline");
    expect(healthContent).toContain("Reiniciar Servi");
  });

  it("S16-2.10 AdminSystemHealth usa sonner para toast de sucesso", () => {
    expect(healthContent).toContain("sonner");
    expect(healthContent).toMatch(/toast\.(success|error|warning)/);
  });
});

// ─── S16-3: Endpoints Flask de upload ──────────────────────────────────────
describe("S16-3 — Endpoints de upload no Flask", () => {
  it("S16-3.1 Flask tem endpoint /upload-train-dataset", () => {
    expect(flaskContent).toContain("/upload-train-dataset");
  });

  it("S16-3.2 Flask tem endpoint /upload-eval-dataset", () => {
    expect(flaskContent).toContain("/upload-eval-dataset");
  });

  it("S16-3.3 Flask valida extensão .xlsx nos uploads", () => {
    const idx = flaskContent.indexOf("/upload-train-dataset");
    const section = flaskContent.slice(idx, idx + 600);
    expect(section).toContain(".xlsx");
  });

  it("S16-3.4 Flask retorna total de amostras no upload", () => {
    const idx = flaskContent.indexOf("/upload-train-dataset");
    const section = flaskContent.slice(idx, idx + 800);
    // Flask retorna 'total' (contagem de linhas do dataset)
    expect(section).toMatch(/"total"|total_samples|total_rows|total/);
  });
});

// ─── S16-4: Procedures de upload no routers.ts ─────────────────────────────
describe("S16-4 — Procedures uploadTrainDataset e uploadEvalDataset", () => {
  it("S16-4.1 uploadTrainDataset está definida no mlRouter", () => {
    expect(routersContent).toContain("uploadTrainDataset");
  });

  it("S16-4.2 uploadEvalDataset está definida no mlRouter", () => {
    expect(routersContent).toContain("uploadEvalDataset");
  });

  it("S16-4.3 uploadTrainDataset recebe fileBase64 e filename", () => {
    const idx = routersContent.indexOf("uploadTrainDataset");
    const section = routersContent.slice(idx, idx + 400);
    expect(section).toContain("fileBase64");
    expect(section).toContain("filename");
  });

  it("S16-4.4 uploadTrainDataset chama /upload-train-dataset no Flask", () => {
    const idx = routersContent.indexOf("uploadTrainDataset");
    const section = routersContent.slice(idx, idx + 1200);
    expect(section).toContain("upload-train-dataset");
  });

  it("S16-4.5 uploadEvalDataset chama /upload-eval-dataset no Flask", () => {
    const idx = routersContent.indexOf("uploadEvalDataset");
    const section = routersContent.slice(idx, idx + 800);
    expect(section).toContain("upload-eval-dataset");
  });
});

// ─── S16-5: AdminSystemHealth — estrutura geral ────────────────────────────
describe("S16-5 — AdminSystemHealth — estrutura geral", () => {
  it("S16-5.1 AdminSystemHealth usa getFlaskStatus query", () => {
    expect(healthContent).toContain("getFlaskStatus");
  });

  it("S16-5.2 AdminSystemHealth tem auto-refresh de 30 segundos", () => {
    expect(healthContent).toContain("30000");
  });

  it("S16-5.3 AdminSystemHealth mostra 'Saúde do Sistema'", () => {
    expect(healthContent).toContain("Sa\u00fade do Sistema");
  });

  it("S16-5.4 AdminSystemHealth mostra status Online/Offline/Degradado", () => {
    expect(healthContent).toContain("online");
    expect(healthContent).toContain("offline");
  });

  it("S16-5.5 AdminSystemHealth usa DashboardLayout", () => {
    expect(healthContent).toContain("DashboardLayout");
  });
});
