"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Barcode from "@/components/ui/barcode";
import TechnicalLabel from "@/components/ui/technical-label";
import SectionHeader from "@/components/sections/section-header";

interface FAQSectionProps {
  isActive: boolean;
  onAdvance?: () => void;
}

const allFaqData = [
  {
    id: "001",
    protocol: "PLATFORM-OVERVIEW",
    question: "What is THORX?",
    answer: "THORX is an AI-powered digital engagement platform that connects businesses with verified human attention while enabling users to earn TX-Points through meaningful online activities. Our three-engine architecture: Engine A (Attention Marketplace), Engine B (Paid Surveys), and Engine C (Guild Social Hub) — all backed by multi-layer AI fraud prevention."
  },
  {
    id: "002",
    protocol: "EARNING-MODEL",
    question: "How do I earn TX-Points on THORX?",
    answer: "Three earning streams: 1) Engine A — Watch 15–25 second video ads then actively explore the advertiser's page for 15 seconds inside our AI sandbox. 2) Engine B — Complete paid surveys from trusted partner networks and earn on every approved completion. 3) Engine C — Join a Guild to earn bonus TX-Points from weekly tasks and a share of your Guild's Weekly Bonus Pool, plus earn direct referral commissions."
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
    answer: "THORX has six personal ranks, driven entirely by your Performance Score (PS): E-Rank → D-Rank → C-Rank → B-Rank → A-Rank → S-Rank. Higher ranks unlock Engine B paid surveys (C-Rank+), wider Thorx Card variance bonuses (A-Rank, S-Rank), instant-approved withdrawals (S-Rank), and entry to guilds that require a higher rank. Guild creation itself is open at any rank — admin approval is the gate. Guild Ranks (E through S) are separate — they track your Guild's collective weekly performance."
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
    answer: "Yes. THORX operates within a strict halal-based earning model. All video advertisements and survey partners undergo content filtering — no haram or inappropriate material is promoted. Earnings are based on genuine work (verified human attention and engagement), not passive income, interest, or gambling. TX-Points are earned, not speculated."
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
    question: "What is Engine B — Paid Surveys?",
    answer: "Engine B is the high-yield survey system. Trusted partner networks (CPX Research, BitLabs) serve surveys matched to your profile from the Survey Wall. Complete a survey honestly and the partner confirms it via a secure server-to-server signal — your reward is credited automatically, with daily limits keeping quality high. No proof uploads, no waiting on manual approvals."
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
}

const FAQCell = ({ faq }: FAQCellProps) => (
  <div className="p-6 md:p-10 h-full flex flex-col gap-4 md:gap-5 relative group bg-white transition-colors duration-300 hover:bg-[#FFFCF6]">
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[9px] md:text-[10px] font-medium tracking-[0.16em] text-black/35 uppercase truncate">
        {faq.id} / {faq.protocol}
      </span>
      <span className="size-1 rounded-[2px] bg-black/15 shrink-0 transition-colors duration-300 group-hover:bg-primary" />
    </div>

    <div>
      <h3 className="text-lg md:text-xl font-extrabold uppercase tracking-tight leading-snug text-black transition-colors duration-300 group-hover:text-primary">
        {faq.question}
      </h3>
      <p className="mt-3 md:mt-4 text-[13px] md:text-sm leading-relaxed font-medium text-black/55">
        {faq.answer}
      </p>
    </div>
  </div>
);

export default function FAQSection({ isActive, onAdvance }: FAQSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const hiddenCount = allFaqData.length - INITIAL_COUNT;

  return (
    <section
      className={`cinematic-section ${isActive ? 'active' : ''}`}
      data-testid="faq-section"
      data-section="4"
    >
      <div className="container mx-auto w-full max-w-[1440px] pt-4 md:pt-8 pb-16 md:pb-24">
        <SectionHeader
          index="04"
          label="PROTOCOLS"
          countLabel={`${String(allFaqData.length).padStart(2, "0")} ENTRIES`}
          title="FAQ."
          isActive={isActive}
        />

        {/* Precision hairline panel */}
        <div className="rounded-2xl border border-black/10 bg-black/10 overflow-hidden">
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
            {allFaqData.slice(0, INITIAL_COUNT).map((faq) => (
              <FAQCell key={faq.id} faq={faq} />
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
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-px mt-px">
                  {allFaqData.slice(INITIAL_COUNT).map((faq) => (
                    <FAQCell key={faq.id} faq={faq} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!showAll && (
          <div className="mt-8 md:mt-10 flex flex-col items-center">
            <button
              onClick={() => setShowAll(true)}
              className="thx-btn thx-btn-md thx-btn-outline"
              aria-label="Show more questions"
              data-testid="button-faq-show-all"
            >
              SHOW ALL PROTOCOLS
              <span className="text-primary">(+{hiddenCount})</span>
            </button>
          </div>
        )}

        {/* Closing CTA band */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl bg-black mt-12 md:mt-16",
            "p-7 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6 md:gap-10"
          )}
        >
          <Barcode variant="bold" color="currentColor" className="absolute top-6 right-6 w-24 h-6 text-white/15 hidden md:block" />
          <div className="min-w-0">
            <TechnicalLabel text="[ FINAL CALL ]" className="text-white/40" />
            <h2 className="thx-display uppercase text-white text-3xl sm:text-4xl md:text-5xl mt-2 md:mt-3">
              Ready to turn{" "}
              <em className="thx-accent text-primary">attention</em>
              <br className="hidden md:block" /> into income?
            </h2>
            <div className="mt-3 md:mt-4 hidden sm:block">
              <TechnicalLabel text="FREE ACCOUNT · PKR PAYOUTS · NO APP REQUIRED" className="text-white/35" />
            </div>
          </div>
          <button
            type="button"
            onClick={onAdvance}
            className="thx-btn thx-btn-lg thx-btn-accent w-full md:w-auto shrink-0 focus-visible:ring-offset-black"
            aria-label="Create free account"
            data-testid="button-faq-cta"
          >
            CREATE FREE ACCOUNT
            <ArrowRight className="size-4 opacity-80" />
          </button>
        </div>
      </div>
    </section>
  );
}
