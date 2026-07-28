// Shared formatting helpers for the admin Guild Manager.
// Rule: never silently mask missing/invalid data behind a plausible-looking
// default (e.g. an unknown rank must never render as "E-Rank", a missing
// timestamp must never render as "0" or "?" — always an explicit "Unknown"/"—").
import { RankBadge } from "@/components/RankBadge";
import { apiRequest } from "@/lib/queryClient";

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

/**
 * Human-readable "why" behind a weekly pool disposition code — mirrors the
 * exact payout rules in server/modules/guild-reset.ts (100% -> pool + 5% bonus
 * split captain 30% / members 70%; partial progress -> pool split evenly with
 * bonus forfeited; 0% -> voided) so admins don't have to infer intent from the
 * raw code + numbers alone.
 */
/**
 * Downloads a CSV export through the authenticated API client (cookies +
 * CSRF header, same as every other admin request) instead of a bare <a href>
 * navigation. A bare navigation can't see HTTP errors — a failed export
 * (expired session, 500, etc.) would silently download an HTML/JSON error
 * page disguised as a ".csv" file. This surfaces failures via `onError`
 * instead.
 */
export async function downloadCsvSafely(
  url: string,
  filename: string,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const res = await apiRequest("GET", url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    onError(err instanceof Error ? err.message : "Export failed");
  }
}

export function explainDisposition(h: { poolDisposition: string; achievementPct: string | number | null | undefined }): string {
  const pct = formatPkr(h.achievementPct);
  switch (h.poolDisposition) {
    case "distributed":
      return `Target fully met (${pct}%) — pool + bonus distributed: captain 30%, members 70%.`;
    case "partial":
      return `Reached ${pct}% of target — pool distributed equally among members; bonus forfeited.`;
    case "voided":
      return `0% progress — pool voided, nothing distributed.`;
    default:
      return `Disposition: ${h.poolDisposition} (${pct}% achieved).`;
  }
}
