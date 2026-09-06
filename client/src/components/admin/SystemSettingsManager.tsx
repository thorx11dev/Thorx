import React, { useState, useEffect } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Settings, DollarSign, Network, Trash2, Plus, ArrowUp, ArrowDown, ShieldAlert, Zap, Layers, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdNetwork {
  id: string;
  name: string;
  zoneId: string;
  type: string;
  priority: number;
  isActive: boolean;
}

/** system_config JSON values arrive as strings or objects — normalize for the
 *  credential editors so partial saves merge instead of clobbering. */
function parseJsonCfg(raw: unknown): Record<string, string> {
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function SystemSettingsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localConfigs, setLocalConfigs] = useState<Record<string, any>>({});

  // Admin-tunable Performance Score weights and Risk Engine thresholds.
  // Defaults here must match the fallback defaults read server-side
  // (server/storage.ts refreshLeaderboardCache, server/modules/risk-engine.ts)
  // so an unset key shows the value actually in effect.
  const RISK_CONFIG_DEFAULTS: Record<string, number> = {
    SCORE_WEIGHT_EARNINGS: 0.40,
    SCORE_WEIGHT_TEAM: 0.30,
    SCORE_WEIGHT_ACTIVE: 0.15,
    SCORE_WEIGHT_HEALTH: 0.15,
    SCORE_COHORT_DISCOUNT_DAYS: 14,
    RISK_VELOCITY_THRESHOLD: 5000,
    RISK_BOT_EARNINGS_PER_REF: 100,
    RISK_CASHOUT_WINDOW_HOURS: 1,
  };

  
  const { data: dbConfigs, isLoading } = useQuery<{ key: string; value: any }[]>({
    queryKey: ["/api/admin/config/bulk"],
    queryFn: async () => {
      // In a real app, I'd have a bulk endpoint, but for now I'll map over keys or fetch all
      const res = await apiRequest("GET", "/api/admin/config");
      const data = await res.json();
      return data.configs;
    }
  });

  useEffect(() => {
    if (dbConfigs) {
      const configMap: Record<string, any> = {};
      dbConfigs.forEach(c => {
        configMap[c.key] = c.value;
      });
      setLocalConfigs(configMap);
    }
  }, [dbConfigs]);

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/config/${key}`, { value });
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/bulk"] });
      // Audit fix (System Settings, 2026-07-29): the backend already flags
      // saves to a key no engine reads (isKnownKey: false) but this toast
      // used to say "Successfully synchronized" regardless — an admin had no
      // way to tell their change actually did nothing.
      if (data?.isKnownKey === false) {
        toast({
          title: "Saved, but not wired to anything",
          description: `"${variables.key}" was stored, but no engine currently reads this key — it will have no effect.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Configuration Saved",
        description: `Successfully synchronized ${variables.key} protocol.`,
      });
    },
    onError: () => {
      toast({
        title: "Sync Error",
        description: "Failed to broadcast configuration to the backend.",
        variant: "destructive"
      });
    }
  });

  const handleSave = (key: string) => {
    saveMutation.mutate({ key, value: localConfigs[key] });
  };

  const updateValue = (key: string, value: any) => {
    setLocalConfigs(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-20 text-center animate-in fade-in duration-500">
        <ThorxSpinner size={40} className="mx-auto mb-6" />
        <p className="font-bold text-xs uppercase tracking-[0.2em] text-[#141413]/40">Accessing Core Config...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 w-full animate-in slide-in-from-bottom-2 duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase text-[#141413]">System Protocol</h2>
        </div>
      </div>

      {/* ─── v4: TASK REVENUE SPLITS (Spec §7–§8) ─── */}
      <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm">
            <Zap className="w-5 h-5 text-zinc-500" />
          </div>
          <div>
            <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Task Revenue Splits</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Direct vs referred-user task revenue — applied to every new earn event</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Direct user split: Thorx / User */}
          <div className="p-4 bg-white border-[1.5px] border-[#141413]/10 rounded-2xl space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#D97757" }}>Direct User Task Split</div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>Thorx Share</span><span className="font-black text-[#141413]">{directCut}%</span>
              </div>
              <input type="range" min={0} max={80} value={directCut}
                onChange={e => updateValue("TASK_SPLIT_THORX_PCT", parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full cursor-pointer" style={{ accentColor: "#D97757" }}
              />
            </div>
            <div className="text-[10px] font-bold text-zinc-400">
              User Gets: <span className="font-black text-emerald-600">{100 - directCut}%</span> (lands in Pending Balance)
            </div>
            <Button size="sm" className="flex-1 h-7 text-[10px] font-black"
              onClick={() => saveMutation.mutate({ key: "TASK_SPLIT_THORX_PCT", value: directCut })}>Save</Button>
          </div>

          {/* Referred user split: Thorx / Referrer / User */}
          <div className="p-4 bg-white border-[1.5px] border-[#141413]/10 rounded-2xl space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#7c3aed" }}>Referred User Task Split</div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>Thorx Share</span><span className="font-black text-[#141413]">{referredCut}%</span>
              </div>
              <input type="range" min={0} max={80} value={referredCut}
                onChange={e => updateValue("TASK_SPLIT_THORX_REFERRED_PCT", parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full cursor-pointer" style={{ accentColor: "#7c3aed" }}
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>Referrer Commission (PKR only)</span><span className="font-black text-[#141413]">{referrerCut}%</span>
              </div>
              <input type="range" min={0} max={20} value={referrerCut}
                onChange={e => updateValue("TASK_SPLIT_REFERRER_PCT", parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full cursor-pointer" style={{ accentColor: "#7c3aed" }}
              />
            </div>
            <div className="text-[10px] font-bold text-zinc-400">
              User Gets: <span className="font-black text-emerald-600">{100 - referredCut - referrerCut}%</span>
              {referredCut + referrerCut > 100 && (
                <span className="text-amber-600 font-black"> ⚠ total exceeds 100%</span>
              )}
            </div>
            <Button size="sm" className="flex-1 h-7 text-[10px] font-black" disabled={referredCut + referrerCut > 100}
              title={referredCut + referrerCut > 100 ? "Thorx + Referrer must not exceed 100%" : undefined}
              onClick={() => {
                saveMutation.mutate({ key: "TASK_SPLIT_THORX_REFERRED_PCT", value: referredCut });
                saveMutation.mutate({ key: "TASK_SPLIT_REFERRER_PCT", value: referrerCut });
              }}>Save</Button>
          </div>
        </div>
      </div>

      {/* ─── ENGINE PROFIT SLIDERS (Engine C guild economy only in v4) ─── */}
      <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm">
            <Zap className="w-5 h-5 text-zinc-500" />
          </div>
          <div>
            <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Guild Engine Configuration</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Engine C pool economics — distributed every Sunday</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: "Engine C — Guild Tasks", cutKey: "ENGINE_C_THORX_CUT_PCT", min: 10, max: 40, color: "#16a34a", isEngineC: true },
          ].map(({ label, cutKey, min, max, color, isEngineC }) => {
            const cut = Number(localConfigs[cutKey] ?? (isEngineC ? 15 : 40));
            const pool = isEngineC ? Number(localConfigs["ENGINE_C_GUILD_POOL_PCT"] ?? 80) : 0;
            const bonus = isEngineC ? Number(localConfigs["ENGINE_C_BONUS_PCT"] ?? 5) : 0;
            const userGets = isEngineC ? 0 : 100 - cut;
            return (
              <div key={cutKey} className="p-4 bg-white border-[1.5px] border-[#141413]/10 rounded-2xl space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                    <span>Thorx Cut</span><span className="font-black text-[#141413]">{cut}%</span>
                  </div>
                  <input type="range" min={min} max={max} value={cut}
                    onChange={e => updateValue(cutKey, parseInt(e.target.value, 10))}
                    className="w-full h-2 rounded-full accent-current cursor-pointer"
                    style={{ accentColor: color }}
                  />
                </div>
                {isEngineC && (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                        <span>Guild Pool (Sunday payout)</span><span className="font-black text-[#141413]">{pool}%</span>
                      </div>
                      <input type="range" min={20} max={90} value={pool}
                        onChange={e => updateValue("ENGINE_C_GUILD_POOL_PCT", parseInt(e.target.value, 10))}
                        className="w-full h-2 rounded-full cursor-pointer"
                        style={{ accentColor: color }}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                        <span>Bonus Pool (on target hit)</span><span className="font-black text-[#141413]">{bonus}%</span>
                      </div>
                      <input type="range" min={0} max={20} value={bonus}
                        onChange={e => updateValue("ENGINE_C_BONUS_PCT", parseInt(e.target.value, 10))}
                        className="w-full h-2 rounded-full cursor-pointer"
                        style={{ accentColor: color }}
                      />
                    </div>
                  </>
                )}
                <div className="text-[10px] font-bold text-zinc-400">
                  {isEngineC
                    ? <>Immediate User Share: <span className="font-black text-zinc-500">0%</span> (locked into pool, distributed Sunday)</>
                    : <>User Gets: <span className="font-black text-emerald-600">{userGets}%</span></>}
                </div>
                {isEngineC && cut + pool + bonus !== 100 && (
                  <div className="text-[10px] font-bold text-amber-600">⚠ Cut + Pool + Bonus = {cut + pool + bonus}% (should total 100%)</div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-[10px] font-black"
                    disabled={isEngineC && cut + pool + bonus !== 100}
                    title={isEngineC && cut + pool + bonus !== 100 ? "Cut + Pool + Bonus must total 100% before saving" : undefined}
                    onClick={() => {
                      saveMutation.mutate({ key: cutKey, value: cut });
                      if (isEngineC) {
                        saveMutation.mutate({ key: "ENGINE_C_GUILD_POOL_PCT", value: pool });
                        saveMutation.mutate({ key: "ENGINE_C_BONUS_PCT", value: bonus });
                      }
                    }}>Save</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── v4: EARNING VERIFICATION WINDOW (Spec §5) ─── */}
      <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm">
            <Activity className="w-5 h-5 text-zinc-500" />
          </div>
          <div>
            <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Earning Verification</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">How long earnings stay Pending before auto-moving to Available</p>
          </div>
        </div>
        <div className="p-4 bg-white border-[1.5px] border-[#141413]/10 rounded-2xl space-y-3 max-w-md">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-zinc-500">
              <span>Pending Verification Window</span><span className="font-black text-[#141413]">{verificationHours}h</span>
            </div>
            <input type="range" min={1} max={96} step={1} value={verificationHours}
              onChange={e => updateValue("PENDING_VERIFICATION_HOURS", parseInt(e.target.value, 10))}
              className="w-full h-2 rounded-full accent-black cursor-pointer"
            />
            <p className="text-[9px] font-bold text-zinc-400">Sweep runs every 15 minutes. Spec target: ≤ 48h (2 days). Network reversals still claw money back after verification.</p>
          </div>
          <Button size="sm" className="h-7 text-[10px] font-black px-3" onClick={() => saveMutation.mutate({ key: "PENDING_VERIFICATION_HOURS", value: verificationHours })}>Save</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Economic Constants */}
        <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group flex flex-col">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm group-hover:border-primary transition-colors">
              <DollarSign className="w-5 h-5 text-zinc-500 group-hover:text-primary transition-colors" />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Economic Thresholds</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Platform-wide financial variables</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <EconomicControl 
              label="Minimum Payout (PKR)" 
              value={localConfigs["MIN_PAYOUT"] || 0} 
              onChange={(val: number) => updateValue("MIN_PAYOUT", val)}
              onSave={() => handleSave("MIN_PAYOUT")}
              isLoading={saveMutation.isPending && saveMutation.variables?.key === "MIN_PAYOUT"}
            />
            
            <EconomicControl 
              label="Withdrawal Fee (%)" 
              value={localConfigs["WITHDRAWAL_FEE_PCT"] || 0} 
              onChange={(val: number) => updateValue("WITHDRAWAL_FEE_PCT", val)}
              onSave={() => handleSave("WITHDRAWAL_FEE_PCT")}
              isLoading={saveMutation.isPending && saveMutation.variables?.key === "WITHDRAWAL_FEE_PCT"}
            />

            <EconomicControl 
              label="Payout SLA (hours)" 
              value={localConfigs["PAYOUT_SLA_HOURS"] || 0} 
              onChange={(val: number) => updateValue("PAYOUT_SLA_HOURS", val)}
              onSave={() => handleSave("PAYOUT_SLA_HOURS")}
              isLoading={saveMutation.isPending && saveMutation.variables?.key === "PAYOUT_SLA_HOURS"}
            />

            <EconomicControl 
              label="Referral Share of Fee (%)" 
              value={localConfigs["REFERRAL_FEE_SHARE_PCT"] || 0} 
              onChange={(val: number) => updateValue("REFERRAL_FEE_SHARE_PCT", val)}
              onSave={() => handleSave("REFERRAL_FEE_SHARE_PCT")}
              isLoading={saveMutation.isPending && saveMutation.variables?.key === "REFERRAL_FEE_SHARE_PCT"}
            />
            <p className="text-[10px] font-bold text-zinc-400 -mt-3">Portion of the withdrawal fee carved out to the withdrawing user's direct referrer. The rest stays with the platform. The user's total deduction is always exactly the Withdrawal Fee — this share does not add on top.</p>

            <EconomicControl 
              label="Points per PKR" 
              value={localConfigs["CONVERSION_RATE"] || 0} 
              onChange={(val: number) => updateValue("CONVERSION_RATE", val)}
              onSave={() => handleSave("CONVERSION_RATE")}
              isLoading={saveMutation.isPending && saveMutation.variables?.key === "CONVERSION_RATE"}
            />
          </div>
        </div>

        {/* Global Settings */}
        <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative flex flex-col group">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm group-hover:border-primary transition-colors">
              <Settings className="w-5 h-5 text-zinc-500 group-hover:text-primary transition-colors" />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Core Integration</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Platform localization & identity</p>
            </div>
          </div>

          <div className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="p-6 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-[1.5rem]">
              <TechnicalLabel text="CURRENCY SYMBOL" className="text-[#141413]/50 mb-3 font-black text-[9px] uppercase tracking-widest" />
              <div className="flex gap-3">
                <Input 
                  value="PKR" 
                  disabled 
                  className="flex-1 h-10 bg-white border-[1.5px] border-[#141413]/20 focus-visible:ring-0 font-bold text-sm rounded-full tracking-tight text-[#141413]" 
                />
                <div className="bg-zinc-100 border-[1.5px] border-zinc-200 text-zinc-400 px-5 flex items-center justify-center font-black text-[10px] rounded-full uppercase tracking-widest">
                  Locked
                </div>
              </div>
              <p className="text-[9px] font-bold text-zinc-400 mt-3 uppercase tracking-widest">Currency is locked to Pakistani Rupee (PKR).</p>
            </div>

            <div className="p-6 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-[1.5rem] opacity-70">
              <TechnicalLabel text="API ENDPOINT SECURITY" className="text-[#141413]/50 mb-3 font-black text-[9px] uppercase tracking-widest" />
              <div className="h-10 bg-zinc-100 border-[1.5px] border-dashed border-[#141413]/20 rounded-full flex items-center justify-center font-black text-[9px] uppercase tracking-widest text-[#141413]/30">
                Encrypted Connection Active
              </div>
            </div>
          </div>
        </div>

        {/* ─── Survey Economy (Engine B) ─────────────────────────────── */}
        <div className="lg:col-span-2 bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm">
              <Activity className="w-5 h-5 text-zinc-500" />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Survey Economy</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Engine B payout rate, daily limits & rank gate</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-3xl space-y-3">
              <TechnicalLabel text="USD → PKR RATE" className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest" />
              <Input
                type="number"
                value={localConfigs["SURVEY_USD_TO_PKR_RATE"] ?? "278"}
                onChange={(e) => updateValue("SURVEY_USD_TO_PKR_RATE", Number(e.target.value))}
                className="h-10 bg-white border-[1.5px] border-[#141413]/20 font-bold text-sm rounded-full text-[#141413]"
              />
              <Button
                onClick={() => handleSave("SURVEY_USD_TO_PKR_RATE")}
                disabled={saveMutation.isPending && saveMutation.variables?.key === "SURVEY_USD_TO_PKR_RATE"}
                className="w-full h-9 bg-[#141413] text-white hover:bg-primary hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest"
              >
                <Save className="w-3 h-3 mr-1.5" /> Save Rate
              </Button>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">PKR credited per $1 publisher payout</p>
            </div>
            <div className="p-5 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-3xl space-y-3">
              <TechnicalLabel text="MAX SURVEYS / USER / DAY" className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest" />
              <Input
                type="number"
                value={localConfigs["SURVEY_MAX_PER_DAY"] ?? "20"}
                onChange={(e) => updateValue("SURVEY_MAX_PER_DAY", Number(e.target.value))}
                className="h-10 bg-white border-[1.5px] border-[#141413]/20 font-bold text-sm rounded-full text-[#141413]"
              />
              <Button
                onClick={() => handleSave("SURVEY_MAX_PER_DAY")}
                disabled={saveMutation.isPending && saveMutation.variables?.key === "SURVEY_MAX_PER_DAY"}
                className="w-full h-9 bg-[#141413] text-white hover:bg-primary hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest"
              >
                <Save className="w-3 h-3 mr-1.5" /> Save Limit
              </Button>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Quality guard — keeps approval rates high</p>
            </div>
            <div className="p-5 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-3xl space-y-3">
              <TechnicalLabel text="MINIMUM RANK FOR SURVEYS" className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest" />
              <select
                value={localConfigs["SURVEY_MIN_RANK"] ?? "E-Rank"}
                onChange={(e) => updateValue("SURVEY_MIN_RANK", e.target.value)}
                className="h-10 w-full bg-white border-[1.5px] border-[#141413]/20 rounded-full px-4 font-bold text-sm text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <Button
                onClick={() => handleSave("SURVEY_MIN_RANK")}
                disabled={saveMutation.isPending && saveMutation.variables?.key === "SURVEY_MIN_RANK"}
                className="w-full h-9 bg-[#141413] text-white hover:bg-primary hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest"
              >
                <Save className="w-3 h-3 mr-1.5" /> Save Gate
              </Button>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">E-Rank = open to everyone during beta</p>
            </div>
          </div>
        </div>

        {/* ─── Survey Network Credentials (Engine B activation) ────────── */}
        <div className="lg:col-span-2 bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm">
              <ShieldAlert className="w-5 h-5 text-zinc-500" />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Survey Networks</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Paste publisher credentials — empty network stays hidden from the wall</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-3xl space-y-3">
              <TechnicalLabel text="CPX RESEARCH" className="text-[#141413]/70 font-black text-[10px] uppercase tracking-widest" />
              <Input
                placeholder="API ID (app_id)"
                value={parseJsonCfg(localConfigs["CPX_RESEARCH_CONFIG_JSON"]).apiId ?? ""}
                onChange={(e) => updateValue("CPX_RESEARCH_CONFIG_JSON", JSON.stringify({ ...parseJsonCfg(localConfigs["CPX_RESEARCH_CONFIG_JSON"]), apiId: e.target.value.trim() }))}
                className="h-10 bg-white border-[1.5px] border-[#141413]/20 font-mono text-sm rounded-full text-[#141413]"
              />
              <Input
                type="password"
                placeholder="Secret hash (postback validation)"
                value={parseJsonCfg(localConfigs["CPX_RESEARCH_CONFIG_JSON"]).hash ?? ""}
                onChange={(e) => updateValue("CPX_RESEARCH_CONFIG_JSON", JSON.stringify({ ...parseJsonCfg(localConfigs["CPX_RESEARCH_CONFIG_JSON"]), hash: e.target.value.trim() }))}
                className="h-10 bg-white border-[1.5px] border-[#141413]/20 font-mono text-sm rounded-full text-[#141413]"
              />
              <Button
                onClick={() => handleSave("CPX_RESEARCH_CONFIG_JSON")}
                disabled={saveMutation.isPending && saveMutation.variables?.key === "CPX_RESEARCH_CONFIG_JSON"}
                className="w-full h-9 bg-[#141413] text-white hover:bg-primary hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest"
              >
                <Save className="w-3 h-3 mr-1.5" /> Save CPX
              </Button>
            </div>
            <div className="p-5 border-[1.5px] border-[#141413]/10 bg-white/50 rounded-3xl space-y-3">
              <TechnicalLabel text="BITLABS" className="text-[#141413]/70 font-black text-[10px] uppercase tracking-widest" />
              <Input
                placeholder="App token (wall URL)"
                value={parseJsonCfg(localConfigs["BITLABS_CONFIG_JSON"]).appToken ?? ""}
                onChange={(e) => updateValue("BITLABS_CONFIG_JSON", JSON.stringify({ ...parseJsonCfg(localConfigs["BITLABS_CONFIG_JSON"]), appToken: e.target.value.trim() }))}
                className="h-10 bg-white border-[1.5px] border-[#141413]/20 font-mono text-sm rounded-full text-[#141413]"
              />
              <Input
                type="password"
                placeholder="Secret (callback HMAC)"
                value={parseJsonCfg(localConfigs["BITLABS_CONFIG_JSON"]).secret ?? ""}
                onChange={(e) => updateValue("BITLABS_CONFIG_JSON", JSON.stringify({ ...parseJsonCfg(localConfigs["BITLABS_CONFIG_JSON"]), secret: e.target.value.trim() }))}
                className="h-10 bg-white border-[1.5px] border-[#141413]/20 font-mono text-sm rounded-full text-[#141413]"
              />
              <Button
                onClick={() => handleSave("BITLABS_CONFIG_JSON")}
                disabled={saveMutation.isPending && saveMutation.variables?.key === "BITLABS_CONFIG_JSON"}
                className="w-full h-9 bg-[#141413] text-white hover:bg-primary hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest"
              >
                <Save className="w-3 h-3 mr-1.5" /> Save BitLabs
              </Button>
            </div>
          </div>
          <p className="text-[9px] font-bold text-zinc-400 mt-4 uppercase tracking-widest">
            Postback URLs: /api/webhooks/survey/cpx-research · /api/webhooks/survey/bitlabs — set these in each dashboard.
          </p>
        </div>

        {/* ─── Per-Engine TX-Points Ratio Config (Spec §11.1 / §1.1) ─── */}
        <div className="lg:col-span-2 bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm">
              <Layers className="w-5 h-5 text-zinc-500" />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">TX-Points Illusion Engine</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Per-engine TX-Points displayed per 1.00 PKR of user share — never exposes real PKR to users</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {([
              { engine: "A", label: "Engine A — Video Ads", ratioKey: "ENGINE_A_PKR_TO_POINTS_RATIO", varKey: "ENGINE_A_ILLUSION_VARIANCE_PCT", color: "#D97757" },
              { engine: "B", label: "Engine B — Surveys", ratioKey: "ENGINE_B_PKR_TO_POINTS_RATIO", varKey: "ENGINE_B_ILLUSION_VARIANCE_PCT", color: "#7c3aed" },
              { engine: "C", label: "Engine C — Guild",    ratioKey: "ENGINE_C_PKR_TO_POINTS_RATIO", varKey: "ENGINE_C_ILLUSION_VARIANCE_PCT", color: "#16a34a" },
            ] as const).map(({ engine, label, ratioKey, varKey, color }) => {
              const ratio = Number(localConfigs[ratioKey] ?? 1000);
              const variance = Number(localConfigs[varKey] ?? 10);
              return (
                <div key={engine} className="p-4 bg-white border-[1.5px] border-[#141413]/10 rounded-2xl space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                      <span>Points per PKR</span>
                      <span className="font-black text-[#141413]">{ratio.toLocaleString()}</span>
                    </div>
                    <input type="range" min={100} max={10000} step={100} value={ratio}
                      onChange={e => updateValue(ratioKey, parseInt(e.target.value, 10))}
                      className="w-full h-2 rounded-full cursor-pointer" style={{ accentColor: color }}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                      <span>Variance ±%</span>
                      <span className="font-black text-[#141413]">±{variance}%</span>
                    </div>
                    <input type="range" min={0} max={50} step={1} value={variance}
                      onChange={e => updateValue(varKey, parseInt(e.target.value, 10))}
                      className="w-full h-2 rounded-full cursor-pointer" style={{ accentColor: color }}
                    />
                  </div>
                  <Button size="sm" className="w-full h-7 text-[10px] font-black" onClick={() => {
                    saveMutation.mutate({ key: ratioKey, value: ratio });
                    saveMutation.mutate({ key: varKey, value: variance });
                  }}>Save</Button>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] font-bold text-zinc-400 mt-4 uppercase tracking-widest">
            These ratios are NEVER shown to users — only the TX-Points figure is displayed. Changing them affects all future earns immediately.
          </p>
        </div>

        {/* ─── Per-Ad-Player Config UI (Phase 16.4) ─── */}
        <div className="lg:col-span-2">
          <AdPlayersSection />
        </div>

        {/* Waterfall Management - Full Width */}
        <div className="lg:col-span-2">
          <WaterfallSection 
            title="Ad Network Waterfall" 
            networks={localConfigs["AD_NETWORKS"] || []}
            onUpdate={(networks: AdNetwork[]) => updateValue("AD_NETWORKS", networks)}
            onSave={() => handleSave("AD_NETWORKS")}
            isLoading={saveMutation.isPending && saveMutation.variables?.key === "AD_NETWORKS"}
            icon={<Network className="w-5 h-5 text-zinc-500 group-hover:text-primary transition-colors" />}
          />
        </div>

        {/* Risk & Scoring Weights - Full Width */}
        <div className="lg:col-span-2">
          <RiskWeightsSection
            localConfigs={localConfigs}
            defaults={RISK_CONFIG_DEFAULTS}
            updateValue={updateValue}
            handleSave={handleSave}
            saveMutation={saveMutation}
          />
        </div>

      </div>
    </div>
  );
}

function RiskWeightsSection({ localConfigs, defaults, updateValue, handleSave, saveMutation }: any) {
  const val = (key: string) => localConfigs[key] ?? defaults[key];
  const weightKeys = ["SCORE_WEIGHT_EARNINGS", "SCORE_WEIGHT_TEAM", "SCORE_WEIGHT_ACTIVE", "SCORE_WEIGHT_HEALTH"];
  const weightSum = weightKeys.reduce((sum, k) => sum + (parseFloat(val(k)) || 0), 0);
  const weightsOff = Math.abs(weightSum - 1) > 0.001;

  return (
    <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] p-8 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm group-hover:border-primary transition-colors">
          <ShieldAlert className="w-5 h-5 text-zinc-500 group-hover:text-primary transition-colors" />
        </div>
        <div>
          <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">Performance & Risk Scoring</h3>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">
            Retune fraud detection without a deploy — every change is audit-logged
          </p>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Performance Score Weights</p>
            <span className={cn("text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full", weightsOff ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200")}>
              Sum: {weightSum.toFixed(2)} {weightsOff ? "(should be 1.00)" : "✓"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <EconomicControl label="Earnings Weight" value={val("SCORE_WEIGHT_EARNINGS")} onChange={(v: number) => updateValue("SCORE_WEIGHT_EARNINGS", v)} onSave={() => handleSave("SCORE_WEIGHT_EARNINGS")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "SCORE_WEIGHT_EARNINGS"} step="0.05" />
            <EconomicControl label="Team Weight" value={val("SCORE_WEIGHT_TEAM")} onChange={(v: number) => updateValue("SCORE_WEIGHT_TEAM", v)} onSave={() => handleSave("SCORE_WEIGHT_TEAM")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "SCORE_WEIGHT_TEAM"} step="0.05" />
            <EconomicControl label="Activity Weight" value={val("SCORE_WEIGHT_ACTIVE")} onChange={(v: number) => updateValue("SCORE_WEIGHT_ACTIVE", v)} onSave={() => handleSave("SCORE_WEIGHT_ACTIVE")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "SCORE_WEIGHT_ACTIVE"} step="0.05" />
            <EconomicControl label="Health Weight" value={val("SCORE_WEIGHT_HEALTH")} onChange={(v: number) => updateValue("SCORE_WEIGHT_HEALTH", v)} onSave={() => handleSave("SCORE_WEIGHT_HEALTH")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "SCORE_WEIGHT_HEALTH"} step="0.05" />
          </div>
          <p className="text-[9px] font-bold text-zinc-400 mt-3 uppercase tracking-widest">Weights should sum to 1.00. Takes effect on the next leaderboard recompute.</p>
        </div>

        <div>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Risk Engine Thresholds</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EconomicControl label="Earnings Velocity Threshold (PKR/24h)" value={val("RISK_VELOCITY_THRESHOLD")} onChange={(v: number) => updateValue("RISK_VELOCITY_THRESHOLD", v)} onSave={() => handleSave("RISK_VELOCITY_THRESHOLD")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "RISK_VELOCITY_THRESHOLD"} />
            <EconomicControl label="Bot Network Earnings/Ref (PKR)" value={val("RISK_BOT_EARNINGS_PER_REF")} onChange={(v: number) => updateValue("RISK_BOT_EARNINGS_PER_REF", v)} onSave={() => handleSave("RISK_BOT_EARNINGS_PER_REF")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "RISK_BOT_EARNINGS_PER_REF"} />
            <EconomicControl label="Cash-out Velocity Window (hours)" value={val("RISK_CASHOUT_WINDOW_HOURS")} onChange={(v: number) => updateValue("RISK_CASHOUT_WINDOW_HOURS", v)} onSave={() => handleSave("RISK_CASHOUT_WINDOW_HOURS")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "RISK_CASHOUT_WINDOW_HOURS"} />
          </div>
          <p className="text-[9px] font-bold text-zinc-400 mt-3 uppercase tracking-widest">Withdrawals placed within this many hours of earning trigger a cash-out velocity risk signal. This control was previously missing even though the Risk Engine already reads it.</p>
        </div>

        <div>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Cohort Discount</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EconomicControl label="New Account Grace Period (days)" value={val("SCORE_COHORT_DISCOUNT_DAYS")} onChange={(v: number) => updateValue("SCORE_COHORT_DISCOUNT_DAYS", v)} onSave={() => handleSave("SCORE_COHORT_DISCOUNT_DAYS")} isLoading={saveMutation.isPending && saveMutation.variables?.key === "SCORE_COHORT_DISCOUNT_DAYS"} />
          </div>
          <p className="text-[9px] font-bold text-zinc-400 mt-3 uppercase tracking-widest">Accounts younger than this get a 30% Health Score discount to prevent day-1 gaming.</p>
        </div>
      </div>
    </div>
  );
}

function EconomicControl({ label, value, onChange, onSave, isLoading, step }: any) {
  return (
    <div className="space-y-2">
      <TechnicalLabel text={label} className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest pl-1" />
      <div className="flex gap-3">
        <Input 
          type="number"
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 h-10 bg-white border-[1.5px] border-[#141413] rounded-full focus-visible:ring-primary shadow-sm font-bold text-sm text-[#141413]"
        />
        <Button 
          onClick={onSave}
          disabled={isLoading}
          className="h-10 bg-[#141413] hover:bg-primary text-white border-[1.5px] border-[#141413] rounded-full font-black text-[10px] uppercase transition-all shadow-sm px-6"
        >
          {isLoading ? "Saving..." : "Update"}
        </Button>
      </div>
    </div>
  );
}

// ─── Per-Ad-Player Config Section (Phase 16.4) ───────────────────────────────
interface AdPlayer {
  id: string;
  name: string;
  pkrToPointsRatio: number;
  variancePct: number;
}

function AdPlayersSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: players = [], isLoading } = useQuery<AdPlayer[]>({
    queryKey: ["/api/admin/engine-a/players"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/engine-a/players");
      const d = await r.json();
      return d.players ?? d ?? [];
    },
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRatio, setNewRatio] = useState("");
  const [newVariance, setNewVariance] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRatio, setEditRatio] = useState("");
  const [editVariance, setEditVariance] = useState("");

  const addMutation = useMutation({
    mutationFn: async (payload: { name: string; pkrToPointsRatio: number; variancePct: number }) => {
      const r = await apiRequest("POST", "/api/admin/engine-a/players", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-a/players"] });
      setShowAddForm(false);
      setNewName(""); setNewRatio(""); setNewVariance("");
      toast({ title: "Player added" });
    },
    onError: (err: any) => toast({ title: "Failed to add player", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name: string; pkrToPointsRatio: number; variancePct: number }) => {
      const r = await apiRequest("PATCH", `/api/admin/engine-a/players/${id}`, payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-a/players"] });
      setEditingId(null);
      toast({ title: "Player updated" });
    },
    onError: (err: any) => toast({ title: "Failed to update player", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/admin/engine-a/players/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engine-a/players"] });
      toast({ title: "Player removed" });
    },
    onError: (err: any) => toast({ title: "Failed to remove player", description: err.message, variant: "destructive" }),
  });

  const startEdit = (p: AdPlayer) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditRatio(String(p.pkrToPointsRatio));
    setEditVariance(String(p.variancePct));
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_4px_24px_rgba(20, 20, 19,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <span className="text-sm font-black uppercase tracking-widest text-zinc-900">Engine A — Ad Players</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs font-semibold gap-1 rounded-lg"
          onClick={() => { setShowAddForm(v => !v); }}
        >
          <Plus size={12} />Add Player
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="border-b border-zinc-100 px-6 py-4 bg-zinc-50 grid grid-cols-3 gap-3 items-end">
          <div>
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Name</div>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Player Alpha" className="h-8 text-xs" />
          </div>
          <div>
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">PKR → TX Ratio</div>
            <Input type="number" value={newRatio} onChange={e => setNewRatio(e.target.value)} placeholder="e.g. 1000" className="h-8 text-xs" />
          </div>
          <div>
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Variance %</div>
            <Input type="number" value={newVariance} onChange={e => setNewVariance(e.target.value)} placeholder="e.g. 10" className="h-8 text-xs" />
          </div>
          <div className="col-span-3 flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs bg-zinc-900 text-white hover:bg-black"
              disabled={!newName.trim() || isNaN(parseFloat(newRatio)) || isNaN(parseFloat(newVariance)) || addMutation.isPending}
              onClick={() => addMutation.mutate({ name: newName.trim(), pkrToPointsRatio: parseFloat(newRatio), variancePct: parseFloat(newVariance) })}
            >
              {addMutation.isPending ? "Adding…" : "Save Player"}
            </Button>
          </div>
        </div>
      )}

      {/* Player table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-zinc-400 text-sm">Loading players…</div>
        ) : players.length === 0 ? (
          <div className="px-6 py-10 text-center text-zinc-400 text-sm">
            <Layers size={32} className="mx-auto mb-2 text-zinc-300" />
            No ad players configured. Add one to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest px-6 py-2.5">Name</th>
                <th className="text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest px-4 py-2.5">PKR → TX Ratio</th>
                <th className="text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest px-4 py-2.5">Variance %</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {players.map(p => editingId === p.id ? (
                <tr key={p.id} className="bg-zinc-50">
                  <td className="px-6 py-2">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <Input type="number" value={editRatio} onChange={e => setEditRatio(e.target.value)} className="h-7 text-xs w-28" />
                  </td>
                  <td className="px-4 py-2">
                    <Input type="number" value={editVariance} onChange={e => setEditVariance(e.target.value)} className="h-7 text-xs w-24" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" className="h-6 text-xs px-2 bg-zinc-900 text-white hover:bg-black"
                        disabled={updateMutation.isPending || !editName.trim() || isNaN(parseFloat(editRatio)) || isNaN(parseFloat(editVariance))}
                        title={isNaN(parseFloat(editRatio)) || isNaN(parseFloat(editVariance)) ? "Ratio and variance must be numbers" : undefined}
                        onClick={() => updateMutation.mutate({ id: p.id, name: editName.trim(), pkrToPointsRatio: parseFloat(editRatio), variancePct: parseFloat(editVariance) })}
                      >
                        {updateMutation.isPending ? "…" : "Save"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-3 font-semibold text-zinc-900">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-600 font-mono">{p.pkrToPointsRatio.toLocaleString()}×</td>
                  <td className="px-4 py-3 text-zinc-600 font-mono">±{p.variancePct}%</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-900" onClick={() => startEdit(p)}>
                        <Settings size={12} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(p.id)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WaterfallSection({ title, networks, onUpdate, onSave, isLoading, icon }: any) {
  const addNetwork = () => {
    const newNetwork: AdNetwork = {
      id: `nw_${Date.now()}`,
      name: "New Network",
      zoneId: "",
      type: "video",
      priority: networks.length + 1,
      isActive: true
    };
    onUpdate([...networks, newNetwork]);
  };

  const removeNetwork = (id: string) => {
    onUpdate(networks.filter((n: AdNetwork) => n.id !== id));
  };

  const updateNetwork = (id: string, field: string, value: any) => {
    onUpdate(networks.map((n: AdNetwork) => n.id === id ? { ...n, [field]: value } : n));
  };

  return (
    <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] overflow-hidden shadow-sm group hover:shadow-md transition-all">
      <div className="p-6 md:p-8 border-b-[1.5px] border-[#141413]/10 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white border-[1.5px] border-[#141413]/20 flex items-center justify-center rounded-full shadow-sm group-hover:border-primary transition-colors">
            {icon}
          </div>
          <div>
            <h3 className="font-black text-xl uppercase text-[#141413] tracking-tight">{title}</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">Priority-based failover list</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button 
            onClick={addNetwork}
            variant="outline"
            className="h-10 border-[1.5px] border-[#141413] text-[#141413] rounded-full font-black text-[10px] uppercase hover:bg-black/5 hover:text-[#141413] shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus size={14} className="text-[#141413]" />
            <span className="hidden sm:inline">Add</span>
          </Button>
          <Button 
            onClick={onSave}
            disabled={isLoading}
            className="h-10 bg-[#141413] hover:bg-primary text-white border-[1.5px] border-[#141413] rounded-full font-black text-[10px] uppercase shadow-sm transition-all flex items-center gap-1.5 px-6"
          >
            <Save size={14} />
            {isLoading ? "Saving..." : "Save Config"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden bg-white/30">
        {networks.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest italic">No networks configured in waterfall</p>
          </div>
        ) : (
          <div className="divide-y-[1.5px] divide-[#141413]/10">
            {[...networks].sort((a: AdNetwork, b: AdNetwork) => a.priority - b.priority).map((nw: AdNetwork, idx: number) => (
              <div key={nw.id} className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center hover:bg-black/[0.02] transition-colors relative">
                
                <div className="flex flex-col gap-1 shrink-0 bg-white border-[1.5px] border-[#141413]/10 p-1 rounded-full shadow-sm">
                  <button 
                    onClick={() => updateNetwork(nw.id, "priority", Math.max(1, nw.priority - 1))}
                    className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-[#141413] hover:bg-black/5 rounded-full transition-colors"
                  >
                    <ArrowUp size={12} strokeWidth={3} />
                  </button>
                  <div className="w-6 h-6 text-[#141413] flex items-center justify-center font-black text-xs">
                    {nw.priority}
                  </div>
                  <button 
                    onClick={() => updateNetwork(nw.id, "priority", nw.priority + 1)}
                    className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-[#141413] hover:bg-black/5 rounded-full transition-colors"
                  >
                    <ArrowDown size={12} strokeWidth={3} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 w-full">
                  <div className="space-y-1.5">
                    <TechnicalLabel text="NETWORK NAME" className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest pl-1" />
                    <Input 
                      value={nw.name}
                      onChange={(e) => updateNetwork(nw.id, "name", e.target.value)}
                      className="h-10 border-[1.5px] border-[#141413]/20 bg-white font-bold text-xs rounded-full shadow-sm focus-visible:ring-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <TechnicalLabel text="ZONE ID" className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest pl-1" />
                    <Input 
                      value={nw.zoneId}
                      onChange={(e) => updateNetwork(nw.id, "zoneId", e.target.value)}
                      className="h-10 border-[1.5px] border-[#141413]/20 bg-white font-mono text-xs rounded-full shadow-sm focus-visible:ring-primary font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <TechnicalLabel text="FORMAT" className="text-[#141413]/50 font-black text-[9px] uppercase tracking-widest pl-1" />
                    <select 
                      value={nw.type}
                      onChange={(e) => updateNetwork(nw.id, "type", e.target.value)}
                      className="w-full h-10 border-[1.5px] border-[#141413]/20 bg-white font-bold text-xs rounded-full px-4 shadow-sm outline-none focus:ring-1 focus:ring-primary text-[#141413] cursor-pointer"
                    >
                      <option value="video">VIDEO_AD</option>
                      <option value="banner">BANNER_AD</option>
                      <option value="native">NATIVE_AD</option>
                      <option value="pop">POP_UNDER</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => updateNetwork(nw.id, "isActive", !nw.isActive)}
                      className={cn(
                        "flex-1 h-10 rounded-full border-[1.5px] font-black text-[9px] tracking-widest uppercase transition-all shadow-sm",
                        nw.isActive ? "bg-primary border-primary text-white hover:bg-primary/90 hover:text-white" : "bg-white border-[#141413]/20 text-zinc-500 hover:bg-zinc-100"
                      )}
                    >
                      {nw.isActive ? "ACTIVE" : "OFFLINE"}
                    </Button>
                    <Button 
                      variant="outline"
                      size="icon"
                      onClick={() => removeNetwork(nw.id)}
                      className="h-10 w-10 shrink-0 bg-white border-[1.5px] border-[#141413]/20 text-red-500 hover:bg-red-50 hover:border-red-500 rounded-full transition-all shadow-sm"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TechnicalLabel({ text, className }: any) {
  return (
    <div className={cn("font-black tracking-widest uppercase leading-none", className)}>
      {text}
    </div>
  );
}
