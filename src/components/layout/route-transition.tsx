"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Lottie } from "@/components/ui/lottie";

/**
 * The page-to-page wait.
 *
 * `app/loading.tsx` cannot do this job on its own. Next only falls back to that
 * boundary when a segment actually suspends, and because the router prefetches
 * every link in the viewport, a navigation here usually resolves *inside* the
 * transition without ever touching the boundary — measured at roughly two
 * seconds of stalled page chunk with the fallback never rendering once. For that
 * whole time the old page just sits there, which is exactly the "did my tap
 * register?" problem.
 *
 * So the start is taken from the interaction, not from the router: a
 * capture-phase click, a popstate, or an explicit `beginRouteTransition()` for
 * code that navigates programmatically. The end comes from `usePathname` /
 * `useSearchParams` changing — React has committed the new route by then — plus
 * two animation frames, so the overlay lifts only once the next page has
 * actually painted rather than the instant it is mounted.
 */

/* ── programmatic navigation ──────────────────────────────────
   The command palette calls `router.push` rather than following a link, so
   there is no click for the listener below to see. Anything else that navigates
   in code should call this too. */
const starters = new Set<() => void>();

export function beginRouteTransition() {
  for (const start of starters) start();
}

/** Long enough that an already-warm navigation shows nothing at all. */
const SHOW_AFTER_MS = 140;
/** Once it *is* up, keep it up — a 50ms flash reads as a glitch. */
const MIN_VISIBLE_MS = 450;
/** A cancelled or failed navigation never changes the pathname; don't hang. */
const BAIL_MS = 20_000;

export function RouteTransition() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = useState(false);
  const running = useRef(false);
  const shownAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const hide = useCallback(() => {
    running.current = false;
    clearTimers();
    setVisible(false);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    clearTimers();
    timers.current.push(
      setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SHOW_AFTER_MS),
      setTimeout(hide, BAIL_MS),
    );
  }, [clearTimers, hide]);

  const finish = useCallback(() => {
    if (!running.current) return;
    clearTimers();

    const settle = () => {
      // Two frames: the first is the commit that queued this, the second is the
      // one that actually puts the new page's pixels on screen.
      requestAnimationFrame(() => requestAnimationFrame(hide));
    };

    if (!visible) {
      // Never got shown — the navigation beat SHOW_AFTER_MS. Nothing to fade.
      running.current = false;
      return;
    }
    const left = MIN_VISIBLE_MS - (Date.now() - shownAt.current);
    if (left > 0) timers.current.push(setTimeout(settle, left));
    else settle();
  }, [clearTimers, hide, visible]);

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

  if (!visible) return null;

  return (
    <div
      /* Swallows taps while it is up, so an impatient second tap can't queue a
         second navigation. */
      className="fixed inset-0 z-[90] grid place-items-center bg-ink/55 backdrop-blur-[2px] animate-fade-in-fast"
    >
      <Lottie
        src="/animations/page-transition.json"
        className="lottie-neutral h-16 w-16"
        staticFrame={8}
        label="Loading page"
      />
    </div>
  );
}
