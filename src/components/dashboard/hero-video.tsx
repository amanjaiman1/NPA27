"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The looping film behind the command centre.
 *
 * It is decoration, so it never gets in the way:
 *   • the poster frame paints immediately and is all anyone on a metered or
 *     slow connection, or with reduced-motion preferred, ever downloads,
 *   • the clip is only attached after mount (so it can't block first paint) and
 *     is paused whenever the card scrolls away or the tab is hidden,
 *   • if anything fails, the poster simply stays.
 *
 * Legibility is handled by the caller: this component paints media only, and
 * the hero stacks scrims plus a `.on-media` palette on top of it.
 */
export function HeroVideo({
  src = "/media/hero-loop.mp4",
  poster = "/media/hero-poster.jpg",
}: {
  src?: string;
  poster?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [attach, setAttach] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Decide once, on the client, whether motion is welcome at all.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const frugal =
      Boolean(conn?.saveData) || /(^|-)2g$/.test(conn?.effectiveType ?? "");
    if (!reduced && !frugal) setAttach(true);
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
      { threshold: 0.15 },
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-[center_38%]"
      />
      {attach && (
        <video
          ref={ref}
          src={src}
          poster={poster}
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
        />
      )}
    </div>
  );
}
