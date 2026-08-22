-- Migration: Beta trust infrastructure (invite codes + feedback inbox + rules ack)
-- Created: 2026-08-22
-- Description:
--   1. users.rules_acknowledged_at  — set when a user accepts the honesty-rules
--                                     screen (anti-fraud Layer 1).
--   2. beta_invites                 — single-use / batch invite codes gating
--                                     registration while BETA_INVITE_REQUIRED=true
--                                     (controlled 1000-user beta cap).
--   3. feedback_messages            — user feedback inbox surfaced in the
--                                     Team Portal (beta review loop).
-- All statements are idempotent (IF NOT EXISTS) and safe on any database.

--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rules_acknowledged_at" timestamp;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "beta_invites" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "note" text,
  "max_uses" integer NOT NULL DEFAULT 1,
  "use_count" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_email" text,
  "consumed_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_beta_invites_active" ON "beta_invites" ("is_active");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "feedback_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" text NOT NULL DEFAULT 'general',
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "admin_response" text,
  "handled_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_feedback_user" ON "feedback_messages" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_feedback_status" ON "feedback_messages" ("status", "created_at");
