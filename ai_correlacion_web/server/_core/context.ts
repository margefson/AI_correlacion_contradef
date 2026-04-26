import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

const NO_AUTH_BYPASS_USER: User = {
  id: 1,
  openId: "no-auth",
  name: "Usuário (auth desligada)",
  email: "noauth@local",
  passwordHash: null,
  loginMethod: "none",
  role: "admin",
  mustChangePassword: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** Same identity resolution as tRPC context — use for authenticated Express routes (e.g. artifact download). */
export async function getSessionUserFromRequest(req: Request): Promise<User | null> {
  if (ENV.authMode === "none") {
    return NO_AUTH_BYPASS_USER;
  }

  const hasWebdev = Boolean(ENV.oAuthServerUrl && ENV.appId);
  const hasOidc =
    ENV.authMode === "oidc" &&
    (Boolean(ENV.googleClientId?.trim() && ENV.googleClientSecret?.trim()) ||
      Boolean(ENV.microsoftClientId?.trim() && ENV.microsoftClientSecret?.trim()));
  const allowDevBypass =
    !ENV.isProduction && !hasWebdev && !hasOidc && ENV.authMode !== "local";

  try {
    return await sdk.authenticateRequest(req);
  } catch {
    if (allowDevBypass) {
      return {
        id: 1,
        openId: "local-dev-user",
        name: "Local Dev",
        email: "local-dev@localhost",
        passwordHash: null,
        loginMethod: "local",
        role: "admin",
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    }
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await getSessionUserFromRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
