import { db } from "../db";
import { leaderboardCache } from "@shared/schema";
import { trackInterval, trackTimeout } from "./registry";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Periodically prune leaderboard_cache rows older than 7 days.
 * Runs every 6 hours via setInterval (no external cron dependency).
 */
export function startLeaderboardCleanup(): void {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  const cleanup = async () => {
    try {
      const result = await db
        .delete(leaderboardCache)
        .where(sql`recorded_at < NOW() - INTERVAL '7 days'`);
      
      if (result.rowCount && result.rowCount > 0) {
        logger.info({ pruned: result.rowCount }, "[cleanup] Pruned stale leaderboard_cache rows");
      }
    } catch (error) {
      logger.error({ err: error }, "[cleanup] Leaderboard cache cleanup failed");
    }
  };

  // Run immediately on startup, then every 6 hours
  trackTimeout(setTimeout(cleanup, 10_000)); // 10s after startup to avoid boot contention
  trackInterval(setInterval(cleanup, SIX_HOURS));
}
