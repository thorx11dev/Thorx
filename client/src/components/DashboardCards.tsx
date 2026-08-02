/**
 * DashboardCards — THORX v3 (spec F.2, updated Phase 3 redesign)
 * Every role (simple user, guild member, captain) sees the same 3 standardized
 * primary cards first — TX-Points, Referral Balance, Performance Rank — rendered
 * by the shared <StandardThreeCards> below so the content and markup are
 * identical regardless of rank/tier. Each role then keeps its own additional
 * cards after those three:
 *   'simple'  -> + Withdrawal Value, Join-a-Guild CTA
 *   'member'  -> + My Weekly Contribution, Guild Progress, Sunday Bonus Status
 *   'captain' -> + Guild GPS Rank, Team Roster, Pending Requests, Weekly Progress, My Captain Earnings
 *
 * Invariant 3: "Vault" / "Locked Points" must NEVER appear in this component's
 * rendered text. Approved user-facing terms: "Guild Weekly Bonus Pool" / "Sunday Bonus".
 * Invariant 8: the Rs. amount of the pool is never shown here before it is credited —
 * only progress toward the points target and a qualitative status.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Zap, Wallet, Users, Gift, Shield, Crown, Clock, UserCog, Bell } from "lucide-react";
import { PSProgressCard } from "@/components/PSProgressCard";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import TechnicalLabel from "@/components/ui/technical-label";
import { cn } from "@/lib/utils";

function CardShell({ children, className, testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "group split-card bg-gradient-to-br from-card to-card/80 border-2 border-muted-foreground/20 hover:border-primary/30 p-6 text-left transition-all duration-300 shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function CardHead({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-start justify-between mb-3">
      <Icon className="w-7 h-7 text-primary" />
      <TechnicalLabel text={label} className="text-muted-foreground text-xs" />
    </div>
  );
}

/**
 * The 3 primary metrics cards every role sees, identically:
 * TX-Points, Referral Balance, Performance Rank. Extracted so the markup,
 * labels, and data-testids can never drift between roles (Phase 3 redesign
 * requirement: "regardless of user role, ALL users must see the exact same
 * 3 primary metrics cards").
 */
function StandardThreeCards({
  txPoints,
  performanceScore,
  userRankTier,
  streakDays,
  referralStats,
  isReferralStatsLoading,
  isReferralStatsError,
  refetchReferralStats,
  navigate,
}: {
  txPoints: number;
  performanceScore: number;
  userRankTier: string;
  streakDays: number;
  referralStats?: { count: number; totalEarned: string };
  isReferralStatsLoading: boolean;
  isReferralStatsError: boolean;
  refetchReferralStats: () => void;
  navigate: (to: string) => void;
}) {
  return (
    <>
      <CardShell testId="card-tx-points">
        <CardHead icon={Zap} label="TX-POINTS BALANCE" />
        <p className="text-2xl md:text-3xl font-black text-primary mb-1">{txPoints.toLocaleString()} pts</p>
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Available Points</p>
      </CardShell>

      <CardShell testId="card-referral-balance">
        <CardHead icon={Gift} label="REFERRAL BALANCE" />
        <p className="text-2xl md:text-3xl font-black text-foreground mb-1">TX-Points Balance</p>
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-3">
          {isReferralStatsLoading
            ? <Skeleton className="h-3 w-24 rounded" />
            : isReferralStatsError
            ? <button onClick={() => refetchReferralStats()} className="text-red-400 text-xs font-bold uppercase tracking-wider hover:underline">Failed to load — Retry</button>
            : `${referralStats?.count ?? 0} referral${(referralStats?.count ?? 0) === 1 ? "" : "s"}`}
        </p>
        <button
          onClick={() => navigate("/referrals")}
          className="text-xs font-black uppercase tracking-wider text-primary hover:underline"
          data-testid="button-withdraw-referral-cash"
        >
          Withdraw Cash →
        </button>
      </CardShell>

      <div data-testid="card-performance-rank">
        <PSProgressCard performanceScore={performanceScore} userRankTier={userRankTier} streakDays={streakDays} />
      </div>
    </>
  );
}

// Sunday 23:59 PKT (UTC+5) countdown.
function timeUntilSundayPkt(now: Date): { days: number; hours: number } {
  const pktNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const dayOfWeek = pktNow.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const target = new Date(Date.UTC(pktNow.getUTCFullYear(), pktNow.getUTCMonth(), pktNow.getUTCDate() + daysUntilSunday, 23, 59, 0));
  let diffMs = target.getTime() - pktNow.getTime();
  if (diffMs < 0) diffMs += 7 * 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return { days, hours };
}

export function DashboardCards() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const guildRole = (user as any)?.guildRole ?? "simple";
  const guildId = (user as any)?.guildId ?? null;
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

  const { data: guild, isLoading: isGuildLoading, isError: isGuildError, refetch: refetchGuild } = useQuery<any>({
    queryKey: ["/api/guilds", guildId, "dashboard-card"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/guilds/${guildId}`);
      const d = await res.json();
      return d.guild;
    },
    enabled: !!guildId,
    refetchInterval: 30000,
  });

  const { data: members = [], isLoading: isMembersLoading, isError: isMembersError, refetch: refetchMembers } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "members", "dashboard-card"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/guilds/${guildId}/members`);
      const d = await res.json();
      return d.members ?? [];
    },
    enabled: !!guildId && guildRole !== "simple",
    refetchInterval: 30000,
  });

  const grid = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-12";

  const standardCardsProps = {
    txPoints,
    performanceScore,
    userRankTier,
    streakDays,
    referralStats,
    isReferralStatsLoading,
    isReferralStatsError,
    refetchReferralStats,
    navigate,
  };

  // ─────────────────────────── SIMPLE USER ───────────────────────────
  if (guildRole !== "member" && guildRole !== "captain") {
    return (
      <div className={grid}>
        <StandardThreeCards {...standardCardsProps} />

        <CardShell testId="card-withdrawal-value">
          <CardHead icon={Wallet} label="WITHDRAWAL VALUE" />
          {/* Audit finding 1-A: Rs. PKR values must only appear inside the payout
              flow (Conversion Room). Show a neutral prompt here instead. */}
          <p className="text-2xl md:text-3xl font-black text-foreground mb-1">—</p>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
            Enter Payout to see value
          </p>
        </CardShell>

        <CardShell testId="card-join-guild-cta" className="sm:col-span-2 lg:col-span-1">
          <CardHead icon={Shield} label="ENGINE C" />
          <p className="text-sm font-black text-foreground mb-1">Join a Guild — Unlock Engine C</p>
          <p className="text-xs text-muted-foreground mb-3">
            Guild members earn a share of tasks completed plus a shot at the Guild Weekly Bonus Pool 🎁
          </p>
          <button
            onClick={() => navigate("/dashboard?tab=guild")}
            className="text-xs font-black uppercase tracking-wider text-primary hover:underline"
            data-testid="button-browse-guilds"
          >
            Browse Guilds →
          </button>
        </CardShell>
      </div>
    );
  }

  // ─────────────────────────── GUILD MEMBER ───────────────────────────
  if (guildRole === "member") {
    const me = members.find((m: any) => m.userId === (user as any)?.id);
    const sorted = [...members].sort((a, b) => (b.weeklyPointsContributed ?? 0) - (a.weeklyPointsContributed ?? 0));
    const myPosition = sorted.findIndex((m: any) => m.userId === (user as any)?.id) + 1;
    const weeklyTarget = guild?.weeklyTarget ?? 0;
    const currentWeeklyPoints = guild?.currentWeeklyPoints ?? 0;
    const guildProgressPct = weeklyTarget > 0 ? Math.min(100, (currentWeeklyPoints / weeklyTarget) * 100) : 0;
    const onTrack = guildProgressPct >= 100;
    const { days, hours } = timeUntilSundayPkt(new Date());

    return (
      <div className={grid}>
        <StandardThreeCards {...standardCardsProps} />

        <CardShell testId="card-weekly-contribution">
          <CardHead icon={Zap} label="MY WEEKLY CONTRIB" />
          <p className="text-2xl md:text-3xl font-black text-foreground mb-1">
            {isMembersLoading
              ? <Skeleton className="h-8 w-32 rounded" />
              : isMembersError
              ? <button onClick={() => refetchMembers()} className="text-red-400 text-base font-bold uppercase tracking-wider hover:underline">Retry</button>
              : `${(me?.weeklyPointsContributed ?? 0).toLocaleString()} pts this wk`}
          </p>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
            {isMembersLoading
              ? <Skeleton className="h-3 w-28 rounded mt-1" />
              : isMembersError
              ? <span className="text-red-400">Failed to load</span>
              : myPosition > 0 ? `Rank #${myPosition} in guild` : "Not ranked yet"}
          </p>
        </CardShell>

        <CardShell testId="card-guild-progress">
          <CardHead icon={Shield} label="GUILD PROGRESS" />
          {isGuildLoading
            ? <><Skeleton className="h-6 w-28 rounded mb-2" /><Skeleton className="h-2 w-full rounded" /></>
            : isGuildError
            ? <button onClick={() => refetchGuild()} className="text-xs text-red-400 font-bold uppercase tracking-wider hover:underline">Failed to load — Retry</button>
            : <>
                <p className="text-lg font-black text-foreground mb-2">
                  {currentWeeklyPoints.toLocaleString()} / {weeklyTarget.toLocaleString()}
                </p>
                <Progress value={guildProgressPct} className="h-2" />
              </>}
        </CardShell>

        <CardShell testId="card-sunday-bonus-status" className="sm:col-span-2 lg:col-span-1">
          <CardHead icon={Clock} label="SUNDAY BONUS STATUS" />
          <p className="text-sm font-black text-foreground mb-1">
            {onTrack ? "🎉 Target hit — bonus incoming!" : "⏳ In Progress — Keep going!"}
          </p>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
            Sunday 11:59 PM PKT — {days}d {hours}h left
          </p>
        </CardShell>
      </div>
    );
  }

  // ─────────────────────────── GUILD CAPTAIN ───────────────────────────
  const active = members.filter((m: any) => m.status === "active");
  const inactive = active.filter((m: any) => (m.weeklyPointsContributed ?? 0) === 0);
  const pending = members.filter((m: any) => m.status === "pending");
  const guildPerformanceScore = guild?.guildPerformanceScore ?? 0;
  const weeklyTarget = guild?.weeklyTarget ?? 0;
  const currentWeeklyPoints = guild?.currentWeeklyPoints ?? 0;
  const weeklyProgressPct = weeklyTarget > 0 ? Math.min(100, (currentWeeklyPoints / weeklyTarget) * 100) : 0;
  const { days: daysLeft } = timeUntilSundayPkt(new Date());

  return (
    <div className={grid}>
      <StandardThreeCards {...standardCardsProps} />

      <CardShell testId="card-guild-gps-rank">
        <CardHead icon={Crown} label="GUILD GPS" />
        <p className="text-2xl md:text-3xl font-black text-foreground mb-1">
          {guildPerformanceScore.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
          Guild Performance Score
        </p>
      </CardShell>

      <CardShell testId="card-team-roster">
        <CardHead icon={Users} label="TEAM ROSTER" />
        <p className="text-2xl md:text-3xl font-black text-foreground mb-1">
          {isMembersLoading
            ? <Skeleton className="h-8 w-36 rounded" />
            : `${active.length} / ${guild?.memberCapacity ?? 10} members`}
        </p>
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
          {isMembersLoading
            ? <Skeleton className="h-3 w-24 rounded mt-1" />
            : `${inactive.length} inactive (0 pts)`}
        </p>
      </CardShell>

      <CardShell testId="card-pending-requests">
        <CardHead icon={Bell} label="PENDING REQUESTS" />
        <p className="text-2xl md:text-3xl font-black text-foreground mb-1">
          {isMembersLoading
            ? <Skeleton className="h-8 w-16 rounded" />
            : pending.length > 0 ? `🔴 ${pending.length} new` : "0 new"}
        </p>
        <button
          onClick={() => navigate("/dashboard?tab=guild")}
          className="text-xs font-black uppercase tracking-wider text-primary hover:underline"
          data-testid="button-review-queue"
        >
          Review Queue →
        </button>
      </CardShell>

      <CardShell testId="card-weekly-progress">
        <CardHead icon={Shield} label="WEEKLY PROGRESS" />
        {isGuildLoading
          ? <><Skeleton className="h-6 w-28 rounded mb-2" /><Skeleton className="h-2 w-full rounded mb-1" /><Skeleton className="h-3 w-20 rounded" /></>
          : <>
              <p className="text-lg font-black text-foreground mb-2">
                {currentWeeklyPoints.toLocaleString()} / {weeklyTarget.toLocaleString()}
              </p>
              <Progress value={weeklyProgressPct} className="h-2 mb-1" />
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{daysLeft} days left</p>
            </>}
      </CardShell>

      <CardShell testId="card-captain-earnings" className="sm:col-span-2 lg:col-span-1">
        <CardHead icon={UserCog} label="MY CAPTAIN EARNINGS" />
        <p className="text-sm font-black text-foreground mb-3">Referral Cash Earned</p>
        <button
          onClick={() => navigate("/referrals")}
          className="text-xs font-black uppercase tracking-wider text-primary hover:underline"
          data-testid="button-withdraw-captain"
        >
          Withdraw →
        </button>
      </CardShell>
    </div>
  );
}
