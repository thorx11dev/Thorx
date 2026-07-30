import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  RefreshCw,
  ChevronRight,
  User,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  Zap,
  Activity,
  TrendingUp,
  Users2,
  Smartphone,
  Link2,
  Banknote,
  ChevronLeft,
  GitBranch,
  Gauge,
  ShieldQuestion,
  ArrowUpDown,
  UserCheck,
  PenLine,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { resolveAvatarUrlByTier } from "@/lib/rankAvatars";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { TRUST_STATUSES } from "@shared/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskSignal {
  name: string;
  score: number;
  detail: string;
}

interface RiskCaseUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  userRankTier?: string | null;
  profilePicture?: string | null;
}

interface RiskCase {
  id: string;
  userId: string;
  riskScore: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "Investigating" | "Cleared" | "Actioned";
  signals: RiskSignal[];
  assignedTo?: string | null;
  notes?: string | null;
  notesBy?: string | null;
  notesUpdatedAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  user: RiskCaseUser;
}

interface RiskCasesResponse {
  cases: RiskCase[];
  total: number;
  /** Server-computed totals across meaningful cases only. */
  severityCounts: { Critical: number; High: number; Medium: number; Low: number };
}

interface ScoreHistoryPoint {
  snapshotAt: string;
  performanceScore: string;
  riskScore: string;
  earningsScore: string;
  teamScore: string;
  activeScore: string;
  healthScore: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  accessLevel: string;
}

// ─── Severity / Status config ─────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  Low:      { bg: "bg-zinc-50",   border: "border-zinc-200",   text: "text-zinc-600",   icon: <Shield      size={12} />, ring: "ring-zinc-200",   bar: "bg-zinc-400"   },
  Medium:   { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  icon: <AlertTriangle size={12} />, ring: "ring-amber-200", bar: "bg-amber-400"  },
  High:     { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: <ShieldAlert size={12} />, ring: "ring-orange-200",  bar: "bg-orange-500" },
  Critical: { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    icon: <ShieldX     size={12} />, ring: "ring-red-300",     bar: "bg-red-600"    },
};

const STATUS_CONFIG = {
  Open:          { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   label: "Open"          },
  Investigating: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", label: "Investigating" },
  Cleared:       { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  label: "Cleared"       },
  Actioned:      { bg: "bg-zinc-100",  border: "border-zinc-200",   text: "text-zinc-600",   label: "Actioned"      },
};

// Audit finding (Risk Watchlist, 2026-07-30): "Task Completion Speed" removed —
// it was a permanently-retired signal (always scored 0 since daily_tasks was
// removed) that cluttered every case drawer with a dead bar. See risk-engine.ts.
const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  "Earnings Velocity":     <TrendingUp size={14} />,
  "Bot Network":           <Users2     size={14} />,
  "Device Clustering":     <Smartphone size={14} />,
  "Chain Linearity":       <Link2      size={14} />,
  "Cash-out Velocity":     <Banknote   size={14} />,
  "Circular Referral":     <GitBranch  size={14} />,
};

const MAX_BY_SIGNAL: Record<string, number> = {
  "Earnings Velocity":     25,
  "Bot Network":           20,
  "Device Clustering":     15,
  "Chain Linearity":       12,
  "Cash-out Velocity":     10,
  "Circular Referral":      8,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: RiskCase["severity"] }) {
  const c = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.Low;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest",
      c.bg, c.border, c.text
    )}>
      {c.icon} {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: RiskCase["status"] }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.Open;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest",
      c.bg, c.border, c.text
    )}>
      {c.label}
    </span>
  );
}

function UserAvatar({ user, size = 9 }: { user: RiskCaseUser; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = user.profilePicture || resolveAvatarUrlByTier(user.avatar, user.userRankTier);
  const dim = `w-${size} h-${size}`;
  if (src && !failed) {
    return (
      <div className={cn("rounded-full border-[1.5px] border-[#111]/20 overflow-hidden bg-zinc-100 shrink-0", dim)}>
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className={cn("rounded-full border-[1.5px] border-[#111]/20 bg-zinc-100 flex items-center justify-center shrink-0", dim)}>
      <User className="w-4 h-4 text-zinc-400" />
    </div>
  );
}

function SignalBar({ signal, maxPossible }: { signal: RiskSignal; maxPossible: number }) {
  const pct = Math.min(100, (signal.score / Math.max(1, maxPossible)) * 100);
  const color = pct >= 70 ? "bg-red-500" : pct >= 40 ? "bg-orange-400" : pct > 0 ? "bg-amber-300" : "bg-zinc-200";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#111]">
          <span className={cn("opacity-60", pct > 0 ? "opacity-100" : "")}>
            {SIGNAL_ICONS[signal.name] ?? <Activity size={14} />}
          </span>
          {signal.name}
        </div>
        <span className={cn(
          "text-[11px] font-black tabular-nums",
          signal.score > 0 ? (pct >= 70 ? "text-red-600" : pct >= 40 ? "text-orange-600" : "text-amber-600") : "text-zinc-400"
        )}>
          {signal.score} pts
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-zinc-400 leading-snug">{signal.detail}</p>
    </div>
  );
}

function ScoreHistoryChart({ userId }: { userId: string }) {
  const { data: history = [], isLoading } = useQuery<ScoreHistoryPoint[]>({
    queryKey: QUERY_KEYS.adminRiskScoreHistory(userId),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="h-16 bg-zinc-50 rounded-xl animate-pulse" />;
  if (!history.length) return (
    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">No history recorded yet.</p>
  );

  const sorted = [...history].reverse().slice(-15);
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
        Performance Trend — last {sorted.length} snapshots
      </p>
      <div className="flex items-end gap-1 h-16">
        {sorted.map((pt, i) => {
          const h = Math.max(4, ((parseFloat(pt.performanceScore ?? "0") || 0) / 100) * 64);
          const risk = parseFloat(pt.riskScore ?? "0") || 0;
          const barColor =
            risk >= 75 ? "bg-red-500" :
            risk >= 50 ? "bg-orange-400" :
            risk >= 25 ? "bg-amber-300" : "bg-emerald-400";
          return (
            <div key={pt.snapshotAt} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className={cn("w-full rounded-sm transition-all", barColor)} style={{ height: `${h}px` }} />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-[#111] text-white rounded-lg px-2 py-1 text-[9px] font-black whitespace-nowrap shadow-lg">
                  Perf: {(parseFloat(pt.performanceScore ?? "0") || 0).toFixed(1)}<br />
                  Risk: {(parseFloat(pt.riskScore ?? "0") || 0).toFixed(1)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[8px] font-bold text-zinc-300 uppercase tracking-widest">
        <span>{sorted[0]?.snapshotAt ? format(new Date(sorted[0].snapshotAt), "MMM d") : ""}</span>
        <span>{sorted[sorted.length - 1]?.snapshotAt ? format(new Date(sorted[sorted.length - 1].snapshotAt), "MMM d") : ""}</span>
      </div>
    </div>
  );
}

// ─── Case Detail Drawer ───────────────────────────────────────────────────────
// Positioned below the admin header. Header height = h-20 (80px) + border-b-4 (4px) = 84px
// on mobile; h-24 (96px) + 4px = 100px on md+. Both the backdrop and the panel
// start at exactly this offset so the THORX branding is never obscured.
// Additionally, a `risk-panel-open` class is toggled on document.body so that
// AdminHeader can fade out the THORX logo to avoid visual crowding.

function CaseDetailDrawer({
  riskCase,
  teamMembers,
  onClose,
  onUpdated,
}: {
  riskCase: RiskCase;
  teamMembers: TeamMember[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(riskCase.notes ?? "");
  const [resolution, setResolution] = useState(riskCase.resolution ?? "");
  const [trustStatusOutcome, setTrustStatusOutcome] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>(riskCase.assignedTo ?? "");

  // Signal AdminHeader to hide the THORX logo while this panel is mounted
  useEffect(() => {
    document.body.classList.add("risk-panel-open");
    return () => document.body.classList.remove("risk-panel-open");
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/admin/risk-cases/${riskCase.id}`, updates);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Update failed");
      }
      return res.json();
    },
    onSuccess: (d: { trustStatusApplied?: boolean; trustStatusError?: string | null }) => {
      // Invalidate all paginated risk-cases pages + signal-stats (precision changes on resolve)
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return typeof k === "string" && k.startsWith("/api/admin/risk-cases");
        },
      });
      // Audit finding (Risk Watchlist, 2026-07-30): the backend returns
      // trustStatusApplied/trustStatusError whenever a trust status change was
      // attempted, but this handler used to ignore both fields and always show
      // a generic "Case updated" toast — so a silently failed trust status
      // change looked identical to a success, and admins had no way to know
      // the account's trust status wasn't actually changed.
      if (d?.trustStatusError) {
        toast({
          title: "Case updated — trust status FAILED to apply",
          description: d.trustStatusError,
          variant: "destructive",
        });
      } else {
        toast({ title: "Case updated" });
      }
      // User Manager shows trustStatus per user; when a resolution actually
      // changed it, that list must refresh immediately rather than wait on
      // its own unrelated query cycle.
      if (d?.trustStatusApplied) {
        queryClient.invalidateQueries({ queryKey: ["/api/team/users"] });
      }
      onUpdated();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleStatus = (status: string) =>
    updateMutation.mutate({
      status,
      // Only send notes if the admin actually changed them — avoids incorrectly
      // re-attributing authorship (notesBy / notesUpdatedAt) to whoever clicked
      // a status button without editing the notes field.
      ...(notes !== (riskCase.notes ?? "") ? { notes } : {}),
      resolution,
      assignedTo: assignedTo || null,
      ...(trustStatusOutcome ? { trustStatusOutcome } : {}),
    });

  const handleSaveNotes = () =>
    updateMutation.mutate({ notes });

  const handleAssign = (newAssignee: string) => {
    setAssignedTo(newAssignee);
    updateMutation.mutate({ assignedTo: newAssignee || null });
  };

  const score = parseFloat(riskCase.riskScore ?? "0") || 0;
  const sc = SEVERITY_CONFIG[riskCase.severity] ?? SEVERITY_CONFIG.Low;
  const isPending = updateMutation.isPending;

  const scoreBarColor =
    score >= 75 ? "bg-red-600" :
    score >= 50 ? "bg-orange-500" :
    score >= 25 ? "bg-amber-400" : "bg-emerald-500";

  // Look up names from teamMembers list
  const assigneeName = teamMembers.find(m => m.id === (assignedTo || riskCase.assignedTo))?.name;
  const notesAuthorName = teamMembers.find(m => m.id === riskCase.notesBy)?.name;

  return (
    <>
      {/* Backdrop — starts BELOW the header so THORX branding stays unobscured */}
      <div
        className="fixed top-[84px] md:top-[100px] inset-x-0 bottom-0 z-50 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close panel"
      />

      {/* Sliding panel — also starts below the header */}
      <div className="fixed top-[84px] md:top-[100px] right-0 bottom-0 z-50 w-full max-w-[480px] flex flex-col bg-[#f5f0e8] border-l-4 border-[#111] shadow-2xl animate-in slide-in-from-right-8 duration-300">

        {/* ── Panel Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#111]/15 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar user={riskCase.user} size={10} />
            <div className="min-w-0">
              <p className="font-black text-sm text-[#111] uppercase tracking-tight truncate leading-none">
                {riskCase.user.firstName} {riskCase.user.lastName}
              </p>
              <p className="text-[10px] text-zinc-400 font-bold truncate mt-0.5">{riskCase.user.email}</p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <SeverityBadge severity={riskCase.severity} />
                <StatusBadge status={riskCase.status} />
                {assigneeName && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest">
                    <UserCheck size={10} /> {assigneeName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full border-2 border-[#111] bg-white hover:bg-[#111] hover:text-white text-[#111] flex items-center justify-center transition-all"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Composite Risk Score */}
          <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-3">
              Composite Risk Score
            </p>
            <div className="flex items-end gap-3">
              <span className={cn("text-5xl font-black tabular-nums leading-none", sc.text)}>
                {score.toFixed(0)}
              </span>
              <span className="text-zinc-400 font-bold text-sm mb-1">/ 100</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-zinc-100 border border-[#111]/10 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", scoreBarColor)}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-1.5">
              <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
            </div>
          </div>

          {/* Signal Breakdown */}
          <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm space-y-4">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Signal Breakdown</p>
            {Array.isArray(riskCase.signals) && riskCase.signals.length > 0 ? (
              riskCase.signals.map((sig) => (
                <SignalBar key={sig.name} signal={sig} maxPossible={MAX_BY_SIGNAL[sig.name] ?? 30} />
              ))
            ) : (
              <p className="text-[11px] text-zinc-400 font-bold">No signals recorded.</p>
            )}
          </div>

          {/* Score History */}
          <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm">
            <ScoreHistoryChart userId={riskCase.userId} />
          </div>

          {/* ── Collaboration: Case Ownership ── */}
          <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus size={13} className="text-zinc-400" />
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Case Owner</p>
            </div>
            <p className="text-[10px] text-zinc-400 leading-snug">
              Assign a team member to take ownership. The assignee is visible to all team members so everyone knows who is running this investigation.
            </p>
            <select
              value={assignedTo}
              onChange={(e) => handleAssign(e.target.value)}
              disabled={isPending}
              className="w-full h-9 px-4 bg-[#f5f0e8] border-2 border-[#111]/20 rounded-full text-xs font-bold text-[#111] focus:outline-none focus:ring-2 focus:ring-[#111]/20 transition-all appearance-none cursor-pointer disabled:opacity-60"
            >
              <option value="">— Unassigned —</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.accessLevel})
                </option>
              ))}
            </select>
            {assigneeName && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1.5">
                <UserCheck size={11} />
                <span>Currently assigned to <strong>{assigneeName}</strong></span>
              </div>
            )}
          </div>

          {/* ── Timeline ── */}
          <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm space-y-3">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Timeline</p>
            <div className="space-y-2 text-[11px] text-zinc-600 font-bold">
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-zinc-300 shrink-0" />
                <span>Case opened {formatDistanceToNow(new Date(riskCase.createdAt), { addSuffix: true })}</span>
              </div>
              {riskCase.updatedAt !== riskCase.createdAt && (
                <div className="flex items-center gap-2">
                  <Activity size={12} className="text-zinc-300 shrink-0" />
                  <span>Last updated {formatDistanceToNow(new Date(riskCase.updatedAt), { addSuffix: true })}</span>
                </div>
              )}
              {riskCase.resolvedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <span>Resolved {formatDistanceToNow(new Date(riskCase.resolvedAt), { addSuffix: true })}</span>
                </div>
              )}
              {riskCase.resolution && (
                <p className="pl-5 text-[10px] text-zinc-400 italic">"{riskCase.resolution}"</p>
              )}
            </div>
          </div>

          {/* ── Investigation Notes (shared, attributed) ── */}
          <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <PenLine size={13} className="text-zinc-400" />
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Shared Investigation Notes</p>
            </div>

            {/* Attribution — visible to all team members */}
            {riskCase.notesBy && riskCase.notesUpdatedAt ? (
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-bold bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                <PenLine size={10} className="shrink-0 text-zinc-300" />
                <span>
                  Last edited by{" "}
                  <strong className="text-zinc-600">
                    {notesAuthorName ?? "a team member"}
                  </strong>{" "}
                  {formatDistanceToNow(new Date(riskCase.notesUpdatedAt), { addSuffix: true })}
                </span>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-400 font-bold">
                No notes yet — add your findings below.
              </div>
            )}

            <textarea
              className="w-full h-28 bg-[#f5f0e8] border-2 border-[#111]/20 rounded-xl p-3 text-xs font-medium text-[#111] placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#111]/20 transition-all"
              placeholder="Add investigation findings visible to all team members…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              onClick={handleSaveNotes}
              disabled={isPending}
              className="h-8 bg-[#111] text-white font-black text-[9px] uppercase tracking-widest px-5 rounded-full hover:bg-zinc-700 transition-all"
            >
              {isPending ? <RefreshCw size={12} className="animate-spin" /> : "Save Notes"}
            </Button>
          </div>

          {/* ── Resolution (open/investigating cases only) ── */}
          {(riskCase.status === "Open" || riskCase.status === "Investigating") && (
            <div className="bg-white border-2 border-[#111] rounded-2xl p-5 shadow-sm space-y-4">
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Resolve Case</p>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Resolution Reason</label>
                <input
                  className="w-full h-9 bg-[#f5f0e8] border-2 border-[#111]/20 rounded-full px-4 text-xs font-medium text-[#111] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#111]/20 transition-all"
                  placeholder="Why clearing or actioning this case…"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  Set Trust Status on Resolution
                </label>
                <select
                  value={trustStatusOutcome}
                  onChange={(e) => setTrustStatusOutcome(e.target.value)}
                  className="w-full h-9 px-4 bg-[#f5f0e8] border-2 border-[#111]/20 rounded-full text-xs font-bold text-[#111] focus:outline-none focus:ring-2 focus:ring-[#111]/20 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Don't change trust status</option>
                  {TRUST_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <p className="text-[9px] text-zinc-400 leading-snug">
                  Resolution reason is logged as the "why" for the trust status change.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Action Footer ── */}
        <div className="px-5 py-4 border-t-2 border-[#111]/15 bg-white shrink-0 flex flex-wrap gap-2">
          {riskCase.status === "Open" && (
            <Button
              onClick={() => handleStatus("Investigating")}
              disabled={isPending}
              className="flex-1 h-10 bg-purple-600 text-white border-b-4 border-purple-800 font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-purple-700 transition-all flex items-center justify-center gap-1.5"
            >
              <Eye size={13} /> Investigate
            </Button>
          )}
          {(riskCase.status === "Open" || riskCase.status === "Investigating") && (
            <>
              <Button
                onClick={() => handleStatus("Cleared")}
                disabled={isPending}
                className="flex-1 h-10 bg-emerald-600 text-white border-b-4 border-emerald-800 font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={13} /> Clear
              </Button>
              <Button
                onClick={() => handleStatus("Actioned")}
                disabled={isPending}
                className="flex-1 h-10 bg-red-600 text-white border-b-4 border-red-800 font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-red-700 transition-all flex items-center justify-center gap-1.5"
              >
                <XCircle size={13} /> Action
              </Button>
            </>
          )}
          {(riskCase.status === "Cleared" || riskCase.status === "Actioned") && (
            <Button
              onClick={() => handleStatus("Open")}
              disabled={isPending}
              className="flex-1 h-10 bg-[#111] text-white border-b-4 border-zinc-800 font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-zinc-700 transition-all"
            >
              Reopen Case
            </Button>
          )}
          {isPending && (
            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest px-2">
              <RefreshCw size={12} className="animate-spin" /> Saving…
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Signal Accuracy Panel ────────────────────────────────────────────────────

interface SignalStat {
  signal: string;
  timesTriggered: number;
  actioned: number;
  cleared: number;
  precision: number | null;
}

function SignalAccuracyPanel() {
  const { data: stats = [], isLoading, isError } = useQuery<SignalStat[]>({
    queryKey: QUERY_KEYS.adminRiskSignalStats,
    staleTime: 60_000,
  });

  if (isLoading) return <div className="h-24 bg-zinc-50 rounded-[1.5rem] animate-pulse" />;
  if (isError) return (
    <div className="bg-white border-[1.5px] border-red-200 rounded-[1.5rem] p-5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldX size={16} className="text-red-400" />
        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">
          Signal Accuracy — Failed to load
        </p>
      </div>
      <p className="text-[11px] text-zinc-400">
        Could not fetch signal accuracy stats. Try refreshing the page.
      </p>
    </div>
  );
  // Audit finding 3-F: returning null on empty data made admins unable to
  // distinguish "no resolved cases yet" from "panel failed to load".
  if (!stats.length) {
    return (
      <div className="bg-white border-[1.5px] border-[#111]/10 rounded-[1.5rem] p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldQuestion size={16} className="text-zinc-300" />
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
            Signal Accuracy — from resolved cases
          </p>
        </div>
        <p className="text-[11px] text-zinc-400">
          No resolved cases yet. Accuracy stats appear here once risk cases are actioned or cleared.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border-[1.5px] border-[#111]/10 rounded-[1.5rem] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldQuestion size={16} className="text-zinc-400" />
        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
          Signal Accuracy — from resolved cases
        </p>
      </div>
      <p className="text-[10px] text-zinc-400 leading-snug">
        Precision = share of triggered cases confirmed as fraud (Actioned) vs. dismissed (Cleared). Low precision = noisy signal.
      </p>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.signal} className="flex items-center gap-3">
            <div className="w-40 shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-zinc-700">
              {SIGNAL_ICONS[s.signal] ?? <Activity size={14} />}
              <span className="truncate">{s.signal}</span>
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  (s.precision ?? 0) >= 66 ? "bg-emerald-500" :
                  (s.precision ?? 0) >= 33 ? "bg-amber-400" : "bg-red-400"
                )}
                style={{ width: `${s.precision ?? 0}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[10px] font-black tabular-nums text-zinc-500">
              {s.precision === null ? "—" : `${s.precision}%`}
            </span>
            <span className="w-32 shrink-0 text-right text-[9px] font-bold text-zinc-300 uppercase tracking-widest">
              {s.actioned} actioned · {s.cleared} cleared
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function RiskWatchlistPanel({ onViewUserInCRM }: { onViewUserInCRM?: (email: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selectedCase, setSelectedCase] = useState<RiskCase | null>(null);

  // Fetch team members for assignment dropdown — cached for the session
  const { data: teamData } = useQuery<{ members: TeamMember[] }>({
    queryKey: QUERY_KEYS.adminTeamMembers,
    staleTime: 5 * 60 * 1000,
  });
  const teamMembers: TeamMember[] = teamData?.members ?? [];

  const toggleSort = () => {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    setPage(0);
  };

  const queryKey = `/api/admin/risk-cases?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&sortDir=${sortDir}${severityFilter ? `&severity=${severityFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  const { data, isLoading, isError } = useQuery<RiskCasesResponse>({
    queryKey: [queryKey],
    staleTime: 30_000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      // apiRequest already throws via throwIfResNotOk on any non-2xx response,
      // so the previous `if (!res.ok)` guard after this call was unreachable dead code.
      const res = await apiRequest("POST", "/api/admin/risk-scan");
      return res.json();
    },
    onSuccess: (d) => {
      // Invalidate all paginated risk-cases pages, signal-stats precision, and
      // leaderboard insights so the anomaly count reflects the new risk scores.
      // NOTE: predicate is required because the main list query key is dynamic
      // (includes limit/offset/filters as query string), so exact-key invalidation
      // against QUERY_KEYS.adminRiskCases ("/api/admin/risk-cases") would miss it.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return typeof k === "string" && k.startsWith("/api/admin/risk-cases");
        },
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminLeaderboard });
      toast({
        title: "Risk Scan Complete",
        description: `${d.scanned} users scanned — ${d.flagged} flagged, ${d.critical} critical.`,
      });
    },
    onError: () => {
      toast({ title: "Scan Failed", description: "Could not run risk scan.", variant: "destructive" });
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const severityCounts = data?.severityCounts ?? { Critical: 0, High: 0, Medium: 0, Low: 0 };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-[#111]">Risk Watchlist</h2>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
            Flagged case management · {data?.total ?? "—"} active cases · Sorted by risk score
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="h-10 bg-[#111] text-white border-[1.5px] border-[#111] font-black text-[10px] px-5 hover:bg-red-600 hover:border-red-600 rounded-full transition-all uppercase shadow-sm flex items-center gap-2"
        >
          {scanMutation.isPending
            ? <><Loader2 size={13} className="animate-spin" /> Scanning…</>
            : <><Zap size={13} /> Run Risk Scan</>
          }
        </Button>
      </div>

      {/* Signal Accuracy */}
      <SignalAccuracyPanel />

      {/* Severity Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
          const c = SEVERITY_CONFIG[sev];
          const count = severityCounts[sev];
          const isActive = severityFilter === sev;
          return (
            <button
              key={sev}
              onClick={() => { setSeverityFilter(isActive ? "" : sev); setPage(0); }}
              className={cn(
                "p-4 rounded-[1.5rem] border-[1.5px] text-left transition-all hover:shadow-md",
                isActive
                  ? `${c.bg} ${c.border} ring-2 ${c.ring}`
                  : "bg-white border-[#111]/10 hover:border-[#111]/20"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-[9px] font-black uppercase tracking-widest", isActive ? c.text : "text-zinc-400")}>
                  {sev}
                </span>
                <span className={cn("w-7 h-7 rounded-xl flex items-center justify-center border", c.bg, c.border, c.text)}>
                  {c.icon}
                </span>
              </div>
              <p className="text-2xl font-black tabular-nums text-[#111]">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or email…"
            className="w-full h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#111] rounded-full text-xs font-bold text-[#111] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="h-10 px-4 bg-white border-[1.5px] border-[#111] rounded-full text-xs font-bold text-[#111] focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Investigating">Investigating</option>
          <option value="Cleared">Cleared</option>
          <option value="Actioned">Actioned</option>
        </select>
        {(severityFilter || statusFilter || search) && (
          <Button
            onClick={() => { setSeverityFilter(""); setStatusFilter(""); setSearch(""); setPage(0); }}
            className="h-10 bg-zinc-100 text-zinc-500 font-black text-[10px] uppercase px-4 rounded-full border border-zinc-200 hover:bg-zinc-200 transition-all"
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Case List */}
      <div className="bg-white border-[1.5px] border-[#111] rounded-[2rem] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-12 text-center">
            <ShieldX className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="font-black text-sm uppercase tracking-widest text-red-600">Failed to load cases</p>
          </div>
        ) : !data?.cases.length ? (
          <div className="p-12 text-center">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="font-black text-sm uppercase tracking-widest text-zinc-600">No Flagged Cases</p>
            <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-widest font-bold">
              {search || severityFilter || statusFilter
                ? "Try adjusting your filters."
                : "Only users with active risk signals appear here. Run a Risk Scan to evaluate."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-[1.5px] border-[#111]/10 bg-zinc-50">
                <th className="px-4 py-3 text-left text-[9px] font-black text-zinc-400 uppercase tracking-widest pl-6">User</th>
                <th className="px-4 py-3 text-left text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  <button
                    onClick={toggleSort}
                    className="flex items-center gap-1 hover:text-[#111] transition-colors"
                    aria-label={`Sort by risk score, currently ${sortDir === "desc" ? "highest first" : "lowest first"}`}
                    title={sortDir === "desc" ? "Highest risk first" : "Lowest risk first"}
                  >
                    Risk Score
                    <ArrowUpDown size={10} className={sortDir === "asc" ? "rotate-180 transition-transform" : "transition-transform"} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-[9px] font-black text-zinc-400 uppercase tracking-widest">Severity</th>
                <th className="px-4 py-3 text-left text-[9px] font-black text-zinc-400 uppercase tracking-widest">Status</th>
                <th className="px-4 py-3 text-left text-[9px] font-black text-zinc-400 uppercase tracking-widest hidden md:table-cell">Assigned</th>
                <th className="px-4 py-3 text-left text-[9px] font-black text-zinc-400 uppercase tracking-widest hidden lg:table-cell">Updated</th>
                <th className="pr-6 pl-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.cases.map((rc) => {
                const score = parseFloat(rc.riskScore ?? "0") || 0;
                const barColor =
                  score >= 75 ? "bg-red-500" :
                  score >= 50 ? "bg-orange-400" :
                  score >= 25 ? "bg-amber-400" : "bg-zinc-300";
                const assigneeName = teamMembers.find(m => m.id === rc.assignedTo)?.name;
                return (
                  <tr
                    key={rc.id}
                    className={cn(
                      "border-b border-[#111]/5 last:border-0 transition-colors cursor-pointer group",
                      rc.severity === "Critical" ? "hover:bg-red-50/60" :
                      rc.severity === "High"     ? "hover:bg-orange-50/60" : "hover:bg-zinc-50/80"
                    )}
                    onClick={() => setSelectedCase(rc)}
                  >
                    <td className="pl-6 pr-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={rc.user} size={9} />
                        <div className="min-w-0">
                          <p className="font-black text-xs text-[#111] truncate">
                            {rc.user.firstName} {rc.user.lastName}
                          </p>
                          <p className="text-[10px] text-zinc-400 font-bold truncate max-w-[140px]">
                            {rc.user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", barColor)}
                            style={{ width: `${Math.min(100, score)}%` }}
                          />
                        </div>
                        <span className={cn(
                          "font-black text-xs tabular-nums",
                          score >= 75 ? "text-red-600" :
                          score >= 50 ? "text-orange-600" :
                          score >= 25 ? "text-amber-600" : "text-zinc-500"
                        )}>
                          {score.toFixed(0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={rc.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={rc.status} /></td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {assigneeName ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                          <UserCheck size={9} /> {assigneeName}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-[10px] font-bold text-zinc-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(rc.updatedAt), { addSuffix: true })}
                    </td>
                    <td className="pr-6 pl-2 py-3">
                      <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-600 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            Page {page + 1} of {totalPages} · {data?.total} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-9 w-9 p-0 bg-white border-[1.5px] border-[#111] rounded-full flex items-center justify-center hover:bg-zinc-50 disabled:opacity-40 transition-all"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-9 w-9 p-0 bg-white border-[1.5px] border-[#111] rounded-full flex items-center justify-center hover:bg-zinc-50 disabled:opacity-40 transition-all"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Case Detail Drawer */}
      {selectedCase && (
        <CaseDetailDrawer
          riskCase={selectedCase}
          teamMembers={teamMembers}
          onClose={() => setSelectedCase(null)}
          onUpdated={() => {
            // Wipe all paginated risk-cases caches so every page reflects the change
            queryClient.invalidateQueries({
              predicate: (q) => {
                const k = q.queryKey[0];
                return typeof k === "string" && k.startsWith("/api/admin/risk-cases");
              },
            });
            setSelectedCase(null);
          }}
        />
      )}
    </div>
  );
}
