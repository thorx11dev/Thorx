import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, User, Shield, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Above this unverified-credit exposure, the panel surfaces a warning banner.
// Kept as a named constant (rather than buried in JSX) so it's easy to find and tune.
const HIGH_EXPOSURE_THRESHOLD_PKR = 100000;
const ADMIN_CREDITS_PAGE_SIZE = 50;

interface ReconciliationData {
  totalUserBalances: string;
  activeUserBalances: string;
  frozenAccountLiability: string;
  realEarningsBacking: string;
  unverifiedCreditExposure: string;
  pendingWithdrawalLiability: string;
  withdrawalLiabilityBreakdown: { pending: string; approved: string; processing: string };
  netPlatformLiquidity: string;
  adminCreditDetails: Array<{
    id: string;
    userId: string;
    userName: string;
    adminName: string;
    amount: string;
    description: string;
    createdAt: string;
  }>;
  adminCreditTotalCount: number;
}

function pkr(value: string | undefined): number {
  const n = parseFloat(value || "0");
  return Number.isFinite(n) ? n : 0;
}

function Row({ label, value, sub, variant = "neutral", indent = false }: {
  label: string;
  value: string;
  sub?: string;
  variant?: "positive" | "negative" | "warning" | "neutral";
  indent?: boolean;
}) {
  const colors = {
    positive: "text-emerald-600",
    negative: "text-red-500",
    warning: "text-amber-600",
    neutral: "text-foreground",
  };
  return (
    <div className={cn("flex items-center justify-between py-4 border-b border-zinc-100 last:border-0", indent && "pl-6")}>
      <div>
        <p className={cn("font-bold text-foreground", indent ? "text-xs" : "text-sm")}>{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <p className={cn("font-black", colors[variant], indent ? "text-sm" : "text-base")}>₨{pkr(value).toLocaleString()}</p>
    </div>
  );
}

export function ReconciliationPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [showLiabilityBreakdown, setShowLiabilityBreakdown] = useState(false);
  const [creditsLimit, setCreditsLimit] = useState(ADMIN_CREDITS_PAGE_SIZE);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ReconciliationData>({
    queryKey: [`/api/admin/reconciliation?limit=${creditsLimit}`],
    refetchInterval: 2 * 60 * 1000,
  });

  const reclassifyMutation = useMutation({
    mutationFn: async (earningId: string) => {
      const res = await apiRequest("POST", `/api/admin/earnings/${earningId}/reclassify`, { type: "verified_deposit" });
      return res.json();
    },
    onSuccess: () => {
      // Prefix match so every paginated reconciliation query (any ?limit=) gets invalidated.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/admin/reconciliation");
        },
      });
      toast({ title: "Marked as Verified", description: "Entry reclassified as real bank deposit." });
    },
    onError: (err: Error) => toast({
      title: "Action failed",
      description: err?.message?.replace(/^\d+:\s*/, "") || "Could not reclassify this entry.",
      variant: "destructive",
    }),
  });

  const exposure = pkr(data?.unverifiedCreditExposure);
  const liquidity = pkr(data?.netPlatformLiquidity);
  const frozenLiability = pkr(data?.frozenAccountLiability);
  const hasMoreCredits = (data?.adminCreditDetails?.length ?? 0) < (data?.adminCreditTotalCount ?? 0);

  return (
    <div className="space-y-7 animate-in slide-in-from-bottom-2 duration-700">
      <div>
        <h2 className="text-3xl font-black tracking-tighter text-foreground mb-1">Money Overview</h2>
        <p className="text-sm text-muted-foreground">How much real money backs your user balances</p>
      </div>

      {/* Alert banners */}
      {isError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black text-red-700">Could not load financial data</p>
            <p className="text-xs text-red-600 mt-0.5">{(error as Error)?.message?.replace(/^\d+:\s*/, "") || "Please try again."}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-3 h-8 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-red-700 transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {exposure > HIGH_EXPOSURE_THRESHOLD_PKR && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-red-700">High unverified credit exposure</p>
            <p className="text-xs text-red-600 mt-0.5">₨{exposure.toLocaleString()} in manual credits are not backed by real deposits. Review and verify below.</p>
          </div>
        </div>
      )}

      {frozenLiability > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm font-black text-amber-700">₨{frozenLiability.toLocaleString()} sits in suspended/deleted accounts — still owed, not zeroed on suspension.</p>
        </div>
      )}

      {!isError && liquidity < 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm font-black text-red-700">Net liquidity is negative — the platform cannot cover all pending payouts from verified funds alone.</p>
        </div>
      )}

      {/* Reconciliation Table */}
      <div className="bg-white border-[1.5px] border-zinc-200 rounded-[2rem] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 rounded-t-[2rem]">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Money Breakdown</p>
        </div>
        <div className="px-6">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground font-bold text-sm">Loading financial data…</div>
          ) : isError ? (
            <div className="py-12 text-center text-muted-foreground font-bold text-sm">Financial data unavailable.</div>
          ) : (
            <>
              <Row label="Total in User Balances" value={data?.totalUserBalances ?? "0"} sub="Active + suspended accounts combined" variant="neutral" />
              {frozenLiability > 0 && (
                <Row label="Suspended / Deleted Accounts" value={data?.frozenAccountLiability ?? "0"} sub="Included above — balance is not wiped on suspension" variant="warning" indent />
              )}
              <Row label="Real Earnings" value={data?.realEarningsBacking ?? "0"} sub="Organic tasks + verified bank deposits" variant="positive" />
              <Row
                label="Manual Credits (Unverified)"
                value={data?.unverifiedCreditExposure ?? "0"}
                sub="Admin-granted credits not backed by real deposits"
                variant={exposure > 0 ? "warning" : "neutral"}
              />
              <button
                className="w-full flex items-center justify-between py-4 border-b border-zinc-100 text-left hover:bg-zinc-50 transition-colors -mx-6 px-6"
                onClick={() => setShowLiabilityBreakdown(!showLiabilityBreakdown)}
              >
                <div>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    Pending Payout Obligations
                    {showLiabilityBreakdown ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Pending + approved + processing withdrawals not yet paid out</p>
                </div>
                <p className="text-base font-black text-amber-600">₨{pkr(data?.pendingWithdrawalLiability).toLocaleString()}</p>
              </button>
              {showLiabilityBreakdown && (
                <>
                  <Row label="Pending" value={data?.withdrawalLiabilityBreakdown?.pending ?? "0"} sub="Awaiting admin approval" variant="warning" indent />
                  <Row label="Approved" value={data?.withdrawalLiabilityBreakdown?.approved ?? "0"} sub="S-Rank fast-track, awaiting settlement" variant="warning" indent />
                  <Row label="Processing" value={data?.withdrawalLiabilityBreakdown?.processing ?? "0"} sub="Marked in-progress by admin" variant="warning" indent />
                </>
              )}
              <Row
                label="Net Liquidity"
                value={data?.netPlatformLiquidity ?? "0"}
                sub="Real earnings minus pending obligations"
                variant={liquidity >= 0 ? "positive" : "negative"}
              />
            </>
          )}
        </div>
      </div>

      {/* Manual Credits Drill-Down */}
      <div className="bg-white border-[1.5px] border-zinc-200 rounded-[2rem] overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50 hover:bg-zinc-100 transition-colors rounded-t-[2rem]"
          onClick={() => setShowDrilldown(!showDrilldown)}
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Manual Credits</p>
            <span className="text-[10px] font-black bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full">
              {data?.adminCreditTotalCount ?? 0}
            </span>
          </div>
          {showDrilldown ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showDrilldown && (
          <div className="divide-y divide-zinc-100">
            {!data?.adminCreditDetails?.length ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-muted-foreground">No unverified credits — all balances are real or verified.</p>
              </div>
            ) : (
              <>
                {data.adminCreditDetails.map((credit) => (
                  <div key={credit.id} className="flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-foreground">{credit.userName}</p>
                        <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                          By {credit.adminName} · {new Date(credit.createdAt).toLocaleDateString("en-PK")}
                        </p>
                        {credit.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic">"{credit.description}"</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-amber-600 text-sm">₨{pkr(credit.amount).toLocaleString()}</span>
                      {user?.role === "founder" && (
                        <button
                          onClick={() => reclassifyMutation.mutate(credit.id)}
                          disabled={reclassifyMutation.isPending}
                          className="flex items-center gap-1.5 px-3 h-8 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <Shield className="w-3 h-3" />
                          Verify
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {hasMoreCredits && (
                  <div className="p-4 flex justify-center">
                    <button
                      onClick={() => setCreditsLimit((n) => n + ADMIN_CREDITS_PAGE_SIZE)}
                      disabled={isFetching}
                      className="flex items-center gap-1.5 px-4 h-9 bg-zinc-100 text-zinc-700 text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
                      Load more ({(data?.adminCreditDetails?.length ?? 0)} of {data?.adminCreditTotalCount ?? 0})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
