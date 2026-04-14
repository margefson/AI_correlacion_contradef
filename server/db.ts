import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
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
    console.warn("[Database] Cannot create analysis job: database not available");
    return null;
  }

  await db.insert(analysisJobs).values(job);
  return getAnalysisJobByJobId(job.jobId);
}

export async function getAnalysisJobByJobId(jobId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get analysis job: database not available");
    return undefined;
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
    console.warn("[Database] Cannot list analysis jobs: database not available");
    return [];
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
    console.warn("[Database] Cannot update analysis job: database not available");
    return null;
  }

  await db.update(analysisJobs).set({ ...patch, updatedAt: new Date() }).where(eq(analysisJobs.jobId, jobId));
  return getAnalysisJobByJobId(jobId);
}

export async function addAnalysisEvent(event: InsertAnalysisEvent) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot add analysis event: database not available");
    return null;
  }

  await db.insert(analysisEvents).values(event);
  const rows = await db.select().from(analysisEvents).where(eq(analysisEvents.jobId, event.jobId)).orderBy(desc(analysisEvents.id)).limit(1);
  return rows[0] ?? null;
}

export async function listAnalysisEvents(jobId: string, limit = 200) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list analysis events: database not available");
    return [];
  }

  return db.select().from(analysisEvents).where(eq(analysisEvents.jobId, jobId)).orderBy(desc(analysisEvents.createdAt)).limit(limit);
}

export async function replaceAnalysisArtifacts(jobId: string, artifacts: InsertAnalysisArtifact[]) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot replace analysis artifacts: database not available");
    return [];
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
    console.warn("[Database] Cannot list analysis artifacts: database not available");
    return [];
  }

  return db.select().from(analysisArtifacts).where(eq(analysisArtifacts.jobId, jobId)).orderBy(desc(analysisArtifacts.createdAt));
}

export async function upsertAnalysisInsight(jobId: string, insight: InsertAnalysisInsight) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert analysis insight: database not available");
    return null;
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
    console.warn("[Database] Cannot get analysis insight: database not available");
    return undefined;
  }

  const rows = await db.select().from(analysisInsights).where(eq(analysisInsights.jobId, jobId)).limit(1);
  return rows[0];
}

export async function upsertAnalysisCommit(jobId: string, commit: InsertAnalysisCommit) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert analysis commit: database not available");
    return null;
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
    console.warn("[Database] Cannot get analysis commit: database not available");
    return undefined;
  }

  const rows = await db.select().from(analysisCommits).where(eq(analysisCommits.jobId, jobId)).limit(1);
  return rows[0];
}
