/**
 * THORX Risk Scoring Engine
 *
 * Computes a composite risk score (0–100) for every qualified user
 * from six independent signals. Severity tiers:
 *   0–24   → Low
 *   25–49  → Medium
 *   50–74  → High
 *   75–100 → Critical
 *
 * Call runFullRiskScan() after every leaderboard refresh.
 * Call scoreUser(userId) for on-demand single-user scoring.
 */

import { db } from "../db";
import { logger } from "../lib/logger";
import Decimal from "decimal.js";
import {
  users,
  riskCases,
  deviceFingerprints,
  earnings,
  withdrawals,
  commissionLogs,
  scoreHistory,
  type RiskCase,
} from "@shared/schema";
import { eq, and, sql, desc, gte, inArray } from "drizzle-orm";
import { broadcastRiskAlert } from "../realtime";
import { storage } from "../storage";

export interface RiskSignal {
  name: string;
  score: number;
  detail: string;
}

export interface RiskResult {
  userId: string;
  riskScore: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  signals: RiskSignal[];
}

// ─── Severity helpers ───────────────────────────────────────────────────────

export function toSeverity(score: number): "Low" | "Medium" | "High" | "Critical" {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

// ─── Signal computers (each returns 0–max_weight) ───────────────────────────

/** Signal 1 — Earnings Velocity (max 25 pts)
 *  Earnings in the last 24 h relative to the configurable threshold.
 */
async function signalEarningsVelocity(userId: string): Promise<RiskSignal> {
  const threshold = await storage.getSystemConfigValue<number>("RISK_VELOCITY_THRESHOLD", 5000);
  const since = new Date(Date.now() - 86_400_000);
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${earnings.amount}), '0')` })
    .from(earnings)
    .where(and(eq(earnings.userId, userId), gte(earnings.createdAt, since)));
  const earned24h = new Decimal(row?.total ?? "0").toNumber();
  const score = Math.min(25, (earned24h / Math.max(1, threshold)) * 25);
  return {
    name: "Earnings Velocity",
    score: Math.round(score),
    detail: `PKR ${earned24h.toLocaleString()} earned in the last 24 h (threshold PKR ${threshold.toLocaleString()})`,
  };
}

/** Signal 2 — Bot Network Pattern (max 20 pts)
 *  High referral count paired with very low per-referral earnings suggests
 *  a purchased / bot referral network.
 */
async function signalBotNetwork(
  userId: string,
  referralCount: number,
  totalEarnings: number
): Promise<RiskSignal> {
  if (referralCount < 5) return { name: "Bot Network", score: 0, detail: "Too few referrals to evaluate." };
  const earningsPerRef = totalEarnings / referralCount;
  const threshold = await storage.getSystemConfigValue<number>("RISK_BOT_EARNINGS_PER_REF", 100);
  const score = earningsPerRef < threshold
    ? Math.min(20, ((threshold - earningsPerRef) / threshold) * 20)
    : 0;
  return {
    name: "Bot Network",
    score: Math.round(score),
    detail: `PKR ${earningsPerRef.toFixed(0)} avg earnings per referral (low = suspicious when > 5 refs)`,
  };
}

/** Signal 3 — Device Fingerprint Clustering (max 15 pts)
 *  Multiple accounts sharing the same device fingerprint indicate
 *  one person operating multiple accounts.
 */
async function signalDeviceClustering(userId: string): Promise<RiskSignal> {
  const userFPs = await db
    .select({ hash: deviceFingerprints.fingerprintHash })
    .from(deviceFingerprints)
    .where(eq(deviceFingerprints.userId, userId));

  if (!userFPs.length) return { name: "Device Clustering", score: 0, detail: "No device fingerprints recorded." };

  const hashes = userFPs.map((f) => f.hash);
  const [row] = await db
    .select({ cnt: sql<number>`COUNT(DISTINCT ${deviceFingerprints.userId})` })
    .from(deviceFingerprints)
    .where(
      and(
        inArray(deviceFingerprints.fingerprintHash, hashes),
        sql`${deviceFingerprints.userId} != ${userId}`
      )
    );

  const sharedCount = Number(row?.cnt ?? 0);
  const score = Math.min(15, sharedCount * 4);
  return {
    name: "Device Clustering",
    score: Math.round(score),
    detail:
      sharedCount === 0
        ? "Device fingerprints unique."
        : `${sharedCount} other account(s) share this device fingerprint.`,
  };
}

/** Signal 4 — Referral Chain Linearity (max 12 pts)
 *  When every L1 referral has exactly one more referral themselves,
 *  it looks like a fabricated chain, not organic growth.
 */
async function signalChainLinearity(userId: string, referralCount: number): Promise<RiskSignal> {
  if (referralCount < 5) return { name: "Chain Linearity", score: 0, detail: "Insufficient referrals." };

  const l1 = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referredBy, userId));

  if (!l1.length) return { name: "Chain Linearity", score: 0, detail: "No L1 referrals found." };

  const l1Ids = l1.map((u) => u.id);
  const narrowRefs = await db
    .select({
      uid: users.referredBy,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(users)
    .where(inArray(users.referredBy, l1Ids))
    .groupBy(users.referredBy);

  const narrowCount = narrowRefs.filter((r) => Number(r.cnt) === 1).length;
  const ratio = narrowCount / l1.length;
  const score = ratio > 0.7 ? Math.min(12, ratio * 12) : 0;
  return {
    name: "Chain Linearity",
    score: Math.round(score),
    detail: `${Math.round(ratio * 100)}% of L1 referrals have exactly one sub-referral (linear chain pattern).`,
  };
}

/** Signal 6 — Circular / Self-Referral Pattern (max 8 pts)
 *  Two independent checks: (a) a genuine cycle in the referredBy parent
 *  chain (data-integrity fraud — a user effectively refers their own
 *  upline), and (b) a direct referral who shares a device fingerprint
 *  with the referrer (self-funded alt account farming a signup bonus).
 */
async function signalCircularReferral(userId: string): Promise<RiskSignal> {
  // (a) Walk the referredBy chain looking for a cycle back to the user.
  let cycleFound = false;
  let cursor: string | null | undefined = userId;
  for (let hop = 0; hop < 25 && cursor; hop++) {
    const [parent] = await db
      .select({ referredBy: users.referredBy })
      .from(users)
      .where(eq(users.id, cursor));
    cursor = parent?.referredBy;
    if (cursor === userId) {
      cycleFound = true;
      break;
    }
  }

  // (b) Direct referrals sharing a device fingerprint with this user.
  const userFPs = await db
    .select({ hash: deviceFingerprints.fingerprintHash })
    .from(deviceFingerprints)
    .where(eq(deviceFingerprints.userId, userId));

  let selfFundedRefs = 0;
  if (userFPs.length) {
    const hashes = userFPs.map((f) => f.hash);
    const [row] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${users.id})` })
      .from(users)
      .innerJoin(deviceFingerprints, eq(deviceFingerprints.userId, users.id))
      .where(and(eq(users.referredBy, userId), inArray(deviceFingerprints.fingerprintHash, hashes)));
    selfFundedRefs = Number(row?.cnt ?? 0);
  }

  const score = (cycleFound ? 4 : 0) + Math.min(4, selfFundedRefs * 4);
  const parts: string[] = [];
  if (cycleFound) parts.push("referredBy chain cycles back to this account");
  if (selfFundedRefs > 0) parts.push(`${selfFundedRefs} direct referral(s) share this account's device`);
  return {
    name: "Circular Referral",
    score: Math.round(score),
    detail: parts.length ? parts.join("; ") : "No circular or self-funded referral pattern detected.",
  };
}

/** Signal 7 — Task Completion Speed (max 10 pts)
 *  Daily tasks require visiting an external URL and following
 *  instructions before completion. Repeated completions within
 *  a couple of seconds of being clicked are not physically plausible.
 */
/** Signal 7 — Task Completion Speed: retired with daily_tasks system. Always returns 0. */
async function signalTaskCompletionSpeed(_userId: string): Promise<RiskSignal> {
  return { name: "Task Completion Speed", score: 0, detail: "Signal retired — daily_tasks system removed." };
}

/** Signal 5 — Cash-out Velocity (max 10 pts)
 *  Withdrawals initiated within hours of earning suggest automated scripts.
 */
async function signalCashoutVelocity(userId: string): Promise<RiskSignal> {
  const recentWithdrawals = await db
    .select({ createdAt: withdrawals.createdAt, amount: withdrawals.amount })
    .from(withdrawals)
    .where(and(eq(withdrawals.userId, userId), gte(withdrawals.createdAt, new Date(Date.now() - 7 * 86_400_000))))
    .orderBy(desc(withdrawals.createdAt))
    .limit(5);

  if (!recentWithdrawals.length) return { name: "Cash-out Velocity", score: 0, detail: "No recent withdrawal activity." };

  const cashoutWindowHours = await storage.getSystemConfigValue<number>("RISK_CASHOUT_WINDOW_HOURS", 1);
  const cashoutWindowMs = cashoutWindowHours * 3_600_000;
  const fastWithdrawals = recentWithdrawals.filter((w) => {
    const age = Date.now() - new Date(w.createdAt!).getTime();
    return age < cashoutWindowMs;
  });

  const score = Math.min(10, fastWithdrawals.length * 3);
  return {
    name: "Cash-out Velocity",
    score: Math.round(score),
    detail:
      fastWithdrawals.length > 0
        ? `${fastWithdrawals.length} withdrawal(s) initiated within 1 h of earning.`
        : "Withdrawal timing appears normal.",
  };
}

// ─── Core scoring function ───────────────────────────────────────────────────

export async function scoreUser(userId: string): Promise<RiskResult> {
  const [user] = await db
    .select({
      totalEarnings: users.totalEarnings,
      referralCount: sql<number>`CAST(COALESCE((SELECT COUNT(*) FROM users u2 WHERE u2.referred_by = users.id), 0) AS INTEGER)`,
    })
    .from(users)
    .where(eq(users.id, userId));

  const totalEarnings = new Decimal(user?.totalEarnings ?? "0").toNumber();
  const referralCount = user?.referralCount ?? 0;

  const signals = await Promise.all([
    signalEarningsVelocity(userId),
    signalBotNetwork(userId, referralCount, totalEarnings),
    signalDeviceClustering(userId),
    signalChainLinearity(userId, referralCount),
    signalCashoutVelocity(userId),
    signalCircularReferral(userId),
    signalTaskCompletionSpeed(userId),
  ]);

  const riskScore = Math.min(100, signals.reduce((sum, s) => sum + s.score, 0));
  const severity = toSeverity(riskScore);

  return { userId, riskScore, severity, signals };
}

// ─── Case upsert ─────────────────────────────────────────────────────────────

export async function upsertRiskCase(result: RiskResult): Promise<RiskCase> {
  const now = new Date();
  const existing = await db
    .select()
    .from(riskCases)
    .where(eq(riskCases.userId, result.userId))
    .limit(1);

  const signalsJson = result.signals as any;

  if (existing.length > 0) {
    const prev = existing[0];
    const keepStatus =
      prev.status === "Cleared" || prev.status === "Actioned" ? prev.status : result.severity === "Low" ? "Open" : prev.status;

    const [updated] = await db
      .update(riskCases)
      .set({
        riskScore: result.riskScore.toFixed(2),
        severity: result.severity,
        signals: signalsJson,
        status: keepStatus,
        updatedAt: now,
      })
      .where(eq(riskCases.userId, result.userId))
      .returning();
    await backfillLatestRiskScore(result.userId, result.riskScore);
    return updated;
  } else {
    const [created] = await db
      .insert(riskCases)
      .values({
        userId: result.userId,
        riskScore: result.riskScore.toFixed(2),
        severity: result.severity,
        signals: signalsJson,
        status: "Open",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await backfillLatestRiskScore(result.userId, result.riskScore);
    return created;
  }
}

/** Stamps the freshly computed risk score onto the user's most recent
 *  score_history snapshot, so the Performance Score Trend chart reflects
 *  real risk data instead of the "0" placeholder written at snapshot time.
 */
async function backfillLatestRiskScore(userId: string, riskScore: number): Promise<void> {
  try {
    const [latest] = await db
      .select({ id: scoreHistory.id })
      .from(scoreHistory)
      .where(eq(scoreHistory.userId, userId))
      .orderBy(desc(scoreHistory.snapshotAt))
      .limit(1);
    if (latest) {
      await db.update(scoreHistory).set({ riskScore: riskScore.toFixed(2) }).where(eq(scoreHistory.id, latest.id));
    }
  } catch (err) {
    logger.error({ err, userId }, "[RiskEngine] Failed to backfill score_history — skipping.");
  }
}

// ─── P-01: Batched signal pre-fetcher ────────────────────────────────────────
/**
 * Fetches ALL signal data for a slice of users in ~8 bulk queries instead
 * of the previous N×7 per-user pattern (~35,000 queries for 5,000 users).
 * Returns in-memory maps that let scoreUserFromBatch() compute each user's
 * risk result with zero additional DB round-trips.
 */
async function prefetchBatchSignalData(userIds: string[], configs: {
  velocityThreshold: number;
  cashoutWindowHours: number;
  taskSpeedSeconds: number;
}) {
  const since24h  = new Date(Date.now() - 86_400_000);
  const since7d   = new Date(Date.now() - 7  * 86_400_000);
  const since14d  = new Date(Date.now() - 14 * 86_400_000);

  // Run all batch queries in parallel — they are fully independent.
  const [
    earnRows,
    userInfoRows,
    fpRows,
    l1Rows,
    withdrawalRows,
    referralChainRows,
  ] = await Promise.all([
    // Signal 1: 24h earnings per user
    db.select({ userId: earnings.userId, total: sql<string>`COALESCE(SUM(${earnings.amount}), '0')` })
      .from(earnings)
      .where(and(inArray(earnings.userId, userIds), gte(earnings.createdAt, since24h)))
      .groupBy(earnings.userId),

    // Signals 2 + 6: user info (total earnings, inline referral count)
    db.select({
      id: users.id,
      totalEarnings: users.totalEarnings,
      referralCount: sql<number>`CAST(COALESCE((SELECT COUNT(*) FROM users u2 WHERE u2.referred_by = users.id), 0) AS INTEGER)`,
    }).from(users).where(inArray(users.id, userIds)),

    // Signals 3 + 6: all device fingerprints for scanned users
    db.select({ userId: deviceFingerprints.userId, hash: deviceFingerprints.fingerprintHash })
      .from(deviceFingerprints)
      .where(inArray(deviceFingerprints.userId, userIds)),

    // Signal 4: L1 children of every scanned user (chain linearity)
    db.select({ parentId: users.referredBy, childId: users.id })
      .from(users)
      .where(inArray(users.referredBy as any, userIds)),

    // Signal 5: recent withdrawals per user (cashout velocity)
    db.select({ userId: withdrawals.userId, createdAt: withdrawals.createdAt })
      .from(withdrawals)
      .where(and(inArray(withdrawals.userId, userIds), gte(withdrawals.createdAt, since7d))),

    // Signal 6 (chain walk): ALL active users' referredBy (for cycle detection in-memory)
    db.select({ id: users.id, referredBy: users.referredBy })
      .from(users)
      .where(eq(users.isActive, true)),
  ]);

  // ── Build O(1) lookup maps ────────────────────────────────────────────────

  const earnings24hMap = new Map<string, number>(
    earnRows.map(r => [r.userId, new Decimal(r.total).toNumber()])
  );

  const userInfoMap = new Map(userInfoRows.map(r => [r.id, r]));

  // userId → set of fingerprint hashes
  const userFpMap = new Map<string, string[]>();
  for (const r of fpRows) {
    const arr = userFpMap.get(r.userId) ?? [];
    arr.push(r.hash);
    userFpMap.set(r.userId, arr);
  }

  // fingerprint hash → count of ALL distinct users sharing it (including non-scanned)
  // We need this for Signal 3: gather all unique hashes, then count sharing across ALL users.
  const allHashes = [...new Set(fpRows.map(r => r.hash))];
  const hashSharingMap = new Map<string, number>();
  if (allHashes.length > 0) {
    const sharingRows = await db
      .select({ hash: deviceFingerprints.fingerprintHash, cnt: sql<number>`COUNT(DISTINCT ${deviceFingerprints.userId})` })
      .from(deviceFingerprints)
      .where(inArray(deviceFingerprints.fingerprintHash, allHashes))
      .groupBy(deviceFingerprints.fingerprintHash);
    for (const r of sharingRows) hashSharingMap.set(r.hash, Number(r.cnt));
  }

  // parentId (scanned user) → [childIds] for chain linearity
  const l1ChildrenMap = new Map<string, string[]>();
  for (const r of l1Rows) {
    if (!r.parentId) continue;
    const arr = l1ChildrenMap.get(r.parentId) ?? [];
    arr.push(r.childId);
    l1ChildrenMap.set(r.parentId, arr);
  }

  // For chain linearity (Signal 4): count sub-referrals of each L1 child
  const l1ChildIds = l1Rows.map(r => r.childId);
  const l2CountMap = new Map<string, number>();
  if (l1ChildIds.length > 0) {
    const l2Rows = await db
      .select({ referredBy: users.referredBy, cnt: sql<number>`COUNT(*)` })
      .from(users)
      .where(inArray(users.referredBy as any, l1ChildIds))
      .groupBy(users.referredBy);
    for (const r of l2Rows) { if (r.referredBy) l2CountMap.set(r.referredBy, Number(r.cnt)); }
  }

  // userId → recent withdrawal dates
  const withdrawalMap = new Map<string, Date[]>();
  for (const r of withdrawalRows) {
    const arr = withdrawalMap.get(r.userId) ?? [];
    arr.push(new Date(r.createdAt!));
    withdrawalMap.set(r.userId, arr);
  }

  // Signal 7 (task records) retired — daily_tasks system removed. Empty map for batch compatibility.
  const taskMap = new Map<string, Array<{ clickedAt: Date | null; completedAt: Date | null }>>();

  // Global referredBy map (entire active user table) for cycle detection
  const referredByMap = new Map<string, string | null>(
    referralChainRows.map(r => [r.id, r.referredBy ?? null])
  );

  // Pre-build a set of each scanned user's FP hashes for Signal 6 self-funded check
  const fpHashSet = new Map<string, Set<string>>();
  for (const [uid, hashes] of userFpMap) fpHashSet.set(uid, new Set(hashes));

  return {
    earnings24hMap, userInfoMap, userFpMap, hashSharingMap,
    l1ChildrenMap, l2CountMap, withdrawalMap, taskMap,
    referredByMap, fpRows, fpHashSet,
    cashoutWindowMs: configs.cashoutWindowHours * 3_600_000,
    taskSpeedSeconds: configs.taskSpeedSeconds,
    velocityThreshold: configs.velocityThreshold,
  };
}

/** Score a single user entirely from pre-fetched batch data — zero DB queries. */
function scoreUserFromBatch(
  u: { id: string; firstName: string; lastName: string },
  batch: Awaited<ReturnType<typeof prefetchBatchSignalData>>
): RiskResult {
  const {
    earnings24hMap, userInfoMap, userFpMap, hashSharingMap,
    l1ChildrenMap, l2CountMap, withdrawalMap, taskMap,
    referredByMap, fpRows, fpHashSet,
    cashoutWindowMs, taskSpeedSeconds, velocityThreshold,
  } = batch;

  const info = userInfoMap.get(u.id);
  const totalEarnings = new Decimal(info?.totalEarnings ?? "0").toNumber();
  const referralCount = info?.referralCount ?? 0;

  // ── Signal 1: Earnings velocity (max 25 pts) ─────────────────────────────
  const earned24h = earnings24hMap.get(u.id) ?? 0;
  const velScore = Math.min(25, (earned24h / Math.max(1, velocityThreshold)) * 25);
  const sig1: RiskSignal = {
    name: "Earnings Velocity",
    score: Math.round(velScore),
    detail: `PKR ${earned24h.toLocaleString()} earned in last 24h (threshold PKR ${velocityThreshold.toLocaleString()})`,
  };

  // ── Signal 2: Bot network (max 20 pts) ───────────────────────────────────
  let sig2: RiskSignal;
  if (referralCount < 5) {
    sig2 = { name: "Bot Network", score: 0, detail: "Too few referrals to evaluate." };
  } else {
    const earningsPerRef = totalEarnings / referralCount;
    // Use cached config default (50) — same as signalBotNetwork's RISK_BOT_EARNINGS_PER_REF default
    const botThreshold = 100;
    const botScore = earningsPerRef < botThreshold
      ? Math.min(20, ((botThreshold - earningsPerRef) / botThreshold) * 20) : 0;
    sig2 = {
      name: "Bot Network",
      score: Math.round(botScore),
      detail: `PKR ${earningsPerRef.toFixed(0)} avg earnings per referral`,
    };
  }

  // ── Signal 3: Device clustering (max 15 pts) ─────────────────────────────
  const userFPs = userFpMap.get(u.id) ?? [];
  let sig3: RiskSignal;
  if (!userFPs.length) {
    sig3 = { name: "Device Clustering", score: 0, detail: "No device fingerprints recorded." };
  } else {
    // sharedCount = max number of OTHER accounts sharing any of this user's FPs
    const sharedCount = Math.max(0, ...userFPs.map(h => (hashSharingMap.get(h) ?? 1) - 1));
    const devScore = Math.min(15, sharedCount * 4);
    sig3 = {
      name: "Device Clustering",
      score: Math.round(devScore),
      detail: sharedCount === 0
        ? "Device fingerprints unique."
        : `${sharedCount} other account(s) share this device fingerprint.`,
    };
  }

  // ── Signal 4: Chain linearity (max 12 pts) ───────────────────────────────
  const l1Children = l1ChildrenMap.get(u.id) ?? [];
  let sig4: RiskSignal;
  if (referralCount < 5 || l1Children.length === 0) {
    sig4 = { name: "Chain Linearity", score: 0, detail: "Insufficient referrals." };
  } else {
    const narrowCount = l1Children.filter(cid => (l2CountMap.get(cid) ?? 0) === 1).length;
    const ratio = narrowCount / l1Children.length;
    const chainScore = ratio > 0.7 ? Math.min(12, ratio * 12) : 0;
    sig4 = {
      name: "Chain Linearity",
      score: Math.round(chainScore),
      detail: `${narrowCount}/${l1Children.length} L1 referrals have exactly 1 sub-referral (${(ratio * 100).toFixed(0)}%)`,
    };
  }

  // ── Signal 5: Cash-out velocity (max 10 pts) ─────────────────────────────
  const userWithdrawals = withdrawalMap.get(u.id) ?? [];
  const fastWithdrawals = userWithdrawals.filter(d => Date.now() - d.getTime() < cashoutWindowMs);
  const cashScore = Math.min(10, fastWithdrawals.length * 3);
  const sig5: RiskSignal = {
    name: "Cash-out Velocity",
    score: cashScore,
    detail: fastWithdrawals.length > 0
      ? `${fastWithdrawals.length} withdrawal(s) within cashout window.`
      : "Withdrawal timing appears normal.",
  };

  // ── Signal 6: Circular referral (max 8 pts) ──────────────────────────────
  // (a) Chain-walk cycle detection — entirely in-memory via referredByMap
  let cycleFound = false;
  let cursor: string | null | undefined = referredByMap.get(u.id) ?? null;
  for (let hop = 0; hop < 25 && cursor; hop++) {
    if (cursor === u.id) { cycleFound = true; break; }
    cursor = referredByMap.get(cursor) ?? null;
  }
  // (b) L1 referrals sharing this user's device fingerprint (self-funded)
  const myFpSet = fpHashSet.get(u.id) ?? new Set<string>();
  const selfFundedRefs = myFpSet.size > 0
    ? l1Children.filter(cid =>
        fpRows.some(fp => fp.userId === cid && myFpSet.has(fp.hash))
      ).length
    : 0;
  const circScore = (cycleFound ? 4 : 0) + Math.min(4, selfFundedRefs * 4);
  const circParts: string[] = [];
  if (cycleFound) circParts.push("referredBy chain cycles back to this account");
  if (selfFundedRefs > 0) circParts.push(`${selfFundedRefs} direct referral(s) share this account's device`);
  const sig6: RiskSignal = {
    name: "Circular Referral",
    score: Math.round(circScore),
    detail: circParts.length ? circParts.join("; ") : "No circular or self-funded referral pattern detected.",
  };

  // ── Signal 7: Task completion speed (max 10 pts) ──────────────────────────
  const userTasks = taskMap.get(u.id) ?? [];
  const timed = userTasks.filter(r => r.clickedAt && r.completedAt);
  let sig7: RiskSignal;
  if (!timed.length) {
    sig7 = { name: "Task Completion Speed", score: 0, detail: "No timed task completions to evaluate." };
  } else {
    const tooFast = timed.filter(r =>
      (r.completedAt!.getTime() - r.clickedAt!.getTime()) / 1000 < taskSpeedSeconds
    );
    const ratio = tooFast.length / timed.length;
    const taskScore = ratio > 0.3 ? Math.min(10, ratio * 10) : 0;
    sig7 = {
      name: "Task Completion Speed",
      score: Math.round(taskScore),
      detail: tooFast.length > 0
        ? `${tooFast.length}/${timed.length} tasks completed in under ${taskSpeedSeconds}s.`
        : "Task completion timing appears normal.",
    };
  }

  const signals = [sig1, sig2, sig3, sig4, sig5, sig6, sig7];
  const riskScore = Math.min(100, signals.reduce((sum, s) => sum + s.score, 0));
  return { userId: u.id, riskScore, severity: toSeverity(riskScore), signals };
}

// ─── Shared scan driver ───────────────────────────────────────────────────────
/**
 * P-01: Core batched scan — pre-fetches all signal data in ~10 bulk queries
 * then scores every user from in-memory maps.  Replaces the previous N×7
 * per-user query pattern (up to 35,000 DB round-trips at 5,000 users).
 */
async function runBatchedScan(
  targetUsers: Array<{ id: string; firstName: string; lastName: string }>,
  broadcast: boolean
): Promise<{ flagged: number; critical: number }> {
  if (targetUsers.length === 0) return { flagged: 0, critical: 0 };

  const userIds = targetUsers.map(u => u.id);

  // Fetch all configurable thresholds up-front (3 config lookups)
  const [velocityThreshold, cashoutWindowHours, taskSpeedSeconds] = await Promise.all([
    storage.getSystemConfigValue<number>("RISK_VELOCITY_THRESHOLD", 5000),
    storage.getSystemConfigValue<number>("RISK_CASHOUT_WINDOW_HOURS", 1),
    storage.getSystemConfigValue<number>("RISK_TASK_SPEED_SECONDS", 3),
  ]);

  const batch = await prefetchBatchSignalData(userIds, { velocityThreshold, cashoutWindowHours, taskSpeedSeconds });

  let flagged = 0;
  let critical = 0;

  for (const u of targetUsers) {
    try {
      const result = scoreUserFromBatch(u, batch);
      const riskCase = await upsertRiskCase(result);

      if (result.severity !== "Low") flagged++;
      if (result.severity === "Critical") {
        critical++;
        if (broadcast) {
          broadcastRiskAlert({
            caseId: riskCase.id,
            userId: u.id,
            userName: `${u.firstName} ${u.lastName}`.trim(),
            riskScore: result.riskScore,
            severity: result.severity,
            signals: result.signals,
          });
        }
      }
    } catch (err) {
      logger.error({ err, userId: u.id }, "[RiskEngine] Batch score failed for user — continuing.");
    }
  }

  return { flagged, critical };
}

// ─── Full scan ───────────────────────────────────────────────────────────────

export async function runFullRiskScan(options?: { broadcastAlerts?: boolean }): Promise<{
  scanned: number;
  flagged: number;
  critical: number;
}> {
  const broadcast = options?.broadcastAlerts ?? true;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // H-11: Hard cap prevents OOM at scale.
  const allUsers = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "user"), gte(users.lastActiveAt, since24h)))
    .limit(5000);

  const { flagged, critical } = await runBatchedScan(allUsers, broadcast);

  logger.info({ scanned: allUsers.length, flagged, critical }, "[RiskEngine] Incremental scan complete (active last 24h).");
  return { scanned: allUsers.length, flagged, critical };
}

/** Admin-triggered full scan — scans ALL active users with no time filter. */
export async function runFullUserScan(options?: { broadcastAlerts?: boolean }): Promise<{
  scanned: number;
  flagged: number;
  critical: number;
}> {
  const broadcast = options?.broadcastAlerts ?? true;
  const allUsers = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "user")))
    .limit(5000);

  const { flagged, critical } = await runBatchedScan(allUsers, broadcast);

  logger.info({ scanned: allUsers.length, flagged, critical }, "[RiskEngine] Full user scan complete (all active users).");
  return { scanned: allUsers.length, flagged, critical };
}
