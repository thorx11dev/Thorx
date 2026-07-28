// Lightweight, dependency-free shared constants.
//
// Deliberately NOT in schema.ts: that file pulls in drizzle-orm/pg-core and
// drizzle-zod, which are fine for the server but unnecessary weight/coupling
// for the client bundle. Anything imported from both client and server code
// belongs here instead so the client only pulls in plain values.

/**
 * Admin-assigned account trust classification, surfaced on the Leaderboard
 * and used by Risk Watchlist case resolution. Stored as free-text
 * (`users.trustStatus`) rather than a DB enum, so this array is the single
 * source of truth — keep every reader/writer of trust status importing from
 * here instead of redeclaring the list.
 */
export const TRUST_STATUSES = ["Special", "Trusted", "Normal", "Dangerous"] as const;
export type TrustStatus = typeof TRUST_STATUSES[number];
