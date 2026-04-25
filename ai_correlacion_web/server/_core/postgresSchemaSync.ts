import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { ENV } from "./env";
import { normalizePostgresUrlForSslIfNeeded } from "./pgConnectionUrl";

const execFileAsync = promisify(execFile);

function sslForPool(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  const fromEnv = process.env.DATABASE_SSL?.trim().toLowerCase();
  const useSslFromEnv = fromEnv === "true" || fromEnv === "1" || fromEnv === "require";
  const useSslFromUrl = /sslmode=require|sslmode=no-verify|ssl=true/i.test(
    connectionString,
  );
  if (useSslFromEnv || useSslFromUrl) {
    return { rejectUnauthorized: false };
  }
  return false;
}

async function coreTablesPresent(): Promise<boolean> {
  const connectionString = normalizePostgresUrlForSslIfNeeded(
    process.env.DATABASE_URL,
  );
  if (!connectionString) {
    return true;
  }
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: sslForPool(connectionString),
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
      // --force: sem TTY, evita confirmações (deploy Render / CI) que dão exit 1.
      return { command: process.execPath, args: [bin, "push", "--force"] };
    }
  }
  if (process.platform === "win32") {
    return { command: "npx.cmd", args: ["drizzle-kit", "push", "--force"] };
  }
  return { command: "npx", args: ["drizzle-kit", "push", "--force"] };
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
    const e = err as {
      message?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    if (e.stdout) {
      console.error(
        "[Database] drizzle-kit stdout (última parte):",
        String(e.stdout).slice(-8_000),
      );
    }
    if (e.stderr) {
      console.error(
        "[Database] drizzle-kit stderr:",
        String(e.stderr).slice(-4_000),
      );
    }
    console.error(
      "[Database] drizzle-kit push falhou. Tenta: DATABASE_SSL=true, ou pnpm db:push --force (com DATABASE_URL de produção).",
      e.message ?? err,
    );
    if (ENV.isProduction) {
      process.exit(1);
    }
  }
}
