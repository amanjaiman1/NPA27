"use client";

import { useEffect } from "react";
import { useChronicle } from "@/lib/store";
import { DARK_QUERY, applyThemeMode } from "@/lib/theme";

/**
 * With Auto chosen, follows the device as it switches between day and night
 * (most phones do it at sunset) without a reload. Renders nothing.
 */
export function ThemeModeSync() {
  const mode = useChronicle((s) => s.themeMode);

  useEffect(() => {
    applyThemeMode(mode);
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => applyThemeMode("system");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [mode]);

  return null;
}
