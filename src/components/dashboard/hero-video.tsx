"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The looping film behind the command centre.
 *
 * It is decoration, so it never competes with the app:
 *   • the poster frame paints immediately (two sizes, phone and desktop) and is
 *     all that anyone on reduced-motion, Save-Data or a 2G link downloads,
 *   • the clip is only attached once the main thread goes idle, so it can't
 *     delay hydration or first interaction,
 *   • phones get a 432x480/20fps cut — about a third of the decode work and
 *     less than half the bytes of the desktop file,
 *   • playback pauses whenever the panel scrolls away or the tab is hidden,
 *   • if anything fails, the poster simply stays.
 *
 * Legibility is the caller's job: this paints media only, and the panel stacks
 * scrims plus an `.on-media` palette on top.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [attach, setAttach] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Decide whether motion is welcome, then wait for a quiet moment to load it.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const frugal =
      Boolean(conn?.saveData) || /(^|-)2g$/.test(conn?.effectiveType ?? "");
    if (reduced || frugal) return;

    const idle =
      (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const handle = idle(() => setAttach(true), { timeout: 3000 });
    return () => {
      const cancel = (
        window as Window & { cancelIdleCallback?: typeof cancelIdleCallback }
      ).cancelIdleCallback;
      if (cancel && typeof handle === "number") cancel(handle);
    };
  }, []);

  // Only ever decode while actually on screen and in a visible tab.
  useEffect(() => {
    const el = ref.current;
    if (!el || !attach) return;

    let onScreen = true;
    const sync = () => {
      if (onScreen && document.visibilityState === "visible") {
        el.play().catch(() => {
          /* autoplay refused — the poster carries the design */
        });
      } else {
        el.pause();
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [attach]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[rgb(8,8,10)]">
      {/* Poster: always present, so the panel is never empty or flashing. */}
      <picture>
        <source media="(max-width: 640px)" srcSet="/media/hero-poster-sm.jpg" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/media/hero-poster.jpg"
          alt=""
          aria-hidden
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-[center_38%]"
        />
      </picture>

      {attach && (
        <video
          ref={ref}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          tabIndex={-1}
          disablePictureInPicture
          onPlaying={() => setPlaying(true)}
          className={`absolute inset-0 h-full w-full object-cover object-[center_38%] transition-opacity duration-700 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        >
          <source media="(max-width: 640px)" src="/media/hero-loop-sm.mp4" type="video/mp4" />
          <source src="/media/hero-loop.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
