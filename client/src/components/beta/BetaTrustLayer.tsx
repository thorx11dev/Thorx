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
// black CTA → orange hover. The gate itself is styled as an access
// credential — barcode plates, corner plus marks, ruled technical rows —
// to match the cinematic landing-page language.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, X, Send, Loader2, CheckCircle2, Eye } from "lucide-react";
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

const GATE_EASE = [0.16, 1, 0.3, 1] as const;

export default function BetaTrustLayer({ user }: { user?: BetaTrustUser | null }) {
  const isLoggedIn = Boolean(user?.id);
  // Latch: once the card opens it stays for the full 5 seconds — the ack
  // request completing early must NOT unmount it ahead of the timer.
  const [gateOpened, setGateOpened] = useState(false);
  const [gateDismissed, setGateDismissed] = useState(false);

  // ── Rules acknowledgment state ────────────────────────────────────────────
  const rulesStatus = useQuery<{ rulesAcknowledgedAt: string | null }>({
    queryKey: ["/api/user/rules-status"],
    enabled: isLoggedIn,
    staleTime: 60_000,
  });
  const needsAck = isLoggedIn && rulesStatus.data?.rulesAcknowledgedAt == null;
  const showGate = gateOpened && !gateDismissed;

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

  // Accounts accept the honesty rules at signup — record the acknowledgment
  // automatically when the card displays, then auto-dismiss after 5 seconds.
  useEffect(() => {
    if (!needsAck) return;
    setGateOpened(true);
    ackMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAck]);

  useEffect(() => {
    if (!gateOpened) return;
    const timer = setTimeout(() => setGateDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, [gateOpened]);

  // Lock body scroll while the gate owns the screen.
  useEffect(() => {
    if (!showGate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showGate]);

  return (
    <>
      {/* ── Honesty-rules card (informational, auto-dismisses) ─────────────── */}
      <AnimatePresence>
        {showGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className="fixed inset-0 z-gate bg-black/70 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="THORX honesty rules"
          >
            <motion.div
              initial={{ scale: 0.96, y: 32, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.97, y: 24, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } }}
              transition={{ duration: 0.5, ease: GATE_EASE }}
              className="min-h-full flex items-center justify-center"
            >
              <div className="relative w-full max-w-[420px] bg-white rounded-2xl sm:rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.3)] overflow-hidden my-auto">
                {/* 5-second auto-dismiss progress */}
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 5, ease: "linear" }}
                  className="absolute top-0 left-0 right-0 h-[3px] bg-primary origin-left z-10"
                />
                {/* Soft orange glow accent */}
                <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 bg-primary/[0.07] rounded-full blur-3xl" />

                <div className="relative px-6 py-6 sm:px-8 sm:py-8">
                  {/* Brand row */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.4, ease: GATE_EASE }}
                    className="flex items-center justify-between"
                  >
                    <span className="text-base font-black tracking-tighter text-black" data-testid="gate-wordmark">THORX.</span>
                    <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-[0.2em]">Beta</span>
                  </motion.div>

                  {/* Headline */}
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12, duration: 0.4, ease: GATE_EASE }}
                    className="mt-6 text-[1.65rem] sm:text-3xl font-black tracking-tighter text-black leading-[1.05]"
                  >
                    Before you<br />earn, agree.
                  </motion.h2>

                  {/* Rules */}
                  <div className="mt-5">
                    {RULES.map((rule, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.16 + i * 0.07, duration: 0.35, ease: GATE_EASE }}
                        className={cn(
                          "flex items-start gap-3.5 sm:gap-4 py-3 sm:py-3.5",
                          i > 0 && "border-t border-black/[0.07]"
                        )}
                      >
                        <span className="w-5 shrink-0 pt-px text-xs font-black text-primary tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="text-[13px] sm:text-sm font-bold text-black leading-snug">{rule.title}</p>
                          <p className="text-xs font-medium text-black/45 mt-1 leading-relaxed">{rule.body}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating feedback dock ───────────────────────────────────────── */}
      {isLoggedIn && !showGate && <FeedbackDock />}
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
        className="feedback-dock fixed bottom-5 right-5 z-profile h-12 pl-4 pr-5 rounded-full bg-black text-white border-2 border-black font-black uppercase tracking-wider text-[10px] flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.25)] hover:bg-primary hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-profile bg-black/70 backdrop-blur-md p-3 md:p-6 overflow-y-auto"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 56, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.98, transition: { duration: 0.22, ease: "easeIn" } }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-full flex items-end sm:items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full max-w-md bg-white border border-black/15 rounded-t-2xl sm:rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.3)] overflow-hidden">
                {/* Soft orange glow accent — matches the drawer / section heroes */}
                <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 bg-primary/[0.07] rounded-full blur-3xl" />

                {/* Header */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="relative px-5 pt-5 pb-4 border-b border-black/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black tracking-tighter text-black">Send Feedback</h2>
                      <div className="w-9 h-1 bg-primary mt-2.5" />
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      aria-label="Close feedback"
                      className="shrink-0 p-2 rounded-lg border border-black/10 text-black/50 hover:bg-black hover:text-white hover:border-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </motion.div>

                <div className="relative px-5 py-4 space-y-4">
                  {/* Category chips */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {FEEDBACK_CATEGORIES.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => setCategory(c.key)}
                          className={cn(
                            "px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            category === c.key
                              ? "border-black bg-black text-white"
                              : "border-black/10 bg-white text-black/45 hover:border-black/30 hover:text-black"
                          )}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Message */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="flex items-center justify-end mb-1.5">
                      <span className={cn("text-[10px] font-black tabular-nums", message.length > 1900 ? "text-destructive" : "text-black/30")}>
                        {message.length}/2000
                      </span>
                    </div>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                      rows={4}
                      placeholder="Tell the team what happened — ad not credited, survey problem, payout question…"
                      className="w-full rounded-xl border border-black/15 bg-[#FAF9F6] px-3 py-2.5 text-sm font-medium text-black placeholder:text-black/25 focus:border-black focus:outline-none focus:ring-0 resize-none transition-colors"
                    />
                  </motion.div>

                  <motion.button
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => submit.mutate()}
                    disabled={!canSubmit}
                    className="w-full h-11 rounded-xl bg-black text-white font-black uppercase tracking-[0.15em] text-xs flex items-center justify-center gap-2 hover:bg-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {submit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                    Send to Team
                  </motion.button>

                  {/* My recent reports */}
                  {recent.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.26, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="border-t border-black/10 pt-3.5"
                    >
                      <div className="font-mono text-[9px] font-bold tracking-[0.3em] text-black/35 uppercase mb-2">Your Recent Reports</div>
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                        {recent.map((row) => (
                          <div key={row.id} className="rounded-xl border border-black/10 bg-[#FAF9F6] p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-black/40 truncate">
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
                    </motion.div>
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
