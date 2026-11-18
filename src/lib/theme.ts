import type { Material, ThemeMode } from "./types";

/* ════════════════════════════════════════════════════════════════
   Appearance — the theme, an accent, and how surfaces are drawn.

     • Theme mode — Light, Dark, Blue Glass, or Auto (Light or Dark,
       following the device). The mode is what's saved and synced; the
       screen shows its *resolved* surface, the `data-surface` attribute on
       <html>:
         "white"  the Ivory day surface
         "black"  the charcoal night surface
         "blue"   Blue Glass: frosted panes on a pale sky-blue canvas, with
                  its own colours, so the palette and wallpaper rest
     • Palette — the accent and the six chart colours, on Light and Dark.
     • Material — Standard or Liquid Glass (`data-material`), independent
       of the mode: glass changes how surfaces are drawn, never which theme
       is showing. Blue Glass is frosted either way; Liquid Glass makes it
       clearer and brighter.

   The colour values live as CSS variables in globals.css; this module
   carries the ids, the picker's metadata, and the functions that put a
   mode and a material on screen. The inline script in app/layout.tsx does
   the same before first paint, so a reload never flashes the wrong theme.
   ════════════════════════════════════════════════════════════════ */

export type { Material, ThemeMode } from "./types";

/** The surfaces the CSS knows. */
export type Surface = "white" | "black" | "blue";
export type Palette = "rose" | "sunset" | "lagoon" | "orchid" | "meadow" | "ember";

export const DEFAULT_THEME_MODE: ThemeMode = "light";
export const DEFAULT_PALETTE: Palette = "rose";

export interface ThemeModeMeta {
  id: ThemeMode;
  label: string;
  hint: string;
}

export const THEME_MODES: ThemeModeMeta[] = [
  { id: "light", label: "Light", hint: "Warm ivory, for the day" },
  { id: "dark", label: "Dark", hint: "Soft charcoal, for the night" },
  { id: "blue", label: "Blue Glass", hint: "Frosted glass on a calm sky blue" },
  { id: "system", label: "Auto", hint: "Light or Dark, following your device" },
];

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "blue" || v === "system";
}

/**
 * Blue Glass brings its own accent, chart colours and sky, so the palette
 * and the wallpaper rest while it's on (and come back with Light or Dark).
 */
export function themeHasOwnColours(mode: ThemeMode): boolean {
  return mode === "blue";
}

/**
 * The mode a saved surface from an older version meant. There used to be five
 * surfaces; Ivory was the day theme and the other four were dark ones, so any
 * of those becomes Dark.
 */
export function themeModeFromSurface(surface: unknown): ThemeMode {
  if (surface === "white") return "light";
  if (surface === "black" || surface === "navy" || surface === "velvet" || surface === "abyss") return "dark";
  return DEFAULT_THEME_MODE;
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function surfaceFor(mode: ThemeMode, prefersDark = systemPrefersDark()): Surface {
  if (mode === "dark") return "black";
  if (mode === "light") return "white";
  if (mode === "blue") return "blue";
  return prefersDark ? "black" : "white";
}

let easeTimer = 0;

/**
 * A short window in which colours, edges and shadows ease into the new look
 * instead of snapping. The global reduced-motion rule shortens it to nothing.
 */
function easeAppearance(root: HTMLElement): void {
  root.setAttribute("data-appearance-switching", "");
  window.clearTimeout(easeTimer);
  easeTimer = window.setTimeout(() => root.removeAttribute("data-appearance-switching"), 450);
}

/* ── Liquid Glass ────────────────────────────────────────────────
   A second, independent dimension: the material surfaces are drawn in.
   The theme stays exactly as chosen; glass only changes how cards, bars,
   menus and dialogs are drawn on top of it. Both choices sync with the
   account and are painted before load, like the theme. */

export const DEFAULT_MATERIAL: Material = "standard";

export function isMaterial(v: unknown): v is Material {
  return v === "standard" || v === "glass";
}

/**
 * Puts a material on screen. `reduced` makes translucent surfaces nearly
 * solid (and turns blur off), for anyone who finds see-through panels hard
 * to read; it also applies to Standard's frosted bars.
 */
export function applyMaterial(material: Material, reduced: boolean, opts: { animate?: boolean } = {}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const changed =
    root.getAttribute("data-material") !== material ||
    (root.getAttribute("data-transparency") === "reduced") !== reduced;
  if (!changed) return;
  if (opts.animate) easeAppearance(root);
  root.setAttribute("data-material", material);
  if (reduced) root.setAttribute("data-transparency", "reduced");
  else root.removeAttribute("data-transparency");
}

/**
 * Puts a mode on screen. Safe to call on the server, where it does nothing.
 * `animate` eases the change, for a switch the person just made.
 */
export function applyThemeMode(mode: ThemeMode, opts: { animate?: boolean } = {}): Surface {
  const surface = surfaceFor(mode);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.getAttribute("data-surface") !== surface) {
      if (opts.animate) easeAppearance(root);
      root.setAttribute("data-surface", surface);
    }
    root.setAttribute("data-theme-mode", mode);
  }
  return surface;
}

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

export function isPalette(v: unknown): v is Palette {
  return PALETTES.some((p) => p.id === v);
}
