import { useState, useCallback } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import {RefreshCw} from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onClick: () => void;
  refreshing?: boolean;
  className?: string;
  size?: "sm" | "md";
  title?: string;
}

/** Hard-edged refresh icon button — matches the portal's black-border system. */
export function RefreshButton({ onClick, refreshing = false, className, size = "sm", title = "Refresh" }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      title={title}
      aria-label={title}
      data-testid="button-refresh"
      className={cn(
        "inline-flex items-center justify-center rounded-lg border-2 border-black bg-white text-black/60 transition-all duration-200 hover:bg-black hover:text-white active:scale-95 disabled:opacity-50 disabled:pointer-events-none shrink-0",
        size === "sm" ? "w-8 h-8" : "w-9 h-9",
        className
      )}
    >
      {refreshing ? <ThorxSpinner size={16} /> : <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.5} />}
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
