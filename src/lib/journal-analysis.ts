import type { ISODate, JournalEntry, Subject } from "./types";
import { fromISODate, toISODate, round } from "./utils";
import { currentStreak, longestStreak } from "./selectors";

/* ════════════════════════════════════════════════════════════════
   Journal analytics. Pure functions over the daily journal that roll a
   run of entries up by day, week, month or year and describe it: volume,
   consistency, state of mind, subject split, output, task discipline,
   daily rhythm and the change against the preceding window.

   Nothing here touches the store or React — `analyseJournal` is a
   function of (entries, subjects, granularity, today), which is what
   makes it testable and keeps the page a rendering concern.
   ════════════════════════════════════════════════════════════════ */

export type Granularity = "day" | "week" | "month" | "year";

export const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "day", label: "Days" },
  { id: "week", label: "Weeks" },
  { id: "month", label: "Months" },
  { id: "year", label: "Years" },
];

/** How many buckets each granularity looks back over. */
export const BUCKET_COUNT: Record<Granularity, number> = {
  day: 30,
  week: 12,
  month: 12,
  year: 5,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Monday-first, matching the rest of the app's weekday handling. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface AnalysisBucket {
  key: string;
  /** Short label for a chart axis. */
  label: string;
  /** Long label for a tooltip. */
  full: string;
  start: ISODate;
  end: ISODate;
  /** Calendar days in the bucket, never counting past today. */
  days: number;
  /** Days carrying an entry. */
  loggedDays: number;
  /** Days with study hours on them. */
  activeDays: number;
  hours: number;
  avgMood: number | null;
  avgFocus: number | null;
  topics: number;
  revisions: number;
  mocks: number;
  books: number;
  currentAffairs: number;
  tasksPlanned: number;
  tasksDone: number;
}

export interface JournalAnalysis {
  granularity: Granularity;
  buckets: AnalysisBucket[];
  window: { start: ISODate; end: ISODate; days: number };
  totals: {
    hours: number;
    loggedDays: number;
    activeDays: number;
    restDays: number;
    avgHoursPerDay: number;
    avgHoursPerActiveDay: number;
    /** Share of the window's days that carry an entry, 0–1. */
    consistency: number;
    topics: number;
    revisions: number;
    mocks: number;
    books: number;
    currentAffairs: number;
    tasksPlanned: number;
    tasksDone: number;
    taskCompletion: number | null;
  };
  /** Averages over the days that recorded each rating, 1–5. */
  mind: {
    mood: number | null;
    energy: number | null;
    motivation: number | null;
    focus: number | null;
  };
  /** The same length of window immediately before this one. */
  previous: { hours: number; activeDays: number; avgHoursPerDay: number; mood: number | null };
  /** Fractional change vs that window (0.12 = +12%); null when there's no base. */
  change: { hours: number | null; activeDays: number | null; avgHoursPerDay: number | null };
  /** Absolute change in mood points, since a 1–5 rating reads better that way. */
  moodShift: number | null;
  best: { date: ISODate; hours: number } | null;
  quietest: { date: ISODate; hours: number } | null;
  subjects: { subjectId: string; name: string; hours: number; share: number }[];
  weekday: { label: string; avgHours: number; activeDays: number }[];
  rhythm: { avgWake: string | null; avgSleep: string | null; nights: number };
  tags: { tag: string; count: number }[];
  narrative: { wins: number; failures: number; lessons: number; reflections: number };
  /** All-time, not window-scoped — a streak only means anything unbroken. */
  streak: { current: number; longest: number };
}

function shiftDays(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function daysInclusive(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000) + 1;
}

/** Monday of the week containing `iso`. */
function weekStart(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return shiftDays(iso, -((d.getDay() + 6) % 7));
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length, 2);
}

/**
 * Average of "HH:MM" clock times, handling the wrap past midnight: times are
 * measured from noon, so a 00:30 bedtime sits next to 23:30 rather than 23 hours
 * away from it.
 */
export function averageClock(times: string[]): string | null {
  const mins = times
    .map((t) => {
      const parts = (t ?? "").split(":");
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      /* Both halves have to be real numbers in range. `Number.isNaN` alone is not
         enough: a value like "" or "07" leaves the minutes `undefined`, and
         `Number.isNaN(undefined)` is false, so the arithmetic below produced NaN
         and a single malformed time turned the whole average into "NaN:NaN". */
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      if (h < 0 || h > 23 || m < 0 || m > 59) return null;
      const raw = h * 60 + m;
      return raw < 12 * 60 ? raw + 24 * 60 : raw;
    })
    .filter((v): v is number => v != null);
  if (!mins.length) return null;
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) % (24 * 60);
  return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
}

/** The [start, end] ISO range of each bucket, oldest first, ending today. */
function bucketRanges(
  granularity: Granularity,
  todayISO: ISODate,
): { key: string; label: string; full: string; start: ISODate; end: ISODate }[] {
  const count = BUCKET_COUNT[granularity];
  const today = fromISODate(todayISO);
  const out: { key: string; label: string; full: string; start: ISODate; end: ISODate }[] = [];

  if (granularity === "day") {
    for (let i = count - 1; i >= 0; i--) {
      const date = shiftDays(todayISO, -i);
      const d = fromISODate(date);
      out.push({
        key: date,
        label: String(d.getDate()),
        full: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        start: date,
        end: date,
      });
    }
    return out;
  }

  if (granularity === "week") {
    const thisWeek = weekStart(todayISO);
    for (let i = count - 1; i >= 0; i--) {
      const start = shiftDays(thisWeek, -7 * i);
      const end = shiftDays(start, 6);
      const s = fromISODate(start);
      const e = fromISODate(end);
      out.push({
        key: start,
        label: `${s.getDate()}`,
        full:
          s.getMonth() === e.getMonth()
            ? `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`
            : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`,
        start,
        end,
      });
    }
    return out;
  }

  if (granularity === "month") {
    for (let i = count - 1; i >= 0; i--) {
      const first = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      out.push({
        key: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`,
        label: MONTHS[first.getMonth()],
        full: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`,
        start: toISODate(first),
        end: toISODate(last),
      });
    }
    return out;
  }

  for (let i = count - 1; i >= 0; i--) {
    const y = today.getFullYear() - i;
    out.push({
      key: String(y),
      label: String(y),
      full: String(y),
      start: toISODate(new Date(y, 0, 1)),
      end: toISODate(new Date(y, 11, 31)),
    });
  }
  return out;
}

/** Everything the analysis view needs, for one granularity. */
export function analyseJournal(
  journal: JournalEntry[],
  subjects: Subject[],
  granularity: Granularity,
  today: Date = new Date(),
): JournalAnalysis {
  const todayISO = toISODate(today);
  const byDate = new Map(journal.map((e) => [e.date, e]));

  const ranges = bucketRanges(granularity, todayISO);
  const windowStart = ranges[0].start;
  const windowDays = daysInclusive(windowStart, todayISO);

  /** Entries inside an inclusive date range, never past today. */
  const entriesIn = (start: ISODate, end: ISODate) => {
    const stop = end > todayISO ? todayISO : end;
    const out: JournalEntry[] = [];
    for (let d = start; d <= stop; d = shiftDays(d, 1)) {
      const e = byDate.get(d);
      if (e) out.push(e);
    }
    return out;
  };

  const buckets: AnalysisBucket[] = ranges.map((r) => {
    const stop = r.end > todayISO ? todayISO : r.end;
    const es = entriesIn(r.start, r.end);
    return {
      ...r,
      days: Math.max(0, daysInclusive(r.start, stop)),
      loggedDays: es.length,
      activeDays: es.filter((e) => e.totalHours > 0).length,
      hours: round(
        es.reduce((a, e) => a + e.totalHours, 0),
        2,
      ),
      avgMood: mean(es.map((e) => e.mood).filter((v) => v > 0)),
      avgFocus: mean(es.map((e) => e.focus).filter((v) => v > 0)),
      topics: es.reduce((a, e) => a + (e.topicsCompleted?.length ?? 0), 0),
      revisions: es.reduce((a, e) => a + (e.revisionSessions?.length ?? 0), 0),
      mocks: es.reduce((a, e) => a + (e.mocksAttempted?.length ?? 0), 0),
      books: es.reduce((a, e) => a + (e.booksStudied?.length ?? 0), 0),
      currentAffairs: es.reduce((a, e) => a + (e.currentAffairs?.length ?? 0), 0),
      tasksPlanned: es.reduce((a, e) => a + (e.tasksPlanned ?? 0), 0),
      tasksDone: es.reduce((a, e) => a + (e.tasksDone ?? 0), 0),
    };
  });

  const inWindow = entriesIn(windowStart, todayISO);
  const active = inWindow.filter((e) => e.totalHours > 0);

  const hours = round(
    inWindow.reduce((a, e) => a + e.totalHours, 0),
    2,
  );
  const sum = (pick: (e: JournalEntry) => number) => inWindow.reduce((a, e) => a + pick(e), 0);

  const tasksPlanned = sum((e) => e.tasksPlanned ?? 0);
  const tasksDone = sum((e) => e.tasksDone ?? 0);

  // ── the window before this one, same number of days ───────────────────────
  const prevEnd = shiftDays(windowStart, -1);
  const prevStart = shiftDays(prevEnd, -(windowDays - 1));
  const prevEntries = entriesIn(prevStart, prevEnd);
  const prevActive = prevEntries.filter((e) => e.totalHours > 0);
  const prevHours = round(
    prevEntries.reduce((a, e) => a + e.totalHours, 0),
    2,
  );
  const prevAvgPerDay = round(prevHours / windowDays, 2);
  const prevMood = mean(prevEntries.map((e) => e.mood).filter((v) => v > 0));

  const frac = (now: number, before: number) =>
    before > 0 ? round((now - before) / before, 4) : null;

  const avgHoursPerDay = round(hours / windowDays, 2);

  // ── best / quietest logged day ────────────────────────────────────────────
  const ranked = [...active].sort((a, b) => b.totalHours - a.totalHours);
  const best = ranked[0] ? { date: ranked[0].date, hours: ranked[0].totalHours } : null;
  const quietest = ranked.length
    ? { date: ranked[ranked.length - 1].date, hours: ranked[ranked.length - 1].totalHours }
    : null;

  // ── subject split, from the blocks inside the window ──────────────────────
  const subjectHours = new Map<string, number>();
  for (const e of inWindow) {
    for (const b of e.blocks ?? []) {
      if (!b?.subjectId || !(b.hours > 0)) continue;
      subjectHours.set(b.subjectId, (subjectHours.get(b.subjectId) ?? 0) + b.hours);
    }
  }
  const blockTotal = [...subjectHours.values()].reduce((a, b) => a + b, 0);
  const subjectList = [...subjectHours.entries()]
    .map(([subjectId, h]) => ({
      subjectId,
      name: subjects.find((s) => s.id === subjectId)?.name ?? subjectId,
      hours: round(h, 2),
      share: blockTotal > 0 ? round((h / blockTotal) * 100, 1) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  // ── rhythm by weekday, over the days that were actually studied ───────────
  const weekday = WEEKDAYS.map((label, idx) => {
    const hits = active.filter((e) => (fromISODate(e.date).getDay() + 6) % 7 === idx);
    return {
      label,
      avgHours: hits.length
        ? round(hits.reduce((a, e) => a + e.totalHours, 0) / hits.length, 2)
        : 0,
      activeDays: hits.length,
    };
  });

  // ── tags, most used first ─────────────────────────────────────────────────
  const tagCounts = new Map<string, number>();
  for (const e of inWindow) {
    for (const t of e.tags ?? []) {
      const tag = t.trim();
      if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const wakeTimes = inWindow.map((e) => e.wakeTime ?? "").filter(Boolean);
  const sleepTimes = inWindow.map((e) => e.sleepTime ?? "").filter(Boolean);

  return {
    granularity,
    buckets,
    window: { start: windowStart, end: todayISO, days: windowDays },
    totals: {
      hours,
      loggedDays: inWindow.length,
      activeDays: active.length,
      restDays: inWindow.length - active.length,
      avgHoursPerDay,
      avgHoursPerActiveDay: active.length ? round(hours / active.length, 2) : 0,
      consistency: windowDays > 0 ? round(inWindow.length / windowDays, 4) : 0,
      topics: sum((e) => e.topicsCompleted?.length ?? 0),
      revisions: sum((e) => e.revisionSessions?.length ?? 0),
      mocks: sum((e) => e.mocksAttempted?.length ?? 0),
      books: sum((e) => e.booksStudied?.length ?? 0),
      currentAffairs: sum((e) => e.currentAffairs?.length ?? 0),
      tasksPlanned,
      tasksDone,
      taskCompletion: tasksPlanned > 0 ? round(tasksDone / tasksPlanned, 4) : null,
    },
    mind: {
      mood: mean(inWindow.map((e) => e.mood).filter((v) => v > 0)),
      energy: mean(inWindow.map((e) => e.energy).filter((v) => v > 0)),
      motivation: mean(inWindow.map((e) => e.motivation).filter((v) => v > 0)),
      focus: mean(inWindow.map((e) => e.focus).filter((v) => v > 0)),
    },
    previous: {
      hours: prevHours,
      activeDays: prevActive.length,
      avgHoursPerDay: prevAvgPerDay,
      mood: prevMood,
    },
    change: {
      hours: frac(hours, prevHours),
      activeDays: frac(active.length, prevActive.length),
      avgHoursPerDay: frac(avgHoursPerDay, prevAvgPerDay),
    },
    moodShift:
      prevMood != null && inWindow.length
        ? round((mean(inWindow.map((e) => e.mood).filter((v) => v > 0)) ?? 0) - prevMood, 2)
        : null,
    best,
    quietest,
    subjects: subjectList,
    weekday,
    rhythm: {
      avgWake: averageClock(wakeTimes),
      avgSleep: averageClock(sleepTimes),
      nights: Math.max(wakeTimes.length, sleepTimes.length),
    },
    tags,
    narrative: {
      wins: sum((e) => e.wins?.length ?? 0),
      failures: sum((e) => e.failures?.length ?? 0),
      lessons: sum((e) => e.lessons?.length ?? 0),
      reflections: inWindow.filter((e) => (e.reflection ?? "").trim().length > 0).length,
    },
    streak: { current: currentStreak(journal, today), longest: longestStreak(journal) },
  };
}

/** "1 Sep – 30 Sep 2026" — the window a analysis covers, for a subheading. */
export function describeWindow(a: JournalAnalysis): string {
  const s = fromISODate(a.window.start);
  const e = fromISODate(a.window.end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = `${s.getDate()} ${MONTHS[s.getMonth()]}${sameYear ? "" : ` ${s.getFullYear()}`}`;
  const right = `${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  return `${left} – ${right}`;
}
