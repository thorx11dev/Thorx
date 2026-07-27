/**
 * GuildMemberPanel — THORX v3 (spec F.7)
 * Default Engine C view for guild members (guildRole='member').
 * Tabs: Weekly Progress | Engine C Tasks | Guild Chat | Captain Channel
 * NEVER shows "Vault", "Locked Points", or PKR pool amounts to users.
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RankBadge } from "@/components/RankBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, Clock, MessageCircle, Megaphone, Star, Send, Users, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Tab = "progress" | "tasks" | "chat" | "dm";

function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Resetting…"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${d}d ${h}h ${m}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [targetDate]);
  return <span>{timeLeft}</span>;
}

export function GuildMemberPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("progress");
  const [chatMsg, setChatMsg] = useState("");
  const [dmMsg, setDmMsg] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const guildId = user?.guildId;

  // Membership + guild info
  const { data: membership } = useQuery<any>({
    queryKey: QUERY_KEYS.guildMine,
    queryFn: async () => { const r = await apiRequest("GET", "/api/guilds/mine"); const d = await r.json(); return d.membership; },
    enabled: !!guildId,
  });

  const { data: guild } = useQuery<any>({
    queryKey: guildId ? QUERY_KEYS.guildDetail(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}`); const d = await r.json(); return d.guild; },
    enabled: !!guildId,
    refetchInterval: 30000,
  });

  // Guild members (for contribution leaderboard)
  const { data: members = [] } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildMembers(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!guildId,
    refetchInterval: 30000,
  });

  // Weekly tasks
  const { data: weeklyTasks = [] } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildTasks(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/weekly-tasks`); const d = await r.json(); return Array.isArray(d) ? d : (d.weeklyTasks ?? []); },
    enabled: !!guildId,
  });

  // Group chat
  const { data: chatMessages = [] } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildChat(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/chat`); const d = await r.json(); return d.messages ?? d ?? []; },
    enabled: !!guildId && tab === "chat",
    refetchInterval: 30000, // WS push (engine_c:message) handles real-time; poll as fallback (audit fix Z)
  });

  // Captain DM
  const { data: dmMessages = [] } = useQuery<any[]>({
    queryKey: guildId && guild?.captainId ? QUERY_KEYS.guildDm(guildId, guild.captainId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/dm/${guild?.captainId}`); const d = await r.json(); return d.messages ?? []; },
    enabled: !!guildId && !!guild?.captainId && tab === "dm",
    refetchInterval: 30000, // WS push handles real-time; 30s fallback poll
  });

  // Guild weekly performance history (last 8 cycles)
  const { data: weeklyHistory = [] } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildWeeklyHistory(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/weekly-history`); const d = await r.json(); return d.history ?? d.snapshots ?? []; },
    enabled: !!guildId && tab === "progress",
    staleTime: 60000,
  });

  const sendChatMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/chat`, { message });
      return r.json();
    },
    // Optimistic update — append message immediately so the chat doesn't flash
    // on refetch. Rolls back on error so the user's text isn't silently lost.
    onMutate: async (message: string) => {
      const chatKey = guildId ? QUERY_KEYS.guildChat(guildId) : [];
      await queryClient.cancelQueries({ queryKey: chatKey });
      const prev = queryClient.getQueryData<any[]>(chatKey);
      queryClient.setQueryData(chatKey, (old: any[] = []) => [
        ...old,
        { message, senderId: user?.id, senderName: user?.firstName, createdAt: new Date().toISOString(), _optimistic: true },
      ]);
      setChatMsg("");
      return { prev };
    },
    onError: (_err: any, _msg: string, context: any) => {
      if (context?.prev !== undefined) {
        const chatKey = guildId ? QUERY_KEYS.guildChat(guildId) : [];
        queryClient.setQueryData(chatKey, context.prev);
      }
      toast({ title: "Message not sent", description: "Could not deliver your message. Please try again.", variant: "destructive" });
    },
    onSuccess: () => {
      if (guildId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildChat(guildId) });
    },
  });

  const sendDmMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/dm/${guild?.captainId}`, { message });
      return r.json();
    },
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/guilds", guildId, "dm", guild?.captainId] });
      const prev = queryClient.getQueryData<any[]>(["/api/guilds", guildId, "dm", guild?.captainId]);
      queryClient.setQueryData(["/api/guilds", guildId, "dm", guild?.captainId], (old: any[] = []) => [
        ...old,
        { message, fromUserId: user?.id, createdAt: new Date().toISOString(), _optimistic: true },
      ]);
      setDmMsg("");
      return { prev };
    },
    onError: (_err: any, _msg: string, context: any) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(["/api/guilds", guildId, "dm", guild?.captainId], context.prev);
      }
      toast({ title: "Message not sent", description: "Could not reach the captain. Please try again.", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "dm", guild?.captainId] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const r = await apiRequest("POST", `/api/guilds/weekly-tasks/${taskId}/complete`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Task Completed!", description: "Points and PS awarded." });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "tasks"] });
      // Refresh guild header + progress bar so weekly contribution updates immediately
      // (audit finding BB — these were previously missing causing stale progress display).
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds/mine"] });
      queryClient.invalidateQueries({ queryKey: ["earnings"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Could not complete task.", variant: "destructive" });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  if (!guildId || !guild) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const nextSunday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7);
    d.setHours(23, 59, 0, 0);
    return d;
  })();

  const weeklyProgress = guild.weeklyTarget > 0
    ? Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100) : 0;

  const sortedMembers = [...members].sort((a, b) => (b.weeklyPointsContributed || 0) - (a.weeklyPointsContributed || 0));
  const myContrib = members.find(m => m.userId === user?.id)?.weeklyPointsContributed ?? 0;
  const myRank = sortedMembers.findIndex(m => m.userId === user?.id) + 1;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "progress", label: "Progress",   icon: <Target size={14} /> },
    { id: "tasks",    label: "Tasks",      icon: <Zap size={14} /> },
    { id: "chat",     label: "Guild Chat", icon: <Users size={14} /> },
    { id: "dm",       label: "Captain DM", icon: <MessageCircle size={14} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Captain announcement banner — shown whenever the captain has posted one */}
      {guild.latestAnnouncement && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <Megaphone size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-700 mb-0.5">Captain Announcement</div>
            <div className="text-xs text-amber-800 break-words">{guild.latestAnnouncement}</div>
            {guild.announcementPostedAt && (
              <div className="text-[10px] text-amber-500 mt-0.5">
                {formatDistanceToNow(new Date(guild.announcementPostedAt), { addSuffix: true })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guild Header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg">{guild.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <RankBadge rank={guild.guildRankTier || "E-Rank"} size="sm" />
              <span className="text-xs text-zinc-500">{members.filter((m: any) => m.status === "active").length}/{guild.memberCapacity} members</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-400">GPS</div>
            <div className="font-bold text-zinc-700">{(guild.guildPerformanceScore || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-all",
              tab === t.id ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "progress" && (
        <div className="space-y-4">
          {/* Weekly Target */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Guild Weekly Target</h3>
              <span className="text-xs text-zinc-400 flex items-center gap-1"><Clock size={10} /> <CountdownTimer targetDate={nextSunday} /></span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{(guild.currentWeeklyPoints || 0).toLocaleString()} pts</span>
                <span>{(guild.weeklyTarget || 0).toLocaleString()} pts</span>
              </div>
              <Progress value={weeklyProgress} className="h-3" />
              <div className="text-xs font-semibold text-right">{weeklyProgress.toFixed(0)}%</div>
            </div>
            <p className={cn("text-xs", weeklyProgress >= 100 ? "text-emerald-600" : "text-zinc-500")}>
              {weeklyProgress >= 100
                ? "🎉 Target hit! Sunday bonus pool unlocking."
                : weeklyProgress >= 70
                ? "⏳ Keep going! Almost at Sunday bonus."
                : "🚀 In Progress — keep earning to unlock Sunday bonus."}
            </p>
          </div>

          {/* My contribution */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3">My Contribution This Week</h3>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-black">{myContrib.toLocaleString()}<span className="text-sm font-normal text-zinc-400 ml-1">pts</span></span>
              {myRank > 0 && <Badge variant="outline">#{myRank} in guild</Badge>}
            </div>
          </div>

          {/* Team leaderboard */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3">Team Leaderboard (This Week)</h3>
            <div className="space-y-2">
              {sortedMembers.slice(0, 10).map((m, i) => (
                <div key={m.userId} className={cn("flex items-center justify-between py-1.5 px-2 rounded-lg", m.userId === user?.id ? "bg-zinc-50 border border-zinc-200" : "")}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-5">#{i + 1}</span>
                    {m.isMvp && <Star size={12} className="text-yellow-500 fill-yellow-500" />}
                    <span className="text-sm font-medium">{m.userId === user?.id ? "You" : (m.firstName || m.identity || "Member")}</span>
                  </div>
                  <span className="text-sm font-bold">{(m.weeklyPointsContributed || 0).toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Guild performance history — last 8 cycles */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3">Guild History (Last 8 Cycles)</h3>
            {weeklyHistory.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-4">No completed cycles yet — results appear every Sunday.</p>
            ) : (
              <div className="space-y-2">
                {weeklyHistory.slice(0, 8).map((snap: any, i: number) => {
                  const pct = snap.targetPoints > 0 ? Math.min(150, (snap.achievedPoints / snap.targetPoints) * 100) : 0;
                  return (
                    <div key={snap.id ?? i} className="flex items-center gap-3">
                      <span className={cn("w-3.5 h-3.5 rounded-full shrink-0", snap.wasSuccessful ? "bg-emerald-500" : "bg-red-400")} />
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
                          <span>Cycle {weeklyHistory.length - i}</span>
                          <span>{(snap.achievedPoints ?? 0).toLocaleString()} / {(snap.targetPoints ?? 0).toLocaleString()} pts ({pct.toFixed(0)}%)</span>
                        </div>
                        <Progress value={Math.min(100, pct)} className="h-1.5" />
                      </div>
                      <span className="text-xs shrink-0">{snap.wasSuccessful ? "✅" : "❌"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-3">
          {weeklyTasks.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">No guild tasks available this week.</div>
          ) : (
            weeklyTasks.map((task: any) => (
              <div key={task.id} className="rounded-xl border border-zinc-200 bg-white p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{task.title}</span>
                    {task.taskCategory === "indirect" && (
                      <Badge variant="outline" className="text-[10px]">+15 PS</Badge>
                    )}
                  </div>
                  {task.description && <p className="text-xs text-zinc-500 mt-0.5">{task.description}</p>}
                  {task.txPointsReward > 0 && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">
                      ~{task.txPointsReward}–{task.txPointsRewardMax} pts
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={completeTaskMutation.isPending}
                  onClick={() => completeTaskMutation.mutate(task.id)}
                >
                  Complete
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "chat" && (
        <div className="rounded-xl border border-zinc-200 bg-white flex flex-col h-[400px] max-h-[60vh] min-h-[200px]">
          <div className="p-3 border-b border-zinc-100 font-semibold text-sm">Guild Chat</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.map((msg: any, i) => (
              <div key={i} className={cn("flex", msg.senderId === user?.id ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", msg.senderId === user?.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800")}>
                  {msg.senderId !== user?.id && <div className="text-[10px] font-semibold text-zinc-400 mb-0.5">{msg.senderName || "Member"}</div>}
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-zinc-100 flex gap-2">
            <Input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              placeholder="Send a message…"
              className="flex-1 h-8 text-sm"
              maxLength={500}
              onKeyDown={e => { if (e.key === "Enter" && chatMsg.trim() && chatMsg.length <= 500) sendChatMutation.mutate(chatMsg.trim()); }}
            />
            <Button size="sm" className="h-8 w-8 p-0" aria-label="Send message" disabled={!chatMsg.trim() || chatMsg.length > 500 || sendChatMutation.isPending} onClick={() => sendChatMutation.mutate(chatMsg.trim())}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      )}

      {tab === "dm" && (
        <div className="rounded-xl border border-zinc-200 bg-white flex flex-col h-[400px] max-h-[60vh] min-h-[200px]">
          <div className="p-3 border-b border-zinc-100 font-semibold text-sm flex items-center gap-2">
            <MessageCircle size={14} />
            Captain Channel
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {dmMessages.length === 0 && (
              <div className="text-center py-8 text-zinc-400 text-sm">No messages yet. Say hello to the captain!</div>
            )}
            {dmMessages.map((msg: any, i) => (
              <div key={i} className={cn("flex", msg.fromUserId === user?.id ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", msg.fromUserId === user?.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800")}>
                  {msg.message}
                  <div className="text-[10px] mt-0.5 opacity-50">{msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : ""}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-zinc-100 flex gap-2">
            <Input
              value={dmMsg}
              onChange={e => setDmMsg(e.target.value)}
              placeholder="Message captain…"
              className="flex-1 h-8 text-sm"
              maxLength={500}
              onKeyDown={e => { if (e.key === "Enter" && dmMsg.trim() && dmMsg.length <= 500) sendDmMutation.mutate(dmMsg.trim()); }}
            />
            <Button size="sm" className="h-8 w-8 p-0" aria-label="Send message to captain" disabled={!dmMsg.trim() || dmMsg.length > 500 || sendDmMutation.isPending} onClick={() => sendDmMutation.mutate(dmMsg.trim())}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuildMemberPanel;
