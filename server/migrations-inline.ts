// ── Inlined boot migrations (post-0009 DDL) ──────────────────────────────────
// The production Docker image ships only dist/ — migrations/*.sql is not on
// disk there, and the dev runner (tsx) cannot import .sql files directly
// (ERR_UNKNOWN_FILE_EXTENSION). So the DDL for every migration NEWER than what
// production already runs is embedded here verbatim and executed idempotently
// at boot by server/boot-migrate.ts.
//
// ⚠️ MIGRATIONS ARE IMMUTABLE: once a migration has shipped, its text must
// never be edited — fix-forward with a new migration instead. Keep this file
// byte-identical to migrations/0010_*.sql and 0011_*.sql (drizzle-kit remains
// the source of truth for dev; this mirror exists purely so `node dist/index.js`
// can self-heal a pre-beta production database on first boot).

export const M0010_BETA_TRUST_INFRA = `
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rules_acknowledged_at" timestamp;

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
`;

export const M0011_SURVEY_INFRA = `
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

CREATE INDEX IF NOT EXISTS "survey_records_user_idx" ON "survey_records" ("user_id");
CREATE INDEX IF NOT EXISTS "survey_records_user_created_idx" ON "survey_records" ("user_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_survey_network_tx"
  ON "survey_records" ("network_id", "transaction_id")
  WHERE "transaction_id" IS NOT NULL;
`;

export const M0012_TOTP_2FA = `
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_pending_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled" boolean NOT NULL DEFAULT false;
`;

// ── REAL PKR ECONOMY v4 ───────────────────────────────────────────────────────
// Adds the pending → available verification lifecycle to the immutable PKR
// ledger and settlement status to both referral commission tables.
// Legacy rows default to terminal states ('verified' / 'finalized' / 'paid')
// because the old model credited balances instantly — no backfill needed
// beyond the column defaults.
export const M0013_REAL_PKR_ECONOMY = `
ALTER TABLE "user_transactions" ADD COLUMN IF NOT EXISTS "verification_status" text NOT NULL DEFAULT 'verified';
ALTER TABLE "user_transactions" ADD COLUMN IF NOT EXISTS "verified_at" timestamp;
ALTER TABLE "user_transactions" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
CREATE INDEX IF NOT EXISTS "idx_user_transactions_verification" ON "user_transactions" ("verification_status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_user_transactions_user_verification" ON "user_transactions" ("user_id", "verification_status");

ALTER TABLE "referral_earn_commissions" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'finalized';
ALTER TABLE "referral_commissions" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'paid';
CREATE INDEX IF NOT EXISTS "idx_ref_commissions_status" ON "referral_commissions" ("referrer_id", "status");

-- New economy defaults (idempotent inserts; existing values are preserved)
INSERT INTO "system_config" ("id", "key", "value", "description")
  VALUES (gen_random_uuid(), 'TX_POINTS_PER_PKR', '10'::jsonb, 'Fixed TX-Points per Rs.1 (default 10 points = Rs.1). Single conversion rate for the whole platform.')
  ON CONFLICT ("key") DO NOTHING;
INSERT INTO "system_config" ("id", "key", "value", "description")
  VALUES (gen_random_uuid(), 'TASK_SPLIT_THORX_PCT', '40'::jsonb, 'Direct-user task revenue: Thorx share % (user keeps the remainder)')
  ON CONFLICT ("key") DO NOTHING;
INSERT INTO "system_config" ("id", "key", "value", "description")
  VALUES (gen_random_uuid(), 'TASK_SPLIT_THORX_REFERRED_PCT', '35'::jsonb, 'Referred-user task revenue: Thorx share %')
  ON CONFLICT ("key") DO NOTHING;
INSERT INTO "system_config" ("id", "key", "value", "description")
  VALUES (gen_random_uuid(), 'TASK_SPLIT_REFERRER_PCT', '5'::jsonb, 'Referred-user task revenue: referrer commission % (paid as PKR only, pending until verified)')
  ON CONFLICT ("key") DO NOTHING;
INSERT INTO "system_config" ("id", "key", "value", "description")
  VALUES (gen_random_uuid(), 'PENDING_VERIFICATION_HOURS', '48'::jsonb, 'Hours an earning stays in Pending Balance before auto-verification moves it to Available Balance (max target 2 days)')
  ON CONFLICT ("key") DO NOTHING;

-- Minimum payout raised to Rs.500 per the v4 spec (force-update — this is a
-- product decision, not a per-install preference)
UPDATE "system_config" SET "value" = '500'::jsonb,
  "description" = 'Minimum Available PKR balance required to request a payout'
  WHERE "key" = 'MIN_PAYOUT';
`;
