/**
 * Engine B Task Manager
 * Admin interface for managing Engine B CPA tasks.
 * Replaces the legacy daily_tasks system.
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Edit2, ExternalLink, Search,
  CheckCircle2, XCircle, Eye, EyeOff,
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

const RANK_TIERS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Elite"];

const DEFAULT_FORM = {
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

export function TaskManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EngineBTask | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery<EngineBTask[]>({
    queryKey: ["/api/admin/engine-b-tasks"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof DEFAULT_FORM) =>
      apiRequest("POST", "/api/admin/engine-b-tasks", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-b-tasks"] });
      toast({ title: "Task created", description: "Engine B CPA task added successfully." });
      setIsDialogOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: () => toast({ title: "Error", description: "Failed to create task.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof DEFAULT_FORM> }) =>
      apiRequest("PATCH", `/api/admin/engine-b-tasks/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-b-tasks"] });
      toast({ title: "Task updated" });
      setIsDialogOpen(false);
      setEditingTask(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update task.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/engine-b-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-b-tasks"] });
      toast({ title: "Task deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete task.", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/engine-b-tasks/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-b-tasks"] }),
  });

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const openCreate = () => {
    setEditingTask(null);
    setForm(DEFAULT_FORM);
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
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-tight">ENGINE B — CPA TASKS</h2>
          <TechnicalLabel text={`${tasks.length} TASKS TOTAL`} className="text-muted-foreground" />
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New CPA Task
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No Engine B tasks found.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add First Task
          </Button>
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
                {/* Status indicator */}
                <div className="mt-1 shrink-0">
                  {task.isActive
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <XCircle className="w-5 h-5 text-muted-foreground" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{task.title}</span>
                    <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono">
                      Rs. {parseFloat(task.grossPkrPerCompletion).toFixed(2)}
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

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleMutation.mutate({ id: task.id, isActive: !task.isActive })}
                    title={task.isActive ? "Deactivate" : "Activate"}
                  >
                    {task.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(task)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${task.title}"?`)) deleteMutation.mutate(task.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Create / Edit Dialog */}
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
                type="number"
                step="0.01"
                min="0.01"
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
                type="url"
                value={form.actionUrl}
                onChange={e => setForm(f => ({ ...f, actionUrl: e.target.value }))}
                placeholder="https://..."
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
              <Switch
                checked={form.isActive}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
              />
              <Label>Active (visible to users)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
