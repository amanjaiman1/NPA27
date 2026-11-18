"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flag,
  Forward,
  Info,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import type { RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  activitiesOf,
  ancestorsOf,
  blankPlan,
  carryable,
  childrenOf,
  descendantIds,
  formatDay,
  formatDayShort,
  isArchived,
  milestonesOf,
  monthKeyOf,
  monthName,
  monthsBetween,
  nextPeriodStart,
  nextPlanOf,
  ownCounts,
  periodLabel,
  planName,
  plannedVsRecorded,
  previousPlanOf,
  rollupCounts,
  samePeriod,
  suggestedParent,
  timingOf,
  weekSlots,
} from "@/lib/roadmap";
import { computeGoalProgress, healthLabel } from "@/lib/goals";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatHours, toISODate } from "@/lib/utils";
import { ItemForm, type ItemFormRequest } from "./item-form";
import { CarryDialog, ItemList } from "./item-list";
import { DeletePlanDialog, DuplicatePlanDialog } from "./plan-dialogs";
import { PlanReviewBlock } from "./plan-review";
import { MonthCalendar, WeekStrip } from "./calendar";
import { Block, ExecutionBar, LEVEL_ICON, LevelBadge, useGoalData, useRoadmapNav, useToday, useWeekStart } from "./shared";
import type { PlanFormRequest } from "./plan-form";

const TIMING_LABEL: Record<RoadmapPlan["level"], { current: string; upcoming: string; ended: string }> = {
  year: { current: "This year", upcoming: "Ahead", ended: "Ended" },
  month: { current: "This month", upcoming: "Ahead", ended: "Ended" },
  week: { current: "This week", upcoming: "Ahead", ended: "Ended" },
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "positive" }) {
  return (
    <div className="rounded-xl border border-line bg-paper/[0.02] px-2.5 py-2">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-paper/55">{label}</p>
      <p className={cn("tabular mt-0.5 font-display text-lg font-bold text-paper", tone === "danger" && "text-danger", tone === "positive" && "text-positive")}>
        {value}
      </p>
    </div>
  );
}

function containsText(children: RoadmapPlan[], all: number, level: RoadmapPlan["level"]): string {
  if (!children.length) return `No ${level === "year" ? "monthly" : "weekly"} plans in it yet.`;
  const months = children.filter((c) => c.level === "month").length;
  const weeks = children.filter((c) => c.level === "week").length;
  const parts = [months ? `${months} monthly` : "", weeks ? `${weeks} weekly` : ""].filter(Boolean).join(" and ");
  return `Contains ${parts} plan${children.length === 1 ? "" : "s"}${all > children.length ? ` (${all} in all)` : ""}.`;
}

/**
 * One plan, at any level: what it's for, what's in it, how the planned work
 * is going, the goals it serves (with their own progress, from Goals), and
 * the review. Months and years also show the plans under them.
 */
export function PlanView({
  plan,
  highlightItem,
  onEditPlan,
  onCreate,
}: {
  plan: RoadmapPlan;
  highlightItem?: string;
  onEditPlan: (p: RoadmapPlan) => void;
  onCreate: (req: PlanFormRequest) => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const goals = useChronicle((s) => s.goals);
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const setPlanArchived = useChronicle((s) => s.setPlanArchived);
  const setPlanParent = useChronicle((s) => s.setPlanParent);
  const addPlans = useChronicle((s) => s.addPlans);
  const goalData = useGoalData();
  const today = useToday();
  const weekStart = useWeekStart();
  const nav = useRoadmapNav();
  const [itemReq, setItemReq] = useState<ItemFormRequest | null>(null);
  const [carryOpen, setCarryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const ancestors = useMemo(() => ancestorsOf(plans, plan).reverse(), [plans, plan]);
  const own = useMemo(() => ownCounts(plans, plan, today), [plans, plan, today]);
  const roll = useMemo(() => rollupCounts(plans, plan, today), [plans, plan, today]);
  const timing = timingOf(plan, today);
  const prev = previousPlanOf(plans, plan);
  const next = nextPlanOf(plans, plan);
  const archived = isArchived(plans, plan);
  const twin = samePeriod(plans, plan);
  const parent = plan.parentId ? plans.find((p) => p.id === plan.parentId) : undefined;
  const offerParent = !plan.parentId && !archived ? suggestedParent(plans, plan) : undefined;
  const offerParentPlan = offerParent ? plans.find((p) => p.id === offerParent) : undefined;
  const children = childrenOf(plans, plan.id);
  const subtree = useMemo(() => new Set([plan.id, ...descendantIds(plans, plan.id)]), [plans, plan.id]);
  const hasChildren = subtree.size > 1;
  const Icon = LEVEL_ICON[plan.level];
  const noun = plan.level;

  /* Goals: the plan's own links, and goals only its activities name. */
  const linkedGoals = useMemo(() => {
    const ids = new Set(plan.goalIds ?? []);
    return goals.filter((g) => ids.has(g.id));
  }, [goals, plan.goalIds]);
  const viaItems = useMemo(() => {
    const ids = new Set<string>();
    for (const p of plans) if (subtree.has(p.id)) for (const it of p.items ?? []) if (it.goalId && !(plan.goalIds ?? []).includes(it.goalId)) ids.add(it.goalId);
    return goals.filter((g) => ids.has(g.id));
  }, [plans, subtree, goals, plan.goalIds]);
  const plannedFor = (goalId: string) => {
    let total = 0;
    let done = 0;
    for (const p of plans) {
      if (!subtree.has(p.id)) continue;
      for (const it of p.items ?? []) {
        if (it.kind !== "activity" || it.goalId !== goalId) continue;
        total++;
        if (it.status === "completed") done++;
      }
    }
    return { total, done };
  };

  const pvr = useMemo(
    () => (plan.level === "year" ? null : plannedVsRecorded(plan, journal, subjects, today)),
    [plan, journal, subjects, today],
  );

  /* Months of a year plan, each with the monthly plan for it, if any. */
  const months = useMemo(() => {
    if (plan.level !== "year") return [];
    return monthsBetween(plan.start, plan.end).map((key) => {
      const all = plans.filter((p) => p.level === "month" && monthKeyOf(p.start) === key);
      const mine = all.find((p) => p.parentId === plan.id);
      return { key, plan: mine ?? all[0], inThisYear: Boolean(mine) };
    });
  }, [plan, plans]);
  const unplannedMonthKeys = months.filter((m) => !m.plan).map((m) => m.key);

  /* Weeks of a month plan. */
  const slots = useMemo(() => (plan.level === "month" ? weekSlots(plans, monthKeyOf(plan.start), weekStart) : []), [plan, plans, weekStart]);
  const unplannedSlots = slots.filter((s) => !s.plan && s.home === monthKeyOf(plan.start));
  const dueThisMonth = useMemo(() => {
    if (plan.level !== "month") return [];
    const out: { plan: RoadmapPlan; title: string; date: string; done: boolean; milestone: boolean; id: string }[] = [];
    for (const p of plans) {
      if (!subtree.has(p.id)) continue;
      for (const it of p.items ?? []) {
        if (!it.targetDate || it.targetDate < plan.start || it.targetDate > plan.end || it.status === "deferred") continue;
        out.push({ plan: p, title: it.title, date: it.targetDate, done: it.status === "completed", milestone: it.kind === "milestone", id: it.id });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [plan, plans, subtree]);

  const showActivities = plan.level !== "year" || activitiesOf(plan).length > 0;
  const canCarry = plan.level !== "year" && carryable(plans, plan).length > 0;
  const nextStart = nextPeriodStart(plan);

  function planNext() {
    onCreate({
      level: plan.level,
      start: nextStart,
      month: nextStart.slice(0, 7),
      year: Number(nextStart.slice(0, 4)),
      ...(plan.level === "week" && carryable(plans, plan).length ? { carryFrom: plan.id } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[0.78rem] text-paper/60">
        <button type="button" onClick={() => nav({ tab: "overview" })} className="font-semibold hover:text-paper">
          Roadmap
        </button>
        {ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-paper/40" aria-hidden />
            <button type="button" onClick={() => nav({ plan: a.id })} className="hover:text-paper">
              {planName(a)}
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-paper/40" aria-hidden />
          <span className="font-semibold text-paper" aria-current="page">
            {planName(plan)}
          </span>
        </span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={plan.level} />
            <span className="text-[0.8rem] font-medium text-paper/70">{periodLabel(plan)}</span>
            <Badge tone={timing.state === "current" ? "solid" : "outline"}>{TIMING_LABEL[plan.level][timing.state]}</Badge>
            {archived && <Badge tone="warning">Archived</Badge>}
          </div>
          <h1 className="mt-2 font-display text-[1.9rem] font-bold leading-[1.1] tracking-tightest text-paper sm:text-[2.4rem]">{planName(plan)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prev && (
            <Button variant="ghost" size="icon" onClick={() => nav({ plan: prev.id })} aria-label={`Previous ${noun}: ${planName(prev)}`} title={planName(prev)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {next && (
            <Button variant="ghost" size="icon" onClick={() => nav({ plan: next.id })} aria-label={`Next ${noun}: ${planName(next)}`} title={planName(next)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEditPlan(plan)} disabled={archived}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDuplicateOpen(true)}>
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          {!plan.parentId && (
            <Button variant="ghost" size="sm" onClick={() => setPlanArchived(plan.id, !plan.archivedAt)}>
              {plan.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {plan.archivedAt ? "Restore" : "Archive"}
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </header>

      {archived && (
        <p className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/[0.06] px-4 py-3 text-[0.8rem] text-paper/80">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {plan.archivedAt
            ? `Archived on ${formatDay(toISODate(new Date(plan.archivedAt)))}. It's kept as history and stays out of your current overview. Restore it to plan in it again.`
            : `Part of an archived plan (${planName(ancestors.find((a) => a.archivedAt) ?? plan)}). It's kept as history.`}
        </p>
      )}
      {twin && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-info/30 bg-info/[0.06] px-4 py-3 text-[0.8rem] text-paper/80">
          <Info className="h-4 w-4 shrink-0 text-info" />
          Another plan also covers {periodLabel(plan)}: “{planName(twin)}”. This can happen when two devices each make one while offline. Nothing was merged
          for you.
          <button type="button" onClick={() => nav({ plan: twin.id })} className="font-semibold text-accent hover:underline">
            Open it
          </button>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="p-5 sm:p-6">
            <Block
              title="What it's for"
              action={
                !archived && (
                  <Button variant="subtle" size="sm" onClick={() => onEditPlan(plan)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )
              }
            >
              {plan.focus || plan.objectives?.length || plan.outcomes ? (
                <div className="space-y-4">
                  {plan.focus && (
                    <div>
                      <p className="eyebrow mb-1">Focus</p>
                      <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-paper">{plan.focus}</p>
                    </div>
                  )}
                  {plan.objectives?.length ? (
                    <div>
                      <p className="eyebrow mb-1.5">Objectives</p>
                      <ol className="space-y-1.5">
                        {plan.objectives.map((o, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-paper/85">
                            <span className="tabular mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[0.65rem] font-bold text-accent">
                              {i + 1}
                            </span>
                            <span className="min-w-0">{o}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {plan.outcomes && (
                    <div>
                      <p className="eyebrow mb-1">Expected outcomes</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/80">{plan.outcomes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[0.8rem] text-paper/60">
                  No focus or objectives yet. A line on what this {noun} is mainly about makes the rest easier to plan.
                </p>
              )}
            </Block>
          </Card>

          {plan.level === "year" && (
            <Card className="p-5 sm:p-6">
              <Block
                title="Month by month"
                hint={`${months.filter((m) => m.plan).length} of ${months.length} months planned. Unplanned months are fine; plan them when you get there.`}
                action={
                  unplannedMonthKeys.length > 0 &&
                  !archived && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() =>
                        addPlans(unplannedMonthKeys.map((month) => ({ ...blankPlan("month", { month }), parentId: plan.id })))
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Add the {unplannedMonthKeys.length} unplanned month{unplannedMonthKeys.length === 1 ? "" : "s"}
                    </Button>
                  )
                }
              >
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {months.map((m) => {
                    const counts = m.plan ? rollupCounts(plans, m.plan, today) : null;
                    const current = m.key === monthKeyOf(today);
                    return (
                      <li key={m.key}>
                        {m.plan ? (
                          <button
                            type="button"
                            onClick={() => nav({ plan: m.plan!.id })}
                            className={cn(
                              "flex h-full w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:border-accent/40",
                              current ? "border-accent/40 bg-accent/[0.06]" : "border-line bg-paper/[0.02]",
                            )}
                          >
                            <span className="flex items-center justify-between gap-2 text-[0.72rem] font-semibold text-paper/70">
                              {monthName(m.key)} {m.key.slice(0, 4)}
                              {current && <span className="text-accent">Now</span>}
                            </span>
                            <span className="line-clamp-2 text-[0.8rem] font-medium text-paper">
                              {m.plan.title?.trim() || m.plan.focus || "No focus yet"}
                            </span>
                            {counts && counts.total > 0 && <ExecutionBar counts={counts} compact />}
                            <span className="text-[0.66rem] text-paper/55">
                              {counts && counts.total ? `${counts.completed} of ${counts.total} done` : "Nothing planned in it yet"}
                              {!m.inThisYear && " · not in this year's plan"}
                            </span>
                          </button>
                        ) : (
                          <div className="flex h-full flex-col gap-1.5 rounded-xl border border-dashed border-paper/20 p-3">
                            <span className="text-[0.72rem] font-semibold text-paper/60">
                              {monthName(m.key)} {m.key.slice(0, 4)}
                            </span>
                            <span className="text-[0.72rem] text-paper/50">Not planned</span>
                            {!archived && (
                              <button
                                type="button"
                                onClick={() => onCreate({ level: "month", month: m.key, parentId: plan.id })}
                                className="mt-auto inline-flex items-center gap-1 text-[0.72rem] font-semibold text-accent hover:underline"
                                aria-label={`Plan ${monthName(m.key)} ${m.key.slice(0, 4)}`}
                              >
                                <Plus className="h-3 w-3" /> Plan {monthName(m.key, true)}
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {months.some((m) => m.plan && !m.inThisYear) && !archived && (
                  <p className="text-[0.72rem] text-paper/60">
                    Some months have a plan that isn&apos;t part of this year. Open one and choose “Part of” to bring it in.
                  </p>
                )}
                {children.filter((c) => c.level === "week").length > 0 && (
                  <div className="pt-2">
                    <p className="eyebrow mb-2">Weeks directly in this year</p>
                    <ul className="space-y-1.5">
                      {children
                        .filter((c) => c.level === "week")
                        .map((w) => (
                          <li key={w.id}>
                            <button type="button" onClick={() => nav({ plan: w.id })} className="text-sm font-medium text-paper hover:text-accent">
                              {planName(w)}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </Block>
            </Card>
          )}

          {plan.level === "month" && (
            <Card className="p-5 sm:p-6">
              <Block
                title="Week by week"
                hint={`${slots.filter((s) => s.plan).length} of ${slots.length} weeks touching ${monthName(monthKeyOf(plan.start))} have a plan.`}
                action={
                  unplannedSlots.length > 0 &&
                  !archived && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => addPlans(unplannedSlots.map((s) => ({ ...blankPlan("week", { start: s.start }), parentId: plan.id })))}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add the {unplannedSlots.length} unplanned week{unplannedSlots.length === 1 ? "" : "s"}
                    </Button>
                  )
                }
              >
                <MonthCalendar plan={plan} plans={plans} weekStart={weekStart} today={today} />
                <ul className="space-y-1.5">
                  {slots.map((s) => {
                    const w = s.plan;
                    const counts = w ? ownCounts(plans, w, today) : null;
                    const elsewhere = w && w.parentId !== plan.id;
                    const wParent = w?.parentId ? plans.find((p) => p.id === w.parentId) : undefined;
                    const crossing = s.home !== monthKeyOf(plan.start);
                    return (
                      <li
                        key={s.start}
                        className={cn(
                          "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5",
                          w ? "border-line bg-paper/[0.02]" : "border-dashed border-paper/20",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-paper">{w ? planName(w) : `Week of ${formatDayShort(s.start)}`}</p>
                          <p className="text-[0.7rem] text-paper/55">
                            <span className="text-paper/70">{periodLabel({ level: "week", start: s.start, end: s.end })}</span>
                            {" · "}
                            {w
                              ? elsewhere
                                ? wParent
                                  ? `In ${planName(wParent)}`
                                  : "On its own, not in this month"
                                : counts && counts.total
                                  ? `${counts.completed} of ${counts.total} done${counts.overdue ? ` · ${counts.overdue} overdue` : ""}`
                                  : "Nothing planned in it yet"
                              : crossing
                                ? `Not planned · mostly in ${monthName(s.home)}`
                                : "Not planned"}
                          </p>
                        </div>
                        {w ? (
                          <Button variant="ghost" size="sm" onClick={() => nav({ plan: w.id })}>
                            Open
                          </Button>
                        ) : (
                          !archived && (
                            <Button
                              variant="subtle"
                              size="sm"
                              onClick={() => onCreate({ level: "week", start: s.start, parentId: plan.id })}
                              aria-label={`Plan the week of ${formatDay(s.start)}`}
                            >
                              <Plus className="h-3.5 w-3.5" /> Plan this week
                            </Button>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Block>
            </Card>
          )}

          {plan.level === "week" && (
            <Card className="p-5 sm:p-6">
              <Block title="Day by day" hint="What's planned for each day, next to what your journal recorded.">
                <WeekStrip plan={plan} journal={journal} today={today} />
              </Block>
            </Card>
          )}

          {showActivities && (
            <Card className="p-5 sm:p-6">
              <Block
                id={`activities-${plan.id}`}
                title={`Activities · ${own.completed} of ${own.total} done`}
                hint={plan.level === "week" ? "What you'll actually do this week." : `Work planned for the ${noun} as a whole${hasChildren ? "; each week has its own list too" : ""}.`}
                action={
                  canCarry &&
                  !archived && (
                    <Button variant="subtle" size="sm" onClick={() => setCarryOpen(true)}>
                      <Forward className="h-3.5 w-3.5" /> Carry unfinished forward
                    </Button>
                  )
                }
              >
                <ItemList plan={plan} kind="activity" today={today} highlightId={highlightItem} onOpen={setItemReq} readOnly={archived} />
              </Block>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <Block
              title={milestonesOf(plan).length ? `Milestones · ${own.milestonesDone} of ${own.milestones} reached` : "Milestones"}
              hint={milestonesOf(plan).length ? undefined : "Checkpoints with a date: “Finish Unit 1 by the 31st”."}
            >
              <ItemList plan={plan} kind="milestone" today={today} highlightId={highlightItem} onOpen={setItemReq} readOnly={archived} />
            </Block>
          </Card>

          {pvr && (
            <Card className="p-5 sm:p-6">
              <Block
                title="Planned and recorded"
                hint={`Planned work from this ${noun}'s activities, next to what your journal recorded on these dates. Neither changes the other.`}
              >
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Days logged" value={pvr.recorded.days} />
                  <Stat label="Hours logged" value={pvr.recorded.hours ? formatHours(pvr.recorded.hours) : "0"} />
                  <Stat label="Topics finished" value={pvr.recorded.topics} />
                </div>
                {pvr.rows.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-line">
                    <table className="w-full text-left text-[0.78rem]">
                      <caption className="sr-only">Planned activities and recorded hours by subject</caption>
                      <thead className="bg-paper/[0.03] text-[0.66rem] uppercase tracking-wider text-paper/60">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Subject
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Planned (done)
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Recorded
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pvr.rows.map((r) => (
                          <tr key={r.subjectId} className="border-t border-line">
                            <td className="px-3 py-2 text-paper/85">{r.name}</td>
                            <td className="tabular px-3 py-2 text-right text-paper/75">{r.planned ? `${r.planned} (${r.done})` : "—"}</td>
                            <td className="tabular px-3 py-2 text-right text-paper/75">{r.hours ? formatHours(r.hours) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[0.75rem] text-paper/60">
                    Give activities a subject to see them next to the hours your journal recorded for it.
                  </p>
                )}
                {pvr.recorded.entries.length > 0 && (
                  <p className="text-[0.72rem] text-paper/60">
                    Journal days:{" "}
                    {pvr.recorded.entries.slice(-10).map((e, i) => (
                      <span key={e.date}>
                        {i > 0 && ", "}
                        <Link href={`/journal/${e.date}`} className="font-semibold text-accent hover:underline">
                          {formatDayShort(e.date)}
                        </Link>
                      </span>
                    ))}
                    {pvr.recorded.entries.length > 10 && ` and ${pvr.recorded.entries.length - 10} more`}
                  </p>
                )}
              </Block>
            </Card>
          )}

          {!archived && (
            <Card className="p-5 sm:p-6">
              <PlanReviewBlock plan={plan} today={today} onCarry={() => setCarryOpen(true)} onPlanNext={planNext} />
            </Card>
          )}
          {archived && plan.review && (
            <Card className="p-5 sm:p-6">
              <Block title="Review">
                <div className="grid gap-3 text-sm text-paper/80 sm:grid-cols-3">
                  {(["wentWell", "improve", "nextPriorities"] as const).map((k) => (
                    <div key={k}>
                      <p className="eyebrow mb-1">{k === "wentWell" ? "Went well" : k === "improve" ? "To improve" : "Next"}</p>
                      <p className="whitespace-pre-wrap">{plan.review?.[k] || "—"}</p>
                    </div>
                  ))}
                </div>
              </Block>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <Block title="Progress" hint="Planned work only. Goals measure their own progress.">
              <ExecutionBar
                counts={hasChildren ? roll : own}
                label={hasChildren ? (plan.level === "year" ? "Planned work done, with its months and weeks" : "Planned work done, with its weeks") : "Planned work done"}
              />
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Completed" value={(hasChildren ? roll : own).completed} tone="positive" />
                <Stat label="In progress" value={(hasChildren ? roll : own).inProgress} />
                <Stat label="Not started" value={(hasChildren ? roll : own).notStarted} />
                <Stat label="Overdue" value={(hasChildren ? roll : own).overdue} tone={(hasChildren ? roll : own).overdue ? "danger" : undefined} />
              </div>
              {(hasChildren ? roll : own).deferred > 0 && (
                <p className="text-[0.72rem] text-paper/60">
                  {(hasChildren ? roll : own).deferred} deferred
                  {(hasChildren ? roll : own).carried ? `, ${(hasChildren ? roll : own).carried} of them carried forward` : ""}. They count as not done here.
                </p>
              )}
              {hasChildren && own.total > 0 && (
                <p className="text-[0.72rem] text-paper/60">
                  In this {noun}&apos;s own list: {own.completed} of {own.total} done.
                </p>
              )}
              {(hasChildren ? roll : own).milestones > 0 && (
                <p className="flex items-center gap-1.5 text-[0.75rem] text-paper/75">
                  <Flag className="h-3.5 w-3.5 text-accent" /> {(hasChildren ? roll : own).milestonesDone} of {(hasChildren ? roll : own).milestones} milestones
                  reached
                  {(hasChildren ? roll : own).milestonesOverdue ? ` · ${(hasChildren ? roll : own).milestonesOverdue} overdue` : ""}
                </p>
              )}
              <div className="border-t border-line pt-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.72rem]">
                  <span className="font-semibold text-paper/70">Time gone</span>
                  <span className="tabular text-paper/60">
                    {timing.state === "upcoming" ? `Starts ${formatDay(plan.start)}` : timing.state === "ended" ? `Ended ${formatDay(plan.end)}` : `${timing.daysLeft} day${timing.daysLeft === 1 ? "" : "s"} left`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-paper/10" aria-hidden>
                  <div className="h-full rounded-full bg-paper/40" style={{ width: `${timing.elapsedPct}%` }} />
                </div>
              </div>
            </Block>
          </Card>

          <Card className="p-5">
            <Block
              title="Goals it works towards"
              hint="Their progress comes from Goals and is never changed by this plan."
              action={
                !archived && (
                  <Button variant="subtle" size="sm" onClick={() => onEditPlan(plan)}>
                    {linkedGoals.length ? "Change" : "Link goals"}
                  </Button>
                )
              }
            >
              {linkedGoals.length === 0 && viaItems.length === 0 ? (
                <p className="text-[0.78rem] text-paper/60">No goals linked.</p>
              ) : (
                <ul className="space-y-2">
                  {[...linkedGoals, ...viaItems].map((g) => {
                    const p = computeGoalProgress(g, goalData, today);
                    const mine = plannedFor(g.id);
                    return (
                      <li key={g.id} className="rounded-xl border border-line bg-paper/[0.02] p-3">
                        <Link
                          href={`/goals?goal=${encodeURIComponent(g.id)}`}
                          className="flex items-start gap-2 text-sm font-semibold text-paper hover:text-accent"
                        >
                          <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">{g.title}</span>
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/45" />
                        </Link>
                        <dl className="mt-2 space-y-1 text-[0.72rem]">
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-paper/60">Goal achievement (from Goals)</dt>
                            <dd className="tabular font-semibold text-paper">
                              {g.status === "Completed" ? "Completed" : p.pct == null ? healthLabel(p.health) : `${p.pct}%`}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-paper/60">Planned for it here</dt>
                            <dd className="tabular text-paper/80">{mine.total ? `${mine.done} of ${mine.total} done` : "No activities yet"}</dd>
                          </div>
                        </dl>
                        {!(plan.goalIds ?? []).includes(g.id) && <p className="mt-1.5 text-[0.66rem] text-paper/50">Linked through an activity.</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Block>
          </Card>

          <Card className="p-5">
            <Block title="Where it sits">
              <div className="space-y-2 text-[0.8rem] text-paper/80">
                {parent ? (
                  <p className="flex flex-wrap items-center gap-1.5">
                    Part of
                    <button type="button" onClick={() => nav({ plan: parent.id })} className="font-semibold text-accent hover:underline">
                      {planName(parent)}
                    </button>
                    {!archived && (
                      <button type="button" onClick={() => setPlanParent([plan.id], undefined)} className="text-[0.72rem] text-paper/55 underline hover:text-paper">
                        take it out
                      </button>
                    )}
                  </p>
                ) : plan.level === "year" ? (
                  <p>A yearly plan sits at the top.</p>
                ) : (
                  <p className="flex flex-wrap items-center gap-1.5">
                    On its own.
                    {offerParentPlan && (
                      <button type="button" onClick={() => setPlanParent([plan.id], offerParentPlan.id)} className="font-semibold text-accent hover:underline">
                        Add it to {planName(offerParentPlan)}
                      </button>
                    )}
                  </p>
                )}
                {plan.level !== "week" && <p>{containsText(children, subtree.size - 1, plan.level)}</p>}
                {plan.level === "week" && !next && !archived && (
                  <button type="button" onClick={planNext} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Plan the week after
                  </button>
                )}
              </div>
            </Block>
          </Card>

          {plan.level === "month" && dueThisMonth.length > 0 && (
            <Card className="p-5">
              <Block title="Dates this month" hint="From this month and the weeks in it.">
                <ul className="space-y-1.5">
                  {dueThisMonth.slice(0, 12).map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-[0.78rem]">
                      <span className={cn("tabular w-12 shrink-0 font-semibold", d.done ? "text-positive" : d.date < today ? "text-danger" : "text-paper/70")}>
                        {formatDayShort(d.date)}
                      </span>
                      {d.milestone && <Flag className="h-3 w-3 shrink-0 text-accent" aria-label="Milestone" />}
                      <button
                        type="button"
                        onClick={() => nav({ plan: d.plan.id, item: d.id })}
                        className={cn("min-w-0 flex-1 truncate text-left text-paper/85 hover:text-accent", d.done && "line-through decoration-paper/40")}
                      >
                        {d.title}
                      </button>
                    </li>
                  ))}
                </ul>
                {dueThisMonth.length > 12 && <p className="text-[0.7rem] text-paper/55">and {dueThisMonth.length - 12} more</p>}
              </Block>
            </Card>
          )}

          {plan.notes && (
            <Card className="p-5">
              <Block title="Notes">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/80">{plan.notes}</p>
              </Block>
            </Card>
          )}

          <p className="flex items-center gap-1.5 px-1 text-[0.68rem] text-paper/45">
            <Icon className="h-3 w-3" /> Updated {formatDay(toISODate(new Date(plan.updatedAt)))}
          </p>
        </div>
      </div>

      <ItemForm request={itemReq} onClose={() => setItemReq(null)} />
      <CarryDialog plan={plan} open={carryOpen} onClose={() => setCarryOpen(false)} />
      <DeletePlanDialog
        plan={plan}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          nav(parent ? { plan: parent.id } : { tab: plan.level === "year" ? "years" : plan.level === "month" ? "months" : "weeks" }, { replace: true });
        }}
      />
      <DuplicatePlanDialog
        plan={plan}
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        onDone={(id) => {
          setDuplicateOpen(false);
          nav({ plan: id });
        }}
      />
    </div>
  );
}
