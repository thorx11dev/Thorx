import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from "lucide-react";

interface HealthSignal {
  name: string;
  score: number;
  rawValue: string;
  detail: string;
}

interface HealthSnapshotData {
  id: string;
  overallScore: string;
  financialScore: string;
  operationalScore: string;
  userHealthScore: string;
  riskHealthScore: string;
  integrityScore: string;
  signalsJson: {
    financial?: HealthSignal[];
    operational?: HealthSignal[];
    userHealth?: HealthSignal[];
    risk?: HealthSignal[];
    integrity?: HealthSignal[];
  } | null;
  topReason: string;
  delta1h: string | null;
  delta24h: string | null;
  recordedAt: string;
  isStale: boolean;
}

interface HistorySnapshot {
  overallScore: string;
  recordedAt: string;
  topReason: string;
}

function scoreColor(s: number) {
  if (s >= 85) return "text-emerald-600";
  if (s >= 65) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(s: number) {
  if (s >= 85) return "bg-emerald-50 border-emerald-200";
  if (s >= 65) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function SignalIcon({ score }: { score: number }) {
  if (score >= 85) return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (score >= 50) return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
}

function formatSignalName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function DimensionBar({ label, score, weight, signals }: { label: string; score: number; weight: string; signals?: HealthSignal[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const pct = Math.round(score);
  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between cursor-pointer group select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{label}</span>
          <span className="text-[9px] font-bold text-muted-foreground border border-zinc-200 px-1.5 py-0.5 rounded-full">{weight}</span>
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
        <span className={cn("text-sm font-black", scoreColor(pct))}>{pct}/100</span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-500" : "bg-red-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {expanded && signals && (
        <div className="pl-3 space-y-2 pt-1 pb-2 border-l-2 border-zinc-100 ml-1">
          {signals.map((sig) => (
            <div key={sig.name} className="flex items-start gap-2 text-[11px]">
              <SignalIcon score={sig.score} />
              <div className="flex-1">
                <span className="font-bold text-foreground">{formatSignalName(sig.name)}</span>
                <span className="text-muted-foreground ml-2">{sig.rawValue}</span>
                <p className="text-muted-foreground/70 mt-0.5 leading-relaxed">{sig.detail}</p>
              </div>
              <span className={cn("font-black shrink-0 text-xs", scoreColor(sig.score))}>{Math.round(sig.score)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HealthReportPanel({ snapshot }: { snapshot: HealthSnapshotData | null }) {
  const { data: history } = useQuery<HistorySnapshot[]>({
    queryKey: ["/api/admin/system-health/history"],
    refetchInterval: 5 * 60 * 1000,
  });

  // Defensive guard: the card that opens this dialog only does so once a
  // snapshot is loaded, but render a plain state instead of a fake 0/100
  // score if this is ever reached without one (e.g. a refetch race).
  if (!snapshot) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm font-black text-foreground mb-1">No health snapshot available</p>
        <p className="text-xs text-muted-foreground">Try refreshing once the hourly job has recorded data.</p>
      </div>
    );
  }

  const chartData = (history ?? []).map((h) => ({
    time: new Date(h.recordedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    score: parseFloat(h.overallScore),
    reason: h.topReason,
  })).reverse();

  const overall = parseFloat(snapshot?.overallScore ?? "0");
  const delta24h = snapshot?.delta24h ? parseFloat(snapshot.delta24h) : null;
  const signals = snapshot?.signalsJson ?? {};

  return (
    <div className="p-6 space-y-7">

      {/* Score Hero */}
      <div className={cn("rounded-2xl border p-6 flex items-center justify-between", scoreBg(overall))}>
        <div>
          <p className={cn("text-5xl font-black", scoreColor(overall))}>
            {Math.round(overall)}<span className="text-2xl font-bold text-muted-foreground">/100</span>
          </p>
          <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-widest">Overall Health Score</p>
        </div>
        {delta24h !== null && (
          <div className={cn("flex items-center gap-1.5 text-lg font-black", delta24h > 0 ? "text-emerald-600" : delta24h < 0 ? "text-red-500" : "text-muted-foreground")}>
            {delta24h > 0 ? <TrendingUp className="w-5 h-5" /> : delta24h < 0 ? <TrendingDown className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
            {delta24h > 0 ? "+" : ""}{delta24h.toFixed(1)} since yesterday
          </div>
        )}
      </div>

      {/* Top Reason */}
      {snapshot?.topReason && (
        <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">What's Affecting the Score</p>
          <p className="text-sm text-foreground font-semibold leading-relaxed">{snapshot.topReason}</p>
        </div>
      )}

      {/* 24h Trend Chart */}
      {chartData.length > 1 && (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Score Over Time</p>
          </div>
          <div className="p-4 h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.1} />
                <XAxis dataKey="time" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 100]} fontSize={9} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e4e4e7", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                  formatter={(v: any) => [`${Math.round(v)}/100`, "Score"]}
                />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Dimension Bars */}
      <div className="space-y-4">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Health Breakdown <span className="font-normal normal-case">(tap a row to expand)</span></p>
        <div className="space-y-5">
          <DimensionBar label="Financial Health" score={parseFloat(snapshot?.financialScore ?? "0")} weight="25%" signals={signals.financial} />
          <DimensionBar label="Operational Health" score={parseFloat(snapshot?.operationalScore ?? "0")} weight="25%" signals={signals.operational} />
          <DimensionBar label="User & Growth" score={parseFloat(snapshot?.userHealthScore ?? "0")} weight="20%" signals={signals.userHealth} />
          <DimensionBar label="Risk & Integrity" score={parseFloat(snapshot?.riskHealthScore ?? "0")} weight="20%" signals={signals.risk} />
          <DimensionBar label="Platform Integrity" score={parseFloat(snapshot?.integrityScore ?? "0")} weight="10%" signals={signals.integrity} />
        </div>
      </div>

      {/* Score History */}
      {(history?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Score History</p>
          <div className="space-y-1.5">
            {(history ?? []).slice(0, 10).map((h, i) => {
              const s = parseFloat(h.overallScore);
              return (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-100 rounded-xl">
                  <span className={cn("text-sm font-black w-16 shrink-0", scoreColor(s))}>{Math.round(s)}/100</span>
                  <p className="flex-1 text-[10px] text-muted-foreground truncate min-w-0">{h.topReason.split("·")[0].trim()}</p>
                  <span className="text-[9px] text-muted-foreground shrink-0 font-bold">
                    {new Date(h.recordedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
