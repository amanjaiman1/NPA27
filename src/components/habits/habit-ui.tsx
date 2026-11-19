"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Check,
  CircleCheck,
  Dumbbell,
  Droplets,
  Flame,
  Flower2,
  Footprints,
  HeartPulse,
  Moon,
  Newspaper,
  PenLine,
  Repeat,
  Route,
  ShieldCheck,
  Smartphone,
  Sunrise,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { timeFormatOf } from "@/lib/sleep";
import { cn, toISODate } from "@/lib/utils";
import {
  SOURCE_HREF,
  SOURCE_LABEL,
  describeSource,
  habitContext,
  habitSchedule,
  habitSource,
  isAutomatic,
  progressText,
  type DayStatus,
  type HabitContext,
  type HabitToday,
} from "@/lib/habit-engine";
import type { Habit, HabitSource } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

/* ════════════════════════════════════════════════════════════════
   Shared pieces of the Habit Engine's screens: the habit page, its forms
   and the dashboard's "Today's habits".
   ════════════════════════════════════════════════════════════════ */

/** The icons a habit can wear. */
export const HABIT_ICONS: { id: string; icon: LucideIcon; label: string }[] = [
  { id: "check", icon: CircleCheck, label: "Tick" },
  { id: "book", icon: BookOpen, label: "Book" },
  { id: "newspaper", icon: Newspaper, label: "Newspaper" },
  { id: "pen", icon: PenLine, label: "Pen" },
  { id: "repeat", icon: Repeat, label: "Revision" },
  { id: "target", icon: Target, label: "Target" },
  { id: "route", icon: Route, label: "Plan" },
  { id: "moon", icon: Moon, label: "Moon" },
  { id: "sunrise", icon: Sunrise, label: "Sunrise" },
  { id: "dumbbell", icon: Dumbbell, label: "Exercise" },
  { id: "footprints", icon: Footprints, label: "Walk" },
  { id: "droplets", icon: Droplets, label: "Water" },
  { id: "lotus", icon: Flower2, label: "Meditation" },
  { id: "brain", icon: Brain, label: "Mind" },
  { id: "heart", icon: HeartPulse, label: "Health" },
  { id: "shield", icon: ShieldCheck, label: "Shield" },
  { id: "smartphone", icon: Smartphone, label: "Phone" },
  { id: "flame", icon: Flame, label: "Flame" },
];

const BY_ID = new Map(HABIT_ICONS.map((i) => [i.id, i.icon]));
const SOURCE_ICON: Record<HabitSource, LucideIcon> = {
  manual: CircleCheck,
  journal: BookOpen,
  life: HeartPulse,
  revision: Repeat,
  roadmap: Route,
};

export function habitIcon(h: Pick<Habit, "icon" | "source">): LucideIcon {
  return (h.icon && BY_ID.get(h.icon)) || SOURCE_ICON[h.source ?? "manual"] || CircleCheck;
}

export function sourceIcon(source: HabitSource): LucideIcon {
  return SOURCE_ICON[source];
}

/** The Habit Engine's view of this account's records, kept current. */
export function useHabitContext(): HabitContext {
  const journal = useChronicle((s) => s.journal);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const revisions = useChronicle((s) => s.revisions);
  const plans = useChronicle((s) => s.plans);
  const subjects = useChronicle((s) => s.subjects);
  const weekStart = useChronicle((s) => s.profile.weekStart);
  // A new day starts a new "today", even with the page left open.
  const today = toISODate(useNow(60_000));
  return useMemo(
    () => habitContext({ journal, lifeLog, revisions, plans, subjects, profile: { weekStart } }, today),
    [journal, lifeLog, revisions, plans, subjects, weekStart, today],
  );
}

export function useTimeFormat() {
  const timeFormat = useChronicle((s) => s.profile.timeFormat);
  return timeFormatOf({ timeFormat });
}

/** Colours for a day's state, the same in every calendar. */
export const DAY_STYLE: Record<DayStatus, string> = {
  done: "bg-accent",
  partial: "bg-accent/35",
  missed: "bg-danger/30",
  open: "bg-transparent ring-1 ring-inset ring-accent/60",
  rest: "bg-paper/[0.06]",
  paused: "bg-warning/25",
  before: "bg-transparent",
  future: "bg-transparent",
};

export const DAY_LABEL: Record<DayStatus, string> = {
  done: "Kept",
  partial: "Partly",
  missed: "Missed",
  open: "Today, still open",
  rest: "Not due",
  paused: "Paused",
  before: "Before the habit started",
  future: "Ahead",
};

/** The calendar's key. */
export function DayLegend({ className }: { className?: string }) {
  const shown: DayStatus[] = ["done", "partial", "missed", "rest", "paused"];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-paper/60", className)}>
      {shown.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-[3px]", DAY_STYLE[s])} />
          {DAY_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

/** A slim bar that eases to its value: the shared progress bar, green once kept. */
export function HabitBar({ value, done, className }: { value: number; done?: boolean; className?: string }) {
  return <Progress value={Math.max(0, Math.min(1, value)) * 100} tone={done ? "positive" : "accent"} decorative className={cn("h-1.5", className)} />;
}

/** "From Daily Journal" with its icon. */
export function SourceChip({ habit, className }: { habit: Habit; className?: string }) {
  const source = habitSource(habit);
  const Icon = sourceIcon(source);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[0.66rem] font-semibold",
        source === "manual" ? "bg-paper/[0.06] text-paper/70" : "bg-accent/10 text-accent",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{describeSource(habit)}</span>
    </span>
  );
}

/**
 * One of today's habits: what it is, how far along it is and where that came
 * from. A habit you check off has a check button; one that fills in by itself
 * points to where its records are kept instead, since ticking it here would
 * only duplicate them.
 */
export function TodayRow({
  item,
  compact,
  onOpen,
  linked,
}: {
  item: HabitToday;
  compact?: boolean;
  onOpen?: (h: Habit) => void;
  /** The name opens the habit on My Habits. */
  linked?: boolean;
}) {
  const toggle = useChronicle((s) => s.toggleHabit);
  const toast = useToast();
  const timeFormat = useTimeFormat();
  const h = item.habit;
  const Icon = habitIcon(h);
  const auto = isAutomatic(h);
  const source = habitSource(h);
  // A weekly total adds up amounts, so there's nothing to tick for one day.
  const checkable = (!auto || h.allowManual) && habitSchedule(h).kind !== "weeklyTotal";
  const checked = h.log?.[item.day.date] === true;
  // A day settled by a correction is changed from the habit's calendar.
  const settled = item.day.via === "override";
  const text = progressText(item, timeFormat);

  const check = () => {
    toggle(h.id, item.day.date);
    if (!checked) {
      toast({
        title: `${h.name}: done for today`,
        description: item.week ? "Counted towards this week." : item.streak > 0 ? "Your streak carries on." : undefined,
        action: { label: "Undo", onClick: () => toggle(h.id, item.day.date) },
      });
    }
  };

  return (
    <li className="group flex min-w-0 items-center gap-3 py-2.5">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-xl transition-colors duration-300",
          compact ? "h-8 w-8" : "h-10 w-10",
          item.done ? "bg-positive/15 text-positive" : "bg-accent/10 text-accent",
        )}
        aria-hidden
      >
        <Icon className={compact ? "h-4 w-4" : "h-[1.1rem] w-[1.1rem]"} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(h)}
              className="min-w-0 truncate rounded-md text-left text-[0.86rem] font-semibold text-paper hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            >
              {h.name}
            </button>
          ) : linked ? (
            <Link
              href={`/habits?habit=${encodeURIComponent(h.id)}`}
              className="min-w-0 truncate rounded-md text-[0.86rem] font-semibold text-paper hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            >
              {h.name}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[0.86rem] font-semibold text-paper">{h.name}</span>
          )}
          <span className={cn("tabular shrink-0 text-[0.74rem]", item.done ? "font-semibold text-positive" : "text-paper/65")}>{text}</span>
        </div>
        <HabitBar value={item.progress} done={item.done} className="mt-1.5" />
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.68rem] text-paper/55">
          <span className="truncate">
            {auto ? `From ${SOURCE_LABEL[source]}${h.allowManual ? " or your check-in" : ""}` : "You check this off"}
          </span>
          {item.streak > 1 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-warning">
              <Flame className="h-3 w-3" aria-hidden />
              {item.streak} {item.streakUnit === "week" ? "weeks" : "days"}
            </span>
          )}
        </p>
      </div>
      {checkable && !settled && (!item.done || checked) ? (
        <Tooltip
          content={
            checked
              ? "Untick for today"
              : auto
                ? `Mark done by hand, for a day ${SOURCE_LABEL[source]} doesn't cover`
                : "Mark as done today"
          }
          describe={false}
        >
          <button
            type="button"
            onClick={check}
            aria-pressed={checked}
            aria-label={checked ? `Untick ${h.name} for today` : `Mark ${h.name} as done today`}
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-all duration-200 active:scale-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
              checked ? "border-positive bg-positive text-card" : "border-paper/25 bg-transparent text-paper/40 hover:border-accent hover:text-accent",
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <motion.path
                key={checked ? "on" : "off"}
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: checked ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
          </button>
        </Tooltip>
      ) : !item.done && auto && !settled ? (
        <Tooltip content={`It fills in from ${SOURCE_LABEL[source]}. Record it there and this updates by itself.`}>
          <Link
            href={SOURCE_HREF[source]}
            aria-label={`Record it in ${SOURCE_LABEL[source]}`}
            className="shrink-0 rounded-full px-2.5 py-1.5 text-[0.72rem] font-semibold text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
          >
            Record
          </Link>
        </Tooltip>
      ) : item.done ? (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-positive/15 text-positive" aria-hidden>
          <Check className="h-4 w-4" />
        </span>
      ) : null}
    </li>
  );
}
