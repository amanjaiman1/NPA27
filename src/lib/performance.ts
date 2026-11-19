import type {
  ChronicleData,
  ISODate,
  PerformanceSnapshot,
  PerformanceTotals,
  Review,
  ReviewQuestionKey,
  ReviewType,
} from "./types";
import { countCompletedTopics } from "./topics";
import { countedSleepHours } from "./sleep";
import { addDays, overlapDays, weekStartOf } from "./roadmap";
import { habitConsistency, habitContext, habitStart, isActiveHabit, type HabitContext } from "./habit-engine";
import { daysBetween, fromISODate, round, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   PERFORMANCE REVIEW
   A period, measured from the records each module already keeps:
   hours, subjects and topics from the Daily Journal; planned and finished
   activities from the Roadmap; goals; revision passes; habits through the
   Habit Engine; sleep and exercise from the Life Dashboard; mocks.

   It never reads the Personal Diary: `PerformanceData` has no place for
   it, so a diary entry can't reach a review even by mistake.

   Every line of the summary says what kind of statement it is:
     recorded  what you logged ("31.5 h on 6 of 7 days")
     planned   what the Roadmap said you would do
     derived   worked out from records (a rate, a change, a share)
     missing   what has no record, said plainly rather than guessed
   A draft's figures stay live. Completing a review freezes them in a
   snapshot (`measurePeriod`), so a later edit to the journal never
   rewrites a finished review.
   ════════════════════════════════════════════════════════════════ */

export type PerformanceData = Pick<
  ChronicleData,
  "journal" | "lifeLog" | "revisions" | "plans" | "subjects" | "goals" | "habits" | "mocks" | "profile"
>;

export interface ReviewPeriod {
  type: ReviewType;
  /** `Weekly:2026-11-09`: matches a review to its period. */
  key: string;
  label: string;
  startDate: ISODate;
  endDate: ISODate;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9–15 Nov", "Nov 2026", "2026", "3 Nov – 16 Dec 2026". */
export function periodLabel(type: ReviewType, start: ISODate, end: ISODate): string {
  const s = fromISODate(start);
  const e = fromISODate(end);
  if (type === "Monthly") return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  if (type === "Yearly") return String(s.getFullYear());
  const sameYear = s.getFullYear() === e.getFullYear();
  const span =
    s.getMonth() === e.getMonth() && sameYear
      ? `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`
      : `${s.getDate()} ${MONTHS[s.getMonth()]}${sameYear ? "" : ` ${s.getFullYear()}`} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
  return type === "Custom" ? `${span} ${e.getFullYear()}` : span;
}

function makePeriod(type: ReviewType, startDate: ISODate, endDate: ISODate): ReviewPeriod {
  return { type, key: `${type}:${startDate}${type === "Custom" ? `:${endDate}` : ""}`, label: periodLabel(type, startDate, endDate), startDate, endDate };
}

function monthBounds(year: number, month: number): [ISODate, ISODate] {
  return [toISODate(new Date(year, month, 1)), toISODate(new Date(year, month + 1, 0))];
}

/**
 * The most recent `count` calendar periods, newest first. The one still
 * running is included: reviewing a week on its last day is normal.
 *
 * Review weeks run Monday to Sunday whatever the Roadmap's week start, as
 * goals and the "review not written" reminder count them, so a review
 * always matches the week those ask about (and every older review).
 */
export function recentPeriods(type: Exclude<ReviewType, "Custom">, today: ISODate, count = 8): ReviewPeriod[] {
  const out: ReviewPeriod[] = [];
  const t = fromISODate(today);
  for (let i = 0; i < count; i++) {
    if (type === "Weekly") {
      const start = addDays(weekStartOf(today, 1), -7 * i);
      out.push(makePeriod(type, start, addDays(start, 6)));
    } else if (type === "Monthly") {
      const [start, end] = monthBounds(t.getFullYear(), t.getMonth() - i);
      out.push(makePeriod(type, start, end));
    } else {
      const y = t.getFullYear() - i;
      out.push(makePeriod(type, `${y}-01-01`, `${y}-12-31`));
    }
  }
  return out;
}

/** Any range of days you choose. */
export function customPeriod(startDate: ISODate, endDate: ISODate): ReviewPeriod {
  return startDate <= endDate ? makePeriod("Custom", startDate, endDate) : makePeriod("Custom", endDate, startDate);
}

/** The same kind of period just before: the week, month or year before, or as many days before. */
export function previousPeriod(p: ReviewPeriod): ReviewPeriod {
  if (p.type === "Weekly") return makePeriod(p.type, addDays(p.startDate, -7), addDays(p.startDate, -1));
  if (p.type === "Monthly") {
    const s = fromISODate(p.startDate);
    const [start, end] = monthBounds(s.getFullYear(), s.getMonth() - 1);
    return makePeriod(p.type, start, end);
  }
  if (p.type === "Yearly") {
    const y = fromISODate(p.startDate).getFullYear() - 1;
    return makePeriod(p.type, `${y}-01-01`, `${y}-12-31`);
  }
  const length = daysBetween(p.startDate, p.endDate) + 1;
  return makePeriod("Custom", addDays(p.startDate, -length), addDays(p.startDate, -1));
}

export function periodOfReview(r: Pick<Review, "type" | "startDate" | "endDate">): ReviewPeriod {
  return makePeriod(r.type, r.startDate, r.endDate);
}

/** The review written for this period, if there is one. */
export function findReview(reviews: Review[], p: ReviewPeriod): Review | undefined {
  return reviews.find((r) => r.type === p.type && r.startDate === p.startDate && (p.type !== "Custom" || r.endDate === p.endDate));
}

/** Older reviews have no status: they were finished when written. */
export function isCompleted(r: Review): boolean {
  return r.status !== "draft";
}

/* ── Measuring ───────────────────────────────────────────────── */

const mockPct = (score: number, max: number) => (max > 0 ? (score / max) * 100 : null);

interface Planned {
  planned: number;
  completed: number;
  deferred: number;
  open: number;
  unfinished: { title: string; href: string }[];
}

/**
 * The activities planned for the period: a week plan's activities when its
 * week falls in the period, and any activity dated inside it. Work carried
 * forward to a plan that is also in the period counts once, where it ended up.
 */
function plannedIn(plans: PerformanceData["plans"], start: ISODate, end: ISODate): Planned {
  const included = new Map<string, { planId: string; item: NonNullable<PerformanceData["plans"][number]["items"]>[number] }>();
  for (const plan of plans) {
    for (const item of plan.items ?? []) {
      if (item.kind !== "activity") continue;
      const inside = item.targetDate
        ? item.targetDate >= start && item.targetDate <= end
        : plan.level === "week" && overlapDays(plan.start, plan.end, start, end) > 0;
      if (inside) included.set(`${plan.id}:${item.id}`, { planId: plan.id, item });
    }
  }
  const out: Planned = { planned: 0, completed: 0, deferred: 0, open: 0, unfinished: [] };
  for (const { planId, item } of included.values()) {
    if (item.carriedTo && included.has(`${item.carriedTo.planId}:${item.carriedTo.itemId}`)) continue;
    out.planned++;
    if (item.status === "completed") out.completed++;
    else if (item.status === "deferred") out.deferred++;
    else {
      out.open++;
      if (out.unfinished.length < 8) out.unfinished.push({ title: item.title, href: `/roadmap?plan=${planId}&item=${item.id}` });
    }
  }
  return out;
}

/** Everything measurable about a period, as it stands now. */
export function measurePeriod(data: PerformanceData, p: ReviewPeriod, today: ISODate, takenAt = new Date().toISOString()): PerformanceSnapshot {
  // One read of the records for both periods.
  const ctx = habitContext(data, today);
  const snapshot = measureOnly(data, ctx, p, today, takenAt);
  const before = measureOnly(data, ctx, previousPeriod(p), today, takenAt);
  return { ...snapshot, previous: totalsOf(before) };
}

function measureOnly(data: PerformanceData, ctx: HabitContext, p: ReviewPeriod, today: ISODate, takenAt: string): PerformanceSnapshot {
  const start = p.startDate;
  // Days still to come aren't counted: a running week is measured so far.
  const end = p.endDate < today ? p.endDate : today;
  const days = end < start ? 0 : daysBetween(start, end) + 1;
  const inRange = (d: ISODate) => d >= start && d <= end;

  const entries = data.journal.filter((e) => inRange(e.date));
  const active = entries.filter((e) => e.totalHours > 0);
  const studyHours = round(entries.reduce((sum, e) => sum + (e.totalHours || 0), 0), 1);
  const bySubject = new Map<string, number>();
  let sessions = 0;
  for (const e of entries) {
    for (const b of e.blocks ?? []) {
      if (!(b?.hours > 0)) continue;
      sessions++;
      if (b.subjectId) bySubject.set(b.subjectId, (bySubject.get(b.subjectId) ?? 0) + b.hours);
    }
  }
  const blockTotal = [...bySubject.values()].reduce((a, b) => a + b, 0);
  const subjectName = new Map(data.subjects.map((s) => [s.id, s.name]));
  const subjects = [...bySubject.entries()]
    .map(([id, hours]) => ({
      id,
      name: subjectName.get(id) ?? "A removed subject",
      hours: round(hours, 1),
      share: blockTotal > 0 ? Math.round((hours / blockTotal) * 100) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);
  const best = [...active].sort((a, b) => b.totalHours - a.totalHours)[0];

  const planned = plannedIn(data.plans, start, end < start ? start : p.endDate);

  // Revision passes through the same event layer as the habits: a pass logged
  // in the journal and marked on the Revision page is one pass.
  let passes = 0;
  for (const [date, list] of ctx.index) if (inRange(date)) passes += list.filter((e) => e.kind === "revisionPass").length;

  // Habits through the Habit Engine: only days each habit was due count.
  const habitRows: { id: string; name: string; due: number; kept: number }[] = [];
  if (days > 0) {
    for (const h of data.habits) {
      if (!isActiveHabit(h) || habitStart(h) > end) continue;
      const c = habitConsistency(h, ctx, start, end);
      if (c.due > 0) habitRows.push({ id: h.id, name: h.name, due: c.due, kept: c.kept });
    }
  }
  const habitDue = habitRows.reduce((n, r) => n + r.due, 0);
  const habitKept = habitRows.reduce((n, r) => n + r.kept, 0);

  const mocks = data.mocks.filter((m) => inRange(m.date));
  const pcts = mocks.map((m) => mockPct(m.score, m.max)).filter((v): v is number => v !== null);

  const nights = data.lifeLog.map((e) => (inRange(e.date) ? countedSleepHours(e) : undefined)).filter((h): h is number => h !== undefined);
  const moved = data.lifeLog.filter((e) => inRange(e.date) && typeof e.exerciseMinutes === "number" && e.exerciseMinutes > 0);

  return {
    takenAt,
    days,
    daysLogged: entries.length,
    activeDays: active.length,
    studyHours,
    hoursTarget: round(Math.max(0, data.profile.dailyHourTarget || 0) * days, 1),
    sessions,
    topicsCompleted: entries.reduce((sum, e) => sum + countCompletedTopics(e), 0),
    subjects,
    roadmap: { planned: planned.planned, completed: planned.completed, deferred: planned.deferred, open: planned.open },
    revision: {
      passes,
      dueNow: data.revisions.filter((r) => r.nextDue <= today).length,
      overdue: data.revisions.filter((r) => r.nextDue < today).length,
    },
    habits: { scheduled: habitDue, kept: habitKept, rate: habitDue ? round(habitKept / habitDue, 4) : null },
    goals: {
      active: data.goals.filter((g) => g.status === "Active").length,
      completed: data.goals.filter((g) => g.completedOn && inRange(g.completedOn)).length,
      milestonesDone: data.goals.reduce((n, g) => n + (g.milestones ?? []).filter((m) => m.doneOn && inRange(m.doneOn)).length, 0),
    },
    mocks: { taken: mocks.length, avgPct: pcts.length ? round(pcts.reduce((a, b) => a + b, 0) / pcts.length, 1) : null },
    sleep: { nights: nights.length, avgHours: nights.length ? round(nights.reduce((a, b) => a + b, 0) / nights.length, 1) : null },
    exercise: { days: moved.length, minutes: moved.reduce((n, e) => n + (e.exerciseMinutes ?? 0), 0) },
    bestDay: best ? { date: best.date, hours: round(best.totalHours, 1) } : null,
    habitRows,
    unfinished: planned.unfinished,
  };
}

export function totalsOf(s: PerformanceSnapshot): PerformanceTotals {
  return {
    studyHours: s.studyHours,
    activeDays: s.activeDays,
    topicsCompleted: s.topicsCompleted,
    revisionPasses: s.revision.passes,
    habitRate: s.habits.rate,
    roadmapCompleted: s.roadmap.completed,
    roadmapPlanned: s.roadmap.planned,
    mocksTaken: s.mocks.taken,
    sleepAvg: s.sleep.avgHours,
  };
}

/** A review's figures: frozen if it's completed and has them, else measured now. */
export function figuresFor(r: Review, data: PerformanceData, today: ISODate): { snapshot: PerformanceSnapshot; frozen: boolean } {
  if (isCompleted(r) && r.snapshot) return { snapshot: r.snapshot, frozen: true };
  return { snapshot: measurePeriod(data, periodOfReview(r), today), frozen: false };
}

/* ── The summary ─────────────────────────────────────────────── */

export type ObservationKind = "recorded" | "planned" | "derived" | "missing";

export const OBSERVATION_LABEL: Record<ObservationKind, string> = {
  recorded: "Recorded",
  planned: "Planned",
  derived: "Worked out",
  missing: "No record",
};

export interface Observation {
  kind: ObservationKind;
  text: string;
  /** Where to see the records. */
  href?: string;
  /** For ordering the good news and the bad. */
  tone?: "good" | "bad";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hours = (h: number) => `${round(h, 1)} h`;

function change(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}

/** What the figures say, a statement each, labelled by where it comes from. */
export function summarize(s: PerformanceSnapshot, typeWord = "period"): Observation[] {
  const out: Observation[] = [];
  const prev = s.previous;
  if (s.days === 0) return [{ kind: "missing", text: `This ${typeWord} hasn't started yet.` }];

  // Study
  if (s.daysLogged > 0) {
    out.push({
      kind: "recorded",
      text: `${hours(s.studyHours)} of study on ${plural(s.activeDays, "day")} of ${s.days}${s.sessions ? `, in ${plural(s.sessions, "session")}` : ""}.`,
      href: "/journal",
    });
  }
  const unlogged = s.days - s.daysLogged;
  if (unlogged > 0) out.push({ kind: "missing", text: `${plural(unlogged, "day")} with no journal entry.`, href: "/journal", tone: "bad" });
  if (s.hoursTarget > 0 && s.daysLogged > 0) {
    const share = s.studyHours / s.hoursTarget;
    out.push({
      kind: "derived",
      text: `That's ${Math.round(share * 100)}% of the ${hours(s.hoursTarget)} your daily target adds up to.`,
      tone: share >= 0.9 ? "good" : share < 0.6 ? "bad" : undefined,
    });
  }
  if (prev) {
    const c = change(s.studyHours, prev.studyHours);
    if (c !== null && Math.abs(c) >= 0.05)
      out.push({
        kind: "derived",
        text: `Hours ${c > 0 ? "up" : "down"} ${Math.abs(Math.round(c * 100))}% on the ${typeWord} before (${hours(prev.studyHours)}).`,
        tone: c > 0 ? "good" : "bad",
      });
  }
  if (s.subjects.length) {
    const top = s.subjects[0];
    out.push({ kind: "derived", text: `Most time went to ${top.name}: ${hours(top.hours)}, ${top.share}% of the subject hours.` });
  }
  if (s.topicsCompleted > 0) out.push({ kind: "recorded", text: `${plural(s.topicsCompleted, "topic")} finished.`, href: "/journal?tab=topics", tone: "good" });

  // Plan
  if (s.roadmap.planned > 0) {
    const parts = [`${s.roadmap.completed} completed`];
    if (s.roadmap.deferred) parts.push(`${s.roadmap.deferred} deferred or carried forward`);
    if (s.roadmap.open) parts.push(`${s.roadmap.open} still open`);
    out.push({
      kind: "planned",
      text: `The Roadmap had ${plural(s.roadmap.planned, "activity", "activities")} for this ${typeWord}: ${parts.join(", ")}.`,
      href: "/roadmap",
      tone: s.roadmap.completed === s.roadmap.planned ? "good" : s.roadmap.open > s.roadmap.completed ? "bad" : undefined,
    });
  } else out.push({ kind: "missing", text: `No Roadmap activities were planned for this ${typeWord}.`, href: "/roadmap" });

  // Revision
  if (s.revision.passes > 0) out.push({ kind: "recorded", text: `${plural(s.revision.passes, "revision pass", "revision passes")}.`, href: "/revision", tone: "good" });
  else out.push({ kind: "missing", text: "No revision recorded.", href: "/revision", tone: "bad" });

  // Habits
  if (s.habits.scheduled > 0 && s.habits.rate !== null) {
    out.push({
      kind: "derived",
      text: `Habits kept on ${s.habits.kept} of ${s.habits.scheduled} due ${s.habits.scheduled === 1 ? "day" : "days"} (${Math.round(s.habits.rate * 100)}%).`,
      href: "/habits",
      tone: s.habits.rate >= 0.8 ? "good" : s.habits.rate < 0.5 ? "bad" : undefined,
    });
  }

  // Goals
  if (s.goals.completed || s.goals.milestonesDone)
    out.push({
      kind: "recorded",
      text: [s.goals.completed ? `${plural(s.goals.completed, "goal")} completed` : "", s.goals.milestonesDone ? `${plural(s.goals.milestonesDone, "goal milestone")} reached` : ""]
        .filter(Boolean)
        .join(", ")
        .replace(/^./, (c) => c.toUpperCase()) + ".",
      href: "/goals",
      tone: "good",
    });

  // Mocks
  if (s.mocks.taken > 0)
    out.push({
      kind: "recorded",
      text: `${plural(s.mocks.taken, "mock")} taken${s.mocks.avgPct !== null ? `, averaging ${s.mocks.avgPct}%` : ""}.`,
      href: "/mocks",
    });
  else out.push({ kind: "missing", text: "No mock test this period.", href: "/mocks" });

  // Life
  if (s.sleep.nights > 0 && s.sleep.avgHours !== null) {
    out.push({
      kind: "recorded",
      text: `Slept ${hours(s.sleep.avgHours)} a night on average, over ${plural(s.sleep.nights, "night")} recorded.`,
      href: "/wellbeing/sleep",
      tone: s.sleep.avgHours < 6 ? "bad" : undefined,
    });
    if (s.sleep.nights < s.days) out.push({ kind: "missing", text: `${plural(s.days - s.sleep.nights, "night")} with no sleep recorded.`, href: "/wellbeing" });
  } else out.push({ kind: "missing", text: "No sleep recorded.", href: "/wellbeing" });
  if (s.exercise.days > 0) out.push({ kind: "recorded", text: `Exercised on ${plural(s.exercise.days, "day")}, ${s.exercise.minutes} minutes in all.`, href: "/wellbeing" });

  return out;
}

/* ── The questions ───────────────────────────────────────────── */

export const REVIEW_QUESTIONS: { key: ReviewQuestionKey; label: string; hint: string; placeholder: string }[] = [
  { key: "wentWell", label: "What went well?", hint: "The days, habits or subjects that worked, and why.", placeholder: "Kept to the morning revision every day." },
  { key: "struggled", label: "What did you struggle with?", hint: "What got in the way. Be specific, not harsh.", placeholder: "Lost two evenings to my phone." },
  { key: "attention", label: "Which subject needs attention?", hint: "The one falling behind, and what it needs.", placeholder: "Economy: no hours this week." },
  { key: "unfinished", label: "What did you leave unfinished?", hint: "Commitments to carry forward or let go.", placeholder: "The Modern History test series." },
  { key: "change", label: "What will you change?", hint: "One or two changes you can actually make.", placeholder: "Phone in another room after 9 PM." },
  { key: "priorities", label: "What are the priorities for next time?", hint: "The few things the next period is for.", placeholder: "Finish Polity, two full mocks." },
];

/**
 * Starting points for each question, worked out from the figures. Offered
 * as a suggestion you can insert and edit, never written in for you.
 */
export function suggestAnswers(s: PerformanceSnapshot, data: Pick<PerformanceData, "subjects">, typeWord = "period"): Partial<Record<ReviewQuestionKey, string>> {
  const out: Partial<Record<ReviewQuestionKey, string>> = {};
  const obs = summarize(s, typeWord);
  const good = obs.filter((o) => o.tone === "good").map((o) => o.text);
  const bad = obs.filter((o) => o.tone === "bad").map((o) => o.text);
  if (good.length) out.wentWell = good.slice(0, 3).join(" ");
  if (bad.length) out.struggled = bad.slice(0, 3).join(" ");

  // The subject that got least: one of yours with no hours, else the smallest share.
  const studied = new Set(s.subjects.map((x) => x.id));
  const untouched = data.subjects.filter((x) => !studied.has(x.id) && x.topics.some((t) => t.status !== "mastered"));
  if (untouched.length) {
    const pick = [...untouched].sort((a, b) => b.topics.filter((t) => t.status === "untouched").length - a.topics.filter((t) => t.status === "untouched").length)[0];
    out.attention = `${pick.name}: no hours this ${typeWord}.`;
  } else if (s.subjects.length > 2) {
    const least = s.subjects[s.subjects.length - 1];
    out.attention = `${least.name}: only ${hours(least.hours)} (${least.share}%).`;
  }

  if (s.unfinished?.length) out.unfinished = s.unfinished.map((u) => u.title).join("; ") + ".";
  const changes: string[] = [];
  if (s.days - s.daysLogged > 0) changes.push("Log every day, even a short one.");
  if (s.revision.passes === 0 || s.revision.overdue > 5) changes.push("Clear the revision queue a little each day.");
  if (s.habits.rate !== null && s.habits.rate < 0.6) changes.push("Make one habit easier to keep.");
  if (s.sleep.avgHours !== null && s.sleep.avgHours < 6.5) changes.push("Protect sleep: a fixed bedtime.");
  if (changes.length) out.change = changes.slice(0, 2).join(" ");
  const next: string[] = [];
  if (s.unfinished?.length) next.push(`Finish “${s.unfinished[0].title}”.`);
  if (out.attention) next.push(`Give ${out.attention.split(":")[0]} real time.`);
  if (s.mocks.taken === 0) next.push("Sit at least one full mock.");
  if (next.length) out.priorities = next.slice(0, 3).join(" ");
  return out;
}

/**
 * Answers for an older review, read from the lists it was written with, so
 * editing it starts from what it says.
 */
export function answersOf(r: Review): Partial<Record<ReviewQuestionKey, string>> {
  if (r.answers && Object.values(r.answers).some((v) => v?.trim())) return r.answers;
  const join = (xs?: string[]) => (xs ?? []).filter((x) => x.trim()).join("\n");
  const out: Partial<Record<ReviewQuestionKey, string>> = {};
  if (r.wins?.length) out.wentWell = join(r.wins);
  if (r.struggles?.length) out.struggled = join(r.struggles);
  if (r.lessons?.length) out.change = join(r.lessons);
  if (r.nextFocus?.length) out.priorities = join(r.nextFocus);
  return out;
}

/** The older lists, kept in step with the answers so an older device still shows the review. */
export function legacyListsOf(answers: Partial<Record<ReviewQuestionKey, string>>): Pick<Review, "wins" | "struggles" | "lessons" | "nextFocus"> {
  const lines = (t?: string) => (t ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return { wins: lines(answers.wentWell), struggles: lines(answers.struggled), lessons: lines(answers.change), nextFocus: lines(answers.priorities) };
}

/* ── History ─────────────────────────────────────────────────── */

/** Does a review match the words searched for? Period, type and what was written. */
export function reviewMatches(r: Review, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [r.periodLabel, r.type, ...Object.values(answersOf(r)), ...(r.wins ?? []), ...(r.struggles ?? []), ...(r.lessons ?? []), ...(r.nextFocus ?? [])]
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** One review as Markdown, for keeping outside the app. */
export function reviewMarkdown(r: Review, s: PerformanceSnapshot | null): string {
  const lines: string[] = [`# ${r.type} review: ${r.periodLabel}`, "", `${r.startDate} to ${r.endDate}${isCompleted(r) ? "" : " (draft)"}`, ""];
  if (s) {
    lines.push("## Figures", "");
    lines.push(`- Study: ${hours(s.studyHours)} on ${s.activeDays} of ${s.days} days`);
    if (s.subjects.length) lines.push(`- Subjects: ${s.subjects.map((x) => `${x.name} ${hours(x.hours)}`).join(", ")}`);
    lines.push(`- Topics finished: ${s.topicsCompleted}`);
    lines.push(`- Revision passes: ${s.revision.passes}`);
    if (s.roadmap.planned) lines.push(`- Roadmap: ${s.roadmap.completed} of ${s.roadmap.planned} activities completed`);
    if (s.habits.rate !== null) lines.push(`- Habits: ${s.habits.kept} of ${s.habits.scheduled} due days kept`);
    lines.push(`- Mocks: ${s.mocks.taken}${s.mocks.avgPct !== null ? `, average ${s.mocks.avgPct}%` : ""}`);
    if (s.sleep.avgHours !== null) lines.push(`- Sleep: ${hours(s.sleep.avgHours)} a night`);
    lines.push("");
  }
  const answers = answersOf(r);
  for (const q of REVIEW_QUESTIONS) {
    const a = answers[q.key]?.trim();
    if (!a) continue;
    lines.push(`## ${q.label}`, "", a, "");
  }
  if (r.rating) lines.push(`Overall: ${r.rating} of 5`, "");
  return lines.join("\n");
}

/** Trend rows for the last few periods of a kind, oldest first. */
export function periodTrend(data: PerformanceData, type: Exclude<ReviewType, "Custom">, today: ISODate, count: number): { period: ReviewPeriod; totals: PerformanceTotals }[] {
  const ctx = habitContext(data, today);
  return recentPeriods(type, today, count)
    .reverse()
    .map((period) => ({ period, totals: totalsOf(measureOnly(data, ctx, period, today, "")) }));
}
