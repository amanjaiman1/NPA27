import type { ISODate, RevisionItem, Subject } from "./types";
import { fromISODate, toISODate, daysBetween, round, avg, uid } from "./utils";

/* ════════════════════════════════════════════════════════════════
   Spaced repetition, as pure functions.

   The scheduling ladder used to live inline in the store's `reviseItem`
   reducer, which made it impossible to test and impossible to reuse — and
   the journal now needs exactly the same maths when a day's entry marks
   something as revised. Everything here is a function of (item, outcome,
   today), so both callers share one implementation.
   ════════════════════════════════════════════════════════════════ */

/**
 * Days until the next pass, indexed by how many consecutive successful recalls
 * an item has behind it. A miss drops back to the first rung.
 */
export const SR_INTERVALS = [1, 3, 7, 14, 30, 60];

/** The furthest the ladder goes, for describing an item as "mature". */
export const SR_MAX_INTERVAL = SR_INTERVALS[SR_INTERVALS.length - 1];

/**
 * The scheduling fields an item gets after being reviewed.
 *
 * `nextDue` is measured from `today` rather than from the old `nextDue`, so an
 * item left untouched for a month doesn't come back carrying a month of debt.
 */
export function nextSchedule(
  item: Pick<RevisionItem, "repetitions" | "confidence">,
  remembered: boolean,
  today: Date = new Date(),
): Pick<
  RevisionItem,
  "repetitions" | "intervalDays" | "lastRevised" | "nextDue" | "confidence"
> {
  const repetitions = remembered ? item.repetitions + 1 : 0;
  const intervalDays = SR_INTERVALS[Math.min(repetitions, SR_INTERVALS.length - 1)];
  const next = new Date(today);
  next.setDate(next.getDate() + intervalDays);
  return {
    repetitions,
    intervalDays,
    lastRevised: toISODate(today),
    nextDue: toISODate(next),
    confidence: Math.max(1, Math.min(5, item.confidence + (remembered ? 1 : -1))),
  };
}

/** An item advanced by one review. */
export function applyRevision(
  item: RevisionItem,
  remembered: boolean,
  today: Date = new Date(),
): RevisionItem {
  return { ...item, ...nextSchedule(item, remembered, today) };
}

/** A fresh item, due immediately — you add something because you want to revise it. */
export function newRevisionItem(
  subjectId: string,
  topic: string,
  today: Date = new Date(),
): RevisionItem {
  const iso = toISODate(today);
  return {
    id: uid("rev"),
    subjectId,
    topic,
    addedOn: iso,
    nextDue: iso,
    intervalDays: 0,
    repetitions: 0,
    confidence: 3,
  };
}

/* ── reading the queue ────────────────────────────────────────── */

export interface RevisionBuckets {
  /** Due before today — the ones actually slipping. */
  overdue: RevisionItem[];
  dueToday: RevisionItem[];
  upcoming: RevisionItem[];
}

/**
 * Splitting overdue from due-today matters: they were lumped together as "due",
 * which hid the difference between a queue you're keeping up with and one that's
 * running away from you.
 */
export function bucketRevisions(items: RevisionItem[], today: ISODate): RevisionBuckets {
  const byDue = (a: RevisionItem, b: RevisionItem) => a.nextDue.localeCompare(b.nextDue);
  return {
    overdue: items.filter((r) => r.nextDue < today).sort(byDue),
    dueToday: items.filter((r) => r.nextDue === today).sort(byDue),
    upcoming: items.filter((r) => r.nextDue > today).sort(byDue),
  };
}

/** How many days late an item is; 0 when it isn't. */
export function daysOverdue(item: RevisionItem, today: ISODate): number {
  return Math.max(0, daysBetween(item.nextDue, today));
}

export interface RevisionStats {
  total: number;
  overdue: number;
  dueToday: number;
  dueNow: number;
  next7: number;
  avgConfidence: number;
  /** Items that have survived to the top of the ladder. */
  mature: number;
  /** Items never reviewed even once. */
  untouched: number;
  /** Share of items whose confidence is 4 or 5, 0–1. */
  strongShare: number;
  /** The worst overdue item's lateness, in days. */
  worstOverdueDays: number;
}

export function revisionStats(items: RevisionItem[], today: ISODate): RevisionStats {
  const { overdue, dueToday, upcoming } = bucketRevisions(items, today);
  return {
    total: items.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
    dueNow: overdue.length + dueToday.length,
    next7: upcoming.filter((r) => daysBetween(today, r.nextDue) <= 7).length,
    avgConfidence: items.length ? round(avg(items.map((r) => r.confidence)), 1) : 0,
    mature: items.filter((r) => r.intervalDays >= SR_MAX_INTERVAL).length,
    untouched: items.filter((r) => !r.lastRevised).length,
    strongShare: items.length
      ? round(items.filter((r) => r.confidence >= 4).length / items.length, 4)
      : 0,
    worstOverdueDays: overdue.length ? daysOverdue(overdue[0], today) : 0,
  };
}

/**
 * How many items land on each of the next `days` days, so the load ahead is
 * visible before it arrives. Everything already late is folded into day 0 —
 * that is when you have to deal with it.
 */
export function revisionForecast(
  items: RevisionItem[],
  today: ISODate,
  days = 14,
): { date: ISODate; label: string; count: number; overdue: number }[] {
  const out: { date: ISODate; label: string; count: number; overdue: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = fromISODate(today);
    d.setDate(d.getDate() + i);
    const date = toISODate(d);
    const onDay = items.filter((r) => r.nextDue === date).length;
    const late = i === 0 ? items.filter((r) => r.nextDue < today).length : 0;
    out.push({
      date,
      label: i === 0 ? "Today" : String(d.getDate()),
      count: onDay + late,
      overdue: late,
    });
  }
  return out;
}

export interface SubjectRevision {
  subjectId: string;
  name: string;
  total: number;
  dueNow: number;
  overdue: number;
  avgConfidence: number;
}

export function subjectBreakdown(
  items: RevisionItem[],
  subjects: Subject[],
  today: ISODate,
): SubjectRevision[] {
  const ids = [...new Set(items.map((r) => r.subjectId))];
  return ids
    .map((subjectId) => {
      const mine = items.filter((r) => r.subjectId === subjectId);
      return {
        subjectId,
        name: subjects.find((s) => s.id === subjectId)?.name ?? subjectId,
        total: mine.length,
        dueNow: mine.filter((r) => r.nextDue <= today).length,
        overdue: mine.filter((r) => r.nextDue < today).length,
        avgConfidence: round(avg(mine.map((r) => r.confidence)), 1),
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.dueNow - a.dueNow || a.name.localeCompare(b.name));
}

/** Count of items at each confidence level, 1–5. */
export function confidenceSpread(
  items: RevisionItem[],
): { level: number; count: number }[] {
  return [1, 2, 3, 4, 5].map((level) => ({
    level,
    count: items.filter((r) => Math.round(r.confidence) === level).length,
  }));
}

/**
 * The syllabus topic a revision item refers to, if there is one.
 *
 * Revision items carry `subjectId` plus a free-text topic name rather than a
 * `Topic.id`, so reviewing one can only credit the syllabus topic by resolving
 * the name. Matching is case- and whitespace-insensitive because the two were
 * typed on different screens.
 */
export function resolveTopicId(
  item: Pick<RevisionItem, "subjectId" | "topic">,
  subjects: Subject[],
): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const subject = subjects.find((s) => s.id === item.subjectId);
  if (!subject) return null;
  return subject.topics.find((t) => norm(t.name) === norm(item.topic))?.id ?? null;
}

/** Describes an item's schedule in words, for a tooltip or list row. */
export function describeSchedule(item: RevisionItem, today: ISODate): string {
  if (item.nextDue < today) {
    const late = daysOverdue(item, today);
    return `${late} day${late === 1 ? "" : "s"} overdue`;
  }
  if (item.nextDue === today) return "Due today";
  const inDays = daysBetween(today, item.nextDue);
  return `in ${inDays} day${inDays === 1 ? "" : "s"}`;
}
