/**
 * CaptainPortal — THORX v3 (spec F.8)
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
import { Megaphone, Users, MessageCircle, BarChart3, Settings, CheckCircle, XCircle, Star, Send, Bell, Sword, Crown, Target, MessagesSquare, Loader2, Swords, UserPlus, UserMinus, Shield } from "lucide-react";
import { GuildWarsPanel } from "./GuildWarsPanel";
import { GuildProfileWizard } from "./GuildProfileWizard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Tab = "requests" | "roster" | "chat" | "dm" | "stats" | "settings" | "wars" | "profile";

// Points target per difficulty, mirroring server/storage.ts DatabaseStorage.DIFFICULTY_TARGETS
const DIFFICULTY_TARGETS: Record<string, Record<string, number>> = {
  "E-Rank": { low: 10_000,  medium: 25_000,  high:  50_000 },
  "D-Rank": { low: 25_000,  medium: 50_000,  high: 100_000 },
  "C-Rank": { low: 50_000,  medium: 100_000, high: 200_000 },
  "B-Rank": { low: 100_000, medium: 200_000, high: 400_000 },
  "A-Rank": { low: 200_000, medium: 400_000, high: 800_000 },
  "S-Rank": { low: 400_000, medium: 800_000, high: 1_600_000 },
};

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
  const { data: guild } = useQuery<any>({
    queryKey: ["/api/guilds", guildId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}`); const d = await r.json(); return d.guild; },
    enabled: !!guildId,
    refetchInterval: 15000,
  });

  // Members
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "members"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!guildId,
    refetchInterval: 15000,
  });

  // Pending applications
  const pending = members.filter((m: any) => m.status === "pending");
  const active  = members.filter((m: any) => m.status === "active");

  // Weekly history
  const { data: weeklyHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "weekly-history"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/weekly-history`); const d = await r.json(); return d.history ?? d.snapshots ?? []; },
    enabled: !!guildId && tab === "stats",
  });

  // Guild Chat (group chat — same endpoint members use)
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [chatMsg, setChatMsg] = useState("");
  const { data: chatMessages = [], refetch: refetchChat } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "chat"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/chat`); const d = await r.json(); return d.messages ?? []; },
    enabled: !!guildId && tab === "chat",
    refetchInterval: tab === "chat" ? 15000 : false,
  });

  // DM messages — rely on WS push for real-time; poll only as fallback (Phase 15.7)
  const { data: dmMessages = [] } = useQuery<any[]>({
    queryKey: ["/api/guilds", guildId, "dm", selectedDmMember],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/dm/${selectedDmMember}`); const d = await r.json(); return d.messages ?? []; },
    enabled: !!guildId && !!selectedDmMember && tab === "dm",
    refetchInterval: 60000, // WS push handles real-time; poll every 60s as safety net
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
      // Refresh guild header member count (audit finding AA — was missing, causing stale "8/20" display).
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
      // Refresh guild header member count (audit finding AA).
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const sendDmMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/dm/${selectedDmMember}`, { message });
      return r.json();
    },
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/guilds", guildId, "dm", selectedDmMember] });
      const prev = queryClient.getQueryData<any[]>(["/api/guilds", guildId, "dm", selectedDmMember]);
      queryClient.setQueryData(["/api/guilds", guildId, "dm", selectedDmMember], (old: any[] = []) => [
        ...old,
        { message, fromUserId: user?.id, createdAt: new Date().toISOString(), _optimistic: true },
      ]);
      setDmMsg("");
      return { prev };
    },
    onError: (_err: any, _msg: string, context: any) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(["/api/guilds", guildId, "dm", selectedDmMember], context.prev);
      }
      toast({ title: "Message not sent", description: "Could not deliver your message. Please try again.", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "dm", selectedDmMember] });
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
      // Reflect the server-computed weeklyTarget back into the form
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
        targetDifficulty: guild.targetDifficulty || "medium",
      });
    }
  }, [guild]);

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

  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "requests", label: "Requests", icon: <Sword size={14} />, badge: pending.length },
    { id: "roster",   label: "Roster",   icon: <Users size={14} /> },
    { id: "chat",     label: "Guild Chat", icon: <MessagesSquare size={14} /> },
    { id: "dm",       label: "Private Chat", icon: <MessageCircle size={14} /> },
    { id: "wars",     label: "Wars",     icon: <Swords size={14} /> },
    { id: "profile",  label: "My Profile", icon: <Shield size={14} /> },
    { id: "stats",    label: "Stats",    icon: <BarChart3 size={14} /> },
    { id: "settings", label: "Settings", icon: <Settings size={14} /> },
  ];

  if (!guildId || !guild) return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
        <Skeleton className="h-4 w-20 rounded" />
      </div>
      {/* Tabs skeleton */}
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-8 rounded-md" />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-1/3 rounded" />
              <Skeleton className="h-3 w-1/4 rounded" />
            </div>
            <Skeleton className="h-6 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

  // Preview the weeklyTarget that would result from the currently-selected difficulty
  const previewTarget = settingsForm
    ? ((DIFFICULTY_TARGETS[guild.guildRankTier ?? "E-Rank"] ?? DIFFICULTY_TARGETS["E-Rank"])[settingsForm.targetDifficulty] ?? guild.weeklyTarget)
    : guild.weeklyTarget;

  return (
    <div className="space-y-4">
      {/* Captain Header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={18} className="text-yellow-500" />
          <div>
            <div className="font-black">{guild.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <RankBadge rank={guild.guildRankTier || "E-Rank"} size="sm" />
              <span className="text-xs text-zinc-500">{active.length}/{guild.memberCapacity} members</span>
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <div>{(guild.guildPerformanceScore || 0).toLocaleString()} GPS</div>
        </div>
      </div>

      {/* Active announcement preview (captain can see their own post) */}
      {guild.latestAnnouncement && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <Megaphone size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-amber-700 mb-0.5">Active Announcement</div>
            <div className="text-xs text-amber-800 break-words">{guild.latestAnnouncement}</div>
            {guild.announcementPostedAt && (
              <div className="text-[10px] text-amber-500 mt-0.5">
                Posted {formatDistanceToNow(new Date(guild.announcementPostedAt), { addSuffix: true })}
              </div>
            )}
          </div>
          <button
            onClick={() => clearAnnouncementMutation.mutate()}
            disabled={clearAnnouncementMutation.isPending}
            className="text-amber-500 hover:text-amber-700 text-[10px] font-semibold shrink-0 mt-0.5"
          >
            Clear
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex-shrink-0 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2 rounded-md transition-all relative",
              tab === t.id ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            )}>
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            {(t.badge ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── REQUESTS ── */}
      {tab === "requests" && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">No pending applications.</div>
          ) : pending.map((app: any) => (
            <div key={app.id} className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{app.firstName || app.identity || "Applicant"}</span>
                    <RankBadge rank={app.userRankTier || "E-Rank"} size="sm" />
                    <span className="text-xs text-zinc-400">{app.performanceScore || 0} PS</span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">Joined Thorx {app.createdAt ? formatDistanceToNow(new Date(app.createdAt), { addSuffix: true }) : "recently"}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => appActionMutation.mutate({ appId: app.id, action: "accept" })}>
                    <CheckCircle size={12} className="mr-1" />Accept
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-red-600 border-red-200 hover:bg-red-50 text-xs" onClick={() => setRejectModal({ appId: app.id, applicantName: app.firstName || "this applicant" })}>
                    <XCircle size={12} className="mr-1" />Reject
                  </Button>
                </div>
              </div>
              {app.coverLetter && (
                <div className="bg-zinc-50 rounded-lg p-3 text-xs text-zinc-600 border border-zinc-100 italic">
                  "{app.coverLetter}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ROSTER ── */}
      {tab === "roster" && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-3 border-b border-zinc-100 text-sm font-bold">Team Roster ({active.length}/{guild.memberCapacity})</div>
          <div className="divide-y divide-zinc-100">
            {active.length === 0 && (
              <div className="text-center py-16">
                <Users className="mx-auto mb-3 text-zinc-300" size={36} />
                <p className="text-zinc-400 text-sm">No active members yet.</p>
                <p className="text-zinc-500 text-xs mt-1">Review pending applications to build your team.</p>
              </div>
            )}
            {active.sort((a: any, b: any) => (b.weeklyPointsContributed || 0) - (a.weeklyPointsContributed || 0)).map((m: any, i: number) => {
              const isCaptain = m.userId === guild.captainId;
              const isMe = m.userId === user?.id;
              const isInactive = m.lastActiveAt && (Date.now() - new Date(m.lastActiveAt).getTime()) > 48 * 3600 * 1000;
              return (
                <div key={m.id} className={cn("flex items-center justify-between px-4 py-3 gap-3", isMe ? "bg-zinc-50" : "")}>
                  <div className="flex items-center gap-2 min-w-0">
                    {isCaptain ? <Crown size={14} className="text-yellow-500 shrink-0" /> : <span className="text-xs text-zinc-400 w-5">#{i + 1}</span>}
                    {m.isMvp && <Star size={12} className="text-yellow-500 fill-yellow-500 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{isMe ? "You" : (m.firstName || m.identity || "Member")}</span>
                        <RankBadge rank={m.userRankTier || "E-Rank"} size="sm" showLabel={false} />
                        {isInactive && <span className="text-[10px] text-red-500 font-semibold">INACTIVE</span>}
                      </div>
                      <div className="text-xs text-zinc-400">{(m.weeklyPointsContributed || 0).toLocaleString()} pts this week</div>
                    </div>
                  </div>
                  {!isCaptain && !isMe && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-blue-600" title="Nudge" disabled={nudgeMutation.isPending} onClick={() => nudgeMutation.mutate(m.userId)}>
                        {nudgeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-purple-600" title="DM" onClick={() => { setSelectedDmMember(m.userId); setTab("dm"); }}>
                        <MessageCircle size={12} />
                      </Button>
                      {!m.isMvp && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-yellow-500" title="Set MVP" disabled={mvpMutation.isPending} onClick={() => mvpMutation.mutate(m.userId)}>
                          {mvpMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-red-600" title="Kick" onClick={() => setKickConfirm(m.userId)}>
                        <XCircle size={12} />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GUILD CHAT (Phase 20) ── */}
      {tab === "chat" && (
        <div className="rounded-xl border border-zinc-200 bg-white flex flex-col h-[460px] max-h-[60vh] min-h-[240px]">
          <div className="p-3 border-b border-zinc-100">
            <div className="font-semibold text-sm">{guild.name} — Guild Chat</div>
            <div className="text-[10px] text-zinc-400">Group chat visible to all active members</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 ? (
              <div className="text-center text-zinc-400 text-sm py-8">No messages yet. Say hello to your guild!</div>
            ) : chatMessages.map((msg: any, i: number) => {
              const isMe = msg.userId === user?.id || msg.fromUserId === user?.id;
              return (
                <div key={i} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", isMe ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800")}>
                    {!isMe && <div className="text-[10px] font-bold text-zinc-500 mb-0.5">{msg.senderName || msg.firstName || "Member"}</div>}
                    {msg.message}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-zinc-100 flex gap-2">
            <Input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              placeholder="Message the guild…"
              className="flex-1 h-8 text-sm"
              maxLength={500}
              onKeyDown={e => { if (e.key === "Enter" && chatMsg.trim() && chatMsg.length <= 500) sendChatMutation.mutate(chatMsg.trim()); }}
            />
            <Button size="sm" className="h-8 w-8 p-0" aria-label="Send" disabled={!chatMsg.trim() || chatMsg.length > 500 || sendChatMutation.isPending} onClick={() => sendChatMutation.mutate(chatMsg.trim())}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── DM HUB ── */}
      {tab === "dm" && (
        <div className="space-y-3">
          {!selectedDmMember ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-700">Select a member to chat with:</div>
              {active.filter((m: any) => m.userId !== user?.id).map((m: any) => (
                <button key={m.id} className="w-full text-left rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3 hover:bg-zinc-50 transition-colors"
                  onClick={() => setSelectedDmMember(m.userId)}>
                  <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold">{(m.firstName || "M")[0]}</div>
                  <div>
                    <div className="font-medium text-sm">{m.firstName || m.identity || "Member"}</div>
                    <RankBadge rank={m.userRankTier || "E-Rank"} size="sm" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white flex flex-col h-[420px] max-h-[60vh] min-h-[240px]">
              <div className="p-3 border-b border-zinc-100 flex items-center gap-2">
                <button className="text-zinc-400 hover:text-zinc-700 text-xs" onClick={() => setSelectedDmMember(null)}>← Back</button>
                <span className="font-semibold text-sm">{active.find((m: any) => m.userId === selectedDmMember)?.firstName || "Member"}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {dmMessages.map((msg: any, i) => (
                  <div key={i} className={cn("flex", msg.fromUserId === user?.id ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", msg.fromUserId === user?.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800")}>
                      {msg.message}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-zinc-100 flex gap-2">
                <Input value={dmMsg} onChange={e => setDmMsg(e.target.value)} placeholder="Message member…" className="flex-1 h-8 text-sm"
                  maxLength={500}
                  onKeyDown={e => { if (e.key === "Enter" && dmMsg.trim() && dmMsg.length <= 500) sendDmMutation.mutate(dmMsg.trim()); }} />
                <Button size="sm" className="h-8 w-8 p-0" aria-label="Send message" disabled={!dmMsg.trim() || dmMsg.length > 500 || sendDmMutation.isPending} onClick={() => sendDmMutation.mutate(dmMsg.trim())}><Send size={14} /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── WEEKLY STATS ── */}
      {tab === "stats" && (
        <div className="space-y-3">
          {/* History */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="font-bold text-sm mb-3">Performance History (Last 8 Weeks)</div>
            {weeklyHistory.length === 0 ? (
              <div className="text-center py-6 text-zinc-400 text-sm">No history yet.</div>
            ) : (
              <div className="space-y-2">
                {weeklyHistory.map((snap: any, i: number) => {
                  const pct = snap.targetPoints > 0 ? Math.min(150, (snap.achievedPoints / snap.targetPoints) * 100) : 0;
                  return (
                    <div key={snap.id} className="flex items-center gap-3">
                      <span className={cn("w-4 h-4 rounded-full shrink-0", snap.wasSuccessful ? "bg-emerald-500" : "bg-red-400")} />
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
                          <span>Week {weeklyHistory.length - i}</span>
                          <span>{snap.achievedPoints?.toLocaleString()} / {snap.targetPoints?.toLocaleString()} pts ({pct.toFixed(0)}%)</span>
                        </div>
                        <Progress value={Math.min(100, pct)} className="h-1.5" />
                      </div>
                      <span className="text-xs">{snap.wasSuccessful ? "✅" : "❌"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WARS ── */}
      {tab === "wars" && guildId && (
        <GuildWarsPanel guildId={guildId} isCaptain={true} />
      )}

      {/* ── MY GUILD PROFILE ── */}
      {tab === "profile" && guildId && guild && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <GuildProfileWizard guildId={guildId} guildName={guild.name} mode="edit" />
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab === "settings" && settingsForm && (
        <div className="space-y-4">
          {/* Guild settings */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
            <div className="font-bold text-sm">Guild Settings</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Guild Name</label>
                <Input value={settingsForm.name} onChange={e => setSettingsForm((f: any) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Description (max 200 chars)</label>
                <textarea maxLength={200} rows={3} value={settingsForm.description} onChange={e => setSettingsForm((f: any) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Min Rank to Join</label>
                <select value={settingsForm.minRankRequired} onChange={e => setSettingsForm((f: any) => ({ ...f, minRankRequired: e.target.value }))}
                  className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-sm bg-white">
                  {RANK_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Recruitment</label>
                <div className="flex gap-4">
                  {[{ v: true, l: "Open" }, { v: false, l: "Closed" }].map(opt => (
                    <label key={String(opt.v)} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="recruitment" checked={settingsForm.recruitmentOpen === opt.v} onChange={() => setSettingsForm((f: any) => ({ ...f, recruitmentOpen: opt.v }))} />
                      {opt.l}
                    </label>
                  ))}
                </div>
              </div>

              {/* R-26: Guild discoverability toggle */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Discoverability</label>
                <div className="flex gap-4">
                  {[{ v: true, l: "Public (discoverable)" }, { v: false, l: "Private (invite only)" }].map(opt => (
                    <label key={String(opt.v)} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="isPublic" checked={settingsForm.isPublic === opt.v} onChange={() => setSettingsForm((f: any) => ({ ...f, isPublic: opt.v }))} />
                      {opt.l}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {settingsForm.isPublic
                    ? "Your guild appears in the discovery list and accepts public applications."
                    : "Your guild is hidden from discovery. Only invite links can bring in members."}
                </p>
              </div>

              {/* Weekly target difficulty */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Weekly Goal Difficulty</label>
                <div className="flex gap-3">
                  {["low", "medium", "high"].map(d => (
                    <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer capitalize">
                      <input type="radio" name="difficulty" value={d}
                        checked={settingsForm.targetDifficulty === d}
                        onChange={() => setSettingsForm((f: any) => ({ ...f, targetDifficulty: d }))} />
                      {d}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {settingsForm.targetDifficulty !== guild.targetDifficulty
                    ? <>Setting to <strong>{settingsForm.targetDifficulty}</strong> will change weekly target to <strong>{previewTarget.toLocaleString()} pts</strong>.</>
                    : <>Current target: <strong>{(guild.weeklyTarget || 0).toLocaleString()} pts</strong>. Admin can override anytime.</>
                  }
                </p>
              </div>
            </div>
            <Button className="w-full" disabled={settingsMutation.isPending} onClick={() => {
              if (!settingsForm.name || settingsForm.name.trim().length < 3) {
                toast({ title: "Guild name must be at least 3 characters.", variant: "destructive" }); return;
              }
              if (settingsForm.name.trim().length > 60) {
                toast({ title: "Guild name cannot exceed 60 characters.", variant: "destructive" }); return;
              }
              settingsMutation.mutate(settingsForm);
            }}>
              {settingsMutation.isPending ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</span> : "Save Settings"}
            </Button>
          </div>

          {/* Assistant Captain */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-purple-500" />
              <div className="font-bold text-sm">Assistant Captain</div>
            </div>
            {guild.assistantCaptainId ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-600">
                    Current: <strong>{active.find((m: any) => m.userId === guild.assistantCaptainId)?.firstName || "Member"}</strong>
                  </div>
                  <Button size="sm" variant="outline" className="h-6 text-xs text-red-600 border-red-200" onClick={() => {
                    apiRequest("DELETE", `/api/guilds/${guildId}/assistant-captain`).then(() => {
                      toast({ title: "Assistant Captain removed." });
                      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
                    });
                  }}>Remove</Button>
                </div>
                <div className="text-xs text-zinc-500">Permissions enabled (toggle in future update):</div>
                <div className="flex flex-wrap gap-1">
                  {(guild.assistantPermissions as string[] || []).map((p: string) => (
                    <Badge key={p} variant="outline" className="text-[10px]">{p.replace(/_/g, " ")}</Badge>
                  ))}
                  {(guild.assistantPermissions as string[] || []).length === 0 && (
                    <span className="text-xs text-zinc-400">No permissions enabled yet.</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Appoint a trusted member as your assistant. They can help manage the guild based on permissions you grant.</p>
                <select
                  className="w-full h-9 border border-zinc-200 rounded-lg px-3 text-sm bg-white"
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
          </div>

          {/* Announcements */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone size={14} className="text-amber-500" />
              <div className="font-bold text-sm">Post Announcement</div>
            </div>
            <p className="text-xs text-zinc-500">
              Pin a message for all guild members. It appears as a banner on their dashboard until you clear it.
            </p>
            <textarea
              rows={3}
              maxLength={500}
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value)}
              placeholder="Write an announcement for your guild members…"
              className="w-full border border-zinc-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex items-center justify-between">
              <span className={cn("text-[11px]", announcementText.length > 480 ? "text-red-400" : "text-zinc-400")}>
                {announcementText.length}/500
              </span>
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white"
                disabled={announcementText.trim().length === 0 || announcementMutation.isPending}
                onClick={() => announcementMutation.mutate(announcementText.trim())}
              >
                <Megaphone size={12} className="mr-1" />
                {announcementMutation.isPending ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Posting…</span> : "Post Announcement"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="font-bold">Reject {rejectModal.applicantName}?</div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Reason (min 10 chars, required)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Explain why you're rejecting this application…"
                className="w-full border border-zinc-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className={cn("text-[11px] text-right mt-0.5", rejectReason.length < 10 ? "text-red-400" : "text-zinc-400")}>{rejectReason.length} chars</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setRejectModal(null); setRejectReason(""); }}>Cancel</Button>
              <Button variant="destructive" className="flex-1" disabled={rejectReason.length < 10 || appActionMutation.isPending}
                onClick={() => appActionMutation.mutate({ appId: rejectModal.appId, action: "reject", reason: rejectReason })}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Kick confirm */}
      {kickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="font-bold">Remove this member?</div>
            <p className="text-sm text-zinc-500">They will need to re-apply to join again.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setKickConfirm(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" disabled={kickMutation.isPending} onClick={() => kickMutation.mutate(kickConfirm)}>Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export RANK_ORDER for use in conditionals
const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

export default CaptainPortal;
