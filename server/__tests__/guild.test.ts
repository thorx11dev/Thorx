/**
 * Guild system integration tests — THORX
 *
 * Covers the complete guild lifecycle end-to-end against a real DB:
 *   createGuild → users.guildId/guildRole sync
 *   applyToGuildWithCoverLetter → decideGuildApplication (accept/reject)
 *   requestToJoinGuild → decideGuildJoinRequest (old flow)
 *   leaveGuild → users.guildId/guildRole cleared
 *   removeGuildMember → users.guildId/guildRole cleared
 *   duplicate / error-guard cases (already in guild, full guild, etc.)
 *
 * All storage methods are called directly (no HTTP) — no CSRF concern.
 * Each test suite creates isolated users/guilds and cleans up in afterAll.
 *
 * Run: npx vitest run server/__tests__/guild.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  users,
  guilds,
  guildMembers,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "../storage";
import bcrypt from "bcrypt";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TS = Date.now();
const seededUserIds: string[] = [];
const seededGuildIds: string[] = [];

async function createTestUser(overrides: Partial<{
  firstName: string;
  lastName: string;
  identity: string;
  phone: string;
  email: string;
  role: string;
  userRankTier: string;
  guildRole: string;
}> = {}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [u] = await db.insert(users).values({
    firstName:    overrides.firstName  ?? "Guild",
    lastName:     overrides.lastName   ?? "Tester",
    identity:     overrides.identity   ?? `gtst_${TS}_${suffix}`,
    phone:        overrides.phone      ?? `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email:        overrides.email      ?? `gtst_${TS}_${suffix}@thorx-test.local`,
    passwordHash: await bcrypt.hash("TestPass123!", 10),
    referralCode: `GTREF_${suffix}`,
    role:         overrides.role       ?? "user",
    userRankTier: overrides.userRankTier ?? "E-Rank",
    guildRole:    overrides.guildRole  ?? "simple",
  } as any).returning();
  seededUserIds.push(u.id);
  return u.id;
}

async function createTestGuild(captainId: string, overrides: Partial<{
  name: string;
  memberCapacity: number;
  recruitmentOpen: boolean;
  minRankRequired: string;
}> = {}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 6);
  const guild = await storage.createGuild({
    name:        overrides.name ?? `TestGuild_${TS}_${suffix}`,
    description: "Automated test guild",
    captainId,
  });
  seededGuildIds.push(guild.id);

  // Apply overrides that createGuild doesn't expose
  if (overrides.memberCapacity !== undefined || overrides.recruitmentOpen !== undefined || overrides.minRankRequired !== undefined) {
    await db.update(guilds).set({
      memberCapacity:  overrides.memberCapacity  ?? 10,
      recruitmentOpen: overrides.recruitmentOpen ?? true,
      minRankRequired: overrides.minRankRequired ?? "E-Rank",
    }).where(eq(guilds.id, guild.id));
  }
  return guild.id;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Delete in FK-safe order: members → guilds → users
  if (seededGuildIds.length) {
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

// ── Suite 1: createGuild ──────────────────────────────────────────────────────

describe("createGuild()", () => {
  let captainId: string;
  let guildId: string;

  beforeAll(async () => {
    captainId = await createTestUser({ identity: `gcapt_${TS}` });
    guildId   = await createTestGuild(captainId);
  }, 30_000);

  it("creates the guild row", async () => {
    const guild = await storage.getGuildById(guildId);
    expect(guild).toBeDefined();
    expect(guild!.captainId).toBe(captainId);
  });

  it("inserts an active captain membership in guild_members", async () => {
    const [row] = await db
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, captainId)));
    expect(row).toBeDefined();
    expect(row.role).toBe("captain");
    expect(row.status).toBe("active");
  });

  it("syncs users.guildId to the new guild", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, captainId));
    expect(u.guildId).toBe(guildId);
  });

  it("syncs users.guildRole to 'captain'", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, captainId));
    expect(u.guildRole).toBe("captain");
  });

  it("throws if captain is already in a guild", async () => {
    await expect(
      storage.createGuild({ name: "Duplicate", captainId })
    ).rejects.toThrow(/already in a guild/i);
  });
});

// ── Suite 2: applyToGuildWithCoverLetter + decideGuildApplication ─────────────

describe("applyToGuildWithCoverLetter() + decideGuildApplication()", () => {
  let captainId: string;
  let guildId: string;
  let memberId: string;

  beforeAll(async () => {
    captainId = await createTestUser({ identity: `gapp_capt_${TS}` });
    guildId   = await createTestGuild(captainId, { recruitmentOpen: true });
    memberId  = await createTestUser({ identity: `gapp_mem_${TS}` });
  }, 30_000);

  it("creates a pending application", async () => {
    const membership = await storage.applyToGuildWithCoverLetter(guildId, memberId, "I want to join your great guild!");
    expect(membership.status).toBe("pending");
    expect(membership.guildId).toBe(guildId);
    expect(membership.userId).toBe(memberId);
  });

  it("rejects a duplicate application from the same user", async () => {
    await expect(
      storage.applyToGuildWithCoverLetter(guildId, memberId, "Trying again!")
    ).rejects.toThrow(/pending join request/i);
  });

  it("captain can accept the application", async () => {
    // Get the pending membership id
    const [pending] = await db
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberId), eq(guildMembers.status, "pending")));
    expect(pending).toBeDefined();

    const updated = await storage.decideGuildApplication(guildId, pending.id, captainId, "accept");
    expect(updated.status).toBe("active");
  });

  it("syncs users.guildId after accept", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildId).toBe(guildId);
  });

  it("syncs users.guildRole to 'member' after accept", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildRole).toBe("member");
  });

  it("increments guild.memberCount after accept", async () => {
    const guild = await storage.getGuildById(guildId);
    // Captain (1) + new member (1) = 2
    expect(guild!.memberCount).toBeGreaterThanOrEqual(2);
  });
});

// ── Suite 3: decideGuildApplication — reject path ────────────────────────────

describe("decideGuildApplication() — reject", () => {
  let captainId: string;
  let guildId: string;
  let rejecteeId: string;

  beforeAll(async () => {
    captainId  = await createTestUser({ identity: `grej_capt_${TS}` });
    guildId    = await createTestGuild(captainId, { recruitmentOpen: true });
    rejecteeId = await createTestUser({ identity: `grej_mem_${TS}` });
    await storage.applyToGuildWithCoverLetter(guildId, rejecteeId, "Please let me in, I am skilled.");
  }, 30_000);

  it("throws without a rejection reason (< 10 chars)", async () => {
    const [pending] = await db.select().from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, rejecteeId), eq(guildMembers.status, "pending")));
    await expect(
      storage.decideGuildApplication(guildId, pending.id, captainId, "reject", "Short")
    ).rejects.toThrow(/rejection reason/i);
  });

  it("sets status to 'rejected' with a valid reason", async () => {
    const [pending] = await db.select().from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, rejecteeId), eq(guildMembers.status, "pending")));
    const updated = await storage.decideGuildApplication(
      guildId, pending.id, captainId, "reject",
      "You do not meet our guild standards at this time."
    );
    expect(updated.status).toBe("rejected");
  });

  it("does NOT sync users.guildId after rejection", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, rejecteeId));
    expect(u.guildId).toBeNull();
    expect(u.guildRole).toBe("simple");
  });
});

// ── Suite 4: requestToJoinGuild + decideGuildJoinRequest (legacy flow) ────────

describe("requestToJoinGuild() + decideGuildJoinRequest()", () => {
  let captainId: string;
  let guildId: string;
  let memberId: string;

  beforeAll(async () => {
    captainId = await createTestUser({ identity: `glegacy_capt_${TS}` });
    guildId   = await createTestGuild(captainId, { recruitmentOpen: true });
    memberId  = await createTestUser({ identity: `glegacy_mem_${TS}` });
    await storage.requestToJoinGuild(guildId, memberId);
  }, 30_000);

  it("creates pending membership", async () => {
    const [row] = await db.select().from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberId), eq(guildMembers.status, "pending")));
    expect(row).toBeDefined();
  });

  it("captain approves: status becomes active", async () => {
    const updated = await storage.decideGuildJoinRequest(guildId, memberId, captainId, true);
    expect(updated.status).toBe("active");
  });

  it("syncs users.guildId on approval", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildId).toBe(guildId);
  });

  it("syncs users.guildRole to 'member' on approval", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildRole).toBe("member");
  });
});

// ── Suite 5: leaveGuild ───────────────────────────────────────────────────────

describe("leaveGuild()", () => {
  let captainId: string;
  let guildId: string;
  let memberId: string;

  beforeAll(async () => {
    captainId = await createTestUser({ identity: `gleave_capt_${TS}` });
    guildId   = await createTestGuild(captainId, { recruitmentOpen: true });
    memberId  = await createTestUser({ identity: `gleave_mem_${TS}` });
    // Apply + approve in one shot via legacy flow
    await storage.requestToJoinGuild(guildId, memberId);
    await storage.decideGuildJoinRequest(guildId, memberId, captainId, true);
  }, 30_000);

  it("throws if the captain tries to leave", async () => {
    await expect(
      storage.leaveGuild(guildId, captainId)
    ).rejects.toThrow(/captain cannot leave/i);
  });

  it("member can leave successfully", async () => {
    await expect(storage.leaveGuild(guildId, memberId)).resolves.toBeUndefined();
  });

  it("clears users.guildId after leave", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildId).toBeNull();
  });

  it("resets users.guildRole to 'simple' after leave", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildRole).toBe("simple");
  });

  it("sets membership status to 'left'", async () => {
    const [row] = await db.select().from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberId)));
    expect(row.status).toBe("left");
    expect(row.leftAt).not.toBeNull();
  });

  it("decrements guild.memberCount", async () => {
    const guild = await storage.getGuildById(guildId);
    // Only captain remains
    expect(guild!.memberCount).toBe(1);
  });

  it("throws if user tries to leave a guild they are not in", async () => {
    await expect(
      storage.leaveGuild(guildId, memberId)
    ).rejects.toThrow(/not an active member/i);
  });
});

// ── Suite 6: removeGuildMember ────────────────────────────────────────────────

describe("removeGuildMember()", () => {
  let captainId: string;
  let guildId: string;
  let memberId: string;
  let outsiderId: string;

  beforeAll(async () => {
    captainId  = await createTestUser({ identity: `gkick_capt_${TS}` });
    guildId    = await createTestGuild(captainId, { recruitmentOpen: true });
    memberId   = await createTestUser({ identity: `gkick_mem_${TS}` });
    outsiderId = await createTestUser({ identity: `gkick_out_${TS}` });
    await storage.requestToJoinGuild(guildId, memberId);
    await storage.decideGuildJoinRequest(guildId, memberId, captainId, true);
  }, 30_000);

  it("throws if a non-captain tries to remove", async () => {
    await expect(
      storage.removeGuildMember(guildId, memberId, outsiderId)
    ).rejects.toThrow(/only the captain or an authorized assistant/i);
  });

  it("throws if captain tries to remove themselves", async () => {
    await expect(
      storage.removeGuildMember(guildId, captainId, captainId)
    ).rejects.toThrow(/captain cannot remove themselves/i);
  });

  it("captain removes a member successfully", async () => {
    await expect(
      storage.removeGuildMember(guildId, memberId, captainId)
    ).resolves.toBeUndefined();
  });

  it("clears users.guildId after removal", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildId).toBeNull();
  });

  it("resets users.guildRole to 'simple' after removal", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    expect(u.guildRole).toBe("simple");
  });

  it("membership status is 'left' after removal", async () => {
    const [row] = await db.select().from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberId)));
    expect(row.status).toBe("left");
  });

  it("throws when trying to remove a non-member", async () => {
    await expect(
      storage.removeGuildMember(guildId, outsiderId, captainId)
    ).rejects.toThrow(/not an active member/i);
  });
});

// ── Suite 7: rank gate in applyToGuildWithCoverLetter ────────────────────────

describe("Guild rank gate", () => {
  let captainId: string;
  let guildId: string;
  let lowRankUserId: string;

  beforeAll(async () => {
    captainId      = await createTestUser({ identity: `grankgate_capt_${TS}` });
    lowRankUserId  = await createTestUser({ identity: `grankgate_low_${TS}`, userRankTier: "E-Rank" });
    guildId        = await createTestGuild(captainId, { recruitmentOpen: true, minRankRequired: "B-Rank" });
  }, 30_000);

  it("rejects applicant below minimum rank", async () => {
    await expect(
      storage.applyToGuildWithCoverLetter(guildId, lowRankUserId, "I really want to join this high-rank guild!")
    ).rejects.toThrow(/B-Rank/i);
  });
});

// ── Suite 8: closed recruitment ───────────────────────────────────────────────

describe("Guild recruitment closed", () => {
  let captainId: string;
  let guildId: string;
  let applicantId: string;

  beforeAll(async () => {
    captainId   = await createTestUser({ identity: `gclosed_capt_${TS}` });
    applicantId = await createTestUser({ identity: `gclosed_app_${TS}` });
    guildId     = await createTestGuild(captainId, { recruitmentOpen: false });
  }, 30_000);

  it("throws when recruitment is closed", async () => {
    await expect(
      storage.applyToGuildWithCoverLetter(guildId, applicantId, "Please let me in to your closed guild!")
    ).rejects.toThrow(/not accepting/i);
  });
});
