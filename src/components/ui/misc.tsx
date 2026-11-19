"use client";

import * as React from "react";
import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A small, quiet label above a heading or a figure, in sentence case. */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

/** Section heading: eyebrow + title + optional action on the right. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2 className="font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-paper">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[0.82rem] text-paper/60">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A labelled metric value. */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2 text-paper/60">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="tabular font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.035em] text-paper">
        {value}
      </div>
      {hint && <div className="text-xs text-paper/60">{hint}</div>}
    </div>
  );
}

/** Empty state placeholder. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-paper/15 bg-paper/[0.015] px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/15">
          {icon}
        </div>
      )}
      <p className="text-[0.95rem] font-semibold tracking-[-0.01em] text-paper">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[0.8rem] leading-relaxed text-paper/60">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Shimmer skeleton block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-paper/[0.06]",
        className,
      )}
    />
  );
}

/**
 * Segmented control / tabs. The selected option's pill slides across to the
 * one you pick, so the change reads as a move rather than a flash.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  compact,
  label,
}: {
  options: { label: string; value: T; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** Tighter on phones, so five or so options fit across one. */
  compact?: boolean;
  /** What the choice is, for screen readers: "Review period". */
  label?: string;
}) {
  const group = useId();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "lg-track no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line p-1",
        className,
      )}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            title={o.hint}
            className={cn(
              "relative shrink-0 rounded-full py-1.5 text-xs font-semibold transition-colors duration-200",
              compact ? "px-2.5 sm:px-3.5" : "px-3.5",
              on ? "text-accent-fg" : "text-paper/60 hover:bg-[var(--nav-hover)] hover:text-paper",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${group}`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-accent shadow-accent"
                transition={{ type: "spring", stiffness: 480, damping: 36 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A section that opens and closes in place, with its height eased rather than
 * snapped: "Advanced settings", "Show the records behind this".
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-3 rounded-xl py-2 text-left text-[0.82rem] font-semibold text-paper/80 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
      >
        <span className="min-w-0">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-300", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-1 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Generic chip / tag. */
export function Chip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "lg-clear rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
        active
          ? "border-accent/35 bg-accent/15 text-accent"
          : "border-line text-paper/65 hover:border-paper/25 hover:text-paper",
        className,
      )}
      {...props}
    />
  );
}
