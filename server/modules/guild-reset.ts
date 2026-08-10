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
import { guilds, guildMembers, guildWeeklyCycles, guildWeeklySnapshots, guildWars, users } from "@shared/schema";
import { eq, and, sql as drizzleSql } from "drizzle-orm";
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

/**
 * TARGET HIT distribution: captain gets 30%, members get 70% (proportional to weekly contribution).
 * Used when guild hits 100% of weekly target. Returns total PKR distributed.
 */
async function distributePoolHit(
  guild: typeof guilds.$inferSelect,
  poolToDistributeD: Decimal,
  label: string,
): Promise<Decimal> {
  if (poolToDistributeD.lte(0)) return new Decimal(0);

  const captainShareD = poolToDistributeD.mul("0.30").toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const memberPoolD = poolToDistributeD.sub(captainShareD);

  // Captain 30%
  await db.update(users)
    .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${captainShareD.toFixed(2)}` })
    .where(eq(users.id, guild.captainId));
  await storage.createNotification({
    userId: guild.captainId,
    title: "🏆 Sunday Guild Bonus — Target Achieved!",
    message: `${label} — Captain bonus: Rs.${captainShareD.toFixed(2)} credited to your wallet!`,
    type: "financial",
  });
  try {
    const { broadcastToUser } = await import("../realtime");
    broadcastToUser(guild.captainId, 'guild.pool_credited', { guildId: guild.id, amount: captainShareD.toFixed(2), role: 'captain' });
  } catch (_) { /* non-critical */ }

  let totalDistributedD = captainShareD;

  // Members 70% — proportional to weeklyPointsContributed
  const members = await db.select().from(guildMembers)
    .where(and(eq(guildMembers.guildId, guild.id), eq(guildMembers.status, "active")));
  const totalContrib = members.reduce((s, m) => s + m.weeklyPointsContributed, 0);

  if (totalContrib > 0 && memberPoolD.gt(0)) {
    const memberShares = members
      .filter(m => m.weeklyPointsContributed > 0 && m.userId !== guild.captainId)
      .map(m => ({
        userId: m.userId,
        shareD: memberPoolD
          .mul(new Decimal(m.weeklyPointsContributed).div(totalContrib))
          .toDecimalPlaces(2, Decimal.ROUND_DOWN),
      }))
      .filter(({ shareD }) => shareD.greaterThan(0));

    await Promise.all(memberShares.map(({ userId, shareD }) =>
      db.update(users)
        .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${shareD.toFixed(2)}` })
        .where(eq(users.id, userId))
    ));
    await Promise.all(memberShares.map(({ userId, shareD }) =>
      storage.createNotification({
        userId,
        title: "🏆 Sunday Guild Bonus — Target Achieved!",
        message: `${label} — Your share: Rs.${shareD.toFixed(2)} credited to your wallet!`,
        type: "financial",
      })
    ));
    try {
      const { broadcastToUser } = await import("../realtime");
      memberShares.forEach(({ userId, shareD }) =>
        broadcastToUser(userId, 'guild.pool_credited', { guildId: guild.id, amount: shareD.toFixed(2), role: 'member' })
      );
    } catch (_) { /* non-critical */ }

    totalDistributedD = memberShares.reduce((acc, { shareD }) => acc.add(shareD), totalDistributedD);
  }

  return totalDistributedD;
}

/**
 * TARGET MISS distribution: EQUAL share for ALL active members (captain gets no extra).
 * Used when guild misses weekly target. Bonus pool goes to Thorx treasury (not distributed).
 * Returns total PKR distributed.
 */
async function distributePoolMiss(
  guild: typeof guilds.$inferSelect,
  poolToDistributeD: Decimal,
  label: string,
): Promise<Decimal> {
  if (poolToDistributeD.lte(0)) return new Decimal(0);

  const members = await db.select().from(guildMembers)
    .where(and(eq(guildMembers.guildId, guild.id), eq(guildMembers.status, "active")));

  if (members.length === 0) return new Decimal(0);

  // Equal distribution — captain gets same as any other member (no bonus on miss)
  const perMemberD = poolToDistributeD.div(members.length).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  let totalDistributedD = new Decimal(0);

  if (perMemberD.lte(0)) return new Decimal(0);

  await Promise.all(members.map(m =>
    db.update(users)
      .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${perMemberD.toFixed(2)}` })
      .where(eq(users.id, m.userId))
  ));

  await Promise.all(members.map(m =>
    storage.createNotification({
      userId: m.userId,
      title: "📦 Sunday Guild Payout — Target Missed",
      message: `${label} — Your equal share: Rs.${perMemberD.toFixed(2)}. Hit the target next week for the captain bonus + 5% gift!`,
      type: "financial",
    })
  ));

  try {
    const { broadcastToUser } = await import("../realtime");
    members.forEach(m =>
      broadcastToUser(m.userId, 'guild.pool_credited', { guildId: guild.id, amount: perMemberD.toFixed(2), role: 'member_equal' })
    );
  } catch (_) { /* non-critical */ }

  totalDistributedD = perMemberD.mul(members.length);
  return totalDistributedD;
}

// Keep backward-compatible alias for any callers (now routes to hit-style distribution)
const distributePool = distributePoolHit;

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
    const bonusD = new Decimal((guild as any).bonusPoolPkr ?? "0"); // 5% bonus pool
    const achieved = guild.currentWeeklyPoints;
    const target = guild.weeklyTarget;

    // Achievement ratio (capped at 100%)
    const achievementRatio = target > 0 ? Math.min(achieved / target, 1) : 0;
    const achievementPct = new Decimal(achievementRatio * 100).toDecimalPlaces(2);
    const wasSuccessful = achievementRatio >= 1 && poolD.greaterThan(0);

    let captainShareD = new Decimal(0);
    let memberShareD = new Decimal(0);
    let totalDistributedD = new Decimal(0);
    let poolDisposition: string;

    if (wasSuccessful) {
      // ── TARGET HIT: Full pool (80%) + bonus pool (5%) distributed ─────────
      // Captain gets 30%, members get 70% proportional.
      // 5% bonus pool included as "Thorx gift" on success.
      const totalPoolD = poolD.plus(bonusD);

      logger.info(
        { guildId: guild.id, pool: poolD.toFixed(2), bonus: bonusD.toFixed(2), total: totalPoolD.toFixed(2) },
        "[GuildReset] Target achieved — distributing 80% pool + 5% bonus",
      );

      totalDistributedD = await distributePoolHit(guild, totalPoolD, "🎯 Target Achieved");
      captainShareD = totalPoolD.mul("0.30").toDecimalPlaces(2, Decimal.ROUND_DOWN);
      memberShareD = totalPoolD.sub(captainShareD);

      const dustD = totalPoolD.sub(totalDistributedD);
      if (dustD.greaterThan(0)) {
        logger.info({ guildId: guild.id, dustPkr: dustD.toFixed(4) }, "[GuildReset] Rounding dust → Thorx treasury.");
      }

      await awardMilestoneGPS(guild.id);
      await emitFeedEvent({
        type: "guild_target",
        guildId: guild.id,
        displayMessage: `Guild '${guild.name}' hit 100%! Pool Rs.${poolD.toFixed(2)} + Bonus Rs.${bonusD.toFixed(2)} = Rs.${totalPoolD.toFixed(2)} distributed (captain 30% + members 70%).`,
        data: { wasSuccessful: true, achievementPct: 100, pool: poolD.toNumber(), bonus: bonusD.toNumber(), totalPool: totalPoolD.toNumber() },
      });
      poolDisposition = "distributed";
      distributed++;

    } else if (poolD.greaterThan(0) && achievementRatio > 0) {
      // ── TARGET MISSED WITH PARTIAL PROGRESS ───────────────────────────────
      // 80% pool distributed EQUALLY among all members (captain gets NO extra).
      // 5% bonus pool → Thorx treasury (miss penalty).
      logger.info(
        { guildId: guild.id, achieved, target, achievementRatio: achievementRatio.toFixed(4), pool: poolD.toFixed(2), bonus: bonusD.toFixed(2) },
        "[GuildReset] Target missed — equal distribution, bonus burned",
      );

      totalDistributedD = await distributePoolMiss(guild, poolD, `⚠️ Target Missed (${achievementPct.toFixed(0)}%)`);

      // Captain has same role as member in miss case
      const memberCount = (await db.select({ cnt: drizzleSql<number>`count(*)` }).from(guildMembers)
        .where(and(eq(guildMembers.guildId, guild.id), eq(guildMembers.status, "active"))))[0]?.cnt ?? 1;
      memberShareD = totalDistributedD;
      captainShareD = new Decimal(0); // no extra for captain on miss

      if (bonusD.greaterThan(0)) {
        logger.info({ guildId: guild.id, burnedBonus: bonusD.toFixed(4) }, "[GuildReset] Bonus pool (5%) burned to Thorx treasury — target missed.");
      }

      await emitFeedEvent({
        type: "guild_target",
        guildId: guild.id,
        displayMessage: `Guild '${guild.name}' reached ${achievementPct.toFixed(0)}% of target. Pool Rs.${poolD.toFixed(2)} distributed equally. Bonus Rs.${bonusD.toFixed(2)} forfeited.`,
        data: { wasSuccessful: false, achievementPct: achievementPct.toNumber(), pool: poolD.toNumber(), bonus: bonusD.toNumber(), totalDistributed: totalDistributedD.toNumber() },
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
        treasuryBonusPkr: bonusD.toFixed(4), // 5% bonus pool (from Thorx on success)
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

    // Reset for the new week — clear both main pool and bonus pool
    await db.update(guilds)
      .set({ weeklyBonusPool: "0.0000", bonusPoolPkr: "0.0000", currentWeeklyPoints: 0 } as any)
      .where(eq(guilds.id, guild.id));
    await db.update(guildMembers)
      .set({ weeklyPointsContributed: 0, isMvp: false, mvpSetWeek: null as any })
      .where(eq(guildMembers.guildId, guild.id));
  }

  // ── Resolve active guild wars at the week boundary ──────────────────────────
  // Wars previously had NO automatic completion path — the admin-only
  // PATCH /api/admin/guild-wars/wars/:id/resolve endpoint was the only caller,
  // so captain-facing wars stayed "active" forever and the winner / pool-capture
  // mechanic never ran. Resolve any war still active at the sweep (score-based
  // winner, loser's weekly bonus pool captured, war badge awarded). Pending
  // phases are untouched — their votes stay open.
  try {
    const { resolveWar } = await import("./guild-wars");
    const activeWars = await db
      .select({ id: guildWars.id })
      .from(guildWars)
      .where(eq(guildWars.status, "active"));
    for (const w of activeWars) {
      await resolveWar(w.id);
    }
    if (activeWars.length > 0) {
      logger.info({ resolvedWars: activeWars.length }, "[GuildReset] Active wars resolved at week boundary.");
    }
  } catch (err) {
    logger.error({ err }, "[GuildReset] War resolution sweep failed.");
  }

  return { guildsProcessed: activeGuilds.length, distributed, partial, voided, skipped };
}
