import {
  bigint,
  doublePrecision,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const llmSummaryStatusEnum = pgEnum("llm_summary_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const pipelineCommitStatusEnum = pgEnum("pipeline_commit_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** OAuth subject identifier (openId) returned from the provider callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignedIn: timestamp("lastSignedIn", { mode: "date" }).defaultNow().notNull(),
});

export const analysisJobs = pgTable("analysisJobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull().unique(),
  pipelineJobId: varchar("pipelineJobId", { length: 128 }),
  sampleName: varchar("sampleName", { length: 255 }).notNull(),
  /** SHA-256 (64 hex) do binário da amostra, para correlação externa (ex.: VirusTotal). */
  sampleSha256: varchar("sampleSha256", { length: 64 }),
  sourceArchiveName: varchar("sourceArchiveName", { length: 255 }).notNull(),
  sourceArchiveUrl: text("sourceArchiveUrl"),
  sourceArchiveStorageKey: varchar("sourceArchiveStorageKey", { length: 512 }),
  focusFunction: varchar("focusFunction", { length: 255 }).notNull(),
  focusTermsJson: json("focusTermsJson"),
  focusRegexesJson: json("focusRegexesJson"),
  status: jobStatusEnum("status").default("queued").notNull(),
  progress: doublePrecision("progress").default(0).notNull(),
  stage: varchar("stage", { length: 128 }).default("queued").notNull(),
  message: text("message"),
  stdoutTail: text("stdoutTail"),
  stderrTail: text("stderrTail"),
  pipelineBaseUrl: text("pipelineBaseUrl"),
  pipelineJobPath: text("pipelineJobPath"),
  resultPath: text("resultPath"),
  errorMessage: text("errorMessage"),
  llmSummaryStatus: llmSummaryStatusEnum("llmSummaryStatus").default("pending").notNull(),
  commitStatus: pipelineCommitStatusEnum("commitStatus").default("pending").notNull(),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  completedAt: timestamp("completedAt", { mode: "date" }),
});

export const analysisEvents = pgTable("analysisEvents", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull(),
  eventType: varchar("eventType", { length: 64 }).default("info").notNull(),
  stage: varchar("stage", { length: 128 }),
  message: text("message"),
  progress: doublePrecision("progress"),
  payloadJson: json("payloadJson"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const analysisArtifacts = pgTable("analysisArtifacts", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull(),
  artifactType: varchar("artifactType", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  relativePath: text("relativePath").notNull(),
  sourcePath: text("sourcePath"),
  storageUrl: text("storageUrl"),
  storageKey: varchar("storageKey", { length: 512 }),
  mimeType: varchar("mimeType", { length: 255 }),
  sizeBytes: bigint("sizeBytes", { mode: "number" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const analysisInsights = pgTable("analysisInsights", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull().unique(),
  modelName: varchar("modelName", { length: 128 }),
  riskLevel: varchar("riskLevel", { length: 64 }),
  title: varchar("title", { length: 255 }),
  summaryMarkdown: text("summaryMarkdown").notNull(),
  summaryJson: json("summaryJson"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const analysisCommits = pgTable("analysisCommits", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull(),
  repository: varchar("repository", { length: 255 }).notNull(),
  branch: varchar("branch", { length: 128 }).default("main").notNull(),
  commitHash: varchar("commitHash", { length: 64 }),
  commitMessage: text("commitMessage"),
  status: pipelineCommitStatusEnum("status").default("pending").notNull(),
  detailsJson: json("detailsJson"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type InsertAnalysisJob = typeof analysisJobs.$inferInsert;
export type AnalysisEvent = typeof analysisEvents.$inferSelect;
export type InsertAnalysisEvent = typeof analysisEvents.$inferInsert;
export type AnalysisArtifact = typeof analysisArtifacts.$inferSelect;
export type InsertAnalysisArtifact = typeof analysisArtifacts.$inferInsert;
export type AnalysisInsight = typeof analysisInsights.$inferSelect;
export type InsertAnalysisInsight = typeof analysisInsights.$inferInsert;
export type AnalysisCommit = typeof analysisCommits.$inferSelect;
export type InsertAnalysisCommit = typeof analysisCommits.$inferInsert;
