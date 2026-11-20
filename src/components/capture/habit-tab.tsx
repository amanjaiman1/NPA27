"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, Flame, ListChecks, Lock, Plus, Sparkles } from "lucide-react";
import type { Habit, ISODate } from "@/lib/types";
import {
  SOURCE_LABEL,
  habitSchedule,
  habitSource,
  isAutomatic,
  progressText,
  type HabitToday,
  type TodaySummary,
} from "@/lib/habit-engine";
import { EmptyState } from "@/components/ui/misc";
import { RadialProgress } from "@/components/ui/progress";
import { HabitBar, habitIcon, useTimeFormat } from "@/components/habits/habit-ui";
import { cn, formatDate } from "@/lib/utils";

/**
 * The Habit tab: every habit due on the day, as the Habit Engine sees it.
 * Connected habits fill in from the journal, the Life Dashboard and revision
 * (including unsaved edits in the other tabs, as a preview); habits you check
 * off by hand get a check-in, saved with everything else.
 */
export function HabitTab({
  date,
  list,
  summary,
  saved,
  drafts,
  onToggle,
  hasHabits,
  previewing,
}: {
  date: ISODate;
  /** The day's habits, evaluated with unsaved edits applied. */
  list: HabitToday[];
  summary: TodaySummary;
  /** The habits as saved, to tell unsaved check-ins apart. */
  saved: Habit[];
  drafts: Record<string, boolean>;
  onToggle: (habitId: string, want: boolean) => void;
  hasHabits: boolean;
  /** Unsaved Day Update or Life edits are part of what's shown. */
  previewing: boolean;
}) {
  const timeFormat = useTimeFormat();
  const manual = list.filter((t) => !isAutomatic(t.habit));
  const connected = list.filter((t) => isAutomatic(t.habit));
  const savedById = new Map(saved.map((h) => [h.id, h] as const));

  if (!hasHabits) {
    return (
      <EmptyState
        icon={<ListChecks className="h-5 w-5" />}
        title="No habits yet"
        description="Create a habit to check off each day, or connect one to your journal, sleep or revision so it fills in by itself."
        action={
          <Link
            href="/habits?new=1"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[0.8rem] font-semibold text-paper hover:border-paper/25"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Create a habit
          </Link>
        }
      />
    );
  }

  const row = (t: HabitToday) => {
    const before = savedById.get(t.habit.id);
    const unsaved = t.habit.id in drafts && (before?.log?.[date] === true) !== drafts[t.habit.id];
    return <HabitRow key={t.habit.id} item={t} date={date} unsaved={unsaved} onToggle={onToggle} timeFormat={timeFormat} />;
  };

  return (
    <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-paper/[0.015] shadow-soft">
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-6">
        <RadialProgress
          value={summary.percent ?? 0}
          tone={summary.percent === 100 ? "positive" : "accent"}
          ariaLabel="Habits done"
          size={64}
          stroke={6}
          label={<span className="tabular text-[0.82rem] font-semibold text-paper">{summary.percent ?? 0}%</span>}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[1.02rem] font-semibold tracking-snugg text-paper">
            {summary.due ? `${summary.done} of ${summary.due} done` : "Nothing due"}
            <span className="font-normal text-paper/55"> · {formatDate(date)}</span>
          </p>
          <p className="mt-0.5 text-[0.78rem] text-paper/60">
            {summary.due
              ? summary.pending
                ? `${summary.pending} still open. Connected habits fill in from what you record.`
                : "Everything due is done."
              : "None of your habits is due on this day. Rest days never break a streak."}
          </p>
          {previewing && (
            <p className="mt-1 inline-flex items-center gap-1 text-[0.72rem] text-accent">
              <Sparkles className="h-3 w-3" aria-hidden /> Includes unsaved Day Update and Life changes
            </p>
          )}
        </div>
        <Link href="/habits" className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
          My Habits <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {manual.length > 0 && (
        <section aria-labelledby="habits-manual" className="px-4 pt-4 sm:px-6">
          <h2 id="habits-manual" className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-paper/50">
            Check these off
          </h2>
          <div>
            <ul className="divide-y divide-line">{manual.map(row)}</ul>
          </div>
        </section>
      )}
      {connected.length > 0 && (
        <section aria-labelledby="habits-connected" className="px-4 pt-4 sm:px-6">
          <h2 id="habits-connected" className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-paper/50">
            Filled in from your records
          </h2>
          <div>
            <ul className="divide-y divide-line">{connected.map(row)}</ul>
          </div>
        </section>
      )}
    </div>
  );
}

const HabitRow = memo(function HabitRow({
  item,
  date,
  unsaved,
  onToggle,
  timeFormat,
}: {
  item: HabitToday;
  date: ISODate;
  unsaved: boolean;
  onToggle: (habitId: string, want: boolean) => void;
  timeFormat: ReturnType<typeof useTimeFormat>;
}) {
  const h = item.habit;
  const Icon = habitIcon(h);
  const auto = isAutomatic(h);
  const source = habitSource(h);
  // The same rules as My Habits: a weekly total adds amounts, so there's
  // nothing to tick for one day, and a day settled by a correction is changed
  // from the habit's calendar.
  const checkable = (!auto || h.allowManual) && habitSchedule(h).kind !== "weeklyTotal";
  const checked = h.log?.[date] === true;
  const settled = item.day.via === "override";
  const fromSource = auto && item.day.via === "source" && item.day.done;
  const canToggle = checkable && !settled && (!item.done || checked);

  return (
    <li className="flex min-w-0 items-center gap-3 py-3">
      <motion.span
        animate={{ scale: item.done ? [1, 1.12, 1] : 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors duration-300",
          item.done ? "bg-positive/15 text-positive" : "bg-accent/10 text-accent",
        )}
        aria-hidden
      >
        <Icon className="h-[1.1rem] w-[1.1rem]" />
      </motion.span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[0.88rem] font-semibold text-paper">{h.name}</span>
          <span className={cn("tabular shrink-0 text-[0.74rem]", item.done ? "font-semibold text-positive" : "text-paper/65")}>
            {progressText(item, timeFormat)}
          </span>
        </div>
        <HabitBar value={item.progress} done={item.done} className="mt-1.5" />
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.69rem] text-paper/55">
          <span className="truncate">
            {settled
              ? "Corrected on My Habits"
              : fromSource
                ? `Done from ${SOURCE_LABEL[source]}`
                : auto
                  ? `From ${SOURCE_LABEL[source]}${h.allowManual ? " or your check-in" : ""}`
                  : "You check this off"}
          </span>
          {item.streak > 1 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-warning">
              <Flame className="h-3 w-3" aria-hidden />
              {item.streak} {item.streakUnit === "week" ? "weeks" : "days"}
            </span>
          )}
          {unsaved && <span className="shrink-0 font-semibold text-accent">Unsaved</span>}
        </p>
      </div>
      {canToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? `Untick ${h.name}` : `Mark ${h.name} done`}
          onClick={() => onToggle(h.id, !checked)}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
            checked ? "border-positive bg-positive/15 text-positive" : "border-paper/25 text-transparent hover:border-positive/60 hover:text-positive/60",
          )}
        >
          <Check className="h-5 w-5" strokeWidth={2.6} />
        </button>
      ) : (
        <span
          className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", item.done ? "text-positive" : "text-paper/30")}
          title={settled ? "Corrected on My Habits" : `Filled in from ${SOURCE_LABEL[source]}`}
        >
          {item.done ? <Check className="h-5 w-5" strokeWidth={2.6} aria-label="Done" /> : <Lock className="h-4 w-4" aria-label="Filled in automatically" />}
        </span>
      )}
    </li>
  );
});
