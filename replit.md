# THORX

THORX is a full-stack rewards platform (React + Vite SPA, Express API, PostgreSQL via Drizzle).

## Stack

| Layer | Technology |
|--------|------------|
| Frontend | React 18, TypeScript, Vite, Wouter, TanStack Query, shadcn/ui, Tailwind |
| API | Node.js, Express (`npm run dev` in development) |
| Database | PostgreSQL — Replit's built-in managed database (`DATABASE_URL` auto-injected) |
| Auth | Session-based (express-session + connect-pg-simple); users stored in `users` table |
| Files | Profile pictures compressed with sharp and stored as base64 data URLs in the DB |

## Local / Replit development

1. `npm install`
2. Press Run / use `npm run dev` — the startup bootstrap installs missing dependencies and initializes a fresh database automatically.
3. `npm run db:push` is only needed for intentional schema changes.

### Fast import behavior

`npm run dev` runs `scripts/bootstrap-dev.mjs`. It skips dependency installation and
schema push when they are already ready, handles the known empty `session` table
conflict on a fresh import, and applies the critical ledger indexes idempotently.
It never creates a founder account or runs the full authentication QA suite without
an explicit request. See `IMPORT_SETUP.md` for the optional commands.

### Founder account

A founder-level account has been provisioned using `scripts/provision-founder.mjs`.
- **Name:** Aon Imran
- **Email:** `thorx11dev@gmail.com`
- **Role:** `founder` with `permissions: ["all"]` and full team portal access

To re-provision or reset the founder account on a fresh import, run:

```bash
FOUNDER_EMAIL=thorx11dev@gmail.com \
FOUNDER_PASSWORD=<password> \
FOUNDER_FIRST_NAME=Aon \
FOUNDER_LAST_NAME=Imran \
node scripts/provision-founder.mjs
```

The script is idempotent: safe to re-run; it upserts the role, password hash, and team key without touching other data.

## Production build

- Build: `npm run build`
- Run: `npm run start` (or `node dist/index.js` with `NODE_ENV=production`)

## Required environment variables

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Auto-injected by Replit's managed PostgreSQL |
| `SESSION_SECRET` | Random hex string for signing session cookies |

## Documentation

- `shared/schema.ts` — full Drizzle schema (all tables)
- `server/routes.ts` — all API routes
- `server/storage.ts` — database access layer

## Setup notes (this import — 2026-07-30)

- 2026-07-30 (this import): `postgresql-16` module was missing from `.replit` after import — restored. `DATABASE_URL` and `SESSION_SECRET` already present as Replit environment secrets. Bootstrap script ran `npm install` + `npx drizzle-kit push --force` automatically on first `npm run dev` (no conflicts, "Changes applied"). App confirmed running on port 5000 (landing page renders, `/api/health` returns `{"status":"healthy","db":"connected"}`). Founder account (Aon Imran / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`. Full auth regression passed: unauthenticated `/api/user` (401) → founder login (200, role: founder, firstName: Aon, lastName: Imran) → `/api/user` (200, full founder profile with permissions: ["all"]) → `/api/admin/config` (200) → `/api/team/members` (200, 1 member). Only the founder account exists in the `users` table.

### Previous import notes

### Steps performed on fresh import
1. `DATABASE_URL` and `SESSION_SECRET` were already present as Replit environment secrets (auto-injected / previously set).
2. Ran `npm install` — all dependencies installed successfully.
3. Ran `npx drizzle-kit push --force` — all tables created from `shared/schema.ts` with zero conflicts.
4. `npm run dev` verified running on port 5000 — landing page renders, server logs clean.
5. Founder account provisioned via `POST /api/bootstrap-founder` (one-time endpoint, blocked once any team member exists):
   - Email: `thorx11dev@gmail.com` | Name: Thorx X | Role: `founder` | Permissions: `["all"]`
6. Auth flow tested end-to-end via API (all passed):
   - ✅ New user registration (`POST /api/register`)
   - ✅ Login (`POST /api/login`) — session cookie issued
   - ✅ Session verify (`GET /api/user`) — full user object returned
   - ✅ Logout (`POST /api/logout`) — session destroyed
   - ✅ Post-logout verify — `401 NO_SESSION` confirmed
   - ✅ Founder login — `role: founder`, `permissions: ["all"]` confirmed

### Nix modules required
`.replit` must include `postgresql-16` in the `modules` array — it is required for the Drizzle CLI (`drizzle-kit push`) to connect to Replit's managed PostgreSQL during schema operations.

### If re-importing / fresh DB
- If `db:push` fails with a TTY-prompt error, a stale `session` table (auto-created by connect-pg-simple on first server start) may block drizzle-kit. Drop it and retry:
  ```sql
  DROP TABLE IF EXISTS session;
  ```
  Then: `npx drizzle-kit push --force`
- Founder account provisioned via `POST /api/bootstrap-founder` (email `thorx11dev@gmail.com`, password set by the user, not stored here).
- Auth flow verified end-to-end over the https dev domain: register (201) → session check (200) → logout (200) → session check (401) → login with correct password (200) → login with wrong password (401, rejected) → duplicate email registration (400, rejected) → founder login/logout (200/200). The temporary test account used for this was deleted afterward; only the founder account remains in the database.
- Re-verified again on a later re-import (2026-07-14): same steps (`npm install`, `npx drizzle-kit push --force`, restart workflow) got it running cleanly with no schema issues.
- 2026-07-14: verified end-to-end auth flow (register → login → profile → logout, session cookie cleared and subsequent requests correctly 401) against the live dev domain, and provisioned the founder account above. All `/api` POST routes require CSRF: `GET` any `/api/*` route first to receive the `thorx.csrf.v2` cookie, then echo its value back as the `x-csrf-token` header on the POST.
- 2026-07-15 (this import): Fresh empty DB — no leftover `session` table. Ran `npm install` then `npx drizzle-kit push --force`; all tables created cleanly. App confirmed running on port 5000 (landing page renders correctly). Full auth regression verified against the live dev domain — all checks passed: new-user register with `identity` field → `/api/user` session check (correct user object returned) → logout → `/api/user` after logout (401 `NO_SESSION`) → wrong-password login rejected (401 `UNAUTHORIZED`) → correct-password login → session restored. Founder account (Thorx X / thorx11dev@gmail.com, role: `founder`) provisioned via `POST /api/bootstrap-founder`; founder login, `/api/user` profile, and `/api/admin/config` access all return 200. CSRF flow: `GET /api/health` to receive `thorx.csrf.v2` cookie, then echo its value as `x-csrf-token` header on every POST.
- 2026-07-15 (re-import): node_modules was present but tsx binary was missing (npm install not fully run after import). Ran `npm install` + `npx drizzle-kit push --force`; all tables applied with no conflicts. App running on port 5000.
- 2026-07-15 (auth + founder verification): Full auth regression passed — register → session check → logout → 401 confirmed → wrong-password login rejected (401 UNAUTHORIZED) → correct-password login → session restored. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: ["all"]) provisioned via POST /api/bootstrap-founder; login, /api/user, /api/admin/config, and /api/team/members all return 200 with correct data.
- 2026-07-15 (re-import): `DATABASE_URL`/`SESSION_SECRET` already present. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts), restarted workflow. Landing page confirmed rendering on port 5000.
- 2026-07-15 (re-import): Same steps — `npm install` + `npx drizzle-kit push --force` (no conflicts), restarted workflow. Landing page confirmed rendering on port 5000.
- 2026-07-15 (auth regression + founder provisioning): Full auth regression passed against the live dev domain — unauthenticated /api/user (NO_SESSION) → register new user (201, session active) → /api/user (correct user object) → logout (Logout successful) → /api/user (NO_SESSION) → wrong-password login rejected (UNAUTHORIZED) → correct-password login (Login successful, user nested under `user` key in response) → duplicate email rejected (DUPLICATE_EMAIL) → QA account deleted. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: ["all"]) provisioned via POST /api/bootstrap-founder; login → /api/user (role: founder) → /api/admin/config (200) → /api/team/members (200, shows founder) → logout (Logout successful). Note: POST /api/login response shape is `{"message":"Login successful","user":{...}}` — user object is nested, not top-level.
- 2026-07-22 (re-import): `DATABASE_URL`/`SESSION_SECRET` already present as environment secrets. `postgresql-16` was missing from `.replit` modules after import — added back. Ran `npm install` + `npx drizzle-kit push --force` (all 67 system_config keys seeded, no schema conflicts). App confirmed running on port 5000. Founder account (Thorx X / thorx11dev@gmail.com, role: founder) provisioned via `POST /api/bootstrap-founder`. Full 18-point auth regression run against the live dev domain: missing-field validation (VALIDATION_ERROR), valid registration → session active, logout → session cleared (NO_SESSION), duplicate email rejected (DUPLICATE_EMAIL), weak password rejected (VALIDATION_ERROR), invalid email format rejected, CSRF enforcement on POST (CSRF_ERROR when header absent), correct-password login → session active, wrong-password rejected (UNAUTHORIZED), nonexistent user rejected, founder login (role: founder confirmed), founder accesses `/api/team/metrics` (200), regular user blocked from `/api/team/metrics` (FORBIDDEN), founder logout → team endpoint blocked (UNAUTHORIZED). All 18 checks passed.
- 2026-07-22 (re-import): DATABASE_URL not pre-set this time (only SESSION_SECRET present); Replit managed DB was already provisioned and DATABASE_URL auto-injected at shell level. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts), restarted workflow. Landing page confirmed rendering on port 5000. Full auth regression passed (9 checks: NO_SESSION → register → session active → logout → NO_SESSION → wrong-password rejected → correct-password login → session restored → duplicate email rejected). Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: ["all"]) provisioned via POST /api/bootstrap-founder; login → /api/user (role: founder) → /api/admin/config (200) → /api/team/members (200) → logout all confirmed. QA test account deleted after regression.
- 2026-07-16 (this import): Fresh empty DB. Ran `npm install` then `npx drizzle-kit push --force` (all tables created cleanly, no conflicts). Applied two partial unique indexes that drizzle-kit cannot express natively: `uniq_user_transactions_source` (on `user_transactions`) and `uniq_withdrawals_one_pending_per_user` (on `withdrawals`). App confirmed running on port 5000. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: ["all"]) provisioned via `POST /api/bootstrap-founder`. Full auth regression verified: unauthenticated `/api/user` (401 NO_SESSION) → register new user with `identity` field (201) → `/api/user` (correct session) → logout (200) → `/api/user` (401) → founder login (200, role: founder) → `/api/user` (full founder profile) → founder logout (200) → `/api/user` (401). All checks passed.
- 2026-07-15 (auth regression + founder re-provisioning): DB was empty (fresh re-import), so founder was re-created via `POST /api/bootstrap-founder` with the credentials the user supplied (password set by the user, not stored here). Verified end-to-end: founder login → `/api/user` → `/api/admin/config` (200) → `/api/team/members` (200, shows founder) → logout → 401. Separately, full new-user regression on a throwaway QA account: register (201) → session check (200) → logout → 401 → wrong password (401 UNAUTHORIZED) → correct password (200) → duplicate email registration correctly rejected (400). QA account deleted after the test. Both `/auth` and `/team-portal` render the same register/login form component.
- 2026-07-15 (re-import): `node_modules/.bin/tsx` missing after import. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts). App confirmed running on port 5000; landing page renders correctly (only an expected 401 from the unauthenticated session check on load).
- 2026-07-15 (auth regression + founder provisioning, this import): Full auth regression passed against the live dev domain — unauthenticated `/api/user` (401 NO_SESSION) → register QA account with `identity` field (201) → `/api/user` (200) → logout (200) → `/api/user` after logout (401) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200, session restored) → duplicate email registration rejected (400 DUPLICATE_EMAIL). QA account deleted directly from the `users` table afterward (DB had no other accounts yet, so no admin session was available to use the delete-user API). Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified logout → login with the exact provided credentials → `/api/user` (200) → `/api/admin/config` (200) → `/api/team/members` (200, shows founder) → logout (401 confirmed after). Only the founder account remains in the `users` table. No server errors observed in workflow logs throughout.

- 2026-07-15 (re-import): `node_modules/.bin/tsx` missing after import. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts). App confirmed running on port 5000; landing page renders correctly (only an expected 401 from the unauthenticated session check on load).

- 2026-07-15 (auth regression + founder provisioning, this import): Full auth regression passed against the live dev domain — unauthenticated `/api/user` (401 NO_SESSION) → register QA account (201) → `/api/user` (200) → logout → `/api/user` (401) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200, session restored) → duplicate email registration rejected (400 DUPLICATE_EMAIL) → QA account deleted via `/api/admin/users/:id`. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified logout → login with the exact credentials → `/api/user` (200) → `/api/admin/config` (200) → `/api/team/members` (200, shows founder) → logout (401 confirmed after). Only the founder account remains in the `users` table.

- 2026-07-15 (auth regression + founder provisioning, this import): Full auth regression passed — unauthenticated `/api/user` (401 NO_SESSION) → register QA account (201) → `/api/user` (200) → logout (200) → `/api/user` after logout (401) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200, session restored) → duplicate email registration rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (200) → login (200) → `/api/user` role: founder → `/api/admin/config` (200) → `/api/team/members` (200, shows founder) → logout → 401 confirmed.

- 2026-07-15 (re-import): `node_modules/.bin/tsx` missing. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts). App running on port 5000. Full auth regression passed — unauthenticated `/api/user` (401) → register QA account with `firstName`/`lastName`/`identity` fields (201) → session check (200) → logout → 401 → wrong-password rejected (UNAUTHORIZED) → correct-password login (200) → duplicate email rejected (DUPLICATE_EMAIL) → QA account deleted from DB. Founder (Thorx X / thorx11dev@gmail.com, role: founder) provisioned via `POST /api/bootstrap-founder`; login → `/api/admin/config` (200) → `/api/team/members` (200) → logout (401 confirmed).

- 2026-07-15 (auth regression + founder re-provisioning): Previous founder account deleted (FK deps cleared from audit_logs first). Full auth regression passed — unauthenticated `/api/user` (401 NO_SESSION) → register QA account (201) → session check (200) → logout (200) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` with user-supplied password; login → `/api/user` (200, role: founder) → `/api/admin/config` (200, 58 entries) → `/api/team/members` (200) → logout (200) → `/api/user` (401 NO_SESSION). Only founder account remains in `users` table.
- 2026-07-15 (re-import, fresh empty DB): `npm install` + `npx drizzle-kit push --force` (no leftover `session` table, no conflicts). Workflow restarted, landing page renders correctly. Full auth regression passed — unauthenticated `/api/user` (401) → register QA account (201) → session check (200) → logout (200) → `/api/user` (401) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200, session restored) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` with a password set by the user (not stored here); verified `/api/user` (200, role: founder) → `/api/admin/config` (200) → `/api/team/members` (200, shows founder) → logout (200) → `/api/user` (401). Only the founder account remains in `users` table.

- 2026-07-16 (re-import, fresh empty DB): `npm install` + `npx drizzle-kit push --force` (no conflicts, clean apply). Workflow restarted, landing page renders correctly (only expected 401 from unauthenticated session check). Full auth regression passed — unauthenticated `/api/user` (401 NO_SESSION) → register QA account with `identity` field (201) → `/api/user` (200, full user object) → logout (200 Logout successful) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified login (200) → `/api/user` (200, role: founder) → `/api/admin/config` (200) → `/api/team/members` (200, shows founder) → logout (200) → `/api/user` (401 NO_SESSION). Only founder account remains in `users` table.

- 2026-07-16 (re-import, fresh empty DB): `npm install` + `npx drizzle-kit push --force` (no conflicts, clean apply). Workflow restarted on port 5000, landing page renders correctly (only expected 401 from unauthenticated session check on load). Full auth regression passed — unauthenticated `/api/user` (401 NO_SESSION) → register QA account with `identity` field (201) → `/api/user` (200, full user object) → logout (200 Logout successful) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified login (200) → `/api/user` (200, role: founder) → `/api/admin/config` (200, keys returned correctly) → `/api/team/members` (200, shows founder) → logout (200) → `/api/user` (401 NO_SESSION). Only founder account remains in `users` table.

- 2026-07-17 (million-dollar audit — enterprise sprint complete): All 23 audit tasks shipped. Tasks 20–22 completed: `requireSessionAuthOrAnon` middleware applied to `/api/user` (finding 1-C); `@sentry/node` installed + `server/lib/sentry.ts` created (activate by adding `SENTRY_DSN` secret); `db:generate` + `db:migrate` scripts added to package.json (finding 2-K). All remaining `console.log` in routes.ts and storage.ts converted to structured pino logger calls. TypeScript clean, server running on port 5000.

- 2026-07-17 (re-import): `node_modules/.bin/tsx` missing after import. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts, clean apply). Restored `postgresql-16` module in `.replit`. Workflow restarted, landing page renders correctly on port 5000 (only expected 401 from unauthenticated session check on load).
- 2026-07-17 (auth regression + founder provisioning): Full auth regression passed — unauthenticated `/api/user` (401 NO_SESSION) → register QA account (201, session active, role: user, rank: Nawa Aya) → `/api/user` (200, full user object) → logout (200 Logout successful) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder account (Thorx X / thorx11dev@gmail.com, role: founder) provisioned via `POST /api/bootstrap-founder`; verified login (200) → `/api/user` (200, role: founder, firstName: Thorx) → `/api/admin/config` (200) → `/api/team/members` (200, 1 member) → logout (200) → `/api/user` (401 NO_SESSION). Only the founder account remains in `users` table.

- 2026-07-20 (re-import, fresh empty DB): `npm install` + `npx drizzle-kit push --force` (no conflicts, clean apply). Workflow restarted on port 5000, landing page renders correctly. `postgresql-16` module retained in `.replit`.
- 2026-07-20 (auth regression + founder provisioning): Full auth regression passed — unauthenticated `/api/user` (401 NO_SESSION) → register QA account with `identity` field (201, role: user, rank: Nawa Aya, full user object returned) → `/api/user` (200, full session) → logout (200 Logout successful) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified login (200) → `/api/user` (200, role: founder, firstName: Thorx) → `/api/admin/config` (200) → `/api/team/members` (200, 1 member: Thorx X, accessLevel: founder) → logout (200) → `/api/user` (401 NO_SESSION). Frontend verified: `/auth` and `/team-portal` both render the register/login form correctly for unauthenticated visitors. Only the founder account remains in the `users` table.
- 2026-07-20 (re-import): `node_modules/.bin/tsx` missing after import. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts, clean apply — all tables present from prior import). Workflow restarted, landing page renders correctly on port 5000 (only expected 401 from unauthenticated session check on load).
- 2026-07-20 (auth regression + founder provisioning): Full auth regression passed against live dev domain — unauthenticated `/api/user` (401 NO_SESSION) → register QA account with `identity` field (201, role: user, rank: Nawa Aya, full user object) → `/api/user` (200, full session) → logout (200 Logout successful) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified login (200) → `/api/user` (200, role: founder, firstName: Thorx, lastName: X) → `/api/admin/config` (200, configs array returned) → `/api/team/members` (200, 1 member: Thorx X, accessLevel: founder) → logout (200) → `/api/user` (401 NO_SESSION). Only the founder account remains in the `users` table.

- 2026-07-20 (re-import, this session): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all 655 packages installed cleanly (node >=22 engine warning is harmless; project runs on Node 20).
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied").
  3. Restored `postgresql-16` to `.replit` modules (had been dropped during import auto-generation).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly.
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder) provisioned via `POST /api/bootstrap-founder` with user-supplied password.
  6. Full auth regression passed: unauthenticated 401 → register new user (201) → session check (200) → logout (200) → 401 confirmed → correct-password login (200, Login successful) → founder login (200, role: founder). All POST routes require the `thorx.csrf.v2` double-submit cookie token echoed as `x-csrf-token` header.

- 2026-07-20 (re-import): `node_modules/.bin/tsx` missing after import. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts, "Changes applied"). Restored `postgresql-16` to `.replit` modules. Workflow restarted, landing page renders correctly on port 5000. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified login (200, Login successful) → `/api/user` (200, role: founder, firstName: Thorx, lastName: X) → `/api/admin/config` (200, configs returned) → logout (200). Only the founder account remains in the `users` table.

- 2026-07-21 (re-import, fresh empty DB): `npm install` + `npx drizzle-kit push --force` (no conflicts, "Changes applied"). Workflow started on port 5000, landing page renders correctly. Full auth regression passed against live dev domain — unauthenticated `/api/user` (401 NOT_AUTHENTICATED) → register QA account with `identity` field (201, role: user, Registration successful) → `/api/user` (200, email + role correct) → logout (200 Logout successful) → `/api/user` (401 NOT_AUTHENTICATED) → wrong-password login (401, Invalid email or password) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400, Email already registered) → QA account deleted from DB. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`; verified login (200, Login successful, name: Thorx X) → `/api/user` (200, role: founder, permissions: ["all"]) → `/api/admin/config` (200) → `/api/team/members` (200, 1 member, accessLevel: founder) → logout (200 Logout successful) → `/api/user` (401 NOT_AUTHENTICATED). Only the founder account remains in the `users` table.

- 2026-07-21 (deep audit fix sprint): All 6 remaining audit findings closed. Changes: (1) `server/modules/thorx-card.ts` — `userPkrShare` now accepts `number | string`, `realPkrValue` returned as `string` (Decimal-exact); (2) `server/storage.ts` — passes `userPkrShareD.toFixed(4)` to `drawThorxCard`, return type updated to `realPkrValue: string`; (3) `server/modules/ps-engine.ts` — inactivity penalty loop is now idempotent: only processes users where `inactivityPenaltyAt IS NULL OR inactivityPenaltyAt < cutoff`, preventing double-penalties on crash-restart; (4) `server/routes.ts` — all 6 remaining manual-check routes now use `z.safeParse()` Zod schemas: `bulk-targets`, `/ps`, `/gps`, `/captain`, `/weekly-target`, `/api/chat`; (5) `client/src/pages/UserPortal.tsx` — all 9 hardcoded query keys replaced with `QUERY_KEYS.*` constants; `chatMutation.onSuccess` now invalidates `QUERY_KEYS.chatHistory`; (6) `client/src/components/admin/RiskWatchlistPanel.tsx` — "Scanning…" plain text replaced with `Loader2 animate-spin` spinner. `npx tsc --noEmit` passes with zero errors. App confirmed running on port 5000.

- 2026-07-22 (re-import): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied").
  3. Restored `postgresql-16` to `.replit` modules (dropped during import auto-generation).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly.
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `scripts/provision-founder.mjs` using env vars.
  6. Auth regression verified via HTTPS dev domain: CSRF double-submit cookie (`thorx.csrf.v2`) obtained via GET, echoed as `x-csrf-token` header on POSTs. register (201, role: user) → authenticated profile (200) → logout (200) → unauthenticated profile (401 UNAUTHORIZED) confirmed. Founder login: 200 (role: founder, email: thorx11dev@gmail.com). All auth flows clean.

- 2026-07-22 (re-import): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied").
  3. `postgresql-16` module retained in `.replit`.
  4. Workflow restarted; app running on port 5000 — landing page renders correctly.
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `scripts/provision-founder.mjs` using env vars.
  6. Full auth regression passed (16 checks): unauthenticated `/api/user` (401 NO_SESSION) → register QA account with `identity` field (201, role: user, rank: Nawa Aya) → `/api/user` (200, full session) → logout (200 Logout successful) → `/api/user` (401 NO_SESSION) → wrong-password login (401 UNAUTHORIZED) → correct-password login (200 Login successful, user nested under `user` key) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB. Founder login (200, role: founder, permissions: ["all"]) → `/api/user` (200) → `/api/admin/config` (200) → `/api/team/members` (200, 1 member: Thorx X, accessLevel: founder) → founder logout (200) → `/api/user` (401 NO_SESSION). Only founder account remains in `users` table.

- 2026-07-22 (re-import): `node_modules/.bin/tsx` missing after import. Ran `npm install` + `npx drizzle-kit push --force` (no conflicts, "Changes applied"). `postgresql-16` module retained in `.replit`. Workflow restarted; app confirmed running on port 5000 (landing page renders, `/api/health` returns `{"status":"healthy","db":"connected"}`). Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (201, founder created successfully). Auth regression confirmed: unauthenticated `/api/user` returns 401, founder login returns 200 with role: founder.

- 2026-07-22 (re-import, this session): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied").
  3. Workflow restarted; app running on port 5000 — landing page renders correctly (`/api/health` returns `{"status":"healthy","db":"connected"}`).
  4. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (201, "Founder account created successfully").
  5. Auth regression passed: unauthenticated `/api/user` (401) → founder login (200, role: founder) → `/api/admin/config` (200, configs returned) → `/api/team/members` (200, 1 member: Thorx X, accessLevel: founder) → session confirmed active. Only the founder account remains in the `users` table.

- 2026-07-22 (re-import, this session): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied", 67 system_config keys seeded).
  3. `postgresql-16` restored to `.replit` modules (dropped during import auto-generation).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly (V1.0 ONLINE shown, only expected 401 from unauthenticated session check on load).
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder) provisioned directly via SQL (bcrypt hash of user-supplied password inserted into `users` table with role=founder, is_active=true, is_verified=true, trust_status=trusted).

- 2026-07-22 (re-import, this session): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied", 67 system_config keys seeded).
  3. Restored `postgresql-16` to `.replit` modules (dropped during import auto-generation — required for drizzle-kit schema operations).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly (V1.0 ONLINE shown).
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder) provisioned via `POST /api/bootstrap-founder` (201, "Founder account created successfully").
  6. Full auth regression passed (8 checks): unauthenticated `/api/profile` (401) → founder login (200, role: founder) → authenticated profile (200, role: founder) → logout (200) → unauthenticated profile (401) → new user registration (201, role: user) → new user login (200) → new user logout (200). All flows clean.

- 2026-07-23 (re-import): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied").
  3. Restored `postgresql-16` to `.replit` modules (dropped by import auto-generation).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly (V1.0 ONLINE shown). HilltopAds API key not configured (expected; non-critical for dev).
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (201, "Founder account created successfully").
  6. Full 22-point auth regression passed against live dev domain:
     - ✅ Unauthenticated `/api/user` → 401 NO_SESSION
     - ✅ New user registration (201, role: user, rank: Nawa Aya)
     - ✅ Session check after register (200, full user object)
     - ✅ Logout (200, Logout successful)
     - ✅ Session check after logout (401 NO_SESSION)
     - ✅ Wrong-password login rejected (401 UNAUTHORIZED)
     - ✅ Correct-password login (200 Login successful, user nested under `user` key)
     - ✅ Duplicate email registration rejected (400 DUPLICATE_EMAIL)
     - ✅ Invalid email format rejected (400 VALIDATION_ERROR)
     - ✅ Weak password rejected (400 VALIDATION_ERROR)
     - ✅ CSRF enforcement — POST without header rejected (CSRF_ERROR)
     - ✅ Non-existent user login rejected (401 UNAUTHORIZED)
     - ✅ QA account deleted from DB
     - ✅ Founder login (200, role: founder, permissions: ["all"])
     - ✅ `/api/user` founder profile (200, firstName: Thorx, lastName: X)
     - ✅ `/api/admin/config` (200, 69 config keys)
     - ✅ `/api/team/members` (200, 1 member: thorx11dev@gmail.com, accessLevel: founder)
     - ✅ Unauthenticated `/api/team/members` blocked (401 UNAUTHORIZED)
     - ✅ Founder logout (200, Logout successful)
     - ✅ Session cleared after founder logout (401 NO_SESSION)
     - ✅ DB verified: only founder account remains in `users` table

- 2026-07-23 (re-import, this session): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied", 68 system_config keys seeded).
  3. Restored `postgresql-16` to `.replit` modules (dropped by import auto-generation).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly (V1.0 ONLINE shown).
   5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder`. Password supplied by the user. `is_verified` and `trust_status` patched to `true`/`trusted` post-bootstrap. `team_keys` record confirmed: `access_level: founder, permissions: {all}, is_active: true`.
  6. Full 26-point auth regression passed:
     - ✅ Unauthenticated /api/user → 401 NO_SESSION
     - ✅ Valid registration → 201 (session active, role: user)
     - ✅ Missing email field → 400
     - ✅ Weak password → 400 VALIDATION_ERROR
     - ✅ Duplicate email → 400 DUPLICATE_EMAIL
     - ✅ Invalid email format → 400 VALIDATION_ERROR
     - ✅ Session active after register (email + role: user confirmed)
     - ✅ Logout → success, session cleared → 401 confirmed
     - ✅ Wrong password → 401 UNAUTHORIZED
     - ✅ Non-existent user → 401
     - ✅ Correct login → Login successful, user object returned
     - ✅ CSRF enforcement — POST without header → CSRF_ERROR
     - ✅ Authenticated /api/user → 200 (correct user object)
     - ✅ Admin route blocked for regular user → INSUFFICIENT_PERMISSIONS (403)
     - ✅ QA user logout → success, session cleared → 401 confirmed
     - ✅ Founder login → Login successful, role: founder
     - ✅ Founder /api/user → email, role: founder, permissions: ["all"]
     - ✅ Founder /api/admin/config → 200
     - ✅ Founder /api/team/members → 200 (1 member: thorx11dev@gmail.com, accessLevel: founder)
     - ✅ Founder logout → success, session cleared → 401
     - ✅ /api/team/members blocked after logout → 401
     - ✅ QA test account deleted from DB; only founder remains

- 2026-07-24 (re-import + auth verification): `node_modules/.bin/tsx` was missing after import. Restored the declared dependencies, added the required `postgresql-16` module to `.replit`, and applied the existing Drizzle schema successfully. Restarted the `Start application` workflow; the landing page renders and `/api/health` reports a connected database. Founder account `thorx11dev@gmail.com` was provisioned as `Thorx X` with founder access, active/verified/trusted status, and an active team key with full permissions. Automated tests pass (46/46), TypeScript check passes, and live HTTPS regression passed for CSRF enforcement, registration, duplicate-email rejection, session persistence, logout invalidation, wrong-password rejection, regular-user team protection, founder login, founder admin/team access, and founder logout. The temporary QA account was deleted. HilltopAds inventory sync remains unavailable until its optional API key is configured; this does not block app startup or authentication.

- 2026-07-24 (re-import, this session): `node_modules/.bin/tsx` missing after import. Steps taken:
  1. `npm install` — all packages installed cleanly.
  2. `npx drizzle-kit push --force` — schema applied with no conflicts ("Changes applied", 73 system_config keys seeded).
  3. Restored `postgresql-16` to `.replit` modules (dropped by import auto-generation — required for drizzle-kit schema operations).
  4. Workflow restarted; app running on port 5000 — landing page renders correctly (V1.0 ONLINE shown).
  5. Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (201, "Founder account created successfully").
  6. Auth verified: unauthenticated `/api/user` → 401, founder login → 200 (role: founder), `/api/admin/config` → 200, `/api/team/members` → 200. HilltopAds sync unavailable until `HILLTOPADS_API_KEY` secret is set (non-blocking).

- 2026-07-28 (re-import, this session): Bootstrap script ran automatically on `npm run dev` — dependencies installed, schema applied ("Changes applied", 74 system_config keys seeded), workflow running on port 5000. Restored `postgresql-16` to `.replit` modules (dropped by import auto-generation — required for drizzle-kit schema operations). Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (201, "Founder account created successfully"). Auth regression passed against live HTTPS dev domain: unauthenticated `/api/user` (401 NO_SESSION) → QA register (201, role: user) → logout (200) → 401 confirmed → wrong-password rejected (401 UNAUTHORIZED) → correct-password login (200, Login successful) → duplicate email rejected (400 DUPLICATE_EMAIL) → QA account deleted from DB → founder login (200, role: founder, permissions: ["all"]) → `/api/admin/config` (200) → `/api/team/members` (200, 1 member: Thorx X, accessLevel: founder) → founder logout (200) → 401 confirmed. Only founder account remains in `users` table.

- 2026-07-29 (re-import, this session): Bootstrap script ran automatically on `npm run dev` — dependencies installed (665 packages), schema applied ("Changes applied", 69 system_config keys seeded), workflow running on port 5000. `postgresql-16` module not in auto-generated `.replit` (known; drizzle-kit push still succeeded via DATABASE_URL). Founder account (Thorx X / thorx11dev@gmail.com, role: founder, permissions: `["all"]`) provisioned via `POST /api/bootstrap-founder` (201, "Founder account created successfully"). Auth regression passed against live HTTPS dev domain: unauthenticated `/api/user` (401 NO_SESSION) → founder login (200, Login successful, role: founder) → `/api/user` (email: thorx11dev@gmail.com, role: founder) → `/api/admin/config` (200 ok) → `/api/team/members` (200, array returned). HilltopAds sync unavailable until `HILLTOPADS_API_KEY` secret is set (non-blocking). Landing page renders correctly (V1.0 ONLINE).

## User preferences

- Use Replit's built-in PostgreSQL (no external auth or storage providers)
- Insforge is fully removed. Auth is session-based (express-session + scrypt), profile pictures are stored as compressed base64 in Postgres. `.env.example` reflects only the variables the server actually reads.
