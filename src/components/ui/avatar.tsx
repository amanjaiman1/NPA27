import { initialsOf } from "@/components/account/sync-label";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[0.56rem]",
  sm: "h-8 w-8 text-[0.66rem]",
  md: "h-9 w-9 text-[0.72rem]",
  lg: "h-11 w-11 text-sm",
} as const;

/**
 * A person's initials on the accent: the account in the rail and the top bar,
 * and the greeting on the dashboard. Decorative; the control around it carries
 * the name for screen readers.
 */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-semibold tracking-normal text-accent-fg",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_6px_16px_-8px_rgb(var(--accent)/var(--accent-glow))]",
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
