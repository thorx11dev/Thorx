import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InteractiveDivider } from "@/features/user-portal/shared";
import { CaptainPortal } from "@/components/guild/CaptainPortal";
import { GuildMemberPanel } from "@/components/guild/GuildMemberPanel";
import { GuildDiscoveryPanel } from "@/components/guild/GuildDiscoveryPanel";
import type { User as AuthUser } from "@/hooks/useAuth";

interface GuildSectionProps {
  isGuildHeroToggled: boolean;
  setIsGuildHeroToggled: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleHeroToggle: (setter: any) => void;
  user: AuthUser | null;
}

export function GuildSection({ isGuildHeroToggled, setIsGuildHeroToggled, handleHeroToggle, user }: GuildSectionProps) {
    return (
      <motion.div
        key="guild-section"
        initial="initial"
        animate="animate"
        variants={{
          animate: {
            transition: {
              staggerChildren: 0.05
            }
          }
        }}
        className="max-w-[1600px] mx-auto px-4 md:px-12 py-8 md:pt-4 md:pb-12 relative z-10 w-full"
      >
        {/* Hero Header */}
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isGuildHeroToggled ? "#FAF9F5" : "#141413",
            borderColor: isGuildHeroToggled ? "#141413" : "#FAF9F5",
            boxShadow: isGuildHeroToggled
              ? "0 4px 20px rgba(20, 20, 19,0.06)"
              : "0 8px 30px rgba(20, 20, 19,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsGuildHeroToggled)}
          className={cn(
            "rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden group border-2 cursor-pointer",
            "hidden lg:flex h-[160px] md:h-[260px] items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isGuildHeroToggled ? (
                <motion.h1
                  key="guild-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-black"
                >
                  GUILD
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="guild-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-white"
                >
                  GUILD
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12 hidden lg:block" />

        {/* THORX v3 (spec F.6–F.8): 3-context routing by guildRole. */}
        {user && (() => {
          const role = (user as any).guildRole ?? 'simple';
          if (role === 'captain') return <CaptainPortal />;
          if (role === 'member')  return <GuildMemberPanel />;
          return <GuildDiscoveryPanel />;
        })()}
      </motion.div>
    );
  }
