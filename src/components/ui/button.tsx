"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "subtle" | "danger" | "solid";
type Size = "sm" | "md" | "lg" | "icon";

/**
 * Every variant is liquid glass (globals.css, "Liquid glass buttons"): the
 * primary is tinted with the accent, the rest are clear glass (`lg-clear`).
 */
const variants: Record<Variant, string> = {
  // Tinted glass: the one loud thing on the page.
  primary:
    "bg-accent text-accent-fg shadow-accent hover:brightness-[1.06] hover:-translate-y-px active:translate-y-0",
  // Inverted ink pill.
  solid:
    "bg-paper text-ink hover:opacity-90 hover:-translate-y-px active:translate-y-0",
  ghost: "lg-clear text-paper border border-line hover:border-paper/25 hover:-translate-y-px",
  outline: "lg-clear text-paper border border-line hover:border-paper/30 hover:-translate-y-px",
  // Clear glass without an edge, for the quieter actions.
  subtle: "lg-clear text-paper/70 hover:text-paper",
  danger: "lg-clear text-danger border border-danger/30 hover:border-danger/55 hover:bg-danger/10",
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
 * A round icon control of clear liquid glass: the shell's utilities, a
 * card's overflow, a dialog's close. Always named, since the icon alone says
 * nothing to a screen reader.
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
        "lg-clear grid shrink-0 place-items-center rounded-full transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-10 w-10",
        active ? "lg-on text-[color:var(--nav-active-fg)]" : "text-paper/65 hover:text-paper",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
