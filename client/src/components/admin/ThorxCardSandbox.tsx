/**
 * ThorxCardSandbox — THORX v3 (spec F.13)
 * Admin tool to test the Thorx Card draw.
 * POST /api/admin/simulate/thorx-card
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThorxCard } from "@/components/ThorxCard";
import { Zap, Play, RotateCcw, Loader2 } from "lucide-react";

// Matches server/modules/thorx-card.ts SimulationResult exactly.
interface SimulateResult {
  iteration: number;
  pointsCredited: number;     // FINAL points — includes the rank multiplier below
  basePointsCredited: number; // pre-rank-multiplier value
  rankMultiplier: number;
  realPkrValue: string;       // Decimal-formatted string, e.g. "0.60000000" — never a number
  cardVariance: number;
}

const ENGINE_COLORS: Record<string, string> = {
  Engine_A: "#f97316",
  Engine_B: "#7c3aed",
  Engine_C: "#16a34a",
};

// Audit fix: the sandbox previously always tested as the server default
// (E-Rank) with no way to preview what higher-rank users actually receive —
// even though the backend has fully supported a userRankTier parameter
// since it was built.
const RANK_TIERS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

export function ThorxCardSandbox() {
  const { toast } = useToast();
  const [engineType, setEngineType] = useState("Engine_A");
  const [userRankTier, setUserRankTier] = useState("E-Rank");
  const [grossPkr, setGrossPkr] = useState("1.00");
  const [results, setResults] = useState<SimulateResult[]>([]);
  const [showCard, setShowCard] = useState(false);
  const [lastResult, setLastResult] = useState<SimulateResult | null>(null);
  const [batchCount, setBatchCount] = useState(1);

  const simulateMutation = useMutation({
    mutationFn: async ({ count }: { count: number }) => {
      const promises = Array.from({ length: count }, () =>
        apiRequest("POST", "/api/admin/simulate/thorx-card", {
          engineType: engineType.replace("Engine_", ""), // server expects "A" | "B" | "C"
          grossPkr: parseFloat(grossPkr),
          userRankTier,
        }).then(r => r.json())
      );
      return Promise.all(promises);
    },
    onSuccess: (resultArray: SimulateResult[]) => {
      setResults(prev => [...resultArray.reverse(), ...prev].slice(0, 100));
      if (resultArray.length === 1) {
        setLastResult(resultArray[0]);
        setShowCard(true);
      }
    },
    onError: () => toast({ title: "Simulation Error", variant: "destructive" }),
  });

  const color = ENGINE_COLORS[engineType] ?? "#f97316";

  const avg = results.length > 0
    ? results.reduce((s, r) => s + r.pointsCredited, 0) / results.length : 0;
  const minPts = results.length > 0 ? Math.min(...results.map(r => r.pointsCredited)) : 0;
  const maxPts = results.length > 0 ? Math.max(...results.map(r => r.pointsCredited)) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black">Thorx Card Sandbox</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Test the TX-Points card draw without recording real earnings.</p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Engine Type</label>
            <select value={engineType} onChange={e => setEngineType(e.target.value)}
              className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-sm bg-white">
              {Object.keys(ENGINE_COLORS).map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">User Rank Tier</label>
            <select value={userRankTier} onChange={e => setUserRankTier(e.target.value)}
              className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-sm bg-white">
              {RANK_TIERS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Gross PKR Earned</label>
            <Input type="number" step="0.01" min="0.01" max="100000" value={grossPkr} onChange={e => setGrossPkr(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Batch Size</label>
            <Input type="number" min="1" max="50" value={batchCount}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                setBatchCount(Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 1);
              }} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" style={{ backgroundColor: color }} onClick={() => simulateMutation.mutate({ count: 1 })} disabled={simulateMutation.isPending}>
            {simulateMutation.isPending ? <Loader2 size={14} className="mr-2 text-white animate-spin" /> : <Play size={14} className="mr-2 text-white" />}
            <span className="text-white">Draw Card</span>
          </Button>
          {batchCount > 1 && (
            <Button variant="outline" className="flex-1" onClick={() => simulateMutation.mutate({ count: batchCount })} disabled={simulateMutation.isPending}>
              {simulateMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              Batch Draw ×{batchCount}
            </Button>
          )}
          <Button variant="ghost" className="w-9 h-9 p-0" onClick={() => setResults([])} title="Clear results">
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Avg Points", value: Math.round(avg).toLocaleString() },
            { label: "Min Points", value: minPts.toLocaleString() },
            { label: "Max Points", value: maxPts.toLocaleString() },
            { label: `${userRankTier} Bonus`, value: `×${(results[0]?.rankMultiplier ?? 1).toFixed(2)}` },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
              <div className="text-xl font-black" style={{ color }}>{s.value}</div>
              <div className="text-xs text-zinc-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {results.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-3 border-b border-zinc-100 text-sm font-semibold">Draw History ({results.length} draws)</div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-50">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-zinc-50">
                <div className="flex items-center gap-2">
                  <Zap size={12} style={{ color }} />
                  <span className="text-sm font-bold" style={{ color }}>{r.pointsCredited.toLocaleString()} pts</span>
                  <span className="text-[10px] text-zinc-400">
                    ({(r.cardVariance * 100).toFixed(1)}% variance{(r.rankMultiplier ?? 1) !== 1 ? ` · ×${(r.rankMultiplier ?? 1).toFixed(2)} rank` : ""})
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  Rs.{parseFloat(r.realPkrValue).toFixed(4)} saved
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thorx Card overlay */}
      {showCard && lastResult && (
        <ThorxCard
          // Server's SimulationResult doesn't include engineType — use the
          // sandbox's own selected engine instead of the missing field.
          payload={{ pointsCredited: lastResult.pointsCredited, realPkrValue: parseFloat(lastResult.realPkrValue), engineType }}
          onClaim={() => setShowCard(false)}
        />
      )}
    </div>
  );
}

export default ThorxCardSandbox;
