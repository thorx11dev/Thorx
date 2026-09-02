import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InteractiveDivider } from "@/features/user-portal/shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import EnhancedVideoPlayer from "@/components/ui/enhanced-video-player";
import { WORK_TABS } from "@/components/ui/industrial-tabs";
import TechnicalLabel from "@/components/ui/technical-label";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import SurveyWallPanel from "@/components/beta/SurveyWallPanel";

interface WorkSectionProps {
  isWorkHeroToggled: boolean;
  setIsWorkHeroToggled: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleHeroToggle: (setter: any) => void;
  activeWorkTab: string;
  setActiveWorkTab: (v: string) => void;
  activeWorkEngine: 1 | 2;
  setActiveWorkEngine: (v: 1 | 2) => void;
  isMobile: boolean;
  engineBUserRankTier: string;
  engineBPerformanceScore: number;
  engineBPsToUnlock: number;
  engineBUnlockPct: number;
  setWebPanelData: (v: { productUrl: string; adId: string; reward: string }) => void;
  setIsWebPanelOpen: (v: boolean) => void;
}

export function WorkSection(props: WorkSectionProps) {
  const { isWorkHeroToggled, setIsWorkHeroToggled, handleHeroToggle, activeWorkTab, setActiveWorkTab, activeWorkEngine, setActiveWorkEngine, isMobile, engineBUserRankTier, engineBPerformanceScore, engineBPsToUnlock, engineBUnlockPct, setWebPanelData, setIsWebPanelOpen } = props;

    // Handle video completion
    const handleVideoComplete = (tabId: string, earnings: string) => {
      // Instead of completing immediately, open the Web Panel
      const activeTabData = WORK_TABS.find(tab => tab.id === activeWorkTab);

      setWebPanelData({
        productUrl: activeTabData?.productUrl || "https://www.google.com", // Fallback if undefined
        adId: activeTabData?.adId || tabId,
        reward: earnings
      });

      setIsWebPanelOpen(true);

      // Removed immediate toast
    };

    // Get current video tab data for player
    const activeTabData = WORK_TABS.find(tab => tab.id === activeWorkTab);
    const currentVideoTab = {
      id: activeWorkTab,
      title: activeTabData?.title || "PLAYER 1",
      icon: "play",
      color: "primary",
      videoUrl: `#${activeWorkTab}-video`,
      reward: "2.50",
      description: activeTabData?.description || "Watch video ads to earn rewards"
    };

    return (
      <motion.div
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
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isWorkHeroToggled ? "#FAF9F5" : "#141413",
            borderColor: isWorkHeroToggled ? "#141413" : "#FAF9F5",
            boxShadow: isWorkHeroToggled
              ? "0 4px 20px rgba(20, 20, 19,0.06)"
              : "0 8px 30px rgba(20, 20, 19,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 },
          }}
          onClick={() => handleHeroToggle(setIsWorkHeroToggled)}
          className={cn(
            "rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden group border-2 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isWorkHeroToggled ? (
                <motion.h1
                  key="work-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-black"
                >
                  WORK
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="work-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-white"
                >
                  WORK
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* ── Engine Selector ── */}
        <div className="grid grid-cols-2 gap-4 mb-0">
          {([1, 2] as const).map((engine) => {
            const active = activeWorkEngine === engine;
            return (
              <button
                key={engine}
                onClick={() => setActiveWorkEngine(engine)}
                className={cn(
                  "relative overflow-hidden border-2 rounded-2xl p-5 md:p-7 flex items-center justify-center transition-all duration-300 group",
                  active
                    ? "bg-black border-black"
                    : "bg-black/5 border-black/15 hover:border-black/60 hover:bg-black/10"
                )}
              >
                <p className={cn(
                  "text-xl md:text-3xl font-black tracking-tighter uppercase whitespace-nowrap transition-colors",
                  active ? "text-white" : "text-foreground group-hover:text-black"
                )}>
                  {engine === 1 ? "ENGINE A" : "ENGINE B"}
                </p>
                {active && (
                  <motion.div
                    layoutId="engine-active-bar"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-white"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Engine Pages (slide below selector) ── */}
        <div className="overflow-hidden mt-8">
          <AnimatePresence mode="wait" initial={false}>
            {activeWorkEngine === 1 ? (
              <motion.div
                key="engine-1"
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, x: -60 }}
                variants={{
                  hidden: { opacity: 0, x: -60 },
                  show: {
                    opacity: 1,
                    x: 0,
                    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.06 }
                  }
                }}
              >
                {/* Video Player */}
                <motion.div
                  variants={{ hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                  className="w-full"
                >
                  <Tabs value={activeWorkTab} onValueChange={setActiveWorkTab} className="w-full">
                    {WORK_TABS.map(tab => (
                      <TabsContent key={tab.id} value={tab.id} className="mt-0">
                        <div className="space-y-4">
                          {tab.id === activeWorkTab && (
                            <EnhancedVideoPlayer
                              tab={currentVideoTab}
                              isActive={true}
                              onComplete={handleVideoComplete}
                              autoplay={false}
                              isMobile={isMobile}
                            />
                          )}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </motion.div>
              </motion.div>
            ) : (
              /* Beta policy: no rank gate on Engine B — every rank earns from
                 surveys. Only guild CREATION requires B-Rank (server-enforced). */
              /* ── Engine B — Surveys ─────────────────────────────────────── */
              /* Automated paid-survey waterfall (CPX Research / BitLabs).
                 Credit arrives via signed network callbacks into the same
                 earn pipeline — no manual proof submission anywhere. */
              <motion.div
                key="engine-2"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 max-w-2xl mx-auto space-y-6 md:space-y-8"
              >
                <SurveyWallPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
