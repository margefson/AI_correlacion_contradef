export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

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
