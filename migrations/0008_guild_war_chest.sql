-- Migration: Guild Wars — self-funded war chest + prize snapshot (halal prize model)
-- Created: 2026-08-09
-- Description:
--   guilds.war_chest_pkr    — pot funded ONLY while a guild is in an active war,
--                             from a small per-engine % of gross routed from
--                             THORX's revenue cut (never user earnings). The war
--                             winner takes both guilds' chests as the prize.
--   guild_wars.prize_pkr    — Rs. moved into the winner's Sunday pool at
--                             resolution (both chests), or returned to guilds'
--                             own pools on a draw. Stored for UI display after
--                             the chests are zeroed.

ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "war_chest_pkr" numeric(12, 4) NOT NULL DEFAULT '0.0000';

ALTER TABLE "guild_wars" ADD COLUMN IF NOT EXISTS "prize_pkr" numeric(14, 4) NOT NULL DEFAULT '0.0000';
