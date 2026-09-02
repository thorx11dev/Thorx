import { useState } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useLocation } from "wouter";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { motion } from "framer-motion";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { Eye, EyeOff, Loader2, ShieldCheck, XCircle } from "lucide-react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { apiRequest } from "@/lib/queryClient";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useToast } from "@/hooks/use-toast";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import Barcode from "@/components/ui/barcode";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import AuthNav from "@/components/auth/AuthNav";
import ThorxSpinner from "@/components/ui/thorx-spinner";

interface InviteAcceptCardProps {
  token: string;
}

interface InvitePreview {
  email: string;
  role: string;
}

/**
 * Completes the team-invitation loop on the client. A founder/admin issues an
 * invite from Team Keys (server generates /auth?invite=TOKEN); this card is
 * what the invitee actually sees when they open that link — verify the token,
 * collect a name + password, and activate the account via
 * POST /api/team/invitations/accept. Rendered by auth.tsx instead of the
 * normal login/register tabs whenever a ?invite= token is present in the URL.
 */
export function InviteAcceptCard({ token }: InviteAcceptCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: invite, isLoading, isError, error } = useQuery<InvitePreview>({
    queryKey: ["/api/team/invitations/verify", token],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/team/invitations/verify/${token}`);
      return res.json();
    },
    retry: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Missing Information", description: "First and last name are required.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords Don't Match", description: "Please re-enter matching passwords.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/team/invitations/accept", {
        token,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      const result = await res.json();

      queryClient.setQueryData(["session-auth"], result.user);
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      toast({ title: "Access Activated", description: "Welcome to the team." });
      setLocation("/team-portal");
    } catch (err: any) {
      toast({ title: "Activation Failed", description: err?.message || "Could not activate this invitation.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="auth-page overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >

      <AuthNav />

      <section className="cinematic-section active min-h-screen pb-8 overflow-y-auto overscroll-behavior-contain">
        <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
          <div className="text-center mb-4 md:mb-6">
            <Barcode variant="bold" className="w-32 md:w-48 h-8 md:h-10 mx-auto" />
          </div>

          <motion.div
            className="w-full max-w-3xl mx-auto mb-8 px-2 md:px-0"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 14, stiffness: 120, mass: 1, delay: 0.1 }}
          >
            <div className="split-card bg-white border-2 md:border-[3px] border-black/15 rounded-2xl p-3 md:p-6 lg:p-10 overflow-visible w-full">
              <div className="max-w-[480px] mx-auto w-full space-y-6 md:space-y-8">
                {isLoading && (
                  <div className="text-center space-y-4 py-12">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-black/40" />
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Verifying invitation…</p>
                  </div>
                )}

                {!isLoading && isError && (
                  <div className="text-center space-y-4 py-8">
                    <div className="w-16 h-16 mx-auto bg-black rounded-2xl flex items-center justify-center border-2 border-black">
                      <XCircle className="w-7 h-7 text-white" />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">INVITATION INVALID</h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      {(error as any)?.message?.replace(/^\d+:\s*/, "") || "This invitation link is invalid, expired, or has already been used."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setLocation("/auth")}
                      className="text-sm font-bold text-primary hover:text-black transition-colors"
                      data-testid="button-invite-back-to-login"
                    >
                      ← BACK TO SIGN IN
                    </button>
                  </div>
                )}

                {!isLoading && !isError && invite && (
                  <>
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 mx-auto bg-black rounded-2xl flex items-center justify-center border-2 border-black">
                        <ShieldCheck className="w-7 h-7 text-white" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black tracking-tight">ACTIVATE ACCESS</h2>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        You've been invited to join THORX as <span className="font-bold text-black uppercase">{invite.role}</span>.
                        Set up your account for <span className="font-bold text-black">{invite.email}</span> below.
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">First Name</label>
                          <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="w-full border-2 border-black/15 rounded-lg text-base py-3 px-4 outline-none focus:border-primary transition-colors"
                            placeholder="John"
                            autoFocus
                            data-testid="input-invite-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">Last Name</label>
                          <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className="w-full border-2 border-black/15 rounded-lg text-base py-3 px-4 outline-none focus:border-primary transition-colors"
                            placeholder="Doe"
                            data-testid="input-invite-last-name"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border-2 border-black/15 rounded-lg text-base py-3 px-4 pr-12 outline-none focus:border-primary transition-colors"
                            placeholder="At least 6 characters"
                            data-testid="input-invite-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 hover:text-black transition-colors"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">Confirm Password</label>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full border-2 border-black/15 rounded-lg text-base py-3 px-4 outline-none focus:border-primary transition-colors"
                          placeholder="Re-enter password"
                          data-testid="input-invite-confirm-password"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-black text-white font-black text-sm uppercase tracking-widest py-4 border-2 border-black rounded-lg hover:bg-primary hover:border-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        data-testid="button-invite-accept"
                      >
                        {isSubmitting ? (
                          <>
                            <ThorxSpinner size={16} />
                            ACTIVATING…
                          </>
                        ) : (
                          "ACTIVATE ACCOUNT"
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </motion.div>
  );
}
