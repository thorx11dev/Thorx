import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Crown, Medal, RefreshCw } from "lucide-react";
import { QUERY_KEYS } from "@/lib/queryKeys";
import TechnicalLabel from "@/components/ui/technical-label";

interface LeaderEntry {
  rank: number;
  name: string;
  rankTier: string;
  score: number;
  avatar: string | null;
  isMe: boolean;
}

interface LeaderboardResponse {
  leaders: LeaderEntry[];
  me: { rank: number; score: number; rankTier: string } | null;
  totalRanked: number;
  lastUpdated: string | null;
}

const TIER_STYLES: Record<string, string> = {
  "S-Rank": "bg-black text-[#FFD700] border-black",
  "A-Rank": "bg-[#FF6B35] text-white border-black",
  "B-Rank": "bg-[#7c3aed] text-white border-black",
  "C-Rank": "bg-[#2563eb] text-white border-black",
  "D-Rank": "bg-[#0d9488] text-white border-black",
  "E-Rank": "bg-white text-black border-black",
};

const getAvatarSrc = (avatar: string | null) => {
  if (!avatar || avatar === "default") return "/avatars/avatar-1.png";
  if (/^\d$/.test(avatar)) return `/avatars/avatar-${avatar}.png`;
  if (avatar.startsWith("avatar")) return `/avatars/${avatar}.png`;
  return "/avatars/avatar-1.png";
};

const formatScore = (score: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(score);

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-9 h-9 flex items-center justify-center border-2 border-black bg-[#FFD700] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        <Crown className="w-4 h-4 text-black" strokeWidth={2.5} />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-9 h-9 flex items-center justify-center border-2 border-black bg-[#D8D8D8] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        <Medal className="w-4 h-4 text-black" strokeWidth={2.5} />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-9 h-9 flex items-center justify-center border-2 border-black bg-[#E8A662] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        <Medal className="w-4 h-4 text-black" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 flex items-center justify-center border-2 border-black bg-white">
      <span className="text-xs font-black">#{rank}</span>
    </div>
  );
}

export default function LeaderboardSection() {
  const [isHeroInverted, setIsHeroInverted] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<LeaderboardResponse>({
    queryKey: QUERY_KEYS.leaderboard,
    refetchInterval: 60_000,
  });

  const updatedLabel = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 md:pb-10" data-testid="section-leaderboard">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        onClick={() => setIsHeroInverted((v) => !v)}
        className={`relative border-2 md:border-[3px] border-black cursor-pointer select-none transition-colors duration-300 ${
          isHeroInverted ? "bg-black text-white" : "bg-white text-black"
        } shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]`}
      >
        <div className="px-5 py-8 md:px-8 md:py-10">
          <TechnicalLabel text="GLOBAL STANDINGS" className={isHeroInverted ? "text-white/60" : "text-black/60"} />
          <h1 className="font-black uppercase tracking-tighter leading-none text-5xl md:text-7xl">
            RANKS
          </h1>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest opacity-70">
            {data?.totalRanked ? `${data.totalRanked} warriors ranked` : "Performance Score standings"}
          </p>
        </div>
        <div className="absolute top-3 right-3">
          <Trophy className="w-6 h-6" strokeWidth={2} />
        </div>
      </div>

      {/* ── Meta row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-4 mb-3">
        <TechnicalLabel
          text={updatedLabel ? `UPDATED ${updatedLabel}` : "LIVE STANDINGS"}
        />
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-1.5 border-2 border-black bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
          aria-label="Refresh leaderboard"
        >
          <RefreshCw className={`w-3 h-3 ${isRefetching ? "animate-spin" : ""}`} strokeWidth={2.5} />
          SYNC
        </button>
      </div>

      {/* ── States ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 border-2 border-black bg-white animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="border-2 border-black bg-white p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-black uppercase tracking-tight">Standings unavailable</p>
          <p className="text-xs mt-1 opacity-70">System matrix is recalibrating. Try SYNC in a moment.</p>
        </div>
      )}

      {data && data.leaders.length === 0 && (
        <div className="border-2 border-black bg-white p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-black uppercase tracking-tight">No warriors ranked yet</p>
          <p className="text-xs mt-1 opacity-70">Be the first. Complete surveys, climb the PS ladder.</p>
        </div>
      )}

      {/* ── Podium (top 3) ───────────────────────────────────────────────── */}
      {data && data.leaders.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {data.leaders.slice(0, 3).map((entry) => (
              <div
                key={entry.rank}
                className={`border-2 border-black p-3 text-center ${
                  entry.rank === 1
                    ? "bg-[#FFD700]/20 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-white"
                }`}
              >
                <div className="flex justify-center">
                  <RankBadge rank={entry.rank} />
                </div>
                <img
                  src={getAvatarSrc(entry.avatar)}
                  alt=""
                  className="w-10 h-10 mx-auto mt-2 border-2 border-black object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                />
                <p className="mt-1.5 text-xs font-black uppercase tracking-tight truncate">
                  {entry.name}
                </p>
                <span
                  className={`inline-block mt-1 px-1.5 py-0.5 border-2 text-[9px] font-black ${
                    TIER_STYLES[entry.rankTier] ?? TIER_STYLES["E-Rank"]
                  }`}
                >
                  {entry.rankTier}
                </span>
                <p className="mt-1 text-[11px] font-black">{formatScore(entry.score)} PS</p>
              </div>
            ))}
          </div>

          {/* ── Full list ──────────────────────────────────────────────────── */}
          <div className="space-y-2">
            {data.leaders.map((entry) => (
              <div
                key={entry.rank}
                className={`flex items-center gap-3 border-2 border-black px-3 py-2.5 ${
                  entry.isMe
                    ? "bg-[#FF6B35]/15 shadow-[4px_4px_0px_0px_rgba(255,107,53,1)]"
                    : "bg-white"
                }`}
              >
                <RankBadge rank={entry.rank} />
                <img
                  src={getAvatarSrc(entry.avatar)}
                  alt=""
                  className="w-8 h-8 border-2 border-black object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight truncate">
                    {entry.name}
                    {entry.isMe && <span className="ml-2 text-[9px] bg-black text-white px-1 py-0.5">YOU</span>}
                  </p>
                  <span
                    className={`inline-block px-1.5 py-0.5 border-2 text-[8px] font-black mt-0.5 ${
                      TIER_STYLES[entry.rankTier] ?? TIER_STYLES["E-Rank"]
                    }`}
                  >
                    {entry.rankTier}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">{formatScore(entry.score)}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">PS</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Your rank card ─────────────────────────────────────────────── */}
          {data.me && (
            <div className="mt-4 border-2 md:border-[3px] border-black bg-black text-white p-4 shadow-[6px_6px_0px_0px_rgba(255,107,53,1)] flex items-center justify-between">
              <div>
                <TechnicalLabel text="YOUR POSITION" className="text-white/60" />
                <p className="font-black uppercase tracking-tighter text-2xl leading-none mt-1">
                  #{data.me.rank}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-0.5 border-2 border-white text-[10px] font-black">
                  {data.me.rankTier}
                </span>
                <p className="text-sm font-black mt-1">{formatScore(data.me.score)} PS</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
