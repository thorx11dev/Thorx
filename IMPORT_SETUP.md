# Fast Replit Import

This project is designed so a new Replit import needs only the **Run** button.

## What happens automatically

`npm run dev` runs `scripts/bootstrap-dev.mjs` before the app:

1. Installs npm packages only when `node_modules` is incomplete.
2. Checks a few core database tables instead of running a migration every time.
3. Removes only an empty `session` table when it blocks the first Drizzle push.
4. Creates the schema and critical ledger indexes on a fresh database.
5. Starts the existing Express/Vite server on port 5000.

On an already initialized import, the database push is skipped. This keeps
startup fast and avoids repeated quota-heavy checks.

## Optional operations

These are intentionally not automatic:

```bash
# Provision or update a founder account.
# Credentials must be supplied explicitly and are never stored in the repo.
FOUNDER_EMAIL=... FOUNDER_PASSWORD=... npm run setup:founder

# Run the auth regression suite when the agent or user explicitly requests it.
npm run verify:auth
```

The agent should ask before running either optional operation. A founder
password must never be invented, printed, or committed.

## Replit-level requirement

The Replit account must have its managed PostgreSQL database available so
`DATABASE_URL` is injected. If it is absent, the bootstrap exits with a clear
message instead of producing a cascade of unrelated server errors. The
project keeps `postgresql-16` in `.replit` for Drizzle CLI support.