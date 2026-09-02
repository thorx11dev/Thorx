import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface Tab {
    title: string;
    icon: LucideIcon;
    type?: never;
    id?: string;
}

interface Separator {
    type: "separator";
    title?: never;
    icon?: never;
    id?: string;
}

export type TabItem = Tab | Separator;

interface DesktopNavTabsProps {
    tabs: TabItem[];
    activeTab?: number | null;
    onChange?: (index: number | null) => void;
    className?: string;
}

export function DesktopNavTabs({
    tabs,
    activeTab,
    onChange,
    className
}: DesktopNavTabsProps) {
    const handleSelect = (index: number) => {
        onChange?.(index);
    };

    return (
        <div className={cn("flex items-center", className)}>
            {tabs.map((tab, index) => {
                if (tab.type === "separator") {
                    return null;
                }

                const isActive = activeTab === index;
                const Icon = tab.icon;

                return (
                    <button
                        key={`tab-${index}-${tab.title}`}
                        onClick={() => handleSelect(index)}
                        aria-label={tab.title}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                            // Fixed width so no sibling reflow when tooltip appears
                            "relative flex items-center justify-center w-11 md:w-12 h-10 md:h-12",
                            "border-3 border-black transition-all duration-200 group",
                            "ml-[-3px]",
                            // Uniform rest state — active & inactive look the same at rest
                            "bg-white text-zinc-600 z-0",
                            "hover:bg-zinc-100 hover:text-black hover:z-10 hover:shadow-[4px_4px_0px_#141413]",
                            // Keyboard focus — same elevated treatment as hover
                            "focus-visible:outline-none focus-visible:bg-zinc-100 focus-visible:text-black focus-visible:z-10 focus-visible:shadow-[4px_4px_0px_#141413]"
                        )}
                        style={{
                            marginLeft: index === 0 ? '0' : undefined
                        }}
                    >
                        {/* Icon — always visible, slightly bolder when active */}
                        <div className="flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110">
                            <Icon
                                size={18}
                                strokeWidth={isActive ? 2.5 : 1.75}
                                className={cn(
                                    "transition-colors duration-200",
                                    isActive
                                        ? "text-black"
                                        : "text-zinc-500 group-hover:text-black group-focus-visible:text-black"
                                )}
                            />
                        </div>

                        {/* Tooltip label — positioned above the button, away from bottom divider */}
                        <span
                            aria-hidden="true"
                            className={cn(
                                "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50",
                                "px-2 py-1 bg-black text-white text-[9px] font-black tracking-[0.12em] whitespace-nowrap",
                                // Smooth reveal on hover and keyboard focus
                                "opacity-0 -translate-y-1 transition-[opacity,transform] duration-200 ease-out",
                                "group-hover:opacity-100 group-hover:translate-y-0",
                                "group-focus-visible:opacity-100 group-focus-visible:translate-y-0"
                            )}
                        >
                            {tab.title.toUpperCase()}
                        </span>

                        {/* Active indicator — thin primary accent line at bottom */}
                        {isActive && (
                            <span
                                className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary"
                                aria-hidden="true"
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
