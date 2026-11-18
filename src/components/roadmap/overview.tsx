"use client";

import { useMemo } from "react";
import { ArrowRight, Flag, Info, Plus, TriangleAlert } from "lucide-react";
import type { PlanLevel, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  activePlans,
  addDays,
  currentPlans,
  formatDayShort,
  isArchived,
  monthKeyOf,
  monthLabel,
  monthName,
  monthsBetween,
  overdueItems,
  ownCounts,
  periodClashes,
  periodLabel,
  planContext,
  planName,
  recentlyUpdated,
  rollupCounts,
  unplannedMonths,
  unplannedWeeks,
  upcomingMilestones,
  weekStartOf,
  yearRange,
} from "@/lib/roadmap";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanFormRequest } from "./plan-form";
import { Block, ExecutionBar, LEVEL_ICON, useRoadmapNav, useToday, useWeekStart } from "./shared";

const LEVEL_INTRO: Record<PlanLevel, { title: string; body: string; cta: string }> = {
  year: {
    title: "Yearly plan",
    body: "Your strategy: the year's focus, a few objectives, the milestones that matter, and the goals it serves.",
    cta: "Create a yearly plan",
  },
  month: {
    title: "Monthly plan",
    body: "A month's focus, its milestones and deadlines, and the weeks it breaks into. Inside a year or on its own.",
    cta: "Create a monthly plan",
  },
  week: {
    title: "Weekly plan",
    body: "Where planning turns into doing: activities with priorities and dates, ticked off as you go, reviewed at the end.",
    cta: "Create a weekly plan",
  },
};

/** The first screen of an empty Roadmap: what the three levels are for. */
export function RoadmapIntro({ onCreate }: { onCreate: (req: PlanFormRequest) => void }) {
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <p className="max-w-2xl text-sm leading-relaxed text-paper/80">
          Your roadmap starts empty. Nothing is planned for you: you decide how to divide your year, your months and your weeks. Use one level or all
          three; a week can sit inside a month, and a month inside a year, but none of them has to.
        </p>
      </Card>
      <ol className="grid gap-3 md:grid-cols-3">
        {(["year", "month", "week"] as const).map((lv, i) => {
          const Icon = LEVEL_ICON[lv];
          const intro = LEVEL_INTRO[lv];
          return (
            <li key={lv}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <span className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-paper/55">Level {i + 1}</span>
                </span>
                <h2 className="font-display text-lg font-semibold tracking-snugg text-paper">{intro.title}</h2>
                <p className="flex-1 text-[0.82rem] leading-relaxed text-paper/70">{intro.body}</p>
                <Button variant={lv === "week" ? "primary" : "ghost"} onClick={() => onCreate({ level: lv })} className="self-start">
                  <Plus className="h-4 w-4" /> {intro.cta}
                </Button>
              </Card>
            </li>
          );
        })}
      </ol>
      <p className="px-1 text-[0.75rem] text-paper/60">
        Goals stay where they are: link them to a plan to see them alongside it. Your journal stays the record of what you did; link a day to an
        activity when it&apos;s the work you planned.
      </p>
    </div>
  );
}

/** A plan in a list: what it is, where it sits and how its planned work is going. */
export function PlanCard({ plan, plans, today, extra }: { plan: RoadmapPlan; plans: RoadmapPlan[]; today: string; extra?: React.ReactNode }) {
  const nav = useRoadmapNav();
  const Icon = LEVEL_ICON[plan.level];
  const counts = plan.level === "week" ? ownCounts(plans, plan, today) : rollupCounts(plans, plan, today);
  const parent = plan.parentId ? plans.find((p) => p.id === plan.parentId) : undefined;
  const current = plan.start <= today && today <= plan.end;
  return (
    <button
      type="button"
      onClick={() => nav({ plan: plan.id })}
      className={cn(
        "group flex h-full w-full flex-col gap-2 rounded-2xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-lift",
        current ? "border-accent/35" : "border-line",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold text-paper/65">{periodLabel(plan)}</span>
        {current && <Badge tone="solid">Now</Badge>}
        {isArchived(plans, plan) && <Badge tone="warning">Archived</Badge>}
      </span>
      <span className="font-display text-[1.02rem] font-semibold leading-snug tracking-snugg text-paper group-hover:text-accent">{planName(plan)}</span>
      {plan.focus && <span className="line-clamp-2 text-[0.78rem] leading-relaxed text-paper/70">{plan.focus}</span>}
      <span className="mt-auto w-full space-y-1.5 pt-1">
        <ExecutionBar counts={counts} compact />
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-paper/60">
          <span>{counts.total ? `${counts.completed} of ${counts.total} done` : "Nothing planned yet"}</span>
          {counts.overdue > 0 && <span className="font-semibold text-danger">{counts.overdue} overdue</span>}
          {counts.milestones > 0 && (
            <span className="inline-flex items-center gap-1">
              <Flag className="h-3 w-3" /> {counts.milestonesDone}/{counts.milestones}
            </span>
          )}
          <span>{parent ? `In ${planName(parent)}` : plan.level === "year" ? "" : "On its own"}</span>
          {extra}
        </span>
      </span>
    </button>
  );
}

function NowCard({
  level,
  plan,
  plans,
  today,
  missingLabel,
  onPlan,
}: {
  level: PlanLevel;
  plan?: RoadmapPlan;
  plans: RoadmapPlan[];
  today: string;
  missingLabel: string;
  onPlan: () => void;
}) {
  const Icon = LEVEL_ICON[level];
  const label = level === "year" ? "This year" : level === "month" ? "This month" : "This week";
  if (plan) return <PlanCard plan={plan} plans={plans} today={today} />;
  return (
    <div className="flex h-full flex-col gap-2 rounded-2xl border border-dashed border-paper/20 p-4">
      <span className="flex items-center gap-2 text-[0.72rem] font-semibold text-paper/60">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="text-sm text-paper/70">{missingLabel} has no plan.</span>
      <Button variant="subtle" size="sm" onClick={onPlan} className="mt-auto self-start">
        <Plus className="h-3.5 w-3.5" /> Plan {level === "year" ? "the year" : level === "month" ? "the month" : "the week"}
      </Button>
    </div>
  );
}

/** Today's place in the roadmap, what's coming and what's missing. */
export function RoadmapOverview({ onCreate, onFind }: { onCreate: (req: PlanFormRequest) => void; onFind: (overdue: boolean) => void }) {
  const plans = useChronicle((s) => s.plans);
  const today = useToday();
  const weekStart = useWeekStart();
  const nav = useRoadmapNav();
  const live = useMemo(() => activePlans(plans), [plans]);
  const now = useMemo(() => currentPlans(plans, today), [plans, today]);
  const milestones = useMemo(() => upcomingMilestones(plans, today, 60), [plans, today]);
  const overdue = useMemo(() => overdueItems(plans, today), [plans, today]);
  const recent = useMemo(() => recentlyUpdated(live, 5), [live]);
  const clashes = useMemo(() => periodClashes(plans), [plans]);
  const thisMonth = monthKeyOf(today);
  const thisWeek = weekStartOf(today, weekStart);
  const yearSpan = now.year ? { start: now.year.start, end: now.year.end } : yearRange(Number(today.slice(0, 4)));
  const monthsAhead = useMemo(
    () => unplannedMonths(plans, yearSpan.start, yearSpan.end).filter((k) => k >= thisMonth),
    [plans, yearSpan.start, yearSpan.end, thisMonth],
  );
  const weeksAhead = useMemo(() => unplannedWeeks(plans, thisMonth, weekStart).filter((s) => s >= thisWeek), [plans, thisMonth, weekStart, thisWeek]);
  const monthsInSpan = monthsBetween(yearSpan.start, yearSpan.end).length;
  const weekCounts = now.week ? ownCounts(plans, now.week, today) : null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="now-title" className="space-y-3">
        <h2 id="now-title" className="font-display text-lg font-semibold tracking-snugg text-paper">
          Now
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <NowCard
            level="year"
            plan={now.year}
            plans={plans}
            today={today}
            missingLabel={today.slice(0, 4)}
            onPlan={() => onCreate({ level: "year", year: Number(today.slice(0, 4)) })}
          />
          <NowCard
            level="month"
            plan={now.month}
            plans={plans}
            today={today}
            missingLabel={monthLabel(thisMonth)}
            onPlan={() => onCreate({ level: "month", month: thisMonth })}
          />
          <NowCard
            level="week"
            plan={now.week}
            plans={plans}
            today={today}
            missingLabel={`The week of ${formatDayShort(thisWeek)}`}
            onPlan={() => onCreate({ level: "week", start: thisWeek })}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-paper/60">This week</p>
          <p className="tabular mt-1 font-display text-2xl font-bold text-paper">{weekCounts?.total ? `${weekCounts.pct}%` : "—"}</p>
          <p className="text-[0.7rem] text-paper/60">{weekCounts?.total ? `${weekCounts.completed} of ${weekCounts.total} activities done` : "no activities planned"}</p>
        </Card>
        <button type="button" onClick={() => onFind(true)} className="rounded-2xl text-left" disabled={!overdue.length}>
          <Card className={cn("h-full p-4", overdue.length && "transition-colors hover:border-danger/40")}>
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-paper/60">Overdue</p>
            <p className={cn("tabular mt-1 font-display text-2xl font-bold", overdue.length ? "text-danger" : "text-paper")}>{overdue.length}</p>
            <p className="text-[0.7rem] text-paper/60">{overdue.length ? "open past their date · show them" : "nothing slipping"}</p>
          </Card>
        </button>
        <Card className="p-4">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-paper/60">Milestones ahead</p>
          <p className="tabular mt-1 font-display text-2xl font-bold text-paper">{milestones.length}</p>
          <p className="text-[0.7rem] text-paper/60">in the next 60 days</p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-paper/60">Months planned</p>
          <p className="tabular mt-1 font-display text-2xl font-bold text-paper">
            {monthsInSpan - unplannedMonths(plans, yearSpan.start, yearSpan.end).length}
            <span className="text-base text-paper/55"> / {monthsInSpan}</span>
          </p>
          <p className="text-[0.7rem] text-paper/60">{now.year ? `in ${planName(now.year)}` : `in ${today.slice(0, 4)}`}</p>
        </Card>
      </div>

      {clashes.length > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-info/30 bg-info/[0.06] px-4 py-3 text-[0.8rem] text-paper/80">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span>
            {clashes.map((g) => periodLabel(g[0])).join(", ")} {clashes.length === 1 ? "has" : "have"} more than one plan, probably made on two devices
            while offline. Both are kept; open them to tidy up.{" "}
            {clashes.flat().map((p, i) => (
              <span key={p.id}>
                {i > 0 && " · "}
                <button type="button" className="font-semibold text-accent hover:underline" onClick={() => nav({ plan: p.id })}>
                  {planName(p)}
                </button>
              </span>
            ))}
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Block title="Milestones ahead" hint="The next 60 days, across your plans.">
            {milestones.length === 0 ? (
              <p className="text-[0.78rem] text-paper/60">No dated milestones coming up. Add them to a year or month plan.</p>
            ) : (
              <ol className="space-y-2">
                {milestones.slice(0, 8).map((m) => (
                  <li key={m.item.id} className="flex items-start gap-3">
                    <span className="tabular w-14 shrink-0 pt-0.5 text-[0.72rem] font-semibold text-paper/70">{formatDayShort(m.date)}</span>
                    <button type="button" onClick={() => nav({ plan: m.plan.id, item: m.item.id })} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-paper hover:text-accent">
                        <Flag className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate">{m.item.title}</span>
                      </span>
                      <span className="block truncate text-[0.68rem] text-paper/55">{planName(m.plan)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {overdue.some((o) => o.item.kind === "milestone") && (
              <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-danger">
                <TriangleAlert className="h-3.5 w-3.5" /> {overdue.filter((o) => o.item.kind === "milestone").length} milestone
                {overdue.filter((o) => o.item.kind === "milestone").length === 1 ? " is" : "s are"} past their date.
              </p>
            )}
          </Block>
        </Card>

        <Card className="p-5">
          <Block title="Not planned yet" hint="Coming up and still open. Leaving a period unplanned is fine.">
            {monthsAhead.length === 0 && weeksAhead.length === 0 ? (
              <p className="text-[0.78rem] text-paper/60">Every month left in the year and every week left this month has a plan.</p>
            ) : (
              <div className="space-y-3">
                {weeksAhead.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">Weeks this month</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeksAhead.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onCreate({ level: "week", start: s })}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-paper/25 px-3 py-1 text-[0.72rem] font-semibold text-paper/75 hover:border-accent/40 hover:text-accent"
                          aria-label={`Plan the week of ${formatDayShort(s)}`}
                        >
                          <Plus className="h-3 w-3" /> {formatDayShort(s)} – {formatDayShort(addDays(s, 6))}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {monthsAhead.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">Months {now.year ? `in ${planName(now.year)}` : `left in ${today.slice(0, 4)}`}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {monthsAhead.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => onCreate({ level: "month", month: k, ...(now.year ? { parentId: now.year.id } : {}) })}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-paper/25 px-3 py-1 text-[0.72rem] font-semibold text-paper/75 hover:border-accent/40 hover:text-accent"
                          aria-label={`Plan ${monthLabel(k)}`}
                        >
                          <Plus className="h-3 w-3" /> {monthName(k, true)} {k.slice(2, 4) !== today.slice(2, 4) ? k.slice(0, 4) : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Block>
        </Card>
      </div>

      <Card className="p-5">
        <Block title="Recently updated">
          <ul className="divide-y divide-line">
            {recent.map((p) => {
              const Icon = LEVEL_ICON[p.level];
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => nav({ plan: p.id })} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <Icon className="h-4 w-4 shrink-0 text-paper/55" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-paper hover:text-accent">{planName(p)}</span>
                      <span className="block truncate text-[0.68rem] text-paper/55">{planContext(p)}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-paper/40" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Block>
      </Card>
    </div>
  );
}
