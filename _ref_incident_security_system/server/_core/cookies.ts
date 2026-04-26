import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * Returns secure cookie options (req. 6.3):
 * - httpOnly: true  → inaccessible to JavaScript
 * - secure: true in production, or when request is already HTTPS
 * - sameSite: "lax" → CSRF protection while allowing top-level navigation
 * - saveUninitialized: false is enforced by only issuing the cookie on login
 */
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isProduction || isSecureRequest(req),
  };
}
