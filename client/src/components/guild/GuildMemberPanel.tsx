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
import { PremiumCard } from "@/components/ui/premium-card";
import TechnicalLabel from "@/components/ui/technical-label";
import {
  GiLaurelsTrophy, GiBullseye, GiPocketWatch, GiChatBubble, GiKnightBanner, GiPortrait, GiBeveledStar,
  GiRoundShield, GiWarhammer, GiCrossedSwords, GiArrowCluster, GiSpartanHelmet, GiSkullCrossedBones, GiFlame,
  GiMagnifyingGlass, GiSpectacles,
} from "./guild-icons";
import { GuildWarsPanel } from "./GuildWarsPanel";
import { GuildProfileWizard } from "./GuildProfileWizard";
import { GuildTasksPanel } from "./GuildTasksPanel";
import { GuildDiscoveryPanel } from "./GuildDiscoveryPanel";
import {
  GuildIdentityHeader, GuildTabBar, SectionChip,
  CTA_CLASS, FOCUS_RING, ICON_BTN_CLASS,
  AvatarStamp, EmptyState, ChatComposer, PanelSkeleton, SkeletonBlock,
} from "./GuildPanelShell";
import { AssistantPanel } from "./AssistantPanel";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Tab = "progress" | "tasks" | "chat" | "dm" | "wars" | "discover" | "profile";

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

  // Guild info (membership detail is not read by this panel — the member view
  // derives everything from the guild detail + roster queries below).
  const {
    data: guild,
    isLoading: isGuildLoading,
    isError: isGuildError,
    refetch: refetchGuild,
  } = useQuery<any>({
    queryKey: guildId ? QUERY_KEYS.guildDetail(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}`); const d = await r.json(); return d.guild; },
    enabled: !!guildId,
    refetchInterval: 60000, // header + announcement freshness; points tick via members query
  });

  // Guild members — only needed on the Progress (leaderboard) and Private Chat
  // (member list) tabs; the identity header count uses the denormalized
  // guild.memberCount instead, so the roster isn't polled on every tab.
  const { data: members = [] } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildMembers(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!guildId && (tab === "progress" || tab === "dm"),
    refetchInterval: 30000,
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
      if (!r.ok) throw await r.json();
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Private chat scrolls to the latest message when a thread loads/updates
  // (chat has its own effect above; the DM thread was missing it).
  useEffect(() => {
    if (tab === "dm" && selectedDmMemberId) {
      dmEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [dmMessages, selectedDmMemberId, tab]);

  // Loading skeleton — shaped like the actual content
  if (!guildId || (isGuildLoading && !guild)) {
    return (
      <div className="space-y-4">
        <PanelSkeleton lines={1} />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
        </div>
        <PanelSkeleton lines={4} />
      </div>
    );
  }

  // Error state — guild detail query failed
  if (isGuildError && !guild) {
    return (
      <PremiumCard className="p-6 md:p-8 flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-[#E8E5D8] border-2 border-black/10 rounded-xl">
          <GiSpartanHelmet className="w-6 h-6 text-black/50" />
        </div>
        <div>
          <p className="font-bold text-foreground">Could not load guild data</p>
          <p className="text-sm font-medium text-black/50 mt-1">There was a problem reaching the server.</p>
        </div>
        <button
          onClick={() => refetchGuild()}
          className={cn(CTA_CLASS, "h-10 px-4 text-[10px]")}
        >
          Retry
        </button>
      </PremiumCard>
    );
  }

  // Assistant captains get the dedicated permission-gated AssistantPanel.
  if (guild?.assistantCaptainId === user?.id) {
    return <AssistantPanel />;
  }

  // Weekly reset is Sunday 23:59 UTC (matches the DB cycle boundary). On Sunday
  // itself the reset is later TODAY, not next week — `(7 - day) % 7` yields 0 on
  // Sunday so the countdown shows hours instead of jumping 7 days ahead.
  const nextSunday = (() => {
    const d = new Date();
    const day = d.getUTCDay(); // 0 = Sunday
    d.setUTCDate(d.getUTCDate() + ((7 - day) % 7));
    d.setUTCHours(23, 59, 0, 0);
    return d;
  })();

  const weeklyProgress = guild.weeklyTarget > 0
    ? Math.min(100, (guild.currentWeeklyPoints / guild.weeklyTarget) * 100) : 0;

  const sortedMembers = [...members].sort((a, b) => (b.weeklyPointsContributed || 0) - (a.weeklyPointsContributed || 0));
  const myContrib = members.find(m => m.userId === user?.id)?.weeklyPointsContributed ?? 0;
  const myRank = sortedMembers.findIndex(m => m.userId === user?.id) + 1;
  const myRole: "CAPTAIN" | "ASSISTANT" | "MEMBER" =
    user?.id === guild?.captainId ? "CAPTAIN"
    : user?.id === guild?.assistantCaptainId ? "ASSISTANT"
    : "MEMBER";

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "progress", label: "Progress",     icon: <GiBullseye size={14} /> },
    { id: "tasks",    label: "Tasks",        icon: <GiWarhammer size={14} /> },
    { id: "chat",     label: "Guild Chat",   icon: <GiChatBubble size={14} /> },
    { id: "dm",       label: "Private Chat", icon: <GiChatBubble size={14} /> },
    { id: "wars",     label: "Wars",         icon: <GiCrossedSwords size={14} /> },
    { id: "discover", label: "Discover",     icon: <GiMagnifyingGlass size={14} /> },
    { id: "profile",  label: "My Profile",   icon: <GiPortrait size={14} /> },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Captain announcement banner */}
      {guild.latestAnnouncement && (
        <PremiumCard interactive={false} className="border-2 border-primary/30 bg-primary/5 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0">
              <GiKnightBanner size={14} className="text-primary" />
            </div>
            <div className="min-w-0">
              <TechnicalLabel text="Captain Announcement" className="text-primary mb-1" />
              <p className="text-sm text-foreground break-words">{guild.latestAnnouncement}</p>
              {guild.announcementPostedAt && (
                <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-1">
                  {formatDistanceToNow(new Date(guild.announcementPostedAt), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        </PremiumCard>
      )}

      {/* Guild identity header — shared landing-grade shell */}
      <GuildIdentityHeader
        guild={guild}
        role={myRole}
        memberCount={guild?.memberCount ?? members.length}
        avatarUrl={guild?.avatarUrl}
      />

      {/* Unified segmented tabs */}
      <GuildTabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* Tab content — keyed so each switch plays the landing entrance motion */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-200">

      {/* ── Tab: Progress ── */}
      {tab === "progress" && (
        <div className="space-y-4 md:space-y-6">
          {/* Weekly GiBullseye — focal point */}
          <PremiumCard className="p-5 md:p-8">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <GiBullseye size={18} className="text-primary" />
                <div>
                  <SectionChip>WEEKLY TARGET</SectionChip>
                  <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-black/45 flex items-center gap-1.5 mt-1.5">
                    <GiPocketWatch size={11} />
                    RESETS IN <CountdownTimer targetDate={nextSunday} />
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl md:text-4xl font-black tracking-tighter text-primary tabular-nums">
                  {weeklyProgress.toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Progress value={weeklyProgress} className="h-3 bg-black/10 border-2 border-black/10 rounded-lg [&>div]:bg-primary" />
              <div className="flex justify-between text-[10px] md:text-xs font-black uppercase tracking-wider text-black/45">
                <span>{(guild.currentWeeklyPoints || 0).toLocaleString()} PTS EARNED</span>
                <span className="text-black/30">TARGET {(guild.weeklyTarget || 0).toLocaleString()} PTS</span>
              </div>
            </div>

            <div className="mt-5 border-t-[3px] border-black/10 pt-4 flex items-center gap-2">
              {weeklyProgress >= 100 ? <GiRoundShield size={14} className="text-primary shrink-0" /> : <GiFlame size={14} className="text-primary shrink-0" />}
              <p className={cn("text-sm font-bold", weeklyProgress >= 100 ? "text-primary" : "text-black/60")}>
                {weeklyProgress >= 100
                  ? "Bullseye hit! Sunday bonus pool unlocking."
                  : weeklyProgress >= 70
                  ? "Almost there — keep going for the Sunday bonus."
                  : "In progress — keep earning to unlock the Sunday bonus."}
              </p>
            </div>
          </PremiumCard>

          {/* Stat row: My Contribution + My Rank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PremiumCard className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionChip>MY CONTRIBUTION</SectionChip>
                <GiFlame size={16} className="text-primary" />
              </div>
              <p className="text-3xl md:text-4xl font-black tracking-tighter tabular-nums">{myContrib.toLocaleString()}</p>
              <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-1.5">Points This Week</p>
            </PremiumCard>

            <PremiumCard className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionChip>GUILD RANK</SectionChip>
                <GiLaurelsTrophy size={16} className="text-primary" />
              </div>
              <p className="text-3xl md:text-4xl font-black tracking-tighter text-primary tabular-nums">
                {myRank > 0 ? `#${myRank}` : "—"}
                {myRank > 0 && <span className="text-base text-black/40 font-black"> / {sortedMembers.length}</span>}
              </p>
              <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-1.5">In Guild This Week</p>
            </PremiumCard>
          </div>

          {/* Team Leaderboard */}
          <PremiumCard className="p-5 md:p-6">              <div className="flex items-center justify-between mb-5">
                <SectionChip>TEAM LEADERBOARD · THIS WEEK</SectionChip>
                <GiRoundShield size={16} className="text-primary" />
              </div>
            <div className="divide-y divide-black/10">
              {sortedMembers.slice(0, 10).map((m, i) => (
                <div
                  key={m.userId}
                  className={cn(
                    "flex items-center justify-between py-3 pl-3 border-l-[3px]",
                    m.userId === user?.id ? "bg-primary/5 border-primary" : "border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      "w-6 h-6 rounded-md border-2 flex items-center justify-center text-[10px] font-black shrink-0",
                      i === 0 ? "border-black bg-black text-white" : "border-black/15 text-black/50"
                    )}>{i + 1}</span>
                    {m.isMvp && <GiSpectacles size={12} className="text-primary shrink-0" />}
                    <span className={cn("text-sm font-bold truncate", m.userId === user?.id ? "text-primary" : "text-foreground")}>
                      {m.userId === user?.id ? "You" : (m.firstName || m.identity || "Member")}
                    </span>
                  </div>
                  <span className="text-sm font-black tabular-nums text-foreground">
                    {(m.weeklyPointsContributed || 0).toLocaleString()} <span className="text-[10px] font-black uppercase tracking-wider text-black/40">pts</span>
                  </span>
                </div>
              ))}
            </div>
          </PremiumCard>

          {/* Guild History */}
          <PremiumCard className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-5">
              <SectionChip>GUILD HISTORY · LAST 8 CYCLES</SectionChip>
              <GiPocketWatch size={16} className="text-primary" />
            </div>
            {weeklyHistory.length === 0 ? (
              <EmptyState
                icon={<GiPocketWatch size={22} className="text-black/40" />}
                chip="GUILD HISTORY"
                title="No completed cycles yet"
                caption="Results appear every Sunday."
              />
            ) : (
              <div className="space-y-4">
                {weeklyHistory.slice(0, 8).map((snap: any, i: number) => {
                  const pct = snap.targetPoints > 0 ? Math.min(150, (snap.achievedPoints / snap.targetPoints) * 100) : 0;
                  return (
                    <div key={snap.id ?? i} className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0 border-2 border-black/10",
                        snap.wasSuccessful ? "bg-primary" : "bg-black/20"
                      )} />
                      <div className="flex-1">
                        <div className="flex justify-between text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5">
                          <span className="text-black/40">Cycle {weeklyHistory.length - i}</span>
                          <span className="text-black/50">
                            {(snap.achievedPoints ?? 0).toLocaleString()} / {(snap.targetPoints ?? 0).toLocaleString()} PTS
                            <span className={cn("ml-1", snap.wasSuccessful ? "text-primary" : "text-black/30")}>({pct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <Progress value={Math.min(100, pct)} className="h-1.5 bg-black/10 [&>div]:bg-primary" />
                      </div>
                      {snap.wasSuccessful
                        ? <GiRoundShield size={14} className="text-primary shrink-0" />
                        : <GiSkullCrossedBones size={14} className="text-black/30 shrink-0" />}
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
        <GuildTasksPanel />
      )}

      {/* ── Tab: Guild Chat ── */}
      {tab === "chat" && (
        <PremiumCard interactive={false} className="flex flex-col h-[420px] max-h-[65vh] min-h-[280px] p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b-2 border-black flex items-center justify-between gap-3">
            <SectionChip>GUILD CHAT</SectionChip>
            <GiChatBubble size={14} className="text-primary" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm font-black uppercase tracking-tight text-black/45 mb-1">No messages yet</p>
                <p className="text-xs font-medium text-black/40">Say hello to your guild!</p>
              </div>
            )}
            {chatMessages.map((msg: any, i) => (
              <div key={msg.id ?? i} className={cn("flex items-end gap-2", msg.senderId === user?.id ? "justify-end" : "justify-start")}>
                {msg.senderId !== user?.id && (
                  <AvatarStamp
                    name={msg.firstName || msg.senderName}
                    avatarUrl={msg.avatarUrl}
                    size="sm"
                  />
                )}
                <div className={cn(
                  "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm border-2",
                  msg.senderId === user?.id
                    ? "bg-black text-white border-black"
                    : "bg-white border-black/10 text-foreground"
                )}>
                  {msg.senderId !== user?.id && (
                    <div className="text-[10px] font-bold text-primary mb-0.5">{msg.firstName || msg.senderName || "Member"}</div>
                  )}
                  {msg.message}
                  <div className={cn("text-[10px] mt-1", msg.senderId === user?.id ? "text-white/50" : "text-black/40")}>
                    {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : ""}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>            <ChatComposer
              value={chatMsg}
              onChange={setChatMsg}
              onSend={(v) => sendChatMutation.mutate(v)}
              placeholder="Send a message…"
              isPending={sendChatMutation.isPending}
            />
        </PremiumCard>
      )}

      {/* ── Tab: Private Chat ── */}
      {tab === "dm" && (
        <div className="space-y-3">
          {!selectedDmMemberId ? (
            <PremiumCard interactive={false} className="p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <SectionChip>PRIVATE CHAT</SectionChip>
                  <p className="text-xs font-medium text-black/45 mt-1.5">Select a guild member to start a private conversation.</p>
                </div>
                <GiChatBubble size={16} className="text-primary shrink-0" />
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
                        className={cn("w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-black/[0.04] border-2 border-transparent hover:border-black/15 transition-all text-left min-h-[56px]", FOCUS_RING)}
                      >
                        <AvatarStamp name={m.firstName || m.identity} avatarUrl={m.avatarUrl} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground truncate">{m.firstName || m.identity || "Member"}</span>
                            {isCaptain && <GiSpartanHelmet size={11} className="text-primary shrink-0" />}
                            {isAssistant && !isCaptain && <GiBeveledStar size={11} className="text-primary/70 shrink-0" />}
                          </div>
                          <TechnicalLabel
                            text={isCaptain ? "Captain" : isAssistant ? "Assistant Captain" : "Member"}
                            className="text-black/40"
                          />
                        </div>
                        <GiChatBubble size={14} className="text-black/40 shrink-0" />
                      </button>
                    );
                  })}
                {members.filter((m: any) => m.userId !== user?.id && m.status === "active").length === 0 && (
                  <p className="text-sm font-medium text-black/50 text-center py-8">No other active members yet.</p>
                )}
              </div>
            </PremiumCard>
          ) : (
            <PremiumCard interactive={false} className="flex flex-col h-[440px] max-h-[68vh] min-h-[280px] p-0 overflow-hidden">
              <div className="px-4 py-3 border-b-2 border-black flex items-center gap-3">
                <button
                  onClick={() => { setSelectedDmMemberId(null); setDmMsg(""); }}
                  className={ICON_BTN_CLASS}
                  aria-label="Back to member list"
                >
                  <GiArrowCluster size={16} />
                </button>
                <AvatarStamp
                  name={members.find((m: any) => m.userId === selectedDmMemberId)?.firstName || members.find((m: any) => m.userId === selectedDmMemberId)?.identity}
                  avatarUrl={members.find((m: any) => m.userId === selectedDmMemberId)?.avatarUrl}
                  size="sm"
                />
                <div>
                  <div className="font-bold text-sm text-foreground leading-none">
                    {(() => {
                      const m = members.find((m: any) => m.userId === selectedDmMemberId);
                      return m?.firstName || m?.identity || "Member";
                    })()}
                  </div>
                  <TechnicalLabel
                    text={members.find((m: any) => m.userId === selectedDmMemberId)?.userId === guild?.captainId
                      ? "Captain"
                      : members.find((m: any) => m.userId === selectedDmMemberId)?.userId === guild?.assistantCaptainId
                        ? "Assistant Captain"
                        : "Member"}
                    className="text-black/40 mt-0.5"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {dmMessages.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-sm font-black uppercase tracking-tight text-black/45 mb-1">No messages yet</p>
                    <p className="text-xs font-medium text-black/40">Start the conversation!</p>
                  </div>
                )}
                {dmMessages.map((msg: any, i) => (
                  <div key={msg.id ?? i} className={cn("flex", msg.fromUserId === user?.id ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.fromUserId === user?.id
                        ? "bg-black text-white"
                        : "bg-white border-2 border-black/10 text-foreground"
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
              <ChatComposer
                value={dmMsg}
                onChange={setDmMsg}
                onSend={(v) => sendDmMutation.mutate(v)}
                placeholder="Send a private message…"
                maxLength={1000}
                isPending={sendDmMutation.isPending}
              />
            </PremiumCard>
          )}
        </div>
      )}

      {/* ── Tab: Discover ── */}
      {tab === "discover" && (
        <GuildDiscoveryPanel />
      )}

      {/* ── Tab: Wars ── */}
      {tab === "wars" && (
        <GuildWarsPanel guildId={guildId} />
      )}

      {/* ── Tab: My Profile ── */}
      {tab === "profile" && (
        <PremiumCard interactive={false} className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <SectionChip>MY PROFILE</SectionChip>
            <GiPortrait size={16} className="text-primary" />
          </div>
          <GuildProfileWizard guildId={guildId} guildName={guild?.name ?? ""} mode="edit" />
        </PremiumCard>
      )}
      </div>{/* end tab content */}
    </div>
  );
}

export default GuildMemberPanel;
