"use client";

import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { clamp, cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   PROGRESS: THE RING AND THE BAR
   Every percentage in the app is drawn by one of these two, so they
   look the same everywhere and follow the theme.

   • Colour: a gradient between the theme's accent and a second shade of
     it (`--accent-2` in globals.css), with a soft glow whose strength is
     the theme's own `--accent-glow`. Dark stays neutral (white to silver);
     no theme gains a colour it doesn't have. Status tones (positive,
     warning, danger) use the theme's status colours.
   • Motion: each fills from empty the first time it scrolls into view,
     then eases between values. The ring's end carries a small bead, and
     a bar catches one pass of light as it fills. With reduced motion,
     both simply show the value.
   • Reading: the ring writes "1%" as a large 1 with a small %, sized to
     the ring. Both are progress bars to assistive technology, unless
     marked `decorative` because the number is written beside them.
   • Markup: spans throughout, so either can sit inside a button or a link
     (a Roadmap card, a subject's row) and the HTML stays valid.
   ════════════════════════════════════════════════════════════════ */

export type ProgressTone = "accent" | "positive" | "warning" | "danger" | "neutral";

/** The two ends of each tone's gradient, and its glow. */
const TONE: Record<ProgressTone, { from: string; to: string; glow: string; glowOpacity: string }> = {
  accent: {
    from: "rgb(var(--accent-2))",
    to: "rgb(var(--accent))",
    glow: "rgb(var(--accent) / var(--accent-glow, 0.5))",
    glowOpacity: "var(--accent-glow, 0.5)",
  },
  positive: { from: "rgb(var(--positive) / 0.55)", to: "rgb(var(--positive))", glow: "rgb(var(--positive) / 0.35)", glowOpacity: "0.35" },
  warning: { from: "rgb(var(--warning) / 0.55)", to: "rgb(var(--warning))", glow: "rgb(var(--warning) / 0.35)", glowOpacity: "0.35" },
  danger: { from: "rgb(var(--danger) / 0.55)", to: "rgb(var(--danger))", glow: "rgb(var(--danger) / 0.35)", glowOpacity: "0.35" },
  neutral: { from: "rgb(var(--paper) / 0.25)", to: "rgb(var(--paper) / 0.5)", glow: "transparent", glowOpacity: "0" },
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * True once the element has been on screen. The fill starts then, so a bar
 * further down the page fills as you reach it rather than before you look.
 */
function useSeen<T extends Element>(ref: React.RefObject<T>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** The value to draw: empty until seen, then the value, a frame later so it eases in. */
function useShown<T extends Element>(ref: React.RefObject<T>, value: number): number {
  const seen = useSeen(ref);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [seen, value]);
  return shown;
}

/** A progress bar with a gradient fill that eases in and catches the light once. */
export function Progress({
  value,
  className,
  barClassName,
  tone = "accent",
  label,
  valueText,
  decorative,
  marker,
}: {
  /** 0 to 100. */
  value: number;
  className?: string;
  /** A custom fill (a `bg-*` class replaces the gradient). Prefer `tone`. */
  barClassName?: string;
  tone?: ProgressTone;
  /** What it measures, for screen readers. */
  label?: string;
  /** The value in words, for screen readers: "3 of 8 done". */
  valueText?: string;
  /** Hidden from screen readers: the number is written beside it. */
  decorative?: boolean;
  /** A thin line at a point on the bar, such as where an even pace would be. */
  marker?: { at: number; label: string };
}) {
  const v = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useShown(ref, v);
  const custom = Boolean(barClassName && /(^|\s)bg-/.test(barClassName));
  const t = TONE[tone];

  return (
    <span
      ref={ref}
      className={cn("progress-track relative block h-1.5 w-full overflow-hidden rounded-full bg-paper/10", className)}
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "progressbar",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": Math.round(v),
            "aria-valuetext": valueText,
          })}
    >
      <span
        className={cn("relative block h-full rounded-full motion-reduce:!transition-none", shown > 0 && "progress-sheen", barClassName)}
        style={{
          width: `${shown}%`,
          // A sliver too small to see still shows as a dot.
          minWidth: shown > 0 ? "0.375rem" : 0,
          transition: `width 0.9s ${EASE}`,
          ...(custom ? {} : { backgroundImage: `linear-gradient(90deg, ${t.from}, ${t.to})`, boxShadow: `0 0 10px -2px ${t.glow}` }),
        }}
      />
      {marker && marker.at > 0 && marker.at < 100 && (
        <span
          aria-hidden
          title={marker.label}
          className="absolute top-0 h-full w-px bg-paper/45"
          style={{ left: `${marker.at}%` }}
        />
      )}
    </span>
  );
}

/** "42%" as a large 42 and a small %, sized to the ring. Anything else as given. */
function RingLabel({ label, size }: { label: React.ReactNode; size: number }) {
  if (typeof label === "string" || typeof label === "number") {
    const m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(String(label).trim());
    if (m) {
      const fontSize = Math.max(11, Math.round(size * 0.27));
      return (
        <span className="tabular inline-flex items-start font-display font-semibold leading-none tracking-[-0.04em] text-paper" style={{ fontSize }}>
          {m[1]}
          {m[2] && (
            <span className="ml-[0.06em] mt-[0.12em] font-semibold tracking-normal text-paper/55" style={{ fontSize: Math.max(8, Math.round(fontSize * 0.45)) }}>
              %
            </span>
          )}
        </span>
      );
    }
  }
  return <span className="tabular text-sm font-semibold leading-none text-paper">{label}</span>;
}

/**
 * A progress ring: a gradient arc with a soft glow and a bead at its end,
 * over a track of fine ticks and a slightly raised centre.
 */
export function RadialProgress({
  value,
  size = 64,
  stroke = 6,
  label,
  sublabel,
  className,
  tone = "accent",
  ticks,
  ariaLabel,
}: {
  /** 0 to 100. */
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  className?: string;
  tone?: ProgressTone;
  /** The track's fine ticks. On by default for rings 56px and up. */
  ticks?: boolean;
  /** What it measures, for screen readers. */
  ariaLabel?: string;
}) {
  const v = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useShown(ref, v);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const t = TONE[tone];

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - shown / 100);
  const angle = (shown / 100) * 360;
  const showTicks = ticks ?? size >= 56;
  const tickCount = size >= 84 ? 60 : 40;
  const tickWidth = Math.max(1, stroke * 0.24);
  const motion = { transition: `stroke-dashoffset 1.1s ${EASE}, transform 1.1s ${EASE}` };
  const center = size / 2;

  return (
    <span
      ref={ref}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {/* The raised centre the number sits on. */}
      <span aria-hidden className="progress-disc absolute rounded-full" style={{ inset: Math.round(stroke * 1.45) }} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`pg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: t.from }} />
            <stop offset="100%" style={{ stopColor: t.to }} />
          </linearGradient>
          <filter id={`pf${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={Math.max(1.5, stroke * 0.75)} />
          </filter>
        </defs>
        <circle cx={center} cy={center} r={r} fill="none" strokeWidth={stroke} className="stroke-paper/10" />
        {showTicks && (
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            strokeWidth={tickWidth}
            strokeLinecap="round"
            strokeDasharray={`0.01 ${c / tickCount - 0.01}`}
            className="stroke-paper/25"
          />
        )}
        {shown > 0 && (
          <>
            {/* The glow: the same arc, blurred, beneath. */}
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={`url(#pg${uid})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              filter={`url(#pf${uid})`}
              className="motion-reduce:!transition-none"
              style={{ ...motion, opacity: t.glowOpacity }}
            />
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={`url(#pg${uid})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              className="motion-reduce:!transition-none"
              style={motion}
            />
            {shown < 100 && (
              <g
                className="motion-reduce:!transition-none"
                style={{ ...motion, transform: `rotate(${angle}deg)`, transformOrigin: "50% 50%", transformBox: "view-box" }}
              >
                <circle cx={center + r} cy={center} r={Math.max(1.2, stroke * 0.36)} style={{ fill: "rgb(var(--card))" }} />
              </g>
            )}
          </>
        )}
      </svg>
      {(label != null || sublabel) && (
        <span className="relative grid place-items-center text-center leading-none">
          {label != null && <RingLabel label={label} size={size} />}
          {sublabel && (
            <span className="mt-1 text-paper/50" style={{ fontSize: Math.max(9, Math.round(size * 0.12)) }}>
              {sublabel}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
