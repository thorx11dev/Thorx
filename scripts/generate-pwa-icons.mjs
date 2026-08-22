// Generates THORX PWA icons from an inline SVG monogram (black plate, orange
// "T." brand mark). Re-run any time branding changes: `node scripts/generate-pwa-icons.mjs`
import sharp from "sharp";
import { mkdir } from "fs/promises";

const OUT_DIR = "client/public/icons";
const ORANGE = "#ff6b00";

/** Monogram SVG at a given canvas size; inset keeps the mark inside the
 *  maskable safe zone (~80%) so Android's circle mask never clips it. */
function svg(size, { inset = 0.18 } = {}) {
  const pad = Math.round(size * inset);
  const inner = size - pad * 2;
  // "T." set in a heavy geometric style — drawn as paths so no font is needed.
  const tBarW = inner * 0.78;
  const tStemW = inner * 0.24;
  const dotR = inner * 0.115;
  const barH = inner * 0.2;
  const topY = pad + inner * 0.08;
  const stemTop = topY + barH;
  const stemBottom = pad + inner * 0.72;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * (inset > 0.1 ? 0 : 0.22))}" fill="#000000"/>
  <rect x="${pad + (inner - tBarW) / 2}" y="${topY}" width="${tBarW}" height="${barH}" fill="${ORANGE}"/>
  <rect x="${pad + (inner - tStemW) / 2}" y="${stemTop}" width="${tStemW}" height="${stemBottom - stemTop}" fill="#ffffff"/>
  <circle cx="${pad + inner / 2 + tStemW * 1.4}" cy="${pad + inner * 0.82}" r="${dotR}" fill="${ORANGE}"/>
</svg>`;
}

await mkdir(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, opts: { inset: 0.14 } },
  { file: "icon-512.png", size: 512, opts: { inset: 0.14 } },
  { file: "icon-maskable-512.png", size: 512, opts: { inset: 0.24 } }, // full-bleed square, mark in safe zone
  { file: "apple-touch-icon.png", size: 180, opts: { inset: 0.16 } }, // iOS adds its own rounding
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t.size, t.opts))).png().toFile(`${OUT_DIR}/${t.file}`);
  console.log(`[pwa] wrote ${OUT_DIR}/${t.file}`);
}
console.log("[pwa] done");
