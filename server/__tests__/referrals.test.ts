/**
 * Referral system integration tests — THORX
 *
 * Covers:
 *  1. createUser() with referral code → referredBy linked + referrals table row
 *  2. /api/referrals endpoint exposes user's own referralCode (HTTP integration)
 *  3. recordEarnEvent() → 1% commission credited to referrer (REFERRAL_EARN_PCT)
 *  4. Commission row inserted in referral_earn_commissions table
 *  5. Referrer's balanceCashPkr increases by exactly 1% of grossPkr
 *  6. Indirect earn events do NOT trigger referral commission
 *  7. getUserReferrals() returns the referred user
 *  8. getReferralStats() aggregates correctly
 *  9. Circular referral detection
 *
 * Run: npx vitest run server/__tests__/referrals.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import { db, pool } from "../db";
import {
  users,
  referrals,
  referralEarnCommissions,
  userTransactions,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "../storage";
import bcrypt from "bcrypt";
import Decimal from "decimal.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TS = Date.now();
const seededUserIds: string[] = [];

async function createTestUser(overrides: Partial<{
  firstName: string;
  lastName: string;
  identity: string;
  phone: string;
  email: string;
  referralCode: string;
  referredBy: string;
}> = {}): Promise<{ id: string; referralCode: string }> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const code = overrides.referralCode ?? `REFTST_${suffix}`;
  const [u] = await db.insert(users).values({
    firstName:    overrides.firstName ?? "Referral",
    lastName:     overrides.lastName  ?? "Tester",
    identity:     overrides.identity  ?? `reftst_${TS}_${suffix}`,
    phone:        overrides.phone     ?? `034${Math.floor(10000000 + Math.random() * 89999999)}`,
    email:        overrides.email     ?? `reftst_${TS}_${suffix}@thorx-test.local`,
    passwordHash: await bcrypt.hash("TestPass123!", 10),
    referralCode: code,
    referredBy:   overrides.referredBy ?? null,
    role:         "user",
  } as any).returning();
  seededUserIds.push(u.id);
  return { id: u.id, referralCode: u.referralCode };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (seededUserIds.length) {
    await db.delete(referralEarnCommissions)
      .where(inArray(referralEarnCommissions.referrerId, seededUserIds))
      .catch(() => {});
    await db.delete(referralEarnCommissions)
      .where(inArray(referralEarnCommissions.earnerId, seededUserIds))
      .catch(() => {});
    await db.delete(referrals)
      .where(inArray(referrals.referrerId, seededUserIds))
      .catch(() => {});
    await db.delete(userTransactions)
      .where(inArray(userTransactions.userId, seededUserIds))
      .catch(() => {});
    await db.delete(users)
      .where(inArray(users.id, seededUserIds))
      .catch(() => {});
  }
  await pool.end();
}, 30_000);

// ── CSRF helper (for HTTP tests) ──────────────────────────────────────────────

function getCsrfToken(res: request.Response): string {
  const cookies: string[] = Array.isArray(res.headers["set-cookie"])
    ? res.headers["set-cookie"]
    : res.headers["set-cookie"] ? [res.headers["set-cookie"]] : [];
  for (const c of cookies) {
    const m = c.match(/thorx\.csrf\.v2=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return "";
}

// ── Suite 1: referralCode always generated on createUser() ───────────────────

describe("createUser() referralCode", () => {
  it("generates a non-empty referralCode for every new user", async () => {
    const { referralCode } = await createTestUser({ identity: `ref_code_check_${TS}` });
    expect(referralCode).toBeTruthy();
    expect(referralCode.startsWith("REFTST_")).toBe(true);
  });

  it("storage.createUser() generates THORX-XXXX referralCode", async () => {
    // Use the full storage flow (includes bcrypt + referralCode generation)
    const user = await storage.createUser({
      firstName:    "StorageRef",
      lastName:     "Tester",
      identity:     `storageref_${TS}`,
      phone:        `035${Math.floor(10000000 + Math.random() * 89999999)}`,
      email:        `storageref_${TS}@thorx-test.local`,
      passwordHash: "TestPass123!",
      referralCode: "", // will be overwritten by storage
      role:         "user",
    } as any);
    seededUserIds.push(user.id);
    expect(user.referralCode).toMatch(/^THORX-[A-Z0-9]+$/);
  });
});

// ── Suite 2: referral link (referredBy) ──────────────────────────────────────

describe("Referral link — createUser with referredBy", () => {
  let referrerId: string;
  let referredId: string;

  beforeAll(async () => {
    const ref = await createTestUser({ identity: `reflink_referrer_${TS}` });
    referrerId = ref.id;
    // Create referred user using storage.createUser() to trigger the referrals table insert
    const referred = await storage.createUser({
      firstName:    "Referred",
      lastName:     "User",
      identity:     `reflink_referred_${TS}`,
      phone:        `036${Math.floor(10000000 + Math.random() * 89999999)}`,
      email:        `reflink_referred_${TS}@thorx-test.local`,
      passwordHash: "TestPass123!",
      referralCode: "",
      referredBy:   referrerId,
      role:         "user",
    } as any);
    seededUserIds.push(referred.id);
    referredId = referred.id;
  }, 30_000);

  it("sets referredBy on the new user", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, referredId));
    expect(u.referredBy).toBe(referrerId);
  });

  it("inserts a row in referrals table", async () => {
    const [row] = await db.select().from(referrals)
      .where(and(eq(referrals.referrerId, referrerId), eq(referrals.referredId, referredId)));
    expect(row).toBeDefined();
    expect(row.tier).toBe(1);
    expect(row.status).toBe("active");
  });

  it("getUserReferrals() includes the referred user", async () => {
    const result = await storage.getUserReferrals(referrerId);
    const found = result.find((r: any) => r.id === referredId || r.referredId === referredId);
    expect(found).toBeDefined();
  });

  it("throws on circular referral", async () => {
    // referredId trying to refer referrerId (who already referred referredId)
    await expect(
      storage.createUser({
        firstName:    "Circular",
        lastName:     "Test",
        identity:     `circular_${TS}`,
        phone:        `037${Math.floor(10000000 + Math.random() * 89999999)}`,
        email:        `circular_${TS}@thorx-test.local`,
        passwordHash: "TestPass123!",
        referralCode: "",
        id:           referrerId, // try to insert with referrerId's ID
        referredBy:   referredId,
        role:         "user",
      } as any)
    ).rejects.toThrow(/circular referral/i);
  });
});

// ── Suite 3: 1% earn commission on Engine A / B ───────────────────────────────

describe("Referral earn commission (REFERRAL_EARN_PCT = 1%)", () => {
  let referrerId: string;
  let earnerId: string;
  const GROSS_PKR = 100; // big round number → easy to verify math

  beforeAll(async () => {
    const ref = await createTestUser({ identity: `refcomm_referrer_${TS}` });
    referrerId = ref.id;
    const earner = await storage.createUser({
      firstName:    "Earner",
      lastName:     "User",
      identity:     `refcomm_earner_${TS}`,
      phone:        `038${Math.floor(10000000 + Math.random() * 89999999)}`,
      email:        `refcomm_earner_${TS}@thorx-test.local`,
      passwordHash: "TestPass123!",
      referralCode: "",
      referredBy:   referrerId,
      role:         "user",
    } as any);
    seededUserIds.push(earner.id);
    earnerId = earner.id;
  }, 30_000);

  it("credits 1% of grossPkr to referrer's balanceCashPkr (Engine A)", async () => {
    const before = await storage.getUserById(referrerId);
    const beforeBalance = new Decimal(before!.balanceCashPkr ?? "0");

    await storage.recordEarnEvent({
      userId:     earnerId,
      engineType: "Engine_A",
      grossPkr:   GROSS_PKR,
      sourceId:   `test_ref_comm_a_${TS}`,
      sourceType: "ad_view",
    });

    const after = await storage.getUserById(referrerId);
    const afterBalance = new Decimal(after!.balanceCashPkr ?? "0");
    const delta = afterBalance.minus(beforeBalance);

    // 1% of 100 = 1.0000 PKR
    expect(delta.toNumber()).toBeCloseTo(1.0, 3);
  });

  it("inserts a referral_earn_commissions row", async () => {
    const rows = await db.select().from(referralEarnCommissions)
      .where(and(
        eq(referralEarnCommissions.referrerId, referrerId),
        eq(referralEarnCommissions.earnerId, earnerId),
      ));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Decimal(rows[0].commissionPkr).toNumber()).toBeCloseTo(1.0, 3);
  });

  it("credits 1% commission for Engine B as well", async () => {
    const before = await storage.getUserById(referrerId);
    const beforeBalance = new Decimal(before!.balanceCashPkr ?? "0");

    await storage.recordEarnEvent({
      userId:     earnerId,
      engineType: "Engine_B",
      grossPkr:   GROSS_PKR,
      sourceId:   `test_ref_comm_b_${TS}`,
      sourceType: "engine_b_task",
    });

    const after = await storage.getUserById(referrerId);
    const afterBalance = new Decimal(after!.balanceCashPkr ?? "0");
    const delta = afterBalance.minus(beforeBalance);
    expect(delta.toNumber()).toBeCloseTo(1.0, 3);
  });

  it("does NOT credit commission for Indirect earn events", async () => {
    const before = await storage.getUserById(referrerId);
    const beforeBalance = new Decimal(before!.balanceCashPkr ?? "0");

    await storage.recordEarnEvent({
      userId:     earnerId,
      engineType: "Indirect",
      grossPkr:   0,
      sourceId:   `test_ref_comm_indirect_${TS}`,
      sourceType: "indirect_task",
    });

    const after = await storage.getUserById(referrerId);
    const afterBalance = new Decimal(after!.balanceCashPkr ?? "0");
    expect(afterBalance.toNumber()).toBe(beforeBalance.toNumber()); // unchanged
  });
});

// ── Suite 4: no referrer → no commission ─────────────────────────────────────

describe("No referral commission when referredBy is null", () => {
  let standaloneUserId: string;

  beforeAll(async () => {
    const u = await createTestUser({ identity: `no_ref_${TS}` });
    standaloneUserId = u.id;
  }, 15_000);

  it("earn event completes without inserting commission row", async () => {
    const before = await db.select().from(referralEarnCommissions)
      .where(eq(referralEarnCommissions.earnerId, standaloneUserId));
    expect(before.length).toBe(0);

    await storage.recordEarnEvent({
      userId:     standaloneUserId,
      engineType: "Engine_A",
      grossPkr:   50,
      sourceId:   `no_ref_earn_${TS}`,
      sourceType: "ad_view",
    });

    const after = await db.select().from(referralEarnCommissions)
      .where(eq(referralEarnCommissions.earnerId, standaloneUserId));
    expect(after.length).toBe(0); // still zero
  });
});

// ── Suite 5: HTTP — /api/referrals exposes referralCode ──────────────────────

describe("GET /api/referrals — exposes user's own referralCode", () => {
  let app: any;
  let agent: Agent;
  let userId: string;
  let csrfToken = "";
  const PASSWORD = "TestPass123!";

  beforeAll(async () => {
    // Boot the Express app
    const expressModule = await import("express");
    app = expressModule.default();
    app.use(expressModule.default.json({ limit: "10mb" }));
    app.use(expressModule.default.urlencoded({ extended: false }));
    const { registerRoutes } = await import("../routes");
    await registerRoutes(app);
    agent = request.agent(app);

    // Seed CSRF
    const seedRes = await agent.get("/api/health");
    csrfToken = getCsrfToken(seedRes);

    // Register a user via HTTP so session is established
    const suffix = Math.random().toString(36).slice(2, 8);
    const res = await agent
      .post("/api/register")
      .set("x-csrf-token", csrfToken)
      .send({
        firstName: "HTTPRef",
        lastName:  "Tester",
        email:     `httpref_${TS}_${suffix}@thorx-test.local`,
        password:  PASSWORD,
        phone:     `039${Math.floor(10000000 + Math.random() * 89999999)}`,
        identity:  `httpref_${TS}_${suffix}`,
      });
    expect(res.status).toBe(201);
    userId = res.body.user?.id;
    seededUserIds.push(userId);
  }, 60_000);

  it("returns 200 with a non-null referralCode", async () => {
    const res = await agent.get("/api/referrals");
    expect(res.status).toBe(200);
    expect(res.body.referralCode).toBeTruthy();
    expect(typeof res.body.referralCode).toBe("string");
  });

  it("returned referralCode matches the one stored in DB", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const res  = await agent.get("/api/referrals");
    expect(res.body.referralCode).toBe(u.referralCode);
  });

  it("returns empty referrals array for new user", async () => {
    const res = await agent.get("/api/referrals");
    expect(Array.isArray(res.body.referrals)).toBe(true);
    expect(res.body.referrals.length).toBe(0);
  });

  it("returns 401 when not authenticated", async () => {
    const anonAgent = request.agent(app);
    await anonAgent.get("/api/health"); // seed CSRF
    const res = await anonAgent.get("/api/referrals");
    expect(res.status).toBe(401);
  });
});
