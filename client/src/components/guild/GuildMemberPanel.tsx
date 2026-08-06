/**
 * GuildMemberPanel — THORX v3 (spec F.7, Phase 3 premium redesign)
 * Default Engine C view for guild members (guildRole='member').
 * Tabs: Weekly Progress | Engine C Tasks | Guild Chat | Private Chat | Wars | My Profile
 * Private Chat: member-to-member DM (Phase 4.4 — any member can DM any other member).
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
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumCard } from "@/components/ui/premium-card";
import TechnicalLabel from "@/components/ui/technical-label";
import {
  Trophy, Target, Clock, MessageCircle, Megaphone, Star, Send,
  Users, Zap, Swords, ArrowLeft, Crown, CheckCircle, XCircle, Flame,
  AlertCircle,
} from "lucide-react";
import { GuildWarsPanel } from "./GuildWarsPanel";
import { GuildProfileWizard } from "./GuildProfileWizard";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Tab = "progress" | "tasks" | "chat" | "dm" | "wars" | "profile";

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
  const [selectedDmMemberId, setSelectedDmMemberId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);

  const guildId = user?.guildId;

  // Membership + guild info
  const { data: membership } = useQuery<any>({
    queryKey: QUERY_KEYS.guildMine,
    queryFn: async () => { const r = await apiRequest("GET", "/api/guilds/mine"); const d = await r.json(); return d.membership; },
    enabled: !!guildId,
  });

  const {
    data: guild,
    isLoading: isGuildLoading,
    isError: isGuildError,
    refetch: refetchGuild,
  } = useQuery<any>({
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

  // Private Chat — member-to-member (Phase 4.4)
  const { data: dmMessages = [] } = useQuery<any[]>({
    queryKey: guildId && selectedDmMemberId ? ["guild", guildId, "private-chat", selectedDmMemberId] : [],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${guildId}/private-chat/${selectedDmMemberId}`);
      const d = await r.json();
      return d.messages ?? [];
    },
    enabled: !!guildId && !!selectedDmMemberId && tab === "dm",
    refetchInterval: 30000,
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
      if (!selectedDmMemberId) throw new Error("No member selected");
      const r = await apiRequest("POST", `/api/guilds/${guildId}/private-chat/${selectedDmMemberId}`, { message });
      if (!r.ok) throw await r.json();
      return r.json();
    },
    onMutate: async (message: string) => {
      const key = ["guild", guildId, "private-chat", selectedDmMemberId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<any[]>(key);
      queryClient.setQueryData(key, (old: any[] = []) => [
        ...old,
        { message, fromUserId: user?.id, createdAt: new Date().toISOString(), _optimistic: true },
      ]);
      setDmMsg("");
      return { prev };
    },
    onError: (_err: any, _msg: string, context: any) => {
      const key = ["guild", guildId, "private-chat", selectedDmMemberId];
      if (context?.prev !== undefined) queryClient.setQueryData(key, context.prev);
      toast({ title: "Message not sent", description: "Could not deliver your message. Please try again.", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild", guildId, "private-chat", selectedDmMemberId] });
      setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const r = await apiRequest("POST", `/api/guilds/weekly-tasks/${taskId}/complete`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Task Completed!", description: "Points and PS awarded." });
      if (guildId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildTasks(guildId) });
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

  // Loading skeleton — shaped like the actual content
  if (!guildId || (isGuildLoading && !guild)) {
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
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  // Error state — guild detail query failed
  if (isGuildError && !guild) {
    return (
      <PremiumCard className="p-6 md:p-8 flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <p className="font-bold text-foreground">Could not load guild data</p>
          <p className="text-sm text-muted-foreground mt-1">There was a problem reaching the server.</p>
        </div>
        <button
          onClick={() => refetchGuild()}
          className="text-red-500 text-sm font-bold uppercase tracking-wider hover:underline"
        >
          Retry
        </button>
      </PremiumCard>
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
    { id: "progress", label: "Progress",     icon: <Target size={14} /> },
    { id: "tasks",    label: "Tasks",        icon: <Zap size={14} /> },
    { id: "chat",     label: "Guild Chat",   icon: <Users size={14} /> },
    { id: "dm",       label: "Private Chat", icon: <MessageCircle size={14} /> },
    { id: "wars",     label: "Wars",         icon: <Swords size={14} /> },
    { id: "profile",  label: "My Profile",   icon: <Star size={14} /> },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Captain announcement banner */}
      {guild.latestAnnouncement && (
        <PremiumCard interactive={false} className="border-primary/30 bg-primary/5 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0">
              <Megaphone size={14} className="text-primary" />
            </div>
            <div className="min-w-0">
              <TechnicalLabel text="Captain Announcement" className="text-primary mb-1" />
              <p className="text-sm text-foreground break-words">{guild.latestAnnouncement}</p>
              {guild.announcementPostedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(guild.announcementPostedAt), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        </PremiumCard>
      )}

      {/* Guild Header */}
      <PremiumCard className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-black text-2xl md:text-3xl tracking-tighter text-foreground truncate">{guild.name}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border-2 border-black bg-white text-xs font-bold text-foreground">
                <Trophy size={11} className="text-primary" />
                {(guild.guildPerformanceScore || 0).toLocaleString()} GPS
              </span>
              <TechnicalLabel
                text={`${members.filter((m: any) => m.status === "active").length} Members`}
                className="text-muted-foreground"
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <TechnicalLabel text="Guild Score" className="text-muted-foreground mb-1" />
            <p className="text-3xl font-black tracking-tighter text-primary">
              {(guild.guildPerformanceScore || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </PremiumCard>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border-2 border-black rounded-2xl p-1.5 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 min-w-[40px] flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-2 rounded-xl transition-all",
              tab === t.id
                ? "bg-black text-white shadow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {t.icon}
            <span className="hidden sm:inline whitespace-nowrap">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Progress ── */}
      {tab === "progress" && (
        <div className="space-y-4 md:space-y-6">
          {/* Weekly Target — focal point */}
          <PremiumCard className="p-5 md:p-8">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                  <Target size={18} className="text-primary" />
                </div>
                <div>
                  <TechnicalLabel text="Weekly Target" className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    <CountdownTimer targetDate={nextSunday} />
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl md:text-4xl font-black tracking-tighter text-primary">
                  {weeklyProgress.toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Progress value={weeklyProgress} className="h-3 border border-black/15" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{(guild.currentWeeklyPoints || 0).toLocaleString()} pts earned</span>
                <span>Target: {(guild.weeklyTarget || 0).toLocaleString()} pts</span>
              </div>
            </div>

            <p className={cn("text-sm font-semibold mt-4", weeklyProgress >= 100 ? "text-primary" : "text-muted-foreground")}>
              {weeklyProgress >= 100
                ? "Target hit! Sunday bonus pool unlocking."
                : weeklyProgress >= 70
                ? "Almost there — keep going for the Sunday bonus."
                : "In progress — keep earning to unlock the Sunday bonus."}
            </p>
          </PremiumCard>

          {/* Stat row: My Contribution + My Rank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PremiumCard className="p-5 md:p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                  <Zap size={16} className="text-primary" />
                </div>
                <TechnicalLabel text="My Contribution" className="text-muted-foreground" />
              </div>
              <p className="text-3xl md:text-4xl font-black tracking-tighter text-foreground">
                {myContrib.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">points this week</p>
            </PremiumCard>

            <PremiumCard className="p-5 md:p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                  <Trophy size={16} className="text-primary" />
                </div>
                <TechnicalLabel text="Guild Rank" className="text-muted-foreground" />
              </div>
              <p className="text-3xl md:text-4xl font-black tracking-tighter text-primary">
                {myRank > 0 ? `#${myRank}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">in guild this week</p>
            </PremiumCard>
          </div>

          {/* Team Leaderboard */}
          <PremiumCard className="p-5 md:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                <Users size={16} className="text-primary" />
              </div>
              <TechnicalLabel text="Team Leaderboard (This Week)" className="text-foreground" />
            </div>
            <div className="space-y-1">
              {sortedMembers.slice(0, 10).map((m, i) => (
                <div
                  key={m.userId}
                  className={cn(
                    "flex items-center justify-between py-2.5 px-3 rounded-xl",
                    m.userId === user?.id
                      ? "bg-primary/5 border-2 border-primary/20"
                      : "border border-transparent hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-xs font-black w-6 text-center",
                      i === 0 ? "text-primary" : "text-muted-foreground"
                    )}>#{i + 1}</span>
                    {m.isMvp && <Star size={12} className="text-primary fill-primary shrink-0" />}
                    <span className={cn("text-sm font-semibold", m.userId === user?.id ? "text-primary" : "text-foreground")}>
                      {m.userId === user?.id ? "You" : (m.firstName || m.identity || "Member")}
                    </span>
                  </div>
                  <span className="text-sm font-black text-foreground">
                    {(m.weeklyPointsContributed || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pts</span>
                  </span>
                </div>
              ))}
            </div>
          </PremiumCard>

          {/* Guild History */}
          <PremiumCard className="p-5 md:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                <Clock size={16} className="text-primary" />
              </div>
              <TechnicalLabel text="Guild History (Last 8 Cycles)" className="text-foreground" />
            </div>
            {weeklyHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No completed cycles yet — results appear every Sunday.
              </p>
            ) : (
              <div className="space-y-3">
                {weeklyHistory.slice(0, 8).map((snap: any, i: number) => {
                  const pct = snap.targetPoints > 0 ? Math.min(150, (snap.achievedPoints / snap.targetPoints) * 100) : 0;
                  return (
                    <div key={snap.id ?? i} className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        snap.wasSuccessful ? "bg-primary" : "bg-destructive/60"
                      )} />
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Cycle {weeklyHistory.length - i}</span>
                          <span>
                            {(snap.achievedPoints ?? 0).toLocaleString()} / {(snap.targetPoints ?? 0).toLocaleString()} pts
                            <span className="text-foreground font-semibold ml-1">({pct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <Progress value={Math.min(100, pct)} className="h-1.5" />
                      </div>
                      {snap.wasSuccessful
                        ? <CheckCircle size={14} className="text-primary shrink-0" />
                        : <XCircle size={14} className="text-muted-foreground shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </PremiumCard>
        </div>
      )}

      {/* ── Tab: Tasks ── */}
      {tab === "tasks" && (
        <div className="space-y-3">
          {weeklyTasks.length === 0 ? (
            <PremiumCard interactive={false} className="text-center py-12">
              <div className="p-3 bg-muted rounded-xl w-fit mx-auto mb-4">
                <Zap size={22} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No guild tasks available this week.</p>
            </PremiumCard>
          ) : (
            weeklyTasks.map((task: any) => (
              <PremiumCard key={task.id} interactive={false} className="p-4 md:p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground">{task.title}</span>
                    {task.taskCategory === "indirect" && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-bold">+15 PS</Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                  )}
                  {task.txPointsReward > 0 && (
                    <p className="text-xs text-primary font-semibold mt-1">
                      ~{task.txPointsReward}–{task.txPointsRewardMax} pts
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="shrink-0 min-h-[40px]"
                  disabled={completeTaskMutation.isPending}
                  onClick={() => completeTaskMutation.mutate(task.id)}
                >
                  Complete
                </Button>
              </PremiumCard>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Guild Chat ── */}
      {tab === "chat" && (
        <PremiumCard interactive={false} className="flex flex-col h-[420px] max-h-[65vh] min-h-[280px] p-0 overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-black flex items-center gap-3">
            <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
              <Users size={14} className="text-primary" />
            </div>
            <TechnicalLabel text="Guild Chat" className="text-foreground" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg: any, i) => (
              <div key={i} className={cn("flex", msg.senderId === user?.id ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.senderId === user?.id
                    ? "bg-black text-white"
                    : "bg-muted border border-black/10 text-foreground"
                )}>
                  {msg.senderId !== user?.id && (
                    <div className="text-[10px] font-bold text-primary mb-0.5">{msg.senderName || "Member"}</div>
                  )}
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="px-4 py-3 border-t-2 border-black flex gap-2">
            <Input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              placeholder="Send a message…"
              className="flex-1 h-10 text-sm"
              maxLength={500}
              onKeyDown={e => { if (e.key === "Enter" && chatMsg.trim() && chatMsg.length <= 500) sendChatMutation.mutate(chatMsg.trim()); }}
            />
            <Button
              size="sm"
              className="h-10 w-10 p-0 shrink-0"
              aria-label="Send message"
              disabled={!chatMsg.trim() || chatMsg.length > 500 || sendChatMutation.isPending}
              onClick={() => sendChatMutation.mutate(chatMsg.trim())}
            >
              <Send size={14} />
            </Button>
          </div>
        </PremiumCard>
      )}

      {/* ── Tab: Private Chat ── */}
      {tab === "dm" && (
        <div className="space-y-3">
          {!selectedDmMemberId ? (
            <PremiumCard interactive={false} className="p-5 md:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                  <MessageCircle size={16} className="text-primary" />
                </div>
                <div>
                  <TechnicalLabel text="Private Chat" className="text-foreground" />
                  <p className="text-xs text-muted-foreground mt-0.5">Select a guild member to start a private conversation.</p>
                </div>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {members
                  .filter((m: any) => m.userId !== user?.id && m.status === "active")
                  .map((m: any) => {
                    const isCaptain = m.userId === guild?.captainId;
                    const isAssistant = m.userId === guild?.assistantCaptainId;
                    return (
                      <button
                        key={m.userId}
                        onClick={() => { setSelectedDmMemberId(m.userId); setDmMsg(""); }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/50 border border-transparent hover:border-black/10 transition-all text-left min-h-[56px]"
                      >
                        <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-xs font-black shrink-0">
                          {(m.firstName || m.identity || "M")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground truncate">{m.firstName || m.identity || "Member"}</span>
                            {isCaptain && <Crown size={11} className="text-primary shrink-0" />}
                            {isAssistant && !isCaptain && <Star size={11} className="text-primary/70 shrink-0" />}
                          </div>
                          <TechnicalLabel
                            text={isCaptain ? "Captain" : isAssistant ? "Assistant Captain" : "Member"}
                            className="text-muted-foreground"
                          />
                        </div>
                        <MessageCircle size={14} className="text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                {members.filter((m: any) => m.userId !== user?.id && m.status === "active").length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No other active members yet.</p>
                )}
              </div>
            </PremiumCard>
          ) : (
            <PremiumCard interactive={false} className="flex flex-col h-[440px] max-h-[68vh] min-h-[280px] p-0 overflow-hidden">
              <div className="px-4 py-3 border-b-2 border-black flex items-center gap-3">
                <button
                  onClick={() => { setSelectedDmMemberId(null); setDmMsg(""); }}
                  className="text-muted-foreground hover:text-foreground transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                  aria-label="Back to member list"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-black shrink-0">
                  {(() => {
                    const m = members.find((m: any) => m.userId === selectedDmMemberId);
                    return (m?.firstName || m?.identity || "M")[0].toUpperCase();
                  })()}
                </div>
                <div>
                  <div className="font-bold text-sm text-foreground leading-none">
                    {(() => {
                      const m = members.find((m: any) => m.userId === selectedDmMemberId);
                      return m?.firstName || m?.identity || "Member";
                    })()}
                  </div>
                  <TechnicalLabel
                    text={members.find((m: any) => m.userId === selectedDmMemberId)?.userId === guild?.captainId ? "Captain" : "Member"}
                    className="text-muted-foreground mt-0.5"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {dmMessages.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground text-sm">No messages yet. Start the conversation!</div>
                )}
                {dmMessages.map((msg: any, i) => (
                  <div key={i} className={cn("flex", msg.fromUserId === user?.id ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.fromUserId === user?.id
                        ? "bg-black text-white"
                        : "bg-muted border border-black/10 text-foreground"
                    )}>
                      {msg.message}
                      <div className="text-[10px] mt-1 opacity-50">
                        {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : ""}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={dmEndRef} />
              </div>
              <div className="px-4 py-3 border-t-2 border-black flex gap-2">
                <Input
                  value={dmMsg}
                  onChange={e => setDmMsg(e.target.value)}
                  placeholder="Send a private message…"
                  className="flex-1 h-10 text-sm"
                  maxLength={1000}
                  onKeyDown={e => { if (e.key === "Enter" && dmMsg.trim() && dmMsg.length <= 1000) sendDmMutation.mutate(dmMsg.trim()); }}
                />
                <Button
                  size="sm"
                  className="h-10 w-10 p-0 shrink-0"
                  aria-label="Send private message"
                  disabled={!dmMsg.trim() || dmMsg.length > 1000 || sendDmMutation.isPending}
                  onClick={() => sendDmMutation.mutate(dmMsg.trim())}
                >
                  <Send size={14} />
                </Button>
              </div>
            </PremiumCard>
          )}
        </div>
      )}

      {/* ── Tab: Wars ── */}
      {tab === "wars" && (
        <GuildWarsPanel guildId={guildId} />
      )}

      {/* ── Tab: My Profile ── */}
      {tab === "profile" && (
        <PremiumCard interactive={false} className="p-5 md:p-6">
          <GuildProfileWizard guildId={guildId} guildName={guild?.name ?? ""} />
        </PremiumCard>
      )}
    </div>
  );
}

export default GuildMemberPanel;
