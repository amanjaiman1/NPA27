import type { ISODate, LifeEntry } from "./types";
import type { MetricDef } from "./metrics";
import { fromISODate, toISODate, round } from "./utils";

/* ════════════════════════════════════════════════════════════════
   Turning a run of daily life-log entries into something a page can
   draw: buckets over a window, the stats that describe them, and the
   comparison against the window before.

   Nothing here knows which metric it's looking at — that comes from the
   MetricDef — so all four pages share one implementation.
   ════════════════════════════════════════════════════════════════ */

export type RangeId = "week" | "month" | "year" | "all";

export const RANGES: { id: RangeId; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
];

export interface Bucket {
  key: string;
  /** Short label for an axis. */
  label: string;
  /** Long label for a tooltip. */
  full: string;
  start: ISODate;
  end: ISODate;
  /** Days in the bucket that carry a reading. */
  recorded: number;
  /** Days in the bucket, whether recorded or not. */
  span: number;
  sum: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** The bucket's headline number, per the metric's roll-up. */
  value: number | null;
}

export interface MetricSeries {
  buckets: Bucket[];
  /** "day" buckets for short windows, "month" for long ones. */
  granularity: "day" | "month";
  /** Every reading in the window, oldest first. */
  readings: { date: ISODate; value: number }[];
  total: number;
  mean: number | null;
  best: { date: ISODate; value: number } | null;
  worst: { date: ISODate; value: number } | null;
  recordedDays: number;
  windowDays: number;
  /** The same length of time, immediately before the window. */
  previous: { total: number; mean: number | null };
  /** Change against that previous window, as a fraction (0.12 = +12%). */
  change: number | null;
  /** Mean by weekday, Monday first. */
  byWeekday: { label: string; value: number }[];
  /** Consecutive days up to today satisfying the metric's active test. */
  streak: number;
  longestStreak: number;
  /** Share of recorded days that met the target, when there is one. */
  targetHitRate: number | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shiftDays(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Window length in days for a range, given the earliest reading available. */
function windowFor(range: RangeId, today: ISODate, earliest: ISODate | null) {
  switch (range) {
    case "week":
      return { days: 7, granularity: "day" as const };
    case "month":
      return { days: 30, granularity: "day" as const };
    case "year": {
      // Twelve *calendar* months ending with this one. A flat 365-day window
      // reaches back into the same month a year ago, which puts two buckets
      // with the same name ("Sep") at either end of the axis.
      const d = fromISODate(today);
      const start = new Date(d.getFullYear(), d.getMonth() - 11, 1);
      return { days: daysInclusive(toISODate(start), today), granularity: "month" as const };
    }
    case "all": {
      const days = earliest ? Math.max(daysInclusive(earliest, today), 30) : 30;
      return { days, granularity: days > 92 ? ("month" as const) : ("day" as const) };
    }
  }
}

function daysInclusive(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000) + 1;
}

function summarise(values: number[], rollUp: MetricDef["rollUp"]) {
  if (!values.length) {
    return { sum: 0, mean: null, min: null, max: null, value: null };
  }
  const sum = round(
    values.reduce((a, b) => a + b, 0),
    2,
  );
  const mean = round(sum / values.length, 2);
  return {
    sum,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    value: rollUp === "sum" ? sum : mean,
  };
}

export function buildMetricSeries(
  lifeLog: LifeEntry[],
  metric: MetricDef,
  range: RangeId,
  today: Date = new Date(),
): MetricSeries {
  const todayISO = toISODate(today);

  // Every reading the log holds, oldest first.
  const all: { date: ISODate; value: number }[] = [];
  for (const e of [...lifeLog].sort((a, b) => a.date.localeCompare(b.date))) {
    const v = metric.read(e);
    if (v != null && !Number.isNaN(v)) all.push({ date: e.date, value: v });
  }
  const earliest = all.length ? all[0].date : null;
  const { days: windowDays, granularity } = windowFor(range, todayISO, earliest);

  const from = shiftDays(todayISO, -(windowDays - 1));
  const prevFrom = shiftDays(from, -windowDays);
  const inWindow = all.filter((r) => r.date >= from && r.date <= todayISO);
  const inPrevious = all.filter((r) => r.date >= prevFrom && r.date < from);

  // ── buckets ───────────────────────────────────────────────────────────────
  const buckets: Bucket[] = [];
  if (granularity === "day") {
    for (let i = 0; i < windowDays; i++) {
      const date = shiftDays(from, i);
      const hit = inWindow.filter((r) => r.date === date).map((r) => r.value);
      const s = summarise(hit, metric.rollUp);
      const d = fromISODate(date);
      buckets.push({
        key: date,
        label: windowDays <= 7 ? WEEKDAYS[(d.getDay() + 6) % 7] : String(d.getDate()),
        full: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        start: date,
        end: date,
        recorded: hit.length,
        span: 1,
        ...s,
      });
    }
  } else {
    // Month buckets, walking back from this month.
    const cursor = new Date(fromISODate(todayISO));
    cursor.setDate(1);
    const months: { y: number; m: number }[] = [];
    const startOfWindow = fromISODate(from);
    while (
      cursor.getTime() >= new Date(startOfWindow.getFullYear(), startOfWindow.getMonth(), 1).getTime()
    ) {
      months.unshift({ y: cursor.getFullYear(), m: cursor.getMonth() });
      cursor.setMonth(cursor.getMonth() - 1);
    }
    for (const { y, m } of months) {
      const first = toISODate(new Date(y, m, 1));
      const last = toISODate(new Date(y, m + 1, 0));
      const hit = inWindow.filter((r) => r.date >= first && r.date <= last).map((r) => r.value);
      const s = summarise(hit, metric.rollUp);
      buckets.push({
        key: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: MONTHS[m],
        full: `${MONTHS[m]} ${y}`,
        start: first,
        end: last,
        recorded: hit.length,
        span: new Date(y, m + 1, 0).getDate(),
        ...s,
      });
    }
  }

  // ── window stats ──────────────────────────────────────────────────────────
  const values = inWindow.map((r) => r.value);
  const windowStats = summarise(values, metric.rollUp);
  const prevStats = summarise(
    inPrevious.map((r) => r.value),
    metric.rollUp,
  );

  const sorted = [...inWindow].sort((a, b) => b.value - a.value);
  const bestFirst = metric.lowerBetter ? [...sorted].reverse() : sorted;

  // ── per weekday ───────────────────────────────────────────────────────────
  const byWeekday = WEEKDAYS.map((label, idx) => {
    const hits = inWindow.filter((r) => (fromISODate(r.date).getDay() + 6) % 7 === idx);
    const s = summarise(
      hits.map((r) => r.value),
      "mean",
    );
    return { label, value: s.mean ?? 0 };
  });

  // ── streaks ───────────────────────────────────────────────────────────────
  // Both walks below run on the render path, so each one carries an explicit
  // upper bound. A date helper that fails to advance would otherwise spin the
  // main thread forever and hang the tab rather than just render a wrong number.
  const MAX_WALK = 3650;

  const byDate = new Map(all.map((r) => [r.date, r.value]));
  let streak = 0;
  for (let i = 0; i <= MAX_WALK; i++) {
    const date = shiftDays(todayISO, -i);
    const v = byDate.get(date);
    // Today not yet logged doesn't break a streak; it just hasn't started.
    if (v == null) {
      if (i === 0) continue;
      break;
    }
    if (!metric.isActiveDay(v)) break;
    streak++;
  }

  let longestStreak = 0;
  let run = 0;
  let cursorDate = earliest;
  for (let step = 0; cursorDate && cursorDate <= todayISO && step <= MAX_WALK; step++) {
    const v = byDate.get(cursorDate);
    if (v != null && metric.isActiveDay(v)) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else if (v != null) {
      run = 0;
    }
    const next = shiftDays(cursorDate, 1);
    // Stepping forward must produce a later date. If it ever doesn't, stop
    // instead of re-reading the same day for eternity.
    if (next <= cursorDate) break;
    cursorDate = next;
  }

  const withTarget =
    metric.target != null && values.length
      ? values.filter((v) => (metric.lowerBetter ? v <= metric.target! : v >= metric.target!)).length /
        values.length
      : null;

  const changeBase = metric.rollUp === "sum" ? prevStats.sum : prevStats.mean;
  const changeNow = metric.rollUp === "sum" ? windowStats.sum : windowStats.mean;
  const change =
    changeBase && changeBase !== 0 && changeNow != null
      ? round((changeNow - changeBase) / Math.abs(changeBase), 4)
      : null;

  return {
    buckets,
    granularity,
    readings: inWindow,
    total: windowStats.sum,
    mean: windowStats.mean,
    best: bestFirst[0] ?? null,
    worst: bestFirst[bestFirst.length - 1] ?? null,
    recordedDays: inWindow.length,
    windowDays,
    previous: { total: prevStats.sum, mean: prevStats.mean },
    change,
    byWeekday,
    streak,
    longestStreak,
    targetHitRate: withTarget,
  };
}

/** A trailing average, for smoothing a noisy line like weight. */
export function movingAverage(
  readings: { date: ISODate; value: number }[],
  window = 7,
): { date: ISODate; value: number }[] {
  return readings.map((r, i) => {
    const slice = readings.slice(Math.max(0, i - window + 1), i + 1);
    return {
      date: r.date,
      value: round(slice.reduce((a, b) => a + b.value, 0) / slice.length, 2),
    };
  });
}
