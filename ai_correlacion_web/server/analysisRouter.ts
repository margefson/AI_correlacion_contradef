import { z } from "zod";

import { protectedProcedure, router } from "./_core/trpc";
import {
  getAnalysisJobDetail,
  startAnalysisJob,
  syncActiveAnalysisJobs,
  syncAnalysisJob,
} from "./analysisService";
import { listAnalysisJobs } from "./db";

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
  archiveName: z.string().min(1),
  archiveBase64: z.string().min(1),
  focusFunction: z.string().min(1),
  focusTerms: z.array(z.string().min(1)).default([]),
  focusRegexes: z.array(z.string().min(1)).default([]),
  origin: z.string().url().optional(),
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

  submit: protectedProcedure.input(submitJobInputSchema).mutation(async ({ ctx, input }) => {
    return startAnalysisJob({
      archiveName: input.archiveName,
      archiveBase64: input.archiveBase64,
      focusFunction: input.focusFunction,
      focusTerms: input.focusTerms,
      focusRegexes: input.focusRegexes,
      origin: input.origin,
      createdByUserId: ctx.user.id,
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
