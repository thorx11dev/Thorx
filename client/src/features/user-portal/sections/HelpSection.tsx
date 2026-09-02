import type { FormEvent } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InteractiveDivider, AnimatedPlaceholder } from "@/features/user-portal/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalFaqSection } from "@/components/portal/PortalFaqSection";
import Barcode from "@/components/ui/barcode";
import { Skeleton } from "@/components/ui/skeleton";
import {RefreshCw, Send} from "lucide-react";
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
  chatMessages: Array<{ id: number; text: string; sender: string; timestamp: string; avatar: string }>;
  isChatHistoryLoading: boolean;
  newMessage: string;
  setNewMessage: (v: string) => void;
  handleSendMessage: () => void;
  chatMutation: { isPending: boolean };
  contactForm: { name: string; email: string; description: string };
  setContactForm: (updater: (prev: { name: string; email: string; description: string }) => { name: string; email: string; description: string }) => void;
  handleContactSubmit: (e: FormEvent) => void;
  isContactSubmitting: boolean;
  isMobile: boolean;
}

export function HelpSection(props: HelpSectionProps) {
  const { isHelpHeroToggled, setIsHelpHeroToggled, handleHeroToggle, activeHelpTab, setActiveHelpTab, chatMessages, isChatHistoryLoading, newMessage, setNewMessage, handleSendMessage, chatMutation, contactForm, setContactForm, handleContactSubmit, isContactSubmitting, isMobile } = props;
    const formatTime = (timestamp: string) => {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Help section tabs — same control renders on every breakpoint,
    // desktop shows the full label, mobile shows the short one.
    const helpSectionOptions = [
      { id: "guide", label: "AREA GUIDE", shortLabel: "GUIDE" },
      { id: "help", label: "AREA HELP", shortLabel: "CHAT" },
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
              <TabsList className="grid w-full grid-cols-3 mb-8 md:mb-10 bg-muted/60 border border-black/15 rounded-xl h-12 md:h-14 p-1 gap-1">
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
                      onChatClick={() => setActiveHelpTab("help")}
                      onContactClick={() => setActiveHelpTab("contact")}
                    />
                  </motion.div>
                )}

                {/* Area Help - Chat */}
                {activeHelpTab === "help" && (
                  <motion.div
                    key="help"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="mt-0"
                  >
                    <div className="rounded-2xl border border-black/15 bg-white overflow-hidden shadow-[0_20px_60px_rgba(20, 20, 19,0.08)]">
                      {/* Chat Header */}
                      <div className="bg-black text-white px-4 md:px-6 py-4 flex items-center justify-end">
                        <Barcode className="h-4 w-12 md:w-16 opacity-40 grayscale invert" />
                      </div>

                      {/* Chat Messages Area */}
                      <div className="chat-container bg-muted/30 h-[420px] md:h-[560px] p-4 md:p-6 space-y-4 md:space-y-5 overflow-y-auto custom-scrollbar relative">

                        {isChatHistoryLoading ? (
                          <div className="space-y-4">
                            {[...Array(3)].map((_, i) => (
                              <div key={i} className={`flex items-start gap-3 ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                                <Skeleton className={`h-16 rounded-2xl border border-black/10 ${i % 2 === 0 ? "w-64" : "w-48"}`} />
                              </div>
                            ))}
                          </div>
                        ) : chatMessages.map((message, idx) => (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`flex items-start gap-2 md:gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] md:max-w-[70%] px-4 md:px-5 py-3 md:py-3.5 relative ${message.sender === 'user'
                                ? 'bg-primary text-black rounded-2xl rounded-tr-md'
                                : 'bg-white text-black rounded-2xl rounded-tl-md border border-black/10 shadow-sm'
                                }`}
                            >
                              <p className="text-sm md:text-base font-bold leading-relaxed break-words">{message.text}</p>
                              <div className={`flex items-center justify-end gap-1 mt-1.5 text-[10px] md:text-xs font-black ${message.sender === 'user' ? 'text-black/50' : 'text-muted-foreground'}`}>
                                {formatTime(message.timestamp)}
                              </div>
                            </div>
                          </motion.div>
                        ))
                        }
                      </div>

                      {/* Chat Input Area */}
                      <div className="bg-white border-t border-black/15 p-4 md:p-6">
                        <div className="flex flex-row items-stretch gap-2 md:gap-3">
                          <div className="relative flex-1 group">
                            <input
                              type="text"
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              placeholder="Type your message here..."
                              className="w-full bg-muted/30 border border-black/15 text-black px-4 md:px-6 py-3 md:py-4 rounded-xl font-bold text-sm md:text-base focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors"
                              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            />
                          </div>
                          <div className="flex">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={handleSendMessage}
                              disabled={!newMessage.trim() || chatMutation.isPending}
                              className="flex items-center justify-center bg-primary text-black px-4 md:px-8 py-3 md:py-4 rounded-xl border border-black/10 font-black text-sm md:text-base hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all aspect-square md:aspect-auto"
                            >
                              {chatMutation.isPending ? (
                                <ThorxSpinner size={20} />
                              ) : (
                                <Send className="w-5 h-5 md:w-6 md:h-6" />
                              )}
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    </div>
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
