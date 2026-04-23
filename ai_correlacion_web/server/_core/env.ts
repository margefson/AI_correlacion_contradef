const isNonEmpty = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Ensures production deployments have a real database, session secret, and OAuth
 * configuration. Call once at process startup (before accepting traffic).
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing: string[] = [];
  if (!isNonEmpty(process.env.JWT_SECRET)) missing.push("JWT_SECRET");
  if (!isNonEmpty(process.env.DATABASE_URL)) missing.push("DATABASE_URL");
  if (!isNonEmpty(process.env.OAUTH_SERVER_URL)) missing.push("OAUTH_SERVER_URL");
  if (!isNonEmpty(process.env.VITE_APP_ID)) missing.push("VITE_APP_ID");

  if (missing.length > 0) {
    throw new Error(
      `[Production] Missing required environment variables: ${missing.join(", ")}. ` +
        "Set them on the Render service (and rebuild after adding any VITE_* vars). " +
        "See docs/DEPLOY_PRODUCAO.md."
    );
  }
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV !== "production" ? "local-dev-secret" : ""),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl:
    process.env.OAUTH_SERVER_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:9999" : ""),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
