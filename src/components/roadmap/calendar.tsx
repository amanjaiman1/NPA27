"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import type { ISODate, JournalEntry, PlanItem, RoadmapPlan } from "@/lib/types";
import {
  WEEKDAY_NAMES,
  addDays,
  daysOf,
  descendantIds,
  formatDay,
  monthKeyOf,
  weekPlanFor,
  weeksOfMonth,
} from "@/lib/roadmap";
import { cn, formatHours } from "@/lib/utils";

function itemsByDate(plans: RoadmapPlan[], ids: Set<string>): Map<ISODate, PlanItem[]> {
  const out = new Map<ISODate, PlanItem[]>();
  for (const p of plans) {
    if (!ids.has(p.id)) continue;
    for (const it of p.items ?? []) {
      if (!it.targetDate) continue;
      out.set(it.targetDate, [...(out.get(it.targetDate) ?? []), it]);
    }
  }
  return out;
}

/**
 * The month at a glance: what's due on which day (from this plan and the
 * weeks under it), and which weeks have a plan. A picture of the plan, not
 * a place to edit it; the weeks list below does that.
 */
export function MonthCalendar({
  plan,
  plans,
  weekStart,
  today,
}: {
  plan: RoadmapPlan;
  plans: RoadmapPlan[];
  weekStart: number;
  today: ISODate;
}) {
  const key = monthKeyOf(plan.start);
  const ids = useMemo(() => new Set([plan.id, ...descendantIds(plans, plan.id)]), [plans, plan.id]);
  const due = useMemo(() => itemsByDate(plans, ids), [plans, ids]);
  const rows = weeksOfMonth(key, weekStart);
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(weekStart + i) % 7].slice(0, 3));

  return (
    <div className="overflow-hidden rounded-2xl border border-line" role="img" aria-label={`Calendar of ${formatDay(plan.start)} to ${formatDay(plan.end)} with due dates and planned weeks`}>
      <div className="grid grid-cols-7 border-b border-line bg-paper/[0.03] text-center text-[0.62rem] font-semibold uppercase tracking-wider text-paper/55">
        {heads.map((h) => (
          <div key={h} className="py-1.5">
            {h}
          </div>
        ))}
      </div>
      {rows.map((start) => {
        const planned = weekPlanFor(plans, start);
        return (
          <div key={start} className={cn("grid grid-cols-7 border-b border-line last:border-b-0", planned && "bg-accent/[0.05]")}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(start, i);
              const inMonth = monthKeyOf(d) === key;
              const list = inMonth ? (due.get(d) ?? []) : [];
              const acts = list.filter((x) => x.kind === "activity");
              const miles = list.filter((x) => x.kind === "milestone");
              const left = acts.filter((x) => x.status !== "completed").length;
              return (
                <div
                  key={d}
                  className={cn(
                    "min-h-[3.25rem] border-r border-line p-1 text-[0.68rem] last:border-r-0 sm:min-h-[3.75rem] sm:p-1.5",
                    !inMonth && "text-paper/30",
                  )}
                >
                  <span
                    className={cn(
                      "tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1 font-semibold",
                      d === today ? "bg-accent text-accent-fg" : inMonth ? "text-paper/80" : "text-paper/35",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {inMonth && (acts.length > 0 || miles.length > 0) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 leading-none">
                      {miles.length > 0 && <Flag className="h-3 w-3 text-accent" aria-hidden />}
                      {acts.length > 0 && (
                        <span className={cn("tabular", left ? "text-paper/70" : "text-positive")}>
                          {left ? `${left} due` : "done"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A week day by day: what was planned for each day next to what the journal
 * recorded on it. Planned and recorded stay separate; the strip only puts
 * them side by side.
 */
export function WeekStrip({
  plan,
  journal,
  today,
}: {
  plan: RoadmapPlan;
  journal: JournalEntry[];
  today: ISODate;
}) {
  const days = daysOf(plan);
  const byDate = useMemo(() => new Map(journal.map((e) => [e.date, e] as const)), [journal]);
  const due = useMemo(() => {
    const out = new Map<ISODate, PlanItem[]>();
    for (const it of plan.items ?? []) if (it.targetDate) out.set(it.targetDate, [...(out.get(it.targetDate) ?? []), it]);
    return out;
  }, [plan.items]);
  const undated = (plan.items ?? []).filter((i) => i.kind === "activity" && !i.targetDate).length;

  return (
    <div>
      <div>
        {/* Seven across when there's room; on a narrow screen the days wrap onto a second row. */}
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(4.25rem,1fr))] gap-1.5">
          {days.map((d) => {
            const list = due.get(d) ?? [];
            const acts = list.filter((i) => i.kind === "activity");
            const doneCount = acts.filter((i) => i.status === "completed").length;
            const entry = d <= today ? byDate.get(d) : undefined;
            return (
              <li
                key={d}
                className={cn(
                  "rounded-xl border p-2 text-[0.68rem]",
                  d === today ? "border-accent/45 bg-accent/[0.07]" : "border-line bg-paper/[0.02]",
                )}
              >
                <p className="font-semibold text-paper/80">
                  {WEEKDAY_NAMES[new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8))).getDay()].slice(0, 3)}{" "}
                  <span className="tabular text-paper/60">{Number(d.slice(8))}</span>
                </p>
                <p className="mt-1.5 text-paper/70">
                  {acts.length ? (
                    <>
                      <span className="tabular">{acts.length}</span> planned
                      {doneCount > 0 && <span className="text-positive"> · {doneCount} done</span>}
                    </>
                  ) : (
                    <span className="text-paper/50">Nothing dated</span>
                  )}
                </p>
                {list.some((i) => i.kind === "milestone") && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-accent">
                    <Flag className="h-3 w-3" /> Milestone
                  </p>
                )}
                <p className="mt-1 border-t border-line pt-1 text-paper/60">
                  {entry ? (
                    <Link href={`/journal/${d}`} className="font-semibold text-accent hover:underline">
                      {entry.totalHours > 0 ? `${formatHours(entry.totalHours)} logged` : "Journal entry"}
                    </Link>
                  ) : d <= today ? (
                    <span className="text-paper/50">Not logged</span>
                  ) : (
                    <span className="text-paper/40">Still to come</span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
      {undated > 0 && (
        <p className="mt-2 text-[0.7rem] text-paper/55">
          {undated} activit{undated === 1 ? "y has" : "ies have"} no date, so {undated === 1 ? "it isn't" : "they aren't"} on a day above.
        </p>
      )}
    </div>
  );
}
