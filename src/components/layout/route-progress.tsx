"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar across the top of the app during navigation.
 *
 * The problem it solves is specific to this being a client-rendered PWA: tapping
 * a nav item has to fetch that route's JavaScript before anything can render, and
 * on a phone on a slow connection that is a second or more of *nothing* — the tap
 * appears to have been ignored.
 *
 * It cannot be driven by `usePathname` alone, because that only changes once the
 * navigation has already finished. So the start is taken from the click itself,
 * in the capture phase, before Next.js begins the transition: the bar is moving
 * within a frame of the tap. `usePathname` is then only used to finish it.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(0);

  const creep = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bail = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether a navigation we started is still in flight. */
  const running = useRef(false);

  const clearTimers = useCallback(() => {
    if (creep.current) clearInterval(creep.current);
    if (hide.current) clearTimeout(hide.current);
    if (bail.current) clearTimeout(bail.current);
    creep.current = null;
    hide.current = null;
    bail.current = null;
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    clearTimers();
    setVisible(true);
    setValue(8);
    /**
     * Eases toward 90% and stops there. The remaining 10% belongs to the arrival,
     * so the bar never sits full while the page is still blank — and never
     * pretends to know how long a chunk fetch will take.
     */
    creep.current = setInterval(() => {
      setValue((v) => (v >= 90 ? v : v + Math.max(0.4, (90 - v) * 0.12)));
    }, 90);
    // If a navigation is cancelled or fails there is no pathname change to
    // finish on, so the bar clears itself rather than hanging at 90 forever.
    bail.current = setTimeout(() => {
      running.current = false;
      clearTimers();
      setVisible(false);
      setValue(0);
    }, 15000);
  }, [clearTimers]);

  const done = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clearTimers();
    setValue(100);
    hide.current = setTimeout(() => {
      setVisible(false);
      setValue(0);
    }, 220);
  }, [clearTimers]);

  /* ── start: a click on an internal link ─────────────────────── */
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Anything the browser will handle itself — new tab, download, modified
      // click, or a handler that already claimed the event — is not a route
      // change and must not show a bar that never finishes.
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
      // Same destination — including a bare hash — costs no navigation.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;

      start();
    }

    // Capture phase, so this runs before Next.js' own click handler begins the
    // transition rather than after it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  /* ── start: back / forward ──────────────────────────────────── */
  useEffect(() => {
    window.addEventListener("popstate", start);
    return () => window.removeEventListener("popstate", start);
  }, [start]);

  /* ── finish: the route actually changed ─────────────────────── */
  useEffect(() => {
    done();
    // `searchParams` is included because `/journal` → `/journal?new=1` is a real
    // navigation that leaves the pathname untouched.
  }, [pathname, searchParams, done]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!visible) return null;

  return (
    <div
      id="route-progress"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      aria-hidden
    >
      <div
        className="relative h-full bg-accent transition-[width] duration-200 ease-out"
        style={{ width: `${value}%` }}
      >
        {/* A soft bloom on the leading edge, so the bar reads as lit rather than
            drawn — the same warmth the rest of the chrome has. */}
        <span className="absolute right-0 top-1/2 h-2.5 w-16 -translate-y-1/2 rounded-full bg-accent/70 blur-[6px]" />
      </div>
    </div>
  );
}
