/**
 * Temporary, dev-only rank-gate bypass used while the User Portal redesign is
 * being reviewed. `DEV_UNLOCK_RANK_GATES` makes the handful of rank-requirement
 * UI locks (Engine B's C-Rank lock, Engine C's B-Rank+ guild creation/apply
 * gates) render as unlocked so every screen can be inspected without needing
 * an account that actually holds the required rank.
 *
 * It is derived from Vite's `import.meta.env.DEV`, so it is always `false` in
 * production builds (`vite build`) and can never affect the published app —
 * it only ever applies while running the dev workflow (`npm run dev`).
 *
 * This flag is rendering-only: it never touches server-side authorization.
 * Every rank-gated backend action (creating a guild, joining a guild, etc.)
 * is independently re-verified against the authenticated session on the
 * server, so bypassing the UI lock here cannot grant a real permission the
 * account doesn't actually have.
 *
 * This does NOT switch which guild role (Discovery/Member/Captain) a user
 * sees — that still always reflects the account's real `guildRole`. Use real
 * accounts that actually hold each guild role to preview those views.
 *
 * Remove this flag (and its call sites) once the redesign ships and rank
 * gates should always be enforced in the dev environment too.
 */
export const DEV_UNLOCK_RANK_GATES: boolean = import.meta.env.DEV;

/**
 * Dev-only payout-flow bypass. When true (dev server only), the payout
 * section ignores zero-balance locks, uses a mock withdrawal preview, and
 * skips the step-3 minimum-display timer so every step of the withdrawal
 * UX can be inspected and designed without a funded account.
 *
 * Always `false` in production builds — cannot affect the published app.
 * The server still enforces all real balance/eligibility checks independently.
 *
 * Remove this flag once the withdrawal UX redesign is complete.
 */
export const DEV_UNLOCK_PAYOUT: boolean = import.meta.env.DEV;
