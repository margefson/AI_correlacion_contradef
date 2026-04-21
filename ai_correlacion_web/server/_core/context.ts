import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const allowDevBypass =
    !ENV.isProduction &&
    (!ENV.oAuthServerUrl || !ENV.appId);

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (allowDevBypass) {
      // Local development fallback: keep app usable without external OAuth.
      user = {
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
    } else {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
