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
