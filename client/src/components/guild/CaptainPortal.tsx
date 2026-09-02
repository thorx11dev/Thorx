/**
 * CaptainPortal — THORX v3 (spec F.8, Phase 3 redesign)
 * Default Engine C view for guild captains (guildRole='captain').
 * Tabs: Requests | Roster | DM Hub | Weekly Stats | Settings
 * NEVER shows PKR pool amounts to users — only after distribution.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RankBadge } from "@/components/RankBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumCard } from "@/components/ui/premium-card";
import TechnicalLabel from "@/components/ui/technical-label";
import {
  SectionChip, QueryError, RoleChip,
  CTA_CLASS, OUTLINE_CLASS, DESTRUCTIVE_CLASS, DESTRUCTIVE_OUTLINE, ICON_BTN_CLASS,
  FIELD_CLASS, FIELD_AREA_CLASS, FieldLabel, useEscape, ModalShell,
  AvatarStamp, EmptyState, SelectField, SegmentedToggle, ChatComposer,
  PanelSkeleton, SkeletonBlock,
} from "./GuildPanelShell";
import { Inbox, Users, ListChecks, MessagesSquare, MessageCircle, Swords, Search, BarChart3, Settings, Menu, ArrowRight, ArrowLeft, Megaphone, Shield, ImagePlus, ChevronDown, BellRing, Trophy, X, Loader2 } from "lucide-react";
import { InteractiveDivider } from "@/features/user-portal/shared";
import { GuildNavDrawer } from "./GuildNavDrawer";
import {
  GiKnightBanner, GiChatBubble, GiWarhammer, GiCog,
  GiRoundShield, GiSkullCrossedBones, GiLaurelsTrophy, GiHuntingHorn, GiBroadsword, GiSpartanHelmet,
  GiSwordSpin, GiCrossedSwords, GiCrossedAxes, GiShield,
  GiArrowCluster, GiArrowhead, GiPortrait, GiMagnifyingGlass,
} from "./guild-icons";
import { GuildWarsPanel } from "./GuildWarsPanel";
import { GuildProfileWizard } from "./GuildProfileWizard";
import { GuildTasksPanel } from "./GuildTasksPanel";
import { GuildDiscoveryPanel } from "./GuildDiscoveryPanel";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

/** Mono group label + hairline — notification-panel section signature. */
function GroupLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/35 uppercase whitespace-nowrap">{text}</span>
      <div className="h-px flex-1 bg-black/10" />
    </div>
  );
}

/** Animated placeholder — auth-page typing effect for empty fields. */
function AnimatedPlaceholder({ examples, className = "text-black/35" }: { examples: string[]; className?: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const example = examples[currentIndex];
    let timeout: ReturnType<typeof setTimeout>;
    if (isTyping) {
      if (currentText.length < example.length) {
        timeout = setTimeout(() => setCurrentText(example.slice(0, currentText.length + 1)), 70);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 1200);
      }
    } else {
      if (currentText.length > 0) {
        timeout = setTimeout(() => setCurrentText(currentText.slice(0, -1)), 35);
      } else {
        setCurrentIndex(prev => (prev + 1) % examples.length);
        setIsTyping(true);
      }
    }
    return () => clearTimeout(timeout);
  }, [currentText, currentIndex, examples, isTyping]);

  return (
    <span className={className}>
      {currentText}<span className="animate-pulse">|</span>
    </span>
  );
}

const DESCRIPTION_SUGGESTIONS = [
  "A focused crew that wins every week…",
  "Daily active members, one shared goal…",
  "Built for the Sunday leaderboard push…",
];
const ANNOUNCEMENT_SUGGESTIONS = [
  "Sunday payout drops at 9pm sharp…",
  "MVP bonus doubles this week…",
  "Stay active — war chest is loading…",
];

type Tab = "requests" | "roster" | "tasks" | "chat" | "wars" | "discover" | "stats" | "settings";

export function CaptainPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("requests");
  const [navOpen, setNavOpen] = useState(false);
  const [chatMode, setChatMode] = useState<"group" | "solo">("group");
  const [settingsView, setSettingsView] = useState<"guild" | "profile">("guild");
  const [expandedRoster, setExpandedRoster] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ appId: string; applicantName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);
  const [selectedDmMember, setSelectedDmMember] = useState<string | null>(null);
  const [dmMsg, setDmMsg] = useState("");
  const [settingsForm, setGiCogForm] = useState<any>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const guildId = user?.guildId;

  // Esc closes any open modal/sheet.
  useEscape(() => {
    if (rejectModal) { setRejectModal(null); setRejectReason(""); }
    if (kickConfirm) setKickConfirm(null);
  });

  // Guild info
  const {
    data: guild,
    isLoading: isGuildLoading,
    isError: isGuildError,
    refetch: refetchGuild,
  } = useQuery<any>({
    queryKey: ["/api/guilds", guildId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}`); const d = await r.json(); return d.guild; },
    enabled: !!guildId,
    refetchInterval: 60000, // header + settings; members tick faster for roster
  });

  // Members
  const {
    data: members = [],
    isLoading: isMembersLoading,
    isError: isMembersError,
    refetch: refetchMembers,
  } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "members"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!guildId,
    refetchInterval: 30000,
  });

  // Pending applications — dedicated endpoint. The roster only returns active
  // members, so filtering members for status === "pending" always came back
  // empty (Requests used to look permanently empty).
  const {
    data: pendingApplications = [],
    isLoading: isAppsLoading,
    isError: isAppsError,
    refetch: refetchApps,
  } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "applications"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/applications`); const d = await r.json(); return d.applications ?? []; },
    enabled: !!guildId,
    refetchInterval: 15000,
  });
  const pending = pendingApplications;
  const active  = members.filter((m: any) => m.status === "active");
  const weekMvpSet = active.some((m: any) => m.isMvp);

  // Weekly history
  const {
    data: weeklyHistory = [],
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "weekly-history"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/weekly-history`); const d = await r.json(); return d.history ?? d.snapshots ?? []; },
    enabled: !!guildId && tab === "stats",
  });

  // Guild Chat
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);
  const [chatMsg, setChatMsg] = useState("");
  const {
    data: chatMessages = [],
    isError: isChatError,
    refetch: refetchChat,
  } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "chat"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/chat`); const d = await r.json(); return d.messages ?? []; },
    enabled: !!guildId && tab === "chat",
    refetchInterval: tab === "chat" ? 15000 : false,
  });

  // Group chat messages by day for mono separators (Today / Yesterday / date).
  const chatDayGroups = useMemo(() => {
    const groups: { label: string; msgs: any[] }[] = [];
    chatMessages.forEach((msg: any) => {
      const d = msg.createdAt ? new Date(msg.createdAt) : new Date();
      const dayKey = format(d, "yyyy-MM-dd");
      const label = dayKey === format(new Date(), "yyyy-MM-dd")
        ? "Today"
        : dayKey === format(new Date(Date.now() - 86400000), "yyyy-MM-dd")
          ? "Yesterday"
          : format(d, "dd MMM yyyy");
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.msgs.push(msg);
      else groups.push({ label, msgs: [msg] });
    });
    return groups.map(g => [g.label, g.msgs] as [string, any[]]);
  }, [chatMessages]);

  // DM messages
  const {
    data: dmMessages = [],
    isError: isDmError,
    refetch: refetchDm,
  } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "private-chat", selectedDmMember],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/private-chat/${selectedDmMember}`); const d = await r.json(); return d.messages ?? []; },
    enabled: !!guildId && !!selectedDmMember && tab === "chat" && chatMode === "solo",
    refetchInterval: 60000,
  });

  const appActionMutation = useMutation({
    mutationFn: async ({ appId, action, reason }: { appId: string; action: "accept" | "reject"; reason?: string }) => {
      const r = await apiRequest("PATCH", `/api/guilds/${guildId}/applications/${appId}`, { action, rejectionReason: reason });
      return r.json();
    },
    onSuccess: (_, { action }) => {
      toast({ title: action === "accept" ? "Member Accepted!" : "Application Rejected" });
      setRejectModal(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const nudgeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/members/${memberId}/nudge`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Nudge sent!" });
      // Refresh roster so the 24h cooldown shows immediately (like the assistant panel).
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "members"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const mvpMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/members/${memberId}/mvp`);
      return r.json();
    },
    onSuccess: (data: any) => {
      // Bonus amount comes from the server (GPS_MVP_BONUS config) — never hardcode it.
      toast({
        title: "MVP Selected!",
        description: data?.bonus ? `+${data.bonus.toLocaleString()} GPS awarded to the guild.` : "Designated as this week's MVP.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "members"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const kickMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const r = await apiRequest("DELETE", `/api/guilds/${guildId}/members/${memberId}`);
      return r.json();
    },
    onSuccess: () => {
      setKickConfirm(null);
      toast({ title: "Member removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const sendDmMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/private-chat/${selectedDmMember}`, { message });
      return r.json();
    },
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/guilds", guildId, "private-chat", selectedDmMember] });
      const prev = queryClient.getQueryData<any[]>(["/api/guilds", guildId, "private-chat", selectedDmMember]);
      queryClient.setQueryData(["/api/guilds", guildId, "private-chat", selectedDmMember], (old: any[] = []) => [
        ...old,
        { message, fromUserId: user?.id, createdAt: new Date().toISOString(), _optimistic: true },
      ]);
      setDmMsg("");
      return { prev };
    },
    onError: (_err: any, _msg: string, context: any) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(["/api/guilds", guildId, "private-chat", selectedDmMember], context.prev);
      }
      toast({ title: "Message not sent", description: "Could not deliver your message. Please try again.", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "private-chat", selectedDmMember] });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (updates: any) => {
      const r = await apiRequest("PATCH", `/api/guilds/${guildId}/settings`, updates);
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Settings saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
      if (data?.guild?.weeklyTarget) {
        setGiCogForm((f: any) => ({ ...f, weeklyTarget: data.guild.weeklyTarget }));
      }
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const announcementMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/announcement`, { text });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Announcement posted!", description: "All members will see your announcement." });
      setAnnouncementText("");
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Could not post announcement.", variant: "destructive" }),
  });

  const clearAnnouncementMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/guilds/${guildId}/announcement`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Announcement cleared." });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  // Auto-scroll chat to the newest message.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // DM thread scrolls to the latest message when it loads/updates.
  useEffect(() => {
    if (tab === "chat" && chatMode === "solo" && selectedDmMember) {
      dmEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [dmMessages, selectedDmMember, tab]);

  useEffect(() => {
    if (guild && !settingsForm) {
      setGiCogForm({
        name: guild.name || "",
        description: guild.description || "",
        minRankRequired: guild.minRankRequired || "E-Rank",
        recruitmentOpen: guild.recruitmentOpen ?? true,
        isPublic: guild.isPublic ?? true,
        avatarUrl: guild.avatarUrl || null,
      });
    }
  }, [guild]);

  const handleGuildAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Guild images must be 5MB or smaller.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        // Keep discovery cards fast while preserving enough detail for a
        // square/portrait guild mark.
        const maxSide = 768;
        const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
        setGiCogForm((current: any) => ({
          ...current,
          avatarUrl: canvas.toDataURL("image/jpeg", 0.82),
        }));
      };
      source.onerror = () => toast({ title: "Upload failed", description: "Could not read that image.", variant: "destructive" });
      source.src = reader.result as string;
    };
    reader.onerror = () => toast({ title: "Upload failed", description: "Could not read that image.", variant: "destructive" });
    reader.readAsDataURL(file);
  };

  const sendChatMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/chat`, { message });
      if (!r.ok) throw await r.json();
      return r.json();
    },
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/guilds", guildId, "chat"] });
      const prev = queryClient.getQueryData<any[]>(["/api/guilds", guildId, "chat"]);
      queryClient.setQueryData(["/api/guilds", guildId, "chat"], (old: any[] = []) => [
        ...old, { message, userId: user?.id, senderName: user?.firstName || "You", createdAt: new Date().toISOString(), _optimistic: true },
      ]);
      setChatMsg("");
      return { prev };
    },
    onError: (_err: any, _msg: string, context: any) => {
      if (context?.prev !== undefined) queryClient.setQueryData(["/api/guilds", guildId, "chat"], context.prev);
      toast({ title: "Message not sent", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "chat"] });
    },
  });

  const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "requests", label: "Requests",     icon: Inbox,          badge: pending.length },
    { id: "roster",   label: "Roster",       icon: Users },
    { id: "tasks",    label: "Tasks",        icon: ListChecks },
    { id: "chat",     label: "Chat",         icon: MessagesSquare },
    { id: "wars",     label: "Wars",         icon: Swords },
    { id: "discover", label: "Discover",     icon: Search },
    { id: "stats",    label: "Stats",        icon: BarChart3 },
    { id: "settings", label: "Settings",     icon: Settings },
  ];

  // ── Loading / no-guild guard ──────────────────────────────────────────────
  if (!guildId || (isGuildLoading && !guild)) return (
    <div className="space-y-4">
      <PanelSkeleton lines={1} />
      <SkeletonBlock className="h-14" />
      <PanelSkeleton lines={4} />
    </div>
  );

  // Guild query error guard
  if (isGuildError) return (
    <PremiumCard interactive={false}>
      <QueryError message="Could not load guild data." onRetry={() => refetchGuild()} />
    </PremiumCard>
  );

  const gpsScore = guild?.guildPerformanceScore ?? 0;
  const weeklyTarget = guild?.weeklyTarget ?? 0;
  const weeklyCurrent = guild?.currentWeeklyPoints ?? 0;
  const targetPct = weeklyTarget > 0 ? Math.min(100, (weeklyCurrent / weeklyTarget) * 100) : 0;

  return (
    <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:items-start space-y-4 md:space-y-6 lg:space-y-0">

      {/* ── Sidebar — desktop: GUILD PROFILE + NAVIGATION ──────────────── */}
      <aside className="hidden lg:flex flex-col bg-white rounded-2xl border-2 border-black overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
        {/* Profile block */}
        <div className="p-5 border-b-2 border-black shrink-0">
          <TechnicalLabel text="GUILD PROFILE" className="text-black/40 text-[9px] mb-4" />
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-14 h-14 rounded-xl border-2 border-black bg-[#EAE5DD] flex items-center justify-center font-black text-xl shrink-0 overflow-hidden">
              <span className="absolute inset-0 flex items-center justify-center text-black/25">{(guild.name || "G")[0].toUpperCase()}</span>
              {guild.avatarUrl && (
                <img src={guild.avatarUrl} alt={guild.name} onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black text-base uppercase tracking-tighter truncate leading-tight">{guild.name}</div>
              <div className="mt-1.5"><RoleChip role="CAPTAIN" /></div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border-2 border-black/10 bg-[#EAE5DD]/30 px-3 py-2.5">
              <TechnicalLabel text="MEMBERS" className="text-black/40 text-[8px]" />
              <div className="font-black text-lg tabular-nums leading-tight mt-0.5">{active.length}</div>
            </div>
            <div className="rounded-xl border-2 border-black/10 bg-[#EAE5DD]/30 px-3 py-2.5">
              <TechnicalLabel text="GPS" className="text-black/40 text-[8px]" />
              <div className="font-black text-lg tabular-nums text-primary leading-tight mt-0.5">{gpsScore.toLocaleString()}</div>
            </div>
          </div>

          {/* Weekly target */}
          {weeklyTarget > 0 && (
            <div className="mt-3.5">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <TechnicalLabel text="WEEKLY TARGET" className="text-black/40 text-[8px]" />
                <span className="text-[9px] font-black tabular-nums text-black/55 shrink-0">
                  {weeklyCurrent.toLocaleString()}/{weeklyTarget.toLocaleString()} · {targetPct.toFixed(0)}%
                </span>
              </div>
              <Progress value={targetPct} className="h-1.5 bg-black/10 [&>div]:bg-primary" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          <TechnicalLabel text="NAVIGATION" className="text-black/40 text-[9px] px-2.5 mb-2 block" />
          <div className="space-y-1">
            {TABS.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 h-11 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-150",
                    isActive ? "bg-black text-white" : "text-black/55 hover:bg-black/5 hover:text-black"
                  )}
                >
                  <t.icon size={15} strokeWidth={2} />
                  <span className="flex-1 text-left">{t.label}</span>
                  {(t.badge ?? 0) > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">
                      {t.badge! > 9 ? "9+" : t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* ── Main column — GUILD HERO + tab content ────────────────────── */}
      <div className="space-y-4 md:space-y-6 min-w-0">

      {/* ── Mobile guild header — the profile card IS the header ──────── */}
      <div className="lg:hidden relative overflow-hidden group rounded-2xl border-2 border-black bg-white p-5">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />

        <div className="relative z-10">
          <div className="flex items-center gap-3.5 min-w-0 py-2">
            <div className="relative w-14 h-14 rounded-xl border-2 border-black bg-[#EAE5DD] flex items-center justify-center font-black text-xl shrink-0 overflow-hidden">
              <span className="absolute inset-0 flex items-center justify-center text-black/25">{(guild.name || "G")[0].toUpperCase()}</span>
              {guild.avatarUrl && (
                <img src={guild.avatarUrl} alt={guild.name} onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0 font-black text-xl uppercase tracking-tighter truncate leading-tight text-black">
              {guild.name}
            </div>

            {/* Emblem — hangs right above the stats row (Target text), tap opens navigation */}
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open guild navigation"
              data-testid="button-guild-nav"
              className="shrink-0 self-start -my-3 w-14 h-14 p-0.5 cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
            >
              <img
                src="/guild/nav-emblem.webp"
                alt=""
                draggable={false}
                className="w-full h-full object-contain drop-shadow-[2px_2px_0px_rgba(0,0,0,0.22)]"
              />
            </button>
          </div>

          <div className="mt-4 pt-3.5 border-t-2 border-black/10 flex items-center justify-between gap-2 text-[10px] font-mono font-bold tracking-[0.12em] uppercase text-black/45">
            <span className="shrink-0">{active.length} MEMBERS</span>
            <span className="w-1 h-1 rounded-full bg-black/15 shrink-0" />
            <span className="shrink-0">{gpsScore.toLocaleString()} GPS</span>
            {weeklyTarget > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-black/15 shrink-0" />
                <span className="shrink-0">{targetPct.toFixed(0)}% TARGET</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── The line that used to sit under the GUILD hero — standard spacing ── */}
      <InteractiveDivider className="my-12 lg:hidden" />

      {/* ── Mobile guild navigation drawer — cream twin of the portal menu,
             slides in from the LEFT with staggered spring rows ─────────── */}
      <GuildNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        tabs={TABS}
        value={tab}
        onChange={setTab}
      />

      {/* ── Active announcement preview ─────────────────────────────────── */}
      {guild.latestAnnouncement && (
        <PremiumCard interactive={false} className="border-2 border-primary/30 bg-primary/5 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0 mt-0.5">
              <GiKnightBanner className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <TechnicalLabel text="Active Announcement" className="text-primary text-xs mb-1" />
              <p className="text-sm text-black/75 break-words font-medium">{guild.latestAnnouncement}</p>
              {guild.announcementPostedAt && (
                <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-1">
                  Posted {formatDistanceToNow(new Date(guild.announcementPostedAt), { addSuffix: true })}
                </p>
              )}
            </div>
            <button
              onClick={() => clearAnnouncementMutation.mutate()}
              disabled={clearAnnouncementMutation.isPending}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border-2 border-black/20 bg-white text-black/50 font-black uppercase tracking-wider text-[10px] transition-all duration-200 hover:border-destructive hover:text-destructive disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {clearAnnouncementMutation.isPending ? <GiSwordSpin className="w-3 h-3 animate-spin" /> : <GiCrossedAxes size={12} />}
              Clear
            </button>
          </div>
        </PremiumCard>
      )}

      {/* ── Main column — content (navigation via sidebar / drawer) ───── */}

      {/* Tab content — keyed so each switch plays the landing entrance motion */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-200">

      {/* ── REQUESTS ────────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-3 md:space-y-4">
          {isAppsLoading && (
            <div className="space-y-3">
              {[0, 1].map(i => (
                <PanelSkeleton key={i} lines={2} />
              ))}
            </div>
          )}

          {isAppsError && (
            <PremiumCard interactive={false}>
              <QueryError message="Could not load applications." onRetry={() => refetchApps()} />
            </PremiumCard>
          )}

          {!isAppsLoading && !isAppsError && pending.length === 0 && (
            <EmptyState
              icon={<GiBroadsword size={22} className="text-black/40" />}
              chip="NO PENDING REQUESTS"
              title="Inbox clear"
              caption="New applicants will appear here for review."
            />
          )}

          {!isAppsLoading && !isAppsError && pending.map((app: any) => (
            <PremiumCard key={app.id} interactive={false} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  {/* Real applicant profile picture (falls back to initial) */}
                  <AvatarStamp name={app.firstName || app.identity} avatarUrl={app.avatarUrl} size="md" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-foreground text-base tracking-tight">{app.firstName || app.identity || "Applicant"}</span>
                      <RankBadge rank={app.userRankTier || "E-Rank"} size="sm" />
                    </div>
                    <p className="text-[10px] text-black/50 mt-0.5 font-semibold">
                      Applied {app.createdAt ? formatDistanceToNow(new Date(app.createdAt), { addSuffix: true }) : "recently"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 sm:mt-0">
                  <Button
                    size="sm"
                    className={cn(CTA_CLASS, "h-10 px-4 text-[10px]")}
                    disabled={appActionMutation.isPending}
                    onClick={() => appActionMutation.mutate({ appId: app.id, action: "accept" })}
                  >
                    <GiRoundShield size={13} />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    className={cn(OUTLINE_CLASS, "h-10 px-4 text-[10px]")}
                    onClick={() => setRejectModal({ appId: app.id, applicantName: app.firstName || "this applicant" })}
                  >
                    <GiSkullCrossedBones size={13} />
                    Reject
                  </Button>
                </div>
              </div>
              {app.coverLetter && (
                <div className="border-2 border-black/10 rounded-lg p-3.5 border-l-[3px] border-l-primary">
                  <TechnicalLabel text="APPLICATION LETTER" className="text-black/40 text-[10px] mb-1.5" />
                  <p className="text-sm text-black/65 leading-relaxed">"{app.coverLetter}"</p>
                </div>
              )}
            </PremiumCard>
          ))}
        </div>
      )}

      {/* ── ROSTER ──────────────────────────────────────────────────────── */}
      {tab === "roster" && (
        <div className="space-y-3 md:space-y-4">
          {isMembersLoading && (
            <PanelSkeleton lines={5} />
          )}

          {isMembersError && (
            <PremiumCard interactive={false}>
              <QueryError message="Could not load roster." onRetry={() => refetchMembers()} />
            </PremiumCard>
          )}

          {!isMembersLoading && !isMembersError && active.length === 0 && (
            <EmptyState
              icon={<GiRoundShield size={22} className="text-black/40" />}
              chip="ROSTER"
              title="No active members yet"
              caption="Review pending applications to build your team."
            />
          )}

          {!isMembersLoading && !isMembersError && active.length > 0 && (
            <>
              {/* KPI strip — display numbers */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border-2 border-black px-4 py-3.5">
                  <TechnicalLabel text="TOTAL MEMBERS" className="text-black/40 text-[10px] mb-1" />
                  <div className="font-black text-xl md:text-2xl tracking-tighter tabular-nums">{active.length}</div>
                </div>
                <div className="bg-white rounded-2xl border-2 border-black px-4 py-3.5">
                  <TechnicalLabel text="WEEKLY POINTS" className="text-black/40 text-[10px] mb-1" />
                  <div className="font-black text-xl md:text-2xl tracking-tighter tabular-nums text-primary">
                    {active.reduce((s: number, m: any) => s + (m.weeklyPointsContributed || 0), 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border-2 border-black px-4 py-3.5">
                  <TechnicalLabel text="WEEKLY MVP" className="text-black/40 text-[10px] mb-1" />
                  <div className="font-black text-lg md:text-xl tracking-tight truncate">
                    {active.find((m: any) => m.isMvp)?.firstName || active.find((m: any) => m.isMvp)?.identity || "—"}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border-2 border-black px-4 py-3.5">
                  <TechnicalLabel text="AVG PER MEMBER" className="text-black/40 text-[10px] mb-1" />
                  <div className="font-black text-xl md:text-2xl tracking-tighter tabular-nums">
                    {Math.round(active.reduce((s: number, m: any) => s + (m.weeklyPointsContributed || 0), 0) / Math.max(1, active.length)).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Roster — leaderboard-style list rows with expand/collapse */}
              {(() => {
                const maxPts = Math.max(1, ...active.map((m: any) => m.weeklyPointsContributed || 0));
                const sorted = [...active].sort((a: any, b: any) => (b.weeklyPointsContributed || 0) - (a.weeklyPointsContributed || 0));
                return (
                  <div className="rounded-2xl border border-black/15 bg-white overflow-hidden">
                    {/* Header row — desktop */}
                    <div className="hidden md:flex items-center gap-6 px-8 py-4 border-b border-black/10 bg-black/[0.03]">
                      <span className="flex-1">
                        <TechnicalLabel text="MEMBER" className="text-black/40" />
                      </span>
                      <span className="w-20 md:w-24 text-right">
                        <TechnicalLabel text="PS" className="text-black/40" />
                      </span>
                      <span className="w-8" />
                    </div>

                    <div className="divide-y divide-black/[0.06]">
                      {sorted.map((m: any) => {
                        const isCaptain = m.userId === guild.captainId;
                        const isMe = m.userId === user?.id;
                        const isInactive = m.lastActiveAt && (Date.now() - new Date(m.lastActiveAt).getTime()) > 48 * 3600 * 1000;
                        const pts = m.weeklyPointsContributed || 0;
                        const pct = Math.max(3, (pts / maxPts) * 100);
                        const isExpanded = expandedRoster === m.id;
                        const lastNudged = m.lastNudgedAt ? new Date(m.lastNudgedAt).getTime() : 0;
                        const onCooldown = lastNudged > 0 && Date.now() - lastNudged < 24 * 60 * 60 * 1000;
                        return (
                          <div key={m.id} className="relative">
                            {isMe && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-10 md:h-12 w-1 rounded-r-full bg-primary" />
                            )}

                            {/* Row — clickable to expand */}
                            <button
                              onClick={() => setExpandedRoster(isExpanded ? null : m.id)}
                              className={cn(
                                "w-full flex items-center gap-3 md:gap-6 px-4 md:px-8 py-4 md:py-5 text-left transition-colors duration-300",
                                isMe ? "bg-primary/[0.07]" : "hover:bg-black/[0.03]"
                              )}
                            >
                              {/* Avatar — real profile picture w/ fallback */}
                              <img
                                src={m.avatarUrl || m.profilePicture || "/avatars/avatar-1.png"}
                                alt=""
                                className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl border border-black/15 object-cover shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/avatars/avatar-1.png"; }}
                              />

                              <div className="flex-1 min-w-0">
                                <p className="text-sm md:text-base font-black uppercase tracking-tight truncate flex items-center gap-2">
                                  {isMe ? "You" : (m.firstName || m.identity || "Member")}
                                  {isCaptain && (
                                    <span className="shrink-0 bg-black text-white rounded-sm px-1.5 py-0.5 text-[9px] font-black tracking-widest">
                                      CAPTAIN
                                    </span>
                                  )}
                                  {isInactive && (
                                    <span className="shrink-0 bg-white text-black/45 border border-black/15 rounded-sm px-1.5 py-0.5 text-[9px] font-black tracking-widest">
                                      INACTIVE
                                    </span>
                                  )}
                                </p>
                                <p className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-1">
                                  {pts.toLocaleString()} PTS · {pct.toFixed(0)}% OF TOP
                                </p>
                              </div>

                              <div className="w-14 md:w-24 text-right shrink-0">
                                <p className={cn("text-sm md:text-xl font-black tracking-tighter tabular-nums", isMe ? "text-primary" : "text-black")}>
                                  {pts.toLocaleString()}
                                </p>
                                <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.25em] text-black/40">PS</p>
                              </div>

                              <ChevronDown
                                size={16}
                                className={cn(
                                  "shrink-0 text-black/30 transition-transform duration-300 hidden md:block",
                                  isExpanded && "rotate-180"
                                )}
                              />
                            </button>

                            {/* Expanded detail — actions + progress */}
                            {isExpanded && (
                              <div className="px-4 md:px-8 pb-5 pt-1 bg-black/[0.02] space-y-3.5">
                                <Progress value={pct} className="h-2 bg-black/10 border border-black/10 rounded-full [&>div]:bg-primary" />

                                {!isCaptain && !isMe ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      className={cn(CTA_CLASS, "h-9 px-4 text-[10px]")}
                                      disabled={nudgeMutation.isPending || onCooldown}
                                      title={onCooldown ? "Nudged within the last 24h" : "Nudge"}
                                      onClick={() => nudgeMutation.mutate(m.userId)}
                                    >
                                      {nudgeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />}
                                      {onCooldown ? "Nudged" : "Nudge"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      className={cn(OUTLINE_CLASS, "h-9 px-4 text-[10px]")}
                                      onClick={() => { setSelectedDmMember(m.userId); setChatMode("solo"); setTab("chat"); }}
                                    >
                                      <MessageCircle size={12} />
                                      Message
                                    </Button>
                                    {!m.isMvp && !weekMvpSet && (
                                      <Button
                                        size="sm"
                                        className={cn(OUTLINE_CLASS, "h-9 px-4 text-[10px] hover:border-primary hover:text-primary")}
                                        disabled={mvpMutation.isPending}
                                        onClick={() => mvpMutation.mutate(m.userId)}
                                      >
                                        {mvpMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />}
                                        Set MVP
                                      </Button>
                                    )}
                                    <button
                                      className="ml-auto inline-flex items-center justify-center w-9 h-9 rounded-lg border-2 border-black bg-black text-white transition-all duration-150 hover:bg-destructive hover:border-destructive"
                                      title="Kick member"
                                      aria-label={`Remove ${m.firstName || "member"}`}
                                      onClick={() => setKickConfirm(m.userId)}
                                    >
                                      <X size={14} strokeWidth={2.5} />
                                    </button>
                                  </div>
                                ) : isMe ? (
                                  <p className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/35 uppercase">This is you</p>
                                ) : (
                                  <p className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/35 uppercase">Guild captain</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── TASKS ──────────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <GuildTasksPanel />
      )}

      {/* ── CHAT — group + solo unified ─────────────────────────────────── */}
      {tab === "chat" && (
        <div className="space-y-3 md:space-y-4">
          {/* Mode switch — full-width segmented plate */}
          <div className="bg-white rounded-2xl border-2 border-black p-1.5 flex gap-1.5">
            {([
              { id: "group", label: "Group Chat", icon: MessagesSquare },
              { id: "solo", label: "Solo Chat", icon: MessageCircle },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => { setChatMode(m.id); if (m.id === "group") setSelectedDmMember(null); }}
                className={cn(
                  "flex-1 h-11 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200",
                  chatMode === m.id ? "bg-black text-white" : "text-black/55 hover:bg-black/5 hover:text-black"
                )}
              >
                <m.icon size={14} strokeWidth={2} /> {m.label}
              </button>
            ))}
          </div>

          {chatMode === "group" ? (
            /* ── Group chat ── */
            <PremiumCard interactive={false} className="flex flex-col p-0 overflow-hidden h-[520px] md:h-[560px]">
              <div className="px-5 py-4 border-b-2 border-black flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-black border-2 border-black text-white flex items-center justify-center shrink-0">
                    <MessagesSquare size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-sm uppercase tracking-tight truncate">{guild.name}</div>
                    <div className="text-[9px] font-mono font-bold tracking-[0.15em] text-black/40 uppercase">
                      {active.length} MEMBERS
                    </div>
                  </div>
                </div>
                <SectionChip className="hidden sm:inline-flex">GROUP</SectionChip>
              </div>

              {isChatError && (
                <div className="flex-1 flex items-center justify-center p-4">
                  <QueryError message="Could not load messages." onRetry={() => refetchChat()} />
                </div>
              )}

              {!isChatError && (
                <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-2.5 bg-[#F2EDE4]/40">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-14 h-14 rounded-2xl border-2 border-black/10 bg-white flex items-center justify-center mx-auto mb-4">
                        <MessagesSquare size={20} className="text-black/25" />
                      </div>
                      <p className="text-sm font-black uppercase tracking-tight text-black/45 mb-1">No messages yet</p>
                    </div>
                  ) : (
                    chatDayGroups.map(([dayLabel, msgs]) => (
                      <div key={dayLabel} className="space-y-2.5">
                        {/* Day separator — mono label + hairline */}
                        <div className="flex items-center gap-3 py-2">
                          <span className="text-[9px] font-mono font-bold tracking-[0.3em] text-black/35 uppercase whitespace-nowrap">{dayLabel}</span>
                          <div className="h-px flex-1 bg-black/10" />
                        </div>
                        {msgs.map((msg: any, i: number) => {
                          // engine_c_messages stores senderId (not userId/fromUserId) — the
                          // senderId check is what aligns server messages to the right side;
                          // userId/fromUserId cover the optimistic append until refetch.
                          const isMe = msg.senderId === user?.id || msg.userId === user?.id || msg.fromUserId === user?.id;
                          const isPending = !!(msg as any)._optimistic;
                          return (
                            <div key={msg.id ?? `${dayLabel}-${i}`} className={cn("flex items-end gap-2", isMe ? "justify-end" : "justify-start")}>
                              {!isMe && (
                                <div className="w-7 h-7 rounded-lg border-2 border-black bg-[#EAE5DD] flex items-center justify-center text-[10px] font-black shrink-0 overflow-hidden">
                                  <span className="text-black/35">{(msg.senderName || msg.firstName || "M")[0].toUpperCase()}</span>
                                </div>
                              )}
                              <div className={cn(
                                "max-w-[72%] rounded-2xl px-4 py-2.5 text-sm border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]",
                                isMe
                                  ? "bg-black text-white border-black rounded-br-md"
                                  : "bg-white text-black border-black rounded-bl-md",
                                isPending && "opacity-60"
                              )}>
                                {!isMe && (
                                  <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-0.5">
                                    {msg.senderName || msg.firstName || "Member"}
                                  </p>
                                )}
                                <p className="break-words">{msg.message}</p>
                                <p className={cn(
                                  "text-[8px] font-mono font-bold tracking-[0.15em] mt-1 uppercase",
                                  isMe ? "text-white/40" : "text-black/30"
                                )}>
                                  {msg.createdAt ? format(new Date(msg.createdAt), "HH:mm") : "sending…"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <ChatComposer
                value={chatMsg}
                onChange={setChatMsg}
                onSend={(v) => sendChatMutation.mutate(v)}
                placeholder="Message the guild…"
                isPending={sendChatMutation.isPending}
              />
            </PremiumCard>
          ) : (
            /* ── Solo chat — member picker + 1:1 thread ── */
            <div className="space-y-3">
              {!selectedDmMember ? (
                <>
                  {isMembersLoading && (
                    <div className="space-y-2">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-2xl border-2 border-black/10">
                          <SkeletonBlock className="w-10 h-10 rounded-lg" />
                          <div className="space-y-1.5 flex-1">
                            <SkeletonBlock className="h-3 w-28" />
                            <div className="h-3 w-16" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isMembersError && (
                    <PremiumCard interactive={false}>
                      <QueryError message="Could not load member list." onRetry={() => refetchMembers()} />
                    </PremiumCard>
                  )}
                  {!isMembersLoading && !isMembersError && active.filter((m: any) => m.userId !== user?.id).length === 0 && (
                    <EmptyState
                      icon={<MessageCircle size={22} className="text-black/40" />}
                      chip="SOLO CHAT"
                      title="No members to message yet"
                      caption="Active members will appear here."
                    />
                  )}
                  <div className="space-y-2">
                    {active.filter((m: any) => m.userId !== user?.id).map((m: any) => (
                      <button
                        key={m.id}
                        className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border-2 border-black/10 bg-white text-left transition-all duration-200 hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => setSelectedDmMember(m.userId)}
                      >
                        <AvatarStamp name={m.firstName || m.identity} avatarUrl={m.avatarUrl} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm text-black tracking-tight truncate">
                            {m.firstName || m.identity || "Member"}
                          </div>
                          <div className="text-[9px] font-mono font-bold tracking-[0.15em] text-black/40 uppercase mt-0.5">
                            {(m.weeklyPointsContributed || 0).toLocaleString()} PTS THIS WEEK
                          </div>
                        </div>
                        <span className="w-9 h-9 rounded-full border-2 border-black/15 group-hover:border-black group-hover:bg-black group-hover:text-white flex items-center justify-center text-black/40 transition-all shrink-0">
                          <ArrowRight size={14} strokeWidth={2} />
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <PremiumCard interactive={false} className="flex flex-col p-0 overflow-hidden h-[520px] md:h-[560px]">
                  <div className="px-4 py-3.5 border-b-2 border-black flex items-center gap-3 bg-white">
                    <button
                      className="w-9 h-9 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shrink-0 hover:bg-primary transition-colors"
                      onClick={() => setSelectedDmMember(null)}
                      aria-label="Back to member list"
                    >
                      <ArrowLeft size={14} strokeWidth={2} />
                    </button>
                    <AvatarStamp
                      name={active.find((m: any) => m.userId === selectedDmMember)?.firstName || active.find((m: any) => m.userId === selectedDmMember)?.identity}
                      avatarUrl={active.find((m: any) => m.userId === selectedDmMember)?.avatarUrl}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-black tracking-tight truncate">
                        {active.find((m: any) => m.userId === selectedDmMember)?.firstName || "Member"}
                      </div>
                      <div className="text-[8px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-0.5">Direct Message</div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  </div>

                  {isDmError && (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <QueryError message="Could not load messages." onRetry={() => refetchDm()} />
                    </div>
                  )}

                  {!isDmError && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#F2EDE4]/40">
                      {dmMessages.length === 0 ? (
                        <div className="text-center py-16">
                          <div className="w-14 h-14 rounded-2xl border-2 border-black/10 bg-white flex items-center justify-center mx-auto mb-4">
                            <MessageCircle size={20} className="text-black/25" />
                          </div>
                          <p className="text-sm font-black uppercase tracking-tight text-black/45 mb-1">No messages yet</p>
                        </div>
                      ) : dmMessages.map((msg: any, i) => (
                        <div key={msg.id ?? i} className={cn("flex items-end", msg.fromUserId === user?.id ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[72%] rounded-2xl px-4 py-2.5 text-sm border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]",
                            msg.fromUserId === user?.id
                              ? "bg-black text-white border-black rounded-br-md"
                              : "bg-white text-black border-black rounded-bl-md"
                          )}>
                            <p className="break-words">{msg.message}</p>
                            <p className={cn(
                              "text-[8px] font-mono font-bold tracking-[0.15em] mt-1 uppercase",
                              msg.fromUserId === user?.id ? "text-white/40" : "text-black/30"
                            )}>
                              {msg.createdAt ? format(new Date(msg.createdAt), "HH:mm") : "sending…"}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={dmEndRef} />
                    </div>
                  )}

                  <ChatComposer
                    value={dmMsg}
                    onChange={setDmMsg}
                    onSend={(v) => sendDmMutation.mutate(v)}
                    placeholder="Message member…"
                    isPending={sendDmMutation.isPending}
                  />
                </PremiumCard>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── WEEKLY STATS ────────────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-4 md:space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: "GPS SCORE", value: (guild.guildPerformanceScore || 0).toLocaleString(), accent: true },
              { label: "MEMBERS", value: active.length.toLocaleString() },
              { label: "WEEKLY TARGET", value: (guild.weeklyTarget || 0).toLocaleString(), accent: false },
              { label: "SUCCESS WEEKS", value: weeklyHistory.filter((s: any) => s.wasSuccessful).length.toLocaleString(), accent: false },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border-2 border-black p-4 md:p-5">
                <TechnicalLabel text={s.label} className="text-black/40 text-[10px] mb-2" />
                <div className={cn("font-black text-xl md:text-2xl tracking-tight tabular-nums", s.accent ? "text-primary" : "text-black")}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <SectionChip>PERFORMANCE HISTORY · LAST 8 WEEKS</SectionChip>

          {isHistoryLoading && (
            <PremiumCard interactive={false} className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonBlock className="w-5 h-5 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonBlock className="h-3 w-40" />
                    <SkeletonBlock className="h-2.5 w-full" />
                  </div>
                </div>
              ))}
            </PremiumCard>
          )}

          {isHistoryError && (
            <PremiumCard interactive={false}>
              <QueryError message="Could not load performance history." onRetry={() => refetchHistory()} />
            </PremiumCard>
          )}

          {!isHistoryLoading && !isHistoryError && weeklyHistory.length === 0 && (
            <EmptyState
              icon={<GiWarhammer size={22} className="text-black/40" />}
              chip="PERFORMANCE HISTORY"
              title="No history yet"
              caption="Stats will appear after your first completed week."
            />
          )}

          {!isHistoryLoading && !isHistoryError && weeklyHistory.length > 0 && (
            <PremiumCard interactive={false} className="space-y-4">
              {weeklyHistory.map((snap: any, i: number) => {
                const pct = snap.targetPoints > 0
                  ? Math.min(150, (snap.achievedPoints / snap.targetPoints) * 100)
                  : 0;
                return (
                  <div key={snap.id} className="flex items-center gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded-full shrink-0 border-2 border-black/10",
                      snap.wasSuccessful ? "bg-primary" : "bg-black/20"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5">
                        <span className="text-black/45">Week {weeklyHistory.length - i}</span>
                        <span className="text-black/50">
                          {snap.achievedPoints?.toLocaleString()}
                          {" / "}
                          {snap.targetPoints?.toLocaleString()} PTS
                          <span className="ml-1">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <Progress value={Math.min(100, pct)} className="h-2 bg-black/10 border-2 border-black/10 rounded-full [&>div]:bg-primary" />
                    </div>
                    <span className={cn(
                      "shrink-0 inline-flex items-center px-2.5 py-1 rounded-md font-black uppercase tracking-[0.2em] text-[10px] border-2",
                      snap.wasSuccessful ? "bg-black text-white border-black" : "bg-white text-black/50 border-black/15"
                    )}>
                      {snap.wasSuccessful ? "MET" : "MISSED"}
                    </span>
                  </div>
                );
              })}
            </PremiumCard>
          )}
        </div>
      )}

      {/* ── WARS ────────────────────────────────────────────────────────── */}
      {tab === "wars" && guildId && (
        <GuildWarsPanel guildId={guildId} isCaptain={true} />
      )}

      {/* ── DISCOVER ───────────────────────────────────────────────────── */}
      {tab === "discover" && (
        <GuildDiscoveryPanel />
      )}

      {/* ── SETTINGS — GUILD | ME (auth-page design language) ──────────── */}
      {tab === "settings" && (
        <div className="space-y-4">
          {/* Mode switch — GUILD | ME (text-only) */}
          <div className="bg-white rounded-2xl border-2 border-black p-1.5 flex gap-1.5">
            {([
              { id: "guild", label: "Guild" },
              { id: "profile", label: "Me" },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setSettingsView(m.id)}
                className={cn(
                  "flex-1 h-12 rounded-xl text-xs font-black uppercase tracking-[0.25em] transition-all duration-200",
                  settingsView === m.id
                    ? "bg-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)]"
                    : "text-black/45 hover:text-black"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {settingsView === "guild" && settingsForm && (
          <div className="space-y-5">

          <PremiumCard interactive={false} className="p-5 md:p-8">

            <div className="space-y-6">
              <GroupLabel text="Identity" />
              <div>
                <FieldLabel>Guild Name</FieldLabel>
                <Input
                  value={settingsForm.name}
                  onChange={e => setGiCogForm((f: any) => ({ ...f, name: e.target.value }))}
                  className={cn(FIELD_CLASS, "h-auto py-3 text-base md:text-lg")}
                />
              </div>

              <div>
                <FieldLabel hint={`${settingsForm.description.length}/500`}>Description</FieldLabel>
                <div className="relative">
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={settingsForm.description}
                    onChange={e => setGiCogForm((f: any) => ({ ...f, description: e.target.value }))}
                    className={cn(FIELD_AREA_CLASS, "min-h-[100px] py-3 px-4 text-base md:text-lg")}
                  />
                  {!settingsForm.description && (
                    <div className="absolute top-3 left-4 right-4 pointer-events-none text-base md:text-lg">
                      <AnimatedPlaceholder examples={DESCRIPTION_SUGGESTIONS} />
                    </div>
                  )}
                </div>
              </div>

              {/* Guild profile picture — round preview, stacked on mobile */}
              <div>
                <FieldLabel>Profile Picture</FieldLabel>
                <div className="rounded-2xl bg-[#EAE5DD]/30 border-2 border-black/10 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-20 h-20 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 border-black bg-[#EAE5DD] flex items-center justify-center shrink-0 mx-auto sm:mx-0">
                    {settingsForm.avatarUrl ? (
                      <img src={settingsForm.avatarUrl} alt="Guild profile preview" className="w-full h-full object-cover" />
                    ) : (
                      <GiSpartanHelmet className="w-6 h-6 text-black/30" />
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
                    <label className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-black text-white text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-primary transition-colors w-full sm:w-auto">
                      {settingsForm.avatarUrl ? "Change Picture" : "Upload Picture"}
                      <input type="file" accept="image/*" className="sr-only" onChange={handleGuildAvatarChange} />
                    </label>
                    {settingsForm.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setGiCogForm((f: any) => ({ ...f, avatarUrl: null }))}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-lg border-2 border-black/15 text-[10px] font-black uppercase tracking-widest text-black/50 hover:border-destructive hover:text-destructive transition-colors w-full sm:w-auto"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <GroupLabel text="Recruitment" />
              <div>
                <FieldLabel>Min Rank to Join</FieldLabel>
                <SelectField
                  value={settingsForm.minRankRequired}
                  onChange={e => setGiCogForm((f: any) => ({ ...f, minRankRequired: e.target.value }))}
                >
                  {RANK_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
                </SelectField>
              </div>

              <div>
                <FieldLabel>Recruitment</FieldLabel>
                <SegmentedToggle
                  options={[{ v: true, l: "Open" }, { v: false, l: "Closed" }].map(o => ({ value: o.v, label: o.l }))}
                  value={settingsForm.recruitmentOpen}
                  onChange={v => setGiCogForm((f: any) => ({ ...f, recruitmentOpen: v }))}
                />
              </div>

              <GroupLabel text="Weekly Target" />
              {/* Weekly target — admin-only, read-only for captains */}
              <div className="bg-white border-2 border-black rounded-2xl px-5 py-5 flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-3xl md:text-4xl tracking-tighter tabular-nums text-black leading-none">
                    {(guild.weeklyTarget || 0).toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono font-bold tracking-[0.3em] text-black/40 uppercase mt-1.5">PTS / WEEK</div>
                </div>
                <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-md bg-[#EAE5DD] border-2 border-black/10 text-black/50 font-black uppercase tracking-[0.2em] text-[9px]">
                  Set by admin
                </span>
              </div>
            </div>

            <Button
              className="w-full mt-7 bg-black text-white font-black text-sm uppercase tracking-widest py-4 h-auto border-2 border-black rounded-lg hover:bg-primary hover:border-primary transition-colors disabled:opacity-50"
              disabled={settingsMutation.isPending}
              onClick={() => {
                if (!settingsForm.name || settingsForm.name.trim().length < 3) {
                  toast({ title: "Guild name must be at least 3 characters.", variant: "destructive" }); return;
                }
                if (settingsForm.name.trim().length > 60) {
                  toast({ title: "Guild name cannot exceed 60 characters.", variant: "destructive" }); return;
                }
                settingsMutation.mutate(settingsForm);
              }}
            >
              {settingsMutation.isPending
                ? <><GiSwordSpin className="w-4 h-4 animate-spin mr-2" />Saving…</>
                : "Save Settings"}
            </Button>
          </PremiumCard>

          {/* Assistant Captain */}
          <PremiumCard interactive={false} className="p-5 md:p-8">
            <GroupLabel text="Assistant Captain" />

            {guild.assistantCaptainId ? (
              <AssistantPermissionsEditor
                guildId={guildId}
                assistantName={active.find((m: any) => m.userId === guild.assistantCaptainId)?.firstName || "Assistant"}
                currentPermissions={(guild.assistantPermissions as string[]) || []}
                onRemove={() => {
                  apiRequest("DELETE", `/api/guilds/${guildId}/assistant-captain`)
                    .then(() => {
                      toast({ title: "Assistant Captain removed." });
                      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
                    })
                    .catch((err: any) => toast({ title: "Error", description: err?.message ?? "Could not remove assistant captain.", variant: "destructive" }));
                }}
              />
            ) : (
              <div className="space-y-3">
                <SelectField
                  defaultValue=""
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    try {
                      await apiRequest("POST", `/api/guilds/${guildId}/assistant-captain`, { memberId: e.target.value });
                      toast({ title: "Assistant Captain appointed!" });
                      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
                    } catch (err: any) {
                      toast({ title: "Error", description: err?.message, variant: "destructive" });
                    }
                  }}
                >
                  <option value="">— Select a member —</option>
                  {active.filter((m: any) => m.userId !== user?.id).map((m: any) => (
                    <option key={m.userId} value={m.userId}>
                      {m.firstName || m.identity || "Member"} ({m.userRankTier})
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
          </PremiumCard>

          {/* Announcements */}
          <PremiumCard interactive={false} className="p-5 md:p-8">
            <GroupLabel text="Announcements" />
            <div className="relative">
              <textarea
                rows={3}
                maxLength={500}
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                placeholder=" "
                className={cn(FIELD_AREA_CLASS, "min-h-[100px] py-3 px-4 text-base md:text-lg")}
              />
              {!announcementText && (
                <div className="absolute top-3 left-4 right-4 pointer-events-none text-base md:text-lg">
                  <AnimatedPlaceholder examples={ANNOUNCEMENT_SUGGESTIONS} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className={cn("text-[10px] font-black uppercase tracking-wider", announcementText.length > 480 ? "text-destructive" : "text-black/40")}>
                {announcementText.length}/500
              </span>
              <button
                className="inline-flex items-center gap-2 bg-black text-white font-black text-[11px] uppercase tracking-widest py-3 px-6 border-2 border-black rounded-lg hover:bg-primary hover:border-primary transition-colors disabled:opacity-50"
                disabled={announcementText.trim().length === 0 || announcementMutation.isPending}
                onClick={() => announcementMutation.mutate(announcementText.trim())}
              >
                <Megaphone size={13} />
                {announcementMutation.isPending ? "Posting…" : "Post"}
              </button>
            </div>
          </PremiumCard>
          </div>
          )}

          {settingsView === "profile" && guildId && guild && (
            <PremiumCard interactive={false} className="p-5 md:p-8">
              <GuildProfileWizard guildId={guildId} guildName={guild.name} mode="edit" />
            </PremiumCard>
          )}
        </div>
      )}

      </div>{/* end tab content */}

      {/* ── Reject modal — ModalShell (bottom sheet mobile / centered desktop) ── */}
      {rejectModal && (
        <ModalShell
          onClose={() => { setRejectModal(null); setRejectReason(""); }}
          footer={
            <div className="flex gap-2.5">
              <Button
                className={cn(OUTLINE_CLASS, "flex-1")}
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
              >
                Cancel
              </Button>
              <Button
                className={cn(CTA_CLASS, "flex-1")}
                disabled={rejectReason.trim().length < 10 || appActionMutation.isPending}
                onClick={() => appActionMutation.mutate({ appId: rejectModal.appId, action: "reject", reason: rejectReason })}
              >
                {appActionMutation.isPending ? <GiSwordSpin size={14} className="animate-spin" /> : null}
                Reject
              </Button>
            </div>
          }
        >
          <div className="flex items-center justify-between gap-2">
            <SectionChip>REJECT APPLICATION</SectionChip>
            <button
              onClick={() => { setRejectModal(null); setRejectReason(""); }}
              className={ICON_BTN_CLASS}
              aria-label="Close"
            >
              <GiSkullCrossedBones size={14} />
            </button>
          </div>
          <p className="font-black text-lg tracking-tight text-black">Reject {rejectModal.applicantName}?</p>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <TechnicalLabel text="REASON · MIN 10 CHARS · REQUIRED" className="text-black/50 text-[10px]" />
              <span className={cn("text-[10px] font-black tabular-nums", rejectReason.length < 10 ? "text-destructive" : "text-black/50")}>
                {rejectReason.length} chars
              </span>
            </div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Explain why you're rejecting this application…"
              className={cn(FIELD_AREA_CLASS, "min-h-[100px]")}
            />
          </div>
        </ModalShell>
      )}

      {/* ── Kick confirm modal — ModalShell ── */}
      {kickConfirm && (
        <ModalShell
          onClose={() => setKickConfirm(null)}
          footer={
            <div className="flex gap-2.5">
              <Button
                className={cn(OUTLINE_CLASS, "flex-1")}
                onClick={() => setKickConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                className={cn(DESTRUCTIVE_CLASS, "flex-1")}
                disabled={kickMutation.isPending}
                onClick={() => kickMutation.mutate(kickConfirm)}
              >
                {kickMutation.isPending ? <GiSwordSpin size={14} className="animate-spin" /> : null}
                Remove
              </Button>
            </div>
          }
        >
          <SectionChip>REMOVE MEMBER</SectionChip>
          <p className="font-black text-lg tracking-tight text-black mt-3">Remove this member?</p>
          <p className="text-sm text-black/50 font-medium mt-1">They will need to re-apply to join again.</p>
        </ModalShell>
      )}

      </div>{/* end main column — sidebar layout */}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AssistantPermissionsEditor — toggle individual permissions for the assistant
// ─────────────────────────────────────────────────────────────────────────────
const ASSISTANT_PERMISSIONS: { key: string; label: string; description: string }[] = [
  { key: "join_applications",   label: "Join Applications",  description: "Accept or reject member applications" },
  { key: "guild_announcements", label: "Announcements",      description: "Post and delete guild announcements" },
  { key: "guild_settings",      label: "Guild Settings",  description: "Update name, description, and banner" },
  { key: "min_rank_required",   label: "Min Rank",           description: "Change minimum rank requirement" },
  { key: "recruitment_toggle",  label: "Recruitment",        description: "Open or close guild recruitment" },
  { key: "member_capacity",     label: "Capacity",           description: "Change maximum member count" },
  { key: "avatar_update",       label: "Avatar",             description: "Update guild avatar/photo" },
  { key: "member_nudge",        label: "Nudge Members",      description: "Send reminder nudges to members" },
  { key: "mvp_set",             label: "Set MVP",            description: "Designate the weekly MVP member" },
  { key: "pinned_member",       label: "Pin Member",         description: "Pin a featured member to the profile" },
  { key: "member_remove",       label: "Remove Members",     description: "Kick members from the guild" },
];

function AssistantPermissionsEditor({
  guildId,
  assistantName,
  currentPermissions,
  onRemove,
}: {
  guildId: string;
  assistantName: string;
  currentPermissions: string[];
  onRemove: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [perms, setPerms] = useState<string[]>(currentPermissions);
  const [dirty, setDirty] = useState(false);

  const permsMutation = useMutation({
    mutationFn: async (permissions: string[]) => {
      const r = await apiRequest("PATCH", `/api/guilds/${guildId}/assistant-captain/permissions`, { permissions });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Permissions saved." });
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const toggle = (key: string) => {
    setPerms(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      setDirty(true);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-black/55">
          Current: <strong className="text-black">{assistantName}</strong>
        </div>
        <button
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-2 border-destructive/40 text-destructive font-black uppercase tracking-wider text-[10px] hover:border-destructive hover:bg-destructive/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <GiCrossedAxes size={12} />
          Remove
        </button>
      </div>

      <SectionChip>PERMISSIONS</SectionChip>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {ASSISTANT_PERMISSIONS.map(p => {
          const enabled = perms.includes(p.key);
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              className={cn(
                "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all text-xs min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                enabled
                  ? "border-primary bg-primary/10 text-black"
                  : "border-black/15 bg-white text-black/55 hover:border-black/40 hover:bg-black/[0.03]"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                enabled ? "bg-primary border-primary" : "border-black/30"
              )}>
                {enabled && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold">{p.label}</div>
                <div className="text-[10px] text-black/40">{p.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {dirty && (
        <Button
          className={cn(CTA_CLASS, "w-full")}
          disabled={permsMutation.isPending}
          onClick={() => permsMutation.mutate(perms)}
        >
          {permsMutation.isPending ? <GiSwordSpin size={13} className="animate-spin" /> : null}
          Save Permissions
        </Button>
      )}
    </div>
  );
}

export default CaptainPortal;
