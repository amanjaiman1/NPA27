import type { ISODate, JournalEntry, LifeEntry, LifeField } from "./types";
import { daysBetween, fromISODate, round, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   LIFE DASHBOARD ANALYTICS
   Pure functions over the life log and the journal.

   Three rules run through all of it:
   1. Only what was recorded counts. A day without a water reading is
      left out of the water average; it is not a day of 0 litres.
   2. Every number says what it is made of: how many days carry a
      reading, and over what span.
   3. Patterns are described as things that go together, never as causes,
      and only once there are enough days for them to mean anything.
   ════════════════════════════════════════════════════════════════ */

export const LIFE_TARGETS = {
  sleepHours: 7.5,
  deepWorkHours: 6,
  waterLiters: 3,
  meditationMin: 15,
  exerciseMinutes: 30,
  walkKm: 5,
  screenTimeMin: 90, // a ceiling, not a floor
};

/** Days of the week, Monday first, as everywhere else in the app. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── what can be tracked ─────────────────────────────────────── */

export interface LifeFieldMeta {
  id: LifeField;
  label: string;
  hint: string;
}

/** The measurements a person can choose to track, in form order. */
export const LIFE_FIELDS: LifeFieldMeta[] = [
  { id: "sleep", label: "Sleep", hint: "Bedtime, wake-up and how well you slept" },
  { id: "exercise", label: "Exercise", hint: "Minutes and the kind of activity" },
  { id: "walk", label: "Walking", hint: "Distance walked" },
  { id: "run", label: "Running", hint: "Distance run" },
  { id: "water", label: "Water", hint: "Litres drunk" },
  { id: "meditation", label: "Meditation", hint: "Minutes" },
  { id: "screen", label: "Screen time", hint: "Time on screens outside study" },
  { id: "weight", label: "Weight", hint: "Body weight in kg" },
  { id: "deepWork", label: "Deep work", hint: "Hours of focused, undistracted work" },
];

export const ALL_LIFE_FIELDS: LifeField[] = LIFE_FIELDS.map((f) => f.id);

/** What a new log starts with: the few things most people want to see. */
export const CORE_LIFE_FIELDS: LifeField[] = ["sleep", "exercise", "water", "screen"];

/** Whether a day carries a reading for one field. */
export function fieldRecorded(e: LifeEntry, field: LifeField): boolean {
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  switch (field) {
    case "sleep":
      return n(e.sleepHours) || n(e.sleepQuality) || Boolean(e.bedtime || e.wakeTime);
    case "exercise":
      return n(e.exerciseMinutes) || Boolean(e.exerciseType);
    case "walk":
      return n(e.walkKm);
    case "run":
      return n(e.runKm);
    case "water":
      return n(e.waterLiters);
    case "meditation":
      return n(e.meditationMin);
    case "screen":
      return n(e.screenTimeMin);
    case "weight":
      return n(e.weightKg);
    case "deepWork":
      return n(e.deepWorkHours);
    default:
      return false;
  }
}

/**
 * The fields a person tracks. Their own choice when they've made one;
 * otherwise whatever they have actually recorded, so a form that has never
 * been used for weight doesn't ask for it; and a short core list for a log
 * that is still empty.
 */
export function trackedFields(chosen: LifeField[] | undefined, lifeLog: LifeEntry[] = []): LifeField[] {
  if (chosen?.length) return ALL_LIFE_FIELDS.filter((f) => chosen.includes(f));
  const used = ALL_LIFE_FIELDS.filter((f) => lifeLog.some((e) => fieldRecorded(e, f)));
  return used.length ? used : CORE_LIFE_FIELDS;
}

export function todayEntry(lifeLog: LifeEntry[], today = toISODate(new Date())): LifeEntry | undefined {
  return lifeLog.find((l) => l.date === today);
}

/** True when a day carries at least one reading (not just a link or a note). */
export function hasReadings(e: LifeEntry | undefined): boolean {
  if (!e) return false;
  return [
    e.sleepHours,
    e.sleepQuality,
    e.walkKm,
    e.runKm,
    e.exerciseMinutes,
    e.waterLiters,
    e.meditationMin,
    e.weightKg,
    e.screenTimeMin,
    e.deepWorkHours,
  ].some((v) => typeof v === "number") || Boolean(e.bedtime || e.wakeTime);
}

/** Exercise of any kind recorded for the day. `null` when the day says nothing about it. */
export function exercisedOn(e: LifeEntry | undefined): boolean | null {
  if (!e) return null;
  const vals = [e.exerciseMinutes, e.walkKm, e.runKm];
  if (vals.every((v) => v == null)) return null;
  return vals.some((v) => (v ?? 0) > 0);
}

/* ── clock maths ─────────────────────────────────────────────── */

/** Minutes after noon, so 23:30 and 00:30 sit an hour apart rather than 23. */
export function bedtimeMinutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const raw = h * 60 + m;
  return raw < 12 * 60 ? raw + 24 * 60 : raw;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

/* ── spans of time ───────────────────────────────────────────── */

export interface DateSpan {
  from: ISODate;
  to: ISODate;
}

export type SpanPreset = "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "thisYear" | "custom";

export const SPAN_PRESETS: { id: SpanPreset; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function shiftDay(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Inclusive day count. */
export function spanLength(span: DateSpan): number {
  return Math.max(0, daysBetween(span.from, span.to) + 1);
}

export function presetSpan(preset: SpanPreset, today: ISODate): DateSpan {
  const d = fromISODate(today);
  switch (preset) {
    case "7d":
      return { from: shiftDay(today, -6), to: today };
    case "90d":
      return { from: shiftDay(today, -89), to: today };
    case "thisMonth":
      return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
    case "lastMonth":
      return {
        from: toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        to: toISODate(new Date(d.getFullYear(), d.getMonth(), 0)),
      };
    case "thisYear":
      return { from: toISODate(new Date(d.getFullYear(), 0, 1)), to: today };
    case "30d":
    case "custom":
    default:
      return { from: shiftDay(today, -29), to: today };
  }
}

/**
 * A span that makes sense: in order, never past today. A span in the future
 * would average days that haven't happened.
 */
export function normalizeSpan(span: DateSpan, today: ISODate): DateSpan {
  let { from, to } = span;
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) from = shiftDay(today, -29);
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) to = today;
  if (to > today) to = today;
  if (from > to) from = to;
  return { from, to };
}

/** The same number of days, immediately before. */
export function previousSpan(span: DateSpan): DateSpan {
  const n = spanLength(span);
  return { from: shiftDay(span.from, -n), to: shiftDay(span.from, -1) };
}

function inSpan(date: ISODate, span: DateSpan): boolean {
  return date >= span.from && date <= span.to;
}

export function describeSpan(span: DateSpan): string {
  const f = fromISODate(span.from);
  const t = fromISODate(span.to);
  const fmt = (d: Date, withYear: boolean) =>
    `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
  const sameYear = f.getFullYear() === t.getFullYear();
  return `${fmt(f, !sameYear)} – ${fmt(t, true)}`;
}

/* ── the report ──────────────────────────────────────────────── */

export type ReportGroup = "Study" | "Sleep" | "Movement" | "Wellbeing" | "Mind";

export type ReportMetricId =
  | "studyHours"
  | "studyDays"
  | "studyPerStudyDay"
  | "sleep"
  | "sleepQuality"
  | "bedtimeSpread"
  | "exerciseDays"
  | "exerciseMinutes"
  | "walk"
  | "run"
  | "water"
  | "meditation"
  | "screen"
  | "weight"
  | "deepWork"
  | "mood"
  | "energy"
  | "focus";

export interface ReportMetric {
  id: ReportMetricId;
  group: ReportGroup;
  label: string;
  unit: string;
  decimals: number;
  /** The headline number, or null when nothing was recorded in the span. */
  value: number | null;
  /** The same measure over the previous span (for weight: the first reading in this one). */
  previous: number | null;
  /** value − previous, in the metric's own unit. */
  change: number | null;
  better: "higher" | "lower" | null;
  /** Days in the span that carry the readings this is made of. */
  recorded: number;
  /** Days in the span (up to today). */
  days: number;
  /** One plain sentence on how the number is worked out. */
  basis: string;
}

interface Readings {
  journal: JournalEntry[];
  life: LifeEntry[];
  days: number;
}

function slice(journal: JournalEntry[], lifeLog: LifeEntry[], span: DateSpan): Readings {
  return {
    journal: journal.filter((e) => inSpan(e.date, span)),
    life: lifeLog.filter((e) => inSpan(e.date, span)),
    days: spanLength(span),
  };
}

function values(rows: LifeEntry[], read: (e: LifeEntry) => number | undefined): number[] {
  const out: number[] = [];
  for (const e of rows) {
    const v = read(e);
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

const sumOf = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) : null);

interface MetricSpec {
  id: ReportMetricId;
  group: ReportGroup;
  label: string;
  unit: string;
  decimals: number;
  better: "higher" | "lower" | null;
  field?: LifeField;
  /** [value, recorded days] for a slice. */
  measure: (r: Readings) => [number | null, number];
  basis: (recorded: number, days: number) => string;
}

const nightsWord = (n: number) => `${n} night${n === 1 ? "" : "s"}`;
const daysWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

const SPECS: MetricSpec[] = [
  {
    id: "studyHours",
    group: "Study",
    label: "Study hours",
    unit: "h",
    decimals: 1,
    better: "higher",
    measure: (r) => {
      const logged = r.journal.filter((e) => e.totalHours > 0);
      return [r.journal.length ? round(r.journal.reduce((a, e) => a + (e.totalHours || 0), 0), 1) : null, logged.length];
    },
    basis: (rec, days) => `Every hour logged in the journal, added up. Hours were logged on ${rec} of ${daysWord(days)}.`,
  },
  {
    id: "studyDays",
    group: "Study",
    label: "Days studied",
    unit: "days",
    decimals: 0,
    better: "higher",
    measure: (r) => {
      const n = r.journal.filter((e) => e.totalHours > 0).length;
      return [n, n];
    },
    basis: (_rec, days) => `Days with any study hours in the journal, out of ${daysWord(days)}.`,
  },
  {
    id: "studyPerStudyDay",
    group: "Study",
    label: "Hours per study day",
    unit: "h",
    decimals: 1,
    better: "higher",
    measure: (r) => {
      const logged = r.journal.filter((e) => e.totalHours > 0);
      const m = mean(logged.map((e) => e.totalHours));
      return [m == null ? null : round(m, 1), logged.length];
    },
    basis: (rec) => `Average over the ${daysWord(rec)} you studied; days with no hours are left out.`,
  },
  {
    id: "sleep",
    group: "Sleep",
    label: "Sleep",
    unit: "h",
    decimals: 1,
    better: "higher",
    field: "sleep",
    measure: (r) => {
      const v = values(r.life, (e) => (e.sleepHours && e.sleepHours > 0 ? e.sleepHours : undefined));
      const m = mean(v);
      return [m == null ? null : round(m, 1), v.length];
    },
    basis: (rec, days) => `Average over the ${nightsWord(rec)} recorded, of ${days}.`,
  },
  {
    id: "sleepQuality",
    group: "Sleep",
    label: "Sleep quality",
    unit: "/5",
    decimals: 1,
    better: "higher",
    field: "sleep",
    measure: (r) => {
      const v = values(r.life, (e) => e.sleepQuality);
      const m = mean(v);
      return [m == null ? null : round(m, 1), v.length];
    },
    basis: (rec) => `Average of the ${nightsWord(rec)} you rated, from 1 (poor) to 5 (great).`,
  },
  {
    id: "bedtimeSpread",
    group: "Sleep",
    label: "Bedtime spread",
    unit: "min",
    decimals: 0,
    better: "lower",
    field: "sleep",
    measure: (r) => {
      const v = r.life.map((e) => bedtimeMinutes(e.bedtime)).filter((x): x is number => x != null);
      const sd = v.length >= 4 ? stdDev(v) : null;
      return [sd == null ? null : Math.round(sd), v.length];
    },
    basis: (rec) =>
      `How much your bedtime moves around: the typical distance from your average bedtime, over ${nightsWord(rec)}. Lower is a steadier routine. Needs at least 4 nights.`,
  },
  {
    id: "exerciseDays",
    group: "Movement",
    label: "Active days",
    unit: "days",
    decimals: 0,
    better: "higher",
    field: "exercise",
    measure: (r) => {
      let rec = 0;
      let active = 0;
      for (const e of r.life) {
        const x = exercisedOn(e);
        if (x == null) continue;
        rec++;
        if (x) active++;
      }
      return [rec ? active : null, rec];
    },
    basis: (rec) => `Days with exercise, a walk or a run recorded, out of the ${daysWord(rec)} that say anything about activity.`,
  },
  {
    id: "exerciseMinutes",
    group: "Movement",
    label: "Exercise",
    unit: "min",
    decimals: 0,
    better: "higher",
    field: "exercise",
    measure: (r) => {
      const v = values(r.life, (e) => e.exerciseMinutes);
      return [sumOf(v), v.length];
    },
    basis: (rec) => `Minutes recorded, added up, over ${daysWord(rec)}.`,
  },
  {
    id: "walk",
    group: "Movement",
    label: "Walking",
    unit: "km",
    decimals: 1,
    better: "higher",
    field: "walk",
    measure: (r) => {
      const v = values(r.life, (e) => e.walkKm);
      const s = sumOf(v);
      return [s == null ? null : round(s, 1), v.length];
    },
    basis: (rec) => `Kilometres recorded, added up, over ${daysWord(rec)}.`,
  },
  {
    id: "run",
    group: "Movement",
    label: "Running",
    unit: "km",
    decimals: 1,
    better: "higher",
    field: "run",
    measure: (r) => {
      const v = values(r.life, (e) => e.runKm);
      const s = sumOf(v);
      return [s == null ? null : round(s, 1), v.length];
    },
    basis: (rec) => `Kilometres recorded, added up, over ${daysWord(rec)}.`,
  },
  {
    id: "water",
    group: "Wellbeing",
    label: "Water",
    unit: "L",
    decimals: 1,
    better: "higher",
    field: "water",
    measure: (r) => {
      const v = values(r.life, (e) => e.waterLiters);
      const m = mean(v);
      return [m == null ? null : round(m, 1), v.length];
    },
    basis: (rec) => `Average a day, over the ${daysWord(rec)} recorded.`,
  },
  {
    id: "meditation",
    group: "Wellbeing",
    label: "Meditation",
    unit: "min",
    decimals: 0,
    better: "higher",
    field: "meditation",
    measure: (r) => {
      const v = values(r.life, (e) => e.meditationMin);
      const m = mean(v);
      return [m == null ? null : Math.round(m), v.length];
    },
    basis: (rec) => `Average a day, over the ${daysWord(rec)} recorded.`,
  },
  {
    id: "screen",
    group: "Wellbeing",
    label: "Screen time",
    unit: "min",
    decimals: 0,
    better: "lower",
    field: "screen",
    measure: (r) => {
      const v = values(r.life, (e) => e.screenTimeMin);
      const m = mean(v);
      return [m == null ? null : Math.round(m), v.length];
    },
    basis: (rec) => `Average a day outside study, over the ${daysWord(rec)} recorded.`,
  },
  {
    id: "weight",
    group: "Wellbeing",
    label: "Weight",
    unit: "kg",
    decimals: 1,
    better: null,
    field: "weight",
    measure: (r) => {
      const rows = r.life.filter((e) => typeof e.weightKg === "number").sort((a, b) => a.date.localeCompare(b.date));
      return [rows.length ? rows[rows.length - 1].weightKg! : null, rows.length];
    },
    basis: (rec) => `The latest reading; the change is against the first reading in the period (${rec} reading${rec === 1 ? "" : "s"}).`,
  },
  {
    id: "deepWork",
    group: "Study",
    label: "Deep work",
    unit: "h",
    decimals: 1,
    better: "higher",
    field: "deepWork",
    measure: (r) => {
      const v = values(r.life, (e) => e.deepWorkHours);
      const s = sumOf(v);
      return [s == null ? null : round(s, 1), v.length];
    },
    basis: (rec) => `Focused hours recorded in the Life Dashboard, added up, over ${daysWord(rec)}.`,
  },
  {
    id: "mood",
    group: "Mind",
    label: "Mood",
    unit: "/5",
    decimals: 1,
    better: "higher",
    measure: (r) => {
      const m = mean(r.journal.map((e) => e.mood).filter((v) => typeof v === "number"));
      return [m == null ? null : round(m, 1), r.journal.length];
    },
    basis: (rec) => `Average of the mood you rated in ${rec} journal entr${rec === 1 ? "y" : "ies"}, from 1 to 5.`,
  },
  {
    id: "energy",
    group: "Mind",
    label: "Energy",
    unit: "/5",
    decimals: 1,
    better: "higher",
    measure: (r) => {
      const m = mean(r.journal.map((e) => e.energy).filter((v) => typeof v === "number"));
      return [m == null ? null : round(m, 1), r.journal.length];
    },
    basis: (rec) => `Average energy rating in ${rec} journal entr${rec === 1 ? "y" : "ies"}.`,
  },
  {
    id: "focus",
    group: "Mind",
    label: "Focus",
    unit: "/5",
    decimals: 1,
    better: "higher",
    measure: (r) => {
      const m = mean(r.journal.map((e) => e.focus).filter((v) => typeof v === "number"));
      return [m == null ? null : round(m, 1), r.journal.length];
    },
    basis: (rec) => `Average focus rating in ${rec} journal entr${rec === 1 ? "y" : "ies"}.`,
  },
];

export interface ReportBucket {
  key: string;
  /** Axis label. */
  label: string;
  /** Tooltip label. */
  full: string;
  from: ISODate;
  to: ISODate;
  studyHours: number;
  studyDays: number;
  /** Journal entries in the bucket. With none, study hours are unknown rather than 0. */
  journalDays: number;
  /** Mean of the nights recorded in the bucket, or null when none were. */
  sleep: number | null;
  sleepNights: number;
  activeDays: number;
  /** Days in the bucket that say anything about activity. */
  activityDays: number;
  screen: number | null;
  mood: number | null;
}

export interface DailyRow {
  date: ISODate;
  /** null: no journal entry that day. */
  study: number | null;
  mood: number | null;
  sleep: number | null;
  quality: number | null;
  bedtime?: string;
  wake?: string;
  exercise: number | null;
  exerciseType?: string;
  walk: number | null;
  run: number | null;
  water: number | null;
  meditation: number | null;
  screen: number | null;
  weight: number | null;
  deepWork: number | null;
  note?: string;
  hasJournal: boolean;
  hasLife: boolean;
  files: number;
}

export interface Observation {
  id: string;
  text: string;
  /** What the observation stands on, in plain words. */
  basis: string;
  tone: "positive" | "neutral" | "attention";
}

export interface LifeReport {
  span: DateSpan;
  previous: DateSpan;
  days: number;
  metrics: ReportMetric[];
  granularity: "day" | "week" | "month";
  buckets: ReportBucket[];
  daily: DailyRow[];
  observations: Observation[];
  /** Days with a journal entry / a life entry in the span. */
  coverage: { journal: number; life: number };
}

function mondayOf(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return shiftDay(iso, -((d.getDay() + 6) % 7));
}

function bucketsFor(span: DateSpan, journal: JournalEntry[], lifeLog: LifeEntry[]) {
  const n = spanLength(span);
  const granularity: "day" | "week" | "month" = n <= 31 ? "day" : n <= 190 ? "week" : "month";
  const ranges: { key: string; label: string; full: string; from: ISODate; to: ISODate }[] = [];
  if (granularity === "day") {
    for (let i = 0; i < n; i++) {
      const date = shiftDay(span.from, i);
      const d = fromISODate(date);
      ranges.push({
        key: date,
        label: n <= 7 ? WEEKDAYS[(d.getDay() + 6) % 7] : String(d.getDate()),
        full: `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
        from: date,
        to: date,
      });
    }
  } else if (granularity === "week") {
    for (let start = mondayOf(span.from); start <= span.to; start = shiftDay(start, 7)) {
      const from = start < span.from ? span.from : start;
      const end = shiftDay(start, 6);
      const to = end > span.to ? span.to : end;
      const d = fromISODate(start);
      ranges.push({
        key: start,
        label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        full: `Week of ${d.getDate()} ${MONTHS[d.getMonth()]}`,
        from,
        to,
      });
    }
  } else {
    const f = fromISODate(span.from);
    for (let y = f.getFullYear(), m = f.getMonth(); ; m++) {
      const first = new Date(y, m, 1);
      const iso = toISODate(first);
      if (iso > span.to) break;
      const last = toISODate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
      ranges.push({
        key: iso.slice(0, 7),
        label: MONTHS[first.getMonth()],
        full: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`,
        from: iso < span.from ? span.from : iso,
        to: last > span.to ? span.to : last,
      });
      if (ranges.length > 60) break;
    }
  }

  const buckets: ReportBucket[] = ranges.map((r) => {
    const j = journal.filter((e) => e.date >= r.from && e.date <= r.to);
    const l = lifeLog.filter((e) => e.date >= r.from && e.date <= r.to);
    const nights = values(l, (e) => (e.sleepHours && e.sleepHours > 0 ? e.sleepHours : undefined));
    const screens = values(l, (e) => e.screenTimeMin);
    let activityDays = 0;
    let activeDays = 0;
    for (const e of l) {
      const x = exercisedOn(e);
      if (x == null) continue;
      activityDays++;
      if (x) activeDays++;
    }
    const sleepMean = mean(nights);
    const screenMean = mean(screens);
    const moodMean = mean(j.map((e) => e.mood));
    return {
      ...r,
      studyHours: round(j.reduce((a, e) => a + (e.totalHours || 0), 0), 1),
      studyDays: j.filter((e) => e.totalHours > 0).length,
      journalDays: j.length,
      sleep: sleepMean == null ? null : round(sleepMean, 1),
      sleepNights: nights.length,
      activeDays,
      activityDays,
      screen: screenMean == null ? null : Math.round(screenMean),
      mood: moodMean == null ? null : round(moodMean, 1),
    };
  });
  return { granularity, buckets };
}

function dailyRows(span: DateSpan, journal: JournalEntry[], lifeLog: LifeEntry[]): DailyRow[] {
  const j = new Map(journal.filter((e) => inSpan(e.date, span)).map((e) => [e.date, e] as const));
  const l = new Map(lifeLog.filter((e) => inSpan(e.date, span)).map((e) => [e.date, e] as const));
  const out: DailyRow[] = [];
  const num = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  for (let date = span.to; date >= span.from; date = shiftDay(date, -1)) {
    const je = j.get(date);
    const le = l.get(date);
    out.push({
      date,
      study: je ? round(je.totalHours || 0, 1) : null,
      mood: je ? je.mood : null,
      sleep: le?.sleepHours && le.sleepHours > 0 ? le.sleepHours : null,
      quality: num(le?.sleepQuality),
      bedtime: le?.bedtime || je?.sleepTime || undefined,
      wake: le?.wakeTime || je?.wakeTime || undefined,
      exercise: num(le?.exerciseMinutes),
      exerciseType: le?.exerciseType,
      walk: num(le?.walkKm),
      run: num(le?.runKm),
      water: num(le?.waterLiters),
      meditation: num(le?.meditationMin),
      screen: num(le?.screenTimeMin),
      weight: num(le?.weightKg),
      deepWork: num(le?.deepWorkHours),
      note: le?.note,
      hasJournal: Boolean(je),
      hasLife: hasReadings(le),
      files: (je?.fileIds?.length ?? 0) + (le?.fileIds?.length ?? 0),
    });
    if (out.length > 400) break;
  }
  return out;
}

/** The fewest days on each side before a comparison is shown at all. */
export const MIN_GROUP = 4;

function observationsFor(
  span: DateSpan,
  r: Readings,
  metrics: ReportMetric[],
  tracked: Set<LifeField>,
): Observation[] {
  const out: Observation[] = [];
  const studyByDate = new Map(r.journal.map((e) => [e.date, e.totalHours || 0] as const));
  const lifeByDate = new Map(r.life.map((e) => [e.date, e] as const));
  const fmtH = (v: number) => `${round(v, 1)} h`;

  // Study against the previous period, in hours, not percentages.
  const study = metrics.find((m) => m.id === "studyHours");
  const days = metrics.find((m) => m.id === "studyDays");
  if (study?.value != null && study.previous != null && days) {
    const diff = round(study.value - study.previous, 1);
    if (Math.abs(diff) >= 0.5) {
      out.push({
        id: "study-vs-previous",
        tone: diff > 0 ? "positive" : "attention",
        text: `You studied ${fmtH(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than in the ${spanLength(span)} days before (${fmtH(study.value)} against ${fmtH(study.previous)}).`,
        basis: "Journal hours in this period and the same number of days before it.",
      });
    }
  }

  // Consistency: how often, and the longest unbroken run.
  if (days?.value != null && r.days >= 7) {
    let best = 0;
    let run = 0;
    for (let d = span.from; d <= span.to; d = shiftDay(d, 1)) {
      if ((studyByDate.get(d) ?? 0) > 0) {
        run++;
        best = Math.max(best, run);
      } else run = 0;
    }
    out.push({
      id: "consistency",
      tone: days.value / r.days >= 0.7 ? "positive" : "neutral",
      text: `You studied on ${days.value} of ${r.days} days${best > 1 ? `, with a longest run of ${best} days in a row` : ""}.`,
      basis: "Days with study hours in the journal.",
    });
  }

  // Sleep and next-day study. The morning check-in records last night's sleep
  // on today's date, so both readings share a date.
  if (tracked.has("sleep")) {
    const rested: number[] = [];
    const short: number[] = [];
    for (const [date, e] of lifeByDate) {
      if (!e.sleepHours || e.sleepHours <= 0 || !studyByDate.has(date)) continue;
      (e.sleepHours >= 7 ? rested : short).push(studyByDate.get(date)!);
    }
    if (rested.length >= MIN_GROUP && short.length >= MIN_GROUP) {
      const a = mean(rested)!;
      const b = mean(short)!;
      const diff = round(a - b, 1);
      if (Math.abs(diff) >= 0.3) {
        out.push({
          id: "sleep-study",
          tone: diff > 0 ? "positive" : "neutral",
          text: `After nights of 7 hours or more you studied ${fmtH(a)} on average, against ${fmtH(b)} after shorter nights.`,
          basis: `${rested.length} longer and ${short.length} shorter nights with a journal entry the same day. This shows what goes together, not what causes what.`,
        });
      }
    }
  }

  // Exercise and study on the same day.
  if (tracked.has("exercise") || tracked.has("walk") || tracked.has("run")) {
    const moved: number[] = [];
    const still: number[] = [];
    for (const [date, e] of lifeByDate) {
      const x = exercisedOn(e);
      if (x == null || !studyByDate.has(date)) continue;
      (x ? moved : still).push(studyByDate.get(date)!);
    }
    if (moved.length >= MIN_GROUP && still.length >= MIN_GROUP) {
      const a = mean(moved)!;
      const b = mean(still)!;
      const diff = round(a - b, 1);
      if (Math.abs(diff) >= 0.3) {
        out.push({
          id: "exercise-study",
          tone: diff > 0 ? "positive" : "neutral",
          text: `On days you exercised you studied ${fmtH(a)}, against ${fmtH(b)} on days you didn't.`,
          basis: `${moved.length} active and ${still.length} inactive days with a journal entry. Busy days can skew this either way.`,
        });
      }
    }
  }

  // Best weekday, once every weekday has turned up at least twice.
  if (r.days >= 14) {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    for (let d = span.from; d <= span.to; d = shiftDay(d, 1)) {
      byDay[(fromISODate(d).getDay() + 6) % 7].push(studyByDate.get(d) ?? 0);
    }
    if (byDay.every((v) => v.length >= 2)) {
      const means = byDay.map((v) => mean(v)!);
      const top = means.indexOf(Math.max(...means));
      const low = means.indexOf(Math.min(...means));
      if (means[top] - means[low] >= 1) {
        out.push({
          id: "weekday",
          tone: "neutral",
          text: `${WEEKDAY_NAMES[top]}s are your strongest study day (${fmtH(means[top])} on average) and ${WEEKDAY_NAMES[low]}s the lightest (${fmtH(means[low])}).`,
          basis: "Every day in the period counts, including days with nothing logged.",
        });
      }
    }
  }

  // A routine that wanders.
  const spread = metrics.find((m) => m.id === "bedtimeSpread");
  if (spread?.value != null && spread.value >= 45) {
    out.push({
      id: "bedtime",
      tone: "attention",
      text: `Your bedtime moved by about ${spread.value} minutes either way. A steadier bedtime usually makes mornings easier to plan.`,
      basis: `${spread.recorded} nights with a bedtime recorded.`,
    });
  }

  return out;
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function buildLifeReport(input: {
  journal: JournalEntry[];
  lifeLog: LifeEntry[];
  span: DateSpan;
  tracked: LifeField[];
}): LifeReport {
  const { journal, lifeLog, span } = input;
  const tracked = new Set(input.tracked);
  const prev = previousSpan(span);
  const now = slice(journal, lifeLog, span);
  const before = slice(journal, lifeLog, prev);

  const metrics: ReportMetric[] = [];
  for (const spec of SPECS) {
    if (spec.field && !tracked.has(spec.field)) continue;
    const [value, recorded] = spec.measure(now);
    let previous: number | null;
    if (spec.id === "weight") {
      const rows = now.life.filter((e) => typeof e.weightKg === "number").sort((a, b) => a.date.localeCompare(b.date));
      previous = rows.length >= 2 ? rows[0].weightKg! : null;
    } else {
      previous = spec.measure(before)[0];
    }
    const change =
      value != null && previous != null ? round(value - previous, Math.max(1, spec.decimals)) : null;
    metrics.push({
      id: spec.id,
      group: spec.group,
      label: spec.label,
      unit: spec.unit,
      decimals: spec.decimals,
      value,
      previous,
      change,
      better: spec.better,
      recorded,
      days: now.days,
      basis: spec.basis(recorded, now.days),
    });
  }

  const { granularity, buckets } = bucketsFor(span, journal, lifeLog);
  return {
    span,
    previous: prev,
    days: now.days,
    metrics,
    granularity,
    buckets,
    daily: dailyRows(span, journal, lifeLog),
    observations: observationsFor(span, now, metrics, tracked),
    coverage: {
      journal: now.journal.length,
      life: now.life.filter(hasReadings).length,
    },
  };
}

/* ── how habits move with study ──────────────────────────────── */

export function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export function strengthLabel(r: number): string {
  const a = Math.abs(r);
  if (a < 0.2) return "No clear link";
  if (a < 0.4) return "Weak link";
  if (a < 0.6) return "Moderate link";
  if (a < 0.8) return "Strong link";
  return "Very strong link";
}

/** Fewest shared days before a link is reported. Below this, r is mostly noise. */
export const MIN_PAIRS = 10;

export interface FactorLink {
  id: string;
  label: string;
  field: LifeField;
  r: number;
  n: number;
  /** What a positive r means here, in words. */
  sentence: string;
}

const FACTORS: { id: string; label: string; field: LifeField; read: (e: LifeEntry) => number | undefined; up: string; down: string }[] = [
  { id: "sleepHours", label: "Sleep hours", field: "sleep", read: (e) => (e.sleepHours && e.sleepHours > 0 ? e.sleepHours : undefined), up: "Longer nights tend to come before longer study days.", down: "Longer nights tend to come before shorter study days." },
  { id: "sleepQuality", label: "Sleep quality", field: "sleep", read: (e) => e.sleepQuality, up: "Better-rated nights tend to come before longer study days.", down: "Better-rated nights tend to come before shorter study days." },
  { id: "exercise", label: "Exercise minutes", field: "exercise", read: (e) => e.exerciseMinutes, up: "More exercise tends to go with more study the same day.", down: "More exercise tends to go with less study the same day." },
  { id: "walk", label: "Walking", field: "walk", read: (e) => e.walkKm, up: "Longer walks tend to go with more study.", down: "Longer walks tend to go with less study." },
  { id: "water", label: "Water", field: "water", read: (e) => e.waterLiters, up: "More water tends to go with more study.", down: "More water tends to go with less study." },
  { id: "meditation", label: "Meditation", field: "meditation", read: (e) => e.meditationMin, up: "Meditation days tend to be longer study days.", down: "Meditation days tend to be shorter study days." },
  { id: "screen", label: "Screen time", field: "screen", read: (e) => e.screenTimeMin, up: "More screen time tends to go with more study.", down: "More screen time tends to go with less study." },
];

/**
 * How each tracked habit moves with study hours on the same day, over the days
 * that carry both. Only links with at least `MIN_PAIRS` shared days and some
 * strength are returned, strongest first.
 */
export function factorLinks(
  lifeLog: LifeEntry[],
  journal: JournalEntry[],
  span: DateSpan,
  tracked: LifeField[],
): FactorLink[] {
  const study = new Map(journal.filter((e) => inSpan(e.date, span)).map((e) => [e.date, e.totalHours || 0] as const));
  const want = new Set(tracked);
  const out: FactorLink[] = [];
  for (const f of FACTORS) {
    if (!want.has(f.field)) continue;
    const pairs: [number, number][] = [];
    for (const e of lifeLog) {
      if (!inSpan(e.date, span)) continue;
      const x = f.read(e);
      const y = study.get(e.date);
      if (typeof x === "number" && y != null) pairs.push([x, y]);
    }
    if (pairs.length < MIN_PAIRS) continue;
    const r = pearson(pairs);
    if (r == null) continue;
    out.push({
      id: f.id,
      label: f.label,
      field: f.field,
      r: round(r, 2),
      n: pairs.length,
      sentence: Math.abs(r) < 0.2 ? "These move independently of each other in your data." : r > 0 ? f.up : f.down,
    });
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}
