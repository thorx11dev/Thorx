/**
 * AssistantPanel — Engine C assistant-captain panel (THORX v3, premium redesign).
 *
 * Permission-gated by the captain via `guild.assistantPermissions`. The backend
 * routes now honor these permissions, so every action here is genuinely
 * functional — not just visual. Reuses the shared GuildPanelShell so it is the
 * same design family as the Captain and Member panels (desktop + mobile).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PremiumCard } from "@/components/ui/premium-card";
import { RankBadge } from "@/components/RankBadge";
import { RefreshButton, useRefreshAction } from "@/components/ui/refresh-button";
import {
  GuildIdentityHeader, GuildTabBar, SectionChip,
  CTA_CLASS, OUTLINE_CLASS, DESTRUCTIVE_CLASS, DESTRUCTIVE_OUTLINE, ICON_BTN_CLASS,
  FIELD_AREA_CLASS, useEscape, ModalShell, AvatarStamp, EmptyState,
  PanelSkeleton, SkeletonBlock,
} from "./GuildPanelShell";
import { GiSpartanHelmet, GiKnightBanner, GiHuntingHorn, GiLaurelsTrophy, GiRoundShield, GiShield, GiSkullCrossedBones, GiCrossedAxes, GiPadlock, GiWarhammer, GiMagnifyingGlass, GiSpectacles } from "./guild-icons";
import { GuildTasksPanel } from "./GuildTasksPanel";
import { GuildDiscoveryPanel } from "./GuildDiscoveryPanel";
import { cn } from "@/lib/utils";

const PERMISSION_LABELS: Record<string, string> = {
  join_applications: "Join Applications",
  guild_announcements: "Announcements",
  guild_settings: "Guild Settings",
  min_rank_required: "Min Rank",
  recruitment_toggle: "Recruitment",
  member_capacity: "Capacity",
  avatar_update: "Avatar",
  member_nudge: "Nudge Members",
  mvp_set: "Set MVP",
  pinned_member: "Pin Member",
  member_remove: "Remove Members",
};

type Tab = "applications" | "announcements" | "nudge" | "mvp" | "roster" | "tasks" | "discover" | "permissions";

export function AssistantPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const guildId = user?.guildId;

  const [tab, setTab] = useState<Tab>("applications");
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [kickTarget, setKickTarget] = useState<any | null>(null);

  // Esc closes any open modal/sheet.
  useEscape(() => {
    if (rejectTarget) { setRejectTarget(null); setRejectReason(""); }
    if (kickTarget) setKickTarget(null);
  });

  // (No separate /guilds/mine fetch here — this panel derives everything from
  // the guild-detail + roster queries below, like the member panel.)
  const {
    data: guild,
    isLoading: isGuildLoading,
    isError: isGuildError,
    refetch: refetchGuild,
  } = useQuery<any>({
    queryKey: guildId ? QUERY_KEYS.guildDetail(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}`); const d = await r.json(); return d.guild; },
    enabled: !!guildId,
    refetchInterval: 60000, // header + permissions only; roster/apps tick at 30s
  });

  const { data: members = [], refetch: refetchMembers } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildMembers(guildId) : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/members`); const d = await r.json(); return d.members ?? []; },
    enabled: !!guildId,
    refetchInterval: 30000,
  });

  const perms: string[] = (guild?.assistantPermissions as string[] | null) ?? [];
  const can = (p: string) => perms.includes(p);
  const activeMembers = members.filter((m: any) => m.status === "active");

  // Pending join applications — dedicated endpoint. The roster only returns
  // active members, so filtering members by status used to leave the
  // Applications tab permanently empty ("Queue is clear" even with applicants).
  const { data: applications = [], refetch: refetchApplications } = useQuery<any[]>({
    queryKey: guildId ? ["/api/guilds", guildId, "applications"] : [],
    queryFn: async () => { const r = await apiRequest("GET", `/api/guilds/${guildId}/applications`); const d = await r.json(); return d.applications ?? []; },
    enabled: !!guildId && can("join_applications"),
    refetchInterval: 30000,
  });
  const pendingApps = applications;

  // Compact My Progress metrics — assistant captains are routed to this panel
  // instead of the member panel, so they never see their own weekly view unless
  // we surface it here. Same math as the member Progress tab (single source of
  // truth: guild + roster from the same endpoints).
  const weeklyProgress = guild?.weeklyTarget > 0
    ? Math.min(100, ((guild.currentWeeklyPoints || 0) / guild.weeklyTarget) * 100) : 0;
  const sortedMembers = [...activeMembers].sort((a, b) => (b.weeklyPointsContributed || 0) - (a.weeklyPointsContributed || 0));
  const myContrib = activeMembers.find(m => m.userId === user?.id)?.weeklyPointsContributed ?? 0;
  const myRank = sortedMembers.findIndex(m => m.userId === user?.id) + 1;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildMine });
  };
  const refreshAssistantData = async () => {
    if (!guildId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildDetail(guildId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildMembers(guildId) }),
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "applications"] }),
    ]);
  };
  const { refreshing: isRefreshing, refresh: handleRefresh } = useRefreshAction(refreshAssistantData);

  const decideMutation = useMutation({
    mutationFn: async ({ appId, action }: { appId: string; action: "accept" | "reject" }) => {
      const r = await apiRequest("PATCH", `/api/guilds/${guildId}/applications/${appId}`, { action, rejectionReason: rejectReason || undefined });
      if (!r.ok) throw await r.json();
      return r.json();
    },
    onSuccess: () => {
      toast({ title: rejectTarget ? "Application Rejected" : "Application Approved", description: rejectTarget ? "Applicant notified with your reason." : "Applicant joined the guild." });
      setRejectTarget(null); setRejectReason("");
      invalidate(); refetchMembers(); refetchApplications();
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Could not update application.", variant: "destructive" }),
  });

  const announceMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/announcement`, { text });
      if (!r.ok) throw await r.json();
      return r.json();
    },
    onSuccess: () => { toast({ title: "Announcement Posted", description: "All members can now see it." }); setAnnouncement(""); invalidate(); },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Could not post announcement.", variant: "destructive" }),
  });

  const clearAnnouncementMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("DELETE", `/api/guilds/${guildId}/announcement`); if (!r.ok) throw await r.json(); return r.json(); },
    onSuccess: () => { toast({ title: "Announcement Cleared" }); invalidate(); },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Could not clear announcement.", variant: "destructive" }),
  });

  const nudgeMutation = useMutation({
    mutationFn: async (memberId: string) => { const r = await apiRequest("POST", `/api/guilds/${guildId}/members/${memberId}/nudge`); if (!r.ok) throw await r.json(); return r.json(); },
    onSuccess: (_d, memberId) => {
      toast({ title: "Nudge Sent", description: "Member notified to contribute this week." });
      queryClient.invalidateQueries({ queryKey: guildId ? QUERY_KEYS.guildMembers(guildId) : [] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Could not send nudge.", variant: "destructive" }),
  });

  const mvpMutation = useMutation({
    mutationFn: async (memberId: string) => { const r = await apiRequest("POST", `/api/guilds/${guildId}/members/${memberId}/mvp`); if (!r.ok) throw await r.json(); return r.json(); },
    onSuccess: () => {
      toast({ title: "MVP Set", description: "Weekly MVP designated." });
      queryClient.invalidateQueries({ queryKey: guildId ? QUERY_KEYS.guildMembers(guildId) : [] });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Could not set MVP.", variant: "destructive" }),
  });

  const kickMutation = useMutation({
    mutationFn: async (memberId: string) => { const r = await apiRequest("DELETE", `/api/guilds/${guildId}/members/${memberId}`); if (!r.ok) throw await r.json(); return r.json(); },
    onSuccess: () => {
      toast({ title: "Member Removed" });
      setKickTarget(null);
      invalidate(); refetchMembers();
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Could not remove member.", variant: "destructive" }),
  });

  if (!guildId || (isGuildLoading && !guild)) {
    return (
      <div className="space-y-4">
        <PanelSkeleton lines={1} />
        <SkeletonBlock className="h-12" />
        <PanelSkeleton lines={4} />
      </div>
    );
  }

  if (isGuildError && !guild) {
    return (
      <PremiumCard className="p-6 md:p-8 flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-[#E8E5D8] border-2 border-black/10 rounded-xl"><GiSpartanHelmet className="w-6 h-6 text-black/50" /></div>
        <div>
          <p className="font-bold text-foreground">Could not load guild data</p>
          <p className="text-sm font-medium text-black/50 mt-1">There was a problem reaching the server.</p>
        </div>
        <button onClick={() => refetchGuild()} className={cn(CTA_CLASS, "h-10 px-4 text-[10px]")}>Retry</button>
      </PremiumCard>
    );
  }

  const PERM_BY_TAB: Record<string, string> = {
    applications: "join_applications",
    announcements: "guild_announcements",
    nudge: "member_nudge",
    mvp: "mvp_set",
    roster: "member_remove",
  };
  const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "applications",   label: "Applications",   icon: <GiSpartanHelmet size={14} />,   badge: can("join_applications") ? pendingApps.length : 0 },
    { id: "announcements",  label: "Announcements",  icon: <GiKnightBanner size={14} /> },
    { id: "nudge",          label: "Nudge",          icon: <GiHuntingHorn size={14} /> },
    { id: "mvp",            label: "MVP",            icon: <GiLaurelsTrophy size={14} /> },
    { id: "roster",         label: "Roster",         icon: <GiRoundShield size={14} /> },
    { id: "tasks",          label: "Tasks",          icon: <GiWarhammer size={14} /> },
    { id: "discover",       label: "Discover",       icon: <GiMagnifyingGlass size={14} /> },
    { id: "permissions",    label: "My Access",      icon: <GiShield size={14} /> },
  ];
  // Tasks + Discover are guild-wide (not permission-gated) — every assistant sees them.
  const TABS = ALL_TABS.filter(t => t.id === "permissions" || t.id === "tasks" || t.id === "discover" || can(PERM_BY_TAB[t.id] ?? ""));
  const activeTab: Tab = TABS.some(t => t.id === tab) ? tab : "permissions";

  return (
    <div className="space-y-4 md:space-y-6">
      <GuildIdentityHeader guild={guild} role="ASSISTANT" memberCount={activeMembers.length} avatarUrl={guild?.avatarUrl} />

      {/* Sync control — refetch guild data without a hard reload */}
      <div className="flex items-center justify-end mt-3 mb-3">
        <RefreshButton onClick={handleRefresh} refreshing={isRefreshing} title="Refresh guild data" />
      </div>

      {/* Permission hint strip */}
      <PremiumCard interactive={false} className="border-2 border-primary/30 bg-primary/5 p-3.5 md:p-4 flex items-start gap-3">
        <GiShield size={15} className="text-primary shrink-0 mt-0.5" />
        <p className="text-xs md:text-sm font-medium text-black/60">
          You are the <span className="font-black text-black uppercase">Assistant Captain</span> — you can act only within the permissions the captain has granted you. Actions that need a permission you don't hold are hidden.
        </p>
      </PremiumCard>

      {/* Compact My Progress — always visible so the assistant's own weekly
          standing stays in view while they run guild operations. */}
      <PremiumCard interactive={false} className="p-3.5 md:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionChip>MY PROGRESS</SectionChip>
          <span className="text-[10px] font-black uppercase tracking-wider text-black/40">
            {weeklyProgress >= 100 ? "TARGET MET" : "WEEKLY TARGET"}
          </span>
        </div>
        <div className="flex items-center gap-4 md:gap-6 flex-wrap md:flex-nowrap">
          <div className="flex-1 min-w-[170px]">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-2xl font-black tracking-tight">{weeklyProgress.toFixed(0)}%</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-black/40">
                {guild?.weeklyTarget ? `${(guild.currentWeeklyPoints || 0).toLocaleString()} / ${guild.weeklyTarget.toLocaleString()} PTS` : "No target set"}
              </span>
            </div>
            <div className="h-2.5 bg-black/10 border-2 border-black/10 rounded-lg overflow-hidden">
              <div className="h-full bg-primary rounded-md transition-all" style={{ width: `${weeklyProgress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-4 md:gap-6 shrink-0">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-black/40">My Contribution</p>
              <p className="text-lg font-black tracking-tight">
                {(myContrib || 0).toLocaleString()} <span className="text-[9px] text-black/40 font-bold">PTS</span>
              </p>
            </div>
            <div className="w-px h-8 bg-black/10 hidden md:block" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-black/40">My Rank</p>
              <p className="text-lg font-black tracking-tight">
                {myRank > 0 ? `#${myRank}` : "—"} <span className="text-[9px] text-black/40 font-bold">/ {sortedMembers.length}</span>
              </p>
            </div>
          </div>
        </div>
      </PremiumCard>

      <GuildTabBar tabs={TABS} value={activeTab} onChange={setTab} />

      {/* Tab content — keyed so each switch plays the landing entrance motion */}
      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-1 duration-200">

      {/* ── Applications ── */}
      {activeTab === "applications" && (
        <div className="space-y-3">
          {pendingApps.length === 0 ? (
            <EmptyState
              icon={<GiSpartanHelmet size={22} className="text-black/40" />}
              chip="JOIN APPLICATIONS"
              title="Queue is clear"
              caption="No pending applications right now."
            />
          ) : (
            pendingApps.map((app: any) => (
              <PremiumCard key={app.id} interactive={false} className="p-4 md:p-5 border-2 border-black/10">
                <div className="flex items-start gap-3 md:gap-4">
                  <AvatarStamp name={app.firstName || app.identity} avatarUrl={app.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-base md:text-lg tracking-tight truncate">{app.firstName || app.identity || "Applicant"}</span>
                      {app.userRankTier && <RankBadge rank={app.userRankTier} />}
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-0.5">Pending Application</p>
                    {app.coverLetter && (
                      <div className="mt-3 border-l-[3px] border-primary/40 pl-3">
                        <p className="text-xs md:text-sm text-black/60 font-medium leading-relaxed line-clamp-3">{app.coverLetter}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 justify-end border-t-[3px] border-black/10 pt-4">
                  <Button
                    size="sm"
                    className={cn(CTA_CLASS, "h-10 px-4")}
                    disabled={decideMutation.isPending}
                    onClick={() => decideMutation.mutate({ appId: app.id, action: "accept" })}
                  >
                    <GiRoundShield size={14} /> Approve
                  </Button>
                  <Button
                    size="sm"
                    className={cn(OUTLINE_CLASS, "h-10 px-4")}
                    disabled={decideMutation.isPending}
                    onClick={() => { setRejectTarget(app); setRejectReason(""); }}
                  >
                    <GiSkullCrossedBones size={14} /> Reject
                  </Button>
                </div>
              </PremiumCard>
            ))
          )}
        </div>
      )}

      {/* ── Announcements ── */}
      {activeTab === "announcements" && (
        <div className="space-y-4">
          <PremiumCard interactive={false} className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <SectionChip>POST ANNOUNCEMENT</SectionChip>
              <GiKnightBanner size={16} className="text-primary" />
            </div>
            <textarea
              value={announcement}
              onChange={e => setAnnouncement(e.target.value)}
              placeholder="Announce something to the whole guild…"
              className={cn(FIELD_AREA_CLASS, "min-h-[110px]")}
              maxLength={500}
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-black/40">{announcement.length}/500</p>
              <Button
                size="sm"
                className={cn(CTA_CLASS, "h-10 px-4")}
                disabled={announcement.trim().length < 1 || announceMutation.isPending}
                onClick={() => announceMutation.mutate(announcement.trim())}
              >
                <GiKnightBanner size={14} /> Post Announcement
              </Button>
            </div>
          </PremiumCard>

          {guild?.latestAnnouncement && (
            <PremiumCard interactive={false} className="p-5 md:p-6 border-2 border-black/10">
              <div className="flex items-center justify-between mb-3">
                <SectionChip>CURRENT ANNOUNCEMENT</SectionChip>
                <button
                  onClick={() => clearAnnouncementMutation.mutate()}
                  disabled={clearAnnouncementMutation.isPending}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-black/40 hover:text-destructive transition-colors min-h-[36px] px-2 rounded-lg"
                >
                  <GiCrossedAxes size={12} /> Clear
                </button>
              </div>
              <p className="text-sm md:text-base font-medium text-black/70 leading-relaxed">{guild.latestAnnouncement}</p>
            </PremiumCard>
          )}
        </div>
      )}

      {/* ── Nudge ── */}
      {activeTab === "nudge" && (
        <PremiumCard interactive={false} className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <SectionChip>NUDGE MEMBERS</SectionChip>
            <GiHuntingHorn size={16} className="text-primary" />
          </div>
          <p className="text-xs md:text-sm font-medium text-black/50 mb-4">Send a reminder to members to contribute this week. One nudge per member per 24h.</p>
          <div className="divide-y divide-black/10">
            {activeMembers.filter((m: any) => m.userId !== guild?.captainId && m.userId !== user?.id).map((m: any) => {
              const lastNudged = m.lastNudgedAt ? new Date(m.lastNudgedAt).getTime() : 0;
              const onCooldown = lastNudged > 0 && Date.now() - lastNudged < 24 * 60 * 60 * 1000;
              return (
                <div key={m.userId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarStamp name={m.firstName || m.identity} avatarUrl={m.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{m.firstName || m.identity || "Member"}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/40">{(m.weeklyPointsContributed || 0).toLocaleString()} PTS THIS WEEK</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className={cn(OUTLINE_CLASS, "shrink-0 h-9 px-3.5")}
                    disabled={nudgeMutation.isPending || onCooldown}
                    onClick={() => nudgeMutation.mutate(m.userId)}
                  >
                    <GiHuntingHorn size={13} /> {onCooldown ? "Nudged" : "Nudge"}
                  </Button>
                </div>
              );
            })}
            {activeMembers.filter((m: any) => m.userId !== guild?.captainId && m.userId !== user?.id).length === 0 && (
              <EmptyState
                icon={<GiHuntingHorn size={22} className="text-black/40" />}
                chip="NUDGE"
                title="No members to nudge"
                caption="Everyone else has already contributed this week."
              />
            )}
          </div>
        </PremiumCard>
      )}

      {/* ── MVP ── */}
      {activeTab === "mvp" && (
        <PremiumCard interactive={false} className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <SectionChip>DESIGNATE WEEKLY MVP</SectionChip>
            <GiLaurelsTrophy size={16} className="text-primary" />
          </div>
          <p className="text-xs md:text-sm font-medium text-black/50 mb-4">One MVP per week — once assigned it locks until Sunday's reset.</p>
          <div className="divide-y divide-black/10">
            {(() => {
              const weekMvpSet = activeMembers.some((x: any) => x.isMvp);
              return activeMembers.filter((m: any) => m.userId !== guild?.captainId && m.userId !== user?.id).map((m: any) => (
                <div key={m.userId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarStamp name={m.firstName || m.identity} avatarUrl={m.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold truncate">{m.firstName || m.identity || "Member"}</p>
                        {m.isMvp && <GiSpectacles size={12} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/40">{(m.weeklyPointsContributed || 0).toLocaleString()} PTS</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className={cn(m.isMvp ? cn("bg-black text-white border-2 border-black rounded-lg font-black uppercase tracking-wider text-xs h-9 px-3.5 min-h-[38px] transition-all") : cn(CTA_CLASS, "h-9 px-3.5"))}
                    disabled={mvpMutation.isPending || (!m.isMvp && weekMvpSet)}
                    onClick={() => mvpMutation.mutate(m.userId)}
                  >
                    {m.isMvp ? "MVP ✓" : weekMvpSet ? "MVP Locked" : "Set MVP"}
                  </Button>
                </div>
              ));
            })()}
            {activeMembers.filter((m: any) => m.userId !== guild?.captainId && m.userId !== user?.id).length === 0 && (
              <EmptyState
                icon={<GiLaurelsTrophy size={22} className="text-black/40" />}
                chip="MVP"
                title="No members to promote"
                caption="Every eligible member already has a role."
              />
            )}
          </div>
        </PremiumCard>
      )}

      {/* ── Roster (kick) ── */}
      {activeTab === "roster" && (
        <PremiumCard interactive={false} className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <SectionChip>ROSTER · MEMBER MANAGEMENT</SectionChip>
            <GiRoundShield size={16} className="text-primary" />
          </div>
          <div className="divide-y divide-black/10">
            {activeMembers.map((m: any) => {
              const isCaptain = m.userId === guild?.captainId;
              const isSelf = m.userId === user?.id;
              return (
                <div key={m.userId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarStamp name={m.firstName || m.identity} avatarUrl={m.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold truncate">{isSelf ? "You" : (m.firstName || m.identity || "Member")}</p>
                        {isCaptain && <GiSpartanHelmet size={12} className="text-primary shrink-0" />}
                        {m.isMvp && <GiSpectacles size={12} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/40">{m.userRankTier ? `${m.userRankTier} · ` : ""}{(m.weeklyPointsContributed || 0).toLocaleString()} PTS</p>
                    </div>
                  </div>
                  {!isCaptain && !isSelf && (
                    <Button
                      size="sm"
                      className={cn(DESTRUCTIVE_OUTLINE, "shrink-0 h-9 px-3.5")}
                      onClick={() => setKickTarget(m)}
                    >
                      <GiCrossedAxes size={13} /> Remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </PremiumCard>
      )}

      {/* ── Tasks ── */}
      {activeTab === "tasks" && (
        <GuildTasksPanel />
      )}

      {/* ── Discover ── */}
      {activeTab === "discover" && (
        <GuildDiscoveryPanel />
      )}

      {/* ── My Access ── */}
      {activeTab === "permissions" && (
        <PremiumCard interactive={false} className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <SectionChip>MY ACCESS · GRANTED BY CAPTAIN</SectionChip>
            <GiShield size={16} className="text-primary" />
          </div>
          {perms.length === 0 ? (
            <div className="text-center py-8">
              <GiPadlock size={20} className="text-black/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-black/50">The captain has not granted you any permissions yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {perms.map(p => (
                <div key={p} className="flex items-center gap-2.5 border-2 border-black/10 rounded-lg px-3 py-2.5">
                  <GiRoundShield size={14} className="text-primary shrink-0" />
                  <span className="text-xs md:text-sm font-bold text-black/70">{PERMISSION_LABELS[p] ?? p.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}
        </PremiumCard>
      )}

      </div>{/* end tab content */}

      {/* ── Reject modal — ModalShell ── */}
      {rejectTarget && (
        <ModalShell
          onClose={() => { setRejectTarget(null); setRejectReason(""); }}
          footer={
            <div className="flex gap-2 justify-end">
              <Button size="sm" className={cn(OUTLINE_CLASS, "h-10 px-4")} onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button
                size="sm"
                className={cn(DESTRUCTIVE_CLASS, "h-10 px-4")}
                disabled={rejectReason.trim().length < 10 || decideMutation.isPending}
                onClick={() => decideMutation.mutate({ appId: rejectTarget.id, action: "reject" })}
              >
                {decideMutation.isPending ? "Rejecting…" : "Reject Application"}
              </Button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <SectionChip className="mb-2">REJECT APPLICATION</SectionChip>
              <p className="font-black text-lg tracking-tight">{rejectTarget.firstName || rejectTarget.identity || "Applicant"}</p>
            </div>
            <button
              onClick={() => setRejectTarget(null)}
              className={ICON_BTN_CLASS}
              aria-label="Close"
            >
              <GiSkullCrossedBones size={16} />
            </button>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-black/40 mb-1.5">Rejection Reason <span className="text-primary">· MIN 10 CHARS</span></label>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Explain why this application was not accepted…"
            className={cn(FIELD_AREA_CLASS, "min-h-[100px]")}
            maxLength={500}
          />
          <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-2">{rejectReason.length}/500 · {rejectReason.trim().length >= 10 ? "ready" : `${10 - rejectReason.trim().length} more to go`}</p>
        </ModalShell>
      )}

      {/* ── Kick confirm modal — ModalShell ── */}
      {kickTarget && (
        <ModalShell
          onClose={() => setKickTarget(null)}
          footer={
            <div className="flex gap-2 justify-end">
              <Button size="sm" className={cn(OUTLINE_CLASS, "h-10 px-4")} onClick={() => setKickTarget(null)}>Cancel</Button>
              <Button
                size="sm"
                className={cn(DESTRUCTIVE_CLASS, "h-10 px-4")}
                disabled={kickMutation.isPending}
                onClick={() => kickMutation.mutate(kickTarget.userId)}
              >
                {kickMutation.isPending ? "Removing…" : "Remove Member"}
              </Button>
            </div>
          }
        >
          <div className="flex items-center gap-3 mb-4">
            <AvatarStamp name={kickTarget.firstName || kickTarget.identity} avatarUrl={kickTarget.avatarUrl} size="sm" />
            <div>
              <SectionChip className="mb-1">REMOVE MEMBER</SectionChip>
              <p className="font-black text-lg tracking-tight">{kickTarget.firstName || kickTarget.identity || "Member"}</p>
            </div>
          </div>
          <p className="text-sm font-medium text-black/60 leading-relaxed">
            This member will be removed from the guild, their guild association cleared, and the weekly points reset for them. This cannot be undone.
          </p>
        </ModalShell>
      )}
    </div>
  );
}

export default AssistantPanel;
