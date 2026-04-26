/**
 * Sessão 15 — Testes de Integração
 * Upload de Dataset, Dashboard de Saúde, Paginação de Incidentes, PDF com Filtros
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const FLASK_SRC = path.join(ROOT, "ml", "classifier_server.py");
const ROUTERS_TS = path.join(ROOT, "server", "routers.ts");
const DB_TS = path.join(ROOT, "server", "db.ts");
const ADMIN_ML_TSX = path.join(ROOT, "client", "src", "pages", "AdminML.tsx");
const ADMIN_INCIDENTS_TSX = path.join(ROOT, "client", "src", "pages", "AdminIncidents.tsx");
const ADMIN_HEALTH_TSX = path.join(ROOT, "client", "src", "pages", "AdminSystemHealth.tsx");
const EXPORT_PDF_FILTERS_TSX = path.join(ROOT, "client", "src", "components", "ExportPdfWithFilters.tsx");
const APP_TSX = path.join(ROOT, "client", "src", "App.tsx");
const DASHBOARD_LAYOUT_TSX = path.join(ROOT, "client", "src", "components", "DashboardLayout.tsx");

let flaskSrc: string;
let routersSrc: string;
let dbSrc: string;
let adminMLSrc: string;
let adminIncidentsSrc: string;
let adminHealthSrc: string;
let exportPdfFiltersSrc: string;
let appSrc: string;
let dashboardLayoutSrc: string;

beforeAll(() => {
  flaskSrc = fs.readFileSync(FLASK_SRC, "utf-8");
  routersSrc = fs.readFileSync(ROUTERS_TS, "utf-8");
  dbSrc = fs.readFileSync(DB_TS, "utf-8");
  adminMLSrc = fs.readFileSync(ADMIN_ML_TSX, "utf-8");
  adminIncidentsSrc = fs.readFileSync(ADMIN_INCIDENTS_TSX, "utf-8");
  adminHealthSrc = fs.readFileSync(ADMIN_HEALTH_TSX, "utf-8");
  exportPdfFiltersSrc = fs.readFileSync(EXPORT_PDF_FILTERS_TSX, "utf-8");
  appSrc = fs.readFileSync(APP_TSX, "utf-8");
  dashboardLayoutSrc = fs.readFileSync(DASHBOARD_LAYOUT_TSX, "utf-8");
});

// S15-1: Upload de Dataset — Flask
describe("S15-1: Upload de Dataset — Flask", () => {
  it("S15-1.1: Flask define endpoint /upload-train-dataset", () => {
    expect(flaskSrc).toContain('"/upload-train-dataset"');
  });
  it("S15-1.2: Flask define endpoint /upload-eval-dataset", () => {
    expect(flaskSrc).toContain('"/upload-eval-dataset"');
  });
  it("S15-1.3: /upload-train-dataset aceita apenas .xlsx", () => {
    const section = flaskSrc.split('"/upload-train-dataset"')[1]?.split("@app.route")[0] ?? "";
    expect(section).toContain(".xlsx");
  });
  it("S15-1.4: /upload-eval-dataset aceita apenas .xlsx", () => {
    const section = flaskSrc.split('"/upload-eval-dataset"')[1]?.split("@app.route")[0] ?? "";
    expect(section).toContain(".xlsx");
  });
  it("S15-1.5: /upload-train-dataset salva em TRAIN_DATASET_PATH", () => {
    const section = flaskSrc.split('"/upload-train-dataset"')[1]?.split("@app.route")[0] ?? "";
    expect(section).toContain("TRAIN_DATASET_PATH");
  });
  it("S15-1.6: /upload-eval-dataset salva em EVAL_DATASET_PATH", () => {
    const section = flaskSrc.split('"/upload-eval-dataset"')[1]?.split("@app.route")[0] ?? "";
    expect(section).toContain("EVAL_DATASET_PATH");
  });
  it("S15-1.7: /upload-train-dataset usa POST", () => {
    expect(flaskSrc).toContain('"/upload-train-dataset", methods=["POST"]');
  });
  it("S15-1.8: /upload-eval-dataset usa POST", () => {
    expect(flaskSrc).toContain('"/upload-eval-dataset", methods=["POST"]');
  });
  it("S15-1.9: /upload-train-dataset retorna total_samples", () => {
    const section = flaskSrc.split('"/upload-train-dataset"')[1]?.split("@app.route")[0] ?? "";
    expect(section).toContain("total_samples");
  });
  it("S15-1.10: /upload-eval-dataset retorna total_samples", () => {
    const section = flaskSrc.split('"/upload-eval-dataset"')[1]?.split("@app.route")[0] ?? "";
    expect(section).toContain("total_samples");
  });
});

// S15-2: Upload de Dataset — Backend Node.js
describe("S15-2: Upload de Dataset — Backend Node.js", () => {
  it("S15-2.1: routers.ts define procedure uploadTrainDataset", () => {
    expect(routersSrc).toContain("uploadTrainDataset");
  });
  it("S15-2.2: routers.ts define procedure uploadEvalDataset", () => {
    expect(routersSrc).toContain("uploadEvalDataset");
  });
  it("S15-2.3: uploadTrainDataset usa adminProcedure", () => {
    const section = routersSrc.split("uploadTrainDataset")[1]?.substring(0, 200) ?? "";
    expect(section).toContain("adminProcedure");
  });
  it("S15-2.4: uploadEvalDataset usa adminProcedure", () => {
    const section = routersSrc.split("uploadEvalDataset")[1]?.substring(0, 200) ?? "";
    expect(section).toContain("adminProcedure");
  });
  it("S15-2.5: uploadTrainDataset faz proxy para /upload-train-dataset do Flask", () => {
    const section = routersSrc.split("uploadTrainDataset")[1]?.substring(0, 1000) ?? "";
    expect(section).toContain("upload-train-dataset");
  });
  it("S15-2.6: uploadEvalDataset faz proxy para /upload-eval-dataset do Flask", () => {
    const section = routersSrc.split("uploadEvalDataset")[1]?.substring(0, 1000) ?? "";
    expect(section).toContain("upload-eval-dataset");
  });
  it("S15-2.7: uploadTrainDataset aceita fileBase64 e filename", () => {
    const section = routersSrc.split("uploadTrainDataset")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("fileBase64");
    expect(section).toContain("filename");
  });
});

// S15-3: Upload de Dataset — Frontend AdminML
describe("S15-3: Upload de Dataset — Frontend AdminML", () => {
  it("S15-3.1: AdminML importa icone Upload", () => {
    expect(adminMLSrc).toContain("Upload");
  });
  it("S15-3.2: AdminML tem estado uploadTrainFile", () => {
    expect(adminMLSrc).toContain("uploadTrainFile");
  });
  it("S15-3.3: AdminML tem estado uploadEvalFile", () => {
    expect(adminMLSrc).toContain("uploadEvalFile");
  });
  it("S15-3.4: AdminML usa mutation uploadTrainDataset", () => {
    expect(adminMLSrc).toContain("uploadTrainDataset");
  });
  it("S15-3.5: AdminML usa mutation uploadEvalDataset", () => {
    expect(adminMLSrc).toContain("uploadEvalDataset");
  });
  it("S15-3.6: AdminML tem area de drag-and-drop para dataset de treino", () => {
    expect(adminMLSrc).toContain("onDragOver");
    expect(adminMLSrc).toContain("onDrop");
  });
  it("S15-3.7: AdminML aceita apenas .xlsx para upload", () => {
    expect(adminMLSrc).toContain(".xlsx");
  });
  it("S15-3.8: AdminML converte arquivo para base64 antes de enviar", () => {
    expect(adminMLSrc).toContain("base64");
  });
});

// S15-4: Dashboard de Saude — Backend
describe("S15-4: Dashboard de Saude — Backend", () => {
  it("S15-4.1: routers.ts define procedure getSystemHealth", () => {
    expect(routersSrc).toContain("getSystemHealth");
  });
  it("S15-4.2: getSystemHealth usa adminProcedure", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 200) ?? "";
    expect(section).toContain("adminProcedure");
  });
  it("S15-4.3: getSystemHealth verifica porta 5001", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("5001");
  });
  it("S15-4.4: getSystemHealth verifica porta 5002", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("5002");
  });
  it("S15-4.5: getSystemHealth retorna services array", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 2500) ?? "";
    expect(section).toContain("services");
  });
  it("S15-4.6: getSystemHealth retorna metrics_cache", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 2500) ?? "";
    expect(section).toContain("metrics_cache");
  });
  it("S15-4.7: getSystemHealth usa AbortSignal.timeout para evitar travamento", () => {
    const section = routersSrc.split("getSystemHealth")[1]?.substring(0, 800) ?? "";
    expect(section).toContain("AbortSignal.timeout");
  });
});

// S15-5: Dashboard de Saude — Frontend
describe("S15-5: Dashboard de Saude — Frontend", () => {
  it("S15-5.1: AdminSystemHealth.tsx existe", () => {
    expect(fs.existsSync(ADMIN_HEALTH_TSX)).toBe(true);
  });
  it("S15-5.2: AdminSystemHealth usa fonte de dados para status dos serviços Flask", () => {
    // Usa tRPC getFlaskStatus como fonte primária
    const hasFlaskStatus = adminHealthSrc.includes("getFlaskStatus");
    expect(hasFlaskStatus).toBe(true);
  });
  it("S15-5.3: AdminSystemHealth tem auto-refresh de 30 segundos", () => {
    expect(adminHealthSrc).toContain("30000");
  });
  it("S15-5.4: AdminSystemHealth mostra status Online/Degradado/Offline", () => {
    expect(adminHealthSrc).toContain("Online");
    expect(adminHealthSrc).toContain("Degradado");
    expect(adminHealthSrc).toContain("Offline");
  });
  it("S15-5.5: AdminSystemHealth exibe latencia dos servicos", () => {
    expect(adminHealthSrc).toContain("latency");
  });
  it("S15-5.6: App.tsx registra rota /admin/system-health", () => {
    expect(appSrc).toContain("/admin/system-health");
  });
  it("S15-5.7: DashboardLayout tem link para Saude do Sistema", () => {
    expect(dashboardLayoutSrc).toContain("system-health");
  });
});

// S15-6: Paginacao de Incidentes — Backend
describe("S15-6: Paginacao de Incidentes — Backend", () => {
  it("S15-6.1: procedure listIncidents suporta limit e offset", () => {
    const section = routersSrc.split("listIncidents")[1]?.substring(0, 400) ?? "";
    expect(section).toContain("limit");
    expect(section).toContain("offset");
  });
  it("S15-6.2: procedure listIncidents retorna total", () => {
    const section = routersSrc.split("listIncidents")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("total");
  });
  it("S15-6.3: procedure listIncidents usa countAllIncidents", () => {
    const section = routersSrc.split("listIncidents")[1]?.substring(0, 600) ?? "";
    expect(section).toContain("countAllIncidents");
  });
});

// S15-7: Paginacao de Incidentes — Frontend
describe("S15-7: Paginacao de Incidentes — Frontend", () => {
  it("S15-7.1: AdminIncidents.tsx existe", () => {
    expect(fs.existsSync(ADMIN_INCIDENTS_TSX)).toBe(true);
  });
  it("S15-7.2: AdminIncidents usa trpc.admin.listIncidents", () => {
    expect(adminIncidentsSrc).toContain("trpc.admin.listIncidents");
  });
  it("S15-7.3: AdminIncidents tem controles de paginacao (Anterior/Proxima)", () => {
    expect(adminIncidentsSrc).toContain("Anterior");
    expect(adminIncidentsSrc).toContain("Próxima");
  });
  it("S15-7.4: AdminIncidents tem filtro de categoria", () => {
    expect(adminIncidentsSrc).toContain("phishing");
    expect(adminIncidentsSrc).toContain("malware");
  });
  it("S15-7.5: AdminIncidents tem filtro de nivel de risco", () => {
    expect(adminIncidentsSrc).toContain("critical");
    expect(adminIncidentsSrc).toContain("high");
  });
  it("S15-7.6: AdminIncidents define PAGE_SIZE", () => {
    expect(adminIncidentsSrc).toContain("PAGE_SIZE");
  });
  it("S15-7.7: App.tsx registra rota /admin/incidents", () => {
    expect(appSrc).toContain("/admin/incidents");
  });
  it("S15-7.8: DashboardLayout tem link para Todos Incidentes", () => {
    expect(dashboardLayoutSrc).toContain("admin/incidents");
  });
});

// S15-8: Exportacao PDF com Filtros
describe("S15-8: Exportacao PDF com Filtros", () => {
  it("S15-8.1: ExportPdfWithFilters.tsx existe", () => {
    expect(fs.existsSync(EXPORT_PDF_FILTERS_TSX)).toBe(true);
  });
  it("S15-8.2: ExportPdfWithFilters usa trpc.reports.exportPdf", () => {
    expect(exportPdfFiltersSrc).toContain("trpc.reports.exportPdf");
  });
  it("S15-8.3: ExportPdfWithFilters tem campo dateFrom", () => {
    expect(exportPdfFiltersSrc).toContain("dateFrom");
  });
  it("S15-8.4: ExportPdfWithFilters tem campo dateTo", () => {
    expect(exportPdfFiltersSrc).toContain("dateTo");
  });
  it("S15-8.5: ExportPdfWithFilters tem seletor de categoria", () => {
    expect(exportPdfFiltersSrc).toContain("phishing");
    expect(exportPdfFiltersSrc).toContain("malware");
  });
  it("S15-8.6: ExportPdfWithFilters tem seletor de nivel de risco", () => {
    expect(exportPdfFiltersSrc).toContain("critical");
    expect(exportPdfFiltersSrc).toContain("high");
  });
  it("S15-8.7: ExportPdfWithFilters tem modal Dialog", () => {
    expect(exportPdfFiltersSrc).toContain("Dialog");
    expect(exportPdfFiltersSrc).toContain("DialogContent");
  });
  it("S15-8.8: procedure exportPdf aceita dateFrom e dateTo", () => {
    const section = routersSrc.split("exportPdf")[1]?.substring(0, 400) ?? "";
    expect(section).toContain("dateFrom");
    expect(section).toContain("dateTo");
  });
  it("S15-8.9: db.ts getAllIncidents aceita dateFrom e dateTo", () => {
    expect(dbSrc).toContain("dateFrom");
    expect(dbSrc).toContain("dateTo");
  });
  it("S15-8.10: Admin.tsx usa ExportPdfWithFilters em vez de ExportPdfButton", () => {
    const adminSrc = fs.readFileSync(path.join(ROOT, "client", "src", "pages", "Admin.tsx"), "utf-8");
    expect(adminSrc).toContain("ExportPdfWithFilters");
    expect(adminSrc).not.toContain("ExportPdfButton");
  });
});
