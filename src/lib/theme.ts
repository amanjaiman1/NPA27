/* ════════════════════════════════════════════════════════════════
   Appearance — the user-choosable look of the Chronicle.
   Two independent dimensions:
     • Surface  — the canvas the app sits on
     • Palette  — the bloom colours used everywhere inside
   The actual colour values live as CSS variables in globals.css; this
   module only carries the ids + preview swatches for the picker UI.
   ════════════════════════════════════════════════════════════════ */

export type Surface = "white" | "black" | "navy";
export type Palette = "rose" | "sunset" | "lagoon" | "orchid" | "meadow" | "ember";

export const DEFAULT_SURFACE: Surface = "black";
export const DEFAULT_PALETTE: Palette = "rose";

export interface SurfaceMeta {
  id: Surface;
  label: string;
  hint: string;
  swatch: string; // preview of the canvas colour
  dark: boolean;
}

export const SURFACES: SurfaceMeta[] = [
  { id: "white", label: "White", hint: "Bright & airy", swatch: "#fdfafb", dark: false },
  { id: "black", label: "Monochrome Black", hint: "Classic & focused", swatch: "#090909", dark: true },
  { id: "navy", label: "Dark Navy", hint: "Deep & calm", swatch: "#0c1226", dark: true },
];

export interface PaletteMeta {
  id: Palette;
  label: string;
  hint: string;
  swatches: [string, string, string, string, string, string]; // matches --bloom-1..6
}

export const PALETTES: PaletteMeta[] = [
  {
    id: "rose",
    label: "Rosé Bloom",
    hint: "Pink, lilac & mint",
    swatches: ["#f06eaa", "#b28cf6", "#78a2fa", "#5cd6a6", "#f5ba50", "#fb9478"],
  },
  {
    id: "sunset",
    label: "Sunset",
    hint: "Coral, amber & magenta",
    swatches: ["#fb9260", "#f6ac4e", "#f06e8e", "#e268b8", "#fac860", "#f5846e"],
  },
  {
    id: "lagoon",
    label: "Lagoon",
    hint: "Teal, cyan & seafoam",
    swatches: ["#2ecabe", "#60c8fa", "#68a8fa", "#7edeb8", "#9ed47c", "#7098f6"],
  },
  {
    id: "orchid",
    label: "Orchid",
    hint: "Violet, indigo & fuchsia",
    swatches: ["#b284fa", "#8e7afa", "#d474ec", "#7c98fa", "#f07cca", "#a2b6fc"],
  },
  {
    id: "meadow",
    label: "Meadow",
    hint: "Green, lime & sky",
    swatches: ["#60ce84", "#b0d860", "#5ccab6", "#d6ca60", "#78c8f0", "#f4b860"],
  },
  {
    id: "ember",
    label: "Ember",
    hint: "Red, orange & gold",
    swatches: ["#f0705c", "#f6a24c", "#ec5c70", "#fac868", "#d47a5c", "#f68e84"],
  },
];

export function isSurface(v: unknown): v is Surface {
  return v === "white" || v === "black" || v === "navy";
}
export function isPalette(v: unknown): v is Palette {
  return PALETTES.some((p) => p.id === v);
}
