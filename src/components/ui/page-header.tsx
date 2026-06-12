import * as React from "react";
import { cn } from "@/lib/utils";

/** Large editorial page header used at the top of every route. */
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
            <span className="inline-block h-1 w-1 rounded-full bg-paper/40" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-light leading-[1.05] tracking-tight text-paper sm:text-[2.6rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/50 text-pretty">
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
