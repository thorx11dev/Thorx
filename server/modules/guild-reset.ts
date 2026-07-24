// THORX v3 — Sunday Guild Reset (spec Part E.8).
//
// Distributes each active guild's weekly bonus pool (30% captain / 70% members,
// proportional to weeklyPointsContributed) if the guild hit its weeklyTarget,
// adding a GUILD_TREASURY_BONUS_PCT bonus on top when target is fully achieved.
//
// If target is missed: pool is distributed proportionally based on achievement %.
// (e.g. 80% of target → 80% of pool distributed; remaining 20% burned to treasury.)
// NO treasury bonus is awarded on a miss.
//
// Design note: the spec's pseudocode assumes an exact "Sunday 23:59 PKT" cron
// firing once. This codebase intentionally avoids exact-time cron scheduling
// in favor of self-healing periodic sweeps (see server/jobs/guild-vault-resolution.ts
// and leaderboard-cleanup.ts) so a missed process restart doesn't skip a reset.
// runWeeklyGuildReset() is therefore idempotent and safe to call on a fixed
// interval (see server/jobs/guild-weekly-reset.ts): it always resolves the most
// recently-completed UTC week (Monday–Sunday) for each guild exactly once,
// keyed by the unique (guildId, weekStart) constraint on guild_weekly_snapshots
// and the `resolved` flag on guild_weekly_cycles.
import Decimal from "decimal.js";
import { db } from "../db";
import { guilds, guildMembers, guildWeeklyCycles, guildWeeklySnapshots, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { awardMilestoneGPS } from "./gps-engine";
import { emitFeedEvent } from "./live-feed";
import { storage } from "../storage";
import { logger } from "../lib/logger";

// Fixed UTC week boundary: Monday 00:00:00 UTC through Sunday 23:59:59.999 UTC.
function getUtcWeekBounds(reference: Date): { weekStart: Date; weekEnd: Date } {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() + diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Distribute a pool to captain (30%) + members (proportional to contribution). Returns total distributed. */
async function distributePool(
  guild: typeof guilds.$inferSelect,
  poolToDistributeD: Decimal,
  label: string,
): Promise<Decimal> {
  if (poolToDistributeD.lte(0)) return new Decimal(0);

  const captainShareD = poolToDistributeD.mul("0.30").toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const memberPoolD = poolToDistributeD.sub(captainShareD);

  // Captain
  await db.update(users)
    .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${captainShareD.toFixed(2)}` })
    .where(eq(users.id, guild.captainId));
  await storage.createNotification({
    userId: guild.captainId,
    title: "Sunday Guild Bonus!",
    message: `${label} — Your captain share: Rs.${captainShareD.toFixed(2)}`,
    type: "financial",
  });
  try {
    const { broadcastToUser } = await import("../realtime");
    broadcastToUser(guild.captainId, 'guild.pool_credited', { guildId: guild.id, amount: captainShareD.toFixed(2), role: 'captain' });
  } catch (_) { /* non-critical */ }

  let totalDistributedD = captainShareD;

  // Members
  const members = await db.select().from(guildMembers)
    .where(and(eq(guildMembers.guildId, guild.id), eq(guildMembers.status, "active")));
  const totalContrib = members.reduce((s, m) => s + m.weeklyPointsContributed, 0);

  if (totalContrib > 0 && memberPoolD.gt(0)) {
    const memberShares = members
      .filter(m => m.weeklyPointsContributed > 0)
      .map(m => ({
        userId: m.userId,
        shareD: memberPoolD
          .mul(new Decimal(m.weeklyPointsContributed).div(totalContrib))
          .toDecimalPlaces(2, Decimal.ROUND_DOWN),
      }))
      .filter(({ shareD }) => shareD.greaterThan(0));

    await Promise.all(
      memberShares.map(({ userId, shareD }) =>
        db.update(users)
          .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${shareD.toFixed(2)}` })
          .where(eq(users.id, userId))
      )
    );
    await Promise.all(
      memberShares.map(({ userId, shareD }) =>
        storage.createNotification({
          userId,
          title: "Sunday Guild Bonus!",
          message: `${label} — Your team share: Rs.${shareD.toFixed(2)}`,
          type: "financial",
        })
      )
    );
    try {
      const { broadcastToUser } = await import("../realtime");
      memberShares.forEach(({ userId, shareD }) => {
        broadcastToUser(userId, 'guild.pool_credited', { guildId: guild.id, amount: shareD.toFixed(2), role: 'member' });
      });
    } catch (_) { /* non-critical */ }

    totalDistributedD = memberShares.reduce(
      (acc, { shareD }) => acc.add(shareD),
      totalDistributedD,
    );
  }

  return totalDistributedD;
}

export interface WeeklyGuildResetSummary {
  guildsProcessed: number;
  distributed: number;
  partial: number;
  voided: number;
  skipped: number;
}

/**
 * Resolves the most recently-completed UTC week for every active guild that
 * hasn't already been resolved. Safe to call repeatedly (e.g. every 30 min).
 */
export async function runWeeklyGuildReset(): Promise<WeeklyGuildResetSummary> {
  const now = new Date();
  const { weekStart: currentWeekStart } = getUtcWeekBounds(now);
  const prevWeekStart = new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekEnd = new Date(currentWeekStart.getTime() - 1);

  // Fetch config once — shared across all guilds in this run
  const [treasuryBonusPct] = await Promise.all([
    storage.getSystemConfigValue<number>("GUILD_TREASURY_BONUS_PCT", 20),
  ]);

  const activeGuilds = await db.select().from(guilds).where(eq(guilds.status, "active")).limit(500);

  let distributed = 0;
  let partial = 0;
  let voided = 0;
  let skipped = 0;

  for (const guild of activeGuilds) {
    const [existingCycle] = await db
      .select()
      .from(guildWeeklyCycles)
      .where(and(eq(guildWeeklyCycles.guildId, guild.id), eq(guildWeeklyCycles.weekStart, prevWeekStart)))
      .limit(1);

    if (existingCycle?.resolved) {
      skipped++;
      continue;
    }

    const poolD = new Decimal(guild.weeklyBonusPool ?? "0");
    const achieved = guild.currentWeeklyPoints;
    const target = guild.weeklyTarget;

    // Achievement ratio (capped at 100%)
    const achievementRatio = target > 0 ? Math.min(achieved / target, 1) : 0;
    const achievementPct = new Decimal(achievementRatio * 100).toDecimalPlaces(2);
    const wasSuccessful = achievementRatio >= 1 && poolD.greaterThan(0);

    let captainShareD = new Decimal(0);
    let memberShareD = new Decimal(0);
    let treasuryBonusD = new Decimal(0);
    let totalDistributedD = new Decimal(0);
    let poolDisposition: string;

    if (wasSuccessful) {
      // ── TARGET HIT: Full pool + Treasury Bonus (Q2 + Q3) ─────────────────
      // Treasury bonus = pool × GUILD_TREASURY_BONUS_PCT
      // THORX subsidises successful guilds from platform revenue.
      treasuryBonusD = poolD
        .mul(new Decimal(treasuryBonusPct).div(100))
        .toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const totalPoolD = poolD.plus(treasuryBonusD);

      logger.info(
        { guildId: guild.id, pool: poolD.toFixed(2), treasuryBonus: treasuryBonusD.toFixed(2), total: totalPoolD.toFixed(2) },
        "[GuildReset] Target achieved — distributing pool + treasury bonus",
      );

      totalDistributedD = await distributePool(guild, totalPoolD, "Target Achieved!");
      captainShareD = totalPoolD.mul("0.30").toDecimalPlaces(2, Decimal.ROUND_DOWN);
      memberShareD = totalPoolD.sub(captainShareD);

      // Rounding dust → Thorx treasury (logged only)
      const dustD = totalPoolD.sub(totalDistributedD);
      if (dustD.greaterThan(0)) {
        logger.info(
          { guildId: guild.id, dustPkr: dustD.toFixed(4) },
          "[GuildReset] Rounding dust credited to Thorx treasury.",
        );
      }

      await awardMilestoneGPS(guild.id);
      await emitFeedEvent({
        type: "guild_target",
        guildId: guild.id,
        displayMessage: `Guild '${guild.name}' hit 100%! Pool Rs.${poolD.toFixed(2)} + Treasury Bonus Rs.${treasuryBonusD.toFixed(2)} = Rs.${totalPoolD.toFixed(2)} distributed.`,
        data: { wasSuccessful: true, achievementPct: 100, pool: poolD.toNumber(), treasuryBonus: treasuryBonusD.toNumber(), totalPool: totalPoolD.toNumber() },
      });
      poolDisposition = "distributed";
      distributed++;

    } else if (poolD.greaterThan(0) && achievementRatio > 0) {
      // ── TARGET MISSED WITH PARTIAL PROGRESS: Distribute achievementPct of pool (Q2) ──
      // Achievement 80% → 80% of pool distributed, remaining 20% burned to treasury.
      // NO treasury bonus on a miss.
      const partialPoolD = poolD
        .mul(new Decimal(achievementRatio))
        .toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const burnedD = poolD.sub(partialPoolD);

      logger.info(
        { guildId: guild.id, achieved, target, achievementRatio: achievementRatio.toFixed(4), partialPool: partialPoolD.toFixed(2), burned: burnedD.toFixed(2) },
        "[GuildReset] Target missed — partial distribution",
      );

      totalDistributedD = await distributePool(guild, partialPoolD, `Partial (${achievementPct.toFixed(0)}% achieved)`);
      captainShareD = partialPoolD.mul("0.30").toDecimalPlaces(2, Decimal.ROUND_DOWN);
      memberShareD = partialPoolD.sub(captainShareD);

      if (burnedD.greaterThan(0)) {
        logger.info(
          { guildId: guild.id, burnedPkr: burnedD.toFixed(4) },
          "[GuildReset] Unachieved pool portion burned to Thorx treasury.",
        );
      }

      await emitFeedEvent({
        type: "guild_target",
        guildId: guild.id,
        displayMessage: `Guild '${guild.name}' reached ${achievementPct.toFixed(0)}% of target. Partial pool Rs.${partialPoolD.toFixed(2)} distributed (Rs.${burnedD.toFixed(2)} forfeited).`,
        data: { wasSuccessful: false, achievementPct: achievementPct.toNumber(), pool: poolD.toNumber(), partialPool: partialPoolD.toNumber(), burned: burnedD.toNumber() },
      });
      poolDisposition = "partial";
      partial++;

    } else {
      // ── TARGET MISSED WITH ZERO PROGRESS OR EMPTY POOL ───────────────────
      await emitFeedEvent({
        type: "guild_target",
        guildId: guild.id,
        displayMessage: `Guild '${guild.name}' missed target with 0 progress. Pool Rs.${poolD.toFixed(2)} voided.`,
        data: { wasSuccessful: false, achievementPct: 0, pool: poolD.toNumber() },
      });
      poolDisposition = "voided";
      voided++;
    }

    // Snapshot (idempotent — unique on guildId+weekStart)
    const [existingSnapshot] = await db
      .select()
      .from(guildWeeklySnapshots)
      .where(and(eq(guildWeeklySnapshots.guildId, guild.id), eq(guildWeeklySnapshots.weekStart, toDateOnly(prevWeekStart) as any)))
      .limit(1);
    if (!existingSnapshot) {
      await db.insert(guildWeeklySnapshots).values({
        guildId: guild.id,
        weekStart: toDateOnly(prevWeekStart) as any,
        targetPoints: target,
        achievedPoints: achieved,
        wasSuccessful,
        bonusPoolPkr: poolD.toFixed(4),
        poolDisposition,
        captainShare: captainShareD.toFixed(2),
        membersShare: memberShareD.toFixed(2),
        treasuryBonusPkr: treasuryBonusD.toFixed(4),
        achievementPct: achievementPct.toFixed(2),
      });
    }

    if (existingCycle) {
      await db.update(guildWeeklyCycles).set({
        actualPoints: achieved,
        goalMet: wasSuccessful,
        resolved: true,
        resolvedAt: new Date(),
        bonusPoolPkr: poolD.toFixed(4),
        poolDisposition,
        captainSharePkr: captainShareD.toFixed(2),
        membersSharePkr: memberShareD.toFixed(2),
      }).where(eq(guildWeeklyCycles.id, existingCycle.id));
    } else {
      await db.insert(guildWeeklyCycles).values({
        guildId: guild.id,
        weekStart: prevWeekStart,
        weekEnd: prevWeekEnd,
        targetPoints: target,
        actualPoints: achieved,
        goalMet: wasSuccessful,
        resolved: true,
        resolvedAt: new Date(),
        bonusPoolPkr: poolD.toFixed(4),
        poolDisposition,
        captainSharePkr: captainShareD.toFixed(2),
        membersSharePkr: memberShareD.toFixed(2),
      });
    }

    // Reset for the new week
    await db.update(guilds)
      .set({ weeklyBonusPool: "0.0000", currentWeeklyPoints: 0 })
      .where(eq(guilds.id, guild.id));
    await db.update(guildMembers)
      .set({ weeklyPointsContributed: 0, isMvp: false, mvpSetWeek: null as any })
      .where(eq(guildMembers.guildId, guild.id));
  }

  return { guildsProcessed: activeGuilds.length, distributed, partial, voided, skipped };
}
