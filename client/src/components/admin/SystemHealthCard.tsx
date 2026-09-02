import React, { useState } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {Zap, TrendingUp, TrendingDown, Minus, RefreshCw, X, AlertCircle, ServerCrash} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HealthReportPanel } from "./HealthReportPanel";

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

function scoreColor(s: number): string {
  if (s >= 85) return "text-emerald-600";
  if (s >= 65) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(s: number): string {
  if (s >= 85) return "bg-emerald-50 border-emerald-200";
  if (s >= 65) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function scoreIconBg(s: number): string {
  if (s >= 85) return "bg-emerald-100";
  if (s >= 65) return "bg-amber-100";
  return "bg-red-100";
}

function scoreLabel(s: number): string {
  if (s >= 85) return "Healthy";
  if (s >= 65) return "Fair";
  if (s >= 40) return "Needs Attention";
  return "Critical";
}

export function SystemHealthCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReport, setShowReport] = useState(false);

  // Snapshots are only recomputed hourly by the cron job, so a 5-minute
  // refetch was polling ~12x more often than the underlying data could ever
  // change. 15 minutes still catches a manual "Refresh Now" recompute
  // promptly without the extra load.
  const { data: snapshot, isLoading, isError, refetch } = useQuery<HealthSnapshotData | null>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 15 * 60 * 1000,
  });

  // Audit finding: a failed fetch (permission denied, network error, etc.)
  // previously fell through to `parseFloat(undefined ?? "0") = 0`, rendering
  // a red "0/100 Critical" card indistinguishable from a genuinely critical
  // system — a fetch error must never be displayed as a real health score.
  const hasNoSnapshotYet = !isLoading && !isError && snapshot == null;

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/system-health/recalculate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-health/history"] });
      toast({ title: "Health Recalculated", description: "System health snapshot updated." });
    },
    onError: () => toast({ title: "Recalculation failed", variant: "destructive" }),
  });

  const overall   = parseFloat(snapshot?.overallScore ?? "0");
  const delta24h  = snapshot?.delta24h != null ? parseFloat(snapshot.delta24h) : null;
  const delta1h   = snapshot?.delta1h  != null ? parseFloat(snapshot.delta1h)  : null;
  const isStale   = snapshot?.isStale ?? false;
  const staleAgeMin = snapshot?.recordedAt
    ? Math.round((Date.now() - new Date(snapshot.recordedAt).getTime()) / 60000)
    : null;

  // Audit finding: fetch failures and "no snapshot recorded yet" both used to
  // collapse into the same rendering path as a real score of 0, which shows
  // up visually identical to a genuinely critical (0/100) system. Both are
  // rendered as their own explicit, non-alarming states below.
  if (isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        className="border-[1.5px] rounded-[2rem] p-6 text-left bg-zinc-50 border-zinc-200"
        data-testid="card-system-health"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="p-2 rounded-full bg-zinc-200">
            <ServerCrash className="w-4 h-4 text-zinc-500" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System Health</span>
        </div>
        <p className="text-sm font-black text-foreground mb-1">Couldn't load health data</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
          This isn't a health score of zero — the request failed. Check your connection or permissions and try again.
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); refetch(); }}
          className="flex items-center gap-1.5 px-3 h-8 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-black/80 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </motion.div>
    );
  }

  if (hasNoSnapshotYet) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        className="border-[1.5px] rounded-[2rem] p-6 text-left bg-zinc-50 border-zinc-200"
        data-testid="card-system-health"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="p-2 rounded-full bg-zinc-200">
            <Zap className="w-4 h-4 text-zinc-400" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System Health</span>
        </div>
        <p className="text-sm font-black text-foreground mb-1">No snapshot yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The hourly health job hasn't recorded a snapshot yet. Check back shortly.
        </p>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        onClick={() => !isLoading && setShowReport(true)}
        className={cn(
          "border-[1.5px] rounded-[2rem] p-6 text-left transition-all duration-300 cursor-pointer select-none",
          "hover:shadow-lg hover:-translate-y-0.5",
          isLoading ? "bg-zinc-50 border-zinc-200" : scoreBg(overall)
        )}
        data-testid="card-system-health"
      >
        {/* Header row */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-full", isLoading ? "bg-zinc-200" : scoreIconBg(overall))}>
              <Zap className={cn("w-4 h-4", isLoading ? "text-zinc-400" : scoreColor(overall))} />
            </div>
            {isStale && (
              <span title="Snapshot is outdated">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" aria-label="Snapshot is outdated" />
              </span>
            )}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System Health</span>
        </div>

        {/* Score hero */}
        <div className="flex items-end gap-3 mb-1">
          <div className={cn("text-4xl font-black leading-none", isLoading ? "text-zinc-300" : scoreColor(overall))}>
            {isLoading
              ? <Skeleton className="inline-block h-8 w-12 rounded align-bottom" />
              : <span>{Math.round(overall)}</span>
            }
            <span className="text-lg font-bold text-muted-foreground">/100</span>
          </div>
        </div>

        {!isLoading && (
          <div className={cn("text-sm font-black mb-3", scoreColor(overall))}>{scoreLabel(overall)}</div>
        )}

        {/* Delta badges */}
        {!isLoading && (delta24h !== null || delta1h !== null) && (
          <div className="flex items-center gap-3 mb-4">
            {delta1h !== null && (
              <span className={cn(
                "flex items-center gap-0.5 text-[10px] font-black px-2 py-0.5 rounded-full",
                delta1h > 0 ? "bg-emerald-100 text-emerald-700" : delta1h < 0 ? "bg-red-100 text-red-600" : "bg-zinc-100 text-muted-foreground"
              )}>
                {delta1h > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : delta1h < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                {delta1h > 0 ? "+" : ""}{delta1h.toFixed(1)} 1h
              </span>
            )}
            {delta24h !== null && (
              <span className={cn(
                "flex items-center gap-0.5 text-[10px] font-black px-2 py-0.5 rounded-full",
                delta24h > 0 ? "bg-emerald-100 text-emerald-700" : delta24h < 0 ? "bg-red-100 text-red-600" : "bg-zinc-100 text-muted-foreground"
              )}>
                {delta24h > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : delta24h < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                {delta24h > 0 ? "+" : ""}{delta24h.toFixed(1)} 24h
              </span>
            )}
          </div>
        )}

        {/* Dimension mini-bars */}
        {!isLoading && snapshot && (
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {[
              { label: "Fin",  score: parseFloat(snapshot.financialScore) },
              { label: "Ops",  score: parseFloat(snapshot.operationalScore) },
              { label: "Users",score: parseFloat(snapshot.userHealthScore) },
              { label: "Risk", score: parseFloat(snapshot.riskHealthScore) },
              { label: "Int",  score: parseFloat(snapshot.integrityScore) },
            ].map(({ label, score }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", score >= 85 ? "bg-emerald-500" : score >= 65 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${Math.round(score)}%` }}
                  />
                </div>
                <span className="text-[8px] font-black text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top reason snippet */}
        {snapshot?.topReason && !isLoading && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
            {snapshot.topReason.split("·")[0].trim()}
          </p>
        )}

        {/* Stale warning */}
        {isStale && staleAgeMin !== null && (
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-3">
            Outdated · {staleAgeMin}m since last snapshot
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground">Tap for full report →</span>
        </div>
      </motion.div>

      {/* Full Report Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="border border-black/10 bg-white rounded-[2rem] p-0 max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_20px_60px_rgba(20, 20, 19,0.15)] [&>button]:hidden">
          <DialogHeader className="p-6 border-b border-zinc-100 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <Zap className={cn("w-5 h-5", isLoading ? "text-zinc-400" : scoreColor(overall))} />
              <DialogTitle className="text-xl font-black tracking-tighter">System Health Report</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); recalcMutation.mutate(); }}
                disabled={recalcMutation.isPending}
                className="flex items-center gap-1.5 px-4 h-9 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-black/80 transition-colors disabled:opacity-50"
              >
                {recalcMutation.isPending ? <ThorxSpinner size={12} /> : <RefreshCw className="w-3 h-3" />}
                {recalcMutation.isPending ? "Updating..." : "Refresh Now"}
              </button>
              <button
                onClick={() => setShowReport(false)}
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
            <HealthReportPanel snapshot={snapshot ?? null} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
