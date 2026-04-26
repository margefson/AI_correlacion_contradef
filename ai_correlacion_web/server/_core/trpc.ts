import { MUST_CHANGE_PASSWORD_ERR_MSG, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/** Sessão válida, inclusive quando ainda falta trocar a palavra-passe (p.ex. após redefinição). */
export const sessionProcedure = t.procedure.use(requireUser);

const requireUnlocked = t.middleware(async opts => {
  const { next, ctx } = opts;
  if (ctx.user?.mustChangePassword) {
    throw new TRPCError({ code: "FORBIDDEN", message: MUST_CHANGE_PASSWORD_ERR_MSG });
  }
  return next({ ctx });
});

/** Sessão válida e palavra-passe já trocada (ou não requerida). */
export const protectedProcedure = t.procedure.use(requireUser).use(requireUnlocked);

const requireAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Admin e conta desbloqueada (pode apagar/gerir). */
export const adminProcedure = t.procedure.use(requireUser).use(requireUnlocked).use(requireAdmin);
