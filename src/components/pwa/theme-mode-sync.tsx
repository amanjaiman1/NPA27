"use client";

import { useEffect } from "react";
import { useChronicle } from "@/lib/store";
import { applyThemeMode } from "@/lib/theme";

/**
 * Keeps the page in the saved theme however the choice changed: a tap in
 * Appearance, a sync from another device, or another tab. Renders nothing.
 *
 * Only once the account's data has loaded: until then the store holds the
 * default theme, and applying it would replace the look painted before
 * React (app/layout.tsx) with Lavender for a moment. Pages that never load
 * the account's data, such as the Admin Center, keep that painted look.
 */
export function ThemeModeSync() {
  const mode = useChronicle((s) => s.themeMode);
  const hydrated = useChronicle((s) => s._hasHydrated);

  useEffect(() => {
    if (hydrated) applyThemeMode(mode);
  }, [mode, hydrated]);

  return null;
}
