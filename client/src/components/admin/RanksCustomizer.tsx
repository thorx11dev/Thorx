/**
 * RanksCustomizer — THORX v3 (spec F.16)
 * Admin tool to configure PS rank thresholds, engine splits, Thorx Card
 * variance, and PS awards. PATCH /api/admin/config/:key for each setting.
 * Uses E-Rank, D-Rank, C-Rank, B-Rank, A-Rank, S-Rank labels — never old Urdu names.
 *
 * Ranks & Engine Config audit (2026-07-29): every config key in this file was
 * previously invented rather than matching what the engines actually read —
 * saves succeeded with a "Saved" toast but silently changed nothing. All keys
 * below now match the single source of truth in server/storage.ts
 * (SYSTEM_CONFIG_DEFAULTS) and are verified against server/modules/ps-engine.ts
 * and server/modules/thorx-card.ts. See replit.md / audit notes for the
 * before/after key mapping.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RankBadge } from "@/components/RankBadge";
import { Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const RANKS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

// Read by server/modules/ps-engine.ts computeRankTier(). E-Rank has no
// threshold — it is the hard floor (invariant #7 of the v3 spec): PS can
// never drop a user below it, so there is nothing to configure for it.
const PS_THRESHOLD_DEFAULTS: Record<string, number> = {
  "PS_RANK_D_MIN": 1000,
  "PS_RANK_C_MIN": 3000,
  "PS_RANK_B_MIN": 6000,
  "PS_RANK_A_MIN": 10000,
  "PS_RANK_S_MIN": 20000,
};

// Read by server/storage.ts recordEarnEvent(). All values are 0-100 percentages
// of the GROSS PKR that go to Thorx's profit cut (not the user's share) — the
// user share is derived as 100 - cut. Engine C additionally locks a % into the
// weekly guild pool and a % into a bonus pool; it never pays the user directly
// (100% of the user's immediate cut is 0 — the pool payout happens Sunday).
// v4: Engine A/B use the unified TASK_SPLIT_* keys — the per-engine cut keys
// were removed from the earn engine, so only Engine C's guild keys remain here.
const ENGINE_SPLIT_DEFAULTS: Record<string, number> = {
  "ENGINE_C_THORX_CUT_PCT": 15,
  "ENGINE_C_GUILD_POOL_PCT": 80,
  "ENGINE_C_BONUS_PCT": 5,
};

// v4: the Thorx Card illusion (variance bands, rank bonuses) is REMOVED.
// Points are a fixed conversion — see TX_POINTS_PER_PKR in System Settings.

// Read by server/modules/ps-engine.ts awardTaskPS() / processStreak() /
// applyInactivityPenalties().
const PS_AWARD_DEFAULTS: Record<string, number> = {
  "PS_ENGINE_A_REWARD": 5,
  "PS_ENGINE_B_REWARD": 25,
  "PS_ENGINE_C_REWARD": 15,
  "PS_STREAK_DAY1": 5,
  "PS_STREAK_DAY2": 10,
  "PS_STREAK_DAY3_PLUS": 20,
  "PS_INACTIVITY_PENALTY": 10,
  "PS_INACTIVITY_HOURS": 48,
};

const LABELS: Record<string, string> = {
  "PS_RANK_D_MIN": "D-Rank", "PS_RANK_C_MIN": "C-Rank", "PS_RANK_B_MIN": "B-Rank",
  "PS_RANK_A_MIN": "A-Rank", "PS_RANK_S_MIN": "S-Rank",
  "ENGINE_A_THORX_CUT_PCT": "Engine A — Thorx cut",
  "ENGINE_B_THORX_CUT_PCT": "Engine B — Thorx cut",
  "ENGINE_C_THORX_CUT_PCT": "Engine C — Thorx cut",
  "ENGINE_C_GUILD_POOL_PCT": "Engine C — Guild pool",
  "ENGINE_C_BONUS_PCT": "Engine C — Bonus pool",
  "ENGINE_A_ILLUSION_VARIANCE_PCT": "Engine A variance",
  "ENGINE_B_ILLUSION_VARIANCE_PCT": "Engine B variance",
  "ENGINE_C_ILLUSION_VARIANCE_PCT": "Engine C variance",
  "A_RANK_CARD_BONUS_PCT": "A-Rank bonus",
  "S_RANK_CARD_BONUS_PCT": "S-Rank bonus",
  "PS_ENGINE_A_REWARD": "Engine A task",
  "PS_ENGINE_B_REWARD": "Engine B task",
  "PS_ENGINE_C_REWARD": "Engine C / guild task",
  "PS_STREAK_DAY1": "Streak — day 1",
  "PS_STREAK_DAY2": "Streak — day 2",
  "PS_STREAK_DAY3_PLUS": "Streak — day 3+",
  "PS_INACTIVITY_PENALTY": "Inactivity penalty",
  "PS_INACTIVITY_HOURS": "Inactivity threshold",
};

const DESCRIPTIONS: Record<string, string> = {
  "ENGINE_A_THORX_CUT_PCT": "% of gross PKR kept by Thorx; user keeps the rest",
  "ENGINE_B_THORX_CUT_PCT": "% of gross PKR kept by Thorx; user keeps the rest",
  "ENGINE_C_THORX_CUT_PCT": "% of gross PKR kept by Thorx immediately",
  "ENGINE_C_GUILD_POOL_PCT": "% locked into the guild's weekly pool (paid out Sunday)",
  "ENGINE_C_BONUS_PCT": "% added to the pool only if the guild hits its weekly target",
  "ENGINE_A_ILLUSION_VARIANCE_PCT": "e.g. 10 = card shows ±10% of target points",
  "ENGINE_B_ILLUSION_VARIANCE_PCT": "e.g. 10 = card shows ±10% of target points",
  "ENGINE_C_ILLUSION_VARIANCE_PCT": "e.g. 10 = card shows ±10% of target points",
  "A_RANK_CARD_BONUS_PCT": "Widens A-Rank users' card variance band by ±N%",
  "S_RANK_CARD_BONUS_PCT": "Widens S-Rank users' card variance band by ±N%",
  "PS_INACTIVITY_PENALTY": "PS deducted per day once a user is inactive",
  "PS_INACTIVITY_HOURS": "Hours of inactivity before the penalty starts applying",
};

type Section = "thresholds" | "splits" | "variance" | "ps_awards";

function useAdminConfigs() {
  return useQuery<Record<string, any>>({
    queryKey: ["/api/admin/config"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/config");
      const d = await r.json();
      const configs: Record<string, any> = {};
      (d.configs ?? []).forEach((c: any) => { configs[c.key] = c.value; });
      return configs;
    },
  });
}

function ConfigRow({
  label, configKey, defaultVal, description, suffix = "",
  dbConfigs, onChange, onSave, saving,
}: {
  label: string; configKey: string; defaultVal: number; description?: string; suffix?: string;
  dbConfigs: Record<string, any>; onChange: (k: string, v: string) => void; onSave: (k: string) => void; saving: string | null;
}) {
  const storedRaw = dbConfigs[configKey];
  const displayVal = storedRaw !== undefined
    ? (typeof storedRaw === "object" ? storedRaw.value : storedRaw) : defaultVal;

  const [local, setLocal] = useState(String(displayVal));

  useEffect(() => {
    setLocal(String(displayVal));
  }, [displayVal]);

  const isDirty = parseFloat(local) !== parseFloat(String(displayVal));

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-800">{label}</div>
        {description && <div className="text-[11px] text-zinc-400 mt-0.5">{description}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input
          type="number"
          value={local}
          onChange={e => { setLocal(e.target.value); onChange(configKey, e.target.value); }}
          className="h-7 w-24 text-sm text-right"
        />
        {suffix && <span className="text-xs text-zinc-400">{suffix}</span>}
        <Button
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!isDirty || saving === configKey}
          onClick={() => onSave(configKey)}
        >
          <Save size={12} />
        </Button>
      </div>
    </div>
  );
}

export function RanksCustomizer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>("thresholds");
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data: dbConfigs = {}, refetch } = useAdminConfigs();

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const r = await apiRequest("PATCH", `/api/admin/config/${key}`, { value });
      return r.json();
    },
    onSuccess: (data, { key }) => {
      setSaving(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config"] });
      if (data?.isKnownKey === false) {
        // Should never happen for keys defined in this file — surfaced defensively
        // in case a key here ever drifts from the backend's known-keys list again.
        toast({ title: "Saved, but unrecognized", description: `${key} isn't read by any engine — check server/storage.ts SYSTEM_CONFIG_DEFAULTS.`, variant: "destructive" });
      } else {
        toast({ title: "Saved", description: `${key} updated.` });
      }
    },
    onError: (_, { key }) => {
      setSaving(null);
      toast({ title: "Save failed", variant: "destructive" });
    },
  });

  const handleChange = (key: string, val: string) => {
    setLocalEdits(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = (key: string) => {
    const raw = localEdits[key];
    if (raw === undefined) return;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) { toast({ title: "Invalid value", variant: "destructive" }); return; }
    setSaving(key);
    saveMutation.mutate({ key, value: parsed });
  };

  const commonProps = { dbConfigs, onChange: handleChange, onSave: handleSave, saving };

  const SECTIONS: { id: Section; label: string }[] = [
    { id: "thresholds", label: "PS Thresholds" },
    { id: "splits",     label: "Engine Splits" },
    { id: "variance",   label: "Card Variance" },
    { id: "ps_awards",  label: "PS Awards" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">Ranks & Engine Config</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Fine-tune PS thresholds, engine splits, and TX-Point card variance.</p>
        </div>
        <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => refetch()} title="Refresh">
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* Rank Tier overview */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-bold mb-3">Rank Tier System</div>
        <div className="flex flex-wrap gap-2">
          {RANKS.map((r) => {
            const letter = r.split("-")[0];
            const psKey = `PS_RANK_${letter}_MIN`;
            const isFloor = letter === "E";
            const threshold = isFloor ? 0 : (dbConfigs[psKey]?.value ?? dbConfigs[psKey] ?? PS_THRESHOLD_DEFAULTS[psKey] ?? 0);
            return (
              <div key={r} className="rounded-lg border border-zinc-200 px-3 py-2 text-center min-w-[80px]">
                <RankBadge rank={r} size="sm" className="mb-1" />
                <div className="text-xs text-zinc-500">{isFloor ? "Floor (0" : Number(threshold).toLocaleString()}{isFloor ? ")" : "+ PS"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section selector */}
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={cn("flex-shrink-0 text-xs font-semibold py-1.5 px-3 rounded-md transition-all",
              activeSection === s.id ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        {activeSection === "thresholds" && (
          <div>
            <div className="text-xs text-zinc-500 mb-3">Minimum PS required to reach each rank tier. Server-enforced by ps-engine.ts. E-Rank is a fixed floor (no PS minimum — can never be demoted below it).</div>
            {Object.entries(PS_THRESHOLD_DEFAULTS).map(([key, def]) => (
              <ConfigRow key={key} label={LABELS[key]} configKey={key}
                defaultVal={def} suffix="PS" description={`Min PS for ${LABELS[key]} tier`} {...commonProps} />
            ))}
          </div>
        )}

        {activeSection === "splits" && (
          <div>
            <div className="text-xs text-zinc-500 mb-3">Engine profit-cut percentages (0–100), applied to gross PKR. Engine A/B: Thorx keeps this %, user keeps the rest. Engine C: split three ways, no immediate user payout — Thorx cut + guild pool + bonus pool should sum to 100.</div>
            {Object.entries(ENGINE_SPLIT_DEFAULTS).map(([key, def]) => (
              <ConfigRow key={key} label={LABELS[key]} configKey={key}
                defaultVal={def} suffix="%" description={DESCRIPTIONS[key]} {...commonProps} />
            ))}
          </div>
        )}

        {activeSection === "variance" && (
          <div>
            <div className="text-xs text-zinc-500 mb-3">TX-Point card variance per engine, plus rank bonuses that widen the band further. Range: [1−v, 1+v] × target points, where v = variance% ÷ 100 (± rank bonus for A/S-Rank).</div>
            {Object.entries(VARIANCE_DEFAULTS).map(([key, def]) => (
              <ConfigRow key={key} label={LABELS[key]} configKey={key}
                defaultVal={def} suffix="%" description={DESCRIPTIONS[key]} {...commonProps} />
            ))}
          </div>
        )}

        {activeSection === "ps_awards" && (
          <div>
            <div className="text-xs text-zinc-500 mb-3">PS points awarded per event type, and the inactivity penalty that can lower it (never below the E-Rank floor of 0).</div>
            {Object.entries(PS_AWARD_DEFAULTS).map(([key, def]) => (
              <ConfigRow key={key} label={LABELS[key]} configKey={key}
                defaultVal={def} suffix={key === "PS_INACTIVITY_HOURS" ? "hrs" : "PS"} description={DESCRIPTIONS[key]} {...commonProps} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RanksCustomizer;
