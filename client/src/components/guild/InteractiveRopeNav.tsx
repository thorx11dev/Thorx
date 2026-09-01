/**
 * InteractiveRopeNav — realistic braided rope navigation (mobile).
 *
 * A thick braided ORANGE rope (solid colors, no gradients) hangs from directly
 * under the `THORX.` branding in the main header (element marked with
 * `[data-rope-anchor]`). The ≡ menu icon is bound to the rope's end.
 *
 * Interaction contract:
 *   • Tap/click the icon while the rope rests → open the drawer. The rope
 *     does NOT move a single pixel on a plain click (stability fix).
 *   • Press + drag the icon beyond a small threshold → the rope enters
 *     stretched mode and follows the finger/cursor with real Verlet physics.
 *   • Release → inertia + wobble spring-back.
 *
 * Realism: multi-strand braid — thick solid-orange body + dark/light twisted
 * strand highlights + soft under-shadow, all re-drawn from the same Verlet
 * chain every frame so the braid bends with the rope.
 */
import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const GRAVITY = 0.5;
const DAMPING = 0.985;
const ITERATIONS = 24;
const SEG_COUNT = 12;
const WIND = 0.016;
const ICON_SIZE = 46;
const STRETCH_THRESHOLD = 14; // px of pointer travel before physics engages
const TAP_MAX_MS = 400;

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
  const bodyRef = useRef<SVGPathElement>(null);
  const shadowRef = useRef<SVGPathElement>(null);
  const braidARef = useRef<SVGPathElement>(null);
  const braidBRef = useRef<SVGPathElement>(null);
  const anchorDotRef = useRef<SVGCircleElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  const pointsRef = useRef<RopePoint[]>([]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const stretchRef = useRef(false);
  const downRef = useRef({ x: 0, y: 0, t: 0, moved: 0 });
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Anchor element = the THORX. branding in the main header
    const anchorEl = document.querySelector<HTMLElement>("[data-rope-anchor]");
    const anchorX = () => {
      if (!anchorEl) return window.innerWidth / 2;
      const r = anchorEl.getBoundingClientRect();
      return Math.max(ICON_SIZE / 2 + 4, r.left + r.width / 2);
    };
    const anchorY = () => {
      if (!anchorEl) return 64;
      return anchorEl.getBoundingClientRect().bottom + 4;
    };

    const segLen = () => Math.max(9, (anchorY() + 150 - ICON_GAP_TOTAL()) / SEG_COUNT - 0);
    const ICON_GAP_TOTAL = () => 0; // natural length tuned below

    let width = 1, height = 1;

    const init = () => {
      width = Math.max(wrap.clientWidth || window.innerWidth, 1);
      height = 190; // generous drag room under the header
      const ax = anchorX();
      const ay = anchorY();
      const len = 9.5; // chunky, thick rope links
      pointsRef.current = Array.from({ length: SEG_COUNT + 1 }, (_, i) => ({
        x: ax, y: ay + i * len, px: ax, py: ay + i * len,
      }));
      if (anchorDotRef.current) {
        anchorDotRef.current.setAttribute("cx", ax.toFixed(1));
        anchorDotRef.current.setAttribute("cy", ay.toFixed(1));
      }
    };
    init();

    const onResize = () => init();
    window.addEventListener("resize", onResize);

    const setLocal = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect();
      return {
        x: Math.min(Math.max(clientX - rect.left, ICON_SIZE / 2 + 2), Math.max(width - ICON_SIZE / 2 - 2, ICON_SIZE / 2 + 2)),
        y: Math.min(Math.max(clientY - rect.top, ICON_SIZE / 2 + 4), height - ICON_SIZE / 2 - 2),
      };
    };

    /* ── Pointer handling — stable tap, thresholded stretch ── */
    const onDown = (e: PointerEvent) => {
      // NO drag starts here — a plain press/click must never move the rope.
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (downRef.current.t === 0) return;
      const moved = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
      downRef.current.moved = Math.max(downRef.current.moved, moved);

      // Physics engages ONLY once the rope is genuinely stretched.
      if (!stretchRef.current && moved > STRETCH_THRESHOLD) {
        stretchRef.current = true;
        const tip = pointsRef.current[pointsRef.current.length - 1];
        // Kill velocity so engagement doesn't produce a snap.
        tip.px = tip.x; tip.py = tip.y;
        dragRef.current = setLocal(e.clientX, e.clientY);
      }
      if (stretchRef.current) dragRef.current = setLocal(e.clientX, e.clientY);
    };
    const onUp = () => {
      if (downRef.current.t === 0) return;
      const dt = Date.now() - downRef.current.t;
      const wasStretched = stretchRef.current;
      stretchRef.current = false;
      dragRef.current = null;
      downRef.current.t = 0;
      // Plain tap/click on the resting icon → standard navigation.
      if (!wasStretched && downRef.current.moved < 8 && dt < TAP_MAX_MS) onOpenRef.current();
    };

    const icon = iconRef.current;
    icon?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    /* ── Physics + render loop ── */
    let raf = 0;
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      t++;
      const pts = pointsRef.current;
      if (!pts.length) return;
      const len = 9.5;

      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x; p.py = p.y;
        p.x += vx + (i > pts.length / 2 ? Math.sin(t / 45) * WIND : 0);
        p.y += vy + GRAVITY;
      }

      for (let k = 0; k < ITERATIONS; k++) {
        pts[0].x = anchorX();
        pts[0].y = anchorY();
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

      /* ── Render: centerline + braided strands ── */
      const smooth = () => {
        let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`;
        }
        const tip = pts[pts.length - 1];
        d += ` L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
        return d;
      };
      const line = smooth();
      bodyRef.current?.setAttribute("d", line);
      shadowRef.current?.setAttribute("d", line);

      // Twisted strands offset from the centerline — the braid texture.
      const strand = (amp: number, phase: number, speed: number) => {
        let d = "";
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(pts.length - 1, i + 1)];
          const tx = next.x - prev.x, ty = next.y - prev.y;
          const tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl, ny = tx / tl;
          const off = Math.sin(i * 1.15 + phase + t / speed) * amp;
          d += i === 0
            ? `M ${(p.x + nx * off).toFixed(1)} ${(p.y + ny * off).toFixed(1)}`
            : ` L ${(p.x + nx * off).toFixed(1)} ${(p.y + ny * off).toFixed(1)}`;
        }
        return d;
      };
      braidARef.current?.setAttribute("d", strand(2.8, 0, 16));
      braidBRef.current?.setAttribute("d", strand(-2.8, Math.PI, 16));

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
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "fixed inset-x-0 top-[calc(5rem+env(safe-area-inset-top))] bottom-0 z-[120] pointer-events-none lg:hidden",
        className,
      )}
    >
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0 w-full h-full overflow-visible"
        aria-hidden="true"
      >
        {/* Soft shadow underlay — rope depth, solid tone */}
        <path ref={shadowRef} fill="none" className="stroke-black/10" strokeWidth={10.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Main rope body — thick solid orange */}
        <path ref={bodyRef} fill="none" className="stroke-primary" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        {/* Braid strands — solid dark/light tones, no gradients */}
        <path ref={braidARef} fill="none" className="stroke-black/25" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        <path ref={braidBRef} fill="none" className="stroke-white/40" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        {/* Mount plate — where the rope meets the header border */}
        <circle ref={anchorDotRef} r={5} className="fill-primary stroke-black" strokeWidth={1.5} />
      </svg>

      {/* ≡ Menu icon — bound to the rope tip */}
      <button
        ref={iconRef}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onClick={(e) => e.preventDefault()}
        aria-label="Open guild navigation"
        data-testid="button-guild-nav"
        className="absolute left-0 top-0 w-[46px] h-[46px] -ml-[23px] -mt-[23px] pointer-events-auto cursor-grab active:cursor-grabbing touch-none select-none
                   bg-black text-white border-2 border-black rounded-xl flex items-center justify-center
                   shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]
                   transition-[background-color] duration-150 hover:bg-primary"
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
