/**
 * GuildDiscoveryPanel — THORX Guild Directory.
 * Default Guild section view for simple users (guildRole='simple').
 * GPS-sorted guild directory with application flow.
 *
 * Design: minimal, high-end — search + filter side panel + grid/list toggle.
 * Cards: 4-col desktop, compact sizing. All icons: lucide (clean, professional).
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Search, SlidersHorizontal, LayoutGrid, List, X, Swords, Shield, ShieldCheck,
  Lock, ArrowRight, Clock, Flame, Crown, Trophy, Loader2, RotateCcw, ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RankBadge } from "@/components/RankBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TechnicalLabel from "@/components/ui/technical-label";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { DEV_UNLOCK_RANK_GATES } from "@/lib/previewAccess";

/* ────────────────────────────────────────────────────────────────────────── */
/* Types + helpers                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

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
  rankTier?: string;
}

const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

function gpsTier(gps: number): string {
  if (gps >= 300000) return "S-Rank";
  if (gps >= 150000) return "A-Rank";
  if (gps >= 70000)  return "B-Rank";
  if (gps >= 30000)  return "C-Rank";
  if (gps >= 10000)  return "D-Rank";
  return "E-Rank";
}

function tierOf(g: GuildDiscovery): string {
  return g.rankTier ?? gpsTier(g.guildPerformanceScore);
}

function BlackChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center bg-black text-white px-2.5 py-1 rounded-sm font-black uppercase tracking-[0.2em] text-[8px] md:text-[9px]", className)}>
      {children}
    </span>
  );
}

const CTA_CLASS = "bg-primary text-white border-2 border-black rounded-lg hover:bg-black transition-all duration-300 transform hover:scale-[1.02] font-black uppercase tracking-wider";
const OUTLINE_CLASS = "bg-white text-black border-2 border-black rounded-lg hover:bg-black hover:text-white transition-all duration-300 font-black uppercase tracking-wider";

const EASE = [0.16, 1, 0.3, 1] as const;
const riseIn: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
const modalIn: Variants = {
  initial: { opacity: 0, y: 56, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } },
};

const CornerPlus = () => (
  <>
    <div className="absolute top-2 left-2 transition-transform duration-500 group-hover:rotate-180 group-hover:scale-125">
      <Plus className="size-3.5 text-black/20 group-hover:text-black" strokeWidth={2} />
    </div>
    <div className="absolute top-2 right-2 transition-transform duration-500 group-hover:rotate-90 group-hover:scale-125">
      <Plus className="size-3.5 text-black/20 group-hover:text-black" strokeWidth={2} />
    </div>
    <div className="absolute bottom-2 left-2 transition-transform duration-500 group-hover:-rotate-90 group-hover:scale-125">
      <Plus className="size-3.5 text-black/20 group-hover:text-black" strokeWidth={2} />
    </div>
    <div className="absolute bottom-2 right-2 transition-transform duration-500 group-hover:-rotate-180 group-hover:scale-125">
      <Plus className="size-3.5 text-black/20 group-hover:text-black" strokeWidth={2} />
    </div>
  </>
);

import { Plus } from "lucide-react";

const GUILD_NAME_SUGGESTIONS = ["Iron Wolves", "Pixel Raiders", "Shadow Syndicate", "Aurora Vanguard"];
const GUILD_DESCRIPTION_SUGGESTIONS = ["A focused team that builds together", "Competitive players, one shared goal", "A crew for consistent weekly wins"];
const GUILD_REASON_SUGGESTIONS = ["Share your vision for the team...", "Tell us how you will lead your members...", "Explain what makes your guild different..."];
const COVER_LETTER_SUGGESTIONS = [
  "I'm active daily and ready to help the guild hit its weekly target...",
  "Reliable, consistent and focused on helping the team win...",
  "I bring discipline, availability and a winning mentality...",
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Animated placeholder (auth-style typing effect)                           */
/* ────────────────────────────────────────────────────────────────────────── */

function AnimatedPlaceholder({ examples, className = "text-muted-foreground" }: { examples: string[]; className?: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const example = examples[currentIndex];
    let timeout: ReturnType<typeof setTimeout>;
    if (isTyping) {
      if (currentText.length < example.length) {
        timeout = setTimeout(() => setCurrentText(example.slice(0, currentText.length + 1)), 100);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 1000);
      }
    } else {
      if (currentText.length > 0) {
        timeout = setTimeout(() => setCurrentText(currentText.slice(0, -1)), 50);
      } else {
        setCurrentIndex(prev => (prev + 1) % examples.length);
        setIsTyping(true);
      }
    }
    return () => clearTimeout(timeout);
  }, [currentText, currentIndex, examples, isTyping]);

  return (
    <span className={className}>
      {currentText}<span className="animate-pulse">|</span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main component                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export function GuildDiscoveryPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState("All");
  const [recruitingOnly, setRecruitingOnly] = useState(false);
  const [warOnly, setWarOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"gps" | "members" | "streak">("gps");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterOpen, setFilterOpen] = useState(false);

  const [applyingTo, setApplyingTo] = useState<GuildDiscovery | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [viewingGuild, setViewingGuild] = useState<GuildDiscovery | null>(null);
  const [showCreationForm, setShowCreationForm] = useState(false);
  const [creationForm, setCreationForm] = useState({ guildName: "", description: "", reason: "" });

  /* ── Queries ─────────────────────────────────────────────────────────── */

  const { data: myRequest } = useQuery<{ request: any | null }>({
    queryKey: ["/api/guilds/my-creation-request"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/guilds/my-creation-request"); return r.json(); },
  });

  const { data: myApplication } = useQuery<{ application: { guildId: string } | null }>({
    queryKey: ["/api/guilds/my-application"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/guilds/my-application"); return r.json(); },
  });
  useEffect(() => {
    const guildId = myApplication?.application?.guildId;
    if (guildId) setAppliedIds(prev => new Set(prev).add(guildId));
  }, [myApplication]);

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
    queryKey: ["guild", "wars", "history", viewingGuild?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${viewingGuild!.id}/war/history`); const d = await r.json(); return d.wars ?? []; },
    enabled: !!viewingGuild,
  });
  const { data: guilds = [], isLoading, isError, refetch } = useQuery<GuildDiscovery[]>({
    queryKey: ["/api/guilds/discovery"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/guilds/discovery"); const data = await res.json(); return data.guilds ?? data; },
  });

  /* ── Mutations ───────────────────────────────────────────────────────── */

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
      queryClient.invalidateQueries({ queryKey: ["/api/guilds/my-application"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to submit application.", variant: "destructive" });
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

  /* ── Derived ─────────────────────────────────────────────────────────── */

  const userTierIdx = RANK_ORDER.indexOf(user?.userRankTier || "E-Rank");
  const alreadyInGuild = !!user?.guildId;
  const pendingRequest = myRequest?.request;

  const filtered = guilds
    .filter(g => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (rankFilter !== "All" && tierOf(g) !== rankFilter) return false;
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

  const canApply = (guild: GuildDiscovery) => {
    const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
    return !alreadyInGuild && userTierIdx >= minIdx && guild.recruitmentOpen;
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

  const resetFilters = () => {
    setRankFilter("All");
    setRecruitingOnly(false);
    setWarOnly(false);
    setSortBy("gps");
  };

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (applyingTo) setApplyingTo(null);
      else if (showCreationForm) setShowCreationForm(false);
      else if (viewingGuild) setViewingGuild(null);
      else if (filterOpen) setFilterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyingTo, showCreationForm, viewingGuild, filterOpen]);

  /* ── Filter panel content (shared between mobile bottom sheet + desktop side panel) ── */

  const filterContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b-2 border-black shrink-0">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="size-4" />
          <span className="font-black text-sm uppercase tracking-wider">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-primary text-white text-[9px] font-black px-2 py-0.5 rounded-full">{activeFilterCount}</span>
          )}
        </div>
        <button
          onClick={() => setFilterOpen(false)}
          className="w-8 h-8 rounded-lg border-2 border-black/15 hover:border-black flex items-center justify-center text-black/50 hover:text-black transition-all duration-150"
          aria-label="Close filters"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Sort */}
        <div className="space-y-2.5">
          <TechnicalLabel text="SORT BY" className="text-black/40 text-[9px]" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-11 border-2 border-black/15 rounded-lg text-[10px] font-black uppercase tracking-wider focus:ring-0 focus:border-primary hover:border-black transition-colors bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gps">Top GPS</SelectItem>
              <SelectItem value="members">Most Members</SelectItem>
              <SelectItem value="streak">Best Streak</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rank filter */}
        <div className="space-y-2.5">
          <TechnicalLabel text="RANK" className="text-black/40 text-[9px]" />
          <div className="flex flex-wrap gap-1.5">
            {["All", ...RANK_ORDER].map(r => {
              const active = rankFilter === r;
              return (
                <button
                  key={r}
                  onClick={() => setRankFilter(r)}
                  className={cn(
                    "h-9 px-3 rounded-sm text-[9px] font-black uppercase tracking-wider border-2 transition-all duration-150 min-w-[40px]",
                    active
                      ? "border-black bg-black text-white"
                      : "border-black/15 text-black/55 hover:border-black hover:text-black bg-white"
                  )}
                >
                  {r === "All" ? "All" : r.replace("-Rank", "")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-2.5">
          <TechnicalLabel text="STATUS" className="text-black/40 text-[9px]" />
          <div className="space-y-2">
            <button
              onClick={() => setRecruitingOnly(v => !v)}
              className={cn(
                "w-full h-11 px-4 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider flex items-center gap-2.5 transition-all duration-150",
                recruitingOnly
                  ? "border-black bg-black text-white"
                  : "border-black/15 text-black/60 hover:border-black bg-white"
              )}
            >
              <Shield className="size-3.5" />
              Recruiting Only
            </button>
            <button
              onClick={() => setWarOnly(v => !v)}
              className={cn(
                "w-full h-11 px-4 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider flex items-center gap-2.5 transition-all duration-150",
                warOnly
                  ? "border-black bg-primary text-white"
                  : "border-black/15 text-black/60 hover:border-black bg-white"
              )}
            >
              <Swords className="size-3.5" />
              In War Only
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t-2 border-black shrink-0 flex gap-2.5">
        <button
          onClick={resetFilters}
          className={cn("flex-1 h-11 rounded-lg border-2 border-black/15 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:border-black transition-all duration-150", activeFilterCount > 0 ? "text-black" : "text-black/40")}
        >
          <RotateCcw className="size-3" />
          Reset
        </button>
        <button
          onClick={() => setFilterOpen(false)}
          className="flex-1 h-11 rounded-lg bg-black text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-primary transition-all duration-150"
        >
          Show {filtered.length} Result{filtered.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════ */
  /* JSX                                                                    */
  /* ══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-4 md:space-y-5">
      {/* ═══ Toolbar: Search + Filter btn + View toggle ═══ */}
      <motion.div variants={riseIn} initial="initial" animate="animate" className="bg-white rounded-2xl border-2 md:border-[3px] border-black p-3 md:p-4 flex items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-black/35 pointer-events-none" />
          <Input
            placeholder="Search guilds…"
            className="pl-10 pr-9 h-11 border-2 border-black/10 rounded-lg text-sm font-medium focus-visible:border-primary focus-visible:ring-0 hover:border-black/30 transition-colors placeholder:text-black/35 bg-white"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-guild-search"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md bg-black/8 hover:bg-black/15 flex items-center justify-center transition-colors"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setFilterOpen(true)}
          className={cn(
            "relative h-11 w-11 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all duration-150",
            activeFilterCount > 0
              ? "border-black bg-primary text-white"
              : "border-black/10 hover:border-black text-black/50 hover:text-black bg-white"
          )}
          data-testid="button-open-filters"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-black text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div className="flex border-2 border-black/10 rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "h-11 w-11 flex items-center justify-center transition-all duration-150",
              viewMode === "grid" ? "bg-black text-white" : "bg-white text-black/40 hover:text-black"
            )}
            aria-label="Grid view"
          >
            <LayoutGrid className="size-4" />
          </button>
          <div className="w-px bg-black/10" />
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "h-11 w-11 flex items-center justify-center transition-all duration-150",
              viewMode === "list" ? "bg-black text-white" : "bg-white text-black/40 hover:text-black"
            )}
            aria-label="List view"
          >
            <List className="size-4" />
          </button>
        </div>
      </motion.div>

      {/* Result count when searching */}
      {(search || activeFilterCount > 0) && !isLoading && (
        <div className="px-1">
          <TechnicalLabel text={`${filtered.length} GUILD${filtered.length !== 1 ? "S" : ""} FOUND`} className="text-black/40 text-[9px]" />
        </div>
      )}

      {/* ═══ Filter panel — mobile: bottom sheet, desktop: left side panel ═══ */}
      <AnimatePresence>
        {filterOpen && (
          <>
            <motion.div
              key="filter-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setFilterOpen(false)}
            />
            <motion.div
              key="filter-panel"
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } }}
              exit={{ opacity: 0, y: 32 }}
              className={cn(
                "fixed z-50 bg-white shadow-[0_0_60px_rgba(0,0,0,0.15)]",
                "bottom-0 left-0 right-0 rounded-t-2xl max-h-[85vh]",
                "md:top-0 md:bottom-auto md:left-0 md:right-auto md:w-[380px] md:h-full md:rounded-t-none md:rounded-r-2xl"
              )}
            >
              {filterContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ Content ═══ */}
      {isLoading ? (
        /* Loading skeletons — compact cards */
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border-2 border-black/10 overflow-hidden">
              <Skeleton className="aspect-[3/2] w-full rounded-none bg-[#EAE5DD]" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-2/3 rounded bg-black/15" />
                <Skeleton className="h-2.5 w-3/4 rounded bg-black/10" />
                <Skeleton className="h-8 w-full rounded-lg bg-black/10" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-white rounded-2xl border-2 md:border-[3px] border-black p-10 text-center">
          <Shield className="size-6 text-black/30 mx-auto mb-3" />
          <TechnicalLabel text="FAILED TO LOAD GUILDS" className="text-black/45 text-xs mb-2" />
          <p className="text-sm text-black/50 mb-4">Could not fetch the guild directory.</p>
          <button onClick={() => refetch()} className="text-destructive text-xs font-black uppercase tracking-wider hover:underline">Retry</button>
        </div>
      ) : guilds.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 md:border-[3px] border-black p-10 text-center">
          <Shield className="size-7 text-primary mx-auto mb-3" />
          <TechnicalLabel text="NO GUILDS YET" className="text-black/45 text-xs mb-2" />
          <p className="text-sm text-black/50 mb-5">Be the first to found a guild on THORX.</p>
          {!pendingRequest && !alreadyInGuild && (
            <Button onClick={() => setShowCreationForm(true)} data-testid="button-request-guild-creation-empty" className={cn("h-11 px-6", CTA_CLASS, "text-[10px]")}>
              Request Guild Creation
            </Button>
          )}
          {pendingRequest && (
            <div className="inline-flex items-center gap-2 text-xs font-black text-amber-700">
              <Clock className="size-3.5" /> Your guild creation request is pending admin review.
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 md:border-[3px] border-black p-10 text-center">
          <Search className="size-6 text-black/30 mx-auto mb-3" />
          <TechnicalLabel text="NO MATCHES" className="text-black/45 text-xs mb-2" />
          <p className="text-sm text-black/50 mb-5">No guilds match your current filters.</p>
          <button
            onClick={() => { setSearch(""); resetFilters(); }}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg border-2 border-black/15 text-[10px] font-black uppercase tracking-wider text-black/55 hover:border-black hover:text-black transition-all duration-150 bg-white"
          >
            <RotateCcw className="size-3" /> Clear Filters
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* ─── Grid view (compact cards) ─── */
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((guild) => {
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            const rankBlocked = !DEV_UNLOCK_RANK_GATES && userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            const inGuild = alreadyInGuild && !applied;
            const tier = tierOf(guild);
            const weeklyPct = guild.weeklyTarget > 0 ? Math.round(Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100)) : 0;
            const canJoin = canApply(guild);
            const applyDisabled = applied || inGuild || rankBlocked || !guild.recruitmentOpen;
            return (
              <motion.article
                key={guild.id}
                variants={riseIn}
                initial="initial"
                animate="animate"
                onClick={() => setViewingGuild(guild)}
                data-testid={`card-guild-${guild.id}`}
                className="group bg-white rounded-2xl border-2 border-black/10 cursor-pointer flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-black hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]"
              >
                {/* Media */}
                <div className="relative aspect-[3/2] bg-[#EAE5DD] overflow-hidden">
                  <CornerPlus />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl md:text-6xl font-black text-black/[0.07] select-none leading-none">{guild.name[0].toUpperCase()}</span>
                  </div>
                  {guild.avatarUrl && (
                    <img
                      src={guild.avatarUrl}
                      alt={guild.name}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  )}
                  {/* Rank badge overlay */}
                  <div className="absolute top-2 left-2">
                    <BlackChip>{tier.replace("-Rank", "")}</BlackChip>
                  </div>
                </div>

                {/* Body */}
                <div className="p-3 flex flex-col flex-1">
                  <h3 className="font-black text-sm md:text-base uppercase tracking-tighter truncate leading-tight" data-testid={`text-guild-name-${guild.id}`}>
                    {guild.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-1 text-[8px] md:text-[9px] font-black uppercase tracking-wider text-black/40 min-h-[14px]">
                    <span>{guild.memberCount} MEMBERS</span>
                    {guild.inActiveWar && (<><span className="text-primary">·</span><span className="text-destructive flex items-center gap-0.5"><Swords className="size-2.5" /> WAR</span></>)}
                    {!!guild.successfulWeeks && guild.successfulWeeks > 0 && (<><span className="text-primary">·</span><span className="flex items-center gap-0.5"><Flame className="size-2.5" /> {guild.successfulWeeks}w</span></>)}
                  </div>

                  {/* GPS + progress */}
                  <div className="mt-auto pt-3 border-t-[3px] border-black/10 space-y-1.5">
                    <div className="flex items-end justify-between">
                      <TechnicalLabel text="GPS" className="text-black/35 text-[8px]" />
                      <span className="font-black text-base md:text-lg tabular-nums text-primary tracking-tight leading-none">
                        {guild.guildPerformanceScore.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={weeklyPct} className="h-1 bg-black/10 [&>div]:bg-primary" />
                  </div>

                  {/* Apply */}
                  <button
                    onClick={(e) => { e.stopPropagation(); if (canJoin && !applied) handleApply(guild); }}
                    disabled={applyDisabled}
                    data-testid={`button-apply-guild-${guild.id}`}
                    className={cn(
                      "mt-3 w-full h-9 rounded-lg border-2 text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all duration-300",
                      applied
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : inGuild || rankBlocked || !guild.recruitmentOpen
                          ? "bg-[#EAE5DD] text-black/40 border-black/10"
                          : "bg-primary text-white border-black hover:bg-black"
                    )}
                  >
                    {applied ? <><ShieldCheck className="size-3" /> Applied</> : inGuild ? <><Shield className="size-3" /> In a Guild</> : rankBlocked ? <><Lock className="size-3" /> {guild.minRankRequired.replace("-Rank", "")}+</> : !guild.recruitmentOpen ? <><X className="size-3" /> Closed</> : <>Apply <ArrowRight className="size-3" /></>}
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      ) : (
        /* ─── List view (compact rows) ─── */
        <div className="space-y-2">
          {filtered.map((guild) => {
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            const rankBlocked = !DEV_UNLOCK_RANK_GATES && userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            const inGuild = alreadyInGuild && !applied;
            const tier = tierOf(guild);
            const canJoin = canApply(guild);
            const applyDisabled = applied || inGuild || rankBlocked || !guild.recruitmentOpen;
            return (
              <motion.div
                key={guild.id}
                variants={riseIn}
                initial="initial"
                animate="animate"
                onClick={() => setViewingGuild(guild)}
                data-testid={`list-guild-${guild.id}`}
                className="group bg-white rounded-xl border-2 border-black/10 cursor-pointer px-3.5 py-3 flex items-center gap-3 transition-all duration-200 hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5"
              >
                {/* Avatar */}
                <div className="relative w-10 h-10 rounded-lg border-2 border-black bg-[#EAE5DD] shrink-0 overflow-hidden flex items-center justify-center">
                  <span className="font-black text-sm text-black/15">{guild.name[0].toUpperCase()}</span>
                  {guild.avatarUrl && (
                    <img src={guild.avatarUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-black text-xs md:text-sm uppercase tracking-tight truncate" data-testid={`list-guild-name-${guild.id}`}>{guild.name}</span>
                    <BlackChip className="shrink-0">{tier.replace("-Rank", "")}</BlackChip>
                  </div>
                  <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-black/35 mt-0.5">
                    <span>{guild.memberCount} members</span>
                    {guild.inActiveWar && <><span className="text-primary">·</span><span className="text-destructive">War</span></>}
                    {!!guild.successfulWeeks && guild.successfulWeeks > 0 && <><span className="text-primary">·</span><span>{guild.successfulWeeks}w streak</span></>}
                  </div>
                </div>

                {/* GPS */}
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="font-black text-sm tabular-nums text-primary">{guild.guildPerformanceScore.toLocaleString()}</div>
                  <TechnicalLabel text="GPS" className="text-black/30 text-[7px]" />
                </div>

                {/* Apply */}
                <button
                  onClick={(e) => { e.stopPropagation(); if (canJoin && !applied) handleApply(guild); }}
                  disabled={applyDisabled}
                  className={cn(
                    "h-8 px-3 rounded-lg border-2 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all duration-200",
                    applied
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : inGuild || rankBlocked || !guild.recruitmentOpen
                        ? "bg-[#EAE5DD] text-black/40 border-black/10"
                        : "bg-primary text-white border-black hover:bg-black"
                  )}
                >
                  {applied ? <ShieldCheck className="size-2.5" /> : <ArrowRight className="size-2.5" />}
                  <span className="hidden sm:inline">{applied ? "Applied" : inGuild ? "Guild" : rankBlocked ? "Locked" : !guild.recruitmentOpen ? "Closed" : "Apply"}</span>
                </button>

                <ChevronRight className="size-3.5 text-black/20 group-hover:text-black/50 transition-colors shrink-0" />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ═══ Creation CTA ═══ */}
      {!pendingRequest && !alreadyInGuild && guilds.length > 0 && (
        <motion.div variants={riseIn} initial="initial" animate="animate" className="bg-white rounded-2xl border-2 md:border-[3px] border-black p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm md:text-base font-black uppercase tracking-tighter">Start your own guild</div>
            <div className="text-[10px] md:text-xs text-black/45 mt-1">Any rank can request admin approval to create a new guild.</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCreationForm(true)} className={cn("shrink-0 w-full sm:w-auto h-10 px-5", OUTLINE_CLASS, "text-[9px]")} data-testid="button-request-guild-creation">
            Request Creation
          </Button>
        </motion.div>
      )}

      {/* ═══ Pending request status ═══ */}
      {pendingRequest && (
        <div
          className={cn(
            "bg-white rounded-2xl border-2 md:border-[3px] p-4 flex items-start gap-3",
            pendingRequest.status === "pending" ? "border-amber-400" :
            pendingRequest.status === "approved" ? "border-emerald-400" :
            "border-destructive/40"
          )}
        >
          <div className={cn(
            "p-2 rounded-lg border-2 shrink-0",
            pendingRequest.status === "pending" ? "bg-amber-50 border-amber-300 text-amber-700" :
            pendingRequest.status === "approved" ? "bg-emerald-50 border-emerald-300 text-emerald-700" :
            "bg-destructive/5 border-destructive/20 text-destructive"
          )}>
            {pendingRequest.status === "pending" && <Clock className="size-3.5" />}
            {pendingRequest.status === "approved" && <ShieldCheck className="size-3.5" />}
            {pendingRequest.status === "rejected" && <X className="size-3.5" />}
          </div>
          <div>
            <div className={cn(
              "text-xs font-black",
              pendingRequest.status === "pending" ? "text-amber-800" :
              pendingRequest.status === "approved" ? "text-emerald-800" :
              "text-destructive"
            )}>
              {pendingRequest.status === "pending" && `Guild request "${pendingRequest.guildName}" is pending admin review.`}
              {pendingRequest.status === "approved" && `Guild "${pendingRequest.guildName}" approved! You are now its Captain.`}
              {pendingRequest.status === "rejected" && `Guild request "${pendingRequest.guildName}" was rejected.`}
            </div>
            {pendingRequest.adminNote && <div className="text-[10px] text-black/45 mt-0.5">Note: {pendingRequest.adminNote}</div>}
          </div>
        </div>
      )}

      {/* ══ Guild Details Modal ════════════════════════════════════════════ */}
      {viewingGuild && (() => {
        const detail = guildDetail?.guild ?? viewingGuild;
        const tier = tierOf(viewingGuild);
        const applied = appliedIds.has(viewingGuild.id);
        const canApplyToViewing = canApply(viewingGuild);
        const weeklyPct = viewingGuild.weeklyTarget > 0 ? Math.round(Math.min(100, (viewingGuild.currentWeeklyPoints / viewingGuild.weeklyTarget) * 100)) : 0;

        const statItems = [
          { label: "GPS SCORE", value: viewingGuild.guildPerformanceScore.toLocaleString(), accent: true },
          { label: "MEMBERS", value: viewingGuild.memberCount.toLocaleString() },
          { label: "MIN RANK", value: viewingGuild.minRankRequired },
          { label: "SUCCESS WEEKS", value: viewingGuild.successfulWeeks?.toLocaleString() ?? "0" },
        ];

        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={`${viewingGuild.name} details`}
          >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={() => setViewingGuild(null)} />

            <div className="relative min-h-full flex items-end sm:items-center justify-center sm:p-6">
              <motion.div
                variants={modalIn}
                initial="initial"
                animate="animate"
                className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl border-2 md:border-[3px] border-black max-h-[92vh] sm:max-h-[88vh] overflow-y-auto"
              >
                {/* Sticky header */}
                <div className="sticky top-0 z-10 bg-white border-b-2 border-black px-5 md:px-7 py-4 md:py-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-lg border-2 border-black bg-[#EAE5DD] text-black flex items-center justify-center font-black text-lg md:text-xl shrink-0 overflow-hidden">
                      <span className="absolute inset-0 flex items-center justify-center">{viewingGuild.name[0].toUpperCase()}</span>
                      {viewingGuild.avatarUrl && <img src={viewingGuild.avatarUrl} alt={viewingGuild.name} onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-black text-xl md:text-2xl tracking-tight truncate" data-testid="text-guild-detail-name">{viewingGuild.name}</h2>
                        <BlackChip>{tier.replace("-Rank", "")}-RANK</BlackChip>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-wider text-black/45">
                        <span>{viewingGuild.recruitmentOpen ? "Recruiting" : "Closed"}</span>
                        {viewingGuild.inActiveWar && (<><span className="text-primary">·</span><span className="text-destructive flex items-center gap-0.5"><Swords className="size-2.5" /> War</span></>)}
                        {!!viewingGuild.successfulWeeks && viewingGuild.successfulWeeks > 0 && (<><span className="text-primary">·</span><span className="flex items-center gap-0.5"><Flame className="size-2.5" /> {viewingGuild.successfulWeeks}w</span></>)}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setViewingGuild(null)} className="w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 border-black/15 hover:border-black flex items-center justify-center text-black/50 hover:text-black transition-all duration-150 shrink-0" data-testid="button-back-to-guilds" aria-label="Close guild details">
                    <X className="size-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-5 md:px-7 py-6 space-y-6">
                  {viewingGuild.description && (
                    <p className="text-sm md:text-[15px] text-black/70 leading-relaxed font-medium">{viewingGuild.description}</p>
                  )}

                  {/* Stats grid */}
                  <div className="pt-4 border-t-[3px] border-black/10">
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-black/10 -mx-4 md:-mx-7">
                      {statItems.map((s, i) => (
                        <div key={s.label} className={cn("px-4 md:px-7 py-2", i >= 2 && "border-t lg:border-t-0 border-black/10", i % 2 === 1 && "max-lg:border-l-0")}>
                          <TechnicalLabel text={s.label} className="text-black/40 text-[9px] mb-2" />
                          {s.label === "MIN RANK" ? (
                            <div className="pt-0.5"><RankBadge rank={s.value} size="sm" /></div>
                          ) : (
                            <div className={cn("font-black text-lg md:text-xl tracking-tight tabular-nums", s.accent ? "text-primary" : "text-black")}>
                              {s.value}{s.label === "SUCCESS WEEKS" && (viewingGuild.successfulWeeks ?? 0) > 0 && <Trophy className="inline size-3.5 text-primary ml-1.5 -mt-0.5" />}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Weekly target */}
                  {viewingGuild.weeklyTarget > 0 && (
                    <div className="pt-5 border-t-[3px] border-black/10">
                      <div className="flex items-baseline justify-between mb-2.5">
                        <TechnicalLabel text="WEEKLY TARGET" className="text-black/40 text-[9px]" />
                        <span className="text-[10px] md:text-xs font-black tabular-nums text-black/60">
                          {viewingGuild.currentWeeklyPoints.toLocaleString()} / {viewingGuild.weeklyTarget.toLocaleString()} PS · {weeklyPct}%
                        </span>
                      </div>
                      <Progress value={weeklyPct} className="h-1.5 bg-black/10 [&>div]:bg-primary" />
                    </div>
                  )}

                  {/* Roster */}
                  <div className="pt-1">
                    <BlackChip className="mb-4">ROSTER · {viewingGuild.memberCount}</BlackChip>
                    {guildMembersLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                      </div>
                    ) : guildMembers.length === 0 ? (
                      <p className="text-sm text-black/50 py-2">No members data available.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-black/10">
                        {guildMembers.map((m: any) => (
                          <div key={m.userId} className="flex items-center gap-3 py-3 min-h-[52px]">
                            <div className="relative w-10 h-10 rounded-lg border-2 border-black bg-[#EAE5DD] text-black flex items-center justify-center text-xs font-black shrink-0 overflow-hidden">
                              <span className="absolute inset-0 flex items-center justify-center">{(m.firstName || m.identity || "M")[0].toUpperCase()}</span>
                              {m.avatarUrl && <img src={m.avatarUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-black truncate">{m.firstName || m.identity || "Member"}</span>
                                {m.userId === detail?.captainId && <Crown className="size-3.5 text-primary shrink-0" />}
                              </div>
                              {m.userRankTier && <RankBadge rank={m.userRankTier} size="sm" className="mt-1" />}
                            </div>
                            <div className="text-xs text-black/50 font-black tabular-nums shrink-0">{(m.weeklyPointsContributed ?? 0).toLocaleString()} PS</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* War History */}
                  {guildWars.length > 0 && (
                    <div>
                      <BlackChip className="mb-4">BATTLE HISTORY</BlackChip>
                      <div className="divide-y divide-black/10">
                        {guildWars.slice(0, 5).map((w: any) => {
                          const won = w.winnerId === viewingGuild.id;
                          const isActive = w.status === "active";
                          return (
                            <div key={w.id} className="flex items-center gap-3 py-3 text-xs min-h-[44px]">
                              <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-primary animate-pulse" : won ? "bg-emerald-500" : "bg-destructive/60")} />
                              <span className="flex-1 font-black uppercase tracking-wider text-[11px]">
                                {isActive ? "Active War" : won ? "Victory" : "Defeat"}
                              </span>
                              {w.completedAt && <span className="text-black/50 text-[11px]">{formatDistanceToNow(new Date(w.completedAt), { addSuffix: true })}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sticky footer CTA */}
                <div className="sticky bottom-0 z-10 bg-white border-t-2 border-black px-5 md:px-7 py-4">
                  {applied ? (
                    <div className="inline-flex items-center gap-2 text-xs font-black text-emerald-700">
                      <ShieldCheck className="size-4" /> Application Sent — the captain will review it soon.
                    </div>
                  ) : !viewingGuild.recruitmentOpen ? (
                    <div className="inline-flex items-center gap-2 text-xs font-black text-black/50">
                      <X className="size-4" /> Recruitment is closed.
                    </div>
                  ) : alreadyInGuild ? (
                    <div className="inline-flex items-center gap-2 text-xs font-black text-black/50">
                      <Shield className="size-4" /> You are already in a guild.
                    </div>
                  ) : !canApplyToViewing ? (
                    <div className="flex items-center gap-2 text-xs font-black text-black/50">
                      <Lock className="size-3.5" />
                      <span>Requires <RankBadge rank={viewingGuild.minRankRequired} size="sm" /> or higher to apply</span>
                    </div>
                  ) : (
                    <Button onClick={() => { setApplyingTo(viewingGuild); setCoverLetter(""); }} data-testid="button-apply-to-join" className={cn("w-full sm:w-auto h-12 px-7", CTA_CLASS, "text-[11px]")}>
                      Apply to Join <ArrowRight className="size-4" />
                    </Button>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        );
      })()}

      {/* ══ Application Letter Modal ═════════════════════════════════════════ */}
      {applyingTo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setApplyingTo(null); }}
        >
          <motion.div
            variants={modalIn}
            initial="initial"
            animate="animate"
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 md:border-[3px] border-black max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="px-5 md:px-6 pt-5 pb-4 border-b-2 border-black">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-11 h-11 rounded-lg border-2 border-black bg-[#EAE5DD] text-black flex items-center justify-center font-black text-base shrink-0 overflow-hidden">
                    <span className="absolute inset-0 flex items-center justify-center">{applyingTo.name[0]}</span>
                    {applyingTo.avatarUrl && <img src={applyingTo.avatarUrl} alt={applyingTo.name} onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-black text-base md:text-lg truncate">{applyingTo.name}</div>
                      <BlackChip>{tierOf(applyingTo).replace("-Rank", "")}-RANK</BlackChip>
                    </div>
                    <div className="text-[11px] text-black/50 mt-1">{applyingTo.memberCount} members · weekly target {applyingTo.weeklyTarget.toLocaleString()} PS</div>
                  </div>
                </div>
                <button onClick={() => setApplyingTo(null)} className="w-9 h-9 rounded-lg border-2 border-black/15 hover:border-black flex items-center justify-center text-black/50 hover:text-black transition-all duration-150 shrink-0" aria-label="Close application">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 md:px-6 py-5 space-y-3">
              <div className="flex items-center justify-between">
                <TechnicalLabel text="APPLICATION LETTER" className="text-black/40 text-[9px]" />
                <TechnicalLabel text="MIN 50 CHARS" className="text-primary text-[9px]" />
              </div>
              <div className="relative">
                <Textarea
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  rows={6}
                  maxLength={500}
                  placeholder=""
                  className="resize-none border-2 border-black/15 rounded-lg bg-white font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors leading-relaxed"
                  data-testid="input-cover-letter"
                />
                {!coverLetter && (
                  <div className="absolute top-3.5 left-3.5 right-3.5 pointer-events-none text-sm leading-relaxed">
                    <AnimatedPlaceholder examples={COVER_LETTER_SUGGESTIONS} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1 bg-black/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, (coverLetter.length / 50) * 100)}%` }} />
                </div>
                <span className={cn("text-[10px] font-black tabular-nums shrink-0", coverLetter.length < 50 ? "text-destructive" : "text-black/50")}>
                  {coverLetter.length}/500 {coverLetter.length < 50 ? `· need ${50 - coverLetter.length} more` : ""}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 md:px-6 pb-6 pt-1 flex gap-2.5">
              <Button variant="outline" className={cn("flex-1 h-12", OUTLINE_CLASS, "text-[10px]")} onClick={() => setApplyingTo(null)} data-testid="button-cancel-application">
                Cancel
              </Button>
              <Button className={cn("flex-1 h-12", CTA_CLASS, "text-[10px]")} disabled={coverLetter.trim().length < 50 || applyMutation.isPending} onClick={submitApplication} data-testid="button-submit-application">
                {applyMutation.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Sending…</> : "Submit Application"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ══ Guild Creation Request Modal ═══════════════════════════════════════ */}
      {showCreationForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCreationForm(false); }}
        >
          <motion.div
            variants={modalIn}
            initial="initial"
            animate="animate"
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 md:border-[3px] border-black overflow-hidden max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b-2 border-black">
              <div>
                <BlackChip className="mb-2.5">NEW GUILD · REVIEW</BlackChip>
                <div className="font-black text-base md:text-lg tracking-tight">Request Guild Creation</div>
                <div className="text-[11px] text-black/50 mt-1">Admin will review and approve your request.</div>
              </div>
              <button onClick={() => setShowCreationForm(false)} className="w-9 h-9 rounded-lg border-2 border-black/15 hover:border-black flex items-center justify-center text-black/50 hover:text-black transition-all duration-150 shrink-0" data-testid="button-close-creation-modal">
                <X className="size-3.5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <TechnicalLabel text="GUILD NAME" className="text-black/70 text-[9px]" />
                  <TechnicalLabel text="REQUIRED" className="text-primary text-[9px]" />
                </div>
                <div className="relative">
                  <Input value={creationForm.guildName} onChange={e => setCreationForm(p => ({ ...p, guildName: e.target.value }))} maxLength={60} className="h-12 border-2 border-black/15 rounded-lg bg-white font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors placeholder:text-transparent" data-testid="input-guild-name" />
                  {!creationForm.guildName && <div className="absolute inset-0 flex items-center px-3.5 pointer-events-none text-sm"><AnimatedPlaceholder examples={GUILD_NAME_SUGGESTIONS} /></div>}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <TechnicalLabel text="SHORT DESCRIPTION" className="text-black/70 text-[9px]" />
                  <TechnicalLabel text="OPTIONAL" className="text-black/40 text-[9px]" />
                </div>
                <div className="relative">
                  <Input value={creationForm.description} onChange={e => setCreationForm(p => ({ ...p, description: e.target.value }))} maxLength={500} className="h-12 border-2 border-black/15 rounded-lg bg-white font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors placeholder:text-transparent" data-testid="input-guild-description" />
                  {!creationForm.description && <div className="absolute inset-0 flex items-center px-3.5 pointer-events-none text-sm"><AnimatedPlaceholder examples={GUILD_DESCRIPTION_SUGGESTIONS} /></div>}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <TechnicalLabel text="WHY CREATE A GUILD?" className="text-black/70 text-[9px]" />
                  <TechnicalLabel text="REQUIRED" className="text-primary text-[9px]" />
                </div>
                <div className="relative">
                  <Textarea value={creationForm.reason} onChange={e => setCreationForm(p => ({ ...p, reason: e.target.value }))} rows={4} maxLength={1000} className="resize-none border-2 border-black/15 rounded-lg bg-white font-medium text-sm focus-visible:ring-0 focus-visible:border-primary hover:border-black/40 transition-colors placeholder:text-transparent leading-relaxed" data-testid="input-guild-reason" />
                  {!creationForm.reason && <div className="absolute top-3 left-3.5 right-3.5 pointer-events-none text-sm leading-relaxed"><AnimatedPlaceholder examples={GUILD_REASON_SUGGESTIONS} /></div>}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1 h-1 bg-black/10 rounded-full overflow-hidden mr-3">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, (creationForm.reason.length / 50) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-black tabular-nums shrink-0 text-primary">
                    {creationForm.reason.length < 50 ? `${50 - creationForm.reason.length} more` : `${creationForm.reason.length}/1000`}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-5 pb-6 pt-1 flex gap-2.5">
              <Button variant="outline" className={cn("flex-1 h-12", OUTLINE_CLASS, "text-[10px]")} onClick={() => setShowCreationForm(false)} data-testid="button-cancel-creation-request">
                Cancel
              </Button>
              <Button className={cn("flex-1 h-12", CTA_CLASS, "text-[10px]")} disabled={creationForm.guildName.trim().length < 3 || creationForm.reason.trim().length < 50 || creationRequestMutation.isPending} onClick={() => creationRequestMutation.mutate(creationForm)} data-testid="button-submit-creation-request">
                {creationRequestMutation.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Submitting…</> : "Submit Request"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default GuildDiscoveryPanel;
