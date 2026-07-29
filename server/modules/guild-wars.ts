/**
 * THORX Guild Wars — Service Layer (fixed to match actual schema columns)
 *
 * Tables:
 *   guild_war_seasons     — seasonal containers
 *   guild_wars            — individual war matchups (challengerGuildId / challengedGuildId)
 *   guild_war_approvals   — per-member vote to approve/reject participation
 *   guild_war_participants — per-user point contributions during an active war
 *   guild_hall_of_fame    — permanent season winners
 *   guild_badges          — awarded badges per guild
 *
 * Status flow:
 *   pending_challenger_approval → pending_challenged_approval → active → completed | cancelled
 */

import Decimal from "decimal.js";
import { db } from "../db";
import {
  guildWarSeasons,
  guildWars,
  guildWarParticipants,
  guildWarApprovals,
  guildHallOfFame,
  guildBadges,
  guilds,
  guildMembers,
  guildWeeklyCycles,
  users,
  type GuildWarSeason,
  type GuildWar,
  type GuildWarApproval,
  type GuildHallOfFame,
  type GuildBadge,
} from "@shared/schema";
import { eq, and, desc, sql, or, ne, gte, lte } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";

// ─── Season Management ────────────────────────────────────────────────────────

export async function createSeason(params: {
  name: string;
  startDate: Date;
  endDate: Date;
  prizePoolPkr: string;
}): Promise<GuildWarSeason> {
  const [season] = await db
    .insert(guildWarSeasons)
    .values({
      name: params.name,
      status: "upcoming",
      startDate: params.startDate,
      endDate: params.endDate,
      prizePoolPkr: params.prizePoolPkr,
    })
    .returning();
  logger.info({ seasonId: season.id, name: params.name }, "[GuildWars] Season created");
  return season;
}

export async function activateSeason(seasonId: string): Promise<GuildWarSeason | null> {
  const [updated] = await db
    .update(guildWarSeasons)
    .set({ status: "active" })
    .where(eq(guildWarSeasons.id, seasonId))
    .returning();
  return updated ?? null;
}

export async function getActiveSeason(): Promise<GuildWarSeason | null> {
  const [season] = await db
    .select()
    .from(guildWarSeasons)
    .where(eq(guildWarSeasons.status, "active"))
    .limit(1);
  return season ?? null;
}

export async function listSeasons(limit = 20): Promise<GuildWarSeason[]> {
  return db
    .select()
    .from(guildWarSeasons)
    .orderBy(desc(guildWarSeasons.createdAt))
    .limit(limit);
}

// ─── War Matchup Management ───────────────────────────────────────────────────

/**
 * Admin: create a war directly (admin-managed matchup).
 * For captain-initiated challenges, use initiateChallenge().
 */
export async function createWar(params: {
  seasonId?: string;
  challengerGuildId: string;
  challengedGuildId: string;
}): Promise<GuildWar> {
  if (params.challengerGuildId === params.challengedGuildId) {
    throw new Error("A guild cannot war against itself");
  }
  const [war] = await db
    .insert(guildWars)
    .values({
      seasonId: params.seasonId ?? null,
      challengerGuildId: params.challengerGuildId,
      challengedGuildId: params.challengedGuildId,
      status: "active", // admin-created wars start immediately
      challengerScore: 0,
      challengedScore: 0,
      startedAt: new Date(),
    })
    .returning();
  logger.info(
    { warId: war.id, challenger: params.challengerGuildId, challenged: params.challengedGuildId },
    "[GuildWars] Admin war created",
  );
  return war;
}

// ─── Captain-Initiated Challenge Flow ────────────────────────────────────────

/**
 * Step 1: Captain initiates a challenge against another guild.
 * Creates war with status "pending_challenger_approval".
 * All challenger members must then vote (including captain).
 */
export async function initiateChallenge(params: {
  challengerGuildId: string;
  challengedGuildId: string;
  captainId: string;
}): Promise<GuildWar> {
  const { challengerGuildId, challengedGuildId, captainId } = params;

  if (challengerGuildId === challengedGuildId) {
    throw new Error("A guild cannot challenge itself");
  }

  // Race-condition fix: two simultaneous challenges touching either guild could
  // both pass the "no existing war" check before either INSERT commits, creating
  // duplicate wars. Wrap the check-then-insert in a transaction and take
  // pg_advisory_xact_lock on both guild IDs (sorted, so two overlapping
  // challenges always lock in the same global order and can't deadlock).
  return await db.transaction(async (tx) => {
    const lockIds = [challengerGuildId, challengedGuildId].sort();
    for (const id of lockIds) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id})::bigint)`);
    }

    // Verify captain
    const guild = await tx.select().from(guilds).where(eq(guilds.id, challengerGuildId)).limit(1);
    if (!guild[0]) throw new Error("Guild not found");
    if (guild[0].captainId !== captainId) throw new Error("Only the guild captain can initiate a challenge");
    if (guild[0].status !== "active") throw new Error("Guild must be active to challenge");

    // Check no active/pending war for either guild
    const existingWar = await tx.select().from(guildWars).where(
      and(
        or(
          eq(guildWars.challengerGuildId, challengerGuildId),
          eq(guildWars.challengedGuildId, challengerGuildId),
          eq(guildWars.challengerGuildId, challengedGuildId),
          eq(guildWars.challengedGuildId, challengedGuildId),
        ),
        or(
          eq(guildWars.status, "pending_challenger_approval"),
          eq(guildWars.status, "pending_challenged_approval"),
          eq(guildWars.status, "active"),
        ),
      )
    ).limit(1);

    if (existingWar[0]) throw new Error("One of the guilds is already in an active war or has a pending challenge");

    // Verify challenged guild exists and is active
    const challengedGuild = await tx.select().from(guilds).where(eq(guilds.id, challengedGuildId)).limit(1);
    if (!challengedGuild[0]) throw new Error("Challenged guild not found");
    if (challengedGuild[0].status !== "active") throw new Error("Challenged guild is not active");

    const [war] = await tx
      .insert(guildWars)
      .values({
        challengerGuildId,
        challengedGuildId,
        status: "pending_challenger_approval",
        challengerScore: 0,
        challengedScore: 0,
      })
      .returning();

    logger.info({ warId: war.id, challengerGuildId, challengedGuildId }, "[GuildWars] Challenge initiated");
    return war;
  });
}

/**
 * Step 2 & 3: Member votes to approve or reject their guild's war participation.
 * - Challenger guild members vote first (pending_challenger_approval)
 * - Once all active challenger members approve → status moves to pending_challenged_approval
 * - Challenged guild members vote → all approve → status moves to active
 * - Any rejection → war cancelled
 */
export async function voteOnWar(params: {
  warId: string;
  userId: string;
  approved: boolean;
}): Promise<{ war: GuildWar; allApproved: boolean; cancelled: boolean }> {
  const { warId, userId, approved } = params;

  const [war] = await db.select().from(guildWars).where(eq(guildWars.id, warId)).limit(1);
  if (!war) throw new Error("War not found");

  if (war.status !== "pending_challenger_approval" && war.status !== "pending_challenged_approval") {
    throw new Error("War is not in a voting phase");
  }

  // Determine which guild this user belongs to
  const membership = await db.select().from(guildMembers).where(
    and(eq(guildMembers.userId, userId), eq(guildMembers.status, "active"))
  ).limit(1);
  if (!membership[0]) throw new Error("You are not an active guild member");

  const userGuildId = membership[0].guildId;
  const expectedGuildId = war.status === "pending_challenger_approval"
    ? war.challengerGuildId
    : war.challengedGuildId;

  if (userGuildId !== expectedGuildId) {
    throw new Error("It is not your guild's turn to vote");
  }

  // Record or update vote
  await db
    .insert(guildWarApprovals)
    .values({ warId, userId, guildId: userGuildId, approved, approvedAt: new Date() })
    .onConflictDoUpdate({
      target: [guildWarApprovals.warId, guildWarApprovals.userId],
      set: { approved, approvedAt: new Date() },
    });

  // If rejected → cancel war
  if (!approved) {
    const [cancelled] = await db
      .update(guildWars)
      .set({ status: "cancelled" })
      .where(eq(guildWars.id, warId))
      .returning();
    logger.info({ warId, userId }, "[GuildWars] War cancelled by member rejection");
    return { war: cancelled, allApproved: false, cancelled: true };
  }

  // Check if all active members of this guild have approved
  const activeMembers = await db
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, userGuildId), eq(guildMembers.status, "active")));

  const approvals = await db
    .select()
    .from(guildWarApprovals)
    .where(and(eq(guildWarApprovals.warId, warId), eq(guildWarApprovals.guildId, userGuildId)));

  const approvedUserIds = new Set(approvals.filter(a => a.approved).map(a => a.userId));
  const allApproved = activeMembers.every(m => approvedUserIds.has(m.userId));

  if (!allApproved) {
    return { war, allApproved: false, cancelled: false };
  }

  // All approved — advance status
  let newStatus: string;
  let updatedWar: GuildWar;
  if (war.status === "pending_challenger_approval") {
    newStatus = "pending_challenged_approval";
    [updatedWar] = await db
      .update(guildWars)
      .set({ status: newStatus })
      .where(eq(guildWars.id, warId))
      .returning();
    logger.info({ warId }, "[GuildWars] Challenger approved — waiting for challenged guild");
  } else {
    newStatus = "active";
    [updatedWar] = await db
      .update(guildWars)
      .set({ status: newStatus, startedAt: new Date() })
      .where(eq(guildWars.id, warId))
      .returning();
    logger.info({ warId }, "[GuildWars] War is now ACTIVE");
  }

  return { war: updatedWar, allApproved: true, cancelled: false };
}

/**
 * Captain cancels a pending war challenge (before it goes active).
 */
export async function cancelWar(warId: string, captainId: string): Promise<GuildWar> {
  const [war] = await db.select().from(guildWars).where(eq(guildWars.id, warId)).limit(1);
  if (!war) throw new Error("War not found");

  if (war.status === "active" || war.status === "completed" || war.status === "cancelled") {
    throw new Error(`Cannot cancel a war with status: ${war.status}`);
  }

  // Verify captain belongs to challenger guild
  const guild = await db.select().from(guilds).where(eq(guilds.id, war.challengerGuildId)).limit(1);
  if (!guild[0] || guild[0].captainId !== captainId) {
    throw new Error("Only the challenger guild captain can cancel the challenge");
  }

  const [cancelled] = await db
    .update(guildWars)
    .set({ status: "cancelled" })
    .where(eq(guildWars.id, warId))
    .returning();

  logger.info({ warId, captainId }, "[GuildWars] War cancelled by captain");
  return cancelled;
}

/**
 * Get the current active or pending war for a guild.
 */
export async function getGuildCurrentWar(guildId: string): Promise<GuildWar | null> {
  const [war] = await db
    .select()
    .from(guildWars)
    .where(
      and(
        or(
          eq(guildWars.challengerGuildId, guildId),
          eq(guildWars.challengedGuildId, guildId),
        ),
        or(
          eq(guildWars.status, "pending_challenger_approval"),
          eq(guildWars.status, "pending_challenged_approval"),
          eq(guildWars.status, "active"),
        ),
      )
    )
    .orderBy(desc(guildWars.createdAt))
    .limit(1);
  return war ?? null;
}

/**
 * Get war with approval votes for a given guild.
 */
export async function getWarWithApprovals(warId: string, guildId: string): Promise<{
  war: GuildWar;
  approvals: GuildWarApproval[];
  totalActiveMembers: number;
  approvedCount: number;
}> {
  const [war] = await db.select().from(guildWars).where(eq(guildWars.id, warId)).limit(1);
  if (!war) throw new Error("War not found");

  const approvals = await db
    .select()
    .from(guildWarApprovals)
    .where(and(eq(guildWarApprovals.warId, warId), eq(guildWarApprovals.guildId, guildId)));

  const activeMembers = await db
    .select({ count: sql<number>`count(*)` })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.status, "active")));

  const totalActiveMembers = Number(activeMembers[0]?.count ?? 0);
  const approvedCount = approvals.filter(a => a.approved).length;

  return { war, approvals, totalActiveMembers, approvedCount };
}

// ─── Point Contribution ───────────────────────────────────────────────────────

/**
 * Called by earn events to contribute points to an active war.
 * Only contributes if user's guild is a participant in an active war.
 */
export async function contributeWarPoints(
  userId: string,
  guildId: string,
  points: number,
  tx?: any,
): Promise<void> {
  const dbc = tx ?? db;
  const [activeWar] = await dbc
    .select()
    .from(guildWars)
    .where(
      and(
        eq(guildWars.status, "active"),
        or(
          eq(guildWars.challengerGuildId, guildId),
          eq(guildWars.challengedGuildId, guildId),
        ),
      ),
    )
    .limit(1);

  if (!activeWar) return;

  // Upsert participant contribution
  await dbc
    .insert(guildWarParticipants)
    .values({ warId: activeWar.id, guildId, userId, pointsContributed: points })
    .onConflictDoUpdate({
      target: [guildWarParticipants.warId, guildWarParticipants.guildId, guildWarParticipants.userId],
      set: { pointsContributed: sql`${guildWarParticipants.pointsContributed} + ${points}` },
    });

  // Update war score for the correct side
  if (activeWar.challengerGuildId === guildId) {
    await dbc
      .update(guildWars)
      .set({ challengerScore: sql`${guildWars.challengerScore} + ${points}` })
      .where(eq(guildWars.id, activeWar.id));
  } else {
    await dbc
      .update(guildWars)
      .set({ challengedScore: sql`${guildWars.challengedScore} + ${points}` })
      .where(eq(guildWars.id, activeWar.id));
  }
}

// ─── War Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a completed war — determine winner based on who first completed their
 * weekly target. If neither completed, the higher score wins. If tied, it's a draw.
 */
export async function resolveWar(warId: string): Promise<{
  winnerId: string | null;
  isDraw: boolean;
  poolTransferred?: string;
}> {
  return await db.transaction(async (tx) => {
    const [war] = await tx.select().from(guildWars).where(eq(guildWars.id, warId)).limit(1);
    if (!war) throw new Error("War not found");
    if (war.status === "completed") return { winnerId: war.winnerId, isDraw: !war.winnerId };

    const isDraw = war.challengerScore === war.challengedScore;
    const winnerId = isDraw
      ? null
      : war.challengerScore > war.challengedScore
      ? war.challengerGuildId
      : war.challengedGuildId;
    const loserId = isDraw
      ? null
      : winnerId === war.challengerGuildId
      ? war.challengedGuildId
      : war.challengerGuildId;

    await tx
      .update(guildWars)
      .set({ status: "completed", winnerId, completedAt: new Date() })
      .where(eq(guildWars.id, warId));

    let poolTransferred = "0.00";

    if (winnerId && loserId) {
      // Winner captures the loser's currently-accruing weekly bonus pool.
      // Fixed bug: this used to look up a guildWeeklyCycles row for the CURRENT
      // week, but that row is only ever created retroactively by the Sunday
      // reset job for the week that just ended — so during a live war (the
      // normal case) it never existed and the transfer silently no-opped.
      // guilds.weeklyBonusPool is the live running pool (see storage.ts
      // recordEarnEvent), so read/zero/credit it directly — always available,
      // no dependency on reset-job timing. All in the same tx as the war
      // status update so a mid-resolve failure can't leave scores/pool/badge
      // in an inconsistent state.
      const [loserGuild] = await tx.select().from(guilds).where(eq(guilds.id, loserId)).limit(1);
      const loserPool = new Decimal(loserGuild?.weeklyBonusPool ?? "0");

      if (loserPool.gt(0)) {
        await tx.update(guilds)
          .set({ weeklyBonusPool: "0.0000" })
          .where(eq(guilds.id, loserId));

        await tx.update(guilds)
          .set({ weeklyBonusPool: sql`${guilds.weeklyBonusPool} + ${loserPool.toFixed(4)}` })
          .where(eq(guilds.id, winnerId));

        poolTransferred = loserPool.toFixed(2);
        logger.info({ warId, winnerId, loserId, poolTransferred }, "[GuildWars] Pool transferred from loser to winner.");

        // Notify guild members of the pool capture
        try {
          const { broadcastGuildEvent } = await import("../realtime");
          broadcastGuildEvent(winnerId, "guild.war_pool_captured", {
            warId,
            poolPkr: poolTransferred,
            message: `⚔️ War won! Rs.${poolTransferred} captured from the opposing guild's pool — will be distributed this Sunday!`,
          });
        } catch (_) { /* non-critical */ }
      }

      await awardBadge(winnerId, "war_winner", "⚔️ War Victor", war.seasonId ?? undefined, tx);
      logger.info({ warId, winnerId, poolTransferred }, "[GuildWars] War resolved — winner");
    } else {
      logger.info({ warId }, "[GuildWars] War resolved — draw");
    }

    return { winnerId, isDraw, poolTransferred };
  });
}

// ─── Season Resolution ────────────────────────────────────────────────────────

// Shared standings computation for resolveSeason() and getSeasonLeaderboard().
// Bug fix: the old queries grouped only by challengerGuildId, so any wins/score
// a guild earned while on the challenged side vanished entirely, and a guild
// that only ever got challenged (never initiated) never appeared at all.
// Aggregates both sides in JS instead of duplicating a UNION ALL in SQL.
async function computeSeasonStandings(
  seasonId: string,
): Promise<Map<string, { wins: number; totalScore: number; warsPlayed: number }>> {
  const rows = await db
    .select({
      challengerGuildId: guildWars.challengerGuildId,
      challengedGuildId: guildWars.challengedGuildId,
      winnerId: guildWars.winnerId,
      challengerScore: guildWars.challengerScore,
      challengedScore: guildWars.challengedScore,
    })
    .from(guildWars)
    .where(and(eq(guildWars.seasonId, seasonId), eq(guildWars.status, "completed")));

  const standings = new Map<string, { wins: number; totalScore: number; warsPlayed: number }>();
  const bump = (guildId: string, won: boolean, score: number) => {
    const cur = standings.get(guildId) ?? { wins: 0, totalScore: 0, warsPlayed: 0 };
    cur.warsPlayed += 1;
    cur.totalScore += score;
    if (won) cur.wins += 1;
    standings.set(guildId, cur);
  };

  for (const w of rows) {
    bump(w.challengerGuildId, w.winnerId === w.challengerGuildId, w.challengerScore);
    bump(w.challengedGuildId, w.winnerId === w.challengedGuildId, w.challengedScore);
  }
  return standings;
}

export async function resolveSeason(seasonId: string): Promise<void> {
  const standingsMap = await computeSeasonStandings(seasonId);
  const standings = Array.from(standingsMap.entries())
    .map(([guildId, s]) => ({ guildId, wins: s.wins, totalScore: s.totalScore }))
    .sort((a, b) => (b.wins - a.wins) || (b.totalScore - a.totalScore));

  for (let i = 0; i < Math.min(3, standings.length); i++) {
    const placement = i + 1;
    const entry = standings[i];
    await db.insert(guildHallOfFame).values({
      guildId: entry.guildId,
      seasonId,
      placement,
      warsWon: entry.wins,
      totalPointsScored: entry.totalScore,
    }).onConflictDoNothing();

    if (placement === 1) {
      await awardBadge(entry.guildId, "season_champion", "🏆 Season Champion", seasonId);
    } else if (placement === 2) {
      await awardBadge(entry.guildId, "runner_up", "🥈 Runner Up", seasonId);
    } else {
      await awardBadge(entry.guildId, "third_place", "🥉 Third Place", seasonId);
    }
  }

  await db
    .update(guildWarSeasons)
    .set({ status: "completed" })
    .where(eq(guildWarSeasons.id, seasonId));

  logger.info({ seasonId, topGuild: standings[0]?.guildId }, "[GuildWars] Season resolved");
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export async function awardBadge(
  guildId: string,
  badgeType: string,
  badgeName: string,
  seasonId?: string,
  tx?: any,
): Promise<GuildBadge> {
  const dbc = tx ?? db;
  const [badge] = await dbc
    .insert(guildBadges)
    .values({ guildId, badgeType, badgeName, seasonId })
    .returning();
  return badge;
}

export async function getGuildBadges(guildId: string): Promise<GuildBadge[]> {
  return db
    .select()
    .from(guildBadges)
    .where(eq(guildBadges.guildId, guildId))
    .orderBy(desc(guildBadges.awardedAt));
}

// ─── Hall of Fame ─────────────────────────────────────────────────────────────

export async function getHallOfFame(
  seasonId?: string,
  limit = 10,
): Promise<GuildHallOfFame[]> {
  const base = db
    .select()
    .from(guildHallOfFame)
    .orderBy(guildHallOfFame.placement, desc(guildHallOfFame.awardedAt))
    .limit(limit);

  if (seasonId) {
    return base.where(eq(guildHallOfFame.seasonId, seasonId));
  }
  return base;
}

// ─── War Leaderboard ──────────────────────────────────────────────────────────

export async function getSeasonLeaderboard(seasonId: string): Promise<{
  guildId: string;
  warsPlayed: number;
  warsWon: number;
  winRatePct: number;
  totalScore: number;
}[]> {
  const standingsMap = await computeSeasonStandings(seasonId);
  return Array.from(standingsMap.entries())
    .map(([guildId, s]) => ({
      guildId,
      warsPlayed: s.warsPlayed,
      warsWon: s.wins,
      winRatePct: s.warsPlayed > 0 ? Math.round((s.wins / s.warsPlayed) * 100) : 0,
      totalScore: s.totalScore,
    }))
    .sort((a, b) => b.warsWon - a.warsWon || b.totalScore - a.totalScore);
}
