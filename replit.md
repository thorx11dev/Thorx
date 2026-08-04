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

## Setup notes (2026-08-04) — Phase 3 User Portal: Help/Support section redesign

- Completed the Help section (`renderHelpSection()` in `client/src/pages/UserPortal.tsx`) redesign to match the premium ivory/black/orange editorial system established on the landing page. Hero toggle: replaced the old heavy `wireframe-border` (4px black border + orange halo) with a refined `border-2` that lets the existing Framer Motion black/white toggle animation carry the visual weight. Tabs: added `data-[state=inactive]:hover:bg-black/5` hover feedback. Contact tab: standardized the description field on the shared `Textarea` UI component (was a raw `<textarea>`) so its focus ring matches the `Input` fields above it. All three sub-tabs (Guide/FAQ, Help/Chat, Contact) now share the same `rounded-2xl` / `border-black/15` hairline / `TechnicalLabel` language used sitewide. Chat-bubble avatar badges were considered and deliberately skipped — sender is already unambiguous via bubble alignment + color, and badges would crowd the 85%-width mobile bubbles.
- Found and fully removed a leftover dev-only visual-QA harness from an earlier session that ran out of credits mid-revert: `TEMP-VISUAL-QA` mock-session/deep-link branches in `client/src/hooks/useAuth.ts` and `client/src/pages/UserPortal.tsx` (gated behind `import.meta.env.DEV` + `?__vqa=1`, client-side only, no real backend/session access), plus a temporary `client/public/__vqa-frame.html` test file. Confirmed fully gone: `grep` clean, `tsc --noEmit` clean, production `npm run build` clean, and `/?__vqa=1` falls through to the normal logged-out landing page after a workflow restart. A stray root-level `_qa_screenshot_tmp.mjs` Puppeteer script from a separate earlier QA session (unreferenced anywhere) was also removed.
- Verified at desktop (1280px), tablet (768px), and mobile (390px) across all three Help tabs — no overflow, clipping, or unreadable text; tab labels correctly swap between short (mobile) and full (desktop) forms.

## Setup notes (2026-08-04) — Phase 3 User Portal: profile modal redesign

- Replaced the single "Username" field in the account profile modal (`client/src/components/ui/profile-modal.tsx`) with required, independently-validated **First Name** / **Last Name** inputs (min 2 chars each, trimmed). The server already accepted `firstName`/`lastName` on `PATCH /api/profile`, so no API changes were needed. Confirmed via live save that values persist and redisplay correctly. (The separate guild-scoped "Guild Username" field in `GuildProfileWizard.tsx` is a distinct concept — teammate-facing handle, not the account's real name — and was intentionally left untouched.)
- Replaced the old 15 rank-specific avatars (5 ranks × 3 each, stored per-`RankDefinition`) with 6 universal avatars shared across all ranks (`client/src/lib/rankAvatars.ts` → `UNIVERSAL_AVATARS`), reusing pre-existing portrait art already sitting unused in `client/public/avatars/`. Avatars are now decoupled from rank — rank definitions carry only badge metadata (label/color).
- Redesigned the avatar picker from an overlapping/stacked `ElasticStack` layout to a clear 3-column grid with unambiguous selection state (ring + glow + check badge). `elastic-stack.tsx` is now unused by this feature but left in place as a generic primitive.
- `client/src/components/Router.tsx` and `client/src/pages/_dev_profile_preview.tsx` are **dead code** (zero imports from the live `client/src/App.tsx` router, which defines its own inline `Router` and lazy-loads pages from `@/features/*`) — leftover from an earlier `pages/` → `features/` migration. Don't trust `components/Router.tsx` as the live route map.

## Setup notes (this import — 2026-07-30)

- 2026-07-30 (this import): `DATABASE_URL` and `SESSION_SECRET` already present as Replit environment secrets. Bootstrap script ran `npm install` + `npx drizzle-kit push --force` automatically on first `npm run dev` (no conflicts, "Changes applied"). App confirmed running on port 5000 (landing page renders, `/api/health` returns `{"status":"healthy","db":"connected"}`). Founder account (Aon Imran / thorx11dev@gmail.com, role: founder) provisioned via `scripts/provision-founder.mjs`. Login verified: POST /api/login → 200, role: founder, firstName: Aon, lastName: Imran. Only the founder account exists in the `users` table.

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

- 2026-07-30 (Team Portal — Audit Logs Revamp, self-service coverage): Continued a previously-interrupted audit-logs revamp. Re-verified the live codebase rather than trusting the prior agent's transcript, and found it already more complete than claimed (filter forwarding, PDF export, and the `/actions` endpoint were already implemented). The one confirmed real gap was self-service (end-user-initiated) actions writing zero audit trail. Added `storage.createAuditLog(...)` (actor, IP/device/location via `getRequestContext`, before/after diffs where relevant) to ~23 previously-unlogged self-service routes: both withdrawal routes, self-service profile update, registration, password reset, email verification, and the full set of guild member-facing actions (apply/decide, kick, settings, announcements, MVP, pin, nudge, weekly task completion, creation requests, war challenge/cancel, assistant-captain assign/remove/permissions, guild profile). Reused the exact action-code names and `details` shapes already defined in `server/audit-descriptions.ts` (a prior session had pre-built human-readable formatters for most of these without ever wiring the logging calls) and added matching formatters for the remainder. `npx tsc --noEmit` is clean; workflow restarted and serves normally with no new errors. **Not done yet** (session ended on AI usage-quota limits): a cosmetic `TEAM_INVITATION_ACCEPTED` missing `actorRole`; threading request context into the shared `adjustUserBalance` helper (5 call sites can't capture IP/device today); Team/admin-side gaps (email template CRUD, HilltopAds config/zone CRUD, founder bootstrap logging); and manual end-to-end UI verification of the new entries in `AuditLogViewer`.

- 2026-07-31 (re-import, this session): Bootstrap ran automatically on `npm run dev` — dependencies installed (713 packages), schema pulled/applied cleanly ("Changes applied"), workflow serving on port 5000. `/api/health` returns `{"status":"healthy","db":"connected"}`. Landing page confirmed rendering via screenshot (V1.0 ONLINE, hero and pagination visible). HilltopAds inventory sync still fails on startup — `HILLTOPADS_API_KEY` not set (pre-existing, non-blocking, logged only). No founder-account provisioning or auth regression run this session — user moved straight into a phased premium-redesign request instead of asking for further setup verification; see conversation for the design brief and which area was picked first.

- 2026-08-01 (Landing Page premium redesign — Phase 1 of the platform-wide brief): Visual/consistency pass across all 4 landing sections (`hook-section`, `earning-reveal`, `value-proposition`, `faq-section`) plus shared nav/UI (`home.tsx`, `navigation-progress`, `arrow-keys-guide`, `ruler-carousel`). No backend, dependency, routing, or content changes. Key fixes: unified the whole page onto the sharp 0px-radius / white-surface-on-ivory language already established by the header (removed `rounded-lg/xl/sm`, glassmorphism `backdrop-blur`, and heavy/glow shadows from the feature cards, value-prop grid, and FAQ grid); fixed a real CSS bug where `.industrial-grid`'s background texture was silently dead (`hsl(var(--muted-foreground))` double-wrapped an already-complete `hsl()` custom property, which is invalid CSS); made the primary CTA a real focusable `<button>` instead of a `div onClick`; added `focus-visible` rings (matching the existing shadcn convention) and `aria-current`/`aria-label` to nav dots, arrow-key controls, the carousel, and the FAQ "show more" control. Verified via `tsc` (clean), HMR with no console errors, and screenshots of all 4 sections. `replit.md` and `.agents/memory/thorx-redesign-brief.md` document the design-system rules to reuse in the next phases (Auth / User Portal / Team-Admin Portal).
- 2026-08-01 (hero sizing correction, same phase): the headline size above was superseded mid-session after user feedback with a reference screenshot — final hero state has the headline as a quiet single-line statement (`text-3xl md:text-4xl lg:text-5xl`, 30/36/48px, `whitespace-nowrap`) with the "THORX." wordmark as the bolder masthead above it (`text-4xl md:text-5xl lg:text-6xl`, 36/48/60px, was 48/60/72px). Sizing verified against the user's reference image with pixel measurement (wordmark-to-viewport-width ratio within ~4% of reference), not eyeballing alone. This closes out the hero open item from the previous session.
- 2026-08-01 (header restructure, same phase — landing page nav): the previous two-row header (sharp-cornered nav row + separate white wordmark row, both full-bleed with only a bottom border) was replaced with a single unified row per a new user reference image: one rounded-corner (`rounded-2xl`), fully-bordered white card inset from the viewport edges (`nav` wrapper adds `px-3 pt-3 md:px-4 md:pt-4`), containing GET STARTED (left) / "THORX." wordmark (center, `text-xl md:text-3xl lg:text-4xl`) / v1.0·ONLINE badge (right) on a 3-column grid so the wordmark stays exactly centered regardless of left/right content width. The GET STARTED button, ENTER button, and status badge all picked up matching `rounded-lg` corners. This is a deliberate, user-directed exception to the platform brief's "no rounded corners" rule for this one component — flagged to the user, not yet resolved whether it should extend elsewhere. Because the header got much shorter, the fixed-header clearance padding on `.cinematic-section` was reduced to match (was calibrated for the old taller header): desktop general 160px→110px, section 1 120px→100px, mobile sections 2-4 11rem→7rem. Verified via `tsc` (clean), screenshots of section 1 and section 2 (temporarily toggling initial state to confirm no header overlap), and pixel measurement against the reference image.
- 2026-08-02 (rounded-corners rollout — closes out Phase 1): user decided rounded corners (the header's deliberate exception above) should become the sitewide standard rather than staying a one-off. Root cause found first: `tailwind.config.ts` maps the semantic `rounded-lg/md/sm` scale to `var(--radius)`, and `--radius` was `0rem` — so every shadcn-based `rounded-lg` usage (GET STARTED button, ENTER button, status badge) was already *intended* to be rounded but was silently rendering sharp. Fixed by raising `--radius` from `0rem` to `0.5rem` (8px) in `client/src/index.css`, which cascades the fix through every shadcn component sitewide instead of hand-editing classes one by one. Layered on top for full consistency: `digital-clock.tsx` (`rounded-lg`, matches the badge it swaps with in the same header slot), the `.arrow-key` and `.progress-dot` raw-CSS controls (small radius — `.arrow-key` ties directly to `var(--radius)`, `.progress-dot` uses a smaller fixed 3px so a 12px dot doesn't read as an accidental circle), the three landing feature/value/FAQ card grids (`earning-reveal` PlusCard, `value-proposition` stakeholder grid, `faq-section` grid — all `rounded-2xl`, matching the header shell's own radius for big surfaces vs. `rounded-lg`/token-based radius for small controls), and the `value-proposition` "FOR EARNERS/ADVERTISERS/ECOSYSTEM" label chips (`rounded-sm`, were plain sharp while the equivalent FAQ protocol-tag chips already had `rounded-sm` — an inconsistency found and fixed during this pass, not requested explicitly). Verified via `tsc` (clean both before and after), Vite HMR with no console errors beyond the pre-existing unrelated `fontVariationSettings` animation warning, and screenshots of all 4 landing sections (temporarily toggling initial section state to inspect sections 2–4, then reverted) plus a sanity screenshot of `/auth` confirming the global `--radius` change does not visually break the not-yet-redesigned Auth page. This closes the one item Phase 1 had left open. Next up per the agreed order: Phase 2 (Auth — needs its two-row legacy header replaced with the unified nav pattern), then Phase 3 (User Portal), then Phase 4 (Team/Admin Portal, which needs its disconnected dark zinc theme replaced entirely).
- 2026-08-02 (Auth premium redesign — Phase 2 of the platform-wide brief, resumed after an interrupted session): re-imported repo had no diff/memory trail from the prior session (single squashed commit, `.agents/` gitignored), so ground truth was re-established by reading the live code directly. Found Phase 2 partially done: `auth.tsx`'s nav and card border were already migrated to the unified floating-pill pattern, but the session was cut off before inputs, buttons, tabs, and `InviteAcceptCard.tsx` (the separate team-invite-acceptance screen) were touched. Completed the remaining punch list: extracted the floating-pill nav into a shared `client/src/components/auth/AuthNav.tsx` (both `auth.tsx` and `InviteAcceptCard.tsx` now render the same component instead of duplicated markup, so the two can't drift out of sync again the way they just did); softened every light-background input's resting border from opaque `border-black` to `border-black/15` and added `rounded-lg` (raw `<input>` elements had no radius at all); added `rounded-lg`/`rounded-md` to all buttons and the Register/Login tabs; removed the referral-paste button's `backdrop-blur-sm` glassmorphism; replaced the legal-links' raw `gray-200`/`gray-300` colors and three heavy `border-t-2 border-black` dividers with the black-opacity token scale already used elsewhere on the page; brought `InviteAcceptCard.tsx` fully into the new system (legacy full-bleed nav → shared `AuthNav`, `border-3` card → `border-2 md:border-[3px] border-black/15 rounded-2xl`, `rounded-none` icon badges → `rounded-2xl`, same input/button treatment) and deleted its now-dead `pt-24 md:pt-28` override now that both screens share one `.auth-page .cinematic-section` clearance rule. Verified via `tsc --noEmit` (clean), a full sweep for `gray-*`/`rounded-none`/`border-3`/`backdrop-blur` across both files (zero hits left), Vite HMR with no console errors, and screenshots of the register view and the invite-invalid-token state. This closes Phase 2. Next up: Phase 3 (User Portal, `UserPortal.tsx` ~4000 lines, still on the old heavy `border-3` style), then Phase 4 (Team/Admin Portal, still a fully disconnected dark zinc theme).
- 2026-08-02 (Terms/Privacy redesign + reveal-animation bug fix, closes remaining Phase 2 loose end): a still-later interrupted session (no replit.md trail, reconstructed from the live code + the user's pasted transcript) had already rebuilt `TermsAndConditions.tsx`/`PrivacyPolicy.tsx` onto the shared design system and extracted `client/src/components/legal/LegalNav.tsx`, but left one open bug: the page's H1 and first section heading appeared permanently hidden behind a solid orange block. Root-caused via console instrumentation on the live `TextBlockAnimation` component (temporary, removed after diagnosis): the H1 omitted `animateOnScroll` and so defaulted to `true` (ScrollTrigger-driven), unlike every other above-the-fold usage sitewide (`home.tsx` hero, `hook-section`, `earning-reveal`, `value-proposition`, `AdminHeader`) which explicitly pass `animateOnScroll={false}`. Being positioned at the very top of the page put its ScrollTrigger `start` at a negative/already-passed offset — a fragile edge case. Fixed by adding `animateOnScroll={false}` to the H1 on both pages, matching the established sitewide convention. Confirmed via console instrumentation that the animation genuinely completes either way (~1.1–1.6s after mount, matching `1.9 × duration` timeline math shared by every instance sitewide, including the already-shipped home hero) — it is not an infinite/stuck state, just a naturally-timed reveal that a screenshot taken in the first ~1.5s of navigation can catch mid-flight. `npx tsc --noEmit` clean; no other files changed. See `.agents/memory/text-block-animation-timing.md` for the reusable diagnostic lesson before this component is used again in Phase 3/4.

## User preferences

- Use Replit's built-in PostgreSQL (no external auth or storage providers)
- Insforge is fully removed. Auth is session-based (express-session + scrypt), profile pictures are stored as compressed base64 in Postgres. `.env.example` reflects only the variables the server actually reads.

### Platform-wide premium redesign (in progress)

The user is taking the whole app through a "million-dollar company" visual pass, one area at a time, in this fixed order: **Phase 1 Landing (done) → Phase 2 Auth (done) → Phase 3 User Portal → Phase 4 Team/Admin Portal**. Working agreement for every phase:
- Investigate and report before changing code; work systematically; test at every step (`tsc`, screenshots, console check) rather than at the end only.
- Preserve all existing functionality, backend logic, and `data-testid`s — this is a visual/consistency pass, not a rewrite.
- Cover desktop, tablet, and mobile for whatever is touched.
- **Always ask which area to work on next before starting it** — do not jump ahead to the next phase unprompted, even though the order above is already agreed.
- Give a short milestone summary at the end of each area: what improved, desktop/mobile changes, what was verified, any open issues.

Design language (established on Landing, extended through Auth): warm ivory background, deep black typography, one controlled orange accent color, no glassmorphism/gradients/neon. Rounded corners are sitewide via the `--radius` CSS var (`client/src/index.css`) feeding Tailwind's `rounded-lg/md/sm` scale (`tailwind.config.ts`) — never hardcode a radius. Border weight/opacity follows the surface: cards and light-background inputs use a **softened** border (`border-black/15`, still 2-3px), while buttons, outline-CTA pairs, and solid-filled "chip" fields (e.g. a readonly dark field, an accent-colored field) keep a **solid, opaque** `border-black`/`border-primary` — softening only applies where a heavy border would fight the light ivory/white surface behind it.
