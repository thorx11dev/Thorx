/**
 * 15-minute leaderboard refresh cron job.
 *
 * Decoupled from earn events (Q4 architectural decision 2026-07-17):
 * running refreshLeaderboardCache() on every earn event caused O(n) DB
 * reads blocking the earn path at scale. The cron approach gives a
 * maximum 15-minute staleness window with zero per-earn overhead.
 * (Interval changed from 5 → 15 min per Q6 decision: 66% DB load reduction
 * + admin has force-refresh capability.)
 *
 * Also triggers a full risk scan on the same cadence so the risk
 * watchlist stays current alongside leaderboard data.
 */
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { trackInterval } from "./registry";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes (Q6 decision: 66% DB load reduction + admin force-refresh)

let isRunning = false;

export function startLeaderboardRefreshJob(): void {
  // Run immediately on startup to populate cache from cold start, then on interval.
  runRefresh();
  trackInterval(setInterval(runRefresh, INTERVAL_MS));
  logger.info("[LeaderboardRefresh] 15-minute cache refresh job started.");
}

// Track the last successful run timestamp for health-check liveness reporting.
export let leaderboardRefreshLastRunMs = 0;

async function runRefresh(): Promise<void> {
  if (isRunning) {
    logger.warn("[LeaderboardRefresh] Still running — skipping.");
    return;
  }
  isRunning = true;
  try {
    await storage.refreshLeaderboardCache();
    leaderboardRefreshLastRunMs = Date.now();
    logger.info("[LeaderboardRefresh] Cache refreshed successfully.");

    // 3.2 — Notify all connected clients so they invalidate their leaderboard
    // query cache immediately rather than waiting for their own poll interval.
    try {
      const { broadcastLeaderboardRefreshed } = await import("../realtime");
      broadcastLeaderboardRefreshed();
    } catch (wsErr) {
      logger.warn({ err: wsErr }, "[LeaderboardRefresh] WS broadcast skipped — realtime not ready.");
    }

    // Piggyback risk scan on the same cadence — fire-and-forget.
    import("../modules/risk-engine")
      .then((mod) => mod.runFullRiskScan({ broadcastAlerts: true }))
      .catch((err) => logger.error({ err }, "[LeaderboardRefresh] Risk scan failed — will retry next cycle."));
  } catch (err) {
    logger.error({ err }, "[LeaderboardRefresh] Refresh failed — will retry next cycle.");
  } finally {
    isRunning = false;
  }
}
