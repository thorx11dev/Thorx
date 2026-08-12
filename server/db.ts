import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Ensure explicit sslmode to suppress pg v8 deprecation warning about
// 'require' being treated as 'verify-full' in the current version.
const connectionString = process.env.DATABASE_URL;

// Only force TLS when the connection string explicitly requests it
// (sslmode=require / verify-ca / verify-full — e.g. Neon, Railway, Supabase).
// For plain Postgres (local dev, or a managed DB without SSL) leave `ssl`
// unset so pg's default "prefer" mode negotiates — falling back to a
// non-TLS connection instead of failing with "The server does not support
// SSL connections".
const sslMode = /(?:^|&)sslmode=([^&]+)/i.exec(connectionString)?.[1]?.toLowerCase();
const requiresSsl =
  sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full";

export const pool = new Pool({
  connectionString,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  // max: 8 keeps idle connections + client-side buffers small enough to fit
  // free-tier 256MB containers (Adaptable) — the app idles ~267MB RSS with
  // max:20 + sharp resident. 8 concurrent queries is plenty at MVP scale;
  // connect-pg-simple sessions share this pool.
  max: 8,
  idleTimeoutMillis: 30000,
  // Neon autosuspend wakes a paused compute on the first connection, which can
  // take 5-20s+ — a 5s timeout made the very first request after idle fail with
  // "Connection terminated due to connection timeout". 20s covers cold starts
  // while still surfacing genuinely dead endpoints quickly.
  connectionTimeoutMillis: 20000,
  // Lock-convoy / hang hardening (found 2026-08-09 deep E2E): an in-transaction
  // activity_feed insert self-blocked on its own guild row lock, hanging task
  // completions indefinitely. Bounded timeouts turn any residual lock wait or
  // runaway statement into a surfaced error instead of an infinite hang.
  statement_timeout: 15000,
  lock_timeout: 10000,
});
pool.on('error', (err: Error) => {
  // Use a direct stderr write here — importing the pino logger would create a
  // circular dependency (logger → db → logger). Pool errors are fatal-adjacent
  // so we want them in the process output regardless of logger state.
  process.stderr.write(`[DB] Unexpected pool error: ${err.message}\n`);
});
// Production-hardening: a checked-out client whose underlying socket dies (e.g.
// the server terminates the connection with idle-in-transaction timeout, code
// 25P03) emits an 'error' event on the Client itself. pool.on('error') does NOT
// catch those — without this listener the event becomes an uncaughtException and
// takes down the whole API process. Attach a per-client handler so connection
// drops are logged and the pool self-heals on the next query instead of crashing.
pool.on('connect', (client: any) => {
  client.on('error', (err: Error) => {
    process.stderr.write(`[DB] Pooled client connection error (self-healing): ${err.message}\n`);
  });
});
export const db = drizzle(pool, { schema });
