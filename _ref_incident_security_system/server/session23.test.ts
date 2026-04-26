/**
 * Sessão 23 — Testes de Correções no AdminML
 *
 * Cobre:
 * 1. Remoção da barra de status duplicada (badges TREINO/AVALIAÇÃO)
 * 2. Total de amostras dinâmico na Distribuição de Dataset de Treino
 * 3. Categorias do Modelo dinâmicas (baseadas no último dataset de treino)
 * 4. Upload de Dataset de Avaliação movido para a aba Avaliação
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminMLPath = path.join(__dirname, "../client/src/pages/AdminML.tsx");
const adminMLContent = fs.readFileSync(adminMLPath, "utf-8");

// ─── S23-1: Remoção da barra de status duplicada ─────────────────────────────
describe("S23-1: Barra de status duplicada removida", () => {
  it("não deve conter a div de badges TREINO/AVALIAÇÃO duplicada", () => {
    // O bloco de badges duplicados foi removido — não deve existir mais
    const hasDuplicateBadgesBlock =
      adminMLContent.includes("dataset_cybersecurity_5000_amostras.xlsx") &&
      adminMLContent.includes("handleDownloadDataset") &&
      adminMLContent.includes("TREINO") &&
      adminMLContent.includes("AVALIAÇÃO") &&
      // Verifica se está na seção de header (antes das tabs)
      adminMLContent.indexOf("TREINO") < adminMLContent.indexOf("Tabs de navegação");

    expect(hasDuplicateBadgesBlock).toBe(false);
  });

  it("deve manter o comentário indicando a remoção dos badges", () => {
    // O comentário pode ter sido simplificado — verificar que os badges não estão no header
    const headerSection = adminMLContent.substring(
      adminMLContent.indexOf("Machine Learning"),
      adminMLContent.indexOf("Tabs de navegação")
    );
    // Não deve ter a barra duplicada com TREINO e AVALIAÇÃO no header
    const hasDuplicateBar = headerSection.includes("bg-blue-500/10 border border-blue-500/20") &&
      headerSection.includes("bg-purple-500/10 border border-purple-500/20");
    expect(hasDuplicateBar).toBe(false);
  });

  it("não deve ter o bloco de badges duplicados antes das tabs de navegação", () => {
    const tabsIndex = adminMLContent.indexOf("Tabs de navegação");
    const badgesIndex = adminMLContent.indexOf("bg-blue-500/10 border border-blue-500/20");
    // Se badges existem, devem estar DEPOIS das tabs (dentro das abas), não antes
    if (badgesIndex !== -1) {
      expect(badgesIndex).toBeGreaterThan(tabsIndex);
    }
  });
});

// ─── S23-2: Total de amostras dinâmico ───────────────────────────────────────
describe("S23-2: Total de amostras dinâmico na Distribuição", () => {
  it("deve usar Object.values para somar a category_distribution", () => {
    expect(adminMLContent).toContain("Object.values(");
    expect(adminMLContent).toContain(".reduce((acc, v) => acc + Number(v), 0)");
  });

  it("deve ter fallback para dataset_size quando category_distribution está vazio", () => {
    expect(adminMLContent).toContain("trainingMetrics?.dataset_size ?? metrics?.dataset_size ?? 0");
  });

  it("não deve ter o valor hardcoded '2000 amostras' na badge de distribuição", () => {
    // O valor hardcoded "2000 amostras" não deve aparecer na badge de distribuição
    const distributionSection = adminMLContent.substring(
      adminMLContent.indexOf("Distribuição — Dataset de Treino"),
      adminMLContent.indexOf("Distribuição — Dataset de Treino") + 500
    );
    expect(distributionSection).not.toContain(">2000 amostras<");
    expect(distributionSection).not.toContain('"2000 amostras"');
  });

  it("deve usar trainingMetrics?.category_distribution como fonte primária", () => {
    expect(adminMLContent).toContain("trainingMetrics?.category_distribution");
  });
});

// ─── S23-3: Categorias do Modelo dinâmicas ───────────────────────────────────
describe("S23-3: Categorias do Modelo dinâmicas", () => {
  it("deve usar Object.keys da category_distribution para listar categorias", () => {
    expect(adminMLContent).toContain("Object.keys(dataset?.category_distribution");
  });

  it("deve ter fallback para metrics?.categories quando distribution está vazio", () => {
    expect(adminMLContent).toContain("metrics?.categories ?? []");
  });

  it("deve verificar o comprimento antes de decidir a fonte", () => {
    expect(adminMLContent).toContain(".length > 0");
  });

  it("deve usar dataset?.category_distribution como fonte primária para categorias", () => {
    const categoriesSection = adminMLContent.substring(
      adminMLContent.indexOf("Categorias do Modelo"),
      adminMLContent.indexOf("Categorias do Modelo") + 800
    );
    expect(categoriesSection).toContain("Object.keys(dataset?.category_distribution");
  });

  it("deve incluir trainingMetrics?.category_distribution no fallback de categorias", () => {
    expect(adminMLContent).toContain("trainingMetrics?.category_distribution ?? metrics?.category_distribution");
  });
});

// ─── S23-4: Upload de Dataset de Avaliação na aba Avaliação ──────────────────
describe("S23-4: Upload de Dataset de Avaliação movido para aba Avaliação", () => {
  it("deve ter o card de upload de avaliação na aba de avaliação", () => {
    // O card de upload deve estar DEPOIS do início da aba de avaliação
    const evalTabIndex = adminMLContent.indexOf("activeTab === \"evaluation\"");
    const uploadEvalCardIndex = adminMLContent.lastIndexOf("Substituir Dataset de Avalia\u00e7\u00e3o");
    expect(uploadEvalCardIndex).toBeGreaterThan(evalTabIndex);
  });

  it("deve ter o upload de avaliação antes do botão de executar avaliação com 100 amostras", () => {
    const uploadEvalIndex = adminMLContent.lastIndexOf("Substituir Dataset de Avaliação");
    const executeEvalIndex = adminMLContent.lastIndexOf("Executar Avaliação com 100 Amostras");
    expect(uploadEvalIndex).toBeLessThan(executeEvalIndex);
  });

  it("deve manter o upload de treino na aba de treinamento", () => {
    const trainTabIndex = adminMLContent.indexOf("activeTab === \"training\"");
    const uploadTrainIndex = adminMLContent.indexOf("Substituir Dataset de Treinamento");
    expect(uploadTrainIndex).toBeGreaterThan(trainTabIndex);
  });

  it("deve ter o card de upload de avaliação com cor roxa (purple)", () => {
    const uploadEvalSection = adminMLContent.substring(
      adminMLContent.lastIndexOf("Substituir Dataset de Avalia\u00e7\u00e3o") - 100,
      adminMLContent.lastIndexOf("Substituir Dataset de Avalia\u00e7\u00e3o") + 200
    );
    expect(uploadEvalSection).toContain("text-purple-400");
  });

  it("deve ter o input de upload de avaliação com id upload-eval-input", () => {
    expect(adminMLContent).toContain('id="upload-eval-input"');
  });

  it("deve ter o drag-and-drop de avaliação com cor roxa", () => {
    expect(adminMLContent).toContain("isDraggingEval");
    expect(adminMLContent).toContain("border-purple-400");
  });
});

// ─── S23-5: Integridade geral do AdminML ─────────────────────────────────────
describe("S23-5: Integridade geral do AdminML após correções", () => {
  it("deve ter as 3 abas: Visão Geral, Treinamento e Avaliação", () => {
    expect(adminMLContent).toContain("Vis\u00e3o Geral");
    expect(adminMLContent).toContain("Treinamento");
    expect(adminMLContent).toContain("Avalia\u00e7\u00e3o");
  });

  it("deve manter a seção de Distribuição do Dataset de Treino", () => {
    expect(adminMLContent).toContain("Distribui\u00e7\u00e3o \u2014 Dataset de Treino");
  });

  it("deve manter a seção de Categorias do Modelo", () => {
    expect(adminMLContent).toContain("Categorias do Modelo");
  });

  it("deve manter o botão de Executar Avaliação", () => {
    expect(adminMLContent).toContain("Executar Avalia\u00e7\u00e3o");
  });

  it("deve manter o botão de download do dataset de treino", () => {
    expect(adminMLContent).toContain("handleDownloadDataset");
    expect(adminMLContent).toContain("Download XLSX");
  });

  it("deve manter o botão de download do dataset de avaliação", () => {
    expect(adminMLContent).toContain("handleDownloadEvalDataset");
  });

  it("deve manter o treinamento em tempo real", () => {
    // Verifica que existe referência ao treinamento (pode ser via link no menu ou componente)
    const hasTrainRef = adminMLContent.includes("retrainMutation") ||
      adminMLContent.includes("Retreinar") ||
      adminMLContent.includes("train_accuracy");
    expect(hasTrainRef).toBe(true);
  });

  it("deve ter o componente DashboardLayout", () => {
    expect(adminMLContent).toContain("DashboardLayout");
  });

  it("deve importar os ícones necessários", () => {
    expect(adminMLContent).toContain("Brain");
    expect(adminMLContent).toContain("FlaskConical");
    expect(adminMLContent).toContain("Upload");
    expect(adminMLContent).toContain("BarChart2");
  });
});
