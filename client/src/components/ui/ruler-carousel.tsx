"use client";

import { useState, useEffect } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Rewind, FastForward } from "lucide-react";

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
        let color = "bg-black/10 dark:bg-white/10";

        if (isCenter) {
            height = "h-8";
            color = "bg-primary";
        } else if (isFifth) {
            height = "h-4";
            color = "bg-black/30 dark:bg-white/30";
        }

        const positionClass = top ? "top-0" : "bottom-0";

        lines.push(
            <div
                key={i}
                className={`absolute w-0.5 ${height} ${color} ${positionClass} transform -translate-x-1/2`}
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
            if (isAnimating || event.defaultPrevented) return;

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
        <div className="landing-ruler w-full flex flex-col items-center justify-center">
            <div className="landing-ruler-stage w-full flex flex-col justify-center relative">
                <div className="flex items-center justify-center">
                    <RulerLines top />
                </div>
                <div className="flex items-center w-full h-full relative overflow-hidden">
                    {/* Central Indicator Mask */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-24 border-y-2 border-black/20 dark:border-white/20 pointer-events-none z-10" />

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
                                    className={`text-6xl md:text-8xl font-black whitespace-nowrap cursor-pointer flex items-center justify-center uppercase tracking-tighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 ${isActive
                                        ? "text-black dark:text-white"
                                        : "text-black/20 dark:text-white/10 hover:text-black/50 dark:hover:text-white/30"
                                        }`}
                                    animate={{
                                        scale: isActive ? 1.1 : 0.8,
                                        opacity: isActive ? 1 : 0.3,
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

            <div className="landing-ruler-controls flex items-center justify-center gap-6 bg-white dark:bg-white/5 rounded-full border border-black/15 dark:border-white/10">
                <button
                    onClick={handlePrevious}
                    disabled={isAnimating}
                    className="landing-ruler-button flex items-center justify-center cursor-pointer hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                    aria-label="Previous item"
                >
                    <Rewind className="w-5 h-5 text-black dark:text-white" />
                </button>

                <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-black dark:text-white min-w-[2ch] text-center">
                        {currentPage}
                    </span>
                    <span className="text-lg text-black/30 dark:text-white/20 font-light">
                        /
                    </span>
                    <span className="text-xl font-black text-black/40 dark:text-white/40">
                        {totalPages}
                    </span>
                </div>

                <button
                    onClick={handleNext}
                    disabled={isAnimating}
                    className="landing-ruler-button flex items-center justify-center cursor-pointer hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                    aria-label="Next item"
                >
                    <FastForward className="w-5 h-5 text-black dark:text-white" />
                </button>
            </div>
        </div>
    );
}
