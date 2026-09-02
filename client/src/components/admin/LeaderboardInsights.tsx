// ADMIN_PKR_DISPLAY: intentional — admin leaderboard insights shows raw PKR
// earnings for business analysis. Excluded from Points-Only Mandate (user-facing
// screens only). parseFloat() on line ~192 is for client-side sort comparison
// only (not stored or sent to the DB) — float imprecision is acceptable for sort.
import React, { useEffect, useState, useMemo } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import Decimal from "decimal.js";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {Trophy, Users, AlertTriangle, Search, ArrowUpDown, Eye, User, ShieldCheck, ChevronLeft, ChevronRight, Download, CheckSquare, Square, RefreshCw, ServerCrash, TrendingUp, Wallet, ShieldAlert} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { resolveAvatarUrlByTier } from "@/lib/rankAvatars";
import { RankBadge } from "@/components/RankBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { UserInspectorPanel } from "./UserInspectorPanel";
import { RiskWatchlistPanel } from "./RiskWatchlistPanel";

interface LeaderboardData {
  globalRanking: any[];
  topReferrers: any[];
  anomalies: any[];
  totalCount: number;
  totalActiveUsers: number;
  lastUpdated: string;
  isStale: boolean;
}

function getAvatarSrc(user: any) {
  // profilePicture (custom upload) takes priority over rank avatar ID
  if (user.profilePicture && user.profilePicture !== "") return user.profilePicture;
  // resolveAvatarUrlByTier bridges E-S rank tier to legacy avatar key
  return resolveAvatarUrlByTier(user.avatar, user.userRankTier);
}

function UserAvatar({ user, size = 10 }: { user: any; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = getAvatarSrc(user);
  const dim = `w-${size} h-${size}`;

  if (src && !failed) {
    return (
      <div className={cn("rounded-full border-[1.5px] border-[#141413]/20 overflow-hidden bg-zinc-100 shrink-0", dim)}>
        <img
          src={src}
          alt="User avatar"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div className={cn("rounded-full border-[1.5px] border-[#141413]/20 bg-zinc-100 flex items-center justify-center shrink-0", dim)}>
      <User className="w-4 h-4 text-zinc-400" />
    </div>
  );
}

function trustStatusStyle(status?: string | null) {
  switch (status) {
    case "Special": return "bg-purple-50 border-purple-200 text-purple-600";
    case "Trusted": return "bg-green-50 border-green-200 text-green-600";
    case "Dangerous": return "bg-red-50 border-red-200 text-red-600";
    case "Normal": return "bg-blue-50 border-blue-200 text-blue-600";
    default: return "bg-zinc-50 border-zinc-200 text-zinc-400";
  }
}

function downloadAsCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  // THORX v3: L2 removed — referral is 1-tier only (Appendix A invariant #4)
  const headers = ["Rank", "Name", "Email", "Total Earned", "Available Balance", "Direct Referrals (L1)", "Performance Score", "Trust Status"];
  const csvRows = rows.map((u, i) => [
    u.globalRank || i + 1,
    `${u.firstName} ${u.lastName}`,
    u.email,
    u.totalEarnings || 0,
    u.availableBalance || 0,
    u.level1Count || u.referralCount || 0,
    u.performanceScore || 0,
    u.trustStatus || "N/A"
  ]);
  const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LeaderboardInsights({ onViewUserInCRM }: { onViewUserInCRM?: (email: string) => void }) {
  // Search state is isolated per tab — typing in one tab must never bleed
  // into the others.
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [referrersSearchTerm, setReferrersSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("global");
  const [pageSize] = useState("50");
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [referrerSortConfig, setReferrerSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounced so we don't fire a request on every keystroke, and the search
  // runs server-side against the full leaderboard — not just whatever page
  // is currently loaded — so results outside the current page are found too.
  const debouncedGlobalSearch = useDebounce(globalSearchTerm, 400);

  // Any time the search term changes, jump back to page 0 — staying on a
  // stale page/offset could otherwise land past the end of the filtered set.
  useEffect(() => {
    setPage(0);
  }, [debouncedGlobalSearch]);

  const searchQueryParam = debouncedGlobalSearch.trim()
    ? `&search=${encodeURIComponent(debouncedGlobalSearch.trim())}`
    : "";

  const { data: insights, isLoading, isError } = useQuery<LeaderboardData>({
    queryKey: [`/api/admin/leaderboard/insights?limit=${pageSize}&offset=${page * parseInt(pageSize)}${searchQueryParam}`],
  });

  const forceSyncMutation = useMutation({
    mutationFn: async () => {
      // apiRequest throws for non-OK responses (see throwIfResNotOk in queryClient.ts),
      // so we only reach res.json() when the request succeeded.
      const res = await apiRequest("POST", "/api/admin/leaderboard/force-sync");
      return res.json();
    },
    onSuccess: () => {
      // Prefix match so every paginated insights page gets invalidated, not
      // just the one matching the currently viewed page/pageSize combo.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/admin/leaderboard/insights");
        },
      });
      toast({ title: "Rankings Updated", description: "All scores have been recalculated." });
    },
    onError: (error: any) => {
      // apiRequest throws with format "STATUS: {json body}" — parse to extract
      // the user-friendly message (e.g. rate-limit 429 "Please wait 60 seconds").
      let description = "Could not refresh rankings.";
      try {
        const match = error?.message?.match(/^\d+:\s*([\s\S]+)$/);
        if (match) description = JSON.parse(match[1])?.message ?? description;
      } catch { /* fall through to default */ }
      toast({ title: "Update Failed", description, variant: "destructive" });
    }
  });

  const handleSort = (key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" }
    );
  };

  const handleReferrerSort = (key: string) => {
    setReferrerSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" }
    );
  };

  const applySortWith = (arr: any[], config: { key: string; direction: "asc" | "desc" } | null) => {
    if (!config) return arr;
    return [...arr].sort((a, b) => {
      const av = parseFloat(a[config.key]) || 0;
      const bv = parseFloat(b[config.key]) || 0;
      return config.direction === "asc" ? av - bv : bv - av;
    });
  };

  // Name/email filtering already happened server-side (see searchQueryParam)
  // against the full leaderboard, not just this page — only sorting is
  // applied client-side to the page already returned.
  const filtered = useMemo(() => {
    const list = insights?.globalRanking || [];
    return applySortWith(list, sortConfig);
  }, [insights, sortConfig]);

  const filteredReferrers = useMemo(() => {
    const term = referrersSearchTerm.toLowerCase();
    const list = insights?.topReferrers || [];
    return applySortWith(
      term ? list.filter(u => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term)) : list,
      referrerSortConfig
    );
  }, [insights, referrersSearchTerm, referrerSortConfig]);

  // Computed once from the unsorted/unfiltered dataset so the L1 progress
  // bar scale stays stable regardless of how the table is currently sorted
  // or filtered.
  const maxLevel1Count = useMemo(() => {
    const list = insights?.topReferrers || [];
    return list.reduce((max, u) => Math.max(max, u.level1Count || 0), 1);
  }, [insights]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedRows = filtered.filter(u => selectedIds.has(u.id));

  const totalPages = Math.ceil((insights?.totalCount || 0) / parseInt(pageSize));

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-red-50 border-[1.5px] border-red-200 rounded-[2rem] text-center space-y-4">
        <ServerCrash className="w-10 h-10 text-red-400" />
        <p className="font-black text-sm uppercase tracking-widest text-red-600">Rankings Unavailable</p>
        <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest max-w-xs">
          Could not load ranking data. Try refreshing.
        </p>
        <Button
          onClick={() => forceSyncMutation.mutate()}
          disabled={forceSyncMutation.isPending}
          className="mt-2 h-10 bg-red-600 text-white hover:bg-red-700 border-b-4 border-red-900 rounded-full font-black text-[10px] uppercase px-6 flex items-center gap-2"
        >
          {forceSyncMutation.isPending ? <ThorxSpinner size={14} /> : <RefreshCw size={14} />}
          {forceSyncMutation.isPending ? "Refreshing..." : "Refresh Rankings"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase text-[#141413]">Rankings</h2>
          {insights?.lastUpdated && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Last updated: {format(new Date(insights.lastUpdated), "MMM d, yyyy · h:mm a")}
              </p>
              {insights.isStale && (
                <span
                  className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 border-[1.5px] border-amber-300 rounded-full px-2 py-0.5"
                  title="The refresh cron hasn't run recently — data may be behind. Hit Refresh Rankings for the latest."
                >
                  <AlertTriangle size={10} />
                  Stale
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <Button
              onClick={() => downloadAsCSV(selectedRows, `thorx-rankings-${Date.now()}.csv`)}
              className="h-10 bg-primary text-white border-[1.5px] border-[#141413] font-black text-[10px] px-5 hover:bg-primary/80 rounded-full transition-all uppercase shadow-sm flex items-center gap-2"
            >
              <Download size={13} />
              Export {selectedIds.size} Selected
            </Button>
          )}
          <Button
            onClick={() => forceSyncMutation.mutate()}
            disabled={forceSyncMutation.isPending}
            className="h-10 bg-[#141413] text-white border-[1.5px] border-[#141413] font-black text-[10px] px-5 hover:bg-primary hover:text-white rounded-full transition-all uppercase shadow-sm flex items-center gap-2"
          >
            {forceSyncMutation.isPending ? <ThorxSpinner size={13} /> : <RefreshCw size={13} />}
            {forceSyncMutation.isPending ? "Updating..." : "Refresh Rankings"}
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Members", value: insights?.totalActiveUsers ?? "—", icon: <Users size={18} /> },
          { label: "Top Earner", value: insights?.globalRanking?.[0] ? `PKR ${new Decimal(insights.globalRanking[0].totalEarnings || "0").toFixed(2)}` : "—", icon: <TrendingUp size={18} /> },
          { label: "Top Referrer", value: insights?.topReferrers?.[0] ? `${insights.topReferrers[0].level1Count || 0} direct` : "—", icon: <Trophy size={18} /> },
          { label: "Watchlist", value: insights?.anomalies?.length ?? 0, icon: <AlertTriangle size={18} /> },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border-[1.5px] border-[#141413] p-5 rounded-[2rem] shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
            <div>
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">{stat.label}</p>
              <p className="text-xl font-black tabular-nums text-[#141413]">{stat.value}</p>
            </div>
            <div className="w-10 h-10 border-[1.5px] border-[#141413] rounded-2xl flex items-center justify-center bg-white shadow-sm group-hover:rotate-12 transition-transform duration-500 shrink-0">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-zinc-100 border-[1.5px] border-[#141413]/10 rounded-full p-1 h-auto">
            <TabsTrigger value="global" className="rounded-full px-5 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-[#141413] data-[state=active]:text-white transition-all">
              All Members
            </TabsTrigger>
            <TabsTrigger value="referrers" className="rounded-full px-5 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-[#141413] data-[state=active]:text-white transition-all">
              Top Recruiters
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="rounded-full px-5 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-[#141413] data-[state=active]:text-white transition-all flex items-center gap-1.5">
              <ShieldAlert size={11} />
              Risk Watchlist
            </TabsTrigger>
          </TabsList>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search members..."
              className="h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#141413] rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-xs font-bold w-64 text-[#141413] placeholder:text-zinc-400"
              value={activeTab === "referrers" ? referrersSearchTerm : globalSearchTerm}
              onChange={(e) => {
                if (activeTab === "referrers") setReferrersSearchTerm(e.target.value);
                else setGlobalSearchTerm(e.target.value);
              }}
            />
          </div>
        </div>

        {/* All Members Tab */}
        <TabsContent value="global" className="mt-4">
          <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/50 border-b-[1.5px] border-[#141413]/10">
                    <th className="p-5 w-12">
                      <button
                        onClick={() => {
                          if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                          else setSelectedIds(new Set(filtered.map(u => u.id)));
                        }}
                        className="text-zinc-400 hover:text-[#141413] transition-colors"
                      >
                        {selectedIds.size === filtered.length && filtered.length > 0 
                          ? <CheckSquare size={16} /> 
                          : <Square size={16} />}
                      </button>
                    </th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase">Rank</th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase">Member</th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase">Status</th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase cursor-pointer select-none" onClick={() => handleSort("totalEarnings")}>
                      <div className="flex items-center gap-1.5">Total Earned <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase">Team Size</th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase cursor-pointer select-none" onClick={() => handleSort("performanceScore")}>
                      <div className="flex items-center gap-1.5">Score <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-[1.5px] divide-[#141413]/10">
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} className="p-5"><Skeleton className="h-4 w-full rounded-full" /></td>
                          ))}
                        </tr>
                      ))
                    : filtered.map((user, idx) => (
                        <tr key={user.id} className="hover:bg-black/[0.02] transition-colors group">
                          <td className="p-5">
                            <button
                              onClick={() => toggleSelect(user.id)}
                              className="text-zinc-300 hover:text-[#141413] transition-colors"
                            >
                              {selectedIds.has(user.id) ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="p-5">
                            <span className={cn(
                              "inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm border-[1.5px]",
                              idx === 0 ? "bg-yellow-400 border-yellow-500 text-yellow-900" :
                              idx === 1 ? "bg-zinc-200 border-zinc-300 text-zinc-700" :
                              idx === 2 ? "bg-amber-100 border-amber-300 text-amber-800" :
                              "bg-white border-[#141413]/10 text-zinc-500"
                            )}>
                              {user.globalRank || idx + 1}
                            </span>
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-3">
                              <UserAvatar user={user} size={10} />
                              <div>
                                <div className="font-black text-sm uppercase text-[#141413] tracking-tight">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="flex flex-col gap-1.5">
                              {user.userRankTier
                                ? <RankBadge rank={user.userRankTier} size="sm" />
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 border-[1px] border-[#141413]/20 bg-zinc-100 rounded-full font-black text-[8px] tracking-widest uppercase text-[#141413]">{user.rank || "—"}</span>
                              }
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 border-[1px] rounded-full font-black text-[8px] tracking-widest uppercase",
                                trustStatusStyle(user.trustStatus)
                              )}>
                                <ShieldCheck size={8} /> {user.trustStatus || "(N/A)"}
                              </span>
                            </div>
                          </td>
                          <td className="p-5">
                            <span className="font-black text-sm tabular-nums text-[#141413]">
                              PKR {new Decimal(user.totalEarnings || "0").toFixed(2)}
                            </span>
                          </td>
                          <td className="p-5">
                            <div className="space-y-1">
                              {/* THORX v3: L1-only — L2 writes are frozen */}
                              <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                                L1: <span className="text-[#141413]">{user.level1Count || 0}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            {/* PS column — raw performance score with rank indicator */}
                            <div className="flex flex-col gap-0.5">
                              <span className="font-black text-sm tabular-nums text-[#141413]">{Number(user.performanceScore || 0).toLocaleString()}</span>
                              <span className="text-[9px] text-zinc-400 uppercase tracking-widest">PS</span>
                            </div>
                          </td>
                          <td className="p-5 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 border-[1.5px] border-[#141413]/20 hover:border-[#141413] hover:bg-black/5 rounded-full transition-all text-zinc-400 hover:text-[#141413]"
                              onClick={() => { setSelectedUser(user); setIsInspectorOpen(true); }}
                            >
                              <Eye size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))
                  }
                  {!isLoading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-16 text-center text-zinc-400 font-bold text-[10px] uppercase tracking-widest">
                        No members found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t-[1.5px] border-[#141413]/10 flex items-center justify-between">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="h-8 w-8 rounded-full border-[1.5px] border-[#141413]/20 hover:border-[#141413]"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="h-8 w-8 rounded-full border-[1.5px] border-[#141413]/20 hover:border-[#141413]"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Top Recruiters Tab */}
        <TabsContent value="referrers" className="mt-4">
          <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/50 border-b-[1.5px] border-[#141413]/10">
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase">Rank</th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase">Member</th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase cursor-pointer select-none" onClick={() => handleReferrerSort("level1Count")}>
                      <div className="flex items-center gap-1.5">Direct Referrals (L1) <ArrowUpDown size={11} /></div>
                    </th>
                    {/* THORX v3: L2 column removed — 1-tier referral only (Appendix A #4) */}
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase cursor-pointer select-none" onClick={() => handleReferrerSort("totalEarnings")}>
                      <div className="flex items-center gap-1.5">Total Earned <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="p-5 font-black text-[10px] tracking-widest text-[#141413]/40 uppercase text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y-[1.5px] divide-[#141413]/10">
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="p-5"><Skeleton className="h-4 w-full rounded-full" /></td>
                          ))}
                        </tr>
                      ))
                    : filteredReferrers.map((user, idx) => (
                        <tr key={user.id} className="hover:bg-black/[0.02] transition-colors group">
                          <td className="p-5">
                            <span className={cn(
                              "inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm border-[1.5px]",
                              idx === 0 ? "bg-yellow-400 border-yellow-500 text-yellow-900" :
                              idx === 1 ? "bg-zinc-200 border-zinc-300 text-zinc-700" :
                              idx === 2 ? "bg-amber-100 border-amber-300 text-amber-800" :
                              "bg-white border-[#141413]/10 text-zinc-500"
                            )}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-3">
                              <UserAvatar user={user} size={10} />
                              <div>
                                <div className="font-black text-sm uppercase text-[#141413] tracking-tight">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${Math.min(((user.level1Count || 0) / maxLevel1Count) * 100, 100)}%` }}
                                />
                              </div>
                              <span className="font-black text-sm tabular-nums text-[#141413]">{user.level1Count || 0}</span>
                            </div>
                          </td>
                          {/* L2 cell removed */}
                          <td className="p-5">
                            <span className="font-black text-sm tabular-nums text-[#141413]">
                              PKR {new Decimal(user.totalEarnings || "0").toFixed(2)}
                            </span>
                          </td>
                          <td className="p-5 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 border-[1.5px] border-[#141413]/20 hover:border-[#141413] hover:bg-black/5 rounded-full transition-all text-zinc-400 hover:text-[#141413]"
                              onClick={() => { setSelectedUser(user); setIsInspectorOpen(true); }}
                            >
                              <Eye size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))
                  }
                  {!isLoading && filteredReferrers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-16 text-center text-zinc-400 font-bold text-[10px] uppercase tracking-widest">
                        No recruiters found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Risk Watchlist Tab — powered by persistent case management engine */}
        <TabsContent value="watchlist" className="mt-4">
          <RiskWatchlistPanel onViewUserInCRM={onViewUserInCRM} />
        </TabsContent>
      </Tabs>

      {/* User Inspector Modal */}
      <UserInspectorPanel
        user={selectedUser}
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        onViewInCRM={onViewUserInCRM}
      />
    </div>
  );
}
