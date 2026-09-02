/**
 * PremiumCard — shared THORX dashboard card shell.
 *
 * The warm-ivory-page / white-card premium system used across the User
 * Portal's main dashboard (see DashboardCards.tsx, PSProgressCard.tsx):
 * pure white surface, 2px solid black border, rounded-2xl, and a hard
 * offset black shadow on hover (no blur — technical/industrial, not soft
 * material-design elevation).
 *
 * Reuse this everywhere a "card" is needed in redesigned portal sections so
 * every Engine reads as one design system instead of separate templates.
 */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Disable for cards nested inside another PremiumCard, or static (non-hoverable) surfaces. */
  interactive?: boolean;
  as?: "div" | "section" | "article";
}

export function PremiumCard({
  children,
  className,
  testId,
  interactive = true,
  as: Tag = "div",
}: PremiumCardProps) {
  return (
    <Tag
      data-testid={testId}
      className={cn(
        "bg-white border-2 border-black rounded-2xl p-5 md:p-6 transition-all duration-300",
        interactive && "hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)]",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export default PremiumCard;
