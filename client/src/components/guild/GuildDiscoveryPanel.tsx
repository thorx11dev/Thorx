/**
 * GuildDiscoveryPanel — THORX v3 (spec F.6, Phase 3 redesign)
 * Default Engine C view for simple users (guildRole='simple').
 * GPS-sorted guild leaderboard with application flow.
 * NEVER shows PKR pool amounts — only TX-Points and success weeks.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RankBadge } from "@/components/RankBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TechnicalLabel from "@/components/ui/technical-label";
import { PremiumCard } from "@/components/ui/premium-card";
import {
  Search, Trophy, Lock, ChevronRight, Star, Shield, Loader2,
  ArrowLeft, Swords, Crown, Calendar, PlusCircle, CheckCircle2, XCircle,
  Hourglass, SlidersHorizontal, X, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { DEV_UNLOCK_RANK_GATES } from "@/lib/previewAccess";

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

const GUILD_NAME_SUGGESTIONS = ["Iron Wolves", "Pixel Raiders", "Shadow Syndicate"];
const GUILD_DESCRIPTION_SUGGESTIONS = ["A focused team that builds together", "Competitive players, one shared goal", "A crew for consistent weekly wins"];
const GUILD_REASON_SUGGESTIONS = ["Share your vision for the team...", "Tell us how you will lead your members...", "Explain what makes your guild different..."];

function AnimatedFieldPlaceholder({ examples }: { examples: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const example = examples[currentIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (isTyping) {
      if (currentText.length < example.length) {
        timeout = setTimeout(() => {
          setCurrentText(example.slice(0, currentText.length + 1));
        }, 55);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 1200);
      }
    } else if (currentText.length > 0) {
      timeout = setTimeout(() => setCurrentText(currentText.slice(0, -1)), 28);
    } else {
      setCurrentIndex(prev => (prev + 1) % examples.length);
      setIsTyping(true);
    }

    return () => clearTimeout(timeout);
  }, [currentText, currentIndex, examples, isTyping]);

  return <span>{currentText}<span className="animate-pulse text-primary">|</span></span>;
}

export function GuildDiscoveryPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState("All");
  const [recruitingOnly, setRecruitingOnly] = useState(false);
  const [warOnly, setWarOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"gps" | "members" | "streak">("gps");
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

  // Any rank may request guild creation — the backend no longer enforces a
  // rank floor here either, admin approval is the only gate.
  const pendingRequest = myRequest?.request;

  // Detail view — guild info + members (fetched on demand)
  const { data: guildDetail } = useQuery<any>({
    queryKey: ["guild", "detail", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}`); return r.json(); },
    enabled: !!viewingGuild,
  });
  const { data: guildMembers = [], isLoading: guildMembersLoading } = useQuery<any[]>({
    queryKey: ["guild", "members", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!viewingGuild,
  });
  const { data: guildWars = [] } = useQuery<any[]>({
    queryKey: ["guild", "wars", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}/war`); const d = await r.json(); return d.wars ?? d ?? []; },
    enabled: !!viewingGuild,
  });

  const { data: guilds = [], isLoading, isError, refetch } = useQuery<GuildDiscovery[]>({
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

  const filtered = guilds
    .filter(g => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (rankFilter !== "All" && gpsTier(g.guildPerformanceScore) !== rankFilter) return false;
      if (recruitingOnly && !g.recruitmentOpen) return false;
      if (warOnly && !g.inActiveWar) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "gps") return b.guildPerformanceScore - a.guildPerformanceScore;
      if (sortBy === "members") return b.memberCount - a.memberCount;
      if (sortBy === "streak") return (b.successfulWeeks ?? 0) - (a.successfulWeeks ?? 0);
      return 0;
    });

  const activeFilterCount = [rankFilter !== "All", recruitingOnly, warOnly].filter(Boolean).length;

  // No member cap — a guild accepts however many members its captain wants.
  // Recruitment being open (and meeting the rank floor) is the only gate.
  const canApply = (guild: GuildDiscovery) => {
    const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
    return userTierIdx >= minIdx && guild.recruitmentOpen;
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
    const applied = appliedIds.has(viewingGuild.id);
    const canApplyToViewing = canApply(viewingGuild);

    return (
      <div className="space-y-4 md:space-y-5">
        {/* Back */}
        <button
          onClick={() => setViewingGuild(null)}
          className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors min-h-[40px]"
          data-testid="button-back-to-guilds"
        >
          <ArrowLeft size={14} /> Back to guilds
        </button>

        {/* Guild Hero */}
        <PremiumCard className="space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shrink-0 overflow-hidden border-2 border-black/15"
              style={{ backgroundColor: accentColor }}
            >
              {viewingGuild.avatarUrl
                ? <img src={viewingGuild.avatarUrl} alt={viewingGuild.name} className="w-full h-full object-cover" />
                : viewingGuild.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-xl md:text-2xl tracking-tight" data-testid="text-guild-detail-name">{viewingGuild.name}</h2>
                <RankBadge rank={gpsTier(viewingGuild.guildPerformanceScore)} size="sm" />
                {viewingGuild.inActiveWar && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-destructive uppercase tracking-wider bg-destructive/10 border border-destructive/20 rounded-full px-2 py-0.5">
                    <Swords size={10} /> Active War
                  </span>
                )}
              </div>
              {viewingGuild.description && <p className="text-sm text-muted-foreground mt-1">{viewingGuild.description}</p>}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t-2 border-black/10">
            <div>
              <TechnicalLabel text="GPS SCORE" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg tracking-tighter tabular-nums">{viewingGuild.guildPerformanceScore.toLocaleString()}</div>
            </div>
            <div>
              <TechnicalLabel text="MEMBERS" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg tracking-tighter">{viewingGuild.memberCount}</div>
            </div>
            <div>
              <TechnicalLabel text="MIN RANK" className="text-muted-foreground text-[9px] mb-1" />
              <div className="mt-0.5">
                <RankBadge rank={viewingGuild.minRankRequired} size="sm" />
              </div>
            </div>
            <div>
              <TechnicalLabel text="SUCCESS WEEKS" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg tracking-tighter flex items-center gap-1">
                {(viewingGuild.successfulWeeks ?? 0) > 0 && <Star size={13} className="text-primary fill-primary shrink-0" />}
                {viewingGuild.successfulWeeks ?? 0}
              </div>
            </div>
          </div>

          {/* Weekly progress */}
          {viewingGuild.weeklyTarget > 0 && (
            <div className="pt-4 border-t-2 border-black/10 space-y-1.5">
              <div className="flex justify-between items-center">
                <TechnicalLabel text="WEEKLY TARGET" className="text-muted-foreground text-[9px]" />
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {viewingGuild.currentWeeklyPoints.toLocaleString()} / {viewingGuild.weeklyTarget.toLocaleString()} pts
                </span>
              </div>
              <Progress value={Math.min(100, (viewingGuild.currentWeeklyPoints / viewingGuild.weeklyTarget) * 100)} className="h-2.5 border border-black/15" />
            </div>
          )}

          {/* Apply CTA */}
          <div className="pt-4 border-t-2 border-black/10">
            {applied ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border-2 border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 size={13} /> Application Sent
              </div>
            ) : !viewingGuild.recruitmentOpen ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-muted/50 border-2 border-black/10 rounded-lg px-3 py-2">
                <XCircle size={13} /> Recruitment Closed
              </div>
            ) : !canApplyToViewing ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Lock size={12} />
                <span>Need <RankBadge rank={viewingGuild.minRankRequired} size="sm" /> to apply</span>
              </div>
            ) : (
              <Button
                onClick={() => { setApplyingTo(viewingGuild); setCoverLetter(""); }}
                data-testid="button-apply-to-join"
              >
                Apply to Join <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </PremiumCard>

        {/* Members List */}
        <PremiumCard interactive={false}>
          <TechnicalLabel text={`GUILD ROSTER — ${viewingGuild.memberCount}`} className="text-muted-foreground text-[10px] mb-3" />
          {guildMembersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : guildMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No members data available.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {guildMembers.map((m: any) => (
                <div key={m.userId} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/[0.03] transition-colors min-h-[44px]">
                  <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-black shrink-0">
                    {(m.firstName || m.identity || "M")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate">{m.firstName || m.identity || "Member"}</span>
                      {m.userId === detail?.captainId && (
                        <span className="p-1 bg-primary/10 border border-primary/20 rounded-md">
                          <Crown size={10} className="text-primary" />
                        </span>
                      )}
                    </div>
                    {m.userRankTier && <RankBadge rank={m.userRankTier} size="sm" className="mt-0.5" />}
                  </div>
                  <div className="text-xs text-muted-foreground font-bold tabular-nums shrink-0">{(m.weeklyPointsContributed ?? 0).toLocaleString()} pts</div>
                </div>
              ))}
            </div>
          )}
        </PremiumCard>

        {/* War History */}
        {guildWars.length > 0 && (
          <PremiumCard interactive={false}>
            <TechnicalLabel text="BATTLE HISTORY" className="text-muted-foreground text-[10px] mb-3" />
            <div className="space-y-2.5">
              {guildWars.slice(0, 5).map((w: any) => {
                const won = w.winnerId === viewingGuild.id;
                const isActive = w.status === "active";
                return (
                  <div key={w.id} className="flex items-center gap-3 text-xs min-h-[36px]">
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", isActive ? "bg-primary animate-pulse" : won ? "bg-emerald-500" : "bg-destructive/60")} />
                    <span className="flex-1 font-bold text-foreground">
                      {isActive ? "Active War" : won ? "Victory" : "Defeat"}
                    </span>
                    {w.completedAt && (
                      <span className="text-muted-foreground">{formatDistanceToNow(new Date(w.completedAt), { addSuffix: true })}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </PremiumCard>
        )}

        {/* Application Modal (shared) */}
        {applyingTo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0"
                    style={{ backgroundColor: RANK_COLORS[gpsTier(applyingTo.guildPerformanceScore)] ?? "#71717a" }}
                  >
                    {applyingTo.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black truncate">{applyingTo.name}</div>
                    <div className="text-xs text-muted-foreground">{applyingTo.memberCount} members</div>
                  </div>
                </div>
                <button
                  onClick={() => setApplyingTo(null)}
                  className="w-8 h-8 rounded-xl border-2 border-black/15 hover:border-black flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-150 shrink-0"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="space-y-2">
                <TechnicalLabel text="APPLICATION LETTER" className="text-muted-foreground text-[9px]" />
                <Textarea
                  value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={5} maxLength={500}
                  placeholder="Tell the Captain what you'll contribute and why you'd be a great team member."
                  className="resize-none border-2 border-black/20 rounded-xl focus-visible:ring-0 focus-visible:border-primary"
                  data-testid="input-cover-letter"
                />
                <div className={cn("text-[11px] text-right font-bold", coverLetter.length < 50 ? "text-destructive" : "text-muted-foreground")}>
                  {coverLetter.length}/500 {coverLetter.length < 50 ? `(min 50, need ${50 - coverLetter.length} more)` : ""}
                </div>
              </div>
              <div className="flex gap-2.5">
                <Button variant="outline" className="flex-1" onClick={() => setApplyingTo(null)} data-testid="button-cancel-application">Cancel</Button>
                <Button
                  className="flex-1"
                  disabled={coverLetter.trim().length < 50 || applyMutation.isPending}
                  onClick={submitApplication}
                  data-testid="button-submit-application"
                >
                  {applyMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : "Submit Application"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Filters */}
      <PremiumCard interactive={false} className="space-y-3 p-4 md:p-5">
        {/* Row 1: Search + Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search guilds…"
              className="pl-9 pr-8 h-10 border-2 border-black/20 rounded-xl text-sm font-medium focus-visible:border-primary focus-visible:ring-0 transition-colors placeholder:text-muted-foreground/60 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-guild-search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger
              className="h-10 w-auto gap-2 px-3 border-2 border-black/20 rounded-xl text-[11px] font-black uppercase tracking-wider shrink-0 focus:ring-0 focus:border-primary hover:border-black transition-colors bg-background"
              data-testid="select-sort-by"
            >
              <SlidersHorizontal size={12} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gps">Top GPS</SelectItem>
              <SelectItem value="members">Most Members</SelectItem>
              <SelectItem value="streak">Best Streak</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="h-px bg-black/10" />

        {/* Row 2: Rank chips + Toggle filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Rank chips — scrollable on mobile */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 pb-0.5">
            <TechnicalLabel text="RANK" className="text-muted-foreground text-[9px] mr-1 shrink-0" />
            {["All", ...RANK_ORDER].map(r => {
              const active = rankFilter === r;
              return (
                <button
                  key={r}
                  onClick={() => setRankFilter(r)}
                  data-testid={r === "All" ? "chip-rank-all" : `chip-rank-${r}`}
                  className={cn(
                    "h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 transition-all duration-150 shrink-0 min-w-[40px]",
                    active
                      ? "border-black bg-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
                      : "border-black/20 text-muted-foreground hover:border-black hover:text-foreground bg-transparent"
                  )}
                >
                  {r === "All" ? "All" : r.replace("-Rank", "")}
                </button>
              );
            })}
          </div>

          {/* Vertical divider — desktop only */}
          <div className="w-px h-7 bg-black/15 hidden sm:block shrink-0" />

          {/* Toggle filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "recruiting", active: recruitingOnly, set: () => setRecruitingOnly(v => !v), icon: CheckCircle2, label: "Recruiting", testId: "chip-recruiting" },
              { id: "war",        active: warOnly,        set: () => setWarOnly(v => !v),         icon: Swords,       label: "In War",     testId: "chip-war" },
            ].map(({ id, active, set, icon: Icon, label, testId }) => (
              <button
                key={id}
                onClick={set}
                data-testid={testId}
                className={cn(
                  "h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 flex items-center gap-1.5 transition-all duration-150 min-w-[40px]",
                  active
                    ? "bg-primary border-primary text-primary-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,0.25)]"
                    : "border-black/20 text-muted-foreground hover:border-black hover:text-foreground bg-transparent"
                )}
              >
                <Icon size={10} />
                {label}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setRankFilter("All"); setRecruitingOnly(false); setWarOnly(false); }}
                className="h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 border-black/20 text-muted-foreground hover:border-black hover:text-foreground flex items-center gap-1 transition-all duration-150"
              >
                <X size={10} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        {(search || activeFilterCount > 0) && (
          <div className="pt-1 border-t border-black/10">
            <TechnicalLabel
              text={`${filtered.length} GUILD${filtered.length !== 1 ? "S" : ""} FOUND`}
              className="text-muted-foreground text-[9px]"
            />
          </div>
        )}
      </PremiumCard>

      {/* Guild Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3 bg-[#050505] border-2 border-black rounded-xl p-2.5 md:p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#101010] rounded-[10px] border border-white/15 overflow-hidden">
              <Skeleton className="aspect-square w-full rounded-none bg-white/10" />
              <div className="p-2 space-y-2">
                <Skeleton className="h-3 w-2/3 rounded bg-white/10" />
                <Skeleton className="h-2 w-full rounded bg-white/10" />
                <div className="grid grid-cols-2 gap-1.5 py-2 border-y border-white/10">
                  <Skeleton className="h-6 w-full rounded bg-white/10" />
                  <Skeleton className="h-6 w-full rounded bg-white/10" />
                  <Skeleton className="h-6 w-full rounded bg-white/10" />
                  <Skeleton className="h-6 w-full rounded bg-white/10" />
                </div>
                <Skeleton className="h-6 w-full rounded bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <PremiumCard interactive={false} className="py-10 text-center">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl w-fit mx-auto mb-4">
            <Shield className="w-7 h-7 text-muted-foreground" />
          </div>
          <TechnicalLabel text="FAILED TO LOAD GUILDS" className="text-muted-foreground text-xs mb-2" />
          <p className="text-sm text-muted-foreground mb-4">Could not fetch the guild directory.</p>
          <button
            onClick={() => refetch()}
            className="text-destructive text-sm font-bold uppercase tracking-wider hover:underline"
          >
            Retry
          </button>
        </PremiumCard>
      ) : guilds.length === 0 ? (
        <PremiumCard interactive={false} className="py-12 md:py-16 text-center">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl w-fit mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <TechnicalLabel text="NO GUILDS YET" className="text-muted-foreground text-xs mb-2" />
          <p className="text-sm text-muted-foreground mb-6">Be the first to found a guild on THORX.</p>
          {!pendingRequest && (
            <Button
              onClick={() => setShowCreationForm(true)}
              data-testid="button-request-guild-creation-empty"
            >
              <PlusCircle size={14} /> Request Guild Creation
            </Button>
          )}
          {pendingRequest && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border-2 border-amber-200 rounded-lg px-3 py-2">
              <Hourglass size={12} /> Your guild creation request is pending admin review.
            </div>
          )}
        </PremiumCard>
      ) : filtered.length === 0 ? (
        <PremiumCard interactive={false} className="py-10 md:py-12 text-center">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl w-fit mx-auto mb-4">
            <Search className="w-7 h-7 text-muted-foreground" />
          </div>
          <TechnicalLabel text="NO MATCHES" className="text-muted-foreground text-xs mb-2" />
          <p className="text-sm text-muted-foreground">No guilds match your current filters.</p>
        </PremiumCard>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3 bg-[#050505] border-2 border-black rounded-xl p-2.5 md:p-3">
          {filtered.map((guild, idx) => {
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            // Phase 3 redesign: dev preview mode never shows this as blocked so
            // the Apply flow stays clickable for visual/functional review — the
            // backend still independently enforces real rank eligibility.
            const rankBlocked = !DEV_UNLOCK_RANK_GATES && userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            return (
              <div
                key={guild.id}
                onClick={() => setViewingGuild(guild)}
                data-testid={`card-guild-${guild.id}`}
                className="group relative bg-[#111111] rounded-[10px] border border-white/15 overflow-hidden cursor-pointer flex flex-col transition-all duration-200 ease-out hover:-translate-y-1 hover:border-primary hover:shadow-[3px_3px_0px_0px_rgba(255,107,61,0.85)]"
              >
                {/* Compact square media block from the reference catalog layout. */}
                <div
                  className="relative aspect-square flex items-center justify-center shrink-0 overflow-hidden bg-[#252525]"
                >
                  {guild.avatarUrl ? (
                    <img src={guild.avatarUrl} alt={guild.name} className="w-full h-full object-cover grayscale-[0.2] contrast-[1.05]" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/[0.06]">
                      <span className="text-4xl md:text-5xl font-black text-primary select-none">{guild.name[0].toUpperCase()}</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-black text-white/85 tracking-wider bg-black/70 rounded px-1.5 py-0.5">#{idx + 1}</span>
                  <span className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-black shadow-[0_1px_0_rgba(255,255,255,0.45)]">
                    {gpsTier(guild.guildPerformanceScore).replace("-Rank", "")}
                  </span>
                  {guild.inActiveWar && (
                    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 text-[8px] font-black text-black uppercase tracking-wider bg-primary rounded px-1.5 py-0.5">
                      <Swords size={10} /> War
                    </span>
                  )}
                </div>

                {/* Compact catalog body, matching the pinned image's dense cards. */}
                <div className="p-2 md:p-2.5 flex flex-col flex-1 gap-1.5 text-white">
                  {/* Name + description */}
                  <div>
                    <h3 className="font-black text-[10px] md:text-xs leading-tight truncate uppercase tracking-tight" data-testid={`text-guild-name-${guild.id}`}>{guild.name}</h3>
                    <p className="text-[8px] md:text-[9px] text-white/55 mt-0.5 truncate">{guild.description || "No description provided."}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-y border-white/15 py-1.5">
                    <div>
                      <span className="block text-[7px] uppercase tracking-wider text-white/45">GPS</span>
                      <span className="block text-[9px] font-black tabular-nums text-primary truncate">{guild.guildPerformanceScore.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block text-[7px] uppercase tracking-wider text-white/45">Members</span>
                      <span className="block text-[9px] font-black">{guild.memberCount}/{guild.memberCapacity}</span>
                    </div>
                    <div>
                      <span className="block text-[7px] uppercase tracking-wider text-white/45">Min rank</span>
                      <span className="block text-[9px] font-black">{guild.minRankRequired.replace("-Rank", "")}</span>
                    </div>
                    <div>
                      <span className="block text-[7px] uppercase tracking-wider text-white/45">Streak</span>
                      <span className="block text-[9px] font-black">{guild.successfulWeeks ?? 0}w</span>
                    </div>
                  </div>

                  {/* Weekly progress */}
                  {guild.weeklyTarget > 0 && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[7px] text-white/55">
                        <span>This week</span>
                        <span className="font-bold tabular-nums">{guild.currentWeeklyPoints.toLocaleString()}/{guild.weeklyTarget.toLocaleString()}</span>
                      </div>
                      <Progress value={Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100)} className="h-0.5 bg-white/15 [&>div]:bg-primary" />
                    </div>
                  )}

                  {/* Footer: recruitment status + action */}
                  <div className="flex items-center justify-between gap-1.5 mt-auto pt-0.5">
                    <span className={cn("text-[8px] font-black truncate uppercase", guild.recruitmentOpen ? "text-primary" : "text-white/45")}>
                      {guild.recruitmentOpen ? "Recruiting" : "Closed"}
                    </span>
                    {applied ? (
                      <div className="inline-flex items-center gap-1 text-[8px] font-black text-primary bg-primary/15 border border-primary/30 rounded px-1.5 py-0.5">
                        <CheckCircle2 size={10} /> Applied
                      </div>
                    ) : rankBlocked ? (
                      <div className="flex items-center gap-1 text-[9px] font-bold text-white/60">
                        <Lock size={11} />
                        <span>{guild.minRankRequired.replace("-Rank", "")}</span>
                      </div>
                    ) : !guild.recruitmentOpen ? (
                      <span className="text-[9px] font-bold text-white/60">Closed</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleApply(guild); }}
                        className="h-6 px-2 text-[8px] font-black uppercase tracking-wider bg-primary text-black hover:bg-white hover:text-black"
                        data-testid={`button-apply-guild-${guild.id}`}
                      >
                        Apply <ChevronRight size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Guild Creation Request CTA — open to any rank, admin-approved */}
      {!pendingRequest && guilds.length > 0 && (
        <PremiumCard className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0 w-fit">
            <PlusCircle size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black">Want to start your own guild?</div>
            <div className="text-xs text-muted-foreground mt-0.5">Any rank can request admin approval to create a new guild.</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreationForm(true)}
            className="shrink-0 w-full sm:w-auto"
            data-testid="button-request-guild-creation"
          >
            Request Creation
          </Button>
        </PremiumCard>
      )}

      {/* Pending request status */}
      {pendingRequest && (
        <PremiumCard
          interactive={false}
          className={cn(
            "flex items-start gap-3",
            pendingRequest.status === "pending" ? "border-amber-300 bg-amber-50" :
            pendingRequest.status === "approved" ? "border-emerald-300 bg-emerald-50" :
            "border-destructive/30 bg-destructive/5"
          )}
        >
          <div className={cn(
            "p-2 rounded-lg border shrink-0",
            pendingRequest.status === "pending" ? "bg-amber-100 border-amber-200 text-amber-700" :
            pendingRequest.status === "approved" ? "bg-emerald-100 border-emerald-200 text-emerald-700" :
            "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {pendingRequest.status === "pending" && <Hourglass size={14} />}
            {pendingRequest.status === "approved" && <CheckCircle2 size={14} />}
            {pendingRequest.status === "rejected" && <XCircle size={14} />}
          </div>
          <div>
            <div className={cn(
              "text-sm font-black",
              pendingRequest.status === "pending" ? "text-amber-800" :
              pendingRequest.status === "approved" ? "text-emerald-800" :
              "text-destructive"
            )}>
              {pendingRequest.status === "pending" && `Guild request "${pendingRequest.guildName}" is pending admin review.`}
              {pendingRequest.status === "approved" && `Guild "${pendingRequest.guildName}" approved! You are now its Captain.`}
              {pendingRequest.status === "rejected" && `Guild request "${pendingRequest.guildName}" was rejected.`}
            </div>
            {pendingRequest.adminNote && (
              <div className="text-xs text-muted-foreground mt-0.5">Note: {pendingRequest.adminNote}</div>
            )}
          </div>
        </PremiumCard>
      )}

      {/* Application Modal */}
      {applyingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0"
                  style={{ backgroundColor: RANK_COLORS[gpsTier(applyingTo.guildPerformanceScore)] ?? "#71717a" }}
                >
                  {applyingTo.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-black truncate">{applyingTo.name}</div>
                  <div className="text-xs text-muted-foreground">{applyingTo.memberCount} members</div>
                </div>
              </div>
              <button
                onClick={() => setApplyingTo(null)}
                className="w-8 h-8 rounded-xl border-2 border-black/15 hover:border-black flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-150 shrink-0"
              >
                <X size={13} />
              </button>
            </div>

            <div className="space-y-2">
              <TechnicalLabel text="APPLICATION LETTER" className="text-muted-foreground text-[9px]" />
              <Textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder="Tell the Captain what you'll contribute and why you'd be a great team member. Be specific about your availability and goals."
                className="resize-none border-2 border-black/20 rounded-xl focus-visible:ring-0 focus-visible:border-primary"
                data-testid="input-cover-letter"
              />
              <div className={cn("text-[11px] text-right font-bold", coverLetter.length < 50 ? "text-destructive" : "text-muted-foreground")}>
                {coverLetter.length}/500 {coverLetter.length < 50 ? `(min 50, need ${50 - coverLetter.length} more)` : ""}
              </div>
            </div>

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setApplyingTo(null)} data-testid="button-cancel-application">Cancel</Button>
              <Button
                className="flex-1"
                disabled={coverLetter.trim().length < 50 || applyMutation.isPending}
                onClick={submitApplication}
                data-testid="button-submit-application"
              >
                {applyMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : "Submit Application"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Guild Creation Request Modal */}
      {showCreationForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCreationForm(false); }}
        >
          {/* Sheet on mobile, centered card on desktop */}
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-2 border-black shadow-[0_-4px_0_0_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b-2 border-black/10">
              <div>
                <div className="font-black text-sm tracking-tight">Request Guild Creation</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Admin will review and approve your request.</div>
              </div>
              <button
                onClick={() => setShowCreationForm(false)}
                className="w-9 h-9 rounded-xl border-2 border-black/15 hover:border-black flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-150 shrink-0"
                data-testid="button-close-creation-modal"
              >
                <X size={13} />
              </button>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-4">

              {/* Guild Name */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <TechnicalLabel text="GUILD NAME" className="text-foreground/70 text-[9px]" />
                  <TechnicalLabel text="REQUIRED" className="text-primary text-[9px]" />
                </div>
                <div className="relative">
                  <Input
                    value={creationForm.guildName}
                    onChange={e => setCreationForm(p => ({ ...p, guildName: e.target.value }))}
                    maxLength={60}
                    className="h-11 border-2 border-black/20 rounded-xl bg-background font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors placeholder:text-transparent"
                    data-testid="input-guild-name"
                  />
                  {!creationForm.guildName && (
                    <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-sm text-muted-foreground/60">
                      <AnimatedFieldPlaceholder examples={GUILD_NAME_SUGGESTIONS} />
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <TechnicalLabel text="SHORT DESCRIPTION" className="text-foreground/70 text-[9px]" />
                  <TechnicalLabel text="OPTIONAL" className="text-muted-foreground text-[9px]" />
                </div>
                <div className="relative">
                  <Input
                    value={creationForm.description}
                    onChange={e => setCreationForm(p => ({ ...p, description: e.target.value }))}
                    maxLength={200}
                    className="h-11 border-2 border-black/20 rounded-xl bg-background font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors placeholder:text-transparent"
                    data-testid="input-guild-description"
                  />
                  {!creationForm.description && (
                    <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-sm text-muted-foreground/60">
                      <AnimatedFieldPlaceholder examples={GUILD_DESCRIPTION_SUGGESTIONS} />
                    </div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <TechnicalLabel text="WHY CREATE A GUILD?" className="text-foreground/70 text-[9px]" />
                  <TechnicalLabel text="REQUIRED" className="text-primary text-[9px]" />
                </div>
                <div className="relative">
                  <Textarea
                    value={creationForm.reason}
                    onChange={e => setCreationForm(p => ({ ...p, reason: e.target.value }))}
                    rows={4}
                    maxLength={1000}
                    className="resize-none border-2 border-black/20 rounded-xl bg-background font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors placeholder:text-transparent leading-relaxed"
                    data-testid="input-guild-reason"
                  />
                  {!creationForm.reason && (
                    <div className="absolute top-3 left-3 right-3 pointer-events-none text-sm text-muted-foreground/60 leading-relaxed">
                      <AnimatedFieldPlaceholder examples={GUILD_REASON_SUGGESTIONS} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1 h-1 bg-black/10 rounded-full overflow-hidden mr-3">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.min(100, (creationForm.reason.length / 50) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black tabular-nums shrink-0 text-primary">
                    {creationForm.reason.length < 50
                      ? `${50 - creationForm.reason.length} more`
                      : `${creationForm.reason.length}/1000`}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-6 pt-1 flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setShowCreationForm(false)}
                data-testid="button-cancel-creation-request"
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11"
                disabled={
                  creationForm.guildName.trim().length < 3 ||
                  creationForm.reason.trim().length < 50 ||
                  creationRequestMutation.isPending
                }
                onClick={() => creationRequestMutation.mutate(creationForm)}
                data-testid="button-submit-creation-request"
              >
                {creationRequestMutation.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Submitting…</>
                  : "Submit Request"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuildDiscoveryPanel;
