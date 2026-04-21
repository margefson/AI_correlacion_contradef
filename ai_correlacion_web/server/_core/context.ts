import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** Same identity resolution as tRPC context — use for authenticated Express routes (e.g. artifact download). */
export async function getSessionUserFromRequest(req: Request): Promise<User | null> {
  const allowDevBypass =
    !ENV.isProduction &&
    (!ENV.oAuthServerUrl || !ENV.appId);

  try {
    return await sdk.authenticateRequest(req);
  } catch {
    if (allowDevBypass) {
      return {
        id: 1,
        openId: "local-dev-user",
        name: "Local Dev",
        email: "local-dev@localhost",
        loginMethod: "local",
        role: "admin",
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
