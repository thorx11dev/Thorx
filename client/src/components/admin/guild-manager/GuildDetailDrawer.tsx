import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Crown, UserMinus, ShieldAlert, Users2, Trash2, Wallet, Target, History, Download, Activity, type LucideIcon } from "lucide-react";
import { RankOrUnknown, formatPkr, formatPersonName, formatDate, formatDateTime, explainDisposition } from "./guild-format";
import { downloadFromUrl } from "@/lib/downloadFromUrl";
import { apiAbsolutePath } from "@/lib/apiOrigin";
import type { AdminGuild, GuildMemberRow, GuildStrikeRow, GuildWeeklySnapshotRow, GuildChatMessageRow, GuildAuditLogRow } from "./types";

interface GuildDetailDrawerProps {
  guild: AdminGuild | null;
  onClose: () => void;
}

// Wraps the Sheet so the inner body can be keyed by guild.id — remounting on
// guild change resets tab/dialog state for free instead of hand-syncing it.
export function GuildDetailDrawer({ guild, onClose }: GuildDetailDrawerProps) {
  return (
    <Sheet open={!!guild} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col gap-0">
        {guild && <GuildDetailDrawerBody key={guild.id} guild={guild} />}
      </SheetContent>
    </Sheet>
  );
}

function OverviewStat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
        <Icon size={11} />
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-sm font-black text-[#111]">{value}</div>
    </div>
  );
}

function GuildDetailDrawerBody({ guild }: { guild: AdminGuild }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [kickTarget, setKickTarget] = useState<GuildMemberRow | null>(null);
  const [deleteMsgId, setDeleteMsgId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState(guild.targetDifficulty);

  const membersQuery = useQuery<{ members: GuildMemberRow[] }>({
    queryKey: ["/api/guilds", guild.id, "members"],
    queryFn: async () => (await apiRequest("GET", `/api/guilds/${guild.id}/members`)).json(),
    enabled: tab === "overview" || tab === "members",
  });
  const members = membersQuery.data?.members ?? [];
  const captain = members.find((m) => m.role === "captain") ?? null;

  const strikesQuery = useQuery<{ strikes: GuildStrikeRow[] }>({
    queryKey: ["/api/admin/guilds", guild.id, "strikes"],
    queryFn: async () => (await apiRequest("GET", `/api/admin/guilds/${guild.id}/strikes`)).json(),
    enabled: tab === "strikes",
  });
  const strikes = strikesQuery.data?.strikes ?? [];

  const historyQuery = useQuery<{ history: GuildWeeklySnapshotRow[] }>({
    queryKey: ["/api/guilds", guild.id, "weekly-history"],
    queryFn: async () => (await apiRequest("GET", `/api/guilds/${guild.id}/weekly-history`)).json(),
    enabled: tab === "history",
  });
  const history = historyQuery.data?.history ?? [];

  const chatQuery = useQuery<{ messages: GuildChatMessageRow[] }>({
    queryKey: ["/api/admin/guilds", guild.id, "chat"],
    queryFn: async () => (await apiRequest("GET", `/api/admin/guilds/${guild.id}/chat?limit=100`)).json(),
    enabled: tab === "chat",
  });
  const messages = chatQuery.data?.messages ?? [];

  const auditQuery = useQuery<{ logs: GuildAuditLogRow[]; totalCount: number }>({
    queryKey: ["/api/admin/guilds", guild.id, "audit-log"],
    queryFn: async () => (await apiRequest("GET", `/api/admin/guilds/${guild.id}/audit-log?limit=50`)).json(),
    enabled: tab === "activity",
  });
  const auditEntries = auditQuery.data?.logs ?? [];

  const kickMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/admin/guilds/${guild.id}/members/${userId}`)).json(),
    onSuccess: () => {
      toast({ title: "Member removed" });
      setKickTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guild.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guilds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guilds/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove member", description: err?.message, variant: "destructive" });
      setKickTarget(null);
    },
  });

  const deleteMsgMutation = useMutation({
    mutationFn: async (messageId: string) => (await apiRequest("DELETE", `/api/admin/guilds/${guild.id}/chat/${messageId}`)).json(),
    onSuccess: () => {
      toast({ title: "Message deleted" });
      setDeleteMsgId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guilds", guild.id, "chat"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete message", description: err?.message, variant: "destructive" });
      setDeleteMsgId(null);
    },
  });

  const difficultyMutation = useMutation({
    mutationFn: async (value: string) =>
      (await apiRequest("PATCH", `/api/admin/guilds/${guild.id}/target-difficulty`, { difficulty: value })).json(),
    onSuccess: () => {
      toast({ title: "Target difficulty updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guilds"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update difficulty", description: err?.message, variant: "destructive" });
      setDifficulty(guild.targetDifficulty);
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <SheetHeader className="p-6 pb-4 border-b border-black/10 text-left space-y-1 shrink-0">
        <SheetTitle className="font-black text-xl uppercase tracking-tight flex items-center gap-2 flex-wrap">
          {guild.name}
          <RankOrUnknown rank={guild.guildRank} />
          {guild.status === "frozen" && <Badge variant="destructive" className="text-[9px] font-black">FROZEN</Badge>}
          {guild.status === "disbanded" && <Badge variant="secondary" className="text-[9px] font-black">DISBANDED</Badge>}
        </SheetTitle>
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          {guild.memberCount}/{guild.memberCapacity} members · {guild.guildPerformanceScore} GPS
        </p>
      </SheetHeader>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-4 grid grid-cols-6 shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="strikes">Strikes</TabsTrigger>
          <TabsTrigger value="history">Weekly</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="overview" className="space-y-4 mt-0">
            {guild.description && <p className="text-sm text-zinc-600 italic">&quot;{guild.description}&quot;</p>}

            <div className="grid grid-cols-2 gap-3">
              <OverviewStat label="Captain" value={membersQuery.isLoading ? "Loading…" : formatPersonName(captain?.name)} icon={Crown} />
              <OverviewStat label="Rank / GPS" value={`${guild.guildRank || "Unknown"} · ${guild.guildPerformanceScore} GPS`} icon={Target} />
              <OverviewStat
                label="Next Rank"
                value={guild.nextRankMinGps != null ? `${guild.nextRankMinGps} GPS needed` : "Top rank reached"}
                icon={Target}
              />
              <OverviewStat label="Strikes" value={`${guild.strikes} (auto-freeze at 3)`} icon={ShieldAlert} />
              <OverviewStat
                label="Weekly Target"
                value={`${guild.currentWeeklyPoints.toLocaleString()} / ${guild.weeklyTarget.toLocaleString()} pts`}
                icon={Target}
              />
              <OverviewStat label="Weekly Bonus Pool" value={`Rs ${formatPkr(guild.weeklyBonusPool)}`} icon={Wallet} />
              <OverviewStat label="Bonus Pool" value={`Rs ${formatPkr(guild.bonusPoolPkr)}`} icon={Wallet} />
              <OverviewStat
                label="Recruitment"
                value={guild.isPublic ? (guild.recruitmentOpen ? "Open · Public" : "Closed · Public") : "Private"}
                icon={Users2}
              />
              <OverviewStat label="Min Rank Required" value={guild.minRankRequired || "Unknown"} icon={ShieldAlert} />
              <OverviewStat label="Created" value={formatDate(guild.createdAt)} icon={History} />
            </div>

            {guild.latestAnnouncement && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Latest Announcement</div>
                <p className="text-sm text-amber-900">{guild.latestAnnouncement}</p>
                <div className="text-[10px] text-amber-500 mt-1">{formatDateTime(guild.announcementPostedAt)}</div>
              </div>
            )}

            <div className="rounded-xl border-[1.5px] border-[#111] p-4 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                <Target size={12} /> Target Difficulty (admin-only)
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={difficulty}
                  onValueChange={(v) => { setDifficulty(v); difficultyMutation.mutate(v); }}
                  disabled={difficultyMutation.isPending}
                >
                  <SelectTrigger className="w-40 h-9 border-2 border-black text-sm font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                {difficultyMutation.isPending && <span className="text-xs text-zinc-400">Saving…</span>}
              </div>
              <p className="text-[11px] text-zinc-400">Controls how steep this guild's weekly target curve is. Captains cannot change this themselves.</p>
            </div>
          </TabsContent>

          <TabsContent value="members" className="mt-0">
            {membersQuery.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 text-xs font-bold text-zinc-400 uppercase tracking-widest">No active members</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Weekly Pts</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={m.profilePicture ?? undefined} />
                            <AvatarFallback className="text-[10px] font-black">
                              {formatPersonName(m.name).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-bold">{formatPersonName(m.name)}</span>
                          {m.isMvp && <Badge className="bg-amber-500 text-white border-0 text-[9px] font-black">MVP</Badge>}
                        </div>
                      </TableCell>
                      <TableCell><RankOrUnknown rank={m.userRankTier} /></TableCell>
                      <TableCell>
                        {m.role === "captain" ? (
                          <Badge className="bg-black text-white border-0 text-[9px] font-black"><Crown size={9} className="mr-1" />CAPTAIN</Badge>
                        ) : (
                          <span className="text-xs text-zinc-500 font-bold">Member</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm">{m.weeklyPointsContributed.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{formatDate(m.joinedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-[10px] font-black border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-30"
                          disabled={m.role === "captain"}
                          title={m.role === "captain" ? "Reassign the captain before removing them" : undefined}
                          onClick={() => setKickTarget(m)}
                        >
                          <UserMinus size={10} className="mr-1" /> Kick
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="strikes" className="mt-0">
            <div className="flex justify-end mb-2">
              <Button
                size="sm" variant="outline"
                className="h-7 text-[10px] font-black border-2 border-black"
                onClick={() => downloadFromUrl(apiAbsolutePath(`/api/admin/guilds/${guild.id}/strikes/export`), `${guild.name}-strikes.csv`)}
              >
                <Download size={11} className="mr-1" /> Export CSV
              </Button>
            </div>
            {strikesQuery.isLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : strikes.length === 0 ? (
              <div className="text-center py-12 text-xs font-bold text-zinc-400 uppercase tracking-widest">No strikes on record</div>
            ) : (
              <div className="space-y-2">
                {strikes.map((s) => (
                  <div key={s.id} className="rounded-xl border border-zinc-200 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[9px] font-black uppercase">{s.source.replace(/_/g, " ")}</Badge>
                      {s.clearedAt ? (
                        <Badge variant="secondary" className="text-[9px] font-black">Cleared</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[9px] font-black">Active</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-700">{s.reason}</p>
                    <div className="text-[10px] text-zinc-400">
                      Added by {formatPersonName(s.addedByName)} · {formatDateTime(s.createdAt)}
                    </div>
                    {s.clearedAt && (
                      <div className="text-[10px] text-zinc-400">
                        Cleared by {formatPersonName(s.clearedByName)} · {formatDateTime(s.clearedAt)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {historyQuery.isLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-xs font-bold text-zinc-400 uppercase tracking-widest">No weekly cycles resolved yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Achieved</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Bonus Pool</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs font-bold">{formatDate(h.weekStart)}</TableCell>
                      <TableCell className="text-right text-sm">{h.targetPoints.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{h.achievedPoints.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{formatPkr(h.achievementPct)}%</TableCell>
                      <TableCell>
                        {h.wasSuccessful ? (
                          <Badge className="bg-emerald-600 text-white border-0 text-[9px] font-black">Success</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[9px] font-black">Missed</Badge>
                        )}
                        <div className="text-[10px] text-zinc-400 font-normal mt-1 max-w-[200px] leading-snug">{explainDisposition(h)}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold">
                        Rs {formatPkr(h.bonusPoolPkr)} <span className="text-[10px] text-zinc-400 font-normal">({h.poolDisposition})</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            {chatQuery.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-xs font-bold text-zinc-400 uppercase tracking-widest">No messages yet</div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div key={msg.id} className="rounded-xl border border-zinc-200 p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black">{formatPersonName(`${msg.firstName ?? ""} ${msg.lastName ?? ""}`)}</span>
                        <RankOrUnknown rank={msg.userRankTier} />
                        <span className="text-[10px] text-zinc-400">{formatDateTime(msg.createdAt)}</span>
                      </div>
                      <p className="text-sm text-zinc-700 mt-1 break-words">{msg.message}</p>
                    </div>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-red-500 hover:bg-red-50 shrink-0"
                      onClick={() => setDeleteMsgId(msg.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            {auditQuery.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : auditEntries.length === 0 ? (
              <div className="text-center py-12 text-xs font-bold text-zinc-400 uppercase tracking-widest">No activity recorded yet</div>
            ) : (
              <div className="space-y-2">
                {auditEntries.map((log) => {
                  const detailEntries = log.details && typeof log.details === "object"
                    ? Object.entries(log.details).filter(([, v]) => v !== null && v !== undefined && v !== "")
                    : [];
                  return (
                    <div key={log.id} className="rounded-xl border border-zinc-200 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wide">
                          <Activity size={10} className="mr-1" />
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-[10px] text-zinc-400">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <div className="text-xs text-zinc-600">
                        By {formatPersonName(log.admin ? `${log.admin.firstName} ${log.admin.lastName}` : null)}
                      </div>
                      {detailEntries.length > 0 && (
                        <div className="text-[11px] text-zinc-400 font-mono break-words bg-zinc-50 rounded-lg p-2">
                          {detailEntries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <AlertDialog open={!!kickTarget} onOpenChange={(open) => !open && setKickTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {kickTarget ? formatPersonName(kickTarget.name) : "this member"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be removed from {guild.name} immediately and notified. This cannot be undone from here — they would need to re-apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={kickMutation.isPending}
              onClick={() => kickTarget && kickMutation.mutate(kickTarget.userId)}
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteMsgId} onOpenChange={(open) => !open && setDeleteMsgId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>This removes it from the guild chat for all members. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMsgMutation.isPending}
              onClick={() => deleteMsgId && deleteMsgMutation.mutate(deleteMsgId)}
            >
              Delete Message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
