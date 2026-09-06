"use client";

import { useEffect, useState } from "react";
import { useChronicle } from "@/lib/store";
import { loadCustomWallpaper } from "@/lib/wallpaper-store";

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
  const [customUrl, setCustomUrl] = useState<string | null>(null);

  // The custom photo lives in IndexedDB; mint a blob URL for it on demand and
  // revoke it when it changes, so we don't leak object URLs across switches.
  useEffect(() => {
    if (wallpaper !== "custom") {
      setCustomUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    void loadCustomWallpaper().then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setCustomUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [wallpaper]);

  if (wallpaper === "none") return null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div
        className="wallpaper-art"
        style={
          wallpaper === "custom" && customUrl
            ? { backgroundImage: `url(${customUrl})` }
            : undefined
        }
      />
      {/* One dial for legibility: canvas colour laid back over the art. */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgb(var(--ink) / ${dim})` }}
      />
    </div>
  );
}
