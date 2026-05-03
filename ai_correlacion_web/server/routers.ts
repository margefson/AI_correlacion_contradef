import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import {
  changePasswordInputSchema,
  localLoginInputSchema,
  localRegisterInputSchema,
  updateProfileInputSchema,
} from "../shared/authLocalValidation";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { adminRouter } from "./adminRouter";
import { protectedProcedure, publicProcedure, router, sessionProcedure } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";
import { analysisRouter } from "./analysisRouter";
import { legacyArtifactsRouter } from "./legacyArtifactsRouter";

/** Bcrypt of `neutral-dummy` @ 12 — used to keep login timing similar when the email is unknown. */
const DUMMY_BCRYPT = "$2b$12$sIfrKHBkHIMptxuqEZQRSOaahpO9a/sQ2M5q1TQGC66XhW/sqi.IG";

function userPublicFields(user: User) {
  const { passwordHash, ...rest } = user;
  return {
    ...rest,
    canChangePassword: Boolean(passwordHash) && ENV.authMode === "local",
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export const appRouter = router({
  // If socket.io is added later, register it in server/_core/index.ts.
  // All API routes should remain under /api/* for gateway compatibility.
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? userPublicFields(opts.ctx.user) : null)),

    register: publicProcedure
      .input(localRegisterInputSchema)
      .mutation(async ({ input }) => {
        if (ENV.authMode !== "local") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Registo local só está ativo com AUTH_MODE=local.",
          });
        }
        const existing = await db.getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email já cadastrado." });
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const openId = `local_${nanoid(24)}`;
        const row = await db.createLocalUser({
          name: input.name,
          email: input.email,
          openId,
          passwordHash,
        });
        return { success: true as const, userId: row.id };
      }),

    login: publicProcedure
      .input(localLoginInputSchema)
      .mutation(async ({ input, ctx }) => {
        if (ENV.authMode !== "local") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Login local só está ativo com AUTH_MODE=local.",
          });
        }
        const user = await db.getUserByEmail(input.email);
        const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT;
        const valid = await bcrypt.compare(input.password, hashToCompare);
        if (!user?.passwordHash || !valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas." });
        }
        const signedInAt = new Date();
        await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });
        const token = await sdk.createSessionToken(user.openId, {
          name: user.name ?? "",
          email: user.email,
          loginMethod: "local",
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true as const };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    updateProfile: protectedProcedure
      .input(updateProfileInputSchema)
      .mutation(async ({ ctx, input }) => {
        const u = ctx.user!;
        await db.upsertUser({
          openId: u.openId,
          name: input.name,
          lastSignedIn: u.lastSignedIn,
        });
        return { success: true as const };
      }),

    changePassword: sessionProcedure
      .input(changePasswordInputSchema)
      .mutation(async ({ ctx, input }) => {
        const u = ctx.user!;
        if (ENV.authMode !== "local") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Alteração de palavra-passe só está disponível com AUTH_MODE=local.",
          });
        }
        if (!u.passwordHash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta conta não usa palavra-passe local.",
          });
        }
        const valid = await bcrypt.compare(input.currentPassword, u.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Palavra-passe actual incorrecta." });
        }
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await db.upsertUser({
          openId: u.openId,
          passwordHash,
          mustChangePassword: false,
          lastSignedIn: new Date(),
        });
        return { success: true as const };
      }),
  }),
  admin: adminRouter,
  analysis: analysisRouter,
  legacyArtifacts: legacyArtifactsRouter,
});

export type AppRouter = typeof appRouter;
