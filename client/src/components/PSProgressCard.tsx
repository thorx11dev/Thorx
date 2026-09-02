/**
 * PSProgressCard — THORX v3 (spec F.5)
 * Shows PS progress bar, rank, streak, and what the next rank unlocks.
 */
import { Flame } from "lucide-react";
import { RankBadge } from "@/components/RankBadge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface PSThreshold { min: number; max: number | null; next: string | null; unlocks: string }

export const PS_THRESHOLDS: Record<string, PSThreshold> = {
  "E-Rank": { min: 0,     max: 999,   next: "D-Rank", unlocks: "Engine B Surveys (C-Rank)" },
  "D-Rank": { min: 1000,  max: 2999,  next: "C-Rank", unlocks: "Engine B Surveys (C-Rank)" },
  "C-Rank": { min: 3000,  max: 5999,  next: "B-Rank", unlocks: "Join guilds that require B-Rank or higher (B-Rank)" },
  "B-Rank": { min: 6000,  max: 9999,  next: "A-Rank", unlocks: "Wider Card variance ±5% (A-Rank)" },
  "A-Rank": { min: 10000, max: 19999, next: "S-Rank", unlocks: "Auto-approved withdrawals + widest Card variance ±10% (S-Rank)" },
  "S-Rank": { min: 20000, max: null,  next: null,      unlocks: "All features unlocked!" },
};

interface PSProgressCardProps {
  performanceScore: number;
  userRankTier: string;
  streakDays?: number;
  className?: string;
}

export function PSProgressCard({ performanceScore, userRankTier, streakDays = 0, className }: PSProgressCardProps) {
  const tier = PS_THRESHOLDS[userRankTier] ?? PS_THRESHOLDS["E-Rank"];
  const score = Number.isFinite(Number(performanceScore)) ? Number(performanceScore) : 0;

  let pct = 0;
  let psToNext: number | null = null;
  if (tier.max !== null) {
    const range = tier.max - tier.min + 1;
    const progress = Math.max(0, score - tier.min);
    pct = Math.min(100, (progress / range) * 100);
    psToNext = tier.max + 1 - score;
  } else {
    pct = 100;
  }

  const streakLabel = streakDays >= 3 ? `+20 PS/day bonus active` :
                      streakDays === 2 ? `+10 PS/day bonus active` :
                      streakDays === 1 ? `+5 PS/day bonus active` : "Start a streak for PS bonus";

  return (
    <div className={cn("group bg-white border-2 border-black rounded-2xl p-6 md:p-8 space-y-3 transition-all duration-300 hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)]", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RankBadge rank={userRankTier} size="md" />
          <span className="text-sm font-bold text-foreground">
            {score.toLocaleString()} PS
          </span>
        </div>
        {streakDays > 0 && (
          <span className="text-xs flex items-center gap-1 text-primary font-bold">
            <Flame size={12} />
            {streakDays}-day streak
          </span>
        )}
      </div>

      <div className="space-y-1">
        <Progress value={pct} className="h-2.5 border border-black/15" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{tier.min.toLocaleString()} PS</span>
          <span>{tier.max !== null ? (tier.max + 1).toLocaleString() + " PS" : "MAX"}</span>
        </div>
      </div>

      {psToNext !== null && tier.next && (
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{psToNext.toLocaleString()} more PS</span> to reach {tier.next}
        </p>
      )}

      {streakDays > 0 && (
        <p className="text-xs text-primary">🔥 {streakLabel}</p>
      )}

    </div>
  );
}

export default PSProgressCard;
