/**
 * RankBadge — THORX v3 (spec F.4)
 * Displays an E-S rank tier badge. Used across profile, leaderboard,
 * guild roster, application cards, admin tables.
 * NEVER shows old Urdu rank names.
 */
import { cn } from "@/lib/utils";
import { Shield, Crown } from "lucide-react";

const RANK_CONFIG: Record<string, { hex: string; bg: string; label: string; useCrown: boolean }> = {
  "E-Rank": { hex: "#71717a", bg: "#f4f4f5", label: "E", useCrown: false },
  "D-Rank": { hex: "#16a34a", bg: "#f0fdf4", label: "D", useCrown: false },
  "C-Rank": { hex: "#2563eb", bg: "#eff6ff", label: "C", useCrown: false },
  "B-Rank": { hex: "#7c3aed", bg: "#f5f3ff", label: "B", useCrown: false },
  "A-Rank": { hex: "#D97757", bg: "#D97757", label: "A", useCrown: true },
  "S-Rank": { hex: "#dc2626", bg: "#fef2f2", label: "S", useCrown: true },
};

const SIZE_MAP = {
  sm: { badge: "h-5 px-1.5 text-[10px] gap-0.5", icon: 10 },
  md: { badge: "h-7 px-2 text-xs gap-1",          icon: 12 },
  lg: { badge: "h-9 px-3 text-sm gap-1.5",         icon: 14 },
};

interface RankBadgeProps {
  rank: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showIcon?: boolean;
  className?: string;
}

export function RankBadge({ rank, size = "md", showLabel = true, showIcon = true, className }: RankBadgeProps) {
  const cfg = RANK_CONFIG[rank] ?? RANK_CONFIG["E-Rank"];
  const sz = SIZE_MAP[size];
  const Icon = cfg.useCrown ? Crown : Shield;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-bold border select-none",
        sz.badge,
        className
      )}
      style={{ color: cfg.hex, backgroundColor: cfg.bg, borderColor: cfg.hex + "40" }}
    >
      {showIcon && <Icon size={sz.icon} style={{ color: cfg.hex }} />}
      {showLabel && <span>{rank}</span>}
    </span>
  );
}

export default RankBadge;
