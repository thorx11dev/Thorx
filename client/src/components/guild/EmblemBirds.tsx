/**
 * EmblemBirds — playful "CLICK ME" bird-flight animation.
 *
 * Words launch out of the guild nav emblem (webp) one after another, fly
 * across the viewport in bird-like flight (wing-flap bobbing + random
 * steering noise), and exit through a screen corner. Up to 4 words are
 * visible at once. Each exit triggers the next word to spawn. A tap on the
 * emblem (parent button) still works — birds are pointer-transparent.
 */
import { useEffect, useRef } from "react";

const WORDS = ["CLICK", "ME", "CLICK", "ME"];

/* Flight tuning */
const SPAWN_DELAY = 900;        // ms between word launches
const MAX_VISIBLE = 4;          // cap on simultaneous words
const FLIGHT_MS = [5200, 7000]; // random flight duration range
const BOB_AMP = 26;             // wing-flap vertical bob amplitude (px)
const BOB_FREQ = 2.4;           // bob cycles
const NOISE = 46;               // random steering noise (px)

interface Bird {
  el: HTMLSpanElement;
  x: number; y: number;      // current position
  sx: number; sy: number;    // spawn (emblem) position
  ex: number; ey: number;    // exit corner
  t0: number;                // start time
  dur: number;               // flight duration
  phase: number;             // bob phase offset
  size: number;
  rot: number;               // facing rotation
}

/** Pick an exit corner away from the spawn point. */
function pickExit(sx: number, sy: number, W: number, H: number) {
  const corners = [
    { x: -60, y: -60 }, { x: W + 60, y: -60 },
    { x: -60, y: H + 60 }, { x: W + 60, y: H + 60 },
  ];
  const far = corners.filter(c => Math.hypot(c.x - sx, c.y - sy) > 300);
  return far[Math.floor(Math.random() * far.length)];
}

export function EmblemBirds({ anchorRef }: { anchorRef: React.RefObject<HTMLElement | null> }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const birdsRef = useRef<Bird[]>([]);
  const spawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    let running = true;
    let wordIdx = 0;

    const spawn = () => {
      if (!running || !layer) return;
      const alive = birdsRef.current;
      // Keep at most MAX_VISIBLE words on screen; only spawn when a slot frees.
      if (alive.length >= MAX_VISIBLE) return;

      const anchor = anchorRef.current;
      const rect = anchor?.getBoundingClientRect();
      const W = window.innerWidth, H = window.innerHeight;
      if (!rect) return;
      const sx = rect.left + rect.width / 2;
      const sy = rect.top + rect.height / 2;
      const exit = pickExit(sx, sy, W, H);
      const dur = FLIGHT_MS[0] + Math.random() * (FLIGHT_MS[1] - FLIGHT_MS[0]);

      const el = document.createElement("span");
      el.textContent = WORDS[wordIdx % WORDS.length];
      wordIdx++;
      el.className = "guild-bird-text";
      el.style.fontSize = `${15 + Math.random() * 6}px`;
      layer.appendChild(el);

      const bird: Bird = {
        el, sx, sy, ex: exit.x, ey: exit.y,
        x: sx, y: sy,
        t0: performance.now(),
        dur,
        phase: Math.random() * Math.PI * 2,
        size: 1,
        rot: 0,
      };
      alive.push(bird);
    };

    /* ── rAF flight loop — bird-like path: ease-in launch, noise steering,
          wing-flap bob, rotation toward travel direction, corner exit ── */
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!running) return;

      const W = window.innerWidth, H = window.innerHeight;
      const birds = birdsRef.current;

      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i];
        const p = (now - b.t0) / b.dur;
        if (p >= 1) {
          b.el.remove();
          birds.splice(i, 1);
          scheduleNext();
          continue;
        }

        // Ease-in-out horizontal sweep spawn → exit
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const bx = b.sx + (b.ex - b.sx) * ease;
        // Vertical: eased glide + wing-flap bob + wandering noise
        const baseY = b.sy + (b.ey - b.sy) * ease;
        const flap = Math.sin(p * Math.PI * 2 * BOB_FREQ + b.phase) * BOB_AMP * Math.sin(p * Math.PI);
        const wander =
          Math.sin(p * Math.PI * 3.1 + b.phase * 2) * NOISE * Math.sin(p * Math.PI) +
          Math.cos(p * Math.PI * 5.7 + b.phase) * NOISE * 0.4;
        const by = baseY + flap + wander;

        // Rotation faces the direction of travel (bird banking)
        const dx = bx - b.x, dy = by - b.y;
        const targetRot = Math.max(-28, Math.min(28, Math.atan2(dy, Math.max(6, Math.abs(dx) + Math.abs(dy) * 0.4)) * 46));
        b.rot += (targetRot - b.rot) * 0.2;

        b.x = bx; b.y = by;
        const opacity = p < 0.08 ? p / 0.08 : p > 0.92 ? (1 - p) / 0.08 : 1;
        const scale = 0.7 + 0.3 * Math.sin(p * Math.PI); // grows then shrinks

        b.el.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0) translate(-50%,-50%) rotate(${b.rot.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
        b.el.style.opacity = opacity.toFixed(2);
      }
    };
    raf = requestAnimationFrame(tick);

    const scheduleNext = () => {
      if (spawnTimer.current) return;
      spawnTimer.current = setTimeout(() => {
        spawnTimer.current = null;
        spawn();
      }, SPAWN_DELAY);
    };

    // First launch + a steady cadence so words keep flowing out.
    spawn();
    const cadence = setInterval(() => {
      // Only spawn while under the cap — birds exiting free slots naturally.
      if (birdsRef.current.length < MAX_VISIBLE) spawn();
    }, SPAWN_DELAY * 2);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      clearInterval(cadence);
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
      birdsRef.current.forEach(b => b.el.remove());
      birdsRef.current = [];
    };
  }, [anchorRef]);

  return <div ref={layerRef} className="fixed inset-0 z-[115] pointer-events-none overflow-hidden" aria-hidden="true" />;
}

export default EmblemBirds;
