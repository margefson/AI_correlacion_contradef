/**
 * Corrige DATABASE_URL para clientes que dependem de parâmetros SSL na cadeia
 * (drizzle-kit, alguns runtimes) — alinhado a sslForPool / pg em postgresSchemaSync e db.
 */
export function normalizePostgresUrlForSslIfNeeded(
  url: string | undefined,
): string {
  if (!url) {
    return "";
  }
  if (/[?&]sslmode=/i.test(url) || /[?&]ssl=\s*true/i.test(url)) {
    return url;
  }
  const fromEnv = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (fromEnv === "false" || fromEnv === "0") {
    return url;
  }
  const useSslFromEnv =
    fromEnv === "true" || fromEnv === "1" || fromEnv === "require";
  if (useSslFromEnv) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}sslmode=no-verify`;
  }
  let host = "";
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, "https:"));
    host = u.hostname;
  } catch {
    return url;
  }
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");
  if (isLocal) {
    return url;
  }
  // Postgres alojado (Render, Neon, etc.) quase sempre exige SSL.
  const looksHosted =
    /\.render\.com$/i.test(host) ||
    /\.neon\.tech$/i.test(host) ||
    /\.supabase\.co$/i.test(host) ||
    /amazonaws\.com$/i.test(host);
  if (!looksHosted) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sslmode=no-verify`;
}
