import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { uploadedLogSchema } from "../shared/analysis";
import { removeLocalJobWorkspace } from "./artifactLocalStore";
import {
  getAnalysisJobDetail,
  getReductionBaselineMetrics,
  startAnalysisJob,
  syncActiveAnalysisJobs,
  syncAnalysisJob,
} from "./analysisService";
import { deleteAnalysisJobAndRelatedData, getAnalysisJobByJobId, listAnalysisJobs } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

const listJobsInputSchema = z.object({
  sampleName: z.string().trim().optional(),
  focusFunction: z.string().trim().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  status: z.array(z.enum(["queued", "running", "completed", "failed", "cancelled"]))
    .optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).optional();

const submitJobInputSchema = z.object({
  analysisName: z.string().min(1),
  logFiles: z.array(uploadedLogSchema).min(1).max(20),
  focusTerms: z.array(z.string().min(1)).default([]),
  focusRegexes: z.array(z.string().min(1)).default([]),
  origin: z.string().url().optional(),
  sampleSha256: z.string().trim().max(64).optional(),
});

const jobIdInputSchema = z.object({
  jobId: z.string().min(1),
});

/**
 * Só o perfil `admin` vê a lista e o detalhe de todas as análises do sistema; os restantes
 * utilizadores autenticados vêem apenas o que submeteram (`createdByUserId` = sessão).
 */
function isGlobalAnalysisScope(user: { role: string }): boolean {
  return user.role === "admin";
}

function canAccessJob(user: { id: number; role: string }, job: { createdByUserId: number | null }): boolean {
  if (isGlobalAnalysisScope(user)) {
    return true;
  }
  return job.createdByUserId != null && job.createdByUserId === user.id;
}

export const analysisRouter = router({
  list: protectedProcedure.input(listJobsInputSchema).query(async ({ ctx, input }) => {
    const listOwnOnly = !isGlobalAnalysisScope(ctx.user);
    return listAnalysisJobs({
      sampleName: input?.sampleName,
      focusFunction: input?.focusFunction,
      createdFrom: input?.createdFrom,
      createdTo: input?.createdTo,
      status: input?.status,
      limit: input?.limit ?? 50,
      ...(listOwnOnly ? { createdByUserId: ctx.user.id } : {}),
    });
  }),

  detail: protectedProcedure.input(jobIdInputSchema).query(async ({ ctx, input }) => {
    const job = await getAnalysisJobByJobId(input.jobId);
    if (!job) {
      return null;
    }
    if (!canAccessJob(ctx.user, job)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Só pode ver o detalhe dos lotes que submeteu.",
      });
    }
    const allowServerProcess = process.env.CONTRADEF_SERVER_DEBUG === "1";
    const raw = ctx.req.get?.("x-contradef-client-debug")?.trim().toLowerCase() ?? "";
    const includeServerProcess = allowServerProcess && (raw === "1" || raw === "true" || raw === "yes");
    return getAnalysisJobDetail(input.jobId, { includeServerProcess });
  }),

  /**
   * Remove o lote do Postgres (e tabelas derivadas) e a pasta de artefatos local do processo, se existir.
   * Só o utilizador que submeteu o lote (`createdByUserId`) — não há apagar lotes alheios (nem via admin, nesta rota).
   */
  deleteJob: protectedProcedure.input(jobIdInputSchema).mutation(async ({ ctx, input }) => {
    const job = await getAnalysisJobByJobId(input.jobId);
    if (!job) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
    }
    if (job.createdByUserId == null || job.createdByUserId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Só pode apagar lotes que submeteu.",
      });
    }
    const removed = await deleteAnalysisJobAndRelatedData(input.jobId);
    if (!removed) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado após verificação." });
    }
    try {
      await removeLocalJobWorkspace(input.jobId);
    } catch (error) {
      console.warn("[analysis.deleteJob] pastas locais (opcional):", error);
    }
    return { ok: true as const };
  }),

  reductionBaseline: protectedProcedure.query(async () => {
    return getReductionBaselineMetrics();
  }),

  submit: protectedProcedure.input(submitJobInputSchema).mutation(async ({ ctx, input }) => {
    return startAnalysisJob({
      analysisName: input.analysisName,
      logFiles: input.logFiles,
      focusTerms: input.focusTerms,
      focusRegexes: input.focusRegexes,
      origin: input.origin,
      createdByUserId: ctx.user.id,
      sampleSha256: input.sampleSha256 || null,
    });
  }),

  sync: protectedProcedure.input(jobIdInputSchema).mutation(async ({ ctx, input }) => {
    const job = await getAnalysisJobByJobId(input.jobId);
    if (!job) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
    }
    if (!canAccessJob(ctx.user, job)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Só pode sincronizar lotes que submeteu.",
      });
    }
    return syncAnalysisJob(input.jobId);
  }),

  resumeActiveSync: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const resumedJobs = await syncActiveAnalysisJobs(
        isGlobalAnalysisScope(ctx.user) ? undefined : { createdByUserId: ctx.user.id },
      );
      return { resumedJobs };
    } catch (error) {
      // Best-effort: a falha em listar jobs ativos não deve derrubar a página Reduzir logs
      // (a sessão local continua a rastrear lotes; ver reduceLogsSession v2 no cliente).
      const message = error instanceof Error ? error.message : String(error);
      console.error("[analysis.resumeActiveSync] listagem de jobs ativos falhou:", message);
      return { resumedJobs: [] as string[] };
    }
  }),
});
