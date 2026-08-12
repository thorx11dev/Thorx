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

## Deploy to Render (free tier)

THORX is a full-stack app: the Express API server (auth, database, WebSockets,
ad-network credits, background jobs) must run on an always-on Node host.
Freebuff/static hosting only serves the built frontend, which is why login
fails on a static-only domain — there is no `/api` server behind it.

`render.yaml` contains a blueprint that deploys the whole app (API + built
frontend) from the existing `Dockerfile`:

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect the `thorx11dev/Thorx` GitHub repository.
3. Render reads `render.yaml`; fill in the four secret env vars:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your Neon Postgres connection string (`postgresql://…neon.tech/…?sslmode=require`) |
   | `SESSION_SECRET` | `openssl rand -hex 32` output (any long random string) |
   | `CREDENTIAL_ENCRYPTION_KEY` | `openssl rand -hex 32` output |
   | `BOOTSTRAP_SECRET` | A random string guarding `/api/bootstrap-founder` |

4. **Apply** — Render builds the Docker image and starts the service.
5. Your app is live at `https://thorx-api.onrender.com` (name comes from
   `render.yaml`). Verify with `https://thorx-api.onrender.com/api/health`.

Notes:

- Render free tier **sleeps after ~15 min of inactivity** and wakes on the
  next request; the first request after sleep may take 30–60s.
- The Docker build forces an empty `VITE_API_URL`, so the served frontend
  calls the API on the same origin. No extra config needed.
- `https://thorx.freebuff.app` is already whitelisted for CORS + cross-site
  cookies, so the static frontend can log in against this API. After the
  Render service is live, set `VITE_API_URL=https://thorx-api.onrender.com`
  on the static build and redeploy.

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
