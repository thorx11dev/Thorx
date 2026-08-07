import { hilltopAdsService } from "./hilltopads-service";
import { logger as rootLogger } from "./lib/logger";

const logger = rootLogger.child({ module: "HilltopAdsScheduler" });

export class HilltopAdsScheduler {
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) {
      logger.info("HilltopAds scheduler is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting HilltopAds automated sync scheduler...");

    const SYNC_INTERVAL = 24 * 60 * 60 * 1000;

    this.syncInterval = setInterval(async () => {
      try {
        logger.info("Running automated HilltopAds sync...");
        await hilltopAdsService.syncDailyStats();
        logger.info("HilltopAds sync completed successfully");
      } catch (error) {
        logger.error({ err: error }, "HilltopAds automated sync failed");
      }
    }, SYNC_INTERVAL);

    this.runImmediateSync();
  }

  private async runImmediateSync() {
    // No API key configured (fresh DB / key not set yet) is the normal state,
    // not an error — skip quietly so startup logs stay clean.
    if (!(await hilltopAdsService.isConfigured())) {
      logger.info("Skipping initial HilltopAds sync — no active API key configured");
      return;
    }
    try {
      logger.info("Running initial HilltopAds inventory sync...");
      await hilltopAdsService.syncInventory();
      logger.info("Initial inventory sync completed");
    } catch (error) {
      logger.error({ err: error }, "Initial sync failed");
    }
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.isRunning = false;
      logger.info("HilltopAds scheduler stopped");
    }
  }
}

export const hilltopAdsScheduler = new HilltopAdsScheduler();
