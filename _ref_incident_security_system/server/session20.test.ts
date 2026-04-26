/**
 * session20.test.ts — Testes da Sessão 20
 *
 * Cobertura:
 *  - S20.1  __dirname ESM: restartService usa import.meta.url (não __dirname)
 *  - S20.2  fileURLToPath: importado corretamente no routers.ts
 *  - S20.3  restartService: SCRIPT_DIR calculado via __dirname_esm
 *  - S20.4  train-stream: suporte a colunas em inglês (category/title/description)
 *  - S20.5  train-stream: suporte a colunas em português (Categoria/Titulo/Descricao)
 *  - S20.6  train-stream: fallback correto quando coluna 'Categoria' não existe
 *  - S20.7  train-stream: fallback correto quando coluna 'Titulo' não existe
 *  - S20.8  train-stream: fallback correto quando coluna 'Descricao' não existe
 *  - S20.9  classifier_server.py: contém lógica de detecção de colunas
 *  - S20.10 restartService: não usa __dirname literal no código
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTERS_PATH = path.resolve(process.cwd(), "server/routers.ts");
const CLASSIFIER_PATH = path.resolve(process.cwd(), "ml/classifier_server.py");

const routersContent = fs.existsSync(ROUTERS_PATH)
  ? fs.readFileSync(ROUTERS_PATH, "utf-8")
  : "";

const classifierContent = fs.existsSync(CLASSIFIER_PATH)
  ? fs.readFileSync(CLASSIFIER_PATH, "utf-8")
  : "";

// ── S20.1 — ESM: restartService usa import.meta.url ──────────────────────────
describe("S20.1 restartService — ESM: usa import.meta.url em vez de __dirname", () => {
  it("routers.ts importa fileURLToPath de 'url'", () => {
    expect(routersContent).toContain("fileURLToPath");
    expect(routersContent).toContain("from \"url\"");
  });

  it("routers.ts usa import.meta.url para resolver o diretório", () => {
    expect(routersContent).toContain("import.meta.url");
  });

  it("routers.ts NÃO usa __dirname literal no restartService", () => {
    // Verifica que __dirname não aparece como variável (apenas como parte de __dirname_esm)
    const hasRawDirname = routersContent.includes("path.resolve(__dirname,");
    expect(hasRawDirname).toBe(false);
  });
});

// ── S20.2 — fileURLToPath importado corretamente ──────────────────────────────
describe("S20.2 fileURLToPath — import correto no routers.ts", () => {
  it("fileURLToPath é importado do módulo 'url'", () => {
    expect(routersContent).toMatch(/import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*["']url["']/);
  });

  it("__filename_esm é definido via fileURLToPath(import.meta.url)", () => {
    expect(routersContent).toContain("fileURLToPath(import.meta.url)");
  });

  it("__dirname_esm é definido via path.dirname(__filename_esm)", () => {
    expect(routersContent).toContain("path.dirname(__filename_esm)");
  });
});

// ── S20.3 — SCRIPT_DIR calculado corretamente ────────────────────────────────
describe("S20.3 restartService — SCRIPT_DIR calculado via __dirname_esm", () => {
  it("SCRIPT_DIR usa __dirname_esm (não __dirname)", () => {
    expect(routersContent).toContain("path.resolve(__dirname_esm");
  });

  it("SCRIPT_DIR aponta para o diretório ml/", () => {
    expect(routersContent).toContain("path.resolve(__dirname_esm, \"..\", \"ml\")");
  });

  it("SCRIPT_PATH aponta para classifier_server.py", () => {
    expect(routersContent).toContain("classifier_server.py");
  });
});

// ── S20.4 — train-stream: suporte a colunas em inglês ────────────────────────
describe("S20.4 train-stream — suporte a colunas em inglês (category/title/description)", () => {
  it("classifier_server.py detecta coluna 'category' como fallback", () => {
    expect(classifierContent).toContain("'category'");
  });

  it("classifier_server.py detecta coluna 'title' como fallback", () => {
    expect(classifierContent).toContain("'title'");
  });

  it("classifier_server.py detecta coluna 'description' como fallback", () => {
    expect(classifierContent).toContain("'description'");
  });
});

// ── S20.5 — train-stream: suporte a colunas em português ─────────────────────
describe("S20.5 train-stream — suporte a colunas em português (Categoria/Titulo/Descricao)", () => {
  it("classifier_server.py mantém suporte a 'Categoria'", () => {
    expect(classifierContent).toContain("'Categoria'");
  });

  it("classifier_server.py mantém suporte a 'Titulo'", () => {
    expect(classifierContent).toContain("'Titulo'");
  });

  it("classifier_server.py mantém suporte a 'Descricao'", () => {
    expect(classifierContent).toContain("'Descricao'");
  });
});

// ── S20.6 — Fallback para coluna 'category' ──────────────────────────────────
describe("S20.6 train-stream — fallback correto para coluna de categoria", () => {
  it("usa operador ternário para detectar nome da coluna", () => {
    expect(classifierContent).toContain(
      "'Categoria' if 'Categoria' in df.columns else 'category'"
    );
  });

  it("variável col_cat é usada para acessar o dataframe", () => {
    expect(classifierContent).toContain("df[col_cat]");
  });
});

// ── S20.7 — Fallback para coluna 'title' ─────────────────────────────────────
describe("S20.7 train-stream — fallback correto para coluna de título", () => {
  it("usa operador ternário para detectar nome da coluna de título", () => {
    expect(classifierContent).toContain(
      "'Titulo' if 'Titulo' in df.columns else 'title'"
    );
  });

  it("variável col_title é usada para acessar o dataframe", () => {
    expect(classifierContent).toContain("df[col_title]");
  });
});

// ── S20.8 — Fallback para coluna 'description' ───────────────────────────────
describe("S20.8 train-stream — fallback correto para coluna de descrição", () => {
  it("usa operador ternário para detectar nome da coluna de descrição", () => {
    expect(classifierContent).toContain(
      "'Descricao' if 'Descricao' in df.columns else 'description'"
    );
  });

  it("variável col_desc é usada para acessar o dataframe", () => {
    expect(classifierContent).toContain("df[col_desc]");
  });
});

// ── S20.9 — classifier_server.py: lógica de detecção de colunas ──────────────
describe("S20.9 classifier_server.py — lógica de detecção de colunas", () => {
  it("contém variáveis col_cat, col_title e col_desc", () => {
    expect(classifierContent).toContain("col_cat");
    expect(classifierContent).toContain("col_title");
    expect(classifierContent).toContain("col_desc");
  });

  it("lógica de detecção usa 'in df.columns'", () => {
    expect(classifierContent).toContain("in df.columns");
  });

  it("mensagem de log inclui nomes das colunas detectadas", () => {
    expect(classifierContent).toContain("{col_cat}, {col_title}, {col_desc}");
  });
});

// ── S20.10 — restartService: sem __dirname literal ───────────────────────────
describe("S20.10 restartService — sem uso de __dirname literal", () => {
  it("routers.ts não contém path.resolve(__dirname, ...)", () => {
    expect(routersContent).not.toContain("path.resolve(__dirname,");
  });

  it("routers.ts não contém path.join(__dirname, ...)", () => {
    expect(routersContent).not.toContain("path.join(__dirname,");
  });

  it("routers.ts contém a variável __dirname_esm como substituto ESM", () => {
    expect(routersContent).toContain("__dirname_esm");
  });
});
