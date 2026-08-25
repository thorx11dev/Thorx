"use client";

import React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GetStartedButtonProps {
  onClick?: () => void;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GetStartedButton({
  onClick,
  label = "GET STARTED",
  size = "md",
  className,
}: GetStartedButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "thx-btn thx-btn-ink",
        size === "sm" && "thx-btn-sm",
        size === "md" && "thx-btn-md",
        size === "lg" && "thx-btn-lg",
        className
      )}
      data-testid="button-get-started"
    >
      {label}
      <ArrowUpRight className="size-3.5 opacity-70" />
    </button>
  );
}
