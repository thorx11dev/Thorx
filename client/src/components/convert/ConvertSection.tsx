// ── THORX Convert — PKR → TX-Points portal ───────────────────────────────────
// Lets users turn verified withdrawable RS into TX-Points at the platform rate
// (TX_POINTS_PER_PKR, default 1 RS = 10 PTS). Design language mirrors Payout:
// black hero, industrial cards, dial-pad entry. Server-side the conversion is
// ledger-safe: verified FIFO rows are consumed, their claim-points released,
// and flat-rate points minted as a 'converted' ledger row (zero drift).
// Converted money CANNOT be converted back — the preview says so plainly.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight, Delete, Info } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { captureEvent } from "@/lib/posthog";

const CONVERT_MIN_RS = 100;

interface PublicConfig {
  txPointsPerPkr: number;
  convertMinRs: number;
}

interface ConvertPreview {
  ok: boolean;
  reason?: string;
  pointsCredit: number;
  pointsReleased: number;
  netPoints: number;
  rate: number;
  minRs: number;
}

export default function ConvertSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState<{ points: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifiedBalance = parseFloat((user as any)?.availableBalance ?? "0") || 0;
  const pointsBalance = (user as any)?.txPointsBalance ?? 0;
  const amountNum = parseInt(amount || "0", 10) || 0;

  const { data: config } = useQuery<PublicConfig>({
    queryKey: QUERY_KEYS.publicConfig,
    staleTime: 5 * 60 * 1000,
  });
  const rate = config?.txPointsPerPkr ?? 10;
  const minRs = config?.convertMinRs ?? CONVERT_MIN_RS;

  // Server-computed preview (debounced) — includes the exact claim-points
  // release so the net is always honest.
  const [debouncedAmount, setDebouncedAmount] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(amountNum), 350);
    return () => clearTimeout(t);
  }, [amountNum]);

  const { data: preview, isFetching: previewLoading } = useQuery<ConvertPreview>({
    queryKey: ["/api/convert/preview", debouncedAmount],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/convert/preview?amount=${debouncedAmount}`);
      if (!res.ok) throw new Error("preview failed");
      return res.json();
    },
    enabled: debouncedAmount >= minRs && debouncedAmount <= Math.floor(verifiedBalance),
    retry: false,
  });

  const canConvert = amountNum >= minRs && amountNum <= Math.floor(verifiedBalance) && !converting;

  const dial = (n: string) => setAmount((prev) => (prev === "0" ? n : (prev + n).slice(0, 8)));
  const backspace = () => setAmount((prev) => prev.slice(0, -1));

  const handleConvert = async () => {
    if (!canConvert) return;
    setConverting(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/convert", {
        amount: amountNum,
        idempotencyKey: crypto.randomUUID(),
      }, { "x-csrf-token": getCsrfToken() });
      if (res.ok) {
        const data = await res.json();
        captureEvent("balance_converted", { amountRs: amountNum, points: data.pointsCredit });
        setDone({ points: data.pointsCredit });
        setAmount("");
        qc.invalidateQueries({ queryKey: QUERY_KEYS.user });
        qc.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
        qc.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
        qc.invalidateQueries({ queryKey: ["transactions", "history"] });
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || err.error || "Conversion failed.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setConverting(false);
    }
  };

  const netPoints = preview?.ok ? preview.netPoints : amountNum > 0 ? amountNum * rate : 0;

  const balanceCards = useMemo(() => ([
    { label: "AVAILABLE BALANCE", value: `Rs. ${verifiedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, accent: false },
    { label: "TX-POINTS", value: pointsBalance.toLocaleString(), accent: true },
  ]), [verifiedBalance, pointsBalance]);

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="max-w-[1600px] mx-auto px-4 md:px-12 py-8 md:pt-4 md:pb-12 relative z-10 w-full"
    >
      {/* Hero */}
      <motion.div
        initial={false}
        className="rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden border-2 bg-[#141413] h-[160px] md:h-[220px] flex items-center justify-center md:justify-start"
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -left-16 -bottom-24 w-56 h-56 bg-primary/5 rounded-full blur-3xl" />
        <div className="relative z-10 text-center md:text-left">
          <div className="text-[10px] font-black uppercase tracking-[0.35em] text-white/40 mb-2">RS into TX-Points · 1 RS = {rate} PTS</div>
          <h1 className="font-black tracking-tighter uppercase leading-none text-[clamp(2rem,10vw,4.5rem)] text-white">
            CONV<span className="text-primary">ERT</span>
          </h1>
        </div>
      </motion.div>

      <div className="my-10" />

      {/* Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-10 max-w-3xl mx-auto">
        {balanceCards.map((c) => (
          <div key={c.label} className="bg-white border-2 border-black rounded-2xl p-5 md:p-6 text-left">
            <TechnicalLabel text={c.label} className="text-muted-foreground text-xs mb-2" />
            <p className={cn("text-2xl md:text-3xl font-black tracking-tighter tabular-nums", c.accent ? "text-primary" : "text-foreground")}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Converter card */}
      <div className="max-w-md mx-auto bg-white border-2 border-black rounded-2xl p-5 md:p-8 shadow-[0_12px_40px_rgba(20,20,19,0.06)]">
        {/* Amount display */}
        <div className="rounded-2xl bg-black px-5 py-5 md:py-6 text-center mb-2.5 shadow-[0_10px_30px_rgba(20,20,19,0.18)]">
          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Convert Amount</div>
          <div
            className={cn(
              "font-black tracking-tighter tabular-nums leading-none text-4xl md:text-5xl transition-colors",
              amountNum > 0 ? "text-primary" : "text-white/20",
            )}
            data-testid="convert-amount-display"
          >
            {amountNum > 0 ? `Rs ${amountNum.toLocaleString()}` : "Rs —"}
          </div>
          <div className="mt-2.5 text-[10px] font-bold text-white/40 tabular-nums">
            Available&nbsp;<span className="text-white/70">Rs {verifiedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Validation hint */}
        <div className="h-5 mb-1 text-center">
          {amountNum > 0 && amountNum < minRs && (
            <span className="text-[11px] font-bold text-red-500">Minimum Rs. {minRs.toLocaleString()}</span>
          )}
          {amountNum > Math.floor(verifiedBalance) && (
            <span className="text-[11px] font-bold text-red-500">Exceeds available balance</span>
          )}
        </div>

        {/* Dial pad */}
        <div className="grid grid-cols-3 gap-1">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <motion.button
              key={n}
              whileTap={{ scale: 0.9 }}
              onClick={() => dial(n)}
              className="h-12 md:h-14 rounded-xl text-2xl md:text-[28px] font-black tabular-nums text-foreground transition-colors hover:bg-black/[0.05] active:bg-black active:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              data-testid={`convert-dial-${n}`}
            >
              {n}
            </motion.button>
          ))}
          <div />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => dial("0")}
            className="h-12 md:h-14 rounded-xl text-2xl md:text-[28px] font-black tabular-nums text-foreground transition-colors hover:bg-black/[0.05] active:bg-black active:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            data-testid="convert-dial-0"
          >
            0
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={backspace}
            aria-label="Delete last digit"
            className="h-12 md:h-14 rounded-xl flex items-center justify-center text-black/40 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-black active:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            data-testid="convert-dial-backspace"
          >
            <Delete className="h-5 w-5" />
          </motion.button>
        </div>

        {/* Conversion preview */}
        <div className="mt-4 rounded-2xl border-2 border-black overflow-hidden">
          <div className="bg-black px-4 py-2.5 flex items-center justify-between">
            <TechnicalLabel text="YOU RECEIVE" className="text-white/50" />
            <span className="text-[9px] font-black uppercase tracking-widest text-primary">1 RS = {rate} PTS</span>
          </div>
          <div className="p-4 space-y-2">
            {amountNum >= minRs && amountNum <= Math.floor(verifiedBalance) ? (
              previewLoading || !preview?.ok ? (
                <Skeleton className="h-7 w-32 rounded inline-block" />
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-muted-foreground">Converted</span>
                    <span className="font-black text-foreground tabular-nums">+{preview.pointsCredit.toLocaleString()} PTS</span>
                  </div>
                  {preview.pointsReleased > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-muted-foreground">Claim points released</span>
                      <span className="font-black text-red-400 tabular-nums">−{preview.pointsReleased.toLocaleString()} PTS</span>
                    </div>
                  )}
                  <div className="border-t border-dashed border-black/15 pt-2 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">Net TX-Points</span>
                    <span className="text-lg font-black text-primary tabular-nums" data-testid="convert-net-points">
                      +{preview.netPoints.toLocaleString()}
                    </span>
                  </div>
                </>
              )
            ) : (
              <p className="text-xs font-medium text-black/40 text-center py-1.5">
                Dial an amount to see the conversion.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs font-black text-red-500 text-center">{error}</p>
        )}

        {done && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border-2 border-green-500/30 bg-green-500/10 px-4 py-3 text-center"
            data-testid="convert-success"
          >
            <p className="text-sm font-black text-green-600">+{done.points.toLocaleString()} TX-Points added!</p>
          </motion.div>
        )}

        <Button
          onClick={handleConvert}
          disabled={!canConvert || previewLoading || (preview ? !preview.ok : false)}
          className={cn(
            "w-full mt-4 h-14 rounded-xl text-sm font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2",
            canConvert
              ? "bg-primary text-white border-2 border-black hover:bg-black hover:text-white shadow-[0_8px_24px_rgba(217,119,87,0.25)]"
              : "bg-[#E8E5D8] text-black/40 border-2 border-black/10 cursor-not-allowed",
          )}
          data-testid="convert-submit"
        >
          {converting ? (
            <><ThorxSpinner size={16} /> CONVERTING…</>
          ) : (
            <><ArrowLeftRight className="size-4" /> Convert to TX-Points</>
          )}
        </Button>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-black/10 bg-muted/40 px-3.5 py-3">
          <Info className="size-3.5 text-black/35 shrink-0 mt-0.5" />
          <p className="text-[10px] font-medium text-black/50 leading-relaxed">
            Conversion is one-way — converted RS cannot be withdrawn back.
            Only <strong>verified balance</strong> can be converted; pending earnings are not eligible.
          </p>
        </div>
      </div>

      <AnimatePresence>{null}</AnimatePresence>
    </motion.div>
  );
}
