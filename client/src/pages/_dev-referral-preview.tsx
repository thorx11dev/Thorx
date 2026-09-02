// TEMPORARY — visual QA harness for the referral tree redesign. Not linked from any nav.
// Deleted after verification; not part of the shipped app.
import { useState } from "react";
import { ReferralTree } from "@/components/ui/referral-tree";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const mockReferrals = [
  { id: "1", firstName: "Sara", lastName: "Khan", email: "a@a.com", userRankTier: "d-rank", level: 1, referredBy: "me", earningsFromUser: "1240.50" },
  { id: "2", firstName: "Ali", lastName: "Raza", email: "b@a.com", userRankTier: "c-rank", level: 1, referredBy: "me", earningsFromUser: "860.00" },
  { id: "3", firstName: "Meera", lastName: "Shah", email: "c@a.com", userRankTier: "e-rank", level: 1, referredBy: "me", earningsFromUser: "0.00" },
  { id: "4", firstName: "Bilal", lastName: "Ahmed", email: "d@a.com", userRankTier: "e-rank", level: 1, referredBy: "me", earningsFromUser: "320.00" },
  { id: "5", firstName: "Zara", lastName: "Iqbal", email: "e@a.com", userRankTier: "e-rank", level: 1, referredBy: "me", earningsFromUser: "0.00" },
  { id: "6", firstName: "Omar", lastName: "Farooq", email: "f@a.com", userRankTier: "e-rank", level: 1, referredBy: "me", earningsFromUser: "1520.00" },
];

function Panel({ referrals, zoomState }: { referrals: any[]; zoomState: [number, (n: number | ((p: number) => number)) => void] }) {
  const [zoom, setZoom] = zoomState;
  return (
    <div className="bg-white border border-black/15 rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(20, 20, 19,0.06)] relative">
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 rounded-xl border-2 border-black bg-white p-1 shadow-[0_6px_20px_rgba(20, 20, 19,0.14)] md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-black hover:bg-black hover:text-white" onClick={() => setZoom((p) => Math.max(p - 0.1, 0.3))}>
          <Minus size={15} />
        </Button>
        <span className="min-w-[2.75rem] text-center text-[10px] font-black tabular-nums text-black/60">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-black hover:bg-black hover:text-white" onClick={() => setZoom((p) => Math.min(p + 0.1, 2))}>
          <Plus size={15} />
        </Button>
      </div>

      <div className={cn("w-full overflow-auto scrollbar-hide p-4 cursor-grab active:cursor-grabbing md:p-8", referrals.length === 0 ? "min-h-[360px] md:min-h-[400px]" : "min-h-[460px] md:min-h-[520px]")}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} className="w-full min-w-max">
          <ReferralTree
            currentUser={{ id: "me", firstName: "Adeline", lastName: "Luna", userRankTier: "e-rank" }}
            referrals={referrals}
          />
        </div>
      </div>
    </div>
  );
}

export default function DevReferralPreview() {
  const zoom = useState(1);
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state") || "desktop-populated";
  const isMobile = state.startsWith("mobile");
  const referrals = state.endsWith("empty") ? [] : mockReferrals;

  return (
    <div className="min-h-screen bg-[#E8E5D8] p-4 md:p-10">
      {isMobile ? (
        <div className="w-[390px]">
          <div className="text-xs font-black uppercase tracking-widest text-black/40 mb-3">{state}</div>
          <div className="w-[390px] border-4 border-black/70 rounded-[2rem] overflow-hidden">
            <Panel referrals={referrals} zoomState={zoom as any} />
          </div>
        </div>
      ) : (
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-black/40 mb-3">{state}</div>
          <Panel referrals={referrals} zoomState={zoom as any} />
        </div>
      )}
    </div>
  );
}
