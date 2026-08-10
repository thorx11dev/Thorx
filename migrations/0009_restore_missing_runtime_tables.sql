-- Migration: Restore runtime tables missing from the live database
-- Created: 2026-08-10
-- Description:
--   The live database is missing three tables the application writes to at
--   runtime. Every write to them fails with SQLSTATE 42P01 "relation does not
--   exist":
--     notifications  — guild application accept, war events, payout updates
--     audit_logs     — admin/team action ledger (deep activity tracking)
--     webhook_events — ad-network webhook replay protection + audit
--   This migration recreates them from the canonical @shared/schema.ts
--   definitions, idempotently (IF NOT EXISTS), so it is safe on any database
--   (fresh or already fixed).

--> statement-breakpoint

-- ── notifications (shared/schema.ts: notifications) ─────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info',
	"admin_name" text,
	"admin_role" text,
	"amount" numeric(10, 2),
	"adjustment_type" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" ("type");
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx" ON "notifications" ("user_id", "is_read");

--> statement-breakpoint

-- ── audit_logs (shared/schema.ts: auditLogs) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL REFERENCES "users"("id"),
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"details" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"ip_address" text,
	"category" text NOT NULL DEFAULT 'team',
	"actor_role" text,
	"user_agent" text,
	"device_type" text,
	"browser" text,
	"os" text,
	"country" text,
	"city" text,
	"created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_logs_admin_id_idx" ON "audit_logs" ("admin_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_target_type_idx" ON "audit_logs" ("target_type");
CREATE INDEX IF NOT EXISTS "audit_logs_target_id_idx" ON "audit_logs" ("target_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_target_user_created_idx" ON "audit_logs" ("target_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_category_created_idx" ON "audit_logs" ("category", "created_at");

--> statement-breakpoint

-- ── webhook_events (shared/schema.ts: webhookEvents) ────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_id" varchar NOT NULL,
	"event_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"signature" text,
	"verification_status" text NOT NULL DEFAULT 'pending',
	"user_id" varchar REFERENCES "users"("id") ON DELETE set null,
	"ip_address" text NOT NULL DEFAULT '',
	"reward_triggered" boolean NOT NULL DEFAULT false,
	"processed_at" timestamp,
	"created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_webhook_events_unique" ON "webhook_events" ("network_id", "event_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_events_status" ON "webhook_events" ("verification_status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_webhook_events_user" ON "webhook_events" ("user_id", "created_at");
