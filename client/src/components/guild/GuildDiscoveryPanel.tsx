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
import { Search, Users, Trophy, Clock, Lock, ChevronRight, Star, Shield, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuildDiscovery {
  id: string;
  name: string;
  description: string | null;
  guildRankTier: string;
  guildPerformanceScore: number;
  memberCount: number;
  memberCapacity: number;
  minRankRequired: string;
  recruitmentOpen: boolean;
  avatarUrl: string | null;
  currentWeeklyPoints: number;
  weeklyTarget: number;
  successfulWeeks?: number;
}

const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
const RANK_COLORS: Record<string, string> = {
  "E-Rank": "#71717a", "D-Rank": "#16a34a", "C-Rank": "#2563eb",
  "B-Rank": "#7c3aed", "A-Rank": "#ea580c", "S-Rank": "#dc2626",
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
    if (rankFilter !== "All" && g.guildRankTier !== rankFilter) return false;
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
        <div className="text-center py-20">
          <Shield className="mx-auto mb-3 text-zinc-300" size={40} />
          <p className="text-zinc-800 text-sm font-semibold">No guilds available yet.</p>
          <p className="text-zinc-500 text-xs mt-1">Reach B-Rank to create the first one.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">No guilds match your filters.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((guild, idx) => {
            const slots = guild.memberCapacity - guild.memberCount;
            const minIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
            const rankBlocked = userTierIdx < minIdx;
            const applied = appliedIds.has(guild.id);
            const accentColor = RANK_COLORS[guild.guildRankTier] ?? "#71717a";

            return (
              <div key={guild.id} className="rounded-xl border border-zinc-200 bg-white p-4 hover:shadow-sm transition-shadow">
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
                        <RankBadge rank={guild.guildRankTier} size="sm" />
                        <span className="text-[11px] text-zinc-400 font-mono">
                          {guild.guildPerformanceScore.toLocaleString()} GPS
                        </span>
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

      {/* Application Modal */}
      {applyingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: RANK_COLORS[applyingTo.guildRankTier] ?? "#71717a" }}
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
    </div>
  );
}

export default GuildDiscoveryPanel;
