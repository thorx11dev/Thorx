#!/usr/bin/env bash
# ============================================================
# THORX – Replit setup script
# Run once after a fresh import to get the app ready.
# Usage:  bash scripts/setup-replit.sh
# ============================================================
set -euo pipefail

echo "=== [1/4] Installing npm dependencies ==="
npm install

echo ""
echo "=== [2/4] Preparing the fresh-import database state ==="
# Replit's built-in PostgreSQL exposes DATABASE_URL automatically.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Provision the Replit PostgreSQL database first."
  exit 1
fi

# connect-pg-simple can create this table before the first schema push. When it
# is the only table, it creates an ambiguous rename conflict in drizzle-kit.
application_table_count="$(psql "$DATABASE_URL" -Atqc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'session'")"
session_table_count="$(psql "$DATABASE_URL" -Atqc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session'")"
if [ "$application_table_count" = "0" ] && [ "$session_table_count" = "1" ]; then
  echo "Removing the empty connect-pg-simple session table so Drizzle can initialize cleanly."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS session'
fi

echo ""
echo "=== [3/4] Pushing database schema ==="
npx drizzle-kit push --force

echo ""
echo "=== [4/4] Applying critical ledger indexes and verifying connectivity ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0006_critical_partial_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT COUNT(*) AS users_rows FROM users"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next: start the app with  npm run dev"
echo ""
echo "To provision the first founder account (one-time, only works before any team"
echo "members exist), POST to /api/bootstrap-founder with your chosen credentials."
echo "See SETUP_NEW_ACCOUNT.md for the full provisioning walkthrough."
