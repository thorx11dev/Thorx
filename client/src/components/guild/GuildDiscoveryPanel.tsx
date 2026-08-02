/**
 * GuildDiscoveryPanel — THORX v3 (spec F.6)
 * Default Engine C view for simple users (guildRole='simple').
 * GPS-sorted guild leaderboard with application flow.
 * NEVER shows PKR pool amounts — only TX-Points and success weeks.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RankBadge } from "@/components/RankBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, Trophy, Clock, Lock, ChevronRight, Star, Shield, Plus, Loader2, ArrowLeft, Swords, Crown, Calendar, PlusCircle, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { DEV_UNLOCK_ALL_VIEWS } from "@/lib/devPreview";

interface GuildDiscovery {
  id: string;
  name: string;
  description: string | null;
  guildPerformanceScore: number;
  memberCount: number;
  memberCapacity: number;
  minRankRequired: string;
  recruitmentOpen: boolean;
  avatarUrl: string | null;
  currentWeeklyPoints: number;
  weeklyTarget: number;
  successfulWeeks?: number;
  inActiveWar?: boolean;
}

const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
const RANK_COLORS: Record<string, string> = {
  "E-Rank": "#71717a", "D-Rank": "#16a34a", "C-Rank": "#2563eb",
  "B-Rank": "#7c3aed", "A-Rank": "#ea580c", "S-Rank": "#dc2626",
};

/** Derive a display tier from raw GPS score. Used for coloring only — no DB column needed. */
function gpsTier(gps: number): string {
  if (gps >= 15000) return "S-Rank";
  if (gps >= 10000) return "A-Rank";
  if (gps >= 5000)  return "B-Rank";
  if (gps >= 1000)  return "C-Rank";
  if (gps >= 200)   return "D-Rank";
  return "E-Rank";
}

const RANK_ORDER_IDX: Record<string, number> = {
  "E-Rank": 0, "D-Rank": 1, "C-Rank": 2, "B-Rank": 3, "A-Rank": 4, "S-Rank": 5,
};

export function GuildDiscoveryPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState("All");
  const [slotsOnly, setSlotsOnly] = useState(false);
  const [applyingTo, setApplyingTo] = useState<GuildDiscovery | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [viewingGuild, setViewingGuild] = useState<GuildDiscovery | null>(null);

  // ── Guild Creation Request ────────────────────────────────────────────────
  const [showCreationForm, setShowCreationForm] = useState(false);
  const [creationForm, setCreationForm] = useState({ guildName: "", description: "", reason: "" });

  const { data: myRequest } = useQuery<{ request: any | null }>({
    queryKey: ["/api/guilds/my-creation-request"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/guilds/my-creation-request");
      return r.json();
    },
  });

  const creationRequestMutation = useMutation({
    mutationFn: async (data: typeof creationForm) => {
      const r = await apiRequest("POST", "/api/guilds/creation-request", data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Request Submitted!", description: "Admin will review your guild creation request." });
      setShowCreationForm(false);
      setCreationForm({ guildName: "", description: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds/my-creation-request"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to submit request.", variant: "destructive" });
    },
  });

  const isBRankPlus = (RANK_ORDER_IDX[user?.userRankTier ?? "E-Rank"] ?? 0) >= RANK_ORDER_IDX["B-Rank"];
  const pendingRequest = myRequest?.request;

  // Detail view — guild info + members (fetched on demand)
  const { data: guildDetail } = useQuery<any>({
    queryKey: ["guild", "detail", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}`); return r.json(); },
    enabled: !!viewingGuild,
  });
  const { data: guildMembers = [] } = useQuery<any[]>({
    queryKey: ["guild", "members", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!viewingGuild,
  });
  const { data: guildWars = [] } = useQuery<any[]>({
    queryKey: ["guild", "wars", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}/war`); const d = await r.json(); return d.wars ?? d ?? []; },
    enabled: !!viewingGuild,
  });

  const { data: guilds = [], isLoading } = useQuery<GuildDiscovery[]>({
    queryKey: ["/api/guilds/discovery"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/guilds/discovery");
      const data = await res.json();
      return data.guilds ?? data;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ guildId, letter }: { guildId: string; letter: string }) => {
      const res = await apiRequest("POST", `/api/guilds/${guildId}/apply`, { coverLetter: letter });
      return res.json();
    },
    onSuccess: (_, { guildId }) => {
      setAppliedIds(prev => new Set(prev).add(guildId));
      setApplyingTo(null);
      setCoverLetter("");
      toast({ title: "Application Sent", description: "The captain will review your application soon." });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds/discovery"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to submit application.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const userTierIdx = RANK_ORDER.indexOf(user?.userRankTier || "E-Rank");

  const filtered = guilds.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (rankFilter !== "All" && gpsTier(g.guildPerformanceScore) !== rankFilter) return false;
    if (slotsOnly && g.memberCount >= g.memberCapacity) return false;
    return true;
  });

  const canApply = (guild: GuildDiscovery) => {
    const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
    return userTierIdx >= minIdx && guild.recruitmentOpen && guild.memberCount < guild.memberCapacity;
  };

  const handleApply = (guild: GuildDiscovery) => {
    if (!canApply(guild)) return;
    setApplyingTo(guild);
    setCoverLetter("");
  };

  const submitApplication = () => {
    if (!applyingTo) return;
    if (coverLetter.trim().length < 50) {
      toast({ title: "Too short", description: "Cover letter must be at least 50 characters.", variant: "destructive" });
      return;
    }
    applyMutation.mutate({ guildId: applyingTo.id, letter: coverLetter.trim() });
  };

  /* ── Guild Detail View ──────────────────────────────────────────── */
  if (viewingGuild) {
    const detail = guildDetail?.guild ?? viewingGuild;
    const accentColor = RANK_COLORS[gpsTier(viewingGuild.guildPerformanceScore)] ?? "#71717a";
    const slots = viewingGuild.memberCapacity - viewingGuild.memberCount;
    const applied = appliedIds.has(viewingGuild.id);
    const canApplyToViewing = canApply(viewingGuild);

    return (
      <div className="space-y-4">
        {/* Back */}
        <button
          onClick={() => setViewingGuild(null)}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft size={14} /> Back to guilds
        </button>

        {/* Guild Hero */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-xl shrink-0"
              style={{ backgroundColor: accentColor }}
            >
              {viewingGuild.avatarUrl
                ? <img src={viewingGuild.avatarUrl} alt={viewingGuild.name} className="w-full h-full rounded-xl object-cover" />
                : viewingGuild.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-lg">{viewingGuild.name}</h2>
                <RankBadge rank={gpsTier(viewingGuild.guildPerformanceScore)} size="sm" />
              </div>
              {viewingGuild.description && <p className="text-sm text-zinc-500 mt-1">{viewingGuild.description}</p>}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-100">
            <div className="text-center">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">GPS Score</div>
              <div className="font-black text-lg">{viewingGuild.guildPerformanceScore.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Members</div>
              <div className="font-black text-lg">{viewingGuild.memberCount}/{viewingGuild.memberCapacity}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Min Rank</div>
              <div className="font-black text-lg" style={{ color: RANK_COLORS[viewingGuild.minRankRequired] ?? "#71717a" }}>
                {viewingGuild.minRankRequired}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Success Weeks</div>
              <div className="font-black text-lg">{viewingGuild.successfulWeeks ?? 0}</div>
            </div>
          </div>

          {/* Weekly progress */}
          {viewingGuild.weeklyTarget > 0 && (
            <div className="pt-2 border-t border-zinc-100 space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>This week's progress</span>
                <span>{viewingGuild.currentWeeklyPoints.toLocaleString()} / {viewingGuild.weeklyTarget.toLocaleString()} pts</span>
              </div>
              <Progress value={Math.min(100, (viewingGuild.currentWeeklyPoints / viewingGuild.weeklyTarget) * 100)} className="h-2" />
            </div>
          )}

          {/* Apply CTA */}
          <div className="pt-2 border-t border-zinc-100">
            {applied ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Application Sent ✓</Badge>
            ) : !viewingGuild.recruitmentOpen ? (
              <Badge variant="outline" className="text-zinc-400">Recruitment Closed</Badge>
            ) : slots === 0 ? (
              <Badge variant="outline" className="text-zinc-400">Guild Full</Badge>
            ) : !canApplyToViewing ? (
              <div className="flex items-center gap-1 text-xs text-zinc-400"><Lock size={12} /> Need {viewingGuild.minRankRequired} to apply</div>
            ) : (
              <Button
                size="sm"
                onClick={() => { setApplyingTo(viewingGuild); setCoverLetter(""); }}
                className="bg-zinc-900 text-white hover:bg-zinc-700"
              >
                Apply to Join <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Members List */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Users size={14} /> Members ({guildMembers.length})</h3>
          {guildMembers.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {guildMembers.map((m: any) => (
                <div key={m.userId} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-50">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(m.firstName || m.identity || "M")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{m.firstName || m.identity || "Member"}</span>
                      {m.userId === detail?.captainId && <Crown size={11} className="text-yellow-500 shrink-0" />}
                    </div>
                    {m.userRankTier && <div className="text-[10px] text-zinc-400">{m.userRankTier}</div>}
                  </div>
                  <div className="text-xs text-zinc-400 shrink-0">{(m.weeklyPointsContributed ?? 0).toLocaleString()} pts</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* War History */}
        {guildWars.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Swords size={14} /> Battle History</h3>
            <div className="space-y-2">
              {guildWars.slice(0, 5).map((w: any) => {
                const won = w.winnerId === viewingGuild.id;
                const isActive = w.status === "active";
                return (
                  <div key={w.id} className="flex items-center gap-3 text-xs">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-blue-400 animate-pulse" : won ? "bg-emerald-500" : "bg-red-400")} />
                    <span className="flex-1 text-zinc-600">
                      {isActive ? "⚔️ Active War" : won ? "✅ Victory" : "❌ Defeat"}
                    </span>
                    {w.completedAt && (
                      <span className="text-zinc-400">{formatDistanceToNow(new Date(w.completedAt), { addSuffix: true })}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Application Modal (shared) */}
        {applyingTo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: accentColor }}>
                  {applyingTo.name[0]}
                </div>
                <div>
                  <div className="font-bold">{applyingTo.name}</div>
                  <div className="text-xs text-zinc-500">{applyingTo.memberCount}/{applyingTo.memberCapacity} members</div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Application Letter</label>
                <textarea
                  value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={5} maxLength={500}
                  placeholder="Tell the Captain what you'll contribute and why you'd be a great team member."
                  className="w-full border border-zinc-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
                />
                <div className={cn("text-[11px] text-right", coverLetter.length < 50 ? "text-red-400" : "text-zinc-400")}>
                  {coverLetter.length}/500 {coverLetter.length < 50 ? `(min 50, need ${50 - coverLetter.length} more)` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setApplyingTo(null)}>Cancel</Button>
                <Button className="flex-1" disabled={coverLetter.trim().length < 50 || applyMutation.isPending}
                  onClick={() => { if (!applyingTo) return; if (coverLetter.trim().length < 50) return; applyMutation.mutate({ guildId: applyingTo.id, letter: coverLetter.trim() }); }}>
                  {applyMutation.isPending ? "Sending…" : "Submit Application"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black tracking-tight">GPS Guild Leaderboard</h2>
        <p className="text-sm text-zinc-500 mt-1">Join a guild to unlock Engine C and earn Sunday bonuses.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Search guilds..." className="pl-8 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          value={rankFilter}
          onChange={e => setRankFilter(e.target.value)}
          className="h-8 text-sm border border-zinc-200 rounded-md px-2 bg-white"
        >
          <option value="All">All Ranks</option>
          {RANK_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={slotsOnly} onChange={e => setSlotsOnly(e.target.checked)} className="rounded" />
          Slots available only
        </label>
      </div>

      {/* Guild List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-6 rounded bg-zinc-200 animate-pulse shrink-0 mt-1" />
                <div className="w-10 h-10 rounded-lg bg-zinc-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-zinc-200 animate-pulse rounded w-1/3" />
                  <div className="h-3 bg-zinc-100 animate-pulse rounded w-1/2" />
                  <div className="flex gap-3 pt-0.5">
                    <div className="h-3 bg-zinc-100 animate-pulse rounded w-16" />
                    <div className="h-3 bg-zinc-100 animate-pulse rounded w-20" />
                    <div className="h-3 bg-zinc-100 animate-pulse rounded w-14" />
                  </div>
                </div>
                <div className="w-16 h-7 rounded-lg bg-zinc-100 animate-pulse shrink-0" />
              </div>
            </div>
          ))}
        </div>
      ) : guilds.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Shield className="mx-auto text-zinc-300" size={40} />
          <div>
            <p className="text-zinc-800 text-sm font-semibold">No guilds available yet.</p>
            <p className="text-zinc-500 text-xs mt-1">Be the first to build one.</p>
          </div>
          {isBRankPlus && !pendingRequest && (
            <Button size="sm" onClick={() => setShowCreationForm(true)} className="mt-2">
              <PlusCircle size={14} className="mr-1" /> Request Guild Creation
            </Button>
          )}
          {pendingRequest && (
            <div className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <Hourglass size={12} /> Your guild creation request is pending admin review.
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">No guilds match your filters.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((guild, idx) => {
            const slots = guild.memberCapacity - guild.memberCount;
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            // Phase 3 redesign: dev preview mode never shows this as blocked so
            // the Apply flow stays clickable for visual/functional review — the
            // backend still independently enforces real rank eligibility.
            const rankBlocked = !DEV_UNLOCK_ALL_VIEWS && userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            const accentColor = RANK_COLORS[gpsTier(guild.guildPerformanceScore)] ?? "#71717a";

            return (
              <div
                key={guild.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 hover:shadow-sm transition-shadow cursor-pointer hover:border-zinc-300"
                onClick={() => setViewingGuild(guild)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Rank number */}
                    <span className="text-2xl font-black text-zinc-300 w-8 shrink-0">#{idx + 1}</span>

                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: accentColor }}
                    >
                      {guild.avatarUrl ? (
                        <img src={guild.avatarUrl} alt={guild.name} className="w-full h-full rounded-lg object-cover" />
                      ) : guild.name[0].toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-zinc-900 truncate">{guild.name}</span>
                        <RankBadge rank={gpsTier(guild.guildPerformanceScore)} size="sm" />
                        <span className="text-[11px] text-zinc-400 font-mono">
                          {guild.guildPerformanceScore.toLocaleString()} GPS
                        </span>
                        {guild.inActiveWar && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                            <Swords size={9} /> War
                          </span>
                        )}
                      </div>
                      {guild.description && (
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{guild.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Users size={10} /> {guild.memberCount}/{guild.memberCapacity} members
                        </span>
                        <span>Min Rank: <span className="font-medium" style={{ color: RANK_COLORS[guild.minRankRequired] ?? "#71717a" }}>{guild.minRankRequired}</span></span>
                        <span className={cn("font-medium", slots > 0 ? "text-emerald-600" : "text-red-500")}>
                          {slots > 0 ? `${slots} slot${slots !== 1 ? "s" : ""} open` : "Full"}
                        </span>
                        {(guild.successfulWeeks ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Star size={10} /> {guild.successfulWeeks} successful week{guild.successfulWeeks !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {applied ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">
                        Application Sent
                      </Badge>
                    ) : rankBlocked ? (
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <Lock size={12} />
                        Need {guild.minRankRequired}
                      </div>
                    ) : !guild.recruitmentOpen ? (
                      <span className="text-xs text-zinc-400">Closed</span>
                    ) : slots === 0 ? (
                      <span className="text-xs text-zinc-400">Full</span>
                    ) : (
                      <Button size="sm" className="text-xs h-7" onClick={() => handleApply(guild)}>
                        Apply <ChevronRight size={12} />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Weekly progress bar */}
                {guild.weeklyTarget > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                      <span>This week</span>
                      <span>{guild.currentWeeklyPoints.toLocaleString()} / {guild.weeklyTarget.toLocaleString()} pts</span>
                    </div>
                    <Progress value={Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100)} className="h-1" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Guild Creation Request CTA — B-Rank+ users */}
      {isBRankPlus && !pendingRequest && guilds.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-gradient-to-r from-zinc-50 to-white p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
            <PlusCircle size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-zinc-900">Want to start your own guild?</div>
            <div className="text-xs text-zinc-500">B-Rank+ users can request admin approval to create a new guild.</div>
          </div>
          <Button size="sm" onClick={() => setShowCreationForm(true)} className="shrink-0 text-xs h-8">
            Request
          </Button>
        </div>
      )}

      {/* Pending request status */}
      {pendingRequest && (
        <div className={cn(
          "rounded-xl border p-3 flex items-start gap-2 text-xs",
          pendingRequest.status === "pending" ? "bg-amber-50 border-amber-200 text-amber-700" :
          pendingRequest.status === "approved" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
          "bg-red-50 border-red-200 text-red-700"
        )}>
          {pendingRequest.status === "pending" && <Hourglass size={13} className="shrink-0 mt-0.5" />}
          {pendingRequest.status === "approved" && <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
          {pendingRequest.status === "rejected" && <XCircle size={13} className="shrink-0 mt-0.5" />}
          <div>
            <div className="font-semibold">
              {pendingRequest.status === "pending" && `Guild request "${pendingRequest.guildName}" is pending admin review.`}
              {pendingRequest.status === "approved" && `Guild "${pendingRequest.guildName}" approved! You are now its Captain.`}
              {pendingRequest.status === "rejected" && `Guild request "${pendingRequest.guildName}" was rejected.`}
            </div>
            {pendingRequest.adminNote && <div className="mt-0.5 opacity-80">Note: {pendingRequest.adminNote}</div>}
          </div>
        </div>
      )}

      {/* Application Modal */}
      {applyingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: RANK_COLORS[gpsTier(applyingTo.guildPerformanceScore)] ?? "#71717a" }}
              >
                {applyingTo.name[0]}
              </div>
              <div>
                <div className="font-bold">{applyingTo.name}</div>
                <div className="text-xs text-zinc-500">{applyingTo.memberCount}/{applyingTo.memberCapacity} members</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Application Letter</label>
              <textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder="Tell the Captain what you'll contribute and why you'd be a great team member. Be specific about your availability and goals."
                className="w-full border border-zinc-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
              />
              <div className={cn("text-[11px] text-right", coverLetter.length < 50 ? "text-red-400" : "text-zinc-400")}>
                {coverLetter.length}/500 {coverLetter.length < 50 ? `(min 50, need ${50 - coverLetter.length} more)` : ""}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setApplyingTo(null)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={coverLetter.trim().length < 50 || applyMutation.isPending}
                onClick={submitApplication}
              >
                {applyMutation.isPending ? "Sending…" : "Submit Application"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Guild Creation Request Modal */}
      {showCreationForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
                <PlusCircle size={18} className="text-white" />
              </div>
              <div>
                <div className="font-black text-base">Request Guild Creation</div>
                <div className="text-xs text-zinc-500">Admin will review and approve your request.</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Guild Name *</label>
                <Input
                  value={creationForm.guildName}
                  onChange={e => setCreationForm(p => ({ ...p, guildName: e.target.value }))}
                  placeholder="e.g. Iron Wolves"
                  maxLength={60}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Short Description (optional)</label>
                <Input
                  value={creationForm.description}
                  onChange={e => setCreationForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What is your guild about?"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Why do you want to create a guild? *</label>
                <textarea
                  value={creationForm.reason}
                  onChange={e => setCreationForm(p => ({ ...p, reason: e.target.value }))}
                  rows={4}
                  maxLength={1000}
                  placeholder="Explain your vision, how you'll lead your team, and why you're ready for this responsibility. (min 50 characters)"
                  className="w-full border border-zinc-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
                />
                <div className={cn("text-[11px] text-right", creationForm.reason.length < 50 ? "text-red-400" : "text-zinc-400")}>
                  {creationForm.reason.length}/1000 {creationForm.reason.length < 50 ? `(min 50 — need ${50 - creationForm.reason.length} more)` : "✓"}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreationForm(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={
                  creationForm.guildName.trim().length < 3 ||
                  creationForm.reason.trim().length < 50 ||
                  creationRequestMutation.isPending
                }
                onClick={() => creationRequestMutation.mutate(creationForm)}
              >
                {creationRequestMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Submit Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuildDiscoveryPanel;
