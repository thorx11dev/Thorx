"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CarouselItem {
    id: number | string;
    title: string;
}

// Create infinite items by triplicating the array
const createInfiniteItems = (originalItems: CarouselItem[]) => {
    const items: (CarouselItem & { originalIndex: number })[] = [];
    for (let i = 0; i < 3; i++) {
        originalItems.forEach((item, index) => {
            items.push({
                ...item,
                id: `${i}-${item.id}`,
                originalIndex: index,
            });
        });
    }
    return items;
};

const RulerLines = ({
    top = true,
    totalLines = 101,
}: {
    top?: boolean;
    totalLines?: number;
}) => {
    const lines = [];
    const lineSpacing = 100 / (totalLines - 1);

    for (let i = 0; i < totalLines; i++) {
        const isFifth = i % 5 === 0;
        const isCenter = i === Math.floor(totalLines / 2);

        let height = "h-3";
        let color = "bg-[rgba(20,20,19,0.10)]";

        if (isCenter) {
            height = "h-8";
            color = "bg-[var(--ed-coral,#cc785c)]";
        } else if (isFifth) {
            height = "h-4";
            color = "bg-[rgba(20,20,19,0.28)]";
        }

        const positionClass = top ? "top-0" : "bottom-0";

        lines.push(
            <div
                key={i}
                className={`absolute w-px ${height} ${color} ${positionClass} transform -translate-x-1/2`}
                style={{ left: `${i * lineSpacing}%` }}
            />
        );
    }

    return <div className="relative w-full h-8">{lines}</div>;
};

export function RulerCarousel({
    originalItems,
}: {
    originalItems: CarouselItem[];
}) {
    const infiniteItems = createInfiniteItems(originalItems);
    const itemsPerSet = originalItems.length;
    // Responsive width logic
    const [itemWidth, setItemWidth] = useState(400);
    const gap = 100;
    const itemWidthWithGap = itemWidth + gap;

    // Start with the middle set, first item
    const [activeIndex, setActiveIndex] = useState(itemsPerSet);
    const [isAnimating, setIsAnimating] = useState(false);

    // Use motion value for direct control
    const x = useMotionValue(-(activeIndex * itemWidthWithGap + itemWidth / 2));

    const performMove = async (newIndex: number) => {
        if (isAnimating) return;
        setIsAnimating(true);

        const targetX = -(newIndex * itemWidthWithGap + itemWidth / 2);

        // Animate to the target position
        await animate(x, targetX, {
            type: "spring",
            stiffness: 150,
            damping: 25,
            restDelta: 0.5
        });

        // Check if we need to jump back to middle set for infinite feel
        let finalIndex = newIndex;
        if (newIndex >= itemsPerSet * 2) {
            finalIndex = newIndex - itemsPerSet;
            const finalX = -(finalIndex * itemWidthWithGap + itemWidth / 2);
            x.set(finalX);
        } else if (newIndex < itemsPerSet) {
            finalIndex = newIndex + itemsPerSet;
            const finalX = -(finalIndex * itemWidthWithGap + itemWidth / 2);
            x.set(finalX);
        }

        setActiveIndex(finalIndex);
        setIsAnimating(false);
    };

    const handleItemClick = (newIndex: number) => {
        if (isAnimating) return;
        performMove(newIndex);
    };

    const handlePrevious = () => {
        if (isAnimating) return;
        performMove(activeIndex - 1);
    };

    const handleNext = () => {
        if (isAnimating) return;
        performMove(activeIndex + 1);
    };

    // Add keyboard navigation
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isAnimating) return;

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                handlePrevious();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                handleNext();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeIndex, isAnimating]);

    useEffect(() => {
        const handleResize = () => {
            const newWidth = window.innerWidth < 768 ? 280 : 400;
            setItemWidth(newWidth);
            // Update x value on resize to maintain centering
            const newWidthWithGap = newWidth + gap;
            x.set(-(activeIndex * newWidthWithGap + newWidth / 2));
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeIndex, gap]);

    // Get current page info
    const currentPage = (activeIndex % itemsPerSet) + 1;
    const totalPages = itemsPerSet;

    return (
        <div className="w-full py-14 md:py-20 flex flex-col items-center justify-center">
            <div className="w-full h-[190px] md:h-[220px] flex flex-col justify-center relative">
                <div className="flex items-center justify-center">
                    <RulerLines top />
                </div>
                <div className="flex items-center w-full h-full relative overflow-hidden">
                    {/* Central Indicator Mask */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-24 border-y border-[rgba(20,20,19,0.15)] pointer-events-none z-10" />

                    <motion.div
                        className="flex items-center absolute left-1/2 top-0 bottom-0"
                        style={{ x }}
                    >
                        {infiniteItems.map((item, index) => {
                            const isActive = index === activeIndex;

                            return (
                                <motion.button
                                    key={item.id}
                                    onClick={() => handleItemClick(index)}
                                    className={cn(
                                        "thx-display thx-display-2 whitespace-nowrap flex items-center justify-center uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-coral,#cc785c)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--ed-canvas,#faf9f5)] rounded-lg",
                                        isActive
                                            ? "text-[var(--ed-ink,#141413)]"
                                            : "text-[rgba(20,20,19,0.22)] hover:text-[rgba(20,20,19,0.5)]"
                                    )}
                                    animate={{
                                        scale: isActive ? 1.08 : 0.82,
                                        opacity: isActive ? 1 : 0.55,
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 30,
                                    }}
                                    style={{
                                        width: `${itemWidth}px`,
                                        marginRight: `${gap}px`
                                    }}
                                >
                                    {item.title}
                                </motion.button>
                            );
                        })}
                    </motion.div>
                </div>

                <div className="flex items-center justify-center">
                    <RulerLines top={false} />
                </div>
            </div>

            <div className="flex items-center justify-center gap-5 mt-8 bg-[var(--ed-surface-white,#fffefb)] px-4 py-2 rounded-full border border-[var(--ed-hairline,#e6dfd8)] shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                <button
                    onClick={handlePrevious}
                    disabled={isAnimating}
                    className="w-9 h-9 rounded-full border border-transparent hover:border-[var(--ed-hairline,#e6dfd8)] hover:bg-[var(--ed-surface-card,#efe9de)] flex items-center justify-center transition-all disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-coral,#cc785c)]"
                    aria-label="Previous item"
                >
                    <ArrowLeft className="w-4 h-4 text-[var(--ed-ink,#141413)]" />
                </button>

                <div className="flex items-baseline gap-2">
                    <span className="thx-display text-xl text-[var(--ed-ink,#141413)] min-w-[2ch] text-center leading-none pt-[2px]">
                        {currentPage}
                    </span>
                    <span className="text-sm text-[var(--ed-muted-soft,#8e8b82)] font-light">
                        /
                    </span>
                    <span className="text-sm text-[var(--ed-muted-soft,#8e8b82)] thx-mono">
                        {totalPages}
                    </span>
                </div>

                <button
                    onClick={handleNext}
                    disabled={isAnimating}
                    className="w-9 h-9 rounded-full border border-transparent hover:border-[var(--ed-hairline,#e6dfd8)] hover:bg-[var(--ed-surface-card,#efe9de)] flex items-center justify-center transition-all disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-coral,#cc785c)]"
                    aria-label="Next item"
                >
                    <ArrowRight className="w-4 h-4 text-[var(--ed-ink,#141413)]" />
                </button>
            </div>
        </div>
    );
}
