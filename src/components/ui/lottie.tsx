"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A Lottie animation, played by `lottie-web`'s light SVG build.
 *
 * The player is ~50 kB gzipped, so it is imported dynamically rather than
 * bundled into the shared chunk: a loading animation that makes the app slower
 * to load would be self-defeating. `onReady` fires once the first frame is on
 * screen, which is what lets a caller keep a CSS placeholder up until then.
 *
 * `prefers-reduced-motion` is honoured explicitly. The global CSS rule in
 * `globals.css` only neutralises CSS animations — Lottie drives its own frames
 * in JavaScript and would keep moving — so with reduced motion the animation is
 * loaded and parked on a single representative frame instead of playing.
 */
export function Lottie({
  src,
  className,
  loop = true,
  speed = 1,
  /** Frame to freeze on when the user prefers reduced motion. */
  staticFrame = 0,
  label = "Loading",
  onReady,
}: {
  src: string;
  className?: string;
  loop?: boolean;
  speed?: number;
  staticFrame?: number;
  label?: string;
  onReady?: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  /** Kept in a ref so the effect below never re-runs when the callback changes. */
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let anim: { destroy: () => void } | null = null;

    (async () => {
      const lottie = (await import("lottie-web/build/player/lottie_light"))
        .default;
      if (cancelled || !host.current) return;

      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const instance = lottie.loadAnimation({
        container: host.current,
        renderer: "svg",
        loop,
        autoplay: !reduce,
        path: src,
      });
      anim = instance;
      instance.setSpeed(speed);

      instance.addEventListener("DOMLoaded", () => {
        if (cancelled) return;
        if (reduce) instance.goToAndStop(staticFrame, true);
        ready.current?.();
      });
    })();

    return () => {
      cancelled = true;
      // Guards against a double-invoked effect in development destroying an
      // instance the second run is still using.
      anim?.destroy();
    };
  }, [src, loop, speed, staticFrame]);

  return (
    <div
      ref={host}
      className={cn("pointer-events-none", className)}
      role="status"
      aria-label={label}
    />
  );
}

/*
 * There used to be a `LottieWithFallback` here that cross-faded a CSS ring into
 * the real Lottie once it loaded. It is gone: on a slower device the swap was
 * slow enough to be legible, so a single refresh showed two different animations
 * one after the other. Each wait now picks one technique and stays with it —
 * see `ui/loading.tsx`.
 */
