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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PremiumCard } from "@/components/ui/premium-card";
import TechnicalLabel from "@/components/ui/technical-label";
import {
  Sword, Shield, Trophy, Clock, CheckCircle, XCircle, Loader2,
  Swords, AlertTriangle, Crown, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface GuildWarsPanelProps {
  guildId: string;
  isCaptain?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "outline" | "default" | "secondary" | "destructive" }> = {
  pending_challenger_approval: { label: "PENDING YOUR VOTE",     variant: "outline" },
  pending_challenged_approval: { label: "PENDING OPPONENT VOTE", variant: "outline" },
  active:                      { label: "WAR ACTIVE",            variant: "destructive" },
  completed:                   { label: "COMPLETED",             variant: "secondary" },
  cancelled:                   { label: "CANCELLED",             variant: "secondary" },
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
        <div className="bg-white border-2 border-black rounded-2xl p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-primary" />
          <span className="text-sm font-medium">Loading war status…</span>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <PremiumCard className="p-6 md:p-8 flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <p className="font-bold text-foreground">Could not load war data</p>
          <p className="text-sm text-muted-foreground mt-1">There was a problem reaching the server.</p>
        </div>
        <button
          onClick={() => refetchWar()}
          className="text-red-500 text-sm font-bold uppercase tracking-wider hover:underline"
        >
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
  const statusCfg = war ? (STATUS_CONFIG[war.status] ?? null) : null;

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
            <Badge key={b.id} variant="outline" className="text-xs font-bold border-primary/30 text-primary bg-primary/5">
              {b.badgeName}
            </Badge>
          ))}
        </div>
      )}

      {/* ── No active war ── */}
      {!war && (
        <PremiumCard className="p-6 md:p-8 text-center space-y-5">
          <div className="p-4 bg-muted rounded-2xl w-fit mx-auto">
            <Swords size={28} className="text-muted-foreground" />
          </div>
          <div>
            <TechnicalLabel text="No Active War" className="text-foreground mb-1" />
            <p className="text-sm text-muted-foreground">Your guild is not currently engaged in any war.</p>
          </div>

          {isCaptain && !challengeMode && (
            <Button
              variant="destructive"
              className="min-h-[44px]"
              onClick={() => setChallengeMode(true)}
            >
              <Sword size={14} className="mr-2" /> Initiate Challenge
            </Button>
          )}

          {/* Challenge flow */}
          {isCaptain && challengeMode && (
            <div className="text-left space-y-4 border-t-2 border-black/10 pt-5">
              <TechnicalLabel text="Select an Opponent Guild" className="text-foreground" />
              {!opponentsData ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  Loading eligible opponents…
                </div>
              ) : opponentsData.opponents?.length === 0 ? (
                <PremiumCard interactive={false} className="p-4 bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    No eligible opponents available. Opponents must be active guilds not currently in a war.
                  </p>
                </PremiumCard>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {opponentsData.opponents.map((g: any) => (
                    <button
                      key={g.id}
                      className={cn(
                        "w-full text-left rounded-2xl border-2 p-4 flex items-center justify-between transition-all min-h-[64px]",
                        selectedOpponent?.id === g.id
                          ? "border-black bg-primary/5"
                          : "border-black/10 bg-white hover:border-black/30"
                      )}
                      onClick={() => setSelectedOpponent(g)}
                    >
                      <div>
                        <div className="font-bold text-sm text-foreground">{g.name}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(g.guildPerformanceScore || 0).toLocaleString()} GPS · {g.memberCount}/{g.memberCapacity} members
                        </p>
                      </div>
                      {selectedOpponent?.id === g.id && (
                        <CheckCircle size={18} className="text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 min-h-[44px]"
                  onClick={() => { setChallengeMode(false); setSelectedOpponent(null); }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 min-h-[44px]"
                  disabled={!selectedOpponent || challengeMutation.isPending}
                  onClick={() => selectedOpponent && challengeMutation.mutate(selectedOpponent.id)}
                >
                  {challengeMutation.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : null}
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
          {/* War header */}
          <div className="px-5 py-4 border-b-2 border-black flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                <Swords size={16} className="text-primary" />
              </div>
              <TechnicalLabel text="Guild War" className="text-foreground" />
            </div>
            {statusCfg && (
              <Badge variant={statusCfg.variant} className="font-bold text-xs tracking-wider">
                {statusCfg.label}
              </Badge>
            )}
          </div>

          <div className="p-5 md:p-6 space-y-5">
            {/* Matchup */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Challenger */}
              <PremiumCard
                interactive={false}
                className={cn(
                  "p-4 text-center",
                  myGuildIsChallenger ? "border-primary bg-primary/5" : "border-black/20"
                )}
              >
                <TechnicalLabel
                  text={myGuildIsChallenger ? "Your Guild" : "Challenger"}
                  className={cn("mb-2", myGuildIsChallenger ? "text-primary" : "text-muted-foreground")}
                />
                <p className="font-black text-sm text-foreground truncate">{challengerGuild?.name ?? "Unknown"}</p>
                {war.status === "active" && (
                  <p className="text-2xl md:text-3xl font-black tracking-tighter text-foreground mt-2">
                    {(war.challengerScore || 0).toLocaleString()}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {(challengerGuild?.guildPerformanceScore || 0).toLocaleString()} GPS
                </p>
              </PremiumCard>

              {/* VS */}
              <div className="flex flex-col items-center gap-1">
                <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                  <Swords size={16} className="text-primary" />
                </div>
                <span className="text-xs font-black text-muted-foreground">VS</span>
              </div>

              {/* Challenged */}
              <PremiumCard
                interactive={false}
                className={cn(
                  "p-4 text-center",
                  myGuildIsChallenged ? "border-primary bg-primary/5" : "border-black/20"
                )}
              >
                <TechnicalLabel
                  text={myGuildIsChallenged ? "Your Guild" : "Opponent"}
                  className={cn("mb-2", myGuildIsChallenged ? "text-primary" : "text-muted-foreground")}
                />
                <p className="font-black text-sm text-foreground truncate">{challengedGuild?.name ?? "Unknown"}</p>
                {war.status === "active" && (
                  <p className="text-2xl md:text-3xl font-black tracking-tighter text-foreground mt-2">
                    {(war.challengedScore || 0).toLocaleString()}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {(challengedGuild?.guildPerformanceScore || 0).toLocaleString()} GPS
                </p>
              </PremiumCard>
            </div>

            {/* Voting section */}
            {(war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && isMyGuildVotingPhase && (
              <PremiumCard interactive={false} className="bg-primary/5 border-primary/30 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-primary" />
                  <TechnicalLabel text="Member Vote Required" className="text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">
                  All active members must approve for the war to proceed.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Approvals</span>
                    <span className="font-bold text-foreground">{approvedCount} / {totalActiveMembers}</span>
                  </div>
                  <Progress
                    value={totalActiveMembers > 0 ? (approvedCount / totalActiveMembers) * 100 : 0}
                    className="h-2 border border-black/15"
                  />
                </div>
                {!myVote && (
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate({ warId: war.id, approved: true })}
                    >
                      <CheckCircle size={14} className="mr-2" /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 min-h-[44px] text-destructive border-destructive/30 hover:bg-destructive/5"
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate({ warId: war.id, approved: false })}
                    >
                      <XCircle size={14} className="mr-2" /> Reject
                    </Button>
                  </div>
                )}
                {myVote && (
                  <PremiumCard
                    interactive={false}
                    className={cn(
                      "py-3 text-center font-bold text-sm",
                      myVote.approved
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-destructive/30 bg-destructive/5 text-destructive"
                    )}
                  >
                    {myVote.approved
                      ? <span className="flex items-center justify-center gap-2"><CheckCircle size={14} /> You approved</span>
                      : <span className="flex items-center justify-center gap-2"><XCircle size={14} /> You rejected</span>}
                  </PremiumCard>
                )}
              </PremiumCard>
            )}

            {/* Waiting for other guild to vote */}
            {war.status === "pending_challenged_approval" && myGuildIsChallenger && (
              <PremiumCard interactive={false} className="bg-muted/50 border-black/20 p-4 flex items-center gap-3">
                <Clock size={14} className="text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Waiting for <strong className="text-foreground">{challengedGuild?.name}</strong> members to vote…
                </p>
              </PremiumCard>
            )}

            {/* Active war info */}
            {war.status === "active" && (
              <PremiumCard interactive={false} className="bg-muted/30 border-black/10 p-4 flex items-center gap-3">
                <Clock size={14} className="text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  War started {war.startedAt ? formatDistanceToNow(new Date(war.startedAt), { addSuffix: true }) : "recently"}
                  <span className="text-black/20 mx-2">·</span>
                  Complete your weekly target to win!
                </p>
              </PremiumCard>
            )}

            {/* Captain: cancel challenge */}
            {isCaptain && (war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && myGuildIsChallenger && (
              <Button
                variant="outline"
                className="w-full min-h-[44px] text-destructive border-destructive/30 hover:bg-destructive/5"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(war.id)}
              >
                {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : null}
                Cancel Challenge
              </Button>
            )}
          </div>
        </PremiumCard>
      )}

      {/* War rules */}
      <PremiumCard interactive={false} className="p-4 md:p-5 bg-muted/30 border-black/15">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
            <Shield size={13} className="text-primary" />
          </div>
          <TechnicalLabel text="War Rules" className="text-foreground" />
        </div>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>• All members must approve before a war starts</li>
          <li>• The guild that earns the most weekly points wins</li>
          <li>• Winner gets both guilds' weekly bonus pools on Sunday</li>
          <li>• If neither completes the weekly target, both keep their own pools</li>
        </ul>
      </PremiumCard>
    </div>
  );
}

export default GuildWarsPanel;
