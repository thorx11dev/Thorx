import React, { FC } from "react";
import { cn } from "@/lib/utils";
import { Play, Users, Clock, ShieldCheck, TrendingUp, Plus } from "lucide-react";
import TextBlockAnimation from "@/components/ui/text-block-animation";
import { CinematicBlockReveal } from "@/components/ui/cinematic-block-reveal";
import { VariableFontHoverByRandomLetter } from "@/components/ui/variable-font-hover";

const cardContents = [
    {
        title: "Attention Marketplace",
        description: "Watch 15–25 second video ads via our Waterfall Player, then actively explore the advertiser's page inside a secure AI sandbox. Our hidden behavioral tracker verifies genuine attention before crediting your wallet — zero bot tolerance.",
        icon: <Play className="size-6 text-black dark:text-white" />,
    },
    {
        title: "Direct Referral Commission",
        description: "Invite others and earn 15% in TX-Points every time your direct referral converts their earnings. No tiers, no complexity — just pure, transparent direct-referral rewards that grow with your network.",
        icon: <Users className="size-6 text-black dark:text-white" />,
    },
    {
        title: "Net-First Wallet",
        description: "No surprise deductions at checkout. All fees are calculated silently in the background. What you see in your wallet is exactly what you receive in your JazzCash or EasyPaisa account.",
        icon: <Clock className="size-6 text-black dark:text-white" />,
    },
    {
        title: "AI-Driven CPA Offers",
        description: "Complete curated tasks from top CPA networks. Submit proof and our AI Agent runs a multi-tier fraud check — metadata analysis, OCR verification, and escrow release — ensuring fair, fast payouts for real work.",
        icon: <TrendingUp className="size-6 text-black dark:text-white" />,
    },
    {
        title: "AI Fraud Prevention",
        description: "Every interaction is protected by multi-layer verification: the Super AI Attention Detector on ads, automated proof vetting on tasks, and the LeadX intelligence system — guaranteeing a trusted ecosystem for earners and advertisers alike.",
        icon: <ShieldCheck className="size-6 text-black dark:text-white" />,
    },
];

const CornerPlusIcons = () => (
    <>
        <div className="absolute -top-3 -left-3 transition-transform duration-500 group-hover:rotate-180 group-hover:scale-125">
            <Plus className="size-6 text-black dark:text-white" />
        </div>
        <div className="absolute -top-3 -right-3 transition-transform duration-500 group-hover:rotate-90 group-hover:scale-125">
            <Plus className="size-6 text-black dark:text-white" />
        </div>
        <div className="absolute -bottom-3 -left-3 transition-transform duration-500 group-hover:-rotate-90 group-hover:scale-125">
            <Plus className="size-6 text-black dark:text-white" />
        </div>
        <div className="absolute -bottom-3 -right-3 transition-transform duration-500 group-hover:-rotate-180 group-hover:scale-125">
            <Plus className="size-6 text-black dark:text-white" />
        </div>
    </>
);

const PlusCard: React.FC<{
    className?: string;
    title: string;
    description: string;
    isActive: boolean;
    icon?: React.ReactNode;
}> = ({ className = "", title, description, isActive, icon }) => {
    return (
        <div
            className={cn(
                "relative rounded-2xl border border-black/15 dark:border-zinc-700/50 p-6 md:p-8 bg-white dark:bg-zinc-950 min-h-[200px] md:min-h-[240px]",
                "flex flex-col justify-between group transition-all duration-500 ease-out",
                "hover:-translate-y-2 hover:border-black dark:hover:border-white",
                "hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)]",
                className
            )}
        >
            <CornerPlusIcons />
            <div className="relative z-10 space-y-4">
                <div className="bg-black/5 dark:bg-white/10 w-fit p-3">
                    {icon}
                </div>
                <div>
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {title}
                    </h3>
                    <TextBlockAnimation blockColor="#ff6b00" duration={0.4} delay={0.2} animateOnScroll={false} trigger={isActive}>
                        <p className="text-gray-700 dark:text-gray-400 leading-relaxed text-sm md:text-base font-medium">
                            {description}
                        </p>
                    </TextBlockAnimation>
                </div>
            </div>
        </div>
    );
};

export default function EarningReveal({ isActive, onAdvance }: { isActive: boolean; onAdvance: () => void }) {
    return (
        <section
            className={`cinematic-section ${isActive ? 'active' : ''} bg-[#EAE5DD] dark:bg-black pt-44 md:pt-[320px] pb-24 px-4`}
            data-section="2"
            data-testid="earning-reveal-section"
        >
            <div className="mx-auto container max-w-7xl">
                <div className="mb-12 md:mb-16 text-left">
                    <CinematicBlockReveal
                        trigger={isActive}
                        blockColor="#000"
                    >
                        <div className="py-2">
                            <VariableFontHoverByRandomLetter
                                label="OUR FEATURES"
                                className="font-black uppercase tracking-tighter text-4xl md:text-7xl lg:text-8xl leading-tight text-black dark:text-white"
                                fromFontVariationSettings="'wght' 900, 'slnt' 0"
                                toFontVariationSettings="'wght' 400, 'slnt' -10"
                            />
                        </div>
                    </CinematicBlockReveal>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 auto-rows-auto gap-6 md:gap-8 mb-16 md:mb-24">
                    <PlusCard {...cardContents[0]} className="lg:col-span-3 lg:row-span-2" isActive={isActive} />
                    <PlusCard {...cardContents[1]} className="lg:col-span-3 lg:row-span-2" isActive={isActive} />

                    <PlusCard {...cardContents[2]} className="md:col-span-1 lg:col-span-2 lg:row-span-1" isActive={isActive} />
                    <PlusCard {...cardContents[3]} className="md:col-span-1 lg:col-span-2 lg:row-span-1" isActive={isActive} />
                    <PlusCard {...cardContents[4]} className="md:col-span-2 lg:col-span-2 lg:row-span-1" isActive={isActive} />
                </div>
            </div>
        </section>
    );
}
