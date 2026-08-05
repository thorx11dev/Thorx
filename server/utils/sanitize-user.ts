import type { User } from "@shared/schema";

/**
 * Strip sensitive internal fields before returning user data to the client.
 * NEVER send the raw Drizzle row — always pass through this function.
 */
export function sanitizeUser(user: User) {
  const { passwordHash, verificationToken, ...safe } = user;
  return safe;
}

/**
 * Canonical shape of the authenticated user object sent to the client.
 * Must stay in sync with the `User` interface in client/src/hooks/useAuth.ts.
 *
 * Every endpoint that establishes or returns session identity (/api/login,
 * /api/register, /api/profile) must use this SAME helper. Previously each
 * endpoint hand-rolled its own subset of fields, and /api/login + /api/register
 * silently dropped referralCode (and other fields) from their response —
 * which left the client's cached user object incomplete (showing
 * "ref=undefined" on the referral link) until an unrelated refetch happened
 * to overwrite it. Always extend this helper rather than adding inline
 * response shapes at each call site.
 */
export function buildAuthUserPayload(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    identity: user.identity,
    phone: user.phone,
    referralCode: user.referralCode,
    totalEarnings: user.totalEarnings,
    availableBalance: user.availableBalance,
    isActive: user.isActive,
    createdAt: user.createdAt,
    role: user.role || "user",
    avatar: (user as any).avatar,
    profilePicture: (user as any).profilePicture,
    // THORX v3 fields — frontend relies on these via useAuth
    userRankTier: user.userRankTier || "E-Rank",
    guildRole: user.guildRole || "simple",
    guildId: user.guildId || null,
    performanceScore: user.performanceScore ?? 0,
    streakDays: user.streakDays ?? 0,
    txPointsBalance: user.txPointsBalance ?? 0,
    lastActiveAt: user.lastActiveAt ?? null,
  };
}
