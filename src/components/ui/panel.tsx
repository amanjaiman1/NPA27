import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * A card with a header: a quiet label or title, an optional line under it,
 * and an action on the right ("Full view ›"). The standard way to present a
 * block of information on the dashboard and across the pages.
 */
export function Panel({
  title,
  eyebrow,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
}: {
  title?: React.ReactNode;
  /** A small label above the title, or on its own in place of one. */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
}) {
  const headingId = React.useId();
  const hasHeader = Boolean(title || eyebrow || action);
  return (
    <Card className={cn("flex flex-col p-5 sm:p-6", className)}>
      <Tag aria-labelledby={title ? headingId : undefined} className="flex min-h-0 flex-1 flex-col">
        {hasHeader && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {Icon && (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-[1.05rem] w-[1.05rem]" />
                </span>
              )}
              <div className="min-w-0">
                {eyebrow && <p className={cn("eyebrow", title && "mb-1")}>{eyebrow}</p>}
                {title && (
                  <h2 id={headingId} className="text-[1rem] font-semibold leading-snug tracking-[-0.02em] text-paper">
                    {title}
                  </h2>
                )}
                {description && <p className="mt-0.5 text-[0.78rem] leading-relaxed text-paper/60">{description}</p>}
              </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
      </Tag>
    </Card>
  );
}

/** The quiet "Full view ›" link in a panel's header. */
export function PanelLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[0.75rem] font-medium text-paper/65 transition-colors hover:bg-[var(--nav-hover)] hover:text-paper",
        className,
      )}
    >
      {children}
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

type Tone = "up" | "down" | "neutral";

/**
 * A headline number: a quiet label, the figure large, a line of context, and
 * optionally a small chart and a change. Every figure must come from the
 * person's own data; a change is shown only when there's something real to
 * compare against.
 */
export function MetricCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  chart,
  delta,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ElementType;
  /** A sparkline or similar, drawn top-right. */
  chart?: React.ReactNode;
  delta?: { text: string; tone: Tone; label?: string };
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />}
          {label}
        </p>
        {/* On a phone the figure gets the width; the picture shows from `sm`. */}
        {chart && <div className="-mr-1 -mt-1 hidden shrink-0 sm:block">{chart}</div>}
      </div>
      <div className="mt-auto pt-4">
        <p className="tabular flex items-baseline gap-1 text-[1.85rem] font-semibold leading-none tracking-[-0.035em] text-paper">
          {value}
          {unit && <span className="text-[0.95rem] font-medium tracking-[-0.01em] text-paper/60">{unit}</span>}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[0.75rem]">
          {hint ? <span className="min-w-0 truncate text-paper/60">{hint}</span> : <span />}
          {delta && (
            <span
              className={cn(
                "tabular shrink-0 font-semibold",
                delta.tone === "up" ? "text-positive" : delta.tone === "down" ? "text-danger" : "text-paper/60",
              )}
              title={delta.label}
            >
              {delta.text}
              {delta.label && <span className="sr-only"> {delta.label}</span>}
            </span>
          )}
        </div>
      </div>
    </>
  );
  return (
    <Card hover={Boolean(href)} className={cn("relative flex h-full flex-col p-5", className)}>
      {href ? (
        <Link href={href} className="flex flex-1 flex-col after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
