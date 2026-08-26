"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface CinematicBlockRevealProps {
    children: React.ReactNode;
    trigger?: boolean;
    delay?: number;
    blockColor?: string;
    className?: string;
    duration?: number;
}

const CinematicBlockReveal: React.FC<CinematicBlockRevealProps> = ({
    children,
    trigger = false,
    delay = 0,
    blockColor = "#ff6b00",
    className,
    duration = 0.5
}) => {
    const [hasRevealed, setHasRevealed] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (trigger && !hasRevealed && !isAnimating) {
            setIsAnimating(true);
        }
    }, [trigger, hasRevealed, isAnimating]);

    return (
        <div className={cn("relative inline-block", className)}>
            {/* The actual content */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: hasRevealed ? 1 : 0 }}
                transition={{ duration: 0.1, delay: duration / 2 }}
                className="relative z-10"
            >
                {children}
            </motion.div>

            {/* The block revealer */}
            <AnimatePresence>
                {isAnimating && (
                    <motion.div
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        exit={{ scaleX: 1, originX: 1 }}
                        transition={{
                            duration: duration,
                            delay: delay,
                            ease: [0.77, 0, 0.175, 1],
                        }}
                        onAnimationComplete={() => {
                            setHasRevealed(true);
                            setIsAnimating(false);
                        }}
                        className="absolute inset-0 z-20"
                        style={{ backgroundColor: blockColor }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export { CinematicBlockReveal };
