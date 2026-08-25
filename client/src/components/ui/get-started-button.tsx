"use client";

import React from "react";
import TechnicalLabel from "@/components/ui/technical-label";
import { cn } from "@/lib/utils";

export function GetStartedButton() {
    return (
        <div
            className={cn(
                "bg-primary text-white px-3 py-3 md:px-4 md:py-2 border-2 border-black rounded-lg",
                "hover:bg-black transition-all duration-300 transform hover:scale-105 inline-block"
            )}
            data-testid="button-get-started"
        >
            <TechnicalLabel
                text="GET STARTED"
                className="text-white text-xs md:text-sm font-black"
            />
        </div>
    );
}
