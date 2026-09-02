/**
 * LiveActivityFeed — THORX v3 (spec F.12)
 * Real-time Engine event feed for admins. Backed by /api/admin/live-feed and
 * kept live by the shared admin WebSocket ("feed:event" push, wired in
 * useRealtimeSync) with a slower poll as a fallback in case the socket drops.
 */
import { useMemo, useState } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useQuery } from "@tanstack/react-query";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { apiRequest } from "@/lib/queryClient";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { RankBadge } from "@/components/RankBadge";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { Badge } from "@/components/ui/badge";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import {Activity, RefreshCw, Zap, Users, Target, Wallet, UserPlus, TrendingDown, AlertTriangle, Pause, Play, ChevronDown} from "lucide-react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { cn } from "@/lib/utils";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { formatDistanceToNow } from "date-fns";
import ThorxSpinner from "@/components/ui/thorx-spinner";

interface FeedEvent {
  id: string;
  eventType: string;
  userId: string | null;
  userEmail: string | null;
  userRankTier: string | null;
  guildId: string | null;
  guildName: string | null;
  engineType: string | null;
  pkrAmount: string | null;
  pointsAmount: number | null;
  metadata: any;
  createdAt: string;
}

const ENGINE_COLORS: Record<string, string> = {
  Engine_A: "#D97757",
  Engine_B: "#7c3aed",
  Engine_C: "#16a34a",
  Indirect:  "#6b7280",
};

// Audit fix (API shape mismatch): these keys previously read "guild" and
// "ad_view", which don't exist in the backend's FeedEventType union
// (server/modules/live-feed.ts). "guild" never matched "guild_target" /
// "guild_event" so those rows silently fell back to the default icon, and
// "ad_view" was dead code — that event type is never emitted. Keys below now
// match the real union exactly: earn | rank_up | guild_target | guild_event |
// withdrawal | registration | inactivity.
const EVENT_ICONS: Record<string, React.ReactNode> = {
  earn:         <Zap size={12} />,
  rank_up:      <Badge className="text-[10px] px-1 py-0 h-4">↑</Badge>,
  guild_target: <Target size={12} />,
  guild_event:  <Users size={12} />,
  withdrawal:   <Wallet size={12} />,
  registration: <UserPlus size={12} />,
  inactivity:   <TrendingDown size={12} />,
};

const EVENT_TYPE_OPTIONS = [
  { value: "",             label: "All events" },
  { value: "earn",         label: "Earn" },
  { value: "rank_up",      label: "Rank up" },
  { value: "guild_target", label: "Guild target" },
  { value: "guild_event",  label: "Guild event" },
  { value: "withdrawal",   label: "Withdrawal" },
  { value: "registration", label: "Registration" },
  { value: "inactivity",   label: "Inactivity" },
];

const PAGE_SIZE = 50;
const MAX_LIMIT = 200; // matches the server-side cap in storage.getActivityFeedEvents

function FeedRow({ event, onViewUserInCRM }: { event: FeedEvent; onViewUserInCRM?: (email: string) => void }) {
  const engineColor = event.engineType ? ENGINE_COLORS[event.engineType] ?? "#71717a" : "#71717a";
  const canLinkUser = !!onViewUserInCRM && !!event.userEmail && event.userEmail !== "System";

  return (
    <div className="flex items-start gap-3 py-2 px-3 hover:bg-zinc-50 rounded-lg transition-colors">
      <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5"
        style={event.engineType ? { backgroundColor: engineColor + "20", color: engineColor } : {}}>
        {EVENT_ICONS[event.eventType] ?? <Activity size={12} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {canLinkUser ? (
            <button
              type="button"
              onClick={() => onViewUserInCRM!(event.userEmail!)}
              className="text-xs font-semibold truncate hover:underline hover:text-blue-600 transition-colors text-left"
              title="View this user in User Manager"
            >
              {event.userEmail}
            </button>
          ) : (
            <span className="text-xs font-semibold truncate">{event.userEmail ?? "System"}</span>
          )}
          {event.userRankTier && <RankBadge rank={event.userRankTier} size="sm" showLabel={false} />}
          {event.engineType && (
            <span className="text-[10px] font-mono px-1 py-0 rounded" style={{ backgroundColor: engineColor + "20", color: engineColor }}>
              {event.engineType}
            </span>
          )}
          <span className="text-[10px] text-zinc-400 font-mono uppercase">{event.eventType.replace(/_/g, " ")}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {event.pkrAmount && parseFloat(event.pkrAmount) > 0 && (
            <span className="text-xs text-emerald-600 font-semibold">+Rs.{parseFloat(event.pkrAmount).toFixed(2)}</span>
          )}
          {event.pointsAmount && event.pointsAmount > 0 && (
            <span className="text-xs text-zinc-500">{event.pointsAmount.toLocaleString()} pts</span>
          )}
          {event.guildName && (
            <span className="text-[11px] text-zinc-400">{event.guildName}</span>
          )}
          <span className="text-[10px] text-zinc-300 ml-auto">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

export function LiveActivityFeed({ onViewUserInCRM }: { onViewUserInCRM?: (email: string) => void } = {}) {
  const [eventType, setEventType] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Audit fix (UX): pausing stops both the poll fallback and WS-triggered
  // refetches (via `enabled: false`) so the list doesn't jump under an admin
  // mid-review; resuming immediately catches up.
  const [paused, setPaused] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<FeedEvent[]>({
    queryKey: ["/api/admin/live-feed", { type: eventType, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (eventType) params.set("type", eventType);
      const r = await apiRequest("GET", `/api/admin/live-feed?${params.toString()}`);
      const d = await r.json();
      return d.events ?? d;
    },
    // Real-time freshness now comes from the WS "feed:event" push
    // (useRealtimeSync); this poll is just a safety net for missed sockets.
    refetchInterval: paused ? false : 20000,
    staleTime: 5000,
    enabled: !paused,
    placeholderData: (prev) => prev,
  });

  const events = useMemo(() => data ?? [], [data]);

  const totals = useMemo(() => events.reduce((acc, e) => {
    if (e.engineType) acc[e.engineType] = (acc[e.engineType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [events]);

  const canLoadMore = limit < MAX_LIMIT && events.length >= limit;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-black">Live Activity Feed</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Real-time earn events across all engines.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-9 pl-3 pr-7 appearance-none bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-200 cursor-pointer"
            >
              {EVENT_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setPaused(p => !p)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-3 h-9 rounded-lg border transition-colors",
              paused ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900"
            )}
            title={paused ? "Resume live updates" : "Pause live updates"}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? "Paused" : "Live"}
          </button>
          <button
            onClick={() => refetch()}
            className={cn("flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors", isFetching ? "animate-pulse" : "")}
          >
            {isFetching ? <ThorxSpinner size={14} /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Engine totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(ENGINE_COLORS).map(([eng, color]) => (
          <div key={eng} className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <div className="text-[10px] font-mono" style={{ color }}>{eng}</div>
            <div className="text-xl font-black mt-0.5">{(totals[eng] || 0).toLocaleString()}</div>
            <div className="text-[10px] text-zinc-400">events ({events.length} loaded)</div>
          </div>
        ))}
      </div>

      {/* Feed */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="p-3 border-b border-zinc-100 flex items-center gap-2">
          <Activity size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold">Event Stream</span>
          {paused && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Paused</span>}
          <span className="ml-auto text-[10px] text-zinc-400">{events.length} events</span>
        </div>
        {isError ? (
          <div className="flex flex-col items-center gap-2 text-center py-12 text-zinc-500 text-sm">
            <AlertTriangle size={20} className="text-red-500" />
            <span>Couldn't load the activity feed.</span>
            <button
              onClick={() => refetch()}
              className="text-xs font-semibold text-zinc-700 underline hover:text-zinc-900"
            >
              Try again
            </button>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-zinc-400 text-sm">Loading feed…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-sm">No events yet.</div>
        ) : (
          <>
            <div className="divide-y divide-zinc-50 max-h-[600px] overflow-y-auto">
              {events.map(e => <FeedRow key={e.id} event={e} onViewUserInCRM={onViewUserInCRM} />)}
            </div>
            {canLoadMore && (
              <div className="p-2 border-t border-zinc-100 text-center">
                <button
                  onClick={() => setLimit(l => Math.min(l + PAGE_SIZE, MAX_LIMIT))}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors py-1.5 px-4"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default LiveActivityFeed;
