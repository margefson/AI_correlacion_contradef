import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import {
  buildGoogleAuthorizeUrl,
  buildMicrosoftAuthorizeUrl,
  createOidcStateToken,
  exchangeGoogleCode,
  exchangeMicrosoftCode,
  getGoogleUserProfile,
  getMicrosoftUserProfile,
  getPublicBaseUrl,
  oidcProviderConfigured,
  stableOidcOpenId,
  verifyOidcStateToken,
  type OidcProvider,
} from "./socialOidcService";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function registerWebdevCallback(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

function registerOidcRoutes(app: Express) {
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    const g = oidcProviderConfigured("google");
    const m = oidcProviderConfigured("microsoft");
    if (!g && !m) {
      res.status(503).send("OIDC is not configured (set Google and/or Microsoft client env).");
      return;
    }
    if (g && !m) {
      res.redirect(302, "/api/oauth/authorize/google");
      return;
    }
    if (!g && m) {
      res.redirect(302, "/api/oauth/authorize/microsoft");
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Entrar</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f172a;color:#e2e8f0;}
.card{max-width:420px;padding:2rem;border-radius:1rem;border:1px solid #334155;background:#020617;}
h1{font-size:1.25rem;margin:0 0 1rem;}
a{display:block;text-align:center;padding:0.75rem 1rem;margin:0.5rem 0;border-radius:0.5rem;text-decoration:none;font-weight:600;}
a.google{background:#fff;color:#111;}
a.ms{background:#2f2f2f;color:#fff;}
p{font-size:0.875rem;color:#94a3b8;margin-top:1rem;}</style></head>
<body><div class="card">
<h1>Iniciar sessão</h1>
<a class="google" href="/api/oauth/authorize/google">Continuar com Google</a>
<a class="ms" href="/api/oauth/authorize/microsoft">Continuar com Microsoft</a>
<p>Regista os redirect URIs em Google Cloud e Azure (HTTPS).</p>
</div></body></html>`;
    res.status(200).type("html").send(html);
  });

  const startAuthorize = (provider: OidcProvider) => async (req: Request, res: Response) => {
    if (!oidcProviderConfigured(provider)) {
      res.status(400).send(`${provider} OAuth is not configured.`);
      return;
    }
    try {
      const state = await createOidcStateToken(provider);
      const base = getPublicBaseUrl(req);
      const redirectUri = `${base}/api/oauth/callback/${provider}`;
      const url =
        provider === "google"
          ? buildGoogleAuthorizeUrl({ redirectUri, state })
          : buildMicrosoftAuthorizeUrl({ redirectUri, state });
      res.redirect(302, url);
    } catch (e) {
      console.error("[OIDC] authorize failed", e);
      res.status(500).send("OAuth start failed");
    }
  };

  app.get("/api/oauth/authorize/google", startAuthorize("google"));
  app.get("/api/oauth/authorize/microsoft", startAuthorize("microsoft"));

  const handleOidcCallback = (provider: OidcProvider) => async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    let verified: OidcProvider;
    try {
      verified = await verifyOidcStateToken(state);
    } catch {
      res.status(400).send("Invalid or expired OAuth state. Try signing in again.");
      return;
    }
    if (verified !== provider) {
      res.status(400).send("OAuth provider mismatch.");
      return;
    }

    const base = getPublicBaseUrl(req);
    const redirectUri = `${base}/api/oauth/callback/${provider}`;

    try {
      if (provider === "google") {
        const tokenJson = await exchangeGoogleCode(code, redirectUri);
        if (!tokenJson.access_token) throw new Error("No access_token from Google");
        const p = await getGoogleUserProfile(tokenJson.access_token);
        const openId = stableOidcOpenId("google", p.sub);
        await db.upsertUser({
          openId,
          name: p.name,
          email: p.email,
          loginMethod: "google",
          lastSignedIn: new Date(),
        });
        const sessionToken = await sdk.createSessionToken(openId, {
          name: p.name,
          email: p.email,
          loginMethod: "google",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        res.redirect(302, "/");
        return;
      }

      const tokenJson = await exchangeMicrosoftCode(code, redirectUri);
      if (!tokenJson.access_token) throw new Error("No access_token from Microsoft");
      const p = await getMicrosoftUserProfile(
        tokenJson.access_token,
        tokenJson.id_token
      );
      const openId = stableOidcOpenId("microsoft", p.sub);
      await db.upsertUser({
        openId,
        name: p.name,
        email: p.email,
        loginMethod: "microsoft",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: p.name,
        email: p.email,
        loginMethod: "microsoft",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OIDC] Callback failed", error);
      res.status(500).send("OAuth callback failed. Check server logs and redirect URIs in Google / Azure.");
    }
  };

  app.get("/api/oauth/callback/google", handleOidcCallback("google"));
  app.get("/api/oauth/callback/microsoft", handleOidcCallback("microsoft"));
}

export function registerOAuthRoutes(app: Express) {
  if (ENV.authMode === "oidc") {
    registerOidcRoutes(app);
  } else {
    registerWebdevCallback(app);
  }
}
