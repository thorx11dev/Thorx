import React, { FC } from "react";
import { cn } from "@/lib/utils";
import { Play, Users, Clock, ShieldCheck, TrendingUp } from "lucide-react";
import TextBlockAnimation from "@/components/ui/text-block-animation";
import SectionHeader from "@/components/sections/section-header";

interface FeatureCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  tags?: string[];
}

const cardContents: FeatureCard[] = [
    {
        title: "Attention Marketplace",
        description: "Watch 15–25 second video ads via our Waterfall Player, then actively explore the advertiser's page inside a secure AI sandbox. Our hidden behavioral tracker verifies genuine attention before crediting your wallet — zero bot tolerance.",
        icon: <Play className="size-[18px] text-black" strokeWidth={1.75} />,
        tags: ["WATERFALL PLAYER", "AI SANDBOX", "15S ACTIVE EXPLORE"],
    },
    {
        title: "Direct Referral Commission",
        description: "Invite others and earn 15% in TX-Points every time your direct referral converts their earnings. No tiers, no complexity — just pure, transparent direct-referral rewards that grow with your network.",
        icon: <Users className="size-[18px] text-black" strokeWidth={1.75} />,
        tags: ["15% COMMISSION", "TX-POINTS", "DIRECT ONLY"],
    },
    {
        title: "Net-First Wallet",
        description: "No surprise deductions at checkout. All fees are calculated silently in the background. What you see in your wallet is exactly what you receive in your JazzCash or EasyPaisa account.",
        icon: <Clock className="size-[18px] text-black" strokeWidth={1.75} />,
    },
    {
        title: "Paid Surveys",
        description: "Answer matched surveys from trusted partner networks inside the Survey Wall. Completions are confirmed via secure server-to-server signals — fair, fast payouts for real work, no proof uploads.",
        icon: <TrendingUp className="size-[18px] text-black" strokeWidth={1.75} />,
    },
    {
        title: "AI Fraud Prevention",
        description: "Every interaction is protected by multi-layer verification: the Super AI Attention Detector on ads, server-verified survey completions, and the LeadX intelligence system — guaranteeing a trusted ecosystem for earners and advertisers alike.",
        icon: <ShieldCheck className="size-[18px] text-black" strokeWidth={1.75} />,
        tags: ["SUPER AI DETECTOR", "LEADX"],
    },
];

interface PlusCardProps {
    className?: string;
    title: string;
    description: string;
    isActive: boolean;
    index: number;
    icon?: React.ReactNode;
    tags?: string[];
}

const PlusCard: FC<PlusCardProps> = ({ className = "", title, description, isActive, index, icon, tags }) => {
    return (
        <div
            className={cn(
                "group relative bg-white p-6 md:p-8 flex flex-col min-h-[190px] md:min-h-[230px]",
                "transition-colors duration-300 hover:bg-[#FFFCF6]",
                className
            )}
        >
            {/* Card header rail */}
            <div className="flex items-start justify-between mb-5 md:mb-auto">
                <div className="grid size-10 place-items-center rounded-lg border border-black/10 bg-background transition-colors duration-300 group-hover:border-primary/60">
                    {icon}
                </div>
                <span className="font-mono text-[11px] font-medium tracking-widest text-black/30 transition-colors duration-300 group-hover:text-primary">
                    {String(index + 1).padStart(2, "0")}
                </span>
            </div>

            <div className="mt-5 md:mt-8">
                <h3 className="text-lg md:text-xl font-extrabold tracking-tight text-black mb-2 md:mb-3 transition-colors duration-300">
                    {title}
                </h3>
                <TextBlockAnimation blockColor="#0a0a0a" duration={0.4} delay={0.15 + index * 0.05} animateOnScroll={false} trigger={isActive}>
                    <p className="text-[13px] md:text-sm leading-relaxed font-medium text-black/55">
                        {description}
                    </p>
                </TextBlockAnimation>
            </div>

            {tags && (
                <div className="hidden md:flex flex-wrap items-center gap-2 mt-auto pt-6">
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-md border border-black/10 px-2 py-1 font-mono text-[9px] font-medium tracking-[0.14em] text-black/40"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function EarningReveal({ isActive, onAdvance }: { isActive: boolean; onAdvance: () => void }) {
    return (
        <section
            className={`cinematic-section ${isActive ? 'active' : ''}`}
            data-section="2"
            data-testid="earning-reveal-section"
        >
            <div className="mx-auto w-full max-w-[1440px] pt-4 md:pt-8 pb-10 md:pb-16">
                <SectionHeader
                    index="02"
                    label="CAPABILITIES"
                    countLabel="05 MODULES"
                    title="HOW YOU EARN."
                    isActive={isActive}
                />

                {/* Precision hairline grid — cells separated by 1px rules */}
                <div className="grid grid-cols-1 lg:grid-cols-6 auto-rows-auto gap-px rounded-2xl border border-black/10 bg-black/10 overflow-hidden">
                    <PlusCard {...cardContents[0]} index={0} className="lg:col-span-3 lg:row-span-2" isActive={isActive} />
                    <PlusCard {...cardContents[1]} index={1} className="lg:col-span-3 lg:row-span-2" isActive={isActive} />

                    <PlusCard {...cardContents[2]} index={2} className="md:col-span-1 lg:col-span-2" isActive={isActive} />
                    <PlusCard {...cardContents[3]} index={3} className="md:col-span-1 lg:col-span-2" isActive={isActive} />
                    <PlusCard {...cardContents[4]} index={4} className="md:col-span-2 lg:col-span-2" isActive={isActive} />
                </div>
            </div>
        </section>
    );
}
