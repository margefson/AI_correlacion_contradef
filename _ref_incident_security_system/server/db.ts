import { eq, desc, and, or, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users, incidents, categories, incidentHistory, passwordResetTokens, InsertUser, InsertIncident, Incident } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

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

// ─── Users ─────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    for (const field of textFields) {
      const value = user[field];
      if (value === undefined) continue;
      const normalized = value ?? null;
      (values as Record<string, unknown>)[field] = normalized;
      updateSet[field] = normalized;
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
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0] ?? undefined;
}

export async function createLocalUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  openId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values({
    openId: data.openId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "local",
    role: "user",
    lastSignedIn: new Date(),
    isActive: true,
  });
  const result = await db.select().from(users).where(eq(users.openId, data.openId)).limit(1);
  return result[0];
}

// ─── Incidents ─────────────────────────────────────────────────────────────

export async function createIncident(data: InsertIncident) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(incidents).values(data);
  const result = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.userId, data.userId!), eq(incidents.title, data.title)))
    .orderBy(desc(incidents.createdAt))
    .limit(1);
  return result[0];
}

export async function getIncidentsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.userId, userId))
    .orderBy(desc(incidents.createdAt));
}

export async function getIncidentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function deleteIncident(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(incidents).where(and(eq(incidents.id, id), eq(incidents.userId, userId)));
}

export async function getIncidentStatsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      category: incidents.category,
      count: sql<number>`count(*)`,
    })
    .from(incidents)
    .where(eq(incidents.userId, userId))
    .groupBy(incidents.category);
}

export async function getIncidentRiskStatsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      riskLevel: incidents.riskLevel,
      count: sql<number>`count(*)`,
    })
    .from(incidents)
    .where(eq(incidents.userId, userId))
    .groupBy(incidents.riskLevel);
}

// ─── Admin Helpers ────────────────────────────────────────────────────────
export async function getAllIncidents(filters?: {
  category?: string;
  riskLevel?: string;
  status?: string;
  userId?: number;
  limit?: number;
  offset?: number;
  dateFrom?: number; // Unix ms
  dateTo?: number;   // Unix ms
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.category) conditions.push(eq(incidents.category, filters.category as Incident["category"]));
  if (filters?.riskLevel) conditions.push(eq(incidents.riskLevel, filters.riskLevel as Incident["riskLevel"]));
  if (filters?.status) conditions.push(eq(incidents.status, filters.status as Incident["status"]));
  if (filters?.userId) conditions.push(eq(incidents.userId, filters.userId));
  if (filters?.dateFrom) conditions.push(sql`${incidents.createdAt} >= ${new Date(filters.dateFrom)}` as unknown as ReturnType<typeof eq>);
  if (filters?.dateTo) conditions.push(sql`${incidents.createdAt} <= ${new Date(filters.dateTo)}` as unknown as ReturnType<typeof eq>);
  const query = db
    .select({
      id: incidents.id,
      userId: incidents.userId,
      title: incidents.title,
      description: incidents.description,
      category: incidents.category,
      riskLevel: incidents.riskLevel,
      confidence: incidents.confidence,
      createdAt: incidents.createdAt,
      updatedAt: incidents.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(incidents)
    .leftJoin(users, eq(incidents.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(incidents.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);
  return query;
}

export async function countAllIncidents(filters?: {
  category?: string;
  riskLevel?: string;
  status?: string;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.category) conditions.push(eq(incidents.category, filters.category as Incident["category"]));
  if (filters?.riskLevel) conditions.push(eq(incidents.riskLevel, filters.riskLevel as Incident["riskLevel"]));
  if (filters?.status) conditions.push(eq(incidents.status, filters.status as Incident["status"]));
  if (filters?.userId) conditions.push(eq(incidents.userId, filters.userId));
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(incidents)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(result[0]?.count ?? 0);
}

export async function reclassifyIncident(id: number, category: Incident["category"], riskLevel: Incident["riskLevel"]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(incidents)
    .set({ category, riskLevel, confidence: 1.0 })
    .where(eq(incidents.id, id));
  const result = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    isActive: users.isActive,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "user" | "security-analyst" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ─── Categories CRUD ────────────────────────────────────────────────────────────
export async function listCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.name);
}
export async function createCategory(name: string, description?: string, color?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(categories).values({ name, description: description ?? "", color: color ?? "#22d3ee" });
  const result = await db.select().from(categories).where(eq(categories.name, name)).limit(1);
  return result[0];
}
export async function updateCategory(id: number, data: { name?: string; description?: string; color?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(categories).set({ ...data }).where(eq(categories.id, id));
  const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return result[0];
}
export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Hard delete: remove o registro fisicamente do banco
  await db.delete(categories).where(eq(categories.id, id));
  return { success: true };
}
export async function getGlobalStats() {
  const db = await getDb();
  if (!db) return { totalIncidents: 0, totalUsers: 0, byCategory: [], byRisk: [] };
  const [totalIncidents, totalUsers, byCategory, byRisk] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(incidents),
    db.select({ count: sql<number>`count(*)` }).from(users),
    db
      .select({ category: incidents.category, count: sql<number>`count(*)` })
      .from(incidents)
      .groupBy(incidents.category),
    db
      .select({ riskLevel: incidents.riskLevel, count: sql<number>`count(*)` })
      .from(incidents)
      .groupBy(incidents.riskLevel),
  ]);
  return {
    totalIncidents: Number(totalIncidents[0]?.count ?? 0),
    totalUsers: Number(totalUsers[0]?.count ?? 0),
    byCategory,
    byRisk,
  };
}

// ─── Status & Notes helpers ──────────────────────────────────────────────────

export async function updateIncidentStatus(
  id: number,
  userId: number,
  status: "open" | "in_progress" | "resolved",
  isAdmin: boolean = false
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const resolvedAt = status === "resolved" ? new Date() : null;
  const where = isAdmin ? eq(incidents.id, id) : and(eq(incidents.id, id), eq(incidents.userId, userId));
  await db
    .update(incidents)
    .set({ status, resolvedAt: resolvedAt ?? undefined, updatedAt: new Date() })
    .where(where!);
  return { success: true };
}

export async function updateIncidentNotes(
  id: number,
  userId: number,
  notes: string,
  isAdmin: boolean = false
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const where = isAdmin ? eq(incidents.id, id) : and(eq(incidents.id, id), eq(incidents.userId, userId));
  await db
    .update(incidents)
    .set({ notes, updatedAt: new Date() })
    .where(where!);
  return { success: true };
}

export async function getIncidentStatusStats(userId: number) {
  const db = await getDb();
  if (!db) return { open: 0, in_progress: 0, resolved: 0 };
  const rows = await db
    .select({ status: incidents.status, count: sql<number>`count(*)` })
    .from(incidents)
    .where(eq(incidents.userId, userId))
    .groupBy(incidents.status);
  const result = { open: 0, in_progress: 0, resolved: 0 };
  for (const row of rows) {
    result[row.status as keyof typeof result] = Number(row.count);
  }
  return result;
}

// ─── Full-text Search ────────────────────────────────────────────────────────
export async function searchIncidents(params: {
  query: string;
  userId?: number;  // undefined = admin search across all users
  category?: string;
  riskLevel?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const { query, userId, category, riskLevel, limit = 50 } = params;
  const searchTerm = `%${query}%`;
  const conditions = [];
  // Text match: title OR description
  conditions.push(
    or(
      like(incidents.title, searchTerm),
      like(incidents.description, searchTerm)
    )
  );
  if (userId !== undefined) conditions.push(eq(incidents.userId, userId));
  if (category) conditions.push(eq(incidents.category, category as Incident["category"]));
  if (riskLevel) conditions.push(eq(incidents.riskLevel, riskLevel as Incident["riskLevel"]));
  return db
    .select({
      id: incidents.id,
      userId: incidents.userId,
      title: incidents.title,
      description: incidents.description,
      category: incidents.category,
      riskLevel: incidents.riskLevel,
      confidence: incidents.confidence,
      status: incidents.status,
      notes: incidents.notes,
      resolvedAt: incidents.resolvedAt,
      createdAt: incidents.createdAt,
      updatedAt: incidents.updatedAt,
      userName: users.name,
    })
    .from(incidents)
    .leftJoin(users, eq(incidents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(incidents.createdAt))
    .limit(limit);
}

// ─── Incident History helpers ────────────────────────────────────────────────
export async function addIncidentHistory(entry: {
  incidentId: number;
  userId: number;
  action: "status_changed" | "notes_updated" | "category_changed" | "risk_changed" | "created";
  fromValue?: string | null;
  toValue?: string | null;
  comment?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(incidentHistory).values({
    incidentId: entry.incidentId,
    userId: entry.userId,
    action: entry.action,
    fromValue: entry.fromValue ?? null,
    toValue: entry.toValue ?? null,
    comment: entry.comment ?? null,
  });
}

export async function getIncidentHistory(incidentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: incidentHistory.id,
      incidentId: incidentHistory.incidentId,
      userId: incidentHistory.userId,
      action: incidentHistory.action,
      fromValue: incidentHistory.fromValue,
      toValue: incidentHistory.toValue,
      comment: incidentHistory.comment,
      createdAt: incidentHistory.createdAt,
      userName: users.name,
    })
    .from(incidentHistory)
    .leftJoin(users, eq(incidentHistory.userId, users.id))
    .where(eq(incidentHistory.incidentId, incidentId))
    .orderBy(desc(incidentHistory.createdAt));
}

// ─── User Management helpers (admin) ────────────────────────────────────────
export async function updateUserInfo(userId: number, data: { name?: string; email?: string }) {
  const db = await getDb();
  if (!db) return;
  const updates: Record<string, string> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.email !== undefined) updates.email = data.email;
  if (Object.keys(updates).length === 0) return;
  await db.update(users).set(updates).where(eq(users.id, userId));
}

export async function deleteUserById(userId: number) {
  const db = await getDb();
  if (!db) return;
  // Delete related data first (incidents, history)
  const userIncidents = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.userId, userId));
  for (const inc of userIncidents) {
    await db.delete(incidentHistory).where(eq(incidentHistory.incidentId, inc.id));
  }
  await db.delete(incidents).where(eq(incidents.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

export async function resetUserPassword(userId: number, newPasswordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash: newPasswordHash, mustChangePassword: true }).where(eq(users.id, userId));
}
export async function clearMustChangePassword(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));
}
export async function createPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) return;
  // Invalidate any existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
}
export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  return rows[0] ?? null;
}
export async function markTokenUsed(tokenId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenId));
}
export async function resetPasswordWithToken(userId: number, newPasswordHash: string, tokenId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash: newPasswordHash, mustChangePassword: false }).where(eq(users.id, userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenId));
}

// ─── Notifications ──────────────────────────────────────────────────────────
import { notifications, InsertNotification } from "../drizzle/schema";

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function getNotificationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));
}

export async function countUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(rows[0]?.count ?? 0);
}

// ─── Resolution Metrics ─────────────────────────────────────────────────────
export async function getResolutionMetrics() {
  const db = await getDb();
  if (!db) return null;

  // Average resolution time per category (in hours)
  const avgRows = await db
    .select({
      category: incidents.category,
      avgHours: sql<number>`AVG(TIMESTAMPDIFF(HOUR, ${incidents.createdAt}, ${incidents.resolvedAt}))`,
      count: sql<number>`COUNT(*)`,
    })
    .from(incidents)
    .where(sql`${incidents.resolvedAt} IS NOT NULL`)
    .groupBy(incidents.category);

  // Monthly trend (last 6 months)
  const trendRows = await db
    .select({
      month: sql<string>`DATE_FORMAT(${incidents.createdAt}, '%Y-%m')`,
      total: sql<number>`COUNT(*)`,
      resolved: sql<number>`SUM(CASE WHEN ${incidents.status} = 'resolved' THEN 1 ELSE 0 END)`,
    })
    .from(incidents)
    .where(sql`${incidents.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`)
    .groupBy(sql`DATE_FORMAT(${incidents.createdAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${incidents.createdAt}, '%Y-%m')`);

  // Reopened incidents (status went from resolved back to open/in_progress)
  const reopenedRows = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${incidentHistory.incidentId})` })
    .from(incidentHistory)
    .where(
      and(
        eq(incidentHistory.action, "status_changed"),
        eq(incidentHistory.fromValue, "resolved")
      )
    );

  // Total resolved
  const totalResolvedRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(incidents)
    .where(eq(incidents.status, "resolved"));

  return {
    avgByCategory: avgRows.map((r) => ({
      category: r.category,
      avgHours: Number(r.avgHours ?? 0),
      count: Number(r.count ?? 0),
    })),
    monthlyTrend: trendRows.map((r) => ({
      month: r.month,
      total: Number(r.total ?? 0),
      resolved: Number(r.resolved ?? 0),
    })),
    reopenedCount: Number(reopenedRows[0]?.count ?? 0),
    totalResolved: Number(totalResolvedRows[0]?.count ?? 0),
  };
}

// ─── History CSV Export ─────────────────────────────────────────────────────
export async function getAllIncidentHistoryForExport() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      historyId: incidentHistory.id,
      incidentId: incidentHistory.incidentId,
      action: incidentHistory.action,
      fromValue: incidentHistory.fromValue,
      toValue: incidentHistory.toValue,
      comment: incidentHistory.comment,
      changedAt: incidentHistory.createdAt,
      changedBy: users.name,
      changedByEmail: users.email,
      incidentTitle: incidents.title,
      incidentCategory: incidents.category,
      incidentStatus: incidents.status,
    })
    .from(incidentHistory)
    .leftJoin(users, eq(incidentHistory.userId, users.id))
    .leftJoin(incidents, eq(incidentHistory.incidentId, incidents.id))
    .orderBy(desc(incidentHistory.createdAt));
}

// ─── Reclassificação ML em Massa ──────────────────────────────────────────────────────
/**
 * Atualiza categoria, riskLevel e confidence de um incidente após reclassificação pelo ML.
 * Diferente de reclassifyIncident (admin manual), esta função preserva a confiança real do modelo.
 */
export async function updateIncidentML(
  id: number,
  category: Incident["category"],
  riskLevel: Incident["riskLevel"],
  confidence: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(incidents)
    .set({ category, riskLevel, confidence, updatedAt: new Date() })
    .where(eq(incidents.id, id));
}

/**
 * Retorna todos os incidentes (id + title + description) para reclassificação em massa.
 * Sem paginação — usado apenas pelo processo de retreinamento automático.
 */
export async function getAllIncidentsForReclassify() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: incidents.id,
    title: incidents.title,
    description: incidents.description,
    category: incidents.category,
  }).from(incidents).orderBy(incidents.id);
}

/**
 * Retorna todos os usuários com um determinado role.
 * Usado para enviar notificações a todos os analistas quando incidente crítico é criado.
 */
export async function getUsersByRole(role: "user" | "security-analyst" | "admin") {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
  }).from(users).where(eq(users.role, role));
}

/**
 * Retorna métricas do dashboard do analista.
 */
export async function getAnalystDashboardMetrics() {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  const allIncidents = await db.select({
    id: incidents.id,
    status: incidents.status,
    category: incidents.category,
    riskLevel: incidents.riskLevel,
    createdAt: incidents.createdAt,
    updatedAt: incidents.updatedAt,
  }).from(incidents);

  const inProgress = allIncidents.filter(i => i.status === "in_progress").length;
  const resolvedToday = allIncidents.filter(i =>
    i.status === "resolved" && i.updatedAt >= todayStart
  ).length;
  const totalOpen = allIncidents.filter(i => i.status === "open").length;
  const totalResolved = allIncidents.filter(i => i.status === "resolved").length;

  // Distribuição por categoria dos incidentes em andamento
  const categoryDist: Record<string, number> = {};
  for (const inc of allIncidents.filter(i => i.status === "in_progress")) {
    categoryDist[inc.category] = (categoryDist[inc.category] ?? 0) + 1;
  }

  // Distribuição por risco dos incidentes abertos
  const riskDist: Record<string, number> = {};
  for (const inc of allIncidents.filter(i => i.status === "open")) {
    riskDist[inc.riskLevel] = (riskDist[inc.riskLevel] ?? 0) + 1;
  }

  // Tempo médio de resolução
  const resolved = allIncidents.filter(i => i.status === "resolved" && i.updatedAt && i.createdAt);
  let avgResolutionHours = 0;
  if (resolved.length > 0) {
    const totalMs = resolved.reduce((sum, i) => sum + (i.updatedAt.getTime() - i.createdAt.getTime()), 0);
    avgResolutionHours = Math.round((totalMs / resolved.length) / (1000 * 60 * 60) * 10) / 10;
  }

  return {
    inProgress,
    resolvedToday,
    totalOpen,
    totalResolved,
    avgResolutionHours,
    categoryDistribution: categoryDist,
    riskDistribution: riskDist,
    total: allIncidents.length,
  };
}
