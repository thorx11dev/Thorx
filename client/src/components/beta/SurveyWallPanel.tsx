// ── THORX Engine B — Survey Wall Panel ───────────────────────────────────────
// Renders the automated survey waterfall inside the Engine B dashboard.
// Data comes from GET /api/surveys:
//
//   { eligible, minRank, completedToday, dailyCap,
//     networks: [{ networkId, networkName, wallUrl, available }],
//     cpx: { appId, extUserId, secureHash, email, username } | null }
//
// UX flow (built for users with zero digital background — one clear next
// step at all times):
//
//   1. IDLE   — big "Start the Surveys" button + the 3 rules + how-it-works
//   2. ACTIVE — the survey wall: CPX Research serves per-user matched offers
//               (its matching engine IS the "top offers hunt"; as more
//               networks are configured they appear here automatically)
//   3. PAID   — network S2S postback → hash verify → auto credit. No manual
//               proof, no waiting screen: the balance refreshes live the
//               moment the network confirms (get_transaction → query invalidation).
//
// Only networks with REAL configured credentials are returned available:true
// (server-side filter — a stub can never be rendered). Nothing here handles money.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { motion } from "framer-motion";
import {
  ClipboardList, ExternalLink, Lock, Clock3,
  ShieldCheck, CheckCircle2, Wallet, ArrowRight, Play,
} from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { captureEvent } from "@/lib/posthog";
import { useAuth } from "@/hooks/useAuth";
import { CpxSurveyWall, type CpxConfig } from "./CpxSurveyWidgets";

interface SurveyNetwork {
  networkId: string;
  networkName: string;
  wallUrl: string;
  available: boolean;
}

interface SurveyWallResponse {
  eligible: boolean;
  minRank: string;
  completedToday: number;
  dailyCap: number;
  networks: SurveyNetwork[];
  cpx: CpxConfig | null;
}

const RULES = [
  {
    icon: ShieldCheck,
    title: "Answer honestly",
    text: "Every survey has quality checks. Honest answers always pass — fake ones cancel the payment.",
  },
  {
    icon: CheckCircle2,
    title: "Finish the full survey",
    text: "Payment counts only when you reach the end. Leaving halfway pays nothing.",
  },
  {
    icon: Wallet,
    title: "Money lands automatically",
    text: "The survey company tells us the moment you finish — your balance updates by itself.",
  },
];

const STEPS = ["Pick a survey", "Answer the questions", "Money is added automatically"];

export default function SurveyWallPanel() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<SurveyWallResponse>({
    queryKey: ["/api/surveys"],
    staleTime: 60_000,
  });

  // Start-gate persisted per user per device: returning users go straight to
  // the wall instead of seeing the intro card again.
  const storageKey = `thorx:engineB:started:${user?.id ?? "anon"}`;
  const [started, setStarted] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(`thorx:engineB:started:${user?.id ?? "anon"}`) === "1",
  );
  useEffect(() => {
    setStarted(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  const handleStart = () => {
    window.localStorage.setItem(storageKey, "1");
    setStarted(true);
    captureEvent("engine_b_surveys_started", { cpxAvailable: Boolean(data?.cpx) });
  };

  const pct = data ? Math.min(100, (data.completedToday / Math.max(1, data.dailyCap)) * 100) : 0;
  const capReached = Boolean(data && data.completedToday >= data.dailyCap);
  const otherNetworks = (data?.networks ?? []).filter((n) => n.available && n.networkId !== "cpx-research");

  return (
    <div className="rounded-2xl border-2 border-black bg-white overflow-hidden" data-testid="panel-survey-wall">
      {/* Header strip */}
      <div className="bg-black px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-primary rounded-lg shrink-0">
            <ClipboardList size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Engine B · Surveys</div>
            <h3 className="font-black text-white text-base tracking-tight leading-tight truncate">Survey Wall</h3>
          </div>
        </div>
        {!isLoading && data && (
          <div className="text-right shrink-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-white/40">Today</div>
            <p className="font-black text-primary text-lg tabular-nums leading-none mt-0.5" data-testid="text-survey-progress">
              {data.completedToday}<span className="text-white/40 text-xs"> / {data.dailyCap}</span>
            </p>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-black/40">
            <ThorxSpinner size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Loading survey walls…</span>
          </div>
        ) : !data?.eligible ? (
          /* Rank-gated state */
          <div className="rounded-xl border-2 border-dashed border-black/15 py-10 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-black/40" />
            </div>
            <TechnicalLabel text={`SURVEYS UNLOCK AT ${data?.minRank ?? "C-RANK"}`} className="text-black/45 text-[10px] mb-2" />
            <p className="text-sm font-medium text-black/50 max-w-sm mx-auto">
              Keep earning with Engine A to unlock paid surveys.
            </p>
          </div>
        ) : capReached ? (
          /* Daily cap reached */
          <div className="rounded-xl border-2 border-black/15 bg-[#FAF9F5] py-8 px-6 text-center">
            <Clock3 className="w-6 h-6 text-primary mx-auto mb-3" />
            <p className="font-black text-sm uppercase tracking-wide text-black">Daily limit reached</p>
            <p className="text-xs font-medium text-black/50 mt-1">
              You completed all {data.dailyCap} surveys for today. New ones unlock tomorrow — come back fresh!
            </p>
          </div>
        ) : !started ? (
          /* ── IDLE: Start card ─────────────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            <button
              onClick={handleStart}
              data-testid="survey-start-btn"
              className={cn(
                "group w-full rounded-2xl bg-black text-white px-6 py-6 text-left transition-all",
                "hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
            >
              <span className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-4 min-w-0">
                  <span className="w-12 h-12 rounded-xl bg-primary group-hover:bg-white transition-colors flex items-center justify-center shrink-0">
                    <Play size={20} className="text-white group-hover:text-primary transition-colors" fill="currentColor" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-black text-xl tracking-tight leading-tight">Start the Surveys</span>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mt-0.5">
                      Free to start · earn real PKR
                    </span>
                  </span>
                </span>
                <ArrowRight size={22} className="shrink-0 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>

            {/* The Rules */}
            <div className="rounded-2xl border-2 border-black/10 p-4">
              <TechnicalLabel text="THE 3 RULES" className="text-black/45 text-[10px] font-black uppercase tracking-widest" />
              <div className="mt-3 space-y-3.5">
                {RULES.map((rule) => (
                  <div key={rule.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center shrink-0 mt-0.5">
                      <rule.icon size={15} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-black tracking-tight">{rule.title}</p>
                      <p className="text-xs font-medium text-black/50 leading-relaxed">{rule.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className="flex items-center justify-between gap-2">
              {STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-2 min-w-0 flex-1 last:flex-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[10px] font-bold text-black/60 leading-tight truncate">{step}</span>
                  </div>
                  {i < STEPS.length - 1 && <ArrowRight size={12} className="text-black/25 shrink-0" />}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          /* ── ACTIVE: the wall ─────────────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Daily progress bar */}
            <div>
              <Progress value={pct} className="h-2 bg-black/10 border border-black/15 [&>div]:bg-primary" />
              <p className="text-[10px] font-bold text-black/40 mt-1.5">
                Honest answers only — quality checks protect every user's payout rate.
              </p>
            </div>

            {/* Embedded CPX widget (Design 1 fullscreen) — CPX's matching engine
                picks the best offers for this user automatically. Server nulls
                `cpx` when unconfigured/capped. */}
            {data.cpx && (
              <div className="rounded-2xl border-2 border-black overflow-hidden" data-testid="cpx-wall-container">
                <div className="bg-black px-4 py-2.5 flex items-center gap-2">
                  <ClipboardList size={14} className="text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                    CPX Research · Matched For You
                  </span>
                </div>
                <div className="bg-white p-3">
                  <CpxSurveyWall cpx={data.cpx} />
                </div>
              </div>
            )}

            {/* Other network cards (appear automatically as networks are configured) */}
            {otherNetworks.length === 0 && !data.cpx ? (
              <div className="rounded-xl border-2 border-dashed border-black/15 py-8 px-6 text-center">
                <ClipboardList className="w-6 h-6 text-black/30 mx-auto mb-3" />
                <p className="text-sm font-bold text-black/60">Surveys are coming online soon</p>
                <p className="text-xs font-medium text-black/40 mt-1">The team is activating survey partners right now.</p>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.06 } } }}
                className="space-y-3"
              >
                {otherNetworks.map((network) => (
                  <motion.a
                    key={network.networkId}
                    href={network.wallUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => captureEvent("survey_wall_opened", { network: network.networkId })}
                    variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                    whileHover={{ y: -3 }}
                    className={cn(
                      "group flex items-center justify-between gap-3 rounded-2xl border-2 p-4 transition-all",
                      "border-black/15 hover:border-black hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)]"
                    )}
                    data-testid={`survey-wall-${network.networkId}`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-black flex items-center justify-center shrink-0 group-hover:bg-primary transition-colors">
                        <ClipboardList size={18} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-sm text-black tracking-tight truncate">{network.networkName}</p>
                        <p className="text-[11px] font-medium text-black/45">
                          Answer surveys · earn real PKR on every completion
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-lg bg-black text-white text-[10px] font-black uppercase tracking-wider group-hover:bg-primary transition-colors">
                      Start
                      <ExternalLink size={12} />
                    </span>
                  </motion.a>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
