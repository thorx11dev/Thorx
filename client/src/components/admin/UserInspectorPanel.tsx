// ADMIN_PKR_DISPLAY: intentional — inspector panel displays PKR balances for
// team/founder accounting. Excluded from Points-Only Mandate (user-facing only).
import React from "react";
import Decimal from "decimal.js";
import { X, User, Mail, Phone, ExternalLink, Trophy, Users, Wallet, TrendingUp, ShieldCheck, Activity } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl } from "@/lib/rankAvatars";

function trustStatusStyle(status?: string | null) {
  switch (status) {
    case "Special": return "bg-purple-50 text-purple-600";
    case "Trusted": return "bg-green-50 text-green-600";
    case "Dangerous": return "bg-red-50 text-red-600";
    case "Normal": return "bg-blue-50 text-blue-600";
    default: return "bg-zinc-100 text-zinc-400";
  }
}

interface UserInspectorProps {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
  onViewInCRM?: (email: string) => void;
}

export function UserInspectorPanel({ user, isOpen, onClose, onViewInCRM }: UserInspectorProps) {
  if (!user) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg border border-zinc-200 bg-white rounded-2xl shadow-xl [&>button]:hidden">
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <p className="text-sm font-semibold text-zinc-500">Select a user to inspect</p>
            <p className="text-xs mt-1 text-zinc-400">Click any row in the user list</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleViewCRM = () => {
    onClose();
    if (onViewInCRM) {
      onViewInCRM(user.email);
    }
  };

  // profilePicture (custom upload) takes priority; resolveAvatarUrl handles all rank IDs
  const avatarSrc = user.profilePicture || resolveAvatarUrl(user.avatar, user.rank);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 border border-zinc-200 bg-white rounded-2xl overflow-hidden shadow-xl gap-0 [&>button]:hidden">
        
        {/* Header */}
        <DialogHeader className="p-0">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Profile Picture */}
              <div className="w-14 h-14 border border-zinc-200 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                {avatarSrc ? (
                  <img 
                    src={avatarSrc} 
                    alt={`${user.firstName} ${user.lastName}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                      const fallback = img.parentElement?.querySelector(".avatar-fallback");
                      if (fallback) (fallback as HTMLElement).style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className={cn("avatar-fallback w-full h-full items-center justify-center", avatarSrc ? "hidden" : "flex")}
                >
                  <User className="w-7 h-7 text-zinc-300" />
                </div>
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-zinc-900 mb-0.5">
                  {user.firstName} {user.lastName}
                </DialogTitle>
                <div className="text-xs text-zinc-400">
                  {user.email}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 rounded-full font-semibold text-[9px] tracking-wide uppercase text-zinc-600">
                    <Trophy size={9} />
                    {user.userRankTier || user.rank || "E-Rank"}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[9px] tracking-wide uppercase",
                    trustStatusStyle(user.trustStatus)
                  )}>
                    <ShieldCheck size={9} />
                    {user.trustStatus || "(N/A)"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-zinc-100 shrink-0"
              onClick={onClose}
            >
              <X size={16} />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">

          {/* Earnings vs Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <TrendingUp size={12} />
                <span className="text-[10px] font-medium uppercase tracking-wide">Total Earned</span>
              </div>
              <div className="text-lg font-semibold tabular-nums text-zinc-900">
                PKR {new Decimal(user.totalEarnings || "0").toFixed(2)}
              </div>
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-primary/60">
                <Wallet size={12} />
                <span className="text-[10px] font-medium uppercase tracking-wide">Available</span>
              </div>
              <div className="text-lg font-semibold tabular-nums text-primary">
                PKR {new Decimal(user.availableBalance || "0").toFixed(2)}
              </div>
            </div>
          </div>

          {/* Referral Count */}
          <div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2.5">
              Referrals
            </div>
            <div className="flex items-center justify-between p-3.5 bg-white border border-zinc-100 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users size={13} />
                </div>
                <span className="text-xs font-medium text-zinc-500">Direct Referrals</span>
              </div>
              <span className="text-base font-semibold tabular-nums text-zinc-900">{user.level1Count || user.referralCount || 0}</span>
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2.5">
              Contact Info
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                <Mail size={13} className="text-zinc-400 shrink-0" />
                <span className="text-sm font-medium text-zinc-700 truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                <Phone size={13} className="text-zinc-400 shrink-0" />
                <span className="text-sm font-medium text-zinc-700">{user.phone || "(N/A)"}</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                <Activity size={13} className="text-zinc-400 shrink-0" />
                <span className="text-sm font-medium text-zinc-700">
                  Score: {parseFloat(user.performanceScore || "0").toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <Button
            onClick={handleViewCRM}
            className="w-full h-11 bg-zinc-900 text-white hover:bg-black rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          >
            <ExternalLink size={14} />
            View Full Profile in CRM
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
