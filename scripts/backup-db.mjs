#!/usr/bin/env node
// =============================================================
//  THORX Database Backup — critical-tables JSON export
//
//  Kya karta hai: financial ledger + users + config ko timestamped
//  JSON files mein export karta hai (default: E:\Work\thorx-backups),
//  14 din se purani backups auto-delete karta hai.
//
//  Usage:
//    DATABASE_URL="postgres://..." node scripts/backup-db.mjs
//    node scripts/backup-db.mjs --url "postgres://..."
//
//  Daily schedule ke liye: thorx-daily-backup.cmd (repo ke bahar)
// =============================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const BACKUP_ROOT = process.env.THORX_BACKUP_DIR || "E:\\Work\\thorx-backups";
const RETENTION_DAYS = 14;

const CRITICAL_TABLES = [
  // money & ledger (order = restore priority)
  "users",
  "user_transactions",
  "withdrawals",
  "points_ledger",
  "earnings",
  "survey_records",
  "ad_views",
  "engine_b_tasks",
  "engine_b_records",
  "referrals",
  "referral_commissions",
  "referral_earn_commissions",
  "commission_logs",
  "founder_withdrawals",
  // guild economy
  "guilds",
  "guild_members",
  "guild_weekly_cycles",
  "guild_weekly_snapshots",
  "guild_wars",
  "guild_war_seasons",
  // trust & ops
  "webhook_events",
  "risk_cases",
  "beta_invites",
  "feedback_messages",
  "audit_logs",
  "system_config",
];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(BACKUP_ROOT, "backup.log"), line + "\n");
  } catch {
    /* log dir may not exist yet on first run */
  }
}

function resolveConnString() {
  const argIndex = process.argv.indexOf("--url");
  if (argIndex !== -1 && process.argv[argIndex + 1]) return process.argv[argIndex + 1];
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  console.error("ERROR: DATABASE_URL na env mein hai na --url argument mein.");
  process.exit(1);
}

async function exportTable(pool, table, outDir) {
  const countResult = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  const rows = countResult.rows[0].n;
  if (rows === 0) {
    fs.writeFileSync(path.join(outDir, `${table}.json`), "[]");
    return { table, rows: 0 };
  }
  const result = await pool.query(`SELECT * FROM "${table}"`);
  fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(result.rows));
  return { table, rows };
}

async function main() {
  const connString = resolveConnString();
  const parsed = new URL(connString);
  const dbLabel = `${parsed.hostname}${parsed.pathname}`; // creds kabhi log NAHI karte

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outDir = path.join(BACKUP_ROOT, `thorx-backup-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const pool = new pg.Pool({
    connectionString: connString,
    ssl: /localhost|127\.0\.0\.1/.test(parsed.hostname) ? false : { rejectUnauthorized: false },
    statement_timeout: 120000,
  });

  const summary = [];
  try {
    for (const table of CRITICAL_TABLES) {
      try {
        summary.push(await exportTable(pool, table, outDir));
      } catch (err) {
        log(`SKIP   : ${table} (${err.message})`);
        summary.push({ table, rows: -1, error: err.message });
      }
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      database: dbLabel,
      totalRows: summary.reduce((sum, s) => sum + Math.max(s.rows, 0), 0),
      tables: summary,
    };
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const failed = summary.filter((s) => s.error && s.error !== `relation "${s.table}" does not exist`);
    log(`BACKUP OK : ${outDir} — ${manifest.totalRows} rows, ${summary.length} tables${failed.length ? `, ${failed.length} errors` : ""}`);
  } finally {
    await pool.end();
  }

  // ── retention sweep ────────────────────────────────────────────────────────
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const dir of fs.readdirSync(BACKUP_ROOT)) {
    const match = dir.match(/^thorx-backup-(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;
    if (new Date(match[1]).getTime() < cutoff) {
      fs.rmSync(path.join(BACKUP_ROOT, dir), { recursive: true, force: true });
      log(`RETAIN  : purana backup delete — ${dir}`);
    }
  }

  console.log(`DONE: ${outDir}`);
}

main().catch((err) => {
  log(`BACKUP FAIL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
