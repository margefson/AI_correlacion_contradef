export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

function isBrowserHttpUrl(base: string): boolean {
  try {
    const u = new URL(base);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * URL do portal WebDev `.../app-auth` (login institucional). Usada no modo `webdev` e,
 * com `VITE_AUTH_MODE=local`, quando `VITE_OAUTH_PORTAL_URL` e `VITE_APP_ID` estão definidos
 * (login local + OAuth na mesma página).
 */
function buildWebDevAppAuthUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const oauthPortalUrl = String(import.meta.env.VITE_OAUTH_PORTAL_URL ?? "").trim();
  const appId = String(import.meta.env.VITE_APP_ID ?? "").trim();
  if (!oauthPortalUrl || !appId) {
    return null;
  }
  if (!isBrowserHttpUrl(oauthPortalUrl)) {
    console.error(
      "[Auth] VITE_OAUTH_PORTAL_URL must be http(s) URL for the OAuth portal, not a database string."
    );
    return null;
  }
  const baseUrl = oauthPortalUrl.replace(/\/+$/, "");
  // O login OAuth abre o portal WebDev em …/app-auth; esta app no Render não serve essa rota.
  if (baseUrl === window.location.origin) {
    console.error(
      "[Auth] VITE_OAUTH_PORTAL_URL não pode ser o mesmo URL desta aplicação. " +
        "Use o host do portal WebDev onde existe /app-auth (o indicado no painel da plataforma / Manus), não o URL do Render."
    );
    return null;
  }
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL("app-auth", `${baseUrl}/`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
}

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }
  const fallback = window.location.origin;
  try {
    const authMode = String(import.meta.env.VITE_AUTH_MODE ?? "").trim().toLowerCase();
    if (authMode === "none" || authMode === "disabled") {
      return fallback;
    }
    if (authMode === "oidc") {
      return `${window.location.origin}/api/oauth/login`;
    }
    if (authMode === "local" || authMode === "password") {
      return "/login";
    }

    const webdev = buildWebDevAppAuthUrl();
    if (webdev) {
      return webdev;
    }
    return fallback;
  } catch (err) {
    console.error(
      "[Auth] getLoginUrl failed — check VITE_OAUTH_PORTAL_URL and VITE_APP_ID (Vite bakes VITE_* at build time; redeploy after fixing Render env).",
      err
    );
    return fallback;
  }
};

/** URL do portal OAuth institucional (WebDev) ou rota OIDC; null se não configurado. */
export function getInstitutionalOAuthUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const authMode = String(import.meta.env.VITE_AUTH_MODE ?? "").trim().toLowerCase();
  if (authMode === "none" || authMode === "disabled") {
    return null;
  }
  if (authMode === "oidc") {
    return `${window.location.origin}/api/oauth/login`;
  }
  return buildWebDevAppAuthUrl();
}
