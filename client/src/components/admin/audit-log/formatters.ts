/**
 * Formatting helpers for the Audit Log Viewer.
 * All pure functions — no React, no side effects.
 */

import type { AuditLogRow } from "./types";

/** Format an ISO timestamp to a compact locale string. */
export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/** Relative time from now, e.g. "3 min ago", "2 d ago". */
export function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

/** Format actor display name from a log row. */
export function actorName(log: AuditLogRow): string {
  if (log.admin) {
    return `${log.admin.firstName} ${log.admin.lastName}`.trim();
  }
  return log.adminId.substring(0, 12) + "…";
}

/** Format device context into a single compact string. */
export function formatDevice(log: AuditLogRow): string {
  const parts: string[] = [];
  if (log.deviceType && log.deviceType !== "null") parts.push(log.deviceType);
  if (log.browser && log.browser !== "null") parts.push(log.browser);
  if (log.os && log.os !== "null") parts.push(log.os);
  return parts.join(" / ") || "Unknown Device";
}

/** Format location from log row. */
export function formatLocation(log: AuditLogRow): string {
  const city = log.city && log.city !== "null" ? log.city : null;
  const country = log.country && log.country !== "null" ? log.country : null;
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  if (city) return city;
  return "Local / Unknown";
}

/** Format IP address, guarding against null. */
export function formatIp(ip: string | null): string {
  if (!ip || ip === "null") return "—";
  return ip;
}

/** Format actor role badge label. */
export function formatRole(role: string | null): string {
  if (!role) return "—";
  return role.toUpperCase();
}

/**
 * Convert a snake_case or UPPER_SNAKE_CASE action code to a readable label.
 * e.g. UPDATE_PROFILE → Update Profile
 */
export function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse the details field into a diff map and extra props.
 * diff entries: { before, after }
 * extras: flat key/value pairs
 */
export interface DetailsDiff {
  diff: Record<string, { before: unknown; after: unknown }>;
  extras: Record<string, unknown>;
}

export function parseDetails(details: Record<string, unknown> | null): DetailsDiff {
  if (!details) return { diff: {}, extras: {} };

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const extras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (key === "diff" && value && typeof value === "object" && !Array.isArray(value)) {
      // diff: { fieldName: { before, after } }
      for (const [field, change] of Object.entries(value as Record<string, unknown>)) {
        if (
          change &&
          typeof change === "object" &&
          !Array.isArray(change) &&
          "before" in (change as object) &&
          "after" in (change as object)
        ) {
          diff[field] = change as { before: unknown; after: unknown };
        }
      }
    } else {
      extras[key] = value;
    }
  }

  return { diff, extras };
}

/** Render a detail value as a readable string (not raw JSON). */
export function renderDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value === "" ? "—" : value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => renderDetailValue(v)).join(", ");
  }
  if (typeof value === "object") {
    // Compact the object instead of dumping raw JSON
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${renderDetailValue(v)}`)
      .join("; ");
  }
  return String(value);
}

/** Humanise a snake_case key into a readable label. */
export function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build the export query string from current filter state. */
export interface ExportParams {
  search: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  category: string;
  action: string;
  actorId: string;
  ipAddress: string;
  selectedIds: string[];
  format: string;
}

export function buildExportQueryString(params: ExportParams): string {
  const parts: string[] = [];
  if (params.format) parts.push(`format=${encodeURIComponent(params.format)}`);
  if (params.category) parts.push(`category=${encodeURIComponent(params.category)}`);
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.dateFrom && params.dateTo) {
    parts.push(`dateFrom=${encodeURIComponent(params.dateFrom)}`);
    parts.push(`dateTo=${encodeURIComponent(params.dateTo)}`);
  } else if (params.period) {
    parts.push(`period=${encodeURIComponent(params.period)}`);
  }
  if (params.action && params.action !== "ALL") parts.push(`action=${encodeURIComponent(params.action)}`);
  if (params.actorId) parts.push(`actorId=${encodeURIComponent(params.actorId)}`);
  if (params.ipAddress) parts.push(`ipAddress=${encodeURIComponent(params.ipAddress)}`);
  if (params.selectedIds.length > 0) parts.push(`ids=${params.selectedIds.join(",")}`);
  return parts.join("&");
}

/** Build the fetch query string for audit-logs list endpoint. */
export interface FetchParams {
  page: number;
  limit: number;
  search: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  category: string;
  action: string;
  actorId: string;
  ipAddress: string;
}

export function buildFetchQueryString(params: FetchParams): string {
  const parts: string[] = [];
  parts.push(`page=${params.page}`);
  parts.push(`limit=${params.limit}`);
  if (params.category) parts.push(`category=${encodeURIComponent(params.category)}`);
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.dateFrom && params.dateTo) {
    parts.push(`dateFrom=${encodeURIComponent(params.dateFrom)}`);
    parts.push(`dateTo=${encodeURIComponent(params.dateTo)}`);
  } else if (params.period && params.period !== "all_time") {
    parts.push(`period=${encodeURIComponent(params.period)}`);
  }
  if (params.action && params.action !== "ALL") parts.push(`action=${encodeURIComponent(params.action)}`);
  if (params.actorId) parts.push(`actorId=${encodeURIComponent(params.actorId)}`);
  if (params.ipAddress) parts.push(`ipAddress=${encodeURIComponent(params.ipAddress)}`);
  return parts.join("&");
}
