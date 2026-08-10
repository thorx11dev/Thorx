-- Migration: Add indexes for Ranking and Referral Systems
-- Created: 2026-01-20
-- Description: Adds performance indexes for rank and commission queries

-- Add index on users.user_rank_tier for faster rank-based queries
-- (the users table stores rank as user_rank_tier; the old users.rank
--  column no longer exists in the schema).
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(user_rank_tier);

-- Add index on commission_logs.level for faster level-based queries
CREATE INDEX IF NOT EXISTS idx_commission_logs_level ON commission_logs(level);

-- Add composite index on commission_logs for beneficiary + status queries
CREATE INDEX IF NOT EXISTS idx_commission_logs_beneficiary_status 
ON commission_logs(beneficiary_id, status);

-- Add composite index on commission_logs for beneficiary + level queries
CREATE INDEX IF NOT EXISTS idx_commission_logs_beneficiary_level 
ON commission_logs(beneficiary_id, level);

-- Add index on rank_logs.created_at for faster history queries
CREATE INDEX IF NOT EXISTS idx_rank_logs_created_at ON rank_logs(created_at DESC);

-- Add composite index on referrals for tier-based queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_tier 
ON referrals(referrer_id, tier);
