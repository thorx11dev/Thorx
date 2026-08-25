"use client";

import React from "react";
import TechnicalLabel from "@/components/ui/technical-label";
import { cn } from "@/lib/utils";

export function GetStartedButton() {
    return (
        <div
            className={cn(
                "landing-get-started inline-flex items-center justify-center bg-primary text-white border-2 border-black",
                "transition-[background-color,transform] duration-300"
            )}
            data-testid="button-get-started"
        >
            <TechnicalLabel
                text="GET STARTED"
                className="text-white font-black"
            />
        </div>
    );
}
