"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "subtle" | "danger" | "solid";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  // The accent pill — the one loud thing on the page.
  primary:
    "bg-accent text-accent-fg shadow-accent hover:brightness-[1.08] hover:-translate-y-px active:translate-y-0",
  // Inverted ink pill, like the reference's circular nav buttons.
  solid:
    "bg-paper text-ink hover:opacity-90 hover:-translate-y-px active:translate-y-0",
  ghost:
    "bg-card text-paper border border-line shadow-soft hover:border-paper/25 hover:-translate-y-px",
  // `glass-ghost`: a faint frosted fill, so it reads as a control on the glass.
  outline:
    "glass-ghost bg-transparent text-paper border border-line hover:border-paper/30 hover:bg-paper/[0.04]",
  subtle: "bg-transparent text-paper/55 hover:text-paper hover:bg-paper/[0.06]",
  danger:
    "bg-transparent text-danger border border-danger/30 hover:border-danger/55 hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[0.95rem]",
  icon: "h-10 w-10 p-0",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-snugg",
        "transition-all duration-200 ease-out active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
        "select-none disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/**
 * A round, quiet icon control: the shell's utilities, a card's overflow, a
 * dialog's close. Always named, since the icon alone says nothing to a screen
 * reader.
 */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: "sm" | "md" | "lg" }
>(function IconButton({ label, active, size = "md", className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid shrink-0 place-items-center rounded-full transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-10 w-10",
        active
          ? "bg-[var(--nav-active)] text-[color:var(--nav-active-fg)]"
          : "text-paper/60 hover:bg-[var(--nav-hover)] hover:text-paper",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
