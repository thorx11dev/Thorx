"use client"

import gsap from "gsap"
import { SplitText } from "gsap/SplitText"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { useRef } from "react"
import { cn } from "@/lib/utils";

// Ensure plugins are registered
gsap.registerPlugin(SplitText, ScrollTrigger);

interface TextBlockAnimationProps {
    children: React.ReactNode;
    animateOnScroll?: boolean;
    trigger?: any; // New prop to force re-animation
    delay?: number;
    blockColor?: string;
    stagger?: number;
    duration?: number;
    className?: string;
}

export default function TextBlockAnimation({
    children,
    animateOnScroll = true,
    trigger,
    delay = 0,
    blockColor = "#000",
    stagger = 0.1,
    duration = 0.6,
    className
}: TextBlockAnimationProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        if (!containerRef.current) return;

        // 1. Setup SplitText
        const split = new SplitText(containerRef.current, {
            type: "lines",
            linesClass: "block-line-parent",
        });

        // 2. Wrap lines and inject the block revealer manually
        const lines = split.lines;
        const blocks: HTMLElement[] = [];

        lines.forEach((line) => {
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";
            wrapper.style.display = "block";
            wrapper.style.overflow = "hidden";

            const block = document.createElement("div");
            block.style.position = "absolute";
            block.style.top = "0";
            block.style.left = "0";
            block.style.width = "100%";
            block.style.height = "100%";
            block.style.backgroundColor = blockColor;
            block.style.zIndex = "2";
            block.style.transform = "scaleX(0)";
            block.style.transformOrigin = "left center";

            if (line.parentNode) {
                line.parentNode.insertBefore(wrapper, line);
                wrapper.appendChild(line);
                wrapper.appendChild(block);
            }

            gsap.set(line, { opacity: 0 });
            blocks.push(block);
        });

        // 3. Create the Master Timeline
        const tl = gsap.timeline({
            defaults: { ease: "expo.inOut" },
            scrollTrigger: animateOnScroll ? {
                trigger: containerRef.current,
                start: "top 85%",
                toggleActions: "play none none reverse",
            } : null,
            delay: delay
        });

        // 4. Build the Animation Sequence
        tl.to(blocks, {
            scaleX: 1,
            duration: duration,
            stagger: stagger,
            transformOrigin: "left center",
        })
            .set(lines, {
                opacity: 1,
                stagger: stagger
            }, `<${duration / 2}`)
            .to(blocks, {
                scaleX: 0,
                duration: duration,
                stagger: stagger,
                transformOrigin: "right center"
            }, `<${duration * 0.4}`);

        // Cleanup: Important to revert SplitText to avoid nested spans on re-render
        return () => {
            split.revert();
            // Remove the manually added wrappers and blocks
            blocks.forEach(b => b.remove());
        };

    }, {
        scope: containerRef,
        dependencies: [animateOnScroll, delay, blockColor, stagger, duration, trigger]
    });

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            {children}
        </div>
    );
}
