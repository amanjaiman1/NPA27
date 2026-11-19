"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The page-to-page progress bar: a thin line along the top of the window.
 *
 * `app/loading.tsx` cannot do this job on its own. Next only falls back to that
 * boundary when a segment actually suspends, and because the router prefetches
 * every link in the viewport, a navigation here usually resolves *inside* the
 * transition without ever touching the boundary, and for that whole time the
 * old page just sits there, which is exactly the "did my tap register?"
 * problem.
 *
 * So the start is taken from the interaction, not from the router: a
 * capture-phase click, a popstate, or an explicit `beginRouteTransition()` for
 * code that navigates programmatically. The end comes from `usePathname` /
 * `useSearchParams` changing — React has committed the new route by then.
 *
 * It used to dim the whole screen behind a loading animation and keep that up
 * for at least 0.45s once shown, so a page that was ready a moment later still
 * waited behind it. Now nothing covers the page and nothing waits: the bar
 * shows only when a change takes longer than a glance, on phones as well as
 * computers, and it finishes as soon as the next page is there. The look is
 * `.route-progress` in globals.css.
 */

/* ── programmatic navigation ──────────────────────────────────
   The command palette calls `router.push` rather than following a link, so
   there is no click for the listener below to see. Anything else that navigates
   in code should call this too. */
const starters = new Set<() => void>();

export function beginRouteTransition() {
  for (const start of starters) start();
}

/** Long enough that an ordinary navigation shows nothing at all. */
const SHOW_AFTER_MS = 120;
/** How long the finishing sweep and fade take (`.route-progress[data-state="done"]`). */
const FINISH_MS = 360;
/**
 * A cancelled or failed navigation never changes the pathname, so there has to
 * be a ceiling. A stalled indicator is worse than no indicator.
 */
const BAIL_MS = 8_000;

type BarState = "idle" | "loading" | "done";

export function RouteTransition() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [bar, setBar] = useState<BarState>("idle");
  const running = useRef(false);
  const shown = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const reset = useCallback(() => {
    running.current = false;
    shown.current = false;
    clearTimers();
    setBar("idle");
  }, [clearTimers]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    shown.current = false;
    clearTimers();
    timers.current.push(
      setTimeout(() => {
        shown.current = true;
        setBar("loading");
      }, SHOW_AFTER_MS),
      setTimeout(reset, BAIL_MS),
    );
  }, [clearTimers, reset]);

  const finish = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clearTimers();
    // Never shown: the page beat the threshold, so there is nothing to finish.
    if (!shown.current) return;
    setBar("done");
    timers.current.push(setTimeout(reset, FINISH_MS));
  }, [clearTimers, reset]);

  /* ── start: a click on an internal link ─────────────────────── */
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Anything the browser handles itself — new tab, download, modified click,
      // or an event something else already claimed — is not a route change.
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (!anchor.href) return;

      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // The same destination, including a bare hash, costs no navigation.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;

      start();
    }

    // Capture phase, so this runs before the router begins the transition.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  /* ── start: back / forward, and programmatic pushes ─────────── */
  useEffect(() => {
    window.addEventListener("popstate", start);
    starters.add(start);
    return () => {
      window.removeEventListener("popstate", start);
      starters.delete(start);
    };
  }, [start]);

  /* ── finish: the new route has committed ────────────────────── */
  useEffect(() => {
    finish();
    // `searchParams` matters because `/journal` → `/journal?new=1` is a real
    // navigation that leaves the pathname untouched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => clearTimers, [clearTimers]);

  if (bar === "idle") return null;

  // `pointer-events: none`: it never stands between a tap and the page.
  // Decorative to assistive technology, which hears the new page's title from
  // Next's own route announcer.
  return <div aria-hidden className="route-progress" data-state={bar} />;
}
