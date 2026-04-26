/**
 * security.ts — Centralized security middleware (req. 6.5, 6.6, 6.7)
 *
 * Applied in server/_core/index.ts before all routes.
 */
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Application } from "express";

// ─── 6.7 Helmet ───────────────────────────────────────────────────────────────
// Removes X-Powered-By, sets X-Content-Type-Options: nosniff,
// and enables Strict-Transport-Security (HSTS).
export const helmetMiddleware = helmet({
  // Remove X-Powered-By header (hides Express fingerprint)
  hidePoweredBy: true,
  // X-Content-Type-Options: nosniff (prevents MIME sniffing)
  noSniff: true,
  // Strict-Transport-Security: max-age=31536000 (1 year), includeSubDomains
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  // Content-Security-Policy: allow same-origin and trusted CDNs
  contentSecurityPolicy: false, // Disabled to avoid blocking the SPA in dev
  // X-Frame-Options: SAMEORIGIN (clickjacking protection)
  frameguard: { action: "sameorigin" },
  // X-XSS-Protection: 0 (modern browsers use CSP instead)
  xssFilter: false,
});

// ─── 6.6 CORS ─────────────────────────────────────────────────────────────────
// Accept requests only from the configured frontend origin.
// FRONTEND_URL must be set in .env; falls back to localhost:3000 for development.
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:3000",
  // Also allow the Manus preview domain pattern (for hosted environments)
  ...(process.env.ADDITIONAL_ORIGINS
    ? process.env.ADDITIONAL_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

// Pattern for hosted/preview environments (e.g. *.manus.computer, *.manus.space)
const HOSTED_ORIGIN_PATTERNS = [
  /\.manus\.computer$/,
  /\.manus\.space$/,
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow configured origins
    if (allowedOrigins.some((allowed) => origin === allowed || origin.startsWith(allowed))) {
      return callback(null, true);
    }
    // Allow hosted preview domains (development/staging environments)
    if (HOSTED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: Origin '${origin}' not allowed`), false);
  },
  credentials: true, // Allow cookies (session cookie)
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// ─── 6.5 Rate Limiting ────────────────────────────────────────────────────────

/**
 * Global rate limit: 100 requests per IP per 15 minutes.
 * Applied to all routes.
 */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,   // Disable X-RateLimit-* headers
  message: {
    error: "Muitas requisições. Tente novamente em 15 minutos.",
  },
  // Use ipKeyGenerator for IPv6-safe IP extraction (takes IP string, not req)
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const rawIp = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded?.split(",")[0] ?? req.ip ?? "127.0.0.1");
    return ipKeyGenerator(rawIp.trim());
  },
});

/**
 * Auth rate limit: 10 requests per IP per 15 minutes.
 * Applied only to authentication endpoints (/api/trpc/auth.*).
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas de autenticação. Tente novamente em 15 minutos.",
  },
  // Use ipKeyGenerator for IPv6-safe IP extraction (takes IP string, not req)
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const rawIp = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded?.split(",")[0] ?? req.ip ?? "127.0.0.1");
    return ipKeyGenerator(rawIp.trim());
  },
});

/**
 * Apply all security middleware to the Express app.
 * Call this before registering any routes.
 */
export function applySecurityMiddleware(app: Application): void {
  // 6.7 — Helmet (security headers)
  app.use(helmetMiddleware);

  // 6.6 — CORS (restrict origins)
  app.use(corsMiddleware);

  // 6.5 — Global rate limit (100 req/IP/15min)
  app.use(globalRateLimit);

  // 6.5 — Auth-specific rate limit (10 req/IP/15min)
  // Matches /api/trpc/auth.login, /api/trpc/auth.register, etc.
  app.use("/api/trpc/auth", authRateLimit);
}
