"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import TechnicalLabel from "@/components/ui/technical-label";
import { VariableFontHoverByRandomLetter } from "@/components/ui/variable-font-hover";
import { CinematicBlockReveal } from "@/components/ui/cinematic-block-reveal";

// Interactive Divider Component
const InteractiveDivider = ({ orientation = "horizontal", className = "" }: { orientation?: "horizontal" | "vertical", className?: string }) => {
  const [isOrange, setIsOrange] = useState(false);

  const handleClick = () => {
    setIsOrange(true);
    setTimeout(() => {
      setIsOrange(false);
    }, 3000);
  };

  if (orientation === "vertical") {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "w-[3px] self-stretch bg-black/10 dark:bg-white/10 cursor-pointer overflow-hidden relative",
          className
        )}
      >
        <AnimatePresence>
          {isOrange && (
            <motion.div
              initial={{ scaleY: 0, opacity: 1 }}
              animate={{ scaleY: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: "linear" }}
              style={{ transformOrigin: "top" }}
              className="absolute inset-0 bg-primary"
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "w-full h-[3px] bg-black/10 dark:bg-white/10 cursor-pointer overflow-hidden relative",
        className
      )}
    >
      <AnimatePresence>
        {isOrange && (
          <motion.div
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: "linear" }}
            style={{ transformOrigin: "left" }}
            className="absolute inset-0 bg-primary"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

interface FAQSectionProps {
  isActive: boolean;
}

const allFaqData = [
  {
    id: "001",
    protocol: "PLATFORM-OVERVIEW",
    question: "What is THORX?",
    answer: "THORX is an AI-powered digital engagement platform that connects businesses with verified human attention while enabling users to earn TX-Points through meaningful online activities. Our three-engine architecture: Engine A (Attention Marketplace), Engine B (AI-Driven CPA Offers), and Engine C (Guild Social Hub) — all backed by multi-layer AI fraud prevention."
  },
  {
    id: "002",
    protocol: "EARNING-MODEL",
    question: "How do I earn TX-Points on THORX?",
    answer: "Three earning streams: 1) Engine A — Watch 15–25 second video ads then actively explore the advertiser's page for 15 seconds inside our AI sandbox. 2) Engine B — Complete curated CPA tasks (app downloads, reviews, registrations) with AI-verified proof submission. 3) Engine C — Join a Guild to earn bonus TX-Points from weekly tasks and a share of your Guild's Weekly Bonus Pool, plus earn direct referral commissions."
  },
  {
    id: "003",
    protocol: "POINTS-SYSTEM",
    question: "What are TX-Points and how do they work?",
    answer: "TX-Points are THORX's universal earning unit — they represent your real value on the platform without exposing raw currency figures. Every ad view, task completion, and referral commission is credited as TX-Points in real time. When you're ready to cash out, you enter the Conversion Room to convert TX-Points into real PKR, which is then sent to your JazzCash or EasyPaisa account."
  },
  {
    id: "004",
    protocol: "CONVERSION-ROOM",
    question: "How do I convert TX-Points to real money?",
    answer: "Navigate to the Payout section and enter the Conversion Room. You'll see exactly how many TX-Points you hold and the current conversion rate to PKR. Select an amount to convert, review the platform fee (deducted in TX-Points based on your rank), confirm — and your PKR balance is queued for transfer to JazzCash or EasyPaisa. This is the only screen where PKR amounts are shown."
  },
  {
    id: "005",
    protocol: "ENGINE-C",
    question: "What is Engine C — the Guild Social Hub?",
    answer: "Engine C is THORX's social gaming hub. It has two spaces: 1) The Public Space (open to all) — browse guild profiles, rankings, and performance boards, then apply to join one. 2) The Private Member Dashboard — exclusive to guild members: real-time team chat, weekly task panels with bonus TX-Point rewards, a live Weekly Bonus Pool tracker, and guild roster with contribution stats."
  },
  {
    id: "006",
    protocol: "WEEKLY-BONUS-POOL",
    question: "How does the Guild Weekly Bonus Pool work?",
    answer: "A share of every Engine C task your Guild completes is automatically contributed to your Guild's Weekly Bonus Pool. At the end of each week, if your Guild hits its collective point target, the pool is distributed — 30% to the Captain, 70% split among members proportional to their weekly contribution. If the target is missed, the pool is voided and the week resets. This incentivizes coordinated teamwork."
  },
  {
    id: "007",
    protocol: "WEEKLY-TASKS",
    question: "What are Weekly Tasks?",
    answer: "Weekly Tasks are exclusive high-reward missions available only to active Guild members in Engine C. Each week, a fresh set of tasks appears in your Member Dashboard. Completing them earns bonus TX-Points credited directly to your wallet, separate from your ad or referral earnings. Solo users (not in any Guild) cannot access Weekly Tasks — another strong incentive to join one."
  },
  {
    id: "008",
    protocol: "REFERRAL-SYSTEM",
    question: "How does the Referral Commission work?",
    answer: "THORX operates a direct (single-level) referral system. Share your referral link — when someone you referred withdraws, you receive a share of their withdrawal's platform fee, credited as real PKR to your separate Referral Cash Balance (withdrawable on its own, never mixed with your TX-Points). It's simple, transparent, and scales with how active your referred users are. There are no multi-level tiers or hidden splits."
  },
  {
    id: "009",
    protocol: "RANKING-SYSTEM",
    question: "What are the user ranks and how do they work?",
    answer: "THORX has six personal ranks, driven entirely by your Performance Score (PS): E-Rank → D-Rank → C-Rank → B-Rank → A-Rank → S-Rank. Higher ranks unlock Engine B access (C-Rank+), guild creation (B-Rank+), wider Thorx Card variance bonuses (A-Rank, S-Rank), and instant-approved withdrawals (S-Rank). Guild Ranks (E through S) are separate — they track your Guild's collective weekly performance."
  },
  {
    id: "010",
    protocol: "PAYOUT-METHODS",
    question: "How do I withdraw my earnings?",
    answer: "Access is always open in the Payout section — no daily task completion required. Enter the Conversion Room, convert the TX-Points you want, then select JazzCash or EasyPaisa and enter your account details. S-Rank users have their withdrawals auto-approved instantly. The minimum conversion threshold is shown in your Wallet section."
  },
  {
    id: "011",
    protocol: "ATTENTION-REQUIREMENT",
    question: "What does 'Turn Attention into Currency' mean?",
    answer: "THORX's hidden AI Attention Detector tracks three real behavioral signals: Tab Visibility (pauses if you switch tabs), Micro-Movement Delta (detects cursor or touch activity), and Scroll Vector (confirms you've scrolled at least 10–20% of the page). All three must pass before TX-Points are credited. Genuine attention is the product — no shortcuts allowed."
  },
  {
    id: "012",
    protocol: "HALAL-ECOSYSTEM",
    question: "Is THORX earning Halal?",
    answer: "Yes. THORX operates within a strict halal-based earning model. All video advertisements and CPA offers undergo content filtering — no haram or inappropriate material is promoted. Earnings are based on genuine work (verified human attention and engagement), not passive income, interest, or gambling. TX-Points are earned, not speculated."
  },
  {
    id: "013",
    protocol: "ENGINE-A",
    question: "What is Engine A — the Attention Marketplace?",
    answer: "Engine A is the core earning engine. Phase 1: You watch a 15–25 second video ad via our Waterfall Video Player (if one ad network is empty, the next loads instantly). Phase 2: The advertiser's landing page loads inside a secure THORX sandbox. You must actively explore it for 15 seconds. A hidden AI behavioral tracker verifies genuine attention before crediting TX-Points."
  },
  {
    id: "014",
    protocol: "ENGINE-B",
    question: "What is Engine B — AI-Driven CPA Offers?",
    answer: "Engine B is the high-yield task system. The THORX team curates reliable offers from top CPA networks (app downloads, reviews, registrations). You complete the task and upload proof. Our AI Agent runs a multi-tier fraud check: metadata/hash duplicate detection, OCR + LLM screenshot verification, and escrow release — ensuring fair, fast TX-Points for real work."
  },
  {
    id: "015",
    protocol: "SECURITY",
    question: "Is THORX secure and my data safe?",
    answer: "Yes. THORX uses secure session-based authentication, encrypted data handling, CSRF protection, rate limiting, and AI-powered fraud prevention on every interaction. The platform is web-first by design — no app download needed — which allows immediate security patches to be deployed without app store delays. Your account data is never sold or shared."
  }
];

const INITIAL_COUNT = 4;

interface FAQCellProps {
  faq: typeof allFaqData[0];
  index: number;
}

const FAQCell = ({ faq, index }: FAQCellProps) => (
  <div className="p-8 md:p-12 h-full flex flex-col space-y-6 relative group transition-colors duration-300 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
    <div className="flex justify-between items-center">
      <div className="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-sm">
        <TechnicalLabel
          text={faq.protocol}
          className="text-black/40 dark:text-white/40 text-[8px] md:text-[9px] font-black tracking-widest"
        />
      </div>
      <span className="text-[10px] md:text-xs font-mono opacity-20 font-black">ID://{faq.id}</span>
    </div>

    <div className="space-y-4">
      <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter leading-none group-hover:text-primary transition-colors duration-300">
        {faq.question}
      </h3>
      <div className="w-12 h-0.5 bg-primary/30" />
      <p className="text-sm md:text-base text-black/70 dark:text-white/70 font-bold leading-relaxed">
        {faq.answer}
      </p>
    </div>
  </div>
);

export default function FAQSection({ isActive }: FAQSectionProps) {
  const [showAll, setShowAll] = useState(false);

  return (
    <section
      className={`cinematic-section ${isActive ? 'active' : ''} bg-[#EAE5DD] dark:bg-black pt-44 md:pt-[320px] pb-24 px-4 overflow-y-auto`}
      data-testid="faq-section"
    >
      <div className="container mx-auto max-w-7xl">
        <div className="text-left mb-16 md:mb-24">
          <CinematicBlockReveal
            trigger={isActive}
            blockColor="#ff6b00"
          >
            <div className="py-2">
              <VariableFontHoverByRandomLetter
                label="FAQ."
                className="font-black uppercase tracking-tighter text-4xl md:text-7xl lg:text-8xl leading-tight text-black dark:text-white"
                fromFontVariationSettings="'wght' 900, 'slnt' 0"
                toFontVariationSettings="'wght' 400, 'slnt' -10"
              />
            </div>
          </CinematicBlockReveal>
        </div>

        <div className="border-[3px] border-black/15 dark:border-white/10 overflow-hidden bg-white dark:bg-white/5">
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {allFaqData.slice(0, INITIAL_COUNT).map((faq, index) => (
              <div key={faq.id} className="relative flex flex-col h-full overflow-hidden">
                <FAQCell faq={faq} index={index} />

                {/* Vertical Divider (Desktop) */}
                {index % 2 === 0 && (
                  <InteractiveDivider
                    orientation="vertical"
                    className="hidden lg:block absolute right-0 top-0 bottom-0 opacity-30"
                  />
                )}

                {/* Horizontal Divider (Mobile Always, Desktop only between rows) */}
                <InteractiveDivider
                  orientation="horizontal"
                  className={cn(
                    "opacity-30",
                    index < 2 ? "lg:hidden" : "" // Hide horizontal divider on desktop's first row
                  )}
                />
              </div>
            ))}
          </div>

          {/* Hidden Grid Area */}
          <AnimatePresence>
            {showAll && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden border-t-[3px] border-black/10 dark:border-white/10"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  {allFaqData.slice(INITIAL_COUNT).map((faq, index) => (
                    <div key={faq.id} className="relative flex flex-col h-full overflow-hidden">
                      <FAQCell faq={faq} index={index + INITIAL_COUNT} />

                      {/* Vertical Divider (Desktop) */}
                      {index % 2 === 0 && (
                        <InteractiveDivider
                          orientation="vertical"
                          className="hidden lg:block absolute right-0 top-0 bottom-0 opacity-30"
                        />
                      )}

                      {/* Horizontal Divider */}
                      {index < allFaqData.length - INITIAL_COUNT - 1 && (
                        <InteractiveDivider
                          orientation="horizontal"
                          className="opacity-30"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!showAll && (
          <div className="mt-16 flex flex-col items-center">
            <button
              onClick={() => setShowAll(true)}
              className="flex items-center gap-3 group p-6 transition-all duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Show more questions"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-4 md:size-6 bg-black dark:bg-white rounded-full transition-all duration-300 group-hover:bg-primary"
                />
              ))}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
