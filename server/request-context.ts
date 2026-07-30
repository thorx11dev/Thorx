// Deep-tracking context capture for the Audit Logs system (Team Portal).
//
// Centralizes IP/device/browser/geolocation extraction so route handlers never
// have to parse a user-agent string or hit a GeoIP database themselves — they
// just call `getRequestContext(req)` and spread the result into an audit log.
//
// GeoIP is resolved from a bundled offline database (geoip-lite) — no external
// API calls, no secrets required. Private/local/dev IPs (127.0.0.1, ::1, LAN
// ranges) will not resolve to a location; that is expected in development and
// is surfaced as `country: null, city: null` rather than a fake value.
import type { Request } from "express";
import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
}

function normalizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  // Strip the ::ffff: IPv4-mapped-IPv6 prefix some proxies add.
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function getRequestContext(req: Request | undefined | null): RequestContext {
  if (!req) {
    return {
      ipAddress: null,
      userAgent: null,
      deviceType: null,
      browser: null,
      os: null,
      country: null,
      city: null,
    };
  }

  const ipAddress = normalizeIp(req.ip);
  const uaString = req.headers["user-agent"] || "";

  let deviceType: string | null = "desktop";
  let browser: string | null = null;
  let os: string | null = null;

  if (uaString) {
    try {
      const parsed = new UAParser(uaString).getResult();
      deviceType = parsed.device?.type || "desktop"; // ua-parser-js leaves this undefined for regular desktop UAs
      browser = [parsed.browser?.name, parsed.browser?.version?.split(".")[0]].filter(Boolean).join(" ") || null;
      os = [parsed.os?.name, parsed.os?.version].filter(Boolean).join(" ") || null;
    } catch {
      // Malformed/unknown UA string — leave defaults, never throw from audit logging.
      deviceType = "unknown";
    }
  } else {
    deviceType = "unknown";
  }

  let country: string | null = null;
  let city: string | null = null;
  if (ipAddress) {
    try {
      const geo = geoip.lookup(ipAddress);
      if (geo) {
        country = geo.country || null;
        city = geo.city || null;
      }
    } catch {
      // Lookup failures (bad/private IP) are expected — never block the request.
    }
  }

  return {
    ipAddress: ipAddress || null,
    userAgent: uaString || null,
    deviceType,
    browser,
    os,
    country,
    city,
  };
}

/**
 * Shallow diff between two plain objects — used to capture "before vs after"
 * on audit log entries. Returns only the keys that actually changed, each as
 * `{ before, after }`. Keys present in `after` but not `keys` are ignored;
 * pass an explicit `keys` list so unrelated/internal columns (updatedAt,
 * password hashes, etc.) never leak into an audit trail.
 */
export function diffFields<T extends Record<string, any>>(
  before: T | null | undefined,
  after: T | null | undefined,
  keys: (keyof T)[]
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (!before || !after) return changes;
  for (const key of keys) {
    const beforeVal = before[key];
    const afterVal = after[key];
    const a = beforeVal instanceof Date ? beforeVal.toISOString() : beforeVal;
    const b = afterVal instanceof Date ? afterVal.toISOString() : afterVal;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[key as string] = { before: a ?? null, after: b ?? null };
    }
  }
  return changes;
}

const GUILD_TARGET_TYPES = new Set([
  "guild",
  "guild_application",
  "guild_creation_request",
  "guild_chat_message",
  "guild_war",
  "guild_member",
]);

/**
 * Buckets a log entry into one of the three Audit Logs tabs when the caller
 * did not explicitly set `category`:
 *  - "guild": the action targets a guild or guild-scoped entity, regardless of
 *    who performed it (an admin bulk-messaging a guild is still guild activity).
 *  - "user": a non-admin actor acting on themself (e.g. a plain user editing
 *    their own profile) — THORX's `auditLogs` table has always recorded these
 *    under the historical "adminId" column even though the actor isn't staff.
 *  - "team": everything else — the historical meaning of this table, i.e. a
 *    founder/admin/team member acting on the platform or on another user.
 */
export function inferAuditCategory(params: {
  targetType: string;
  actorId: string;
  targetId: string;
  actorRole?: string | null;
}): "team" | "guild" | "user" {
  if (GUILD_TARGET_TYPES.has(params.targetType)) return "guild";
  const isSelfService = params.actorId === params.targetId;
  const isPlainUser = !params.actorRole || params.actorRole === "user";
  if (isSelfService && isPlainUser) return "user";
  return "team";
}
