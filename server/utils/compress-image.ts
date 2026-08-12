/**
 * Compress and normalize profile pictures before uploading to storage.
 *
 * - Strips EXIF metadata (privacy)
 * - Resizes to max 512x512 (covers any avatar use case)
 * - Converts to WebP at 80% quality (typical 5-10x reduction on PNGs)
 * - Falls back to original buffer if sharp fails (e.g. unsupported format)
 *
 * sharp is a heavy native module (~50-100MB resident). It is lazy-loaded
 * here so it only loads when a profile picture is actually uploaded —
 * free-tier hosts (e.g. Adaptable 256MB) otherwise see the app idle above
 * the container limit purely from sharp's footprint.
 */
export async function compressProfileImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const { default: sharp } = await import("sharp");
    const compressed = await sharp(buffer)
      .rotate() // auto-orient from EXIF
      .resize(512, 512, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    return { buffer: compressed, contentType: "image/webp" };
  } catch {
    // If sharp can't process (e.g. animated GIF, SVG), return original
    return { buffer, contentType };
  }
}
