/**
 * GuildDiscoveryPanel — THORX Guild Directory.
 * Default Guild section view for simple users (guildRole='simple').
 * GPS-sorted guild directory with application flow.
 *
 * Design: minimal, high-end — search + filter side panel (notification-panel
 * language) + grid/list toggle. No ranks are exposed anywhere in the UI.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Search, SlidersHorizontal, X, Swords, Shield, ShieldCheck,
  Lock, ArrowRight, Clock, Flame, Crown, Trophy, Loader2, RotateCcw, Users, ChevronDown,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
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

/** Mono group label + hairline — notification-panel section signature. */
const GroupLabel = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3 mb-3">
    <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/35 uppercase whitespace-nowrap">{text}</span>
    <div className="h-px flex-1 bg-black/10" />
  </div>
);

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
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [recruitingOnly, setRecruitingOnly] = useState(false);
  const [warOnly, setWarOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"gps" | "members" | "streak">("gps");
  const [expandedGuild, setExpandedGuild] = useState<string | null>(null);
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

  const activeFilterCount = [recruitingOnly, warOnly].filter(Boolean).length;

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

  /* ── Hide portal navigation while any guild overlay owns the screen ──── */

  const anyOverlayOpen = filterOpen || !!viewingGuild || !!applyingTo || showCreationForm;
  useEffect(() => {
    document.body.classList.toggle("guild-overlay-open", anyOverlayOpen);
    return () => document.body.classList.remove("guild-overlay-open");
  }, [anyOverlayOpen]);

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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md bg-black/5 hover:bg-black/15 flex items-center justify-center transition-colors"
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
      </motion.div>

      {/* Result count when filtering */}
      {(search || activeFilterCount > 0) && !isLoading && (
        <div className="px-1">
          <TechnicalLabel text={`${filtered.length} GUILD${filtered.length !== 1 ? "S" : ""} FOUND`} className="text-black/40 text-[9px]" />
        </div>
      )}

      {/* ═══ Filter panel — notification-panel language ═══
          Mobile: full screen · Desktop: floating window top-right (notification twin) */}
      {createPortal(
      <AnimatePresence>
        {filterOpen && (
          <>
            <motion.div
              key="filter-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFilterOpen(false)}
              className="fixed inset-0 z-[800] bg-black/30"
            />
            <motion.div
              key="filter-panel"
              initial={isMobile ? { y: "100%" } : { x: "110%", y: 24, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { x: 0, y: 0, opacity: 1, transition: { type: "spring", damping: 30, stiffness: 300 } }}
              exit={isMobile ? { y: "100%" } : { x: "110%", y: 24, opacity: 0, transition: { duration: 0.25, ease: EASE } }}
              className={cn(
                "fixed z-[810] bg-[#F2EDE4] flex flex-col",
                // Desktop: floating window top-right — same spot as the notification panel
                "md:top-6 md:right-6 md:bottom-auto md:left-auto md:w-[420px] md:h-[min(680px,calc(100vh-3rem))] md:rounded-2xl md:border-2 md:border-black md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:overflow-hidden",
                // Mobile: full screen
                "top-0 right-0 bottom-0 left-0"
              )}
              aria-label="Guild filters"
              role="dialog"
              aria-modal="true"
            >
              {/* ── Top bar ── */}
              <div className="flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b-2 border-black bg-white flex-shrink-0 md:rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/40 uppercase">Refine</span>
                </div>
                <button
                  onClick={() => setFilterOpen(false)}
                  aria-label="Close filters"
                  className="w-9 h-9 flex items-center justify-center bg-black/5 hover:bg-black hover:text-white text-black/50 transition-all duration-200 rounded-full"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>

              {/* ── Header ── */}
              <div className="px-6 pt-6 pb-5 flex-shrink-0 border-b border-black/10">
                <div className="flex items-end justify-between gap-4">
                  <h1 className="text-[36px] md:text-[40px] font-black tracking-tighter text-black uppercase leading-none">Filters</h1>
                  {activeFilterCount > 0 && (
                    <div className="mb-1 flex h-7 min-w-[28px] items-center justify-center bg-primary text-white font-black text-xs px-2 border-2 border-black">
                      {activeFilterCount}
                    </div>
                  )}
                </div>
                <div className="h-[3px] w-12 bg-primary mt-3" />
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                {/* Sort */}
                <div>
                  <GroupLabel text="Sort By" />
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger className="h-12 w-full border-2 border-black rounded-lg text-[11px] font-black uppercase tracking-wider focus:ring-0 focus:border-primary hover:border-black transition-colors bg-white" data-testid="select-sort-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[900]" position="popper">
                      <SelectItem value="gps">Top GPS</SelectItem>
                      <SelectItem value="members">Most Members</SelectItem>
                      <SelectItem value="streak">Best Streak</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div>
                  <GroupLabel text="Status" />
                  <div className="space-y-3">
                    <button
                      onClick={() => setRecruitingOnly(v => !v)}
                      data-testid="chip-recruiting"
                      className={cn(
                        "w-full bg-white border-2 border-black rounded-xl p-4 flex items-center justify-between gap-3 transition-all duration-200",
                        recruitingOnly ? "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" : "hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <span className={cn("w-10 h-10 flex items-center justify-center border-2 border-black rounded-lg shrink-0", recruitingOnly ? "bg-primary text-white" : "bg-black text-white")}>
                          <Shield className="w-5 h-5" strokeWidth={2} />
                        </span>
                        <span className="text-left">
                          <span className="block text-sm font-black text-black uppercase tracking-tight">Recruiting</span>
                          <span className="block text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-0.5">Open to join</span>
                        </span>
                      </span>
                      <span className={cn("w-6 h-6 rounded-full border-2 border-black flex items-center justify-center shrink-0 transition-colors", recruitingOnly ? "bg-primary" : "bg-transparent")}>
                        {recruitingOnly && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                    </button>

                    <button
                      onClick={() => setWarOnly(v => !v)}
                      data-testid="chip-war"
                      className={cn(
                        "w-full bg-white border-2 border-black rounded-xl p-4 flex items-center justify-between gap-3 transition-all duration-200",
                        warOnly ? "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" : "hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <span className={cn("w-10 h-10 flex items-center justify-center border-2 border-black rounded-lg shrink-0", warOnly ? "bg-primary text-white" : "bg-black text-white")}>
                          <Swords className="w-5 h-5" strokeWidth={2} />
                        </span>
                        <span className="text-left">
                          <span className="block text-sm font-black text-black uppercase tracking-tight">In War</span>
                          <span className="block text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-0.5">Battling now</span>
                        </span>
                      </span>
                      <span className={cn("w-6 h-6 rounded-full border-2 border-black flex items-center justify-center shrink-0 transition-colors", warOnly ? "bg-primary" : "bg-transparent")}>
                        {warOnly && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t-2 border-black bg-white flex-shrink-0 flex gap-3">
                <button
                  onClick={resetFilters}
                  disabled={activeFilterCount === 0 && sortBy === "gps"}
                  className="flex-1 h-11 rounded-lg border-2 border-black/20 hover:border-black text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 text-black/50 hover:text-black transition-all duration-150 disabled:opacity-40"
                >
                  <RotateCcw className="size-3" /> Reset
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="flex-1 h-11 rounded-lg bg-primary text-white border-2 border-black text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-black transition-all duration-150"
                  data-testid="button-apply-filters"
                >
                  Show {filtered.length} Result{filtered.length !== 1 ? "s" : ""}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
      )}

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
      ) : (
        /* ─── Guild list — 50% photo / 50% details, roster-style expand ─── */
        <div className="space-y-3">
          {filtered.map((guild) => {
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            const rankBlocked = !DEV_UNLOCK_RANK_GATES && userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            const inGuild = alreadyInGuild && !applied;
            const weeklyPct = guild.weeklyTarget > 0 ? Math.round(Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100)) : 0;
            const canJoin = canApply(guild);
            const applyDisabled = applied || inGuild || rankBlocked || !guild.recruitmentOpen;
            const isExpanded = expandedGuild === guild.id;
            return (
              <motion.div
                key={guild.id}
                variants={riseIn}
                initial="initial"
                animate="animate"
                data-testid={`list-guild-${guild.id}`}
                className="bg-white rounded-2xl border-2 border-black/10 overflow-hidden transition-all duration-200 hover:border-black hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]"
              >
                {/* Row — 50% photo / 50% details; tap toggles expand */}
                <button
                  onClick={() => setExpandedGuild(isExpanded ? null : guild.id)}
                  className="w-full flex text-left focus-visible:outline-none"
                >
                  {/* Photo half */}
                  <div className="relative w-1/2 aspect-square bg-[#EAE5DD] overflow-hidden shrink-0">
                    <CornerPlus />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-5xl font-black text-black/[0.07] select-none leading-none">{guild.name[0].toUpperCase()}</span>
                    </div>
                    {guild.avatarUrl && (
                      <img
                        src={guild.avatarUrl}
                        alt={guild.name}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {guild.inActiveWar && (
                      <div className="absolute top-2 right-2 bg-black text-destructive p-1.5 rounded-md">
                        <Swords className="size-3" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>

                  {/* Details half */}
                  <div className="w-1/2 p-3 md:p-4 flex flex-col min-w-0">
                    <h3 className="font-black text-sm md:text-base uppercase tracking-tighter truncate leading-tight" data-testid={`list-guild-name-${guild.id}`}>
                      {guild.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-black/40 mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="size-3" /> {guild.memberCount}</span>
                      {!!guild.successfulWeeks && guild.successfulWeeks > 0 && (
                        <span className="flex items-center gap-1"><Flame className="size-3 text-primary" /> {guild.successfulWeeks}w</span>
                      )}
                    </div>

                    {/* GPS + weekly */}
                    <div className="mt-auto pt-2 space-y-1.5">
                      <div className="flex items-end justify-between gap-2">
                        <TechnicalLabel text="GPS" className="text-black/35 text-[8px]" />
                        <span className="font-black text-base md:text-lg tabular-nums text-primary tracking-tight leading-none">
                          {guild.guildPerformanceScore.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={weeklyPct} className="h-1 bg-black/10 [&>div]:bg-primary" />
                    </div>

                    {/* Expand hint */}
                    <div className="flex items-center justify-end mt-1.5">
                      <ChevronDown size={15} className={cn("text-black/30 transition-transform duration-300", isExpanded && "rotate-180")} />
                    </div>
                  </div>
                </button>

                {/* Expanded — join/closed status + apply, full width */}
                {isExpanded && (
                  <div className="px-3 md:px-4 pb-4 pt-1 bg-black/[0.02] border-t-2 border-black/10">
                    <button
                      onClick={(e) => { e.stopPropagation(); if (canJoin && !applied) handleApply(guild); }}
                      disabled={applyDisabled}
                      data-testid={`button-apply-guild-${guild.id}`}
                      className={cn(
                        "mt-3 w-full h-11 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300",
                        applied
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : inGuild || rankBlocked || !guild.recruitmentOpen
                            ? "bg-[#EAE5DD] text-black/40 border-black/10"
                            : "bg-primary text-white border-black hover:bg-black"
                      )}
                    >
                      {applied ? <><ShieldCheck className="size-3.5" /> Applied</> : inGuild ? <><Shield className="size-3.5" /> In a Guild</> : rankBlocked ? <><Lock className="size-3.5" /> Locked</> : !guild.recruitmentOpen ? <><X className="size-3.5" /> Closed</> : <>Apply Now <ArrowRight className="size-3.5" /></>}
                    </button>
                  </div>
                )}
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

      {/* ══ Guild Details Modal — notification-panel language ═════════════ */}
      {viewingGuild && createPortal((() => {
        const detail = guildDetail?.guild ?? viewingGuild;
        const applied = appliedIds.has(viewingGuild.id);
        const canApplyToViewing = canApply(viewingGuild);
        const weeklyPct = viewingGuild.weeklyTarget > 0 ? Math.round(Math.min(100, (viewingGuild.currentWeeklyPoints / viewingGuild.weeklyTarget) * 100)) : 0;

        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[760] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={`${viewingGuild.name} details`}
          >
            <div className="fixed inset-0 bg-black/40" onClick={() => setViewingGuild(null)} />

            <div className="relative min-h-full flex items-stretch sm:items-center justify-center sm:p-6">
              <motion.div
                variants={modalIn}
                initial="initial"
                animate="animate"
                className={cn(
                  "relative w-full sm:max-w-xl bg-[#F2EDE4] flex flex-col overflow-hidden",
                  // Mobile: full screen — always completely visible
                  "h-full rounded-none border-0",
                  // Desktop: floating window with hard shadow
                  "sm:h-auto sm:max-h-[88vh] sm:rounded-2xl sm:border-2 sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
                )}
              >
                {/* ── Top bar (notification-panel twin) ── */}
                <div className="flex items-center justify-between px-5 md:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b-2 border-black bg-white flex-shrink-0 sm:rounded-t-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/40 uppercase">Guild Profile</span>
                  </div>
                  <button
                    onClick={() => setViewingGuild(null)}
                    aria-label="Close guild details"
                    className="w-9 h-9 flex items-center justify-center bg-black/5 hover:bg-black hover:text-white text-black/50 transition-all duration-200 rounded-full"
                    data-testid="button-back-to-guilds"
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>

                {/* ── Scrollable body on cream ── */}
                <div className="flex-1 overflow-y-auto">
                  {/* Identity header */}
                  <div className="px-5 md:px-6 pt-6 pb-5 border-b border-black/10">
                    <div className="flex items-center gap-4">
                      <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-xl border-2 border-black bg-white flex items-center justify-center font-black text-xl md:text-2xl shrink-0 overflow-hidden">
                        <span className="absolute inset-0 flex items-center justify-center text-black/20">{viewingGuild.name[0].toUpperCase()}</span>
                        {viewingGuild.avatarUrl && (
                          <img src={viewingGuild.avatarUrl} alt={viewingGuild.name} onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-2xl md:text-[32px] font-black tracking-tighter text-black uppercase leading-none truncate" data-testid="text-guild-detail-name">
                          {viewingGuild.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-2 text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase">
                          <span className={cn("flex items-center gap-1", viewingGuild.recruitmentOpen ? "text-emerald-600" : "text-black/40")}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", viewingGuild.recruitmentOpen ? "bg-emerald-500" : "bg-black/30")} />
                            {viewingGuild.recruitmentOpen ? "Recruiting" : "Closed"}
                          </span>
                          {viewingGuild.inActiveWar && (
                            <span className="flex items-center gap-1 text-destructive"><Swords className="size-3" /> War</span>
                          )}
                          {!!viewingGuild.successfulWeeks && viewingGuild.successfulWeeks > 0 && (
                            <span className="flex items-center gap-1"><Flame className="size-3 text-primary" /> {viewingGuild.successfulWeeks}w streak</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="h-[3px] w-12 bg-primary mt-4" />
                  </div>

                  <div className="px-5 md:px-6 py-6 space-y-7">
                    {/* Description card */}
                    {viewingGuild.description && (
                      <div>
                        <GroupLabel text="About" />
                        <div className="bg-white border-2 border-black rounded-xl p-4">
                          <p className="text-[13px] text-black/70 leading-relaxed font-medium">{viewingGuild.description}</p>
                        </div>
                      </div>
                    )}

                    {/* Stats — white bordered cards */}
                    <div>
                      <GroupLabel text="Performance" />
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white border-2 border-black rounded-xl p-3.5">
                          <div className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase">GPS</div>
                          <div className="font-black text-lg md:text-xl tracking-tighter tabular-nums text-primary mt-1.5 leading-none">
                            {viewingGuild.guildPerformanceScore.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-white border-2 border-black rounded-xl p-3.5">
                          <div className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase">Members</div>
                          <div className="font-black text-lg md:text-xl tracking-tighter tabular-nums text-black mt-1.5 leading-none">
                            {viewingGuild.memberCount.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-white border-2 border-black rounded-xl p-3.5">
                          <div className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase">Streak</div>
                          <div className="font-black text-lg md:text-xl tracking-tighter tabular-nums text-black mt-1.5 leading-none">
                            {viewingGuild.successfulWeeks ?? 0}<span className="text-[10px] ml-0.5">w</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Weekly target card */}
                    {viewingGuild.weeklyTarget > 0 && (
                      <div>
                        <GroupLabel text="Weekly Target" />
                        <div className="bg-white border-2 border-black rounded-xl p-4">
                          <div className="flex items-baseline justify-between mb-3">
                            <span className="text-2xl font-black tracking-tighter text-black leading-none tabular-nums">
                              {viewingGuild.currentWeeklyPoints.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-mono font-bold tracking-[0.15em] text-black/45 uppercase">
                              / {viewingGuild.weeklyTarget.toLocaleString()} PS · {weeklyPct}%
                            </span>
                          </div>
                          <Progress value={weeklyPct} className="h-1.5 bg-black/10 [&>div]:bg-primary" />
                        </div>
                      </div>
                    )}

                    {/* Roster */}
                    <div>
                      <GroupLabel text={`Roster · ${viewingGuild.memberCount}`} />
                      {guildMembersLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded bg-black/10" />)}
                        </div>
                      ) : guildMembers.length === 0 ? (
                        <p className="text-xs text-black/45 font-medium py-1">No members data available.</p>
                      ) : (
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-0.5">
                          {guildMembers.map((m: any) => (
                            <div key={m.userId} className="bg-white border-2 border-black/10 hover:border-black rounded-xl transition-colors p-3 flex items-center gap-3">
                              <div className="relative w-9 h-9 rounded-lg border-2 border-black bg-[#EAE5DD] flex items-center justify-center text-[11px] font-black shrink-0 overflow-hidden">
                                <span className="absolute inset-0 flex items-center justify-center text-black/30">{(m.firstName || m.identity || "M")[0].toUpperCase()}</span>
                                {m.avatarUrl && (
                                  <img src={m.avatarUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[13px] font-black text-black tracking-tight truncate">{m.firstName || m.identity || "Member"}</span>
                                  {m.userId === detail?.captainId && (
                                    <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider text-white bg-primary border border-black px-1.5 py-px shrink-0">
                                      <Crown className="size-2.5" /> Captain
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] font-mono text-black/35 mt-0.5">
                                  {(m.weeklyPointsContributed ?? 0).toLocaleString()} PS this week
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* War History */}
                    {guildWars.length > 0 && (
                      <div>
                        <GroupLabel text="Battle History" />
                        <div className="space-y-2">
                          {guildWars.slice(0, 5).map((w: any) => {
                            const won = w.winnerId === viewingGuild.id;
                            const isActive = w.status === "active";
                            return (
                              <div key={w.id} className="bg-white border-2 border-black/10 rounded-xl p-3 flex items-center gap-3">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-primary animate-pulse" : won ? "bg-emerald-500" : "bg-destructive/60")} />
                                <span className="flex-1 text-[11px] font-black uppercase tracking-wider text-black">
                                  {isActive ? "Active War" : won ? "Victory" : "Defeat"}
                                </span>
                                {w.completedAt && <span className="text-[9px] font-mono text-black/40">{formatDistanceToNow(new Date(w.completedAt), { addSuffix: true })}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Sticky footer CTA ── */}
                <div className="flex-shrink-0 bg-white border-t-2 border-black px-5 md:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {applied ? (
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-700">
                      <ShieldCheck className="size-4" /> Application sent — the captain will review it soon.
                    </div>
                  ) : !viewingGuild.recruitmentOpen ? (
                    <div className="flex items-center gap-2 text-xs font-black text-black/50">
                      <X className="size-4" /> Recruitment is closed.
                    </div>
                  ) : alreadyInGuild ? (
                    <div className="flex items-center gap-2 text-xs font-black text-black/50">
                      <Shield className="size-4" /> You are already in a guild.
                    </div>
                  ) : !canApplyToViewing ? (
                    <div className="flex items-center gap-2 text-xs font-black text-black/50">
                      <Lock className="size-3.5" /> You don't meet the requirements to apply yet.
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
      })(), document.body)}

      {/* ══ Application Letter Modal ═════════════════════════════════════════ */}
      {applyingTo && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[770] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setApplyingTo(null); }}
        >
          <motion.div
            variants={modalIn}
            initial="initial"
            animate="animate"
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 border-black max-h-[92vh] sm:max-h-[90vh] overflow-y-auto sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
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
                    <div className="font-black text-base md:text-lg tracking-tight truncate">{applyingTo.name}</div>
                    <div className="text-[10px] font-mono font-bold tracking-[0.15em] text-black/40 uppercase mt-0.5">{applyingTo.memberCount} members</div>
                  </div>
                </div>
                <button onClick={() => setApplyingTo(null)} className="w-9 h-9 flex items-center justify-center bg-black/5 hover:bg-black hover:text-white text-black/50 transition-all duration-200 rounded-full shrink-0" aria-label="Close application">
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
            <div className="px-5 md:px-6 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex gap-2.5">
              <Button variant="outline" className={cn("flex-1 h-12", OUTLINE_CLASS, "text-[10px]")} onClick={() => setApplyingTo(null)} data-testid="button-cancel-application">
                Cancel
              </Button>
              <Button className={cn("flex-1 h-12", CTA_CLASS, "text-[10px]")} disabled={coverLetter.trim().length < 50 || applyMutation.isPending} onClick={submitApplication} data-testid="button-submit-application">
                {applyMutation.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Sending…</> : "Submit Application"}
              </Button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}

      {/* ══ Guild Creation Request Modal ═══════════════════════════════════════ */}
      {showCreationForm && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[770] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCreationForm(false); }}
        >
          <motion.div
            variants={modalIn}
            initial="initial"
            animate="animate"
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 border-black overflow-hidden max-h-[92vh] sm:max-h-[90vh] overflow-y-auto sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b-2 border-black">
              <div>
                <div className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/40 uppercase mb-2">New Guild · Review</div>
                <div className="font-black text-base md:text-lg tracking-tight">Request Guild Creation</div>
                <div className="text-[11px] text-black/50 mt-1">Admin will review and approve your request.</div>
              </div>
              <button onClick={() => setShowCreationForm(false)} className="w-9 h-9 flex items-center justify-center bg-black/5 hover:bg-black hover:text-white text-black/50 transition-all duration-200 rounded-full shrink-0" data-testid="button-close-creation-modal">
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

            <div className="px-5 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex gap-2.5">
              <Button variant="outline" className={cn("flex-1 h-12", OUTLINE_CLASS, "text-[10px]")} onClick={() => setShowCreationForm(false)} data-testid="button-cancel-creation-request">
                Cancel
              </Button>
              <Button className={cn("flex-1 h-12", CTA_CLASS, "text-[10px]")} disabled={creationForm.guildName.trim().length < 3 || creationForm.reason.trim().length < 50 || creationRequestMutation.isPending} onClick={() => creationRequestMutation.mutate(creationForm)} data-testid="button-submit-creation-request">
                {creationRequestMutation.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Submitting…</> : "Submit Request"}
              </Button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}
    </div>
  );
}

export default GuildDiscoveryPanel;
