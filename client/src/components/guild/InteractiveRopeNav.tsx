/**
 * InteractiveRopeNav — super-realistic braided rope navigation (mobile).
 *
 * A thick ORANGE rope that reads like real fibre rope, built entirely from
 * solid-color SVG strokes (no gradients):
 *   • dark outline + cylindrical side shading (dark/light parallel bands)
 *   • twisted strand wraps (dark + light sinusoids around the core)
 *   • tiny fibre hairs along the edges
 * All layers follow the same Verlet chain every frame, so the whole rope
 * bends, swings and springs back with real physics.
 *
 * Interaction contract:
 *   • Tap/click the ≡ icon while the rope rests → open drawer (zero movement)
 *   • Drag past a small threshold → rope stretches and follows the pointer
 *   • Release → inertia + wobble spring-back
 */
import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const GRAVITY = 0.5;
const DAMPING = 0.985;
const ITERATIONS = 24;
const SEG_COUNT = 12;
const WIND = 0.016;
const LINK = 9.5;
const ICON_SIZE = 46;
const STRETCH_THRESHOLD = 14;
const TAP_MAX_MS = 400;

/* Solid rope palette — no gradients anywhere */
const C = {
  shadow: "rgba(0,0,0,0.13)",
  outline: "rgba(0,0,0,0.30)",
  darkEdge: "#a84300",
  lightEdge: "#ff9d55",
  core: "#ff6b00",
  coreLight: "#ff7f1f",
  twistDark: "#9c3f00",
  twistLight: "#ffc49b",
  fiber: "rgba(0,0,0,0.22)",
};

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
  const shadowRef = useRef<SVGPathElement>(null);
  const outlineRef = useRef<SVGPathElement>(null);
  const darkEdgeRef = useRef<SVGPathElement>(null);
  const lightEdgeRef = useRef<SVGPathElement>(null);
  const coreRef = useRef<SVGPathElement>(null);
  const twistDarkRef = useRef<SVGPathElement>(null);
  const twistLightRef = useRef<SVGPathElement>(null);
  const fibersRef = useRef<SVGPathElement>(null);
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

    // Anchor = the divider line at the bottom of the main header (Y) and the
    // THORX. branding position (X). Viewport coords are converted to
    // wrap-local coords every frame so the rope head stays glued to that
    // divider through resizes/rotation.
    const headerEl = document.querySelector<HTMLElement>(".portal-topnav");
    const logoEl = document.querySelector<HTMLElement>("[data-rope-anchor]");
    const anchorLocal = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const headerRect = headerEl?.getBoundingClientRect();
      const logoRect = logoEl?.getBoundingClientRect();
      const x = (logoRect ? logoRect.left + logoRect.width / 2 : (headerRect ? headerRect.left + 32 : wrapRect.width / 2)) - wrapRect.left;
      const y = headerRect
        ? headerRect.bottom - wrapRect.top + 1 // right on the divider line
        : 6;
      return {
        x: Math.min(Math.max(x, ICON_SIZE / 2 + 4), Math.max(wrapRect.width - ICON_SIZE / 2 - 4, ICON_SIZE / 2 + 4)),
        y: Math.max(y, ICON_SIZE / 2 + 2),
      };
    };

    let width = 1;

    const init = () => {
      width = Math.max(wrap.clientWidth || window.innerWidth, 1);
      const a = anchorLocal();
      pointsRef.current = Array.from({ length: SEG_COUNT + 1 }, (_, i) => ({
        x: a.x, y: a.y + i * LINK, px: a.x, py: a.y + i * LINK,
      }));
    };
    init();

    const onResize = () => init();
    window.addEventListener("resize", onResize);

    const setLocal = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect();
      return {
        x: Math.min(Math.max(clientX - rect.left, ICON_SIZE / 2 + 2), Math.max(width - ICON_SIZE / 2 - 2, ICON_SIZE / 2 + 2)),
        y: Math.min(Math.max(clientY - rect.top, ICON_SIZE / 2 + 4), window.innerHeight - rect.top - ICON_SIZE / 2 - 2),
      };
    };

    /* ── Pointer: stable tap, thresholded stretch ── */
    const onDown = (e: PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (downRef.current.t === 0) return;
      const moved = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
      downRef.current.moved = Math.max(downRef.current.moved, moved);
      if (!stretchRef.current && moved > STRETCH_THRESHOLD) {
        stretchRef.current = true;
        const tip = pointsRef.current[pointsRef.current.length - 1];
        tip.px = tip.x; tip.py = tip.y; // no snap on engagement
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
      if (!wasStretched && downRef.current.moved < 8 && dt < TAP_MAX_MS) onOpenRef.current();
    };

    const icon = iconRef.current;
    icon?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    /* ── Physics + realistic render loop ── */
    let raf = 0;
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      t++;
      const pts = pointsRef.current;
      if (!pts.length) return;

      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x; p.py = p.y;
        p.x += vx + (i > pts.length / 2 ? Math.sin(t / 45) * WIND : 0);
        p.y += vy + GRAVITY;
      }

      for (let k = 0; k < ITERATIONS; k++) {
        const a0 = anchorLocal();
        pts[0].x = a0.x;
        pts[0].y = a0.y;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = (d - LINK) / d;
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

      /* ── Render helpers ── */
      const normals = pts.map((p, i) => {
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const tx = next.x - prev.x, ty = next.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1;
        return { nx: -ty / tl, ny: tx / tl, tx: tx / tl, ty: ty / tl };
      });

      // Offset polyline — follows the rope at a constant normal distance.
      const offsetPath = (off: number) => {
        let d = "";
        for (let i = 0; i < pts.length; i++) {
          const x = pts[i].x + normals[i].nx * off;
          const y = pts[i].y + normals[i].ny * off;
          d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        return d;
      };

      // Twisted strand — sinusoid along the normal (the braid wrap).
      const strandPath = (amp: number, phase: number, freq: number, speed: number) => {
        let d = "";
        for (let i = 0; i < pts.length; i++) {
          const off = Math.sin(i * freq + phase + t / speed) * amp;
          const x = pts[i].x + normals[i].nx * off;
          const y = pts[i].y + normals[i].ny * off;
          d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        return d;
      };

      // Fibre hairs — tiny static-seeded bristles poking off the edges.
      const fiberPath = () => {
        let d = "";
        for (let i = 1; i < pts.length; i += 2) {
          const seed = (i * 2654435761) % 1000 / 1000; // stable pseudo-random
          const side = i % 4 === 1 ? 1 : -1;
          const angle = side * (1.25 + seed * 0.5);
          const x1 = pts[i].x + normals[i].nx * 4.4 * side;
          const y1 = pts[i].y + normals[i].ny * 4.4 * side;
          const x2 = x1 + Math.cos(angle) * (1.6 + seed * 1.6) * side;
          const y2 = y1 + Math.sin(Math.abs(angle)) * (1.6 + seed * 1.6);
          d += `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        }
        return d;
      };

      // Cylindrical shading: dark edge on one side, light edge on the other.
      const shadow = offsetPath(0.8);
      const outline = offsetPath(0);
      const darkEdge = offsetPath(-3.0);
      const lightEdge = offsetPath(3.0);
      const core = offsetPath(0);

      shadowRef.current?.setAttribute("d", shadow);
      outlineRef.current?.setAttribute("d", outline);
      darkEdgeRef.current?.setAttribute("d", darkEdge);
      lightEdgeRef.current?.setAttribute("d", lightEdge);
      coreRef.current?.setAttribute("d", core);
      twistDarkRef.current?.setAttribute("d", strandPath(2.6, 0, 2.1, 18));
      twistLightRef.current?.setAttribute("d", strandPath(2.6, Math.PI * 0.75, 2.1, 18));
      fibersRef.current?.setAttribute("d", fiberPath());

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
        {/* Drop shadow — grounds the rope against the page */}
        <path ref={shadowRef} fill="none" stroke={C.shadow} strokeWidth={11.5} strokeLinecap="round" strokeLinejoin="round" transform="translate(0,1.6)" />
        {/* Dark outline — defines the rope silhouette */}
        <path ref={outlineRef} fill="none" stroke={C.outline} strokeWidth={10.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Cylindrical side shading — dark edge (left of normal) */}
        <path ref={darkEdgeRef} fill="none" stroke={C.darkEdge} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
        {/* Cylindrical side shading — light edge (right of normal) */}
        <path ref={lightEdgeRef} fill="none" stroke={C.lightEdge} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Core — brightest band along the rope */}
        <path ref={coreRef} fill="none" stroke={C.coreLight} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        {/* Twisted strand wraps — dark */}
        <path ref={twistDarkRef} fill="none" stroke={C.twistDark} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        {/* Twisted strand wraps — light, phase-shifted */}
        <path ref={twistLightRef} fill="none" stroke={C.twistLight} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
        {/* Fibre hairs — subtle bristles off the edges */}
        <path ref={fibersRef} fill="none" stroke={C.fiber} strokeWidth={0.8} strokeLinecap="round" />
        {/* Mount plate — rope meets the header border */}
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
