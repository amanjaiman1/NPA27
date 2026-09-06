import { cn } from "@/lib/utils";

/**
 * The waiting state, drawn as the app's own mark in motion.
 *
 * The logo is a ring — the cycle of days — with one bright node for today. Here
 * the rings hold still and the node orbits them, so a spinner reads as the same
 * object as the brand rather than a generic wheel bolted on. Only the node and
 * its spoke rotate, which is also the cheap half: two small shapes on the
 * compositor instead of the whole glyph.
 *
 * `prefers-reduced-motion` is neutralised globally in `globals.css`, so this
 * settles into a static mark for anyone who has asked for that.
 */
export function Spinner({
  className,
  /** Seconds per revolution. Slower than a default spinner on purpose — it
   *  should feel like a clock, not a buffering wheel. */
  speed = 1.6,
  label,
}: {
  className?: string;
  speed?: number;
  label?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2.5"
      role="status"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className={cn("h-7 w-7", className)}
        aria-hidden
      >
        <circle cx="16" cy="16" r="12.5" className="stroke-paper/20" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="7" className="stroke-paper/10" strokeWidth="1.5" />
        {/* The orbiting half. `transform-box: fill-box` plus a 50% origin keeps
            the rotation centred on the glyph in every browser — an SVG group
            otherwise spins around the viewport origin. */}
        <g
          className="animate-spin"
          style={{
            animationDuration: `${speed}s`,
            transformBox: "fill-box",
            transformOrigin: "50% 50%",
          }}
        >
          <line
            x1="16"
            y1="3.5"
            x2="16"
            y2="9"
            className="stroke-accent/50"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="16" cy="3.5" r="2.4" className="fill-accent" />
        </g>
      </svg>
      {label && <span className="text-sm text-paper/55">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  );
}

/** Centred spinner for a whole screen or a tall empty panel. */
export function SpinnerBlock({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center py-16", className)}>
      <Spinner className="h-9 w-9" label={label} />
    </div>
  );
}
