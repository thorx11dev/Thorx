// THORX v4 — deterministic TX-Point conversion (REAL PKR ECONOMY v4, Spec §2–§3).
//
// The old "Thorx Card illusion" (random variance, rank multipliers) is
// REMOVED. Points are a fixed, transparent conversion of real PKR:
//
//     points = realPkr × TX_POINTS_PER_PKR      (default 10 pts = Rs.1)
//
// The functions below are kept because storage.recordEarnEvent and the admin
// sandbox route call them — they now perform the exact conversion with no
// randomness so the entire platform shows one consistent number.

import Decimal from "decimal.js";

export interface CardDrawParams {
  userPkrShare: number | string;   // exact PKR the user earned (string keeps Decimal precision)
  conversionRate: number; // system_config TX_POINTS_PER_PKR (TX-Points per Rs.1)
  userRankTier: string;   // accepted for interface compatibility — NO effect (v4 removed rank multipliers)
  varianceMin: number;    // accepted for interface compatibility — ignored (fixed 1.0)
  varianceMax: number;    // accepted for interface compatibility — ignored (fixed 1.0)
  aRankBonusPct?: number; // removed in v4 — ignored
  sRankBonusPct?: number; // removed in v4 — ignored
}

export interface CardResult {
  pointsCredited: number; // deterministic: realPkr × conversionRate, floored
  realPkrValue: string;   // exact string representation — never converted to float
  cardVariance: number;   // always 1.0 (kept for ledger schema compatibility)
  targetPoints: number;   // same as pointsCredited (no variance anymore)
}

export function drawThorxCard(params: CardDrawParams): CardResult {
  const { userPkrShare, conversionRate } = params;

  const pkrDecimal = new Decimal(userPkrShare);
  // Keep Decimal through the full chain — only convert to number at the
  // final integer step to avoid float-multiply precision drift.
  const exactPointsD = pkrDecimal.times(conversionRate).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const pointsCredited = Math.max(0, exactPointsD.toNumber());

  return {
    pointsCredited,
    realPkrValue: pkrDecimal.toFixed(4),
    cardVariance: 1.0,
    targetPoints: pointsCredited,
  };
}

export interface CardConfig {
  conversionRate: number;
  varianceMin: number; // ignored in v4 — kept for sandbox request compatibility
  varianceMax: number; // ignored in v4 — kept for sandbox request compatibility
  aRankBonusPct?: number;
  sRankBonusPct?: number;
}

export interface SimulationResult {
  iteration: number;
  pointsCredited: number;     // deterministic conversion result
  basePointsCredited: number; // identical in v4 (no variance)
  rankMultiplier: number;     // always 1.0 in v4 (rank multipliers removed)
  realPkrValue: string;       // PKR value TX-Points were computed from (guild pool share for Engine C)
  immediateUserPkrValue: string; // what lands in the user's PENDING balance (0.0000 for Engine C — pool-based)
  cardVariance: number;       // always 1.0
}

// Admin simulation tool (Thorx Card Sandbox) — runs N draws for a given
// gross PKR / engine / rank combination without touching real user data.
// v4: fully deterministic — the sandbox now previews the exact numbers a
// real earn event produces (fixed conversion, v4 splits).
export function simulateThorxCards(params: {
  grossPkr: number;
  engineType: "A" | "B" | "C";
  userRankTier: string;
  iterations: number;
  config: CardConfig;
  engineSplits: { thorxCutPct: number; userCutPct: number; guildPoolPct?: number; bonusPct?: number; referrerPct?: number };
}): SimulationResult[] {
  const { grossPkr, engineType, iterations, config, engineSplits } = params;

  // Use Decimal for the split so floating-point errors don't accumulate.
  // Mirrors recordEarnEvent's per-engine branch (server/storage.ts) exactly.
  let immediateUserPkrShareD: Decimal;
  let txPointsBasePkrD: Decimal;
  if (engineType === "C") {
    const guildPoolPkrD = new Decimal(grossPkr).times(engineSplits.guildPoolPct ?? 80).div(100);
    immediateUserPkrShareD = new Decimal(0); // pool unlocks Sunday — no instant balance credit
    txPointsBasePkrD = guildPoolPkrD;        // TX-Points reflect the pool contribution instead
  } else {
    immediateUserPkrShareD = new Decimal(grossPkr).times(engineSplits.userCutPct).div(100);
    txPointsBasePkrD = immediateUserPkrShareD;
  }
  const txPointsBasePkr = txPointsBasePkrD.toFixed(8);
  const immediateUserPkrValue = immediateUserPkrShareD.toFixed(4);
  const rankMultiplier = 1.0; // v4: rank multipliers removed — fixed conversion for everyone

  const results: SimulationResult[] = [];
  for (let i = 0; i < iterations; i++) {
    const draw = drawThorxCard({
      userPkrShare: txPointsBasePkr,
      conversionRate: config.conversionRate,
      userRankTier: "E-Rank",
      varianceMin: 1,
      varianceMax: 1,
    });
    results.push({
      iteration: i + 1,
      pointsCredited: draw.pointsCredited,
      basePointsCredited: draw.pointsCredited,
      rankMultiplier,
      realPkrValue: draw.realPkrValue,
      immediateUserPkrValue,
      cardVariance: draw.cardVariance,
    });
  }
  return results;
}
