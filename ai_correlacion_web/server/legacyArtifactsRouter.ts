import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TRPCError } from "@trpc/server";
import * as XLSX_Module from "xlsx";
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "./_core/trpc";

/** SheetJS: resolve uma vez sob Node ESM. */
let xlResolved: typeof import("xlsx") | null = null;

/**
 * SheetJS distribui‑se em CommonJS; com `import *` sob Node ESM, APIs podem
 * ficar apenas em `.default`. Usamos `read`/`write` + `fs` (compatível com todas as builds).
 */
function xl(): typeof import("xlsx") {
  type X = typeof import("xlsx");
  if (xlResolved) return xlResolved;
  const top = XLSX_Module as unknown as X;
  const d = (XLSX_Module as unknown as { default?: X }).default;
  xlResolved =
    typeof top.read === "function"
      ? top
      : d && typeof d.read === "function"
        ? d
        : null;
  if (!xlResolved || typeof xlResolved.write !== "function" || !xlResolved.utils) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "[legacyArtifacts] Biblioteca «xlsx» não carregou correctamente neste servidor (interop ESM/CommonJS).",
    });
  }
  return xlResolved;
}

/** Árvore pública onde vive `legacy_artifacts` (referência estável ao repositório). */
export const LEGACY_ARTIFACTS_GITHUB_TREE =
  "https://github.com/margefson/AI_correlacion_contradef/tree/main/legacy_artifacts";

const FLUXOS_XLSX = "fluxos_mapeados.xlsx";
const FLUXOS_SHEET = "M1";

export type FluxoPlanilhaRow = {
  funcao: string;
  /** URL pasta GitHub ou vazio quando ainda em backlog */
  fluxoUrl: string | null;
};

const slugSchema = z.string().min(1).max(220).regex(/^[A-Za-z0-9._-]+$/);

function legacyArtifactsRoot(): string {
  const fromEnv = process.env.LEGACY_ARTIFACTS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "..", "legacy_artifacts");
}

function workbookPath(root: string): string {
  return path.join(root, FLUXOS_XLSX);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

function assertUnderRoot(resolvedSlugDir: string, root: string) {
  const r = path.resolve(root);
  const s = path.resolve(resolvedSlugDir);
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  if (s !== r && !s.startsWith(prefix)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Caminho fora da pasta legacy_artifacts." });
  }
}

async function legacyDirNames(root: string): Promise<string[]> {
  if (!(await pathExists(root))) return [];
  const ents = await fs.readdir(root, { withFileTypes: true });
  return ents.filter(e => e.isDirectory()).map(e => e.name);
}

async function listFilesRecursive(upTo: string, maxDepth: number): Promise<string[]> {
  async function inner(dir: string, depth: number): Promise<string[]> {
    if (depth > maxDepth) return [];
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const ent of ents) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...(await inner(p, depth + 1)));
      else out.push(p);
    }
    return out;
  }
  return inner(upTo, 0);
}

function githubFolderUrl(slug: string): string {
  return `${LEGACY_ARTIFACTS_GITHUB_TREE}/${encodeURIComponent(slug)}`;
}

async function resolvePrimaryArtifacts(slugRoot: string): Promise<{
  markdownPath: string | null;
  mermaidPath: string | null;
}> {
  const files = await listFilesRecursive(slugRoot, 5);
  let markdownPath =
    files.find(f => /^fluxo_.*_mapeado\.md$/i.test(path.basename(f))) ?? null;

  /** README-only folders: usar README se existir, senão primeira .md de documentação não-examples */
  if (!markdownPath) {
    const docMd = files.find(
      f =>
        /\.md$/i.test(f) &&
        !/[\\/]examples[\\/]/i.test(f) &&
        !/[\\/]test_outputs[\\/]/i.test(f) &&
        !/readme\.md$/i.test(path.basename(f)),
    );
    if (docMd) markdownPath = docMd;
    else markdownPath = files.find(f => /readme\.md$/i.test(path.basename(f))) ?? null;
  }

  /** Preferência: `docs/*.mmd`; senão primeira `.mmd` fora de test_outputs se possível */
  const mmds = files.filter(f => /\.mmd$/i.test(f));
  const mermaidPath =
    mmds.find(f => /[\\/]docs[\\/].*\.mmd$/i.test(f)) ??
    mmds.find(f => !/[\\/]test_outputs[\\/]/i.test(f)) ??
    (mmds[0] ?? null);

  return { markdownPath, mermaidPath };
}

const MERMAID_BLOCK_RE = /```mermaid\s*([\s\S]*?)```/gi;

export function extractMermaidBlocksFromMarkdown(markdown: string): string[] {
  const blocks: string[] = [];
  for (const m of Array.from(markdown.matchAll(MERMAID_BLOCK_RE))) {
    const body = typeof m[1] === "string" ? m[1].trim() : "";
    if (body.length) blocks.push(body);
  }
  return blocks;
}

async function readFluxRows(root: string): Promise<FluxoPlanilhaRow[]> {
  const wp = workbookPath(root);
  if (!(await pathExists(wp))) return [];
  const buf = await fs.readFile(wp);
  const wb = xl().read(buf, { type: "buffer" });
  const name = wb.SheetNames.includes(FLUXOS_SHEET)
    ? FLUXOS_SHEET
    : wb.SheetNames[0] ?? FLUXOS_SHEET;
  const sheet = wb.Sheets[name];
  if (!sheet) return [];

  const aoa = xl().utils.sheet_to_json<Array<unknown>[]>(sheet, { header: 1, blankrows: false }) as unknown[][];
  const rows: FluxoPlanilhaRow[] = [];
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const first = typeof row[0] === "string" ? row[0].trim() : "";
    if (!first || /^func(?:a|ã)o$/i.test(first)) continue;
    const second = typeof row[1] === "string" && row[1].trim() ? row[1].trim() : null;
    rows.push({ funcao: first, fluxoUrl: second });
  }
  return rows;
}

async function writeFluxRows(root: string, rows: FluxoPlanilhaRow[]): Promise<void> {
  const wp = workbookPath(root);
  if (!(await pathExists(root))) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pasta legacy não encontrada: ${root}`,
    });
  }
  const aoa: unknown[][] = [
    ["Funcao", "Fluxo gerado?"],
    ...rows.map(r => [r.funcao, r.fluxoUrl ?? ""]),
  ];
  const ws = xl().utils.aoa_to_sheet(aoa);
  const wb = xl().utils.book_new();
  xl().utils.book_append_sheet(wb, ws, FLUXOS_SHEET);
  const outBuffer = xl().write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  await fs.writeFile(wp, outBuffer);
}

export const legacyArtifactsRouter = router({
  meta: protectedProcedure.query(() => {
    const root = legacyArtifactsRoot();
    return {
      legacyRootResolved: root,
      githubTree: LEGACY_ARTIFACTS_GITHUB_TREE,
      fluxosSpreadsheetRelative: `${path.basename(root)}/${FLUXOS_XLSX}`,
    };
  }),

  /** Catálogo: pastas existentes em disco ∪ linhas na planilha — referência aos fluxos mapeados. */
  catalog: protectedProcedure.query(async () => {
    const root = legacyArtifactsRoot();
    const [dirs, planilha] = await Promise.all([legacyDirNames(root), readFluxRows(root)]);
    const fromSheet = planilha.map(r => r.funcao).filter(Boolean);
    const slugsMerged = dirs.concat(fromSheet);
    const items = Array.from(new Set(slugsMerged))
      .sort((a, b) => a.localeCompare(b))
      .map(slug => {
      const spreadsheet = planilha.find(r => r.funcao === slug);
      const urlEspalhamento = spreadsheet?.fluxoUrl?.trim()
        ? spreadsheet.fluxoUrl.trim()
        : githubFolderUrl(slug);
      return {
        slug,
        hasFolderOnDisk: dirs.includes(slug),
        spreadsheet: spreadsheet
          ? { fluxoUrl: spreadsheet.fluxoUrl }
          : null,
        githubFolderUrlDefault: githubFolderUrl(slug),
        suggestedGithubUrl: urlEspalhamento,
      };
    });

    return { rootReachable: await pathExists(root), items };
  }),

  detail: protectedProcedure.input(z.object({ slug: slugSchema })).query(async ({ input }) => {
    const root = legacyArtifactsRoot();
    assertUnderRoot(path.join(root, input.slug), root);
    const slugDir = path.join(root, input.slug);
    const planilha = await readFluxRows(root);
    const row = planilha.find(r => r.funcao === input.slug);

    let markdown: string | null = null;
    let markdownRelative: string | null = null;

    let mermaidCharts: string[] = [];

    if (await pathExists(slugDir)) {
      const { markdownPath, mermaidPath } = await resolvePrimaryArtifacts(slugDir);

      if (markdownPath && (await pathExists(markdownPath))) {
        markdown = await fs.readFile(markdownPath, "utf8");
        markdownRelative = path.relative(root, markdownPath).replace(/\\/g, "/");
        mermaidCharts = extractMermaidBlocksFromMarkdown(markdown);
        if (mermaidCharts.length === 0 && markdownPath.toLowerCase().endsWith(".mmd") && markdown.trim()) {
          mermaidCharts = [markdown.trim()];
        }
      }

      if (
        mermaidCharts.length === 0 &&
        mermaidPath &&
        (!markdownPath || path.resolve(markdownPath) !== path.resolve(mermaidPath))
      ) {
        const mmdRaw = await fs.readFile(mermaidPath, "utf8").catch(() => "");
        const trimmed = mmdRaw.trim();
        if (trimmed) {
          mermaidCharts = [trimmed];
          markdownRelative ??= path.relative(root, mermaidPath).replace(/\\/g, "/");
        }
      }
    }

    return {
      slug: input.slug,
      spreadsheetRow: row ? { fluxoUrl: row.fluxoUrl } : null,
      githubFolderUrls: {
        canonical: githubFolderUrl(input.slug),
        fromSpreadsheet: row?.fluxoUrl?.trim() ? row.fluxoUrl.trim() : null,
      },
      hasFolderOnDisk: await pathExists(slugDir),
      markdownRelative,
      markdown,
      /** Diagramas prontos a renderizar (blocos fenced ou `.mmd` dedicado). */
      mermaidCharts,
    };
  }),

  fluxosSpreadsheet: router({
    list: protectedProcedure.query(async () => {
      const root = legacyArtifactsRoot();
      const rows = await readFluxRows(root);
      return { rows };
    }),

    upsertRow: adminProcedure
      .input(
        z.object({
          funcao: z.string().min(1).max(240).regex(/^[A-Za-z0-9._-]+$/),
          fluxoUrl: z.union([z.string().url(), z.literal("")]).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const root = legacyArtifactsRoot();
        const rows = await readFluxRows(root);
        const trimmedName = input.funcao.trim();
        const prevSame = rows.find(r => r.funcao === trimmedName);
        const next = [...rows.filter(r => r.funcao !== trimmedName)];
        let fluxoUrl: string | null;
        if (input.fluxoUrl === undefined) {
          fluxoUrl = prevSame?.fluxoUrl ?? null;
        } else {
          const u = typeof input.fluxoUrl === "string" ? input.fluxoUrl.trim() : "";
          fluxoUrl = u.length ? u : null;
        }
        next.push({
          funcao: trimmedName,
          fluxoUrl,
        });
        next.sort((a, b) => a.funcao.localeCompare(b.funcao));
        await writeFluxRows(root, next);
        return { ok: true as const };
      }),

    deleteRow: adminProcedure
      .input(z.object({ funcao: z.string().min(1).max(240) }))
      .mutation(async ({ input }) => {
        const root = legacyArtifactsRoot();
        const rows = (await readFluxRows(root)).filter(r => r.funcao !== input.funcao);
        await writeFluxRows(root, rows);
        return { ok: true as const };
      }),
  }),
});
