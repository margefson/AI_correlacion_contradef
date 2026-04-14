import { z } from "zod";

export const jobStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const llmSummaryStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type LlmSummaryStatus = z.infer<typeof llmSummaryStatusSchema>;

export const commitStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type CommitStatus = z.infer<typeof commitStatusSchema>;

export const analysisArtifactSchema = z.object({
  artifactType: z.string(),
  label: z.string(),
  relativePath: z.string(),
  sourcePath: z.string().optional().nullable(),
  storageUrl: z.string().optional().nullable(),
  storageKey: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  sizeBytes: z.number().optional().nullable(),
});
export type AnalysisArtifactDto = z.infer<typeof analysisArtifactSchema>;

export const analysisEventSchema = z.object({
  eventType: z.string().default("info"),
  stage: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  progress: z.number().min(0).max(100).optional().nullable(),
  payloadJson: z.record(z.string(), z.any()).or(z.array(z.any())).or(z.null()).optional(),
  createdAt: z.coerce.date().optional(),
});
export type AnalysisEventDto = z.infer<typeof analysisEventSchema>;

export const analysisInsightSchema = z.object({
  title: z.string().optional().nullable(),
  riskLevel: z.string().optional().nullable(),
  summaryMarkdown: z.string(),
  summaryJson: z.record(z.string(), z.any()).or(z.array(z.any())).or(z.null()).optional(),
  modelName: z.string().optional().nullable(),
});
export type AnalysisInsightDto = z.infer<typeof analysisInsightSchema>;

export const correlationNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string().optional().default("function"),
  file: z.string().optional().nullable(),
  module: z.string().optional().nullable(),
  confidence: z.number().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type CorrelationNode = z.infer<typeof correlationNodeSchema>;

export const correlationEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  weight: z.number().optional().nullable(),
  evidence: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type CorrelationEdge = z.infer<typeof correlationEdgeSchema>;

export const correlationGraphSchema = z.object({
  nodes: z.array(correlationNodeSchema).default([]),
  edges: z.array(correlationEdgeSchema).default([]),
  summary: z.record(z.string(), z.any()).optional(),
});
export type CorrelationGraph = z.infer<typeof correlationGraphSchema>;

export const analysisJobSummarySchema = z.object({
  jobId: z.string(),
  sampleName: z.string(),
  sourceArchiveName: z.string(),
  focusFunction: z.string(),
  status: jobStatusSchema,
  progress: z.number().min(0).max(100),
  stage: z.string(),
  message: z.string().nullable().optional(),
  llmSummaryStatus: llmSummaryStatusSchema,
  commitStatus: commitStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
});
export type AnalysisJobSummary = z.infer<typeof analysisJobSummarySchema>;

export const createAnalysisJobInputSchema = z.object({
  sourceArchiveName: z.string().min(1),
  focusFunction: z.string().min(1),
  focusTerms: z.array(z.string()).default([]),
  focusRegexes: z.array(z.string()).default([]),
  sourceArchiveUrl: z.string().optional(),
  sourceArchiveStorageKey: z.string().optional(),
});
export type CreateAnalysisJobInput = z.infer<typeof createAnalysisJobInputSchema>;
