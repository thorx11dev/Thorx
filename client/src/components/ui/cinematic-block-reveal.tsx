"use client";

import React from "react";
import { motion } from "framer-motion";
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
    return (
        <div className={cn("relative inline-block overflow-hidden", className)}>
            {/* The actual content */}
            <motion.div
                initial={false}
                animate={{ opacity: 1 }}
                className="relative z-10"
            >
                {children}
            </motion.div>

            {/* Keep the industrial sweep, but never gate content on animation. */}
            {trigger && (
                <motion.div
                    key="reveal"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{
                        duration,
                        delay,
                        ease: [0.77, 0, 0.175, 1],
                    }}
                    className="absolute inset-0 z-20 origin-right motion-reduce:hidden"
                    style={{ backgroundColor: blockColor }}
                />
            )}
        </div>
    );
};

export { CinematicBlockReveal };
