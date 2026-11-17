"use client";

import { useChronicle } from "@/lib/store";

/**
 * The layer behind the whole app: wallpaper art, then a canvas-coloured dim,
 * then the ambient aura, then content.
 *
 * Deliberately static — no animation, no filters, one composited layer. The
 * patterns are CSS gradients built from the palette (see globals.css), so
 * switching palette re-tints the wallpaper for free.
 */
export function Wallpaper() {
  const wallpaper = useChronicle((s) => s.wallpaper);
  const dim = useChronicle((s) => s.wallpaperDim);

  if (wallpaper === "none") return null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="wallpaper-art" />
      {/* One dial for legibility: canvas colour laid back over the art. */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgb(var(--ink) / ${dim})` }}
      />
    </div>
  );
}
