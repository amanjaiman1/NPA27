"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The page-to-page progress bar: a thin line along the top of the window.
 *
 * `app/loading.tsx` cannot do this job on its own. Next only falls back to that
 * boundary when a segment actually suspends, and because the router prefetches
 * the pages people open, a navigation here usually resolves *inside* the
 * transition without ever touching the boundary, and for that whole time the
 * old page just sits there, which is exactly the "did my tap register?"
 * problem.
 *
 * So the start is taken from the interaction, not from the router: a
 * capture-phase click, a popstate, or an explicit `beginRouteTransition()` for
 * code that navigates programmatically.
 *
 * It finishes when the next page is on screen, which takes two things: the
 * address has changed (`usePathname` / `useSearchParams`: React has committed
 * the new route), and nothing is standing in for the page. A page can arrive
 * as a stand-in first, the route's loading.tsx while its code downloads or a
 * page waiting for this device's data; those render `RouteProgressHold`, and
 * the bar runs on until they've gone. Another tap meanwhile carries the bar
 * on to that page.
 *
 * And it never gives up on a timer while the change is under way. It used to
 * stop after eight seconds, so on a slow connection the bar ran to its end and
 * vanished, and the page came seconds later. Now it stays while the next
 * page's data or code is still downloading, or while the browser loads a whole
 * new document (the first tap after an update does that). It stops only when
 * nothing has been loading for a few seconds and the address hasn't changed:
 * the tap led nowhere.
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
   in code should call this too, with where it's going: a push to the page
   already showing changes nothing, and must not start a bar. */
const starters = new Set<(href?: string) => void>();

export function beginRouteTransition(href?: string) {
  for (const start of starters) start(href);
}

/** Whether following `href` changes the page (a bare hash, or the same address, doesn't). */
function leadsElsewhere(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    return (
      url.origin === window.location.origin &&
      (url.pathname !== window.location.pathname || url.search !== window.location.search)
    );
  } catch {
    return false;
  }
}

/* ── stand-ins for the page ───────────────────────────────────── */
let holds = 0;
const onRelease = new Set<() => void>();
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Rendered by whatever stands in for a page while it gets ready (the route's
 * loading.tsx, a page waiting for this device's data): the bar keeps going
 * until it's gone. A layout effect, so it's counted before the bar looks
 * (a passive effect) in the same commit. Outside a page change it does
 * nothing: a cold start has its own ring.
 */
export function RouteProgressHold() {
  useIsomorphicLayoutEffect(() => {
    holds++;
    return () => {
      holds--;
      // Once the commit is through: a stand-in replaced by another one in
      // the same commit is counted out before the new one is counted in.
      if (holds === 0) queueMicrotask(() => {
        if (holds === 0) for (const fn of onRelease) fn();
      });
    };
  }, []);
  return null;
}

/* ── is the next page still on its way? ───────────────────────
   Counted for the whole tab, from the bar's first mount: the router's
   requests for a page's data (fetch, marked `_rsc`) and the page's code
   (the <script> and stylesheet <link> elements webpack and React add to
   <head>). Anything else (sync, the Admin API, images) isn't the page
   change and isn't counted. */
let loading = 0;
let lastLoad = 0;
/** When the browser began loading a whole new document, or 0. */
let unloadingSince = 0;

function isPageData(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("_rsc=")) return true;
    const headers = init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    return headers ? new Headers(headers).get("RSC") === "1" : false;
  } catch {
    return false;
  }
}

let watching = false;
function watchLoading() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const began = () => {
    loading++;
    lastLoad = performance.now();
  };
  const ended = () => {
    loading = Math.max(0, loading - 1);
    lastLoad = performance.now();
  };

  const fetchFirst = window.fetch;
  window.fetch = function trackedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const answer = fetchFirst.call(window, input, init);
    if (isPageData(input, init)) {
      began();
      answer.then(ended, ended);
    }
    return answer;
  };

  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const src =
          node instanceof HTMLScriptElement
            ? node.src
            : node instanceof HTMLLinkElement && node.rel === "stylesheet"
              ? node.href
              : "";
        if (!src.includes("/_next/static/")) continue;
        began();
        const done = () => {
          node.removeEventListener("load", done);
          node.removeEventListener("error", done);
          ended();
        };
        node.addEventListener("load", done);
        node.addEventListener("error", done);
      }
    }
  }).observe(document.head, { childList: true });
}

/** Long enough that an ordinary navigation shows nothing at all. */
const SHOW_AFTER_MS = 120;
/** How long the finishing sweep and fade take (`.route-progress[data-state="done"]`). */
const FINISH_MS = 360;
/** How often a running bar checks whether it's over. */
const CHECK_MS = 400;
/** Nothing loading and the address unchanged for this long: the tap led nowhere. */
const IDLE_GIVE_UP_MS = 5_000;
/** A stand-in still up this long after the address changed is the page's own wait, which it shows. */
const HOLD_LIMIT_MS = 20_000;
/** A whole new document taking longer than this to replace the page: it was a download, or it failed. */
const UNLOAD_LIMIT_MS = 20_000;
/** However long the network keeps busy, no bar runs longer than this. */
const LIMIT_MS = 90_000;

type BarState = "idle" | "loading" | "done";

interface Run {
  startedAt: number;
  shown: boolean;
  /** When the address changed, or null while it hasn't. */
  committedAt: number | null;
}

export function RouteTransition() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [bar, setBar] = useState<BarState>("idle");
  const run = useRef<Run | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  /** The address as of the last commit, to tell a hash-only popstate from a page change. */
  const here = useRef("");

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  }, []);

  const reset = useCallback(() => {
    run.current = null;
    clearTimers();
    setBar("idle");
  }, [clearTimers]);

  const finish = useCallback(() => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    clearTimers();
    // Never shown: the page beat the threshold, so there is nothing to finish.
    if (!r.shown) {
      setBar("idle");
      return;
    }
    setBar("done");
    timers.current.push(setTimeout(reset, FINISH_MS));
  }, [clearTimers, reset]);

  /** Over yet? At each commit, when the last stand-in goes, and every CHECK_MS. */
  const check = useCallback(() => {
    const r = run.current;
    if (!r) return;
    const now = performance.now();
    if (r.committedAt !== null) {
      if (holds === 0 || now - r.committedAt > HOLD_LIMIT_MS) finish();
      return;
    }
    if (now - r.startedAt > LIMIT_MS) return reset();
    if (unloadingSince && now - unloadingSince < UNLOAD_LIMIT_MS) return;
    if (loading === 0 && now - Math.max(lastLoad, r.startedAt) > IDLE_GIVE_UP_MS) reset();
  }, [finish, reset]);

  const start = useCallback(
    (href?: string) => {
      if (href !== undefined && !leadsElsewhere(href)) return;
      // Already under way: the bar carries on, now for this page, which
      // finishes it when it commits (not the last one's stand-in going).
      if (run.current) {
        run.current.startedAt = performance.now();
        run.current.committedAt = null;
        return;
      }
      run.current = { startedAt: performance.now(), shown: false, committedAt: null };
      unloadingSince = 0;
      clearTimers();
      timers.current.push(
        setTimeout(() => {
          if (!run.current) return;
          run.current.shown = true;
          setBar("loading");
        }, SHOW_AFTER_MS),
      );
      ticker.current = setInterval(check, CHECK_MS);
    },
    [check, clearTimers],
  );

  useEffect(() => {
    watchLoading();
  }, []);

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
      // Another site, or the same destination (a bare hash included): no page change here.
      if (!leadsElsewhere(anchor.href)) return;

      start();
    }

    // Capture phase, so this runs before the router begins the transition.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  /* ── start: back / forward, and programmatic pushes ─────────── */
  useEffect(() => {
    const onPopState = () => {
      // Only the hash changed (Settings' sections): the same page.
      if (window.location.pathname + window.location.search === here.current) return;
      start();
    };
    // A whole new document is on its way (after an update, the router loads
    // one): the old page stays until it arrives, and so does the bar.
    const onBeforeUnload = () => {
      if (run.current) unloadingSince = performance.now();
    };
    // Back from the back-forward cache, possibly mid-change: start clean.
    const onPageShow = (e: PageTransitionEvent) => {
      unloadingSince = 0;
      if (e.persisted) reset();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pageshow", onPageShow);
    starters.add(start);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pageshow", onPageShow);
      starters.delete(start);
    };
  }, [start, reset]);

  /* ── finish: the new route has committed… ───────────────────── */
  useEffect(() => {
    here.current = window.location.pathname + window.location.search;
    const r = run.current;
    if (!r) return;
    r.committedAt = performance.now();
    // …and nothing stands in for it. A stand-in arrives in the same commit as
    // the route, and its layout effect has counted it by now.
    check();
    // `searchParams` matters because `/journal` → `/journal?new=1` is a real
    // navigation that leaves the pathname untouched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  /* ── …or the last stand-in has gone ─────────────────────────── */
  useEffect(() => {
    onRelease.add(check);
    return () => {
      onRelease.delete(check);
    };
  }, [check]);

  useEffect(() => clearTimers, [clearTimers]);

  if (bar === "idle") return null;

  // `pointer-events: none`: it never stands between a tap and the page.
  // Decorative to assistive technology, which hears the new page's title from
  // Next's own route announcer.
  return <div aria-hidden className="route-progress" data-state={bar} />;
}
