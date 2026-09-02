import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Trophy, RefreshCw } from "lucide-react";
import { QUERY_KEYS } from "@/lib/queryKeys";
import TechnicalLabel from "@/components/ui/technical-label";
import RankBadge from "@/components/RankBadge";
import { InteractiveDivider } from "@/features/user-portal/shared";
import { cn } from "@/lib/utils";

interface LeaderEntry {
  rank: number;
  name: string;
  rankTier: string;
  score: number;
  avatar: string | null;
  profilePicture: string | null;
  isMe: boolean;
}

interface LeaderboardResponse {
  leaders: LeaderEntry[];
  me: { rank: number; score: number; rankTier: string } | null;
  totalRanked: number;
  lastUpdated: string | null;
}

const getAvatarSrc = (entry: Pick<LeaderEntry, "avatar" | "profilePicture">) => {
  if (entry.profilePicture) return entry.profilePicture;
  const avatar = entry.avatar;
  if (!avatar || avatar === "default") return "/avatars/avatar-1.png";
  if (/^\d$/.test(avatar)) return `/avatars/avatar-${avatar}.png`;
  if (avatar.startsWith("avatar")) return `/avatars/${avatar}.png`;
  return "/avatars/avatar-1.png";
};

const formatScore = (score: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(score);

const containerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.07 } },
};

const itemVariants: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export default function LeaderboardSection() {
  const [isRanksHeroToggled, setIsRanksHeroToggled] = useState(false);
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<LeaderboardResponse>({
    queryKey: QUERY_KEYS.leaderboard,
    refetchInterval: 60_000,
  });

  const updatedLabel = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={containerVariants}
      className="max-w-[1600px] mx-auto px-4 md:px-12 py-8 md:pt-4 md:pb-12 relative z-10 w-full"
      data-testid="section-leaderboard"
    >
      {/* ── Hero — matches portal section headers (WORK / GUILD / REFERRALS / HELP) ── */}
      <motion.div
        variants={itemVariants}
        onClick={() => setIsRanksHeroToggled((v) => !v)}
        initial={false}
        animate={{
          backgroundColor: isRanksHeroToggled ? "#FAF9F5" : "#141413",
          borderColor: isRanksHeroToggled ? "#141413" : "#FAF9F5",
          boxShadow: isRanksHeroToggled
            ? "0 4px 20px rgba(20, 20, 19,0.06)"
            : "0 8px 30px rgba(20, 20, 19,0.12)"
        }}
        transition={{
          backgroundColor: { duration: 0.4 },
          borderColor: { duration: 0.4 }
        }}
        className={cn(
          "rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden group border-2 cursor-pointer",
          "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
        )}
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
        <div className="relative z-10 w-full text-center md:text-left">
          <AnimatePresence mode="popLayout" initial={false}>
            {isRanksHeroToggled ? (
              <motion.h1
                key="ranks-expanded"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-black"
              >
                CHART
              </motion.h1>
            ) : (
              <motion.h1
                layout
                key="ranks-collapsed"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-white"
              >
                CHART
              </motion.h1>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <InteractiveDivider className="my-12" />

      {/* ── Meta row ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <TechnicalLabel
            text={updatedLabel ? `UPDATED ${updatedLabel}` : "LIVE STANDINGS"}
            className="font-mono tracking-[0.2em] text-black/40 truncate"
          />
          <div className="h-3 w-px bg-black/15 shrink-0 hidden sm:block" />
          <TechnicalLabel
            text={data?.totalRanked ? `${data.totalRanked} RANKED` : "GLOBAL"}
            className="text-black/40 hidden sm:block"
          />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-1.5 md:gap-2 rounded-lg border-2 border-black bg-white px-3 md:px-4 py-2 md:py-2.5 text-[10px] md:text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 hover:bg-black hover:text-white active:scale-95 disabled:opacity-50"
          aria-label="Refresh leaderboard"
          data-testid="leaderboard-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isRefetching ? "animate-spin" : ""}`} strokeWidth={2.5} />
          SYNC
        </button>
      </motion.div>

      {/* ── States ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="mb-4 md:mb-8">
          <div className="sm:hidden">
            <div className="h-[88px] rounded-2xl border border-black/15 bg-white animate-pulse" />
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="h-44 rounded-2xl border border-black/15 bg-white animate-pulse" />
              <div className="h-44 rounded-2xl border border-black/15 bg-white animate-pulse" />
            </div>
          </div>
          <div className="hidden sm:grid grid-cols-3 gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 rounded-2xl border border-black/15 bg-white animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {isError && (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-black/15 bg-white p-8 md:p-12 text-center"
        >
          <div className="bg-black/5 rounded-xl w-fit p-3 md:p-4 mx-auto mb-5">
            <Trophy className="w-6 h-6 md:w-8 md:h-8 text-black" strokeWidth={2} />
          </div>
          <p className="font-black uppercase tracking-tight text-lg md:text-2xl">Standings unavailable</p>
          <p className="text-sm md:text-base mt-2 opacity-60 font-medium">
            System matrix is recalibrating. Try SYNC in a moment.
          </p>
        </motion.div>
      )}

      {data && data.leaders.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-black/15 bg-white p-8 md:p-12 text-center"
        >
          <div className="bg-black/5 rounded-xl w-fit p-3 md:p-4 mx-auto mb-5">
            <Trophy className="w-6 h-6 md:w-8 md:h-8 text-black" strokeWidth={2} />
          </div>
          <p className="font-black uppercase tracking-tight text-lg md:text-2xl">No warriors ranked yet</p>
          <p className="text-sm md:text-base mt-2 opacity-60 font-medium">
            Be the first. Complete surveys, climb the PS ladder.
          </p>
        </motion.div>
      )}

      {/* ── Podium (top 3) ───────────────────────────────────────────────── */}
      {data && data.leaders.length > 0 && (
        <>
          {/* Mobile podium: #1 as full-width hero row, #2/#3 side-by-side */}
          <div className="sm:hidden mb-4" data-testid="podium-mobile">
            {data.leaders.slice(0, 1).map((entry) => (
              <motion.div
                key={entry.rank}
                variants={itemVariants}
                className="flex items-center gap-3.5 rounded-2xl border-2 border-black bg-[#D97757] p-4 shadow-[0_4px_16px_rgba(20, 20, 19,0.08)]"
              >
                <div className="relative shrink-0">
                  <img
                    src={getAvatarSrc(entry)}
                    alt=""
                    className="h-14 w-14 rounded-xl border-2 border-black object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                  />
                  <span className="absolute -bottom-2 -right-2 rounded-md border-2 border-[#D97757] bg-primary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                    #1
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black uppercase tracking-tight">{entry.name}</p>
                  <div className="mt-1.5">
                    <RankBadge rank={entry.rankTier} size="sm" />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="whitespace-nowrap text-xl font-black leading-none tracking-tighter tabular-nums">
                    {formatScore(entry.score)}
                  </p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
                </div>
              </motion.div>
            ))}

            {data.leaders.length > 1 && (
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {data.leaders.slice(1, 3).map((entry) => (
                  <motion.div
                    key={entry.rank}
                    variants={itemVariants}
                    className="relative rounded-2xl border border-black/15 bg-white p-3.5 pt-5 text-center transition-all duration-500 ease-out hover:border-black"
                  >
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-sm bg-black px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-white">
                      #{entry.rank}
                    </span>
                    <img
                      src={getAvatarSrc(entry)}
                      alt=""
                      className="mx-auto h-12 w-12 rounded-xl border-2 border-black object-cover"
                      onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                    />
                    <p className="mt-2 truncate text-[11px] font-black uppercase tracking-tight">
                      {entry.name}
                    </p>
                    <div className="mt-1.5 flex justify-center">
                      <RankBadge rank={entry.rankTier} size="sm" />
                    </div>
                    <p className="mt-2 whitespace-nowrap text-base font-black leading-none tracking-tighter tabular-nums">
                      {formatScore(entry.score)}
                    </p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Tablet/desktop podium: 3 vertical cards */}
          <div className="hidden sm:grid grid-cols-3 gap-8 mb-4 md:mb-8">
            {data.leaders.slice(0, 3).map((entry) => (
              <motion.div
                key={entry.rank}
                variants={itemVariants}
                className={cn(
                  "relative rounded-2xl border p-4 md:p-6 pt-6 md:pt-8 text-center transition-all duration-500 ease-out",
                  entry.rank === 1
                    ? "border-black bg-[#D97757] hover:-translate-y-1.5 hover:shadow-[6px_6px_0px_0px_rgba(217, 119, 87,1)]"
                    : "border-black/15 bg-white hover:-translate-y-1.5 hover:border-black hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)]"
                )}
              >
                <div
                  className={cn(
                    "absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-white",
                    entry.rank === 1 ? "bg-primary" : "bg-black"
                  )}
                >
                  #{entry.rank}
                </div>

                <img
                  src={getAvatarSrc(entry)}
                  alt=""
                  className="w-14 h-14 md:w-16 md:h-16 mx-auto rounded-xl md:rounded-2xl border-2 border-black object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                />
                <p className="mt-3 md:mt-4 text-xs md:text-base font-black uppercase tracking-tight truncate">
                  {entry.name}
                </p>
                <div className="mt-2 flex justify-center">
                  <RankBadge rank={entry.rankTier} size="md" />
                </div>
                <p className="mt-2 md:mt-3 text-xl md:text-3xl font-black tracking-tighter tabular-nums">
                  {formatScore(entry.score)}
                </p>
                <p className="mt-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
              </motion.div>
            ))}
          </div>

          {/* ── Full list (rank 4+ — top 3 live only in the podium above) ──── */}
          {data.leaders.length > 3 && (
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-black/15 bg-white overflow-hidden"
            >
            <div className="hidden md:flex items-center gap-6 px-8 py-4 border-b border-black/10 bg-black/[0.03]">
              <span className="w-8 text-center">
                <TechnicalLabel text="#" className="text-black/40" />
              </span>
              <span className="flex-1">
                <TechnicalLabel text="WARRIOR" className="text-black/40" />
              </span>
              <span className="w-20 md:w-24 text-right">
                <TechnicalLabel text="PS" className="text-black/40" />
              </span>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {data.leaders.slice(3).map((entry) => (
                <div
                  key={entry.rank}
                  className={cn(
                    "relative flex items-center gap-3 md:gap-6 px-4 md:px-8 py-4 md:py-5 transition-colors duration-300",
                    entry.isMe ? "bg-primary/[0.07]" : "hover:bg-black/[0.03]"
                  )}
                >
                  {entry.isMe && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-10 md:h-12 w-1 rounded-r-full bg-primary" />
                  )}

                  <span
                    className={cn(
                      "w-8 text-center text-sm md:text-lg font-black tracking-tighter tabular-nums",
                      entry.isMe ? "text-primary" : "text-black"
                    )}
                  >
                    {entry.rank}
                  </span>

                  <img
                    src={getAvatarSrc(entry)}
                    alt=""
                    className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl border border-black/15 object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm md:text-base font-black uppercase tracking-tight truncate flex items-center gap-2">
                      {entry.name}
                      {entry.isMe && (
                        <span className="shrink-0 bg-black text-white rounded-sm px-1.5 py-0.5 text-[9px] font-black tracking-widest">
                          YOU
                        </span>
                      )}
                    </p>
                    <div className="mt-1">
                      <RankBadge rank={entry.rankTier} size="sm" />
                    </div>
                  </div>

                  <div className="w-14 md:w-24 text-right">
                    <p className="text-sm md:text-xl font-black tracking-tight tabular-nums">
                      {formatScore(entry.score)}
                    </p>
                    <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
                  </div>
                </div>
              ))}
            </div>
            </motion.div>
          )}

          {/* ── Your rank card ─────────────────────────────────────────────── */}
          {data.me && (
            <motion.div
              variants={itemVariants}
              className="relative overflow-hidden rounded-2xl bg-black text-white p-6 md:p-10 mt-4 md:mt-8 shadow-[0_12px_40px_rgba(20, 20, 19,0.25)] flex items-center justify-between"
            >
              <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />
              <div className="pl-2 md:pl-3">
                <TechnicalLabel text="YOUR POSITION" className="text-white/50" />
                <p className="font-black uppercase tracking-tighter text-4xl md:text-7xl leading-none mt-2 md:mt-3 tabular-nums">
                  #{data.me.rank}
                </p>
              </div>
              <div className="text-right">
                <RankBadge rank={data.me.rankTier} size="md" />
                <p className="text-lg md:text-2xl font-black tracking-tight mt-2 md:mt-3 tabular-nums">
                  {formatScore(data.me.score)}
                </p>
                <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">PS</p>
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
