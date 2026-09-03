import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InteractiveDivider } from "@/features/user-portal/shared";
import { Copy, Link2, ExternalLink, Minus, Plus } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import { RefreshButton, useRefreshAction } from "@/components/ui/refresh-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ReferralTree } from "@/components/ui/referral-tree";
import type { User as AuthUser } from "@/hooks/useAuth";

interface ReferralsSectionProps {
  isReferralsHeroToggled: boolean;
  setIsReferralsHeroToggled: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleHeroToggle: (setter: any) => void;
  referralsData: { stats: { count: number; totalEarned: string } } | undefined;
  formatCurrency: (value: any) => string;
  showReferralLink: boolean;
  setShowReferralLink: (v: boolean) => void;
  referralReady: boolean;
  referralLink: string;
  referralLinkHost: string;
  referralCode: string;
  toast: any;
  referralZoom: number;
  setReferralZoom: (v: number | ((prev: number) => number)) => void;
  referralPanRef: any;
  onReferralMouseDown: (e: any) => void;
  isReferralDragging: boolean;
  directReferralsCount: number;
  isReferralError: boolean;
  isReferralLoading: boolean;
  referralError: Error | null;
  displayUser: AuthUser;
  referralLeaderboard: any[];
  commissionsData: { commissions: any[] } | undefined;
  CONVERSION_RATE: number;
  onRefresh?: () => void;
}

export function ReferralsSection(props: ReferralsSectionProps) {
  const { isReferralsHeroToggled, setIsReferralsHeroToggled, handleHeroToggle, referralsData, formatCurrency, showReferralLink, setShowReferralLink, referralReady, referralLink, referralLinkHost, referralCode, toast, referralZoom, setReferralZoom, referralPanRef, onReferralMouseDown, isReferralDragging, directReferralsCount, isReferralError, isReferralLoading, referralError, displayUser, referralLeaderboard, commissionsData, CONVERSION_RATE, onRefresh } = props;
  const { refreshing: isRefreshing, refresh: handleRefresh } = useRefreshAction(onRefresh ?? (() => {}));
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
            backgroundColor: isReferralsHeroToggled ? "#FAF9F5" : "#141413",
            borderColor: isReferralsHeroToggled ? "#141413" : "#FAF9F5",
            boxShadow: isReferralsHeroToggled
              ? "0 4px 20px rgba(20, 20, 19,0.06)"
              : "0 8px 30px rgba(20, 20, 19,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsReferralsHeroToggled)}
          className={cn(
            "rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden group border-2 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isReferralsHeroToggled ? (
                <motion.h1
                  key="referrals-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-5xl md:text-8xl text-black"
                >
                  TEAM
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="referrals-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-5xl md:text-8xl text-white"
                >
                  TEAM
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Sync control — refresh team/referral data without a hard reload */}
        <div className="flex items-center justify-end mt-6 mb-6 md:mt-8 md:mb-8">
          <RefreshButton onClick={handleRefresh} refreshing={isRefreshing} title="Refresh team data" />
        </div>

        {/* Key Metrics Cards - Dashboard Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 mb-12">
          {/* Total Referrals */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 15 },
              animate: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group split-card bg-white border border-black/15 hover:border-primary/40 rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(20, 20, 19,0.05)] hover:shadow-[0_12px_32px_rgba(20, 20, 19,0.08)]"
            data-testid="card-total-referrals"
          >
            <div className="flex items-start justify-between mb-3">
              <TechnicalLabel text="TEAM MEMBERS" className="text-muted-foreground text-xs" />
            </div>
            <p className="text-2xl md:text-3xl font-black text-foreground mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-referrals-count">{referralsData?.stats.count || 0}</p>
          </motion.div>

          {/* Referral Earnings */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 15 },
              animate: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group split-card bg-white border border-primary/25 hover:border-primary/50 rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(20, 20, 19,0.05)] hover:shadow-[0_12px_32px_rgba(20, 20, 19,0.08)]"
            data-testid="card-referral-earnings"
          >
            <div className="flex items-start justify-between mb-3">
              <TechnicalLabel text="TEAM EARNING" className="text-muted-foreground text-xs" />
            </div>
            <p className="text-2xl md:text-3xl font-black text-primary mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-referral-earnings">{formatCurrency(referralsData?.stats.totalEarned || '0.00')}</p>
          </motion.div>
        </div>

        <InteractiveDivider className="my-12" />

        {/* Middle Section - Invitation Area */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 }
          }}
          className="grid grid-cols-1 gap-4 md:gap-8 mb-6 md:mb-8"
        >
          {/* Invitation Area */}
          <div className="p-0">
            <div className="flex justify-center pt-2">
              {/* Referral Code */}
              <div className="flex flex-col w-full max-w-xl">
                <div className="bg-white border border-black/15 rounded-2xl p-5 md:p-10 relative overflow-hidden group h-full flex flex-col justify-center shadow-[0_4px_16px_rgba(20, 20, 19,0.05)] transition-all duration-300">
                  <div className="relative z-10 w-full">
                    <div className="flex flex-col gap-6 md:gap-8">
                      <div className="text-center md:text-left">
                        <p className="text-[10px] md:text-[11px] font-black uppercase text-black/40 mb-3 tracking-[0.2em]">
                          {showReferralLink ? "YOUR NETWORK LINK" : "YOUR REFERRAL CODE"}
                        </p>
                        {!referralReady ? (
                          <Skeleton className="h-10 md:h-12 w-full max-w-md mx-auto md:mx-0 rounded-lg" />
                        ) : showReferralLink ? (
                          <div
                            className="w-full rounded-lg border border-black/10 bg-secondary/40 px-4 py-3 text-sm md:text-base font-bold text-black/80 font-mono flex items-center min-w-0"
                            title={referralLink}
                            data-testid="text-referral-link"
                          >
                            <span className="text-black/40 truncate min-w-0">{referralLinkHost}</span>
                            <span className="text-black shrink-0">/?ref=</span>
                            <span className="text-primary shrink-0">{referralCode}</span>
                          </div>
                        ) : (
                          <div
                            className="inline-block rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-5 py-3 text-2xl md:text-3xl font-black text-black tracking-[0.15em] font-mono leading-none"
                            data-testid="text-referral-code"
                          >
                            {referralCode}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        <Button
                          disabled={!referralReady}
                          onClick={async () => {
                            const textToCopy = showReferralLink ? referralLink : referralCode;
                            try {
                              await navigator.clipboard.writeText(textToCopy);
                              toast({ title: "Copied!", description: showReferralLink ? "Referral link copied to clipboard." : "Referral code copied to clipboard." });
                            } catch (error) {
                              toast({ title: "Copy Failed", description: "Could not copy. Please try again.", variant: "destructive" });
                            }
                          }}
                          className="w-full bg-primary hover:bg-black hover:text-white text-black h-12 md:h-14 text-sm font-black border-2 border-black rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-copy-referral"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          COPY
                        </Button>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            disabled={!referralReady}
                            onClick={() => setShowReferralLink(!showReferralLink)}
                            className="w-full border-2 border-black text-black bg-white hover:bg-black hover:text-white h-12 md:h-14 font-black text-[10px] rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Link2 className="w-4 h-4 mr-1" />
                            {showReferralLink ? "CODE" : "LINK"}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!referralReady}
                            onClick={() => {
                              const message = `I’m earning real money by watching video ads and building a team on THORX.\n\nUse my referral link below to join and start earning:\n${referralLink}`;
                              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="w-full border-2 border-black text-black bg-white hover:bg-black hover:text-white h-12 md:h-14 font-black text-[10px] rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            SHARE
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Divider Line instead of Header */}
        <div className="mt-20 px-4 md:px-0 mb-12">
          <InteractiveDivider className="mb-12" />

          {/* HIERARCHICAL TREE LAYOUT */}
          <div className="w-full">
            {isReferralError ? (
              <div className="bg-white border border-destructive/30 rounded-2xl p-8 text-center shadow-[0_4px_16px_rgba(20, 20, 19,0.05)]">
                <p className="font-black text-destructive mb-2">Failed to load network data</p>
                <p className="text-sm text-destructive/80">{(referralError as Error)?.message || "Unknown error"}</p>
              </div>
            ) : isReferralLoading ? (
              <div className="flex justify-center items-center py-12 p-8 rounded-2xl border border-black/15 bg-white shadow-[0_4px_16px_rgba(20, 20, 19,0.05)]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-8 h-8 border-4 border-black border-t-transparent rounded-full"
                />
              </div>
            ) : (displayUser ? (
              <div className="bg-white border border-black/15 rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(20, 20, 19,0.06)] relative">
                {/* Zoom / instrument toolbar — centered on mobile, tucked to the corner on desktop */}
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 rounded-xl border-2 border-black bg-white p-1 shadow-[0_6px_20px_rgba(20, 20, 19,0.14)] md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg text-black hover:bg-black hover:text-white"
                    onClick={() => setReferralZoom(prev => Math.max(prev - 0.1, 0.3))}
                    title="Zoom Out"
                  >
                    <Minus size={15} />
                  </Button>
                  <span className="min-w-[2.75rem] text-center text-[10px] font-black tabular-nums text-black/60">
                    {Math.round(referralZoom * 100)}%
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg text-black hover:bg-black hover:text-white"
                    onClick={() => setReferralZoom(prev => Math.min(prev + 0.1, 2))}
                    title="Zoom In"
                  >
                    <Plus size={15} />
                  </Button>
                </div>

                <div
                  ref={referralPanRef}
                  onMouseDown={onReferralMouseDown}
                  onDragStart={(e) => e.preventDefault()}
                  className={cn(
                    "w-full overflow-auto scrollbar-hide p-4 cursor-grab md:p-8",
                    isReferralDragging && "cursor-grabbing select-none",
                    directReferralsCount === 0 ? "min-h-[360px] md:min-h-[400px]" : "min-h-[460px] md:min-h-[520px]"
                  )}
                >
                  <div
                    style={{
                      transform: `scale(${referralZoom})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    className="w-full min-w-max"
                  >
                    <ReferralTree
                      currentUser={{
                        id: displayUser.id,
                        firstName: displayUser.firstName,
                        lastName: displayUser.lastName,
                        name: displayUser.name,
                        userRankTier: displayUser.userRankTier,
                        avatar: displayUser.avatar,
                        profilePicture: displayUser.profilePicture
                      }}
                      referrals={referralLeaderboard || []}
                    />
                  </div>
                </div>
              </div>
            ) : null)}
          </div>
        </div>

        {/* Commission History Section */}
        {
          commissionsData?.commissions && commissionsData.commissions.length > 0 ? (
            <motion.div
              variants={{
                initial: { opacity: 0, scale: 0.98 },
                animate: { opacity: 1, scale: 1 }
              }}
              className="mt-6 md:mt-8 bg-white border border-black/15 rounded-2xl p-4 md:p-8 shadow-[0_12px_40px_rgba(20, 20, 19,0.06)]"
            >
              <div className="border-b border-black/15 pb-3 md:pb-4 mb-4 md:mb-6">
                <TechnicalLabel text="COMMISSION HISTORY" className="text-foreground text-sm md:text-lg font-black" />
              </div>

              <div className="grid gap-3 md:gap-4">
                {commissionsData.commissions.map((commission: any, index: number) => (
                  <motion.div
                    key={commission.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="rounded-xl border border-black/10 bg-muted/30 p-3 md:p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-black text-sm md:text-base">LEVEL {commission.level} COMMISSION</div>
                        <div className="text-xs text-muted-foreground">{new Date(commission.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-lg text-primary">
                          +{Math.round(parseFloat(commission.amount) * CONVERSION_RATE).toLocaleString()} TX-Points
                        </div>
                        <div className="text-[10px] text-muted-foreground">≈ Rs.{parseFloat(commission.amount).toFixed(4)} PKR</div>
                        <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border inline-block mt-1 ${commission.status === 'paid' ? 'bg-green-100 border-green-500 text-green-700' :
                          commission.status === 'pending' ? 'bg-yellow-100 border-yellow-500 text-yellow-700' :
                            'bg-red-100 border-red-500 text-red-700'
                          }`}>
                          {commission.status}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : null
        }
      </motion.div >
    );
  }
