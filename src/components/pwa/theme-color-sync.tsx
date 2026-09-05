"use client";

import { useEffect } from "react";

/**
 * Keeps `<meta name="theme-color">` in step with the chosen surface, so the
 * installed app's title bar / status bar matches the canvas instead of being
 * stuck on the default ink.
 *
 * Reads the live `--ink` custom property rather than duplicating the palette.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const ink = getComputedStyle(root).getPropertyValue("--ink").trim();
      if (!ink) return;
      const [r, g, b] = ink.split(/[\s,]+/).map(Number);
      if ([r, g, b].some((n) => !Number.isFinite(n))) return;
      const hex =
        "#" +
        [r, g, b]
          .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
          .join("");

      let meta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.content = hex;
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-surface", "data-palette"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
