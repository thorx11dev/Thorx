/**
 * InteractiveRopeNav — real-texture rope navigation (mobile).
 *
 * A AI-rendered rope artwork (craiyon) is straightened at load time
 * (per-row centre unwarp) into a clean vertical texture, then mapped onto
 * a Verlet physics chain with arc-length texture slices — the rope bends,
 * swings, stretches elastically and springs back with inertia.
 *
 * Anchor: fixed to the divider line at the bottom of the main header,
 * under the THORX. branding ([data-rope-anchor]).
 *
 * Interaction contract:
 *   • Tap/click ≡ while resting → open drawer. Rope does not move.
 *   • Drag past threshold → elastic stretch + pointer-follow with velocity.
 *   • Release → momentum throw + wobble spring-back.
 *   • Icon binds to the rope tip, tilting subtly with the swing.
 */
import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const TEXTURE_URL = "/rope/craiyon-ref.png";

const GRAVITY = 0.5;
const DAMPING = 0.985;
const ITERATIONS = 24;
const SEG_COUNT = 26;
const LINK = 7;                 // natural segment length (screen px)
const CHAIN_NATURAL = SEG_COUNT * LINK;
const MAX_STRETCH = 1.38;       // elastic cap
const ROPE_W = 11;              // on-screen rope width
const TEX_W = 200;              // straightened texture width
const TEX_DENSITY = 1.8;        // texture px per screen px (texture is hi-res)
const ICON_SIZE = 46;
const STRETCH_THRESHOLD = 14;
const TAP_MAX_MS = 400;

interface RopePoint { x: number; y: number; px: number; py: number; }

/** Unwarp the artwork into a straight vertical rope texture (offscreen). */
function buildStraightTexture(img: HTMLImageElement): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext("2d")!;
  sctx.drawImage(img, 0, 0);

  const { width: W, height: H } = src;
  const data = sctx.getImageData(0, 0, W, H).data;

  const tex = document.createElement("canvas");
  tex.width = TEX_W;
  tex.height = H;
  const tctx = tex.getContext("2d")!;
  const out = tctx.createImageData(TEX_W, H);

  // Per-row weighted centre of opaque pixels → the rope's local axis.
  const centres = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let sum = 0, w = 0;
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a > 24) { sum += x * a; w += a; }
    }
    centres[y] = w > 0 ? sum / w : W / 2;
  }
  // Smooth the centre line so the unwarp doesn't jitter row to row.
  const sm = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0, n = 0;
    for (let k = -14; k <= 14; k++) {
      const yy = Math.min(H - 1, Math.max(0, y + k));
      s += centres[yy]; n++;
    }
    sm[y] = s / n;
  }

  // Copy a TEX_W-wide window around the smoothed centre, row by row.
  const half = TEX_W / 2;
  for (let y = 0; y < H; y++) {
    const cx = sm[y];
    const srcX0 = Math.round(cx - half);
    for (let x = 0; x < TEX_W; x++) {
      const sx = Math.min(W - 1, Math.max(0, srcX0 + x));
      const si = (y * W + sx) * 4;
      const di = (y * TEX_W + x) * 4;
      out.data[di] = data[si];
      out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2];
      out.data[di + 3] = data[si + 3];
    }
  }
  tctx.putImageData(out, 0, 0);
  return tex;
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const pointsRef = useRef<RopePoint[]>([]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const stretchRef = useRef(false);
  const downRef = useRef({ x: 0, y: 0, t: 0, moved: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const lastPtRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* ── Texture load + straighten ── */
    let tex: HTMLCanvasElement | null = null;
    const texImg = new Image();
    texImg.onload = () => { tex = buildStraightTexture(texImg); };
    texImg.src = TEXTURE_URL;

    /* ── Anchor: divider line under THORX. branding ── */
    const headerEl = document.querySelector<HTMLElement>(".portal-topnav");
    const logoEl = document.querySelector<HTMLElement>("[data-rope-anchor]");
    const anchorLocal = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const headerRect = headerEl?.getBoundingClientRect();
      const logoRect = logoEl?.getBoundingClientRect();
      const x = (logoRect ? logoRect.left + logoRect.width / 2 : (headerRect ? headerRect.left + 32 : wrapRect.width / 2)) - wrapRect.left;
      const y = headerRect ? headerRect.bottom - wrapRect.top + 1 : 6;
      return {
        x: Math.min(Math.max(x, ICON_SIZE / 2 + 4), Math.max(wrapRect.width - ICON_SIZE / 2 - 4, ICON_SIZE / 2 + 4)),
        y: Math.max(y, ICON_SIZE / 2 + 2),
      };
    };

    const init = () => {
      const a = anchorLocal();
      pointsRef.current = Array.from({ length: SEG_COUNT + 1 }, (_, i) => ({
        x: a.x, y: a.y + i * LINK, px: a.x, py: a.y + i * LINK,
      }));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(wrap.clientWidth * dpr);
      canvas.height = Math.floor(wrap.clientHeight * dpr);
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    init();

    const onResize = () => init();
    window.addEventListener("resize", onResize);

    const setLocal = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect();
      return {
        x: Math.min(Math.max(clientX - rect.left, ICON_SIZE / 2 + 2), Math.max(wrap.clientWidth - ICON_SIZE / 2 - 2, ICON_SIZE / 2 + 2)),
        y: Math.min(Math.max(clientY - rect.top, ICON_SIZE / 2 + 4), window.innerHeight - rect.top - ICON_SIZE / 2 - 2),
      };
    };

    /* ── Pointer: stable tap, thresholded elastic stretch ── */
    const onDown = (e: PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
      velRef.current = { x: 0, y: 0 };
      lastPtRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };
    const onMove = (e: PointerEvent) => {
      if (downRef.current.t === 0) return;
      const moved = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
      downRef.current.moved = Math.max(downRef.current.moved, moved);

      const now = Date.now();
      if (lastPtRef.current && now - lastPtRef.current.t > 4) {
        const dt = Math.max(8, now - lastPtRef.current.t);
        const vx = (e.clientX - lastPtRef.current.x) / dt * 16;
        const vy = (e.clientY - lastPtRef.current.y) / dt * 16;
        velRef.current.x = velRef.current.x * 0.55 + vx * 0.45;
        velRef.current.y = velRef.current.y * 0.55 + vy * 0.45;
        lastPtRef.current = { x: e.clientX, y: e.clientY, t: now };
      }

      if (!stretchRef.current && moved > STRETCH_THRESHOLD) {
        stretchRef.current = true;
        const tip = pointsRef.current[pointsRef.current.length - 1];
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
      if (!wasStretched && downRef.current.moved < 8 && dt < TAP_MAX_MS) {
        onOpenRef.current();
      } else if (wasStretched) {
        // Momentum throw — pointer velocity becomes tip velocity.
        const tip = pointsRef.current[pointsRef.current.length - 1];
        tip.px = tip.x - velRef.current.x * 0.9;
        tip.py = tip.y - velRef.current.y * 0.9;
      }
      lastPtRef.current = null;
    };

    const icon = iconRef.current;
    icon?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    /* ── Physics + texture render loop ── */
    let raf = 0;
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      t++;
      const pts = pointsRef.current;
      if (!pts.length) return;
      const a0 = anchorLocal();

      // Elastic stretch — tension from tip distance past natural length.
      const tipDx = pts[pts.length - 1].x - a0.x;
      const tipDy = pts[pts.length - 1].y - a0.y;
      const tension = Math.min(1, Math.max(0, (Math.hypot(tipDx, tipDy) - CHAIN_NATURAL) / (CHAIN_NATURAL * 1.2)));
      const linkEff = LINK * (1 + tension * 0.38);

      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x; p.py = p.y;
        p.x += vx + (i > pts.length / 2 ? Math.sin(t / 45) * 0.016 : 0);
        p.y += vy + GRAVITY;
      }

      for (let k = 0; k < ITERATIONS; k++) {
        pts[0].x = a0.x;
        pts[0].y = a0.y;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = (d - linkEff) / d;
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

      // Hard elastic cap — can never overstretch.
      const tip = pts[pts.length - 1];
      const tdx = tip.x - a0.x, tdy = tip.y - a0.y;
      const tLen = Math.hypot(tdx, tdy) || 1;
      const maxLen = CHAIN_NATURAL * MAX_STRETCH;
      if (tLen > maxLen) {
        tip.x = a0.x + tdx / tLen * maxLen;
        tip.y = a0.y + tdy / tLen * maxLen;
      }

      /* ── Render: texture-mapped rope ── */
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      if (tex) {
        const texH = tex.height;
        let cum = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1];
          const segLen = Math.hypot(q.x - p.x, q.y - p.y) || 0.001;
          const angle = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
          const srcH = segLen * TEX_DENSITY;
          let srcY = (cum * TEX_DENSITY) % texH;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(angle);
          if (srcY + srcH <= texH) {
            ctx.drawImage(tex, 0, srcY, TEX_W, srcH, -ROPE_W / 2, -0.5, ROPE_W, segLen + 1);
          } else {
            const part1 = texH - srcY;
            ctx.drawImage(tex, 0, srcY, TEX_W, part1, -ROPE_W / 2, -0.5, ROPE_W, part1 / TEX_DENSITY + 0.5);
            ctx.drawImage(tex, 0, 0, TEX_W, srcH - part1, -ROPE_W / 2, part1 / TEX_DENSITY - 0.5, ROPE_W, segLen + 1 - part1 / TEX_DENSITY);
          }
          ctx.restore();
          cum += segLen;
        }

        // End cap — small dark knot behind the icon
        ctx.save();
        ctx.translate(tip.x, tip.y);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.ellipse(0, 0, ROPE_W / 2 + 2, ROPE_W / 2 + 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Icon — bound to the tip, tilts subtly with the swing.
      if (iconRef.current) {
        const next = pts[pts.length - 2];
        const tilt = Math.max(-14, Math.min(14, Math.atan2(tip.x - next.x, Math.max(1, tip.y - next.y)) * -32));
        iconRef.current.style.transform =
          `translate3d(${tip.x.toFixed(1)}px, ${tip.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${tilt.toFixed(1)}deg)`;
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
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />

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
