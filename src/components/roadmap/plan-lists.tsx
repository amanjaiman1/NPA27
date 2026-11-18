"use client";

import { useMemo, useState } from "react";
import { Archive, Plus } from "lucide-react";
import type { PlanLevel, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  isArchived,
  monthKeyOf,
  monthLabel,
  monthsBetween,
  plansById,
  weekHomeMonth,
} from "@/lib/roadmap";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import type { PlanFormRequest } from "./plan-form";
import { PlanCard } from "./overview";
import { LEVEL_ICON, newestFirst, useToday } from "./shared";

const PAGE = 12;

const COPY: Record<PlanLevel, { title: string; empty: string; emptyHint: string; cta: string }> = {
  year: {
    title: "Yearly plans",
    empty: "No yearly plans yet",
    emptyHint: "A year plan holds your strategy: its focus, objectives, milestones and the months under it.",
    cta: "New yearly plan",
  },
  month: {
    title: "Monthly plans",
    empty: "No monthly plans yet",
    emptyHint: "Plan a month on its own, or inside a year plan.",
    cta: "New monthly plan",
  },
  week: {
    title: "Weekly plans",
    empty: "No weekly plans yet",
    emptyHint: "The week is where plans become activities you tick off.",
    cta: "New weekly plan",
  },
};

/**
 * Every plan of one level, newest first, grouped by year or month. Archived
 * plans are kept out of the way until asked for, and long lists show a page
 * at a time.
 */
export function PlanList({ level, onCreate }: { level: PlanLevel; onCreate: (req: PlanFormRequest) => void }) {
  const plans = useChronicle((s) => s.plans);
  const today = useToday();
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const copy = COPY[level];
  const Icon = LEVEL_ICON[level];

  const ofLevel = useMemo(() => plans.filter((p) => p.level === level), [plans, level]);
  const archivedCount = useMemo(() => ofLevel.filter((p) => isArchived(plans, p)).length, [ofLevel, plans]);
  const visible = useMemo(() => newestFirst(ofLevel.filter((p) => showArchived || !isArchived(plans, p))), [ofLevel, plans, showArchived]);

  /* A month list filters by year; a week list by the month most of the week is in. */
  const groupOf = (p: RoadmapPlan) => (level === "week" ? weekHomeMonth(p.start) : level === "month" ? p.start.slice(0, 4) : "all");
  const groupLabel = (g: string) => (level === "week" ? monthLabel(g) : g);
  const groups = useMemo(() => {
    const keys = [...new Set(visible.map(groupOf))];
    return keys.sort((a, b) => b.localeCompare(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, level]);
  const filtered = filter === "all" ? visible : visible.filter((p) => groupOf(p) === filter);
  const page = filtered.slice(0, shown);
  const map = plansById(plans);

  return (
    <section aria-labelledby={`${level}-list-title`} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${level}-list-title`} className="mr-auto flex items-center gap-2 font-display text-lg font-semibold tracking-snugg text-paper">
          <Icon className="h-4 w-4 text-accent" /> {copy.title}
          <span className="text-sm font-normal text-paper/55">{visible.length}</span>
        </h2>
        {level !== "year" && groups.length > 1 && (
          <Select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setShown(PAGE);
            }}
            aria-label={level === "week" ? "Show weeks of" : "Show months of"}
            className="w-auto py-2 text-[0.8rem]"
          >
            <option value="all">{level === "week" ? "All months" : "All years"}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {groupLabel(g)}
              </option>
            ))}
          </Select>
        )}
        {archivedCount > 0 && (
          <Button variant={showArchived ? "outline" : "subtle"} size="sm" onClick={() => setShowArchived((s) => !s)} aria-pressed={showArchived}>
            <Archive className="h-3.5 w-3.5" /> {showArchived ? "Hide" : "Show"} archived · {archivedCount}
          </Button>
        )}
        <Button size="sm" onClick={() => onCreate({ level })}>
          <Plus className="h-3.5 w-3.5" /> {copy.cta}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Icon className="h-5 w-5" />}
          title={copy.empty}
          description={copy.emptyHint}
          action={
            <Button onClick={() => onCreate({ level })}>
              <Plus className="h-4 w-4" /> {copy.cta}
            </Button>
          }
        />
      ) : level === "year" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {page.map((p) => {
            const months = monthsBetween(p.start, p.end).length;
            const planned = plans.filter((m) => m.level === "month" && m.parentId === p.id).length;
            return <PlanCard key={p.id} plan={p} plans={plans} today={today} extra={<span>{planned} of {months} months planned</span>} />;
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {(filter === "all" ? groups : [filter]).map((g) => {
            const inGroup = page.filter((p) => groupOf(p) === g);
            if (!inGroup.length) return null;
            return (
              <div key={g}>
                <p className="eyebrow mb-2">{groupLabel(g)}</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {inGroup.map((p) => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      plans={plans}
                      today={today}
                      extra={
                        level === "month" ? (
                          <span>
                            {plans.filter((w) => w.parentId === p.id).length} weekly plan{plans.filter((w) => w.parentId === p.id).length === 1 ? "" : "s"}
                          </span>
                        ) : p.parentId && map.get(p.parentId)?.level === "month" && monthKeyOf(map.get(p.parentId)!.start) !== weekHomeMonth(p.start) ? (
                          <span>crosses into {monthLabel(weekHomeMonth(p.start), true)}</span>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length > shown && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown)} more of {filtered.length - shown}
          </Button>
        </div>
      )}
    </section>
  );
}
