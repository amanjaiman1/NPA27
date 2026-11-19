"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useChronicle, type HabitInput } from "@/lib/store";
import type { Habit, HabitCategory, HabitMetric, HabitSchedule, HabitSource, ISODate } from "@/lib/types";
import {
  HABIT_METRICS,
  SOURCE_LABEL,
  clockToTarget,
  describeSchedule,
  describeSource,
  describeTarget,
  habitMetric,
  habitPresets,
  habitSchedule,
  habitSource,
  habitStreaks,
  habitTarget,
  isPausedNow,
  metricsFor,
  progressText,
  recentDays,
  suggestConnection,
  targetClock,
  todayHabits,
  type HabitPreset,
  type MetricDef,
} from "@/lib/habit-engine";
import { normalizeWeekStart } from "@/lib/roadmap";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Disclosure, Segmented } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { TimeField } from "@/components/sleep/time-field";
import { cn, formatDate } from "@/lib/utils";
import { DAY_LABEL, DAY_STYLE, HABIT_ICONS, sourceIcon, useHabitContext, useTimeFormat } from "./habit-ui";

/* ════════════════════════════════════════════════════════════════
   CREATING AND EDITING A HABIT
   One guided form: what to call it, how it's tracked (from records you
   already keep, by hand, or both), what completes a day, and when it's
   due. A preview underneath runs the Habit Engine on the settings as they
   stand, against this account's real records, so "6 hours from the Daily
   Journal" shows today's 3 hours as half done before anything is saved.
   ════════════════════════════════════════════════════════════════ */

type Tracking = "auto" | "hybrid" | "manual";
type AutoSource = Exclude<HabitSource, "manual">;

const CATEGORIES: HabitCategory[] = ["Study", "Revision", "Sleep", "Health", "Mind", "Planning", "Other"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const AUTO_SOURCES: { id: AutoSource; reads: string }[] = [
  { id: "journal", reads: "Hours, subjects and topics you log for the day." },
  { id: "life", reads: "Sleep, wake-up, exercise, meditation, water and screen time." },
  { id: "revision", reads: "Topics you revise, on the Revision page or in the journal." },
  { id: "roadmap", reads: "Planned activities you mark completed." },
];

const TRACKING_TEXT: Record<Tracking, string> = {
  auto: "It fills in from records you already keep. There's nothing to tick.",
  hybrid: "It fills in from your records, and you can also check it off on a day they don't cover.",
  manual: "You tick it off yourself, on the Habits page or the dashboard.",
};

const UNIT_WORD: Record<MetricDef["unit"], string> = {
  check: "",
  h: "hours",
  min: "minutes",
  km: "km",
  L: "litres",
  count: "",
  time: "",
};

const metricDef = (id: HabitMetric): MetricDef => HABIT_METRICS.find((m) => m.id === id) ?? HABIT_METRICS[0];
const CHECK = metricDef("check");

interface Draft {
  name: string;
  description: string;
  category: HabitCategory;
  icon: string;
  tracking: Tracking;
  source: AutoSource;
  metric: HabitMetric;
  /** "" is any subject. */
  subjectId: string;
  /** The target as typed, for amounts. */
  amount: string;
  /** The target for a time ("HH:MM"). */
  clock: string;
  scheduleKind: HabitSchedule["kind"];
  days: number[];
  timesPerWeek: number;
  countFrom: ISODate;
  remind: boolean;
  remindAt: string;
  paused: boolean;
}

type Errors = Partial<Record<"name" | "subject" | "amount" | "days" | "countFrom", string>>;

function startAmount(m: MetricDef, dailyHourTarget: number): number {
  if (m.id === "studyHours" && dailyHourTarget > 0) return Math.min(m.max, dailyHourTarget);
  return m.defaultTarget;
}

function blankDraft(today: ISODate, dailyHourTarget: number): Draft {
  const study = metricDef("studyHours");
  return {
    name: "",
    description: "",
    category: "Study",
    icon: "",
    tracking: "manual",
    source: "journal",
    metric: study.id,
    subjectId: "",
    amount: String(startAmount(study, dailyHourTarget)),
    clock: "23:00",
    scheduleKind: "daily",
    days: [1, 2, 3, 4, 5],
    timesPerWeek: 3,
    countFrom: today,
    remind: false,
    remindAt: "20:00",
    paused: false,
  };
}

function draftFromPreset(p: HabitPreset, today: ISODate, dailyHourTarget: number): Draft {
  const base = blankDraft(today, dailyHourTarget);
  const manual = p.source === "manual";
  const m = metricDef(manual ? "studyHours" : p.metric);
  const target = manual ? startAmount(m, dailyHourTarget) : p.target ?? m.defaultTarget;
  return {
    ...base,
    name: p.name,
    category: p.category ?? "Other",
    icon: p.icon,
    tracking: manual ? "manual" : "auto",
    source: manual ? "journal" : (p.source as AutoSource),
    metric: m.id,
    amount: m.unit === "time" ? base.amount : String(target),
    clock: m.unit === "time" ? targetClock(m, target) : base.clock,
    scheduleKind: p.schedule.kind,
    days: p.schedule.kind === "weekdays" ? p.schedule.days : base.days,
    timesPerWeek: p.schedule.kind === "weekly" ? p.schedule.timesPerWeek : base.timesPerWeek,
  };
}

function draftFromHabit(h: Habit, today: ISODate, dailyHourTarget: number): Draft {
  const source = habitSource(h);
  const manual = source === "manual";
  const m = manual ? metricDef("studyHours") : habitMetric(h);
  const target = manual ? startAmount(m, dailyHourTarget) : habitTarget(h);
  const s = habitSchedule(h);
  return {
    name: h.name,
    description: h.description ?? "",
    category: h.category ?? "Other",
    icon: h.icon ?? "",
    tracking: manual ? "manual" : h.allowManual ? "hybrid" : "auto",
    source: manual ? "journal" : source,
    metric: m.id,
    subjectId: h.subjectId ?? "",
    amount: m.unit === "time" ? String(startAmount(metricDef("studyHours"), dailyHourTarget)) : String(target),
    clock: m.unit === "time" ? targetClock(m, target) : "23:00",
    scheduleKind: s.kind,
    days: s.kind === "weekdays" ? s.days : [1, 2, 3, 4, 5],
    timesPerWeek: s.kind === "weekly" ? s.timesPerWeek : 3,
    countFrom: h.countFrom ?? h.createdOn,
    remind: Boolean(h.remindAt),
    remindAt: h.remindAt ?? "20:00",
    paused: isPausedNow(h, today),
  };
}

function metricOf(d: Draft): MetricDef {
  return d.tracking === "manual" ? CHECK : metricDef(d.metric);
}

/** A weekly total only makes sense for an amount that adds up. */
function allowsWeeklyTotal(m: MetricDef): boolean {
  return m.compare === "atLeast";
}

/** The habit's settings, with every field present so an edit can clear one. */
function toInput(d: Draft): HabitInput {
  const manual = d.tracking === "manual";
  const m = metricOf(d);
  const schedule: HabitSchedule =
    d.scheduleKind === "weekdays"
      ? { kind: "weekdays", days: [...d.days].sort((a, b) => a - b) }
      : d.scheduleKind === "weekly"
        ? { kind: "weekly", timesPerWeek: d.timesPerWeek }
        : d.scheduleKind === "weeklyTotal" && allowsWeeklyTotal(m)
          ? { kind: "weeklyTotal" }
          : { kind: "daily" };
  const target = manual ? undefined : m.unit === "time" ? clockToTarget(m.id, d.clock) ?? undefined : Number(d.amount);
  return {
    name: d.name.trim(),
    description: d.description.trim() || undefined,
    category: d.category,
    icon: d.icon || undefined,
    source: manual ? "manual" : d.source,
    metric: m.id,
    target,
    subjectId: !manual && (m.needsSubject || m.subjectFilter) && d.subjectId ? d.subjectId : undefined,
    allowManual: d.tracking === "hybrid" ? true : undefined,
    schedule,
    countFrom: manual ? undefined : d.countFrom,
    remindAt: d.remind ? d.remindAt : undefined,
  };
}

/** The same rule `updateHabit` applies: a field given as undefined is cleared. */
function applyInput(base: Habit, input: HabitInput): Habit {
  const next = { ...base } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next as unknown as Habit;
}

function validate(d: Draft, others: Habit[], today: ISODate): Errors {
  const errors: Errors = {};
  const name = d.name.trim();
  if (!name) errors.name = "Give the habit a name, so you can tell it apart.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  else if (others.some((h) => !h.archived && h.name.trim().toLowerCase() === name.toLowerCase()))
    errors.name = `You already have a habit called “${name}”. Pick another name.`;
  const m = metricOf(d);
  if (d.tracking !== "manual") {
    if (m.needsSubject && !d.subjectId) errors.subject = "Choose the subject whose hours count.";
    if (m.unit !== "time") {
      const n = Number(d.amount);
      if (d.amount.trim() === "" || !Number.isFinite(n)) errors.amount = "Enter a number.";
      else if (n < m.min || n > m.max) errors.amount = `Enter a number from ${m.min} to ${m.max}.`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.countFrom)) errors.countFrom = "Choose the day to start counting from.";
    else if (d.countFrom > today) errors.countFrom = "Choose today or an earlier day.";
  }
  if (d.scheduleKind === "weekdays" && d.days.length === 0) errors.days = "Pick at least one day.";
  return errors;
}

const FIELD_ORDER: (keyof Errors)[] = ["name", "subject", "amount", "days", "countFrom"];

export function HabitForm({
  open,
  onClose,
  habit,
  preset,
  connect,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit this habit; otherwise a new one. */
  habit?: Habit | null;
  /** Start a new habit from a ready-made one. */
  preset?: HabitPreset | null;
  /** Open an existing manual habit ready to connect to a source. */
  connect?: { source: HabitSource; metric: HabitMetric } | null;
  onSaved?: (id: string) => void;
}) {
  const habits = useChronicle((s) => s.habits);
  const subjects = useChronicle((s) => s.subjects);
  const dailyHourTarget = useChronicle((s) => s.profile.dailyHourTarget);
  const weekStart = normalizeWeekStart(useChronicle((s) => s.profile.weekStart));
  const addHabit = useChronicle((s) => s.addHabit);
  const updateHabit = useChronicle((s) => s.updateHabit);
  const deleteHabit = useChronicle((s) => s.deleteHabit);
  const setHabitPaused = useChronicle((s) => s.setHabitPaused);
  const toast = useToast();
  const ctx = useHabitContext();
  const timeFormat = useTimeFormat();
  const today = ctx.today;
  const formId = useId();

  const editing = Boolean(habit);
  const initial = useMemo(() => {
    if (habit) {
      const d = draftFromHabit(habit, today, dailyHourTarget);
      if (connect && connect.source !== "manual") {
        const m = metricDef(connect.metric);
        // Connected later: its check-ins so far keep counting, as a hybrid.
        return { ...d, tracking: "hybrid" as const, source: connect.source, metric: m.id, amount: String(startAmount(m, dailyHourTarget)), countFrom: habit.createdOn };
      }
      return d;
    }
    return preset ? draftFromPreset(preset, today, dailyHourTarget) : blankDraft(today, dailyHourTarget);
    // Only when the form opens on something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habit?.id, preset?.key, connect?.metric, open]);

  const [draft, setDraft] = useState<Draft>(initial);
  const [chosenPreset, setChosenPreset] = useState<string | null>(preset?.key ?? null);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setChosenPreset(preset?.key ?? null);
    setSubmitted(false);
  }, [open, initial, preset?.key]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const others = habits.filter((h) => h.id !== habit?.id);
  const errors = validate(draft, others, today);
  const shown: Errors = submitted ? errors : {};
  const m = metricOf(draft);
  const auto = draft.tracking !== "manual";

  // Switching what's measured resets what only made sense for the old one.
  const chooseMetric = (id: HabitMetric) =>
    setDraft((d) => {
      const next = metricDef(id);
      return {
        ...d,
        metric: id,
        amount: String(startAmount(next, dailyHourTarget)),
        clock: next.unit === "time" ? targetClock(next, next.defaultTarget) : d.clock,
        subjectId: next.needsSubject || next.subjectFilter ? d.subjectId : "",
        scheduleKind: d.scheduleKind === "weeklyTotal" && !allowsWeeklyTotal(next) ? "daily" : d.scheduleKind,
      };
    });
  const chooseSource = (source: AutoSource) => {
    if (source === draft.source) return;
    setDraft((d) => ({ ...d, source }));
    chooseMetric(metricsFor(source)[0].id);
  };
  const chooseTracking = (tracking: Tracking) =>
    setDraft((d) => ({
      ...d,
      tracking,
      scheduleKind: tracking === "manual" && d.scheduleKind === "weeklyTotal" ? "daily" : d.scheduleKind,
    }));
  const applyPreset = (p: HabitPreset) => {
    setDraft(draftFromPreset(p, today, dailyHourTarget));
    setChosenPreset(p.key);
    setSubmitted(false);
  };

  // A name that sounds like something a source could keep.
  const suggestion = useMemo(() => {
    if (draft.tracking !== "manual" || draft.name.trim().length < 3) return null;
    return suggestConnection({ id: "draft", name: draft.name, createdOn: today, log: {}, cadence: "daily" });
  }, [draft.name, draft.tracking, today]);

  // The engine, run on the settings as they stand.
  const preview = useMemo(() => {
    const input = toInput(draft);
    const base: Habit = habit ?? { id: "preview", name: input.name || "New habit", createdOn: today, log: {}, cadence: "daily" };
    const h = applyInput(base, { ...input, name: input.name || base.name });
    if (draft.tracking !== "manual" && m.unit !== "time" && !Number.isFinite(Number(draft.amount))) return null;
    return {
      habit: h,
      item: todayHabits([h], ctx)[0] ?? null,
      days: recentDays(h, ctx, 14),
      streak: habitStreaks(h, ctx),
    };
  }, [draft, habit, ctx, today, m.unit]);

  const presets = useMemo(() => {
    const names = new Set(habits.filter((h) => !h.archived).map((h) => h.name.toLowerCase()));
    return habitPresets({ dailyHourTarget }).filter((p) => !names.has(p.name.toLowerCase()));
  }, [habits, dailyHourTarget]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    const first = FIELD_ORDER.find((k) => errors[k]);
    if (first) {
      // To the first thing that needs fixing.
      window.setTimeout(() => document.getElementById(`${formId}-${first}`)?.focus(), 30);
      return;
    }
    const input = toInput(draft);
    if (habit) {
      updateHabit(habit.id, input);
      if (draft.paused !== isPausedNow(habit, today)) setHabitPaused(habit.id, draft.paused);
      const before = toInput(draftFromHabit(habit, today, dailyHourTarget));
      const recount =
        before.source !== input.source ||
        before.metric !== input.metric ||
        before.target !== input.target ||
        before.subjectId !== input.subjectId ||
        before.countFrom !== input.countFrom ||
        JSON.stringify(before.schedule) !== JSON.stringify(input.schedule) ||
        before.allowManual !== input.allowManual;
      toast({
        title: "Habit updated",
        description: recount ? "Its days were worked out again from your records. Your corrections are kept." : undefined,
      });
      onSaved?.(habit.id);
    } else {
      const id = addHabit(input);
      if (draft.paused) setHabitPaused(id, true);
      toast({
        title: `“${input.name}” created`,
        description: auto
          ? `It fills in from your ${SOURCE_LABEL[draft.source]}${draft.tracking === "hybrid" ? ", and you can check it off too" : ""}.`
          : "Tick it off on the days it's due.",
        action: { label: "Undo", onClick: () => deleteHabit(id) },
      });
      onSaved?.(id);
    }
    onClose();
  }

  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const subjectOptional = m.subjectFilter && !m.needsSubject;
  const targetLabel =
    m.id === "bedtimeBy"
      ? "In bed by"
      : m.id === "wakeBy"
        ? "Up by"
        : m.compare === "atMost"
          ? "Limit for the day"
          : draft.scheduleKind === "weeklyTotal"
            ? "Target for the week"
            : "Target for the day";
  const unitWord = m.unit === "count" ? m.noun.split(" ")[0] : UNIT_WORD[m.unit];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit “${habit?.name}”` : "Create a habit"}
      description={
        editing
          ? "Changes apply to its whole history, worked out again from your records. Corrections you made stay."
          : "Name it, choose how it's tracked, and it keeps itself from then on."
      }
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            {editing ? "Save changes" : "Create habit"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-6">
        {!editing && presets.length > 0 && (
          <section aria-labelledby={`${formId}-presets`}>
            <p id={`${formId}-presets`} className="mb-2 text-[0.78rem] font-semibold text-paper/60">
              Start from a ready-made habit <span className="font-normal text-paper/45">or fill in your own below</span>
            </p>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {presets.map((p) => {
                const Icon = HABIT_ICONS.find((i) => i.id === p.icon)?.icon ?? sourceIcon(p.source);
                const on = chosenPreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.76rem] font-semibold transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                      on ? "border-accent/40 bg-accent/15 text-accent" : "border-line bg-paper/[0.03] text-paper/75 hover:border-paper/25 hover:text-paper",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── What it is ─────────────────────────────────────── */}
        <div className="space-y-4">
          <Field
            label="Habit name"
            hint="A short name you'll recognise at a glance."
            example="Morning revision"
            error={shown.name}
          >
            <Input
              id={`${formId}-name`}
              value={draft.name}
              maxLength={80}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Name the habit"
              autoComplete="off"
            />
          </Field>
          {suggestion && (
            <div className="-mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-accent/[0.07] px-3 py-2 text-[0.76rem] text-paper/75">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">{suggestion.reason}</span>
              <button
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, tracking: "auto", source: suggestion.source as AutoSource }));
                  chooseMetric(suggestion.metric);
                }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
              >
                Track it from {SOURCE_LABEL[suggestion.source]} <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            </div>
          )}
          <Field label="Description" optional hint="Why it matters, or what counts. Only you see it.">
            <Textarea
              value={draft.description}
              maxLength={280}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What it's for"
              className="min-h-[64px]"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <Field label="Category" hint="Groups it with similar habits.">
              <Select value={draft.category} onChange={(e) => set("category", e.target.value as HabitCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <p id={`${formId}-icon`} className="mb-2 text-[0.78rem] font-semibold text-paper/60">
                Icon <span className="ml-1 font-normal text-paper/45">Optional</span>
              </p>
              <div role="group" aria-labelledby={`${formId}-icon`} className="flex flex-wrap gap-1">
                {HABIT_ICONS.map(({ id, icon: Icon, label }) => {
                  const on = draft.icon === id;
                  return (
                    <Tooltip key={id} content={label} describe={false}>
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={on}
                        onClick={() => set("icon", on ? "" : id)}
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-lg border transition-colors duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                          on ? "border-accent/50 bg-accent/15 text-accent" : "border-transparent bg-paper/[0.04] text-paper/60 hover:text-paper",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── How it's tracked ───────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="mb-2 text-[0.78rem] font-semibold text-paper/60">How it&apos;s tracked</legend>
          <Segmented<Tracking>
            className="w-fit"
            label="How it's tracked"
            value={draft.tracking}
            onChange={chooseTracking}
            options={[
              { value: "auto", label: "Automatic", hint: "Fills in from your records" },
              { value: "hybrid", label: "Hybrid", hint: "From your records, or your check-in" },
              { value: "manual", label: "Manual", hint: "You tick it off" },
            ]}
          />
          <p className="text-[0.76rem] leading-relaxed text-paper/60">{TRACKING_TEXT[draft.tracking]}</p>

          {auto && (
            <div role="group" aria-label="Where it reads from" className="grid gap-2 sm:grid-cols-2">
              {AUTO_SOURCES.map((s) => {
                const Icon = sourceIcon(s.id);
                const on = draft.source === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => chooseSource(s.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                      on ? "border-accent/45 bg-accent/[0.08]" : "border-line bg-paper/[0.02] hover:border-paper/25",
                    )}
                  >
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", on ? "bg-accent text-accent-fg" : "bg-accent/10 text-accent")}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.84rem] font-semibold text-paper">{SOURCE_LABEL[s.id]}</span>
                      <span className="mt-0.5 block text-[0.72rem] leading-snug text-paper/60">{s.reads}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        {/* ── What completes a day ───────────────────────────── */}
        <div className="space-y-4">
          {auto && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What counts" hint={m.explain}>
                <Select value={draft.metric} onChange={(e) => chooseMetric(e.target.value as HabitMetric)}>
                  {metricsFor(draft.source).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {(m.needsSubject || m.subjectFilter) && (
                <Field
                  label="Subject"
                  optional={subjectOptional}
                  hint={m.needsSubject ? "Only hours on this subject count." : "Leave it on any subject, or count one only."}
                  error={shown.subject}
                >
                  <Select id={`${formId}-subject`} value={draft.subjectId} onChange={(e) => set("subjectId", e.target.value)}>
                    <option value="">{m.needsSubject ? "Choose a subject" : "Any subject"}</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          )}

          {auto &&
            (m.unit === "time" ? (
              <div className="max-w-xs">
                <TimeField
                  label={targetLabel}
                  value={draft.clock}
                  onChange={(v) => set("clock", v)}
                  format={timeFormat}
                  context={m.id === "bedtimeBy" ? "bed" : "wake"}
                  size="md"
                  sheetDescription={m.explain}
                />
                <p className="mt-1 text-[0.72rem] leading-relaxed text-paper/55">{m.example}</p>
              </div>
            ) : (
              <Field
                label={targetLabel}
                hint={
                  m.compare === "atMost"
                    ? "A day at or under this counts."
                    : draft.scheduleKind === "weeklyTotal"
                      ? "The week counts once its days add up to this."
                      : "A day that reaches this counts. Less shows as partly done."
                }
                example={m.example.replace(/^Enter /, "").replace(/\.$/, "")}
                error={shown.amount}
              >
                <UnitInput
                  id={`${formId}-amount`}
                  unit={unitWord}
                  type="number"
                  inputMode="decimal"
                  min={m.min}
                  max={m.max}
                  step={m.step}
                  value={draft.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </Field>
            ))}

          {/* When it's due */}
          <fieldset>
            <legend className="mb-2 text-[0.78rem] font-semibold text-paper/60">When it&apos;s due</legend>
            <Segmented<HabitSchedule["kind"]>
              className="w-fit"
              label="When it's due"
              value={draft.scheduleKind}
              onChange={(v) => set("scheduleKind", v)}
              options={[
                { value: "daily", label: "Every day" },
                { value: "weekdays", label: "Chosen days" },
                { value: "weekly", label: "Days a week" },
                ...(auto && allowsWeeklyTotal(m) ? [{ value: "weeklyTotal" as const, label: "Weekly total" }] : []),
              ]}
            />
            <p className="mt-2 text-[0.76rem] leading-relaxed text-paper/60">
              {draft.scheduleKind === "daily" && "Due every day."}
              {draft.scheduleKind === "weekdays" && "Due on the days you pick. The others are rest days: they never break a streak."}
              {draft.scheduleKind === "weekly" && "Due on any days, so many times each week. The streak counts weeks."}
              {draft.scheduleKind === "weeklyTotal" && "The week's total must reach the target, on any days. The streak counts weeks."}
            </p>
            {draft.scheduleKind === "weekdays" && (
              <div className="mt-3">
                <div id={`${formId}-days`} tabIndex={-1} role="group" aria-label="Days it's due" className="flex flex-wrap gap-1.5 focus:outline-none">
                  {order.map((d) => {
                    const on = draft.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        aria-label={WEEKDAY[d]}
                        onClick={() => set("days", on ? draft.days.filter((x) => x !== d) : [...draft.days, d])}
                        className={cn(
                          "h-9 min-w-[2.75rem] rounded-full border px-2 text-[0.76rem] font-semibold transition-colors duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                          on ? "border-accent bg-accent text-accent-fg" : "border-line bg-paper/[0.03] text-paper/65 hover:text-paper",
                        )}
                      >
                        {WEEKDAY[d].slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                {shown.days && (
                  <p role="alert" className="mt-1 text-[0.72rem] font-medium text-danger">
                    {shown.days}
                  </p>
                )}
              </div>
            )}
            {draft.scheduleKind === "weekly" && (
              <div className="mt-3 flex items-center gap-3">
                <Field label="Days each week" className="w-40">
                  <Select value={String(draft.timesPerWeek)} onChange={(e) => set("timesPerWeek", Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "day" : "days"}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </fieldset>
        </div>

        {/* ── More options ───────────────────────────────────── */}
        <Disclosure
          summary={
            <span>
              More options{" "}
              <span className="font-normal text-paper/50">
                {auto ? "start date, reminder, pause" : "reminder, pause"}
              </span>
            </span>
          }
          defaultOpen={Boolean(habit && (habit.remindAt || isPausedNow(habit, today)))}
          className="rounded-2xl border border-line px-4"
        >
          <div className="space-y-4 pb-3">
            {auto && (
              <Field
                label="Count records from"
                hint={
                  <>
                    Records from this day on count. Pick an earlier day to fill in history from what you&apos;ve already logged;
                    move it at any time and the days are worked out again.
                  </>
                }
                error={shown.countFrom}
              >
                <Input
                  id={`${formId}-countFrom`}
                  type="date"
                  max={today}
                  value={draft.countFrom}
                  onChange={(e) => set("countFrom", e.target.value)}
                  className="max-w-[12rem]"
                />
              </Field>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={`${formId}-remind`} className="text-[0.84rem] font-semibold text-paper">
                  Remind me if it&apos;s still open
                </p>
                <p className="mt-0.5 text-[0.72rem] leading-relaxed text-paper/55">
                  A note in your notifications at this time, on days it&apos;s due and not yet done. Without one, the general
                  habit reminder in Settings applies.
                </p>
              </div>
              <Switch checked={draft.remind} onChange={(v) => set("remind", v)} label="Remind me if it's still open" describedBy={`${formId}-remind`} />
            </div>
            {draft.remind && (
              <div className="max-w-xs">
                <TimeField label="Reminder time" value={draft.remindAt} onChange={(v) => set("remindAt", v)} format={timeFormat} size="md" />
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={`${formId}-pause`} className="text-[0.84rem] font-semibold text-paper">
                  Paused
                </p>
                <p className="mt-0.5 text-[0.72rem] leading-relaxed text-paper/55">
                  For a break, an illness or a mock week. Paused days are neither kept nor missed, so streaks wait for you.
                </p>
              </div>
              <Switch checked={draft.paused} onChange={(v) => set("paused", v)} label="Paused" describedBy={`${formId}-pause`} />
            </div>
          </div>
        </Disclosure>

        {/* ── Preview ────────────────────────────────────────── */}
        {preview && (
          <section aria-label="Preview from your records" className="inset-panel space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="eyebrow">Preview from your records</p>
              <p className="text-[0.7rem] text-paper/50">Nothing is saved until you {editing ? "save" : "create it"}.</p>
            </div>
            <p className="text-[0.84rem] leading-relaxed text-paper/80">
              <span className="font-semibold text-paper">{describeTarget(preview.habit, timeFormat)}</span>
              {" · "}
              {describeSchedule(preview.habit)}
              {" · "}
              {describeSource(preview.habit)}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8rem]">
              <p>
                <span className="text-paper/55">Today: </span>
                <span className="font-semibold text-paper">
                  {preview.item
                    ? `${progressText(preview.item, timeFormat)}${preview.item.done ? "" : ` (${Math.round(preview.item.progress * 100)}%)`}`
                    : preview.days[preview.days.length - 1]?.status === "before"
                      ? `Starts ${formatDate(draft.countFrom)}`
                      : "Not due today"}
                </span>
              </p>
              {preview.streak.current > 0 && (
                <p>
                  <span className="text-paper/55">Streak: </span>
                  <span className="font-semibold text-paper">
                    {preview.streak.current} {preview.streak.unit === "week" ? "weeks" : "days"}
                  </span>
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[0.7rem] text-paper/55">The last two weeks</p>
              <ol className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
                {preview.days.map((d) => (
                  <li
                    key={d.date}
                    className={cn("h-5 rounded-[4px]", DAY_STYLE[d.status])}
                    aria-label={`${formatDate(d.date)}: ${DAY_LABEL[d.status]}`}
                  />
                ))}
              </ol>
            </div>
          </section>
        )}
      </form>
    </Modal>
  );
}

/** A number field with its unit inside, on the right. Takes the props `Field` wires up. */
function UnitInput({ unit, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { unit?: string }) {
  return (
    <div className="relative max-w-[14rem]">
      <Input {...props} className={cn("tabular", unit && "pr-24", className)} />
      {unit && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[0.8rem] text-paper/50">
          {unit}
        </span>
      )}
    </div>
  );
}
