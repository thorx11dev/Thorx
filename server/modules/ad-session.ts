/**
 * THORX Engine A — Ad Session Tokens (Phase 2: real rewarded ads).
 *
 * Binds a real ad watch to a specific user + pending ad_view row WITHOUT a new
 * DB column: the token is a stateless HMAC-SHA256 signature over the ad_view
 * row id + user id + expiry, keyed by SESSION_SECRET.
 *
 * Flow:
 *   1. POST /api/ads/session inserts a pending ad_view row (completed=false)
 *      and returns this signed token.
 *   2. The client plays the real network ad, then completes the session by
 *      POSTing the token to /api/ad-view (or the network's postback hits
 *      /api/webhooks/ad-complete with the same token).
 *   3. The server verifies the signature + expiry, loads the row, and marks it
 *      completed — crediting exactly once. The existing partial unique index
 *      uniq_user_transactions_source (user_id, source_type, source_id) makes
 *      the credit idempotent even if a token is replayed after the row is
 *      completed (the second attempt finds completed=true and is rejected).
 *
 * Tokens are one-time by construction: completion flips the row to
 * completed=true, and every subsequent use of the same token is a 409.
 */

import crypto from "crypto";

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes — long enough for the 30s panel + waterfall

export interface AdSessionPayload {
  sid: string; // ad_view row id (the "session")
  uid: string; // THORX user id the session belongs to
  exp: number; // epoch ms — session expiry
}

function getSecret(): string {
  return process.env.SESSION_SECRET || "";
}

function sign(body: string): string {
  return crypto.createHmac("sha256", getSecret()).update(body, "utf8").digest("base64url");
}

/** Issue a signed, expiring session token for a pending ad_view row. */
export function createAdSessionToken(adViewId: string, userId: string): string {
  const payload: AdSessionPayload = {
    sid: adViewId,
    uid: userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Verify a session token. Returns the payload when the signature matches,
 * the session is unexpired, and the shape is valid — otherwise null.
 */
export function verifyAdSessionToken(token: string | undefined | null): AdSessionPayload | null {
  if (!token) return null;
  if (!getSecret()) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdSessionPayload;
    if (!payload?.sid || !payload?.uid || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
