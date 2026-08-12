/**
 * Economy Snapshot Job
 *
 * Computes and caches the daily economy multiplier into economy_state
 * so recordEarnEvent() can read it without recalculating on every earn.
 *
 * Runs once at startup (to seed today's row) then fires at midnight PKT
 * (UTC+5) every day — not 24 h from server start.
 */

import { getTodaySnapshot, invalidateEconomyCache } from "../modules/economy-engine";
import { logger } from "../lib/logger";
import { trackInterval, trackTimeout } from "./registry";

let _timeoutId: ReturnType<typeof setTimeout> | null = null;
let _intervalId: ReturnType<typeof setInterval> | null = null;

/** Returns milliseconds until the next midnight in PKT (UTC+5). */
function msUntilMidnightPKT(): number {
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowUtcMs = Date.now();
  const nowPktMs = nowUtcMs + PKT_OFFSET_MS;
  // Next midnight PKT expressed as ms since epoch (PKT scale)
  const nextMidnightPktMs = Math.ceil((nowPktMs + 1) / DAY_MS) * DAY_MS;
  return nextMidnightPktMs - nowPktMs;
}

export function startEconomySnapshotJob(): void {
  if (_timeoutId || _intervalId) return; // already running

  // Run immediately at startup to ensure today's row exists
  runSnapshot();

  const msToMidnight = msUntilMidnightPKT();
  logger.info(
    { minutesToMidnightPKT: Math.round(msToMidnight / 60000) },
    "[EconomySnapshot] Daily multiplier snapshot job started — first refresh at midnight PKT.",
  );

  // Fire at the next PKT midnight, then every 24 h after that
  _timeoutId = trackTimeout(setTimeout(() => {
    _timeoutId = null;
    invalidateEconomyCache();
    runSnapshot();

    _intervalId = trackInterval(setInterval(
      () => {
        invalidateEconomyCache();
        runSnapshot();
      },
      24 * 60 * 60 * 1000,
    ));
  }, msToMidnight));
}

export function stopEconomySnapshotJob(): void {
  if (_timeoutId) {
    clearTimeout(_timeoutId);
    _timeoutId = null;
  }
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

async function runSnapshot(): Promise<void> {
  try {
    const snap = await getTodaySnapshot();
    logger.info(
      {
        date: snap.date,
        effectiveMultiplier: snap.effectiveMultiplier,
        source: snap.source,
        revenueActual: snap.revenueActual,
        revenueBaseline: snap.revenueBaseline,
      },
      "[EconomySnapshot] Daily snapshot computed",
    );
  } catch (err) {
    logger.error({ err }, "[EconomySnapshot] Failed to compute daily snapshot");
  }
}
