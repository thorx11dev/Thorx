// ── THORX Geo / VPN Guard (anti-fraud Layer 2) ──────────────────────────────
//
// Ad networks and survey providers reward clean, real traffic. The single
// fastest way to get a publisher account banned is letting VPN/proxy or
// out-of-region traffic earn on the platform. This guard resolves the caller's
// country from the bundled offline geoip-lite database and enforces the
// platform's region policy at the two money-relevant entry points:
// registration and login.
//
// Policy is fully config-driven (no redeploy needed to change it):
//   GEO_GUARD_MODE        "off" | "log" | "block"   (default "off" until the
//                         founder flips it after beta traffic stabilises)
//   GEO_ALLOWED_COUNTRIES CSV of ISO codes           (default "PK")
//   Exempt roles          team / admin / founder are never blocked — staff may
//                         test from anywhere; production earning accounts
//                         cannot.
//
// Unresolvable IPs (localhost, LAN, some CGNAT ranges) are ALWAYS allowed but
// reported as `unresolved` — blocking them would lock out legitimate mobile
// carriers and break every dev/preview environment.

import type { Request } from "express";
import geoip from "geoip-lite";
import { storage } from "../storage";
import { logger } from "../lib/logger";

export interface GeoVerdict {
  ip: string | null;
  country: string | null;
  city: string | null;
  /** true when geoip resolved a real (non-private) IP */
  resolved: boolean;
  allowed: boolean;
  reason: string;
}

function normalizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip.startsWith("169.254.")
  );
}

/** Resolve + judge the request's geo against current config. Never throws. */
export async function getGeoVerdict(req: Request): Promise<GeoVerdict> {
  const ip = normalizeIp(req.ip);
  let country: string | null = null;
  let city: string | null = null;

  if (ip && !isPrivateIp(ip)) {
    try {
      const geo = geoip.lookup(ip);
      if (geo) {
        country = geo.country || null;
        city = geo.city || null;
      }
    } catch {
      // lookup failure → treated as unresolved below
    }
  }

  const resolved = !!country;

  if (!resolved) {
    return { ip, country, city, resolved: false, allowed: true, reason: "geo-unresolved" };
  }

  try {
    const mode = await storage.getSystemConfigValue<string>("GEO_GUARD_MODE", "off");
    if (mode !== "block" && mode !== "log") {
      return { ip, country, city, resolved: true, allowed: true, reason: `mode:${mode}` };
    }

    const allowedCsv = await storage.getSystemConfigValue<string>("GEO_ALLOWED_COUNTRIES", "PK");
    const allowedList = allowedCsv.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const allowed = allowedList.length === 0 || allowedList.includes((country || "").toUpperCase());
    return { ip, country, city, resolved: true, allowed, reason: allowed ? "in-region" : "out-of-region" };
  } catch (err) {
    // Config read failure must never lock users out — fail open.
    logger.error({ err }, "[GeoGuard] config read failed — failing open");
    return { ip, country, city, resolved: true, allowed: true, reason: "config-error" };
  }
}

/**
 * Enforce at an auth entry point. Returns a 403 Response when blocked,
 * otherwise undefined (caller continues). Staff roles are always exempt.
 * In "log" mode out-of-region attempts pass through but are audit-logged so
 * the founder can review volume before switching to "block".
 */
export async function enforceGeoPolicy(
  req: Request & { userProfile?: any },
  res: any,
  context: string
): Promise<any> {
  const role = req.userProfile?.role || req.body?.role || "user";
  if (["team", "admin", "founder"].includes(role)) return undefined;

  const verdict = await getGeoVerdict(req);
  if (verdict.allowed) return undefined;

  const details = {
    email: String(req.body?.email ?? "").slice(0, 120),
    ipAddress: verdict.ip,
    country: verdict.country,
    city: verdict.city,
    userAgent: (req.headers["user-agent"] as string) || null,
  };

  if (verdict.reason === "out-of-region") {
    logger.warn({ ...details, context }, "[GeoGuard] out-of-region attempt");
    try {
      await storage.createAuditLog(
        {
          adminId: "system",
          actorRole: "system",
          action: "GEO_BLOCKED_ATTEMPT",
          targetType: "auth",
          targetId: details.email || context,
          details,
        },
        {
          ipAddress: verdict.ip,
          userAgent: details.userAgent,
          deviceType: null,
          browser: null,
          os: null,
          country: verdict.country,
          city: verdict.city,
        },
      );
    } catch {
      // audit failure never blocks the response path
    }
    if (await storage.getSystemConfigValue<string>("GEO_GUARD_MODE", "off") === "block") {
      return res.status(403).json({
        message:
          "THORX Pakistan ke liye hai — aapka connection ek doosray mulk ya VPN se lag raha hai. VPN band karke dobara koshish karein.",
        error: "VPN_OR_REGION_BLOCKED",
      });
    }
    // "log" mode → fall through, attempt proceeds but was recorded.
  }
  return undefined;
}
