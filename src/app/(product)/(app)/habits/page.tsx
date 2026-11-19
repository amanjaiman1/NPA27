"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, ArrowRight, CalendarCheck, Flame, Gauge, ListChecks, Plus, Sparkles } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Habit, HabitMetric, HabitSource } from "@/lib/types";
import {
  SOURCE_LABEL,
  describeSchedule,
  describeTarget,
  evaluateDay,
  habitConsistency,
  habitPresets,
  habitStreaks,
  habitsOverPeriod,
  isPausedNow,
  suggestConnection,
  summarizeToday,
  todayHabits,
  type HabitContext,
  type HabitPreset,
} from "@/lib/habit-engine";
import { addDays, weekStartOf } from "@/lib/roadmap";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Panel, MetricCard } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Disclosure, EmptyState } from "@/components/ui/misc";
import { RadialProgress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { HabitForm } from "@/components/habits/habit-form";
import { HabitDetail } from "@/components/habits/habit-detail";
import {
  DAY_LABEL,
  DAY_STYLE,
  DayLegend,
  HabitBar,
  SourceChip,
  TodayRow,
  habitIcon,
  useHabitContext,
  useTimeFormat,
} from "@/components/habits/habit-ui";
import { cn, formatDate } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   HABITS
   Today's habits first, with how far each has got and where that came
   from; then every habit with its streaks, rates and last five weeks;
   then consistency side by side. Connected habits fill in from the
   records kept elsewhere (lib/habit-engine.ts); only the ones you check
   off need a tap here.
   ════════════════════════════════════════════════════════════════ */

const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

export default function HabitsPage() {
  const hydrated = useHasHydrated();
  const habits = useChronicle((s) => s.habits);
  const dailyHourTarget = useChronicle((s) => s.profile.dailyHourTarget);
  const restore = useChronicle((s) => s.setHabitArchived);
  const toast = useToast();
  const ctx = useHabitContext();
  const today = ctx.today;

  const [form, setForm] = useState<{
    open: boolean;
    habit: Habit | null;
    preset: HabitPreset | null;
    connect: { source: HabitSource; metric: HabitMetric } | null;
  }>({ open: false, habit: null, preset: null, connect: null });
  const [detailId, setDetailId] = useState<string | null>(null);

  const openCreate = (preset: HabitPreset | null = null) => setForm({ open: true, habit: null, preset, connect: null });
  const openEdit = (habit: Habit, connect: { source: HabitSource; metric: HabitMetric } | null = null) => {
    setDetailId(null);
    setForm({ open: true, habit, preset: null, connect });
  };
  const closeForm = () => setForm((f) => ({ ...f, open: false }));

  // ?new=1 opens the form; ?habit=<id> opens a habit.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") openCreate();
    const id = params.get("habit");
    if (id && habits.some((h) => h.id === id)) setDetailId(id);
    if (params.has("new") || params.has("habit")) window.history.replaceState({}, "", "/habits");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const active = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archived), [habits]);
  const list = useMemo(() => todayHabits(habits, ctx), [habits, ctx]);
  const summary = summarizeToday(list);
  const period = useMemo(() => habitsOverPeriod(active, ctx, addDays(today, -29), today), [active, ctx, today]);
  const best = useMemo(() => {
    let top: { habit: Habit; streak: number; unit: "day" | "week" } | null = null;
    for (const h of active) {
      const s = habitStreaks(h, ctx);
      if (s.current > 0 && (!top || s.current > top.streak)) top = { habit: h, streak: s.current, unit: s.unit };
    }
    return top;
  }, [active, ctx]);
  const presets = useMemo(() => habitPresets({ dailyHourTarget }), [dailyHourTarget]);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Habits"
        title="You don't rise to your goals. You fall to your systems."
        description="Connect a habit to the Daily Journal, Life Dashboard, Revision or Roadmap and it keeps itself from what you record there. The rest you tick off here."
        actions={
          <Button onClick={() => openCreate()} hint="Choose what it tracks, what completes a day and when it's due.">
            <Plus className="h-4 w-4" aria-hidden /> Create a habit
          </Button>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title={archived.length ? "No active habits" : "No habits yet"}
          description="Start with one that keeps itself: hours from your journal, a topic revised a day, or sleep from the Life Dashboard. You can change any of it later."
          action={
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {presets.slice(0, 4).map((p) => (
                <Button key={p.key} variant="ghost" size="sm" onClick={() => openCreate(p)}>
                  {p.name}
                </Button>
              ))}
              <Button size="sm" onClick={() => openCreate()}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Create your own
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* ── Today ───────────────────────────────────────── */}
          <Panel
            eyebrow={`Today · ${formatDate(today)}`}
            title={summary.due ? `${summary.done} of ${summary.due} done` : "Nothing due today"}
            description={
              summary.due
                ? summary.pending
                  ? `${summary.pending} still to do. Connected habits update as you record.`
                  : "Everything due today is done."
                : "Rest days and paused habits never break a streak."
            }
            icon={CalendarCheck}
          >
            {list.length > 0 && (
              <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
                <div className="flex items-center gap-4 md:flex-col md:gap-2 md:px-4">
                  <RadialProgress
                    value={summary.percent ?? 0}
                    size={96}
                    stroke={8}
                    label={<span className="tabular text-xl font-semibold text-paper">{summary.percent ?? 0}%</span>}
                    sublabel={<span className="text-[0.62rem] text-paper/55">today</span>}
                  />
                  <p className="text-[0.76rem] text-paper/60 md:text-center">
                    {summary.done} done
                    <br className="hidden md:block" />
                    <span className="md:hidden"> · </span>
                    {summary.pending} pending
                  </p>
                </div>
                <ul className="divide-y divide-line" aria-label="Today's habits">
                  {list.map((t) => (
                    <TodayRow key={t.habit.id} item={t} onOpen={(h) => setDetailId(h.id)} />
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          {/* ── Headline numbers ────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Active habits" value={active.length - active.filter((h) => isPausedNow(h, today)).length} hint={pausedHint(active, today)} icon={ListChecks} />
            <MetricCard label="Done today" value={summary.due ? `${summary.done}/${summary.due}` : "–"} hint={summary.due ? `${summary.pending} pending` : "Nothing due"} icon={CalendarCheck} />
            <MetricCard
              label="Best streak now"
              value={best ? best.streak : 0}
              unit={best ? (best.unit === "week" ? "wk" : "d") : undefined}
              hint={best ? best.habit.name : "Keep a habit two days running"}
              icon={Flame}
            />
            <MetricCard
              label="Last 30 days"
              value={pct(period.rate)}
              hint={period.due ? `${period.kept} of ${period.due} due days kept` : "Nothing due yet"}
              icon={Gauge}
            />
          </div>

          {/* ── Every habit ─────────────────────────────────── */}
          <section aria-labelledby="your-habits" className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="your-habits" className="text-[1.02rem] font-semibold tracking-[-0.02em] text-paper">
                  Your habits
                </h2>
                <p className="mt-0.5 text-[0.78rem] text-paper/60">Open one to see its calendar, the records behind each day, and to correct a day.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 wide:grid-cols-3">
              {active.map((h) => (
                <HabitCard
                  key={h.id}
                  habit={h}
                  ctx={ctx}
                  onOpen={() => setDetailId(h.id)}
                  onConnect={(c) => openEdit(h, c)}
                />
              ))}
            </div>
            <DayLegend />
          </section>

          {/* ── Consistency ─────────────────────────────────── */}
          <ConsistencyTable habits={active} ctx={ctx} onOpen={(h) => setDetailId(h.id)} />
        </>
      )}

      {archived.length > 0 && (
        <Card className="px-5 py-2">
          <Disclosure summary={`Archived habits (${archived.length})`}>
            <ul className="divide-y divide-line pb-2">
              {archived.map((h) => {
                const Icon = habitIcon(h);
                return (
                  <li key={h.id} className="flex items-center gap-3 py-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-paper/50" aria-hidden />
                    <button
                      type="button"
                      onClick={() => setDetailId(h.id)}
                      className="min-w-0 flex-1 truncate text-left text-[0.84rem] font-medium text-paper/80 hover:underline"
                    >
                      {h.name}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        restore(h.id, false);
                        toast({ title: `“${h.name}” restored`, description: "It's back in today's list, with its history." });
                      }}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Restore
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        </Card>
      )}

      <HabitForm
        open={form.open}
        onClose={closeForm}
        habit={form.habit}
        preset={form.preset}
        connect={form.connect}
      />
      <HabitDetail habitId={detailId} onClose={() => setDetailId(null)} onEdit={(h) => openEdit(h)} />
    </div>
  );
}

function pausedHint(active: Habit[], today: string): string {
  const paused = active.filter((h) => isPausedNow(h, today)).length;
  return paused ? `${paused} paused` : "None paused";
}

/** One habit: what it is, where it comes from, its streaks and its last five weeks. */
function HabitCard({
  habit: h,
  ctx,
  onOpen,
  onConnect,
}: {
  habit: Habit;
  ctx: HabitContext;
  onOpen: () => void;
  onConnect: (c: { source: HabitSource; metric: HabitMetric }) => void;
}) {
  const timeFormat = useTimeFormat();
  const Icon = habitIcon(h);
  const paused = isPausedNow(h, ctx.today);
  const data = useMemo(() => {
    const streaks = habitStreaks(h, ctx);
    const week7 = habitConsistency(h, ctx, addDays(ctx.today, -6), ctx.today);
    const days30 = habitConsistency(h, ctx, addDays(ctx.today, -29), ctx.today);
    // Five calendar weeks, this one last, a row each.
    const first = weekStartOf(addDays(ctx.today, -28), ctx.weekStart);
    const cells = Array.from({ length: 35 }, (_, i) => evaluateDay(h, ctx, addDays(first, i)));
    const todayDay = evaluateDay(h, ctx, ctx.today);
    return { streaks, week7, days30, cells, todayDay };
  }, [h, ctx]);
  const suggestion = suggestConnection(h);
  const unit = data.streaks.unit === "week" ? "wk" : "d";

  return (
    <Card hover className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", paused ? "bg-warning/15 text-warning" : "bg-accent/10 text-accent")} aria-hidden>
          <Icon className="h-[1.1rem] w-[1.1rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.95rem] font-semibold text-paper">
            <button type="button" onClick={onOpen} className="max-w-full truncate rounded-md text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45">
              {h.name}
            </button>
          </h3>
          <p className="mt-0.5 truncate text-[0.74rem] text-paper/60">
            {describeTarget(h, timeFormat)} · {describeSchedule(h)}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-paper/[0.05] px-2.5 py-1 text-[0.72rem] font-semibold text-paper/75"
          aria-label={`Current streak ${data.streaks.current} ${data.streaks.unit === "week" ? "weeks" : "days"}`}
        >
          <Flame className={cn("h-3.5 w-3.5", data.streaks.current > 0 ? "text-warning" : "text-paper/40")} aria-hidden />
          <span className="tabular">
            {data.streaks.current}
            {unit}
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <SourceChip habit={h} />
        {paused && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.66rem] font-semibold text-warning">Paused</span>}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <dl className="grid grid-cols-3 gap-2">
          <Figure label="7 days" value={pct(data.week7.rate)} />
          <Figure label="30 days" value={pct(data.days30.rate)} />
          <Figure label="Best" value={`${data.streaks.longest}${unit}`} />
        </dl>
        <ol className="grid grid-cols-7 gap-[3px]" aria-label="The last five weeks">
          {data.cells.map((d) => (
            <li
              key={d.date}
              className={cn("h-2.5 w-2.5 rounded-[3px]", DAY_STYLE[d.status], d.status === "future" && "bg-paper/[0.03]")}
              aria-label={`${formatDate(d.date)}: ${DAY_LABEL[d.status]}`}
            />
          ))}
        </ol>
      </div>

      {data.todayDay.scheduled && data.todayDay.status !== "paused" && data.todayDay.status !== "before" && (
        <HabitBar value={data.todayDay.progress} done={data.todayDay.done} className="mt-4" />
      )}

      {suggestion && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-accent/[0.07] px-3 py-2 text-[0.74rem] leading-relaxed text-paper/75">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 flex-1">
            {suggestion.reason}{" "}
            <button
              type="button"
              onClick={() => onConnect({ source: suggestion.source, metric: suggestion.metric })}
              className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline"
            >
              Connect to {SOURCE_LABEL[suggestion.source]} <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          </p>
        </div>
      )}

      <div className="mt-auto flex justify-end pt-3">
        <Button size="sm" variant="subtle" onClick={onOpen} aria-label={`Details for ${h.name}`}>
          Calendar and details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.66rem] text-paper/55">{label}</dt>
      <dd className="tabular text-[1.05rem] font-semibold tracking-[-0.02em] text-paper">{value}</dd>
    </div>
  );
}

/** Weekly and monthly consistency for every habit, side by side. */
function ConsistencyTable({ habits, ctx, onOpen }: { habits: Habit[]; ctx: HabitContext; onOpen: (h: Habit) => void }) {
  const rows = useMemo(() => {
    const weekFrom = weekStartOf(ctx.today, ctx.weekStart);
    const monthFrom = `${ctx.today.slice(0, 7)}-01`;
    return habits.map((h) => ({
      habit: h,
      week: habitConsistency(h, ctx, weekFrom, ctx.today),
      month: habitConsistency(h, ctx, monthFrom, ctx.today),
      last90: habitConsistency(h, ctx, addDays(ctx.today, -89), ctx.today),
      streaks: habitStreaks(h, ctx),
    }));
  }, [habits, ctx]);
  if (!rows.length) return null;

  return (
    <Panel
      eyebrow="Consistency"
      title="How often each habit was kept"
      description="Only days a habit was due count. Today counts once it's done."
      icon={Gauge}
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] text-left text-[0.8rem]">
          <thead>
            <tr className="border-b border-line text-[0.7rem] font-semibold text-paper/55">
              <th scope="col" className="py-2 pr-3 font-semibold">Habit</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">This week</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">This month</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Last 90 days</th>
              <th scope="col" className="py-2 pl-3 text-right font-semibold">Streak · best</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ habit, week, month, last90, streaks }) => (
              <tr key={habit.id} className="border-b border-line/60 last:border-0">
                <th scope="row" className="max-w-[14rem] py-2.5 pr-3 font-medium">
                  <button type="button" onClick={() => onOpen(habit)} className="max-w-full truncate text-left text-paper hover:underline">
                    {habit.name}
                  </button>
                </th>
                <td className="tabular px-3 py-2.5 text-right text-paper/80">
                  {week.due ? `${week.kept}/${week.due}` : "–"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <RateCell rate={month.rate} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <RateCell rate={last90.rate} />
                </td>
                <td className="tabular py-2.5 pl-3 text-right text-paper/80">
                  {streaks.current} · {streaks.longest} {streaks.unit === "week" ? "wk" : "d"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RateCell({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-paper/45">–</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-paper/10 sm:block" aria-hidden>
        <span className={cn("block h-full rounded-full", rate >= 0.8 ? "bg-positive" : rate >= 0.5 ? "bg-accent" : "bg-warning")} style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
      <span className="tabular text-paper/80">{pct(rate)}</span>
    </span>
  );
}
