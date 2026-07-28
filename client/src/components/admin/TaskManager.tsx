/**
 * Tasks Manager
 * Admin interface for managing both Engine B (CPA Tasks) and Engine C (Guild Weekly Tasks).
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Edit2, ExternalLink, Search,
  CheckCircle2, XCircle, Eye, EyeOff, Calendar, Coins, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TechnicalLabel from "@/components/ui/technical-label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QUERY_KEYS } from "@/lib/queryKeys";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineBTask {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  actionUrl?: string | null;
  secretCode?: string | null;
  instructions?: string | null;
  targetRank: string;
  difficulty: string;
  isActive: boolean;
  grossPkrPerCompletion: string;
  createdAt?: string;
}

interface WeeklyTask {
  id: string;
  title: string;
  description?: string | null;
  pointReward: number;
  weekStart: string;
  weekEnd: string;
  /** Single-char DB value: "E" | "D" | "C" | "B" | "A" | "S" */
  targetGuildRank: string;
  isActive: boolean;
  grossPkrPerCompletion?: string | null;
  createdBy?: string;
  createdAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANK_TIERS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Elite"];

/** Maps the DB single-char rank code → display string */
const GUILD_RANK_DISPLAY: Record<string, string> = {
  E: "E-Rank", D: "D-Rank", C: "C-Rank", B: "B-Rank", A: "A-Rank", S: "S-Rank",
};
/** Maps display string → DB single-char code */
const GUILD_RANK_CODE: Record<string, string> = {
  "E-Rank": "E", "D-Rank": "D", "C-Rank": "C", "B-Rank": "B", "A-Rank": "A", "S-Rank": "S",
};

const DEFAULT_ENGINE_B_FORM = {
  title: "",
  description: "",
  actionUrl: "",
  secretCode: "",
  instructions: "",
  targetRank: "C-Rank",
  difficulty: "Easy",
  isActive: true,
  grossPkrPerCompletion: "0.50",
};

const DEFAULT_WEEKLY_FORM = {
  title: "",
  description: "",
  pointReward: 100,
  weekStart: "",
  weekEnd: "",
  targetGuildRank: "E-Rank",
  isActive: true,
  grossPkrPerCompletion: "0.50",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISOLocal(date: Date) {
  return date.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// ─── Engine B Tab ─────────────────────────────────────────────────────────────

function EngineBTasksTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EngineBTask | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(DEFAULT_ENGINE_B_FORM);

  const { data: tasks = [], isLoading, isError } = useQuery<EngineBTask[]>({
    queryKey: QUERY_KEYS.adminTasks,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof DEFAULT_ENGINE_B_FORM) =>
      apiRequest("POST", "/api/admin/engine-b-tasks", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminTasks });
      toast({ title: "Task created", description: "CPA task added successfully." });
      setIsDialogOpen(false);
      setForm(DEFAULT_ENGINE_B_FORM);
    },
    onError: () => toast({ title: "Error", description: "Failed to create task.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof DEFAULT_ENGINE_B_FORM> }) =>
      apiRequest("PATCH", `/api/admin/engine-b-tasks/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminTasks });
      toast({ title: "Task updated" });
      setIsDialogOpen(false);
      setEditingTask(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update task.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/engine-b-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminTasks });
      toast({ title: "Task deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete task.", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/engine-b-tasks/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminTasks }),
    onError: () => toast({ title: "Error", description: "Failed to toggle task.", variant: "destructive" }),
  });

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const openCreate = () => {
    setEditingTask(null);
    setForm(DEFAULT_ENGINE_B_FORM);
    setIsDialogOpen(true);
  };

  const openEdit = (task: EngineBTask) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      actionUrl: task.actionUrl || "",
      secretCode: task.secretCode || "",
      instructions: task.instructions || "",
      targetRank: task.targetRank,
      difficulty: task.difficulty,
      isActive: task.isActive,
      grossPkrPerCompletion: task.grossPkrPerCompletion,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const pkr = parseFloat(form.grossPkrPerCompletion);
    if (isNaN(pkr) || pkr <= 0) {
      toast({ title: "Invalid PKR amount", description: "Must be a positive number.", variant: "destructive" });
      return;
    }
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm font-bold text-destructive">Failed to load CPA tasks</p>
      <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminTasks })}>
        Retry
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <TechnicalLabel text={`${tasks.length} CPA TASKS`} className="text-muted-foreground" />
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New CPA Task
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search CPA tasks…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">{searchTerm ? "No matching tasks." : "No CPA tasks yet."}</p>
          {!searchTerm && (
            <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add First Task
            </Button>
          )}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-2">
            {filteredTasks.map(task => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "border rounded-lg p-4 flex items-start gap-4 transition-colors",
                  task.isActive ? "bg-card border-border" : "bg-muted/30 border-muted opacity-60",
                )}
              >
                <div className="mt-1 shrink-0">
                  {task.isActive
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <XCircle className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{task.title}</span>
                    <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono">
                      Rs. {(parseFloat(task.grossPkrPerCompletion) || 0).toFixed(2)}
                    </span>
                    <span className="text-xs border rounded px-1.5 py-0.5 text-muted-foreground">
                      {task.difficulty}
                    </span>
                    <span className="text-xs border rounded px-1.5 py-0.5 text-muted-foreground">
                      {task.targetRank}+
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{task.description}</p>
                  )}
                  {task.actionUrl && (
                    <a
                      href={task.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
                    >
                      <ExternalLink className="w-3 h-3" /> {task.actionUrl}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => toggleMutation.mutate({ id: task.id, isActive: !task.isActive })}
                    title={task.isActive ? "Deactivate" : "Activate"}
                  >
                    {task.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(task)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Delete "${task.title}"?`)) deleteMutation.mutate(task.id); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) setEditingTask(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit CPA Task" : "New CPA Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description shown to users"
                rows={2}
              />
            </div>
            <div>
              <Label>Gross PKR per Completion *</Label>
              <Input
                type="number" step="0.01" min="0.01"
                value={form.grossPkrPerCompletion}
                onChange={e => setForm(f => ({ ...f, grossPkrPerCompletion: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Target Rank (minimum)</Label>
                <Select value={form.targetRank} onValueChange={v => setForm(f => ({ ...f, targetRank: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANK_TIERS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={form.difficulty} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Action URL (link user visits)</Label>
              <Input
                type="url" value={form.actionUrl}
                onChange={e => setForm(f => ({ ...f, actionUrl: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label>Secret Code (user must enter to verify)</Label>
              <Input
                value={form.secretCode}
                onChange={e => setForm(f => ({ ...f, secretCode: e.target.value }))}
                placeholder="e.g. THORX2026"
              />
            </div>
            <div>
              <Label>Instructions</Label>
              <Textarea
                value={form.instructions}
                onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                placeholder="Step-by-step instructions for user"
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Active (visible to users)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Guild Weekly Tasks Tab ───────────────────────────────────────────────────

function GuildWeeklyTasksTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<WeeklyTask | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(DEFAULT_WEEKLY_FORM);

  const { data: response, isLoading, isError } = useQuery<{ tasks: WeeklyTask[] }>({
    queryKey: QUERY_KEYS.adminWeeklyTasks,
  });
  const tasks = response?.tasks ?? [];

  const createMutation = useMutation({
    mutationFn: (data: typeof DEFAULT_WEEKLY_FORM) => {
      const payload = {
        title: data.title,
        description: data.description || undefined,
        pointReward: data.pointReward,
        weekStart: new Date(data.weekStart).toISOString(),
        weekEnd: new Date(data.weekEnd).toISOString(),
        targetGuildRank: GUILD_RANK_CODE[data.targetGuildRank] ?? "E",
        isActive: data.isActive,
        grossPkrPerCompletion: data.grossPkrPerCompletion || undefined,
      };
      return apiRequest("POST", "/api/admin/weekly-tasks", payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminWeeklyTasks });
      toast({ title: "Guild task created" });
      setIsDialogOpen(false);
      setForm(DEFAULT_WEEKLY_FORM);
    },
    onError: (err: any) => toast({
      title: "Error",
      description: err?.message || "Failed to create guild task.",
      variant: "destructive",
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof DEFAULT_WEEKLY_FORM> }) => {
      const payload: Record<string, unknown> = {};
      if (data.title !== undefined) payload.title = data.title;
      if (data.description !== undefined) payload.description = data.description || null;
      if (data.pointReward !== undefined) payload.pointReward = data.pointReward;
      if (data.isActive !== undefined) payload.isActive = data.isActive;
      if (data.targetGuildRank !== undefined) payload.targetGuildRank = GUILD_RANK_CODE[data.targetGuildRank] ?? "E";
      if (data.weekStart !== undefined) payload.weekStart = new Date(data.weekStart).toISOString();
      if (data.weekEnd !== undefined) payload.weekEnd = new Date(data.weekEnd).toISOString();
      if (data.grossPkrPerCompletion !== undefined) payload.grossPkrPerCompletion = data.grossPkrPerCompletion || null;
      return apiRequest("PATCH", `/api/admin/weekly-tasks/${id}`, payload).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminWeeklyTasks });
      toast({ title: "Guild task updated" });
      setIsDialogOpen(false);
      setEditingTask(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update guild task.", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/weekly-tasks/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminWeeklyTasks }),
    onError: () => toast({ title: "Error", description: "Failed to toggle task.", variant: "destructive" }),
  });

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const openCreate = () => {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setEditingTask(null);
    setForm({
      ...DEFAULT_WEEKLY_FORM,
      weekStart: toISOLocal(now),
      weekEnd: toISOLocal(weekLater),
    });
    setIsDialogOpen(true);
  };

  const openEdit = (task: WeeklyTask) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      pointReward: task.pointReward,
      weekStart: toISOLocal(new Date(task.weekStart)),
      weekEnd: toISOLocal(new Date(task.weekEnd)),
      targetGuildRank: GUILD_RANK_DISPLAY[task.targetGuildRank] ?? "E-Rank",
      isActive: task.isActive,
      grossPkrPerCompletion: task.grossPkrPerCompletion ?? "0.00",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!form.weekStart || !form.weekEnd) {
      toast({ title: "Week range required", description: "Set both start and end date.", variant: "destructive" });
      return;
    }
    if (new Date(form.weekEnd) <= new Date(form.weekStart)) {
      toast({ title: "Invalid dates", description: "End date must be after start date.", variant: "destructive" });
      return;
    }
    if (form.pointReward < 1) {
      toast({ title: "Invalid reward", description: "Point reward must be at least 1.", variant: "destructive" });
      return;
    }
    const pkr = parseFloat(form.grossPkrPerCompletion);
    if (isNaN(pkr) || pkr < 0) {
      toast({ title: "Invalid PKR amount", description: "Must be a non-negative number.", variant: "destructive" });
      return;
    }
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm font-bold text-destructive">Failed to load guild weekly tasks</p>
      <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminWeeklyTasks })}>
        Retry
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <TechnicalLabel text={`${tasks.length} WEEKLY TASKS`} className="text-muted-foreground" />
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New Guild Task
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search guild tasks…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">{searchTerm ? "No matching tasks." : "No guild weekly tasks yet."}</p>
          {!searchTerm && (
            <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add First Guild Task
            </Button>
          )}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-2">
            {filteredTasks.map(task => {
              const rankDisplay = GUILD_RANK_DISPLAY[task.targetGuildRank] ?? task.targetGuildRank;
              const now = Date.now();
              const isLive = task.isActive &&
                new Date(task.weekStart).getTime() <= now &&
                new Date(task.weekEnd).getTime() >= now;
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    "border rounded-lg p-4 flex items-start gap-4 transition-colors",
                    task.isActive ? "bg-card border-border" : "bg-muted/30 border-muted opacity-60",
                  )}
                >
                  <div className="mt-1 shrink-0">
                    {task.isActive
                      ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                      : <XCircle className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{task.title}</span>
                      <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono flex items-center gap-1">
                        <Coins className="w-3 h-3" /> {task.pointReward} pts
                      </span>
                      {task.grossPkrPerCompletion && parseFloat(task.grossPkrPerCompletion) > 0 && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 font-mono">
                          Rs. {parseFloat(task.grossPkrPerCompletion).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs border rounded px-1.5 py-0.5 text-muted-foreground">
                        {rankDisplay}+
                      </span>
                      {isLive && (
                        <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-bold">
                          LIVE
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(task.weekStart)} → {formatDate(task.weekEnd)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => toggleMutation.mutate({ id: task.id, isActive: !task.isActive })}
                      title={task.isActive ? "Deactivate" : "Activate"}
                    >
                      {task.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(task)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}

      <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) setEditingTask(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Guild Task" : "New Guild Weekly Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What guild members need to do"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>TX Points Reward *</Label>
                <Input
                  type="number" step="1" min="1" max="100000"
                  value={form.pointReward}
                  onChange={e => setForm(f => ({ ...f, pointReward: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>Gross PKR per Completion *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.grossPkrPerCompletion}
                  onChange={e => setForm(f => ({ ...f, grossPkrPerCompletion: e.target.value }))}
                  placeholder="0.50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Week Start *</Label>
                <Input
                  type="datetime-local"
                  value={form.weekStart}
                  onChange={e => setForm(f => ({ ...f, weekStart: e.target.value }))}
                />
              </div>
              <div>
                <Label>Week End *</Label>
                <Input
                  type="datetime-local"
                  value={form.weekEnd}
                  onChange={e => setForm(f => ({ ...f, weekEnd: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Target Guild Rank (minimum)</Label>
              <Select value={form.targetGuildRank} onValueChange={v => setForm(f => ({ ...f, targetGuildRank: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RANK_TIERS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Active (visible to guild members)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

type TaskTab = "cpa" | "guild";

export function TaskManager() {
  const [activeTab, setActiveTab] = useState<TaskTab>("cpa");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-black tracking-tight">TASKS</h2>
        <TechnicalLabel text="ENGINE B — CPA TASKS  ·  ENGINE C — GUILD WEEKLY TASKS" className="text-muted-foreground" />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("cpa")}
          className={cn(
            "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors",
            activeTab === "cpa"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          CPA Tasks (Engine B)
        </button>
        <button
          onClick={() => setActiveTab("guild")}
          className={cn(
            "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors",
            activeTab === "guild"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Guild Tasks (Engine C)
        </button>
      </div>

      {activeTab === "cpa" ? <EngineBTasksTab /> : <GuildWeeklyTasksTab />}
    </div>
  );
}
