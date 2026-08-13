import type { Request } from "express";

export interface ResolvedCookiePolicy {
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  partitioned: boolean;
}

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/**
 * Per-request cookie policy for session + CSRF cookies.
 *
 * Browsers refuse to send SameSite=Lax/Strict cookies on fetch()/XHR calls
 * made from a cross-site iframe — which is exactly how Replit and Freebuff
 * embed app previews. In that context the CSRF double-submit cookie and the
 * session cookie silently stop round-tripping, surfacing as "403 CSRF
 * validation failed" on register and a login that never persists.
 *
 * Any request that arrives over verified HTTPS (x-forwarded-proto: https or
 * req.secure) gets SameSite=None + Secure + Partitioned (CHIPS), so the
 * cookies are both set and sent inside the preview iframe even under
 * third-party cookie blocking. Plain http://localhost development keeps
 * SameSite=Lax and no Secure, which is the correct local default.
 *
 * Explicit SESSION_COOKIE_SECURE / SESSION_COOKIE_SAME_SITE env overrides
 * (Keys tab / platform config) always win over auto-detection — unless the
 * connection cannot be verified as TLS at all (see the final guard below).
 */
export function resolveCookiePolicy(req: Request): ResolvedCookiePolicy {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const connectionLooksSecure = forwardedProto === "https" || req.secure;

  const explicitSecure = process.env.SESSION_COOKIE_SECURE;
  const explicitSameSite = process.env.SESSION_COOKIE_SAME_SITE;

  let policy: ResolvedCookiePolicy;
  if (explicitSecure || explicitSameSite) {
    const sameSite = (explicitSameSite ?? "lax").toLowerCase();
    const valid = sameSite === "none" || sameSite === "strict" || sameSite === "lax" ? sameSite : "lax";
    const secure = explicitSecure ? explicitSecure === "true" : false;
    policy = { secure, sameSite: valid, partitioned: valid === "none" };
  } else {
    const host = req.headers.host ?? "";
    const isLocalHost = LOCAL_HOST_RE.test(host.trim());

    if (isLocalHost && !connectionLooksSecure) {
      policy = { secure: false, sameSite: "lax", partitioned: false };
    } else if (connectionLooksSecure) {
      policy = { secure: true, sameSite: "none", partitioned: true };
    } else {
      // Non-local host with no HTTPS proof (e.g. a platform proxy chain that
      // terminates TLS but strips x-forwarded-proto). Keep the cookie usable
      // instead of dropping it entirely.
      policy = { secure: false, sameSite: "lax", partitioned: false };
    }
  }

  // Hard guard: express-session's issecure() check refuses to emit a Secure
  // cookie over a connection it cannot verify as TLS — and it does so
  // SILENTLY, which made logins "succeed" while the session cookie was never
  // set (no Set-Cookie header at all). Some free hosts (SnapDeploy behind
  // Cloudflare, etc.) forward x-forwarded-proto: http or strip it entirely,
  // even though the browser-facing URL is https. In that case downgrade to
  // Lax + non-Secure so the session actually persists. TLS is still
  // terminated at the edge, so the cookie travels over https in practice.
  // SameSite=None without Secure is rejected by all browsers, so it can
  // never survive this downgrade — Lax is the only valid fallback.
  if (policy.secure && !connectionLooksSecure) {
    policy = { secure: false, sameSite: "lax", partitioned: false };
  }

  return policy;
}
