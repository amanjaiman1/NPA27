"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Flame, Pause, PencilLine, Play, Trash2, Trophy, X } from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { Habit, HabitOverride, ISODate } from "@/lib/types";
import {
  SOURCE_HREF,
  SOURCE_LABEL,
  describeSchedule,
  describeTarget,
  evaluateDay,
  formatAmount,
  habitConsistency,
  habitMetric,
  habitMonth,
  habitSchedule,
  habitSource,
  habitStart,
  habitStreaks,
  isAutomatic,
  isPausedNow,
  sourceStart,
  type HabitDay,
} from "@/lib/habit-engine";
import { addDays, weekStartOf } from "@/lib/roadmap";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn, daysBetween, formatDate, fromISODate, relativeDay } from "@/lib/utils";
import { DAY_LABEL, DAY_STYLE, DayLegend, SourceChip, habitIcon, useHabitContext, useTimeFormat } from "./habit-ui";

/* ════════════════════════════════════════════════════════════════
   ONE HABIT, IN FULL
   Its streaks and consistency, a month calendar, and any day opened up:
   the records that counted (each a link to where it's kept) and the
   corrections you can make. A correction is stored on the habit for that
   day and always wins, so a later record never undoes it; clearing it
   hands the day back to the records.
   ════════════════════════════════════════════════════════════════ */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/** "today", "yesterday", or the date. */
function dayWord(date: ISODate, today: ISODate): string {
  const d = daysBetween(date, today);
  return d === 0 ? "today" : d === 1 ? "yesterday" : formatDate(date);
}

function monthLabel(key: string): string {
  return fromISODate(`${key}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function shiftMonth(key: string, by: number): string {
  const d = fromISODate(`${key}-01`);
  const next = new Date(d.getFullYear(), d.getMonth() + by, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(key: string): ISODate {
  const d = fromISODate(`${key}-01`);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${key}-${String(last.getDate()).padStart(2, "0")}`;
}

export function HabitDetail({
  habitId,
  onClose,
  onEdit,
}: {
  habitId: string | null;
  onClose: () => void;
  onEdit: (h: Habit) => void;
}) {
  const habit = useChronicle((s) => s.habits.find((h) => h.id === habitId) ?? null);
  // Kept while the dialog closes, so its contents don't vanish mid-animation.
  const [shown, setShown] = useState<Habit | null>(habit);
  useEffect(() => {
    if (habit) setShown(habit);
  }, [habit]);

  return (
    <Modal open={Boolean(habitId && habit)} onClose={onClose} ariaLabel={shown?.name ?? "Habit"} className="sm:max-w-2xl">
      {shown && <DetailBody habit={habit ?? shown} onClose={onClose} onEdit={onEdit} />}
    </Modal>
  );
}

function DetailBody({ habit: h, onClose, onEdit }: { habit: Habit; onClose: () => void; onEdit: (h: Habit) => void }) {
  const ctx = useHabitContext();
  const timeFormat = useTimeFormat();
  const toggle = useChronicle((s) => s.toggleHabit);
  const setOverride = useChronicle((s) => s.setHabitOverride);
  const setArchived = useChronicle((s) => s.setHabitArchived);
  const setPaused = useChronicle((s) => s.setHabitPaused);
  const deleteHabit = useChronicle((s) => s.deleteHabit);
  const confirm = useConfirm();
  const toast = useToast();
  const today = ctx.today;

  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<ISODate>(today);
  useEffect(() => {
    setMonth(today.slice(0, 7));
    setSelected(today);
  }, [h.id, today]);

  const Icon = habitIcon(h);
  const auto = isAutomatic(h);
  const source = habitSource(h);
  const m = habitMetric(h);
  const schedule = habitSchedule(h);
  const weekly = schedule.kind === "weekly" || schedule.kind === "weeklyTotal";
  const paused = isPausedNow(h, today);

  const stats = useMemo(() => {
    const weekFrom = weekStartOf(today, ctx.weekStart);
    const trend = Array.from({ length: 8 }, (_, i) => {
      const from = addDays(weekFrom, -7 * (7 - i));
      return { from, consistency: habitConsistency(h, ctx, from, addDays(from, 6)) };
    });
    return {
      streaks: habitStreaks(h, ctx),
      week: habitConsistency(h, ctx, weekFrom, today),
      month: habitConsistency(h, ctx, `${month}-01`, monthEnd(month)),
      last30: habitConsistency(h, ctx, addDays(today, -29), today),
      trend,
    };
  }, [h, ctx, today, month]);

  const cells = useMemo(() => habitMonth(h, ctx, month), [h, ctx, month]);
  const day = useMemo(() => evaluateDay(h, ctx, selected), [h, ctx, selected]);
  const headers = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(ctx.weekStart + i) % 7]);
  const canGoForward = month < today.slice(0, 7);
  const started = habitStart(h);

  async function remove() {
    const ok = await confirm({
      title: `Delete “${h.name}”?`,
      description:
        "Its check-ins, corrections and settings are deleted. Your journal, Life Dashboard, revision and roadmap records stay exactly as they are. To keep its history instead, archive it.",
      confirmLabel: "Delete habit",
    });
    if (!ok) return;
    deleteHabit(h.id);
    onClose();
    toast({ title: `“${h.name}” deleted` });
  }

  function archive() {
    const on = !h.archived;
    setArchived(h.id, on);
    if (on) onClose();
    toast({
      title: on ? `“${h.name}” archived` : `“${h.name}” restored`,
      description: on ? "It's hidden from today's list, and its history is kept." : "It's back in today's list.",
      action: { label: "Undo", onClick: () => setArchived(h.id, !on) },
    });
  }

  function pause() {
    setPaused(h.id, !paused);
    toast({
      title: paused ? `“${h.name}” resumed` : `“${h.name}” paused`,
      description: paused ? "It's due again from today." : "Paused days are neither kept nor missed, so your streak waits.",
      action: { label: "Undo", onClick: () => setPaused(h.id, paused) },
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3.5 pr-2">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.15rem] font-semibold leading-snug tracking-[-0.02em] text-paper">{h.name}</h2>
          <p className="mt-0.5 text-[0.8rem] text-paper/65">
            {describeTarget(h, timeFormat)} · {describeSchedule(h)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <SourceChip habit={h} />
            {h.category && <span className="rounded-full bg-paper/[0.06] px-2 py-0.5 text-[0.66rem] font-semibold text-paper/65">{h.category}</span>}
            {paused && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.66rem] font-semibold text-warning">Paused</span>}
            {h.archived && <span className="rounded-full bg-paper/[0.06] px-2 py-0.5 text-[0.66rem] font-semibold text-paper/65">Archived</span>}
          </div>
          {h.description && <p className="mt-2 text-[0.8rem] leading-relaxed text-paper/70">{h.description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-paper/50 transition-colors hover:bg-paper/[0.06] hover:text-paper"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Numbers */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile icon={Flame} label="Current streak" value={`${stats.streaks.current}`} unit={stats.streaks.unit === "week" ? (stats.streaks.current === 1 ? "week" : "weeks") : stats.streaks.current === 1 ? "day" : "days"} />
        <StatTile icon={Trophy} label="Longest streak" value={`${stats.streaks.longest}`} unit={stats.streaks.unit === "week" ? (stats.streaks.longest === 1 ? "week" : "weeks") : stats.streaks.longest === 1 ? "day" : "days"} />
        <StatTile label="This week" value={stats.week.due ? `${stats.week.kept}/${stats.week.due}` : "–"} unit={stats.week.due ? (weekly ? "weeks kept" : "days kept") : "nothing due yet"} />
        <StatTile label="Last 30 days" value={pct(stats.last30.rate)} unit={stats.last30.due ? `${stats.last30.kept} of ${stats.last30.due} ${weekly ? "weeks" : "days"}` : "nothing due yet"} />
      </dl>

      {/* Weekly consistency */}
      <section aria-label="Consistency over the last eight weeks">
        <p className="mb-2 text-[0.74rem] font-semibold text-paper/60">The last eight weeks</p>
        <ol className="flex h-16 items-end gap-1.5">
          {stats.trend.map(({ from, consistency }) => {
            const rate = consistency.rate;
            return (
              <li key={from} className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`Week of ${formatDate(from)}: ${rate === null ? "nothing due" : `${Math.round(rate * 100)}% kept`}`}>
                <span
                  className={cn("w-full rounded-md transition-[height] duration-500", rate === null ? "bg-paper/[0.06]" : rate >= 0.999 ? "bg-positive" : "bg-accent")}
                  style={{ height: rate === null ? 4 : `${Math.max(8, Math.round(rate * 100))}%` }}
                />
              </li>
            );
          })}
        </ol>
        <p className="mt-1 flex justify-between text-[0.64rem] text-paper/45">
          <span>{formatDate(stats.trend[0].from)}</span>
          <span>This week</span>
        </p>
      </section>

      {/* Calendar */}
      <section aria-label="Calendar">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[0.84rem] font-semibold text-paper">{monthLabel(month)}</p>
          <div className="flex items-center gap-1">
            <span className="mr-2 text-[0.7rem] text-paper/55">
              {stats.month.due ? `${pct(stats.month.rate)} kept` : ""}
            </span>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((k) => shiftMonth(k, -1))}
              className="grid h-8 w-8 place-items-center rounded-full border border-line text-paper/60 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={!canGoForward}
              onClick={() => setMonth((k) => shiftMonth(k, 1))}
              className="grid h-8 w-8 place-items-center rounded-full border border-line text-paper/60 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[0.62rem] font-semibold uppercase tracking-wide text-paper/45" aria-hidden>
          {headers.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) =>
            c ? (
              <button
                key={c.date}
                type="button"
                disabled={c.status === "future"}
                aria-pressed={selected === c.date}
                aria-label={`${formatDate(c.date)}: ${DAY_LABEL[c.status]}`}
                onClick={() => setSelected(c.date)}
                className={cn(
                  "relative grid h-9 place-items-center rounded-lg text-[0.72rem] font-semibold tabular transition-transform duration-150 active:scale-95 sm:h-10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  DAY_STYLE[c.status],
                  c.status === "done" ? "text-accent-fg" : c.status === "future" || c.status === "before" ? "text-paper/30" : "text-paper/80",
                  selected === c.date && "ring-2 ring-paper/70 ring-offset-1 ring-offset-card",
                )}
              >
                {Number(c.date.slice(8))}
                {c.override && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />}
              </button>
            ) : (
              <span key={`pad-${i}`} aria-hidden />
            ),
          )}
        </div>
        <DayLegend className="mt-2.5" />
        <p className="mt-1 text-[0.66rem] text-paper/50">
          <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle" />
          A day you corrected by hand.
        </p>
      </section>

      {/* The day */}
      <DayPanel
        habit={h}
        day={day}
        today={today}
        started={started}
        onToggle={() => {
          const was = h.log?.[day.date] === true;
          toggle(h.id, day.date);
          toast({
            title: was ? `Unticked for ${dayWord(day.date, today)}` : `Done for ${dayWord(day.date, today)}`,
            action: { label: "Undo", onClick: () => toggle(h.id, day.date) },
          });
        }}
        onOverride={(next) => {
          const before = h.overrides?.[day.date];
          setOverride(h.id, day.date, next);
          toast({
            title: next
              ? next.kind === "done"
                ? "Marked done"
                : next.kind === "missed"
                  ? "Marked missed"
                  : "Amount corrected"
              : "Correction cleared",
            description: next ? "Later records won't change this day." : "The day is worked out from your records again.",
            action: {
              label: "Undo",
              onClick: () => setOverride(h.id, day.date, before ? { kind: before.kind, value: before.value } : null),
            },
          });
        }}
      />

      <p className="text-[0.72rem] leading-relaxed text-paper/55">
        {auto ? (
          <>
            {m.explain} Records count from {formatDate(sourceStart(h))}.{" "}
            <Link href={SOURCE_HREF[source]} className="font-semibold text-accent hover:underline">
              Open {SOURCE_LABEL[source]}
            </Link>
          </>
        ) : (
          <>You tick this off yourself. It counts from {formatDate(started)}.</>
        )}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button size="sm" onClick={() => onEdit(h)} hint="Change what it tracks, its target or its days. Its history is worked out again.">
          <PencilLine className="h-3.5 w-3.5" aria-hidden /> Edit
        </Button>
        {!h.archived && (
          <Button size="sm" variant="ghost" onClick={pause} hint={paused ? "Due again from today." : "For a break: paused days are neither kept nor missed."}>
            {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            {paused ? "Resume" : "Pause"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={archive} hint={h.archived ? "Back in today's list." : "Hide it and keep its history. You can restore it."}>
          {h.archived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> : <Archive className="h-3.5 w-3.5" aria-hidden />}
          {h.archived ? "Restore" : "Archive"}
        </Button>
        <Button size="sm" variant="danger" className="ml-auto" onClick={() => void remove()}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </Button>
      </div>
    </div>
  );
}

function StatTile({ label, value, unit, icon: Icon }: { label: string; value: string; unit?: string; icon?: React.ElementType }) {
  return (
    <div className="inset-panel px-3 py-2.5">
      <dt className="flex items-center gap-1 text-[0.68rem] font-medium text-paper/60">
        {Icon && <Icon className="h-3 w-3 text-accent" aria-hidden />}
        {label}
      </dt>
      <dd className="mt-0.5">
        <span className="tabular text-[1.2rem] font-semibold tracking-[-0.02em] text-paper">{value}</span>
        {unit && <span className="ml-1 text-[0.7rem] text-paper/55">{unit}</span>}
      </dd>
    </div>
  );
}

function DayPanel({
  habit: h,
  day,
  today,
  started,
  onToggle,
  onOverride,
}: {
  habit: Habit;
  day: HabitDay;
  today: ISODate;
  started: ISODate;
  onToggle: () => void;
  onOverride: (o: Omit<HabitOverride, "at"> | null) => void;
}) {
  const timeFormat = useTimeFormat();
  const auto = isAutomatic(h);
  const m = habitMetric(h);
  const source = habitSource(h);
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setEditing(false);
    setAmount(day.value !== null && m.unit !== "time" ? String(day.value) : "");
  }, [day.date, day.value, m.unit]);

  const when = relativeDay(day.date, today);
  const title = `${when === formatDate(day.date) ? "" : `${when}, `}${formatDate(day.date)}`;
  const checked = h.log?.[day.date] === true;
  const correctable = day.status !== "future" && day.status !== "before" && day.status !== "paused";
  const recordHref = source === "journal" ? `/journal/${day.date}` : SOURCE_HREF[source];
  const value = Number(amount);
  const amountOk = amount.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= m.max * 7;

  let reading: string | null = null;
  if (auto && day.value !== null) {
    reading =
      m.compare === "atLeast"
        ? `${formatAmount(m, day.value, timeFormat)} of ${formatAmount(m, day.target, timeFormat)}`
        : `${formatAmount(m, day.value, timeFormat)} (target ${formatAmount(m, day.target, timeFormat)})`;
  }

  return (
    <section aria-label={`The day: ${title}`} className="inset-panel space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.88rem] font-semibold text-paper">{title}</p>
        <p className="inline-flex items-center gap-1.5 text-[0.76rem] text-paper/70">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-[3px]", DAY_STYLE[day.status])} />
          {DAY_LABEL[day.status]}
          {reading && <span className="tabular text-paper/60">· {reading}</span>}
        </p>
      </div>

      {day.status === "before" && (
        <p className="text-[0.78rem] leading-relaxed text-paper/65">
          Before this habit started counting ({formatDate(started)}).{" "}
          {auto ? "To count records from earlier, edit it and move “Count records from”." : null}
        </p>
      )}
      {day.status === "paused" && <p className="text-[0.78rem] text-paper/65">The habit was paused on this day, so it neither counts nor breaks a streak.</p>}

      {auto && correctable && (
        <div>
          <p className="mb-1.5 text-[0.72rem] font-semibold text-paper/60">From your records</p>
          {day.events.length ? (
            <ul className="space-y-1">
              {day.events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-[0.8rem]">
                  <span className="min-w-0 truncate text-paper/80">{e.label}</span>
                  <Link href={e.href} className="shrink-0 text-[0.72rem] font-semibold text-accent hover:underline">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.78rem] text-paper/60">
              Nothing in {SOURCE_LABEL[source]} for this day.{" "}
              <Link href={recordHref} className="font-semibold text-accent hover:underline">
                Record it there
              </Link>
            </p>
          )}
        </div>
      )}

      {day.override && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-[0.76rem] leading-relaxed text-paper/80">
          You {day.override.kind === "value" ? `set the amount to ${formatAmount(m, day.override.value ?? 0, timeFormat)}` : `marked this day ${day.override.kind}`} on{" "}
          {formatDate(day.override.at.slice(0, 10))}. It stays that way whatever is recorded later.
        </p>
      )}

      {correctable && (
        <div className="flex flex-wrap items-center gap-2">
          {!auto ? (
            !day.override && (
              <Button size="sm" variant={checked ? "ghost" : "primary"} onClick={onToggle}>
                {checked ? "Untick this day" : "Mark done"}
              </Button>
            )
          ) : (
            <>
              {!day.done && (
                <Button size="sm" onClick={() => onOverride({ kind: "done" })} hint="Counts the day as kept, whatever the records say.">
                  Mark done
                </Button>
              )}
              {(day.done || day.progress > 0) && day.override?.kind !== "missed" && (
                <Button size="sm" variant="ghost" onClick={() => onOverride({ kind: "missed" })} hint="Counts the day as missed, whatever the records say.">
                  Mark missed
                </Button>
              )}
              {m.unit !== "time" && m.compare !== "check" && !editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)} hint="Use a different amount for this day, without changing the record.">
                  Correct the amount
                </Button>
              )}
              {h.allowManual && !day.override && (
                <Button size="sm" variant="ghost" onClick={onToggle} hint="A hybrid habit can also be checked off by hand.">
                  {checked ? "Untick check-in" : "Check off by hand"}
                </Button>
              )}
            </>
          )}
          {day.override && (
            <Button size="sm" variant="subtle" onClick={() => onOverride(null)} hint="Hand the day back to the records.">
              Clear correction
            </Button>
          )}
        </div>
      )}

      {editing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!amountOk) return;
            onOverride({ kind: "value", value });
            setEditing(false);
          }}
        >
          <label className="min-w-0">
            <span className="mb-1 block text-[0.72rem] font-semibold text-paper/60">Amount for this day ({m.unit === "count" ? m.noun.split(" ")[0] : m.unit})</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={m.step}
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              className="w-36"
              aria-invalid={amount.trim() !== "" && !amountOk}
            />
          </label>
          <Button size="sm" type="submit" disabled={!amountOk}>
            Save amount
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}
    </section>
  );
}
