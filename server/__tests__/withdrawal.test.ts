/**
 * Withdrawal integration tests — REAL PKR ECONOMY v4
 *
 * Covers:
 *  1. PKR-denominated withdrawal request: hold debits available_balance at
 *     request time (Spec §18) and always starts 'pending' (Spec §12).
 *  2. Pro-rata partial last-row: FIFO consumption by realPkrValue produces
 *     exactly proportional PKR — not the full row value.
 *  3. Idempotency: a second concurrent pending withdrawal from the same user
 *     (or one that would overspend the balance) is rejected (Spec §19).
 *  4. Admin completing / rejecting a withdrawal.
 *  5. Double-settlement guard: re-completing a completed withdrawal throws.
 *  6. MIN_PAYOUT guard (default Rs.500) + insufficient-available guard.
 *
 * These tests exercise storage methods directly (not via HTTP) so there is no
 * CSRF or session concern. Financial math unit coverage lives in financial.test.ts.
 *
 * Run: npx vitest run server/__tests__/withdrawal.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { users, withdrawals, userTransactions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../storage";
import bcrypt from "bcrypt";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TS            = Date.now();
const TEST_EMAIL    = `test_wd_${TS}@thorx-test.local`;
const TEST_PHONE    = `031${Math.floor(10000000 + Math.random() * 89999999)}`;
const TEST_IDENTITY = `twd_${TS}`;

let testUserId: string;
let founderUserId: string;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestUser(overrides: Partial<{
  firstName: string; lastName: string; identity: string;
  phone: string; email: string; role: string; availableBalance: string;
}> = {}): Promise<string> {
  const [u] = await db.insert(users).values({
    firstName:        overrides.firstName ?? "Withdrawal",
    lastName:         overrides.lastName  ?? "Test",
    identity:         overrides.identity  ?? TEST_IDENTITY,
    phone:            overrides.phone     ?? TEST_PHONE,
    email:            overrides.email     ?? TEST_EMAIL,
    passwordHash:     await bcrypt.hash("TestPass123!", 10),
    referralCode:     `REF_${TS}_${Math.random().toString(36).slice(2, 7)}`,
    role:             overrides.role      ?? "user",
    availableBalance: overrides.availableBalance ?? "0.00",
  } as any).returning();
  return u.id;
}

/**
 * Seed verified ledger rows. Each row carries `pkrEach` of real, verified PKR.
 * v4: only 'verified' rows back a payout — pending money is not withdrawable.
 */
async function seedLedger(userId: string, count: number, pkrEach: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const [row] = await db.insert(userTransactions).values({
      userId,
      engineType:     "Engine_A",
      pointsCredited: Math.floor(parseFloat(pkrEach) * 10),
      realPkrValue:   pkrEach,
      grossPkr:       (parseFloat(pkrEach) / 0.6).toFixed(4),
      thorxProfitPkr: (parseFloat(pkrEach) / 0.6 * 0.4).toFixed(4),
      conversionRate: 10,
      cardVariance:   "1.0000",
      sourceId:       `seed_${TS}_${i}_${Math.random().toString(36).slice(2)}`,
      sourceType:     "ad_view",
      withdrawn:      false,
      verificationStatus: "verified",
      verifiedAt: new Date(),
    } as any).returning({ id: userTransactions.id });
    ids.push(row.id);
  }
  return ids;
}

/** Minimal InsertWithdrawal payload using correct DB column names. */
function wdPayload(userId: string, amount: string) {
  return {
    userId,
    amount,
    method:        "bank",        // maps to withdrawals.method (NOT NULL)
    accountName:   "Test Account", // maps to withdrawals.account_name (NOT NULL)
    accountNumber: "1234567890",   // maps to withdrawals.account_number (NOT NULL)
    accountDetails: { bankName: "HBL" },
  } as any;
}

async function setAvailable(userId: string, pkr: string) {
  await db.update(users).set({ availableBalance: pkr }).where(eq(users.id, userId));
}

async function getAvailable(userId: string): Promise<string> {
  const [u] = await db.select({ availableBalance: users.availableBalance }).from(users).where(eq(users.id, userId));
  return u?.availableBalance ?? "0.00";
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  testUserId = await createTestUser({ availableBalance: "200.00" });
  founderUserId = await createTestUser({
    firstName: "Founder", lastName: "Test",
    identity:  `fnd_${TS}`,
    phone:     `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email:     `fnd_${TS}@thorx-test.local`,
    role:      "founder",
  });

  // Seed 20 verified rows × Rs. 10 each = Rs. 200 of ledger-backed PKR,
  // mirrored by the user's available balance (v4: hold debits from balance).
  const ids = await seedLedger(testUserId, 20, "10.0000");
  void ids;
}, 60_000);

afterAll(async () => {
  await db.delete(userTransactions).where(eq(userTransactions.userId, testUserId)).catch(() => {});
  await db.delete(withdrawals).where(eq(withdrawals.userId, testUserId)).catch(() => {});
  await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
  await db.delete(users).where(eq(users.id, founderUserId)).catch(() => {});
  await pool.end();
}, 30_000);

// ── Suite 1: MIN_PAYOUT + balance guards ─────────────────────────────────────

describe("MIN_PAYOUT guard (v4: default Rs.500)", () => {
  it("rejects a withdrawal below MIN_PAYOUT", async () => {
    // Rs.60 requested — above zero balance but below the Rs.500 minimum.
    await setAvailable(testUserId, "200.00");
    await expect(
      storage.createWithdrawal(wdPayload(testUserId, "60"))
    ).rejects.toThrow(/Minimum payout requirement/i);
  });

  it("rejects a withdrawal exceeding the available balance (hold guard)", async () => {
    await setAvailable(testUserId, "100.00");
    await expect(
      storage.createWithdrawal(wdPayload(testUserId, "500"))
    ).rejects.toThrow(/Insufficient available balance/i);
  });
});

// ── Suite 2: Full withdrawal lifecycle ───────────────────────────────────────

describe("Withdrawal lifecycle (hold → complete)", () => {
  let withdrawalId: string;

  it("creates a pending withdrawal and HOLDS the gross at request time", async () => {
    await setAvailable(testUserId, "200.00");
    // Rs.100 request (fits the seeded ledger; below the default Rs.500 min —
    // so lower MIN_PAYOUT first via the system_config the storage reads).
    const { systemConfig } = await import("@shared/schema");
    const [cfg] = await db.select().from(systemConfig).where(eq(systemConfig.key, "MIN_PAYOUT")).limit(1);
    const originalMin = cfg?.value ?? 500;
    await db.update(systemConfig).set({ value: 100 }).where(eq(systemConfig.key, "MIN_PAYOUT"));
    try {
      const wd = await storage.createWithdrawal(wdPayload(testUserId, "100"));
      expect(wd.status).toBe("pending");
      expect(wd.userId).toBe(testUserId);
      withdrawalId = wd.id;
      // §18: the hold is immediate — available drops by the full gross.
      expect(await getAvailable(testUserId)).toBe("100.00");
      // Fee recorded up-front: 15% of 100 = 15; net = 85.
      expect(parseFloat(wd.fee ?? "0")).toBeCloseTo(15.0, 2);
      expect(parseFloat(wd.netAmount ?? "0")).toBeCloseTo(85.0, 2);
    } finally {
      await db.update(systemConfig).set({ value: originalMin }).where(eq(systemConfig.key, "MIN_PAYOUT"));
    }
  });

  it("rejects a second concurrent withdrawal for the same user", async () => {
    await expect(
      storage.createWithdrawal(wdPayload(testUserId, "100"))
    ).rejects.toThrow(/pending payout/i);
  });

  it("completes the withdrawal — ledger rows marked withdrawn, hold consumed", async () => {
    const completed = await storage.updateWithdrawalStatus(
      withdrawalId,
      "completed",
      founderUserId,
      `TX_TEST_${TS}`
    );
    expect(completed.status).toBe("completed");

    const [{ cnt }] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(userTransactions)
      .where(and(
        eq(userTransactions.userId, testUserId),
        eq(userTransactions.withdrawn, true)
      ));
    expect(Number(cnt)).toBeGreaterThanOrEqual(10);

    const [u] = await db.select().from(users).where(eq(users.id, testUserId));
    // totalWithdrawn tracks the NET actually paid (§18).
    expect(parseFloat(u.totalWithdrawn ?? "0")).toBeCloseTo(85.0, 2);
    // Available stays at the post-hold value (completion consumes the hold).
    expect(u.availableBalance).toBe("100.00");
  });

  it("rejects re-completing an already-completed withdrawal", async () => {
    await expect(
      storage.updateWithdrawalStatus(withdrawalId, "completed", founderUserId)
    ).rejects.toThrow(/not in a processable state|not pending/i);
  });
});

// ── Suite 3: Rejection path — refund the hold ────────────────────────────────

describe("Withdrawal rejection refunds the hold", () => {
  let rejectedWdId: string;

  it("creates and rejects a withdrawal, restoring the held amount", async () => {
    await setAvailable(testUserId, "200.00");
    const wd = await storage.createWithdrawal(wdPayload(testUserId, "50"));
    rejectedWdId = wd.id;
    // Hold applied.
    expect(await getAvailable(testUserId)).toBe("150.00");

    const rejected = await storage.updateWithdrawalStatus(
      rejectedWdId,
      "rejected",
      founderUserId,
      undefined,
      "Test rejection reason"
    );
    expect(rejected.status).toBe("rejected");
    // Hold fully restored.
    expect(await getAvailable(testUserId)).toBe("200.00");
  });

  it("cannot re-reject an already-rejected withdrawal", async () => {
    await expect(
      storage.updateWithdrawalStatus(rejectedWdId, "rejected", founderUserId, undefined, "again")
    ).rejects.toThrow(/not in a rejectable state/i);
  });
});

// ── Suite 4: Pro-rata last-row split (PKR-based FIFO) ────────────────────────

describe("Pro-rata ledger split", () => {
  it("partial FIFO consumption computes proportional PKR — not the full last-row value", async () => {
    // Single large verified row: Rs. 20.0000 (200 points at 10 pts/Rs.1).
    const [bigRow] = await db.insert(userTransactions).values({
      userId:         testUserId,
      engineType:     "Engine_A",
      pointsCredited: 200,
      realPkrValue:   "20.0000",
      grossPkr:       "33.3333",
      thorxProfitPkr: "13.3333",
      conversionRate: 10,
      cardVariance:   "1.0000",
      sourceId:       `split_test_${TS}`,
      sourceType:     "ad_view",
      withdrawn:      false,
      verificationStatus: "verified",
      verifiedAt: new Date(),
    } as any).returning({ id: userTransactions.id });

    // Request Rs.10 (half the row) → exactPkr = Rs.10, fee = Rs.1.50, net = Rs.8.50.
    const preview = await storage.previewWithdrawal(testUserId, 10);

    expect(parseFloat(preview.exactPkr)).toBeCloseTo(10.0, 2);
    expect(parseFloat(preview.userNetPkr)).toBeCloseTo(8.5, 2);
    expect(parseFloat(preview.platformFee)).toBeCloseTo(1.5, 2);

    // Clean up so afterAll does not leave stale rows.
    await db.delete(userTransactions).where(eq(userTransactions.id, bigRow.id));
  });
});
