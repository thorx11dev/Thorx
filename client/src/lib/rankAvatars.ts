/**
 * THORX Avatar & Rank System
 * ─────────────────────────────────────────────────────────────────────────
 * Avatars are universal — every user picks from the same 6 portraits,
 * regardless of rank. Rank definitions below are used only for the rank
 * badge (label/color) shown across the app.
 *
 * Rank progression: Nawa Aya → Chota Don → Bawa Ji → Haji Sab → Chacha Supreme
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface RankAvatar {
  id: string;
  url: string;
  label: string;
}

export interface RankDefinition {
  key: string;          // matches DB value (users.rank)
  label: string;        // display name
  color: string;        // Tailwind color class for badge
  bgColor: string;      // Tailwind bg class for badge
}

// All ranks share a single silver/zinc frame + badge style (per design decision:
// avatar frame color reflects account tier consistently, not per-rank branding).
const SILVER_COLOR = "text-zinc-400";
const SILVER_BG = "bg-zinc-600";

export const RANK_DEFINITIONS: RankDefinition[] = [
  { key: "Nawa Aya", label: "NAWA AYA", color: SILVER_COLOR, bgColor: SILVER_BG },
  { key: "Chota Don", label: "CHOTA DON", color: SILVER_COLOR, bgColor: SILVER_BG },
  { key: "Bawa Ji", label: "BAWA JI", color: SILVER_COLOR, bgColor: SILVER_BG },
  { key: "Haji Sab", label: "HAJI SAB", color: SILVER_COLOR, bgColor: SILVER_BG },
  { key: "Chacha Supreme", label: "CHACHA SUPREME", color: SILVER_COLOR, bgColor: SILVER_BG },
];

/**
 * Returns the RankDefinition for the given rank key (DB value).
 * Falls back to Nawa Aya if rank is unknown.
 */
export function getRankDef(rankKey?: string | null): RankDefinition {
  const match = rankKey
    ? RANK_DEFINITIONS.find((r) => r.key.toLowerCase() === rankKey.toLowerCase())
    : undefined;
  return match ?? RANK_DEFINITIONS[0];
}

// ── Universal avatar set ─────────────────────────────────────────────────
// 6 portraits spanning a mix of gender and age. Selectable by every user,
// independent of rank.
export const UNIVERSAL_AVATARS: RankAvatar[] = [
  { id: "avatar-1", url: "/avatars/avatar-1.png", label: "Maya" },
  { id: "avatar-2", url: "/avatars/avatar-2.png", label: "Zayan" },
  { id: "avatar-3", url: "/avatars/avatar-3.png", label: "Elena" },
  { id: "avatar-4", url: "/avatars/avatar-4.png", label: "Omar" },
  { id: "avatar-5", url: "/avatars/avatar-5.png", label: "Grace" },
  { id: "avatar-6", url: "/avatars/avatar-6.png", label: "Arthur" },
];

export const DEFAULT_AVATAR_ID = UNIVERSAL_AVATARS[0].id;

/**
 * Returns the default avatar URL. The `rankKey` parameter is accepted for
 * backward compatibility with existing call sites but no longer affects the
 * result — avatars are rank-independent.
 */
export function getDefaultAvatarUrl(_rankKey?: string | null): string {
  return UNIVERSAL_AVATARS[0].url;
}

/**
 * Resolves a saved avatar id to a URL. Checks the universal avatar set
 * first; falls back to raw http/data URLs (custom uploads), then to the
 * default avatar for anything unrecognized (e.g. a retired legacy id).
 */
export function resolveAvatarUrl(
  savedAvatar: string | null | undefined,
  _rankKey?: string | null
): string {
  if (!savedAvatar || savedAvatar === "default") {
    return getDefaultAvatarUrl();
  }

  const found = UNIVERSAL_AVATARS.find((a) => a.id === savedAvatar);
  if (found) return found.url;

  // If it looks like a custom URL or base64, return as-is
  if (savedAvatar.startsWith("http") || savedAvatar.startsWith("data:")) {
    return savedAvatar;
  }

  return getDefaultAvatarUrl();
}

// ── Legacy compatibility ──────────────────────────────────────────────────
// Flat AVATARS array for components that haven't been migrated yet.
export const ALL_AVATARS = UNIVERSAL_AVATARS.map((a) => ({ id: a.id, url: a.url }));

// ── THORX v3: E-S rank tier ↔ Urdu rank key bridge ───────────────────────
// New userRankTier column uses E-S labels; rank badge lookups use legacy Urdu keys.
// Use this to bridge calls from v3 components into the existing rank badge system.
const TIER_TO_RANK_KEY: Record<string, string> = {
  "E-Rank": "Nawa Aya",
  "D-Rank": "Chota Don",
  "C-Rank": "Bawa Ji",
  "B-Rank": "Haji Sab",
  "A-Rank": "Chacha Supreme",
  "S-Rank": "Chacha Supreme",
};

/**
 * Resolves avatar URL for a saved avatar id. The `userRankTier` parameter is
 * accepted for backward compatibility but avatars are rank-independent.
 */
export function resolveAvatarUrlByTier(
  savedAvatar: string | null | undefined,
  _userRankTier?: string | null
): string {
  return resolveAvatarUrl(savedAvatar);
}

/**
 * Returns the RankDefinition for the given E-S rank tier.
 */
export function getRankDefByTier(userRankTier?: string | null): RankDefinition {
  const rankKey = (userRankTier && TIER_TO_RANK_KEY[userRankTier]) || "Nawa Aya";
  return getRankDef(rankKey);
}
