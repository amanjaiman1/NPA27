/**
 * Search (⌘K) and Appearance open on demand, so their code is downloaded the
 * first time they're asked for rather than with every page of the app.
 * Pointing at, focusing or touching what opens them starts the download, so
 * by the time they're clicked they're nearly always ready.
 */
export const loadPalette = () => import("./command-palette");
export const loadAppearance = () => import("./appearance");

export function warmOverlays(which: "palette" | "appearance"): void {
  void (which === "palette" ? loadPalette() : loadAppearance()).catch(() => undefined);
}
