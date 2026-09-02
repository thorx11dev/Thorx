// ── THORX Engine B — Survey Wall Panel ───────────────────────────────────────
// Renders the automated survey waterfall inside the Engine B dashboard.
// Data comes from GET /api/surveys:
//
//   { eligible, minRank, completedToday, dailyCap,
//     networks: [{ networkId, networkName, wallUrl, available }] }
//
// Only networks with REAL configured credentials are returned available:true
// with a wall URL (server-side filter — a stub can never be rendered). Each
// card opens that network's wall in a new tab; credit arrives later via the
// signed S2S callback → recordEarnEvent pipeline. Nothing here handles money.

import { useQuery } from "@tanstack/react-query";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { motion } from "framer-motion";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { ClipboardList, ExternalLink, Lock, Loader2, Clock3 } from "lucide-react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { apiRequest } from "@/lib/queryClient";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import TechnicalLabel from "@/components/ui/technical-label";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { Progress } from "@/components/ui/progress";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { cn } from "@/lib/utils";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { captureEvent } from "@/lib/posthog";
import ThorxSpinner from "@/components/ui/thorx-spinner";

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
}

export default function SurveyWallPanel() {
  const { data, isLoading } = useQuery<SurveyWallResponse>({
    queryKey: ["/api/surveys"],
    staleTime: 60_000,
  });

  const pct = data ? Math.min(100, (data.completedToday / Math.max(1, data.dailyCap)) * 100) : 0;
  const capReached = Boolean(data && data.completedToday >= data.dailyCap);

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
        ) : (
          <>
            {/* Daily progress bar */}
            <div>
              <Progress value={pct} className="h-2 bg-black/10 border border-black/15 [&>div]:bg-primary" />
              <p className="text-[10px] font-bold text-black/40 mt-1.5">
                Honest answers only — quality checks protect every user's payout rate.
              </p>
            </div>

            {/* Network cards */}
            {data.networks.filter((n) => n.available).length === 0 ? (
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
                {data.networks.filter((n) => n.available).map((network) => (
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
          </>
        )}
      </div>
    </div>
  );
}
