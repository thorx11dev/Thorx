import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const faqItems: FaqItem[] = [
  {
    id: "001",
    category: "Getting Started",
    question: "What is THORX?",
    answer:
      "THORX is an AI-powered digital engagement platform that connects businesses with verified human attention while enabling users to earn real money through meaningful online activities. We operate Engine A (Attention Marketplace), Engine B (AI-Driven CPA Offers), and Engine C (Guild System & Referral Commissions) — all backed by multi-layer AI fraud prevention.",
  },
  {
    id: "002",
    category: "Getting Started",
    question: "How do I earn on THORX?",
    answer:
      "Three earning streams: 1) Engine A — Watch 15–25 second video ads, then actively explore the advertiser's page for 15 seconds inside our secure AI sandbox. 2) Engine B — Complete curated CPA tasks (app downloads, reviews, registrations) and submit proof for AI-verified payout. 3) Engine C — Join a Guild to earn weekly bonus TX-Points plus a share of your Guild's Weekly Bonus Pool, plus earn a passive referral commission whenever your direct referral withdraws their earnings.",
  },
  {
    id: "003",
    category: "Payouts & Fees",
    question: "What fees are deducted at withdrawal?",
    answer:
      "THORX uses a Net-First UI — your wallet always shows exactly what you can withdraw, with all fees already calculated in the background. A flat 15% withdrawal fee is deducted from every payout request — this is the same whether you were referred or not. If you joined via a referral link, a portion of that 15% is shared with your referrer at no extra cost to you. What you see in your wallet balance is exactly what you receive.",
  },
  {
    id: "004",
    category: "Referrals",
    question: "How does the referral commission system work?",
    answer:
      "When your direct referral requests a payout, a 15% withdrawal fee is deducted from their earnings. A share of that fee is credited to you as a lifetime referral commission — automatically, at no extra cost to the withdrawing user. You earn this passive income for every payout your referral makes, forever.",
  },
  {
    id: "005",
    category: "Ranks",
    question: "What are the user ranks?",
    answer:
      "Your rank is driven entirely by your Performance Score (PS), earned from completing tasks and maintaining a daily streak. Ranks: E-Rank → D-Rank → C-Rank (unlocks Engine B CPA offers) → B-Rank → A-Rank (wider Thorx Card variance) → S-Rank (instant-approved withdrawals). Guild creation is open at every rank — admin approval is the gate. Totals earned or referred don't affect your rank directly — only PS does.",
  },
  {
    id: "006",
    category: "Payouts & Fees",
    question: "How do I withdraw my earnings?",
    answer:
      "Withdrawals are sent directly to JazzCash or EasyPaisa. Access is always open — no daily task completion required. S-Rank users have their withdrawals auto-approved instantly. A flat 15% withdrawal fee is deducted from every payout; the preview screen shows the exact breakdown before you confirm.",
  },
  {
    id: "007",
    category: "How It Works",
    question: "How does the AI Attention Detector work?",
    answer:
      "When you complete an ad task, a hidden AI system tracks three behavioral signals simultaneously: Tab Visibility API (pauses your timer if you switch tabs or minimize the window), Micro-Movement Delta (detects cursor coordinates or touch input to confirm the device is being actively used), and Scroll Vector (verifies you scrolled at least 10–20% of the page). All three must pass for a payout to be issued.",
  },
  {
    id: "008",
    category: "How It Works",
    question: "How does Engine B offer verification work?",
    answer:
      "After completing a CPA task, upload your screenshot or video proof. Our AI Agent runs a 3-tier check: Tier 1 — Metadata & hash extraction to catch duplicate or recycled proofs. Tier 2 — Advanced OCR + LLM analysis to verify target handles, comment text, and UI structures from your screenshot. Tier 3 — Approved tasks enter 'Pending' escrow before the admin panel releases to your wallet.",
  },
];

const CATEGORIES = ["All", "Getting Started", "How It Works", "Payouts & Fees", "Referrals", "Ranks"];

interface PortalFaqSectionProps {
  onChatClick?: () => void;
  onContactClick?: () => void;
}

export function PortalFaqSection({ onChatClick, onContactClick }: PortalFaqSectionProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [openId, setOpenId] = useState<string | null>(faqItems[0]?.id ?? null);

  const visibleItems =
    activeCategory === "All" ? faqItems : faqItems.filter((item) => item.category === activeCategory);

  return (
    <div>
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-8 md:mb-10">
        <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground mb-3">
          Frequently asked questions
        </h3>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8 md:mb-10">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => {
              setActiveCategory(category);
              setOpenId(null);
            }}
            className={cn(
              "px-4 py-2 rounded-full text-xs md:text-sm font-medium border transition-colors duration-200",
              activeCategory === category
                ? "bg-black text-white border-black"
                : "bg-white text-foreground/60 border-black/10 hover:border-black/25 hover:text-foreground"
            )}
            data-testid={`faq-filter-${category.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Accordion */}
      <div className="max-w-3xl mx-auto rounded-2xl border border-black/10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] divide-y divide-black/[0.06] overflow-hidden">
        {visibleItems.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div key={faq.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : faq.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 text-left px-5 md:px-7 py-5 md:py-6 hover:bg-black/[0.02] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
                data-testid={`faq-item-${faq.id}`}
              >
                <span className="text-[15px] md:text-base font-semibold text-foreground leading-snug">
                  {faq.question}
                </span>
                <span
                  className={cn(
                    "flex items-center justify-center shrink-0 w-8 h-8 rounded-full border transition-all duration-300",
                    isOpen
                      ? "bg-primary border-primary text-white rotate-180"
                      : "bg-transparent border-black/15 text-foreground/40"
                  )}
                >
                  <ChevronDown className="w-4 h-4" />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 md:px-7 pb-6 text-sm md:text-[15px] text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">Still need help?</p>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onChatClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs md:text-sm font-semibold bg-black text-white hover:bg-black/85 transition-colors duration-200"
            data-testid="faq-cta-chat"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Live chat
          </button>
          <button
            type="button"
            onClick={onContactClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs md:text-sm font-semibold border border-black/15 text-foreground hover:border-black/30 hover:bg-black/[0.02] transition-colors duration-200"
            data-testid="faq-cta-contact"
          >
            <Phone className="w-3.5 h-3.5" />
            Contact us
          </button>
        </div>
      </div>
    </div>
  );
}

export default PortalFaqSection;
