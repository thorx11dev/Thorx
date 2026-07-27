// THORX v3 — Guild Performance Score (GPS) engine (Part E.3 of the v3 spec).
// GPS is the guild-level analogue of PS: sole input to guildRankTier,
// accumulated from a % of member point contributions plus milestone/MVP
// bonuses. Mirrors ps-engine.ts's structure.

import { db } from "../db";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { guilds, rankLogs } from "@shared/schema";
import { storage } from "../storage";
import Decimal from "decimal.js";

const GUILD_RANK_TIERS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"] as const;
export type GuildRankTier = (typeof GUILD_RANK_TIERS)[number];

// `tx` (optional) lets recordEarnEvent run this inside its own transaction —
// see the matching note in ps-engine.ts. Typed `any` for the same reason.
type DbClient = any;

// Batch-fetch all GPS / weekly-target config keys in a single DB round-trip.
// Replaces 11 sequential `await cfg()` calls in checkAndUpdateGuildRankTier.
async function fetchGpsConfig(): Promise<{
  pct: number;
  milestone: number;
  mvpBonus: number;
  rankMins: Record<string, number>;
  weeklyTargets: Record<string, number>;
}> {
  const keys = [
    "GPS_MEMBER_POINTS_PCT",
    "GPS_MILESTONE_BONUS",
    "GPS_MVP_BONUS",
    "GPS_RANK_D_MIN",
    "GPS_RANK_C_MIN",
    "GPS_RANK_B_MIN",
    "GPS_RANK_A_MIN",
    "GPS_RANK_S_MIN",
    "WEEKLY_TARGET_E_RANK",
    "WEEKLY_TARGET_D_RANK",
    "WEEKLY_TARGET_C_RANK",
    "WEEKLY_TARGET_B_RANK",
    "WEEKLY_TARGET_A_RANK",
    "WEEKLY_TARGET_S_RANK",
  ];

  // Fetch all keys concurrently — one Promise.all round instead of 11 awaits.
  const [pct, milestone, mvpBonus,
    rankD, rankC, rankB, rankA, rankS,
    wtE, wtD, wtC, wtB, wtA, wtS,
  ] = await Promise.all([
    storage.getSystemConfigValue<number>("GPS_MEMBER_POINTS_PCT", 10),
    storage.getSystemConfigValue<number>("GPS_MILESTONE_BONUS", 1000),
    storage.getSystemConfigValue<number>("GPS_MVP_BONUS", 200),
    storage.getSystemConfigValue<number>("GPS_RANK_D_MIN", 10000),
    storage.getSystemConfigValue<number>("GPS_RANK_C_MIN", 30000),
    storage.getSystemConfigValue<number>("GPS_RANK_B_MIN", 70000),
    storage.getSystemConfigValue<number>("GPS_RANK_A_MIN", 150000),
    storage.getSystemConfigValue<number>("GPS_RANK_S_MIN", 300000),
    storage.getSystemConfigValue<number>("WEEKLY_TARGET_E_RANK", 20000),
    storage.getSystemConfigValue<number>("WEEKLY_TARGET_D_RANK", 50000),
    storage.getSystemConfigValue<number>("WEEKLY_TARGET_C_RANK", 100000),
    storage.getSystemConfigValue<number>("WEEKLY_TARGET_B_RANK", 200000),
    storage.getSystemConfigValue<number>("WEEKLY_TARGET_A_RANK", 350000),
    storage.getSystemConfigValue<number>("WEEKLY_TARGET_S_RANK", 500000),
  ]);

  return {
    pct,
    milestone,
    mvpBonus,
    rankMins: { GPS_RANK_D_MIN: rankD, GPS_RANK_C_MIN: rankC, GPS_RANK_B_MIN: rankB, GPS_RANK_A_MIN: rankA, GPS_RANK_S_MIN: rankS },
    weeklyTargets: { "E-Rank": wtE, "D-Rank": wtD, "C-Rank": wtC, "B-Rank": wtB, "A-Rank": wtA, "S-Rank": wtS },
  };
}

// Called whenever a member earns points via Engine C (or any engine, per
// spec's "member contributes toward guild" rule) — awards a % of the raw
// points to the guild's GPS and weekly point total.
// 1.1d: Use Decimal for GPS award to eliminate float precision drift.
export async function awardMemberGPS(guildId: string, memberPointsEarned: number, tx?: DbClient): Promise<void> {
  const dbc = tx ?? db;
  const pct = await storage.getSystemConfigValue<number>("GPS_MEMBER_POINTS_PCT", 10);
  // Decimal arithmetic: avoid float multiplication error on currency-adjacent score.
  const gpsAward = new Decimal(memberPointsEarned)
    .times(pct)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .toNumber();
  if (gpsAward <= 0) return;

  await dbc.update(guilds)
    .set({
      guildPerformanceScore: drizzleSql`${guilds.guildPerformanceScore} + ${gpsAward}`,
      currentWeeklyPoints: drizzleSql`${guilds.currentWeeklyPoints} + ${memberPointsEarned}`,
    })
    .where(eq(guilds.id, guildId));

  await checkAndUpdateGuildRankTier(guildId, tx);
}

// Called by the Sunday reset job when a guild hits its weekly target.
export async function awardMilestoneGPS(guildId: string, tx?: DbClient): Promise<number> {
  const dbc = tx ?? db;
  const bonus = await storage.getSystemConfigValue<number>("GPS_MILESTONE_BONUS", 1000);
  await dbc.update(guilds)
    .set({ guildPerformanceScore: drizzleSql`${guilds.guildPerformanceScore} + ${bonus}` })
    .where(eq(guilds.id, guildId));
  await checkAndUpdateGuildRankTier(guildId, tx);
  return bonus;
}

// Called when a captain sets a weekly MVP.
export async function awardMVPGPS(guildId: string, tx?: DbClient): Promise<number> {
  const dbc = tx ?? db;
  const bonus = await storage.getSystemConfigValue<number>("GPS_MVP_BONUS", 200);
  await dbc.update(guilds)
    .set({ guildPerformanceScore: drizzleSql`${guilds.guildPerformanceScore} + ${bonus}` })
    .where(eq(guilds.id, guildId));
  await checkAndUpdateGuildRankTier(guildId, tx);
  return bonus;
}

function computeGuildRankTier(gps: number, thresholds: Record<string, number>): GuildRankTier {
  if (gps >= thresholds.GPS_RANK_S_MIN) return "S-Rank";
  if (gps >= thresholds.GPS_RANK_A_MIN) return "A-Rank";
  if (gps >= thresholds.GPS_RANK_B_MIN) return "B-Rank";
  if (gps >= thresholds.GPS_RANK_C_MIN) return "C-Rank";
  if (gps >= thresholds.GPS_RANK_D_MIN) return "D-Rank";
  return "E-Rank";
}

// 1.2d: Added SELECT FOR UPDATE row lock when inside a transaction so
// concurrent guild-earn events cannot produce a double rank-log entry.
// 2.3f: All 11 cfg() calls replaced with a single concurrent Promise.all
//       via fetchGpsConfig() — eliminates sequential DB round-trips.
export async function checkAndUpdateGuildRankTier(guildId: string, tx?: DbClient): Promise<void> {
  const dbc = tx ?? db;

  // Row-level lock: only meaningful inside a transaction (when tx is provided).
  // This prevents two concurrent earn events from both promoting the same guild.
  const selectQuery = dbc.select().from(guilds).where(eq(guilds.id, guildId));
  const [guild] = tx ? await selectQuery.for("update") : await selectQuery;
  if (!guild) return;

  // Single concurrent fetch for all config keys (replaces 11 sequential awaits).
  const config = await fetchGpsConfig();

  const newRank = computeGuildRankTier(guild.guildPerformanceScore, config.rankMins);
  if (newRank === guild.guildRankTier) return;

  const memberCapacityByRank: Record<GuildRankTier, number> = {
    "E-Rank": 10, "D-Rank": 15, "C-Rank": 20, "B-Rank": 30, "A-Rank": 40, "S-Rank": 50,
  };

  // guildRankTier is deprecated (Master Plan §4.9) — only update capacity and weekly target
  // based on GPS thresholds. No rank tier is stored or logged anymore.
  await dbc.update(guilds).set({
    memberCapacity: memberCapacityByRank[newRank],
    weeklyTarget: config.weeklyTargets[newRank],
  }).where(eq(guilds.id, guildId));

  const { emitFeedEvent } = await import("./live-feed");
  const isPromotion = GUILD_RANK_TIERS.indexOf(newRank) > GUILD_RANK_TIERS.indexOf(guild.guildRankTier as GuildRankTier);
  await emitFeedEvent({
    type: "guild_event",
    guildId,
    displayMessage: isPromotion
      ? `Guild '${guild.name}' GPS milestone reached (tier: ${newRank})! Capacity and target updated.`
      : `Guild '${guild.name}' GPS tier adjusted to ${newRank}. Capacity and target updated.`,
    data: { previousTier: guild.guildRankTier, newTier: newRank, guildPerformanceScore: guild.guildPerformanceScore },
  });
}
