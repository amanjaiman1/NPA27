"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { findNavItem, metricNavItems, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The header at the top of every page: the section's icon on a small glass
 * tile, an optional quiet label, the title and a supporting line, with the
 * page's actions on the right. Compact on purpose, so the page's own content
 * starts high on the screen.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  icon,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Defaults to the icon of the page's navigation entry. Pass `null` for none. */
  icon?: React.ElementType | null;
}) {
  const pathname = usePathname() ?? "";
  const nav = metricNavItems.find((i) => isActivePath(pathname, i.href)) ?? findNavItem(pathname);
  const Icon = icon === null ? null : icon ?? nav?.icon ?? null;

  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span
            aria-hidden
            className="mt-0.5 hidden h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line bg-card text-accent shadow-soft sm:grid"
          >
            <Icon className="h-[1.3rem] w-[1.3rem]" strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.03em] text-paper text-balance sm:text-[1.95rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-paper/65 text-pretty">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
