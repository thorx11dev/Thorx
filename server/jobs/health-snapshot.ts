/**
 * Hourly health snapshot cron job.
 * Calls computeAndSaveHealthSnapshot() every 60 minutes in both dev and prod.
 * P-08: isRunning guard prevents overlap if a snapshot takes longer than 1 hour.
 */
import { computeAndSaveHealthSnapshot } from "../modules/health-engine";
import { logger } from "../lib/logger";
import { trackInterval } from "./registry";

export function startHealthSnapshotJob(): void {
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[HealthEngine] Previous snapshot still running — skipping this tick.");
      return;
    }
    isRunning = true;
    try {
      await computeAndSaveHealthSnapshot();
    } finally {
      isRunning = false;
    }
  };

  // Run immediately on start, then every 60 minutes
  run();
  trackInterval(setInterval(run, 60 * 60 * 1000));
  logger.info("[HealthEngine] Hourly snapshot job started.");
}
