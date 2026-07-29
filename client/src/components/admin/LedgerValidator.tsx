/**
 * LedgerValidator — THORX v3 (spec F.14)
 * Admin tool to validate financial ledger integrity.
 * GET /api/admin/ledger/validate/:userId and /api/admin/ledger/scan
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Search, AlertTriangle, CheckCircle, RotateCcw, User } from "lucide-react";
import { cn } from "@/lib/utils";

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
  flagged: number;
  critical: ValidationResult[];
  warnings: ValidationResult[];
  checkedAt: string;
}

function ValidationCard({ result, onView }: { result: ValidationResult; onView?: () => void }) {
  const disc = parseFloat(result.discrepancy);
  const isCritical = !result.isBalanced && Math.abs(disc) > 0.01;
  return (
    <div className={cn("rounded-xl border p-4 space-y-2", isCritical ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {isCritical ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-emerald-500" />}
            <span className="font-semibold text-sm">{result.email || result.userId.slice(0, 12) + "…"}</span>
            <Badge variant="outline" className={isCritical ? "border-red-300 text-red-600 text-[10px]" : "border-emerald-300 text-emerald-600 text-[10px]"}>
              {isCritical ? "CRITICAL" : result.errors.length > 0 ? "ERROR" : result.warnings.length > 0 ? "WARN" : "OK"}
            </Badge>
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {result.transactionCount} transactions · Earned Rs.{parseFloat(result.totalEarned).toFixed(2)} · Withdrawn Rs.{parseFloat(result.totalWithdrawn).toFixed(2)}
          </div>
        </div>
        {onView && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onView}><User size={12} /></Button>}
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

      {isCritical && (
        <div className="text-xs font-semibold text-red-700 bg-red-100 rounded-lg px-3 py-2">
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
  const [userId, setUserId] = useState("");
  const [singleResult, setSingleResult] = useState<ValidationResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const validateMutation = useMutation({
    mutationFn: async (uid: string) => {
      const r = await apiRequest("GET", `/api/admin/ledger/validate/${uid}`);
      return r.json();
    },
    onSuccess: (data) => setSingleResult(data),
    onError: () => toast({ title: "Validation failed", variant: "destructive" }),
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("GET", "/api/admin/ledger/validate/scan");
      return r.json();
    },
    onSuccess: (data) => { setScanResult(data); setScanning(false); },
    onError: () => { toast({ title: "Scan failed", variant: "destructive" }); setScanning(false); },
  });

  const handleScan = () => {
    setScanning(true);
    setScanResult(null);
    scanMutation.mutate();
  };

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
          />
          <Button disabled={!userId.trim() || validateMutation.isPending} onClick={() => validateMutation.mutate(userId.trim())}>
            <Search size={14} className="mr-1" />
            Validate
          </Button>
        </div>
        {singleResult && (
          <ValidationCard result={singleResult} />
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
            {scanResult && (
              <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setScanResult(null)} title="Clear">
                <RotateCcw size={14} />
              </Button>
            )}
            <Button onClick={handleScan} disabled={scanMutation.isPending}>
              <Shield size={14} className="mr-1" />
              {scanMutation.isPending ? "Scanning…" : "Run Scan"}
            </Button>
          </div>
        </div>

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

            {/* Critical */}
            {(scanResult.critical?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs font-bold text-red-700 mb-2 uppercase tracking-wide">⚠ Critical Discrepancies</div>
                <div className="space-y-2">
                  {scanResult.critical.map(r => <ValidationCard key={r.userId} result={r} />)}
                </div>
              </div>
            )}

            {/* Warnings */}
            {(scanResult.warnings?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs font-bold text-amber-600 mb-2 uppercase tracking-wide">Warnings</div>
                <div className="space-y-2">
                  {scanResult.warnings.map(r => <ValidationCard key={r.userId} result={r} />)}
                </div>
              </div>
            )}

            {scanResult.flagged === 0 && (
              <div className="text-center py-6 text-emerald-600 text-sm font-semibold">
                ✅ All {scanResult.scanned} accounts are balanced.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LedgerValidator;
