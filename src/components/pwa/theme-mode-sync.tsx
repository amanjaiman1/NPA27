"use client";

import { useEffect } from "react";
import { useChronicle } from "@/lib/store";
import { applyThemeMode } from "@/lib/theme";

/**
 * Keeps the page in the saved theme however the choice changed: a tap in
 * Appearance, a sync from another device, or another tab. Renders nothing.
 */
export function ThemeModeSync() {
  const mode = useChronicle((s) => s.themeMode);

  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  return null;
}
