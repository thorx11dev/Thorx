// ── Boot-time idempotent migrations ──────────────────────────────────────────
// Production (SnapDeploy/Render Docker) runs `node dist/index.js` with NO
// migration step, and the image ships only dist/ — the migrations/*.sql files
// are not on disk there. Newer code that queries beta tables would 500 on any
// database provisioned before the beta trust work.
//
// Fix: bundle the post-0009 DDL directly into the server via esbuild's
// --loader:.sql=text and execute it at startup. Every statement is written
// with IF NOT EXISTS / guarded ALTERs, so re-running on an up-to-date DB is a
// no-op — safe across restarts, multiple instances, and rollbacks.
//
// Only migrations NEWER than what production already has live are listed here.
// Older ones (0001–0009) ran through drizzle-kit during the original deploys;
// adding them would be harmless but noisy at boot.

import { db } from "./db";
import { logger } from "./lib/logger";
import {
  M0010_BETA_TRUST_INFRA,
  M0011_SURVEY_INFRA,
} from "./migrations-inline";

const BOOT_MIGRATIONS: Array<{ name: string; ddl: string }> = [
  { name: "0010_beta_trust_infra", ddl: M0010_BETA_TRUST_INFRA },
  { name: "0011_survey_infra", ddl: M0011_SURVEY_INFRA },
];

let applied = false;

/**
 * Applies pending boot migrations exactly once per process, before any route
 * can touch the new tables. Never throws: a migration failure is logged loudly
 * (and surfaced to Sentry) but must not take down the whole legacy app —
 * degraded-but-up beats down entirely while we investigate.
 */
export async function runBootMigrations(): Promise<void> {
  if (applied) return;
  applied = true;

  for (const { name, ddl } of BOOT_MIGRATIONS) {
    try {
      await db.execute(ddl as any);
      logger.info({ service: "thorx-api", migration: name }, `Boot migration ${name} applied (idempotent)`);
    } catch (err) {
      logger.error({ service: "thorx-api", migration: name, err }, `Boot migration ${name} FAILED — beta endpoints may 500 until fixed`);
      try {
        const { Sentry } = await import("./lib/sentry");
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // Sentry unavailable — the error log above is the record.
      }
    }
  }
}
