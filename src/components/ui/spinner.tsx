import { cn } from "@/lib/utils";

/**
 * The waiting state: a small ring with one bright arc travelling around it.
 *
 * Deliberately plain. This replaced a spinner drawn from the app's logo mark,
 * which was distinctive but too much of an event for something that should
 * appear and disappear unnoticed — a loading indicator is furniture, not
 * branding.
 *
 * The colour is `--paper`, the foreground token, not a literal white: `--paper`
 * resolves to near-white on all four dark surfaces and inverts to near-black on
 * the light one, so the arc stays visible whatever surface is chosen. Hard-coding
 * white would make it invisible on the default white surface.
 *
 * Both circles rotate as one `<svg>` element rather than an inner `<g>`, so the
 * transform origin is the element box and needs no `fill-box` correction. It is
 * a single composited transform on two shapes.
 *
 * `prefers-reduced-motion` is neutralised globally in `globals.css`, so this
 * settles into a static ring for anyone who has asked for that.
 */
export function Spinner({
  className,
  /** Seconds per revolution. */
  speed = 0.8,
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
        viewBox="0 0 24 24"
        fill="none"
        className={cn("h-5 w-5 animate-spin", className)}
        style={{ animationDuration: `${speed}s` }}
        aria-hidden
      >
        {/* The track, so the arc reads as travelling around something rather
            than floating on its own. */}
        <circle
          cx="12"
          cy="12"
          r="9.25"
          className="stroke-paper/15"
          strokeWidth="2.5"
        />
        {/* Circumference is 2π·9.25 ≈ 58.1; a 15.5 dash leaves a little over a
            quarter of the ring lit. Round caps keep it from reading as a wedge. */}
        <circle
          cx="12"
          cy="12"
          r="9.25"
          className="stroke-paper"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="15.5 58.1"
        />
      </svg>
      {label && <span className="text-sm text-paper/55">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  );
}
