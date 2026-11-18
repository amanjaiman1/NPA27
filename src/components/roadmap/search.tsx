"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Flag, Search, Target, X } from "lucide-react";
import type { PlanItemStatus, PlanLevel, PlanPriority } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  ITEM_STATUSES,
  NO_FILTERS,
  PLAN_PRIORITIES,
  STATUS_LABEL,
  formatDayShort,
  isOverdue,
  monthLabel,
  monthsBetween,
  planContext,
  planName,
  searchRoadmap,
  usedCategories,
  type RoadmapFilters,
} from "@/lib/roadmap";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { LEVEL_ICON, StatusBadge, useRoadmapNav, useToday } from "./shared";

const PAGE = 30;

/**
 * Finding plans and activities by words and filters. It only ever looks at
 * this account's plans, which are the only ones on the device.
 */
export function RoadmapSearch({ startWithOverdue = false }: { startWithOverdue?: boolean }) {
  const plans = useChronicle((s) => s.plans);
  const goals = useChronicle((s) => s.goals);
  const subjects = useChronicle((s) => s.subjects);
  const today = useToday();
  const nav = useRoadmapNav();
  const [query, setQuery] = useState("");
  const [f, setF] = useState<RoadmapFilters>(() => ({ ...NO_FILTERS, status: startWithOverdue ? "overdue" : "all" }));
  const [shown, setShown] = useState(PAGE);
  const q = useDeferredValue(query);
  const patch = (p: Partial<RoadmapFilters>) => {
    setF((x) => ({ ...x, ...p }));
    setShown(PAGE);
  };

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of plans) for (let y = Number(p.start.slice(0, 4)); y <= Number(p.end.slice(0, 4)); y++) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [plans]);
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const p of plans) for (const k of monthsBetween(p.start, p.end)) set.add(k);
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 48);
  }, [plans]);
  const categories = useMemo(() => usedCategories(plans), [plans]);
  const usedSubjects = useMemo(() => {
    const ids = new Set<string>();
    for (const p of plans) for (const it of p.items ?? []) if (it.subjectId) ids.add(it.subjectId);
    return subjects.filter((s) => ids.has(s.id));
  }, [plans, subjects]);

  const active =
    q.trim() !== "" ||
    f.level !== "all" ||
    f.year !== "all" ||
    f.month !== "all" ||
    f.week !== "" ||
    f.status !== "all" ||
    f.priority !== "all" ||
    f.goalId !== "all" ||
    f.subjectId !== "all" ||
    f.category !== "all";
  const results = useMemo(() => (active ? searchRoadmap(plans, q, f, today) : { plans: [], items: [] }), [active, plans, q, f, today]);
  const total = results.plans.length + results.items.length;

  return (
    <section aria-labelledby="find-title" className="space-y-4">
      <h2 id="find-title" className="font-display text-lg font-semibold tracking-snugg text-paper">
        Find plans and activities
      </h2>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/45" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, focus, objectives, notes…" aria-label="Search plans and activities" className="pl-10" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Select value={f.level} onChange={(e) => patch({ level: e.target.value as PlanLevel | "all" })} aria-label="Level">
            <option value="all">Every level</option>
            <option value="year">Yearly plans</option>
            <option value="month">Monthly plans</option>
            <option value="week">Weekly plans</option>
          </Select>
          <Select value={String(f.year)} onChange={(e) => patch({ year: e.target.value === "all" ? "all" : Number(e.target.value) })} aria-label="Year">
            <option value="all">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Select value={f.month} onChange={(e) => patch({ month: e.target.value })} aria-label="Month">
            <option value="all">Any month</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
          <Input type="date" value={f.week} onChange={(e) => patch({ week: e.target.value })} aria-label="Week starting" title="Week starting on this day" />
          <Select value={f.status} onChange={(e) => patch({ status: e.target.value as PlanItemStatus | "overdue" | "all" })} aria-label="Status">
            <option value="all">Any status</option>
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="overdue">Overdue</option>
          </Select>
          <Select value={f.priority} onChange={(e) => patch({ priority: e.target.value as PlanPriority | "all" })} aria-label="Priority">
            <option value="all">Any priority</option>
            {PLAN_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p} priority
              </option>
            ))}
          </Select>
          <Select value={f.goalId} onChange={(e) => patch({ goalId: e.target.value })} aria-label="Linked goal">
            <option value="all">Any goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
          <Select value={f.subjectId} onChange={(e) => patch({ subjectId: e.target.value })} aria-label="Subject" disabled={!usedSubjects.length}>
            <option value="all">Any subject</option>
            {usedSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={f.category} onChange={(e) => patch({ category: e.target.value })} aria-label="Category" disabled={!categories.length}>
            <option value="all">Any category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 rounded-xl border border-line px-3 text-[0.8rem] text-paper/75">
            <input type="checkbox" checked={f.includeArchived} onChange={(e) => patch({ includeArchived: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Include archived
          </label>
        </div>
        {active && (
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-paper/65">
            <span role="status">
              {total === 0 ? "Nothing matches." : `${results.plans.length} plan${results.plans.length === 1 ? "" : "s"} · ${results.items.length} activit${results.items.length === 1 ? "y or milestone" : "ies and milestones"}`}
            </span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setF(NO_FILTERS);
              }}
              className="inline-flex items-center gap-1 font-semibold text-paper/60 hover:text-paper"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </Card>

      {!active ? (
        <p className="px-1 text-[0.8rem] text-paper/60">Type a word or pick a filter. Only your own plans are searched.</p>
      ) : (
        <div className="space-y-4">
          {results.plans.length > 0 && (
            <Card className="p-4 sm:p-5">
              <p className="eyebrow mb-2">Plans</p>
              <ul className="divide-y divide-line">
                {results.plans.slice(0, shown).map((p) => {
                  const Icon = LEVEL_ICON[p.level];
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => nav({ plan: p.id })} className="flex w-full items-center gap-3 py-2.5 text-left">
                        <Icon className="h-4 w-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-paper hover:text-accent">{planName(p)}</span>
                          <span className="block truncate text-[0.7rem] text-paper/60">
                            {planContext(p)}
                            {p.focus ? ` · ${p.focus}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {results.items.length > 0 && (
            <Card className="p-4 sm:p-5">
              <p className="eyebrow mb-2">Activities and milestones</p>
              <ul className="divide-y divide-line">
                {results.items.slice(0, shown).map(({ plan, item }) => {
                  const goal = item.goalId ? goals.find((g) => g.id === item.goalId) : undefined;
                  const late = isOverdue(item, plan, today);
                  return (
                    <li key={`${plan.id}:${item.id}`}>
                      <button type="button" onClick={() => nav({ plan: plan.id, item: item.id })} className="flex w-full items-start gap-3 py-2.5 text-left">
                        {item.kind === "milestone" ? (
                          <Flag className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        ) : (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-paper/35" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-medium text-paper hover:text-accent", item.status === "completed" && "line-through decoration-paper/40")}>
                            {item.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.68rem] text-paper/60">
                            <span>{planName(plan)}</span>
                            {item.targetDate && <span className={cn(late && "font-semibold text-danger")}>{formatDayShort(item.targetDate)}</span>}
                            {item.kind === "activity" && <span>{item.priority ?? "Medium"} priority</span>}
                            {goal && (
                              <span className="inline-flex items-center gap-1">
                                <Target className="h-3 w-3" /> {goal.title}
                              </span>
                            )}
                          </span>
                        </span>
                        <StatusBadge status={item.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {Math.max(results.plans.length, results.items.length) > shown && (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

