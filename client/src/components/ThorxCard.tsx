/**
 * ThorxCard — THORX v3 (spec F.3)
 * Replaces ScratchCardModal. Renders when an earn event returns a thorxCard payload.
 * NEVER uses "Vault", "Locked", or "held" language.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ThorxCardPayload {
  pointsCredited: number;
  realPkrValue: number;
  engineType: string; // 'Engine_A' | 'Engine_B' | 'Engine_C'
}

interface ThorxCardProps {
  payload: ThorxCardPayload | null;
  onClaim: () => void;
}

const ENGINE_COLORS: Record<string, string> = {
  Engine_A: "#f97316",
  Engine_B: "#7c3aed",
  Engine_C: "#16a34a",
  Indirect:  "#6b7280",
};

const ENGINE_LABELS: Record<string, string> = {
  Engine_A: "Engine A — Video",
  Engine_B: "Engine B — CPA Offer",
  Engine_C: "Engine C — Guild Task",
  Indirect:  "Indirect Task",
};

export function ThorxCard({ payload, onClaim }: ThorxCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [claimed, setClaimed] = useState(false);

  if (!payload) return null;

  const accentColor = ENGINE_COLORS[payload.engineType] ?? "#f97316";
  const engineLabel = ENGINE_LABELS[payload.engineType] ?? payload.engineType;

  const handleReveal = () => setRevealed(true);
  const handleClaim = () => {
    setClaimed(true);
    setTimeout(onClaim, 300);
  };

  return (
    <AnimatePresence>
      {!claimed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.85, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 40 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden border-2 border-black"
            style={{ perspective: 600, boxShadow: "8px 8px 0px 0px rgba(0,0,0,1)" }}
          >
            {/* Card face-down state */}
            <AnimatePresence mode="wait">
              {!revealed ? (
                <motion.div
                  key="back"
                  initial={{ rotateY: 0 }}
                  exit={{ rotateY: 90, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-black p-8 text-center"
                >
                  <div className="mb-6 flex justify-center">
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black tracking-tight"
                      style={{ backgroundColor: accentColor + "1a", color: accentColor }}
                    >
                      THORX
                    </div>
                  </div>
                  <p className="text-white/50 text-sm mb-6">You earned a reward card!</p>
                  <Button
                    onClick={handleReveal}
                    className="w-full font-bold text-black rounded-lg"
                    style={{ backgroundColor: accentColor }}
                  >
                    Reveal Card
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="front"
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white p-8 text-center"
                >
                  {/* Engine badge */}
                  <span
                    className="inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm mb-5"
                    style={{ backgroundColor: accentColor + "15", color: accentColor }}
                  >
                    {engineLabel}
                  </span>

                  {/* Animated count */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="text-6xl font-black mb-2"
                    style={{ color: accentColor }}
                  >
                    {payload.pointsCredited.toLocaleString()}
                  </motion.div>
                  <div className="text-black/50 text-sm font-medium mb-6 uppercase tracking-wide">TX-Points Earned</div>

                  <Button
                    onClick={handleClaim}
                    className="w-full font-bold text-white rounded-lg"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Zap size={16} className="mr-2" />
                    Claim Points
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ThorxCard;
