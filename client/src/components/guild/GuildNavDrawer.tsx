import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Signature portal easing — no spring overshoot, so the full-screen
   panel never exposes a gap at the trailing edge mid-transition. */
const PANEL_EASE = [0.16, 1, 0.3, 1] as const;

const rowVariants = {
  initial: { opacity: 0, x: 28 },
  animate: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.14 + index * 0.05, type: "spring" as const, stiffness: 320, damping: 30 },
  }),
  exit: { opacity: 0, x: 20, transition: { duration: 0.12, ease: "easeIn" as const } },
};

interface GuildNavTab {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

/**
 * GuildNavDrawer — full-screen mobile navigation for the guild section.
 * Cream twin of the PortalMenuDrawer: slides in from the LEFT (mirroring
 * the portal menu which opens from the right), staggered spring rows,
 * rotate-in close button, hairline dividers and a soft orange glow accent.
 */
export function GuildNavDrawer({
  open,
  onClose,
  tabs,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  tabs: GuildNavTab[];
  value: string;
  onChange: (id: any) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Floating widgets hide + the portal top navigation is removed while
    // the drawer owns the screen (same system as the guild filter panel).
    document.body.classList.add("drawer-open");
    document.body.classList.add("guild-overlay-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("drawer-open");
      document.body.classList.remove("guild-overlay-open");
    };
  }, [open]);

  // Rendered through a portal so section transforms can never trap the
  // fixed panel (same approach as the notification panel and filters).
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ duration: 0.45, ease: PANEL_EASE }}
          className="fixed inset-0 z-[200] bg-[#E8E5D8] text-black flex flex-col lg:hidden pt-[env(safe-area-inset-top)] will-change-transform"
          role="dialog"
          aria-modal="true"
          aria-label="Guild navigation"
          data-testid="guild-nav-drawer"
        >
          {/* Soft orange glow accent — matches the section-hero blur blobs */}
          <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />

          {/* Drawer header — same rhythm as the portal menu drawer */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ delay: 0.1, duration: 0.35, ease: PANEL_EASE }}
            className="relative flex items-center justify-between px-5 h-20 border-b-2 border-black shrink-0"
          >
            <span className="text-2xl font-black tracking-tighter text-black leading-none">GUILD.</span>
            {/* X rotates into the exact spot the Menu icon occupies in the
                profile strip, so the icon swap reads as one continuous motion. */}
            <motion.button
              initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ delay: 0.2, type: "spring", stiffness: 320, damping: 24 }}
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
              aria-label="Close guild menu"
              data-testid="button-close-guild-menu"
              className="w-11 h-11 rounded-lg border-2 border-black bg-[#E8E5D8] text-black flex items-center justify-center transition-colors duration-300 hover:bg-black hover:text-white"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </motion.button>
          </motion.div>

          {/* Tab entries */}
          <nav className="relative flex-1 overflow-y-auto px-5 py-4" aria-label="Guild tabs">
            {tabs.map((t, index) => {
              const Icon = t.icon;
              const isActive = value === t.id;
              return (
                <motion.button
                  key={t.id}
                  custom={index}
                  variants={rowVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onChange(t.id);
                    onClose();
                  }}
                  data-testid={`guild-menu-item-${t.id}`}
                  className={cn(
                    "w-full flex items-center gap-4 py-4 border-b border-black/10 text-left",
                    index === 0 && "pt-5",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-xl p-2.5 transition-colors duration-300",
                      isActive ? "bg-black text-white" : "bg-black/5 text-black"
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </span>
                  <span
                    className={cn(
                      "flex-1 text-xl font-black uppercase tracking-tight transition-colors duration-300",
                      isActive ? "text-black" : "text-black/70"
                    )}
                  >
                    {t.label}
                  </span>
                  {(t.badge ?? 0) > 0 ? (
                    <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center border-2 border-black">
                      {t.badge! > 9 ? "9+" : t.badge}
                    </span>
                  ) : isActive ? (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-black" />
                  ) : null}
                </motion.button>
              );
            })}
          </nav>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default GuildNavDrawer;
