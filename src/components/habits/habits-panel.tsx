"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { summarizeToday, todayHabits } from "@/lib/habit-engine";
import { Panel, PanelLink } from "@/components/ui/panel";
import { RadialProgress } from "@/components/ui/progress";
import { TodayRow, useHabitContext } from "./habit-ui";

const SHOWN = 5;

/**
 * The dashboard's habits: today's due habits with how far each has got, the
 * actual amounts and where they came from. Connected habits update as you
 * record; only the ones you check off have a button.
 */
export function HabitsPanel({ className }: { className?: string }) {
  const habits = useChronicle((s) => s.habits);
  const ctx = useHabitContext();
  const list = useMemo(() => {
    // Open ones first, so what's left to do is on top.
    const all = todayHabits(habits, ctx);
    return [...all].sort((a, b) => Number(a.done) - Number(b.done) || b.progress - a.progress);
  }, [habits, ctx]);
  const summary = summarizeToday(list);
  const hasHabits = habits.some((h) => !h.archived);

  return (
    <Panel
      className={className}
      eyebrow="My Habits"
      title={summary.due ? `${summary.done} of ${summary.due} done today` : hasHabits ? "Nothing due today" : "No habits yet"}
      description={
        summary.due
          ? summary.pending
            ? `${summary.pending} pending · ${summary.percent}% done`
            : "Everything due today is done"
          : hasHabits
            ? "Rest days never break a streak"
            : undefined
      }
      icon={ListChecks}
      action={<PanelLink href="/habits">View all habits</PanelLink>}
    >
      {!hasHabits ? (
        <div className="space-y-3">
          <p className="text-[0.82rem] leading-relaxed text-paper/65">
            Connect a habit to your journal, sleep or revision and it fills in from what you record there.
          </p>
          <Link
            href="/habits?new=1"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[0.78rem] font-semibold text-paper transition-colors hover:border-paper/25"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Create a habit
          </Link>
        </div>
      ) : list.length === 0 ? (
        <p className="text-[0.82rem] leading-relaxed text-paper/65">None of your habits is due today. Enjoy the rest day.</p>
      ) : (
        <div className="flex items-start gap-4">
          <RadialProgress
            value={summary.percent ?? 0}
            tone={summary.percent === 100 ? "positive" : "accent"}
            ariaLabel="Today's habits done"
            size={64}
            stroke={6}
            className="mt-2 hidden shrink-0 sm:inline-grid"
            label={<span className="tabular text-[0.82rem] font-semibold text-paper">{summary.percent ?? 0}%</span>}
          />
          <div className="min-w-0 flex-1">
            <ul className="-my-1 divide-y divide-line" aria-label="Today's habits">
              {list.slice(0, SHOWN).map((t) => (
                <TodayRow key={t.habit.id} item={t} compact linked />
              ))}
            </ul>
            {list.length > SHOWN && (
              <Link href="/habits" className="mt-2 inline-block text-[0.76rem] font-semibold text-accent hover:underline">
                {list.length - SHOWN} more today
              </Link>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
