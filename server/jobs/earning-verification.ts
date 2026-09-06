/**
 * REAL PKR ECONOMY v4 — Pending-earning verification sweep (Spec §5–§6).
 *
 * Every 15 minutes this job verifies task/referral earnings that have waited
 * at least PENDING_VERIFICATION_HOURS (default 48h — the spec's 2-day max
 * target): their PKR moves from the user's Pending Balance to Available
 * Balance and the ledger rows flip pending → verified.
 *
 * The sweep is idempotent and self-healing (fixed-interval pattern, same
 * rationale as guild-weekly-reset): a process restart can never strand an
 * earning in pending forever, and storage.verifyPendingEarnings()'s
 * conditional claims make concurrent runs safe. Network rejections still
 * claw money back via the survey reversal path / admin reject action —
 * the time window is only the upper bound on how long a legitimate
 * earning stays pending.
 */
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { trackInterval, trackTimeout } from "./registry";

export function startEarningVerificationJob(): void {
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[EarningVerification] Previous sweep still running — skipping this tick.");
      return;
    }
    isRunning = true;
    try {
      const summary = await storage.verifyPendingEarnings();
      if (summary.verified > 0) {
        logger.info({ summary }, "[EarningVerification] Pending earnings swept to available.");
      }
    } catch (error) {
      logger.error({ err: error }, "[EarningVerification] Verification sweep failed.");
    } finally {
      isRunning = false;
    }
  };

  trackTimeout(setTimeout(run, 30_000)); // after boot migrations have settled
  trackInterval(setInterval(run, FIFTEEN_MINUTES));
  logger.info("[EarningVerification] Pending-earning verification job started (every 15 min).");
}
