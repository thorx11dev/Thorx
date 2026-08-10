/**
 * Guild Wars lifecycle integration tests — THORX
 *
 * Covers the complete war pipeline end-to-end against a real DB using the
 * exact same module functions the HTTP routes call:
 *   initiateChallenge → guards (self / non-captain / already-busy)
 *   voteOnWar         → wrong-turn / reject→cancel / all-approve→active
 *   getGuildCurrentWar + getWarWithApprovals
 *   contributeWarPoints → participant upsert accumulation
 *   contributeToWarChest → chest funded only while a guild is in an active war
 *   resolveWar        → winner by score takes BOTH war chests as the prize
 *                       (halal model), war_winner badge awarded, idempotent;
 *                       draw returns each guild's own chest
 *
 * Run: npx vitest run server/__tests__/guild-wars.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  users,
  guilds,
  guildMembers,
  guildWars,
  guildWarApprovals,
  guildWarParticipants,
  guildBadges,
} from "@shared/schema";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { storage } from "../storage";
import bcrypt from "bcrypt";
import Decimal from "decimal.js";
import {
  initiateChallenge,
  voteOnWar,
  getGuildCurrentWar,
  getWarWithApprovals,
  contributeWarPoints,
  contributeToWarChest,
  resolveWar,
} from "../modules/guild-wars";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TS = Date.now();
const seededUserIds: string[] = [];
const seededGuildIds: string[] = [];

async function createTestUser(overrides: Partial<{
  firstName: string;
  lastName: string;
  identity: string;
  email: string;
  userRankTier: string;
  guildRole: string;
}> = {}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [u] = await db.insert(users).values({
    firstName:    overrides.firstName  ?? "War",
    lastName:     overrides.lastName   ?? "Tester",
    identity:     overrides.identity   ?? `wtest_${TS}_${suffix}`,
    phone:        `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email:        overrides.email      ?? `wtest_${TS}_${suffix}@thorx-test.local`,
    passwordHash: await bcrypt.hash("TestPass123!", 10),
    referralCode: `WREF_${suffix}`,
    role:         "user",
    userRankTier: overrides.userRankTier ?? "E-Rank",
    guildRole:    overrides.guildRole  ?? "simple",
  } as any).returning();
  seededUserIds.push(u.id);
  return u.id;
}

async function createTestGuild(captainId: string, overrides: Partial<{
  name: string;
  targetDifficulty: string;
  weeklyBonusPool: string;
  warChestPkr: string;
}> = {}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 6);
  const guild = await storage.createGuild({
    name:        overrides.name ?? `WarGuild_${TS}_${suffix}`,
    description: "Automated war test guild",
    captainId,
  });
  seededGuildIds.push(guild.id);

  if (overrides.targetDifficulty !== undefined || overrides.weeklyBonusPool !== undefined || overrides.warChestPkr !== undefined) {
    await db.update(guilds).set({
      targetDifficulty: overrides.targetDifficulty ?? "medium",
      weeklyBonusPool:  overrides.weeklyBonusPool ?? "0.0000",
      warChestPkr:      overrides.warChestPkr ?? "0.0000",
    }).where(eq(guilds.id, guild.id));
  }
  return guild.id;
}

/** Adds an active member via the real application flow (capacity/rank gated). */
async function addActiveMember(guildId: string, userId: string, cover = "I want to fight for your guild."): Promise<void> {
  await storage.applyToGuildWithCoverLetter(guildId, userId, cover);
  const [pending] = await db
    .select({ id: guildMembers.id })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId), eq(guildMembers.status, "pending")));
  if (!pending) throw new Error("pending membership row not found");
  const [captain] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.guildId, guildId), eq(users.guildRole, "captain")));
  await storage.decideGuildApplication(guildId, pending.id, captain!.id, "accept");
  // Re-fetch AFTER accept — memberCount is denormalized and incremented in-tx
  const fresh = await storage.getGuildById(guildId);
  expect(fresh!.memberCount).toBeGreaterThanOrEqual(2);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (seededGuildIds.length) {
    await db.delete(guildWarApprovals)
      .where(inArray(guildWarApprovals.guildId, seededGuildIds))
      .catch(() => {});
    await db.delete(guildWarParticipants)
      .where(inArray(guildWarParticipants.guildId, seededGuildIds))
      .catch(() => {});
    await db.delete(guildBadges)
      .where(inArray(guildBadges.guildId, seededGuildIds))
      .catch(() => {});
    await db.delete(guildWars)
      .where(
        or(
          inArray(guildWars.challengerGuildId, seededGuildIds),
          inArray(guildWars.challengedGuildId, seededGuildIds),
        )
      )
      .catch(() => {});
    await db.delete(guildMembers)
      .where(inArray(guildMembers.guildId, seededGuildIds))
      .catch(() => {});
    await db.delete(guilds)
      .where(inArray(guilds.id, seededGuildIds))
      .catch(() => {});
  }
  if (seededUserIds.length) {
    await db.delete(users)
      .where(inArray(users.id, seededUserIds))
      .catch(() => {});
  }
  await pool.end();
}, 30_000);

// ── Suite 1: initiateChallenge guards + creation ─────────────────────────────

describe("initiateChallenge()", () => {
  let captA: string;
  let captB: string;
  let memberB: string;
  let guildA: string;
  let guildB: string;

  beforeAll(async () => {
    captA   = await createTestUser({ identity: `wcap_a_${TS}` });
    captB   = await createTestUser({ identity: `wcap_b_${TS}` });
    memberB = await createTestUser({ identity: `wmem_b_${TS}` });
    guildA  = await createTestGuild(captA, { targetDifficulty: "medium" });
    guildB  = await createTestGuild(captB, { targetDifficulty: "medium" });
    await addActiveMember(guildB, memberB);
  }, 30_000);

  it("rejects a guild challenging itself", async () => {
    await expect(
      initiateChallenge({ challengerGuildId: guildA, challengedGuildId: guildA, captainId: captA })
    ).rejects.toThrow(/cannot challenge itself/i);
  });

  it("rejects a non-captain initiator", async () => {
    await expect(
      initiateChallenge({ challengerGuildId: guildB, challengedGuildId: guildA, captainId: memberB })
    ).rejects.toThrow(/captain/i);
  });

  it("creates a war in pending_challenger_approval", async () => {
    const war = await initiateChallenge({ challengerGuildId: guildA, challengedGuildId: guildB, captainId: captA });
    expect(war.status).toBe("pending_challenger_approval");
    expect(war.challengerGuildId).toBe(guildA);
    expect(war.challengedGuildId).toBe(guildB);
  });

  it("rejects a second challenge while either guild is busy", async () => {
    await expect(
      initiateChallenge({ challengerGuildId: guildA, challengedGuildId: guildB, captainId: captA })
    ).rejects.toThrow(/already in an active war|pending challenge/i);
  });
});

// ── Suite 2: voteOnWar — rejection, wrong turn, and full approval ────────────

describe("voteOnWar()", () => {
  let captA: string;
  let captB: string;
  let memberA: string;
  let memberB: string;
  let guildA: string;
  let guildB: string;
  let warId: string;
  let secondWarId: string;

  beforeAll(async () => {
    captA   = await createTestUser({ identity: `wv_capt_a_${TS}` });
    captB   = await createTestUser({ identity: `wv_capt_b_${TS}` });
    memberA = await createTestUser({ identity: `wv_mem_a_${TS}` });
    memberB = await createTestUser({ identity: `wv_mem_b_${TS}` });
    guildA  = await createTestGuild(captA, { targetDifficulty: "medium" });
    guildB  = await createTestGuild(captB, { targetDifficulty: "medium" });
    await addActiveMember(guildA, memberA);
    await addActiveMember(guildB, memberB);
    const war = await initiateChallenge({ challengerGuildId: guildA, challengedGuildId: guildB, captainId: captA });
    warId = war.id;
  }, 30_000);

  it("rejects a vote from the guild whose turn it is not", async () => {
    await expect(
      voteOnWar({ warId, userId: memberB, approved: true })
    ).rejects.toThrow(/not your guild's turn/i);
  });

  it("rejects a non-member vote", async () => {
    const outsider = await createTestUser({ identity: `wv_out_${TS}` });
    await expect(
      voteOnWar({ warId, userId: outsider, approved: true })
    ).rejects.toThrow(/not an active guild member/i);
  });

  it("challenger guild: a single reject cancels the war", async () => {
    const result = await voteOnWar({ warId, userId: memberA, approved: false });
    expect(result.cancelled).toBe(true);
    expect(result.war.status).toBe("cancelled");
  });

  it("challenger guild: full approval moves to pending_challenged_approval", async () => {
    // warId was cancelled by the previous test — start a fresh challenge
    const war = await initiateChallenge({ challengerGuildId: guildA, challengedGuildId: guildB, captainId: captA });
    secondWarId = war.id;
    await voteOnWar({ warId: secondWarId, userId: captA, approved: true });
    const result = await voteOnWar({ warId: secondWarId, userId: memberA, approved: true });
    expect(result.allApproved).toBe(true);
    expect(result.war.status).toBe("pending_challenged_approval");
  });

  it("challenged guild: full approval starts the war (active)", async () => {
    await voteOnWar({ warId: secondWarId, userId: captB, approved: true });
    const result = await voteOnWar({ warId: secondWarId, userId: memberB, approved: true });
    expect(result.allApproved).toBe(true);
    expect(result.war.status).toBe("active");

    const current = await getGuildCurrentWar(guildA);
    expect(current?.id).toBe(secondWarId);
    expect(current?.status).toBe("active");
  });

  it("getWarWithApprovals reports both guilds' approval counts", async () => {
    const info = await getWarWithApprovals(secondWarId, guildA);
    expect(info.totalActiveMembers).toBe(2);
    expect(info.approvedCount).toBe(2);
  });
});

// ── Suite 3: contributeWarPoints + resolveWar (winner, pool, badge, draw) ────

describe("contributeWarPoints() + resolveWar()", () => {
  let captA: string;
  let captB: string;
  let memberA: string;
  let memberB: string;
  let guildA: string;
  let guildB: string;
  let warId: string;

  beforeAll(async () => {
    captA   = await createTestUser({ identity: `wr_capt_a_${TS}` });
    captB   = await createTestUser({ identity: `wr_capt_b_${TS}` });
    memberA = await createTestUser({ identity: `wr_mem_a_${TS}` });
    memberB = await createTestUser({ identity: `wr_mem_b_${TS}` });
    // War chests fund the halal prize (migration 0008): both guilds' chests
    // grow from THORX's revenue cut during the war; the winner takes BOTH.
    guildA  = await createTestGuild(captA, { targetDifficulty: "medium", warChestPkr: "600.0000" });
    guildB  = await createTestGuild(captB, { targetDifficulty: "medium", warChestPkr: "400.0000" });
    await addActiveMember(guildA, memberA);
    await addActiveMember(guildB, memberB);
    const war = await initiateChallenge({ challengerGuildId: guildA, challengedGuildId: guildB, captainId: captA });
    warId = war.id;
    await voteOnWar({ warId, userId: captA, approved: true });
    await voteOnWar({ warId, userId: memberA, approved: true });
    await voteOnWar({ warId, userId: captB, approved: true });
    await voteOnWar({ warId, userId: memberB, approved: true });
  }, 30_000);

  it("contributeWarPoints accumulates per user (upsert)", async () => {
    await contributeWarPoints(memberA, guildA, 120);
    await contributeWarPoints(memberA, guildA, 80);
    const [row] = await db
      .select({ pointsContributed: guildWarParticipants.pointsContributed })
      .from(guildWarParticipants)
      .where(and(eq(guildWarParticipants.warId, warId), eq(guildWarParticipants.userId, memberA)));
    expect(Number(row?.pointsContributed ?? 0)).toBe(200);
  });

  it("resolveWar: higher score wins, winner takes BOTH chests as prize, badge awarded", async () => {
    await db.update(guildWars)
      .set({ challengerScore: 350, challengedScore: 210 })
      .where(eq(guildWars.id, warId));

    const result = await resolveWar(warId);
    expect(result.winnerId).toBe(guildA);
    expect(result.isDraw).toBe(false);
    // Winner's prize = both guilds' chests (600 + 400)
    expect(result.prizePkr).toBe("1000.00");

    const [war] = await db.select().from(guildWars).where(eq(guildWars.id, warId));
    expect(war.status).toBe("completed");
    expect(war.winnerId).toBe(guildA);
    expect(war.completedAt).not.toBeNull();
    expect(Number(war.prizePkr)).toBeCloseTo(1000, 0);

    // Both chests zeroed; prize credited to the winner's weekly bonus pool
    // (in the same transaction as the status update)
    const [loserG] = await db.select().from(guilds).where(eq(guilds.id, guildB));
    expect(Number(loserG.warChestPkr)).toBe(0);
    expect(Number(loserG.weeklyBonusPool)).toBe(0);
    const [winnerG] = await db.select().from(guilds).where(eq(guilds.id, guildA));
    expect(Number(winnerG.warChestPkr)).toBe(0);
    expect(Number(winnerG.weeklyBonusPool)).toBeCloseTo(1000, 0);

    const badge = await db
      .select()
      .from(guildBadges)
      .where(and(eq(guildBadges.guildId, guildA), eq(guildBadges.badgeType, "war_winner")));
    expect(badge.length).toBeGreaterThanOrEqual(1);
  });

  it("contributeToWarChest funds the chest only while the guild is in an active war", async () => {
    // Fresh guilds + a directly-inserted active war → funding path
    const captC = await createTestUser({ identity: `wr_capt_c_${TS}` });
    const captD = await createTestUser({ identity: `wr_capt_d_${TS}` });
    const guildC = await createTestGuild(captC, { targetDifficulty: "medium" });
    const guildD = await createTestGuild(captD, { targetDifficulty: "medium" });
    await db.insert(guildWars).values({
      challengerGuildId: guildC,
      challengedGuildId: guildD,
      status: "active",
      challengerScore: 0,
      challengedScore: 0,
      startedAt: new Date(),
    });

    const funded = await contributeToWarChest(guildC, new Decimal("12.3400"));
    expect(funded).toBe(true);
    const [gC] = await db.select().from(guilds).where(eq(guilds.id, guildC));
    expect(Number(gC.warChestPkr)).toBeCloseTo(12.34, 2);

    // A guild with no active war is NOT funded — THORX keeps the full cut
    const captE = await createTestUser({ identity: `wr_capt_e_${TS}` });
    const guildE = await createTestGuild(captE, { targetDifficulty: "medium" });
    const fundedNone = await contributeToWarChest(guildE, new Decimal("5.0000"));
    expect(fundedNone).toBe(false);
    const [gE] = await db.select().from(guilds).where(eq(guilds.id, guildE));
    expect(Number(gE.warChestPkr)).toBe(0);
  });

  it("resolveWar is idempotent on a completed war", async () => {
    const again = await resolveWar(warId);
    expect(again.winnerId).toBe(guildA);
    expect(again.isDraw).toBe(false);
  });

  it("draw war resolves with no winner and no pool transfer", async () => {
    const w2 = await initiateChallenge({ challengerGuildId: guildB, challengedGuildId: guildA, captainId: captB });
    await voteOnWar({ warId: w2.id, userId: captB, approved: true });
    await voteOnWar({ warId: w2.id, userId: memberB, approved: true });
    await voteOnWar({ warId: w2.id, userId: captA, approved: true });
    await voteOnWar({ warId: w2.id, userId: memberA, approved: true });

    await db.update(guildWars)
      .set({ challengerScore: 100, challengedScore: 100 })
      .where(eq(guildWars.id, w2.id));

    // Re-fund both chests to verify the draw return path (reset the pools
    // too — the winner test above credited guildA's pool with the prize).
    await db.update(guilds).set({ warChestPkr: "250.0000", weeklyBonusPool: "0.0000" }).where(eq(guilds.id, guildA));
    await db.update(guilds).set({ warChestPkr: "150.0000", weeklyBonusPool: "0.0000" }).where(eq(guilds.id, guildB));

    const result = await resolveWar(w2.id);
    expect(result.winnerId).toBeNull();
    expect(result.isDraw).toBe(true);
    // A draw pays no prize — each guild gets its own chest back instead.
    expect(result.prizePkr).toBe("0.00");

    const [war] = await db.select().from(guildWars).where(eq(guildWars.id, w2.id));
    expect(war.status).toBe("completed");
    expect(war.winnerId).toBeNull();
    expect(Number(war.prizePkr)).toBe(0);

    // Both chests zeroed; each guild keeps its own chest in its own pool
    const [gA] = await db.select().from(guilds).where(eq(guilds.id, guildA));
    const [gB] = await db.select().from(guilds).where(eq(guilds.id, guildB));
    expect(Number(gA.warChestPkr)).toBe(0);
    expect(Number(gB.warChestPkr)).toBe(0);
    expect(Number(gA.weeklyBonusPool)).toBeCloseTo(250, 0);
    expect(Number(gB.weeklyBonusPool)).toBeCloseTo(150, 0);
  });
});
