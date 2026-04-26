import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import {
  adminUpdateUserInputSchema,
  adminUserIdInputSchema,
} from "../shared/authLocalValidation";
import * as db from "./db";
import { ENV } from "./_core/env";
import { adminProcedure, router } from "./_core/trpc";

const DEFAULT_RESET_PASSWORD = "123456";

export const adminRouter = router({
  listUsers: adminProcedure.query(() => db.listUsersForAdmin()),

  updateUser: adminProcedure.input(adminUpdateUserInputSchema).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id && input.role === "user") {
      const n = await db.countAdmins();
      if (n <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível alterar: é o único administrador do sistema.",
        });
      }
    }
    const target = await db.getUserById(input.userId);
    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
    }
    const other = await db.getUserByEmail(input.email);
    if (other && other.id !== target.id) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe outro usuário com este email." });
    }
    await db.upsertUser({
      openId: target.openId,
      name: input.name,
      email: input.email,
      role: input.role,
      lastSignedIn: target.lastSignedIn,
    });
    return { success: true as const };
  }),

  setPasswordToDefault: adminProcedure.input(adminUserIdInputSchema).mutation(async ({ input, ctx }) => {
    if (ENV.authMode !== "local") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Apenas disponível com autenticação local.",
      });
    }
    const target = await db.getUserById(input.userId);
    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
    }
    if (input.userId === ctx.user.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Use o seu perfil para alterar a própria palavra-passe.",
      });
    }
    const passwordHash = await bcrypt.hash(DEFAULT_RESET_PASSWORD, 12);
    await db.upsertUser({
      openId: target.openId,
      passwordHash,
      loginMethod: target.loginMethod ?? "local",
      mustChangePassword: true,
      lastSignedIn: target.lastSignedIn,
    });
    return { success: true as const };
  }),

  deleteUser: adminProcedure.input(adminUserIdInputSchema).mutation(async ({ input, ctx }) => {
    if (input.userId === ctx.user.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível apagar a própria conta." });
    }
    const target = await db.getUserById(input.userId);
    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
    }
    if (target.role === "admin") {
      const n = await db.countAdmins();
      if (n <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível apagar o único administrador do sistema.",
        });
      }
    }
    const ok = await db.deleteUserById(input.userId);
    if (!ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao apagar o usuário." });
    }
    return { success: true as const };
  }),
});
