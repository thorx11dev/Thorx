// ADMIN_PKR_DISPLAY: intentional — the admin/founder portal displays raw PKR
// values (₨ prefix, PKR labels) for business accounting purposes. This is the
// internal view and is explicitly excluded from the Points-Only Mandate that
// applies to the user-facing portal. Do not convert these to TX-Points.
import React from "react";
import Decimal from "decimal.js";
import { useQuery } from "@tanstack/react-query";
import { Users, Activity, DollarSign, TrendingUp, TrendingDown, Minus, Clock, UserCheck, BarChart3, AlertTriangle, Network, ShieldAlert, GitBranch, Coins, UserPlus, Award } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SystemHealthCard } from "./SystemHealthCard";
import { FounderProfitCard } from "./FounderProfitCard";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtendedMetrics {
  activeUsers: number | string;
  totalEarnings: string;
  pendingWithdrawalTotal: string;
  pendingWithdrawalCount: number;
  oldestPendingDays: number | null;
  unverifiedCreditTotal: string;
  unverifiedCreditCount: number;
  userGrowthThisWeek: number;
  userGrowthLastWeek: number;
  userGrowthRate: number;
  networkL1Total: number;
  totalReferrals: number;
  totalCommissionsPaid: string;
  teamActivity24h: number;
  teamActivityAvg7d: number;
  mostActiveTeamMember: string | null;
  totalUsers: number;
}

interface AnalyticsPoint {
  date: string;
  count: number;
  amount: string;
}

// H-04/H-05: engine revenue is PKR money — the server returns Decimal-fixed
// strings, never plain numbers. Convert via Decimal for display/arithmetic.
interface EngineRevenue {
  Engine_A: string;
  Engine_B: string;
  Engine_C: string;
  Indirect: string;
}

// ── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  title, value, subtitle, icon: Icon, trend, variant = "white", delay = 0
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  variant?: "accent" | "dark" | "white" | "warning" | "danger";
  delay?: number;
}) {
  const styles: Record<string, string> = {
    accent: "bg-[#141413] text-white border-[#141413]",
    dark:   "bg-zinc-900 text-white border-zinc-800",
    white:  "bg-white text-foreground border-zinc-200",
    warning:"bg-amber-50 text-foreground border-amber-200",
    danger: "bg-red-50 text-foreground border-red-200",
  };
  const isLight = variant === "white" || variant === "warning" || variant === "danger";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "border-[1.5px] rounded-[2rem] p-5 space-y-3 flex flex-col justify-between min-h-[130px]",
        styles[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("p-2 rounded-full border", isLight ? "bg-zinc-100 border-zinc-200" : "bg-white/10 border-white/20")}>
          <Icon className={cn("w-4 h-4", isLight ? "text-foreground" : "text-white")} />
        </div>
        <span className={cn("text-[9px] font-black uppercase tracking-widest text-right max-w-[120px] leading-tight", isLight ? "text-muted-foreground" : "text-white/60")}>{title}</span>
      </div>
      <div>
        <p className={cn("text-2xl font-black tracking-tight", isLight ? "text-foreground" : "text-white")}>{value}</p>
        {subtitle && <p className={cn("text-[10px] font-bold mt-0.5 leading-snug", isLight ? "text-muted-foreground" : "text-white/60")}>{subtitle}</p>}
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-black mt-1.5",
            isLight
              ? trend.direction === "up" ? "text-emerald-600" : trend.direction === "down" ? "text-red-500" : "text-muted-foreground"
              : "text-white/80"
          )}>
            {trend.direction === "up" ? <TrendingUp className="w-3 h-3" /> : trend.direction === "down" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {trend.label}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{text}</p>
  );
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white border-[1.5px] border-zinc-200 rounded-[2rem] overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-black uppercase tracking-widest text-foreground">{title}</span>
      </div>
      <div className="p-5 h-[220px]">{children}</div>
    </div>
  );
}

// ── Referral Network Mini-Card ────────────────────────────────────────────────
// THORX v3: L1-only referral system. L2 is write-frozen and not displayed.

function ReferralNetworkCard({ l1, totalReferrals, delay }: { l1: number; totalReferrals: number; delay: number }) {
  const conversionPct = totalReferrals > 0 ? Math.round((l1 / totalReferrals) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white border-[1.5px] border-zinc-200 rounded-[2rem] p-5 space-y-4"
    >
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-full border bg-zinc-100 border-zinc-200">
          <Network className="w-4 h-4 text-foreground" />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Referral Network</span>
      </div>

      {/* Total referrals hero */}
      <div>
        <p className="text-2xl font-black text-foreground">{totalReferrals.toLocaleString()}</p>
        <p className="text-[10px] font-bold text-muted-foreground">total referred users</p>
      </div>

      {/* L1 / Conversion grid */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-2 bg-zinc-50 rounded-xl border border-zinc-100">
          <p className="text-sm font-black text-foreground">{l1}</p>
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Active Referrers</p>
          <p className="text-[8px] text-muted-foreground/70 mt-0.5">earned commission</p>
        </div>
        <div className="p-2 bg-zinc-50 rounded-xl border border-zinc-100">
          <p className="text-sm font-black text-foreground">{conversionPct}%</p>
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Conversion</p>
          <p className="text-[8px] text-muted-foreground/70 mt-0.5">referrers earning</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Team Activity Card ────────────────────────────────────────────────────────

function TeamActivityCard({ activity24h, activityAvg7d, mostActive, delay }: { activity24h: number; activityAvg7d: number; mostActive: string | null; delay: number }) {
  const isQuiet = activity24h === 0 && activityAvg7d > 2;
  const isSurge = activity24h > activityAvg7d * 3 && activityAvg7d > 0;
  const pctOfAvg = activityAvg7d > 0 ? Math.round((activity24h / activityAvg7d) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "border-[1.5px] rounded-[2rem] p-5 space-y-4",
        isQuiet  ? "bg-amber-50 border-amber-200" :
        isSurge  ? "bg-blue-50 border-blue-200" :
                   "bg-white border-zinc-200"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-full border bg-zinc-100 border-zinc-200">
          <Activity className="w-4 h-4 text-foreground" />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Team Activity</span>
      </div>

      <div>
        <p className="text-2xl font-black text-foreground">{activity24h.toLocaleString()}</p>
        <p className="text-[10px] font-bold text-muted-foreground">
          actions today
          {activityAvg7d > 0 && ` · avg ${activityAvg7d}/day`}
          {pctOfAvg > 0 && ` · ${pctOfAvg}% of avg`}
        </p>
      </div>

      {mostActive && (
        <div className="px-3 py-2 bg-white/70 rounded-xl border border-white/80">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Most active today</p>
          <p className="text-sm font-black text-foreground">{mostActive}</p>
        </div>
      )}

      {isQuiet && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-100 rounded-xl">
          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
          <p className="text-[9px] font-black text-amber-700">No admin activity today</p>
        </div>
      )}
      {isSurge && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 rounded-xl">
          <TrendingUp className="w-3 h-3 text-blue-600 shrink-0" />
          <p className="text-[9px] font-black text-blue-700">Activity spike — {Math.round(activity24h / Math.max(activityAvg7d, 1))}× above average</p>
        </div>
      )}
    </motion.div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = React.useState("7d");

  // NOTE: `activeUsers` from this endpoint is actually NEW REGISTRATIONS in the
  // selected date window (getUsersCountInRange counts by createdAt). We label it
  // as "New Registrations" to be accurate. Extended metrics are always all-time.
  const { data: metrics, isLoading: metricsLoading, isError: metricsError } = useQuery<ExtendedMetrics>({
    queryKey: ["/api/team/metrics", dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/team/metrics?range=${dateRange}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: analytics, isError: analyticsError } = useQuery<AnalyticsPoint[]>({
    queryKey: QUERY_KEYS.adminAnalytics(dateRange),
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics?range=${dateRange}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: engineRevenue, isError: engineRevenueError } = useQuery<EngineRevenue>({
    queryKey: QUERY_KEYS.adminEngineRevenue(dateRange),
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/engine-revenue?range=${dateRange}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch engine revenue");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const isFounder = user?.role === "founder";

  // Derived values — all correctly sourced
  const newRegistrationsInWindow = Number(metrics?.activeUsers ?? 0);  // count of users registered in selected window
  // H-08: Use Number() on API string values — display-only, no arithmetic on these
  // floats. The server now returns Decimal-serialized strings (H-04/H-05 fix).
  const safePkr = (v: string | number | null | undefined) => { try { return new Decimal(String(v ?? "0")).toNumber(); } catch { return 0; } };
  const totalEarnings      = safePkr(metrics?.totalEarnings);
  const pendingTotal       = safePkr(metrics?.pendingWithdrawalTotal);
  const pendingCount       = metrics?.pendingWithdrawalCount ?? 0;
  const oldestDays         = metrics?.oldestPendingDays ?? null;
  const unverifiedTotal    = safePkr(metrics?.unverifiedCreditTotal);
  const unverifiedCount    = metrics?.unverifiedCreditCount ?? 0;
  const growthRate         = metrics?.userGrowthRate ?? 0;
  const thisWeek           = metrics?.userGrowthThisWeek ?? 0;
  const lastWeek           = metrics?.userGrowthLastWeek ?? 0;
  const l1                 = metrics?.networkL1Total ?? 0;
  const totalReferrals     = metrics?.totalReferrals ?? 0;
  const totalCommissions   = safePkr(metrics?.totalCommissionsPaid);
  const activity24h        = metrics?.teamActivity24h ?? 0;
  const activityAvg        = metrics?.teamActivityAvg7d ?? 0;
  const mostActive         = metrics?.mostActiveTeamMember ?? null;
  const totalUsers         = metrics?.totalUsers ?? 0;   // only role='user', active=true

  const chartData = (analytics ?? []).map((item) => {
    const date = new Date(item.date);
    const isHourly = item.date.includes(" ");
    return {
      name: date.toLocaleString("en-US", isHourly
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : { month: "short", day: "numeric" }
      ),
      registrations: item.count,
      revenue: (() => { try { return new Decimal(String(item.amount ?? "0")).toNumber(); } catch { return 0; } })(),
    };
  });

  const rangeLabel = { "24h": "today", "7d": "this week", "30d": "this month", "all": "all time" }[dateRange] ?? dateRange;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Page Header + Date Range Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-foreground">Platform Overview</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Live stats across your entire platform</p>
        </div>
        <ToggleGroup
          type="single"
          value={dateRange}
          onValueChange={(val) => val && setDateRange(val)}
          className="bg-white border-[1.5px] border-zinc-200 rounded-full p-1"
        >
          {["24h", "7d", "30d", "all"].map((range) => (
            <ToggleGroupItem
              key={range}
              value={range}
              className="rounded-full font-black text-[10px] tracking-widest uppercase px-4 h-8 data-[state=on]:bg-black data-[state=on]:text-white"
            >
              {range}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Metrics error banner */}
      {metricsError && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
          <span>⚠ Failed to load platform metrics.</span>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/team/metrics"] })}
            className="ml-auto underline underline-offset-2 hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Analytics error banner — previously computed but never surfaced */}
      {analyticsError && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
          <span>⚠ Failed to load registration/revenue analytics.</span>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminAnalytics(dateRange) })}
            className="ml-auto underline underline-offset-2 hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Engine revenue error banner — previously computed but never surfaced */}
      {engineRevenueError && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
          <span>⚠ Failed to load engine revenue breakdown.</span>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminEngineRevenue(dateRange) })}
            className="ml-auto underline underline-offset-2 hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Section 1: System Health */}
      <section className="space-y-3">
        <SectionLabel text="System Health" />
        <div className={cn("grid gap-5", isFounder ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
          <SystemHealthCard />
          {isFounder && <FounderProfitCard />}
        </div>
      </section>

      {/* Section 2: Core Metrics */}
      <section className="space-y-3">
        <SectionLabel text={`Core Metrics · ${rangeLabel}`} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Revenue"
            value={`₨${totalEarnings.toLocaleString()}`}
            subtitle={`Completed earnings${dateRange !== "all" ? ` · ${rangeLabel}` : ""}`}
            icon={DollarSign}
            variant="accent"
            delay={0}
          />
          <MetricCard
            title="New Registrations"
            value={metricsLoading ? "…" : String(newRegistrationsInWindow)}
            subtitle={`Users who joined ${rangeLabel}`}
            icon={UserPlus}
            variant="white"
            delay={0.05}
            trend={newRegistrationsInWindow > 0 ? { direction: "up", label: `+${newRegistrationsInWindow} new` } : undefined}
          />
          <MetricCard
            title="Total Members"
            value={metricsLoading ? "…" : totalUsers.toLocaleString()}
            subtitle="Active registered user accounts"
            icon={Users}
            variant="white"
            delay={0.1}
          />
          <MetricCard
            title="Pending Payouts"
            value={`₨${pendingTotal.toLocaleString()}`}
            subtitle={`${pendingCount} request${pendingCount !== 1 ? "s" : ""}${oldestDays !== null ? ` · oldest ${oldestDays}d ago` : ""}`}
            icon={Clock}
            variant={oldestDays !== null && oldestDays > 48 ? "warning" : "white"}
            trend={oldestDays !== null && oldestDays > 72 ? { direction: "down", label: `Oldest: ${oldestDays}d overdue` } : undefined}
            delay={0.15}
          />
        </div>
      </section>

      {/* Section 3: Growth & Network */}
      <section className="space-y-3">
        <SectionLabel text="Growth & Network" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* User Growth */}
          <MetricCard
            title="Registration Growth Rate"
            value={`${growthRate > 0 ? "+" : ""}${growthRate}%`}
            subtitle={`Week-over-week · this: ${thisWeek} · last: ${lastWeek}`}
            icon={TrendingUp}
            variant="white"
            trend={
              growthRate > 5  ? { direction: "up",   label: "Growing fast" } :
              growthRate > 0  ? { direction: "up",   label: "Positive growth" } :
              growthRate < -5 ? { direction: "down",  label: "Declining" } :
                                { direction: "flat",  label: "Stable" }
            }
            delay={0.05}
          />

          {/* Referral Network */}
          <ReferralNetworkCard l1={l1} totalReferrals={totalReferrals} delay={0.1} />

          {/* Team Activity */}
          <TeamActivityCard activity24h={activity24h} activityAvg7d={activityAvg} mostActive={mostActive} delay={0.15} />
        </div>
      </section>

      {/* Section 4: Financial Integrity */}
      <section className="space-y-3">
        <SectionLabel text="Financial Integrity" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <MetricCard
            title="Commissions Paid Out"
            value={`₨${totalCommissions.toLocaleString()}`}
            subtitle="Total L1 referral commission payouts ever processed"
            icon={Award}
            variant="white"
            delay={0}
          />

          <MetricCard
            title="Unverified Credit Exposure"
            value={`₨${unverifiedTotal.toLocaleString()}`}
            subtitle={`${unverifiedCount} manual credit${unverifiedCount !== 1 ? "s" : ""} not backed by real deposits`}
            icon={ShieldAlert}
            variant={unverifiedTotal > 100000 ? "danger" : unverifiedTotal > 50000 ? "warning" : "white"}
            trend={unverifiedTotal > 100000 ? { direction: "down", label: "High — review recommended" } : undefined}
            delay={0.05}
          />

          <MetricCard
            title="Payout Queue Value"
            value={`₨${pendingTotal.toLocaleString()}`}
            subtitle={`${pendingCount} pending · real cash obligation to users`}
            icon={Coins}
            variant={pendingTotal > 50000 ? "warning" : "white"}
            trend={pendingCount > 10 ? { direction: "down", label: `${pendingCount} users waiting` } : { direction: "flat", label: "Queue manageable" }}
            delay={0.1}
          />
        </div>
      </section>

      {/* Section 4.5: Engine Revenue (THORX v3) — live from user_transactions */}
      <section className="space-y-3">
        <SectionLabel text={`Engine Revenue · ${rangeLabel}`} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            { key: "Engine_A" as const, label: "Engine A · Video Ads",   color: "#D97757", sub: "User earnings via ad views" },
            { key: "Engine_B" as const, label: "Engine B · Surveys",     color: "#7c3aed", sub: "C-Rank+ survey completions" },
            { key: "Engine_C" as const, label: "Engine C · Guild Tasks", color: "#16a34a", sub: "Guild weekly task pool" },
          ]).map(({ key, label, color, sub }) => {
            // H-04/H-05: engineRevenue values are Decimal-fixed strings — sum
            // and share-of-total math must go through Decimal.js, never raw
            // JS +/÷ on parsed numbers.
            const revStr = engineRevenue?.[key] ?? null;
            const totalD = new Decimal(engineRevenue?.Engine_A ?? "0")
              .plus(engineRevenue?.Engine_B ?? "0")
              .plus(engineRevenue?.Engine_C ?? "0");
            const rev = revStr !== null ? safePkr(revStr) : null;
            const shareD = revStr !== null && totalD.greaterThan(0) ? new Decimal(revStr).dividedBy(totalD).times(100) : null;
            const sharePct = shareD ? shareD.toFixed(0) : null;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border-[1.5px] border-[#141413] p-5 rounded-[2rem] shadow-sm space-y-2"
              >
                <div className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>{label}</div>
                <div className="text-2xl font-black text-[#141413]">
                  {rev === null ? <span className="text-sm text-zinc-300">—</span> : `₨${rev.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-zinc-400 font-medium">{sub}</div>
                  {sharePct && <div className="text-[10px] font-black" style={{ color }}>{sharePct}%</div>}
                </div>
                {shareD && (
                  <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${shareD.toNumber()}%`, backgroundColor: color }} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
        {engineRevenue && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total user earnings {rangeLabel}:</span>
            <span className="text-sm font-black text-[#141413]">
              ₨{new Decimal(engineRevenue.Engine_A ?? "0").plus(engineRevenue.Engine_B ?? "0").plus(engineRevenue.Engine_C ?? "0")
                .toNumber().toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </section>

      {/* Section 5: Analytics Charts */}
      <section className="space-y-3">
        <SectionLabel text={`Analytics · ${rangeLabel}`} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <ChartCard title="New Registrations" icon={Users}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <defs>
                  <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D97757" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#D97757" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.1} />
                <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontWeight: 700 }} />
                <YAxis fontSize={9} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontWeight: 700 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#FAF9F5", border: "1px solid #e4e4e7", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                  labelStyle={{ fontWeight: 900 }}
                  formatter={(v: any) => [v, "Registrations"]}
                />
                <Area type="monotone" dataKey="registrations" stroke="#D97757" strokeWidth={2} fill="url(#colorReg)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Platform Revenue (₨)" icon={DollarSign}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.1} />
                <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontWeight: 700 }} />
                <YAxis fontSize={9} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontWeight: 700 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#FAF9F5", border: "1px solid #e4e4e7", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                  labelStyle={{ fontWeight: 900 }}
                  formatter={(v: any) => [`₨${Number(v).toLocaleString()}`, "Revenue"]}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {chartData.map((_: any, i: number) => (
                    <Cell key={i} fill={i % 2 === 0 ? "#D97757" : "#D977578C"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
