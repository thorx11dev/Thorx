// Shared formatting helpers for the admin Guild Manager.
// Rule: never silently mask missing/invalid data behind a plausible-looking
// default (e.g. an unknown rank must never render as "E-Rank", a missing
// timestamp must never render as "0" or "?" — always an explicit "Unknown"/"—").
import { RankBadge } from "@/components/RankBadge";

/** Format a PKR decimal-string/number safely. Never emits "NaN". */
export function formatPkr(value: string | number | null | undefined): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/** Whole days since a timestamp, or null if missing/invalid — caller decides the fallback label. */
export function daysOffline(lastActiveAt: string | Date | null | undefined): number | null {
  if (!lastActiveAt) return null;
  const t = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/** A person's display name from a blank/null-safe string. Never shows "undefined" or a bare space. */
export function formatPersonName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Unknown user";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * Renders a real RankBadge for a known rank, or an explicit "Unknown" tag.
 * Deliberately does NOT fall back to RankBadge's internal E-Rank default —
 * that default exists for visual safety (styling), not as a truthful label,
 * and silently showing "E-Rank" for missing data misleads admins.
 */
export function RankOrUnknown({ rank, size = "sm" }: { rank?: string | null; size?: "sm" | "md" | "lg" }) {
  if (!rank) {
    return <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 italic">Unknown</span>;
  }
  return <RankBadge rank={rank} size={size} />;
}
