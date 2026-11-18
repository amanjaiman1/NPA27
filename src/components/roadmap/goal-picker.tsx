"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Target, X } from "lucide-react";
import type { Goal } from "@/lib/types";
import { goalCategory } from "@/lib/goals";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * Choosing goals to link: search, then tick. Goals are only referenced; the
 * picker never creates or changes one. `multiple` picks any number (for a
 * plan); otherwise one or none (for an activity).
 */
export function GoalPicker({
  goals,
  value,
  onChange,
  multiple = false,
  label = "Linked goals",
}: {
  goals: Goal[];
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const groupId = useId();
  const chosen = useMemo(() => goals.filter((g) => value.includes(g.id)), [goals, value]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? goals.filter((g) => g.title.toLowerCase().includes(q) || goalCategory(g).toLowerCase().includes(q))
      : goals;
    // Active goals first, then the rest, each alphabetically.
    return [...list].sort(
      (a, b) => Number(a.status !== "Active") - Number(b.status !== "Active") || a.title.localeCompare(b.title),
    );
  }, [goals, query]);

  function toggle(id: string) {
    if (multiple) onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    else onChange(value.includes(id) ? [] : [id]);
  }

  if (!goals.length) {
    return (
      <div>
        <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/70">{label}</p>
        <p className="rounded-xl border border-dashed border-paper/15 px-3.5 py-3 text-[0.75rem] text-paper/60">
          No goals yet. Goals live on the{" "}
          <Link href="/goals" className="font-semibold text-accent hover:underline">
            Goals page
          </Link>
          ; once you have some, you can link them here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p id={`${groupId}-label`} className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/70">
        {label}
        <span className="font-normal text-paper/50"> · optional</span>
      </p>
      {chosen.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chosen.map((g) => (
            <span
              key={g.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/30 bg-accent/10 py-1 pl-2.5 pr-1 text-[0.72rem] font-semibold text-accent"
            >
              <Target className="h-3 w-3 shrink-0" />
              <span className="truncate">{g.title}</span>
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-label={`Unlink goal “${g.title}”`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-accent/15"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper/45" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your goals…"
          aria-label={`Search goals to link`}
          className="py-2 pl-9 text-[0.82rem]"
        />
      </div>
      <div
        role="group"
        aria-labelledby={`${groupId}-label`}
        className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1"
      >
        {!multiple && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8rem] text-paper/70 hover:bg-paper/[0.04]">
            <input
              type="radio"
              name={`${groupId}-goal`}
              checked={value.length === 0}
              onChange={() => onChange([])}
              className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
            />
            No goal
          </label>
        )}
        {visible.map((g) => {
          const on = value.includes(g.id);
          return (
            <label
              key={g.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8rem] hover:bg-paper/[0.04]",
                on ? "text-paper" : "text-paper/75",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={multiple ? undefined : `${groupId}-goal`}
                checked={on}
                onChange={() => toggle(g.id)}
                aria-label={`Link goal “${g.title}”`}
                className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))]"
              />
              <span className="min-w-0 flex-1 truncate">{g.title}</span>
              <span className="shrink-0 text-[0.66rem] text-paper/50">
                {g.status === "Active" ? goalCategory(g) : g.status}
              </span>
            </label>
          );
        })}
        {visible.length === 0 && <p className="px-2.5 py-2 text-[0.75rem] text-paper/55">No goal matches “{query}”.</p>}
      </div>
    </div>
  );
}
