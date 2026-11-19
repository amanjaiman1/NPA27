import type {
  ChronicleData,
  Habit,
  HabitMetric,
  HabitOverride,
  HabitSchedule,
  HabitSource,
  ISODate,
  Profile,
  TimeFormat,
} from "./types";
import { completedTopicsOf } from "./topics";
import { clockMinutes, countedSleepHours, formatClock } from "./sleep";
import { addDays, normalizeWeekStart, weekStartOf } from "./roadmap";
import { daysBetween, fromISODate, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   THE HABIT ENGINE
   Habits keep themselves. You record a day where it belongs (hours in the
   Daily Journal, a night on the Life Dashboard, a pass on the Revision
   page, a finished activity on the Roadmap) and every habit connected to
   that kind of record fills in from it. Only a habit you check off
   yourself needs a tap on the Habits page.

   How it stays correct:
   • One shared layer of activity events (`activityEvents`), read straight
     from the records each time. Every event has a stable id built from the
     record it comes from (`journal:2026-11-14:study:polity`), so the same
     record can never count twice, and nothing is copied: edit a journal day
     and the habit changes with it; delete it and its contribution goes.
   • A habit only counts records from its start (`countFrom`, normally the
     day it was created), and only the kind it names. A diary entry, a goal,
     a plan you haven't finished: none of them ever count.
   • A day adds up its records: two study blocks of 3 hours make one day of
     6 hours, never two completions.
   • Your corrections win. A day you mark done, missed or correct the amount
     of is stored on the habit and read before the source, so the next
     record that arrives cannot undo it.
   • Streaks and consistency count only days the habit is due: rest days and
     paused days are skipped, never missed.

   The events belong to whoever's records they are read from. The store
   only ever holds the signed-in account's own data (lib/account/scope.ts),
   so there is no way for one account's activity to reach another's habit.
   Pure functions, so the server's reminders use the same rules.
   ════════════════════════════════════════════════════════════════ */

/* ── The shared activity layer ───────────────────────────────── */

/** The module a record lives in. */
export type ActivitySource = Exclude<HabitSource, "manual">;

export type ActivityKind =
  /** Hours on one subject in a journal day. */
  | "study"
  /** A topic finished on a journal day. */
  | "topic"
  /** One revision of one topic on one day. */
  | "revisionPass"
  /** Minutes of a revision session logged in the journal. */
  | "revisionMinutes"
  /** Hours slept, on the day you woke. */
  | "sleep"
  /** When you went to bed, as minutes after noon the day before (23:30 is 690). */
  | "bedtime"
  /** When you woke, as minutes after midnight. */
  | "wake"
  | "exercise"
  | "walk"
  | "run"
  | "meditation"
  | "water"
  /** Screen time recorded, in minutes. Zero is a real reading. */
  | "screen"
  /** A planned activity marked completed. */
  | "roadmapActivity";

export interface ActivityEvent {
  /** Stable: the same record always gives the same id. */
  id: string;
  /** Where the record lives. */
  source: ActivitySource;
  /** The record: a journal or life date, a revision item id, a plan item id. */
  sourceId: string;
  kind: ActivityKind;
  date: ISODate;
  /** Hours, minutes, km, litres, a count, or a time as minutes. */
  quantity: number;
  subjectId?: string;
  /** What it was, for "counted from…": "Polity & Governance, 2 h". */
  label: string;
  /** Where to see the record. */
  href: string;
}

export type ActivityData = Pick<ChronicleData, "journal" | "lifeLog" | "revisions" | "plans" | "subjects">;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "2 h", "1.5 h", "45 min". */
export function formatHoursShort(hours: number): string {
  if (hours > 0 && hours < 1) return `${Math.round(hours * 60)} min`;
  return `${r2(hours)} h`;
}

/** A clock time as minutes after noon the day before: bedtimes compare in order across midnight. */
export function nightMinutes(clockMins: number): number {
  return (clockMins + 720) % 1440;
}

/** The days a revision item was revised: its history, or its last pass for items revised before history was kept. */
export function revisionPassDates(item: { passes?: ISODate[]; lastRevised?: ISODate }): ISODate[] {
  if (item.passes?.length) return item.passes;
  return item.lastRevised ? [item.lastRevised] : [];
}

/**
 * Every activity the records describe. Deterministic: the same records give
 * the same events, in the same order, with the same ids, every time.
 */
export function activityEvents(data: ActivityData): ActivityEvent[] {
  const out = new Map<string, ActivityEvent>();
  const add = (e: ActivityEvent) => {
    if (!out.has(e.id)) out.set(e.id, e);
  };
  const subjectName = new Map(data.subjects.map((s) => [s.id, s.name]));
  const nameOf = (id?: string) => (id && subjectName.get(id)) || "Unassigned";

  for (const entry of data.journal) {
    const href = `/journal/${entry.date}`;
    // One event per subject per day: two blocks of the same subject add up.
    const bySubject = new Map<string, number>();
    for (const b of entry.blocks ?? []) {
      if (!(typeof b.hours === "number" && b.hours > 0)) continue;
      const key = b.subjectId || "";
      bySubject.set(key, (bySubject.get(key) ?? 0) + b.hours);
    }
    // A day saved before subjects were split out: its total, unassigned.
    if (bySubject.size === 0 && entry.totalHours > 0) bySubject.set("", entry.totalHours);
    for (const [subjectId, hours] of bySubject) {
      add({
        id: `journal:${entry.date}:study:${subjectId || "unassigned"}`,
        source: "journal",
        sourceId: entry.date,
        kind: "study",
        date: entry.date,
        quantity: r2(hours),
        subjectId: subjectId || undefined,
        label: `${nameOf(subjectId)}, ${formatHoursShort(hours)}`,
        href,
      });
    }
    for (const t of completedTopicsOf(entry)) {
      add({
        id: `journal:${entry.date}:topic:${t.id}`,
        source: "journal",
        sourceId: entry.date,
        kind: "topic",
        date: entry.date,
        quantity: 1,
        subjectId: t.subjectId,
        label: t.name,
        href,
      });
    }
    (entry.revisionSessions ?? []).forEach((session, i) => {
      // A pass on a queue item has the same id wherever it was recorded, so
      // the journal day and the Revision page can't count it twice.
      add({
        id: session.revisionItemId ? `revision:${session.revisionItemId}:${entry.date}` : `journal:${entry.date}:revision:${i}`,
        source: session.revisionItemId ? "revision" : "journal",
        sourceId: session.revisionItemId ?? entry.date,
        kind: "revisionPass",
        date: entry.date,
        quantity: 1,
        subjectId: session.subjectId,
        label: session.topic || "A revision session",
        href,
      });
      if (typeof session.minutes === "number" && session.minutes > 0) {
        add({
          id: `journal:${entry.date}:revision-minutes:${i}`,
          source: "journal",
          sourceId: entry.date,
          kind: "revisionMinutes",
          date: entry.date,
          quantity: session.minutes,
          subjectId: session.subjectId,
          label: `${session.topic || "Revision"}, ${session.minutes} min`,
          href,
        });
      }
    });
  }

  for (const item of data.revisions) {
    for (const date of revisionPassDates(item)) {
      add({
        id: `revision:${item.id}:${date}`,
        source: "revision",
        sourceId: item.id,
        kind: "revisionPass",
        date,
        quantity: 1,
        subjectId: item.subjectId,
        label: item.topic,
        href: "/revision",
      });
    }
  }

  for (const e of data.lifeLog) {
    const href = `/wellbeing`;
    const base = { source: "life" as const, sourceId: e.date, date: e.date, href };
    const hours = countedSleepHours(e);
    if (hours !== undefined) add({ ...base, id: `life:${e.date}:sleep`, kind: "sleep", quantity: r2(hours), label: `Slept ${formatHoursShort(hours)}` });
    const bed = clockMinutes(e.bedtime);
    if (bed !== null) add({ ...base, id: `life:${e.date}:bedtime`, kind: "bedtime", quantity: nightMinutes(bed), label: `In bed at ${e.bedtime}` });
    const wake = clockMinutes(e.wakeTime);
    if (wake !== null) add({ ...base, id: `life:${e.date}:wake`, kind: "wake", quantity: wake, label: `Up at ${e.wakeTime}` });
    const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
    const ex = amount(e.exerciseMinutes);
    if (ex) add({ ...base, id: `life:${e.date}:exercise`, kind: "exercise", quantity: ex, label: `${e.exerciseType ? `${e.exerciseType}, ` : ""}${ex} min of exercise` });
    const walk = amount(e.walkKm);
    if (walk) add({ ...base, id: `life:${e.date}:walk`, kind: "walk", quantity: walk, label: `Walked ${walk} km` });
    const run = amount(e.runKm);
    if (run) add({ ...base, id: `life:${e.date}:run`, kind: "run", quantity: run, label: `Ran ${run} km` });
    const med = amount(e.meditationMin);
    if (med) add({ ...base, id: `life:${e.date}:meditation`, kind: "meditation", quantity: med, label: `${med} min of meditation` });
    const water = amount(e.waterLiters);
    if (water) add({ ...base, id: `life:${e.date}:water`, kind: "water", quantity: water, label: `${water} L of water` });
    if (typeof e.screenTimeMin === "number" && Number.isFinite(e.screenTimeMin) && e.screenTimeMin >= 0) {
      add({ ...base, id: `life:${e.date}:screen`, kind: "screen", quantity: e.screenTimeMin, label: `${e.screenTimeMin} min of screen time` });
    }
  }

  for (const plan of data.plans) {
    for (const item of plan.items ?? []) {
      // Only finished work counts: a planned or open activity never does.
      if (item.kind !== "activity" || item.status !== "completed" || !item.completedAt) continue;
      const done = new Date(item.completedAt);
      if (Number.isNaN(done.getTime())) continue;
      add({
        id: `roadmap:${plan.id}:${item.id}`,
        source: "roadmap",
        sourceId: item.id,
        kind: "roadmapActivity",
        date: toISODate(done),
        quantity: 1,
        subjectId: item.subjectId,
        label: item.title,
        href: `/roadmap?plan=${plan.id}&item=${item.id}`,
      });
    }
  }

  return [...out.values()];
}

/** Events by day, for quick reads. */
export function indexEvents(events: ActivityEvent[]): Map<ISODate, ActivityEvent[]> {
  const index = new Map<ISODate, ActivityEvent[]>();
  for (const e of events) {
    const list = index.get(e.date);
    if (list) list.push(e);
    else index.set(e.date, [e]);
  }
  return index;
}

/* ── What a habit can measure ────────────────────────────────── */

export type MetricUnit = "check" | "h" | "min" | "km" | "L" | "count" | "time";

export interface MetricDef {
  id: HabitMetric;
  source: HabitSource;
  /** What it counts, in a few words: "Hours studied". */
  label: string;
  kinds: ActivityKind[];
  unit: MetricUnit;
  /** How a day's amount meets the target. */
  compare: "check" | "atLeast" | "atMost" | "byTime";
  defaultTarget: number;
  step: number;
  min: number;
  max: number;
  /** Counts one subject only. */
  needsSubject?: boolean;
  /** Can be limited to one subject. */
  subjectFilter?: boolean;
  /** One sentence for the form: what it reads, and what counts. */
  explain: string;
  /** How to fill in the target. */
  example: string;
  /** The word after the number: "hours of study", "topics revised". */
  noun: string;
}

const minutesOf = (hhmm: string) => clockMinutes(hhmm) ?? 0;

export const HABIT_METRICS: MetricDef[] = [
  {
    id: "check",
    source: "manual",
    label: "Done or not",
    kinds: [],
    unit: "check",
    compare: "check",
    defaultTarget: 1,
    step: 1,
    min: 1,
    max: 1,
    explain: "You tick it off on the Habits page or the dashboard.",
    example: "",
    noun: "",
  },
  {
    id: "studyHours",
    source: "journal",
    label: "Hours studied",
    kinds: ["study"],
    unit: "h",
    compare: "atLeast",
    defaultTarget: 6,
    step: 0.5,
    min: 0.5,
    max: 16,
    explain: "Adds up the hours of every subject you log in the Daily Journal that day.",
    example: "Enter 6 to aim for six hours a day.",
    noun: "of study",
  },
  {
    id: "subjectHours",
    source: "journal",
    label: "Hours on one subject",
    kinds: ["study"],
    unit: "h",
    compare: "atLeast",
    defaultTarget: 1,
    step: 0.5,
    min: 0.5,
    max: 12,
    needsSubject: true,
    explain: "Counts only the hours logged against the subject you choose.",
    example: "Enter 1.5 for an hour and a half.",
    noun: "on the subject",
  },
  {
    id: "topicsCompleted",
    source: "journal",
    label: "Topics finished",
    kinds: ["topic"],
    unit: "count",
    compare: "atLeast",
    defaultTarget: 1,
    step: 1,
    min: 1,
    max: 20,
    subjectFilter: true,
    explain: "Counts the topics you mark as finished in the Daily Journal.",
    example: "Enter 2 to finish two topics a day.",
    noun: "topics finished",
  },
  {
    id: "sleepHours",
    source: "life",
    label: "Hours slept",
    kinds: ["sleep"],
    unit: "h",
    compare: "atLeast",
    defaultTarget: 7,
    step: 0.5,
    min: 3,
    max: 12,
    explain: "Reads the sleep you record on the Life Dashboard, for the night that ended that morning.",
    example: "Enter 7 for seven hours of sleep.",
    noun: "of sleep",
  },
  {
    id: "bedtimeBy",
    source: "life",
    label: "In bed by a time",
    kinds: ["bedtime"],
    unit: "time",
    compare: "byTime",
    defaultTarget: nightMinutes(minutesOf("23:00")),
    step: 15,
    min: 0,
    max: 1439,
    explain: "Counts a night when the bedtime you record on the Life Dashboard is at or before this time.",
    example: "Pick 11:00 PM to be in bed by eleven.",
    noun: "",
  },
  {
    id: "wakeBy",
    source: "life",
    label: "Up by a time",
    kinds: ["wake"],
    unit: "time",
    compare: "byTime",
    defaultTarget: minutesOf("06:30"),
    step: 15,
    min: 0,
    max: 1439,
    explain: "Counts a morning when the wake-up time you record is at or before this time.",
    example: "Pick 6:30 AM to be up by half past six.",
    noun: "",
  },
  {
    id: "exerciseMinutes",
    source: "life",
    label: "Minutes of exercise",
    kinds: ["exercise"],
    unit: "min",
    compare: "atLeast",
    defaultTarget: 30,
    step: 5,
    min: 5,
    max: 240,
    explain: "Reads the exercise minutes you record on the Life Dashboard.",
    example: "Enter 30 for half an hour.",
    noun: "of exercise",
  },
  {
    id: "walkKm",
    source: "life",
    label: "Kilometres walked",
    kinds: ["walk"],
    unit: "km",
    compare: "atLeast",
    defaultTarget: 3,
    step: 0.5,
    min: 0.5,
    max: 50,
    explain: "Reads the distance walked you record on the Life Dashboard.",
    example: "Enter 3 for three kilometres.",
    noun: "walked",
  },
  {
    id: "runKm",
    source: "life",
    label: "Kilometres run",
    kinds: ["run"],
    unit: "km",
    compare: "atLeast",
    defaultTarget: 5,
    step: 0.5,
    min: 0.5,
    max: 50,
    explain: "Reads the distance run you record on the Life Dashboard.",
    example: "Enter 5 for five kilometres.",
    noun: "run",
  },
  {
    id: "meditationMinutes",
    source: "life",
    label: "Minutes of meditation",
    kinds: ["meditation"],
    unit: "min",
    compare: "atLeast",
    defaultTarget: 10,
    step: 5,
    min: 5,
    max: 120,
    explain: "Reads the meditation minutes you record on the Life Dashboard.",
    example: "Enter 10 for ten minutes.",
    noun: "of meditation",
  },
  {
    id: "waterLiters",
    source: "life",
    label: "Litres of water",
    kinds: ["water"],
    unit: "L",
    compare: "atLeast",
    defaultTarget: 2.5,
    step: 0.25,
    min: 0.5,
    max: 8,
    explain: "Reads the water you record on the Life Dashboard.",
    example: "Enter 2.5 for two and a half litres.",
    noun: "of water",
  },
  {
    id: "screenTimeUnder",
    source: "life",
    label: "Screen time under a limit",
    kinds: ["screen"],
    unit: "min",
    compare: "atMost",
    defaultTarget: 120,
    step: 15,
    min: 0,
    max: 960,
    explain: "Counts a day when the screen time you record is at or under the limit. A day with no reading doesn't count.",
    example: "Enter 120 to stay under two hours.",
    noun: "of screen time at most",
  },
  {
    id: "revisionPasses",
    source: "revision",
    label: "Topics revised",
    kinds: ["revisionPass"],
    unit: "count",
    compare: "atLeast",
    defaultTarget: 1,
    step: 1,
    min: 1,
    max: 50,
    subjectFilter: true,
    explain: "Each topic revised that day counts once, whether you marked it on the Revision page or logged it in the journal.",
    example: "Enter 3 to revise three topics a day.",
    noun: "topics revised",
  },
  {
    id: "revisionMinutes",
    source: "revision",
    label: "Minutes of revision",
    kinds: ["revisionMinutes"],
    unit: "min",
    compare: "atLeast",
    defaultTarget: 30,
    step: 5,
    min: 5,
    max: 480,
    explain: "Adds up the minutes of the revision sessions you log in the Daily Journal.",
    example: "Enter 45 for forty-five minutes.",
    noun: "of revision",
  },
  {
    id: "roadmapActivities",
    source: "roadmap",
    label: "Planned activities completed",
    kinds: ["roadmapActivity"],
    unit: "count",
    compare: "atLeast",
    defaultTarget: 1,
    step: 1,
    min: 1,
    max: 50,
    subjectFilter: true,
    explain: "Counts Roadmap activities on the day you mark them completed. Planned or unfinished activities never count.",
    example: "Enter 5 with “each week in total” for five activities a week.",
    noun: "planned activities completed",
  },
];

const METRIC_BY_ID = new Map(HABIT_METRICS.map((m) => [m.id, m]));

export const SOURCE_LABEL: Record<HabitSource, string> = {
  manual: "Your check-in",
  journal: "Daily Journal",
  life: "Life Dashboard",
  revision: "Revision",
  roadmap: "Roadmap",
};

/** Where to record what feeds a habit. */
export const SOURCE_HREF: Record<HabitSource, string> = {
  manual: "/habits",
  journal: "/journal?new=1",
  life: "/wellbeing",
  revision: "/revision",
  roadmap: "/roadmap",
};

export function metricsFor(source: HabitSource): MetricDef[] {
  return HABIT_METRICS.filter((m) => m.source === source);
}

/* ── A habit's settings, with defaults for older habits ─────── */

export function habitSource(h: Habit): HabitSource {
  return h.source && h.source in SOURCE_LABEL ? h.source : "manual";
}

export function isAutomatic(h: Habit): boolean {
  return habitSource(h) !== "manual";
}

export function habitMetric(h: Habit): MetricDef {
  const source = habitSource(h);
  const m = h.metric ? METRIC_BY_ID.get(h.metric) : undefined;
  if (m && m.source === source) return m;
  return metricsFor(source)[0];
}

export function habitTarget(h: Habit): number {
  const m = habitMetric(h);
  if (m.compare === "check") return 1;
  const t = h.target;
  return typeof t === "number" && Number.isFinite(t) && t >= m.min && t <= m.max ? t : m.defaultTarget;
}

/** The schedule, reading the older `cadence` when there isn't one. */
export function habitSchedule(h: Habit): HabitSchedule {
  const s = h.schedule;
  if (s?.kind === "daily" || s?.kind === "weeklyTotal") return s;
  if (s?.kind === "weekdays") {
    const days = [...new Set(s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    return days.length ? { kind: "weekdays", days } : { kind: "daily" };
  }
  if (s?.kind === "weekly") return { kind: "weekly", timesPerWeek: Math.min(7, Math.max(1, Math.round(s.timesPerWeek) || 1)) };
  if (h.cadence === "weekly") return { kind: "weekly", timesPerWeek: Math.min(7, Math.max(1, h.targetPerWeek ?? 3)) };
  return { kind: "daily" };
}

const isWeekly = (s: HabitSchedule) => s.kind === "weekly" || s.kind === "weeklyTotal";

/** The first day the source's records count: the day chosen, else the day it was created. */
export function sourceStart(h: Habit): ISODate {
  return h.countFrom ?? h.createdOn;
}

/** The first day that counts. */
export function habitStart(h: Habit): ISODate {
  // An automatic habit: from the day you chose to count records from.
  let start = isAutomatic(h) ? sourceStart(h) : h.createdOn;
  // A check-in older than that still counts where check-ins do: a manual
  // habit, or one connected later with check-ins allowed (its history stays).
  if (!isAutomatic(h) || h.allowManual) {
    for (const [date, done] of Object.entries(h.log ?? {})) if (done && date < start) start = date;
  }
  return start;
}

export function isPaused(h: Habit, date: ISODate): boolean {
  return (h.pauses ?? []).some((p) => p.from <= date && (!p.to || date < p.to));
}

export function isPausedNow(h: Habit, today: ISODate): boolean {
  const last = h.pauses?.[h.pauses.length - 1];
  return Boolean(last && !last.to && last.from <= today);
}

/** Due on this day. Weekly habits can be done on any day of their week. */
export function isScheduledOn(schedule: HabitSchedule, date: ISODate): boolean {
  if (schedule.kind === "weekdays") return schedule.days.includes(fromISODate(date).getDay());
  return true;
}

/* ── Reading a day ───────────────────────────────────────────── */

export interface HabitContext {
  today: ISODate;
  weekStart: number;
  index: Map<ISODate, ActivityEvent[]>;
}

export function habitContext(
  data: ActivityData & { profile?: Pick<Profile, "weekStart"> },
  today: ISODate = toISODate(new Date()),
): HabitContext {
  return { today, weekStart: normalizeWeekStart(data.profile?.weekStart), index: indexEvents(activityEvents(data)) };
}

export type DayStatus =
  /** Kept. */
  | "done"
  /** Some progress, not enough (or, today, still going). */
  | "partial"
  /** Due and not kept. */
  | "missed"
  /** Today, nothing yet. */
  | "open"
  /** Not due: a rest day, or a weekly habit's day without activity. */
  | "rest"
  | "paused"
  | "before"
  | "future";

export interface HabitDay {
  date: ISODate;
  status: DayStatus;
  /** Due on this day (always true for weekly habits). */
  scheduled: boolean;
  done: boolean;
  /** The day's amount, after any correction. Null when nothing was recorded. */
  value: number | null;
  target: number;
  /** 0 to 1. */
  progress: number;
  /** What settled the day. */
  via: "source" | "manual" | "override" | null;
  override?: HabitOverride;
  /** The records behind it. */
  events: ActivityEvent[];
}

function relevantEvents(h: Habit, m: MetricDef, events: ActivityEvent[] | undefined): ActivityEvent[] {
  if (!events?.length || !m.kinds.length) return [];
  return events.filter(
    (e) => m.kinds.includes(e.kind) && ((!m.needsSubject && !m.subjectFilter) || !h.subjectId || e.subjectId === h.subjectId),
  );
}

function measure(m: MetricDef, events: ActivityEvent[]): number | null {
  if (!events.length) return null;
  if (m.compare === "byTime") return events[0].quantity;
  return r2(events.reduce((sum, e) => sum + e.quantity, 0));
}

function meets(m: MetricDef, value: number | null, target: number): boolean {
  if (value === null) return false;
  if (m.compare === "atLeast") return value >= target - 1e-9;
  if (m.compare === "atMost" || m.compare === "byTime") return value <= target;
  return false;
}

function progressOf(m: MetricDef, value: number | null, target: number): number {
  if (value === null) return 0;
  if (m.compare === "atLeast") return Math.max(0, Math.min(1, value / target));
  return meets(m, value, target) ? 1 : 0;
}

export function evaluateDay(h: Habit, ctx: HabitContext, date: ISODate): HabitDay {
  const m = habitMetric(h);
  const target = habitTarget(h);
  const schedule = habitSchedule(h);
  const blank = (status: DayStatus): HabitDay => ({
    date,
    status,
    scheduled: false,
    done: false,
    value: null,
    target,
    progress: 0,
    via: null,
    events: [],
  });
  if (date > ctx.today) return blank("future");
  if (date < habitStart(h)) return blank("before");
  if (isPaused(h, date)) return blank("paused");

  const auto = isAutomatic(h);
  // Records count from the habit's chosen day; a check-in from before it
  // (a habit connected later) still counts as itself.
  const events = auto && date >= sourceStart(h) ? relevantEvents(h, m, ctx.index.get(date)) : [];
  const override = h.overrides?.[date];
  let value = auto ? measure(m, events) : null;
  if (override?.kind === "value" && typeof override.value === "number" && Number.isFinite(override.value)) value = override.value;

  let done = false;
  let via: HabitDay["via"] = null;
  if (override?.kind === "done") {
    done = true;
    via = "override";
  } else if (override?.kind === "missed") {
    done = false;
    via = "override";
  } else if (!auto) {
    done = h.log?.[date] === true;
    via = done ? "manual" : null;
  } else if (schedule.kind !== "weeklyTotal" && meets(m, value, target)) {
    done = true;
    via = override?.kind === "value" ? "override" : "source";
  } else if (h.allowManual && h.log?.[date] === true) {
    done = true;
    via = "manual";
  }

  const scheduled = isScheduledOn(schedule, date);
  const progress = done ? 1 : schedule.kind === "weeklyTotal" ? 0 : progressOf(m, value, target);
  let status: DayStatus;
  if (schedule.kind === "weeklyTotal") status = value !== null && value > 0 ? "partial" : date === ctx.today ? "open" : "rest";
  else if (done) status = "done";
  else if (!scheduled) status = "rest";
  else if (override?.kind === "missed") status = "missed";
  else if (date === ctx.today) status = progress > 0 ? "partial" : "open";
  else if (isWeekly(schedule)) status = progress > 0 ? "partial" : "rest";
  else status = progress > 0 ? "partial" : "missed";

  return { date, status, scheduled, done, value, target, progress, via, override, events };
}

/* ── Weeks, for habits kept a number of times a week ─────────── */

export interface HabitWeek {
  start: ISODate;
  end: ISODate;
  status: "done" | "missed" | "open" | "paused" | "before";
  /** `weekly`: days kept. `weeklyTotal`: the week's total. */
  achieved: number;
  /** `weekly`: days needed. `weeklyTotal`: the target. */
  required: number;
  done: boolean;
}

export function evaluateWeek(h: Habit, ctx: HabitContext, anyDay: ISODate): HabitWeek {
  const schedule = habitSchedule(h);
  const start = weekStartOf(anyDay, ctx.weekStart);
  const end = addDays(start, 6);
  const first = habitStart(h);
  const days: HabitDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(evaluateDay(h, ctx, d));
  const live = days.filter((d) => d.status !== "before" && d.status !== "future" && d.status !== "paused");
  const counted = days.filter((d) => d.status !== "before" && d.status !== "paused");
  if (end < first) return { start, end, status: "before", achieved: 0, required: 0, done: false };
  if (!live.length && counted.length === 0) return { start, end, status: "paused", achieved: 0, required: 0, done: false };

  let achieved: number;
  let required: number;
  if (schedule.kind === "weeklyTotal") {
    achieved = r2(live.reduce((sum, d) => sum + (d.value ?? 0), 0));
    required = habitTarget(h);
  } else {
    achieved = live.filter((d) => d.done).length;
    // A week the habit started part-way through, or was partly paused in,
    // asks only for the days it had.
    const times = schedule.kind === "weekly" ? schedule.timesPerWeek : 7;
    required = Math.min(times, counted.length);
  }
  const done = required > 0 && achieved >= required - 1e-9;
  const status: HabitWeek["status"] = done ? "done" : end >= ctx.today ? "open" : "missed";
  return { start, end, status, achieved, required, done };
}

/* ── Streaks and consistency ─────────────────────────────────── */

export interface HabitStreaks {
  current: number;
  longest: number;
  unit: "day" | "week";
}

/**
 * Days (or weeks) kept in a row. Only days the habit is due count: a rest day
 * or a paused day neither breaks a streak nor adds to it, and today, while it
 * is still open, doesn't break it either.
 */
export function habitStreaks(h: Habit, ctx: HabitContext): HabitStreaks {
  const schedule = habitSchedule(h);
  const start = habitStart(h);
  if (start > ctx.today) return { current: 0, longest: 0, unit: isWeekly(schedule) ? "week" : "day" };
  let run = 0;
  let longest = 0;
  if (isWeekly(schedule)) {
    for (let w = weekStartOf(start, ctx.weekStart); w <= ctx.today; w = addDays(w, 7)) {
      const week = evaluateWeek(h, ctx, w);
      if (week.status === "done") {
        run++;
        longest = Math.max(longest, run);
      } else if (week.status === "missed") run = 0;
    }
    return { current: run, longest, unit: "week" };
  }
  for (let d = start; d <= ctx.today; d = addDays(d, 1)) {
    const day = evaluateDay(h, ctx, d);
    if (!day.scheduled || day.status === "paused" || day.status === "before") continue;
    if (day.done) {
      run++;
      longest = Math.max(longest, run);
    } else if (d !== ctx.today) run = 0;
  }
  return { current: run, longest, unit: "day" };
}

export interface Consistency {
  /** Days (or weeks) the habit was due in the window, so far. */
  due: number;
  kept: number;
  /** Kept as a share of due, or null when nothing was due. */
  rate: number | null;
  unit: "day" | "week";
}

/** How often it was kept between two days. Today counts only once it's kept. */
export function habitConsistency(h: Habit, ctx: HabitContext, from: ISODate, to: ISODate): Consistency {
  const schedule = habitSchedule(h);
  const lo = from > habitStart(h) ? from : habitStart(h);
  const hi = to < ctx.today ? to : ctx.today;
  let due = 0;
  let kept = 0;
  if (isWeekly(schedule)) {
    for (let w = weekStartOf(lo, ctx.weekStart); w <= hi; w = addDays(w, 7)) {
      const week = evaluateWeek(h, ctx, w);
      if (week.status === "done") {
        due++;
        kept++;
      } else if (week.status === "missed") due++;
    }
    return { due, kept, rate: due ? kept / due : null, unit: "week" };
  }
  for (let d = lo; d <= hi; d = addDays(d, 1)) {
    const day = evaluateDay(h, ctx, d);
    if (!day.scheduled || day.status === "paused" || day.status === "before" || day.status === "future") continue;
    if (day.done) {
      due++;
      kept++;
    } else if (d !== ctx.today) due++;
  }
  return { due, kept, rate: due ? kept / due : null, unit: "day" };
}

/* ── Today ───────────────────────────────────────────────────── */

export interface HabitToday {
  habit: Habit;
  day: HabitDay;
  /** Weekly habits: the week so far. */
  week?: HabitWeek;
  /** Shown in today's list: due today, or a weekly habit still short this week. */
  due: boolean;
  done: boolean;
  /** 0 to 1. */
  progress: number;
  streak: number;
  streakUnit: "day" | "week";
}

export function isActiveHabit(h: Habit): boolean {
  return !h.archived;
}

export function todayHabits(habits: Habit[], ctx: HabitContext): HabitToday[] {
  const out: HabitToday[] = [];
  for (const habit of habits) {
    if (!isActiveHabit(habit) || isPaused(habit, ctx.today) || habitStart(habit) > ctx.today) continue;
    const schedule = habitSchedule(habit);
    const day = evaluateDay(habit, ctx, ctx.today);
    const streaks = habitStreaks(habit, ctx);
    if (isWeekly(schedule)) {
      const week = evaluateWeek(habit, ctx, ctx.today);
      const progress = week.required ? Math.min(1, week.achieved / week.required) : 0;
      out.push({ habit, day, week, due: true, done: week.done, progress, streak: streaks.current, streakUnit: "week" });
    } else {
      if (!day.scheduled) continue;
      out.push({ habit, day, due: true, done: day.done, progress: day.progress, streak: streaks.current, streakUnit: "day" });
    }
  }
  return out;
}

export interface TodaySummary {
  due: number;
  done: number;
  pending: number;
  /** Kept as a share of due, 0 to 100, or null with nothing due. */
  percent: number | null;
}

export function summarizeToday(list: HabitToday[]): TodaySummary {
  const due = list.length;
  const done = list.filter((t) => t.done).length;
  return { due, done, pending: due - done, percent: due ? Math.round((done / due) * 100) : null };
}

/* ── Words ───────────────────────────────────────────────────── */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A time target as "HH:MM". */
export function targetClock(m: MetricDef, target: number): string {
  const mins = m.id === "bedtimeBy" ? (target + 720) % 1440 : target;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
}

/** "HH:MM" as the stored target for a time metric. */
export function clockToTarget(metric: HabitMetric, hhmm: string): number | null {
  const mins = clockMinutes(hhmm);
  if (mins === null) return null;
  return metric === "bedtimeBy" ? nightMinutes(mins) : mins;
}

/** An amount in the metric's unit: "5.5 h", "40 min", "3 km", "2 topics", "11:30 PM". */
export function formatAmount(m: MetricDef, value: number, timeFormat: TimeFormat = "24h"): string {
  switch (m.unit) {
    case "h":
      return formatHoursShort(value);
    case "min":
      return `${Math.round(value)} min`;
    case "km":
      return `${r2(value)} km`;
    case "L":
      return `${r2(value)} L`;
    case "count":
      return String(Math.round(value));
    case "time":
      return formatClock(targetClock(m, value), timeFormat);
    default:
      return "";
  }
}

/** "1 topic revised", "3 planned activities completed". */
function countWords(m: MetricDef, n: number): string {
  const v = Math.round(n);
  const noun = v === 1 ? m.noun.replace(/^topics/, "topic").replace(/activities/, "activity") : m.noun;
  return `${v} ${noun}`;
}

/** What completes a day, in words: "6 h of study", "In bed by 11:00 PM", "Checked off". */
export function describeTarget(h: Habit, timeFormat: TimeFormat = "24h"): string {
  const m = habitMetric(h);
  const t = habitTarget(h);
  const schedule = habitSchedule(h);
  if (m.compare === "check") return "Checked off by you";
  if (m.id === "bedtimeBy") return `In bed by ${formatAmount(m, t, timeFormat)}`;
  if (m.id === "wakeBy") return `Up by ${formatAmount(m, t, timeFormat)}`;
  if (m.id === "screenTimeUnder") return `At most ${formatAmount(m, t)} of screen time`;
  const amount = m.unit === "count" ? countWords(m, t) : `${formatAmount(m, t)} ${m.noun}`;
  return schedule.kind === "weeklyTotal" ? `${amount} a week` : amount;
}

export function describeSchedule(h: Habit): string {
  const s = habitSchedule(h);
  switch (s.kind) {
    case "daily":
      return "Every day";
    case "weekdays":
      if (s.days.length === 5 && [1, 2, 3, 4, 5].every((d) => s.days.includes(d))) return "Weekdays";
      if (s.days.length === 6 && !s.days.includes(0)) return "Monday to Saturday";
      return s.days.map((d) => WEEKDAY_SHORT[d]).join(", ");
    case "weekly":
      return `${s.timesPerWeek} ${s.timesPerWeek === 1 ? "day" : "days"} a week`;
    case "weeklyTotal":
      return "Each week, in total";
  }
}

/** "From Daily Journal", "Your check-in", "From Revision, or your check-in". */
export function describeSource(h: Habit): string {
  const source = habitSource(h);
  if (source === "manual") return "Your check-in";
  return `From ${SOURCE_LABEL[source]}${h.allowManual ? ", or your check-in" : ""}`;
}

/** Today's progress in words: "4.5 h of 6 h", "Done", "2 of 3 days this week". */
export function progressText(t: HabitToday, timeFormat: TimeFormat = "24h"): string {
  const m = habitMetric(t.habit);
  const schedule = habitSchedule(t.habit);
  if (t.week && schedule.kind === "weekly") return `${t.week.achieved} of ${t.week.required} days this week`;
  if (t.week && schedule.kind === "weeklyTotal") return `${formatAmount(m, t.week.achieved)} of ${formatAmount(m, t.week.required)} this week`;
  if (t.day.via === "override" && t.day.override?.kind !== "value") return t.day.done ? "Marked done" : "Marked missed";
  if (m.compare === "check") return t.day.done ? "Done" : "Not yet";
  if (t.day.done && t.day.via === "manual") return "Checked off";
  if (t.day.value === null) return t.done ? "Done" : "Nothing recorded yet";
  // A count past its target says what it is ("2 topics revised"), not "2 of 1".
  if (m.compare === "atLeast" && m.unit === "count" && t.day.value >= t.day.target) return countWords(m, t.day.value);
  if (m.compare === "atLeast") return `${formatAmount(m, t.day.value)} of ${formatAmount(m, t.day.target)}`;
  return `${formatAmount(m, t.day.value, timeFormat)}${t.day.done ? "" : `, target ${formatAmount(m, t.day.target, timeFormat)}`}`;
}

/* ── Help for setting habits up ─────────────────────────────── */

export interface HabitPreset {
  key: string;
  name: string;
  category: Habit["category"];
  source: HabitSource;
  metric: HabitMetric;
  target?: number;
  schedule: HabitSchedule;
  icon: string;
}

/** Ready-made habits to start from. `study` takes the daily hour target. */
export function habitPresets(profile: Pick<Profile, "dailyHourTarget">): HabitPreset[] {
  const hours = profile.dailyHourTarget > 0 ? Math.min(16, profile.dailyHourTarget) : 6;
  return [
    { key: "study", name: "Daily study", category: "Study", source: "journal", metric: "studyHours", target: hours, schedule: { kind: "daily" }, icon: "book" },
    { key: "revise", name: "Revise every day", category: "Revision", source: "revision", metric: "revisionPasses", target: 1, schedule: { kind: "daily" }, icon: "repeat" },
    { key: "topics", name: "Finish a topic", category: "Study", source: "journal", metric: "topicsCompleted", target: 1, schedule: { kind: "weekdays", days: [1, 2, 3, 4, 5, 6] }, icon: "check" },
    { key: "sleep", name: "Sleep seven hours", category: "Sleep", source: "life", metric: "sleepHours", target: 7, schedule: { kind: "daily" }, icon: "moon" },
    { key: "bed", name: "In bed by eleven", category: "Sleep", source: "life", metric: "bedtimeBy", target: nightMinutes(23 * 60), schedule: { kind: "daily" }, icon: "moon" },
    { key: "wake", name: "Up early", category: "Sleep", source: "life", metric: "wakeBy", target: 6 * 60 + 30, schedule: { kind: "daily" }, icon: "sunrise" },
    { key: "exercise", name: "Exercise", category: "Health", source: "life", metric: "exerciseMinutes", target: 30, schedule: { kind: "weekly", timesPerWeek: 4 }, icon: "dumbbell" },
    { key: "plan", name: "Finish planned activities", category: "Planning", source: "roadmap", metric: "roadmapActivities", target: 5, schedule: { kind: "weeklyTotal" }, icon: "route" },
    { key: "news", name: "Read the newspaper", category: "Study", source: "manual", metric: "check", schedule: { kind: "daily" }, icon: "newspaper" },
    { key: "answer", name: "Answer writing", category: "Study", source: "manual", metric: "check", schedule: { kind: "weekdays", days: [1, 2, 3, 4, 5] }, icon: "pen" },
  ];
}

/**
 * A manual habit whose name says it could fill itself in, and from where.
 * Only ever a suggestion: nothing changes until you choose to connect it.
 */
export function suggestConnection(h: Habit): { source: HabitSource; metric: HabitMetric; reason: string } | null {
  if (isAutomatic(h) || h.archived) return null;
  const n = h.name.toLowerCase();
  if (/revis/.test(n)) return { source: "revision", metric: "revisionPasses", reason: "Topics you revise on the Revision page or in the journal can tick it off for you." };
  if (/\bstud(y|ying|ied)\b|hours? of study/.test(n)) return { source: "journal", metric: "studyHours", reason: "The hours you log in the Daily Journal can tick it off for you." };
  if (/\b(bed|bedtime)\b|sleep early/.test(n)) return { source: "life", metric: "bedtimeBy", reason: "The bedtime you record on the Life Dashboard can tick it off for you." };
  if (/sleep/.test(n)) return { source: "life", metric: "sleepHours", reason: "The sleep you record on the Life Dashboard can tick it off for you." };
  if (/\bwake|up early|early ris/.test(n)) return { source: "life", metric: "wakeBy", reason: "The wake-up time you record on the Life Dashboard can tick it off for you." };
  if (/meditat/.test(n)) return { source: "life", metric: "meditationMinutes", reason: "The meditation you record on the Life Dashboard can tick it off for you." };
  if (/exercis|workout|\bgym\b|yoga/.test(n)) return { source: "life", metric: "exerciseMinutes", reason: "The exercise you record on the Life Dashboard can tick it off for you." };
  if (/\bwalk/.test(n)) return { source: "life", metric: "walkKm", reason: "The distance you record on the Life Dashboard can tick it off for you." };
  if (/\brun(ning)?\b/.test(n)) return { source: "life", metric: "runKm", reason: "The distance you record on the Life Dashboard can tick it off for you." };
  if (/water/.test(n)) return { source: "life", metric: "waterLiters", reason: "The water you record on the Life Dashboard can tick it off for you." };
  return null;
}

/* ── Calendars and periods ───────────────────────────────────── */

/** A month of days for a calendar, padded to whole weeks. */
export function habitMonth(h: Habit, ctx: HabitContext, monthKey: string): (HabitDay | null)[] {
  const first = `${monthKey}-01`;
  const d = fromISODate(first);
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const lead = (d.getDay() - ctx.weekStart + 7) % 7;
  const cells: (HabitDay | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < days; i++) cells.push(evaluateDay(h, ctx, addDays(first, i)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** The last `n` days ending today, oldest first. */
export function recentDays(h: Habit, ctx: HabitContext, n: number): HabitDay[] {
  const out: HabitDay[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(evaluateDay(h, ctx, addDays(ctx.today, -i)));
  return out;
}

export interface HabitPeriodSummary {
  /** Habit-days due in the period, so far. */
  due: number;
  kept: number;
  rate: number | null;
  perHabit: { habit: Habit; consistency: Consistency; streak: HabitStreaks }[];
}

/** All active habits over a period: for Performance Review and the Study Coach. */
export function habitsOverPeriod(habits: Habit[], ctx: HabitContext, from: ISODate, to: ISODate): HabitPeriodSummary {
  const perHabit = habits
    .filter((h) => isActiveHabit(h) && habitStart(h) <= to)
    .map((habit) => ({ habit, consistency: habitConsistency(habit, ctx, from, to), streak: habitStreaks(habit, ctx) }));
  const due = perHabit.reduce((s, p) => s + p.consistency.due, 0);
  const kept = perHabit.reduce((s, p) => s + p.consistency.kept, 0);
  return { due, kept, rate: due ? kept / due : null, perHabit };
}

/** Whole days from the habit's start to today, for "kept since". */
export function daysTracked(h: Habit, today: ISODate): number {
  return Math.max(0, daysBetween(habitStart(h), today) + 1);
}

/* ── After a save ────────────────────────────────────────────── */

/**
 * The habits a day's records count towards, from the given sources, and
 * where each stands: for the note after saving a journal day, a night or a
 * revision ("Daily study kept, Revise every day 50%").
 */
export function habitsMovedOn(
  habits: Habit[],
  ctx: HabitContext,
  date: ISODate,
  sources: HabitSource[],
): { habit: Habit; day: HabitDay }[] {
  return habits
    .filter((h) => isActiveHabit(h) && sources.includes(habitSource(h)))
    .map((habit) => ({ habit, day: evaluateDay(habit, ctx, date) }))
    .filter((x) => x.day.events.length > 0 && x.day.status !== "before" && x.day.status !== "paused");
}

/** "Habits from this day: Daily study kept, Revise every day 50%." */
export function movedSummary(moved: { habit: Habit; day: HabitDay }[]): string | undefined {
  if (!moved.length) return undefined;
  const parts = moved.slice(0, 3).map((x) => `${x.habit.name} ${x.day.done ? "kept" : `${Math.round(x.day.progress * 100)}%`}`);
  return `Habits from this day: ${parts.join(", ")}${moved.length > 3 ? ` and ${moved.length - 3} more` : ""}.`;
}

