/**
 * GuildTasksPanel — shared Engine C weekly-tasks list.
 *
 * Used by the Member, Captain, and Assistant panels so the WHOLE guild works
 * on the same weekly tasks (the captain/assistant were previously unable to
 * reach this tab at all). Wraps GET /api/guilds/weekly-tasks +
 * POST /api/guilds/weekly-tasks/:taskId/complete with the premium
 * ivory/black/orange card treatment shared across the portals.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PremiumCard } from "@/components/ui/premium-card";
import { SectionChip, CTA_CLASS } from "./GuildPanelShell";
import { GiWarhammer, GiSwordSpin, GiRoundShield } from "./guild-icons";
import { cn } from "@/lib/utils";

export function GuildTasksPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const guildId = user?.guildId;

  const { data: weeklyTasks = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: guildId ? QUERY_KEYS.guildTasks(guildId) : [],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/weekly-tasks`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d.tasks ?? d.weeklyTasks ?? []);
    },
    enabled: !!guildId,
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const r = await apiRequest("POST", `/api/guilds/weekly-tasks/${taskId}/complete`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Task Completed!", description: "Points and PS awarded." });
      if (guildId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildTasks(guildId) });
      // Refresh guild header + progress bar so weekly contribution updates immediately.
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildMine });
      queryClient.invalidateQueries({ queryKey: ["earnings"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Could not complete task.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <PremiumCard key={i} interactive={false} className="animate-pulse">
            <div className="h-4 w-40 bg-black/10 rounded" />
            <div className="h-3 w-64 bg-black/5 rounded mt-2.5" />
            <div className="h-3 w-20 bg-black/10 rounded mt-3" />
          </PremiumCard>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <PremiumCard interactive={false} className="p-6 text-center">
        <p className="text-sm font-medium text-black/50">Could not load guild tasks.</p>
        <button
          onClick={() => refetch()}
          className={cn(CTA_CLASS, "h-10 px-4 text-[10px] mt-4")}
        >
          Retry
        </button>
      </PremiumCard>
    );
  }

  if (weeklyTasks.length === 0) {
    return (
      <PremiumCard interactive={false} className="text-center py-14">
        <div className="p-3 bg-[#EAE5DD] border-2 border-black/10 rounded-xl w-fit mx-auto mb-4">
          <GiWarhammer size={22} className="text-black/40" />
        </div>
        <SectionChip className="mb-3">ENGINE C · TASKS</SectionChip>
        <p className="text-sm font-medium text-black/50">No guild tasks available this week.</p>
      </PremiumCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <SectionChip>ENGINE C · WEEKLY TASKS</SectionChip>
        <GiRoundShield size={14} className="text-primary shrink-0" />
      </div>
      {weeklyTasks.map((task: any) => (
        <PremiumCard
          key={task.id}
          interactive={false}
          className="p-4 md:p-5 flex items-center justify-between gap-4 border-2 border-black/10 hover:border-black transition-colors"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm md:text-base font-black tracking-tight text-foreground">{task.title}</span>
              {task.completedByUser && (
                <Badge className="text-[10px] bg-emerald-600 text-white font-black rounded-sm px-2 py-0.5">
                  Completed ✓
                </Badge>
              )}
            </div>
            {task.description && (
              <p className="text-xs md:text-sm font-medium text-black/50 mt-1">{task.description}</p>
            )}
            {task.txPointsReward > 0 && (
              <p className="text-xs font-black uppercase tracking-wider text-primary mt-1.5">
                ~{task.txPointsReward}–{task.txPointsRewardMax} PTS
              </p>
            )}
          </div>
          <Button
            size="sm"
            className={cn(
              "shrink-0 h-10 px-4 rounded-lg border-2 text-[10px] md:text-[11px] font-black uppercase tracking-wider transition-all duration-300",
              task.completedByUser
                ? "bg-emerald-50 text-emerald-700 border-emerald-300 cursor-default"
                : CTA_CLASS
            )}
            disabled={completeTaskMutation.isPending || task.completedByUser}
            onClick={() => completeTaskMutation.mutate(task.id)}
          >
            {completeTaskMutation.isPending ? <GiSwordSpin size={13} className="animate-spin" /> : null}
            {task.completedByUser ? "Completed" : "Complete"}
          </Button>
        </PremiumCard>
      ))}
    </div>
  );
}

export default GuildTasksPanel;
