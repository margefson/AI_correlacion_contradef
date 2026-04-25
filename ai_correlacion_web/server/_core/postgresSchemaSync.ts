import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { ENV } from "./env";

const execFileAsync = promisify(execFile);

function sslForPool(): boolean | { rejectUnauthorized: boolean } {
  const url = process.env.DATABASE_URL ?? "";
  const fromEnv = process.env.DATABASE_SSL?.trim().toLowerCase();
  const useSslFromEnv = fromEnv === "true" || fromEnv === "1" || fromEnv === "require";
  const useSslFromUrl = /sslmode=require|sslmode=no-verify|ssl=true/i.test(url);
  if (useSslFromEnv || useSslFromUrl) {
    return { rejectUnauthorized: false };
  }
  return false;
}

async function coreTablesPresent(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return true;
  }
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: sslForPool(),
  });
  try {
    // Nomes com aspas como no schema Drizzle; information_schema nem sempre bate em PG.
    await pool.query('SELECT 1 FROM "users" LIMIT 1');
    await pool.query('SELECT 1 FROM "analysisJobs" LIMIT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

function resolveDrizzleKitEntry(): { command: string; args: string[] } {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "node_modules", "drizzle-kit", "bin.cjs"),
    path.join(selfDir, "..", "node_modules", "drizzle-kit", "bin.cjs"),
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) {
      return { command: process.execPath, args: [bin, "push"] };
    }
  }
  if (process.platform === "win32") {
    return { command: "npx.cmd", args: ["drizzle-kit", "push"] };
  }
  return { command: "npx", args: ["drizzle-kit", "push"] };
}

/**
 * Se as tabelas base não existem (ex.: nunca correste pnpm db:push no Postgres de produção),
 * aplica o schema com drizzle-kit push. Só em NODE_ENV=production, salta com SKIP_DB_AUTO_PUSH=1.
 */
export async function applyPostgresSchemaIfNeeded(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  if (process.env.SKIP_DB_AUTO_PUSH === "1" || process.env.SKIP_DB_AUTO_PUSH === "true") {
    console.log("[Database] SKIP_DB_AUTO_PUSH: não aplico schema no arranque");
    return;
  }
  if (process.env.DB_AUTO_PUSH === "0" || process.env.DB_AUTO_PUSH === "false") {
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const ok = await coreTablesPresent();
  if (ok) {
    return;
  }

  const resolved = resolveDrizzleKitEntry();

  console.log(
    "[Database] Tabelas em falta no Postgres — a executar drizzle-kit push (primeiro deploy / schema não aplicado).",
  );

  const env = { ...process.env, CI: "1", NO_COLOR: "1" } as NodeJS.ProcessEnv;
  const cwd = process.cwd();

  try {
    await execFileAsync(resolved.command, resolved.args, {
      cwd,
      env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    });
    console.log("[Database] drizzle-kit push concluído");
  } catch (err) {
    console.error(
      "[Database] drizzle-kit push falhou. No teu PC: cd ai_correlacion_web && pnpm db:push (com DATABASE_URL de produção).",
      err,
    );
    if (ENV.isProduction) {
      process.exit(1);
    }
  }
}
