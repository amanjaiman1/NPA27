import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The header at the top of every route: a small tracked label, a big rounded
 * display headline, and an optional supporting line.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 animate-fade-in">
        {eyebrow && (
          <p className="eyebrow mb-3 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[2rem] font-bold leading-[1.08] tracking-tightest text-paper sm:text-[2.75rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3.5 max-w-2xl text-[0.95rem] leading-relaxed text-paper/70 text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
