/**
 * Sunday guild reset sweep (THORX v3 spec Part E.8/E.10).
 *
 * Runs every 30 minutes (self-healing, matching guild-vault-resolution.ts's
 * pattern) rather than an exact "Sunday 23:59 PKT" cron trigger — a fixed
 * interval sweep can't miss a reset if the process was down at the exact
 * boundary. runWeeklyGuildReset() is idempotent per (guild, week).
 * P-08: isRunning guard prevents two concurrent resets from racing.
 */
import { runWeeklyGuildReset } from "../modules/guild-reset";
import { logger } from "../lib/logger";
import { trackInterval, trackTimeout } from "./registry";

export function startGuildWeeklyResetJob(): void {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[GuildReset] Previous reset sweep still running — skipping this tick.");
      return;
    }
    isRunning = true;
    try {
      const summary = await runWeeklyGuildReset();
      if (summary.distributed > 0 || summary.voided > 0) {
        logger.info({ summary }, "[GuildReset] Weekly reset sweep complete.");
      }
    } catch (error) {
      logger.error({ err: error }, "[GuildReset] Weekly reset sweep failed.");
    } finally {
      isRunning = false;
    }
  };

  trackTimeout(setTimeout(run, 20_000)); // stagger after guild-vault-resolution's 15s startup delay
  trackInterval(setInterval(run, THIRTY_MINUTES));
  logger.info("[GuildReset] Sunday guild reset job started.");
}
