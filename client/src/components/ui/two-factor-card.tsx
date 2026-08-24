import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TechnicalLabel from "@/components/ui/technical-label";

/**
 * Self-contained 2FA management card (used inside ProfileModal).
 * Talks to /api/security/2fa/* — enrollment is two-step server-side, so a
 * mistyped confirm code can never lock the account.
 */
export default function TwoFactorCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: QUERY_KEYS.twoFactorStatus,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/security/2fa/status");
      return res.json();
    },
  });

  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.twoFactorStatus });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/security/2fa/setup", {});
      return res.json();
    },
    onSuccess: (data: { secret: string }) => {
      setSecret(data.secret);
      setEnrolling(true);
      setCode("");
    },
    onError: (e: any) => toast({ title: "Setup Failed", description: e?.message, variant: "destructive" }),
  });

  const enableMutation = useMutation({
    mutationFn: async (totpCode: string) => {
      const res = await apiRequest("POST", "/api/security/2fa/enable", { code: totpCode });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Enabled 🔐", description: "Your account now requires an authenticator code at login." });
      setEnrolling(false);
      setSecret(null);
      setCode("");
      refreshStatus();
    },
    onError: (e: any) => {
      setCode("");
      toast({ title: "Invalid Code", description: "Check your authenticator and try the next code.", variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (totpCode: string) => {
      const res = await apiRequest("POST", "/api/security/2fa/disable", { code: totpCode });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Disabled", description: "Login no longer requires an authenticator code." });
      setDisabling(false);
      setCode("");
      refreshStatus();
    },
    onError: (e: any) => {
      setCode("");
      toast({ title: "Invalid Code", description: "That code is not valid.", variant: "destructive" });
    },
  });

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the code manually.", variant: "destructive" });
    }
  };

  const enabled = status?.enabled === true;

  return (
    <div className="border border-white/10 rounded-xl bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
          ) : (
            <Shield className="w-4 h-4 text-white/50" strokeWidth={2.5} />
          )}
          <TechnicalLabel text="TWO-FACTOR AUTHENTICATION" />
        </div>
        <span
          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${
            enabled
              ? "border-emerald-400/40 text-emerald-400"
              : "border-white/20 text-white/40"
          }`}
        >
          {isLoading ? "..." : enabled ? "ACTIVE" : "OFF"}
        </span>
      </div>

      <p className="text-[11px] text-white/50 leading-relaxed">
        {enabled
          ? "Login requires your password plus a 6-digit code from your authenticator app."
          : "Add a second layer of protection: login requires a rotating 6-digit code from Google Authenticator or similar."}
      </p>

      {/* ── Idle: OFF ── */}
      {!enabled && !enrolling && (
        <Button
          onClick={() => setupMutation.mutate()}
          disabled={setupMutation.isPending}
          className="h-10 w-full bg-white text-black hover:bg-white/85 font-black uppercase tracking-tighter rounded-lg text-xs"
        >
          {setupMutation.isPending ? "GENERATING..." : "ENABLE 2FA"}
        </Button>
      )}

      {/* ── Enrollment: show secret + confirm code ── */}
      {enrolling && secret && (
        <div className="space-y-3">
          <div className="border border-white/15 rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              Step 1 — Add this key to your authenticator app
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-black/40 border border-white/10 rounded px-2 py-1.5 break-all text-emerald-300">
                {secret}
              </code>
              <button
                onClick={copySecret}
                className="p-2 border border-white/15 rounded hover:bg-white/10 transition-colors"
                aria-label="Copy secret"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white/60" />}
              </button>
            </div>
            <p className="text-[10px] text-white/40">
              Google Authenticator → + → "Enter a setup key" → paste → Account: THORX
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              Step 2 — Enter the current 6-digit code
            </p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-11 bg-black/30 border-white/15 text-center font-mono text-base tracking-[0.4em] text-white placeholder:text-white/20"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => enableMutation.mutate(code)}
                disabled={code.length !== 6 || enableMutation.isPending}
                className="h-10 flex-1 bg-emerald-500 text-black hover:bg-emerald-400 font-black uppercase tracking-tighter rounded-lg text-xs"
              >
                {enableMutation.isPending ? "VERIFYING..." : "CONFIRM & ENABLE"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setEnrolling(false); setSecret(null); setCode(""); }}
                className="h-10 px-4 text-white/40 hover:text-white text-xs font-black uppercase tracking-tighter"
              >
                CANCEL
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Disable flow ── */}
      {enabled && disabling && (
        <div className="space-y-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            className="h-11 bg-black/30 border-white/15 text-center font-mono text-base tracking-[0.4em] text-white placeholder:text-white/20"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => disableMutation.mutate(code)}
              disabled={code.length !== 6 || disableMutation.isPending}
              className="h-10 flex-1 bg-red-500/90 text-white hover:bg-red-500 font-black uppercase tracking-tighter rounded-lg text-xs"
            >
              {disableMutation.isPending ? "VERIFYING..." : "CONFIRM DISABLE"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setDisabling(false); setCode(""); }}
              className="h-10 px-4 text-white/40 hover:text-white text-xs font-black uppercase tracking-tighter"
            >
              CANCEL
            </Button>
          </div>
        </div>
      )}

      {enabled && !disabling && (
        <Button
          onClick={() => setDisabling(true)}
          className="h-10 w-full border border-white/15 bg-transparent text-white/60 hover:text-white hover:bg-white/5 font-black uppercase tracking-tighter rounded-lg text-xs"
        >
          DISABLE 2FA
        </Button>
      )}
    </div>
  );
}
