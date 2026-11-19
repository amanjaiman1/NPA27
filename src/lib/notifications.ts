/* ════════════════════════════════════════════════════════════════
   INTELLIGENT NOTIFICATIONS — THE RULES ENGINE
   Pure. No React, no browser globals, no storage, no `new Date()`.
   Every notification in the app is *derived* from the same data the
   pages read, so a notice can never disagree with the page it links
   to. See docs/notifications.md for the wireframe this implements.
   ════════════════════════════════════════════════════════════════ */

import type { ChronicleData, ISODate, ReviewType } from "./types";
import { daysBetween, fromISODate, toISODate } from "./utils";
import { bucketRevisions, daysOverdue } from "./revision";
import { dueForReview } from "./mistakes";
import { computeGoalProgress, type GoalData } from "./goals";
import { staleTopics } from "./subjects";
import { reviewPeriods, findReviewFor } from "./review-builder";
import { currentStreak, hoursByDate } from "./selectors";
import { clockMinutes, countedSleepHours } from "./sleep";
import { habitContext, habitSource, todayHabits, weeklyAtRisk } from "./habit-engine";

/* ── shape ───────────────────────────────────────────────────── */

export type Priority = "critical" | "high" | "normal" | "low";

export type Category =
  | "revision"
  | "goals"
  | "journal"
  | "habits"
  | "study"
  | "review"
  | "life"
  | "exam";

export type RuleId =
  | "revision-overdue"
  | "revision-due-today"
  | "mistakes-due"
  | "journal-unlogged"
  | "journal-streak-risk"
  | "habits-pending"
  | "goal-deadline"
  | "goal-at-risk"
  | "goal-ready"
  | "mock-drought"
  | "review-unwritten"
  | "reflection-gap"
  | "subject-stale-topics"
  | "book-stalled"
  | "ca-gap"
  | "sleep-debt"
  | "exam-countdown";

export interface Notice {
  /**
   * Stable identity of this *occurrence*. Built from the rule, the thing it is
   * about, and a time bucket — never from an array index, a timestamp or the
   * message text, because read-state is keyed on it and has to survive every
   * recomputation. The bucket is what lets a notice legitimately return
   * tomorrow: that choice is the rule's nag policy.
   */
  id: string;
  ruleId: RuleId;
  category: Category;
  priority: Priority;
  title: string;
  body: string;
  /** Deep link to the page that *resolves* it, query included. */
  href: string;
  cta: string;
  /** Set when one notice speaks for many items. */
  count?: number;
  /**
   * Rule + subject with the time bucket deliberately left out. Delivery uses it
   * to answer "have I already interrupted them about this?", so a notice
   * re-appearing daily in the centre does not re-buzz daily on the lock screen.
   */
  dedupeKey: string;
}

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "Needs attention",
  normal: "Today",
  low: "Ambient",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  revision: "Revision",
  goals: "Goals",
  journal: "Journal",
  habits: "Habits",
  study: "Study",
  review: "Reviews",
  life: "Wellbeing",
  exam: "Exam",
};

/** Catalogue metadata, so the settings pane can list rules without hardcoding. */
export interface RuleMeta {
  id: RuleId;
  category: Category;
  label: string;
  description: string;
}

export const RULES: RuleMeta[] = [
  {
    id: "revision-overdue",
    category: "revision",
    label: "Overdue revisions",
    description: "Scheduled revisions that are past their due date.",
  },
  {
    id: "revision-due-today",
    category: "revision",
    label: "Revisions due today",
    description: "Today's cards, when nothing is overdue.",
  },
  {
    id: "mistakes-due",
    category: "revision",
    label: "Mistakes to review",
    description: "Logged mistakes due for a recall check.",
  },
  {
    id: "journal-unlogged",
    category: "journal",
    label: "Today not logged",
    description: "No study hours recorded today, after your reminder hour.",
  },
  {
    id: "journal-streak-risk",
    category: "journal",
    label: "Streak at risk",
    description: "A streak of three days or more dies at midnight.",
  },
  {
    id: "habits-pending",
    category: "habits",
    label: "Habits pending",
    description: "Habits due today that aren't kept yet, after the reminder time (or each habit's own).",
  },
  {
    id: "goal-deadline",
    category: "goals",
    label: "Goal deadline near",
    description: "An active goal is due within three days.",
  },
  {
    id: "goal-at-risk",
    category: "goals",
    label: "Goal off pace",
    description: "Current pace will not reach the target in time.",
  },
  {
    id: "goal-ready",
    category: "goals",
    label: "Goal ready to close",
    description: "A tracked goal has met its target and can be completed.",
  },
  {
    id: "mock-drought",
    category: "study",
    label: "No recent mock",
    description: "No mock test attempted for two weeks.",
  },
  {
    id: "review-unwritten",
    category: "review",
    label: "Review not written",
    description: "A week or month ended without a finished review, or its review is still a draft.",
  },
  {
    id: "reflection-gap",
    category: "review",
    label: "Diary gap",
    description: "A gentle note when your Personal Diary has been quiet for a week.",
  },
  {
    id: "subject-stale-topics",
    category: "study",
    label: "Stale topics",
    description: "Topics untouched for 45 days or more.",
  },
  {
    id: "book-stalled",
    category: "study",
    label: "Book stalled",
    description: "A book marked Reading has seen no pages for two weeks.",
  },
  {
    id: "ca-gap",
    category: "study",
    label: "Current affairs gap",
    description: "Nothing added to the vault for three days.",
  },
  {
    id: "sleep-debt",
    category: "life",
    label: "Sleep debt",
    description: "Seven-day average sleep below six hours.",
  },
  {
    id: "exam-countdown",
    category: "exam",
    label: "Exam countdown",
    description: "Milestone days-to-exam markers.",
  },
];

export function ruleMeta(id: RuleId): RuleMeta | undefined {
  return RULES.find((r) => r.id === id);
}

/* ── settings ────────────────────────────────────────────────── */

export interface NotifySettings {
  enabled: boolean;
  /** Whether to fire OS-level notifications at all (needs permission). */
  deliver: boolean;
  digest: boolean;
  digestHour: number;
  quietFrom: number;
  quietTo: number;
  maxPerDay: number;
  minGapMinutes: number;
  /** When "you haven't logged today" starts being a fair thing to say. */
  reminderHour: number;
  mutedRules: RuleId[];
  mutedCategories: Category[];
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: true,
  deliver: false,
  digest: true,
  digestHour: 7,
  quietFrom: 22,
  quietTo: 7,
  maxPerDay: 4,
  minGapMinutes: 45,
  reminderHour: 18,
  mutedRules: [],
  mutedCategories: [],
};

/** Tolerate a partial / older stored object without ever returning undefined. */
export function withDefaults(s?: Partial<NotifySettings> | null): NotifySettings {
  return { ...DEFAULT_NOTIFY_SETTINGS, ...(s ?? {}) };
}

/* ── local date helpers (kept private, mirroring lib/goals.ts) ── */

function shift(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Monday of the week containing `iso` — Monday-first, as everywhere else. */
function weekStart(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return shift(iso, -((d.getDay() + 6) % 7));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ── the engine ──────────────────────────────────────────────── */

export interface EvaluateOptions {
  /** The instant to evaluate at. Always explicit — never read from the clock. */
  now: Date;
  settings?: Partial<NotifySettings> | null;
  /**
   * Whether `data.plans` holds this account's Roadmap work. Always so in the
   * app; on the server, only when the dispatcher's reader carries the
   * completed activities. Without them, habits that count Roadmap work are
   * left out rather than guessed. Defaults to true.
   */
  roadmapKnown?: boolean;
}

/**
 * Everything that is true right now, sorted. Deterministic for a given
 * `(data, now, settings)` — that is the whole contract, and what makes the
 * engine testable under plain node and reusable on a server.
 */
export function evaluate(
  data: ChronicleData,
  { now, settings, roadmapKnown = true }: EvaluateOptions,
): Notice[] {
  const cfg = withDefaults(settings);
  if (!cfg.enabled) return [];

  const today = toISODate(now);
  const hour = now.getHours();
  const week = weekStart(today);
  const out: Notice[] = [];

  const muted = (ruleId: RuleId, category: Category) =>
    cfg.mutedRules.includes(ruleId) || cfg.mutedCategories.includes(category);

  const push = (n: Notice) => {
    if (muted(n.ruleId, n.category)) return;
    out.push(n);
  };

  /* ── revision ─────────────────────────────────────────────── */

  const buckets = bucketRevisions(data.revisions ?? [], today);
  const overdue = buckets.overdue;
  if (overdue.length > 0) {
    const oldest = daysOverdue(overdue[0], today);
    push({
      id: `revision-overdue:${today}`,
      ruleId: "revision-overdue",
      category: "revision",
      priority: overdue.length >= 8 || oldest >= 7 ? "critical" : "high",
      title: `${plural(overdue.length, "revision")} overdue`,
      body:
        oldest > 0
          ? `The oldest has been waiting ${plural(oldest, "day")}. Recall fades fastest right after it's due.`
          : "They're past their scheduled date.",
      href: "/revision",
      cta: "Open revision",
      count: overdue.length,
      dedupeKey: "revision-overdue",
    });
  } else if (buckets.dueToday.length > 0) {
    /**
     * Deliberately exclusive with the rule above: being told about today's three
     * cards while nine are rotting is worse than being told nothing.
     */
    push({
      id: `revision-due-today:${today}`,
      ruleId: "revision-due-today",
      category: "revision",
      priority: "normal",
      title: `${plural(buckets.dueToday.length, "revision")} due today`,
      body: "Clear them and the schedule stays honest.",
      href: "/revision",
      cta: "Open revision",
      count: buckets.dueToday.length,
      dedupeKey: "revision-due-today",
    });
  }

  const mistakesDue = dueForReview(data.mistakes ?? [], today);
  if (mistakesDue.length > 0) {
    push({
      id: `mistakes-due:${today}`,
      ruleId: "mistakes-due",
      category: "revision",
      priority: "normal",
      title: `${plural(mistakesDue.length, "mistake")} to review`,
      body: "A mistake you haven't re-tested is a mistake you still have.",
      href: "/mistakes",
      cta: "Review mistakes",
      count: mistakesDue.length,
      dedupeKey: "mistakes-due",
    });
  }

  /* ── journal ──────────────────────────────────────────────── */

  /**
   * Tested on *hours*, not on whether an entry exists: the daily sleep prompt
   * creates a stub entry at wake-up with `totalHours: 0`, so `find(...)` would
   * report the day as logged from the moment you answered it.
   */
  const hoursToday = hoursByDate(data.journal ?? []).get(today) ?? 0;
  const streak = currentStreak(data.journal ?? [], now);
  const streakAtRisk = hoursToday <= 0 && streak >= 3 && hour >= 20;

  if (streakAtRisk) {
    push({
      id: `journal-streak-risk:${today}`,
      ruleId: "journal-streak-risk",
      category: "journal",
      priority: "critical",
      title: `${plural(streak, "day")} of streak ends at midnight`,
      body: "Nothing logged today yet. Any amount of study keeps it alive.",
      href: "/journal?new=1",
      cta: "Log today",
      count: streak,
      dedupeKey: "journal-streak-risk",
    });
  } else if (hoursToday <= 0 && hour >= cfg.reminderHour) {
    /** Exclusive with the streak warning — both would say "log today". */
    push({
      id: `journal-unlogged:${today}`,
      ruleId: "journal-unlogged",
      category: "journal",
      priority: "high",
      title: "Today isn't logged",
      body: "No study hours recorded yet. A day written down is a day you can learn from.",
      href: "/journal?new=1",
      cta: "Log today",
      dedupeKey: "journal-unlogged",
    });
  }

  /* ── habits ───────────────────────────────────────────────── */

  // Read through the Habit Engine, so a habit that fills in from the journal
  // or the Life Dashboard is pending only while its records fall short, and
  // rest days and paused habits never nag. A weekly habit is mentioned only on
  // the days it can't wait any longer (`weeklyAtRisk`). Habits counting Roadmap
  // work are left out when the plans aren't known (an older server reader).
  // A habit's own reminder time replaces the general one.
  const nowMinutes = hour * 60 + now.getMinutes();
  const habitCtx = habitContext(data, today);
  const pendingHabits = todayHabits(data.habits ?? [], habitCtx)
    .filter((t) => !t.done && (roadmapKnown || habitSource(t.habit) !== "roadmap"))
    .filter((t) => nowMinutes >= (clockMinutes(t.habit.remindAt) ?? cfg.reminderHour * 60))
    .flatMap((t) => {
      if (!t.week) return [{ name: t.habit.name }];
      const risk = weeklyAtRisk(t, habitCtx);
      return risk ? [{ name: `${t.habit.name} (${risk.text})` }] : [];
    });
  if (pendingHabits.length > 0) {
    push({
      id: `habits-pending:${today}`,
      ruleId: "habits-pending",
      category: "habits",
      priority: "normal",
      title: `${plural(pendingHabits.length, "habit")} still open`,
      body:
        pendingHabits.length <= 3
          ? pendingHabits.map((h) => h.name).join(", ")
          : `${pendingHabits
              .slice(0, 3)
              .map((h) => h.name)
              .join(", ")} and ${pendingHabits.length - 3} more.`,
      href: "/habits",
      cta: "See today's habits",
      count: pendingHabits.length,
      dedupeKey: "habits-pending",
    });
  }

  /* ── goals ────────────────────────────────────────────────── */

  const goalData: GoalData = {
    journal: data.journal ?? [],
    subjects: data.subjects ?? [],
    mocks: data.mocks ?? [],
    revisions: data.revisions ?? [],
    books: data.books ?? [],
    currentAffairs: data.currentAffairs ?? [],
    reflections: data.reflections ?? [],
    mistakes: data.mistakes ?? [],
    lifeLog: data.lifeLog ?? [],
  };

  for (const goal of data.goals ?? []) {
    if (goal.status !== "Active") continue;
    const p = computeGoalProgress(goal, goalData, today);

    if (p.readyToComplete) {
      push({
        id: `goal-ready:${goal.id}:${today}`,
        ruleId: "goal-ready",
        category: "goals",
        priority: "normal",
        title: `"${goal.title}" is done`,
        body: "It has met its target but is still marked Active. Close it out.",
        href: "/goals",
        cta: "Complete goal",
        dedupeKey: `goal-ready:${goal.id}`,
      });
      continue;
    }

    /**
     * Already at its target but not `readyToComplete` — that combination means a
     * `manual` goal, whose number you typed yourself. You know it's done; being
     * told its deadline is near would be noise.
     */
    if (p.health === "achieved") continue;

    const dd = p.daysToDeadline;
    if (dd !== null && dd >= 0 && dd <= 3) {
      push({
        id: `goal-deadline:${goal.id}:${today}`,
        ruleId: "goal-deadline",
        category: "goals",
        priority: dd <= 1 ? "critical" : "high",
        title:
          dd === 0
            ? `"${goal.title}" is due today`
            : `"${goal.title}" is due in ${plural(dd, "day")}`,
        body:
          p.pct !== null
            ? `${Math.round(p.pct)}% of the way there.`
            : "No measurable progress recorded.",
        href: "/goals",
        cta: "Open goals",
        dedupeKey: `goal-deadline:${goal.id}`,
      });
      /** One goal, one notice — the deadline is the more urgent framing. */
      continue;
    }

    if (p.health === "atRisk" || p.health === "behind") {
      push({
        id: `goal-at-risk:${goal.id}:${week}`,
        ruleId: "goal-at-risk",
        category: "goals",
        priority: "normal",
        title: `"${goal.title}" is off pace`,
        body:
          p.requiredPerDay !== null
            ? `Needs about ${Math.round(p.requiredPerDay * 10) / 10} ${
                goal.unit ?? "per"
              } a day for the rest of ${p.window.label}.`
            : `Behind the even pace for ${p.window.label}.`,
        href: "/goals",
        cta: "Open goals",
        dedupeKey: `goal-at-risk:${goal.id}`,
      });
    }
  }

  /* ── study ────────────────────────────────────────────────── */

  const mocks = [...(data.mocks ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const lastMock = mocks.length > 0 ? mocks[mocks.length - 1].date : null;
  const mockBasis = lastMock ?? data.profile?.startDate ?? null;
  if (mockBasis) {
    const since = daysBetween(mockBasis, today);
    if (since >= 14) {
      push({
        id: `mock-drought:${week}`,
        ruleId: "mock-drought",
        category: "study",
        priority: "high",
        title: lastMock
          ? `No mock in ${plural(since, "day")}`
          : "No mock attempted yet",
        body: "Marks come from tests, not from reading. Book one in.",
        href: "/mocks",
        cta: "Log a mock",
        count: since,
        dedupeKey: "mock-drought",
      });
    }
  }

  const stale = staleTopics(data.subjects ?? [], today, 50);
  if (stale.length > 0) {
    push({
      id: `subject-stale-topics:${week}`,
      ruleId: "subject-stale-topics",
      category: "study",
      priority: "low",
      title: `${plural(stale.length, "topic")} going cold`,
      body: `Untouched for 45+ days. The oldest is "${stale[0].topic.name}".`,
      href: "/subjects",
      cta: "Open syllabus",
      count: stale.length,
      dedupeKey: "subject-stale-topics",
    });
  }

  /* Last day each book was actually read, from the journal. */
  const lastPageOn = new Map<string, ISODate>();
  for (const entry of data.journal ?? []) {
    for (const b of entry.booksStudied ?? []) {
      if (!b.bookId) continue;
      const prev = lastPageOn.get(b.bookId);
      if (!prev || entry.date > prev) lastPageOn.set(b.bookId, entry.date);
    }
  }
  for (const book of data.books ?? []) {
    if (book.status !== "Reading") continue;
    const basis = lastPageOn.get(book.id) ?? book.startedOn ?? null;
    /** With no reading history and no start date there is nothing to measure. */
    if (!basis) continue;
    const idle = daysBetween(basis, today);
    if (idle < 14) continue;
    push({
      id: `book-stalled:${book.id}:${week}`,
      ruleId: "book-stalled",
      category: "study",
      priority: "low",
      title: `"${book.title}" has stalled`,
      body: `No pages logged in ${plural(idle, "day")}${
        book.totalPages > 0
          ? ` — sitting at page ${book.currentPage} of ${book.totalPages}.`
          : "."
      }`,
      href: "/books",
      cta: "Open library",
      count: idle,
      dedupeKey: `book-stalled:${book.id}`,
    });
  }

  const cas = [...(data.currentAffairs ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (cas.length > 0) {
    const gap = daysBetween(cas[cas.length - 1].date, today);
    if (gap >= 3) {
      push({
        id: `ca-gap:${today}`,
        ruleId: "ca-gap",
        category: "study",
        priority: "low",
        title: `Nothing in the vault for ${plural(gap, "day")}`,
        body: "Current affairs compound. A gap now is revision debt later.",
        href: "/current-affairs",
        cta: "Add an item",
        count: gap,
        dedupeKey: "ca-gap",
      });
    }
  }

  /* ── reviews & reflections ────────────────────────────────── */

  /**
   * Index 0 of `reviewPeriods` is the period still running; index 1 is the last
   * one that actually closed, which is the only one it's fair to ask about.
   */
  for (const type of ["Weekly", "Monthly"] as ReviewType[]) {
    const periods = reviewPeriods(type, today, 2);
    const last = periods[1];
    if (!last) continue;
    // A finished review answers it; a draft is asked to be finished. Reviews
    // from before drafts existed have no status and count as finished.
    const written = findReviewFor(data.reviews ?? [], last);
    if (written && written.status !== "draft") continue;
    /**
     * Only ask about a period you were actually present for. A fresh Chronicle
     * would otherwise open on "last month has no review" for a month the user
     * had not started — and a week with nothing logged in it has nothing to
     * review anyway, which the journal rules already cover.
     */
    const livedIt = (data.journal ?? []).some(
      (e) => e.date >= last.startDate && e.date <= last.endDate,
    );
    if (!livedIt) continue;
    const span = type === "Weekly" ? "week" : "month";
    push({
      id: `review-unwritten:${last.key}`,
      ruleId: "review-unwritten",
      category: "review",
      priority: "normal",
      title: written ? `Last ${span}'s review is still a draft` : `Last ${span} has no review`,
      body: written
        ? `${last.periodLabel}: complete it to keep its figures as the record of that ${span}.`
        : `${last.periodLabel} closed without one. The figures are already gathered from your records.`,
      href: `/reviews?open=${encodeURIComponent(last.key)}`,
      cta: written ? "Finish it" : "Write it",
      dedupeKey: `review-unwritten:${type}`,
    });
  }

  const reflections = [...(data.reflections ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const reflBasis =
    reflections.length > 0
      ? reflections[reflections.length - 1].date
      : (data.profile?.startDate ?? null);
  if (reflBasis) {
    const gap = daysBetween(reflBasis, today);
    if (gap >= 7) {
      push({
        id: `reflection-gap:${week}`,
        ruleId: "reflection-gap",
        category: "review",
        priority: "low",
        title:
          reflections.length > 0
            ? `Your diary has been quiet for ${plural(gap, "day")}`
            : "Your diary is still empty",
        body: "A few lines whenever you like. It stays private: nothing else in the app reads it.",
        href: "/diary",
        cta: "Write in your diary",
        count: gap,
        dedupeKey: "reflection-gap",
      });
    }
  }

  /* ── wellbeing ────────────────────────────────────────────── */

  /**
   * Sleep is recorded in two places depending on which page was used, so both
   * are unioned by date with the life log winning — double-counting a night
   * would skew the average that decides whether to speak up.
   */
  const sleepByDate = new Map<ISODate, number>();
  for (const s of data.sleep ?? []) {
    if (s.hours > 0) sleepByDate.set(s.date, s.hours);
  }
  for (const l of data.lifeLog ?? []) {
    const h = countedSleepHours(l);
    if (h != null) sleepByDate.set(l.date, h);
  }
  const windowStart = shift(today, -6);
  const recentSleep = [...sleepByDate.entries()]
    .filter(([d]) => d >= windowStart && d <= today)
    .map(([, h]) => h);
  /** Four nights is the fewest that can honestly be called an average. */
  if (recentSleep.length >= 4) {
    const avgSleep = recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length;
    if (avgSleep < 6) {
      push({
        id: `sleep-debt:${week}`,
        ruleId: "sleep-debt",
        category: "life",
        priority: "normal",
        title: `Averaging ${Math.round(avgSleep * 10) / 10}h of sleep`,
        body: `Across ${plural(recentSleep.length, "night")}. Retention is the first thing sleep debt takes.`,
        href: "/wellbeing",
        cta: "Open wellbeing",
        dedupeKey: "sleep-debt",
      });
    }
  }

  /* ── exam ─────────────────────────────────────────────────── */

  const examDate = data.profile?.examDate;
  if (examDate) {
    const days = daysBetween(today, examDate);
    if (days >= 0) {
      /**
       * Bucketed by the milestone *crossed*, not by today's date — so missing
       * the app on the exact 100th day doesn't mean missing the marker, and it
       * stays put once acknowledged until the next threshold.
       */
      const milestone = [1, 7, 30, 50, 100, 180, 365].find((m) => days <= m);
      if (milestone !== undefined) {
        push({
          id: `exam-countdown:${milestone}`,
          ruleId: "exam-countdown",
          category: "exam",
          priority: "high",
          title:
            days === 0
              ? `${data.profile.targetExam} is today`
              : `${plural(days, "day")} to ${data.profile.targetExam}`,
          body:
            days <= 30
              ? "Consolidation and mocks only. Nothing new."
              : "Inside the next milestone. Check your roadmap still fits.",
          href: "/roadmap",
          cta: "Open roadmap",
          count: days,
          dedupeKey: `exam-countdown:${milestone}`,
        });
      }
    }
  }

  return sortNotices(out);
}

/** `(priority, ruleId, id)` — fully deterministic, so the panel never reshuffles. */
export function sortNotices(list: Notice[]): Notice[] {
  return [...list].sort(
    (a, b) =>
      PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.id.localeCompare(b.id),
  );
}

/* ── layer 2: applying stored state ──────────────────────────── */

export interface NotifyState {
  readIds: string[];
  dismissedIds: string[];
  snoozedUntil: Record<string, ISODate>;
}

export const EMPTY_NOTIFY_STATE: NotifyState = {
  readIds: [],
  dismissedIds: [],
  snoozedUntil: {},
};

export interface NoticeView extends Notice {
  read: boolean;
}

export interface InboxGroup {
  priority: Priority;
  items: NoticeView[];
}

export interface Inbox {
  /** Everything still live: not dismissed, not snoozed. */
  items: NoticeView[];
  groups: InboxGroup[];
  unread: number;
  /** Live notices that are also allowed to interrupt (`low` never is). */
  deliverable: NoticeView[];
}

/**
 * Fold stored read/dismiss/snooze state over freshly evaluated notices.
 * Dismissal and snooze hide; read only greys out — a thing that is still true
 * should not vanish because you glanced at it.
 */
export function buildInbox(
  notices: Notice[],
  state: Partial<NotifyState> | null | undefined,
  today: ISODate,
): Inbox {
  const s = { ...EMPTY_NOTIFY_STATE, ...(state ?? {}) };
  const read = new Set(s.readIds ?? []);
  const dismissed = new Set(s.dismissedIds ?? []);
  const snoozed = s.snoozedUntil ?? {};

  const items: NoticeView[] = [];
  for (const n of sortNotices(notices)) {
    if (dismissed.has(n.id)) continue;
    const until = snoozed[n.id];
    if (until && today < until) continue;
    items.push({ ...n, read: read.has(n.id) });
  }

  const order: Priority[] = ["critical", "high", "normal", "low"];
  const groups = order
    .map((priority) => ({
      priority,
      items: items.filter((i) => i.priority === priority),
    }))
    .filter((g) => g.items.length > 0);

  return {
    items,
    groups,
    unread: items.filter((i) => !i.read).length,
    deliverable: items.filter((i) => !i.read && i.priority !== "low"),
  };
}

/**
 * Stored ids that no live notice claims any more. Read/dismiss state for a
 * notice that stopped being true is dead weight in the persisted snapshot, so
 * the UI prunes it whenever it recomputes.
 */
export function staleStateIds(
  notices: Notice[],
  state: Partial<NotifyState> | null | undefined,
): { readIds: string[]; dismissedIds: string[]; snoozedIds: string[] } {
  const s = { ...EMPTY_NOTIFY_STATE, ...(state ?? {}) };
  const live = new Set(notices.map((n) => n.id));
  return {
    readIds: (s.readIds ?? []).filter((id) => !live.has(id)),
    dismissedIds: (s.dismissedIds ?? []).filter((id) => !live.has(id)),
    snoozedIds: Object.keys(s.snoozedUntil ?? {}).filter((id) => !live.has(id)),
  };
}

/* ── layer 4: what may actually interrupt ────────────────────── */

/** Is `hour` inside the quiet window? Handles the wrap past midnight. */
export function inQuietHours(hour: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export interface DeliveryLog {
  /**
   * `dedupeKey` → ISO timestamp of the last delivery. An absolute instant, used
   * only for the minimum-gap check, which is a duration and so is
   * timezone-independent.
   */
  lastSentAt: Record<string, string>;
  /**
   * `dedupeKey` → the *local calendar date* of the last delivery, in the user's
   * zone. Stored rather than derived from `lastSentAt`, because deriving it
   * requires a timezone and the server's is not the user's.
   */
  lastSentOn: Record<string, ISODate>;
  /** Deliveries made on `sentOnDate`, for the per-day cap. */
  sentToday: number;
  sentOnDate: ISODate | null;
  lastDigestOn: ISODate | null;
}

export const EMPTY_DELIVERY_LOG: DeliveryLog = {
  lastSentAt: {},
  lastSentOn: {},
  sentToday: 0,
  sentOnDate: null,
  lastDigestOn: null,
};

export type DeliveryPlan =
  | { kind: "none"; reason: string }
  | { kind: "digest"; notices: NoticeView[]; title: string; body: string }
  | { kind: "individual"; notices: NoticeView[] };

/**
 * The four gates between "this is true" and "this buzzes your phone": quiet
 * hours, the per-day cap, the minimum gap, and per-`dedupeKey` cooldown.
 * `critical` bypasses the cap but never quiet hours — being woken at 3am by a
 * study app is never the right answer.
 */
export function planDelivery(
  inbox: Inbox,
  settings: NotifySettings,
  log: Partial<DeliveryLog> | null | undefined,
  now: Date,
  /**
   * The true instant, for the minimum gap — a duration, measured against the
   * true instants in `lastSentAt`. The same as `now` in a browser. The server
   * passes it separately because its `now` is a carrier shifted into the user's
   * zone (see `zonedNow`): measured from that, the gap was off by the zone's
   * whole offset, and for India never held at all.
   */
  instant: Date = now,
): DeliveryPlan {
  const cfg = withDefaults(settings);
  const l = { ...EMPTY_DELIVERY_LOG, ...(log ?? {}) };
  const today = toISODate(now);
  const hour = now.getHours();

  if (!cfg.enabled) return { kind: "none", reason: "Notifications are off." };
  if (!cfg.deliver) return { kind: "none", reason: "Delivery is off." };
  if (inbox.deliverable.length === 0)
    return { kind: "none", reason: "Nothing to deliver." };

  if (cfg.digest) {
    if (l.lastDigestOn === today)
      return { kind: "none", reason: "Today's digest already went out." };
    if (hour < cfg.digestHour)
      return { kind: "none", reason: "Before the digest hour." };
    const n = inbox.deliverable.length;
    const top = inbox.deliverable[0];
    return {
      kind: "digest",
      notices: inbox.deliverable,
      title: n === 1 ? top.title : `${plural(n, "thing")} need you today`,
      body:
        n === 1
          ? top.body
          : inbox.deliverable
              .slice(0, 3)
              .map((i) => i.title)
              .join(" · "),
    };
  }

  if (inQuietHours(hour, cfg.quietFrom, cfg.quietTo))
    return { kind: "none", reason: "Quiet hours." };

  const sentToday = l.sentOnDate === today ? l.sentToday : 0;
  const lastAny = Object.values(l.lastSentAt ?? {})
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  const gapOk =
    lastAny === undefined ||
    instant.getTime() - lastAny >= cfg.minGapMinutes * 60_000;

  const picked: NoticeView[] = [];
  for (const n of inbox.deliverable) {
    const critical = n.priority === "critical";
    if (!critical && sentToday + picked.length >= cfg.maxPerDay) continue;
    if (!critical && !gapOk) continue;
    /**
     * One interruption per subject per day, however often it re-appears.
     *
     * Compared against the stored local *date*, never re-derived from the
     * timestamp. `toISODate(new Date(lastSentAt))` would convert an absolute
     * instant using whatever timezone the caller happens to be in, while `today`
     * comes from `now` — fine in a browser, where those are the same zone, and
     * wrong on the server, which runs in UTC and evaluates in the user's zone.
     * That mismatch silently disabled this gate whenever the two disagreed about
     * the date, so the day is recorded explicitly instead.
     */
    const lastOn = l.lastSentOn?.[n.dedupeKey];
    if (lastOn && lastOn === today) continue;
    picked.push(n);
    /** One at a time when not digesting; the rest wait for the next gap. */
    if (picked.length >= 1) break;
  }

  if (picked.length === 0)
    return { kind: "none", reason: "Rate limited or already sent." };
  return { kind: "individual", notices: picked };
}

/**
 * The tag a daily digest is shown under, everywhere it is shown: by the page, by
 * the server's push, and in the service worker. One tag means a second digest
 * replaces the first on screen instead of stacking beside it.
 */
export const DIGEST_TAG = "chronicle-digest";

/** The server's "send a test" notification. Never counted as a delivery. */
export const TEST_TAG = "chronicle-test";

/**
 * How long a per-subject entry stays in the log. The gates only ever look at
 * today (the cooldown) and at the newest instant (the minimum gap), so anything
 * older than a week is dead weight that would otherwise grow with every goal
 * and book that ever produced a notice.
 */
export const DELIVERY_LOG_KEEP_DAYS = 7;

/** Drop per-subject entries older than `DELIVERY_LOG_KEEP_DAYS`. */
export function pruneDeliveryLog(
  log: Partial<DeliveryLog> | null | undefined,
  now: Date,
  today: ISODate = toISODate(now),
): DeliveryLog {
  const l = { ...EMPTY_DELIVERY_LOG, ...(log ?? {}) };
  const lastSentAt: Record<string, string> = {};
  const lastSentOn: Record<string, ISODate> = {};
  const cutoffMs = now.getTime() - DELIVERY_LOG_KEEP_DAYS * 86_400_000;
  const keys = new Set([
    ...Object.keys(l.lastSentAt ?? {}),
    ...Object.keys(l.lastSentOn ?? {}),
  ]);
  for (const key of keys) {
    const on = l.lastSentOn?.[key];
    const at = l.lastSentAt?.[key];
    const atMs = at ? new Date(at).getTime() : NaN;
    // The recorded local day decides when there is one; the instant otherwise.
    const fresh = on
      ? daysBetween(on, today) <= DELIVERY_LOG_KEEP_DAYS
      : Number.isFinite(atMs) && atMs >= cutoffMs;
    if (!fresh) continue;
    if (at) lastSentAt[key] = at;
    if (on) lastSentOn[key] = on;
  }
  return { ...l, lastSentAt, lastSentOn };
}

/**
 * Fold a delivery back into the log, resetting the counter on a new day.
 *
 * `today` is the user's local day. In a browser it is simply `now`'s, which is
 * the default; the server passes it in, because its own clock is in UTC.
 */
export function recordDelivery(
  log: Partial<DeliveryLog> | null | undefined,
  notices: { dedupeKey: string }[],
  now: Date,
  digest = false,
  today: ISODate = toISODate(now),
): DeliveryLog {
  const l = pruneDeliveryLog(log, now, today);
  const sentToday = l.sentOnDate === today ? l.sentToday : 0;
  const lastSentAt = { ...l.lastSentAt };
  const lastSentOn = { ...l.lastSentOn };
  for (const n of notices) {
    lastSentAt[n.dedupeKey] = now.toISOString();
    // The local day, recorded rather than left to be re-derived later.
    lastSentOn[n.dedupeKey] = today;
  }
  return {
    lastSentAt,
    lastSentOn,
    sentToday: sentToday + (digest ? 1 : notices.length),
    sentOnDate: today,
    lastDigestOn: digest ? today : l.lastDigestOn,
  };
}

/**
 * Something this device put on screen, as recorded on the device itself by the
 * service worker and the page: the notification's tag and when it was shown.
 * See `components/notifications/device-deliveries.ts`.
 */
export interface DeviceDelivery {
  tag: string;
  /** Epoch milliseconds. */
  at: number;
  /** Who showed it. Only server pushes need folding in; the page logs its own. */
  source: "push" | "page";
}

/**
 * Fold the server's pushes that this device has already shown into the page's
 * own log, before the page decides whether to notify.
 *
 * Without this the page and the server each kept their own count, and a digest
 * pushed at 07:30 was followed by the same digest from the page the moment the
 * app was opened. A tag is the digest's or a notice's `dedupeKey`, so it maps
 * straight back onto the fields the gates read.
 *
 * The result feeds one decision and is never stored: the page's log stays a
 * record of what the page itself sent, and folding again from the same inputs
 * gives the same answer.
 */
export function foldDeviceDeliveries(
  log: Partial<DeliveryLog> | null | undefined,
  shown: DeviceDelivery[],
  now: Date,
): DeliveryLog {
  const l = { ...EMPTY_DELIVERY_LOG, ...(log ?? {}) };
  const today = toISODate(now);
  const lastSentAt = { ...(l.lastSentAt ?? {}) };
  const lastSentOn = { ...(l.lastSentOn ?? {}) };
  let lastDigestOn = l.lastDigestOn;
  let pushedToday = 0;

  for (const d of shown) {
    if (d.source !== "push" || !d.tag || d.tag === TEST_TAG) continue;
    if (!Number.isFinite(d.at)) continue;
    const at = new Date(d.at);
    const on = toISODate(at);
    if (on === today) pushedToday++;
    if (d.tag === DIGEST_TAG) {
      if (!lastDigestOn || on > lastDigestOn) lastDigestOn = on;
      continue;
    }
    const prev = lastSentAt[d.tag] ? new Date(lastSentAt[d.tag]).getTime() : NaN;
    if (!Number.isFinite(prev) || d.at > prev) lastSentAt[d.tag] = at.toISOString();
    if (!lastSentOn[d.tag] || on > lastSentOn[d.tag]) lastSentOn[d.tag] = on;
  }

  const ownToday = l.sentOnDate === today ? l.sentToday : 0;
  return {
    lastSentAt,
    lastSentOn,
    // The server's sends count toward this device's cap: they buzzed it too.
    sentToday: ownToday + pushedToday,
    sentOnDate: today,
    lastDigestOn,
  };
}
