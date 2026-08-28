import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  name: string;
  icon: React.ElementType;
}

interface PortalMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  sections: NavItem[];
  currentSection: number;
  onSectionChange: (index: number) => void;
  onProfile: () => void;
  onLogout: () => void;
}

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

/**
 * PortalMenuDrawer — full-screen mobile navigation for the user portal.
 * Premium black surface mirroring the portal section heroes: font-black
 * uppercase entries, mono technical numbering, hairline white/10 dividers,
 * primary-orange active state and a soft orange glow accent.
 * Sits above the portal nav (z-50) at the dropdown token layer (200).
 */
export function PortalMenuDrawer({
  open,
  onClose,
  sections,
  currentSection,
  onSectionChange,
  onProfile,
  onLogout,
}: PortalMenuDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Lets unrelated floating widgets (e.g. the feedback dock) hide
    // themselves while the menu owns the screen.
    document.body.classList.add("drawer-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("drawer-open");
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.45, ease: PANEL_EASE }}
          className="fixed inset-0 z-[200] bg-black text-white flex flex-col md:hidden pt-[env(safe-area-inset-top)] will-change-transform"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          data-testid="portal-menu-drawer"
        >
          {/* Soft orange glow accent — matches the section-hero blur blobs */}
          <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />

          {/* Drawer header — same rhythm as the portal nav bar */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ delay: 0.1, duration: 0.35, ease: PANEL_EASE }}
            className="relative flex items-center justify-between px-5 h-20 border-b-2 border-white shrink-0"
          >
            <span className="text-2xl font-black tracking-tighter text-white leading-none">THORX.</span>
            {/* X rotates into the exact spot the Menu icon occupies in the
                nav bar, so the icon swap reads as one continuous motion. */}
            <motion.button
              initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ delay: 0.2, type: "spring", stiffness: 320, damping: 24 }}
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
              aria-label="Close menu"
              data-testid="button-close-menu"
              className="w-11 h-11 rounded-lg border-2 border-white bg-black text-white flex items-center justify-center transition-colors duration-300 hover:bg-white hover:text-black"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </motion.button>
          </motion.div>

          {/* Section entries */}
          <nav className="relative flex-1 overflow-y-auto px-5 py-4" aria-label="Portal sections">
            {sections.map((section, index) => {
              const Icon = section.icon;
              const isActive = currentSection === index;
              return (
                <motion.button
                  key={section.id}
                  custom={index}
                  variants={rowVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onSectionChange(index);
                    onClose();
                  }}
                  data-testid={`menu-item-${section.id}`}
                  className={cn(
                    "w-full flex items-center gap-4 py-4 border-b border-white/10 text-left",
                    index === 0 && "pt-5",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-xl p-2.5 transition-colors duration-300",
                      isActive ? "bg-white text-black" : "bg-white/10 text-white"
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </span>
                  <span
                    className={cn(
                      "flex-1 text-xl font-black uppercase tracking-tight transition-colors duration-300",
                      isActive ? "text-white" : "text-white/80"
                    )}
                  >
                    {section.name}
                  </span>
                  {isActive && <span className="shrink-0 w-2 h-2 rounded-full bg-white" />}
                </motion.button>
              );
            })}
          </nav>

          {/* Account actions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ delay: 0.2 + sections.length * 0.04, duration: 0.35, ease: PANEL_EASE }}
            className="relative shrink-0 px-5 pt-4 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] border-t-2 border-white bg-black"
          >
            <motion.button
              custom={sections.length}
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onProfile();
                onClose();
              }}
              data-testid="menu-item-settings"
              className="w-full flex items-center gap-4 py-3 text-left group"
            >
              <span className="shrink-0 rounded-xl bg-white/10 p-2.5 text-white transition-colors duration-300 group-hover:bg-white group-hover:text-black">
                <Settings className="w-5 h-5" strokeWidth={2} />
              </span>
              <span className="text-lg font-black uppercase tracking-tight text-white">Settings</span>
            </motion.button>
            <motion.button
              custom={sections.length + 1}
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onLogout();
                onClose();
              }}
              data-testid="menu-item-logout"
              className="w-full flex items-center gap-4 py-3 text-left group"
            >
              <span className="shrink-0 rounded-xl bg-white/5 p-2.5 text-white/60 transition-colors duration-300 group-hover:bg-rose-500/15 group-hover:text-rose-400">
                <LogOut className="w-5 h-5" strokeWidth={2} />
              </span>
              <span className="text-base font-bold uppercase tracking-[0.15em] text-white/60 transition-colors duration-300 group-hover:text-rose-400">
                Log Out
              </span>
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PortalMenuDrawer;
