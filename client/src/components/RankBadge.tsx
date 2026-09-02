/**
 * RankBadge — THORX v3 (spec F.4)
 * Displays an E-S rank tier badge. Used across profile, leaderboard,
 * guild roster, application cards, admin tables.
 * NEVER shows old Urdu rank names.
 */
import { cn } from "@/lib/utils";

const RANK_CONFIG: Record<string, { hex: string; bg: string; label: string }> = {
  "E-Rank": { hex: "#71717a", bg: "#f4f4f5", label: "E" },
  "D-Rank": { hex: "#16a34a", bg: "#f0fdf4", label: "D" },
  "C-Rank": { hex: "#2563eb", bg: "#eff6ff", label: "C" },
  "B-Rank": { hex: "#7c3aed", bg: "#f5f3ff", label: "B" },
  "A-Rank": { hex: "#ea580c", bg: "#fff7ed", label: "A" },
  "S-Rank": { hex: "#dc2626", bg: "#fef2f2", label: "S" },
};

const SIZE_MAP = {
  sm: { badge: "h-5 px-1.5 text-[10px] gap-0.5" },
  md: { badge: "h-7 px-2 text-xs gap-1" },
  lg: { badge: "h-9 px-3 text-sm gap-1.5" },
};

interface RankBadgeProps {
  rank: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function RankBadge({ rank, size = "md", showLabel = true, className }: RankBadgeProps) {
  const cfg = RANK_CONFIG[rank] ?? RANK_CONFIG["E-Rank"];
  const sz = SIZE_MAP[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-bold border select-none",
        sz.badge,
        className
      )}
      style={{ color: cfg.hex, backgroundColor: cfg.bg, borderColor: cfg.hex + "40" }}
    >
      {showLabel && <span>{rank}</span>}
    </span>
  );
}

export default RankBadge;
