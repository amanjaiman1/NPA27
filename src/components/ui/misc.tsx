"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Small tracked uppercase label. */
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
        <h2 className="font-display text-lg font-semibold tracking-snugg text-paper">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-paper/50">{description}</p>
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
      <div className="flex items-center gap-2 text-paper/45">
        {icon}
        <span className="text-[0.7rem] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="tabular font-display text-[1.6rem] font-bold tracking-tightest text-paper">
        {value}
      </div>
      {hint && <div className="text-xs text-paper/40">{hint}</div>}
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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-paper/15 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-paper/[0.06] text-paper/50">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-paper">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs text-paper/45">{description}</p>
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

/** Segmented control / tabs. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-card p-1 shadow-soft",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
            value === o.value
              ? "bg-accent text-accent-fg shadow-accent"
              : "text-paper/55 hover:bg-paper/[0.05] hover:text-paper",
          )}
        >
          {o.label}
        </button>
      ))}
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
        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
        active
          ? "border-accent/35 bg-accent/15 text-accent"
          : "border-line bg-card text-paper/55 hover:border-paper/25 hover:text-paper",
        className,
      )}
      {...props}
    />
  );
}
