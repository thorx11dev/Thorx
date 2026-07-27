import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, ShieldAlert, ShieldCheck, Snowflake, Play, RefreshCw, TrendingUp, Target, AlertTriangle, Crown, UserCog, Users2, ClipboardList, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { RankBadge } from "@/components/RankBadge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface AdminGuild {
  id: string;
  name: string;
  description: string | null;
  guildRank: string;
  guildScore: number;
  strikes: number;
  status: string;
  memberCount: number;
  weeklyBonusPool?: string;
  createdAt: string;
}

export function GuildManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [strikeReason, setStrikeReason] = useState<Record<string, string>>({});
  const [gpsAdjust, setGpsAdjust] = useState<Record<string, { delta: string; reason: string }>>({});
  const [weeklyTarget, setWeeklyTarget] = useState<Record<string, string>>({});
  // Replace Captain
  const [replaceCaptainGuildId, setReplaceCaptainGuildId] = useState<string | null>(null);
  const [replaceCaptainGuildName, setReplaceCaptainGuildName] = useState<string>("");
  const [newCaptainUserId, setNewCaptainUserId] = useState<string>("");
  // Bulk targets
  const [bulkTargets, setBulkTargets] = useState<Record<string, string>>({
    'E-Rank': '20000', 'D-Rank': '50000', 'C-Rank': '100000', 'B-Rank': '200000', 'A-Rank': '350000', 'S-Rank': '500000',
  });
  // Guild Creation Requests
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [requestStatusFilter, setRequestStatusFilter] = useState("pending");
  const [decideDialogId, setDecideDialogId] = useState<string | null>(null);
  const [decideAction, setDecideAction] = useState<"approve" | "reject">("approve");
  const [adminNote, setAdminNote] = useState("");

  const { data, isLoading } = useQuery<{ guilds: AdminGuild[]; total: number }>({
    queryKey: ["/api/admin/guilds", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/admin/guilds?${params.toString()}`);
      return res.json();
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/guilds"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await apiRequest("POST", `/api/admin/guilds/${id}/status`, { status })).json(),
    onSuccess: () => {
      toast({ title: "Guild status updated" });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const strikeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await apiRequest("POST", `/api/admin/guilds/${id}/strikes`, { reason })).json(),
    onSuccess: (_data, vars) => {
      toast({ title: "Strike added" });
      setStrikeReason(prev => ({ ...prev, [vars.id]: "" }));
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const clearStrikesMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/guilds/${id}/strikes/clear`, {})).json(),
    onSuccess: () => {
      toast({ title: "Strikes cleared" });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const gpsMutation = useMutation({
    mutationFn: async ({ id, delta, reason }: { id: string; delta: number; reason: string }) =>
      (await apiRequest("PATCH", `/api/admin/guilds/${id}/gps`, { delta, reason })).json(),
    onSuccess: (_, vars) => {
      toast({ title: "GPS adjusted" });
      setGpsAdjust(prev => ({ ...prev, [vars.id]: { delta: "", reason: "" } }));
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const weeklyTargetMutation = useMutation({
    mutationFn: async ({ id, target }: { id: string; target: number }) =>
      (await apiRequest("PATCH", `/api/admin/guilds/${id}/weekly-target`, { target })).json(),
    onSuccess: (_, vars) => {
      toast({ title: "Weekly target updated" });
      setWeeklyTarget(prev => ({ ...prev, [vars.id]: "" }));
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const { data: inactiveCaptains = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/guilds/inactive-captains"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/guilds/inactive-captains?days=48");
      const d = await r.json();
      return d.captains ?? [];
    },
  });

  // Fetch guild members for Replace Captain modal
  const { data: captainMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/guilds", replaceCaptainGuildId, "members"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${replaceCaptainGuildId}/members`);
      const d = await r.json();
      return d.members ?? d ?? [];
    },
    enabled: !!replaceCaptainGuildId,
  });

  const replaceCaptainMutation = useMutation({
    mutationFn: async ({ guildId, newCaptainUserId }: { guildId: string; newCaptainUserId: string }) =>
      (await apiRequest("PATCH", `/api/admin/guilds/${guildId}/captain`, { newCaptainUserId })).json(),
    onSuccess: () => {
      toast({ title: "Captain replaced", description: "Guild leadership transferred." });
      setReplaceCaptainGuildId(null);
      setNewCaptainUserId("");
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const bulkTargetsMutation = useMutation({
    mutationFn: async (targets: Record<string, number>) => {
      const ranks = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'];
      const results = await Promise.all(
        ranks.map(rank =>
          apiRequest("POST", "/api/admin/guilds/bulk-targets", {
            weeklyTarget: targets[rank],
            scope: "byDifficulty",
            difficulty: rank,
          }).then(r => r.json())
        )
      );
      return results;
    },
    onSuccess: () => {
      toast({ title: "Bulk targets set", description: "Weekly targets applied to all active guilds by rank." });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const runResolutionMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/guild-cycles/run-resolution", {})).json(),
    onSuccess: (data: any) => {
      toast({ title: "Weekly resolution run", description: `${data?.distributed ?? 0} distributed, ${data?.voided ?? 0} voided, ${data?.skipped ?? 0} already resolved.` });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed to run resolution", description: err?.message, variant: "destructive" }),
  });

  // ── Guild Creation Requests ─────────────────────────────────────────────
  const { data: creationRequestsData, isLoading: requestsLoading } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/admin/guild-creation-requests", requestStatusFilter],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/guild-creation-requests?status=${requestStatusFilter}`);
      return r.json();
    },
  });

  const decideMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "approve" | "reject"; note: string }) => {
      const r = await apiRequest("POST", `/api/admin/guild-creation-requests/${id}/decide`, {
        action,
        adminNote: note || undefined,
      });
      return r.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: vars.action === "approve" ? "Guild approved!" : "Request rejected", description: vars.action === "approve" ? "Guild created and captain assigned." : "User notified." });
      setDecideDialogId(null);
      setAdminNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guild-creation-requests"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const creationRequests = creationRequestsData?.requests ?? [];
  const pendingCount = creationRequests.filter((r: any) => r.status === "pending").length;

  return (
    <div className="space-y-6 pb-24 w-full animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase text-[#111]">Guild Manager</h2>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Moderate guilds, strikes, and weekly bonus cycles</p>
        </div>
        <Button
          onClick={() => runResolutionMutation.mutate()}
          disabled={runResolutionMutation.isPending}
          className="border-2 border-black font-black text-xs flex items-center gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", runResolutionMutation.isPending && "animate-spin")} />
          Run Weekly Resolution Now
        </Button>
      </div>

      {/* ── GUILD CREATION REQUESTS ── */}
      <div className="rounded-xl border-[1.5px] border-[#111] overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-zinc-50 transition-colors"
          onClick={() => setRequestsOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-zinc-600" />
            <span className="font-black text-sm uppercase tracking-tight">Guild Creation Requests</span>
            {requestStatusFilter === "pending" && pendingCount > 0 && (
              <Badge className="bg-amber-500 text-white border-0 font-black text-[10px] px-2">{pendingCount} pending</Badge>
            )}
          </div>
          {requestsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {requestsOpen && (
          <div className="border-t border-[#111]/10 p-4 space-y-4 bg-zinc-50">
            {/* Status filter */}
            <div className="flex gap-2">
              {["pending", "approved", "rejected", "all"].map(s => (
                <button
                  key={s}
                  onClick={() => setRequestStatusFilter(s)}
                  className={cn(
                    "px-3 h-7 border-2 border-black font-black text-[10px] uppercase rounded-md transition-colors",
                    requestStatusFilter === s ? "bg-black text-white" : "bg-white text-black"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            {requestsLoading ? (
              <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : creationRequests.length === 0 ? (
              <div className="text-center py-8 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                No {requestStatusFilter} requests
              </div>
            ) : (
              <div className="space-y-3">
                {creationRequests.map((req: any) => (
                  <div key={req.id} className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm">"{req.guildName}"</span>
                          {req.status === "pending" && <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px] font-black"><Clock size={10} className="mr-1" />PENDING</Badge>}
                          {req.status === "approved" && <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] font-black"><CheckCircle2 size={10} className="mr-1" />APPROVED</Badge>}
                          {req.status === "rejected" && <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 text-[10px] font-black"><XCircle size={10} className="mr-1" />REJECTED</Badge>}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          By: <strong>{req.userFirstName || ""} {req.userLastName || ""}</strong> ({req.userEmail}) · <span className="font-bold" style={{ color: req.userRankTier === "B-Rank" ? "#7c3aed" : req.userRankTier === "A-Rank" ? "#ea580c" : "#111" }}>{req.userRankTier}</span>
                        </div>
                        {req.description && <div className="text-xs text-zinc-400 mt-1 italic">"{req.description}"</div>}
                        <div className="text-xs text-zinc-600 mt-1 line-clamp-2">{req.reason}</div>
                        {req.adminNote && <div className="text-xs text-zinc-400 mt-1">Admin note: {req.adminNote}</div>}
                      </div>
                      {req.status === "pending" && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            className="h-8 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                            onClick={() => { setDecideDialogId(req.id); setDecideAction("approve"); setAdminNote(""); }}
                          >
                            <CheckCircle2 size={11} className="mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[10px] font-black border-red-400 text-red-600 hover:bg-red-50"
                            onClick={() => { setDecideDialogId(req.id); setDecideAction("reject"); setAdminNote(""); }}
                          >
                            <XCircle size={11} className="mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approve/Reject Dialog */}
      <Dialog open={!!decideDialogId} onOpenChange={(open) => !open && setDecideDialogId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className={cn("font-black text-lg uppercase", decideAction === "approve" ? "text-emerald-700" : "text-red-600")}>
              {decideAction === "approve" ? "✅ Approve Guild Request" : "❌ Reject Guild Request"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-zinc-500">
              {decideAction === "approve"
                ? "This will create the guild immediately and make the user its Captain."
                : "The user will be notified that their request was rejected."}
            </p>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Admin Note (optional)</Label>
              <Input
                placeholder={decideAction === "approve" ? "e.g. Welcome! Build something great." : "e.g. Guild name taken, please reapply."}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                className="border-2 border-black"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-2 border-black font-black text-xs" onClick={() => setDecideDialogId(null)}>Cancel</Button>
            <Button
              className={cn("font-black text-xs", decideAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ id: decideDialogId!, action: decideAction, note: adminNote })}
            >
              {decideMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
              Confirm {decideAction === "approve" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-zinc-400" />
          <Input placeholder="Search guilds..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-2 border-black h-10" />
        </div>
        <div className="flex gap-2">
          {["", "active", "frozen", "disbanded"].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 h-10 border-2 border-black font-black text-xs uppercase rounded-md",
                statusFilter === s ? "bg-black text-white" : "bg-white text-black"
              )}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Inactive captain alert */}
      {inactiveCaptains.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-300 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-sm text-red-700">⚠ Inactive Captains ({inactiveCaptains.length})</div>
            <div className="text-xs text-red-600 mt-1">
              The following guild captains have been inactive for 48+ hours and may need to be replaced:
            </div>
            <div className="space-y-2 mt-2">
              {inactiveCaptains.map((c: any) => {
                const offlineDays = c.lastActiveAt ? Math.floor((Date.now() - new Date(c.lastActiveAt).getTime()) / 86400000) : '?';
                return (
                  <div key={c.captainId || c.userId} className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Crown size={12} className="text-red-500 shrink-0" />
                      <div>
                        <div className="text-xs font-black text-red-800">{c.guildName}</div>
                        <div className="text-[10px] text-red-600">Captain: {c.captainName || c.email || c.captainId?.slice(0, 8)} · Offline {offlineDays}d</div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline"
                      className="h-7 text-[10px] font-black border border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => { setReplaceCaptainGuildId(c.guildId); setReplaceCaptainGuildName(c.guildName); setNewCaptainUserId(""); }}>
                      <UserCog size={10} className="mr-1" /> Replace
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── BULK WEEKLY TARGET ASSIGNER ── */}
      <div className="rounded-xl bg-background border-[1.5px] border-[#111] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-zinc-500" />
          <div className="font-black text-sm text-[#111] uppercase tracking-tight">Weekly Targets by Guild Rank</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'] as const).map(rank => (
            <div key={rank} className="space-y-1.5">
              <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{rank}</div>
              <Input
                type="number"
                value={bulkTargets[rank] || ""}
                onChange={(e) => setBulkTargets(prev => ({ ...prev, [rank]: e.target.value }))}
                className="border-2 border-black h-8 text-sm w-full"
                placeholder="pts/week"
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          className="font-black text-xs flex items-center gap-2"
          disabled={bulkTargetsMutation.isPending}
          onClick={() => {
            const targets: Record<string, number> = {};
            Object.entries(bulkTargets).forEach(([rank, val]) => {
              const n = parseFloat(val);
              if (n > 0) targets[rank] = n;
            });
            bulkTargetsMutation.mutate(targets);
          }}
        >
          <Users2 size={12} /> Apply to All Active Guilds
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-background border-[1.5px] border-[#111]/10 rounded-2xl p-5 md:p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-lg" />
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(data?.guilds || []).length === 0 && (
            <div className="text-center py-16 text-sm font-bold text-zinc-400 uppercase tracking-widest">No guilds found</div>
          )}
          {(data?.guilds || []).map((g) => (
            <div key={g.id} className="bg-background border-[1.5px] border-[#111] rounded-2xl p-5 md:p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white border-[1.5px] border-[#111]/20 flex items-center justify-center rounded-full">
                    <Users2 className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div>
                    <div className="font-black text-lg text-[#111] flex items-center gap-2">
                      {g.name}
                      <span className="text-[9px] bg-black text-white px-1.5 py-0.5 rounded-sm">RANK {g.guildRank}</span>
                      {g.status === "frozen" && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-sm">FROZEN</span>}
                      {g.status === "disbanded" && <span className="text-[9px] bg-zinc-400 text-white px-1.5 py-0.5 rounded-sm">DISBANDED</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-bold">
                      {g.memberCount} members · {g.guildScore} pts · Rs {parseFloat(g.weeklyBonusPool ?? "0").toFixed(2)} pool · {g.strikes} strike(s)
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {g.status !== "frozen" ? (
                    <Button size="sm" variant="outline" className="border-2 border-black font-black text-xs" onClick={() => statusMutation.mutate({ id: g.id, status: "frozen" })}>
                      <Snowflake className="w-3 h-3 mr-1" /> Freeze
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="border-2 border-black font-black text-xs" onClick={() => statusMutation.mutate({ id: g.id, status: "active" })}>
                      <Play className="w-3 h-3 mr-1" /> Unfreeze
                    </Button>
                  )}
                  {g.status !== "disbanded" && (
                    <Button size="sm" variant="outline" className="border-2 border-red-500 text-red-500 font-black text-xs" onClick={() => statusMutation.mutate({ id: g.id, status: "disbanded" })}>
                      Disband
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center pt-3 border-t border-dashed border-black/10">
                <Input
                  placeholder="Strike reason..."
                  value={strikeReason[g.id] || ""}
                  onChange={(e) => setStrikeReason(prev => ({ ...prev, [g.id]: e.target.value }))}
                  className="border-2 border-black h-9 text-sm flex-1"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-2 border-black font-black text-xs"
                    disabled={!strikeReason[g.id]?.trim() || strikeMutation.isPending}
                    onClick={() => strikeMutation.mutate({ id: g.id, reason: strikeReason[g.id] })}
                  >
                    <ShieldAlert className="w-3 h-3 mr-1" /> Add Strike
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-2 border-black font-black text-xs"
                    disabled={g.strikes === 0 || clearStrikesMutation.isPending}
                    onClick={() => clearStrikesMutation.mutate(g.id)}
                  >
                    <ShieldCheck className="w-3 h-3 mr-1" /> Clear Strikes
                  </Button>
                </div>
              </div>

              {/* THORX v3: GPS adjust + weekly target setter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-dashed border-black/10">
                {/* GPS Adjust */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> GPS Adjust (δ)
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      placeholder="delta (e.g. +100 or -50)"
                      value={gpsAdjust[g.id]?.delta || ""}
                      onChange={(e) => setGpsAdjust(prev => ({ ...prev, [g.id]: { ...(prev[g.id] || {}), delta: e.target.value, reason: prev[g.id]?.reason || "" } }))}
                      className="border-2 border-black h-8 text-sm w-20 sm:w-28 flex-shrink-0"
                    />
                    <Input
                      placeholder="reason (5+ chars)"
                      value={gpsAdjust[g.id]?.reason || ""}
                      onChange={(e) => setGpsAdjust(prev => ({ ...prev, [g.id]: { ...(prev[g.id] || {}), delta: prev[g.id]?.delta || "", reason: e.target.value } }))}
                      className="border-2 border-black h-8 text-sm flex-1"
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs font-black"
                      disabled={!gpsAdjust[g.id]?.delta || (gpsAdjust[g.id]?.reason?.length ?? 0) < 5 || gpsMutation.isPending}
                      onClick={() => gpsMutation.mutate({ id: g.id, delta: parseFloat(gpsAdjust[g.id].delta), reason: gpsAdjust[g.id].reason })}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
                {/* Weekly Target */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                    <Target className="w-3 h-3" /> Weekly Target Override
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      placeholder="target pts (0 = auto)"
                      value={weeklyTarget[g.id] || ""}
                      onChange={(e) => setWeeklyTarget(prev => ({ ...prev, [g.id]: e.target.value }))}
                      className="border-2 border-black h-8 text-sm flex-1"
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs font-black"
                      disabled={!weeklyTarget[g.id] || weeklyTargetMutation.isPending}
                      onClick={() => weeklyTargetMutation.mutate({ id: g.id, target: parseFloat(weeklyTarget[g.id]) })}
                    >
                      Set
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* ── REPLACE CAPTAIN DIALOG ── */}
      <Dialog open={!!replaceCaptainGuildId} onOpenChange={(open) => !open && setReplaceCaptainGuildId(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-lg uppercase">Replace Captain</DialogTitle>
          </DialogHeader>
          <div className="px-1 py-2 space-y-4">
            <div className="text-sm text-zinc-500">Guild: <span className="font-black text-[#111]">{replaceCaptainGuildName}</span></div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Select New Captain</Label>
              <select
                className="w-full h-10 border-2 border-black rounded-lg px-3 text-sm font-bold"
                value={newCaptainUserId}
                onChange={(e) => setNewCaptainUserId(e.target.value)}
              >
                <option value="">Choose a member...</option>
                {captainMembers.filter((m: any) => m.status === 'active').map((m: any) => (
                  <option key={m.userId} value={m.userId}>
                    {m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.userId.slice(0, 8)} ({m.userRankTier || 'E-Rank'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-2 border-black font-black text-xs" onClick={() => setReplaceCaptainGuildId(null)}>Cancel</Button>
            <Button
              className="font-black text-xs"
              disabled={!newCaptainUserId || replaceCaptainMutation.isPending}
              onClick={() => replaceCaptainMutation.mutate({ guildId: replaceCaptainGuildId!, newCaptainUserId })}
            >
              {replaceCaptainMutation.isPending ? "Transferring..." : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}