"use client";

import { Fragment, useEffect, useRef } from "react";
import { motion, type MotionProps } from "framer-motion";
import { useMatchMedia } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR — motion primitives
   Small pieces the tour is built from. Everything moves on transform
   and opacity, so the work is the compositor's, and everything has a
   still version: with Reduce motion on, each piece shows its final
   state at once (framer-motion's `reducedMotion="user"` covers the
   rest, from the shell's MotionConfig).

   From framer-motion the tour uses only what the rest of the app already
   does (`motion`, `AnimatePresence`). Reaching for more of its parts
   (`animate`, `useSpring`, motion values) from this separately loaded
   chunk stopped the bundler combining framer's modules into one, and
   that alone added about 4 KB to every page. The count-up and the
   tilting stage below are plain requestAnimationFrame and CSS instead.
   ════════════════════════════════════════════════════════════════ */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** The device asks for less motion. Correct from the first render. */
export function useReducedMotion(): boolean {
  return useMatchMedia("(prefers-reduced-motion: reduce)");
}

/** A quick start and a long settle, close to `EASE_OUT`. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Rises a few pixels into place as it fades in. */
export function rise(delay: number, y = 12): MotionProps {
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.6, ease: EASE_OUT },
  };
}

/** Springs up from nothing. */
export function pop(delay: number): MotionProps {
  return {
    initial: { opacity: 0, scale: 0 },
    animate: { opacity: 1, scale: 1 },
    transition: { delay, type: "spring", stiffness: 420, damping: 22 },
  };
}

/** A Mac, where the shortcut key is Command rather than Control. */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/**
 * A key on the keyboard, drawn. Symbols are icons rather than characters,
 * since the text face has no ⌘ or arrows; `label` names them for screen
 * readers.
 */
export function Kbd({ children, label, className }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[1.4rem] min-w-[1.4rem] items-center justify-center gap-0.5 rounded-md border border-line bg-card px-1.5 align-[0.08em] text-[0.66rem] font-semibold leading-none text-paper/70 shadow-soft",
        className,
      )}
    >
      {children}
      {label && <span className="sr-only">{label}</span>}
    </kbd>
  );
}

/**
 * A headline whose words rise into place one after another, each from behind
 * its own mask. Screen readers get the sentence once, as plain text.
 */
export function WordReveal({
  text,
  delay = 0,
  stagger = 0.045,
  className,
}: {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            {/* The padding gives descenders room inside the mask. */}
            <span className="-mb-[0.16em] inline-block overflow-hidden pb-[0.16em] align-bottom">
              <motion.span
                className="inline-block"
                initial={{ y: "108%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                transition={{ delay: delay + i * stagger, duration: 0.7, ease: EASE_OUT }}
              >
                {word}
              </motion.span>
            </span>
            {i < words.length - 1 && " "}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/**
 * A number that counts up to its value. It writes the text directly, so
 * counting costs no React renders.
 */
export function CountUp({
  to,
  delay = 0,
  duration = 1.3,
  format = (n: number) => String(Math.round(n)),
  className,
}: {
  to: number;
  delay?: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = formatRef.current(to);
      return;
    }
    el.textContent = formatRef.current(0);
    const start = performance.now() + delay * 1000;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      el.textContent = formatRef.current(to * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration, reduce]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {format(reduce ? to : 0)}
    </span>
  );
}

/** Text that types itself in, with a caret, then leaves the caret blinking. */
export function Typewriter({
  text,
  delay = 0,
  speed = 34,
  className,
}: {
  text: string;
  delay?: number;
  /** Milliseconds per character. */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = text;
      return;
    }
    el.textContent = "";
    let i = 0;
    let timer = 0;
    const tick = () => {
      i++;
      el.textContent = text.slice(0, i);
      if (i < text.length) timer = window.setTimeout(tick, speed + (text[i - 1] === " " ? speed * 0.6 : 0));
    };
    timer = window.setTimeout(tick, delay * 1000);
    return () => window.clearTimeout(timer);
  }, [text, delay, speed, reduce]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden ref={ref} />
      <span aria-hidden className="tour-caret" />
    </span>
  );
}

/**
 * The panel the illustrations sit in. On a computer it tips gently towards
 * the pointer, with a soft glare that follows it; on touch, and with Reduce
 * motion, it stays flat. The pointer writes the angle and the glare's place
 * straight onto the two elements, and a CSS transition smooths the turn
 * (`.tour-tilt`), so moving the mouse costs no React renders.
 */
export function TiltStage({
  enabled,
  className,
  children,
}: {
  enabled: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const live = enabled && !reduce;
  const stage = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn("[perspective:1400px]", className)}
      onPointerMove={(e) => {
        if (!live || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        stage.current?.style.setProperty(
          "transform",
          `rotateX(${(-(py - 0.5) * 5).toFixed(2)}deg) rotateY(${((px - 0.5) * 7).toFixed(2)}deg)`,
        );
        glare.current?.style.setProperty("--tour-gx", `${(px * 100).toFixed(1)}%`);
        glare.current?.style.setProperty("--tour-gy", `${(py * 100).toFixed(1)}%`);
      }}
      onPointerLeave={() => stage.current?.style.removeProperty("transform")}
    >
      <div ref={stage} className={cn("tour-stage relative h-full w-full rounded-[2rem]", live && "tour-tilt")}>
        {children}
        {live && <div ref={glare} aria-hidden className="tour-glare pointer-events-none absolute inset-0 rounded-[inherit]" />}
      </div>
    </div>
  );
}

/** Where each of the three lights sits for a chapter, in viewport units. */
export interface GlowSpot {
  x: number;
  y: number;
  scale: number;
}

/**
 * The light behind the tour: three soft glows, in the theme's own colours,
 * that drift to new places as the chapters change. Plain radial gradients on
 * three layers that only ever move, so there is no blur to compute.
 */
export function Aurora({ spots }: { spots: GlowSpot[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {spots.map((spot, i) => (
        <motion.div
          key={i}
          className={`tour-glow tour-glow-${i + 1}`}
          initial={false}
          animate={{ x: `${spot.x}vw`, y: `${spot.y}vh`, scale: spot.scale }}
          transition={{ type: "spring", stiffness: 26, damping: 16, mass: 1.2 }}
        />
      ))}
      <div className="tour-vignette absolute inset-0" />
    </div>
  );
}

/**
 * The DoOrDie mark drawing itself: the outer ring, the inner ring, the
 * timeline, and then today's node lighting up with a pulse.
 */
export function AnimatedMark({ className, delay = 0.15 }: { className?: string; delay?: number }) {
  return (
    // Visible overflow, so the pulse round today's node isn't cut off at the top.
    <svg viewBox="0 0 32 32" fill="none" className={cn("overflow-visible", className)} aria-hidden>
      <motion.circle
        cx="16"
        cy="16"
        r="12.5"
        className="stroke-paper/30"
        strokeWidth="1.3"
        initial={{ pathLength: 0, rotate: -90 }}
        animate={{ pathLength: 1, rotate: -90 }}
        transition={{ delay, duration: 1.4, ease: EASE_OUT }}
      />
      <motion.circle
        cx="16"
        cy="16"
        r="7"
        className="stroke-paper/15"
        strokeWidth="1.3"
        initial={{ pathLength: 0, rotate: 90 }}
        animate={{ pathLength: 1, rotate: 90 }}
        transition={{ delay: delay + 0.35, duration: 1.2, ease: EASE_OUT }}
      />
      <motion.line
        x1="16"
        y1="3.5"
        x2="16"
        y2="9"
        className="stroke-accent/50"
        strokeWidth="1.3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: delay + 0.9, duration: 0.5, ease: EASE_OUT }}
      />
      <motion.circle
        cx="16"
        cy="3.5"
        r="5"
        className="fill-accent"
        initial={{ scale: 0, opacity: 0.5 }}
        animate={{ scale: [0, 1, 1.9], opacity: [0.5, 0.35, 0] }}
        transition={{ delay: delay + 1.25, duration: 1.4, ease: "easeOut" }}
      />
      <motion.circle
        cx="16"
        cy="3.5"
        r="2.4"
        className="fill-accent"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: delay + 1.2, type: "spring", stiffness: 420, damping: 14 }}
      />
    </svg>
  );
}

/**
 * Keeps keyboard focus inside the tour while it is open: Tab from the last
 * control wraps to the first, and Shift+Tab the other way.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0 && !el.closest("[aria-hidden='true']"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}
