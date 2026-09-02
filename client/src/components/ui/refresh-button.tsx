import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onClick: () => void;
  refreshing?: boolean;
  className?: string;
  size?: "sm" | "md";
  title?: string;
}

/**
 * SYNC pill — THORX neobrutalist refresh control.
 * Orange (#D97757) fill, hard black (#141413) border + offset shadow.
 * Spins and switches to "SYNCING" while a refetch is in flight.
 */
export function RefreshButton({ onClick, refreshing = false, className, size = "sm", title = "Sync data" }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      title={title}
      aria-label={title}
      data-testid="button-refresh"
      className={cn(
        "group inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 md:px-4",
        "bg-[#D97757] text-white border-2 border-[#141413] font-black uppercase tracking-[0.12em]",
        size === "sm" ? "h-8 text-[10px]" : "h-9 text-[10px] md:text-[11px]",
        "shadow-[3px_3px_0px_0px_#141413] transition-all duration-200",
        "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#141413]",
        "active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_0px_#141413]",
        "disabled:opacity-60 disabled:pointer-events-none shrink-0",
        className
      )}
    >
      <RefreshCw className={cn("w-3 h-3 md:w-3.5 md:h-3.5 shrink-0", refreshing && "animate-spin")} strokeWidth={2.75} />
      {refreshing ? "SYNCING" : "SYNC"}
    </button>
  );
}

/** Small helper — wraps a refetch/action with a busy spinner flag. */
export function useRefreshAction(action: () => void | Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    Promise.resolve(action()).finally(() => setRefreshing(false));
  }, [action, refreshing]);
  return { refreshing, refresh };
}

export default RefreshButton;
