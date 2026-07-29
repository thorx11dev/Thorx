/**
 * Withdrawal integration tests — THORX
 *
 * Covers:
 *  1. Creating a pending withdrawal (ledger-based — requires user_transactions rows)
 *  2. Pro-rata partial last-row: withdrawal of fewer points than the last row credits
 *     must produce exactly proportional PKR — not the full row value.
 *  3. Idempotency: a second concurrent pending withdrawal from the same user is rejected.
 *  4. Admin approving / rejecting a withdrawal.
 *  5. Double-approval guard: re-approving a completed withdrawal throws.
 *  6. MIN_PAYOUT guard: withdrawal below the PKR threshold is rejected.
 *
 * These tests exercise storage methods directly (not via HTTP) so there is no
 * CSRF or session concern.  Financial math unit coverage lives in financial.test.ts.
 *
 * Run: npx vitest run server/__tests__/withdrawal.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { users, withdrawals, userTransactions } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { storage } from "../storage";
import bcrypt from "bcrypt";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TS            = Date.now();
const TEST_EMAIL    = `test_wd_${TS}@thorx-test.local`;
const TEST_PHONE    = `031${Math.floor(10000000 + Math.random() * 89999999)}`;
const TEST_IDENTITY = `twd_${TS}`;

let testUserId: string;
let founderUserId: string;
/** All user_transaction IDs seeded by this run — bulk-deleted in afterAll. */
const seededTxIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestUser(overrides: Partial<{
  firstName: string; lastName: string; identity: string;
  phone: string; email: string; role: string; txPointsBalance: number;
}> = {}): Promise<string> {
  const [u] = await db.insert(users).values({
    firstName:       overrides.firstName ?? "Withdrawal",
    lastName:        overrides.lastName  ?? "Test",
    identity:        overrides.identity  ?? TEST_IDENTITY,
    phone:           overrides.phone     ?? TEST_PHONE,
    email:           overrides.email     ?? TEST_EMAIL,
    passwordHash:    await bcrypt.hash("TestPass123!", 10),
    referralCode:    `REF_${TS}_${Math.random().toString(36).slice(2, 7)}`,
    role:            overrides.role      ?? "user",
    txPointsBalance: overrides.txPointsBalance ?? 0,
  } as any).returning();
  return u.id;
}

/**
 * Seed `count` user_transactions rows for `userId`.
 * Each row contributes `pkrEach` realPkrValue and `ptsEach` pointsCredited.
 * Returns the IDs of inserted rows.
 */
async function seedLedger(
  userId: string,
  count: number,
  ptsEach: number,
  pkrEach: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const [row] = await db.insert(userTransactions).values({
      userId,
      engineType:     "Engine_A",
      pointsCredited: ptsEach,
      realPkrValue:   pkrEach,
      grossPkr:       (parseFloat(pkrEach) / 0.6).toFixed(4),
      thorxProfitPkr: (parseFloat(pkrEach) / 0.6 * 0.4).toFixed(4),
      conversionRate: 100,
      cardVariance:   "1.0000",
      sourceId:       `seed_${TS}_${i}_${Math.random().toString(36).slice(2)}`,
      sourceType:     "ad_view",
      withdrawn:      false,
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

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  testUserId = await createTestUser({ txPointsBalance: 0 });
  founderUserId = await createTestUser({
    firstName: "Founder", lastName: "Test",
    identity:  `fnd_${TS}`,
    phone:     `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email:     `fnd_${TS}@thorx-test.local`,
    role:      "founder",
    txPointsBalance: 0,
  });

  // Seed 20 rows × 1 000 pts × Rs. 10.0000 each = 20 000 pts / Rs. 200 total.
  // This gives ample headroom: the default MIN_PAYOUT is Rs. 100 exactPkr.
  const ids = await seedLedger(testUserId, 20, 1_000, "10.0000");
  seededTxIds.push(...ids);

  // Reflect the seeded points in the user's balance column.
  await db.update(users)
    .set({ txPointsBalance: 20_000 as any })
    .where(eq(users.id, testUserId));
}, 60_000);

afterAll(async () => {
  // Clean up in FK order: split_remainders first, then withdrawals, then users.
  await db.delete(userTransactions).where(eq(userTransactions.userId, testUserId)).catch(() => {});
  await db.delete(withdrawals).where(eq(withdrawals.userId, testUserId)).catch(() => {});
  await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
  await db.delete(users).where(eq(users.id, founderUserId)).catch(() => {});
  await pool.end();
}, 30_000);

// ── Suite 1: MIN_PAYOUT guard ─────────────────────────────────────────────────

describe("MIN_PAYOUT guard", () => {
  it("rejects a withdrawal whose exactPkr is below MIN_PAYOUT (Rs. 100)", async () => {
    // 5 000 pts → 5 rows × Rs. 10 = Rs. 50 exactPkr → below threshold
    await expect(
      storage.createWithdrawal(wdPayload(testUserId, "5000"))
    ).rejects.toThrow(/Minimum payout requirement/i);
  });
});

// ── Suite 2: Full withdrawal lifecycle ───────────────────────────────────────

describe("Withdrawal lifecycle", () => {
  let withdrawalId: string;

  it("creates a pending withdrawal when exactPkr meets MIN_PAYOUT", async () => {
    // 10 000 pts → 10 rows × Rs. 10 = Rs. 100 exactPkr (exactly at threshold)
    const wd = await storage.createWithdrawal(wdPayload(testUserId, "10000"));
    expect(wd.status).toBe("pending");
    expect(wd.userId).toBe(testUserId);
    withdrawalId = wd.id;
  });

  it("rejects a second concurrent pending withdrawal from the same user", async () => {
    await expect(
      storage.createWithdrawal(wdPayload(testUserId, "10000"))
    ).rejects.toThrow(/pending payout/i);
  });

  it("approves the withdrawal — ledger rows marked withdrawn, balance deducted", async () => {
    const approved = await storage.updateWithdrawalStatus(
      withdrawalId,
      "completed",
      founderUserId,
      `TX_TEST_${TS}`
    );
    expect(approved.status).toBe("completed");

    // Confirm the consumed ledger rows are now marked withdrawn
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(userTransactions)
      .where(and(
        eq(userTransactions.userId, testUserId),
        eq(userTransactions.withdrawn, true)
      ));
    expect(Number(cnt)).toBeGreaterThanOrEqual(10);
  });

  it("rejects re-approving an already-completed withdrawal", async () => {
    await expect(
      storage.updateWithdrawalStatus(withdrawalId, "completed", founderUserId)
    ).rejects.toThrow(/not in a processable state|not pending/i);
  });
});

// ── Suite 3: Rejection path ───────────────────────────────────────────────────

describe("Withdrawal rejection", () => {
  let rejectedWdId: string;

  it("creates and rejects a withdrawal", async () => {
    // Seed fresh rows for this suite (previous suite consumed 10)
    const freshIds = await seedLedger(testUserId, 10, 1_000, "10.0000");
    seededTxIds.push(...freshIds);
    await db.update(users)
      .set({ txPointsBalance: 10_000 as any })
      .where(eq(users.id, testUserId));

    const wd = await storage.createWithdrawal(wdPayload(testUserId, "10000"));
    rejectedWdId = wd.id;

    const rejected = await storage.updateWithdrawalStatus(
      rejectedWdId,
      "rejected",
      founderUserId,
      undefined,
      "Test rejection reason"
    );
    expect(rejected.status).toBe("rejected");
  });

  it("cannot re-reject an already-rejected withdrawal", async () => {
    await expect(
      storage.updateWithdrawalStatus(rejectedWdId, "rejected", founderUserId, undefined, "again")
    ).rejects.toThrow(/not in a rejectable state/i);
  });
});

// ── Suite 4: Pro-rata last-row split ─────────────────────────────────────────

describe("Pro-rata ledger split", () => {
  it("partial withdrawal computes proportional PKR — not the full last-row value", async () => {
    // Single large row: 2 000 pts, Rs. 20.0000 realPkrValue
    const [bigRow] = await db.insert(userTransactions).values({
      userId:         testUserId,
      engineType:     "Engine_A",
      pointsCredited: 2_000,
      realPkrValue:   "20.0000",
      grossPkr:       "33.3333",
      thorxProfitPkr: "13.3333",
      conversionRate: 100,
      cardVariance:   "1.0000",
      sourceId:       `split_test_${TS}`,
      sourceType:     "ad_view",
      withdrawn:      false,
    } as any).returning({ id: userTransactions.id });
    seededTxIds.push(bigRow.id);

    await db.update(users)
      .set({ txPointsBalance: 2_000 as any })
      .where(eq(users.id, testUserId));

    // Request 1 000 pts (half the row) → expected exactPkr = Rs. 10, fee = Rs. 1.50, net = Rs. 8.50
    const preview = await storage.previewWithdrawal(testUserId, 1_000);

    expect(parseFloat(preview.exactPkr)).toBeCloseTo(10.0, 2);
    expect(parseFloat(preview.userNetPkr)).toBeCloseTo(8.5, 2);
    expect(parseFloat(preview.platformFee)).toBeCloseTo(1.5, 2);

    // Clean up: mark the row withdrawn so afterAll does not leave stale data
    await db.update(userTransactions)
      .set({ withdrawn: true })
      .where(eq(userTransactions.id, bigRow.id));
  });
});
