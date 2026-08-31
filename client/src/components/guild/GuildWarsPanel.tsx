/**
 * GuildWarsPanel — THORX v3 (Phase 6, Phase 3 premium redesign)
 * Shows current war status, voting flow, and challenge initiation.
 * Used inside CaptainPortal (full control) and GuildMemberPanel (vote only).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PremiumCard } from "@/components/ui/premium-card";
import { SectionChip, CTA_CLASS, OUTLINE_CLASS, AvatarStamp } from "./GuildPanelShell";
import {
  GiBroadsword, GiPocketWatch, GiRoundShield, GiSkullCrossedBones, GiSwordSpin,
  GiCrossedSwords, GiSpartanHelmet, GiFlame, GiLaurelsTrophy,
} from "./guild-icons";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface GuildWarsPanelProps {
  guildId: string;
  isCaptain?: boolean;
}

// Status chips render on the white card surface — solid white/orange fills
// for live states and a muted treatment for terminal states.
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending_challenger_approval: { label: "PENDING YOUR VOTE",     cls: "bg-white text-black border-black" },
  pending_challenged_approval: { label: "PENDING OPPONENT VOTE", cls: "bg-white text-black border-black" },
  active:                      { label: "WAR ACTIVE",            cls: "bg-black text-white border-black" },
  completed:                   { label: "COMPLETED",             cls: "bg-white text-black/50 border-black/15" },
  cancelled:                   { label: "CANCELLED",             cls: "bg-white text-black/50 border-black/15" },
};

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

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="bg-white border-2 border-black rounded-2xl p-6 flex items-center justify-center gap-2">
          <GiSwordSpin size={16} className="animate-spin text-primary" />
          <span className="text-sm font-medium text-black/55">Loading war status…</span>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <PremiumCard className="p-6 md:p-8 flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-[#EAE5DD] border-2 border-black/10 rounded-xl">
          <GiSpartanHelmet className="w-5 h-5 text-black/50" />
        </div>
        <div>
          <p className="font-bold text-black">Could not load war data</p>
          <p className="text-sm text-black/50 mt-1 font-medium">There was a problem reaching the server.</p>
        </div>
        <button onClick={() => refetchWar()} className={cn(CTA_CLASS, "h-10 px-4 text-[10px]")}>
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
  // Status chip is perspective-aware: "YOUR VOTE" vs "OPPONENT VOTE" depends
  // on which guild the viewer belongs to during the two approval phases.
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

  // Has the current user already voted?
  const myVote = approvals.find((a: any) => a.userId === user?.id);
  const isMyGuildVotingPhase =
    (war?.status === "pending_challenger_approval" && myGuildIsChallenger) ||
    (war?.status === "pending_challenged_approval" && myGuildIsChallenged);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* War badges earned */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((b: any) => (
            <span key={b.id} className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/10 border-2 border-primary/30 text-primary font-black uppercase tracking-wider text-[10px]">
              {b.badgeName}
            </span>
          ))}
        </div>
      )}

      {/* ── No active war ── */}
      {!war && (
        <PremiumCard interactive={false} className="p-6 md:p-8 text-center space-y-5">
          <div className="p-3.5 bg-[#EAE5DD] border-2 border-black rounded-2xl w-fit mx-auto">
            <GiCrossedSwords size={26} className="text-primary" />
          </div>
          <div>
            <SectionChip>NO ACTIVE WAR</SectionChip>
            <p className="font-black text-xl md:text-2xl text-black tracking-tight mt-2">Your guild stands at peace</p>
            <p className="text-sm font-medium text-black/50 mt-1.5">Initiate a challenge to battle for the war chest — the winner takes both guilds' chests.</p>
          </div>

          {isCaptain && !challengeMode && (
            <Button className={CTA_CLASS} onClick={() => setChallengeMode(true)}>
              <GiBroadsword size={14} /> Initiate Challenge
            </Button>
          )}

          {/* Challenge flow */}
          {isCaptain && challengeMode && (
            <div className="text-left space-y-4 border-t-2 border-black/10 pt-5">
              <SectionChip>SELECT AN OPPONENT GUILD</SectionChip>
              {!opponentsData ? (
                <div className="text-sm font-medium text-black/50 flex items-center gap-2">
                  <GiSwordSpin size={14} className="animate-spin text-primary" />
                  Loading eligible opponents…
                </div>
              ) : opponentsData.opponents?.length === 0 ? (
                <PremiumCard interactive={false} className="p-4 bg-[#EAE5DD]/30 border-2 border-black/10">
                  <p className="text-sm font-medium text-black/55">
                    No eligible opponents available. Opponents must be active guilds at your target difficulty and not currently in a war.
                  </p>
                </PremiumCard>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {opponentsData.opponents.map((g: any) => (
                    <button
                      key={g.id}
                      className={cn(
                        "w-full text-left rounded-2xl border-2 p-4 flex items-center justify-between transition-all min-h-[64px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selectedOpponent?.id === g.id
                          ? "border-black bg-primary/5"
                          : "border-black/10 bg-white hover:border-black"
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
                          <div className="font-bold text-sm text-black truncate">{g.name}</div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-0.5">
                            {(g.guildPerformanceScore || 0).toLocaleString()} GPS · {g.memberCount} MEMBERS
                          </p>
                        </div>
                      </div>
                      {selectedOpponent?.id === g.id && (
                        <GiRoundShield size={18} className="text-primary shrink-0" />
                      )}
                    </button>
                  ))}
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
          {/* War header — minimal status bar */}
          <div className="px-5 py-3.5 md:px-6 md:py-4 border-b-2 border-black bg-white">
            <div className="flex items-center justify-end gap-3">
              {statusCfg && (
                <span className={cn("inline-flex items-center gap-1.5 rounded-md font-black uppercase tracking-[0.2em] text-[10px] border-2 px-2.5 py-1", statusCfg.cls)}>
                  {war.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                  {statusCfg.label}
                </span>
              )}
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-5">
            {/* Matchup — premium score battle */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 md:gap-4">
              {/* Challenger — square photo tile */}
              <div
                className={cn(
                  "relative aspect-square rounded-2xl border-2 overflow-hidden bg-[#EAE5DD]",
                  myGuildIsChallenger ? "border-primary" : "border-black/10"
                )}
              >
                {war.status === "active" && war.challengerScore > war.challengedScore && (
                  <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 bg-primary text-white border-2 border-black rounded-md px-2 py-0.5 font-black uppercase tracking-[0.2em] text-[10px] whitespace-nowrap">
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

              {/* VS medallion */}
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 flex items-center justify-center bg-black rounded-xl border-2 border-black">
                  <GiCrossedSwords size={18} className="text-primary" />
                </div>
                <span className="text-xs font-black tracking-[0.3em] text-black/60">VS</span>
              </div>

              {/* Challenged — square photo tile */}
              <div
                className={cn(
                  "relative aspect-square rounded-2xl border-2 overflow-hidden bg-[#EAE5DD]",
                  myGuildIsChallenged ? "border-primary" : "border-black/10"
                )}
              >
                {war.status === "active" && war.challengedScore > war.challengerScore && (
                  <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 bg-primary text-white border-2 border-black rounded-md px-2 py-0.5 font-black uppercase tracking-[0.2em] text-[10px] whitespace-nowrap">
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
            </div>

            {/* Winner result — completed war */}
            {war.status === "completed" && (
              <div className="rounded-2xl border-2 border-black bg-white p-4 md:p-5 flex items-center gap-3.5">
                <div className="p-2.5 bg-primary rounded-lg shrink-0">
                  <GiLaurelsTrophy size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">War Result</p>
                  <p className="font-black text-base md:text-lg text-black tracking-tight truncate">
                    {war.winnerId
                      ? `${war.winnerId === war.challengerGuildId ? challengerGuild?.name : challengedGuild?.name} wins the war!`
                      : "The war ended in a draw."}
                  </p>
                  {Number(war.prizePkr || 0) > 0 ? (
                    <p className="text-xs font-bold text-black/55 mt-1">
                      🏆 Prize: Rs.{Number(war.prizePkr).toLocaleString(undefined, { maximumFractionDigits: 2 })} added to the winner's Sunday pool
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-black/45 mt-1">
                      {war.winnerId ? "No chest was funded during this war." : "Draw — each guild kept its own chest."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Live score battle bar — active war */}
            {war.status === "active" && (() => {
              const cScore = war.challengerScore || 0;
              const oScore = war.challengedScore || 0;
              const total = cScore + oScore;
              const cShare = total > 0 ? (cScore / total) * 100 : 50;
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-black/60">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Score Battle · Live
                    </span>
                    <span className="text-[10px] font-black tabular-nums text-black/50">
                      {cShare.toFixed(0)}% · {(100 - cShare).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-black/10 border-2 border-black rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-700"
                      style={{ width: `${Math.max(6, cShare)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] font-black uppercase tracking-wider">
                    <span className="text-primary">{challengerGuild?.name || "Challenger"}</span>
                    <span className="text-black/50">{challengedGuild?.name || "Opponent"}</span>
                  </div>
                </div>
              );
            })()}

            {/* War chest — the halal prize pot (active war only) */}
            {war.status === "active" && (() => {
              const chestA = Number(challengerGuild?.warChestPkr ?? 0);
              const chestB = Number(challengedGuild?.warChestPkr ?? 0);
              const totalChest = chestA + chestB;
              const chestShare = totalChest > 0 ? (chestA / totalChest) * 100 : 50;
              const levy = warData?.warLevyPcts;
              return (
                <div className="rounded-2xl bg-white border-2 border-black p-4 md:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-black/60">
                      <GiLaurelsTrophy size={12} className="text-primary" />
                      War Chest · The Prize
                    </span>
                    <span className="text-[10px] font-black tabular-nums text-black/50">
                      Rs.{totalChest.toLocaleString(undefined, { maximumFractionDigits: 2 })} total
                    </span>
                  </div>
                  <div className="h-2.5 bg-black/10 border-2 border-black rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-700"
                      style={{ width: `${Math.max(4, chestShare)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider gap-3">
                    <span className="text-primary truncate">{challengerGuild?.name || "Challenger"} · Rs.{chestA.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="text-black/50 truncate">{challengedGuild?.name || "Opponent"} · Rs.{chestB.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-black/40 leading-relaxed">
                    Winner takes BOTH chests. Funded from THORX's own revenue cut
                    {levy ? ` (${levy.engineA}% Engine A · ${levy.engineB}% Engine B · ${levy.engineC}% Engine C)` : ""} — never from member earnings.
                  </p>
                </div>
              );
            })()}

            {/* Voting section — premium approval plate */}
            {(war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && isMyGuildVotingPhase && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 md:p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-primary/10 border-2 border-primary/30 rounded-lg shrink-0">
                    <GiSpartanHelmet size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-black uppercase tracking-tight">Member Vote Required</p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-black/45 mt-0.5">All active members must approve</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-black/45">
                    <span>Approvals</span>
                    <span className="font-bold text-black tabular-nums">{approvedCount} / {totalActiveMembers}</span>
                  </div>
                  <Progress
                    value={totalActiveMembers > 0 ? (approvedCount / totalActiveMembers) * 100 : 0}
                    className="h-2.5 bg-black/10 border-2 border-black/10 rounded-full [&>div]:bg-primary"
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
                      "py-3 text-center font-bold text-sm rounded-xl border-2",
                      myVote.approved
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {myVote.approved
                      ? <span className="flex items-center justify-center gap-2"><GiRoundShield size={14} /> You approved</span>
                      : <span className="flex items-center justify-center gap-2"><GiSkullCrossedBones size={14} /> You rejected</span>}
                  </div>
                )}
              </div>
            )}

            {/* Waiting for other guild to vote */}
            {war.status === "pending_challenged_approval" && myGuildIsChallenger && (
              <div className="rounded-2xl bg-[#EAE5DD]/40 border-2 border-black/10 p-4 flex items-center gap-3">
                <div className="p-2 bg-white border-2 border-black/10 rounded-lg shrink-0">
                  <GiPocketWatch size={14} className="text-black/45" />
                </div>
                <p className="text-sm font-medium text-black/55">
                  Waiting for <strong className="text-black">{challengedGuild?.name}</strong> members to vote…
                </p>
              </div>
            )}

            {/* Active war info */}
            {war.status === "active" && (
              <div className="rounded-2xl bg-[#EAE5DD]/40 border-2 border-black/10 p-4 flex items-center gap-3">
                <div className="p-2 bg-white border-2 border-black/10 rounded-lg shrink-0">
                  <GiPocketWatch size={14} className="text-black/45" />
                </div>
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

      {/* War rules — numbered, premium */}
      <div className="rounded-2xl bg-white border-2 border-black/10 p-4 md:p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <SectionChip>WAR RULES</SectionChip>
        </div>
        <div className="space-y-3">
          {          [
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
