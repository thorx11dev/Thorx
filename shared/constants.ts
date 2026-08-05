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

/**
 * Every account picks from the same 6 universal portraits (see
 * client/src/lib/rankAvatars.ts UNIVERSAL_AVATARS) — this is just the count,
 * kept here so the deterministic picker below doesn't hardcode it twice.
 */
export const UNIVERSAL_AVATAR_COUNT = 6;

/**
 * Deterministic avatar assignment for freshly created accounts: the same
 * full name always resolves to the same one of the 6 universal avatars, so
 * a brand-new signup shows a name-appropriate portrait immediately instead
 * of every account starting on avatar-1. Not cryptographic — just a stable,
 * evenly-spread hash so different names tend to land on different avatars.
 */
export function pickAvatarIdForName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "avatar-1";
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  return `avatar-${(hash % UNIVERSAL_AVATAR_COUNT) + 1}`;
}
