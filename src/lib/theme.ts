/* ════════════════════════════════════════════════════════════════
   Appearance — the user-choosable look of the Chronicle.
   Two independent dimensions:
     • Surface  — the canvas the app sits on
     • Palette  — the accent + data colours used everywhere inside
   The actual colour values live as CSS variables in globals.css; this
   module only carries the ids + preview swatches for the picker UI.
   ════════════════════════════════════════════════════════════════ */

export type Surface = "white" | "black" | "navy";
export type Palette = "rose" | "sunset" | "lagoon" | "orchid" | "meadow" | "ember";

export const DEFAULT_SURFACE: Surface = "white";
export const DEFAULT_PALETTE: Palette = "rose";

export interface SurfaceMeta {
  id: Surface;
  label: string;
  hint: string;
  swatch: string; // preview of the canvas colour
  dark: boolean;
}

export const SURFACES: SurfaceMeta[] = [
  { id: "white", label: "Ivory", hint: "Warm & bright", swatch: "#f6f4f0", dark: false },
  { id: "black", label: "Charcoal", hint: "Soft near-black", swatch: "#121214", dark: true },
  { id: "navy", label: "Indigo", hint: "Deep blue night", swatch: "#0f1221", dark: true },
];

export interface PaletteMeta {
  id: Palette;
  label: string;
  hint: string;
  /** Preview of --bloom-1..6 (shown as a stacked swatch strip). */
  swatches: [string, string, string, string, string, string];
}

export const PALETTES: PaletteMeta[] = [
  {
    id: "rose",
    label: "Crimson",
    hint: "Red · violet · teal",
    swatches: ["#e11d48", "#7c3aed", "#2563eb", "#0d9488", "#d97706", "#db2777"],
  },
  {
    id: "sunset",
    label: "Amber",
    hint: "Gold · orange · pink",
    swatches: ["#ca6c06", "#db2777", "#ea580c", "#be185d", "#a16207", "#4f46e5"],
  },
  {
    id: "lagoon",
    label: "Teal",
    hint: "Teal · sky · indigo",
    swatches: ["#0d9488", "#0284c7", "#4f46e5", "#059669", "#a16207", "#2563eb"],
  },
  {
    id: "orchid",
    label: "Violet",
    hint: "Purple · indigo · pink",
    swatches: ["#7c3aed", "#4f46e5", "#c026d3", "#2563eb", "#e11d48", "#0d9488"],
  },
  {
    id: "meadow",
    label: "Emerald",
    hint: "Green · lime · sky",
    swatches: ["#059669", "#658504", "#0d9488", "#a16207", "#0284c7", "#ea580c"],
  },
  {
    id: "ember",
    label: "Coral",
    hint: "Orange · amber · rose",
    swatches: ["#ea580c", "#ca6c06", "#e11d48", "#a16207", "#c026d3", "#2563eb"],
  },
];

export function isSurface(v: unknown): v is Surface {
  return v === "white" || v === "black" || v === "navy";
}
export function isPalette(v: unknown): v is Palette {
  return PALETTES.some((p) => p.id === v);
}
