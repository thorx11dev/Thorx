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
  isMe: boolean;
}

interface LeaderboardResponse {
  leaders: LeaderEntry[];
  me: { rank: number; score: number; rankTier: string } | null;
  totalRanked: number;
  lastUpdated: string | null;
}

const getAvatarSrc = (avatar: string | null) => {
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
      className="max-w-3xl mx-auto px-4 pb-24 md:pb-10 pt-2"
      data-testid="section-leaderboard"
    >
      {/* ── Hero — matches portal section headers (WORK / GUILD / REFERRALS / HELP) ── */}
      <motion.div
        variants={itemVariants}
        onClick={() => setIsRanksHeroToggled((v) => !v)}
        initial={false}
        animate={{
          backgroundColor: isRanksHeroToggled ? "#ffffff" : "#000000",
          borderColor: isRanksHeroToggled ? "#000000" : "#ffffff",
          boxShadow: isRanksHeroToggled
            ? "0 4px 20px rgba(0,0,0,0.06)"
            : "0 8px 30px rgba(0,0,0,0.12)"
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
                RANKS
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
                RANKS
              </motion.h1>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <InteractiveDivider className="my-12" />

      {/* ── Meta row ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-primary pulse-glow shrink-0" />
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
          className="flex items-center gap-1.5 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 hover:bg-black hover:text-white active:scale-95 disabled:opacity-50"
          aria-label="Refresh leaderboard"
          data-testid="leaderboard-refresh"
        >
          <RefreshCw className={`w-3 h-3 ${isRefetching ? "animate-spin" : ""}`} strokeWidth={2.5} />
          SYNC
        </button>
      </motion.div>

      {/* ── States ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl border border-black/15 bg-white animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-2xl border border-black/15 bg-white animate-pulse" />
        </div>
      )}

      {isError && (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-black/15 bg-white p-8 md:p-12 text-center"
        >
          <div className="bg-black/5 rounded-xl w-fit p-3 mx-auto mb-5">
            <Trophy className="w-6 h-6 text-black" strokeWidth={2} />
          </div>
          <p className="font-black uppercase tracking-tight text-lg">Standings unavailable</p>
          <p className="text-sm mt-1.5 opacity-60 font-medium">
            System matrix is recalibrating. Try SYNC in a moment.
          </p>
        </motion.div>
      )}

      {data && data.leaders.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-black/15 bg-white p-8 md:p-12 text-center"
        >
          <div className="bg-black/5 rounded-xl w-fit p-3 mx-auto mb-5">
            <Trophy className="w-6 h-6 text-black" strokeWidth={2} />
          </div>
          <p className="font-black uppercase tracking-tight text-lg">No warriors ranked yet</p>
          <p className="text-sm mt-1.5 opacity-60 font-medium">
            Be the first. Complete surveys, climb the PS ladder.
          </p>
        </motion.div>
      )}

      {/* ── Podium (top 3) ───────────────────────────────────────────────── */}
      {data && data.leaders.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2.5 md:gap-4 mb-3 md:mb-4">
            {data.leaders.slice(0, 3).map((entry) => (
              <motion.div
                key={entry.rank}
                variants={itemVariants}
                className={cn(
                  "relative rounded-2xl border p-3.5 md:p-5 pt-5 md:pt-6 text-center transition-all duration-500 ease-out",
                  entry.rank === 1
                    ? "border-black bg-[#FFF7ED] hover:-translate-y-1.5 hover:shadow-[6px_6px_0px_0px_rgba(255,107,53,1)]"
                    : "border-black/15 bg-white hover:-translate-y-1.5 hover:border-black hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                )}
              >
                <div
                  className={cn(
                    "absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] text-white",
                    entry.rank === 1 ? "bg-primary" : "bg-black"
                  )}
                >
                  #{entry.rank}
                </div>

                <img
                  src={getAvatarSrc(entry.avatar)}
                  alt=""
                  className="w-11 h-11 md:w-12 md:h-12 mx-auto rounded-xl border-2 border-black object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                />
                <p className="mt-2.5 text-xs md:text-sm font-black uppercase tracking-tight truncate">
                  {entry.name}
                </p>
                <div className="mt-1.5 flex justify-center">
                  <RankBadge rank={entry.rankTier} size="sm" />
                </div>
                <p className="mt-2 text-base md:text-lg font-black tracking-tighter tabular-nums">
                  {formatScore(entry.score)}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
              </motion.div>
            ))}
          </div>

          {/* ── Full list ──────────────────────────────────────────────────── */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-black/15 bg-white overflow-hidden"
          >
            <div className="hidden md:flex items-center gap-4 px-6 py-3 border-b border-black/10 bg-black/[0.03]">
              <span className="w-7 text-center">
                <TechnicalLabel text="#" className="text-black/40" />
              </span>
              <span className="flex-1">
                <TechnicalLabel text="WARRIOR" className="text-black/40" />
              </span>
              <span className="w-16 md:w-20 text-right">
                <TechnicalLabel text="PS" className="text-black/40" />
              </span>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {data.leaders.map((entry) => (
                <div
                  key={entry.rank}
                  className={cn(
                    "relative flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3.5 md:py-4 transition-colors duration-300",
                    entry.isMe ? "bg-primary/[0.07]" : "hover:bg-black/[0.03]"
                  )}
                >
                  {entry.isMe && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-9 w-[3px] rounded-r-full bg-primary" />
                  )}

                  <span
                    className={cn(
                      "w-7 text-center text-sm font-black tracking-tighter tabular-nums",
                      entry.rank <= 3 ? "text-primary" : "text-black"
                    )}
                  >
                    {entry.rank}
                  </span>

                  <img
                    src={getAvatarSrc(entry.avatar)}
                    alt=""
                    className="w-9 h-9 rounded-lg border border-black/15 object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).src = "/avatars/avatar-1.png")}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black uppercase tracking-tight truncate flex items-center gap-2">
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

                  <div className="w-16 md:w-20 text-right">
                    <p className="text-sm md:text-base font-black tracking-tight tabular-nums">
                      {formatScore(entry.score)}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Your rank card ─────────────────────────────────────────────── */}
          {data.me && (
            <motion.div
              variants={itemVariants}
              className="relative overflow-hidden rounded-2xl bg-black text-white p-6 md:p-8 mt-4 md:mt-6 shadow-[0_12px_40px_rgba(0,0,0,0.25)] flex items-center justify-between"
            >
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              <div className="pl-2">
                <TechnicalLabel text="YOUR POSITION" className="text-white/50" />
                <p className="font-black uppercase tracking-tighter text-4xl md:text-6xl leading-none mt-2 tabular-nums">
                  #{data.me.rank}
                </p>
              </div>
              <div className="text-right">
                <RankBadge rank={data.me.rankTier} size="md" />
                <p className="text-base md:text-lg font-black tracking-tight mt-2 tabular-nums">
                  {formatScore(data.me.score)}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/40">PS</p>
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
