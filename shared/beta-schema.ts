// ── THORX Beta Trust Infrastructure ──────────────────────────────────────────
// Standalone Drizzle module (kept out of the main schema.ts to avoid churn in
// the 1700-line core file; drizzle happily spans multiple modules).
//
//   1. betaInvites      — single-use / batch invite codes gating registration
//                         while BETA_INVITE_REQUIRED=true (1000-user beta cap).
//   2. feedbackMessages — "Send Feedback" inbox: every user report lands here
//                         and is triaged from the Team Portal.

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { users } from "@shared/schema";

export const FEEDBACK_CATEGORIES = [
  "general",
  "bug",
  "payout",
  "ad_issue",
  "survey_issue",
  "suggestion",
] as const;

export const betaInvites = pgTable(
  "beta_invites",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    note: text("note"), // e.g. "WhatsApp batch #1"
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdByEmail: text("created_by_email"),
    consumedByUserId: varchar("consumed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_beta_invites_active").on(table.isActive)],
);
export type BetaInvite = typeof betaInvites.$inferSelect;
export type InsertBetaInvite = typeof betaInvites.$inferInsert;

export const feedbackMessages = pgTable(
  "feedback_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("general"),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"), // open | triaged | resolved
    adminResponse: text("admin_response"),
    handledBy: varchar("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_feedback_user").on(table.userId, table.createdAt),
    index("idx_feedback_status").on(table.status, table.createdAt),
  ],
);
export type FeedbackMessage = typeof feedbackMessages.$inferSelect;
export type InsertFeedbackMessage = typeof feedbackMessages.$inferInsert;
