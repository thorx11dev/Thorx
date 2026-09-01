/**
 * InteractiveRopeNav — physics-based hanging rope navigation (mobile).
 *
 * An orange rope (Verlet integration, SVG) hangs from the bottom edge of the
 * fixed THORX header. The `≡` icon hangs from the rope tip:
 *   • Tap the icon  → opens the guild navigation drawer.
 *   • Drag the icon → the rope stretches and follows, then springs back
 *                     with realistic inertia and wobble on release.
 *
 * Rendering: plain SVG path (no gradients) — solid primary orange, 3.5px.
 * Physics:   classic position-based Verlet with pinned head, gravity,
 *            damping, 24 constraint iterations and a subtle idle breeze.
 */
import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const GRAVITY = 0.55;     // px/frame² — pulls the rope down
const DAMPING = 0.985;    // velocity retained per frame (lower = faster settle)
const ITERATIONS = 24;    // constraint solve passes — higher = stiffer rope
const SEG_COUNT = 13;     // rope segments
const WIND = 0.02;        // idle breeze strength on the lower half
const ROPE_TOP = 4;       // y of the pinned anchor inside the container
const ICON_GAP = 52;      // natural distance from anchor to icon center

interface RopePoint { x: number; y: number; px: number; py: number; }

export function InteractiveRopeNav({
  onOpen,
  pendingCount = 0,
  className,
}: {
  onOpen: () => void;
  pendingCount?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const pointsRef = useRef<RopePoint[]>([]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const downRef = useRef({ x: 0, y: 0, t: 0, moved: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let width = wrap.clientWidth || window.innerWidth;
    let height = wrap.clientHeight || 150;

    const segLen = () => (height - ICON_GAP - 8) / SEG_COUNT;

    const init = () => {
      width = wrap.clientWidth || window.innerWidth;
      height = wrap.clientHeight || 150;
      const len = segLen();
      pointsRef.current = Array.from({ length: SEG_COUNT + 1 }, (_, i) => ({
        x: width / 2,
        y: ROPE_TOP + i * len,
        px: width / 2,
        py: ROPE_TOP + i * len,
      }));
    };
    init();

    const onResize = () => init();
    window.addEventListener("resize", onResize);

    const setLocal = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect();
      return {
        x: Math.min(Math.max(clientX - rect.left, 12), width - 12),
        y: Math.min(Math.max(clientY - rect.top, ROPE_TOP + 20), height - 14),
      };
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const p = setLocal(e.clientX, e.clientY);
      dragRef.current = p;
      downRef.current.moved = Math.max(
        downRef.current.moved,
        Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y),
      );
    };
    const onUp = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      // Tap (not drag) → open the guild navigation drawer.
      const dt = Date.now() - downRef.current.t;
      if (downRef.current.moved < 10 && dt < 350) onOpen();
      void e;
    };
    const onDown = (e: PointerEvent) => {
      const p = setLocal(e.clientX, e.clientY);
      dragRef.current = p;
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
    };

    const icon = iconRef.current;
    icon?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    let raf = 0;
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      t++;
      const pts = pointsRef.current;
      const len = segLen();

      /* ── Verlet integration (skip pinned head) ── */
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x; p.py = p.y;
        p.x += vx + (i > pts.length / 2 ? Math.sin(t / 45) * WIND : 0);
        p.y += vy + GRAVITY;
      }

      /* ── Constraints — pinned head, dragged tip ── */
      for (let k = 0; k < ITERATIONS; k++) {
        pts[0].x = width / 2;
        pts[0].y = ROPE_TOP;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = (d - len) / d;
          const ox = dx * diff * 0.5, oy = dy * diff * 0.5;
          if (i === 0) { b.x -= ox * 2; b.y -= oy * 2; }
          else { a.x += ox; a.y += oy; b.x -= ox; b.y -= oy; }
        }
        if (dragRef.current) {
          const tip = pts[pts.length - 1];
          tip.x = dragRef.current.x;
          tip.y = dragRef.current.y;
        }
      }

      /* ── Render — smoothed quadratic path ── */
      if (pathRef.current) {
        let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`;
        }
        const tip = pts[pts.length - 1];
        d += ` L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
        pathRef.current.setAttribute("d", d);
      }

      /* ── Icon follows the rope tip (direct DOM, no re-render) ── */
      if (iconRef.current) {
        const tip = pts[pts.length - 1];
        iconRef.current.style.transform =
          `translate3d(${tip.x.toFixed(1)}px, ${tip.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      icon?.removeEventListener("pointerdown", onDown);
    };
  }, [onOpen]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="false"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] h-[150px] z-[120] lg:hidden",
        className,
      )}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${typeof window !== "undefined" ? window.innerWidth : 360} 150`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full overflow-visible"
      >
        {/* Solid primary-orange rope — no gradients */}
        <path
          ref={pathRef}
          fill="none"
          className="stroke-primary"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Anchor dot where the rope meets the header line */}
        <circle cx="50%" cy={ROPE_TOP} r={3.5} className="fill-primary" />
      </svg>

      {/* Draggable navigation icon — hangs from the rope tip */}
      <button
        ref={iconRef}
        onPointerDown={(e) => (e.target as HTMLElement).setPointerCapture(e.pointerId)}
        aria-label="Open guild navigation"
        data-testid="button-guild-nav"
        className="absolute left-0 top-0 w-12 h-12 -ml-6 -mt-6 pointer-events-auto cursor-grab active:cursor-grabbing touch-none select-none
                   bg-black text-white border-2 border-black rounded-xl flex items-center justify-center
                   shadow-[3px_3px_0px_0px_rgba(0,0,0,0.25)] active:shadow-none active:scale-95
                   transition-[background-color,border-color] duration-150 hover:bg-primary"
        style={{ willChange: "transform" }}
      >
        <Menu className="w-5 h-5" strokeWidth={2.5} />
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary border-2 border-black flex items-center justify-center text-[8px] font-black text-white pointer-events-none">
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default InteractiveRopeNav;
