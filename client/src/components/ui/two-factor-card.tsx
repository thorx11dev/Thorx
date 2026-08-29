import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
    <div className="border border-white/10 rounded-2xl bg-white/[0.03] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn(
              "shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border",
              enabled ? "border-emerald-400/25 bg-emerald-400/10" : "border-white/10 bg-white/5"
            )}
          >
            {enabled ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
            ) : (
              <Shield className="w-4 h-4 text-white/50" strokeWidth={2.5} />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-white leading-none">
              Two-Factor Authentication
            </p>
            <p className="mt-1 text-[10px] font-medium text-white/40 leading-none">
              {isLoading ? "Checking status…" : enabled ? "Your account is protected" : "Extra security for login"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border",
            enabled
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
              : "border-white/15 bg-transparent text-white/40"
          )}
        >
          {isLoading ? "…" : enabled ? "Active" : "Off"}
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
          className="h-11 w-full bg-white text-black hover:bg-white/85 font-black uppercase tracking-[0.15em] rounded-xl text-[11px]"
        >
          {setupMutation.isPending ? "Generating…" : "Enable 2FA"}
        </Button>
      )}

      {/* ── Enrollment: show secret + confirm code ── */}
      {enrolling && secret && (
        <div className="space-y-3">
          <div className="border border-white/10 rounded-xl bg-black/20 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] font-black tracking-[0.25em] text-white/35">STEP 01</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
              Add this key to your authenticator app
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 break-all text-emerald-300">
                {secret}
              </code>
              <button
                onClick={copySecret}
                className="shrink-0 p-2.5 border border-white/15 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Copy secret"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white/60" />}
              </button>
            </div>
            <p className="text-[10px] text-white/35 leading-relaxed">
              Google Authenticator → + → "Enter a setup key" → paste → Account: THORX
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] font-black tracking-[0.25em] text-white/35">STEP 02</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
              Enter the current 6-digit code
            </p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-12 bg-black/30 border-white/15 rounded-xl text-center font-mono text-lg tracking-[0.5em] text-white placeholder:text-white/20 focus-visible:ring-0"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => enableMutation.mutate(code)}
                disabled={code.length !== 6 || enableMutation.isPending}
                className="h-11 flex-1 bg-emerald-500 text-black hover:bg-emerald-400 font-black uppercase tracking-[0.15em] rounded-xl text-[11px]"
              >
                {enableMutation.isPending ? "Verifying…" : "Confirm & Enable"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setEnrolling(false); setSecret(null); setCode(""); }}
                className="h-11 px-4 text-white/40 hover:text-white hover:bg-transparent text-[11px] font-black uppercase tracking-[0.15em] rounded-xl"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Disable flow ── */}
      {enabled && disabling && (
        <div className="space-y-2.5">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            className="h-12 bg-black/30 border-white/15 rounded-xl text-center font-mono text-lg tracking-[0.5em] text-white placeholder:text-white/20 focus-visible:ring-0"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => disableMutation.mutate(code)}
              disabled={code.length !== 6 || disableMutation.isPending}
              className="h-11 flex-1 border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-black uppercase tracking-[0.15em] rounded-xl text-[11px]"
            >
              {disableMutation.isPending ? "Verifying…" : "Confirm Disable"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setDisabling(false); setCode(""); }}
              className="h-11 px-4 text-white/40 hover:text-white hover:bg-transparent text-[11px] font-black uppercase tracking-[0.15em] rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {enabled && !disabling && (
        <Button
          onClick={() => setDisabling(true)}
          className="h-11 w-full border border-white/15 bg-transparent text-white/60 hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 font-black uppercase tracking-[0.15em] rounded-xl text-[11px]"
        >
          Disable 2FA
        </Button>
      )}
    </div>
  );
}
