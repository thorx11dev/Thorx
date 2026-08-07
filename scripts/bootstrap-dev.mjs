#!/usr/bin/env node
/**
 * Fast, idempotent Replit import bootstrap.
 *
 * `npm run dev` is the only command the imported project needs. This wrapper:
 *   1. Installs dependencies only when the local install is incomplete.
 *   2. Initializes the database only when core tables are missing.
 *   3. Applies the critical ledger indexes idempotently.
 *   4. Starts the existing Vite/Express server.
 *
 * It never creates or changes a founder account and never runs the full auth
 * QA suite automatically. Those are explicit, opt-in commands.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// Anchor the process to the project root as early as possible. Cloud preview
// runners sometimes start with a stale/deleted cwd (`getcwd: cannot access
// parent directories`), which breaks every relative path below.
try {
  process.chdir(ROOT);
} catch {
  console.warn(`[bootstrap] Could not chdir to ${ROOT}; using absolute paths instead.`);
}

const REQUIRED_BINARIES = [
  path.join(ROOT, "node_modules/.bin/tsx"),
  path.join(ROOT, "node_modules/.bin/drizzle-kit"),
];

/**
 * Loads the project's .env file into process.env so `npm run dev` works in
 * any hosting context (Replit auto-injects secrets, but Freebuff Cloud and
 * plain Node do not). Rules:
 *   - Existing environment variables ALWAYS win (platform-injected values
 *     take precedence over the file).
 *   - Values are never logged — only the key names.
 */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return false;
  const loaded = [];
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      // Normalize pg SSL modes to the explicit form the installed pg version
      // actually uses. Neon/Railway connection strings commonly carry
      // sslmode=require, which makes pg-connection-string emit a noisy
      // "SECURITY WARNING" on every Pool construction. Per pg's own advice
      // this is behavior-identical, so the warning simply disappears.
      if (key === "DATABASE_URL" && /sslmode=(prefer|require|verify-ca)(?=&|$)/i.test(value)) {
        value = value.replace(/sslmode=(prefer|require|verify-ca)(?=&|$)/i, "sslmode=verify-full");
      }
      process.env[key] = value;
      loaded.push(key);
    }
  }
  if (loaded.length > 0) {
    console.log(`[bootstrap] Loaded env var(s) from .env: ${loaded.join(", ")} (values never logged).`);
  }
  return loaded.length > 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function ensureDependencies() {
  if (REQUIRED_BINARIES.every((file) => BunOrNodeExists(file))) return;
  console.log("[bootstrap] Installing missing project dependencies once...");
  run(npmCommand(), ["install", "--no-audit", "--no-fund"]);
}

function BunOrNodeExists(file) {
  // Kept as a small helper so the bootstrap script remains dependency-free
  // until npm install has completed.
  return fs.existsSync(file);
}

async function withDatabaseLock(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      "thorx-import-bootstrap",
    ]);
    return await callback(client);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
        "thorx-import-bootstrap",
      ]);
    } finally {
      client.release();
    }
  }
}

async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing. Ensure .env contains DATABASE_URL (e.g. your Neon connection string), then press Run again.",
    );
  }

  const { Pool } = await import("pg");
  // Timeouts prevent a slow/unreachable database from hanging the bootstrap
  // forever (the preview runner would otherwise stall before the port opens).
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    query_timeout: 15000,
    statement_timeout: 15000,
  });

  try {
    // Fast path: when the core tables already exist (the common case), skip the
    // advisory lock + schema push entirely so the dev server starts within a
    // second or two instead of waiting on a drizzle-kit round-trip.
    const { rows: quickRows } = await pool.query(`
      SELECT count(*) AS n
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users','system_config','user_transactions','withdrawals')
    `);
    if (Number(quickRows[0].n) >= 3) {
      console.log("[bootstrap] Database already initialized; skipping schema push.");
      // Still ensure the ledger uniqueness indexes exist (idempotent, cheap).
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_withdrawals_one_pending_per_user
          ON withdrawals (user_id) WHERE status = 'pending';
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_withdrawals_one_approved_per_user
          ON withdrawals (user_id) WHERE status = 'approved';
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_transactions_source
          ON user_transactions (user_id, source_type, source_id)
          WHERE source_id IS NOT NULL;
      `);
      return;
    }

    await withDatabaseLock(pool, async (client) => {
      const { rows } = await client.query(`
        SELECT
          count(*) FILTER (WHERE table_name = 'users') AS users,
          count(*) FILTER (WHERE table_name = 'system_config') AS system_config,
          count(*) FILTER (WHERE table_name = 'user_transactions') AS user_transactions,
          count(*) FILTER (WHERE table_name = 'withdrawals') AS withdrawals,
          count(*) FILTER (WHERE table_name = 'health_snapshots') AS health_snapshots
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      const coreReady = Object.values(rows[0]).every((value) => Number(value) > 0);

      if (!coreReady) {
        const { rows: tableState } = await client.query(`
          SELECT
            count(*) FILTER (WHERE table_name <> 'session') AS application_tables,
            count(*) FILTER (WHERE table_name = 'session') AS session_table
          FROM information_schema.tables
          WHERE table_schema = 'public'
        `);
        const state = tableState[0];
        if (Number(state.application_tables) === 0 && Number(state.session_table) === 1) {
          console.log("[bootstrap] Clearing the empty session table before first schema push...");
          await client.query("DROP TABLE IF EXISTS session");
        }

        console.log("[bootstrap] Initializing the database schema...");
        run("npx", ["--no-install", "drizzle-kit", "push", "--force"]);
      } else {
        console.log("[bootstrap] Database already initialized; skipping schema push.");
      }

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_withdrawals_one_pending_per_user
          ON withdrawals (user_id) WHERE status = 'pending';
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_withdrawals_one_approved_per_user
          ON withdrawals (user_id) WHERE status = 'approved';
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_transactions_source
          ON user_transactions (user_id, source_type, source_id)
          WHERE source_id IS NOT NULL;
      `);
    });
  } finally {
    await pool.end();
  }
}

function startServer() {
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    console.warn(
      "[bootstrap] SESSION_SECRET was missing; using a temporary value for this run.",
    );
  }

  const child = spawn(
    path.join(ROOT, "node_modules/.bin/tsx"),
    ["watch", "server/index.ts"],
    { stdio: "inherit", env: process.env },
  );

  const forwardSignal = (signal) => child.kill(signal);
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  child.once("exit", (code, signal) => {
    process.exit(signal ? 1 : code ?? 1);
  });
}

try {
  // Load .env first so the rest of the bootstrap sees DATABASE_URL,
  // SESSION_SECRET, etc. even when the platform does not inject them.
  loadDotEnv(path.join(ROOT, ".env"));
  ensureDependencies();
  await bootstrapDatabase();
  startServer();
} catch (error) {
  console.error(`[bootstrap] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}