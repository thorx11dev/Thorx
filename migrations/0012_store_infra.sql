-- Migration: THORX Store — design-system marketplace infrastructure
-- Description:
--   1. store_items — catalog metadata (themes + component variants). Visual
--      definitions live in the validated client registry; this table is the
--      admin-managed marketplace (price/status/order). ref_key must match a
--      registry key — validated server-side on create.
--   2. user_store_items — ownership (UNIQUE per user+item: double purchase
--      impossible at the index level, even under concurrent retries).
--   3. user_customization — activation state (owned ≠ active): one row per
--      user, active theme + per-component-type active variant map.
--   4. store_transactions — TX-Points spend ledger (audit trail; the
--      authoritative balance is users.tx_points_balance; earn/withdraw
--      ledger user_transactions is deliberately untouched).
-- All statements idempotent (IF NOT EXISTS) — safe on any database.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "store_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_type" text NOT NULL,
  "ref_key" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "category" text NOT NULL DEFAULT 'general',
  "price_points" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft',
  "featured" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 100,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_store_items_ref_key" UNIQUE ("ref_key")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "store_items_type_status_idx" ON "store_items" ("item_type", "status");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_store_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_id" varchar NOT NULL REFERENCES "store_items"("id") ON DELETE CASCADE,
  "purchased_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_user_store_items" UNIQUE ("user_id", "item_id")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_store_items_user_idx" ON "user_store_items" ("user_id");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_customization" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "active_theme_item_id" varchar REFERENCES "store_items"("id") ON DELETE SET NULL,
  "active_components_json" jsonb NOT NULL DEFAULT '{}',
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "store_transactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_id" varchar NOT NULL REFERENCES "store_items"("id") ON DELETE RESTRICT,
  "price_points" integer NOT NULL,
  "idempotency_key" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_store_transactions_idem" UNIQUE ("user_id", "idempotency_key")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "store_transactions_user_idx" ON "store_transactions" ("user_id", "created_at");
