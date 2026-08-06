/**
 * GuildDiscoveryPanel — THORX v3 (spec F.6)
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
import { Search, Users, Trophy, Lock, ChevronRight, Star, Shield, Loader2, ArrowLeft, Swords, Crown, Calendar, PlusCircle, CheckCircle2, XCircle, Hourglass, SlidersHorizontal, X } from "lucide-react";
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
  const [slotsOnly, setSlotsOnly] = useState(false);
  const [recruitingOnly, setRecruitingOnly] = useState(false);
  const [warOnly, setWarOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"gps" | "members" | "streak" | "slots">("gps");
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

  const filtered = guilds
    .filter(g => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (rankFilter !== "All" && gpsTier(g.guildPerformanceScore) !== rankFilter) return false;
      if (slotsOnly && g.memberCount >= g.memberCapacity) return false;
      if (recruitingOnly && !g.recruitmentOpen) return false;
      if (warOnly && !g.inActiveWar) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "gps") return b.guildPerformanceScore - a.guildPerformanceScore;
      if (sortBy === "members") return b.memberCount - a.memberCount;
      if (sortBy === "streak") return (b.successfulWeeks ?? 0) - (a.successfulWeeks ?? 0);
      if (sortBy === "slots") return (b.memberCapacity - b.memberCount) - (a.memberCapacity - a.memberCount);
      return 0;
    });

  const activeFilterCount = [rankFilter !== "All", slotsOnly, recruitingOnly, warOnly].filter(Boolean).length;

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
      <div className="space-y-4 md:space-y-5">
        {/* Back */}
        <button
          onClick={() => setViewingGuild(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-guilds"
        >
          <ArrowLeft size={14} /> Back to guilds
        </button>

        {/* Guild Hero */}
        <div className="rounded-2xl border-2 border-black/15 dark:border-white/15 bg-card p-5 md:p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shrink-0 overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
            >
              {viewingGuild.avatarUrl
                ? <img src={viewingGuild.avatarUrl} alt={viewingGuild.name} className="w-full h-full object-cover" />
                : viewingGuild.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-xl md:text-2xl tracking-tight" data-testid="text-guild-detail-name">{viewingGuild.name}</h2>
                <RankBadge rank={gpsTier(viewingGuild.guildPerformanceScore)} size="sm" />
              </div>
              {viewingGuild.description && <p className="text-sm text-muted-foreground mt-1">{viewingGuild.description}</p>}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-black/10 dark:border-white/10">
            <div>
              <TechnicalLabel text="GPS SCORE" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg font-mono">{viewingGuild.guildPerformanceScore.toLocaleString()}</div>
            </div>
            <div>
              <TechnicalLabel text="MEMBERS" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg">{viewingGuild.memberCount}/{viewingGuild.memberCapacity}</div>
            </div>
            <div>
              <TechnicalLabel text="MIN RANK" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg" style={{ color: RANK_COLORS[viewingGuild.minRankRequired] ?? "#71717a" }}>
                {viewingGuild.minRankRequired}
              </div>
            </div>
            <div>
              <TechnicalLabel text="SUCCESS WEEKS" className="text-muted-foreground text-[9px] mb-1" />
              <div className="font-black text-lg">{viewingGuild.successfulWeeks ?? 0}</div>
            </div>
          </div>

          {/* Weekly progress */}
          {viewingGuild.weeklyTarget > 0 && (
            <div className="pt-4 border-t border-black/10 dark:border-white/10 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar size={11} /> This week's progress</span>
                <span className="font-mono">{viewingGuild.currentWeeklyPoints.toLocaleString()} / {viewingGuild.weeklyTarget.toLocaleString()} pts</span>
              </div>
              <Progress value={Math.min(100, (viewingGuild.currentWeeklyPoints / viewingGuild.weeklyTarget) * 100)} className="h-2" />
            </div>
          )}

          {/* Apply CTA */}
          <div className="pt-4 border-t border-black/10 dark:border-white/10">
            {applied ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 rounded-full">Application Sent ✓</Badge>
            ) : !viewingGuild.recruitmentOpen ? (
              <Badge variant="outline" className="text-muted-foreground rounded-full">Recruitment Closed</Badge>
            ) : slots === 0 ? (
              <Badge variant="outline" className="text-muted-foreground rounded-full">Guild Full</Badge>
            ) : !canApplyToViewing ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock size={12} /> Need {viewingGuild.minRankRequired} to apply</div>
            ) : (
              <Button
                size="sm"
                onClick={() => { setApplyingTo(viewingGuild); setCoverLetter(""); }}
                className="bg-primary text-black font-black uppercase tracking-wider rounded-lg hover:bg-primary/90"
                data-testid="button-apply-to-join"
              >
                Apply to Join <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Members List */}
        <div className="rounded-2xl border-2 border-black/15 dark:border-white/15 bg-card p-4 md:p-5">
          <TechnicalLabel text={`MEMBERS — ${guildMembers.length}`} className="text-muted-foreground text-[10px] mb-3" />
          {guildMembers.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {guildMembers.map((m: any) => (
                <div key={m.userId} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors">
                  <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0">
                    {(m.firstName || m.identity || "M")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate">{m.firstName || m.identity || "Member"}</span>
                      {m.userId === detail?.captainId && <Crown size={11} className="text-amber-500 shrink-0" />}
                    </div>
                    {m.userRankTier && <div className="text-[10px] text-muted-foreground">{m.userRankTier}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono shrink-0">{(m.weeklyPointsContributed ?? 0).toLocaleString()} pts</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* War History */}
        {guildWars.length > 0 && (
          <div className="rounded-2xl border-2 border-black/15 dark:border-white/15 bg-card p-4 md:p-5">
            <TechnicalLabel text="BATTLE HISTORY" className="text-muted-foreground text-[10px] mb-3" />
            <div className="space-y-2.5">
              {guildWars.slice(0, 5).map((w: any) => {
                const won = w.winnerId === viewingGuild.id;
                const isActive = w.status === "active";
                return (
                  <div key={w.id} className="flex items-center gap-3 text-xs">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-blue-400 animate-pulse" : won ? "bg-emerald-500" : "bg-red-400")} />
                    <span className="flex-1 font-medium text-foreground/80">
                      {isActive ? "Active War" : won ? "Victory" : "Defeat"}
                    </span>
                    {w.completedAt && (
                      <span className="text-muted-foreground">{formatDistanceToNow(new Date(w.completedAt), { addSuffix: true })}</span>
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
            <div className="bg-card rounded-2xl border-2 border-black dark:border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] w-full max-w-md p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black shrink-0"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
                >
                  {applyingTo.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-black truncate">{applyingTo.name}</div>
                  <div className="text-xs text-muted-foreground">{applyingTo.memberCount}/{applyingTo.memberCapacity} members</div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Application Letter</label>
                <Textarea
                  value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={5} maxLength={500}
                  placeholder="Tell the Captain what you'll contribute and why you'd be a great team member."
                  className="resize-none border-2 border-black/15 dark:border-white/15 rounded-lg focus-visible:ring-primary"
                  data-testid="input-cover-letter"
                />
                <div className={cn("text-[11px] text-right", coverLetter.length < 50 ? "text-red-500 font-medium" : "text-muted-foreground")}>
                  {coverLetter.length}/500 {coverLetter.length < 50 ? `(min 50, need ${50 - coverLetter.length} more)` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-2 border-black/15 dark:border-white/15 rounded-lg" onClick={() => setApplyingTo(null)} data-testid="button-cancel-application">Cancel</Button>
                <Button
                  className="flex-1 bg-primary text-black font-black uppercase tracking-wider rounded-lg hover:bg-primary/90"
                  disabled={coverLetter.trim().length < 50 || applyMutation.isPending}
                  onClick={submitApplication}
                  data-testid="button-submit-application"
                >
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
    <div className="space-y-5 md:space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border-2 border-black dark:border-white bg-card p-3 md:p-4 space-y-3">
        {/* Row 1: Search + Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search guilds…"
              className="pl-9 pr-8 h-10 bg-background border-2 border-black/20 dark:border-white/20 rounded-xl text-sm font-medium focus-visible:border-primary focus-visible:ring-0 transition-colors placeholder:text-muted-foreground/50"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-guild-search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger
              className="h-10 w-auto gap-2 px-3 bg-background border-2 border-black/20 dark:border-white/20 rounded-xl text-[11px] font-black uppercase tracking-wider shrink-0 focus:ring-0 focus:border-primary hover:border-black dark:hover:border-white transition-colors"
              data-testid="select-sort-by"
            >
              <SlidersHorizontal size={12} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gps">Top GPS</SelectItem>
              <SelectItem value="members">Most Members</SelectItem>
              <SelectItem value="streak">Best Streak</SelectItem>
              <SelectItem value="slots">Most Slots</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="h-px bg-black/10 dark:bg-white/10" />

        {/* Row 2: Rank chips + Toggle filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Rank chips */}
          <div className="flex items-center gap-1 flex-wrap flex-1">
            <TechnicalLabel text="RANK" className="text-muted-foreground text-[9px] mr-1 shrink-0" />
            {["All", ...RANK_ORDER].map(r => {
              const active = rankFilter === r;
              return (
                <button
                  key={r}
                  onClick={() => setRankFilter(r)}
                  data-testid={r === "All" ? "chip-rank-all" : `chip-rank-${r}`}
                  className={cn(
                    "h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 transition-all duration-150",
                    active
                      ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]"
                      : "border-black/20 dark:border-white/20 text-muted-foreground hover:border-black dark:hover:border-white hover:text-foreground bg-transparent"
                  )}
                >
                  {r === "All" ? "All" : r.replace("-Rank", "")}
                </button>
              );
            })}
          </div>

          {/* Vertical divider — desktop only */}
          <div className="w-px h-7 bg-black/15 dark:bg-white/15 hidden sm:block shrink-0" />

          {/* Toggle filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <TechnicalLabel text="FILTER" className="text-muted-foreground text-[9px] mr-0.5 shrink-0 sm:hidden" />
            {[
              { id: "slots",      active: slotsOnly,      set: () => setSlotsOnly(v => !v),       icon: Users,        label: "Open",       testId: "checkbox-slots-only" },
              { id: "recruiting", active: recruitingOnly, set: () => setRecruitingOnly(v => !v), icon: CheckCircle2, label: "Recruiting", testId: "chip-recruiting" },
              { id: "war",        active: warOnly,        set: () => setWarOnly(v => !v),         icon: Swords,       label: "In War",     testId: "chip-war" },
            ].map(({ id, active, set, icon: Icon, label, testId }) => (
              <button
                key={id}
                onClick={set}
                data-testid={testId}
                className={cn(
                  "h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 flex items-center gap-1.5 transition-all duration-150",
                  active
                    ? "bg-primary border-primary text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.25)]"
                    : "border-black/20 dark:border-white/20 text-muted-foreground hover:border-black dark:hover:border-white hover:text-foreground bg-transparent"
                )}
              >
                <Icon size={10} />
                {label}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setRankFilter("All"); setSlotsOnly(false); setRecruitingOnly(false); setWarOnly(false); }}
                className="h-7 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 border-black/20 dark:border-white/20 text-muted-foreground hover:border-black dark:hover:border-white hover:text-foreground flex items-center gap-1 transition-all duration-150"
              >
                <X size={10} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        {(search || activeFilterCount > 0) && (
          <div className="pt-1 border-t border-black/10 dark:border-white/10">
            <TechnicalLabel
              text={`${filtered.length} GUILD${filtered.length !== 1 ? "S" : ""} FOUND`}
              className="text-muted-foreground text-[9px]"
            />
          </div>
        )}
      </div>

      {/* Guild Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-card overflow-hidden">
              <Skeleton className="h-24 md:h-28 w-full rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <div className="grid grid-cols-2 gap-2 py-3 border-y border-black/10 dark:border-white/10">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : guilds.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 bg-card/50 p-12 md:p-16 text-center">
          <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <TechnicalLabel text="NO GUILDS YET" className="text-muted-foreground text-xs mb-2" />
          {!pendingRequest && (
            <Button
              onClick={() => setShowCreationForm(true)}
              className="mt-5 h-10 bg-black text-white border-2 border-black font-black text-xs uppercase tracking-wider rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] hover:bg-zinc-800 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.25)] transition-all duration-150"
              data-testid="button-request-guild-creation-empty"
            >
              <PlusCircle size={14} className="mr-1.5" /> Create
            </Button>
          )}
          {pendingRequest && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border-2 border-amber-200 rounded-lg px-3 py-1.5 mt-5">
              <Hourglass size={12} /> Your guild creation request is pending admin review.
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 bg-card/50 p-10 md:p-12 text-center">
          <Search className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No guilds match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {filtered.map((guild, idx) => {
            const slots = guild.memberCapacity - guild.memberCount;
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            // Phase 3 redesign: dev preview mode never shows this as blocked so
            // the Apply flow stays clickable for visual/functional review — the
            // backend still independently enforces real rank eligibility.
            const rankBlocked = !DEV_UNLOCK_RANK_GATES && userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            const accentColor = RANK_COLORS[gpsTier(guild.guildPerformanceScore)] ?? "#71717a";

            return (
              <div
                key={guild.id}
                onClick={() => setViewingGuild(guild)}
                data-testid={`card-guild-${guild.id}`}
                className="group relative rounded-2xl border-2 border-black/15 dark:border-white/15 bg-card overflow-hidden cursor-pointer flex flex-col transition-all duration-300 ease-out hover:-translate-y-1 hover:border-black dark:hover:border-white hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.15)]"
              >
                {/* Hero */}
                <div
                  className="relative h-24 md:h-28 flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
                >
                  {guild.avatarUrl ? (
                    <img src={guild.avatarUrl} alt={guild.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-white/90 select-none">{guild.name[0].toUpperCase()}</span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  <span className="absolute top-2.5 left-3 text-[10px] font-black text-white/80 tracking-wider">#{idx + 1}</span>
                  <RankBadge rank={gpsTier(guild.guildPerformanceScore)} size="sm" className="absolute top-2 right-2 !bg-white/95 !border-white/50 shadow-sm" />
                  {guild.inActiveWar && (
                    <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1 text-[10px] font-black text-white uppercase tracking-wider bg-red-600/90 rounded-full px-2 py-0.5">
                      <Swords size={10} /> War
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col flex-1 gap-3">
                  <div>
                    <h3 className="font-black text-base leading-tight truncate" data-testid={`text-guild-name-${guild.id}`}>{guild.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 min-h-[2em]">{guild.description || "No description provided."}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 py-3 border-y border-black/10 dark:border-white/10">
                    <div>
                      <TechnicalLabel text="GPS SCORE" className="text-muted-foreground text-[9px] mb-0.5" />
                      <div className="font-black text-sm font-mono">{guild.guildPerformanceScore.toLocaleString()}</div>
                    </div>
                    <div>
                      <TechnicalLabel text="MEMBERS" className="text-muted-foreground text-[9px] mb-0.5" />
                      <div className="font-black text-sm">{guild.memberCount}/{guild.memberCapacity}</div>
                    </div>
                    <div>
                      <TechnicalLabel text="MIN RANK" className="text-muted-foreground text-[9px] mb-0.5" />
                      <div className="font-black text-sm" style={{ color: RANK_COLORS[guild.minRankRequired] ?? "#71717a" }}>{guild.minRankRequired}</div>
                    </div>
                    <div>
                      <TechnicalLabel text="STREAK" className="text-muted-foreground text-[9px] mb-0.5" />
                      <div className="font-black text-sm flex items-center gap-1">
                        {(guild.successfulWeeks ?? 0) > 0 && <Star size={11} className="text-primary fill-primary shrink-0" />}
                        {guild.successfulWeeks ?? 0}w
                      </div>
                    </div>
                  </div>

                  {guild.weeklyTarget > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>This week</span>
                        <span className="font-mono">{guild.currentWeeklyPoints.toLocaleString()}/{guild.weeklyTarget.toLocaleString()}</span>
                      </div>
                      <Progress value={Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100)} className="h-1.5" />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                    <span className={cn("text-[11px] font-bold", slots > 0 ? "text-emerald-600" : "text-red-500")}>
                      {slots > 0 ? `${slots} slot${slots !== 1 ? "s" : ""} open` : "Full"}
                    </span>
                    {applied ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] rounded-full">Applied</Badge>
                    ) : rankBlocked ? (
                      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Lock size={11} /> {guild.minRankRequired}</div>
                    ) : !guild.recruitmentOpen ? (
                      <span className="text-[11px] font-bold text-muted-foreground">Closed</span>
                    ) : slots === 0 ? (
                      <span className="text-[11px] font-bold text-muted-foreground">Full</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleApply(guild)}
                        className="bg-primary text-black font-black text-[11px] uppercase tracking-wider rounded-lg h-8 px-3 hover:bg-primary/90"
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
        <div className="rounded-2xl border-2 border-black/15 dark:border-white/15 bg-card p-4 md:p-5 flex items-center gap-4 hover:border-black dark:hover:border-white transition-colors duration-300">
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <PlusCircle size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black">Want to start your own guild?</div>
            <div className="text-xs text-muted-foreground">Any rank can request admin approval to create a new guild.</div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreationForm(true)}
            className="shrink-0 bg-primary text-black font-black text-xs uppercase tracking-wider rounded-lg hover:bg-primary/90"
            data-testid="button-request-guild-creation"
          >
            Request
          </Button>
        </div>
      )}

      {/* Pending request status */}
      {pendingRequest && (
        <div className={cn(
          "rounded-2xl border-2 p-4 flex items-start gap-2.5 text-xs",
          pendingRequest.status === "pending" ? "bg-amber-50 border-amber-200 text-amber-700" :
          pendingRequest.status === "approved" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
          "bg-red-50 border-red-200 text-red-700"
        )}>
          {pendingRequest.status === "pending" && <Hourglass size={13} className="shrink-0 mt-0.5" />}
          {pendingRequest.status === "approved" && <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
          {pendingRequest.status === "rejected" && <XCircle size={13} className="shrink-0 mt-0.5" />}
          <div>
            <div className="font-bold">
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
          <div className="bg-card rounded-2xl border-2 border-black dark:border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black shrink-0"
                style={{ background: `linear-gradient(135deg, ${RANK_COLORS[gpsTier(applyingTo.guildPerformanceScore)] ?? "#71717a"}, ${RANK_COLORS[gpsTier(applyingTo.guildPerformanceScore)] ?? "#71717a"}cc)` }}
              >
                {applyingTo.name[0]}
              </div>
              <div className="min-w-0">
                <div className="font-black truncate">{applyingTo.name}</div>
                <div className="text-xs text-muted-foreground">{applyingTo.memberCount}/{applyingTo.memberCapacity} members</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Application Letter</label>
              <Textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder="Tell the Captain what you'll contribute and why you'd be a great team member. Be specific about your availability and goals."
                className="resize-none border-2 border-black/15 dark:border-white/15 rounded-lg focus-visible:ring-primary"
                data-testid="input-cover-letter"
              />
              <div className={cn("text-[11px] text-right", coverLetter.length < 50 ? "text-red-500 font-medium" : "text-muted-foreground")}>
                {coverLetter.length}/500 {coverLetter.length < 50 ? `(min 50, need ${50 - coverLetter.length} more)` : ""}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-2 border-black/15 dark:border-white/15 rounded-lg" onClick={() => setApplyingTo(null)} data-testid="button-cancel-application">Cancel</Button>
              <Button
                className="flex-1 bg-primary text-black font-black uppercase tracking-wider rounded-lg hover:bg-primary/90"
                disabled={coverLetter.trim().length < 50 || applyMutation.isPending}
                onClick={submitApplication}
                data-testid="button-submit-application"
              >
                {applyMutation.isPending ? "Sending…" : "Submit Application"}
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
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-2 border-black dark:border-white shadow-[0_-4px_0_0_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.15)] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b-2 border-black/10 dark:border-white/10">
              <div>
                <div className="font-black text-sm tracking-tight">Request Guild Creation</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Admin will review and approve.</div>
              </div>
              <button
                onClick={() => setShowCreationForm(false)}
                className="w-8 h-8 rounded-xl border-2 border-black/15 dark:border-white/15 hover:border-black dark:hover:border-white flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-150 shrink-0"
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
                    className="h-11 border-2 border-black/20 dark:border-white/20 rounded-xl bg-background font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 dark:hover:border-white/40 transition-colors placeholder:text-transparent"
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
                    className="h-11 border-2 border-black/20 dark:border-white/20 rounded-xl bg-background font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 dark:hover:border-white/40 transition-colors placeholder:text-transparent"
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
                    className="resize-none border-2 border-black/20 dark:border-white/20 rounded-xl bg-background font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 dark:hover:border-white/40 transition-colors placeholder:text-transparent leading-relaxed"
                    data-testid="input-guild-reason"
                  />
                  {!creationForm.reason && (
                    <div className="absolute top-3 left-3 right-3 pointer-events-none text-sm text-muted-foreground/60 leading-relaxed">
                      <AnimatedFieldPlaceholder examples={GUILD_REASON_SUGGESTIONS} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  {/* Progress bar */}
                  <div className="flex-1 h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mr-3">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.min(100, (creationForm.reason.length / 50) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black tabular-nums shrink-0 text-primary">
                    {creationForm.reason.length < 50
                      ? `${50 - creationForm.reason.length} more`
                      : `${creationForm.reason.length}/1000 ✓`}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-1 flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1 h-11 border-2 border-black/20 dark:border-white/20 hover:border-black dark:hover:border-white rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-150"
                onClick={() => setShowCreationForm(false)}
                data-testid="button-cancel-creation-request"
              >
                Cancel
              </Button>
              <Button
                className="flex-2 h-11 bg-black text-white border-2 border-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:border-zinc-300 disabled:opacity-100 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.25)] disabled:shadow-none transition-all duration-150 px-6"
                disabled={
                  creationForm.guildName.trim().length < 3 ||
                  creationForm.reason.trim().length < 50 ||
                  creationRequestMutation.isPending
                }
                onClick={() => creationRequestMutation.mutate(creationForm)}
                data-testid="button-submit-creation-request"
              >
                {creationRequestMutation.isPending
                  ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Submitting…</>
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
