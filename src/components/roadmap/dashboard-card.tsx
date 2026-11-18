"use client";

import Link from "next/link";
import { ArrowRight, Plus, Route } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { activePlans, activitiesOf, currentPlans, formatDayShort, isOverdue, ownCounts, planName, weekStartOf } from "@/lib/roadmap";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ExecutionBar, roadmapHref, useToday, useWeekStart } from "./shared";

/**
 * This week's plan on the dashboard, for people who use the Roadmap. With no
 * plans at all it shows nothing: the Roadmap never nags.
 */
export function RoadmapWeekCard() {
  const plans = useChronicle((s) => s.plans);
  const today = useToday();
  const weekStart = useWeekStart();
  if (activePlans(plans).length === 0) return null;
  const { week } = currentPlans(plans, today);
  const counts = week ? ownCounts(plans, week, today) : null;
  const open = week
    ? activitiesOf(week)
        .filter((i) => i.status === "notStarted" || i.status === "inProgress")
        .slice(0, 3)
    : [];

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-paper">
          <Route className="h-4 w-4 text-accent" /> This week&apos;s plan
        </h3>
        <Link href="/roadmap" className="inline-flex items-center gap-1 text-xs text-paper/60 transition-colors hover:text-paper">
          Roadmap <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {week && counts ? (
        <div className="space-y-3">
          <div>
            <Link href={roadmapHref({ plan: week.id })} className="text-sm font-semibold text-paper hover:text-accent">
              {planName(week)}
            </Link>
            {week.focus && <p className="mt-0.5 line-clamp-2 text-xs text-paper/65">{week.focus}</p>}
          </div>
          <ExecutionBar counts={counts} />
          {open.length > 0 && (
            <ul className="space-y-1.5">
              {open.map((it) => (
                <li key={it.id} className="flex items-start gap-2 text-xs text-paper/75">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 flex-1">{it.title}</span>
                  {it.targetDate && (
                    <span className={cn("shrink-0", isOverdue(it, week, today) ? "font-semibold text-danger" : "text-paper/55")}>{formatDayShort(it.targetDate)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {counts.overdue > 0 && <p className="text-[0.72rem] font-semibold text-danger">{counts.overdue} overdue</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-paper/70">No plan for this week yet.</p>
          <Link
            href={`/roadmap?new=week&start=${weekStartOf(today, weekStart)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-paper/80 hover:border-accent/40 hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Plan this week
          </Link>
        </div>
      )}
    </Card>
  );
}
