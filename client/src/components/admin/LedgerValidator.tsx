/**
 * LedgerValidator — THORX v3 (spec F.14)
 * Admin tool to validate financial ledger integrity.
 * GET /api/admin/ledger/validate/:userId and /api/admin/ledger/validate/scan
 * POST /api/admin/ledger/reconcile/:userId
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, Search, AlertTriangle, CheckCircle, RotateCcw, User, Wrench, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserInspectorPanel } from "./UserInspectorPanel";

interface ValidationResult {
  userId: string;
  email?: string;
  isBalanced: boolean;
  computedBalance: string;
  storedBalance: string;
  discrepancy: string;
  totalEarned: string;
  totalWithdrawn: string;
  totalFees: string;
  transactionCount: number;
  errors: string[];
  warnings: string[];
}

interface ScanResult {
  scanned: number;
  totalEligible: number;
  flagged: number;
  critical: ValidationResult[];
  warnings: ValidationResult[];
  checkedAt: string;
}

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Client-side export: scan results already live fully in memory (accumulated
// across "Load next batch" pages), so re-hitting the server would just re-fetch
// what's already on screen and risks drifting from what the admin is looking at.
function downloadScanCsv(scanResult: ScanResult) {
  const header = ["Severity", "Email", "User ID", "Stored Balance", "Computed Balance", "Discrepancy", "Transactions", "Errors", "Warnings"];
  const rows = [
    header,
    ...scanResult.critical.map(r => ["CRITICAL", r.email ?? "", r.userId, r.storedBalance, r.computedBalance, r.discrepancy, String(r.transactionCount), r.errors.join(" | "), r.warnings.join(" | ")]),
    ...scanResult.warnings.map(r => ["WARNING", r.email ?? "", r.userId, r.storedBalance, r.computedBalance, r.discrepancy, String(r.transactionCount), r.errors.join(" | "), r.warnings.join(" | ")]),
  ];
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-scan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ValidationCard({
  result,
  onView,
  isViewLoading,
  onReconcile,
  isReconciling,
}: {
  result: ValidationResult;
  onView?: () => void;
  isViewLoading?: boolean;
  onReconcile?: () => void;
  isReconciling?: boolean;
}) {
  // Severity must mirror the backend's own bucketing (errors -> critical,
  // warnings-only -> warn) rather than re-deriving it from the PKR discrepancy
  // alone — a TX-Points-only mismatch has a $0 PKR discrepancy but is still a
  // real error, and was previously mislabeled with the green "OK" styling.
  const isCritical = result.errors.length > 0;
  const isWarning = !isCritical && result.warnings.length > 0;
  const disc = parseFloat(result.discrepancy || "0");
  return (
    <div className={cn("rounded-xl border p-4 space-y-2", isCritical ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {isCritical ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-emerald-500" />}
            <span className="font-semibold text-sm">{result.email || result.userId.slice(0, 12) + "…"}</span>
            <Badge
              variant="outline"
              className={
                isCritical ? "border-red-300 text-red-600 text-[10px]" :
                isWarning ? "border-amber-300 text-amber-600 text-[10px]" :
                "border-emerald-300 text-emerald-600 text-[10px]"
              }
            >
              {isCritical ? "CRITICAL" : isWarning ? "WARN" : "OK"}
            </Badge>
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {result.transactionCount} transactions · Earned Rs.{parseFloat(result.totalEarned).toFixed(2)} · Withdrawn Rs.{parseFloat(result.totalWithdrawn).toFixed(2)}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {onReconcile && isCritical && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-100"
              onClick={onReconcile}
              disabled={isReconciling}
              title="Reconcile balance to computed value"
              data-testid={`button-reconcile-${result.userId}`}
            >
              {isReconciling ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            </Button>
          )}
          {onView && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onView}
              disabled={isViewLoading}
              title="View full profile"
              data-testid={`button-view-${result.userId}`}
            >
              {isViewLoading ? <Loader2 size={12} className="animate-spin" /> : <User size={12} />}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-50 rounded-lg p-2">
          <div className="text-[10px] text-zinc-400">Stored Balance</div>
          <div className="font-semibold text-sm">Rs.{parseFloat(result.storedBalance).toFixed(2)}</div>
        </div>
        <div className={cn("rounded-lg p-2", isCritical ? "bg-red-100" : "bg-zinc-50")}>
          <div className="text-[10px] text-zinc-400">Computed Balance</div>
          <div className={cn("font-semibold text-sm", isCritical ? "text-red-700" : "")}>Rs.{parseFloat(result.computedBalance).toFixed(2)}</div>
        </div>
      </div>

      {(isCritical || isWarning) && Math.abs(disc) > 0 && (
        <div className={cn("text-xs font-semibold rounded-lg px-3 py-2", isCritical ? "text-red-700 bg-red-100" : "text-amber-700 bg-amber-100")}>
          ⚠ Discrepancy: Rs.{Math.abs(disc).toFixed(4)} {disc > 0 ? "(over-reported)" : "(under-reported)"}
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="space-y-0.5">
          {result.errors.map((e, i) => <div key={i} className="text-[11px] text-red-600">• {e}</div>)}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="space-y-0.5">
          {result.warnings.map((w, i) => <div key={i} className="text-[11px] text-amber-600">• {w}</div>)}
        </div>
      )}
    </div>
  );
}

export function LedgerValidator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [singleResult, setSingleResult] = useState<ValidationResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Drill-down into the full user profile (existing UserInspectorPanel), keyed
  // off the ledger record's email since that's a small ValidationResult, not a
  // full user object.
  const [inspectedUser, setInspectedUser] = useState<any | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  // Reconcile confirmation flow
  const [reconcileTarget, setReconcileTarget] = useState<ValidationResult | null>(null);
  const [reconcileReason, setReconcileReason] = useState("");

  const validateMutation = useMutation({
    mutationFn: async (uid: string) => {
      const r = await apiRequest("GET", `/api/admin/ledger/validate/${uid}`);
      return r.json();
    },
    onSuccess: (data) => setSingleResult(data),
    onError: (error: Error) => toast({ title: "Validation failed", description: error.message, variant: "destructive" }),
  });

  const scanMutation = useMutation({
    mutationFn: async (offset: number) => {
      const r = await apiRequest("GET", `/api/admin/ledger/validate/scan?offset=${offset}`);
      return r.json() as Promise<ScanResult>;
    },
    onSuccess: (data, offset) => {
      setScanResult(prev => offset === 0 || !prev ? data : {
        // Merge a "Load next batch" page into the running total instead of
        // discarding the previous batch's results.
        scanned: prev.scanned + data.scanned,
        totalEligible: data.totalEligible,
        flagged: prev.flagged + data.flagged,
        critical: [...prev.critical, ...data.critical],
        warnings: [...prev.warnings, ...data.warnings],
        checkedAt: data.checkedAt,
      });
      setScanning(false);
    },
    onError: (error: Error) => { toast({ title: "Scan failed", description: error.message, variant: "destructive" }); setScanning(false); },
  });

  const handleScan = () => {
    setScanning(true);
    setScanResult(null);
    scanMutation.mutate(0);
  };

  const handleLoadNextBatch = () => {
    if (!scanResult) return;
    setScanning(true);
    scanMutation.mutate(scanResult.scanned);
  };

  const handleView = async (result: ValidationResult) => {
    if (!result.email) {
      toast({ title: "Can't open profile", description: "This record has no email on file.", variant: "destructive" });
      return;
    }
    setInspectingId(result.userId);
    try {
      const r = await apiRequest("GET", `/api/team/users?search=${encodeURIComponent(result.email)}&limit=5`);
      const data = await r.json();
      const users: any[] = data.users || [];
      const match = users.find((u) => u.email?.toLowerCase() === result.email!.toLowerCase()) ?? users[0];
      if (!match) {
        toast({ title: "User not found", description: "Couldn't load the full profile for this account.", variant: "destructive" });
        return;
      }
      setInspectedUser(match);
      setIsInspectorOpen(true);
    } catch (error) {
      toast({ title: "Couldn't open profile", description: error instanceof Error ? error.message : "Lookup failed", variant: "destructive" });
    } finally {
      setInspectingId(null);
    }
  };

  // Patches a reconciled result back into whichever piece of local state
  // currently holds it, re-bucketing scan results between critical/warnings/
  // cleared based on the freshly re-validated severity.
  const applyReconciled = (updated: ValidationResult) => {
    setSingleResult(prev => (prev && prev.userId === updated.userId ? updated : prev));
    setScanResult(prev => {
      if (!prev) return prev;
      const stillCritical = updated.errors.length > 0;
      const stillWarning = !stillCritical && updated.warnings.length > 0;
      const nextCritical = prev.critical.filter(r => r.userId !== updated.userId);
      const nextWarnings = prev.warnings.filter(r => r.userId !== updated.userId);
      if (stillCritical) nextCritical.push(updated);
      else if (stillWarning) nextWarnings.push(updated);
      return { ...prev, critical: nextCritical, warnings: nextWarnings, flagged: nextCritical.length + nextWarnings.length };
    });
  };

  const reconcileMutation = useMutation({
    mutationFn: async ({ targetUserId, reason }: { targetUserId: string; reason: string }) => {
      const r = await apiRequest("POST", `/api/admin/ledger/reconcile/${targetUserId}`, { reason });
      return r.json() as Promise<{ user: any; validation: ValidationResult }>;
    },
    onSuccess: (data) => {
      toast({ title: "Balance reconciled", description: `${data.validation.email ?? data.validation.userId} is now balanced.` });
      applyReconciled(data.validation);
      setReconcileTarget(null);
      setReconcileReason("");
      // R-Audit (2026-07-29): a reconcile changes availableBalance/txPointsBalance
      // (and possibly totalEarnings), which several other admin surfaces read —
      // UserManager's user list, AdminDashboard/team-metrics, the reconciliation
      // panel, and PayoutControl's own ledger-mismatch check for this user. None
      // of those were being invalidated, so they kept showing stale figures until
      // an unrelated refetch happened to occur.
      queryClient.invalidateQueries({ queryKey: ["/api/team/users"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${data.validation.userId}/network`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/founder/profit-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ledger/validate", data.validation.userId] });
    },
    onError: (error: Error) => toast({ title: "Reconciliation failed", description: error.message, variant: "destructive" }),
  });

  const hasExportableResults = !!scanResult && ((scanResult.critical?.length ?? 0) + (scanResult.warnings?.length ?? 0) > 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black">Ledger Validator</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Verify financial integrity of user balances against transaction history.</p>
      </div>

      {/* Single user lookup */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold">Single User Validation</div>
        <div className="flex gap-2">
          <Input
            placeholder="User ID or email…"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && userId.trim()) validateMutation.mutate(userId.trim()); }}
            data-testid="input-ledger-user"
          />
          <Button disabled={!userId.trim() || validateMutation.isPending} onClick={() => validateMutation.mutate(userId.trim())} data-testid="button-validate-user">
            <Search size={14} className="mr-1" />
            Validate
          </Button>
        </div>
        {singleResult && (
          <ValidationCard
            result={singleResult}
            onView={() => handleView(singleResult)}
            isViewLoading={inspectingId === singleResult.userId}
            onReconcile={() => setReconcileTarget(singleResult)}
            isReconciling={reconcileMutation.isPending && reconcileTarget?.userId === singleResult.userId}
          />
        )}
      </div>

      {/* Full ledger scan */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Full Ledger Scan</div>
            <div className="text-xs text-zinc-400">Validate all active user balances. May take 10–30 seconds.</div>
          </div>
          <div className="flex gap-2">
            {hasExportableResults && (
              <Button variant="outline" className="h-9 text-xs" onClick={() => downloadScanCsv(scanResult!)} data-testid="button-export-ledger-csv">
                <Download size={13} className="mr-1" />
                Export CSV
              </Button>
            )}
            {scanResult && (
              <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setScanResult(null)} title="Clear">
                <RotateCcw size={14} />
              </Button>
            )}
            <Button onClick={handleScan} disabled={scanMutation.isPending} data-testid="button-run-scan">
              <Shield size={14} className="mr-1" />
              {scanMutation.isPending ? "Scanning…" : "Run Scan"}
            </Button>
          </div>
        </div>

        {scanMutation.isPending && !scanResult && (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-lg bg-zinc-100 animate-pulse" />)}
          </div>
        )}

        {scanResult && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Scanned", val: scanResult.scanned, color: "" },
                { label: "Flagged", val: scanResult.flagged, color: scanResult.flagged > 0 ? "text-red-600" : "text-emerald-600" },
                { label: "Critical", val: scanResult.critical?.length ?? 0, color: (scanResult.critical?.length ?? 0) > 0 ? "text-red-700 font-black" : "" },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-zinc-200 p-2.5 text-center">
                  <div className={cn("text-2xl font-black", s.color)}>{s.val}</div>
                  <div className="text-xs text-zinc-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Truncation notice — the batch cap (1000) can be smaller than the
                total active user count, so make the partial coverage explicit
                instead of letting admins assume the whole platform was checked. */}
            {scanResult.scanned < scanResult.totalEligible && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <div className="text-xs font-semibold text-amber-700">
                  ⚠ Only {scanResult.scanned} of {scanResult.totalEligible} active users scanned so far.
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleLoadNextBatch} disabled={scanMutation.isPending}>
                  {scanMutation.isPending ? "Loading…" : "Load next batch"}
                </Button>
              </div>
            )}

            {/* Critical */}
            {(scanResult.critical?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs font-bold text-red-700 mb-2 uppercase tracking-wide">⚠ Critical Discrepancies</div>
                <div className="space-y-2">
                  {scanResult.critical.map(r => (
                    <ValidationCard
                      key={r.userId}
                      result={r}
                      onView={() => handleView(r)}
                      isViewLoading={inspectingId === r.userId}
                      onReconcile={() => setReconcileTarget(r)}
                      isReconciling={reconcileMutation.isPending && reconcileTarget?.userId === r.userId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {(scanResult.warnings?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs font-bold text-amber-600 mb-2 uppercase tracking-wide">Warnings</div>
                <div className="space-y-2">
                  {scanResult.warnings.map(r => (
                    <ValidationCard key={r.userId} result={r} onView={() => handleView(r)} isViewLoading={inspectingId === r.userId} />
                  ))}
                </div>
              </div>
            )}

            {scanResult.flagged === 0 && (
              <div className="text-center py-6 text-emerald-600 text-sm font-semibold">
                ✅ All {scanResult.scanned} scanned accounts are balanced
                {scanResult.scanned < scanResult.totalEligible ? ` (${scanResult.totalEligible - scanResult.scanned} more active users not yet scanned).` : "."}
              </div>
            )}
          </div>
        )}
      </div>

      <UserInspectorPanel user={inspectedUser} isOpen={isInspectorOpen} onClose={() => setIsInspectorOpen(false)} />

      <Dialog open={!!reconcileTarget} onOpenChange={(open) => { if (!open) { setReconcileTarget(null); setReconcileReason(""); } }}>
        <DialogContent className="max-w-md border border-zinc-200 bg-white rounded-2xl p-0 overflow-hidden shadow-xl">
          <DialogHeader className="px-7 py-5 border-b border-zinc-100 bg-white">
            <DialogTitle className="text-xl font-semibold text-red-500">Reconcile Balance</DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs mt-0.5">
              {reconcileTarget?.email ?? reconcileTarget?.userId} — stored Rs.{reconcileTarget ? parseFloat(reconcileTarget.storedBalance).toFixed(2) : "0.00"} will be corrected
              to the computed Rs.{reconcileTarget ? parseFloat(reconcileTarget.computedBalance).toFixed(2) : "0.00"}. The server re-validates live and applies the fix immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="px-7 py-6 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest ml-1">Reason (required)</Label>
              <Textarea
                placeholder="e.g. Verified against transaction history — correcting rounding drift."
                className="rounded-xl border border-zinc-300 focus:border-red-400 font-medium text-sm px-4 py-3 transition-all min-h-[80px]"
                value={reconcileReason}
                onChange={(e) => setReconcileReason(e.target.value)}
                data-testid="input-reconcile-reason"
              />
            </div>
          </div>
          <DialogFooter className="px-7 py-5 bg-white border-t border-zinc-100 flex flex-col gap-2">
            <Button
              className="w-full h-11 bg-red-500 text-white font-semibold text-sm rounded-xl hover:bg-red-600 transition-all"
              disabled={reconcileMutation.isPending || reconcileReason.trim().length < 5}
              onClick={() => reconcileTarget && reconcileMutation.mutate({ targetUserId: reconcileTarget.userId, reason: reconcileReason.trim() })}
              data-testid="button-confirm-reconcile"
            >
              {reconcileMutation.isPending ? <span className="flex items-center gap-1.5 justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin" />Reconciling…</span> : "Apply Correction"}
            </Button>
            <button type="button" className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1" onClick={() => { setReconcileTarget(null); setReconcileReason(""); }}>
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LedgerValidator;
