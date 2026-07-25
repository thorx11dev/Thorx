# THORX

THORX is a full-stack rewards platform built with React, Vite, Express,
PostgreSQL, Drizzle ORM, and session-based authentication.

## Run on Replit

1. Ensure the Replit PostgreSQL database is attached and `SESSION_SECRET` is
   available as a secret.
2. Press Run or execute `npm run dev`.
3. The application serves through the Replit workflow on port `5000`.

The development bootstrap installs missing dependencies, initializes missing
database state, and starts the existing Express/Vite server. It does not
provision accounts or run destructive QA automatically.

## Checks

```bash
npm install
npm run check
npm test
npm run build
```

## Repository boundary

This repository contains deployable application code, tests, migrations,
configuration, and runtime assets only. Historical audits, prompts,
screenshots, and investigation artifacts are preserved separately in the
`thorx-docs-audits` repository.

See `replit.md` for Replit-specific architecture and environment notes.