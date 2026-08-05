import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Click-and-drag ("grab to pan") panning for a scrollable container — e.g.
 * the referral tree once it's zoomed in or wider than its viewport. Native
 * scrollbars and touch scrolling keep working; this adds the desktop
 * "click anywhere and drag" interaction on top, so the chart can be grabbed
 * and moved around instead of hunting for a scrollbar.
 *
 * Usage:
 *   const { containerRef, isDragging, onMouseDown } = useDragToPan<HTMLDivElement>();
 *   <div ref={containerRef} onMouseDown={onMouseDown} onDragStart={(e) => e.preventDefault()} className="overflow-auto ...">
 */
export function useDragToPan<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el || e.button !== 0) return;
    // Let normal clicks on buttons/links/inputs inside the tree keep working.
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    drag.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollLeft = drag.current.scrollLeft - (e.clientX - drag.current.startX);
      el.scrollTop = drag.current.scrollTop - (e.clientY - drag.current.startY);
    };
    const handleUp = () => setIsDragging(false);

    // Tracked on window (not just the container) so the drag keeps going
    // even if the cursor slips past the chart's edge mid-pan.
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  return { containerRef, isDragging, onMouseDown };
}
