/**
 * ReferralAnalytics — THORX v3 (spec F.15)
 * L1-only referral stats, commission leaderboard, and weekly summary.
 * Spec: only L1 commissions (referee directly referred by user).
 * L2 commission system is write-frozen.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { RankBadge } from "@/components/RankBadge";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, DollarSign, ChevronUp, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalCommissionPaid: string;
  pendingCommission: string;
  thisWeekCommission: string;
  lastWeekCommission: string;
  thisMonthCommission: string;
  avgCommissionPerReferral: string;
  withdrawalFeeCommission: string;
  earnEventCommission: string;
}

interface ReferralLeaderboardEntry {
  userId: string;
  email: string;
  firstName: string;
  userRankTier: string;
  referralCount: number;
  activeCount: number;
  totalCommission: string;
  lastReferralAt: string | null;
}

export function ReferralAnalytics() {
  const { data: stats } = useQuery<ReferralStats>({
    queryKey: ["/api/admin/referrals/stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/referrals/stats");
      return r.json();
    },
  });

  const { data: leaderboard = [] } = useQuery<ReferralLeaderboardEntry[]>({
    queryKey: ["/api/admin/referrals/leaderboard"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/referrals/leaderboard?limit=50");
      const d = await r.json();
      return d.leaderboard ?? d;
    },
  });

  // Week-over-week commission trend. Both values come straight from the DB
  // (no client-side derivation of money), we only compute the display delta.
  const thisWeekNum = stats ? parseFloat(stats.thisWeekCommission || "0") : 0;
  const lastWeekNum = stats ? parseFloat(stats.lastWeekCommission || "0") : 0;
  const weekGrowthPct = lastWeekNum > 0
    ? Math.round(((thisWeekNum - lastWeekNum) / lastWeekNum) * 1000) / 10
    : (thisWeekNum > 0 ? 100 : 0);

  const statCards = stats ? [
    { label: "Total Referrals (L1)",   value: stats.totalReferrals,                 icon: <Users size={18} />,      color: "text-blue-600" },
    { label: "Active Referrals (L1)",  value: stats.activeReferrals,                icon: <TrendingUp size={18} />, color: "text-emerald-600" },
    { label: "Commission Paid",        value: `Rs.${parseFloat(stats.totalCommissionPaid || "0").toFixed(2)}`, icon: <DollarSign size={18} />, color: "text-orange-600" },
    { label: "This Month",             value: `Rs.${parseFloat(stats.thisMonthCommission || "0").toFixed(2)}`, icon: <ChevronUp size={18} />,  color: "text-purple-600" },
    {
      label: "This Week",
      value: `Rs.${thisWeekNum.toFixed(2)}`,
      icon: <Award size={18} />,
      color: "text-zinc-700",
      badge: lastWeekNum > 0 || thisWeekNum > 0
        ? `${weekGrowthPct >= 0 ? "+" : ""}${weekGrowthPct}% vs last week`
        : undefined,
      badgeColor: weekGrowthPct >= 0 ? "text-emerald-600" : "text-red-500",
    },
    { label: "Avg / Referral",         value: `Rs.${parseFloat(stats.avgCommissionPerReferral || "0").toFixed(2)}`, icon: <Users size={18} />, color: "text-zinc-500" },
  ] : [];

  // Commission source breakdown — surfaces the two payout channels separately
  // (withdrawal-fee share vs. per-earn-event commission) so the team can see
  // which channel actually drives referral revenue.
  const withdrawalShare = stats ? parseFloat(stats.withdrawalFeeCommission || "0") : 0;
  const earnShare = stats ? parseFloat(stats.earnEventCommission || "0") : 0;
  const sourceTotal = withdrawalShare + earnShare;
  const withdrawalPct = sourceTotal > 0 ? Math.round((withdrawalShare / sourceTotal) * 100) : 0;
  const earnPct = sourceTotal > 0 ? 100 - withdrawalPct : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black">Referral Analytics</h2>
        <p className="text-sm text-zinc-500 mt-0.5">L1 (direct) referral commissions only. L2 write system is frozen per spec.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {statCards.map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className={cn("mb-1", s.color)}>{s.icon}</div>
            <div className="text-xl font-black">{s.value}</div>
            <div className="text-[11px] text-zinc-400">{s.label}</div>
            {"badge" in s && s.badge ? (
              <div className={cn("text-[10px] font-semibold mt-1", (s as any).badgeColor)}>{s.badge}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Commission source breakdown — new: shows which payout channel drives revenue */}
      {stats && sourceTotal > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="text-sm font-bold mb-2">Commission Sources</div>
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100">
            <div className="bg-orange-500" style={{ width: `${withdrawalPct}%` }} />
            <div className="bg-blue-500" style={{ width: `${earnPct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
              Withdrawal fee share — Rs.{withdrawalShare.toFixed(2)} ({withdrawalPct}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Per-earn commission — Rs.{earnShare.toFixed(2)} ({earnPct}%)
            </span>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="p-3 border-b border-zinc-100">
          <div className="text-sm font-bold">Top Referrers (L1)</div>
          <div className="text-xs text-zinc-400 mt-0.5">Sorted by total L1 commission earned</div>
        </div>
        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-sm">No referral data yet.</div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {leaderboard.map((entry, idx) => (
              <div key={entry.userId} className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-zinc-50">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-black text-zinc-300 w-6 shrink-0">#{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{entry.firstName || entry.email}</span>
                      <RankBadge rank={entry.userRankTier || "E-Rank"} size="sm" showLabel={false} />
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {entry.referralCount} referred · {entry.activeCount} active
                      {entry.lastReferralAt ? ` · Last ${formatDistanceToNow(new Date(entry.lastReferralAt), { addSuffix: true })}` : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-emerald-600">Rs.{parseFloat(entry.totalCommission || "0").toFixed(2)}</div>
                  <div className="text-[10px] text-zinc-400">commission</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReferralAnalytics;
