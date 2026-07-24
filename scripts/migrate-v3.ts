#!/usr/bin/env tsx
/**
 * THORX v3 Migration Script (spec K.2)
 *
 * Idempotent: uses ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS so
 * it is safe to run on fresh or existing databases. All statements are wrapped
 * in a transaction; any single failure rolls everything back.
 *
 * Usage (dev):
 *   npx tsx scripts/migrate-v3.ts
 *
 * Environment:
 *   DATABASE_URL must be set (same as the main app).
 */

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrations: { label: string; sql: string }[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // USERS TABLE — new v3 columns
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "users: add userRankTier",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS user_rank_tier text NOT NULL DEFAULT 'E-Rank'`,
  },
  {
    label: "users: add guildRole",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS guild_role text NOT NULL DEFAULT 'simple'`,
  },
  {
    label: "users: add guildId",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS guild_id varchar REFERENCES guilds(id) ON DELETE SET NULL`,
  },
  {
    label: "users: add lastActiveAt",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamp`,
  },
  {
    label: "users: add balanceCashPkr",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_cash_pkr decimal(12,2) NOT NULL DEFAULT 0 CHECK (balance_cash_pkr >= 0)`,
  },
  {
    label: "users: add performanceScore",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS performance_score decimal(10,2) NOT NULL DEFAULT 0`,
  },
  {
    label: "users: add psPoints",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS ps_points integer NOT NULL DEFAULT 0`,
  },
  {
    label: "users: add rankLocked",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS rank_locked boolean NOT NULL DEFAULT false`,
  },
  {
    label: "users: add identity",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS identity varchar`,
  },
  {
    label: "users: add verificationTokenExpiresAt",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at timestamp`,
  },
  {
    label: "users: add avatar",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text DEFAULT 'default'`,
  },
  {
    label: "users: add rank",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS rank text DEFAULT 'Nawa Aya'`,
  },
  {
    label: "users: add trust status fields",
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS trust_status text,
        ADD COLUMN IF NOT EXISTS trust_reason text`,
  },
  {
    label: "users: add profile and verification fields",
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS profile_picture text,
        ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS email_verified_at timestamp`,
  },
  {
    label: "users: add guild profile fields",
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS personal_rank text DEFAULT 'E',
        ADD COLUMN IF NOT EXISTS guild_contribution_score integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tx_points_balance integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS streak_days integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_streak_date date,
        ADD COLUMN IF NOT EXISTS inactivity_penalty_at timestamp`,
  },
  {
    label: "withdrawals: add referral fee accounting",
    sql: `
      ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS thorx_fee_share numeric(10,2) DEFAULT '0.00',
        ADD COLUMN IF NOT EXISTS referral_commission_paid numeric(10,2) DEFAULT '0.00'`,
  },
  {
    label: "audit_logs: add current audit fields",
    sql: `
      ALTER TABLE audit_logs
        ADD COLUMN IF NOT EXISTS admin_id varchar,
        ADD COLUMN IF NOT EXISTS target_type text,
        ADD COLUMN IF NOT EXISTS target_id varchar,
        ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE audit_logs
        ALTER COLUMN entity_type SET DEFAULT 'system'`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // GUILDS TABLE — new v3 columns
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "guilds: add guildGps",
    sql: `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS guild_gps integer NOT NULL DEFAULT 0`,
  },
  {
    label: "guilds: add guildRankTier (targetDifficulty)",
    sql: `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS target_difficulty varchar DEFAULT 'E-Rank'`,
  },
  {
    label: "guilds: add weeklyTarget",
    sql: `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS weekly_target integer NOT NULL DEFAULT 20000`,
  },
  {
    label: "guilds: add weeklyProgress",
    sql: `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS weekly_progress integer NOT NULL DEFAULT 0`,
  },
  {
    label: "guilds: add poolBalance",
    sql: `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS pool_balance decimal(12,4) NOT NULL DEFAULT 0`,
  },
  {
    label: "guilds: add pinnedMemberId",
    sql: `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS pinned_member_id varchar`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // GUILD MEMBERS TABLE — new v3 columns
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "guild_members: add coverLetter",
    sql: `ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS cover_letter text`,
  },
  {
    label: "guild_members: add rejectionReason",
    sql: `ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS rejection_reason text`,
  },
  {
    label: "guild_members: add isMvp",
    sql: `ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS is_mvp boolean NOT NULL DEFAULT false`,
  },
  {
    label: "guild_members: add nudgedAt",
    sql: `ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS nudged_at timestamp`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LEADERBOARD CACHE — new v3 columns
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "leaderboard_cache: add userRankTier",
    sql: `ALTER TABLE leaderboard_cache ADD COLUMN IF NOT EXISTS user_rank_tier varchar DEFAULT 'E-Rank'`,
  },
  {
    label: "leaderboard_cache: add guildRole",
    sql: `ALTER TABLE leaderboard_cache ADD COLUMN IF NOT EXISTS guild_role varchar DEFAULT 'simple'`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // NEW v3 TABLES (CREATE IF NOT EXISTS)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "create user_transactions",
    sql: `
      CREATE TABLE IF NOT EXISTS user_transactions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        engine_type text NOT NULL,
        points_credited integer NOT NULL,
        real_pkr_value decimal(10,4) NOT NULL,
        gross_pkr decimal(10,4),
        thorx_profit_pkr decimal(10,4),
        guild_pool_pkr decimal(10,4),
        conversion_rate integer NOT NULL,
        card_variance decimal(5,4) NOT NULL,
        source_id varchar,
        source_type text,
        withdrawn boolean NOT NULL DEFAULT false,
        withdrawal_id varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create referral_commissions",
    sql: `
      CREATE TABLE IF NOT EXISTS referral_commissions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id varchar NOT NULL REFERENCES users(id),
        invitee_id varchar NOT NULL REFERENCES users(id),
        withdrawal_id varchar NOT NULL REFERENCES withdrawals(id),
        commission_amount_pkr decimal(10,2) NOT NULL,
        invitee_net_pkr decimal(10,2) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create activity_feed",
    sql: `
      CREATE TABLE IF NOT EXISTS activity_feed (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type text NOT NULL,
        user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        guild_id varchar,
        display_message text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}',
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create captain_messages",
    sql: `
      CREATE TABLE IF NOT EXISTS captain_messages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id varchar NOT NULL,
        sender_id varchar NOT NULL REFERENCES users(id),
        recipient_id varchar NOT NULL REFERENCES users(id),
        content text NOT NULL,
        read boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create guild_weekly_snapshots",
    sql: `
      CREATE TABLE IF NOT EXISTS guild_weekly_snapshots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id varchar NOT NULL,
        week_start timestamp NOT NULL,
        week_end timestamp NOT NULL,
        total_points integer NOT NULL DEFAULT 0,
        pool_earned_pkr decimal(10,4) NOT NULL DEFAULT 0,
        target_achieved boolean NOT NULL DEFAULT false,
        members_snapshot jsonb NOT NULL DEFAULT '[]',
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create weekly_tasks",
    sql: `
      CREATE TABLE IF NOT EXISTS weekly_tasks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        description text,
        points_reward integer NOT NULL DEFAULT 0,
        task_category text NOT NULL DEFAULT 'indirect',
        gross_pkr_per_completion decimal(10,4),
        is_active boolean NOT NULL DEFAULT true,
        expires_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create weekly_task_records",
    sql: `
      CREATE TABLE IF NOT EXISTS weekly_task_records (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guild_id varchar NOT NULL,
        task_id varchar NOT NULL REFERENCES weekly_tasks(id),
        completed_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create score_history",
    sql: `
      CREATE TABLE IF NOT EXISTS score_history (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        performance_score decimal(10,2) NOT NULL,
        risk_score decimal(10,2) NOT NULL DEFAULT 0,
        earnings_score decimal(10,2) NOT NULL DEFAULT 0,
        team_score decimal(10,2) NOT NULL DEFAULT 0,
        active_score decimal(10,2) NOT NULL DEFAULT 0,
        health_score decimal(10,2) NOT NULL DEFAULT 0,
        snapshot_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create audit_logs",
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id varchar NOT NULL,
        action text NOT NULL,
        target_type text NOT NULL,
        target_id text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}',
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create risk_cases",
    sql: `
      CREATE TABLE IF NOT EXISTS risk_cases (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        risk_score decimal(10,2) NOT NULL DEFAULT 0,
        severity text NOT NULL DEFAULT 'Low',
        signals jsonb NOT NULL DEFAULT '[]',
        last_computed_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },
  {
    label: "create guild_strikes",
    sql: `
      CREATE TABLE IF NOT EXISTS guild_strikes (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id varchar NOT NULL,
        reason text NOT NULL,
        source text NOT NULL DEFAULT 'admin',
        added_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // INDEXES on new tables (idempotent via IF NOT EXISTS)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "index: user_transactions(user_id, created_at)",
    sql: `CREATE INDEX IF NOT EXISTS idx_user_transactions_user_created ON user_transactions(user_id, created_at)`,
  },
  {
    label: "index: user_transactions(user_id, withdrawn)",
    sql: `CREATE INDEX IF NOT EXISTS idx_user_transactions_user_withdrawn ON user_transactions(user_id, withdrawn)`,
  },
  {
    label: "index: activity_feed(created_at)",
    sql: `CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON activity_feed(created_at)`,
  },
  {
    label: "index: score_history(user_id, snapshot_at)",
    sql: `CREATE INDEX IF NOT EXISTS idx_score_history_user_snapshot ON score_history(user_id, snapshot_at)`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // DATA BACKFILLS
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "backfill: lastActiveAt from lastLoginDate",
    sql: `
      UPDATE users
      SET last_active_at = last_login_date
      WHERE last_active_at IS NULL AND last_login_date IS NOT NULL`,
  },
  {
    label: "backfill: lastActiveAt = createdAt where still null",
    sql: `
      UPDATE users
      SET last_active_at = created_at
      WHERE last_active_at IS NULL`,
  },
  {
    label: "backfill: userRankTier from rank (Urdu → tier)",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'rank'
        ) THEN
          UPDATE users SET user_rank_tier =
            CASE rank
              WHEN 'Nawa Aya'        THEN 'E-Rank'
              WHEN 'Chota Don'       THEN 'D-Rank'
              WHEN 'Bawa Ji'         THEN 'C-Rank'
              WHEN 'Baja Ji'         THEN 'B-Rank'
              WHEN 'Haji Sab'        THEN 'B-Rank'
              WHEN 'Chacha Supreme'  THEN 'A-Rank'
              WHEN 'Supreme Chacha'  THEN 'A-Rank'
              WHEN 'Chacha Ji'       THEN 'S-Rank'
              ELSE user_rank_tier
            END
          WHERE user_rank_tier = 'E-Rank' AND rank IS NOT NULL;
        END IF;
      END $$`,
  },
];

async function run() {
  const client = await pool.connect();
  try {
    console.log(`\n🚀  THORX v3 Migration — ${migrations.length} steps\n`);
    await client.query("BEGIN");

    for (const { label, sql } of migrations) {
      process.stdout.write(`  • ${label} ... `);
      await client.query(sql);
      console.log("✅");
    }

    await client.query("COMMIT");
    console.log("\n✅  All migrations committed successfully.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌  Migration FAILED — rolled back.\n", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
