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
 * Any request that arrives from a non-local host (public preview / production,
 * always TLS-terminated by the platform's proxy) — or that is proxied over
 * HTTPS — gets SameSite=None + Secure + Partitioned (CHIPS), so the cookies
 * are both set and sent inside the preview iframe even under third-party
 * cookie blocking. Plain http://localhost development keeps SameSite=Lax and
 * no Secure, which is the correct local default.
 *
 * Explicit SESSION_COOKIE_SECURE / SESSION_COOKIE_SAME_SITE env overrides
 * (Keys tab / platform config) always win over auto-detection.
 */
export function resolveCookiePolicy(req: Request): ResolvedCookiePolicy {
  const explicitSecure = process.env.SESSION_COOKIE_SECURE;
  const explicitSameSite = process.env.SESSION_COOKIE_SAME_SITE;
  if (explicitSecure || explicitSameSite) {
    const sameSite = (explicitSameSite ?? "lax").toLowerCase();
    const valid = sameSite === "none" || sameSite === "strict" || sameSite === "lax" ? sameSite : "lax";
    const secure = explicitSecure ? explicitSecure === "true" : false;
    return { secure, sameSite: valid, partitioned: valid === "none" };
  }

  const host = req.headers.host ?? "";
  const isLocalHost = LOCAL_HOST_RE.test(host.trim());
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
  const proxiedHttps = forwardedProto === "https" || req.secure;

  if (!isLocalHost || proxiedHttps) {
    return { secure: true, sameSite: "none", partitioned: true };
  }
  return { secure: false, sameSite: "lax", partitioned: false };
}
