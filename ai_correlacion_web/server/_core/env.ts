const isNonEmpty = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

function looksLikePostgresUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("postgresql:") || v.startsWith("postgres:");
}

function looksLikeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type AuthMode = "webdev" | "oidc";

function resolveAuthModeFromEnv(): AuthMode {
  return process.env.AUTH_MODE?.trim().toLowerCase() === "oidc" ? "oidc" : "webdev";
}

/**
 * Ensures production deployments have a real database, session, and OAuth
 * configuration. Call once at process startup (before accepting traffic).
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const authMode = resolveAuthModeFromEnv();

  const missing: string[] = [];
  if (!isNonEmpty(process.env.JWT_SECRET)) missing.push("JWT_SECRET");
  if (!isNonEmpty(process.env.DATABASE_URL)) missing.push("DATABASE_URL");

  if (authMode === "oidc") {
    if (!isNonEmpty(process.env.PUBLIC_APP_URL) || !looksLikeHttpUrl(process.env.PUBLIC_APP_URL!)) {
      throw new Error(
        "[Production] AUTH_MODE=oidc requires PUBLIC_APP_URL with the public HTTPS base of this app (e.g. https://myapp.onrender.com). " +
          "It must match redirect URIs registered in Google Cloud / Azure. No trailing slash."
      );
    }
    const g =
      isNonEmpty(process.env.GOOGLE_CLIENT_ID) && isNonEmpty(process.env.GOOGLE_CLIENT_SECRET);
    const m =
      isNonEmpty(process.env.MICROSOFT_CLIENT_ID) &&
      isNonEmpty(process.env.MICROSOFT_CLIENT_SECRET);
    if (!g && !m) {
      throw new Error(
        "[Production] AUTH_MODE=oidc requires at least one provider: " +
          "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET and/or " +
          "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET."
      );
    }
  } else {
    if (!isNonEmpty(process.env.OAUTH_SERVER_URL)) missing.push("OAUTH_SERVER_URL");
    if (!isNonEmpty(process.env.VITE_APP_ID)) missing.push("VITE_APP_ID");
  }

  if (missing.length > 0) {
    throw new Error(
      `[Production] Missing required environment variables: ${missing.join(", ")}. ` +
        (authMode === "webdev"
          ? "Set them on the Render service (and rebuild after adding any VITE_* vars)."
          : "For OIDC, set AUTH_MODE=oidc and provider credentials; WebDev vars are not used.")
    );
  }

  const dbUrl = process.env.DATABASE_URL!.trim();
  if (!looksLikePostgresUrl(dbUrl)) {
    throw new Error(
      "[Production] DATABASE_URL must be a PostgreSQL connection string (postgresql://...). " +
        "Do not put the OAuth URL here."
    );
  }

  if (authMode === "webdev") {
    const oauthUrl = process.env.OAUTH_SERVER_URL!.trim();
    if (!looksLikeHttpUrl(oauthUrl)) {
      throw new Error(
        "[Production] OAUTH_SERVER_URL must be an HTTP(S) base URL for the OAuth **API** (e.g. https://auth.example.com). " +
          "It must NOT be postgresql:// — that value belongs only in DATABASE_URL."
      );
    }
  }

  const portal = process.env.VITE_OAUTH_PORTAL_URL?.trim();
  if (authMode === "webdev" && portal && !looksLikeHttpUrl(portal)) {
    throw new Error(
      "[Production] VITE_OAUTH_PORTAL_URL must be an HTTP(S) URL for the **login portal** in the browser. " +
        "If you pasted DATABASE_URL here, fix it and trigger a new build (VITE_* are embedded at build time)."
    );
  }
}

const authMode = resolveAuthModeFromEnv();

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  /** appId value embedded in the session JWT (WebDev: VITE_APP_ID; OIDC: fixed "oidc"). */
  sessionAppId: authMode === "oidc" ? "oidc" : process.env.VITE_APP_ID ?? "",
  authMode,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  /** Azure AD tenant: `common`, `organizations`, a tenant ID, or your tenant domain. */
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
  publicAppUrl: process.env.PUBLIC_APP_URL?.trim() ?? "",
  cookieSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV !== "production" ? "local-dev-secret" : ""),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl:
    authMode === "oidc"
      ? ""
      : process.env.OAUTH_SERVER_URL ??
        (process.env.NODE_ENV !== "production" ? "http://localhost:9999" : ""),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
