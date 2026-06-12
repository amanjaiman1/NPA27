import type {
  JournalEntry,
  Subject,
  MockTest,
  Habit,
  SleepLog,
  ISODate,
} from "./types";
import { fromISODate, toISODate, avg, sum } from "./utils";

export interface HeatCell {
  date: ISODate;
  hours: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** Map of date -> total hours for quick lookup. */
export function hoursByDate(journal: JournalEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of journal) m.set(e.date, e.totalHours);
  return m;
}

function levelFor(hours: number): HeatCell["level"] {
  if (hours <= 0) return 0;
  if (hours < 3) return 1;
  if (hours < 6) return 2;
  if (hours < 9) return 3;
  return 4;
}

/** A contiguous run of cells from `days` ago up to today. */
export function buildHeatmap(
  journal: JournalEntry[],
  days = 364,
  endDate = new Date(),
): HeatCell[] {
  const map = hoursByDate(journal);
  const cells: HeatCell[] = [];
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  for (let i = days; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const iso = toISODate(d);
    const hours = map.get(iso) ?? 0;
    cells.push({ date: iso, hours, level: levelFor(hours) });
  }
  return cells;
}

/** Current consecutive-day study streak ending today or yesterday. */
export function currentStreak(journal: JournalEntry[], today = new Date()): number {
  const map = hoursByDate(journal);
  let streak = 0;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  // allow streak to count if today not yet logged but yesterday was
  if (!map.has(toISODate(d))) d.setDate(d.getDate() - 1);
  while (map.has(toISODate(d)) && (map.get(toISODate(d)) ?? 0) > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function longestStreak(journal: JournalEntry[]): number {
  const dates = journal
    .filter((e) => e.totalHours > 0)
    .map((e) => e.date)
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const ds of dates) {
    const d = fromISODate(ds);
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function totalHours(journal: JournalEntry[]): number {
  return Math.round(sum(journal.map((e) => e.totalHours)));
}

export function studyDays(journal: JournalEntry[]): number {
  return journal.filter((e) => e.totalHours > 0).length;
}

/** Hours per day for the last N days as a sparkline-friendly array. */
export function lastNDaysHours(
  journal: JournalEntry[],
  n = 14,
  endDate = new Date(),
): { date: string; hours: number }[] {
  const map = hoursByDate(journal);
  const out: { date: string; hours: number }[] = [];
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const iso = toISODate(d);
    out.push({ date: iso, hours: map.get(iso) ?? 0 });
  }
  return out;
}

export interface SubjectHours {
  subjectId: string;
  name: string;
  hours: number;
  share: number; // 0-100
}

export function hoursBySubject(
  journal: JournalEntry[],
  subjects: Subject[],
  withinDays?: number,
): SubjectHours[] {
  const cutoff = withinDays
    ? toISODate(new Date(Date.now() - withinDays * 86400000))
    : null;
  const totals = new Map<string, number>();
  for (const e of journal) {
    if (cutoff && e.date < cutoff) continue;
    for (const b of e.blocks)
      totals.set(b.subjectId, (totals.get(b.subjectId) ?? 0) + b.hours);
  }
  const grand = sum([...totals.values()]) || 1;
  return subjects
    .map((s) => ({
      subjectId: s.id,
      name: s.name,
      hours: Math.round((totals.get(s.id) ?? 0) * 10) / 10,
      share: Math.round(((totals.get(s.id) ?? 0) / grand) * 100),
    }))
    .sort((a, b) => b.hours - a.hours);
}

/** Average mastery for a subject (0-100). */
export function subjectMastery(s: Subject): number {
  if (!s.topics.length) return 0;
  return Math.round(avg(s.topics.map((t) => t.confidence)));
}

/** Mock score history normalised to percentage, optionally by type. */
export function mockSeries(
  mocks: MockTest[],
  type?: MockTest["type"],
): { date: string; pct: number; name: string; score: number; max: number }[] {
  return mocks
    .filter((m) => (type ? m.type === type : true))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({
      date: m.date,
      pct: Math.round((m.score / m.max) * 100),
      name: m.name,
      score: m.score,
      max: m.max,
    }));
}

export function avgMood(journal: JournalEntry[], withinDays = 30): number {
  const cutoff = toISODate(new Date(Date.now() - withinDays * 86400000));
  const recent = journal.filter((e) => e.date >= cutoff);
  return Math.round(avg(recent.map((e) => e.mood)) * 10) / 10;
}

export function avgSleep(sleep: SleepLog[], withinDays = 14): number {
  const cutoff = toISODate(new Date(Date.now() - withinDays * 86400000));
  const recent = sleep.filter((e) => e.date >= cutoff);
  return Math.round(avg(recent.map((e) => e.hours)) * 10) / 10;
}

/** % of habit completion over the trailing window for a habit. */
export function habitAdherence(habit: Habit, days = 30): number {
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (habit.log[toISODate(d)]) done++;
  }
  return Math.round((done / days) * 100);
}

/** Habit streak (consecutive days completed up to today/yesterday). */
export function habitStreak(habit: Habit): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!habit.log[toISODate(d)]) d.setDate(d.getDate() - 1);
  while (habit.log[toISODate(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function todayEntry(
  journal: JournalEntry[],
  today = toISODate(new Date()),
): JournalEntry | undefined {
  return journal.find((e) => e.date === today);
}
