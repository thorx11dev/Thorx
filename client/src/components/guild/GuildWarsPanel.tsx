/**
 * GuildWarsPanel — THORX v3 (Phase 6, million-dollar redesign)
 * War status, voting flow, challenge initiation, live scoreboard.
 * Landing-page language: display type, mono labels, hard shadows, orange accents.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PremiumCard } from "@/components/ui/premium-card";
import { SectionChip, CTA_CLASS, OUTLINE_CLASS, AvatarStamp } from "./GuildPanelShell";
import {
  GiPocketWatch, GiRoundShield, GiSwordSpin,
  GiCrossedSwords, GiFlame, GiLaurelsTrophy, GiBroadsword, GiSpartanHelmet, GiSkullCrossedBones,
} from "./guild-icons";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface GuildWarsPanelProps {
  guildId: string;
  isCaptain?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending_challenger_approval: { label: "PENDING YOUR VOTE",     cls: "bg-white text-black border-black" },
  pending_challenged_approval: { label: "PENDING OPPONENT VOTE", cls: "bg-white text-black border-black" },
  active:                      { label: "WAR ACTIVE",            cls: "bg-black text-white border-black" },
  completed:                   { label: "COMPLETED",             cls: "bg-white text-black/50 border-black/15" },
  cancelled:                   { label: "CANCELLED",             cls: "bg-white text-black/50 border-black/15" },
};

/** Mono group label + hairline — notification-panel section signature. */
const GroupLabel = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3 mb-3">
    <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/35 uppercase whitespace-nowrap">{text}</span>
    <div className="h-px flex-1 bg-black/10" />
  </div>
);

/** Landing corner plus marks — guild-card signature. */
const CornerPlus = () => (
  <>
    <Plus className="absolute top-2.5 left-2.5 size-3.5 text-black/20" strokeWidth={2} />
    <Plus className="absolute top-2.5 right-2.5 size-3.5 text-black/20" strokeWidth={2} />
    <Plus className="absolute bottom-2.5 left-2.5 size-3.5 text-black/20" strokeWidth={2} />
    <Plus className="absolute bottom-2.5 right-2.5 size-3.5 text-black/20" strokeWidth={2} />
  </>
);

export function GuildWarsPanel({ guildId, isCaptain = false }: GuildWarsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [challengeMode, setChallengeMode] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState<any>(null);

  const {
    data: warData,
    isLoading,
    isError,
    refetch: refetchWar,
  } = useQuery<any>({
    queryKey: ["/api/guilds", guildId, "war"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${guildId}/war`);
      return r.json();
    },
    refetchInterval: 15000,
  });

  const { data: opponentsData } = useQuery<any>({
    queryKey: ["/api/guilds", guildId, "war", "opponents"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${guildId}/war/eligible-opponents`);
      return r.json();
    },
    enabled: challengeMode && isCaptain,
  });

  const challengeMutation = useMutation({
    mutationFn: async (challengedGuildId: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/war/challenge`, { challengedGuildId });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Challenge Initiated!", description: "Your guild members must now vote to approve." });
      setChallengeMode(false);
      setSelectedOpponent(null);
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "war"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const voteMutation = useMutation({
    mutationFn: async ({ warId, approved }: { warId: string; approved: boolean }) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/war/${warId}/vote`, { approved });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.cancelled) {
        toast({ title: "War Cancelled", description: "The challenge has been withdrawn." });
      } else if (data.allApproved && data.war.status === "active") {
        toast({ title: "War Started!", description: "The battle is on! Earn points to win." });
      } else {
        toast({ title: "Vote Recorded" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "war"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (warId: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/war/${warId}/cancel`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Challenge Cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "war"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  /* ── Loading — layout preview skeleton ─────────────────────────────── */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border-2 border-black rounded-2xl p-4 flex items-center gap-3">
          <GiSwordSpin size={15} className="animate-spin text-primary" />
          <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/45 uppercase">Loading war status…</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-2">
          <div className="aspect-square rounded-2xl bg-[#EAE5DD] border-2 border-black/10" />
          <div className="w-10 h-10 rounded-xl bg-black/5 border-2 border-black/10" />
          <div className="aspect-square rounded-2xl bg-[#EAE5DD] border-2 border-black/10" />
        </div>
        <div className="bg-white border-2 border-black/10 rounded-2xl p-5 space-y-3">
          <div className="h-2.5 rounded-full bg-black/10" />
          <div className="h-2.5 rounded-full bg-black/5" />
        </div>
      </div>
    );
  }

  /* ── Error ─────────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <PremiumCard className="p-8 md:p-10 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#EAE5DD] border-2 border-black/10 flex items-center justify-center">
          <GiCrossedSwords className="w-6 h-6 text-black/25" />
        </div>
        <div>
          <p className="font-black text-black uppercase tracking-tighter">Could not load war data</p>
          <p className="text-[10px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-1.5">Server unreachable</p>
        </div>
        <button onClick={() => refetchWar()} className={cn(CTA_CLASS, "h-10 px-5 text-[10px]")}>
          Retry
        </button>
      </PremiumCard>
    );
  }

  const war = warData?.war;
  const badges = warData?.badges ?? [];
  const approvals = warData?.approvals ?? [];
  const totalActiveMembers = warData?.totalActiveMembers ?? 0;
  const approvedCount = warData?.approvedCount ?? 0;
  const challengerGuild = warData?.challengerGuild;
  const challengedGuild = warData?.challengedGuild;
  const myGuildIsChallenger = war?.challengerGuildId === guildId;
  const myGuildIsChallenged = war?.challengedGuildId === guildId;
  const statusCfg = (() => {
    if (!war) return null;
    if (war.status === "pending_challenger_approval") {
      return myGuildIsChallenger
        ? STATUS_CONFIG.pending_challenger_approval
        : { label: "PENDING OPPONENT VOTE", cls: "bg-white text-black border-black" };
    }
    if (war.status === "pending_challenged_approval") {
      return myGuildIsChallenged
        ? STATUS_CONFIG.pending_challenged_approval
        : { label: "PENDING OPPONENT VOTE", cls: "bg-white text-black border-black" };
    }
    return STATUS_CONFIG[war.status] ?? null;
  })();

  const myVote = approvals.find((a: any) => a.userId === user?.id);
  const isMyGuildVotingPhase =
    (war?.status === "pending_challenger_approval" && myGuildIsChallenger) ||
    (war?.status === "pending_challenged_approval" && myGuildIsChallenged);

  const fmtRs = (n: number) => `Rs.${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* ── Badges earned — solid orange landing chips ── */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((b: any) => (
            <span key={b.id} className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary text-white border-2 border-black font-black uppercase tracking-[0.2em] text-[9px]">
              {b.badgeName}
            </span>
          ))}
        </div>
      )}

      {/* ── No active war — editorial peace plate ── */}
      {!war && (
        <PremiumCard interactive={false} className="p-5 md:p-7 space-y-5">
          {/* Ivory media block — corner plus marks + monogram */}
          <div className="relative min-h-[120px] md:min-h-[140px] rounded-2xl bg-[#EAE5DD] overflow-hidden flex items-center justify-center">
            <CornerPlus />
            <GiCrossedSwords className="w-10 h-10 md:w-12 md:h-12 text-black/15" />
          </div>

          <div>
            <GroupLabel text="No Active War" />
            <h2 className="font-black text-2xl md:text-3xl text-black uppercase tracking-tighter leading-none">
              Your guild stands at peace.
            </h2>
          </div>

          {isCaptain && !challengeMode && (
            <Button className={CTA_CLASS} onClick={() => setChallengeMode(true)}>
              <GiBroadsword size={14} /> Initiate Challenge
            </Button>
          )}

          {/* Challenge flow */}
          {isCaptain && challengeMode && (
            <div className="text-left space-y-4 border-t-2 border-black/10 pt-5">
              <GroupLabel text="Select an Opponent" />
              {!opponentsData ? (
                <div className="flex items-center gap-2 py-2">
                  <GiSwordSpin size={14} className="animate-spin text-primary" />
                  <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-black/45 uppercase">Loading eligible opponents…</span>
                </div>
              ) : opponentsData.opponents?.length === 0 ? (
                <div className="rounded-2xl bg-[#EAE5DD]/40 border-2 border-black/10 p-4">
                  <p className="text-sm font-medium text-black/55">
                    No eligible opponents right now.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                  {opponentsData.opponents.map((g: any) => {
                    const selected = selectedOpponent?.id === g.id;
                    return (
                      <button
                        key={g.id}
                        className={cn(
                          "w-full text-left rounded-2xl border-2 p-3.5 flex items-center justify-between transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          selected
                            ? "border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                            : "border-black/10 bg-white hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                        )}
                        onClick={() => setSelectedOpponent(g)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <AvatarStamp
                            name={g.name}
                            avatarUrl={g.avatarUrl}
                            size="sm"
                            className="rounded-lg"
                          />
                          <div className="min-w-0">
                            <div className="font-black text-sm text-black uppercase tracking-tight truncate">{g.name}</div>
                            <p className="text-[9px] font-mono font-bold tracking-[0.15em] text-black/40 uppercase mt-0.5">
                              {(g.guildPerformanceScore || 0).toLocaleString()} GPS · {g.memberCount} MEMBERS
                            </p>
                          </div>
                        </div>
                        <span className={cn(
                          "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                          selected ? "border-black bg-primary" : "border-black/20 bg-white"
                        )}>
                          {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button
                  className={cn(OUTLINE_CLASS, "flex-1")}
                  onClick={() => { setChallengeMode(false); setSelectedOpponent(null); }}
                >
                  Cancel
                </Button>
                <Button
                  className={cn(CTA_CLASS, "flex-1")}
                  disabled={!selectedOpponent || challengeMutation.isPending}
                  onClick={() => selectedOpponent && challengeMutation.mutate(selectedOpponent.id)}
                >
                  {challengeMutation.isPending ? <GiSwordSpin size={12} className="animate-spin" /> : null}
                  Send Challenge
                </Button>
              </div>
            </div>
          )}
        </PremiumCard>
      )}

      {/* ── Active or Pending War ── */}
      {war && (
        <PremiumCard className="p-0 overflow-hidden">
          {/* Header bar — notification top-bar rhythm */}
          <div className="px-5 py-3.5 md:px-6 md:py-4 border-b-2 border-black bg-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn("w-2 h-2 rounded-full shrink-0", war.status === "active" ? "bg-primary animate-pulse" : "bg-black/30")} />
              <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/40 uppercase truncate">Guild War</span>
            </div>
            {statusCfg && (
              <span className={cn("inline-flex items-center gap-1.5 rounded-md font-black uppercase tracking-[0.2em] text-[10px] border-2 px-2.5 py-1 shrink-0", statusCfg.cls)}>
                {statusCfg.label}
              </span>
            )}
          </div>

          <div className="p-5 md:p-6 space-y-5">
            {/* Matchup — tiles + big live scores */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2.5 md:gap-4">
              {/* Challenger */}
              <div className="min-w-0">
                <div
                  className={cn(
                    "relative aspect-square rounded-2xl border-2 overflow-hidden bg-[#EAE5DD]",
                    myGuildIsChallenger ? "border-primary" : "border-black/10"
                  )}
                >
                  {war.status === "active" && war.challengerScore > war.challengedScore && (
                    <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 bg-primary text-white border-2 border-black rounded-md px-2 py-0.5 font-black uppercase tracking-[0.2em] text-[9px] whitespace-nowrap">
                      <GiFlame size={10} /> Winning
                    </span>
                  )}
                  <AvatarStamp
                    name={challengerGuild?.name}
                    avatarUrl={challengerGuild?.avatarUrl}
                    size="lg"
                    className="w-full h-full rounded-none border-0"
                  />
                </div>
                <p className="text-[9px] font-mono font-bold tracking-[0.15em] text-black/40 uppercase mt-2 truncate text-center">{challengerGuild?.name || "Challenger"}</p>
                <p className={cn("font-black text-xl md:text-2xl tabular-nums tracking-tighter text-center leading-none mt-1", myGuildIsChallenger ? "text-primary" : "text-black")}>
                  {(war.challengerScore || 0).toLocaleString()}
                </p>
              </div>

              {/* VS medallion */}
              <div className="flex flex-col items-center justify-center gap-2 pt-1">
                <div className="w-10 h-10 flex items-center justify-center bg-black rounded-xl border-2 border-black">
                  <GiCrossedSwords size={18} className="text-primary" />
                </div>
                <span className="text-[10px] font-black tracking-[0.3em] text-black/50">VS</span>
              </div>

              {/* Challenged */}
              <div className="min-w-0">
                <div
                  className={cn(
                    "relative aspect-square rounded-2xl border-2 overflow-hidden bg-[#EAE5DD]",
                    myGuildIsChallenged ? "border-primary" : "border-black/10"
                  )}
                >
                  {war.status === "active" && war.challengedScore > war.challengerScore && (
                    <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 bg-primary text-white border-2 border-black rounded-md px-2 py-0.5 font-black uppercase tracking-[0.2em] text-[9px] whitespace-nowrap">
                      <GiFlame size={10} /> Winning
                    </span>
                  )}
                  <AvatarStamp
                    name={challengedGuild?.name}
                    avatarUrl={challengedGuild?.avatarUrl}
                    size="lg"
                    className="w-full h-full rounded-none border-0"
                  />
                </div>
                <p className="text-[9px] font-mono font-bold tracking-[0.15em] text-black/40 uppercase mt-2 truncate text-center">{challengedGuild?.name || "Opponent"}</p>
                <p className={cn("font-black text-xl md:text-2xl tabular-nums tracking-tighter text-center leading-none mt-1", myGuildIsChallenged ? "text-primary" : "text-black")}>
                  {(war.challengedScore || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Winner result — completed war */}
            {war.status === "completed" && (
              <div className="rounded-2xl border-2 border-black bg-white p-4 md:p-5 flex items-center gap-3.5">
                <div className="w-11 h-11 bg-primary border-2 border-black rounded-lg flex items-center justify-center shrink-0">
                  <GiLaurelsTrophy size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase">War Result</p>
                  <p className="font-black text-base md:text-lg text-black uppercase tracking-tighter truncate mt-0.5">
                    {war.winnerId
                      ? `${war.winnerId === war.challengerGuildId ? challengerGuild?.name : challengedGuild?.name} wins!`
                      : "The war ended in a draw."}
                  </p>
                  <p className="text-[10px] font-mono font-bold text-black/45 mt-1 uppercase tracking-[0.1em]">
                    {Number(war.prizePkr || 0) > 0
                      ? `Prize ${fmtRs(Number(war.prizePkr))} · Winner's Sunday pool`
                      : war.winnerId
                        ? "No chest was funded during this war."
                        : "Draw — each guild kept its own chest."}
                  </p>
                </div>
              </div>
            )}

            {/* Score battle — dual-segment bar (orange vs black) */}
            {war.status === "active" && (() => {
              const cScore = war.challengerScore || 0;
              const oScore = war.challengedScore || 0;
              const total = cScore + oScore;
              const cShare = total > 0 ? (cScore / total) * 100 : 50;
              return (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/45 uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Score Battle · Live
                    </span>
                    <span className="text-[9px] font-mono font-bold tabular-nums text-black/45">
                      {cShare.toFixed(0)}% · {(100 - cShare).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-white border-2 border-black rounded-full overflow-hidden flex">
                    <div className="bg-primary transition-all duration-700" style={{ width: `${Math.max(4, cShare)}%` }} />
                    <div className="flex-1 bg-black" />
                  </div>
                </div>
              );
            })()}

            {/* War chest — prize pot (active war only) */}
            {war.status === "active" && (() => {
              const chestA = Number(challengerGuild?.warChestPkr ?? 0);
              const chestB = Number(challengedGuild?.warChestPkr ?? 0);
              const totalChest = chestA + chestB;
              const chestShare = totalChest > 0 ? (chestA / totalChest) * 100 : 50;
              const levy = warData?.warLevyPcts;
              return (
                <div className="rounded-2xl bg-white border-2 border-black p-4 md:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/45 uppercase flex items-center gap-1.5">
                      <GiLaurelsTrophy size={12} className="text-primary" />
                      War Chest · The Prize
                    </span>
                  </div>
                  <div className="font-black text-2xl md:text-3xl tabular-nums tracking-tighter text-black leading-none">
                    {fmtRs(totalChest)}
                    <span className="text-[10px] font-mono font-bold tracking-[0.15em] text-black/40 ml-2 align-middle uppercase">Winner takes all</span>
                  </div>
                  <div className="h-2 bg-white border-2 border-black rounded-full overflow-hidden flex">
                    <div className="bg-primary transition-all duration-700" style={{ width: `${Math.max(4, chestShare)}%` }} />
                    <div className="flex-1 bg-black" />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono font-bold uppercase tracking-[0.1em] gap-3 text-black/45">
                    <span className="truncate">{challengerGuild?.name || "Challenger"} · {fmtRs(chestA)}</span>
                    <span className="truncate">{challengedGuild?.name || "Opponent"} · {fmtRs(chestB)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Voting plate — white, orange accent edge */}
            {(war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && isMyGuildVotingPhase && (
              <div className="rounded-2xl border-2 border-black border-l-[3px] border-l-primary bg-white p-4 md:p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-lg bg-black text-white border-2 border-black flex items-center justify-center shrink-0">
                    <GiSpartanHelmet size={16} className="text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-sm text-black uppercase tracking-tight">Member Vote Required</p>
                    <p className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-0.5">All active members must approve</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="shrink-0 leading-none">
                    <span className="font-black text-3xl tabular-nums tracking-tighter text-black">{approvedCount}</span>
                    <span className="font-black text-base tabular-nums text-black/35"> / {totalActiveMembers}</span>
                    <p className="text-[8px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-1">Approvals</p>
                  </div>
                  <Progress
                    value={totalActiveMembers > 0 ? (approvedCount / totalActiveMembers) * 100 : 0}
                    className="h-2.5 bg-black/10 border-2 border-black/10 rounded-full [&>div]:bg-primary flex-1"
                  />
                </div>
                {!myVote && (
                  <div className="flex gap-3">
                    <Button
                      className={cn(CTA_CLASS, "flex-1")}
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate({ warId: war.id, approved: true })}
                    >
                      <GiRoundShield size={14} /> Approve
                    </Button>
                    <Button
                      className={cn(OUTLINE_CLASS, "flex-1 text-destructive border-destructive/40 hover:border-destructive hover:bg-destructive/5")}
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate({ warId: war.id, approved: false })}
                    >
                      <GiSkullCrossedBones size={14} /> Reject
                    </Button>
                  </div>
                )}
                {myVote && (
                  <div
                    className={cn(
                      "py-2.5 text-center font-black text-xs uppercase tracking-wider rounded-full border-2",
                      myVote.approved
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-destructive"
                    )}
                  >
                    {myVote.approved ? "You approved" : "You rejected"}
                  </div>
                )}
              </div>
            )}

            {/* Waiting for other guild to vote */}
            {war.status === "pending_challenged_approval" && myGuildIsChallenger && (
              <div className="rounded-2xl bg-[#EAE5DD]/40 border-2 border-black/10 p-4 flex items-center gap-3">
                <span className="w-9 h-9 bg-white border-2 border-black/10 rounded-lg flex items-center justify-center shrink-0">
                  <GiPocketWatch size={14} className="text-black/45" />
                </span>
                <p className="text-sm font-medium text-black/55">
                  Waiting for <strong className="text-black uppercase tracking-tight">{challengedGuild?.name}</strong> members to vote…
                </p>
              </div>
            )}

            {/* Active war info */}
            {war.status === "active" && (
              <div className="rounded-2xl bg-[#EAE5DD]/40 border-2 border-black/10 p-4 flex items-center gap-3">
                <span className="w-9 h-9 bg-white border-2 border-black/10 rounded-lg flex items-center justify-center shrink-0">
                  <GiPocketWatch size={14} className="text-black/45" />
                </span>
                <p className="text-sm font-medium text-black/55">
                  War started {war.startedAt ? formatDistanceToNow(new Date(war.startedAt), { addSuffix: true }) : "recently"}
                  <span className="text-black/20 mx-2">·</span>
                  Complete your weekly target to win!
                </p>
              </div>
            )}

            {/* Captain: cancel challenge */}
            {isCaptain && (war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && myGuildIsChallenger && (
              <Button
                className={cn(OUTLINE_CLASS, "w-full text-destructive border-destructive/40 hover:border-destructive hover:bg-destructive/5")}
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(war.id)}
              >
                {cancelMutation.isPending ? <GiSwordSpin size={12} className="animate-spin" /> : null}
                Cancel Challenge
              </Button>
            )}
          </div>
        </PremiumCard>
      )}

      {/* ── War rules — notification group-label rhythm ── */}
      <div className="rounded-2xl bg-white border-2 border-black p-4 md:p-5">
        <GroupLabel text="War Rules" />
        <div className="space-y-3">
          {[
            "All members must approve before a war starts",
            "The guild that earns the most points wins",
            "Winner takes BOTH guilds' war chests as the prize — funded from THORX's own revenue cut, never member earnings",
            "On a draw, each guild keeps its own chest; chests return to their own pools",
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md border-2 border-black bg-black text-white font-black text-[10px]">
                {i + 1}
              </span>
              <p className="text-xs md:text-sm font-medium text-black/60 pt-0.5">{rule}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GuildWarsPanel;
