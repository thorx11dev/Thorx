import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Decimal from "decimal.js";
import { TrendingUp, Plus, History, AlertTriangle, CheckCircle, DollarSign, X, Calendar, BarChart2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// Display-only, Decimal-guarded conversion for PKR string values — mirrors
// the safePkr helper used in AdminDashboard.tsx so a malformed/missing value
// renders as 0 instead of a literal "NaN".
const safePkr = (v: string | number | null | undefined) => { try { return new Decimal(String(v ?? "0")).toNumber(); } catch { return 0; } };

interface ProfitSummary {
  totalProfitEarned: string;
  thisMonthProfitEarned: string;
  totalWithdrawnToPersonal: string;
  thisMonthWithdrawn: string;
  safeToWithdrawNow: string;
  monthlyBalance: string;
  isOverWithdrawn: boolean;
  overWithdrawnAmount: string;
  // null when the platform fee rate isn't configured — do not fabricate a
  // fallback percentage, show an explicit "not configured" state instead.
  currentFeeRate: string | null;
  lastWithdrawalDate: string | null;
  daysSinceLastWithdrawal: number | null;
}

interface FounderWithdrawal {
  id: string;
  amount: string;
  withdrawalDate: string;
  description: string | null;
  createdAt: string;
}

export function FounderProfitCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [amount, setAmount] = useState("");
  const [wdDate, setWdDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");

  const [showProfitLedger, setShowProfitLedger] = useState(false);

  const { data: summary, isLoading } = useQuery<ProfitSummary>({
    queryKey: ["/api/admin/founder/profit-summary"],
    refetchInterval: 60000,
  });

  const { data: profitLedger, isLoading: profitLedgerLoading, isError: profitLedgerError } = useQuery<any>({
    queryKey: ["/api/admin/profit-ledger"],
    enabled: showProfitLedger,
    refetchInterval: showProfitLedger ? 120000 : false,
  });

  const { data: withdrawalsData } = useQuery<{ withdrawals: FounderWithdrawal[]; total: number }>({
    queryKey: ["/api/admin/founder/withdrawals"],
    enabled: showHistory || showLogModal,
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/founder/withdrawals", {
        amount,
        withdrawalDate: wdDate,
        description: description || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/founder/profit-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/founder/withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/profit-ledger"] });
      toast({ title: "Withdrawal Logged", description: "Personal transfer recorded." });
      setShowLogModal(false);
      setAmount("");
      setDescription("");
    },
    onError: () => toast({ title: "Failed to log withdrawal", variant: "destructive" }),
  });

  if (user?.role !== "founder") return null;

  const safe = safePkr(summary?.safeToWithdrawNow);
  const isOver = summary?.isOverWithdrawn ?? false;
  const stale = summary?.daysSinceLastWithdrawal !== null && (summary?.daysSinceLastWithdrawal ?? 0) > 14;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "border-[1.5px] rounded-[2rem] p-6 transition-all duration-300 cursor-pointer",
          "hover:shadow-lg hover:-translate-y-0.5",
          isOver
            ? "bg-red-50 border-red-200"
            : "bg-emerald-50 border-emerald-200"
        )}
        data-testid="card-founder-profit"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-full", isOver ? "bg-red-100" : "bg-emerald-100")}>
              <DollarSign className={cn("w-4 h-4", isOver ? "text-red-500" : "text-emerald-600")} />
            </div>
            {isOver
              ? <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
              : <CheckCircle className="w-4 h-4 text-emerald-500" />}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">My Profit</span>
        </div>

        {/* Main number */}
        <div className="mb-5">
          {isLoading ? (
            <Skeleton className="h-9 w-36 rounded-lg mb-1" />
          ) : (
            <div className={cn("text-3xl font-black mb-1", isOver ? "text-red-600" : "text-emerald-700")}>
              {isOver
                ? `−₨${safePkr(summary?.overWithdrawnAmount).toLocaleString()}`
                : `₨${safe.toLocaleString()}`
              }
            </div>
          )}
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {isOver ? "Over-withdrawn" : "Available to withdraw"}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-white/60 rounded-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">This Month Profit</p>
            <p className="font-black text-sm text-foreground">₨{safePkr(summary?.thisMonthProfitEarned).toLocaleString()}</p>
          </div>
          <div className="p-3 bg-white/60 rounded-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">This Month Taken</p>
            <p className="font-black text-sm text-foreground">₨{safePkr(summary?.thisMonthWithdrawn).toLocaleString()}</p>
          </div>
          <div className="p-3 bg-white/60 rounded-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Monthly Balance</p>
            <p className={cn("font-black text-sm", safePkr(summary?.monthlyBalance) >= 0 ? "text-emerald-600" : "text-red-500")}>
              ₨{safePkr(summary?.monthlyBalance).toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-white/60 rounded-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Platform Fee Rate</p>
            <p className="font-black text-sm text-foreground">
              {summary?.currentFeeRate != null ? `${summary.currentFeeRate}%` : <span className="text-zinc-300">Not configured</span>}
            </p>
          </div>
        </div>

        {/* Stale warning */}
        {stale && (
          <div className="mb-4 px-3 py-2 bg-amber-100 border border-amber-200 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <p className="text-[10px] font-bold text-amber-700">
              Last logged {summary?.daysSinceLastWithdrawal}d ago — consider updating your ledger
            </p>
          </div>
        )}

        {/* Engine Cuts Breakdown (Phase 19.2) */}
        {showProfitLedger && profitLedger && (
          <div className="mb-4 p-3 bg-white/70 border border-zinc-200 rounded-2xl space-y-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Engine Cut Breakdown</div>
            {[
              { label: "Engine A (Video Ads)", val: profitLedger.engineCuts?.A },
              { label: "Engine B (Surveys)", val: profitLedger.engineCuts?.B },
              { label: "Engine C (Guild)", val: profitLedger.engineCuts?.C },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between text-[10px]">
                <span className="text-zinc-500 font-bold">{label}</span>
                <span className="font-black text-zinc-900">₨{Number(val ?? 0).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-zinc-200 pt-2 flex justify-between text-[10px]">
              <span className="text-zinc-500 font-bold">Withdrawal Fee Revenue</span>
              <span className="font-black text-emerald-700">₨{Number(profitLedger.netWithdrawalFeeShare ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="font-black text-zinc-900">Total Profit</span>
              <span className="font-black text-emerald-700">₨{Number(profitLedger.totalProfit ?? 0).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowLogModal(true); }}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-black/80 transition-colors"
          >
            <Plus className="w-3 h-3" /> Log Withdrawal
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowProfitLedger(v => !v); }}
            className={`h-10 px-4 flex items-center gap-1.5 border-[1.5px] text-[10px] font-black uppercase tracking-widest rounded-full transition-colors ${showProfitLedger ? "bg-black text-white border-black" : "border-black hover:bg-black/5"}`}
            title="Engine Cuts Breakdown"
          >
            <BarChart2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
            className="h-10 px-4 flex items-center gap-1.5 border-[1.5px] border-black text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-black/5 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>

      {/* Log Withdrawal Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="border border-black/10 bg-white rounded-[2rem] p-0 max-w-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-black tracking-tighter">Log Withdrawal</DialogTitle>
              <button onClick={() => setShowLogModal(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-zinc-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-bold text-muted-foreground mt-2">
              Total earned: ₨{parseFloat(summary?.totalProfitEarned ?? "0").toLocaleString()} · Already taken: ₨{parseFloat(summary?.totalWithdrawnToPersonal ?? "0").toLocaleString()}
            </p>
          </DialogHeader>

          <div className="p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Amount (₨)</Label>
              <Input
                type="number"
                placeholder="0.00"
                className="rounded-2xl border border-zinc-200 focus:border-black focus:ring-0 font-mono text-2xl font-black h-16 px-6"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Date of Bank Transfer</Label>
              <Input
                type="date"
                className="rounded-2xl border border-zinc-200 focus:border-black focus:ring-0 font-bold h-12 px-4"
                value={wdDate}
                onChange={(e) => setWdDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Note (optional)</Label>
              <Input
                placeholder="Transaction ID or note..."
                className="rounded-2xl border border-zinc-200 focus:border-black focus:ring-0 font-bold h-12 px-4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="p-8 pt-0 flex-col gap-3 sm:flex-col sm:space-x-0">
            <Button
              className="w-full h-14 rounded-2xl bg-black text-white hover:bg-black/80 font-black uppercase tracking-widest text-xs"
              onClick={() => { if (!amount || !wdDate) return; logMutation.mutate(); }}
              disabled={!amount || !wdDate || logMutation.isPending}
            >
              {logMutation.isPending ? "Saving..." : "Save Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="border border-black/10 bg-white rounded-[2rem] p-0 max-w-lg overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-black tracking-tighter">Withdrawal History</DialogTitle>
              <button onClick={() => setShowHistory(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-zinc-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-2 max-h-[400px] overflow-y-auto">
            {!withdrawalsData?.withdrawals?.length ? (
              <p className="text-center text-sm text-muted-foreground py-8">No withdrawals logged yet.</p>
            ) : (
              withdrawalsData.withdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
                  <div>
                    <p className="font-black text-sm text-foreground">₨{parseFloat(w.amount).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                      {new Date(w.withdrawalDate).toLocaleDateString()}
                      {w.description && ` · ${w.description}`}
                    </p>
                  </div>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              ))
            )}
          </div>
          <div className="px-8 pb-8">
            <div className="p-4 bg-zinc-900 rounded-2xl grid grid-cols-2 gap-4 text-white">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Total Profit Earned</p>
                <p className="font-black text-lg">₨{parseFloat(summary?.totalProfitEarned ?? "0").toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Total Withdrawn</p>
                <p className="font-black text-lg">₨{parseFloat(summary?.totalWithdrawnToPersonal ?? "0").toLocaleString()}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
