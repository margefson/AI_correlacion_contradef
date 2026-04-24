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
  const oauthPortalUrl = String(import.meta.env.VITE_OAUTH_PORTAL_URL ?? "").trim();
  const appId = String(import.meta.env.VITE_APP_ID ?? "").trim();
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  // In local/dev environments OAuth can be intentionally absent.
  // Return current origin so auth checks do not crash UI rendering.
  if (!oauthPortalUrl || !appId) {
    return window.location.origin;
  }

  // Evita TypeError se VITE_OAUTH_PORTAL_URL for postgresql:// ou outro valor inválido (erro comum no Render).
  if (!isBrowserHttpUrl(oauthPortalUrl)) {
    console.error(
      "[Auth] VITE_OAUTH_PORTAL_URL must be http(s) URL for the OAuth portal, not a database string."
    );
    return window.location.origin;
  }

  const baseUrl = oauthPortalUrl.endsWith("/")
    ? oauthPortalUrl.slice(0, -1)
    : oauthPortalUrl;
  const url = new URL(`${baseUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
