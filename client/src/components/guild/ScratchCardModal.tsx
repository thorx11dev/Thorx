/**
 * ScratchCardModal — THORX v3 SHIM
 * Kept for backward import compatibility.
 * New code uses ThorxCard component.
 */
import { ThorxCard, type ThorxCardPayload } from "@/components/ThorxCard";

// Re-export old interface shape as well for legacy callers
export interface ScratchCardBreakdown {
  basePoints: number;
  guildBonusPoints: number;
  totalPoints: number;
  vaultPkr: string;
  walletPkr: string;
  guildId: string | null;
}

interface ScratchCardModalProps {
  open: boolean;
  breakdown: ScratchCardBreakdown | null;
  onClose: () => void;
}

/**
 * Bridges old ScratchCardBreakdown shape → ThorxCardPayload.
 * Currently only reached from Engine A's ad-completion flow, so the reward
 * card is always labeled as Engine A (was previously hardcoded to
 * "Engine_C", mislabeling every Engine A reward as a Guild Task).
 */
export function ScratchCardModal({ open, breakdown, onClose }: ScratchCardModalProps) {
  if (!open || !breakdown) return null;

  const payload: ThorxCardPayload = {
    pointsCredited: breakdown.totalPoints,
    realPkrValue: parseFloat(breakdown.walletPkr || "0"),
    engineType: "Engine_A",
  };

  return <ThorxCard payload={payload} onClaim={onClose} />;
}

export default ScratchCardModal;
