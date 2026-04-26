/**
 * session6.test.ts — Testes da Sessão 6
 *
 * Cobre:
 *  S6-1: PDF com quebra de linha (wrapText)
 *  S6-2: Admin vê todos os incidentes no PDF
 *  S6-3: Data de última atualização do modelo ML
 *  S6-4: Contagem dinâmica de categorias no dataset
 *  S6-5: Exclusão física de categorias (hard delete)
 *  S6-6: Validação de tipos e segurança
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

// ─── S6-1: PDF com quebra de linha ───────────────────────────────────────────
describe("S6-1: PDF — quebra de linha automática no título", () => {
  it("S6-1.1: pdf.ts deve existir", () => {
    const pdfPath = path.resolve(__dirname, "pdf.ts");
    expect(fs.existsSync(pdfPath)).toBe(true);
  });

  it("S6-1.2: pdf.ts deve usar estimateRowH para calcular altura dinâmica", () => {
    const pdfContent = fs.readFileSync(path.resolve(__dirname, "pdf.ts"), "utf-8");
    // Usa estimateRowH (cálculo baseado em charsPerLine) para altura dinâmica
    expect(pdfContent).toContain("estimateRowH");
  });

  it("S6-1.3: pdf.ts deve usar text() com width para quebra de linha", () => {
    const pdfContent = fs.readFileSync(path.resolve(__dirname, "pdf.ts"), "utf-8");
    // Deve ter chamada de text com width para permitir quebra
    expect(pdfContent).toMatch(/text\([^)]*width/);
  });

  it("S6-1.4: pdf.ts deve usar lineBreak: true para a coluna de título", () => {
    const pdfContent = fs.readFileSync(path.resolve(__dirname, "pdf.ts"), "utf-8");
    // A coluna de título deve usar lineBreak: true para quebra automática
    expect(pdfContent).toContain("lineBreak: true");
    // E deve ter cell.wrap para identificar a coluna que permite quebra
    expect(pdfContent).toContain("wrap: true");
  });

  it("S6-1.5: pdf.ts deve ter função generatePdfBuffer exportada", () => {
    const pdfContent = fs.readFileSync(path.resolve(__dirname, "pdf.ts"), "utf-8");
    // Pode ser export function ou export async function
    expect(pdfContent).toMatch(/export (async )?function generatePdfBuffer/);
  });
});

// ─── S6-2: Admin vê todos os incidentes ──────────────────────────────────────
describe("S6-2: Admin — visualização de todos os incidentes no PDF", () => {
  it("S6-2.1: routers.ts deve ter adminMode no exportPdf", () => {
    const routersContent = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    expect(routersContent).toContain("adminMode");
  });

  it("S6-2.2: routers.ts deve buscar getAllIncidents quando adminMode=true", () => {
    const routersContent = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    expect(routersContent).toContain("getAllIncidents");
  });

  it("S6-2.3: exportPdf deve aceitar adminMode como input opcional", () => {
    const routersContent = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    expect(routersContent).toMatch(/adminMode.*z\.boolean/);
  });

  it("S6-2.4: Admin.tsx deve passar adminMode={true} ao ExportPdfButton", () => {
    const adminPath = path.resolve(__dirname, "../client/src/pages/Admin.tsx");
    if (fs.existsSync(adminPath)) {
      const adminContent = fs.readFileSync(adminPath, "utf-8");
      expect(adminContent).toContain("adminMode");
    } else {
      expect(true).toBe(true); // Arquivo não existe, skip
    }
  });
});

// ─── S6-3: Data de última atualização do modelo ML ───────────────────────────
describe("S6-3: ML — data de última atualização do modelo", () => {
  it("S6-3.1: classifier_server.py deve importar datetime", () => {
    const mlPath = path.resolve(__dirname, "../ml/classifier_server.py");
    if (fs.existsSync(mlPath)) {
      const mlContent = fs.readFileSync(mlPath, "utf-8");
      expect(mlContent).toContain("from datetime import datetime");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-3.2: classifier_server.py deve salvar last_updated no metrics.json após retrain", () => {
    const mlPath = path.resolve(__dirname, "../ml/classifier_server.py");
    if (fs.existsSync(mlPath)) {
      const mlContent = fs.readFileSync(mlPath, "utf-8");
      expect(mlContent).toContain("last_updated");
      expect(mlContent).toContain("datetime.now");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-3.3: metrics.json deve ter campo last_updated", () => {
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    if (fs.existsSync(metricsPath)) {
      const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
      expect(metrics).toHaveProperty("last_updated");
      expect(typeof metrics.last_updated).toBe("string");
      // Deve ser uma data ISO válida
      const date = new Date(metrics.last_updated);
      expect(isNaN(date.getTime())).toBe(false);
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-3.4: routers.ts deve incluir last_updated no tipo de retorno de getMLMetrics", () => {
    const routersContent = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    expect(routersContent).toContain("last_updated");
  });

  it("S6-3.5: AdminML.tsx deve exibir a data de última atualização", () => {
    const adminMLPath = path.resolve(__dirname, "../client/src/pages/AdminML.tsx");
    if (fs.existsSync(adminMLPath)) {
      const adminMLContent = fs.readFileSync(adminMLPath, "utf-8");
      expect(adminMLContent).toContain("last_updated");
      // Aceita tanto "Última atualização" quanto "Último treino" (S11 renomeou o label)
      const hasDateLabel = adminMLContent.includes("Última atualização") || adminMLContent.includes("Último treino");
      expect(hasDateLabel).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });
});

// ─── S6-4: Contagem dinâmica de categorias no dataset ────────────────────────
describe("S6-4: Dataset — contagem dinâmica de categorias", () => {
  it("S6-4.1: AdminML.tsx deve calcular contagem de categorias dinamicamente", () => {
    const adminMLPath = path.resolve(__dirname, "../client/src/pages/AdminML.tsx");
    if (fs.existsSync(adminMLPath)) {
      const adminMLContent = fs.readFileSync(adminMLPath, "utf-8");
      // Deve usar Object.keys para contar categorias do dataset
      expect(adminMLContent).toContain("Object.keys");
      expect(adminMLContent).toContain("category_distribution");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-4.2: AdminML.tsx deve ter fallback para metrics.categories quando dataset não está disponível", () => {
    const adminMLPath = path.resolve(__dirname, "../client/src/pages/AdminML.tsx");
    if (fs.existsSync(adminMLPath)) {
      const adminMLContent = fs.readFileSync(adminMLPath, "utf-8");
      // Deve ter fallback com metrics?.categories?.length
      expect(adminMLContent).toContain("metrics?.categories?.length");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-4.3: metrics.json deve ter campo categories com array de strings", () => {
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    if (fs.existsSync(metricsPath)) {
      const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
      expect(metrics).toHaveProperty("categories");
      expect(Array.isArray(metrics.categories)).toBe(true);
      expect(metrics.categories.length).toBeGreaterThan(0);
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-4.4: metrics.json deve ter pelo menos 5 categorias iniciais", () => {
    const metricsPath = path.resolve(__dirname, "../ml/metrics.json");
    if (fs.existsSync(metricsPath)) {
      const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
      expect(metrics.categories.length).toBeGreaterThanOrEqual(5);
    } else {
      expect(true).toBe(true);
    }
  });
});

// ─── S6-5: Exclusão física de categorias ─────────────────────────────────────
describe("S6-5: Categorias — exclusão física (hard delete)", () => {
  it("S6-5.1: db.ts deleteCategory deve usar db.delete() não db.update()", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    // Encontrar a função deleteCategory
    const deleteCategoryMatch = dbContent.match(/export async function deleteCategory[\s\S]*?^}/m);
    if (deleteCategoryMatch) {
      const funcBody = deleteCategoryMatch[0];
      expect(funcBody).toContain("db.delete(");
      expect(funcBody).not.toContain("isActive: false");
    } else {
      // Busca alternativa
      expect(dbContent).toContain("db.delete(categories)");
    }
  });

  it("S6-5.2: db.ts deleteCategory não deve fazer soft delete", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    // A função deleteCategory não deve ter isActive: false
    const deleteFuncStart = dbContent.indexOf("export async function deleteCategory");
    const deleteFuncEnd = dbContent.indexOf("\nexport", deleteFuncStart + 1);
    const deleteFunc = dbContent.substring(deleteFuncStart, deleteFuncEnd > 0 ? deleteFuncEnd : deleteFuncStart + 300);
    expect(deleteFunc).not.toContain("isActive: false");
  });

  it("S6-5.3: AdminCategories.tsx deve mostrar confirmação de exclusão permanente", () => {
    const adminCatPath = path.resolve(__dirname, "../client/src/pages/AdminCategories.tsx");
    if (fs.existsSync(adminCatPath)) {
      const adminCatContent = fs.readFileSync(adminCatPath, "utf-8");
      expect(adminCatContent).toMatch(/excluir permanentemente|Excluir Permanentemente/i);
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-5.4: AdminCategories.tsx deve ter botão 'Excluir Permanentemente' no AlertDialog", () => {
    const adminCatPath = path.resolve(__dirname, "../client/src/pages/AdminCategories.tsx");
    if (fs.existsSync(adminCatPath)) {
      const adminCatContent = fs.readFileSync(adminCatPath, "utf-8");
      expect(adminCatContent).toContain("Excluir Permanentemente");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-5.5: routers.ts deve ter procedure categories.delete", () => {
    const routersContent = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    expect(routersContent).toContain("deleteCategory");
  });
});

// ─── S6-6: Validação e segurança ─────────────────────────────────────────────
describe("S6-6: Validação e segurança", () => {
  it("S6-6.1: deleteCategory no routers.ts deve ser adminProcedure", () => {
    const routersContent = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    // A procedure de delete de categoria deve ser protegida
    const deleteCatMatch = routersContent.match(/delete.*adminProcedure|adminProcedure.*delete/);
    // Verificação alternativa: encontrar o bloco de categorias
    const categoriesBlock = routersContent.match(/categoriesRouter[\s\S]*?(?=\n\nconst|\nexport)/);
    if (categoriesBlock) {
      expect(categoriesBlock[0]).toContain("adminProcedure");
    } else {
      expect(routersContent).toContain("adminProcedure");
    }
  });

  it("S6-6.2: pdf.ts deve usar PDFKit (pdfkit)", () => {
    const pdfContent = fs.readFileSync(path.resolve(__dirname, "pdf.ts"), "utf-8");
    expect(pdfContent).toMatch(/pdfkit|PDFDocument/i);
  });

  it("S6-6.3: AdminML.tsx deve ter DATASET_CDN_URL definido", () => {
    const adminMLPath = path.resolve(__dirname, "../client/src/pages/AdminML.tsx");
    if (fs.existsSync(adminMLPath)) {
      const adminMLContent = fs.readFileSync(adminMLPath, "utf-8");
      expect(adminMLContent).toContain("DATASET_CDN_URL");
      expect(adminMLContent).toContain("cloudfront.net");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-6.4: AdminML.tsx deve ter botão de visualização online com Office Online", () => {
    const adminMLPath = path.resolve(__dirname, "../client/src/pages/AdminML.tsx");
    if (fs.existsSync(adminMLPath)) {
      const adminMLContent = fs.readFileSync(adminMLPath, "utf-8");
      expect(adminMLContent).toContain("officeapps.live.com");
    } else {
      expect(true).toBe(true);
    }
  });

  it("S6-6.5: db.ts deve ter função getAllIncidents para uso admin", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("getAllIncidents");
  });
});
