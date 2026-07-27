/**
 * GuildWarsAdmin — Admin panel for managing Guild War seasons and wars.
 * Routes: GET/POST /api/admin/guild-wars/seasons, PATCH activate
 *         GET/POST /api/admin/guild-wars/wars, PATCH resolve
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Swords, Trophy, Plus, Play, CheckCircle2, RefreshCw, Shield, Zap } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending_challenger_approval: "bg-yellow-100 text-yellow-700 border-yellow-200",
  pending_challenged_approval: "bg-orange-100 text-orange-700 border-orange-200",
  active: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

export function GuildWarsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Seasons ──────────────────────────────────────────────────────────────
  const { data: seasonsData, isLoading: seasonsLoading } = useQuery<any>({
    queryKey: ["/api/admin/guild-wars/seasons"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/guild-wars/seasons");
      return r.json();
    },
  });

  // ── Wars ─────────────────────────────────────────────────────────────────
  const { data: warsData, isLoading: warsLoading } = useQuery<any>({
    queryKey: ["/api/admin/guild-wars/wars"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/guild-wars/wars");
      return r.json();
    },
  });

  // ── Guild list (for creating wars) ───────────────────────────────────────
  const { data: guildsData } = useQuery<any>({
    queryKey: ["/api/admin/guilds", "", "active"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/guilds?status=active");
      return r.json();
    },
  });

  // ── Season modal state ───────────────────────────────────────────────────
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [seasonForm, setSeasonForm] = useState({
    name: "", startDate: "", endDate: "", prizePoolPkr: "",
  });

  // ── War modal state ──────────────────────────────────────────────────────
  const [showWarModal, setShowWarModal] = useState(false);
  const [warForm, setWarForm] = useState({
    seasonId: "", guild1Id: "", guild2Id: "",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/guild-wars/seasons"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/guild-wars/wars"] });
  };

  const createSeasonMutation = useMutation({
    mutationFn: async (data: typeof seasonForm) => {
      const r = await apiRequest("POST", "/api/admin/guild-wars/seasons", {
        name: data.name,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        prizePoolPkr: data.prizePoolPkr,
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Season created" });
      setShowSeasonModal(false);
      setSeasonForm({ name: "", startDate: "", endDate: "", prizePoolPkr: "" });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const activateSeasonMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/admin/guild-wars/seasons/${id}/activate`, {});
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Season activated" });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const createWarMutation = useMutation({
    mutationFn: async (data: typeof warForm) => {
      const r = await apiRequest("POST", "/api/admin/guild-wars/wars", {
        seasonId: data.seasonId,
        guild1Id: data.guild1Id,
        guild2Id: data.guild2Id,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        prizePoolPkr: "0",
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "War created", description: "Both guilds must approve before it becomes active." });
      setShowWarModal(false);
      setWarForm({ seasonId: "", guild1Id: "", guild2Id: "" });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const resolveWarMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/admin/guild-wars/wars/${id}/resolve`, {});
      return r.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "War resolved", description: `Winner: ${data?.war?.winnerGuildName ?? "N/A"}` });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const seasons = seasonsData?.seasons ?? [];
  const activeSeason = seasonsData?.activeSeason ?? null;
  const wars = warsData?.wars ?? [];
  const guilds = guildsData?.guilds ?? [];

  return (
    <div className="space-y-8 pb-24 w-full animate-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase text-[#111]">Guild Wars</h2>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Manage seasons, matchmaking, and war resolution</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowWarModal(true)}
            disabled={seasons.length === 0}
            className="border-2 border-black font-black text-xs flex items-center gap-2"
            variant="outline"
          >
            <Swords className="w-4 h-4" /> Create War
          </Button>
          <Button
            onClick={() => setShowSeasonModal(true)}
            className="border-2 border-black font-black text-xs flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Season
          </Button>
        </div>
      </div>

      {/* Active Season Banner */}
      {activeSeason && (
        <div className="rounded-xl border-2 border-blue-500 bg-blue-50 p-4 flex items-center gap-3">
          <Trophy className="text-blue-600 shrink-0" size={20} />
          <div className="flex-1">
            <div className="font-black text-sm text-blue-800">Active Season: {activeSeason.name}</div>
            <div className="text-xs text-blue-600 mt-0.5">
              {new Date(activeSeason.startDate).toLocaleDateString()} — {new Date(activeSeason.endDate).toLocaleDateString()}
              {activeSeason.prizePoolPkr && ` · Prize Pool: Rs ${parseFloat(activeSeason.prizePoolPkr).toFixed(0)}`}
            </div>
          </div>
          <Badge className="bg-blue-600 text-white border-0 font-black">LIVE</Badge>
        </div>
      )}

      {/* Seasons List */}
      <div className="space-y-3">
        <div className="font-black text-sm uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <Trophy size={14} /> Seasons ({seasons.length})
        </div>
        {seasonsLoading ? (
          <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : seasons.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-zinc-200 rounded-xl">
            <Trophy className="mx-auto mb-2 text-zinc-300" size={32} />
            <p className="text-sm text-zinc-400 font-semibold">No seasons yet. Create the first one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {seasons.map((s: any) => {
              const isActive = activeSeason?.id === s.id;
              return (
                <div key={s.id} className={cn(
                  "rounded-xl border-[1.5px] p-4 flex items-center gap-4",
                  isActive ? "border-blue-400 bg-blue-50" : "border-[#111]/10 bg-white"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm">{s.name}</span>
                      {isActive && <Badge className="bg-blue-600 text-white border-0 text-[10px] font-black">ACTIVE</Badge>}
                      {s.status === "completed" && <Badge variant="outline" className="text-zinc-400 text-[10px]">COMPLETED</Badge>}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {new Date(s.startDate).toLocaleDateString()} — {new Date(s.endDate).toLocaleDateString()}
                      {s.prizePoolPkr && ` · Pool: Rs ${parseFloat(s.prizePoolPkr).toFixed(0)}`}
                    </div>
                  </div>
                  {!isActive && s.status !== "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-2 border-black font-black text-xs h-8"
                      disabled={activateSeasonMutation.isPending}
                      onClick={() => activateSeasonMutation.mutate(s.id)}
                    >
                      <Play className="w-3 h-3 mr-1" /> Activate
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wars List */}
      <div className="space-y-3">
        <div className="font-black text-sm uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <Swords size={14} /> Recent Wars ({wars.length})
        </div>
        {warsLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : wars.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-zinc-200 rounded-xl">
            <Swords className="mx-auto mb-2 text-zinc-300" size={32} />
            <p className="text-sm text-zinc-400 font-semibold">No wars yet. Create a matchup between two guilds.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wars.map((w: any) => (
              <div key={w.id} className="rounded-xl border-[1.5px] border-[#111] bg-white p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                       <span className="font-black text-sm">{w.challengerGuildName ?? w.challengerGuildId?.slice(0,8) ?? "Guild A"}</span>
                      <Zap size={12} className="text-amber-500" />
                       <span className="font-black text-sm">{w.challengedGuildName ?? w.challengedGuildId?.slice(0,8) ?? "Guild B"}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] font-black", STATUS_COLORS[w.status] ?? "bg-zinc-100 text-zinc-500")}
                      >
                        {w.status?.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {w.createdAt && `Created ${formatDistanceToNow(new Date(w.createdAt), { addSuffix: true })}`}
                       {w.winnerId && ` · Winner: ${w.winnerGuildName ?? w.winnerId.slice(0,8)}`}
                    </div>
                  </div>
                  {w.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-2 border-emerald-500 text-emerald-700 font-black text-xs h-8 shrink-0"
                      disabled={resolveWarMutation.isPending}
                      onClick={() => resolveWarMutation.mutate(w.id)}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Season Modal */}
      <Dialog open={showSeasonModal} onOpenChange={setShowSeasonModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-lg uppercase">Create New Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Season Name</Label>
              <Input
                placeholder="e.g. Summer Wars 2026"
                value={seasonForm.name}
                onChange={e => setSeasonForm(p => ({ ...p, name: e.target.value }))}
                className="border-2 border-black"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Start Date</Label>
                <Input type="date" value={seasonForm.startDate} onChange={e => setSeasonForm(p => ({ ...p, startDate: e.target.value }))} className="border-2 border-black" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">End Date</Label>
                <Input type="date" value={seasonForm.endDate} onChange={e => setSeasonForm(p => ({ ...p, endDate: e.target.value }))} className="border-2 border-black" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Prize Pool (PKR)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={seasonForm.prizePoolPkr}
                onChange={e => setSeasonForm(p => ({ ...p, prizePoolPkr: e.target.value }))}
                className="border-2 border-black"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-2 border-black font-black text-xs" onClick={() => setShowSeasonModal(false)}>Cancel</Button>
            <Button
              className="font-black text-xs"
              disabled={!seasonForm.name || !seasonForm.startDate || !seasonForm.endDate || !seasonForm.prizePoolPkr || createSeasonMutation.isPending}
              onClick={() => createSeasonMutation.mutate(seasonForm)}
            >
              {createSeasonMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
              Create Season
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create War Modal */}
      <Dialog open={showWarModal} onOpenChange={setShowWarModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-lg uppercase flex items-center gap-2">
              <Swords size={18} /> Create War Matchup
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Season</Label>
              <select
                className="w-full h-10 border-2 border-black rounded-lg px-3 text-sm font-bold"
                value={warForm.seasonId}
                onChange={e => setWarForm(p => ({ ...p, seasonId: e.target.value }))}
              >
                <option value="">— Select a season —</option>
                {seasons.filter((s: any) => s.status !== "completed").map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Challenger Guild</Label>
              <select
                className="w-full h-10 border-2 border-black rounded-lg px-3 text-sm font-bold"
                value={warForm.guild1Id}
                onChange={e => setWarForm(p => ({ ...p, guild1Id: e.target.value }))}
              >
                <option value="">— Select Guild A —</option>
                {guilds.filter((g: any) => g.id !== warForm.guild2Id).map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Challenged Guild</Label>
              <select
                className="w-full h-10 border-2 border-black rounded-lg px-3 text-sm font-bold"
                value={warForm.guild2Id}
                onChange={e => setWarForm(p => ({ ...p, guild2Id: e.target.value }))}
              >
                <option value="">— Select Guild B —</option>
                {guilds.filter((g: any) => g.id !== warForm.guild1Id).map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              ⚔️ Both guilds must vote to approve before the war becomes active. Once active, the first guild to complete their weekly target wins.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-2 border-black font-black text-xs" onClick={() => setShowWarModal(false)}>Cancel</Button>
            <Button
              className="font-black text-xs"
              disabled={!warForm.seasonId || !warForm.guild1Id || !warForm.guild2Id || createWarMutation.isPending}
              onClick={() => createWarMutation.mutate(warForm)}
            >
              {createWarMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Swords className="w-3 h-3 mr-1" />}
              Create Matchup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDistanceToNow(date: Date, opts?: { addSuffix?: boolean }) {
  const ms = Date.now() - date.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let str = days > 0 ? `${days}d` : hours > 0 ? `${hours}h` : minutes > 0 ? `${minutes}m` : "just now";
  return opts?.addSuffix && str !== "just now" ? `${str} ago` : str;
}
