/**
 * Daily inactivity penalty sweep (THORX v3 spec Part E.10).
 *
 * Spec calls for an exact "00:00 PKT" cron. This codebase avoids exact-time
 * cron scheduling (see guild-vault-resolution.ts, leaderboard-cleanup.ts) in
 * favor of a self-healing periodic sweep: runs every hour, but only actually
 * applies penalties once per rolling 24h window, tracked via system_config.
 */
import { applyInactivityPenalties } from "../modules/ps-engine";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { db } from "../db";
import { trackInterval, trackTimeout } from "./registry";
import { systemConfig } from "@shared/schema";

const LAST_RUN_CONFIG_KEY = "LAST_INACTIVITY_PENALTY_RUN_AT";
const ONE_HOUR = 60 * 60 * 1000;
const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000; // slightly under 24h so hourly polling can't skip a day

// Internal bookkeeping upsert — deliberately bypasses storage.updateSystemConfig()
// (which requires an adminId and writes an audit log entry on every call) since
// this key is written by a system job every ~24h, not an admin action.
async function markLastRun(): Promise<void> {
  await db.insert(systemConfig)
    .values({ key: LAST_RUN_CONFIG_KEY, value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: new Date().toISOString(), updatedAt: new Date() },
    });
}

export function startInactivityPenaltyJob(): void {
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[InactivityPenalty] Previous sweep still running — skipping this tick.");
      return;
    }
    isRunning = true;
    try {
      const lastRunIso = await storage.getSystemConfigValue<string | null>(LAST_RUN_CONFIG_KEY, null);
      const lastRun = lastRunIso ? new Date(lastRunIso).getTime() : 0;
      if (Date.now() - lastRun < TWENTY_THREE_HOURS) return;

      const penalized = await applyInactivityPenalties();
      await markLastRun();
      logger.info({ penalized }, "[InactivityPenalty] Daily sweep complete.");
    } catch (error) {
      logger.error({ err: error }, "[InactivityPenalty] Daily sweep failed.");
    } finally {
      isRunning = false;
    }
  };

  trackTimeout(setTimeout(run, 25_000));
  trackInterval(setInterval(run, ONE_HOUR));
  logger.info("[InactivityPenalty] Daily inactivity penalty job started.");
}
