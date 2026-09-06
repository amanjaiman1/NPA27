/* ════════════════════════════════════════════════════════════════
   Wallpapers — the layer behind the whole app.

   Everything except `photo` and `custom` is pure CSS built from the
   active palette, so it costs no bytes and re-tints itself when the
   palette changes. The actual gradients live in globals.css under
   `[data-wallpaper="…"]`; this module carries the catalogue, the
   preview swatches and the sensible starting dim for each.

   A custom image never enters the synced snapshot — the blob lives in
   IndexedDB on the device (see `lib/wallpaper-store.ts`) and only the
   id travels.
   ════════════════════════════════════════════════════════════════ */

export type WallpaperId =
  | "none"
  | "mesh"
  | "aurora"
  | "beams"
  | "grid"
  | "dots"
  | "rings"
  | "academy"
  | "custom";

export const DEFAULT_WALLPAPER: WallpaperId = "none";

export interface WallpaperMeta {
  id: WallpaperId;
  label: string;
  hint: string;
  /** Preview for the picker — any CSS `background` value. */
  swatch: string;
  /** How much canvas colour to lay over it by default, 0–0.9. */
  dim: number;
  kind: "flat" | "pattern" | "image";
}

export const WALLPAPERS: WallpaperMeta[] = [
  {
    id: "none",
    label: "Plain",
    hint: "Just the surface",
    swatch: "linear-gradient(150deg, rgb(var(--card)), rgb(var(--ink)))",
    dim: 0,
    kind: "flat",
  },
  {
    id: "mesh",
    label: "Mesh",
    hint: "Soft colour pools",
    swatch:
      "radial-gradient(60% 60% at 20% 20%, rgb(var(--aura-1)/0.9), transparent 70%), radial-gradient(60% 60% at 80% 70%, rgb(var(--aura-2)/0.85), transparent 70%), rgb(var(--ink))",
    dim: 0.35,
    kind: "pattern",
  },
  {
    id: "aurora",
    label: "Aurora",
    hint: "Ribbons of light",
    swatch:
      "conic-gradient(from 210deg at 30% 10%, rgb(var(--aura-1)/0.95), transparent 40%), conic-gradient(from 20deg at 80% 90%, rgb(var(--aura-2)/0.9), transparent 45%), rgb(var(--ink))",
    dim: 0.4,
    kind: "pattern",
  },
  {
    id: "beams",
    label: "Beams",
    hint: "Light from above",
    swatch:
      "conic-gradient(from 200deg at 50% -20%, transparent 0deg, rgb(var(--aura-1)/0.9) 20deg, transparent 40deg, rgb(var(--aura-2)/0.8) 60deg, transparent 80deg), rgb(var(--ink))",
    dim: 0.35,
    kind: "pattern",
  },
  {
    id: "grid",
    label: "Blueprint",
    hint: "Fading graph paper",
    swatch:
      "linear-gradient(rgb(var(--paper)/0.35) 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, rgb(var(--paper)/0.35) 1px, transparent 1px) 0 0/10px 10px, rgb(var(--ink))",
    dim: 0.1,
    kind: "pattern",
  },
  {
    id: "dots",
    label: "Dots",
    hint: "Quiet dot field",
    swatch:
      "radial-gradient(rgb(var(--paper)/0.45) 1.2px, transparent 1.2px) 0 0/9px 9px, rgb(var(--ink))",
    dim: 0.1,
    kind: "pattern",
  },
  {
    id: "rings",
    label: "Contour",
    hint: "Topographic rings",
    swatch:
      "repeating-radial-gradient(circle at 30% 120%, rgb(var(--paper)/0.32) 0 1px, transparent 1px 7px), rgb(var(--ink))",
    dim: 0.15,
    kind: "pattern",
  },
  {
    id: "academy",
    label: "The Academy",
    hint: "A still from your film",
    swatch: "url('/media/hero-poster-sm.jpg') center 38%/cover",
    dim: 0.85,
    kind: "image",
  },
  {
    id: "custom",
    label: "Your photo",
    hint: "Stays on this device",
    swatch:
      "linear-gradient(150deg, rgb(var(--aura-1)/0.5), rgb(var(--aura-2)/0.4)), rgb(var(--card))",
    dim: 0.8,
    kind: "image",
  },
];

export function isWallpaper(v: unknown): v is WallpaperId {
  return WALLPAPERS.some((w) => w.id === v);
}

export function wallpaperMeta(id: WallpaperId): WallpaperMeta {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}
