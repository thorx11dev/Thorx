-- Migration: Engine B survey infrastructure (CPX Research / BitLabs waterfall)
-- Created: 2026-08-22
-- Description:
--   1. survey_records — one row per user survey interaction with an external
--      survey network. Credited via signed S2S callbacks into recordEarnEvent
--      (Engine_B), so splits / referral commissions / PS / rank gates all flow
--      through the existing ledger pipeline untouched.
--   2. uniq_survey_network_tx — partial unique index making a vendor
--      transaction id impossible to credit twice on the same network, even
--      under concurrent callback retries (BitLabs retries up to 10x until a
--      200 is received). Drizzle-kit cannot express partial unique indexes
--      natively — same pattern as uniq_user_transactions_source (0006).
-- All statements are idempotent (IF NOT EXISTS) and safe on any database.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "survey_records" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "network_id" text NOT NULL,
  "transaction_id" text,
  "status" text NOT NULL DEFAULT 'started',
  "reward_usd" numeric(10, 4),
  "gross_pkr" numeric(10, 4),
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_records_user_idx" ON "survey_records" ("user_id");
CREATE INDEX IF NOT EXISTS "survey_records_user_created_idx" ON "survey_records" ("user_id", "created_at");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_survey_network_tx"
  ON "survey_records" ("network_id", "transaction_id")
  WHERE "transaction_id" IS NOT NULL;
