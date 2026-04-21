import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AnalysisArtifact,
  AnalysisCommit,
  AnalysisEvent,
  AnalysisInsight,
  AnalysisJob,
  analysisArtifacts,
  analysisCommits,
  analysisEvents,
  analysisInsights,
  analysisJobs,
  InsertAnalysisArtifact,
  InsertAnalysisCommit,
  InsertAnalysisEvent,
  InsertAnalysisInsight,
  InsertAnalysisJob,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let inMemoryAnalysisEventId = 1;
const inMemoryAnalysisJobs = new Map<string, AnalysisJob>();
const inMemoryAnalysisEvents = new Map<string, AnalysisEvent[]>();
const inMemoryAnalysisArtifacts = new Map<string, AnalysisArtifact[]>();
const inMemoryAnalysisInsights = new Map<string, AnalysisInsight>();
const inMemoryAnalysisCommits = new Map<string, AnalysisCommit>();

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createAnalysisJob(job: InsertAnalysisJob) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const row: AnalysisJob = {
      id: inMemoryAnalysisJobs.size + 1,
      jobId: String(job.jobId),
      pipelineJobId: job.pipelineJobId ?? null,
      sampleName: String(job.sampleName),
      sampleSha256: job.sampleSha256 ?? null,
      sourceArchiveName: String(job.sourceArchiveName),
      sourceArchiveUrl: job.sourceArchiveUrl ?? null,
      sourceArchiveStorageKey: job.sourceArchiveStorageKey ?? null,
      focusFunction: String(job.focusFunction),
      focusTermsJson: job.focusTermsJson ?? null,
      focusRegexesJson: job.focusRegexesJson ?? null,
      status: job.status ?? "queued",
      progress: Number(job.progress ?? 0),
      stage: String(job.stage ?? "queued"),
      message: job.message ?? null,
      stdoutTail: job.stdoutTail ?? null,
      stderrTail: job.stderrTail ?? null,
      pipelineBaseUrl: job.pipelineBaseUrl ?? null,
      pipelineJobPath: job.pipelineJobPath ?? null,
      resultPath: job.resultPath ?? null,
      errorMessage: job.errorMessage ?? null,
      llmSummaryStatus: job.llmSummaryStatus ?? "pending",
      commitStatus: job.commitStatus ?? "pending",
      createdByUserId: job.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: job.completedAt ?? null,
    };
    inMemoryAnalysisJobs.set(job.jobId, row);
    return row;
  }

  await db.insert(analysisJobs).values(job);
  return getAnalysisJobByJobId(job.jobId);
}

export async function getAnalysisJobByJobId(jobId: string) {
  const db = await getDb();
  if (!db) {
    return inMemoryAnalysisJobs.get(jobId);
  }

  const result = await db.select().from(analysisJobs).where(eq(analysisJobs.jobId, jobId)).limit(1);
  return result[0];
}

export async function listAnalysisJobs(filters?: {
  sampleName?: string;
  focusFunction?: string;
  createdFrom?: Date;
  createdTo?: Date;
  status?: Array<"queued" | "running" | "completed" | "failed" | "cancelled">;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) {
    const rows = Array.from(inMemoryAnalysisJobs.values())
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    const filtered = rows.filter((row) => {
      if (filters?.sampleName && !String(row.sampleName ?? "").toLowerCase().includes(filters.sampleName.toLowerCase())) {
        return false;
      }
      if (filters?.focusFunction && !String(row.focusFunction ?? "").toLowerCase().includes(filters.focusFunction.toLowerCase())) {
        return false;
      }
      if (filters?.createdFrom && row.createdAt < filters.createdFrom) {
        return false;
      }
      if (filters?.createdTo && row.createdAt > filters.createdTo) {
        return false;
      }
      if (filters?.status?.length && !filters.status.includes(row.status)) {
        return false;
      }
      return true;
    });

    return filtered.slice(0, filters?.limit ?? 50);
  }

  const conditions = [];
  if (filters?.sampleName) {
    conditions.push(like(analysisJobs.sampleName, `%${filters.sampleName}%`));
  }
  if (filters?.focusFunction) {
    conditions.push(like(analysisJobs.focusFunction, `%${filters.focusFunction}%`));
  }
  if (filters?.createdFrom) {
    conditions.push(gte(analysisJobs.createdAt, filters.createdFrom));
  }
  if (filters?.createdTo) {
    conditions.push(lte(analysisJobs.createdAt, filters.createdTo));
  }
  if (filters?.status?.length) {
    conditions.push(like(analysisJobs.status, `%`));
  }

  const query = db.select().from(analysisJobs);
  const rows = conditions.length ? await query.where(and(...conditions)).orderBy(desc(analysisJobs.createdAt)).limit(filters?.limit ?? 50) : await query.orderBy(desc(analysisJobs.createdAt)).limit(filters?.limit ?? 50);

  if (filters?.status?.length) {
    return rows.filter((row) => filters.status?.includes(row.status));
  }
  return rows;
}

export async function updateAnalysisJob(jobId: string, patch: Partial<InsertAnalysisJob>) {
  const db = await getDb();
  if (!db) {
    const current = inMemoryAnalysisJobs.get(jobId);
    if (!current) {
      return null;
    }
    const updated: AnalysisJob = {
      ...current,
      ...patch,
      updatedAt: new Date(),
    };
    inMemoryAnalysisJobs.set(jobId, updated);
    return updated;
  }

  await db.update(analysisJobs).set({ ...patch, updatedAt: new Date() }).where(eq(analysisJobs.jobId, jobId));
  return getAnalysisJobByJobId(jobId);
}

export async function addAnalysisEvent(event: InsertAnalysisEvent) {
  const db = await getDb();
  if (!db) {
    const list = inMemoryAnalysisEvents.get(event.jobId) ?? [];
    const inserted: AnalysisEvent = {
      ...event,
      id: inMemoryAnalysisEventId++,
      eventType: event.eventType ?? "info",
      stage: event.stage ?? null,
      message: event.message ?? null,
      progress: event.progress ?? null,
      payloadJson: event.payloadJson ?? null,
      createdAt: new Date(),
    };
    list.unshift(inserted);
    inMemoryAnalysisEvents.set(event.jobId, list);
    return inserted;
  }

  await db.insert(analysisEvents).values(event);
  const rows = await db.select().from(analysisEvents).where(eq(analysisEvents.jobId, event.jobId)).orderBy(desc(analysisEvents.id)).limit(1);
  return rows[0] ?? null;
}

export async function listAnalysisEvents(jobId: string, limit = 200) {
  const db = await getDb();
  if (!db) {
    const list = inMemoryAnalysisEvents.get(jobId) ?? [];
    return list.slice(0, limit);
  }

  return db.select().from(analysisEvents).where(eq(analysisEvents.jobId, jobId)).orderBy(desc(analysisEvents.createdAt)).limit(limit);
}

export async function replaceAnalysisArtifacts(jobId: string, artifacts: InsertAnalysisArtifact[]) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const rows: AnalysisArtifact[] = artifacts.map((artifact, index) => ({
      id: index + 1,
      jobId,
      artifactType: String(artifact.artifactType),
      label: String(artifact.label),
      relativePath: String(artifact.relativePath),
      sourcePath: artifact.sourcePath ?? null,
      storageUrl: artifact.storageUrl ?? null,
      storageKey: artifact.storageKey ?? null,
      mimeType: artifact.mimeType ?? null,
      sizeBytes: typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : null,
      createdAt: now,
    }));
    inMemoryAnalysisArtifacts.set(jobId, rows);
    return rows;
  }

  await db.delete(analysisArtifacts).where(eq(analysisArtifacts.jobId, jobId));
  if (artifacts.length === 0) {
    return [];
  }

  await db.insert(analysisArtifacts).values(artifacts);
  return listAnalysisArtifacts(jobId);
}

export async function listAnalysisArtifacts(jobId: string) {
  const db = await getDb();
  if (!db) {
    return inMemoryAnalysisArtifacts.get(jobId) ?? [];
  }

  return db.select().from(analysisArtifacts).where(eq(analysisArtifacts.jobId, jobId)).orderBy(desc(analysisArtifacts.createdAt));
}

export async function upsertAnalysisInsight(jobId: string, insight: InsertAnalysisInsight) {
  const db = await getDb();
  if (!db) {
    const current = inMemoryAnalysisInsights.get(jobId);
    const now = new Date();
    const next: AnalysisInsight = {
      id: current?.id ?? inMemoryAnalysisInsights.size + 1,
      jobId,
      modelName: insight.modelName ?? current?.modelName ?? null,
      riskLevel: insight.riskLevel ?? current?.riskLevel ?? null,
      title: insight.title ?? current?.title ?? null,
      summaryMarkdown: insight.summaryMarkdown ?? current?.summaryMarkdown ?? "",
      summaryJson: insight.summaryJson ?? current?.summaryJson ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    inMemoryAnalysisInsights.set(jobId, next);
    return next;
  }

  await db.insert(analysisInsights).values({ ...insight, jobId }).onDuplicateKeyUpdate({
    set: {
      modelName: insight.modelName ?? null,
      riskLevel: insight.riskLevel ?? null,
      title: insight.title ?? null,
      summaryMarkdown: insight.summaryMarkdown,
      summaryJson: insight.summaryJson ?? null,
      updatedAt: new Date(),
    },
  });

  return getAnalysisInsight(jobId);
}

export async function getAnalysisInsight(jobId: string) {
  const db = await getDb();
  if (!db) {
    return inMemoryAnalysisInsights.get(jobId);
  }

  const rows = await db.select().from(analysisInsights).where(eq(analysisInsights.jobId, jobId)).limit(1);
  return rows[0];
}

export async function upsertAnalysisCommit(jobId: string, commit: InsertAnalysisCommit) {
  const db = await getDb();
  if (!db) {
    const current = inMemoryAnalysisCommits.get(jobId);
    const now = new Date();
    const next: AnalysisCommit = {
      id: current?.id ?? inMemoryAnalysisCommits.size + 1,
      jobId,
      repository: commit.repository ?? current?.repository ?? "local",
      branch: commit.branch ?? current?.branch ?? "main",
      commitHash: commit.commitHash ?? current?.commitHash ?? null,
      commitMessage: commit.commitMessage ?? current?.commitMessage ?? null,
      status: commit.status ?? current?.status ?? "pending",
      detailsJson: commit.detailsJson ?? current?.detailsJson ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    inMemoryAnalysisCommits.set(jobId, next);
    return next;
  }

  const existing = await getAnalysisCommit(jobId);
  if (!existing) {
    await db.insert(analysisCommits).values({ ...commit, jobId });
  } else {
    await db.update(analysisCommits).set({
      repository: commit.repository,
      branch: commit.branch ?? existing.branch,
      commitHash: commit.commitHash ?? null,
      commitMessage: commit.commitMessage ?? null,
      status: commit.status ?? existing.status,
      detailsJson: commit.detailsJson ?? null,
      updatedAt: new Date(),
    }).where(eq(analysisCommits.jobId, jobId));
  }

  return getAnalysisCommit(jobId);
}

export async function getAnalysisCommit(jobId: string) {
  const db = await getDb();
  if (!db) {
    return inMemoryAnalysisCommits.get(jobId);
  }

  const rows = await db.select().from(analysisCommits).where(eq(analysisCommits.jobId, jobId)).limit(1);
  return rows[0];
}
