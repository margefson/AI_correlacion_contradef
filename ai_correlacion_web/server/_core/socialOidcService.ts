import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

export type OidcProvider = "google" | "microsoft";

export function stableOidcOpenId(provider: OidcProvider, sub: string): string {
  return createHash("sha256")
    .update(`${provider}|${sub}`)
    .digest("hex");
}

function getStateSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createOidcStateToken(provider: OidcProvider): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  return new SignJWT({ p: provider, n: nonce })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getStateSecret());
}

export async function verifyOidcStateToken(state: string): Promise<OidcProvider> {
  const { payload } = await jwtVerify(state, getStateSecret(), { algorithms: ["HS256"] });
  const p = (payload as Record<string, unknown>).p;
  if (p === "google" || p === "microsoft") return p;
  throw new Error("Invalid OAuth state");
}

/** Public origin for redirect URIs (Google / Microsoft console must list these exactly). */
export function getPublicBaseUrl(req: Request): string {
  if (ENV.publicAppUrl) {
    return ENV.publicAppUrl.replace(/\/+$/, "");
  }
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]?.trim() || "https";
  const host = (req.get("x-forwarded-host") || req.get("host") || "localhost:3000").split(",")[0]?.trim() || "localhost:3000";
  return `${proto}://${host}`;
}

function hasCreds(id?: string, secret?: string): boolean {
  return Boolean(id?.trim() && secret?.trim());
}

export function oidcProviderConfigured(provider: OidcProvider): boolean {
  if (provider === "google") {
    return hasCreds(ENV.googleClientId, ENV.googleClientSecret);
  }
  return hasCreds(ENV.microsoftClientId, ENV.microsoftClientSecret);
}

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

const MS_AUTH = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
const MS_TOKEN = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

export function buildGoogleAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", ENV.googleClientId!);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", params.state);
  u.searchParams.set("access_type", "online");
  return u.toString();
}

export function buildMicrosoftAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const tenant = ENV.microsoftTenantId || "common";
  const u = new URL(MS_AUTH(tenant));
  u.searchParams.set("client_id", ENV.microsoftClientId!);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid profile email offline_access");
  u.searchParams.set("state", params.state);
  u.searchParams.set("response_mode", "query");
  return u.toString();
}

type TokenJson = { access_token?: string; id_token?: string; token_type?: string };

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<TokenJson> {
  const body = new URLSearchParams({
    code,
    client_id: ENV.googleClientId!,
    client_secret: ENV.googleClientSecret!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token error ${res.status}: ${t.slice(0, 500)}`);
  }
  return (await res.json()) as TokenJson;
}

export async function exchangeMicrosoftCode(
  code: string,
  redirectUri: string
): Promise<TokenJson> {
  const tenant = ENV.microsoftTenantId || "common";
  const body = new URLSearchParams({
    code,
    client_id: ENV.microsoftClientId!,
    client_secret: ENV.microsoftClientSecret!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: "openid profile email offline_access",
  });
  const res = await fetch(MS_TOKEN(tenant), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Microsoft token error ${res.status}: ${t.slice(0, 500)}`);
  }
  return (await res.json()) as TokenJson;
}

export type OidcUserProfile = { sub: string; name: string; email: string | null; provider: OidcProvider };

export async function getGoogleUserProfile(accessToken: string): Promise<Pick<OidcUserProfile, "sub" | "name" | "email">> {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google userinfo error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as { sub?: string; name?: string; email?: string };
  if (!data.sub) throw new Error("Google userinfo: missing sub");
  return {
    sub: data.sub,
    name: (data.name || data.email || "User").slice(0, 200),
    email: data.email ? data.email.slice(0, 320) : null,
  };
}

function decodeJwtPayload(b64: string): Record<string, unknown> {
  const part = b64.split(".")[1];
  if (!part) throw new Error("Invalid id_token");
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

export function profileFromMicrosoftIdToken(
  idToken: string
): Pick<OidcUserProfile, "sub" | "name" | "email"> {
  const payload = decodeJwtPayload(idToken);
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("Microsoft id_token: missing sub");
  const email = typeof payload.email === "string" ? payload.email.slice(0, 320) : null;
  const name =
    (typeof payload.name === "string" && payload.name) ||
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    email ||
    "User";
  return { sub, name: name.slice(0, 200), email };
}

export async function getMicrosoftUserProfile(
  accessToken: string,
  idToken: string | undefined
): Promise<Pick<OidcUserProfile, "sub" | "name" | "email">> {
  if (idToken) {
    try {
      return profileFromMicrosoftIdToken(idToken);
    } catch (e) {
      console.warn("[OIDC] Microsoft id_token parse failed, trying userinfo", e);
    }
  }
  const res = await fetch("https://graph.microsoft.com/oidc/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Microsoft userinfo error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as { sub?: string; name?: string; email?: string };
  if (!data.sub) throw new Error("Microsoft userinfo: missing sub");
  return {
    sub: data.sub,
    name: (data.name || data.email || "User").slice(0, 200),
    email: data.email ? data.email.slice(0, 320) : null,
  };
}
