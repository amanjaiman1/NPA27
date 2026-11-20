"use client";

import { forwardRef, useEffect, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * A link in the app's navigation that loads its page when it's about to be
 * used, rather than as soon as it's on screen.
 *
 * Next prefetches every link in view, page code included. The sidebar alone
 * shows sixteen, so every page load used to download the code of nearly every
 * page (about 770 KB on a laptop, 250 KB more than the page needed on a
 * phone), competing with the page itself on a slow connection. Here a page is
 * fetched when the pointer reaches its link, the link is focused, or a finger
 * lands on it: still before the click in nearly every case. The pages people
 * open most are warmed in idle time instead (`useIdlePrefetch`).
 */
export const AppLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(function AppLink(
  { href, onPointerEnter, onFocus, onTouchStart, ...rest },
  ref,
) {
  const router = useRouter();
  const warm = () => {
    if (typeof href === "string" && href.startsWith("/")) router.prefetch(href);
  };
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false}
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
});

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};
type SaveDataNavigator = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };

/**
 * Warms the pages most often opened next, one at a time when the browser is
 * idle, once the current page has settled. Skipped when the device asks to
 * save data or the connection is very slow: those pages then load when a
 * link to them is about to be used.
 */
export function useIdlePrefetch(paths: readonly string[], delayMs = 2_500) {
  const router = useRouter();
  const key = paths.join("|");
  useEffect(() => {
    const conn = (navigator as SaveDataNavigator).connection;
    if (conn?.saveData || conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return;
    const w = window as IdleWindow;
    const queue = key.split("|").filter(Boolean);
    let idle: number | null = null;
    let timer: number | null = null;
    const next = () => {
      const path = queue.shift();
      if (!path) return;
      router.prefetch(path);
      schedule();
    };
    const schedule = () => {
      if (!queue.length) return;
      if (w.requestIdleCallback) idle = w.requestIdleCallback(next, { timeout: 4_000 });
      else timer = window.setTimeout(next, 300);
    };
    timer = window.setTimeout(schedule, delayMs);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (idle !== null) w.cancelIdleCallback?.(idle);
    };
  }, [key, delayMs, router]);
}

/* ── the pages this device opens most ─────────────────────────────
   Warming every page up front cost a phone a quarter of a megabyte on every
   load, so only the dock's pages are warmed for everyone. Beyond those, each
   device learns which pages it opens most, and warms those too: a person who
   lives in Habits and the Coach finds them as quick as the dock. Only page
   addresses and counts, in this browser; nothing about what's on them. */

const VISITS_KEY = "doordie-page-visits";
/** Past this many visits in all, every count halves, so lately counts most. */
const VISITS_FADE_AT = 200;

function readVisits(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(VISITS_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, n]) => typeof n === "number" && Number.isFinite(n) && n > 0),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Counts a visit to `path` on this device. */
export function rememberVisit(path: string): void {
  try {
    const counts = readVisits();
    counts[path] = (counts[path] ?? 0) + 1;
    if (Object.values(counts).reduce((a, b) => a + b, 0) > VISITS_FADE_AT) {
      for (const [p, n] of Object.entries(counts)) {
        if (n >= 2) counts[p] = Math.floor(n / 2);
        else delete counts[p];
      }
    }
    window.localStorage.setItem(VISITS_KEY, JSON.stringify(counts));
  } catch {
    // Storage is blocked: nothing is learned this visit.
  }
}

/** Up to `n` of `among` that this device has opened more than once, most first, leaving out `skip`. */
export function mostVisited(n: number, among: readonly string[], skip: readonly string[] = []): string[] {
  if (typeof window === "undefined") return [];
  const counts = readVisits();
  return among
    .filter((p) => !skip.includes(p) && (counts[p] ?? 0) >= 2)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
    .slice(0, n);
}
