import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

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
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** Hashed password for email/password authentication */
  passwordHash: text("passwordHash"),
  /** Email verification status */
  emailVerified: boolean("emailVerified").default(false).notNull(),
  /** Email verification token */
  emailVerificationToken: varchar("emailVerificationToken", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Email verification codes table for tracking verification requests
 */
export const emailVerificationCodes = mysqlTable("emailVerificationCodes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  code: varchar("code", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;
export type InsertEmailVerificationCode = typeof emailVerificationCodes.$inferInsert;

/**
 * Meetings table to store meeting metadata
 */
export const meetings = mysqlTable("meetings", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: varchar("meetingId", { length: 32 }).notNull().unique(), // Unique meeting identifier (e.g., "abc-def-ghi")
  hostId: int("hostId").notNull(), // Reference to users table
  title: text("title"),
  status: mysqlEnum("status", ["active", "ended"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
});

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;

/**
 * Participants table to track who is in each meeting
 */
export const participants = mysqlTable("participants", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(), // Reference to meetings table
  userId: int("userId"), // Reference to users table (nullable for anonymous users)
  displayName: varchar("displayName", { length: 255 }).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  leftAt: timestamp("leftAt"),
  audioEnabled: int("audioEnabled").default(1).notNull(), // 1 = true, 0 = false
  videoEnabled: int("videoEnabled").default(1).notNull(), // 1 = true, 0 = false
});

export type Participant = typeof participants.$inferSelect;
export type InsertParticipant = typeof participants.$inferInsert;
