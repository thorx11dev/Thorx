/**
 * One-off: generate all PWA icon sizes from a source image.
 * Usage: node scripts/generate-icons.mjs <source-image-path>
 * Outputs PNGs into client/public/icons/.
 */
import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("Usage: node scripts/generate-icons.mjs <source-image-path>");
  process.exit(1);
}

const outDir = path.resolve("client/public/icons");
const meta = await sharp(src).metadata();
console.log(`Source: ${meta.width}x${meta.height} (${meta.format})`);

const jobs = [
  // Any-purpose icons (transparency preserved if the source has it)
  { file: "icon-192.png", size: 192, fit: "contain", flatten: false },
  { file: "icon-512.png", size: 512, fit: "contain", flatten: false },
  // Maskable: full-bleed square so Android's circular mask never reveals gaps
  { file: "icon-maskable-512.png", size: 512, fit: "cover", flatten: false },
  // iOS home-screen icon: opaque, no alpha channel
  { file: "apple-touch-icon.png", size: 180, fit: "contain", flatten: true },
];

for (const job of jobs) {
  let pipeline = sharp(src).resize(job.size, job.size, {
    fit: job.fit,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (job.flatten) {
    pipeline = pipeline.flatten({ background: "#000000" });
  }
  const out = path.join(outDir, job.file);
  await pipeline.png().toFile(out);
  const info = await sharp(out).metadata();
  console.log(`✓ ${job.file}: ${info.width}x${info.height}`);
}

console.log("All icons generated.");
