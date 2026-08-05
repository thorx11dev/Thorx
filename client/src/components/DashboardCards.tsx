/**
 * DashboardCards — THORX v3 (spec F.2, Phase 3 redesign — locked to 3 cards)
 *
 * Every role (simple user, guild member, captain) sees EXACTLY the same 3
 * primary metric cards, in the same order, with identical markup — never
 * more, never fewer, regardless of rank/tier/guild role:
 *   1. TX-Points Balance
 *   2. Referrals (total referral count)
 *   3. Performance Rank (PS Score)
 *
 * Role-specific detail (guild progress, team roster, pending requests,
 * captain earnings, weekly contribution, etc.) is NOT duplicated here — it
 * lives in the dedicated Engine C / Guild views (GuildDiscoveryPanel,
 * GuildMemberPanel, CaptainPortal), which every role can already reach from
 * the portal's Guild tab. Nothing is lost by keeping this grid to 3 cards.
 *
 * Invariant 3: "Vault" / "Locked Points" must NEVER appear in this component's
 * rendered text. Approved user-facing terms: "Guild Weekly Bonus Pool" / "Sunday Bonus".
 * Invariant 1-A/1-B: raw Rs. (PKR) amounts must only appear inside the
 * Conversion Room / payout flow — headline figures here use TX-Points instead.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Zap, Users } from "lucide-react";
import { PSProgressCard } from "@/components/PSProgressCard";
import { Skeleton } from "@/components/ui/skeleton";
import TechnicalLabel from "@/components/ui/technical-label";
import { cn } from "@/lib/utils";

function CardShell({ children, className, testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "group bg-white border-2 border-black rounded-2xl p-6 md:p-8 text-left transition-all duration-300 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function CardHead({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg group-hover:bg-primary/20 transition-all duration-300">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <TechnicalLabel text={label} className="text-muted-foreground text-xs pt-1" />
    </div>
  );
}

export function DashboardCards() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const txPoints = (user as any)?.txPointsBalance ?? 0;
  const performanceScore = (user as any)?.performanceScore ?? 0;
  const userRankTier = (user as any)?.userRankTier ?? "E-Rank";
  const streakDays = (user as any)?.streakDays ?? 0;
  // balanceCashPkr removed — field not sent by /api/user and PKR values must
  // only appear inside the Conversion Room / payout flow (audit finding 1-A, 1-B).

  const { data: referralStats, isLoading: isReferralStatsLoading, isError: isReferralStatsError, refetch: refetchReferralStats } = useQuery<{ count: number; totalEarned: string }>({
    queryKey: ["/api/referrals", "dashboard-card"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/referrals");
      const d = await res.json();
      return d.stats ?? { count: 0, totalEarned: "0" };
    },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-12">
      <CardShell testId="card-tx-points">
        <CardHead icon={Zap} label="TX-POINTS BALANCE" />
        <p className="text-3xl md:text-4xl font-black text-primary mb-1 tracking-tighter">{txPoints.toLocaleString()} pts</p>
      </CardShell>

      <CardShell testId="card-referral-balance">
        <CardHead icon={Users} label="REFERRALS" />
        <div className="text-3xl md:text-4xl font-black text-foreground mb-1 tracking-tighter">
          {isReferralStatsLoading
            ? <Skeleton className="h-8 w-20 rounded" />
            : isReferralStatsError
            ? <button onClick={() => refetchReferralStats()} className="text-red-400 text-base font-bold uppercase tracking-wider hover:underline">Retry</button>
            : Number(referralStats?.count ?? 0).toLocaleString()}
        </div>
      </CardShell>

      <div data-testid="card-performance-rank">
        <PSProgressCard performanceScore={performanceScore} userRankTier={userRankTier} streakDays={streakDays} />
      </div>
    </div>
  );
}
