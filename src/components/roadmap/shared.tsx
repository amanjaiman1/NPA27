"use client";

import { useCallback, useMemo } from "react";
import { CalendarCheck, CalendarDays, CalendarRange, type LucideIcon } from "lucide-react";
import type { ISODate, PlanItemStatus, PlanLevel, PlanPriority, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { normalizeWeekStart, STATUS_LABEL, type ExecutionCounts } from "@/lib/roadmap";
import type { GoalData } from "@/lib/goals";
import { Badge } from "@/components/ui/badge";
import { cn, toISODate } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export const LEVEL_ICON: Record<PlanLevel, LucideIcon> = {
  year: CalendarRange,
  month: CalendarDays,
  week: CalendarCheck,
};

/** Today in the device's calendar, kept current past midnight. */
export function useToday(): ISODate {
  const now = useNow(60_000);
  return toISODate(now);
}

export function useWeekStart(): number {
  return normalizeWeekStart(useChronicle((s) => s.profile.weekStart));
}

/** Everything a goal measures itself from, for showing its own progress (from Goals). */
export function useGoalData(): GoalData {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const mocks = useChronicle((s) => s.mocks);
  const revisions = useChronicle((s) => s.revisions);
  const books = useChronicle((s) => s.books);
  const currentAffairs = useChronicle((s) => s.currentAffairs);
  const reflections = useChronicle((s) => s.reflections);
  const mistakes = useChronicle((s) => s.mistakes);
  const lifeLog = useChronicle((s) => s.lifeLog);
  return useMemo(
    () => ({ journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog }),
    [journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog],
  );
}

/* ── where you are in the Roadmap: kept in the address ─────────────
   Opening a plan or a tab updates the address without a page load, so
   the back button returns to where you were and a link can open a plan. */

export type RoadmapTab = "overview" | "years" | "months" | "weeks" | "find";

export interface RoadmapLocation {
  tab?: RoadmapTab;
  plan?: string;
  item?: string;
  /** Find tab, starting on overdue activities. */
  overdue?: boolean;
}

export function roadmapHref(loc: RoadmapLocation): string {
  const q = new URLSearchParams();
  if (loc.plan) q.set("plan", loc.plan);
  else if (loc.tab && loc.tab !== "overview") q.set("tab", loc.tab);
  if (loc.item) q.set("item", loc.item);
  if (loc.overdue) q.set("overdue", "1");
  const s = q.toString();
  return s ? `/roadmap?${s}` : "/roadmap";
}

export function useRoadmapNav() {
  return useCallback((loc: RoadmapLocation, opts: { replace?: boolean } = {}) => {
    const href = roadmapHref(loc);
    if (opts.replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);
}

/* ── small pieces ────────────────────────────────────────────────── */

export function LevelBadge({ level, className }: { level: PlanLevel; className?: string }) {
  const Icon = LEVEL_ICON[level];
  const label = level === "year" ? "Year" : level === "month" ? "Month" : "Week";
  return (
    <Badge tone="default" className={className}>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
}

const STATUS_TONE: Record<PlanItemStatus, React.ComponentProps<typeof Badge>["tone"]> = {
  notStarted: "outline",
  inProgress: "accent",
  completed: "positive",
  deferred: "ghost",
};

export function StatusBadge({ status }: { status: PlanItemStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const PRIORITY_DOT: Record<PlanPriority, string> = {
  High: "bg-danger",
  Medium: "bg-warning",
  Low: "bg-paper/35",
};

export function PriorityMark({ priority }: { priority?: PlanPriority }) {
  const p = priority ?? "Medium";
  return (
    <span className="inline-flex items-center gap-1 text-[0.68rem] text-paper/60">
      <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[p])} aria-hidden />
      {p} priority
    </span>
  );
}

/**
 * How much of the planned work is done. Always labelled as roadmap
 * execution, so it is never read as a goal's progress.
 */
export function ExecutionBar({
  counts,
  label = "Planned work done",
  compact,
  className,
}: {
  counts: Pick<ExecutionCounts, "total" | "completed" | "pct">;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const pct = counts.pct ?? 0;
  // Spans throughout, so the bar can sit inside a button (a plan card).
  return (
    <span className={cn("block", className)}>
      {!compact && (
        <span className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[0.72rem] font-semibold text-paper/70">{label}</span>
          <span className="tabular text-[0.72rem] text-paper/60">
            {counts.total ? `${counts.completed} of ${counts.total} · ${pct}%` : "Nothing planned yet"}
          </span>
        </span>
      )}
      <Progress
        value={pct}
        tone={counts.total > 0 && pct >= 100 ? "positive" : "accent"}
        label={label}
        valueText={counts.total ? `${counts.completed} of ${counts.total} done` : "Nothing planned yet"}
      />
    </span>
  );
}

/** A heading for a block inside a plan. */
export function Block({
  title,
  hint,
  action,
  children,
  className,
  id,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("space-y-3", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 id={id ? `${id}-title` : undefined} className="font-display text-[0.95rem] font-semibold tracking-snugg text-paper">
            {title}
          </h3>
          {hint && <p className="mt-0.5 text-[0.75rem] leading-relaxed text-paper/60">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Plans sorted for lists: newest period first. */
export function newestFirst(plans: RoadmapPlan[]): RoadmapPlan[] {
  return [...plans].sort((a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id));
}
