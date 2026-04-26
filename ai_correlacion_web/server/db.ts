import { and, count, desc, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
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

function pgPoolConfigFromEnv(databaseUrl: string): pg.PoolConfig {
  const sslFlag = process.env.DATABASE_SSL?.trim().toLowerCase();
  const useSslFromEnv =
    sslFlag === "true" || sslFlag === "1" || sslFlag === "require";
  const useSslFromUrl =
    /sslmode=require|sslmode=no-verify|ssl=true/i.test(databaseUrl);

  return {
    connectionString: databaseUrl,
    max: 10,
    ssl:
      useSslFromEnv || useSslFromUrl
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

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
      const pool = new pg.Pool(pgPoolConfigFromEnv(process.env.DATABASE_URL));
      _db = drizzle({ client: pool });
    } catch (error) {
      console.warn("[Database] Failed to initialize pool:", error);
      if (ENV.isProduction) {
        throw error;
      }
      _db = null;
    }
  }
  return _db;
}

/** Runs a trivial query when DATABASE_URL is set; fails fast on wrong credentials or network. */
export async function pingDatabaseIfConfigured(): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }
  await db.execute(sql`SELECT 1`);
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

    if (user.passwordHash !== undefined) {
      values.passwordHash = user.passwordHash;
      (updateSet as Record<string, unknown>).passwordHash = user.passwordHash;
    }
    if (user.mustChangePassword !== undefined) {
      values.mustChangePassword = user.mustChangePassword;
      (updateSet as Record<string, unknown>).mustChangePassword = user.mustChangePassword;
    }

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

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet as typeof users.$inferInsert,
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

export async function getUserByEmail(emailCanonical: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const email = emailCanonical.trim().toLowerCase();
  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(data: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
}): Promise<typeof users.$inferSelect> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [row] = await db
    .insert(users)
    .values({
      openId: data.openId,
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      loginMethod: "local",
      role: data.role ?? "user",
      mustChangePassword: false,
      lastSignedIn: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create user");
  }

  return row;
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
  /** Se definido, só devolve jobs com este `createdByUserId` (Centro: cada analista vê os seus). */
  createdByUserId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) {
    const rows = Array.from(inMemoryAnalysisJobs.values())
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    const filtered = rows.filter((row) => {
      if (filters?.createdByUserId != null && row.createdByUserId !== filters.createdByUserId) {
        return false;
      }
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
  if (filters?.createdByUserId != null) {
    conditions.push(eq(analysisJobs.createdByUserId, filters.createdByUserId));
  }
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
    conditions.push(inArray(analysisJobs.status, filters.status));
  }

  const query = db.select().from(analysisJobs);
  const rows = conditions.length ? await query.where(and(...conditions)).orderBy(desc(analysisJobs.createdAt)).limit(filters?.limit ?? 50) : await query.orderBy(desc(analysisJobs.createdAt)).limit(filters?.limit ?? 50);

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

  await db
    .insert(analysisInsights)
    .values({ ...insight, jobId })
    .onConflictDoUpdate({
      target: analysisInsights.jobId,
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

/**
 * Apaga o job e linhas dependentes. Retorna `true` se o job existia.
 * Em memória, remove o job e toda a cadeia associada ao `jobId`.
 */
export async function deleteAnalysisJobAndRelatedData(jobId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    inMemoryAnalysisEvents.delete(jobId);
    inMemoryAnalysisArtifacts.delete(jobId);
    inMemoryAnalysisInsights.delete(jobId);
    inMemoryAnalysisCommits.delete(jobId);
    return inMemoryAnalysisJobs.delete(jobId);
  }

  return await db.transaction(async (tx) => {
    await tx.delete(analysisEvents).where(eq(analysisEvents.jobId, jobId));
    await tx.delete(analysisArtifacts).where(eq(analysisArtifacts.jobId, jobId));
    await tx.delete(analysisInsights).where(eq(analysisInsights.jobId, jobId));
    await tx.delete(analysisCommits).where(eq(analysisCommits.jobId, jobId));
    const removed = await tx
      .delete(analysisJobs)
      .where(eq(analysisJobs.jobId, jobId))
      .returning({ id: analysisJobs.id });
    return removed.length > 0;
  });
}

export type UserListRow = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  loginMethod: string | null;
  createdAt: Date;
  lastSignedIn: Date;
  hasLocalPassword: boolean;
  mustChangePassword: boolean;
};

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    return undefined;
  }
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function listUsersForAdmin(): Promise<UserListRow[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }
  const rows = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      loginMethod: users.loginMethod,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return rows.map((r) => ({
    id: r.id,
    openId: r.openId,
    name: r.name,
    email: r.email,
    role: r.role,
    loginMethod: r.loginMethod,
    createdAt: r.createdAt,
    lastSignedIn: r.lastSignedIn,
    hasLocalPassword: r.passwordHash != null && r.passwordHash.length > 0,
    mustChangePassword: r.mustChangePassword,
  }));
}

export async function countAdmins() {
  const db = await getDb();
  if (!db) {
    return 0;
  }
  const rows = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  return Number(rows[0]?.n ?? 0);
}

export async function deleteUserById(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return false;
  }
  return await db.transaction(async (tx) => {
    await tx
      .update(analysisJobs)
      .set({ createdByUserId: null })
      .where(eq(analysisJobs.createdByUserId, id));
    const removed = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return removed.length > 0;
  });
}

export type AnalysisDashboardStats = {
  totalJobs: number;
  byStatus: Record<string, number>;
  /** Chave yyyy-mm-dd, últimos 7 dias; valores 0 se vazio. */
  createdLast7Days: { date: string; count: number }[];
};

/**
 * Estatísticas agregadas para o dashboard; `createdByUserId` restringe a analistas não-admin.
 */
export async function getAnalysisDashboardStats(filters: {
  createdByUserId?: number;
}): Promise<AnalysisDashboardStats> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const db = await getDb();
  if (!db) {
    const all = Array.from(inMemoryAnalysisJobs.values());
    const scoped = all.filter(
      (j) => filters.createdByUserId == null || j.createdByUserId === filters.createdByUserId,
    );
    const byStatus: Record<string, number> = {};
    for (const s of ["queued", "running", "completed", "failed", "cancelled"] as const) {
      byStatus[s] = 0;
    }
    for (const j of scoped) {
      byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    }
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const c = scoped.filter((j) => j.createdAt >= d && j.createdAt < next).length;
      days.push({ date: key, count: c });
    }
    return {
      totalJobs: scoped.length,
      byStatus,
      createdLast7Days: days,
    };
  }

  const scope = filters.createdByUserId != null ? eq(analysisJobs.createdByUserId, filters.createdByUserId) : undefined;

  const statusBase = db
    .select({
      status: analysisJobs.status,
      n: count(),
    })
    .from(analysisJobs);
  const statusRows = scope
    ? await statusBase.where(scope).groupBy(analysisJobs.status)
    : await statusBase.groupBy(analysisJobs.status);

  const byStatus: Record<string, number> = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of statusRows) {
    byStatus[row.status] = Number(row.n);
  }

  const totalBase = db.select({ n: count() }).from(analysisJobs);
  const totalRows = scope ? await totalBase.where(scope) : await totalBase;
  const totalJobs = Number(totalRows[0]?.n ?? 0);

  const dayExpr = sql<string>`to_char(date_trunc('day', ${analysisJobs.createdAt}), 'YYYY-MM-DD')`;
  const dayFilter = scope
    ? and(scope, gte(analysisJobs.createdAt, sevenDaysAgo))
    : gte(analysisJobs.createdAt, sevenDaysAgo);
  const dayBase = db
    .select({
      day: dayExpr,
      n: count(),
    })
    .from(analysisJobs)
    .where(dayFilter)
    .groupBy(sql`date_trunc('day', ${analysisJobs.createdAt})`);
  const dayRows = await dayBase;

  const byDay = new Map(dayRows.map((r) => [r.day, Number(r.n)]));
  const createdLast7Days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    createdLast7Days.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  return { totalJobs, byStatus, createdLast7Days };
}
