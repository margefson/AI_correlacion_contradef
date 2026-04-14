import {
  bigint,
  double,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const analysisJobs = mysqlTable("analysisJobs", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull().unique(),
  pipelineJobId: varchar("pipelineJobId", { length: 128 }),
  sampleName: varchar("sampleName", { length: 255 }).notNull(),
  sourceArchiveName: varchar("sourceArchiveName", { length: 255 }).notNull(),
  sourceArchiveUrl: text("sourceArchiveUrl"),
  sourceArchiveStorageKey: varchar("sourceArchiveStorageKey", { length: 512 }),
  focusFunction: varchar("focusFunction", { length: 255 }).notNull(),
  focusTermsJson: json("focusTermsJson"),
  focusRegexesJson: json("focusRegexesJson"),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed", "cancelled"]).default("queued").notNull(),
  progress: double("progress").default(0).notNull(),
  stage: varchar("stage", { length: 128 }).default("queued").notNull(),
  message: text("message"),
  stdoutTail: text("stdoutTail"),
  stderrTail: text("stderrTail"),
  pipelineBaseUrl: text("pipelineBaseUrl"),
  pipelineJobPath: text("pipelineJobPath"),
  resultPath: text("resultPath"),
  errorMessage: text("errorMessage"),
  llmSummaryStatus: mysqlEnum("llmSummaryStatus", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  commitStatus: mysqlEnum("commitStatus", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const analysisEvents = mysqlTable("analysisEvents", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull(),
  eventType: varchar("eventType", { length: 64 }).default("info").notNull(),
  stage: varchar("stage", { length: 128 }),
  message: text("message"),
  progress: double("progress"),
  payloadJson: json("payloadJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const analysisArtifacts = mysqlTable("analysisArtifacts", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull(),
  artifactType: varchar("artifactType", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  relativePath: text("relativePath").notNull(),
  sourcePath: text("sourcePath"),
  storageUrl: text("storageUrl"),
  storageKey: varchar("storageKey", { length: 512 }),
  mimeType: varchar("mimeType", { length: 255 }),
  sizeBytes: bigint("sizeBytes", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const analysisInsights = mysqlTable("analysisInsights", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull().unique(),
  modelName: varchar("modelName", { length: 128 }),
  riskLevel: varchar("riskLevel", { length: 64 }),
  title: varchar("title", { length: 255 }),
  summaryMarkdown: text("summaryMarkdown").notNull(),
  summaryJson: json("summaryJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const analysisCommits = mysqlTable("analysisCommits", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull(),
  repository: varchar("repository", { length: 255 }).notNull(),
  branch: varchar("branch", { length: 128 }).default("main").notNull(),
  commitHash: varchar("commitHash", { length: 64 }),
  commitMessage: text("commitMessage"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  detailsJson: json("detailsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
