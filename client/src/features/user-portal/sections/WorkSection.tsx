import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InteractiveDivider } from "@/features/user-portal/shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import EnhancedVideoPlayer from "@/components/ui/enhanced-video-player";
import { WORK_TABS } from "@/components/ui/industrial-tabs";
import { DEV_UNLOCK_RANK_GATES } from "@/lib/previewAccess";
import { Lock, X, RefreshCw, CheckCircle2, Briefcase } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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
  cpaCompletedCount: number;
  engineBActiveTask: any;
  setEngineBActiveTask: (v: any) => void;
  engineBPhase: "idle" | "details" | "timer" | "verify" | "done";
  setEngineBPhase: (v: "idle" | "details" | "timer" | "verify" | "done") => void;
  engineBTimer: number;
  engineBCode: string;
  setEngineBCode: (v: string) => void;
  engineBCodeError: string;
  setEngineBCodeError: (v: string) => void;
  engineBClickMutation: { isPending: boolean; mutate: (id: string) => void };
  engineBVerifyMutation: { isPending: boolean; mutate: (args: { taskId: string; code: string }) => void };
  tasksWithRecords: any[] | undefined;
  setWebPanelData: (v: { productUrl: string; adId: string; reward: string }) => void;
  setIsWebPanelOpen: (v: boolean) => void;
}

export function WorkSection(props: WorkSectionProps) {
  const { isWorkHeroToggled, setIsWorkHeroToggled, handleHeroToggle, activeWorkTab, setActiveWorkTab, activeWorkEngine, setActiveWorkEngine, isMobile, engineBUserRankTier, engineBPerformanceScore, engineBPsToUnlock, engineBUnlockPct, cpaCompletedCount, engineBActiveTask, setEngineBActiveTask, engineBPhase, setEngineBPhase, engineBTimer, engineBCode, setEngineBCode, engineBCodeError, setEngineBCodeError, engineBClickMutation, engineBVerifyMutation, tasksWithRecords, setWebPanelData, setIsWebPanelOpen } = props;
    // Handle video completion
    const handleVideoComplete = (tabId: string, earnings: string) => {
      // Instead of completing immediately, open the Web Panel
      const activeTabData = WORK_TABS.find(tab => tab.id === activeWorkTab);

      setWebPanelData({
        productUrl: activeTabData?.productUrl || "https://www.google.com", // Fallback if undefined
        adId: tabId,
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
            backgroundColor: isWorkHeroToggled ? "#ffffff" : "#000000",
            borderColor: isWorkHeroToggled ? "#000000" : "#ffffff",
            boxShadow: isWorkHeroToggled
              ? "0 4px 20px rgba(0,0,0,0.06)"
              : "0 8px 30px rgba(0,0,0,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
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
            ) : !DEV_UNLOCK_RANK_GATES && (engineBUserRankTier === "E-Rank" || engineBUserRankTier === "D-Rank") ? (
              // THORX v3 (spec F.10): Engine B locked-state UI for below C-Rank.
              <motion.div
                key="engine-2-locked"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 max-w-xl mx-auto rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 bg-card/50 py-12 px-6 md:py-16 md:px-10 text-center"
                data-testid="panel-engine-b-locked"
              >
                <div className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center mx-auto mb-5">
                  <Lock className="w-6 h-6 text-muted-foreground" />
                </div>
                <TechnicalLabel text="ENGINE B — UNLOCKS AT C-RANK" className="text-muted-foreground text-[10px] md:text-xs mb-3" />
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Premium CPA offers with higher payouts (+25 PS per completion).
                  You are {engineBUserRankTier} ({engineBPerformanceScore.toLocaleString()} PS).
                  Need {engineBPsToUnlock.toLocaleString()} more PS to unlock.
                </p>
                <Progress value={engineBUnlockPct} className="h-1.5 mb-6" />
                <Button
                  onClick={() => setActiveWorkEngine(1)}
                  className="bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-tighter rounded-lg"
                  data-testid="button-engine-b-locked-cta"
                >
                  Keep earning with Engine A to reach C-Rank
                </Button>
              </motion.div>
            ) : (
              /* ── Engine B — CPA Tasks Dashboard ─────────────────────────── */
              <motion.div
                key="engine-2"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 space-y-6 md:space-y-8"
              >
                {/* Header */}
                <div className="flex items-center justify-end">
                  <div className="text-right shrink-0">
                    <TechnicalLabel text="COMPLETED" className="text-muted-foreground text-[10px] mb-1" />
                    <p className="text-3xl md:text-4xl font-black tracking-tighter text-primary" data-testid="text-engine-b-completed-count">{cpaCompletedCount}</p>
                  </div>
                </div>

                {/* Active Task Modal */}
                <AnimatePresence>
                  {engineBActiveTask && engineBPhase !== "idle" && (
                    <motion.div
                      initial={{ opacity: 0, y: -16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      className="rounded-2xl p-6 md:p-8 border-2 border-black bg-card space-y-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.12)]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <TechnicalLabel
                            text={engineBPhase === "details" ? `TASK DETAILS — ${engineBActiveTask.difficulty?.toUpperCase() || "STANDARD"}` : `ACTIVE TASK — ${engineBActiveTask.difficulty?.toUpperCase() || "STANDARD"}`}
                            className="text-muted-foreground text-[10px] md:text-xs mb-2"
                          />
                          <h3 className="font-black text-lg md:text-xl tracking-tight">{engineBActiveTask.title}</h3>
                          {engineBPhase !== "details" && engineBActiveTask.instructions && (
                            <p className="text-sm text-muted-foreground mt-1.5">{engineBActiveTask.instructions}</p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEngineBActiveTask(null); setEngineBPhase("idle"); setEngineBCodeError(""); }}
                          className="shrink-0 rounded-lg text-foreground hover:text-foreground hover:bg-black/8 dark:hover:bg-white/12"
                          data-testid="button-engine-b-close-active-task"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      {engineBPhase === "details" && (
                        <div className="space-y-4">
                          {engineBActiveTask.description && (
                            <div>
                              <TechnicalLabel text="DESCRIPTION" className="text-muted-foreground text-[10px] mb-1.5" />
                              <p className="text-sm text-foreground">{engineBActiveTask.description}</p>
                            </div>
                          )}
                          {engineBActiveTask.instructions && (
                            <div>
                              <TechnicalLabel text="HOW TO DO IT" className="text-muted-foreground text-[10px] mb-1.5" />
                              <p className="text-sm text-foreground">{engineBActiveTask.instructions}</p>
                            </div>
                          )}
                          <div>
                            <TechnicalLabel text="PROOF REQUIRED" className="text-muted-foreground text-[10px] mb-1.5" />
                            <p className="text-sm text-foreground">
                              {engineBActiveTask.secretCode
                                ? "A secret code shown on the task page — you'll enter it here once you finish."
                                : "None — this task is verified automatically once you finish it."}
                            </p>
                          </div>
                          <Button
                            onClick={() => {
                              if (engineBActiveTask.actionUrl) window.open(engineBActiveTask.actionUrl, "_blank");
                              engineBClickMutation.mutate(engineBActiveTask.id);
                            }}
                            disabled={engineBClickMutation.isPending}
                            className="w-full bg-primary text-black font-black uppercase tracking-wider rounded-lg h-11 hover:bg-primary/90"
                            data-testid="button-engine-b-begin-task"
                          >
                            {engineBClickMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Begin Task"}
                          </Button>
                        </div>
                      )}

                      {engineBPhase === "timer" && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="font-black text-xl text-primary">{engineBTimer}</span>
                            </div>
                            <div>
                              <p className="font-black text-sm">Complete the task on the opened page</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Verification unlocks in {engineBTimer} second{engineBTimer !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <Progress value={((10 - engineBTimer) / 10) * 100} className="h-1.5" />
                        </div>
                      )}

                      {engineBPhase === "verify" && (
                        <div className="space-y-3">
                           <p className="text-sm font-bold">
                             {engineBActiveTask.secretCode
                               ? "Enter the secret code from the task page to verify completion:"
                               : "This task has no secret code. Confirm when you are ready to finish:"}
                           </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                               placeholder={engineBActiveTask.secretCode ? "Enter secret code…" : "No code required"}
                              value={engineBCode}
                              onChange={e => { setEngineBCode(e.target.value); setEngineBCodeError(""); }}
                               className="font-mono uppercase tracking-widest border-2 border-black/15 rounded-lg h-11"
                               disabled={!engineBActiveTask.secretCode}
                               data-testid="input-engine-b-secret-code"
                               onKeyDown={e => {
                                 const codeRequired = Boolean(engineBActiveTask.secretCode);
                                 if (e.key === "Enter" && (!codeRequired || engineBCode.trim())) {
                                   engineBVerifyMutation.mutate({ taskId: engineBActiveTask.id, code: engineBCode.trim() });
                                 }
                               }}
                            />
                            <Button
                              onClick={() => engineBVerifyMutation.mutate({ taskId: engineBActiveTask.id, code: engineBCode.trim() })}
                               disabled={
                                 (Boolean(engineBActiveTask.secretCode) && !engineBCode.trim()) ||
                                 engineBVerifyMutation.isPending
                               }
                              className="bg-primary text-black font-black shrink-0 rounded-lg h-11 px-5 hover:bg-primary/90"
                              data-testid="button-engine-b-verify"
                            >
                              {engineBVerifyMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            </Button>
                          </div>
                          {engineBCodeError && <p className="text-xs font-bold text-destructive">{engineBCodeError}</p>}
                           {!engineBActiveTask.secretCode && (
                             <p className="text-xs text-muted-foreground">No code required — click the check button to submit.</p>
                           )}
                        </div>
                      )}

                      {engineBPhase === "done" && (
                        <div className="flex items-center gap-3 py-2">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-black text-primary">Task Verified!</p>
                            <p className="text-xs text-muted-foreground">Your reward has been added to your account.</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Task List */}
                {!tasksWithRecords ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
                  </div>
                ) : tasksWithRecords.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 bg-card/50 p-12 md:p-16 text-center">
                    <Briefcase className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <TechnicalLabel text="NO TASKS AVAILABLE" className="text-muted-foreground text-xs mb-2" />
                    <p className="text-sm text-muted-foreground">New CPA tasks will appear here when the admin publishes them.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {(() => {
                      const pendingTasks = tasksWithRecords.filter((t: any) => t.record?.status !== "completed");
                      const completedTasks = tasksWithRecords.filter((t: any) => t.record?.status === "completed");
                      return (
                        <>
                          {pendingTasks.length > 0 ? (
                            <div className="space-y-4">
                              {pendingTasks.map((task: any) => {
                                const isActive = engineBActiveTask?.id === task.id && engineBPhase !== "idle";
                                return (
                                  <motion.div
                                    key={task.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    data-testid={`card-engine-b-task-${task.id}`}
                                    className={cn(
                                      "group relative rounded-2xl border-2 bg-card p-5 md:p-6 flex items-start gap-4 transition-all duration-300 ease-out",
                                      "border-black/15 dark:border-white/15 hover:-translate-y-1 hover:border-black dark:hover:border-white hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.15)]",
                                      isActive && "border-primary shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                                    )}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-foreground text-background rounded-sm">
                                          {task.difficulty || "Standard"}
                                        </span>
                                      </div>
                                      <h4 className="font-black tracking-tight text-base md:text-lg leading-tight">{task.title}</h4>
                                      {task.description && <p className="text-xs md:text-sm text-muted-foreground mt-1.5 line-clamp-2">{task.description}</p>}
                                    </div>
                                    <div className="shrink-0">
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setEngineBActiveTask(task);
                                          setEngineBPhase("details");
                                          setEngineBCodeError("");
                                        }}
                                        className="bg-primary text-black font-black text-xs uppercase tracking-wider rounded-lg hover:bg-primary/90"
                                        data-testid={`button-engine-b-start-${task.id}`}
                                      >
                                        Start
                                      </Button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 bg-card/50 p-10 md:p-12 text-center">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-primary" />
                              <TechnicalLabel text="ALL CAUGHT UP" className="text-muted-foreground text-xs mb-2" />
                              <p className="text-sm text-muted-foreground">You've completed every available task. New tasks will appear here soon.</p>
                            </div>
                          )}

                          {completedTasks.length > 0 && (
                            <div>
                              <TechnicalLabel text={`COMPLETED — ${completedTasks.length}`} className="text-muted-foreground text-[10px] md:text-xs mb-3" />
                              <div className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.03] overflow-hidden">
                                {completedTasks.map((task: any, idx: number) => (
                                  <motion.div
                                    key={task.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    data-testid={`card-engine-b-task-${task.id}`}
                                    className={cn(
                                      "flex items-center gap-3 px-5 md:px-6 py-3.5",
                                      idx !== completedTasks.length - 1 && "border-b border-black/8 dark:border-white/8"
                                    )}
                                  >
                                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <CheckCircle2 className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-muted-foreground truncate">{task.title}</p>
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 shrink-0">
                                      {task.difficulty || "Standard"}
                                    </span>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
