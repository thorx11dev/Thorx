// ── THORX Team Portal — Beta Control ─────────────────────────────────────────
// One panel, two jobs for the controlled 1000-user beta:
//
//   • Feedback Inbox   — triage every user report from GET /api/team/feedback,
//                        respond + set status via PATCH /api/team/feedback/:id
//                        (the user gets a notification automatically).
//   • Beta Invites     — mint single/batch invite codes (POST), list them with
//                        usage counts, and deactivate leaked codes (PATCH).
//                        The BETA_INVITE_REQUIRED system-config toggle lives in
//                        Settings; this panel surfaces its current state.
//
// Styling matches the Team Portal system: white plates on hairline #141413
// borders, black pills, uppercase micro-labels.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TechnicalLabel from "@/components/ui/technical-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Ticket, Loader2, Send, Ban, Copy,
  CheckCircle2, Eye, Inbox, Users2, Power,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface FeedbackRow {
  id: string;
  userId: string;
  category: string;
  message: string;
  status: string;
  adminResponse: string | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
}

interface InviteRow {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  useCount: number;
  isActive: boolean;
  consumedByEmail?: string | null;
  createdAt: string;
}

type Tab = "feedback" | "invites";

const STATUS_FILTERS = ["open", "triaged", "resolved", "all"] as const;

function statusBadge(status: string): string {
  if (status === "resolved") return "bg-green-500/10 text-green-700 border-green-600/30";
  if (status === "triaged") return "bg-amber-500/10 text-amber-700 border-amber-600/30";
  return "bg-[#141413]/5 text-black/60 border-black/20";
}

export function BetaControlPanel() {
  const [tab, setTab] = useState<Tab>("feedback");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("open");

  const feedback = useQuery<{ feedback: FeedbackRow[] }>({
    queryKey: ["/api/team/feedback", statusFilter],
    queryFn: async () => {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await apiRequest("GET", `/api/team/feedback${qs}`);
      return res.json();
    },
  });

  return (
    <div className="space-y-6" data-testid="panel-beta-control">
      {/* Header */}
      <div className="bg-white border-[1.5px] border-[#141413]/10 rounded-3xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <TechnicalLabel text="BETA v0.9 · CONTROLLED ROLLOUT" className="text-primary font-black text-xs mb-1.5" />
            <h2 className="text-2xl md:text-4xl font-black tracking-tighter">Beta Control</h2>
          </div>
          {/* Tab switch */}
          <div className="flex items-center gap-1 bg-[#141413]/5 p-1 rounded-full w-fit">
            <button
              onClick={() => setTab("feedback")}
              className={cn(
                "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                tab === "feedback" ? "bg-[#141413] text-white shadow-sm" : "text-black/50 hover:text-black"
              )}
              data-testid="tab-beta-feedback"
            >
              <MessageSquare size={12} /> Feedback Inbox
            </button>
            <button
              onClick={() => setTab("invites")}
              className={cn(
                "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                tab === "invites" ? "bg-[#141413] text-white shadow-sm" : "text-black/50 hover:text-black"
              )}
              data-testid="tab-beta-invites"
            >
              <Ticket size={12} /> Invites
            </button>
          </div>
        </div>
      </div>

      {tab === "feedback" ? (
        <FeedbackInbox query={feedback} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      ) : (
        <InviteManager />
      )}
    </div>
  );
}

// ── Feedback triage inbox ─────────────────────────────────────────────────────

function FeedbackInbox({
  query,
  statusFilter,
  setStatusFilter,
}: {
  query: ReturnType<typeof useQuery<{ feedback: FeedbackRow[] }>>;
  statusFilter: (typeof STATUS_FILTERS)[number];
  setStatusFilter: (s: (typeof STATUS_FILTERS)[number]) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [nextStatus, setNextStatus] = useState<"triaged" | "resolved">("resolved");

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminResponse }: { id: string; status: string; adminResponse?: string }) => {
      const res = await apiRequest("PATCH", `/api/team/feedback/${id}`, { status, adminResponse });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feedback updated.", description: "The user has been notified." });
      setRespondingTo(null);
      setResponseText("");
      queryClient.invalidateQueries({ queryKey: ["/api/team/feedback"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex items-center gap-1 bg-white border-[1.5px] border-[#141413]/10 rounded-full p-1 w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              statusFilter === s ? "bg-[#141413] text-white" : "text-black/45 hover:text-black"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-black/40">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-widest">Loading inbox…</span>
        </div>
      ) : (query.data?.feedback ?? []).length === 0 ? (
        <div className="bg-white border-[1.5px] border-dashed border-[#141413]/15 rounded-3xl p-14 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-black/25" />
          <p className="font-black text-sm uppercase tracking-wide text-black/60">No {statusFilter} reports</p>
          <p className="text-xs font-medium text-black/40 mt-1">User feedback from the portal dock lands here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(query.data?.feedback ?? []).map((row) => (
            <div key={row.id} className="bg-white border-[1.5px] border-[#141413]/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-sm border uppercase tracking-tighter bg-[#141413] text-white">
                      {row.category.replace("_", " ")}
                    </span>
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-sm border uppercase tracking-tighter", statusBadge(row.status))}>
                      {row.status}
                    </span>
                  </div>
                  <p className="font-bold text-sm mt-2 leading-relaxed">{row.message}</p>
                  <p className="text-[10px] font-black uppercase tracking-wider text-black/35 mt-1.5">
                    {row.userName ?? "Unknown"} · {row.userEmail ?? "—"} · {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {row.status !== "resolved" && respondingTo !== row.id && (
                  <Button
                    size="sm"
                    onClick={() => { setRespondingTo(row.id); setNextStatus(row.status === "open" ? "resolved" : "resolved"); }}
                    className="shrink-0 bg-[#141413] text-white hover:bg-primary hover:text-black rounded-lg text-[10px] font-black uppercase tracking-wider h-8 px-3"
                    data-testid={`button-feedback-respond-${row.id}`}
                  >
                    <Send size={11} /> Respond
                  </Button>
                )}
              </div>

              {row.adminResponse && (
                <p className="text-xs font-semibold text-black/70 border-l-[3px] border-primary pl-3 bg-[#FAF9F5] rounded-r-lg py-2">
                  Team reply: {row.adminResponse}
                </p>
              )}

              {respondingTo === row.id && (
                <div className="border-t-[1.5px] border-[#141413]/10 pt-3 space-y-2.5">
                  <Textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    rows={3}
                    placeholder="Reply to the user — they receive this as a notification…"
                    className="rounded-xl border-[1.5px] border-[#141413]/20 focus-visible:ring-primary/40 text-sm"
                    maxLength={500}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black tabular-nums text-black/35">{responseText.length}/500</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={nextStatus}
                        onChange={(e) => setNextStatus(e.target.value as "triaged" | "resolved")}
                        className="h-8 rounded-lg border-[1.5px] border-[#141413]/20 bg-white px-2 text-[10px] font-black uppercase tracking-wider"
                      >
                        <option value="triaged">Mark Triaged</option>
                        <option value="resolved">Mark Resolved</option>
                      </select>
                      <Button
                        size="sm"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: row.id, status: nextStatus, adminResponse: responseText.trim() || undefined })}
                        className="bg-primary text-black hover:bg-primary/90 rounded-lg text-[10px] font-black uppercase tracking-wider h-8 px-3"
                      >
                        {updateMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Send
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invite manager ────────────────────────────────────────────────────────────

function InviteManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [maxUses, setMaxUses] = useState("1");
  const [note, setNote] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // GET /api/team/beta/invites returns { invites, inviteRequired, slotsRemainingLabel }
  const invites = useQuery<{ invites: InviteRow[]; inviteRequired: boolean; slotsRemainingLabel: string | null }>({
    queryKey: ["/api/team/beta/invites"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/team/beta/invites", {
        maxUses: Math.max(1, parseInt(maxUses || "1", 10)),
        note: note.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite minted." });
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/team/beta/invites"] });
    },
    onError: () => toast({ title: "Mint failed", variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/team/beta/invites/${id}`, { isActive: false });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite deactivated." });
      queryClient.invalidateQueries({ queryKey: ["/api/team/beta/invites"] });
    },
    onError: () => toast({ title: "Deactivate failed", variant: "destructive" }),
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const gateOn = Boolean(invites.data?.inviteRequired);
  const { user } = useAuth();
  const isFounderAdmin = user?.role === "founder" || user?.role === "admin";

  // One-click registration gate — writes BETA_INVITE_REQUIRED via the same
  // admin config PATCH endpoint the Settings panel uses.
  const gateToggle = useMutation({
    mutationFn: async (on: boolean) => {
      const res = await apiRequest("PATCH", "/api/admin/config/BETA_INVITE_REQUIRED", { value: on });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: gateOn ? "Registration opened." : "Registration locked to invites." });
      queryClient.invalidateQueries({ queryKey: ["/api/team/beta/invites"] });
    },
    onError: () => toast({ title: "Toggle failed", description: "Founder/admin access required.", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Gate status strip */}
      <div className="bg-white border-[1.5px] border-[#141413]/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg shrink-0", gateOn ? "bg-primary" : "bg-[#141413]")}>
            <Users2 size={15} className="text-white" />
          </div>
          <div>
            <TechnicalLabel text="REGISTRATION GATE" className="text-black/40 text-[10px]" />
            <p className="font-black text-sm">
              {gateOn ? (
                <>ON — invite required{invites.data?.slotsRemainingLabel ? ` · ${invites.data.slotsRemainingLabel}` : ""}</>
              ) : (
                <>OFF — open registration</>
              )}
            </p>
          </div>
        </div>
        {isFounderAdmin && (
          <Button
            disabled={gateToggle.isPending}
            onClick={() => gateToggle.mutate(!gateOn)}
            className={cn(
              "shrink-0 h-10 px-5 rounded-lg text-[10px] font-black uppercase tracking-widest border-[1.5px]",
              gateOn
                ? "bg-white text-[#141413] border-[#141413]/20 hover:border-[#141413]"
                : "bg-primary text-black border-primary hover:bg-primary/90"
            )}
            data-testid="button-toggle-invite-gate"
          >
            {gateToggle.isPending ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
            {gateOn ? "Open Registration" : "Lock to Invites"}
          </Button>
        )}
      </div>

      {/* Mint form */}
      <div className="bg-white border-[1.5px] border-[#141413]/10 rounded-2xl p-5 space-y-3">
        <TechnicalLabel text="MINT NEW INVITE CODE" className="text-black/45 text-[10px]" />
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            type="number"
            min={1}
            max={1000}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="w-full sm:w-28 rounded-lg border-[1.5px] border-[#141413]/20 h-10"
            aria-label="Max uses"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (e.g. WhatsApp batch #1)"
            className="flex-1 rounded-lg border-[1.5px] border-[#141413]/20 h-10"
          />
          <Button
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="bg-[#141413] text-white hover:bg-primary hover:text-black rounded-lg h-10 px-5 text-[10px] font-black uppercase tracking-wider shrink-0"
            data-testid="button-mint-invite"
          >
            {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Ticket size={12} />} Mint
          </Button>
        </div>
        <p className="text-[10px] font-bold text-black/35 uppercase tracking-wider">Batch size = max uses per code (1–1000)</p>
      </div>

      {/* Invite list */}
      {invites.isLoading ? (
        <div className="flex items-center gap-2 justify-center py-12 text-black/40">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-widest">Loading invites…</span>
        </div>
      ) : (invites.data?.invites ?? []).length === 0 ? (
        <div className="bg-white border-[1.5px] border-dashed border-[#141413]/15 rounded-3xl p-14 text-center">
          <Ticket className="w-8 h-8 mx-auto mb-3 text-black/25" />
          <p className="font-black text-sm uppercase tracking-wide text-black/60">No invites yet</p>
          <p className="text-xs font-medium text-black/40 mt-1">Mint your first code above to start onboarding beta users.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(invites.data?.invites ?? []).map((invite) => {
            const exhausted = invite.useCount >= invite.maxUses;
            return (
              <div key={invite.id} className="bg-white border-[1.5px] border-[#141413]/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="font-mono font-black text-sm tracking-wider">{invite.code}</code>
                    <button
                      onClick={() => copyCode(invite.code)}
                      aria-label={`Copy ${invite.code}`}
                      className="p-1 rounded-md hover:bg-[#141413]/5 transition-colors"
                    >
                      {copiedCode === invite.code ? <CheckCircle2 size={12} className="text-green-600" /> : <Copy size={12} className="text-black/40" />}
                    </button>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-black/35 mt-0.5 truncate">
                    {invite.useCount}/{invite.maxUses} used{invite.note ? ` · ${invite.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!exhausted && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-sm border uppercase tracking-tighter bg-green-500/10 text-green-700 border-green-600/30">
                      <Eye size={9} /> Active
                    </span>
                  )}
                  {exhausted && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-sm border uppercase tracking-tighter bg-[#141413]/5 text-black/50 border-black/20">
                      Fully used
                    </span>
                  )}
                  {invite.isActive && !exhausted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deactivateMutation.isPending}
                      onClick={() => deactivateMutation.mutate(invite.id)}
                      className="h-7 px-2 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10 text-[9px] font-black uppercase tracking-wider"
                      aria-label={`Deactivate ${invite.code}`}
                    >
                      <Ban size={11} /> Kill
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
