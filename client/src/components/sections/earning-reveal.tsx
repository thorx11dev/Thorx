import React, { FC } from "react";
import { cn } from "@/lib/utils";
import { Play, Users, Clock, ShieldCheck, TrendingUp } from "lucide-react";
import { CinematicBlockReveal } from "@/components/ui/cinematic-block-reveal";

const cardContents = [
    {
        title: "Attention Marketplace",
        description: "Watch 15–25 second video ads via our Waterfall Player, then actively explore the advertiser's page inside a secure AI sandbox. Our hidden behavioral tracker verifies genuine attention before crediting your wallet — zero bot tolerance.",
        icon: <Play className="size-5" />,
    },
    {
        title: "Direct Referral Commission",
        description: "Invite others and earn 15% in TX-Points every time your direct referral converts their earnings. No tiers, no complexity — just pure, transparent direct-referral rewards that grow with your network.",
        icon: <Users className="size-5" />,
    },
    {
        title: "Net-First Wallet",
        description: "No surprise deductions at checkout. All fees are calculated silently in the background. What you see in your wallet is exactly what you receive in your JazzCash or EasyPaisa account.",
        icon: <Clock className="size-5" />,
    },
    {
        title: "Paid Surveys",
        description: "Answer matched surveys from trusted partner networks inside the Survey Wall. Completions are confirmed via secure server-to-server signals — fair, fast payouts for real work, no proof uploads.",
        icon: <TrendingUp className="size-5" />,
    },
    {
        title: "AI Fraud Prevention",
        description: "Every interaction is protected by multi-layer verification: the Super AI Attention Detector on ads, server-verified survey completions, and the LeadX intelligence system — guaranteeing a trusted ecosystem for earners and advertisers alike.",
        icon: <ShieldCheck className="size-5" />,
    },
];

interface FeatureCardProps {
    className?: string;
    index: number;
    title: string;
    description: string;
    icon?: React.ReactNode;
    dark?: boolean;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
    className = "",
    index,
    title,
    description,
    icon,
    dark = false,
}) => {
    return (
        <div
            className={cn(
                "relative rounded-2xl p-6 md:p-8 min-h-[190px] md:min-h-[230px]",
                "flex flex-col transition-all duration-300 ease-out group",
                "hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(20,20,19,0.09)]",
                dark
                    ? "bg-[var(--ed-dark,#181715)] text-[var(--ed-on-dark,#faf9f5)]"
                    : "bg-[var(--ed-surface-card,#efe9de)] text-[var(--ed-ink,#141413)] border border-transparent hover:border-[#ddd3c6]",
                className
            )}
            data-testid={`feature-card-${index}`}
        >
            <div className="flex items-start justify-between mb-auto pb-6">
                <div
                    className={cn(
                        "w-11 h-11 rounded-lg flex items-center justify-center",
                        dark
                            ? "bg-white/10 text-[var(--ed-on-dark,#faf9f5)]"
                            : "bg-[var(--ed-surface-white,#fffefb)] text-[var(--ed-ink,#141413)] shadow-[0_1px_2px_rgba(20,20,19,0.05)]"
                    )}
                >
                    {icon}
                </div>
                <span
                    className={cn(
                        "thx-mono text-xs tracking-[0.18em]",
                        dark ? "text-[var(--ed-on-dark-soft,#a09d96)]" : "text-[var(--ed-muted-soft,#8e8b82)]"
                    )}
                >
                    /{String(index + 1).padStart(2, "0")}
                </span>
            </div>

            <h3
                className={cn(
                    "thx-display thx-display-3 mb-2.5",
                    dark ? "text-[var(--ed-on-dark,#faf9f5)]" : "text-[var(--ed-ink,#141413)]"
                )}
            >
                {title}
            </h3>
            <p
                className={cn(
                    "text-sm md:text-[15px] leading-relaxed font-normal",
                    dark ? "text-[var(--ed-on-dark-soft,#a09d96)]" : "text-[var(--ed-muted,#6c6a64)]"
                )}
            >
                {description}
            </p>
        </div>
    );
};

export default function EarningReveal({ isActive, onAdvance: _onAdvance }: { isActive: boolean; onAdvance?: () => void }) {
    return (
        <section
            className={`cinematic-section ${isActive ? 'active' : ''} bg-[var(--ed-canvas,#faf9f5)] pt-40 md:pt-[280px] pb-24 px-4`}
            data-section="2"
            data-testid="earning-reveal-section"
        >
            <div className="mx-auto w-full max-w-[1200px]">
                <div className="mb-12 md:mb-16">
                    <CinematicBlockReveal trigger={isActive} blockColor="#181715">
                        <p className="thx-kicker mb-4">Our Features</p>
                        <h2 className="thx-display thx-display-2 max-w-2xl text-[var(--ed-ink,#141413)]">
                            Five engines. One <em className="thx-accent">verified</em> economy.
                        </h2>
                    </CinematicBlockReveal>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 auto-rows-auto gap-5 md:gap-6">
                    <FeatureCard {...cardContents[0]} index={0} className="lg:col-span-3 lg:row-span-2" />
                    <FeatureCard {...cardContents[1]} index={1} className="lg:col-span-3 lg:row-span-2" />
                    <FeatureCard {...cardContents[2]} index={2} className="md:col-span-1 lg:col-span-2 lg:row-span-1" />
                    <FeatureCard {...cardContents[3]} index={3} className="md:col-span-1 lg:col-span-2 lg:row-span-1" />
                    <FeatureCard {...cardContents[4]} index={4} dark className="md:col-span-2 lg:col-span-2 lg:row-span-1" />
                </div>
            </div>
        </section>
    );
}
