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

const rowVariants = {
  initial: { opacity: 0, x: 24 },
  animate: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.06 + index * 0.045, type: "spring" as const, stiffness: 300, damping: 28 },
  }),
  exit: { opacity: 0, x: 24, transition: { duration: 0.15 } },
};

/**
 * PortalMenuDrawer — full-screen mobile navigation for the user portal.
 * Mirrors the landing page's visual language: white surface, hairline
 * dividers, black/mono technical numbering, font-black uppercase entries,
 * primary-orange active state, spring-staggered rows.
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
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-0 z-[200] bg-white flex flex-col md:hidden pt-[env(safe-area-inset-top)]"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          data-testid="portal-menu-drawer"
        >
          {/* Drawer header — mirrors the portal nav bar */}
          <div className="flex items-center justify-between px-5 h-20 border-b-2 border-black shrink-0">
            <span className="text-2xl font-black tracking-tighter text-black leading-none">THORX.</span>
            <button
              onClick={onClose}
              aria-label="Close menu"
              data-testid="button-close-menu"
              className="w-11 h-11 rounded-lg border-2 border-black bg-white text-black flex items-center justify-center transition-all duration-300 hover:bg-black hover:text-white active:scale-95"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>

          {/* Section entries */}
          <nav className="flex-1 overflow-y-auto px-5 py-4" aria-label="Portal sections">
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
                  onClick={() => {
                    onSectionChange(index);
                    onClose();
                  }}
                  data-testid={`menu-item-${section.id}`}
                  className={cn(
                    "w-full flex items-center gap-4 py-4 border-b border-black/10 text-left group",
                    index === 0 && "pt-5",
                  )}
                >
                  <span
                    className={cn(
                      "w-7 shrink-0 font-mono text-[10px] font-black tracking-[0.25em]",
                      isActive ? "text-primary" : "text-black/30"
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-xl p-2.5 transition-colors duration-300",
                      isActive
                        ? "bg-primary text-white"
                        : "bg-black/5 text-black group-hover:bg-black group-hover:text-white"
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </span>
                  <span
                    className={cn(
                      "flex-1 text-xl font-black uppercase tracking-tight transition-colors duration-300",
                      isActive ? "text-primary" : "text-black group-hover:text-black/70"
                    )}
                  >
                    {section.name}
                  </span>
                  {isActive && <span className="shrink-0 w-2 h-2 rounded-full bg-primary pulse-glow" />}
                </motion.button>
              );
            })}
          </nav>

          {/* Account actions */}
          <div className="shrink-0 px-5 pt-4 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] border-t-2 border-black bg-white">
            <motion.button
              custom={sections.length}
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => {
                onProfile();
                onClose();
              }}
              className="w-full flex items-center gap-4 py-3 text-left group"
            >
              <span className="shrink-0 rounded-xl bg-black/5 p-2.5 text-black transition-colors duration-300 group-hover:bg-black group-hover:text-white">
                <Settings className="w-5 h-5" strokeWidth={2} />
              </span>
              <span className="text-lg font-black uppercase tracking-tight text-black">Profile &amp; Settings</span>
            </motion.button>
            <motion.button
              custom={sections.length + 1}
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => {
                onLogout();
                onClose();
              }}
              data-testid="menu-item-logout"
              className="w-full flex items-center gap-4 py-3 text-left group"
            >
              <span className="shrink-0 rounded-xl bg-rose-50 p-2.5 text-rose-500 transition-colors duration-300 group-hover:bg-rose-500 group-hover:text-white">
                <LogOut className="w-5 h-5" strokeWidth={2} />
              </span>
              <span className="text-lg font-black uppercase tracking-tight text-rose-500">Log Out</span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PortalMenuDrawer;
