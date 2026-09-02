/**
 * InteractiveRopeNav — photoreal sprite-rope navigation (mobile).
 *
 * The rope is a pre-rendered 36-frame sprite sheet (6×6, 326×822/frame)
 * captured from a 3D rope simulation — one full pendulum swing cycle.
 * A Verlet physics chain drives the tip; every frame we:
 *   1. solve the chain (gravity, damping, constraints, drag),
 *   2. match the tip offset against the sprite's baked tip table,
 *   3. cross-fade the two nearest frames so the rendered rope's tip
 *      lands exactly on the physics tip,
 *   4. rotate by any residual angle + stretch along the rope axis when
 *      the chain is pulled beyond natural length.
 *
 * Interaction contract (unchanged):
 *   • Tap/click the ≡ icon while resting → open drawer, rope never moves.
 *   • Drag past threshold → physics engage, rope follows + springs back.
 *
 * Fallback: until the sheet loads, nothing is drawn (local asset <100ms).
 */
import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const SHEET_URL = "/rope/rope-sprite.png";
const COLS = 6, ROWS = 6, FRAMES = 36;

/* Baked tip offsets (px, sprite-space) per frame — measured from the sheet.
   Index = frame; value = tip x relative to frame centre. */
const TIP_TABLE = [
  9, 17, 39, 61, 69, 85, 101, 115, 107, 119, 105, 79, 73, 59, 39, 23,
  -3, -23, -23, -29, -61, -69, -75, -99, -105, -127, -127, -117, -109,
  -107, -95, -73, -69, -41, -33, -1,
];
const SPRITE_ROPE_LEN = 812;   // rope span inside a frame (px)
const SPRITE_MAX_TIP = 127;    // widest swing tip offset in the sheet

const GRAVITY = 0.5;
const DAMPING = 0.985;
const ITERATIONS = 24;
const SEG_COUNT = 12;
const LINK = 9.5;
const CHAIN_NATURAL = LINK * SEG_COUNT;            // screen px at rest
const SPRITE_SCALE = CHAIN_NATURAL / SPRITE_ROPE_LEN; // ≈ 0.14
const ICON_SIZE = 46;
const STRETCH_THRESHOLD = 14;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const pointsRef = useRef<RopePoint[]>([]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const stretchRef = useRef(false);
  const downRef = useRef({ x: 0, y: 0, t: 0, moved: 0 });
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* ── Sprite sheet load ── */
    const sheet = new Image();
    let sheetReady = false;
    sheet.onload = () => { sheetReady = true; };
    sheet.src = SHEET_URL;

    /* ── Anchor: below the THORX. branding, on the header divider ── */
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

    let width = 1;

    const init = () => {
      width = Math.max(wrap.clientWidth || window.innerWidth, 1);
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
      if (!wasStretched && downRef.current.moved < 8 && dt < TAP_MAX_MS) onOpenRef.current();
    };

    const icon = iconRef.current;
    icon?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    /* ── Frame matching: physics tip offset → sprite frame pair ── */
    const pickFrames = (dxScreen: number): { a: number; b: number; mix: number } => {
      // Convert the physics tip offset into sprite-space pixels.
      const sx = dxScreen / SPRITE_SCALE;
      // Score every frame by how close its baked tip is to sx.
      const scored = TIP_TABLE.map((tip, i) => ({ i, d: Math.abs(tip - sx) }))
        .sort((p, q) => p.d - q.d);
      const a = scored[0].i, b = scored[1].i;
      const da = TIP_TABLE[a], db = TIP_TABLE[b];
      const mix = Math.abs(da - db) < 0.001 ? 0 : Math.min(1, Math.max(0, (sx - da) / (db - da)));
      return { a, b, mix: Math.abs(db - da) < 0.001 ? 0 : Math.max(0, Math.min(1, (sx - da) / (db - da))) } as any;
    };

    const drawFrame = (idx: number) => {
      const fw = sheet.width / COLS, fh = sheet.height / ROWS;
      const col = idx % COLS, row = Math.floor(idx / COLS);
      ctx.drawImage(sheet, col * fw, row * fh, fw, fh,
        -fw * SPRITE_SCALE / 2, 0, fw * SPRITE_SCALE, fh * SPRITE_SCALE);
    };

    /* ── Physics + render loop ── */
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
        p.x += vx + (i > pts.length / 2 ? Math.sin(t / 45) * 0.016 : 0);
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

      /* ── Sprite render ── */
      if (!sheetReady) return;
      const a0 = anchorLocal();
      const tip = pts[pts.length - 1];
      const dx = tip.x - a0.x;
      const dy = tip.y - a0.y;
      const chainLen = Math.hypot(dx, dy) || 1;
      const theta = Math.atan2(dx, dy); // 0 = hanging straight down

      const stretch = chainLen / CHAIN_NATURAL;
      const { a, b, mix } = pickFrames(dx);

      ctx.clearRect(0, 0, width, canvas.height);
      ctx.save();
      ctx.translate(a0.x, a0.y);
      ctx.rotate(theta);
      ctx.scale(1, Math.max(0.35, stretch));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 1 - mix;
      drawFrame(a);
      if (mix > 0.01) {
        ctx.globalAlpha = mix;
        drawFrame(b);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (iconRef.current) {
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
