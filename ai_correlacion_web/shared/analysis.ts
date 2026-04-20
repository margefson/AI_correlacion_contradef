import { z } from "zod";

export const supportedLogTypeSchema = z.enum([
  "FunctionInterceptor",
  "TraceFcnCall",
  "TraceMemory",
  "TraceInstructions",
  "TraceDisassembly",
  "Unknown",
]);
export type SupportedLogType = z.infer<typeof supportedLogTypeSchema>;

export const malwareCategorySchema = z.enum(["Trojan", "Spyware", "Ransomware", "Backdoor", "Unknown"]);
export type MalwareCategory = z.infer<typeof malwareCategorySchema>;

export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const jobStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const llmSummaryStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type LlmSummaryStatus = z.infer<typeof llmSummaryStatusSchema>;

export const commitStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type CommitStatus = z.infer<typeof commitStatusSchema>;

export const uploadedLogSchema = z.object({
  fileName: z.string().min(1),
  base64: z.string().min(1),
  logType: supportedLogTypeSchema.optional(),
});
export type UploadedLogInput = z.infer<typeof uploadedLogSchema>;

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
  payloadJson: z.union([z.record(z.string(), z.any()), z.array(z.any()), z.null()]).optional(),
  createdAt: z.coerce.date().optional(),
});
export type AnalysisEventDto = z.infer<typeof analysisEventSchema>;

export const analysisInsightSchema = z.object({
  title: z.string().optional().nullable(),
  riskLevel: riskLevelSchema.optional().nullable(),
  classification: malwareCategorySchema.optional().nullable(),
  currentPhase: z.string().optional().nullable(),
  summaryMarkdown: z.string(),
  summaryJson: z.union([z.record(z.string(), z.any()), z.array(z.any()), z.null()]).optional(),
  modelName: z.string().optional().nullable(),
});
export type AnalysisInsightDto = z.infer<typeof analysisInsightSchema>;

export const flowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string().default("phase"),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).default("info"),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  weight: z.number().optional().nullable(),
  evidence: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).default([]),
  edges: z.array(flowEdgeSchema).default([]),
  summary: z.record(z.string(), z.any()).optional(),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;
export const correlationGraphSchema = flowGraphSchema;
export type CorrelationGraph = FlowGraph;

export const reductionMetricsSchema = z.object({
  originalLineCount: z.number().default(0),
  reducedLineCount: z.number().default(0),
  originalBytes: z.number().default(0),
  reducedBytes: z.number().default(0),
  reductionPercent: z.number().default(0),
  suspiciousEventCount: z.number().default(0),
  triggerCount: z.number().default(0),
  uploadedFileCount: z.number().default(0),
});
export type ReductionMetrics = z.infer<typeof reductionMetricsSchema>;

export const reductionFileStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type ReductionFileStatus = z.infer<typeof reductionFileStatusSchema>;

export const reductionFileMetricSchema = z.object({
  fileName: z.string(),
  logType: supportedLogTypeSchema,
  status: reductionFileStatusSchema.default("queued"),
  progress: z.number().min(0).max(100).default(0),
  currentStage: z.string().default("Aguardando processamento"),
  currentStep: z.string().default("Na fila"),
  lastMessage: z.string().default("Arquivo recebido e aguardando processamento."),
  originalLineCount: z.number().default(0),
  reducedLineCount: z.number().default(0),
  originalBytes: z.number().default(0),
  reducedBytes: z.number().default(0),
  suspiciousEventCount: z.number().default(0),
  triggerCount: z.number().default(0),
  uploadDurationMs: z.number().default(0),
  uploadReused: z.boolean().default(false),
});
export type ReductionFileMetric = z.infer<typeof reductionFileMetricSchema>;

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

export const analysisJobDetailSchema = z.object({
  job: analysisJobSummarySchema.extend({
    stdoutTail: z.string().nullable().optional(),
    stderrTail: z.string().nullable().optional(),
    resultPath: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  }),
  events: z.array(analysisEventSchema).default([]),
  artifacts: z.array(analysisArtifactSchema).default([]),
  insight: analysisInsightSchema.nullable().optional(),
  flowGraph: flowGraphSchema.default({ nodes: [], edges: [] }),
  metrics: reductionMetricsSchema.default({
    originalLineCount: 0,
    reducedLineCount: 0,
    originalBytes: 0,
    reducedBytes: 0,
    reductionPercent: 0,
    suspiciousEventCount: 0,
    triggerCount: 0,
    uploadedFileCount: 0,
  }),
  fileMetrics: z.array(reductionFileMetricSchema).default([]),
  suspiciousApis: z.array(z.string()).default([]),
  techniques: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  classification: malwareCategorySchema.default("Unknown"),
  riskLevel: riskLevelSchema.default("low"),
  currentPhase: z.string().default("Inicialização"),
});
export type AnalysisJobDetail = z.infer<typeof analysisJobDetailSchema>;
