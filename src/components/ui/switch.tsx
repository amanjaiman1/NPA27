"use client";

import { cn } from "@/lib/utils";

/** A compact pill switch. `label` names it for screen readers when no visible label is tied to it. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        "disabled:pointer-events-none disabled:opacity-40",
        checked ? "border-accent bg-accent" : "border-line bg-paper/[0.08]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-[1.125rem] w-[1.125rem] rounded-full transition-all duration-200",
          checked ? "left-[1.4375rem] bg-accent-fg" : "left-0.5 bg-paper/60",
        )}
      />
    </button>
  );
}
