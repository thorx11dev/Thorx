/**
 * Economy Snapshot Job
 *
 * Computes and caches the daily economy multiplier into economy_state
 * so recordEarnEvent() can read it without recalculating on every earn.
 *
 * Runs once at startup (to seed today's row) then every 24 hours.
 */

import { getTodaySnapshot, invalidateEconomyCache } from "../modules/economy-engine";
import { logger } from "../lib/logger";

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startEconomySnapshotJob(): void {
  if (_intervalId) return; // already running

  // Run immediately at startup to ensure today's row exists
  runSnapshot();

  // Re-run at midnight UTC (every 24h from startup — close enough for daily refresh)
  _intervalId = setInterval(
    () => {
      invalidateEconomyCache();
      runSnapshot();
    },
    24 * 60 * 60 * 1000,
  );

  logger.info("[EconomySnapshot] Daily multiplier snapshot job started.");
}

export function stopEconomySnapshotJob(): void {
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
