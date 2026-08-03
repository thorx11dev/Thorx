import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

interface NavItem {
    id: string;
    name: string;
    icon: React.ElementType;
}

interface MobileNavBarProps {
    sections: NavItem[];
    currentSection: number;
    onSectionChange: (index: number) => void;
    className?: string;
}

export function MobileNavBar({
    sections,
    currentSection,
    onSectionChange,
    className,
}: MobileNavBarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const constraintsRef = useRef(null);
    const buttonRef = useRef<HTMLDivElement>(null);

    const toggleMenu = () => setIsOpen(!isOpen);

    // Fan Config
    const spread = 25; // Degrees between items

    // Calculate items around the central rotation angle
    // 5 items. Center is index 2.
    // Indices: 0, 1, 2, 3, 4
    // Offsets: -2, -1, 0, 1, 2 * spread
    const getTransform = (index: number) => {
        if (dynamicConfig.isLinear) {
            const spacing = 70; // Spacing between linear icons
            const offset = (index) * spacing + 80; // Start 80px away from FAB

            if (dynamicConfig.linearAxis === 'vertical') {
                return { x: 0, y: offset * dynamicConfig.linearDir };
            } else {
                return { x: offset * dynamicConfig.linearDir, y: 0 };
            }
        }

        const offset = (index - 2) * spread;
        const angleDeg = dynamicConfig.rotation + offset;
        const rad = (angleDeg * Math.PI) / 180;

        return {
            x: Math.cos(rad) * dynamicConfig.radius,
            y: Math.sin(rad) * dynamicConfig.radius
        };
    };

    // Intelligent Positioning State
    const [dynamicConfig, setDynamicConfig] = useState({
        rotation: 225,
        radius: 130,
        isLinear: false,
        linearAxis: 'vertical' as 'vertical' | 'horizontal',
        linearDir: 1 // 1 for positive (down/right), -1 for negative (up/left)
    });

    // Update positioning logic
    const updatePositioning = () => {
        if (!buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const margin = 20; // Safety margin from edges
        const iconSize = 28; // Half of 56px (w-14)

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 1. Corner Detection (Linear Mode)
        const cornerThreshold = 140; // Detection zone for corners
        const isNearLeft = centerX < cornerThreshold;
        const isNearRight = centerX > screenW - cornerThreshold;
        const isNearTop = centerY < cornerThreshold;
        const isNearBottom = centerY > screenH - cornerThreshold;

        const isCorner = (isNearLeft || isNearRight) && (isNearTop || isNearBottom);

        if (isCorner) {
            // Determine best linear direction
            let axis: 'vertical' | 'horizontal' = 'vertical';
            let dir = 1;

            if (isNearBottom && isNearRight) {
                // Bottom-Right Corner: Try going UP (vertical, -1) or LEFT (horizontal, -1)
                axis = centerY > centerX ? 'vertical' : 'horizontal';
                dir = -1;
            } else if (isNearBottom && isNearLeft) {
                // Bottom-Left Corner: Try UP (vertical, -1) or RIGHT (horizontal, 1)
                axis = centerY > (screenW - centerX) ? 'vertical' : 'horizontal';
                dir = axis === 'vertical' ? -1 : 1;
            } else if (isNearTop && isNearRight) {
                // Top-Right Corner: Try DOWN (vertical, 1) or LEFT (horizontal, -1)
                axis = (screenH - centerY) > centerX ? 'vertical' : 'horizontal';
                dir = axis === 'vertical' ? 1 : -1;
            } else if (isNearTop && isNearLeft) {
                // Top-Left Corner: Try DOWN (vertical, 1) or RIGHT (horizontal, 1)
                axis = (screenH - centerY) > (screenW - centerX) ? 'vertical' : 'horizontal';
                dir = 1;
            }

            setDynamicConfig(prev => ({ ...prev, isLinear: true, linearAxis: axis, linearDir: dir }));
            return;
        }

        // 2. Arc Mode (Default/Edge Steering)
        const dx = (screenW / 2) - centerX;
        const dy = (screenH / 2) - centerY;
        let targetRotation = (Math.atan2(dy, dx) * 180) / Math.PI;

        const baseRadius = 130;
        const spreadArc = 25;
        let bestRotation = targetRotation;
        let bestRadius = baseRadius;

        const checkCollision = (rot: number, rad: number) => {
            for (let i = 0; i < 5; i++) {
                const offset = (i - 2) * spreadArc;
                const angleRad = ((rot + offset) * Math.PI) / 180;
                const px = centerX + Math.cos(angleRad) * rad;
                const py = centerY + Math.sin(angleRad) * rad;

                if (
                    px - iconSize < margin ||
                    px + iconSize > screenW - margin ||
                    py - iconSize < margin ||
                    py + iconSize > screenH - margin
                ) {
                    return true;
                }
            }
            return false;
        };

        // Try rotating slightly (+/- 60 deg) to find better space
        if (checkCollision(bestRotation, bestRadius)) {
            for (let nudge = 5; nudge <= 60; nudge += 5) {
                if (!checkCollision(targetRotation + nudge, bestRadius)) {
                    bestRotation = targetRotation + nudge;
                    break;
                }
                if (!checkCollision(targetRotation - nudge, bestRadius)) {
                    bestRotation = targetRotation - nudge;
                    break;
                }
            }
        }

        // If still colliding, shrink radius
        while (bestRadius > 80 && checkCollision(bestRotation, bestRadius)) {
            bestRadius -= 10;
        }

        setDynamicConfig({
            rotation: bestRotation,
            radius: bestRadius,
            isLinear: false,
            linearAxis: 'vertical',
            linearDir: 1
        });
    };

    // Trigger update on drag or open
    useEffect(() => {
        if (isOpen) updatePositioning();
    }, [isOpen]);

    const handleDrag = () => {
        if (isOpen) updatePositioning();
    };

    const handleDragEnd = (_: any, info: any) => {
        updatePositioning();
    };

    return (
        <>
            <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-50 overflow-hidden" />

            <motion.div
                ref={buttonRef}
                drag
                dragConstraints={constraintsRef}
                dragElastic={0.1}
                dragMomentum={false}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                // Initial position Bottom-Right (approx)
                initial={{ x: 0, y: 0 }}
                className={cn("fixed bottom-10 right-6 z-50 touch-none md:hidden", className)}
            >
                <div className="relative flex items-center justify-center">

                    {/* Menu Items */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 z-40">
                        {(sections || []).map((section, index) => {
                            const Icon = section.icon;
                            const isActive = currentSection === index;
                            const pos = getTransform(index);

                            return (
                                <motion.button
                                    key={section.id}
                                    onClick={() => {
                                        onSectionChange(index);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
                                        "bg-white hover:bg-primary hover:text-white border-2 border-black",
                                        isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
                                        isActive ? "bg-black text-white hover:bg-black/90 border-black" : "text-black"
                                    )}
                                    style={{
                                        transform: isOpen
                                            ? `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`
                                            : "translate(-50%, -50%) scale(0.5)",
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 400,
                                        damping: 30,
                                        delay: isOpen ? (index * 0.05) : 0 // Stagger linear/arc opening
                                    }}
                                >
                                    <Icon className="w-6 h-6" strokeWidth={1.5} />
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Main Toggle Button */}
                    <motion.button
                        onClick={toggleMenu}
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                            "relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg z-50 outline-none cursor-grab active:cursor-grabbing",
                            "bg-black text-white border-2 border-black"
                        )}
                    >
                        <motion.div
                            animate={{ rotate: isOpen ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {isOpen ? <X size={26} strokeWidth={1.5} /> : <Menu size={26} strokeWidth={1.5} />}
                        </motion.div>
                    </motion.button>

                </div>
            </motion.div>
        </>
    );
}
