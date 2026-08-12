/**
 * Daily automated ledger integrity scan.
 * Previously the only way to discover a stored-balance/ledger discrepancy was
 * an admin remembering to open Ledger Validator and click "Run Scan" — a
 * critical drift (e.g. a bug crediting availableBalance without a matching
 * user_transactions row) could sit undetected for weeks. This job runs the
 * same adminValidateLedgerScan() logic the admin UI uses, once a day, and
 * logs a loud warning/error when it finds anything so it surfaces in
 * monitoring/log alerts without requiring a manual check (audit 2026-07-29).
 */
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { trackInterval } from "./registry";

const SCAN_PAGE_SIZE = 2000;

export function startLedgerIntegrityScanJob(): void {
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[LedgerIntegrity] Previous scan still running — skipping this tick.");
      return;
    }
    isRunning = true;
    try {
      // Page through every active user rather than trusting a single call to
      // cover the whole platform — mirrors the admin UI's own "Load next
      // batch" pagination so this job scales the same way the manual tool does.
      let offset = 0;
      let totalScanned = 0;
      let totalCritical = 0;
      let totalWarnings = 0;
      let totalEligible = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page = await storage.adminValidateLedgerScan(SCAN_PAGE_SIZE, offset);
        totalScanned += page.scanned;
        totalCritical += page.critical.length;
        totalWarnings += page.warnings.length;
        totalEligible = page.totalEligible;
        if (page.critical.length > 0) {
          logger.error(
            {
              service: "thorx-api",
              module: "LedgerIntegrity",
              accounts: page.critical.map(c => ({ userId: c.userId, email: c.email, discrepancy: c.discrepancy })),
            },
            `[LedgerIntegrity] ${page.critical.length} account(s) with CRITICAL ledger discrepancies found in this batch.`,
          );
        }
        if (page.scanned === 0 || offset + page.scanned >= page.totalEligible) break;
        offset += page.scanned;
      }

      if (totalCritical > 0) {
        logger.error(
          { module: "LedgerIntegrity", totalScanned, totalCritical, totalWarnings, totalEligible },
          `[LedgerIntegrity] Daily scan complete: ${totalCritical} CRITICAL discrepancy(ies) across ${totalScanned} accounts — review in Ledger Validator.`,
        );
      } else {
        logger.info(
          { module: "LedgerIntegrity", totalScanned, totalWarnings, totalEligible },
          `[LedgerIntegrity] Daily scan complete: all ${totalScanned} scanned accounts balanced (${totalWarnings} rounding warning(s)).`,
        );
      }
    } catch (err) {
      logger.error({ err, module: "LedgerIntegrity" }, "[LedgerIntegrity] Daily scan failed.");
    } finally {
      isRunning = false;
    }
  };

  // Run once on boot (dev visibility, same convention as HealthEngine), then daily.
  run();
  trackInterval(setInterval(run, 24 * 60 * 60 * 1000));
  logger.info("[LedgerIntegrity] Daily ledger integrity scan job started.");
}
