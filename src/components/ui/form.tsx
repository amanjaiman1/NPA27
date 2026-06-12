"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[0.7rem] font-medium uppercase tracking-wider text-paper/45",
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-xl border border-paper/12 bg-paper/[0.03] px-3.5 py-2.5 text-sm text-paper placeholder:text-paper/30 transition-colors focus:border-paper/30 focus:outline-none focus:ring-1 focus:ring-paper/20";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "min-h-[88px] resize-y leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldBase, "appearance-none bg-ink/40 pr-9", className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.75rem center",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({
  label,
  children,
  className,
  hint,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && <p className="mt-1 text-[0.7rem] text-paper/35">{hint}</p>}
    </div>
  );
}

/** A 1-5 rating selector rendered as pips. */
export function RatingPicker({
  value,
  onChange,
  max = 5,
  labels,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  labels?: string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: max }).map((_, i) => {
        const v = i + 1;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            title={labels?.[i]}
            className={cn(
              "h-8 flex-1 rounded-lg border text-xs font-medium transition-all",
              v <= value
                ? "border-paper/30 bg-paper text-ink"
                : "border-paper/12 bg-paper/[0.03] text-paper/40 hover:border-paper/25",
            )}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
