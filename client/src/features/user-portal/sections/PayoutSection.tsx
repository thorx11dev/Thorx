import { motion, AnimatePresence } from "framer-motion";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { cn } from "@/lib/utils";
import { InteractiveDivider, AnimatedPlaceholder } from "@/features/user-portal/shared";
import { ArrowLeft, ArrowRight, RefreshCw, History, LifeBuoy } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { JazzCashLogo, EasyPaisaLogo } from "@/components/ui/payment-icons";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { DEV_UNLOCK_PAYOUT } from "@/lib/previewAccess";
import { z } from "zod";
import { captureEvent } from "@/lib/posthog";

interface PayoutSectionProps {
  isPayoutHeroToggled: boolean;
  setIsPayoutHeroToggled: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleHeroToggle: (setter: any) => void;
  toast: any;
  withdrawalsHistory: any;
  currentStep: number;
  setCurrentStep: (v: number | ((prev: number) => number)) => void;
  withdrawalKey: string;
  setWithdrawalKey: (v: any) => void;
  withdrawAmount: string;
  setWithdrawAmount: (v: string | ((prev: string) => string)) => void;
  selectedTimeframe: string | null;
  setSelectedTimeframe: (v: string | null) => void;
  selectedMethod: string;
  setSelectedMethod: (v: string) => void;
  paymentDetails: { name: string; number: string; email: string; iban: string };
  setPaymentDetails: (v: { name: string; number: string; email: string; iban: string } | ((prev: { name: string; number: string; email: string; iban: string }) => { name: string; number: string; email: string; iban: string })) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  step3MinDisplayElapsed: boolean;
  timeframeBreakdown: any;
  withdrawalPreview: any;
  isPreviewLoading: boolean;
  withdrawalPreviewError: any;
  WITHDRAWAL_FEE_PERCENT: number;
  isConfigLoading: boolean;
  navigateToSection: (index: number) => void;
  TIMEFRAME_OPTIONS: Array<{ key: string; label: string }>;
  DEV_MOCK_PREVIEW: { exactPkr: number; platformFee: number; feePercent: number; referralCommission: number; referrerName: string | null; userNetPkr: number; sRankFastTrack: boolean };
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void };
  formatDate: (dateString: string) => string;
  formatCurrency: (value: any) => string;
}

export function PayoutSection(props: PayoutSectionProps) {
  const { isPayoutHeroToggled, setIsPayoutHeroToggled, handleHeroToggle, toast, withdrawalsHistory, currentStep, setCurrentStep, withdrawalKey, setWithdrawalKey, withdrawAmount, setWithdrawAmount, selectedTimeframe, setSelectedTimeframe, selectedMethod, setSelectedMethod, paymentDetails, setPaymentDetails, isProcessing, setIsProcessing, showHistory, setShowHistory, step3MinDisplayElapsed, timeframeBreakdown, withdrawalPreview, isPreviewLoading, withdrawalPreviewError, WITHDRAWAL_FEE_PERCENT, isConfigLoading, navigateToSection, TIMEFRAME_OPTIONS, DEV_MOCK_PREVIEW, queryClient, formatDate, formatCurrency } = props;
    // Static transaction history data
    const historyItems = withdrawalsHistory || [];

    // Numeric keypad input handling
    const handleNumberInput = (num: string) => {
      if (withdrawAmount.length < 8) {
        setWithdrawAmount(prev => prev + num);
      }
    };

    const handleBackspace = () => {
      setWithdrawAmount(prev => prev.slice(0, -1));
    };

    // Navigation handlers
    const handleNext = () => {
      if (canProceed()) {
        if (currentStep < 3) setCurrentStep(prev => prev + 1);
        else handleSubmit();
      }
    };

    const handleBack = () => {
      if (currentStep > 1) {
        setCurrentStep(currentStep - 1);
      }
    };

    // Audit finding 1-J: Zod schema for payment details — inline validation
    // before the network call gives the user immediate field-level feedback.
    const paymentDetailsSchema = z.object({
      name: z.string().min(2, "Account name must be at least 2 characters").max(100, "Name too long"),
      number: z.string()
        .min(10, "Account/mobile number must be at least 10 digits")
        .max(20, "Number too long")
        .regex(/^[0-9+\-\s]+$/, "Only digits, spaces, + and - are allowed"),
      email: z.string().email("Enter a valid email address"),
      iban: z.string().optional(),
    });

    const handleSubmit = async () => {
      // Validate payment details before hitting the network
      const validation = paymentDetailsSchema.safeParse(paymentDetails);
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast({
          title: "Invalid Payment Details",
          description: firstError?.message || "Please check your payment details.",
          variant: "destructive",
        });
        return;
      }

      setIsProcessing(true);
      try {
        const payload = {
          amount: withdrawAmount,
          method: selectedMethod,
          accountName: paymentDetails.name,
          accountNumber: paymentDetails.number,
          accountDetails: {
            email: paymentDetails.email,
            iban: paymentDetails.iban
          }
        };

        const response = await apiRequest("POST", "/api/withdrawals", payload, { "x-idempotency-key": withdrawalKey });

        if (response.ok) {
          captureEvent("withdrawal_requested", {
            amountPkr: withdrawAmount,
            estNetPkr: withdrawalPreview?.userNetPkr ?? null,
            method: selectedMethod,
            timeframe: selectedTimeframe,
          });
          toast({
            title: "Payout Request Submitted!",
            description: `Your payout request of Rs. ${withdrawAmount} (${withdrawalPreview ? `Est. Rs. ${Number(withdrawalPreview.userNetPkr).toFixed(2)} net` : "pending team review"}) has been submitted for Team review.`,
          });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.user });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.withdrawals });
          queryClient.invalidateQueries({ queryKey: ["/api/withdrawals/preview"] });
          // Reset form
          setCurrentStep(1);
          setWithdrawAmount("");
          setSelectedMethod("");
          setPaymentDetails({ name: "", number: "", email: "", iban: "" });
          setWithdrawalKey(crypto.randomUUID()); // rotate idempotency key after success
        } else {
          const error = await response.json();
          toast({
            title: "Submission Failed",
            description: error.message || "Could not process withdrawal request.",
            variant: "destructive"
          });
        }
      } catch (_error) {
        toast({
          title: "Error",
          description: "An unexpected error occurred.",
          variant: "destructive"
        });
      } finally {
        setIsProcessing(false);
      }
    };

    // Payment method data
    const paymentMethods = [
      {
        id: 'jazzcash',
        name: 'JAZZ CASH',
        LogoComponent: JazzCashLogo,
        description: 'Mobile Wallet Transfer',
        color: 'bg-gradient-to-r from-red-600 to-red-700',
        processing: '2-4 hours'
      },
      {
        id: 'easypaisa',
        name: 'EASY PAISA',
        LogoComponent: EasyPaisaLogo,
        description: 'Digital Wallet Service',
        color: 'bg-gradient-to-r from-green-600 to-green-700',
        processing: '2-4 hours'
      },
    ];

    // Get current step button states
    const canProceed = () => {
      if (isConfigLoading) return false;
      if (currentStep === 1) return withdrawAmount && parseInt(withdrawAmount, 10) > 0;
      // DEV_UNLOCK_PAYOUT: skip preview requirement so step 2 → 3 works with zero balance
      const effectivePreview = withdrawalPreview ?? (DEV_UNLOCK_PAYOUT ? DEV_MOCK_PREVIEW : null);
      if (currentStep === 2) return selectedMethod && !!effectivePreview && (DEV_UNLOCK_PAYOUT || !withdrawalPreviewError);
      if (currentStep === 3) {
        // DEV_UNLOCK_PAYOUT: skip the 2-second step-3 display timer
        const timerOk = DEV_UNLOCK_PAYOUT || step3MinDisplayElapsed;
        return paymentDetails.name.trim() && paymentDetails.number.trim() && paymentDetails.email.trim() && !!effectivePreview && timerOk;
      }
      return false;
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
        {/* Hero Section - Dashboard Style */}
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isPayoutHeroToggled ? "#FAF9F5" : "#141413",
            borderColor: isPayoutHeroToggled ? "#141413" : "#FAF9F5",
            boxShadow: isPayoutHeroToggled
              ? "0 4px 20px rgba(20, 20, 19,0.06)"
              : "0 8px 30px rgba(20, 20, 19,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsPayoutHeroToggled)}
          className={cn(
            "rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden group border-2 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isPayoutHeroToggled ? (
                <motion.h1
                  key="payout-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2rem,11vw,5rem)] md:text-9xl text-black"
                >
                  PAYOUT
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="payout-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-[clamp(2rem,11vw,5rem)] md:text-9xl text-white"
                >
                  PAYOUT
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* Main Content Area - Single Column Layout for Mobile, Two Column for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
          {/* Main Payout Interface - Full Width on Mobile, 2/3 width on Desktop */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 }
            }}
            className="lg:col-span-2"
          >
            <div className="bg-white border-2 border-black rounded-2xl p-6 md:p-12 relative shadow-[0_12px_40px_rgba(20, 20, 19,0.06)]">
              {/* Step Content Container - Mobile Optimized */}
              <div className="min-h-[300px] md:min-h-[400px] flex flex-col justify-center overflow-hidden">
                <AnimatePresence mode="wait">
                  {/* Step 1: Timeframe Selector (Phase 9.1) — replaced keypad */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full max-w-sm md:max-w-lg mx-auto px-2 md:px-0"
                    >
                      <div className="text-center mb-4 md:mb-6">
                        <div className="text-[10px] md:text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">
                          Select Earning Period
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        {TIMEFRAME_OPTIONS.map(({ key, label }) => {
                          const data = timeframeBreakdown?.[key as keyof typeof timeframeBreakdown];
                          const realPts = data?.points ?? 0;
                          // DEV_UNLOCK_PAYOUT: treat every timeframe as having 50,000 mock pts
                          // so each option is selectable regardless of actual balance.
                          const pts = DEV_UNLOCK_PAYOUT && realPts === 0 ? 50000 : realPts;
                          const isSelected = selectedTimeframe === key;
                          const isEmpty = pts === 0;
                          return (
                            <motion.button
                              key={key}
                              disabled={isEmpty}
                              onClick={() => {
                                if (!isEmpty) {
                                  setSelectedTimeframe(key);
                                  setWithdrawAmount(String(pts));
                                }
                              }}
                              className={`w-full flex items-center justify-between p-3 md:p-4 border-2 rounded-xl transition-all duration-200 ${
                                isSelected
                                  ? "border-foreground bg-foreground text-background shadow-[0_8px_24px_rgba(20, 20, 19,0.12)]"
                                  : isEmpty
                                  ? "border-muted-foreground/20 bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"
                                  : "border-black/15 bg-white hover:border-primary/40 hover:shadow-[0_4px_16px_rgba(20, 20, 19,0.06)]"
                              }`}
                            >
                              <div className="text-left">
                                <div className={`text-xs font-black uppercase tracking-widest ${isSelected ? "text-background" : "text-foreground"}`}>{label}</div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>

                      {selectedTimeframe && withdrawAmount && (
                        <div className="p-3 bg-muted/30 rounded-xl text-center border border-muted">
                          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Selected</div>
                          <div className="text-2xl font-black text-foreground">Rs. {parseFloat(withdrawAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-base text-muted-foreground">PKR</span></div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Payment Method Selection - Mobile Optimized */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full max-w-lg md:max-w-2xl mx-auto px-2 md:px-0"
                    >
                      <div className="text-center mb-4 md:mb-8">
                        {isPreviewLoading && (
                          <div className="flex justify-center"><Skeleton className="h-3 w-48 rounded mt-1" /></div>
                        )}
                        {withdrawalPreview && (
                          <div className="text-sm md:text-base font-bold text-foreground/70">
                            Estimated Final Payout: ≈ Rs. {withdrawalPreview.exactPkr.toFixed(2)} gross · Rs. {withdrawalPreview.userNetPkr.toFixed(2)} net (after {withdrawalPreview.feePercent ?? 15}% fee)
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 md:gap-4 mb-4 md:mb-6">
                        {paymentMethods.map((method) => {
                          const LogoComponent = method.LogoComponent;
                          const isSelected = selectedMethod === method.id;

                          return (
                            <motion.button
                              key={method.id}
                              initial={false}
                              animate={{
                                backgroundColor: isSelected ? '#141413' : '#FAF9F5',
                                borderColor: isSelected ? '#141413' : 'rgba(20, 20, 19,0.15)',
                                boxShadow: isSelected ? '0 8px 24px rgba(20, 20, 19,0.14)' : '0px 0px 0px rgba(20, 20, 19,0)'
                              }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              onClick={() => setSelectedMethod(method.id)}
                              className={`payment-method-selection-card flex items-center p-3 md:p-4 lg:p-6 rounded-2xl border-2 w-full transition-shadow duration-300 ${isSelected ? 'selected' : ''}`}
                            >
                              <div className="mr-3 md:mr-4 lg:mr-6">
                                <LogoComponent className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20" />
                              </div>
                              <div className="flex-1 text-left">
                                <TechnicalLabel
                                  text={method.name}
                                  className={`font-black text-xs md:text-sm ${isSelected ? 'text-white' : 'text-foreground'
                                    }`}
                                />
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Payment Details Input - Mobile Optimized */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full max-w-sm md:max-w-lg mx-auto px-2 md:px-0"
                    >
                      <div className="text-center mb-4 md:mb-8">
                        {/* Header Removed */}
                      </div>

                      <div className="space-y-4 md:space-y-6">
                        <div className="space-y-4">
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                          >
                            <TechnicalLabel text="Full Name" className="text-foreground mb-2 md:mb-3 text-xs md:text-sm font-black" />
                            <div className="relative">
                              <Input
                                type="text"
                                value={paymentDetails.name}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, name: e.target.value }))}
                                className="h-12 md:h-14 text-sm md:text-base rounded-xl border border-black/15 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                              />
                              {!paymentDetails.name && (
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
                            <TechnicalLabel text="Account No." className="text-foreground mb-2 md:mb-3 text-xs md:text-sm font-black" />
                            <div className="relative">
                              <Input
                                type="text"
                                value={paymentDetails.number}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, number: e.target.value }))}
                                className="h-12 md:h-14 text-sm md:text-base rounded-xl border border-black/15 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                              />
                              {!paymentDetails.number && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['03001234567', '03217654321', '03450000000']} />
                                </div>
                              )}
                            </div>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                          >
                            <TechnicalLabel text="Email" className="text-foreground mb-2 md:mb-3 text-xs md:text-sm font-black" />
                            <div className="relative">
                              <Input
                                type="email"
                                value={paymentDetails.email}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, email: e.target.value }))}
                                className="h-12 md:h-14 text-sm md:text-base rounded-xl border border-black/15 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                              />
                              {!paymentDetails.email && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['user@example.com', 'support@thorx.site', 'payout@thorx.site']} />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      </div>

                      {/* Payment Summary Area */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="mt-6 md:mt-8 pt-6 border-t border-black/10"
                      >
                        <TechnicalLabel text="PAYOUT SUMMARY" className="mb-4 font-black text-xs md:text-sm" />
                        <div className="bg-muted/5 border border-black/15 rounded-2xl p-4 md:p-6 space-y-3">
                          <div className="flex justify-between items-center text-sm md:text-base">
                            <span className="font-bold text-muted-foreground">Requested</span>
                            <span className="font-black text-foreground">{formatCurrency(withdrawAmount || "0")}</span>
                          </div>

                          <div className="flex justify-between items-center text-sm md:text-base">
                            <span className="font-bold text-muted-foreground">PKR Value</span>
                            <span className="font-black text-foreground">
                              {isPreviewLoading ? <Skeleton className="h-5 w-24 rounded inline-block" /> : withdrawalPreview ? `Rs. ${withdrawalPreview.exactPkr.toFixed(2)}` : "—"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-sm md:text-base">
                            <span className="font-bold text-muted-foreground flex items-center gap-2">
                              Fee
                              <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded-sm">{withdrawalPreview?.feePercent ?? WITHDRAWAL_FEE_PERCENT}%</span>
                            </span>
                            <span className="font-black text-red-500">
                              {isPreviewLoading ? <Skeleton className="h-5 w-20 rounded inline-block" /> : withdrawalPreview ? `-Rs. ${withdrawalPreview.platformFee.toFixed(2)}` : "—"}
                            </span>
                          </div>

                          {withdrawalPreview?.referrerName && (
                            <>
                              <div className="my-2 border-t border-dashed border-black/20" />
                              <div className="flex justify-between items-center text-xs md:text-sm">
                                <span className="text-muted-foreground font-bold">Referrer Share (of fee above)</span>
                                <span className="text-foreground font-black">Rs. {withdrawalPreview.referralCommission.toFixed(2)}</span>
                              </div>
                            </>
                          )}

                          {withdrawalPreview?.sRankFastTrack && (
                            <div className="flex justify-between items-center text-xs md:text-sm">
                              <span className="text-amber-500 font-bold uppercase tracking-widest">S-Rank Fast Track</span>
                              <span className="text-amber-500 font-black">Instant Approval</span>
                            </div>
                          )}

                          {selectedMethod && paymentDetails.number && (
                            <div className="flex justify-between items-center text-xs md:text-sm">
                              <span className="font-bold text-muted-foreground">Payment Method</span>
                              <span className="font-black text-foreground">
                                {paymentMethods.find(m => m.id === selectedMethod)?.name || selectedMethod}
                                {" "}●●●● {paymentDetails.number.slice(-4)}
                              </span>
                            </div>
                          )}

                          <div className="my-2 border-t border-black/15" />

                          <div className="flex justify-between items-center text-base md:text-lg lg:text-xl">
                            <span className="font-black text-foreground uppercase tracking-tight">Total</span>
                            <span className="font-black text-primary bg-black rounded-lg px-3 py-2 text-xl md:text-2xl">
                              {withdrawalPreview ? `Rs. ${withdrawalPreview.userNetPkr.toFixed(2)}` : "—"}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Navigation Buttons - Mobile Optimized */}
              <div className="border-t border-black/15 pt-4 md:pt-6 mt-4 md:mt-8">
                <div className={`flex items-center gap-3 ${currentStep > 1 ? "justify-between" : "justify-end"}`}>
                  {currentStep > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCurrentStep(prev => prev - 1)}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-black/20 bg-white px-4 py-2.5 text-xs font-black tracking-widest text-foreground transition-colors hover:border-black hover:bg-black hover:text-white sm:px-6"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>BACK</span>
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={!canProceed() || (currentStep === 3 && isProcessing)}
                    onClick={handleNext}
                    aria-label={currentStep === 3 ? "Send payout request" : "Continue to next step"}
                    className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-black tracking-widest transition-all sm:flex-none sm:px-6 md:px-8 ${canProceed() && !(currentStep === 3 && isProcessing)
                      ? currentStep === 3
                        ? "border-black bg-black text-white shadow-[0_8px_24px_rgba(20, 20, 19,0.18)] hover:-translate-y-0.5 hover:bg-black hover:text-white hover:shadow-[0_12px_28px_rgba(20, 20, 19,0.24)]"
                        : "border-black bg-black text-white shadow-[0_8px_24px_rgba(20, 20, 19,0.12)] hover:bg-white hover:text-black"
                      : "cursor-not-allowed border-black/20 bg-[#E8E5D8] text-black/50 shadow-none"
                      }`}
                  >
                    {isProcessing && currentStep === 3 ? (
                      <>
                        <ThorxSpinner size={16} />
                        SUBMITTING...
                      </>
                    ) : (
                      <>
                        {currentStep === 3 ? "SEND" : "CONTINUE"}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Side Panel - Hidden on Mobile, Visible on Desktop */}
          <div className="hidden lg:block lg:col-span-1 space-y-8">
            {/* Professional History Button */}
            <motion.div
              variants={{
                initial: { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 }
              }
              }
              className="bg-white border border-black/15 rounded-2xl p-6 shadow-[0_12px_40px_rgba(20, 20, 19,0.06)]"
            >
              <TechnicalLabel text="HISTORY" className="text-foreground font-black text-sm mb-4" />
              <Button
                onClick={() => setShowHistory(!showHistory)}
                variant="outline"
                className="w-full border-2 border-black rounded-xl text-foreground hover:bg-black hover:text-white py-3 font-black transition-all"
              >
                <History className="w-4 h-4 mr-2" />
                {showHistory ? 'HIDE HISTORY' : 'VIEW HISTORY'}
              </Button>

              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 overflow-hidden border-t border-black/15 pt-4"
                  >
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {withdrawalsHistory && withdrawalsHistory.length > 0 ? (
                        withdrawalsHistory.slice(0, 5).map((item: any, idx: number) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-muted/5 border border-black/10 rounded-xl p-3 group hover:border-primary/40 transition-all border-l-4 border-l-primary"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <TechnicalLabel text={item.method} className="text-foreground font-black text-xs" />
                              <div className={cn(
                                "text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter whitespace-nowrap",
                                item.status === 'pending' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                                  item.status === 'completed' ? "bg-green-500/10 text-green-600 border border-green-500/20" :
                                    "bg-red-500/10 text-red-600 border border-red-500/20"
                              )}>
                                {item.status === 'pending' ? 'PENDING' : item.status === 'completed' ? 'TRANSFERRED' : 'REJECTED'}
                              </div>
                            </div>
                            <div className="text-sm font-black text-primary mb-0.5">{formatCurrency(item.amount)} PTS</div>
                            <div className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="text-center py-6">
                          <div className="text-xs text-muted-foreground italic">No payout history yet.</div>
                        </div>
                      )}
                    </div>
                    {withdrawalsHistory && withdrawalsHistory.length > 5 && (
                      <div className="text-center mt-3">
                        <TechnicalLabel text={`+${withdrawalsHistory.length - 5} MORE TRANSACTIONS`} className="text-muted-foreground text-xs" />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Help & Support */}
            <motion.div
              variants={{
                initial: { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 }
              }
              }
              whileHover={{ scale: 1.02 }}
              className="bg-white border border-black/15 rounded-2xl p-6 shadow-[0_12px_40px_rgba(20, 20, 19,0.06)] transition-all duration-300"
            >
              <TechnicalLabel text="NEED HELP?" className="text-foreground font-black text-sm mb-4" />
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full border-2 border-black rounded-xl text-foreground hover:bg-black hover:text-white py-2 font-black text-xs transition-all"
                  onClick={() => navigateToSection(5)} // Navigate to help section
                >
                  <LifeBuoy className="w-4 h-4 mr-2" />
                  GET SUPPORT
                </Button>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Mobile Transaction History - Show Below Main Interface */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 30 },
            animate: { opacity: 1, y: 0 }
          }}
          className="lg:hidden mt-6"
        >
          <div className="bg-white border border-black/15 rounded-2xl p-3 md:p-4 shadow-[0_12px_40px_rgba(20, 20, 19,0.06)]">
            <TechnicalLabel text="HISTORY" className="text-foreground font-black text-sm mb-4" />
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant="outline"
              className="w-full border-2 border-black rounded-xl text-foreground hover:bg-black hover:text-white py-2 md:py-3 font-black text-sm transition-all"
            >
              <History className="w-3 h-3 md:w-4 md:h-4 mr-2" />
              {showHistory ? 'HIDE HISTORY' : 'VIEW HISTORY'}
            </Button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 overflow-hidden border-t border-black/15 pt-4"
                >
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {withdrawalsHistory && withdrawalsHistory.length > 0 ? (
                      withdrawalsHistory.slice(0, 5).map((item: any, idx: number) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          whileHover={{ scale: 1.02 }}
                          className="p-3 rounded-xl border border-black/10 bg-muted/5 hover:border-primary/40 hover:bg-white transition-all"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <TechnicalLabel text={item.method} className="text-foreground font-black text-xs" />
                            <div className={cn(
                              "text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter whitespace-nowrap",
                              item.status === 'pending' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                                item.status === 'completed' ? "bg-green-500/10 text-green-600 border border-green-500/20" :
                                  "bg-red-500/10 text-red-600 border border-red-500/20"
                            )}>
                              {item.status === 'pending' ? 'PENDING' : item.status === 'completed' ? 'TRANSFERRED' : 'REJECTED'}
                            </div>
                          </div>
                          <div className="text-sm font-black text-primary mb-0.5">{formatCurrency(item.amount)} PTS</div>
                          <div className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center py-6">
                        <div className="text-xs text-muted-foreground italic">No payout history yet.</div>
                      </div>
                    )}
                  </div>
                  {withdrawalsHistory && withdrawalsHistory.length > 5 && (
                    <div className="text-center mt-3">
                      <TechnicalLabel text={`+${withdrawalsHistory.length - 5} MORE TRANSACTIONS`} className="text-muted-foreground text-xs" />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

      </motion.div>
    );
  }

