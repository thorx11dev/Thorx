// THORX v3 — Performance Score (PS) engine (Part E.2 of the v3 spec).
//
// PS is the SOLE input to a user's rank tier (Appendix A, invariant #6).
// totalEarnings never affects rank. rankLocked=true freezes all automatic
// rank changes. E-Rank is a hard floor (invariant #7) — inactivity penalties
// can drop performanceScore to 0 but never demote a user below E-Rank.

import { db } from "../db";
import { and, eq, isNull, lt, or, sql as drizzleSql } from "drizzle-orm";
import { users, rankLogs } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../lib/logger";

const RANK_TIERS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"] as const;
export type RankTier = (typeof RANK_TIERS)[number];

async function cfg<T>(key: string, fallback: T): Promise<T> {
  return storage.getSystemConfigValue<T>(key, fallback);
}

function todayPKT(): string {
  // Pakistan Standard Time is UTC+5, no DST.
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return pkt.toISOString().slice(0, 10); // YYYY-MM-DD
}

function yesterdayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// `tx` (optional) lets callers — chiefly recordEarnEvent — run this inside
// their own transaction so the PS write is atomic with the rest of the earn
// event (Critical finding #2 of the 2026-07-15 production-readiness audit:
// recordEarnEvent previously had no transaction wrapper at all). Typed `any`
// (matches the existing tx-param convention elsewhere in storage.ts) since
// drizzle's transaction client and the base db client are structurally
// close but not identical types.
type DbClient = any;

// Award PS after a task completion (call from recordEarnEvent).
export async function awardTaskPS(userId: string, engineType: "A" | "B" | "C", tx?: DbClient): Promise<void> {
  const dbc = tx ?? db;
  const rewardKey = `PS_ENGINE_${engineType}_REWARD`;
  const defaultReward = engineType === "A" ? 5 : engineType === "B" ? 25 : 15;
  const reward = await cfg<number>(rewardKey, defaultReward);
  await dbc.update(users)
    .set({ performanceScore: drizzleSql`${users.performanceScore} + ${reward}` })
    .where(eq(users.id, userId));
  // When called inside recordEarnEvent's transaction, the caller performs one
  // final rank check after all PS changes are applied. Keep the standalone
  // helper behavior for callers that do not provide a transaction.
  if (!tx) await checkAndUpdateRankTier(userId);
}

// Process the daily login/activity streak. Safe to call multiple times a day
// (idempotent per PKT calendar day).
export async function processStreak(userId: string, tx?: DbClient): Promise<{ streakDays: number; psAwarded: number }> {
  const dbc = tx ?? db;
  const [user] = await dbc.select().from(users).where(eq(users.id, userId));
  if (!user) return { streakDays: 0, psAwarded: 0 };

  const today = todayPKT();
  if (user.lastStreakDate === today) {
    // Already processed today.
    return { streakDays: user.streakDays, psAwarded: 0 };
  }

  const yesterday = yesterdayOf(today);
  const newStreakDays = user.lastStreakDate === yesterday ? user.streakDays + 1 : 1;

  const day1 = await cfg<number>("PS_STREAK_DAY1", 5);
  const day2 = await cfg<number>("PS_STREAK_DAY2", 10);
  const day3Plus = await cfg<number>("PS_STREAK_DAY3_PLUS", 20);
  const psAwarded = newStreakDays === 1 ? day1 : newStreakDays === 2 ? day2 : day3Plus;

  await dbc.update(users)
    .set({
      streakDays: newStreakDays,
      lastStreakDate: today,
      performanceScore: drizzleSql`${users.performanceScore} + ${psAwarded}`,
    })
    .where(eq(users.id, userId));

  // See awardTaskPS: defer the single rank check to the earn transaction when
  // a transaction client is supplied.
  if (!tx) await checkAndUpdateRankTier(userId);
  return { streakDays: newStreakDays, psAwarded };
}

// Batch inactivity penalty — called by the daily midnight cron.
export async function applyInactivityPenalties(): Promise<number> {
  const hours = await cfg<number>("PS_INACTIVITY_HOURS", 48);
  const penalty = await cfg<number>("PS_INACTIVITY_PENALTY", 10);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Idempotency guard: skip users already penalized within this penalty window.
  // If the job crashes mid-loop and restarts, it will only process users who
  // have not yet received a penalty stamp in the current period (F-03 fix).
  const stale = await db.select({ id: users.id, identity: users.identity, performanceScore: users.performanceScore })
    .from(users)
    .where(and(
      lt(users.lastActiveAt, cutoff),
      or(isNull(users.inactivityPenaltyAt), lt(users.inactivityPenaltyAt, cutoff))
    ));

  const { emitFeedEvent } = await import("./live-feed");

  for (const u of stale) {
    try {
      await db.update(users)
        .set({
          performanceScore: drizzleSql`GREATEST(0, ${users.performanceScore} - ${penalty})`,
          inactivityPenaltyAt: new Date(),
        })
        .where(eq(users.id, u.id));
      await checkAndUpdateRankTier(u.id);
      await emitFeedEvent({
        type: "inactivity",
        userId: u.id,
        displayMessage: `User '${u.identity}' inactivity penalty: -${penalty} PS`,
        data: { penalty, hoursInactive: hours },
      });
    } catch (err) {
      // One user failing must never abort the entire penalty batch
      logger.error({ err, userId: u.id }, "[PSEngine] Inactivity penalty failed for user — continuing.");
    }
  }
  return stale.length;
}

function computeRankTier(ps: number, thresholds: Record<string, number>): RankTier {
  if (ps >= thresholds.PS_RANK_S_MIN) return "S-Rank";
  if (ps >= thresholds.PS_RANK_A_MIN) return "A-Rank";
  if (ps >= thresholds.PS_RANK_B_MIN) return "B-Rank";
  if (ps >= thresholds.PS_RANK_C_MIN) return "C-Rank";
  if (ps >= thresholds.PS_RANK_D_MIN) return "D-Rank";
  return "E-Rank";
}

// Called after every PS change. PS is the sole input to rank (invariant #6);
// rankLocked bypasses automatic changes; E-Rank is a hard floor (invariant #7).
export async function checkAndUpdateRankTier(userId: string, tx?: DbClient): Promise<void> {
  // 1.2c: SELECT FOR UPDATE inside a transaction prevents two concurrent earn
  // events from simultaneously promoting the same user (double rank-log bug).
  // When no external tx is provided we wrap in our own so the FOR UPDATE lock
  // is always honoured — previously the lock was skipped on standalone calls.
  if (!tx) {
    return db.transaction(async (innerTx) => checkAndUpdateRankTier(userId, innerTx));
  }
  const dbc = tx;
  const selectQuery = dbc.select().from(users).where(eq(users.id, userId));
  const [user] = await selectQuery.for("update");
  if (!user || user.rankLocked) return;

  const thresholds: Record<string, number> = {
    PS_RANK_D_MIN: await cfg("PS_RANK_D_MIN", 1000),
    PS_RANK_C_MIN: await cfg("PS_RANK_C_MIN", 3000),
    PS_RANK_B_MIN: await cfg("PS_RANK_B_MIN", 6000),
    PS_RANK_A_MIN: await cfg("PS_RANK_A_MIN", 10000),
    PS_RANK_S_MIN: await cfg("PS_RANK_S_MIN", 20000),
  };

  const newRank = computeRankTier(user.performanceScore, thresholds);
  if (newRank === user.userRankTier) return;

  await dbc.update(users).set({ userRankTier: newRank }).where(eq(users.id, userId));
  await dbc.insert(rankLogs).values({
    userId,
    oldRank: user.userRankTier,
    newRank,
    triggerSource: "ps_engine",
    targetType: "user",
  });

  await storage.createNotification({
    userId,
    title: "Rank Up!",
    message: `You've reached ${newRank}!`,
    type: "system",
  });

  try {
    const { broadcastUserUpdated } = await import("../realtime");
    broadcastUserUpdated(userId, "rank_updated", { oldRank: user.userRankTier, newRank });
  } catch (e) {
    logger.error({ err: e, userId }, "[PSEngine] Failed to broadcast rank tier update — continuing.");
  }

  const { emitFeedEvent } = await import("./live-feed");
  const rankOrder = RANK_TIERS.indexOf(newRank) > RANK_TIERS.indexOf(user.userRankTier as RankTier);
  await emitFeedEvent({
    type: "rank_up",
    userId,
    displayMessage: rankOrder
      ? `User '${user.identity}' reached ${newRank}!${newRank === "C-Rank" ? " Engine B now unlocked." : ""}`
      : `User '${user.identity}' rank adjusted to ${newRank}.`,
    data: { oldRank: user.userRankTier, newRank, performanceScore: user.performanceScore },
  });
}
