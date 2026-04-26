export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

function isBrowserHttpUrl(base: string): boolean {
  try {
    const u = new URL(base);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
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

    const oauthPortalUrl = String(import.meta.env.VITE_OAUTH_PORTAL_URL ?? "").trim();
    const appId = String(import.meta.env.VITE_APP_ID ?? "").trim();
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);

    // In local/dev environments OAuth can be intentionally absent.
    // Return current origin so auth checks do not crash UI rendering.
    if (!oauthPortalUrl || !appId) {
      return fallback;
    }

    // Evita TypeError se VITE_OAUTH_PORTAL_URL for postgresql:// ou outro valor inválido (erro comum no Render).
    if (!isBrowserHttpUrl(oauthPortalUrl)) {
      console.error(
        "[Auth] VITE_OAUTH_PORTAL_URL must be http(s) URL for the OAuth portal, not a database string."
      );
      return fallback;
    }

    const baseUrl = oauthPortalUrl.replace(/\/+$/, "");
    const url = new URL("app-auth", `${baseUrl}/`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (err) {
    console.error(
      "[Auth] getLoginUrl failed — check VITE_OAUTH_PORTAL_URL and VITE_APP_ID (Vite bakes VITE_* at build time; redeploy after fixing Render env).",
      err
    );
    return fallback;
  }
};

/** URL do portal OAuth institucional (WebDev) ou rota OIDC; null no modo local/none. */
export function getInstitutionalOAuthUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const authMode = String(import.meta.env.VITE_AUTH_MODE ?? "").trim().toLowerCase();
  if (
    authMode === "local" ||
    authMode === "password" ||
    authMode === "none" ||
    authMode === "disabled"
  ) {
    return null;
  }
  if (authMode === "oidc") {
    return `${window.location.origin}/api/oauth/login`;
  }
  const portal = getLoginUrl();
  const origin = window.location.origin;
  if (!portal || portal === origin || portal === "/login") {
    return null;
  }
  return portal;
}
