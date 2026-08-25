"use client";

import { useMemo } from "react";
import { motion, Transition } from "framer-motion";
import { cn } from "@/lib/utils";

// Function to shuffle an array
function shuffleArray(array: number[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[array[i], array[j]] = [array[j], array[i]]
    }
}

interface TextProps {
    label: string
    fromFontVariationSettings?: string
    toFontVariationSettings?: string
    transition?: Transition
    staggerDuration?: number
    className?: string
    onClick?: () => void
}

const VariableFontHoverByRandomLetter = ({
    label,
    fromFontVariationSettings = "'wght' 400, 'slnt' 0",
    toFontVariationSettings = "'wght' 900, 'slnt' -10",
    transition = {
        type: "spring",
        duration: 0.7,
    },
    staggerDuration = 0.03,
    className,
    onClick,
    ...props
}: TextProps) => {
    const shuffledIndices = useMemo(() => {
        const indices = Array.from({ length: label.length }, (_, i) => i)
        shuffleArray(indices)
        return indices
    }, [label])

    const letterVariants = {
        hover: (index: number) => ({
            fontVariationSettings: toFontVariationSettings,
            transition: {
                ...transition,
                delay: staggerDuration * index,
            },
        }),
        initial: (index: number) => ({
            fontVariationSettings: fromFontVariationSettings,
            transition: {
                ...transition,
                delay: staggerDuration * index,
            },
        }),
    }

    let characterOffset = 0

    return (
        <motion.span
            className={cn("inline-block", className)}
            onClick={onClick}
            whileHover="hover"
            initial="initial"
            {...props}
        >
            <span className="sr-only">{label}</span>

            <span aria-hidden="true">
                {label.split(/(\s+)/).map((segment, segmentIndex) => {
                    const startIndex = characterOffset
                    characterOffset += segment.length

                    if (/^\s+$/.test(segment)) {
                        return <span key={segmentIndex}>{segment}</span>
                    }

                    return (
                        <span key={segmentIndex} className="inline-block whitespace-nowrap">
                            {segment.split("").map((letter: string, letterIndex: number) => (
                                <motion.span
                                    key={letterIndex}
                                    className="inline-block"
                                    variants={letterVariants}
                                    custom={shuffledIndices[startIndex + letterIndex]}
                                >
                                    {letter}
                                </motion.span>
                            ))}
                        </span>
                    )
                })}
            </span>
        </motion.span>
    )
}

export { VariableFontHoverByRandomLetter }
