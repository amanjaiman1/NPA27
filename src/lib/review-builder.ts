import type {
  ISODate,
  JournalEntry,
  MockTest,
  Review,
  ReviewType,
  Subject,
} from "./types";
import { fromISODate, toISODate, daysBetween, round, avg, uid } from "./utils";
import { weekNumberFor, currentPhase } from "./plan";

/* ════════════════════════════════════════════════════════════════
   Reviews, mostly written for you.

   A weekly review whose first job is retyping numbers you already logged
   is a review nobody writes — and the page had no way to create one at
   all. Everything measurable about a period is derived here from the
   journal, mocks and subjects, so the only thing left to supply is the
   part that needs a human: what it meant.
   ════════════════════════════════════════════════════════════════ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PeriodWindow {
  type: ReviewType;
  /** Stable key for matching an existing review to this period. */
  key: string;
  periodLabel: string;
  startDate: ISODate;
  endDate: ISODate;
}

function shift(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Monday of the week containing `iso`. */
function weekStart(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return shift(iso, -((d.getDay() + 6) % 7));
}

function label(type: ReviewType, start: ISODate, end: ISODate): string {
  const s = fromISODate(start);
  const e = fromISODate(end);
  if (type === "Weekly") {
    const span =
      s.getMonth() === e.getMonth()
        ? `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`
        : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
    const n = weekNumberFor(start);
    // The plan starts partway through the journey, so a week before it has no
    // number to quote — the date span alone is honest there.
    return n > 0 ? `Week ${n} · ${span}` : span;
  }
  if (type === "Monthly") return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  return String(s.getFullYear());
}

/**
 * The most recent `count` periods of a given type, newest first. The current,
 * still-running period is included — reviewing a week on its last day is normal.
 */
export function reviewPeriods(
  type: ReviewType,
  today: ISODate,
  count = 8,
): PeriodWindow[] {
  const out: PeriodWindow[] = [];
  const t = fromISODate(today);

  for (let i = 0; i < count; i++) {
    let startDate: ISODate;
    let endDate: ISODate;
    if (type === "Weekly") {
      startDate = shift(weekStart(today), -7 * i);
      endDate = shift(startDate, 6);
    } else if (type === "Monthly") {
      const first = new Date(t.getFullYear(), t.getMonth() - i, 1);
      startDate = toISODate(first);
      endDate = toISODate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    } else {
      const y = t.getFullYear() - i;
      startDate = toISODate(new Date(y, 0, 1));
      endDate = toISODate(new Date(y, 11, 31));
    }
    out.push({
      type,
      key: `${type}:${startDate}`,
      periodLabel: label(type, startDate, endDate),
      startDate,
      endDate,
    });
  }
  return out;
}

/** The window immediately before this one, same shape. */
export function previousPeriod(w: PeriodWindow): PeriodWindow {
  const spanDays = daysBetween(w.startDate, w.endDate) + 1;
  if (w.type === "Weekly") {
    const startDate = shift(w.startDate, -7);
    const endDate = shift(startDate, 6);
    return { ...w, key: `${w.type}:${startDate}`, periodLabel: label(w.type, startDate, endDate), startDate, endDate };
  }
  if (w.type === "Monthly") {
    const s = fromISODate(w.startDate);
    const first = new Date(s.getFullYear(), s.getMonth() - 1, 1);
    const startDate = toISODate(first);
    const endDate = toISODate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    return { ...w, key: `${w.type}:${startDate}`, periodLabel: label(w.type, startDate, endDate), startDate, endDate };
  }
  const y = fromISODate(w.startDate).getFullYear() - 1;
  const startDate = toISODate(new Date(y, 0, 1));
  const endDate = toISODate(new Date(y, 11, 31));
  void spanDays;
  return { ...w, key: `${w.type}:${startDate}`, periodLabel: label(w.type, startDate, endDate), startDate, endDate };
}

export interface ReviewMetrics {
  days: number;
  loggedDays: number;
  activeDays: number;
  totalHours: number;
  avgHoursPerDay: number;
  avgHoursPerActiveDay: number;
  consistency: number;
  topics: number;
  revisions: number;
  books: number;
  currentAffairs: number;
  mocksTaken: number;
  avgMockPct: number | null;
  bestMockPct: number | null;
  avgMood: number | null;
  avgFocus: number | null;
  bestDay: { date: ISODate; hours: number } | null;
  topSubjects: { name: string; hours: number; share: number }[];
  previous: { totalHours: number; activeDays: number; mocksTaken: number; avgMood: number | null };
  change: { hours: number | null; activeDays: number | null };
  phase: string;
}

function inWindow<T extends { date: ISODate }>(rows: T[], w: PeriodWindow, todayISO: ISODate): T[] {
  // Never count days that haven't happened — a review of the running week must
  // not average across days still to come.
  const end = w.endDate > todayISO ? todayISO : w.endDate;
  return rows.filter((r) => r.date >= w.startDate && r.date <= end);
}

function mockPct(m: MockTest): number | null {
  return m.max > 0 ? round((m.score / m.max) * 100, 1) : null;
}

export function computeReviewMetrics(
  data: { journal: JournalEntry[]; mocks: MockTest[]; subjects: Subject[] },
  w: PeriodWindow,
  today: Date = new Date(),
): ReviewMetrics {
  const todayISO = toISODate(today);
  const end = w.endDate > todayISO ? todayISO : w.endDate;
  const days = Math.max(0, daysBetween(w.startDate, end) + 1);

  const entries = inWindow(data.journal, w, todayISO);
  const active = entries.filter((e) => e.totalHours > 0);
  const totalHours = round(entries.reduce((a, e) => a + e.totalHours, 0), 1);
  const mocks = inWindow(data.mocks, w, todayISO);
  const pcts = mocks.map(mockPct).filter((v): v is number => v != null);

  const prevW = previousPeriod(w);
  const prevEntries = inWindow(data.journal, prevW, todayISO);
  const prevActive = prevEntries.filter((e) => e.totalHours > 0);
  const prevHours = round(prevEntries.reduce((a, e) => a + e.totalHours, 0), 1);
  const prevMocks = inWindow(data.mocks, prevW, todayISO);

  const frac = (now: number, before: number) =>
    before > 0 ? round((now - before) / before, 4) : null;

  // Subject split from the study blocks inside the window.
  const hours = new Map<string, number>();
  for (const e of entries) {
    for (const b of e.blocks ?? []) {
      if (!b?.subjectId || !(b.hours > 0)) continue;
      hours.set(b.subjectId, (hours.get(b.subjectId) ?? 0) + b.hours);
    }
  }
  const blockTotal = [...hours.values()].reduce((a, b) => a + b, 0);
  const topSubjects = [...hours.entries()]
    .map(([id, h]) => ({
      name: data.subjects.find((s) => s.id === id)?.name ?? id,
      hours: round(h, 1),
      share: blockTotal > 0 ? round((h / blockTotal) * 100, 0) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const ranked = [...active].sort((a, b) => b.totalHours - a.totalHours);
  const mood = (rows: JournalEntry[]) => {
    const v = rows.map((e) => e.mood).filter((n) => n > 0);
    return v.length ? round(avg(v), 2) : null;
  };
  const focusVals = entries.map((e) => e.focus).filter((n) => n > 0);

  return {
    days,
    loggedDays: entries.length,
    activeDays: active.length,
    totalHours,
    avgHoursPerDay: days > 0 ? round(totalHours / days, 1) : 0,
    avgHoursPerActiveDay: active.length ? round(totalHours / active.length, 1) : 0,
    consistency: days > 0 ? round(entries.length / days, 4) : 0,
    topics: entries.reduce((a, e) => a + (e.topicsCompleted?.length ?? 0), 0),
    revisions: entries.reduce((a, e) => a + (e.revisionSessions?.length ?? 0), 0),
    books: entries.reduce((a, e) => a + (e.booksStudied?.length ?? 0), 0),
    currentAffairs: entries.reduce((a, e) => a + (e.currentAffairs?.length ?? 0), 0),
    mocksTaken: mocks.length,
    avgMockPct: pcts.length ? round(avg(pcts), 1) : null,
    bestMockPct: pcts.length ? Math.max(...pcts) : null,
    avgMood: mood(entries),
    avgFocus: focusVals.length ? round(avg(focusVals), 2) : null,
    bestDay: ranked[0] ? { date: ranked[0].date, hours: ranked[0].totalHours } : null,
    topSubjects,
    previous: {
      totalHours: prevHours,
      activeDays: prevActive.length,
      mocksTaken: prevMocks.length,
      avgMood: mood(prevEntries),
    },
    change: {
      hours: frac(totalHours, prevHours),
      activeDays: frac(active.length, prevActive.length),
    },
    phase: currentPhase(w.startDate).name,
  };
}

/**
 * Starting points for the written half, drawn from what the numbers say. These
 * are seeded into the composer as editable text, never saved behind the user's
 * back — the point is to remove the blank page, not to put words in their mouth.
 */
export function suggestNarrative(m: ReviewMetrics): {
  wins: string[];
  struggles: string[];
  nextFocus: string[];
} {
  const wins: string[] = [];
  const struggles: string[] = [];
  const nextFocus: string[] = [];

  if (m.totalHours > 0)
    wins.push(`${m.totalHours}h logged across ${m.activeDays} active days.`);
  if (m.change.hours != null && m.change.hours > 0.05)
    wins.push(`Hours up ${Math.round(m.change.hours * 100)}% on the period before.`);
  if (m.consistency >= 1 && m.days > 1)
    wins.push(`Logged every one of the ${m.days} days.`);
  if (m.bestMockPct != null) wins.push(`Best mock came in at ${m.bestMockPct}%.`);
  if (m.revisions > 0) wins.push(`${m.revisions} revision sessions cleared.`);
  if (m.topics > 0) wins.push(`${m.topics} topics finished.`);
  if (m.topSubjects[0])
    wins.push(`Most time went to ${m.topSubjects[0].name} (${m.topSubjects[0].share}%).`);

  const unlogged = m.days - m.loggedDays;
  if (unlogged > 0)
    struggles.push(`${unlogged} day${unlogged === 1 ? "" : "s"} never got logged.`);
  if (m.change.hours != null && m.change.hours < -0.05)
    struggles.push(`Hours down ${Math.round(Math.abs(m.change.hours) * 100)}% on the period before.`);
  if (m.mocksTaken === 0) struggles.push("No mocks attempted in this period.");
  if (m.avgFocus != null && m.avgFocus < 3)
    struggles.push(`Focus averaged ${m.avgFocus}/5 — attention was thin.`);
  if (m.avgMood != null && m.previous.avgMood != null && m.avgMood < m.previous.avgMood - 0.3)
    struggles.push(`Mood slipped from ${m.previous.avgMood} to ${m.avgMood}.`);
  if (m.topSubjects.length === 1 && m.totalHours > 0)
    struggles.push("Everything went into a single subject.");

  if (m.mocksTaken === 0) nextFocus.push("Sit at least one full mock.");
  if (unlogged > 0) nextFocus.push("Log the day even when it was a bad one.");
  const thin = m.topSubjects[m.topSubjects.length - 1];
  if (m.topSubjects.length > 2 && thin && thin.share <= 10)
    nextFocus.push(`Give ${thin.name} real time — it got ${thin.share}%.`);

  return { wins, struggles, nextFocus };
}

/** A complete, editable Review draft for a period. */
export function buildReviewDraft(
  data: { journal: JournalEntry[]; mocks: MockTest[]; subjects: Subject[] },
  w: PeriodWindow,
  today: Date = new Date(),
): { review: Review; metrics: ReviewMetrics } {
  const metrics = computeReviewMetrics(data, w, today);
  const narrative = suggestNarrative(metrics);
  return {
    metrics,
    review: {
      id: uid("rev"),
      type: w.type,
      periodLabel: w.periodLabel,
      startDate: w.startDate,
      endDate: w.endDate,
      totalHours: metrics.totalHours,
      mocksTaken: metrics.mocksTaken,
      rating: ratingFrom(metrics),
      wins: narrative.wins,
      struggles: narrative.struggles,
      lessons: [],
      nextFocus: narrative.nextFocus,
    },
  };
}

/**
 * A starting rating out of 5, from consistency and output rather than mood — the
 * user can move it, but a blank star row invites a shrug.
 */
function ratingFrom(m: ReviewMetrics): number {
  let score = 2;
  if (m.consistency >= 0.85) score++;
  if (m.avgHoursPerDay >= 5) score++;
  if (m.mocksTaken > 0) score++;
  if (m.consistency < 0.5) score--;
  return Math.max(1, Math.min(5, score));
}

/** Existing review for a period, if one has already been written. */
export function findReviewFor(reviews: Review[], w: PeriodWindow): Review | undefined {
  return reviews.find((r) => r.type === w.type && r.startDate === w.startDate);
}
