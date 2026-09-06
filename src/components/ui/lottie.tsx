"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * A Lottie with a CSS stand-in underneath, cross-faded out once the real
 * animation has its first frame up.
 *
 * This exists for the cold-start case. The player and the animation JSON are
 * both network fetches, so on a slow connection there is a window where the
 * screen would otherwise be blank — which is exactly the wait the animation was
 * added to cover. The placeholder is plain CSS in the server-rendered HTML, so
 * it is moving before any JavaScript has run.
 */
export function LottieWithFallback({
  src,
  className,
  fallbackClassName,
  loop = true,
  speed = 1,
  staticFrame = 0,
  label = "Loading",
}: {
  src: string;
  className?: string;
  fallbackClassName?: string;
  loop?: boolean;
  speed?: number;
  staticFrame?: number;
  label?: string;
}) {
  const [live, setLive] = useState(false);

  return (
    <span className={cn("relative grid place-items-center", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute transition-opacity duration-300",
          fallbackClassName,
          live ? "opacity-0" : "opacity-100",
        )}
      />
      <Lottie
        src={src}
        loop={loop}
        speed={speed}
        staticFrame={staticFrame}
        label={label}
        onReady={() => setLive(true)}
        className={cn(
          "h-full w-full transition-opacity duration-300",
          live ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}
