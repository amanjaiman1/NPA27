import type { ThemeMode } from "./types";

/* ════════════════════════════════════════════════════════════════
   Appearance — three themes.

     • Light (the default): frosted white panes on a soft sky-blue
       backdrop, navy text, one luminous blue.
     • Dark: black glass, charcoal panes on a near-black backdrop, with
       white for what's interactive.
     • Lavender: crisp white panels on a near-white backdrop with pastel
       glows, and one violet.

   The mode is what's saved and synced; the screen shows its surface, the
   `data-surface` attribute on <html> ("white", "black" or "lavender").
   Reduce transparency (`data-transparency="reduced"`) makes any theme
   nearly solid, for anyone who finds see-through panels hard to read.

   Older versions also offered a separate Blue Glass theme, Auto, colour
   palettes and a Liquid Glass material. Those are retired: Blue Glass
   became Light, Auto resolves to whichever theme the device shows, and the
   palette and material choices are dropped (`legacyThemeMode` and
   `account/normalize.ts`).

   The colour values live as CSS variables in globals.css. The inline script
   in app/layout.tsx applies the saved theme before first paint, so a reload
   never flashes the wrong one.
   ════════════════════════════════════════════════════════════════ */

export type { ThemeMode } from "./types";

/** The surfaces the CSS knows. */
export type Surface = "white" | "black" | "lavender";

export const DEFAULT_THEME_MODE: ThemeMode = "light";

export interface ThemeModeMeta {
  id: ThemeMode;
  label: string;
  hint: string;
}

export const THEME_MODES: ThemeModeMeta[] = [
  { id: "light", label: "Light", hint: "Frosted glass on a soft sky blue" },
  { id: "dark", label: "Dark", hint: "Black glass, for the night" },
  { id: "lavender", label: "Lavender", hint: "Crisp white on a soft pastel glow" },
];

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "lavender";
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * The theme a value saved by any version means today. Blue Glass was the
 * look Light now has; Auto becomes whichever theme this device shows; the
 * old five surfaces were one light and four dark ones.
 */
export function legacyThemeMode(saved: unknown, prefersDark = systemPrefersDark()): ThemeMode {
  if (saved === "dark" || saved === "lavender") return saved;
  if (saved === "light" || saved === "blue") return "light";
  if (saved === "system") return prefersDark ? "dark" : "light";
  return DEFAULT_THEME_MODE;
}

/** The mode an old saved surface meant: Ivory was light, the rest dark. */
export function themeModeFromSurface(surface: unknown): ThemeMode {
  if (surface === "white") return "light";
  if (surface === "black" || surface === "navy" || surface === "velvet" || surface === "abyss") return "dark";
  return DEFAULT_THEME_MODE;
}

export function surfaceFor(mode: ThemeMode): Surface {
  if (mode === "dark") return "black";
  if (mode === "lavender") return "lavender";
  return "white";
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

/**
 * Puts Reduce transparency on screen: translucent surfaces become nearly
 * solid and blur turns off, in the same theme.
 */
export function applyTransparency(reduced: boolean, opts: { animate?: boolean } = {}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if ((root.getAttribute("data-transparency") === "reduced") === reduced) return;
  if (opts.animate) easeAppearance(root);
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
