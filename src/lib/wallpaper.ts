/* ════════════════════════════════════════════════════════════════
   Wallpapers — the layer behind the whole app.

   Three families:
     • palette — built from --aura-1/--aura-2, so they re-tint whenever
       the palette changes
     • colour  — fixed hues, for when a specific mood is wanted
                 regardless of the accent
     • photo   — the still from the command-centre film, or the user's
                 own image

   Everything except the photos is pure CSS: no bytes to download, no
   animation, one composited layer. The gradients live in globals.css
   under `[data-wallpaper="…"]`; this module carries the catalogue, the
   preview swatches and the sensible starting dim for each.

   A custom image never enters the synced snapshot — the blob lives in
   IndexedDB on the device (see `lib/wallpaper-store.ts`) and only the
   id travels.
   ════════════════════════════════════════════════════════════════ */

export type WallpaperId =
  | "none"
  // palette-driven
  | "mesh"
  | "aurora"
  | "beams"
  | "grid"
  | "dots"
  | "rings"
  // fixed hues
  | "pearl"
  | "blush"
  | "jade"
  | "moss"
  | "ocean"
  | "nebula"
  | "sunfire"
  | "slate"
  // images
  | "academy"
  | "custom";

export const DEFAULT_WALLPAPER: WallpaperId = "none";

export type WallpaperGroup = "plain" | "palette" | "colour" | "photo";

export interface WallpaperMeta {
  id: WallpaperId;
  label: string;
  hint: string;
  group: WallpaperGroup;
  /** Preview for the picker — any CSS `background` value. */
  swatch: string;
  /** How much canvas colour to lay over it by default, 0–0.9. */
  dim: number;
  kind: "flat" | "pattern" | "image";
}

export const WALLPAPER_GROUPS: { id: WallpaperGroup; label: string; hint: string }[] = [
  { id: "plain", label: "Plain", hint: "Nothing behind the app" },
  { id: "palette", label: "From your palette", hint: "Re-tints when you change the accent" },
  { id: "colour", label: "Colour", hint: "Fixed moods, whatever the accent" },
  { id: "photo", label: "Photo", hint: "An image behind everything" },
];

export const WALLPAPERS: WallpaperMeta[] = [
  {
    id: "none",
    label: "Plain",
    hint: "Just the surface",
    group: "plain",
    swatch: "linear-gradient(150deg, rgb(var(--card)), rgb(var(--ink)))",
    dim: 0,
    kind: "flat",
  },

  /* ── palette-driven ──────────────────────────────────────────── */
  {
    id: "mesh",
    label: "Mesh",
    hint: "Soft colour pools",
    group: "palette",
    swatch:
      "radial-gradient(60% 60% at 20% 20%, rgb(var(--aura-1)/0.9), transparent 70%), radial-gradient(60% 60% at 80% 70%, rgb(var(--aura-2)/0.85), transparent 70%), rgb(var(--ink))",
    dim: 0.35,
    kind: "pattern",
  },
  {
    id: "aurora",
    label: "Aurora",
    hint: "Ribbons of light",
    group: "palette",
    swatch:
      "conic-gradient(from 210deg at 30% 10%, rgb(var(--aura-1)/0.95), transparent 40%), conic-gradient(from 20deg at 80% 90%, rgb(var(--aura-2)/0.9), transparent 45%), rgb(var(--ink))",
    dim: 0.4,
    kind: "pattern",
  },
  {
    id: "beams",
    label: "Beams",
    hint: "Light from above",
    group: "palette",
    swatch:
      "conic-gradient(from 200deg at 50% -20%, transparent 0deg, rgb(var(--aura-1)/0.9) 20deg, transparent 40deg, rgb(var(--aura-2)/0.8) 60deg, transparent 80deg), rgb(var(--ink))",
    dim: 0.35,
    kind: "pattern",
  },
  {
    id: "grid",
    label: "Blueprint",
    hint: "Fading graph paper",
    group: "palette",
    swatch:
      "linear-gradient(rgb(var(--paper)/0.35) 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, rgb(var(--paper)/0.35) 1px, transparent 1px) 0 0/10px 10px, rgb(var(--ink))",
    dim: 0.1,
    kind: "pattern",
  },
  {
    id: "dots",
    label: "Dots",
    hint: "Quiet dot field",
    group: "palette",
    swatch:
      "radial-gradient(rgb(var(--paper)/0.45) 1.2px, transparent 1.2px) 0 0/9px 9px, rgb(var(--ink))",
    dim: 0.1,
    kind: "pattern",
  },
  {
    id: "rings",
    label: "Contour",
    hint: "Topographic rings",
    group: "palette",
    swatch:
      "repeating-radial-gradient(circle at 30% 120%, rgb(var(--paper)/0.32) 0 1px, transparent 1px 7px), rgb(var(--ink))",
    dim: 0.15,
    kind: "pattern",
  },

  /* ── fixed hues ──────────────────────────────────────────────── */
  {
    id: "pearl",
    label: "Pearl",
    hint: "White silk & silver",
    group: "colour",
    swatch:
      "radial-gradient(60% 60% at 22% 18%, rgb(255 255 255 / 0.95), transparent 70%), radial-gradient(60% 60% at 78% 76%, rgb(203 213 225 / 0.9), transparent 72%), rgb(241 245 249)",
    dim: 0.28,
    kind: "pattern",
  },
  {
    id: "blush",
    label: "Blush",
    hint: "Peach, rose & cream",
    group: "colour",
    swatch:
      "radial-gradient(60% 60% at 20% 18%, rgb(254 205 211 / 0.95), transparent 70%), radial-gradient(60% 60% at 80% 78%, rgb(253 186 116 / 0.75), transparent 72%), rgb(255 241 242)",
    dim: 0.18,
    kind: "pattern",
  },
  {
    id: "jade",
    label: "Jade",
    hint: "Emerald & teal water",
    group: "colour",
    swatch:
      "radial-gradient(60% 60% at 20% 16%, rgb(16 185 129 / 0.95), transparent 70%), radial-gradient(60% 60% at 80% 80%, rgb(45 212 191 / 0.85), transparent 72%), rgb(6 78 59)",
    dim: 0.22,
    kind: "pattern",
  },
  {
    id: "moss",
    label: "Moss",
    hint: "Deep forest & lime",
    group: "colour",
    swatch:
      "radial-gradient(60% 55% at 24% 8%, rgb(22 101 52 / 0.98), transparent 72%), radial-gradient(55% 55% at 84% 86%, rgb(132 204 22 / 0.7), transparent 72%), rgb(5 46 22)",
    dim: 0.24,
    kind: "pattern",
  },
  {
    id: "ocean",
    label: "Ocean",
    hint: "Deep blue & cyan",
    group: "colour",
    swatch:
      "radial-gradient(60% 58% at 18% 14%, rgb(14 165 233 / 0.95), transparent 70%), radial-gradient(60% 58% at 82% 84%, rgb(30 64 175 / 0.95), transparent 72%), rgb(8 47 73)",
    dim: 0.24,
    kind: "pattern",
  },
  {
    id: "nebula",
    label: "Nebula",
    hint: "Violet, magenta & indigo",
    group: "colour",
    swatch:
      "radial-gradient(58% 58% at 18% 14%, rgb(168 85 247 / 0.95), transparent 70%), radial-gradient(58% 58% at 84% 22%, rgb(236 72 153 / 0.85), transparent 70%), radial-gradient(70% 60% at 70% 92%, rgb(79 70 229 / 0.95), transparent 74%), rgb(30 12 52)",
    dim: 0.26,
    kind: "pattern",
  },
  {
    id: "sunfire",
    label: "Sunfire",
    hint: "Amber, orange & red",
    group: "colour",
    swatch:
      "radial-gradient(58% 56% at 18% 14%, rgb(250 204 21 / 0.95), transparent 70%), radial-gradient(60% 58% at 82% 82%, rgb(220 38 38 / 0.9), transparent 72%), rgb(124 45 18)",
    dim: 0.24,
    kind: "pattern",
  },
  {
    id: "slate",
    label: "Slate",
    hint: "Cool grey & steel",
    group: "colour",
    swatch:
      "radial-gradient(60% 58% at 20% 16%, rgb(148 163 184 / 0.9), transparent 70%), radial-gradient(60% 58% at 80% 82%, rgb(51 65 85 / 0.95), transparent 72%), rgb(30 41 59)",
    dim: 0.2,
    kind: "pattern",
  },

  /* ── images ──────────────────────────────────────────────────── */
  {
    id: "academy",
    label: "The Academy",
    hint: "A still from your film",
    group: "photo",
    swatch: "url('/media/hero-poster-sm.jpg') center 38%/cover",
    dim: 0.85,
    kind: "image",
  },
  {
    id: "custom",
    label: "Your photo",
    hint: "Stays on this device",
    group: "photo",
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
