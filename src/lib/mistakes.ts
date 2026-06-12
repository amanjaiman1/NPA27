import type { Mistake, MistakeCategory, Subject } from "./types";
import { toISODate, daysBetween } from "./utils";

/* ════════════════════════════════════════════════════════════════
   Mistake Tracker analytics. Pure functions over Mistake[] powering
   the review queue, category/subject analytics, heatmaps and the
   automatic recurring-mistake discovery.
   ════════════════════════════════════════════════════════════════ */

export const MISTAKE_CATEGORIES: MistakeCategory[] = [
  "Conceptual",
  "Factual",
  "Guessing",
  "Revision Failure",
  "Time Pressure",
  "Careless",
];

/** Short labels for compact UI (matrix headers, chips). */
export const CATEGORY_SHORT: Record<MistakeCategory, string> = {
  Conceptual: "Concept",
  Factual: "Factual",
  Guessing: "Guess",
  "Revision Failure": "Revision",
  "Time Pressure": "Time",
  Careless: "Careless",
};

export interface MasteryStats {
  total: number;
  open: number;
  reviewing: number;
  mastered: number;
  masteredPct: number;
}

export function masteryStats(mistakes: Mistake[]): MasteryStats {
  const total = mistakes.length;
  const open = mistakes.filter((m) => m.status === "Open").length;
  const reviewing = mistakes.filter((m) => m.status === "Reviewing").length;
  const mastered = mistakes.filter((m) => m.status === "Mastered").length;
  return {
    total,
    open,
    reviewing,
    mastered,
    masteredPct: total ? Math.round((mastered / total) * 100) : 0,
  };
}

export function categoryCounts(
  mistakes: Mistake[],
): { category: MistakeCategory; count: number }[] {
  return MISTAKE_CATEGORIES.map((category) => ({
    category,
    count: mistakes.filter((m) => m.category === category).length,
  })).sort((a, b) => b.count - a.count);
}

export function subjectCounts(
  mistakes: Mistake[],
  subjects: Subject[],
): { id: string; name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const m of mistakes) map.set(m.subjectId, (map.get(m.subjectId) ?? 0) + 1);
  return [...map.entries()]
    .map(([id, count]) => ({
      id,
      name: subjects.find((s) => s.id === id)?.name ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Mistakes due for review now (not yet mastered). */
export function dueForReview(
  mistakes: Mistake[],
  today = toISODate(new Date()),
): Mistake[] {
  return mistakes
    .filter((m) => m.status !== "Mastered" && m.nextReview <= today)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview));
}

export function upcomingCount(
  mistakes: Mistake[],
  today = toISODate(new Date()),
  days = 7,
): number {
  return mistakes.filter(
    (m) =>
      m.status !== "Mastered" &&
      m.nextReview > today &&
      daysBetween(today, m.nextReview) <= days,
  ).length;
}

export function mistakesByDate(mistakes: Mistake[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of mistakes) m.set(x.date, (m.get(x.date) ?? 0) + 1);
  return m;
}

/* ── Automatic recurring-mistake discovery ───────────────────── */

export interface RecurringPattern {
  key: string;
  subjectId: string;
  subjectName: string;
  topic: string;
  count: number;
  openCount: number; // not yet mastered
  dominantCategory: MistakeCategory;
  lastDate: string;
}

export function recurring(
  mistakes: Mistake[],
  subjects: Subject[],
): RecurringPattern[] {
  const groups = new Map<string, Mistake[]>();
  for (const m of mistakes) {
    const key = `${m.subjectId}::${m.topic.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const patterns: RecurringPattern[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const catTally = new Map<MistakeCategory, number>();
    for (const it of items)
      catTally.set(it.category, (catTally.get(it.category) ?? 0) + 1);
    const dominantCategory = [...catTally.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    const subjectId = items[0].subjectId;
    patterns.push({
      key,
      subjectId,
      subjectName: subjects.find((s) => s.id === subjectId)?.name ?? subjectId,
      topic: items[0].topic,
      count: items.length,
      openCount: items.filter((m) => m.status !== "Mastered").length,
      dominantCategory,
      lastDate: items.reduce((a, m) => (m.date > a ? m.date : a), items[0].date),
    });
  }
  return patterns.sort(
    (a, b) => b.count - a.count || b.openCount - a.openCount,
  );
}

/* ── Subject × category matrix (heatmap) ─────────────────────── */

export interface CategoryMatrix {
  rows: { id: string; name: string }[];
  cols: MistakeCategory[];
  values: number[][];
  max: number;
}

export function categorySubjectMatrix(
  mistakes: Mistake[],
  subjects: Subject[],
): CategoryMatrix {
  const rowIds = subjectCounts(mistakes, subjects).map((s) => s.id);
  const rows = rowIds.map((id) => ({
    id,
    name: subjects.find((s) => s.id === id)?.name ?? id,
  }));
  const values = rows.map((r) =>
    MISTAKE_CATEGORIES.map(
      (c) =>
        mistakes.filter((m) => m.subjectId === r.id && m.category === c).length,
    ),
  );
  const max = Math.max(1, ...values.flat());
  return { rows, cols: MISTAKE_CATEGORIES, values, max };
}
