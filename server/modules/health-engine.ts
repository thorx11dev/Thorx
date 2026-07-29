/**
 * THORX System Health Engine
 *
 * Computes a composite 0–100 health score across five independently-weighted
 * dimensions. Each dimension reads from real database tables. The composite
 * score, all dimension scores, and a plain-English top-reason are stored as
 * a snapshot in `health_snapshots` every hour via the cron job.
 *
 * Dimensions and weights:
 *   1. Financial Health      25%
 *   2. Operational Health    25%
 *   3. User & Growth Health  20%
 *   4. Risk & Integrity      20%
 *   5. Platform Integrity    10%
 */

import { db, pool } from "../db";
import {
  withdrawals,
  earnings,
  users,
  auditLogs,
  riskCases,
  errorEvents,
  healthSnapshots,
  founderWithdrawals,
  systemConfig,
} from "@shared/schema";
import { eq, and, sql, desc, gte, lt, lte, inArray, count, sum, avg } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthSignal {
  name: string;
  score: number;         // 0–100
  rawValue: string;      // human-readable raw metric
  detail: string;        // one-line explanation
}

export interface DimensionResult {
  score: number;
  signals: HealthSignal[];
}

export interface HealthResult {
  overallScore: number;
  financialScore: number;
  operationalScore: number;
  userHealthScore: number;
  riskHealthScore: number;
  integrityScore: number;
  signalsJson: Record<string, HealthSignal[]>;
  topReason: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// THORX v3 (spec E.11): guard every score against NaN/Infinity before it is
// ever written to the DB or shown in the UI — a single bad signal (e.g. a
// division that produced NaN before reaching clamp()) must not corrupt the
// whole snapshot with a NaN overall score.
function safeScore(val: number): number {
  return Number.isFinite(val) ? clamp(val) : 0;
}

function linearScore(value: number, badEnd: number, goodEnd: number): number {
  if (goodEnd > badEnd) {
    // Higher value = better
    if (value >= goodEnd) return 100;
    if (value <= badEnd) return 0;
    return clamp(((value - badEnd) / (goodEnd - badEnd)) * 100);
  } else {
    // Lower value = better
    if (value <= goodEnd) return 100;
    if (value >= badEnd) return 0;
    return clamp(((badEnd - value) / (badEnd - goodEnd)) * 100);
  }
}

function avgSignalScore(signals: HealthSignal[]): number {
  if (!signals.length) return 100;
  return signals.reduce((s, sig) => s + sig.score, 0) / signals.length;
}

// ── Dimension 1: Financial Health (25%) ───────────────────────────────────────

async function computeFinancialHealth(): Promise<DimensionResult> {
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const ago72h = new Date(now.getTime() - 72 * 60 * 60 * 1000);

  const signals: HealthSignal[] = [];

  // Signal 1: Withdrawal success rate (last 7d)
  try {
    const [totRow] = await db
      .select({ total: count() })
      .from(withdrawals)
      .where(gte(withdrawals.createdAt, ago7d));
    const [procRow] = await db
      .select({ processed: count() })
      .from(withdrawals)
      .where(and(gte(withdrawals.createdAt, ago7d), eq(withdrawals.status, "processed")));
    const total = Number(totRow?.total ?? 0);
    const processed = Number(procRow?.processed ?? 0);
    const rate = total > 0 ? (processed / total) * 100 : 100;
    signals.push({
      name: "withdrawal_success_rate",
      score: linearScore(rate, 50, 95),
      rawValue: `${processed}/${total} (${rate.toFixed(1)}%)`,
      detail: `${rate.toFixed(1)}% of withdrawals in last 7d were processed`,
    });
  } catch { signals.push({ name: "withdrawal_success_rate", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 2: Pending backlog age
  try {
    const pending = await db
      .select({ id: withdrawals.id, createdAt: withdrawals.createdAt })
      .from(withdrawals)
      .where(eq(withdrawals.status, "pending"));
    let score = 100;
    const overdue48 = pending.filter(w => w.createdAt && w.createdAt < ago48h && w.createdAt >= ago72h).length;
    const overdue72 = pending.filter(w => w.createdAt && w.createdAt < ago72h).length;
    score -= overdue48 * 20;
    score -= overdue72 * 40;
    const detail = pending.length === 0
      ? "No pending withdrawals"
      : `${pending.length} pending; ${overdue48} >48h; ${overdue72} >72h`;
    signals.push({
      name: "pending_backlog_age",
      score: clamp(score),
      rawValue: `${pending.length} pending`,
      detail,
    });
  } catch { signals.push({ name: "pending_backlog_age", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 3: Fee collection integrity (last 30d)
  try {
    const [row] = await db
      .select({ cnt: count() })
      .from(withdrawals)
      .where(and(
        eq(withdrawals.status, "processed"),
        gte(withdrawals.createdAt, ago30d),
        sql`CAST(${withdrawals.fee} AS DECIMAL) = 0`,
      ));
    const zeroFeeCount = Number(row?.cnt ?? 0);
    signals.push({
      name: "fee_collection_integrity",
      score: clamp(100 - zeroFeeCount * 10),
      rawValue: `${zeroFeeCount} zero-fee processed`,
      detail: zeroFeeCount === 0
        ? "All processed withdrawals have fees correctly applied"
        : `${zeroFeeCount} processed withdrawal(s) missing fee in last 30d`,
    });
  } catch { signals.push({ name: "fee_collection_integrity", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 4: Unverified credit ratio
  try {
    const [adminCreditRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${earnings.amount} AS DECIMAL)), 0)` })
      .from(earnings)
      .where(eq(earnings.type, "admin_credit"));
    const [balanceRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${users.availableBalance} AS DECIMAL)), 0)` })
      .from(users)
      .where(eq(users.isActive, true));
    const creditAmt = parseFloat(adminCreditRow?.total ?? "0");
    const balanceAmt = parseFloat(balanceRow?.total ?? "0");
    const ratio = balanceAmt > 0 ? (creditAmt / balanceAmt) * 100 : 0;
    signals.push({
      name: "unverified_credit_ratio",
      score: linearScore(ratio, 10, 0),
      rawValue: `${ratio.toFixed(1)}% of balances are unverified credits`,
      detail: `₨${creditAmt.toLocaleString()} in admin credits vs ₨${balanceAmt.toLocaleString()} total balances`,
    });
  } catch { signals.push({ name: "unverified_credit_ratio", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  return { score: Math.round(avgSignalScore(signals) * 100) / 100, signals };
}

// ── Dimension 2: Operational Health (25%) ─────────────────────────────────────

async function computeOperationalHealth(): Promise<DimensionResult> {
  const now = new Date();
  const ago15m = new Date(now.getTime() - 15 * 60 * 1000);
  const ago1h = new Date(now.getTime() - 60 * 60 * 1000);

  const signals: HealthSignal[] = [];

  // Signal 1: Database response latency
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    let score: number;
    if (latencyMs < 30) score = 100;
    else if (latencyMs < 100) score = 80;
    else if (latencyMs < 300) score = 50;
    else score = 0;
    signals.push({
      name: "db_response_latency",
      score,
      rawValue: `${latencyMs}ms`,
      detail: `Database responded in ${latencyMs}ms`,
    });
  } catch { signals.push({ name: "db_response_latency", score: 0, rawValue: "timeout", detail: "Database did not respond" }); }

  // Signal 2: Connection pool utilization
  try {
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const used = total - idle;
    const utilPct = total > 0 ? (used / total) * 100 : 0;
    signals.push({
      name: "pool_utilization",
      score: linearScore(utilPct, 90, 60),
      rawValue: `${used}/${total} connections used (${utilPct.toFixed(0)}%)`,
      detail: `Connection pool at ${utilPct.toFixed(0)}% utilization`,
    });
  } catch { signals.push({ name: "pool_utilization", score: 80, rawValue: "N/A", detail: "Could not read pool stats" }); }

  // Signal 3: Server error rate (last 15 min)
  try {
    const [row] = await db
      .select({ cnt: count() })
      .from(errorEvents)
      .where(and(gte(errorEvents.occurredAt, ago15m), gte(errorEvents.status, 500)));
    const errCount = Number(row?.cnt ?? 0);
    signals.push({
      name: "server_error_rate",
      score: clamp(100 - errCount * 10),
      rawValue: `${errCount} errors in last 15min`,
      detail: errCount === 0 ? "No server errors in last 15 minutes" : `${errCount} 5xx error(s) in last 15 minutes`,
    });
  } catch { signals.push({ name: "server_error_rate", score: 80, rawValue: "N/A", detail: "Could not compute error rate" }); }

  // Signal 4: Failed authentication rate (last 1h)
  try {
    const [failRow] = await db
      .select({ cnt: count() })
      .from(auditLogs)
      .where(and(gte(auditLogs.createdAt, ago1h), eq(auditLogs.action, "FAILED_LOGIN")));
    const [totalLoginRow] = await db
      .select({ cnt: count() })
      .from(auditLogs)
      .where(and(gte(auditLogs.createdAt, ago1h), inArray(auditLogs.action, ["FAILED_LOGIN", "LOGIN_SUCCESS", "LOGIN"])));
    const fails = Number(failRow?.cnt ?? 0);
    const totalLogins = Number(totalLoginRow?.cnt ?? 0);
    const failRate = totalLogins > 0 ? (fails / totalLogins) * 100 : 0;
    signals.push({
      name: "failed_auth_rate",
      score: linearScore(failRate, 10, 2),
      rawValue: `${fails}/${totalLogins} failed (${failRate.toFixed(1)}%)`,
      detail: `${failRate.toFixed(1)}% of login attempts failed in last hour`,
    });
  } catch { signals.push({ name: "failed_auth_rate", score: 80, rawValue: "N/A", detail: "Could not compute auth rate" }); }

  return { score: Math.round(avgSignalScore(signals) * 100) / 100, signals };
}

// ── Dimension 3: User & Growth Health (20%) ───────────────────────────────────

async function computeUserHealth(): Promise<DimensionResult> {
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const signals: HealthSignal[] = [];

  // Signal 1: 7-day active user rate
  try {
    const [totalRow] = await db.select({ cnt: count() }).from(users).where(eq(users.isActive, true));
    const [activeRow] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${earnings.userId})` })
      .from(earnings)
      .where(gte(earnings.createdAt, ago7d));
    const total = Number(totalRow?.cnt ?? 0);
    const active = Number(activeRow?.cnt ?? 0);
    const rate = total > 0 ? (active / total) * 100 : 0;
    signals.push({
      name: "active_user_rate_7d",
      score: linearScore(rate, 15, 40),
      rawValue: `${active}/${total} (${rate.toFixed(1)}%)`,
      detail: `${rate.toFixed(1)}% of users were active in last 7 days`,
    });
  } catch { signals.push({ name: "active_user_rate_7d", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 2: Registration growth trend (this week vs last week)
  try {
    const [thisWeekRow] = await db.select({ cnt: count() }).from(users).where(gte(users.createdAt, ago7d));
    const [lastWeekRow] = await db
      .select({ cnt: count() })
      .from(users)
      .where(and(gte(users.createdAt, ago14d), lt(users.createdAt, ago7d)));
    const thisWeek = Number(thisWeekRow?.cnt ?? 0);
    const lastWeek = Number(lastWeekRow?.cnt ?? 0);
    let score: number;
    let trend: string;
    if (lastWeek === 0) {
      score = thisWeek > 0 ? 100 : 70;
      trend = thisWeek > 0 ? "First week of data" : "No registrations";
    } else {
      const changePct = ((thisWeek - lastWeek) / lastWeek) * 100;
      if (changePct > 5) { score = 100; trend = `+${changePct.toFixed(0)}% growing`; }
      else if (changePct >= -5) { score = 70; trend = `flat (${changePct.toFixed(0)}%)`; }
      else { score = linearScore(changePct, -100, -5); trend = `${changePct.toFixed(0)}% declining`; }
    }
    signals.push({
      name: "registration_growth",
      score: clamp(score),
      rawValue: `This week: ${thisWeek}, Last week: ${lastWeek}`,
      detail: `Registration trend: ${trend}`,
    });
  } catch { signals.push({ name: "registration_growth", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 3: Task completion engagement (last 7d)
  try {
    const [completedRow] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${earnings.userId})` })
      .from(earnings)
      .where(and(gte(earnings.createdAt, ago7d), eq(earnings.type, "task_completion")));
    const [totalRow] = await db.select({ cnt: count() }).from(users).where(eq(users.isActive, true));
    const completed = Number(completedRow?.cnt ?? 0);
    const total = Number(totalRow?.cnt ?? 0);
    const rate = total > 0 ? (completed / total) * 100 : 0;
    signals.push({
      name: "task_completion_rate",
      score: linearScore(rate, 5, 25),
      rawValue: `${completed} users completed tasks (${rate.toFixed(1)}%)`,
      detail: `${rate.toFixed(1)}% of users completed tasks in last 7 days`,
    });
  } catch { signals.push({ name: "task_completion_rate", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 4: Churn signal (30+ days inactive)
  try {
    const [totalRow] = await db.select({ cnt: count() }).from(users).where(eq(users.isActive, true));
    const [activeRow] = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${earnings.userId})` })
      .from(earnings)
      .where(gte(earnings.createdAt, ago30d));
    const total = Number(totalRow?.cnt ?? 0);
    const recentlyActive = Number(activeRow?.cnt ?? 0);
    const dormant = Math.max(0, total - recentlyActive);
    const dormantPct = total > 0 ? (dormant / total) * 100 : 0;
    signals.push({
      name: "churn_signal",
      score: linearScore(dormantPct, 50, 20),
      rawValue: `${dormant}/${total} dormant (${dormantPct.toFixed(1)}%)`,
      detail: `${dormantPct.toFixed(1)}% of users have no activity in 30+ days`,
    });
  } catch { signals.push({ name: "churn_signal", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  return { score: Math.round(avgSignalScore(signals) * 100) / 100, signals };
}

// ── Dimension 4: Risk & Integrity Health (20%) ────────────────────────────────

async function computeRiskHealth(): Promise<DimensionResult> {
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const signals: HealthSignal[] = [];

  // Signal 1: Flagged user ratio
  try {
    const [flaggedRow] = await db
      .select({ cnt: count() })
      .from(riskCases)
      .where(inArray(riskCases.status, ["Open", "Investigating"]));
    const [totalRow] = await db.select({ cnt: count() }).from(users).where(eq(users.isActive, true));
    const flagged = Number(flaggedRow?.cnt ?? 0);
    const total = Number(totalRow?.cnt ?? 1);
    const ratio = (flagged / total) * 100;
    signals.push({
      name: "flagged_user_ratio",
      score: linearScore(ratio, 5, 0),
      rawValue: `${flagged} open/investigating (${ratio.toFixed(1)}%)`,
      detail: `${ratio.toFixed(1)}% of users have open risk cases`,
    });
  } catch { signals.push({ name: "flagged_user_ratio", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 2: Critical case presence
  try {
    const [row] = await db
      .select({ cnt: count() })
      .from(riskCases)
      .where(and(eq(riskCases.severity, "Critical"), inArray(riskCases.status, ["Open", "Investigating"])));
    const criticals = Number(row?.cnt ?? 0);
    signals.push({
      name: "critical_case_presence",
      score: clamp(100 - criticals * 25),
      rawValue: `${criticals} critical open case(s)`,
      detail: criticals === 0 ? "No critical risk cases open" : `${criticals} critical risk case(s) require immediate attention`,
    });
  } catch { signals.push({ name: "critical_case_presence", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 3: High-risk score cluster (risk_score > 50)
  try {
    const [highRow] = await db
      .select({ cnt: count() })
      .from(riskCases)
      .where(sql`CAST(${riskCases.riskScore} AS DECIMAL) > 50`);
    const [totalRow] = await db.select({ cnt: count() }).from(riskCases);
    const high = Number(highRow?.cnt ?? 0);
    const total = Number(totalRow?.cnt ?? 0);
    const pct = total > 0 ? (high / total) * 100 : 0;
    signals.push({
      name: "high_risk_cluster",
      score: linearScore(pct, 20, 5),
      rawValue: `${high}/${total} cases with score >50 (${pct.toFixed(1)}%)`,
      detail: `${pct.toFixed(1)}% of risk cases have score above 50`,
    });
  } catch { signals.push({ name: "high_risk_cluster", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 4: Manual credit frequency spike
  try {
    const [week7Row] = await db
      .select({ cnt: count() })
      .from(earnings)
      .where(and(gte(earnings.createdAt, ago7d), eq(earnings.type, "admin_credit")));
    const [week30Row] = await db
      .select({ cnt: count() })
      .from(earnings)
      .where(and(gte(earnings.createdAt, ago30d), eq(earnings.type, "admin_credit")));
    const last7 = Number(week7Row?.cnt ?? 0);
    const last30 = Number(week30Row?.cnt ?? 0);
    const dailyAvg30 = last30 / 30;
    const dailyAvg7 = last7 / 7;
    const ratio = dailyAvg30 > 0 ? dailyAvg7 / dailyAvg30 : (last7 > 0 ? 2 : 0);
    let score: number;
    if (ratio <= 1.5) score = 100;
    else if (ratio <= 2) score = 70;
    else if (ratio <= 3) score = 40;
    else score = 0;
    signals.push({
      name: "manual_credit_frequency",
      score,
      rawValue: `${last7} credits in 7d (avg: ${dailyAvg7.toFixed(1)}/day vs ${dailyAvg30.toFixed(1)}/day 30d avg)`,
      detail: ratio > 2 ? `Admin credit spike: ${ratio.toFixed(1)}× above 30-day average` : "Admin credit frequency is normal",
    });
  } catch { signals.push({ name: "manual_credit_frequency", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  return { score: Math.round(avgSignalScore(signals) * 100) / 100, signals };
}

// ── Dimension 5: Platform Integrity Health (10%) ───────────────────────────────

async function computeIntegrityHealth(): Promise<DimensionResult> {
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const signals: HealthSignal[] = [];

  // Signal 1: Founder ledger status (profit IN vs profit OUT)
  try {
    const [profitInRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${withdrawals.fee} AS DECIMAL)), 0)` })
      .from(withdrawals)
      .where(eq(withdrawals.status, "processed"));
    const [profitOutRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${founderWithdrawals.amount} AS DECIMAL)), 0)` })
      .from(founderWithdrawals);
    const profitIn = parseFloat(profitInRow?.total ?? "0");
    const profitOut = parseFloat(profitOutRow?.total ?? "0");
    const safe = profitIn - profitOut;
    if (profitIn === 0 && profitOut === 0) {
      signals.push({ name: "founder_ledger_status", score: 80, rawValue: "No data yet", detail: "No processed withdrawals or founder withdrawals recorded yet" });
    } else if (safe >= 0) {
      signals.push({ name: "founder_ledger_status", score: 100, rawValue: `₨${safe.toLocaleString()} safe to withdraw`, detail: "Founder has not over-withdrawn — ledger is balanced" });
    } else {
      signals.push({ name: "founder_ledger_status", score: 0, rawValue: `Over-withdrawn by ₨${Math.abs(safe).toLocaleString()}`, detail: `Founder has withdrawn ₨${Math.abs(safe).toLocaleString()} more than earned profit` });
    }
  } catch { signals.push({ name: "founder_ledger_status", score: 50, rawValue: "N/A", detail: "Could not compute" }); }

  // Signal 2: Config tampering (recent changes outside normal hours)
  try {
    const recentConfigs = await db
      .select({ updatedAt: systemConfig.updatedAt })
      .from(systemConfig)
      .where(gte(systemConfig.updatedAt, ago24h));
    let score = 100;
    let detail = "No configuration changes in last 24 hours";
    if (recentConfigs.length > 0) {
      const outsideHours = recentConfigs.filter(c => {
        if (!c.updatedAt) return false;
        const h = c.updatedAt.getHours();
        return h < 6 || h > 22; // outside 6am–10pm
      });
      if (outsideHours.length > 0) {
        score = 50;
        detail = `${outsideHours.length} config change(s) outside normal hours in last 24h`;
      } else {
        score = 85;
        detail = `${recentConfigs.length} config change(s) during business hours in last 24h`;
      }
    }
    signals.push({ name: "config_tampering", score, rawValue: `${recentConfigs.length} changes in 24h`, detail });
  } catch { signals.push({ name: "config_tampering", score: 80, rawValue: "N/A", detail: "Could not check config changes" }); }

  // Signal 3: Team activity normalcy
  try {
    const [day1Row] = await db.select({ cnt: count() }).from(auditLogs).where(gte(auditLogs.createdAt, ago24h));
    const [week7Row] = await db.select({ cnt: count() }).from(auditLogs).where(gte(auditLogs.createdAt, ago7d));
    const today = Number(day1Row?.cnt ?? 0);
    const avg7d = Number(week7Row?.cnt ?? 0) / 7;
    let score: number;
    let detail: string;
    if (avg7d === 0) {
      score = today > 0 ? 85 : 60;
      detail = today > 0 ? `${today} team actions today — first recorded activity` : "No recent team activity recorded";
    } else if (today === 0 && avg7d > 2) {
      score = 30;
      detail = `Complete team silence today (avg: ${avg7d.toFixed(0)} actions/day)`;
    } else {
      const ratio = today / avg7d;
      if (ratio >= 0.5 && ratio <= 3) { score = 100; detail = `${today} team actions today (avg: ${avg7d.toFixed(0)}/day) — normal`; }
      else if (ratio < 0.5) { score = 60; detail = `Below-average team activity: ${today} vs ${avg7d.toFixed(0)} avg/day`; }
      else { score = 70; detail = `Elevated team activity: ${today} vs ${avg7d.toFixed(0)} avg/day`; }
    }
    signals.push({ name: "team_activity_normalcy", score, rawValue: `${today} actions today / ${avg7d.toFixed(1)} daily avg`, detail });
  } catch { signals.push({ name: "team_activity_normalcy", score: 70, rawValue: "N/A", detail: "Could not compute" }); }

  return { score: Math.round(avgSignalScore(signals) * 100) / 100, signals };
}

// ── Root Cause / Reason Engine ────────────────────────────────────────────────

function buildTopReason(allSignals: HealthSignal[]): string {
  const sorted = [...allSignals].sort((a, b) => a.score - b.score);
  const worst = sorted.slice(0, 3).filter(s => s.score < 85);
  if (!worst.length) return "All systems nominal — no significant issues detected.";
  const parts = worst.map(s => `${s.detail} (score: ${Math.round(s.score)}/100)`);
  return parts.join(" · ");
}

// ── Main Compute Function ─────────────────────────────────────────────────────

export async function computeHealthScore(): Promise<HealthResult> {
  const [financial, operational, userHealth, risk, integrity] = await Promise.all([
    computeFinancialHealth(),
    computeOperationalHealth(),
    computeUserHealth(),
    computeRiskHealth(),
    computeIntegrityHealth(),
  ]);

  const overallScore =
    financial.score * 0.25 +
    operational.score * 0.25 +
    userHealth.score * 0.20 +
    risk.score * 0.20 +
    integrity.score * 0.10;

  const allSignals = [
    ...financial.signals,
    ...operational.signals,
    ...userHealth.signals,
    ...risk.signals,
    ...integrity.signals,
  ];

  return {
    overallScore: safeScore(Math.round(overallScore * 100) / 100),
    financialScore: safeScore(financial.score),
    operationalScore: safeScore(operational.score),
    userHealthScore: safeScore(userHealth.score),
    riskHealthScore: safeScore(risk.score),
    integrityScore: safeScore(integrity.score),
    signalsJson: {
      financial: financial.signals,
      operational: operational.signals,
      userHealth: userHealth.signals,
      risk: risk.signals,
      integrity: integrity.signals,
    },
    topReason: buildTopReason(allSignals),
  };
}

// ── Staleness ─────────────────────────────────────────────────────────────────
// Snapshots are recorded hourly by the cron job; a single shared threshold
// keeps the GET and recalculate routes from silently drifting apart.
export const STALE_THRESHOLD_MINUTES = 90;

export function isSnapshotStale(recordedAt: Date | string | null | undefined): boolean {
  if (!recordedAt) return true;
  const ageMinutes = (Date.now() - new Date(recordedAt).getTime()) / 60000;
  return ageMinutes > STALE_THRESHOLD_MINUTES;
}

// ── Snapshot Persistence ───────────────────────────────────────────────────────

// Returns true if a new snapshot was computed and saved, false if the
// computation/save failed (already logged). Callers that report success to a
// user (e.g. the manual "Recalculate" admin action) must check this instead
// of assuming success just because no exception escaped — silently reporting
// success on a failed recalculation would show a stale snapshot as fresh.
export async function computeAndSaveHealthSnapshot(): Promise<boolean> {
  try {
    const result = await computeHealthScore();

    // Compute deltas vs 1h and 24h ago
    const now = new Date();
    const ago1h = new Date(now.getTime() - 60 * 60 * 1000);
    const ago25h = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    const [snap1h] = await db
      .select({ score: healthSnapshots.overallScore })
      .from(healthSnapshots)
      .where(lte(healthSnapshots.recordedAt, ago1h))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(1);

    const [snap24h] = await db
      .select({ score: healthSnapshots.overallScore })
      .from(healthSnapshots)
      .where(lte(healthSnapshots.recordedAt, ago25h))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(1);

    const rawDelta1h = snap1h ? result.overallScore - parseFloat(snap1h.score ?? "0") : null;
    const rawDelta24h = snap24h ? result.overallScore - parseFloat(snap24h.score ?? "0") : null;
    const delta1h = rawDelta1h !== null && Number.isFinite(rawDelta1h) ? rawDelta1h : null;
    const delta24h = rawDelta24h !== null && Number.isFinite(rawDelta24h) ? rawDelta24h : null;

    await db.insert(healthSnapshots).values({
      overallScore: result.overallScore.toFixed(2),
      financialScore: result.financialScore.toFixed(2),
      operationalScore: result.operationalScore.toFixed(2),
      userHealthScore: result.userHealthScore.toFixed(2),
      riskHealthScore: result.riskHealthScore.toFixed(2),
      integrityScore: result.integrityScore.toFixed(2),
      signalsJson: result.signalsJson,
      topReason: result.topReason,
      delta1h: delta1h !== null ? delta1h.toFixed(2) : null,
      delta24h: delta24h !== null ? delta24h.toFixed(2) : null,
    });

    logger.info({ overallScore: result.overallScore, topReason: result.topReason.slice(0, 80) }, "[HealthEngine] Snapshot saved");
    return true;
  } catch (err) {
    logger.error({ err }, "[HealthEngine] Failed to compute/save snapshot");
    return false;
  }
}
