"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import TechnicalLabel from "@/components/ui/technical-label";
import { RulerCarousel } from "@/components/ui/ruler-carousel";
import TextBlockAnimation from "@/components/ui/text-block-animation";
import { CinematicBlockReveal } from "@/components/ui/cinematic-block-reveal";
import { VariableFontHoverByRandomLetter } from "@/components/ui/variable-font-hover";

// Interactive Divider Component (recreated from UserPortal.tsx)
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
                    "w-px self-stretch bg-black/10 dark:bg-white/10 cursor-pointer overflow-hidden relative",
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
                "w-full h-px bg-black/10 dark:bg-white/10 cursor-pointer overflow-hidden relative",
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

interface ContentBlockProps {
    label: string;
    description: string;
    isActive: boolean;
}

const ContentBlock = ({ label, description, isActive }: ContentBlockProps) => (
    <div className="landing-value-content flex flex-col h-full">
        <div className="w-fit">
            <div className="bg-black dark:bg-white px-4 py-1.5 rounded-sm">
                <TechnicalLabel
                    text={label}
                    className="text-white dark:text-black font-black tracking-[0.2em] text-[10px] md:text-xs"
                />
            </div>
        </div>
        <TextBlockAnimation blockColor="#ff6b00" delay={0.2} duration={0.4} animateOnScroll={false} trigger={isActive}>
            <p className="text-[15px] md:text-lg xl:text-xl text-black/75 dark:text-white/80 leading-relaxed font-bold">
                {description}
            </p>
        </TextBlockAnimation>
    </div>
);

export default function ValueProposition({ isActive }: { isActive: boolean }) {
    const stakeholders = [
        {
            label: "FOR EARNERS",
            description: "Turn genuine attention into real rewards — no hidden deductions, no surprises. Our Net-First wallet always shows exactly what you can withdraw. Watch verified ads, complete curated tasks, build a referral team, and withdraw directly to your account."
        },
        {
            label: "FOR ADVERTISERS",
            description: "Get verified human attention, not bot impressions. Every THORX ad view passes a dual-phase behavioral check — video completion plus 15 seconds of active page exploration tracked by our hidden AI detector. Reach a real, engaged Pakistani audience and pay only for verified engagement."
        },
        {
            label: "FOR THE ECOSYSTEM",
            description: "THORX is infrastructure. Our 3-Division Referral Matrix turns every user into an organic growth engine. Our AI fraud stack eliminates fake traffic at every layer. And our LeadX system bridges attention and lead generation — creating a self-sustaining, trusted marketplace for human attention."
        }
    ];

    return (
        <section
            className={`cinematic-section landing-content-section landing-value-section ${isActive ? 'active' : ''} bg-[#EAE5DD] dark:bg-black flex flex-col items-start justify-start overflow-y-auto`}
            data-section="3"
            data-testid="value-proposition-section"
            aria-hidden={!isActive}
        >
            <div className="landing-section-container mx-auto w-full">
                {/* Section Header */}
                <div className="landing-section-heading text-left">
                    <CinematicBlockReveal
                        trigger={isActive}
                        blockColor="#ff6b00"
                    >
                        <div className="py-2">
                            <VariableFontHoverByRandomLetter
                                label="VALUE PROPOSITION"
                                className="landing-display-heading font-black uppercase text-black dark:text-white"
                                fromFontVariationSettings="'wght' 900, 'slnt' 0"
                                toFontVariationSettings="'wght' 400, 'slnt' -10"
                            />
                        </div>
                    </CinematicBlockReveal>
                </div>

                {/* Grid Layout */}
                <div className="landing-value-grid grid grid-cols-1 lg:grid-cols-3 gap-0 rounded-xl border border-black/15 dark:border-white/10 overflow-hidden bg-white dark:bg-white/5">
                    {stakeholders.map((stakeholder, index) => (
                            <div key={stakeholder.label} className="relative flex flex-col h-full">
                                <ContentBlock {...stakeholder} isActive={isActive} />

                                {/* Vertical Divider (Desktop only, except for the last one) */}
                                {index < stakeholders.length - 1 && (
                                    <InteractiveDivider
                                        orientation="vertical"
                                        className="hidden lg:block absolute right-0 top-0 bottom-0"
                                    />
                                )}

                                {/* Horizontal Divider (Mobile only) */}
                                {index < stakeholders.length - 1 && (
                                    <InteractiveDivider
                                        orientation="horizontal"
                                        className="lg:hidden"
                                    />
                                )}
                            </div>
                    ))}
                </div>

                {/* Ruler Carousel */}
                <div className="landing-ruler-wrap border-t border-black/10 dark:border-white/10">
                    <RulerCarousel
                        originalItems={[
                            { id: 1, title: "EARN" },
                            { id: 2, title: "TEAM" },
                            { id: 3, title: "FAST" },
                            { id: 4, title: "24/7" },
                        ]}
                    />
                </div>
            </div>
        </section>
    );
}
