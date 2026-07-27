/**
 * GuildWarsPanel — THORX v3 (Phase 6)
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
import { Sword, Shield, Trophy, Clock, CheckCircle, XCircle, Loader2, Swords, AlertTriangle, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface GuildWarsPanelProps {
  guildId: string;
  isCaptain?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_challenger_approval: { label: "Waiting: Your Guild to Vote", color: "bg-amber-100 text-amber-700 border-amber-200" },
  pending_challenged_approval: { label: "Waiting: Opponent to Vote", color: "bg-blue-100 text-blue-700 border-blue-200" },
  active: { label: "⚔️ WAR ACTIVE", color: "bg-red-100 text-red-700 border-red-200" },
  completed: { label: "Completed", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  cancelled: { label: "Cancelled", color: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export function GuildWarsPanel({ guildId, isCaptain = false }: GuildWarsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [challengeMode, setChallengeMode] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState<any>(null);

  const { data: warData, isLoading } = useQuery<any>({
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
        toast({ title: "⚔️ War Started!", description: "The battle is on! Earn points to win." });
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

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 flex items-center justify-center gap-2 text-zinc-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading war status…</span>
      </div>
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
  const statusInfo = war ? STATUS_LABELS[war.status] : null;

  // Has the current user already voted?
  const myVote = approvals.find((a: any) => a.userId === user?.id);
  const isMyGuildVotingPhase =
    (war?.status === "pending_challenger_approval" && myGuildIsChallenger) ||
    (war?.status === "pending_challenged_approval" && myGuildIsChallenged);

  return (
    <div className="space-y-4">
      {/* Badges row */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((b: any) => (
            <Badge key={b.id} variant="outline" className="text-xs font-semibold border-amber-300 text-amber-700 bg-amber-50">
              {b.badgeName}
            </Badge>
          ))}
        </div>
      )}

      {/* No active war */}
      {!war && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
            <Swords size={22} className="text-zinc-400" />
          </div>
          <div>
            <div className="font-bold text-zinc-700">No Active War</div>
            <p className="text-xs text-zinc-500 mt-1">Your guild is not currently engaged in any war.</p>
          </div>

          {isCaptain && !challengeMode && (
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setChallengeMode(true)}>
              <Sword size={14} className="mr-1.5" /> Initiate Challenge
            </Button>
          )}

          {/* Challenge flow */}
          {isCaptain && challengeMode && (
            <div className="text-left space-y-3 border-t border-zinc-100 pt-4">
              <div className="text-sm font-semibold text-zinc-700">Select an opponent guild:</div>
              {!opponentsData ? (
                <div className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading eligible opponents…</div>
              ) : opponentsData.opponents?.length === 0 ? (
                <div className="text-xs text-zinc-500 bg-zinc-50 rounded-lg p-3">No eligible opponents available. Opponents must be active guilds not currently in a war.</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {opponentsData.opponents.map((g: any) => (
                    <button
                      key={g.id}
                      className={cn(
                        "w-full text-left rounded-lg border p-3 flex items-center justify-between transition-colors",
                        selectedOpponent?.id === g.id
                          ? "border-red-300 bg-red-50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                      onClick={() => setSelectedOpponent(g)}
                    >
                      <div>
                        <div className="font-semibold text-sm">{g.name}</div>
                        <div className="text-xs text-zinc-400">{(g.guildPerformanceScore || 0).toLocaleString()} GPS · {g.memberCount}/{g.memberCapacity} members</div>
                      </div>
                      {selectedOpponent?.id === g.id && <CheckCircle size={16} className="text-red-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setChallengeMode(false); setSelectedOpponent(null); }}>Cancel</Button>
                <Button
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  disabled={!selectedOpponent || challengeMutation.isPending}
                  onClick={() => selectedOpponent && challengeMutation.mutate(selectedOpponent.id)}
                >
                  {challengeMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Send Challenge
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active or pending war */}
      {war && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          {/* War header */}
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sword size={16} className="text-red-500" />
              <span className="font-bold text-sm">Guild War</span>
            </div>
            {statusInfo && (
              <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>{statusInfo.label}</Badge>
            )}
          </div>

          {/* Matchup */}
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              {/* Challenger */}
              <div className={cn("flex-1 rounded-lg p-3 text-center border", myGuildIsChallenger ? "border-zinc-900 bg-zinc-50" : "border-zinc-200")}>
                <div className="text-xs text-zinc-400 mb-0.5">{myGuildIsChallenger ? "Your Guild" : "Challenger"}</div>
                <div className="font-bold text-sm truncate">{challengerGuild?.name ?? "Unknown"}</div>
                {war.status === "active" && (
                  <div className="text-2xl font-black mt-1">{(war.challengerScore || 0).toLocaleString()}</div>
                )}
                <div className="text-xs text-zinc-400">{(challengerGuild?.guildPerformanceScore || 0).toLocaleString()} GPS</div>
              </div>

              <div className="font-black text-zinc-400 text-lg">⚔️</div>

              {/* Challenged */}
              <div className={cn("flex-1 rounded-lg p-3 text-center border", myGuildIsChallenged ? "border-zinc-900 bg-zinc-50" : "border-zinc-200")}>
                <div className="text-xs text-zinc-400 mb-0.5">{myGuildIsChallenged ? "Your Guild" : "Opponent"}</div>
                <div className="font-bold text-sm truncate">{challengedGuild?.name ?? "Unknown"}</div>
                {war.status === "active" && (
                  <div className="text-2xl font-black mt-1">{(war.challengedScore || 0).toLocaleString()}</div>
                )}
                <div className="text-xs text-zinc-400">{(challengedGuild?.guildPerformanceScore || 0).toLocaleString()} GPS</div>
              </div>
            </div>

            {/* Voting progress */}
            {(war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && isMyGuildVotingPhase && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
                <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Member Vote Required
                </div>
                <div className="text-xs text-amber-600">
                  All active members must approve for the war to proceed.
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>Approved</span>
                    <span>{approvedCount} / {totalActiveMembers}</span>
                  </div>
                  <Progress value={totalActiveMembers > 0 ? (approvedCount / totalActiveMembers) * 100 : 0} className="h-1.5" />
                </div>
                {!myVote && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate({ warId: war.id, approved: true })}
                    >
                      <CheckCircle size={12} className="mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-8"
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate({ warId: war.id, approved: false })}
                    >
                      <XCircle size={12} className="mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {myVote && (
                  <div className={cn("text-xs font-semibold text-center py-1.5 rounded-lg", myVote.approved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                    {myVote.approved ? "✅ You approved" : "❌ You rejected"}
                  </div>
                )}
              </div>
            )}

            {/* Waiting for other guild to vote */}
            {war.status === "pending_challenged_approval" && myGuildIsChallenger && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 flex items-center gap-2">
                <Clock size={12} />
                Waiting for <strong>{challengedGuild?.name}</strong> members to vote…
              </div>
            )}

            {/* Active war info */}
            {war.status === "active" && (
              <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                <Clock size={12} />
                War started {war.startedAt ? formatDistanceToNow(new Date(war.startedAt), { addSuffix: true }) : "recently"}
                <span className="text-zinc-300 mx-1">·</span>
                <span>Complete your weekly target to win!</span>
              </div>
            )}

            {/* Captain actions */}
            {isCaptain && (war.status === "pending_challenger_approval" || war.status === "pending_challenged_approval") && myGuildIsChallenger && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(war.id)}
              >
                {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                Cancel Challenge
              </Button>
            )}
          </div>
        </div>
      )}

      {/* War rules info */}
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-500 space-y-1">
        <div className="font-semibold text-zinc-600 mb-1.5">⚔️ War Rules</div>
        <div>• All members must approve before a war starts</div>
        <div>• The guild that earns the most weekly points wins</div>
        <div>• Winner gets both guilds' weekly bonus pools on Sunday</div>
        <div>• If neither completes the weekly target, both keep their own pools</div>
      </div>
    </div>
  );
}

export default GuildWarsPanel;
