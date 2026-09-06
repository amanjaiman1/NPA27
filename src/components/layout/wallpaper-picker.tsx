"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { WALLPAPERS, WALLPAPER_GROUPS, wallpaperMeta } from "@/lib/wallpaper";
import {
  MAX_BYTES,
  clearCustomWallpaper,
  compressImage,
  loadCustomWallpaper,
  saveCustomWallpaper,
} from "@/lib/wallpaper-store";
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the stored photo in its own swatch, if there is one.
  useEffect(() => {
    let url: string | null = null;
    void loadCustomWallpaper().then((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setCustomUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      if (blob.size > MAX_BYTES) {
        setError("That image is still too large after compression. Try a smaller one.");
        return;
      }
      await saveCustomWallpaper(blob);
      setCustomUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setWallpaper("custom");
    } catch {
      setError("Couldn't read that image. PNG or JPEG works best.");
    } finally {
      setBusy(false);
    }
  }

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
                const isCustom = w.id === "custom";
                const swatch =
                  isCustom && customUrl
                    ? `url(${customUrl}) center/cover`
                    : w.swatch;
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      if (isCustom && !customUrl) fileRef.current?.click();
                      else setWallpaper(w.id);
                    }}
                    title={w.hint}
                    className={cn(
                      "group relative flex min-w-0 flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all",
                      active
                        ? "border-accent ring-1 ring-accent/40"
                        : "border-line hover:border-paper/30",
                    )}
                  >
                    <span
                      className="grid h-11 w-full place-items-center overflow-hidden rounded-lg border border-line"
                      style={{ background: swatch }}
                    >
                      {isCustom && !customUrl && (
                        <ImagePlus className="h-4 w-4 text-paper/60" />
                      )}
                    </span>
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

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-semibold text-paper/75 transition-colors hover:border-paper/25 hover:text-paper disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {customUrl ? "Replace photo" : "Use your own photo"}
        </button>
        {customUrl && (
          <button
            onClick={() => {
              void clearCustomWallpaper();
              setCustomUrl((old) => {
                if (old) URL.revokeObjectURL(old);
                return null;
              });
              if (wallpaper === "custom") setWallpaper("none");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-xs font-medium text-paper/55 transition-colors hover:border-danger/40 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.7rem] text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        <p className="mt-2 text-[0.7rem] leading-relaxed text-paper/35">
          Your photo is downscaled in the browser and kept on this device only —
          it never goes into the cloud backup, so syncing stays fast.
        </p>
      )}
    </div>
  );
}
