import { z } from "zod";

import { uploadedLogSchema } from "../shared/analysis";
import {
  getAnalysisJobDetail,
  getReductionBaselineMetrics,
  startAnalysisJob,
  syncActiveAnalysisJobs,
  syncAnalysisJob,
} from "./analysisService";
import { listAnalysisJobs } from "./db";
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

export const analysisRouter = router({
  list: protectedProcedure.input(listJobsInputSchema).query(async ({ input }) => {
    return listAnalysisJobs({
      sampleName: input?.sampleName,
      focusFunction: input?.focusFunction,
      createdFrom: input?.createdFrom,
      createdTo: input?.createdTo,
      status: input?.status,
      limit: input?.limit ?? 50,
    });
  }),

  detail: protectedProcedure.input(jobIdInputSchema).query(async ({ input }) => {
    return getAnalysisJobDetail(input.jobId);
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

  sync: protectedProcedure.input(jobIdInputSchema).mutation(async ({ input }) => {
    return syncAnalysisJob(input.jobId);
  }),

  resumeActiveSync: protectedProcedure.mutation(async () => {
    const resumedJobs = await syncActiveAnalysisJobs();
    return { resumedJobs };
  }),
});
