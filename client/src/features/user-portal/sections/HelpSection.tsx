import type { FormEvent } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InteractiveDivider, AnimatedPlaceholder } from "@/features/user-portal/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalFaqSection } from "@/components/portal/PortalFaqSection";
import { Skeleton } from "@/components/ui/skeleton";
import TechnicalLabel from "@/components/ui/technical-label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface HelpSectionProps {
  isHelpHeroToggled: boolean;
  setIsHelpHeroToggled: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleHeroToggle: (setter: any) => void;
  activeHelpTab: string;
  setActiveHelpTab: (v: string) => void;
  contactForm: { name: string; email: string; description: string };
  setContactForm: (updater: (prev: { name: string; email: string; description: string }) => { name: string; email: string; description: string }) => void;
  handleContactSubmit: (e: FormEvent) => void;
  isContactSubmitting: boolean;
  isMobile: boolean;
}

export function HelpSection(props: HelpSectionProps) {
  const { isHelpHeroToggled, setIsHelpHeroToggled, handleHeroToggle, activeHelpTab, setActiveHelpTab, contactForm, setContactForm, handleContactSubmit, isContactSubmitting, isMobile } = props;

    // Help section tabs — same control renders on every breakpoint,
    // desktop shows the full label, mobile shows the short one.
    // Chatbot tab removed — support is FAQ + contact form only.
    const helpSectionOptions = [
      { id: "guide", label: "AREA GUIDE", shortLabel: "GUIDE" },
      { id: "contact", label: "AREA CONTACT", shortLabel: "CONTACT" }
    ];

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
        {/* Hero Section - Dashboard Style */}
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isHelpHeroToggled ? "#FAF9F5" : "#141413",
            borderColor: isHelpHeroToggled ? "#141413" : "#FAF9F5",
            boxShadow: isHelpHeroToggled
              ? "0 4px 20px rgba(20, 20, 19,0.06)"
              : "0 8px 30px rgba(20, 20, 19,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsHelpHeroToggled)}
          className={cn(
            "rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden group border-2 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isHelpHeroToggled ? (
                <motion.h1
                  key="help-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-black"
                >
                  HELP
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="help-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2.5rem,13vw,6rem)] md:text-9xl text-white"
                >
                  HELP
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* Navigation and Content */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 }
          }}
          className="max-w-[1600px] mx-auto mb-12"
        >
          <div className="rounded-2xl border border-black/15 bg-white p-6 md:p-12 shadow-[0_12px_40px_rgba(20, 20, 19,0.06)]">
            {/* Tab Navigation — identical control on desktop and mobile */}
            <Tabs value={activeHelpTab} onValueChange={setActiveHelpTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 md:mb-10 bg-muted/60 border border-black/15 rounded-xl h-12 md:h-14 p-1 gap-1">
                {helpSectionOptions.map((option) => {
                  return (
                    <TabsTrigger
                      key={option.id}
                      value={option.id}
                      className="rounded-lg data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:hover:bg-black/5 font-black text-[10px] md:text-sm tracking-wide h-full flex items-center justify-center gap-1.5 md:gap-2 transition-all duration-300"
                    >
                      <span className="md:hidden">{option.shortLabel}</span>
                      <span className="hidden md:inline">{option.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {/* Tab Content */}
            <div className="help-main-content">
              <AnimatePresence mode="wait">
                {/* Area Guide - FAQ */}
                {activeHelpTab === "guide" && (
                  <motion.div
                    key="guide"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="mt-0"
                  >
                    <PortalFaqSection
                      onContactClick={() => setActiveHelpTab("contact")}
                    />
                  </motion.div>
                )}

                {/* Area Contact - Registration Form Style */}
                {activeHelpTab === "contact" && (
                  <motion.div
                    key="contact"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="mt-0"
                  >
                    <div className="text-center mb-6">
                      <h3 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">SEND US A MESSAGE</h3>
                    </div>

                    <div className="max-w-2xl mx-auto">
                      <form onSubmit={handleContactSubmit} className="space-y-6">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                        >
                          <TechnicalLabel text="FULL NAME" className="mb-3 font-black" />
                          <div className="relative">
                            <Input
                              type="text"
                              required
                              value={contactForm.name}
                              onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                              className="border border-black/15 text-base md:text-lg py-3 md:py-3 min-h-[44px] rounded-xl focus:border-primary transition-colors"
                            />
                            {!contactForm.name && (
                              <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                <AnimatedPlaceholder examples={['John Doe', 'Ahmed Khan', 'Sarah Wilson']} />
                              </div>
                            )}
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          <TechnicalLabel text="EMAIL ADDRESS" className="mb-3 font-black" />
                          <div className="relative">
                            <Input
                              type="email"
                              required
                              value={contactForm.email}
                              onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                              className="border border-black/15 text-base md:text-lg py-3 md:py-3 min-h-[44px] rounded-xl focus:border-primary transition-colors"
                            />
                            {!contactForm.email && (
                              <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                <AnimatedPlaceholder examples={['your.email@gmail.com', 'contact@thorx.com', 'support@example.com']} />
                              </div>
                            )}
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                        >
                          <TechnicalLabel text="PROBLEM / DESCRIPTION" className="mb-3 font-black" />
                          <div className="relative">
                            <Textarea
                              required
                              rows={isMobile ? 5 : 6}
                              value={contactForm.description}
                              onChange={(e) => setContactForm(prev => ({ ...prev, description: e.target.value }))}
                              className="border border-black/15 text-base md:text-lg py-3 rounded-xl min-h-[140px] resize-vertical focus:border-primary transition-colors"
                              placeholder=""
                            />
                            {!contactForm.description && (
                              <div className="absolute top-3 left-3 pointer-events-none text-muted-foreground">
                                <AnimatedPlaceholder examples={['Describe your issue in detail...', 'Tell us what happened...', 'How can we help you today?']} />
                              </div>
                            )}
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          <Button
                            type="submit"
                            disabled={isContactSubmitting}
                            className="w-full bg-black text-white text-base md:text-xl font-black py-4 hover:bg-primary hover:text-black transition-all duration-300 rounded-xl border border-black/10 disabled:opacity-50 min-h-[50px] flex items-center justify-center"
                          >
                            {isContactSubmitting ? (
                              <span className="flex items-center justify-center">
                                <ThorxSpinner size={20} className="mr-2 md:mr-3" />
                                <span className="text-sm md:text-base">SENDING MESSAGE...</span>
                              </span>
                            ) : (
                              <span className="text-sm md:text-base">SEND MESSAGE TO TEAM →</span>
                            )}
                          </Button>
                        </motion.div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }
