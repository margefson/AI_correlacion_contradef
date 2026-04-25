import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";
import { normalizePostgresUrlForSslIfNeeded } from "./server/_core/pgConnectionUrl";

// Garante `.env` ao lado deste ficheiro (npm run db:push a partir de ai_correlacion_web).
const configDir = path.dirname(fileURLToPath(import.meta.url));
// `.env` deve prevalecer sobre variáveis já definidas no Windows (senão aparece "injected env (0)").
loadEnv({ path: path.join(configDir, ".env"), override: true });

const connectionString = normalizePostgresUrlForSslIfNeeded(
  process.env.DATABASE_URL,
);
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
