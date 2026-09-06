"use client";

import { usePathname } from "next/navigation";

/**
 * The opening animation for every route.
 *
 * Keyed on the pathname, so each navigation remounts and replays. There is no
 * exit animation on purpose: waiting for one before the next page appears makes
 * navigation feel slower, and the whole point here is that it feels *quicker*.
 *
 * The stagger is CSS (`.page-enter > *`), not JavaScript — the sections of a
 * page fade up one after another with no per-element work on the main thread,
 * and `prefers-reduced-motion` already neutralises it globally.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
