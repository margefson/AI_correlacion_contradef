import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  float,
} from "drizzle-orm/mysql-core";

// ─── Users ─────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "security-analyst", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Incidents ─────────────────────────────────────────────────────────────
export const incidents = mysqlTable("incidents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: mysqlEnum("category", [
    "phishing",
    "malware",
    "brute_force",
    "ddos",
    "vazamento_de_dados",
    "engenharia_social",
    "unknown",
  ])
    .default("unknown")
    .notNull(),
  riskLevel: mysqlEnum("riskLevel", ["critical", "high", "medium", "low"])
    .default("medium")
    .notNull(),
  confidence: float("confidence").default(0),
  status: mysqlEnum("status", ["open", "in_progress", "resolved"]).default("open").notNull(),
  notes: text("notes"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;
// ─── Categories ────────────────────────────────────────────────────────────
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 32 }).default("#22d3ee"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

// ─── Incident History ────────────────────────────────────────────────────────
export const incidentHistory = mysqlTable("incident_history", {
  id: int("id").autoincrement().primaryKey(),
  incidentId: int("incidentId").notNull(),
  userId: int("userId").notNull(),           // who made the change
  action: mysqlEnum("action", [
    "status_changed",
    "notes_updated",
    "category_changed",
    "risk_changed",
    "created",
  ]).notNull(),
  fromValue: varchar("fromValue", { length: 255 }),  // previous value
  toValue: varchar("toValue", { length: 255 }),      // new value
  comment: text("comment"),                          // optional free-text note
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type IncidentHistory = typeof incidentHistory.$inferSelect;
export type InsertIncidentHistory = typeof incidentHistory.$inferInsert;
// ─── In-App Notifications ─────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // recipient user
  type: mysqlEnum("type", [
    "reclassification",
    "status_changed",
    "risk_changed",
    "system",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  incidentId: int("incidentId"),             // optional link to incident
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Password Reset Tokens ──────────────────────────────────────────────────
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
