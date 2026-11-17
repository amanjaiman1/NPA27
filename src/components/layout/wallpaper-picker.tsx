"use client";

import { Check } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { WALLPAPERS, WALLPAPER_GROUPS, wallpaperMeta } from "@/lib/wallpaper";
import { cn } from "@/lib/utils";

/**
 * Wallpaper section of the Settings sheet.
 *
 * The previews are the real thing in miniature — each swatch is the same CSS
 * the full layer uses, built from the live palette, so what you pick is what
 * you get, and changing palette restyles both at once.
 */
export function WallpaperPicker() {
  const wallpaper = useChronicle((s) => s.wallpaper);
  const dim = useChronicle((s) => s.wallpaperDim);
  const setWallpaper = useChronicle((s) => s.setWallpaper);
  const setDim = useChronicle((s) => s.setWallpaperDim);

  return (
    <div>
      <p className="eyebrow mb-1">Wallpaper</p>
      <p className="mb-3 text-xs leading-relaxed text-paper/45">
        The layer behind the app. The patterns are drawn from your palette, so
        they re-colour with it and cost nothing to load.
      </p>

      {WALLPAPER_GROUPS.map((group) => {
        const items = WALLPAPERS.filter((w) => w.group === group.id);
        if (!items.length) return null;
        return (
          <div key={group.id} className="mb-4 last:mb-0">
            <p className="mb-2 flex items-baseline gap-2 text-[0.7rem] font-semibold text-paper/55">
              {group.label}
              <span className="font-normal text-paper/35">{group.hint}</span>
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {items.map((w) => {
                const active = wallpaper === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setWallpaper(w.id)}
                    title={w.hint}
                    className={cn(
                      "group relative flex min-w-0 flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all",
                      active
                        ? "border-accent ring-1 ring-accent/40"
                        : "border-line hover:border-paper/30",
                    )}
                  >
                    <span
                      className="h-11 w-full overflow-hidden rounded-lg border border-line"
                      style={{ background: w.swatch }}
                    />
                    <span className="w-full truncate text-[0.7rem] font-medium text-paper">
                      {w.label}
                    </span>
                    {active && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Dim: the one control that keeps text readable over anything. */}
      {wallpaper !== "none" && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="wp-dim" className="text-[0.78rem] font-semibold text-paper/60">
              Dim
            </label>
            <span className="tabular text-[0.7rem] text-paper/45">
              {Math.round(dim * 100)}%
            </span>
          </div>
          <input
            id="wp-dim"
            type="range"
            min={0}
            max={90}
            step={5}
            value={Math.round(dim * 100)}
            onChange={(e) => setDim(Number(e.target.value) / 100)}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-paper/10 accent-accent"
          />
          <p className="mt-1.5 text-[0.7rem] text-paper/40">
            More dim, more contrast for text. {wallpaperMeta(wallpaper).label} starts
            at {Math.round(wallpaperMeta(wallpaper).dim * 100)}%.
          </p>
        </div>
      )}
    </div>
  );
}
