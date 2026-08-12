/**
 * Nightly data retention cleanup job.
 * Business decisions: score_history kept 90 days; audit_logs kept 2 years online.
 */
import { db } from "../db";
import { logger } from "../lib/logger";
import { lt } from "drizzle-orm";
import { scoreHistory, auditLogs } from "@shared/schema";
import { trackInterval, trackTimeout } from "./registry";

let isRunning = false;

export function startRetentionCleanupJob(): void {
  // Delay first run 10 min after startup to avoid cold-start DB spike
  trackTimeout(setTimeout(() => {
    runCleanup();
    trackInterval(setInterval(runCleanup, 24 * 60 * 60 * 1000));
  }, 10 * 60 * 1000));
  logger.info("[RetentionCleanup] Nightly cleanup job scheduled (score_history: 90d, audit_logs: 2yr).");
}

async function runCleanup(): Promise<void> {
  if (isRunning) {
    logger.warn("[RetentionCleanup] Previous run still in progress — skipping.");
    return;
  }
  isRunning = true;
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const twoYearsAgo   = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);

    const [snapshotResult, auditResult] = await Promise.all([
      db.delete(scoreHistory).where(lt(scoreHistory.snapshotAt, ninetyDaysAgo)).returning({ id: scoreHistory.id }),
      db.delete(auditLogs).where(lt(auditLogs.createdAt, twoYearsAgo)).returning({ id: auditLogs.id }),
    ]);

    logger.info({ deletedSnapshots: snapshotResult.length, deletedAuditLogs: auditResult.length }, "[RetentionCleanup] Complete.");
  } catch (err) {
    logger.error({ err }, "[RetentionCleanup] Failed.");
  } finally {
    isRunning = false;
  }
}
