/**
 * CaptainPortal — THORX v3 (spec F.8, Phase 3 redesign)
 * Default Engine C view for guild captains (guildRole='captain').
 * Tabs: Requests | Roster | DM Hub | Weekly Stats | Settings
 * NEVER shows PKR pool amounts to users — only after distribution.
 */
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  Megaphone, Users, MessageCircle, BarChart3, Settings,
  CheckCircle, XCircle, Star, Send, Bell, Sword, Crown, Target,
  MessagesSquare, Loader2, Swords, UserPlus, UserMinus, Shield,
  AlertTriangle, RefreshCw, Flame, ArrowLeft, ChevronRight,
  ImagePlus, Trash2,
} from "lucide-react";
import { GuildWarsPanel } from "./GuildWarsPanel";
import { GuildProfileWizard } from "./GuildProfileWizard";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Tab = "requests" | "roster" | "chat" | "dm" | "stats" | "settings" | "wars" | "profile";

/** Small icon chip matching the premium icon-chip spec */
function IconChip({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0">
      <Icon className="w-4 h-4 text-primary" />
    </div>
  );
}

/** Inline error/retry pattern — matches DashboardCards.tsx retry style */
function QueryError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 py-3">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
      <span className="text-sm text-red-400">{message ?? "Failed to load."}</span>
      <button
        onClick={onRetry}
        className="text-red-400 text-sm font-bold uppercase tracking-wider hover:underline ml-1"
      >
        Retry
      </button>
    </div>
  );
}

export function CaptainPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("requests");
  const [rejectModal, setRejectModal] = useState<{ appId: string; applicantName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);
  const [selectedDmMember, setSelectedDmMember] = useState<string | null>(null);
  const [dmMsg, setDmMsg] = useState("");
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const guildId = user?.guildId;

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
    refetchInterval: 15000,
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
    refetchInterval: 15000,
  });

  // Pending applications
  const pending = members.filter((m: any) => m.status === "pending");
  const active  = members.filter((m: any) => m.status === "active");

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

  // DM messages
  const {
    data: dmMessages = [],
    isError: isDmError,
    refetch: refetchDm,
  } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "private-chat", selectedDmMember],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/private-chat/${selectedDmMember}`); const d = await r.json(); return d.messages ?? []; },
    enabled: !!guildId && !!selectedDmMember && tab === "dm",
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
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const nudgeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/members/${memberId}/nudge`);
      return r.json();
    },
    onSuccess: () => toast({ title: "Nudge sent!" }),
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const mvpMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/members/${memberId}/mvp`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "MVP Selected!", description: "+200 GPS awarded to the guild." });
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
        setSettingsForm((f: any) => ({ ...f, weeklyTarget: data.guild.weeklyTarget }));
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

  useEffect(() => {
    if (guild && !settingsForm) {
      setSettingsForm({
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
        setSettingsForm((current: any) => ({
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
    { id: "requests", label: "Requests",     icon: Sword,          badge: pending.length },
    { id: "roster",   label: "Roster",       icon: Users },
    { id: "chat",     label: "Guild Chat",   icon: MessagesSquare },
    { id: "dm",       label: "Private Chat", icon: MessageCircle },
    { id: "wars",     label: "Wars",         icon: Swords },
    { id: "profile",  label: "My Profile",   icon: Shield },
    { id: "stats",    label: "Stats",        icon: BarChart3 },
    { id: "settings", label: "Settings",     icon: Settings },
  ];

  // ── Loading / no-guild guard ──────────────────────────────────────────────
  if (!guildId || (isGuildLoading && !guild)) return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <PremiumCard interactive={false} className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
        <Skeleton className="h-4 w-20 rounded" />
      </PremiumCard>
      {/* Tabs skeleton */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-20 rounded-xl shrink-0" />
        ))}
      </div>
      {/* Content skeleton */}
      <PremiumCard interactive={false} className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3 rounded" />
              <Skeleton className="h-3 w-1/4 rounded" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </PremiumCard>
    </div>
  );

  // Guild query error guard
  if (isGuildError) return (
    <PremiumCard interactive={false}>
      <QueryError message="Could not load guild data." onRetry={() => refetchGuild()} />
    </PremiumCard>
  );

  return (
    <div className="space-y-4 md:space-y-6">

      {/* ── Captain Header ─────────────────────────────────────────────── */}
      <PremiumCard interactive={false} className="p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconChip icon={Crown} />
            <div>
              <div className="font-black text-foreground text-lg leading-tight">{guild.name}</div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                  {(guild.guildPerformanceScore || 0).toLocaleString()} GPS
                </span>
                <span className="text-xs text-muted-foreground">
                  {active.length} member{active.length === 1 ? "" : "s"}
                </span>
                {(guild.weeklyTarget ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Target: <span className="font-semibold text-foreground">{(guild.weeklyTarget || 0).toLocaleString()} pts/wk</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="self-start sm:self-auto shrink-0 font-bold text-xs uppercase tracking-wider">
            Captain
          </Badge>
        </div>
      </PremiumCard>

      {/* ── Active announcement preview ─────────────────────────────────── */}
      {guild.latestAnnouncement && (
        <PremiumCard interactive={false} className="border-primary/40 bg-primary/5 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0 mt-0.5">
              <Megaphone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <TechnicalLabel text="Active Announcement" className="text-primary text-xs mb-1" />
              <p className="text-sm text-foreground break-words">{guild.latestAnnouncement}</p>
              {guild.announcementPostedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Posted {formatDistanceToNow(new Date(guild.announcementPostedAt), { addSuffix: true })}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-8 text-xs"
              onClick={() => clearAnnouncementMutation.mutate()}
              disabled={clearAnnouncementMutation.isPending}
            >
              {clearAnnouncementMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Clear"}
            </Button>
          </div>
        </PremiumCard>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex-shrink-0 flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all duration-200",
                isActive
                  ? "bg-foreground border-foreground text-background shadow-[3px_3px_0px_0px_rgba(0,0,0,0.4)]"
                  : "bg-white border-black/20 text-muted-foreground hover:border-black/60 hover:text-foreground"
              )}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{t.label}</span>
              {(t.badge ?? 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-black border-2 border-white">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── REQUESTS ────────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between">
            <TechnicalLabel text={`Pending Requests${pending.length > 0 ? ` (${pending.length})` : ""}`} className="text-foreground" />
          </div>

          {isMembersLoading && (
            <div className="space-y-3">
              {[0, 1].map(i => (
                <PremiumCard key={i} interactive={false} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32 rounded" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <Skeleton className="h-9 w-20 rounded-lg" />
                  </div>
                </PremiumCard>
              ))}
            </div>
          )}

          {isMembersError && (
            <PremiumCard interactive={false}>
              <QueryError message="Could not load applications." onRetry={() => refetchMembers()} />
            </PremiumCard>
          )}

          {!isMembersLoading && !isMembersError && pending.length === 0 && (
            <PremiumCard interactive={false} className="text-center py-16">
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl w-fit mx-auto mb-3">
                <UserPlus className="w-6 h-6 text-primary" />
              </div>
              <p className="font-bold text-foreground">No pending applications</p>
              <p className="text-sm text-muted-foreground mt-1">New applicants will appear here for review.</p>
            </PremiumCard>
          )}

          {!isMembersLoading && !isMembersError && pending.map((app: any) => (
            <PremiumCard key={app.id} interactive={false} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg shrink-0">
                    <UserPlus className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground">{app.firstName || app.identity || "Applicant"}</span>
                      <RankBadge rank={app.userRankTier || "E-Rank"} size="sm" />
                      <span className="text-xs text-muted-foreground font-semibold">{app.performanceScore || 0} PS</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Joined Thorx {app.createdAt ? formatDistanceToNow(new Date(app.createdAt), { addSuffix: true }) : "recently"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 sm:mt-0">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-10 px-4 text-xs font-bold"
                    disabled={appActionMutation.isPending}
                    onClick={() => appActionMutation.mutate({ appId: app.id, action: "accept" })}
                  >
                    <CheckCircle size={13} className="mr-1" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-10 px-4 text-xs font-bold"
                    onClick={() => setRejectModal({ appId: app.id, applicantName: app.firstName || "this applicant" })}
                  >
                    <XCircle size={13} className="mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
              {app.coverLetter && (
                <div className="bg-muted/50 border border-black/10 rounded-xl p-3 text-sm text-muted-foreground italic">
                  "{app.coverLetter}"
                </div>
              )}
            </PremiumCard>
          ))}
        </div>
      )}

      {/* ── ROSTER ──────────────────────────────────────────────────────── */}
      {tab === "roster" && (
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between">
            <TechnicalLabel
              text={`Guild Roster — ${active.length} member${active.length === 1 ? "" : "s"}`}
              className="text-foreground"
            />
          </div>

          {isMembersLoading && (
            <PremiumCard interactive={false} className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              ))}
            </PremiumCard>
          )}

          {isMembersError && (
            <PremiumCard interactive={false}>
              <QueryError message="Could not load roster." onRetry={() => refetchMembers()} />
            </PremiumCard>
          )}

          {!isMembersLoading && !isMembersError && active.length === 0 && (
            <PremiumCard interactive={false} className="text-center py-16">
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl w-fit mx-auto mb-3">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <p className="font-bold text-foreground">No active members yet</p>
              <p className="text-sm text-muted-foreground mt-1">Review pending applications to build your team.</p>
            </PremiumCard>
          )}

          {!isMembersLoading && !isMembersError && active.length > 0 && (
            <PremiumCard interactive={false} className="overflow-hidden p-0">
              <div className="divide-y divide-black/8">
                {active
                  .sort((a: any, b: any) => (b.weeklyPointsContributed || 0) - (a.weeklyPointsContributed || 0))
                  .map((m: any, i: number) => {
                    const isCaptain = m.userId === guild.captainId;
                    const isMe = m.userId === user?.id;
                    const isInactive = m.lastActiveAt && (Date.now() - new Date(m.lastActiveAt).getTime()) > 48 * 3600 * 1000;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex items-center justify-between px-5 py-3 gap-3 transition-colors",
                          isMe ? "bg-primary/5" : "hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 flex items-center justify-center shrink-0">
                            {isCaptain
                              ? <Crown size={16} className="text-primary" />
                              : <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                            }
                          </div>
                          {m.isMvp && <Star size={13} className="text-yellow-500 fill-yellow-500 shrink-0" />}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={cn("font-bold text-sm truncate", isMe && "text-primary")}>
                                {isMe ? "You" : (m.firstName || m.identity || "Member")}
                              </span>
                              <RankBadge rank={m.userRankTier || "E-Rank"} size="sm" showLabel={false} />
                              {isCaptain && (
                                <TechnicalLabel text="Captain" className="text-primary text-[10px]" />
                              )}
                              {isInactive && (
                                <TechnicalLabel text="Inactive" className="text-red-500 text-[10px]" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {(m.weeklyPointsContributed || 0).toLocaleString()} pts this week
                            </p>
                          </div>
                        </div>
                        {!isCaptain && !isMe && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 w-9 p-0 border-black/20 hover:border-black hover:text-foreground"
                              title="Nudge"
                              disabled={nudgeMutation.isPending}
                              onClick={() => nudgeMutation.mutate(m.userId)}
                            >
                              {nudgeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 w-9 p-0 border-black/20 hover:border-black hover:text-foreground"
                              title="DM"
                              onClick={() => { setSelectedDmMember(m.userId); setTab("dm"); }}
                            >
                              <MessageCircle size={13} />
                            </Button>
                            {!m.isMvp && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 w-9 p-0 border-black/20 hover:border-yellow-500 hover:text-yellow-500"
                                title="Set MVP"
                                disabled={mvpMutation.isPending}
                                onClick={() => mvpMutation.mutate(m.userId)}
                              >
                                {mvpMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-9 w-9 p-0"
                              title="Kick member"
                              onClick={() => setKickConfirm(m.userId)}
                            >
                              <UserMinus size={13} />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </PremiumCard>
          )}
        </div>
      )}

      {/* ── GUILD CHAT ──────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <PremiumCard interactive={false} className="flex flex-col p-0 overflow-hidden h-[460px] max-h-[60vh] min-h-[280px]">
          <div className="px-5 py-3 border-b-2 border-black/10">
            <div className="flex items-center gap-2">
              <IconChip icon={MessagesSquare} />
              <div>
                <div className="font-bold text-foreground text-sm">{guild.name} — Guild Chat</div>
                <p className="text-xs text-muted-foreground">Visible to all active members</p>
              </div>
            </div>
          </div>

          {isChatError && (
            <div className="flex-1 flex items-center justify-center p-4">
              <QueryError message="Could not load messages." onRetry={() => refetchChat()} />
            </div>
          )}

          {!isChatError && (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {chatMessages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-12">
                  No messages yet. Say hello to your guild!
                </div>
              ) : chatMessages.map((msg: any, i: number) => {
                const isMe = msg.userId === user?.id || msg.fromUserId === user?.id;
                return (
                  <div key={i} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                      isMe
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground border border-black/10"
                    )}>
                      {!isMe && (
                        <p className="text-[10px] font-bold text-muted-foreground mb-0.5">
                          {msg.senderName || msg.firstName || "Member"}
                        </p>
                      )}
                      {msg.message}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          )}

          <div className="px-4 py-3 border-t-2 border-black/10 flex gap-2">
            <Input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              placeholder="Message the guild…"
              className="flex-1 h-10 text-sm"
              maxLength={500}
              onKeyDown={e => {
                if (e.key === "Enter" && chatMsg.trim() && chatMsg.length <= 500)
                  sendChatMutation.mutate(chatMsg.trim());
              }}
            />
            <Button
              size="sm"
              className="h-10 w-10 p-0 shrink-0"
              aria-label="Send message"
              disabled={!chatMsg.trim() || chatMsg.length > 500 || sendChatMutation.isPending}
              onClick={() => sendChatMutation.mutate(chatMsg.trim())}
            >
              {sendChatMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </PremiumCard>
      )}

      {/* ── DM HUB ──────────────────────────────────────────────────────── */}
      {tab === "dm" && (
        <div className="space-y-3 md:space-y-4">
          {!selectedDmMember ? (
            <>
              <TechnicalLabel text="Select a member to message" className="text-foreground" />
              {isMembersLoading && (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <PremiumCard key={i} interactive={false} className="flex items-center gap-3 p-4">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-28 rounded" />
                        <Skeleton className="h-3 w-16 rounded" />
                      </div>
                    </PremiumCard>
                  ))}
                </div>
              )}
              {isMembersError && (
                <PremiumCard interactive={false}>
                  <QueryError message="Could not load member list." onRetry={() => refetchMembers()} />
                </PremiumCard>
              )}
              {!isMembersLoading && !isMembersError && active.filter((m: any) => m.userId !== user?.id).length === 0 && (
                <PremiumCard interactive={false} className="text-center py-10">
                  <p className="text-muted-foreground text-sm">No other members to message yet.</p>
                </PremiumCard>
              )}
              <div className="space-y-2">
                {active.filter((m: any) => m.userId !== user?.id).map((m: any) => (
                  <button
                    key={m.id}
                    className="w-full text-left"
                    onClick={() => setSelectedDmMember(m.userId)}
                  >
                    <PremiumCard interactive className="flex items-center gap-3 p-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-black text-primary shrink-0">
                        {(m.firstName || "M")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground text-sm truncate">
                          {m.firstName || m.identity || "Member"}
                        </div>
                        <RankBadge rank={m.userRankTier || "E-Rank"} size="sm" />
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    </PremiumCard>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <PremiumCard interactive={false} className="flex flex-col p-0 overflow-hidden h-[420px] max-h-[60vh] min-h-[280px]">
              <div className="px-4 py-3 border-b-2 border-black/10 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0 border-black/20"
                  onClick={() => setSelectedDmMember(null)}
                  aria-label="Back to member list"
                >
                  <ArrowLeft size={14} />
                </Button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-black text-primary">
                    {(active.find((m: any) => m.userId === selectedDmMember)?.firstName || "M")[0].toUpperCase()}
                  </div>
                  <span className="font-bold text-foreground text-sm">
                    {active.find((m: any) => m.userId === selectedDmMember)?.firstName || "Member"}
                  </span>
                </div>
              </div>

              {isDmError && (
                <div className="flex-1 flex items-center justify-center p-4">
                  <QueryError message="Could not load messages." onRetry={() => refetchDm()} />
                </div>
              )}

              {!isDmError && (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {dmMessages.map((msg: any, i) => (
                    <div key={i} className={cn("flex", msg.fromUserId === user?.id ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                        msg.fromUserId === user?.id
                          ? "bg-foreground text-background"
                          : "bg-muted text-foreground border border-black/10"
                      )}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-3 border-t-2 border-black/10 flex gap-2">
                <Input
                  value={dmMsg}
                  onChange={e => setDmMsg(e.target.value)}
                  placeholder="Message member…"
                  className="flex-1 h-10 text-sm"
                  maxLength={500}
                  onKeyDown={e => {
                    if (e.key === "Enter" && dmMsg.trim() && dmMsg.length <= 500)
                      sendDmMutation.mutate(dmMsg.trim());
                  }}
                />
                <Button
                  size="sm"
                  className="h-10 w-10 p-0 shrink-0"
                  aria-label="Send message"
                  disabled={!dmMsg.trim() || dmMsg.length > 500 || sendDmMutation.isPending}
                  onClick={() => sendDmMutation.mutate(dmMsg.trim())}
                >
                  {sendDmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </Button>
              </div>
            </PremiumCard>
          )}
        </div>
      )}

      {/* ── WEEKLY STATS ────────────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-3 md:space-y-4">
          <TechnicalLabel text="Performance History — Last 8 Weeks" className="text-foreground" />

          {isHistoryLoading && (
            <PremiumCard interactive={false} className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-5 h-5 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-40 rounded" />
                    <Skeleton className="h-2.5 w-full rounded" />
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
            <PremiumCard interactive={false} className="text-center py-12">
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl w-fit mx-auto mb-3">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <p className="font-bold text-foreground">No history yet</p>
              <p className="text-sm text-muted-foreground mt-1">Stats will appear after your first completed week.</p>
            </PremiumCard>
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
                      "w-5 h-5 rounded-full shrink-0 border-2",
                      snap.wasSuccessful
                        ? "bg-green-500 border-green-600"
                        : "bg-red-400 border-red-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-semibold text-foreground">Week {weeklyHistory.length - i}</span>
                        <span>
                          {snap.achievedPoints?.toLocaleString()}
                          {" / "}
                          {snap.targetPoints?.toLocaleString()} pts
                          <span className="ml-1 text-muted-foreground">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <Progress value={Math.min(100, pct)} className="h-2 border border-black/10" />
                    </div>
                    <Badge
                      variant={snap.wasSuccessful ? "default" : "destructive"}
                      className="shrink-0 text-[10px] font-bold uppercase"
                    >
                      {snap.wasSuccessful ? "MET" : "MISSED"}
                    </Badge>
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

      {/* ── MY GUILD PROFILE ────────────────────────────────────────────── */}
      {tab === "profile" && guildId && guild && (
        <PremiumCard interactive={false}>
          <GuildProfileWizard guildId={guildId} guildName={guild.name} mode="edit" />
        </PremiumCard>
      )}

      {/* ── SETTINGS ────────────────────────────────────────────────────── */}
      {tab === "settings" && settingsForm && (
        <div className="space-y-4 md:space-y-6">

          {/* Guild settings */}
          <PremiumCard interactive={false}>
            <div className="flex items-center gap-3 mb-5">
              <IconChip icon={Settings} />
              <TechnicalLabel text="Guild Settings" className="text-foreground" />
            </div>

            <div className="space-y-4">
              <div>
                <TechnicalLabel text="Guild Name" className="text-muted-foreground mb-1.5" />
                <Input
                  value={settingsForm.name}
                  onChange={e => setSettingsForm((f: any) => ({ ...f, name: e.target.value }))}
                  className="h-10"
                />
              </div>

              <div>
                <TechnicalLabel text="Description (max 200 chars)" className="text-muted-foreground mb-1.5" />
                <textarea
                  maxLength={200}
                  rows={3}
                  value={settingsForm.description}
                  onChange={e => setSettingsForm((f: any) => ({ ...f, description: e.target.value }))}
                  className="w-full border-2 border-black/20 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-black transition-colors bg-white"
                />
              </div>

              {/* Guild profile picture — captain-only because this panel is captain-only. */}
              <div>
                <TechnicalLabel text="Guild Profile Picture" className="text-muted-foreground mb-1.5" />
                <div className="flex items-center gap-3 rounded-xl border-2 border-black/10 bg-muted/30 p-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-black/15 bg-primary/15 flex items-center justify-center shrink-0">
                    {settingsForm.avatarUrl ? (
                      <img src={settingsForm.avatarUrl} alt="Guild profile preview" className="w-full h-full object-cover" />
                    ) : (
                      <Crown className="w-7 h-7 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground mb-2">
                      This image appears on the public guild discovery cards.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-foreground text-background text-[10px] font-black uppercase tracking-wider cursor-pointer hover:opacity-85">
                        <ImagePlus size={12} />
                        {settingsForm.avatarUrl ? "Change picture" : "Add picture"}
                        <input type="file" accept="image/*" className="sr-only" onChange={handleGuildAvatarChange} />
                      </label>
                      {settingsForm.avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setSettingsForm((f: any) => ({ ...f, avatarUrl: null }))}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border-2 border-black/15 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <TechnicalLabel text="Min Rank to Join" className="text-muted-foreground mb-1.5" />
                <select
                  value={settingsForm.minRankRequired}
                  onChange={e => setSettingsForm((f: any) => ({ ...f, minRankRequired: e.target.value }))}
                  className="w-full h-10 border-2 border-black/20 rounded-xl px-3 text-sm bg-white focus:outline-none focus:border-black transition-colors"
                >
                  {RANK_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <TechnicalLabel text="Recruitment" className="text-muted-foreground mb-2" />
                <div className="flex gap-4">
                  {[{ v: true, l: "Open" }, { v: false, l: "Closed" }].map(opt => (
                    <label key={String(opt.v)} className="flex items-center gap-2 text-sm cursor-pointer font-semibold">
                      <input
                        type="radio"
                        name="recruitment"
                        checked={settingsForm.recruitmentOpen === opt.v}
                        onChange={() => setSettingsForm((f: any) => ({ ...f, recruitmentOpen: opt.v }))}
                        className="accent-primary w-4 h-4"
                      />
                      {opt.l}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <TechnicalLabel text="Discoverability" className="text-muted-foreground mb-2" />
                <div className="flex gap-4 mb-1.5">
                  {[{ v: true, l: "Public (discoverable)" }, { v: false, l: "Private (invite only)" }].map(opt => (
                    <label key={String(opt.v)} className="flex items-center gap-2 text-sm cursor-pointer font-semibold">
                      <input
                        type="radio"
                        name="isPublic"
                        checked={settingsForm.isPublic === opt.v}
                        onChange={() => setSettingsForm((f: any) => ({ ...f, isPublic: opt.v }))}
                        className="accent-primary w-4 h-4"
                      />
                      {opt.l}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {settingsForm.isPublic
                    ? "Your guild appears in the discovery list and accepts public applications."
                    : "Your guild is hidden from discovery. Only invite links can bring in members."}
                </p>
              </div>

              {/* Weekly target — admin-only, read-only for captains */}
              <div className="bg-muted/40 border-2 border-black/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <TechnicalLabel text="Weekly Target" className="text-muted-foreground mb-0.5" />
                  <div className="font-black text-foreground text-lg">
                    {(guild.weeklyTarget || 0).toLocaleString()} pts
                  </div>
                </div>
                <div className="text-right">
                  <TechnicalLabel text={`Difficulty: ${guild.targetDifficulty || "medium"}`} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mt-0.5">Set by admin</p>
                </div>
              </div>
            </div>

            <Button
              className="w-full mt-5 h-11 font-bold"
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
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</>
                : "Save Settings"}
            </Button>
          </PremiumCard>

          {/* Assistant Captain */}
          <PremiumCard interactive={false}>
            <div className="flex items-center gap-3 mb-4">
              <IconChip icon={Shield} />
              <TechnicalLabel text="Assistant Captain" className="text-foreground" />
            </div>

            {guild.assistantCaptainId ? (
              <AssistantPermissionsEditor
                guildId={guildId}
                assistantName={active.find((m: any) => m.userId === guild.assistantCaptainId)?.firstName || "Assistant"}
                currentPermissions={(guild.assistantPermissions as string[]) || []}
                onRemove={() => {
                  apiRequest("DELETE", `/api/guilds/${guildId}/assistant-captain`).then(() => {
                    toast({ title: "Assistant Captain removed." });
                    queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
                  });
                }}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Appoint a trusted member as your assistant. They can help manage the guild based on permissions you grant.
                </p>
                <select
                  className="w-full h-10 border-2 border-black/20 rounded-xl px-3 text-sm bg-white focus:outline-none focus:border-black transition-colors"
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
                </select>
              </div>
            )}
          </PremiumCard>

          {/* Announcements */}
          <PremiumCard interactive={false}>
            <div className="flex items-center gap-3 mb-4">
              <IconChip icon={Megaphone} />
              <TechnicalLabel text="Post Announcement" className="text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Pin a message for all guild members. It appears as a banner on their dashboard until you clear it.
            </p>
            <textarea
              rows={3}
              maxLength={500}
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value)}
              placeholder="Write an announcement for your guild members…"
              className="w-full border-2 border-black/20 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-black transition-colors bg-white"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={cn("text-xs", announcementText.length > 480 ? "text-red-400 font-bold" : "text-muted-foreground")}>
                {announcementText.length}/500
              </span>
              <Button
                size="sm"
                className="h-10 px-4 font-bold"
                disabled={announcementText.trim().length === 0 || announcementMutation.isPending}
                onClick={() => announcementMutation.mutate(announcementText.trim())}
              >
                <Megaphone size={13} className="mr-1.5" />
                {announcementMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Posting…</>
                  : "Post Announcement"}
              </Button>
            </div>
          </PremiumCard>
        </div>
      )}

      {/* ── Reject modal ────────────────────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border-2 border-black rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="w-4 h-4 text-red-500" />
              </div>
              <p className="font-black text-foreground">Reject {rejectModal.applicantName}?</p>
            </div>
            <div>
              <TechnicalLabel text="Reason (min 10 chars, required)" className="text-muted-foreground mb-1.5" />
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why you're rejecting this application…"
                className="w-full border-2 border-black/20 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-black transition-colors bg-white"
              />
              <p className={cn("text-xs text-right mt-1", rejectReason.length < 10 ? "text-red-400 font-bold" : "text-muted-foreground")}>
                {rejectReason.length} chars
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 h-11 font-bold"
                disabled={rejectReason.length < 10 || appActionMutation.isPending}
                onClick={() => appActionMutation.mutate({ appId: rejectModal.appId, action: "reject", reason: rejectReason })}
              >
                {appActionMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kick confirm modal ──────────────────────────────────────────── */}
      {kickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border-2 border-black rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                <UserMinus className="w-4 h-4 text-red-500" />
              </div>
              <p className="font-black text-foreground">Remove this member?</p>
            </div>
            <p className="text-sm text-muted-foreground">They will need to re-apply to join again.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setKickConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 h-11 font-bold"
                disabled={kickMutation.isPending}
                onClick={() => kickMutation.mutate(kickConfirm)}
              >
                {kickMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AssistantPermissionsEditor — toggle individual permissions for the assistant
// ─────────────────────────────────────────────────────────────────────────────
const ASSISTANT_PERMISSIONS: { key: string; label: string; description: string }[] = [
  { key: "join_applications",   label: "Join Applications",  description: "Accept or reject member applications" },
  { key: "guild_announcements", label: "Announcements",      description: "Post and delete guild announcements" },
  { key: "guild_settings",      label: "Guild Settings",     description: "Update name, description, and banner" },
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
        <div className="text-sm text-muted-foreground">
          Current: <strong className="text-foreground">{assistantName}</strong>
        </div>
        <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={onRemove}>
          <UserMinus size={12} className="mr-1" />
          Remove
        </Button>
      </div>

      <TechnicalLabel text="Permissions" className="text-muted-foreground" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {ASSISTANT_PERMISSIONS.map(p => {
          const enabled = perms.includes(p.key);
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              className={cn(
                "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all text-xs min-h-[44px]",
                enabled
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-black/15 bg-white text-muted-foreground hover:border-black/40 hover:bg-muted/30"
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
                <div className="text-[10px] text-muted-foreground">{p.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {dirty && (
        <Button
          className="w-full h-11 font-bold"
          disabled={permsMutation.isPending}
          onClick={() => permsMutation.mutate(perms)}
        >
          {permsMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
          Save Permissions
        </Button>
      )}
    </div>
  );
}

export default CaptainPortal;
