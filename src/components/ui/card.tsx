import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The elevated surface everything sits on: a solid card, lifted off the canvas
 * by a soft wide shadow rather than a hard border.
 */
export function Card({
  className,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-card shadow-soft",
        hover &&
          "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-lift",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 pb-3 pt-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-display text-[0.95rem] font-semibold tracking-snugg text-paper",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
