// ── THORX Beta Trust Layer ───────────────────────────────────────────────────
// Two primitives rendered inside the user portal:
//
//   1. RulesGate — mandatory honesty-rules acknowledgment. Until the user
//      accepts (POST /api/user/acknowledge-rules), a full-screen z-gate modal
//      blocks the portal. This is anti-fraud Layer 1: it puts every user on
//      record BEFORE their first earn, which is exactly the evidence chain
//      ad/survey networks ask about when reviewing fraud appeals.
//
//   2. FeedbackDock — floating "Send Feedback" button opening a panel with
//      category + message → POST /api/feedback, plus the user's own reports
//      with team responses. Feeds the Team Portal triage inbox
//      (GET /api/team/feedback) that powers the beta review loop.
//
// Styling follows the sitewide ivory/black/orange editorial system: white
// plates, border-2 border-black hairlines, TechnicalLabel micro-copy,
// black CTA → orange hover.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Megaphone, X, Send, Loader2, CheckCircle2, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BetaTrustUser {
  id?: string;
}

const RULES: { title: string; body: string }[] = [
  {
    title: "One account per person",
    body: "Multiple accounts, shared devices between accounts, or identity manipulation ends all linked accounts permanently.",
  },
  {
    title: "Answer surveys honestly",
    body: "Give truthful answers at a normal reading pace. Rushed or random answers fail quality checks and void the reward.",
  },
  {
    title: "No VPN, proxy, or emulator",
    body: "Ads and surveys must be viewed from your real device and location. Masking either is detected and forfeits earnings.",
  },
  {
    title: "No bots or automation",
    body: "Any script, auto-clicker, or non-attentive engagement is zero-tolerance — earnings are voided and the account banned.",
  },
];

const FEEDBACK_CATEGORIES: { key: string; label: string }[] = [
  { key: "general", label: "General" },
  { key: "bug", label: "Bug" },
  { key: "payout", label: "Payout" },
  { key: "ad_issue", label: "Ad Issue" },
  { key: "survey_issue", label: "Survey Issue" },
  { key: "suggestion", label: "Suggestion" },
];

function statusBadgeClass(status: string): string {
  if (status === "resolved") return "bg-green-500/10 text-green-600 border-green-500/20";
  if (status === "triaged") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-black/5 text-black/50 border-black/15";
}

export default function BetaTrustLayer({ user }: { user?: BetaTrustUser | null }) {
  const isLoggedIn = Boolean(user?.id);

  // ── Rules acknowledgment state ────────────────────────────────────────────
  const rulesStatus = useQuery<{ rulesAcknowledgedAt: string | null }>({
    queryKey: ["/api/user/rules-status"],
    enabled: isLoggedIn,
    staleTime: 60_000,
  });
  const needsAck = isLoggedIn && rulesStatus.data?.rulesAcknowledgedAt == null;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const ackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/acknowledge-rules", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome to THORX Beta.", description: "Play fair — earnings stay protected for everyone." });
      queryClient.invalidateQueries({ queryKey: ["/api/user/rules-status"] });
    },
    onError: () => {
      toast({ title: "Could not save acknowledgment", description: "Check your connection and try again.", variant: "destructive" });
    },
  });

  return (
    <>
      {/* ── Mandatory honesty-rules gate ─────────────────────────────────── */}
      <AnimatePresence>
        {needsAck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-gate bg-black/70 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="THORX honesty rules"
          >
            <motion.div
              initial={{ scale: 0.94, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="min-h-full flex items-center justify-center"
            >
              <div className="w-full max-w-lg bg-white border-2 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden my-auto">
                {/* Header plate */}
                <div className="bg-black px-6 py-5 flex items-center gap-3">
                  <div className="p-2 bg-primary rounded-lg shrink-0">
                    <ShieldCheck size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Beta Access · Required</div>
                    <h2 className="font-black text-white text-lg tracking-tight leading-tight">The THORX Honesty Code</h2>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <p className="text-sm font-medium text-black/55 leading-relaxed">
                    THORX pays real money, so trust is the product. Four rules keep every
                    user's earnings — including yours — safe during beta:
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {RULES.map((rule, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl border-2 border-black/10 bg-[#FAF9F6] p-3">
                        <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-sm border-2 border-black bg-black text-white font-black text-[10px]">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-black">{rule.title}</p>
                          <p className="text-xs font-medium text-black/50 mt-0.5 leading-relaxed">{rule.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => ackMutation.mutate()}
                    disabled={ackMutation.isPending}
                    className="mt-5 w-full h-12 rounded-xl border-2 border-black bg-black text-white font-black uppercase tracking-[0.15em] text-xs flex items-center justify-center gap-2 hover:bg-primary hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {ackMutation.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                    I Understand — Play Fair
                  </button>
                  <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-black/30">
                    Recorded on your account · Cannot be undone
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating feedback dock ───────────────────────────────────────── */}
      {isLoggedIn && !needsAck && <FeedbackDock />}
    </>
  );
}

// ── Feedback dock ──────────────────────────────────────────────────────────────

interface MyFeedbackRow {
  id: string;
  category: string;
  message: string;
  status: string;
  adminResponse: string | null;
  createdAt: string;
}

function FeedbackDock() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mine = useQuery<{ feedback: MyFeedbackRow[] }>({
    queryKey: ["/api/feedback/mine"],
    enabled: open,
    staleTime: 15_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", { category, message: message.trim() });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feedback sent to the team.", description: "You'll get a notification once it's reviewed." });
      setMessage("");
      setCategory("general");
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't send feedback", description: err?.message ?? "Try again in a moment.", variant: "destructive" });
    },
  });

  const canSubmit = message.trim().length >= 5 && message.trim().length <= 2000 && !submit.isPending;

  const recent = useMemo(() => (mine.data?.feedback ?? []).slice(0, 4), [mine.data]);

  return (
    <>
      {/* Floating action button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2 }}
        onClick={() => setOpen(true)}
        aria-label="Send feedback to THORX team"
        className="fixed bottom-5 right-5 z-profile h-12 pl-4 pr-5 rounded-full bg-black text-white border-2 border-black font-black uppercase tracking-wider text-[10px] flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.25)] hover:bg-primary hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Megaphone size={15} />
        <span className="hidden sm:inline">Feedback</span>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-profile bg-black/60 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              className="min-h-full flex items-end sm:items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full max-w-md bg-white border-2 border-black rounded-t-2xl sm:rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between bg-black px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <Megaphone size={16} className="text-primary" />
                    <span className="font-black text-white text-sm tracking-tight uppercase">Send Feedback</span>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="Close feedback"
                    className="p-1.5 rounded-lg border-2 border-white/20 text-white/70 hover:text-white hover:border-white/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Category chips */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40 mb-2">What is this about?</div>
                    <div className="flex flex-wrap gap-1.5">
                      {FEEDBACK_CATEGORIES.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => setCategory(c.key)}
                          className={cn(
                            "px-3 py-1.5 rounded-full border-2 text-[10px] font-black uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            category === c.key
                              ? "border-black bg-black text-white"
                              : "border-black/15 bg-white text-black/50 hover:border-black/40 hover:bg-black/[0.03]"
                          )}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-[0.2em]",
                        message.trim().length > 0 && message.trim().length < 5 ? "text-destructive" : "text-black/40"
                      )}>
                        Details · min 5 chars
                      </span>
                      <span className={cn("text-[10px] font-black tabular-nums", message.length > 1900 ? "text-destructive" : "text-black/35")}>
                        {message.length}/2000
                      </span>
                    </div>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                      rows={4}
                      placeholder="Tell the team what happened — ad not credited, survey problem, payout question…"
                      className="w-full rounded-xl border-2 border-black/15 bg-[#FAF9F6] px-3 py-2.5 text-sm font-medium text-black placeholder:text-black/25 focus:border-black focus:outline-none focus:ring-0 resize-none"
                    />
                  </div>

                  <button
                    onClick={() => submit.mutate()}
                    disabled={!canSubmit}
                    className="w-full h-11 rounded-xl border-2 border-black bg-black text-white font-black uppercase tracking-[0.15em] text-xs flex items-center justify-center gap-2 hover:bg-primary hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {submit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                    Send to Team
                  </button>

                  {/* My recent reports */}
                  {recent.length > 0 && (
                    <div className="border-t-2 border-black/10 pt-3.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40 mb-2">Your Recent Reports</div>
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                        {recent.map((row) => (
                          <div key={row.id} className="rounded-xl border-2 border-black/10 bg-[#FAF9F6] p-2.5">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[10px] font-black uppercase tracking-wider text-black/45 truncate">
                                {FEEDBACK_CATEGORIES.find((c) => c.key === row.category)?.label ?? row.category}
                              </span>
                              <span className={cn(
                                "inline-flex items-center gap-1 shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter border",
                                statusBadgeClass(row.status)
                              )}>
                                {row.status === "resolved" ? <CheckCircle2 size={9} /> : <Eye size={9} />}
                                {row.status}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-black/60 line-clamp-2">{row.message}</p>
                            {row.adminResponse && (
                              <p className="mt-1.5 text-[11px] font-semibold text-black/75 border-l-2 border-primary pl-2 line-clamp-3">
                                Team: {row.adminResponse}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
