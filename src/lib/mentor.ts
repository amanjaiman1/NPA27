/* ════════════════════════════════════════════════════════════════
   THE AI UPSC MENTOR — the brain behind /coach
   ────────────────────────────────────────────────────────────────
   This module turns the entire Chronicle into mentorship. It is the
   single integration point a real LLM would plug into, but it also
   ships a deterministic engine so the product works offline.

   Four layers, mirroring the design brief:

   1. DATA PIPELINE       buildMentorContext() — read every signal
                          (hours, mocks, coverage, revision, mistakes,
                          mood) and compress it into one typed snapshot.
   2. RECOMMENDATION      detectWeakSubjects, predictRisks,
      ENGINE              recommendDailySchedule, suggestRevisionPlan.
   3. REPORTS             buildWeeklyReport, buildMonthlyReport.
   4. PROMPT ARCHITECTURE MENTOR_SYSTEM_PROMPT + buildContextDigest +
                          composeMentorPrompt — exactly what we'd send
                          to a model — plus mentorReply(), a local
                          stand-in that speaks in the mentor's voice.

   Everything here is pure: (ChronicleData) → values. No React, no
   store, no side effects — so it is trivially testable and could run
   server-side unchanged.
   ════════════════════════════════════════════════════════════════ */

import type {
  ChronicleData,
  JournalEntry,
  Profile,
  ISODate,
  PaperCode,
  MistakeCategory,
} from "./types";
import {
  currentStreak,
  longestStreak,
  hoursBySubject,
  subjectMastery,
  mockSeries,
  avgSleep,
} from "./selectors";
import {
  subjectAccuracy,
  type SubjectAgg,
} from "./mock-analytics";
import {
  masteryStats,
  categoryCounts,
  recurring,
  dueForReview,
} from "./mistakes";
import {
  toISODate,
  fromISODate,
  daysBetween,
  round,
  avg,
  sum,
  clamp,
  formatDate,
} from "./utils";

/* ════════════════════════════════════════════════════════════════
   TYPES — the shape of the mentor's understanding
   ════════════════════════════════════════════════════════════════ */

export type TrendDir = "up" | "down" | "flat";
export type RiskSeverity = "critical" | "elevated" | "watch";

export interface WeakSubject {
  subjectId: string;
  name: string;
  paper: PaperCode;
  weightage: number;
  mastery: number; // 0-100
  mockAccuracy: number | null; // 0-100, null if never tested
  hours14: number;
  mistakeCount: number;
  score: number; // 0-100 urgency (higher = needs attention)
  reasons: string[];
}

export interface Risk {
  id: string;
  title: string;
  severity: RiskSeverity;
  score: number; // 0-100
  icon: string; // lucide key, resolved in the UI
  evidence: string;
  mitigation: string;
}

export interface ScheduleBlock {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  durationH: number;
  title: string;
  kind:
    | "deep"
    | "current-affairs"
    | "revision"
    | "mistakes"
    | "mock"
    | "answer-writing"
    | "break"
    | "wellbeing";
  rationale: string;
}

export interface DailyPlan {
  date: ISODate;
  studyHours: number;
  targetHours: number;
  blocks: ScheduleBlock[];
  note: string;
}

export interface RevisionPlanItem {
  subject: string;
  topic: string;
  kind: "overdue" | "due" | "weak" | "mistake";
  reason: string;
}

export interface RevisionDay {
  date: ISODate;
  label: string;
  load: "light" | "moderate" | "heavy";
  items: RevisionPlanItem[];
}

export interface RevisionPlan {
  days: RevisionDay[];
  summary: string;
}

export interface ReportMetric {
  label: string;
  value: string;
  delta?: string;
  good?: boolean;
}

export interface ReportSection {
  heading: string;
  lines: string[];
}

export interface MentorReport {
  kind: "weekly" | "monthly";
  periodLabel: string;
  start: ISODate;
  end: ISODate;
  grade: string; // letter grade
  score: number; // 0-100
  headline: string;
  metrics: ReportMetric[];
  sections: ReportSection[];
}

export interface MentorContext {
  today: ISODate;
  profile: Profile;
  examDaysLeft: number;

  study: {
    hoursToday: number;
    last7PerDay: number;
    prev7PerDay: number;
    last30PerDay: number;
    activeDays30: number;
    streak: number;
    longest: number;
    target: number;
    paceVsTarget: number; // ratio of last7PerDay to target
    spark14: number[];
    trend: TrendDir;
  };

  mocks: {
    count: number;
    latestPct: number | null;
    latestName: string | null;
    avgPct: number | null;
    recentAvgPct: number | null;
    delta: number;
    direction: TrendDir;
    accuracyAvg: number | null;
    negativeAvg: number | null;
    daysSinceLast: number | null;
    weakSections: { name: string; accuracy: number; samples: number }[];
    strongSections: { name: string; accuracy: number }[];
  };

  coverage: {
    overallMastery: number;
    weightedReadiness: number;
    untouchedTopics: number;
    totalTopics: number;
    neglected: { name: string; hours14: number; mastery: number }[];
    stale: { name: string; daysSince: number }[];
  };

  revision: {
    overdue: number;
    dueToday: number;
    due: number; // overdue + today
    upcoming7: number;
    total: number;
  };

  mistakes: {
    total: number;
    open: number;
    masteredPct: number;
    dueReviews: number;
    dominantCategory: MistakeCategory | null;
    recurring: {
      subjectName: string;
      topic: string;
      count: number;
      category: MistakeCategory;
    }[];
  };

  mind: {
    avgMood: number; // 1-5
    avgEnergy: number;
    avgFocus: number;
    avgSleep: number; // hours
    moodTrend: TrendDir;
  };

  weakSubjects: WeakSubject[];
  risks: Risk[];
}

/* ════════════════════════════════════════════════════════════════
   LAYER 1 — DATA PIPELINE
   ════════════════════════════════════════════════════════════════ */

function hoursMap(journal: JournalEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of journal) m.set(e.date, e.totalHours);
  return m;
}

/** Sum of hours where the day's age (today=0) is in [loAgo, hiAgo). */
function windowSum(
  map: Map<string, number>,
  today: ISODate,
  loAgo: number,
  hiAgo: number,
): number {
  let total = 0;
  for (const [date, h] of map) {
    const age = daysBetween(date, today);
    if (age >= loAgo && age < hiAgo) total += h;
  }
  return total;
}

function activeDaysIn(
  journal: JournalEntry[],
  today: ISODate,
  days: number,
): number {
  return journal.filter((e) => {
    const age = daysBetween(e.date, today);
    return age >= 0 && age < days && e.totalHours > 0;
  }).length;
}

/** Average of a 1-5 journal field over the last `days` days. */
function moodWindow(
  journal: JournalEntry[],
  today: ISODate,
  days: number,
  field: "mood" | "energy" | "focus" | "motivation",
): number {
  const recent = journal.filter((e) => {
    const age = daysBetween(e.date, today);
    return age >= 0 && age < days;
  });
  return recent.length ? round(avg(recent.map((e) => e[field] ?? 0)), 1) : 0;
}

function trendOf(now: number, before: number, eps: number): TrendDir {
  if (now - before > eps) return "up";
  if (before - now > eps) return "down";
  return "flat";
}

/** Loosely match a subject to a mock section aggregate (section names are
 *  shorter, e.g. "Polity" vs "Polity & Governance"). */
function matchSection(
  subjectName: string,
  aggs: SubjectAgg[],
): SubjectAgg | undefined {
  const norm = (s: string) => s.toLowerCase().trim();
  const exact = aggs.find((a) => norm(a.name) === norm(subjectName));
  if (exact) return exact;
  const head = (s: string) => norm(s).split(/[\s&(]/)[0];
  const sHead = head(subjectName);
  return aggs.find((a) => head(a.name) === sHead);
}

/** The lightweight 14-day study sparkline (oldest → newest). */
function spark14(map: Map<string, number>, today: ISODate): number[] {
  const out: number[] = [];
  const base = fromISODate(today);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(map.get(toISODate(d)) ?? 0);
  }
  return out;
}

/**
 * The data pipeline. Reads every relevant signal in the Chronicle and
 * compresses it into a single, model-ready snapshot.
 */
export function buildMentorContext(
  data: ChronicleData,
  today: ISODate = toISODate(new Date()),
): MentorContext {
  const { journal, subjects, mocks, revisions, mistakes, sleep, profile } =
    data;

  /* ── study ── */
  const map = hoursMap(journal);
  const hoursToday = map.get(today) ?? 0;
  const last7PerDay = round(windowSum(map, today, 0, 7) / 7, 1);
  const prev7PerDay = round(windowSum(map, today, 7, 14) / 7, 1);
  const last30PerDay = round(windowSum(map, today, 0, 30) / 30, 1);
  const target = profile.dailyHourTarget || 8;

  /* ── mocks ── */
  const prelims = mockSeries(mocks, "Prelims GS");
  const allSeries = mockSeries(mocks);
  const latest = allSeries[allSeries.length - 1] ?? null;
  const recent3 = prelims.slice(-3);
  const prior3 = prelims.slice(-6, -3);
  const recentAvgPct = recent3.length ? round(avg(recent3.map((p) => p.pct)), 0) : null;
  const priorAvgPct = prior3.length ? round(avg(prior3.map((p) => p.pct)), 0) : null;
  const mockDelta =
    recentAvgPct != null && priorAvgPct != null ? recentAvgPct - priorAvgPct : 0;
  const prelimsMocks = mocks.filter((m) => m.type === "Prelims GS");
  const accuracyAvg = prelimsMocks.length
    ? round(
        avg(
          prelimsMocks
            .filter((m) => (m.attempted ?? 0) > 0)
            .map((m) => ((m.correct ?? 0) / (m.attempted ?? 1)) * 100),
        ),
        0,
      )
    : null;
  const negs = prelimsMocks.filter((m) => m.negative != null);
  const negativeAvg = negs.length
    ? round(avg(negs.map((m) => m.negative as number)), 1)
    : null;
  const lastMockDate = mocks.length
    ? [...mocks].sort((a, b) => b.date.localeCompare(a.date))[0].date
    : null;
  const daysSinceLast = lastMockDate ? daysBetween(lastMockDate, today) : null;

  const aggs = subjectAccuracy(mocks).filter((s) => s.samples >= 2 && s.attempted > 0);
  const weakSections = [...aggs]
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 4)
    .map((s) => ({ name: s.name, accuracy: s.accuracy, samples: s.samples }));
  const strongSections = [...aggs]
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 3)
    .map((s) => ({ name: s.name, accuracy: s.accuracy }));

  /* ── coverage ── */
  const withTopics = subjects.filter((s) => s.topics.length > 0);
  const overallMastery = withTopics.length
    ? round(avg(withTopics.map((s) => subjectMastery(s))), 0)
    : 0;
  const wSum = sum(withTopics.map((s) => s.weightage ?? 50));
  const weightedReadiness = wSum
    ? round(
        sum(withTopics.map((s) => subjectMastery(s) * (s.weightage ?? 50))) / wSum,
        0,
      )
    : overallMastery;
  const totalTopics = sum(subjects.map((s) => s.topics.length));
  const untouchedTopics = sum(
    subjects.map((s) => s.topics.filter((t) => t.status === "untouched").length),
  );

  const bySub14 = hoursBySubject(journal, subjects, 14);
  const subHours = new Map(bySub14.map((s) => [s.subjectId, s.hours]));
  const neglected = withTopics
    .map((s) => ({
      name: s.name,
      hours14: subHours.get(s.id) ?? 0,
      mastery: subjectMastery(s),
    }))
    .filter((s) => s.hours14 < 2.5)
    .sort((a, b) => a.hours14 - b.hours14)
    .slice(0, 4);

  const stale = withTopics
    .map((s) => {
      const touched = s.topics
        .map((t) => t.lastTouched)
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop();
      return {
        name: s.name,
        daysSince: touched ? daysBetween(touched, today) : 999,
      };
    })
    .filter((s) => s.daysSince >= 21)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 4);

  /* ── revision ── */
  const overdue = revisions.filter((r) => r.nextDue < today).length;
  const dueToday = revisions.filter((r) => r.nextDue === today).length;
  const upcoming7 = revisions.filter((r) => {
    const d = daysBetween(today, r.nextDue);
    return d > 0 && d <= 7;
  }).length;

  /* ── mistakes ── */
  const ms = masteryStats(mistakes);
  const cats = categoryCounts(mistakes).filter((c) => c.count > 0);
  const dominantCategory = cats.length ? cats[0].category : null;
  const recur = recurring(mistakes, subjects)
    .filter((r) => r.openCount > 0)
    .slice(0, 4)
    .map((r) => ({
      subjectName: r.subjectName,
      topic: r.topic,
      count: r.count,
      category: r.dominantCategory,
    }));
  const dueReviews = dueForReview(mistakes, today).length;

  /* ── mind ── */
  const avgMood = moodWindow(journal, today, 14, "mood");
  const avgEnergy = moodWindow(journal, today, 14, "energy");
  const avgFocus = moodWindow(journal, today, 14, "focus");
  const sleepAvg = avgSleep(sleep, 14);
  const moodNow = moodWindow(journal, today, 7, "mood");
  const moodBefore = moodWindow(journal, today, 14, "mood");

  const ctx: MentorContext = {
    today,
    profile,
    examDaysLeft: Math.max(0, daysBetween(today, profile.examDate)),
    study: {
      hoursToday,
      last7PerDay,
      prev7PerDay,
      last30PerDay,
      activeDays30: activeDaysIn(journal, today, 30),
      streak: currentStreak(journal, fromISODate(today)),
      longest: longestStreak(journal),
      target,
      paceVsTarget: target ? round(last7PerDay / target, 2) : 1,
      spark14: spark14(map, today),
      trend: trendOf(last7PerDay, prev7PerDay, 0.5),
    },
    mocks: {
      count: allSeries.length,
      latestPct: latest ? latest.pct : null,
      latestName: latest ? latest.name : null,
      avgPct: prelims.length ? round(avg(prelims.map((p) => p.pct)), 0) : null,
      recentAvgPct,
      delta: mockDelta,
      direction: trendOf(recentAvgPct ?? 0, priorAvgPct ?? recentAvgPct ?? 0, 1.5),
      accuracyAvg,
      negativeAvg,
      daysSinceLast,
      weakSections,
      strongSections,
    },
    coverage: {
      overallMastery,
      weightedReadiness,
      untouchedTopics,
      totalTopics,
      neglected,
      stale,
    },
    revision: {
      overdue,
      dueToday,
      due: overdue + dueToday,
      upcoming7,
      total: revisions.length,
    },
    mistakes: {
      total: ms.total,
      open: ms.open,
      masteredPct: ms.masteredPct,
      dueReviews,
      dominantCategory,
      recurring: recur,
    },
    mind: {
      avgMood,
      avgEnergy,
      avgFocus,
      avgSleep: sleepAvg,
      moodTrend: trendOf(moodNow, moodBefore, 0.25),
    },
    weakSubjects: [],
    risks: [],
  };

  ctx.weakSubjects = detectWeakSubjects(data);
  ctx.risks = predictRisks(ctx);
  return ctx;
}

/* ════════════════════════════════════════════════════════════════
   LAYER 2 — RECOMMENDATION ENGINE
   ════════════════════════════════════════════════════════════════ */

/**
 * Detect weak subjects by fusing four signals — mastery, mock accuracy,
 * recent time invested and mistakes — then weight by exam importance so a
 * weak high-weightage subject outranks a weak peripheral one.
 */
export function detectWeakSubjects(data: ChronicleData): WeakSubject[] {
  const { subjects, journal, mocks, mistakes } = data;
  const aggs = subjectAccuracy(mocks).filter((s) => s.samples >= 1);
  const bySub14 = hoursBySubject(journal, subjects, 14);
  const subHours = new Map(bySub14.map((s) => [s.subjectId, s.hours]));
  const mistakeBySub = new Map<string, number>();
  for (const m of mistakes)
    mistakeBySub.set(m.subjectId, (mistakeBySub.get(m.subjectId) ?? 0) + 1);

  const out: WeakSubject[] = [];
  for (const s of subjects) {
    if (!s.topics.length) continue;
    const mastery = subjectMastery(s);
    const agg = matchSection(s.name, aggs);
    const mockAccuracy = agg ? agg.accuracy : null;
    const hours14 = subHours.get(s.id) ?? 0;
    const mistakeCount = mistakeBySub.get(s.id) ?? 0;
    const weightage = s.weightage ?? 50;

    const masteryGap = 100 - mastery;
    const accGap = mockAccuracy != null ? 100 - mockAccuracy : masteryGap;
    const base = 0.55 * masteryGap + 0.45 * accGap;
    const weightFactor = 0.65 + 0.35 * (weightage / 100);
    const mistakePenalty = Math.min(14, mistakeCount * 2);
    const neglectPenalty = hours14 < 1 ? 8 : hours14 < 2.5 ? 4 : 0;
    const score = clamp(
      round(base * weightFactor + mistakePenalty + neglectPenalty, 0),
      0,
      100,
    );

    const reasons: string[] = [];
    if (mastery < 55) reasons.push(`Mastery only ${mastery}%`);
    if (mockAccuracy != null && mockAccuracy < 60)
      reasons.push(`Mock accuracy ${mockAccuracy}%`);
    if (hours14 < 2.5)
      reasons.push(`Just ${round(hours14, 1)}h in the last fortnight`);
    if (mistakeCount >= 3) reasons.push(`${mistakeCount} logged mistakes`);
    if (weightage >= 80) reasons.push(`High-weightage paper`);
    if (!reasons.length) reasons.push("Holding, but room to consolidate");

    out.push({
      subjectId: s.id,
      name: s.name,
      paper: s.paper,
      weightage,
      mastery,
      mockAccuracy,
      hours14: round(hours14, 1),
      mistakeCount,
      score,
      reasons,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Predict preparation risks. Each risk computes a 0-100 score from the
 * context; only material risks (score ≥ 28) surface, sorted by severity.
 */
export function predictRisks(ctx: MentorContext): Risk[] {
  const risks: Risk[] = [];
  const add = (
    id: string,
    title: string,
    score: number,
    icon: string,
    evidence: string,
    mitigation: string,
  ) => {
    if (score < 28) return;
    const severity: RiskSeverity =
      score >= 70 ? "critical" : score >= 48 ? "elevated" : "watch";
    risks.push({ id, title, severity, score: round(score, 0), icon, evidence, mitigation });
  };

  /* 1. Syllabus coverage vs time left */
  if (ctx.coverage.totalTopics > 0 && ctx.examDaysLeft > 0) {
    const remaining = ctx.coverage.untouchedTopics;
    const ratio = remaining / Math.max(1, ctx.examDaysLeft / 7); // topics per remaining week
    const score = clamp(remaining * 3 + ratio * 10, 0, 100);
    add(
      "coverage",
      "Syllabus coverage gap",
      score,
      "Layers",
      `${remaining} topics still untouched with ${ctx.examDaysLeft} days to go.`,
      "Front-load first-reading of untouched topics now; you can't revise what you've never read.",
    );
  }

  /* 2. Mocks below the safe zone */
  if (ctx.mocks.recentAvgPct != null) {
    const gap = 50 - ctx.mocks.recentAvgPct; // 50% ≈ prelims safety
    if (gap > 0) {
      add(
        "mock-floor",
        "Mock scores below safe zone",
        clamp(gap * 4, 0, 100),
        "Target",
        `Recent Prelims GS average is ${ctx.mocks.recentAvgPct}% — under the ~50% comfort line.`,
        "Shift from first-reading to recall + 100 daily MCQs; score follows retrieval practice.",
      );
    }
  }

  /* 3. Declining mock momentum */
  if (ctx.mocks.direction === "down") {
    add(
      "mock-slide",
      "Mock momentum is sliding",
      clamp(Math.abs(ctx.mocks.delta) * 6 + 20, 0, 100),
      "TrendingDown",
      `Down ${Math.abs(ctx.mocks.delta)}% versus your previous mocks.`,
      "Audit the last two papers question-by-question before sitting the next one.",
    );
  }

  /* 4. Revision backlog */
  if (ctx.revision.due > 0) {
    add(
      "revision-backlog",
      "Revision backlog building",
      clamp(ctx.revision.overdue * 8 + ctx.revision.dueToday * 4, 0, 100),
      "Repeat",
      `${ctx.revision.due} items ripe for recall (${ctx.revision.overdue} overdue).`,
      "Clear the overdue queue first — lapsed cards decay fastest and cost the most marks.",
    );
  }

  /* 5. Inconsistency */
  {
    const score = clamp((24 - ctx.study.activeDays30) * 6, 0, 100);
    add(
      "consistency",
      "Consistency is wobbling",
      ctx.study.streak === 0 ? Math.max(score, 40) : score,
      "Flame",
      ctx.study.streak === 0
        ? `Streak is broken; ${ctx.study.activeDays30}/30 active days recently.`
        : `${ctx.study.activeDays30}/30 active days in the last month.`,
      "Anchor a non-negotiable 2-hour morning block — protect the streak before chasing volume.",
    );
  }

  /* 6. Pace below target */
  if (ctx.study.paceVsTarget < 0.75 && ctx.study.last7PerDay > 0) {
    add(
      "pace",
      "Running under your hour target",
      clamp((1 - ctx.study.paceVsTarget) * 90, 0, 100),
      "Clock",
      `Averaging ${ctx.study.last7PerDay}h/day vs a ${ctx.study.target}h target.`,
      "Find the leak — usually a slow start. Begin the first block within 30 min of waking.",
    );
  }

  /* 7. Wellbeing / burnout */
  {
    let score = 0;
    const bits: string[] = [];
    if (ctx.mind.avgSleep > 0 && ctx.mind.avgSleep < 6.5) {
      score += (6.5 - ctx.mind.avgSleep) * 22;
      bits.push(`sleep ${ctx.mind.avgSleep}h`);
    }
    if (ctx.mind.avgMood > 0 && ctx.mind.avgMood < 3) {
      score += (3 - ctx.mind.avgMood) * 26;
      bits.push(`mood ${ctx.mind.avgMood}/5`);
    }
    if (ctx.mind.moodTrend === "down") {
      score += 16;
      bits.push("mood trending down");
    }
    add(
      "wellbeing",
      "Burnout risk on the rise",
      clamp(score, 0, 100),
      "HeartPulse",
      bits.length ? `Signals: ${bits.join(", ")}.` : "Recovery markers dipping.",
      "Treat sleep as a study slot and add one real rest block — fatigue erodes retention faster than a missed hour helps.",
    );
  }

  /* 8. Recurring mistakes */
  if (ctx.mistakes.recurring.length > 0) {
    const top = ctx.mistakes.recurring[0];
    add(
      "recurring",
      "The same mistakes keep returning",
      clamp(top.count * 12 + ctx.mistakes.recurring.length * 6, 0, 100),
      "TriangleAlert",
      `${top.topic} (${top.subjectName}) has recurred ${top.count}× — mostly ${top.category}.`,
      "Convert each recurring error into a flashcard and force three clean recalls before moving on.",
    );
  }

  /* 9. Negative marking leak */
  if (ctx.mocks.negativeAvg != null && ctx.mocks.negativeAvg >= 14) {
    add(
      "negatives",
      "Negative marking is bleeding marks",
      clamp((ctx.mocks.negativeAvg - 10) * 5, 0, 100),
      "Minus",
      `Losing ~${ctx.mocks.negativeAvg} marks per mock to wrong attempts.`,
      "Apply the two-elimination rule: only attempt when you can rule out at least two options.",
    );
  }

  /* 10. Neglected high-weight subject */
  {
    const heavy = ctx.weakSubjects.find(
      (w) => w.weightage >= 75 && w.hours14 < 2 && w.score >= 45,
    );
    if (heavy) {
      add(
        "neglect-heavy",
        `${heavy.name} is being starved`,
        clamp(heavy.score, 0, 100),
        "Layers",
        `A ${heavy.weightage}-weightage subject with only ${heavy.hours14}h recently.`,
        `Rotate ${heavy.name} into tomorrow's first block — high weight, low recent attention.`,
      );
    }
  }

  return risks.sort((a, b) => b.score - a.score);
}

/* ── time helpers for the schedule ── */
function clockFmt(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = Math.round(totalMin % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Recommend a time-blocked day, adapting to weak subjects, the revision
 * queue, due mistakes, mock cadence and the candidate's hour target.
 */
export function recommendDailySchedule(
  ctx: MentorContext,
  date: ISODate = ctx.today,
): DailyPlan {
  const blocks: ScheduleBlock[] = [];
  let cursor = 6 * 60 + 30; // 06:30
  const target = clamp(ctx.study.target, 5, 12);

  const push = (
    durH: number,
    title: string,
    kind: ScheduleBlock["kind"],
    rationale: string,
  ) => {
    const start = cursor;
    const end = cursor + Math.round(durH * 60);
    blocks.push({
      start: clockFmt(start),
      end: clockFmt(end),
      durationH: durH,
      title,
      kind,
      rationale,
    });
    cursor = end;
  };
  const brk = (durMin: number, title: string) => {
    const start = cursor;
    cursor += durMin;
    blocks.push({
      start: clockFmt(start),
      end: clockFmt(cursor),
      durationH: round(durMin / 60, 2),
      title,
      kind: "break",
      rationale: "Spacing protects focus and consolidates the last block.",
    });
  };

  const weak = ctx.weakSubjects.filter((w) => w.score >= 35);
  const primary = weak[0];
  const secondary = weak[1];
  let studyH = 0;
  const account = (h: number) => {
    studyH += h;
  };

  /* 1. Peak-focus deep block on the weakest high-value subject */
  if (primary) {
    push(
      2,
      `Deep work — ${primary.name}`,
      "deep",
      `Your highest-priority weak area (${primary.reasons[0].toLowerCase()}). Tackle it when focus is freshest.`,
    );
    account(2);
  } else {
    push(2, "Deep work — toughest subject", "deep", "Hardest material first, while focus peaks.");
    account(2);
  }
  brk(15, "Short reset");

  /* 2. Current affairs — perennial, high weight */
  push(
    1,
    "Current affairs + newspaper",
    "current-affairs",
    "Daily CA compounding is non-negotiable; note-make into your subject buckets.",
  );
  account(1);

  /* 3. Second focus block */
  if (secondary) {
    push(
      1.5,
      `Focus block — ${secondary.name}`,
      "deep",
      `Second-priority subject (${secondary.reasons[0].toLowerCase()}).`,
    );
    account(1.5);
  } else {
    push(1.5, "Syllabus advancement", "deep", "Push the frontier — read a fresh, untouched topic.");
    account(1.5);
  }
  brk(45, "Lunch & walk");

  /* 4. Revision — sized by the queue */
  if (ctx.revision.due > 0) {
    const revH = clamp(0.5 + ctx.revision.due * 0.08, 0.5, 2);
    push(
      round(revH, 1),
      `Revision — ${ctx.revision.due} due${ctx.revision.overdue ? ` (${ctx.revision.overdue} overdue)` : ""}`,
      "revision",
      "Spaced recall beats fresh reading right now — clear overdue cards first.",
    );
    account(round(revH, 1));
  } else {
    push(1, "Maintenance revision", "revision", "Light recall keeps mastered topics warm.");
    account(1);
  }

  /* 5. Mistake review when due */
  if (ctx.mistakes.dueReviews > 0) {
    push(
      0.5,
      `Mistake review — ${ctx.mistakes.dueReviews} due`,
      "mistakes",
      ctx.mistakes.dominantCategory
        ? `Focus on ${ctx.mistakes.dominantCategory.toLowerCase()} errors — your most common type.`
        : "Re-attempt logged errors until you can explain the correct answer cold.",
    );
    account(0.5);
  }

  /* 6. Mock / answer-writing cadence */
  const wantsMock =
    ctx.examDaysLeft < 120 ||
    (ctx.mocks.daysSinceLast != null && ctx.mocks.daysSinceLast >= 5);
  if (wantsMock) {
    push(
      1,
      ctx.examDaysLeft < 200 ? "Sectional mock + analysis" : "100 timed MCQs",
      "mock",
      ctx.mocks.daysSinceLast != null
        ? `It's been ${ctx.mocks.daysSinceLast} days since your last mock — keep the exam temperament sharp.`
        : "Regular test exposure is the fastest feedback loop you have.",
    );
    account(1);
  } else {
    push(
      1,
      "Answer writing / practice set",
      "answer-writing",
      "Output practice converts passive reading into exam-ready recall.",
    );
    account(1);
  }

  /* 7. Top up to target with evening consolidation */
  const remaining = round(target - studyH, 1);
  if (remaining >= 0.5) {
    brk(20, "Evening reset");
    push(
      remaining,
      "Evening consolidation",
      "deep",
      "Re-read the day's notes and pre-load tomorrow's first block.",
    );
    account(remaining);
  }

  /* 8. Wellbeing anchor (not counted as study) */
  push(
    0,
    "Wind down — target 7.5h sleep",
    "wellbeing",
    ctx.mind.avgSleep > 0 && ctx.mind.avgSleep < 6.5
      ? `You're averaging ${ctx.mind.avgSleep}h — recovery is where memory consolidates.`
      : "Protect sleep; it is when today's study is filed into long-term memory.",
  );

  const note = primary
    ? `Built around ${primary.name}${secondary ? ` and ${secondary.name}` : ""}, your current priorities, with ${ctx.revision.due} revision item${ctx.revision.due === 1 ? "" : "s"} folded in.`
    : "A balanced day across reading, current affairs, revision and testing.";

  return {
    date,
    studyHours: round(studyH, 1),
    targetHours: target,
    blocks,
    note,
  };
}

/**
 * Suggest a 7-day revision plan. Real due/overdue cards are placed on their
 * due dates (overdue collapses to today); light days are topped up with weak
 * topics and recurring-mistake topics.
 */
export function suggestRevisionPlan(
  data: ChronicleData,
  ctx: MentorContext,
  days = 7,
): RevisionPlan {
  const today = ctx.today;
  const subjectName = (id: string) =>
    data.subjects.find((s) => s.id === id)?.name ?? "General";

  const dayList: RevisionDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = fromISODate(today);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);
    dayList.push({
      date: iso,
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : fromISODate(iso).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "2-digit",
              }),
      load: "light",
      items: [],
    });
  }
  const byDate = new Map(dayList.map((d) => [d.date, d]));

  /* place real revision cards */
  for (const r of data.revisions) {
    const age = daysBetween(today, r.nextDue); // negative if overdue
    if (age > days - 1) continue;
    const targetDate = age < 0 ? today : r.nextDue;
    const bucket = byDate.get(targetDate);
    if (!bucket) continue;
    bucket.items.push({
      subject: subjectName(r.subjectId),
      topic: r.topic,
      kind: age < 0 ? "overdue" : "due",
      reason:
        age < 0
          ? `Overdue by ${Math.abs(age)}d — recall now before it decays`
          : `Scheduled recall (interval ${r.intervalDays}d)`,
    });
  }

  /* weak topics to seed light days */
  const weakTopics = data.subjects
    .flatMap((s) =>
      s.topics
        .filter((t) => t.status !== "mastered" && t.confidence < 55)
        .map((t) => ({ subject: s.name, topic: t.name, confidence: t.confidence })),
    )
    .sort((a, b) => a.confidence - b.confidence);

  const mistakeTopics = recurring(data.mistakes, data.subjects)
    .filter((r) => r.openCount > 0)
    .map((r) => ({ subject: r.subjectName, topic: r.topic, category: r.dominantCategory }));

  let wi = 0;
  let mi = 0;
  for (const day of dayList) {
    // weave a recurring-mistake topic into early days
    if (mi < mistakeTopics.length && day.items.length < 4) {
      const m = mistakeTopics[mi++];
      day.items.push({
        subject: m.subject,
        topic: m.topic,
        kind: "mistake",
        reason: `Recurring ${m.category.toLowerCase()} error — close the loop`,
      });
    }
    while (day.items.length < 3 && wi < weakTopics.length) {
      const w = weakTopics[wi++];
      day.items.push({
        subject: w.subject,
        topic: w.topic,
        kind: "weak",
        reason: `Low confidence (${w.confidence}%) — strengthen before it's tested`,
      });
    }
    day.load = day.items.length >= 5 ? "heavy" : day.items.length >= 3 ? "moderate" : "light";
  }

  const totalReal = ctx.revision.due + ctx.revision.upcoming7;
  const summary =
    totalReal > 0
      ? `${totalReal} scheduled card${totalReal === 1 ? "" : "s"} across the week, with weak topics and recurring mistakes woven into lighter days.`
      : "No cards are due — this week front-loads your weakest topics and recurring mistakes to build the backlog into mastery.";

  return { days: dayList, summary };
}

/* ════════════════════════════════════════════════════════════════
   LAYER 3 — REPORTS
   ════════════════════════════════════════════════════════════════ */

function gradeLetter(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 82) return "A";
  if (score >= 75) return "A-";
  if (score >= 68) return "B+";
  if (score >= 60) return "B";
  if (score >= 52) return "B-";
  if (score >= 45) return "C+";
  if (score >= 36) return "C";
  return "D";
}

function buildReport(
  kind: "weekly" | "monthly",
  data: ChronicleData,
  ctx: MentorContext,
): MentorReport {
  const days = kind === "weekly" ? 7 : 30;
  const today = ctx.today;
  const map = hoursMap(data.journal);

  const inWindow = (d: ISODate, lo: number, hi: number) => {
    const age = daysBetween(d, today);
    return age >= lo && age < hi;
  };

  const hoursThis = round(windowSum(map, today, 0, days), 0);
  const hoursPrev = round(windowSum(map, today, days, days * 2), 0);
  const hoursDelta = hoursThis - hoursPrev;
  const activeThis = data.journal.filter(
    (e) => inWindow(e.date, 0, days) && e.totalHours > 0,
  ).length;

  const mocksThis = data.mocks.filter((m) => inWindow(m.date, 0, days)).length;
  const mocksPrev = data.mocks.filter((m) => inWindow(m.date, days, days * 2)).length;

  const moodEntries = data.journal.filter((e) => inWindow(e.date, 0, days));
  const moodAvg = moodEntries.length
    ? round(avg(moodEntries.map((e) => e.mood)), 1)
    : 0;

  const newMistakes = data.mistakes.filter((m) => inWindow(m.date, 0, days)).length;
  const revisionSessions = sum(
    moodEntries.map((e) => e.revisionSessions?.length ?? 0),
  );

  /* scoring: hours adherence + consistency + mock direction + mood */
  const targetHours = ctx.study.target * days;
  const hourScore = clamp((hoursThis / Math.max(1, targetHours)) * 100, 0, 100);
  const consistencyScore = clamp((activeThis / days) * 100, 0, 100);
  const mockScore =
    ctx.mocks.direction === "up" ? 85 : ctx.mocks.direction === "flat" ? 65 : 40;
  const moodScore = clamp((moodAvg / 5) * 100, 0, 100);
  const score = round(
    hourScore * 0.34 + consistencyScore * 0.3 + mockScore * 0.18 + moodScore * 0.18,
    0,
  );

  const periodLabel =
    kind === "weekly"
      ? `Week ending ${formatDate(today)}`
      : `Last 30 days · to ${formatDate(today)}`;
  const start = (() => {
    const d = fromISODate(today);
    d.setDate(d.getDate() - (days - 1));
    return toISODate(d);
  })();

  const metrics: ReportMetric[] = [
    {
      label: "Study hours",
      value: `${hoursThis}h`,
      delta: `${hoursDelta >= 0 ? "+" : ""}${hoursDelta}h vs prev`,
      good: hoursDelta >= 0,
    },
    {
      label: "Active days",
      value: `${activeThis}/${days}`,
      good: activeThis / days >= 0.75,
    },
    {
      label: "Mocks taken",
      value: `${mocksThis}`,
      delta: `${mocksThis - mocksPrev >= 0 ? "+" : ""}${mocksThis - mocksPrev}`,
      good: mocksThis >= mocksPrev,
    },
    { label: "Avg mood", value: `${moodAvg}/5`, good: moodAvg >= 3.2 },
    { label: "New mistakes logged", value: `${newMistakes}`, good: true },
    { label: "Revision sessions", value: `${revisionSessions}`, good: revisionSessions > 0 },
  ];

  /* ── Wins ── */
  const wins: string[] = [];
  if (hoursDelta > 0) wins.push(`Logged ${hoursThis}h — up ${hoursDelta}h on the previous ${kind === "weekly" ? "week" : "month"}.`);
  if (activeThis / days >= 0.8) wins.push(`Showed up ${activeThis} of ${days} days — elite consistency.`);
  if (ctx.study.streak >= 5) wins.push(`Riding a ${ctx.study.streak}-day streak.`);
  if (ctx.mocks.direction === "up") wins.push(`Mock scores trending up (+${ctx.mocks.delta}%).`);
  if (ctx.mistakes.masteredPct >= 40) wins.push(`${ctx.mistakes.masteredPct}% of logged mistakes now mastered.`);
  if (revisionSessions > 0) wins.push(`${revisionSessions} revision sessions completed.`);
  if (!wins.length) wins.push("You kept the chronicle alive — showing up is the first win.");

  /* ── Concerns ── (drawn from risks) */
  const concerns = ctx.risks.slice(0, 3).map((r) => `${r.title}: ${r.evidence}`);
  if (!concerns.length) concerns.push("No material risks flagged — keep the system running.");

  /* ── Weak spots ── */
  const weakSpots = ctx.weakSubjects
    .slice(0, 3)
    .map((w) => `${w.name} — ${w.reasons.slice(0, 2).join("; ").toLowerCase()}.`);

  /* ── Focus next period ── */
  const focus: string[] = [];
  if (ctx.revision.due > 0) focus.push(`Clear the ${ctx.revision.due} due revision cards.`);
  if (ctx.weakSubjects[0]) focus.push(`Give ${ctx.weakSubjects[0].name} two dedicated deep blocks.`);
  if (ctx.mocks.daysSinceLast == null || ctx.mocks.daysSinceLast >= 5)
    focus.push("Sit at least one full mock and analyse it line-by-line.");
  if (ctx.mistakes.dominantCategory)
    focus.push(`Target your ${ctx.mistakes.dominantCategory.toLowerCase()} mistakes — your most frequent type.`);
  if (ctx.coverage.untouchedTopics > 0)
    focus.push(`First-read ${Math.min(ctx.coverage.untouchedTopics, kind === "weekly" ? 3 : 10)} untouched topics.`);
  while (focus.length < 3) focus.push("Protect sleep and one rest block to sustain the pace.");

  /* ── Mentor's note ── */
  const verdict =
    score >= 75
      ? "This was a strong block. The fundamentals are compounding — hold the line and resist complacency."
      : score >= 55
        ? "A solid, workmanlike block with clear edges to sharpen. You're on track; tighten the weak spots below."
        : "An honest reset is due. The data shows slippage — but the fix is structural, not heroic. Start with consistency.";
  const note = [
    `${kind === "weekly" ? "This week" : "This month"} scores a ${gradeLetter(score)} (${score}/100). ${verdict}`,
    ctx.examDaysLeft > 0
      ? `${ctx.examDaysLeft} days to ${ctx.profile.targetExam}. Weighted readiness sits at ${ctx.coverage.weightedReadiness}%.`
      : "",
  ].filter(Boolean);

  const headline =
    score >= 75
      ? `Strong ${kind} — ${hoursThis}h and momentum on your side.`
      : score >= 55
        ? `Steady ${kind} — ${hoursThis}h logged, a few edges to sharpen.`
        : `A ${kind} to rebuild from — consistency is the first lever.`;

  return {
    kind,
    periodLabel,
    start,
    end: today,
    grade: gradeLetter(score),
    score,
    headline,
    metrics,
    sections: [
      { heading: "What went well", lines: wins },
      { heading: "Concerns", lines: concerns },
      { heading: "Weak spots", lines: weakSpots.length ? weakSpots : ["Balanced across subjects."] },
      { heading: `Focus for the ${kind === "weekly" ? "coming week" : "next month"}`, lines: focus.slice(0, 5) },
      { heading: "Mentor's note", lines: note },
    ],
  };
}

export function buildWeeklyReport(data: ChronicleData, ctx: MentorContext): MentorReport {
  return buildReport("weekly", data, ctx);
}

export function buildMonthlyReport(data: ChronicleData, ctx: MentorContext): MentorReport {
  return buildReport("monthly", data, ctx);
}

/* ════════════════════════════════════════════════════════════════
   LAYER 4 — PROMPT ARCHITECTURE
   ────────────────────────────────────────────────────────────────
   The persona + context + composition that would be sent to an LLM.
   The deterministic mentorReply() below is the offline stand-in, but
   it draws from the very same MentorContext, so swapping in a real
   model changes the voice, not the substance.
   ════════════════════════════════════════════════════════════════ */

export const MENTOR_SYSTEM_PROMPT = `You are Arav, a UPSC mentor who cleared the Civil Services Examination and has since guided dozens of aspirants to selection. You are not a chatbot — you are a mentor who has read every page of this aspirant's journal.

VOICE
- Speak like a trusted senior, not a search engine: warm, direct, concrete.
- Be candid about risks; never sugar-coat, never catastrophise.
- Reference the aspirant's actual numbers. Specificity is what makes advice land.
- Keep it tight: a few sentences or a short, scannable list. No filler.
- End with one clear next action whenever it fits.

PRINCIPLES
- Retrieval and revision beat endless first-reading.
- Consistency compounds harder than intensity.
- Sleep and mood are performance inputs, not luxuries.
- High-weightage, low-mastery subjects get priority.
- Mocks are a feedback loop, not a verdict.

GUARDRAILS
- Use ONLY the data provided in the context block. Never invent numbers, dates, or scores.
- If the data is thin, say so and tell them what to log.
- You are a study mentor; redirect medical or mental-health crises to a professional.`;

/** Serialise the context into the compact, labelled digest the model reads. */
export function buildContextDigest(ctx: MentorContext): string {
  const L: string[] = [];
  L.push(`ASPIRANT: ${ctx.profile.name} — ${ctx.profile.targetExam}, attempt ${ctx.profile.attemptNumber}, optional ${ctx.profile.optionalSubject}.`);
  L.push(`EXAM: ${ctx.examDaysLeft} days to go (${ctx.profile.examDate}).`);
  L.push(
    `STUDY: today ${ctx.study.hoursToday}h; 7-day avg ${ctx.study.last7PerDay}h/day (target ${ctx.study.target}h, trend ${ctx.study.trend}); ${ctx.study.activeDays30}/30 active days; streak ${ctx.study.streak} (best ${ctx.study.longest}).`,
  );
  L.push(
    `MOCKS: ${ctx.mocks.count} logged; latest ${ctx.mocks.latestPct ?? "–"}%; recent Prelims GS avg ${ctx.mocks.recentAvgPct ?? "–"}% (${ctx.mocks.direction}, Δ${ctx.mocks.delta}%); accuracy ${ctx.mocks.accuracyAvg ?? "–"}%; negatives ${ctx.mocks.negativeAvg ?? "–"}; ${ctx.mocks.daysSinceLast ?? "–"} days since last.`,
  );
  if (ctx.mocks.weakSections.length)
    L.push(`WEAK SECTIONS: ${ctx.mocks.weakSections.map((s) => `${s.name} ${s.accuracy}%`).join(", ")}.`);
  L.push(
    `COVERAGE: weighted readiness ${ctx.coverage.weightedReadiness}%, overall mastery ${ctx.coverage.overallMastery}%; ${ctx.coverage.untouchedTopics}/${ctx.coverage.totalTopics} topics untouched.`,
  );
  if (ctx.coverage.neglected.length)
    L.push(`NEGLECTED: ${ctx.coverage.neglected.map((n) => `${n.name} (${n.hours14}h/14d)`).join(", ")}.`);
  L.push(
    `REVISION: ${ctx.revision.due} due (${ctx.revision.overdue} overdue), ${ctx.revision.upcoming7} upcoming in 7d.`,
  );
  L.push(
    `MISTAKES: ${ctx.mistakes.total} total, ${ctx.mistakes.open} open, ${ctx.mistakes.masteredPct}% mastered, ${ctx.mistakes.dueReviews} due; dominant type ${ctx.mistakes.dominantCategory ?? "–"}.`,
  );
  if (ctx.mistakes.recurring.length)
    L.push(`RECURRING: ${ctx.mistakes.recurring.map((r) => `${r.topic}/${r.subjectName} ×${r.count}`).join(", ")}.`);
  L.push(
    `MIND: mood ${ctx.mind.avgMood}/5 (${ctx.mind.moodTrend}), energy ${ctx.mind.avgEnergy}/5, focus ${ctx.mind.avgFocus}/5, sleep ${ctx.mind.avgSleep}h.`,
  );
  if (ctx.weakSubjects.length)
    L.push(`WEAK SUBJECTS (ranked): ${ctx.weakSubjects.slice(0, 5).map((w) => `${w.name} [${w.score}]`).join(", ")}.`);
  if (ctx.risks.length)
    L.push(`RISKS: ${ctx.risks.map((r) => `${r.title} (${r.severity})`).join("; ")}.`);
  return L.join("\n");
}

export interface ChatTurn {
  role: "user" | "coach";
  text: string;
}

export interface ComposedPrompt {
  system: string;
  context: string;
  history: string;
  user: string;
  full: string;
}

/** Assemble the full prompt exactly as it would be sent to the model. */
export function composeMentorPrompt(
  ctx: MentorContext,
  message: string,
  history: ChatTurn[] = [],
): ComposedPrompt {
  const context = buildContextDigest(ctx);
  const hist = history
    .slice(-4)
    .map((t) => `${t.role === "user" ? "Aspirant" : "Mentor"}: ${t.text}`)
    .join("\n");
  const full = [
    `<system>\n${MENTOR_SYSTEM_PROMPT}\n</system>`,
    `<context kind="live-chronicle-snapshot">\n${context}\n</context>`,
    hist ? `<conversation>\n${hist}\n</conversation>` : "",
    `<aspirant_message>\n${message}\n</aspirant_message>`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system: MENTOR_SYSTEM_PROMPT, context, history: hist, user: message, full };
}

/* ════════════════════════════════════════════════════════════════
   MENTOR BRIEFING + DETERMINISTIC RESPONDER
   ════════════════════════════════════════════════════════════════ */

/** A short, synthesised "mentor's read on you" for the top of the page. */
export function mentorBriefing(ctx: MentorContext): string {
  const parts: string[] = [];
  const name = ctx.profile.name.split(" ")[0];

  // opener — consistency
  if (ctx.study.streak >= 7)
    parts.push(`${name}, ${ctx.study.streak} days unbroken — this is exactly the rhythm that clears this exam.`);
  else if (ctx.study.streak > 0)
    parts.push(`${name}, you're ${ctx.study.streak} days into a streak at ${ctx.study.last7PerDay}h/day.`);
  else
    parts.push(`${name}, the streak's broken — but you're one honest 2-hour block from being back in it.`);

  // the single biggest lever
  const topRisk = ctx.risks[0];
  if (topRisk)
    parts.push(`My biggest concern right now is ${topRisk.title.toLowerCase()}: ${topRisk.evidence} ${topRisk.mitigation}`);
  else if (ctx.weakSubjects[0])
    parts.push(`Nothing alarming — I'd just keep leaning into ${ctx.weakSubjects[0].name}, your softest spot.`);

  // a note of trajectory
  if (ctx.mocks.recentAvgPct != null)
    parts.push(
      ctx.mocks.direction === "up"
        ? `Mocks are climbing (${ctx.mocks.recentAvgPct}% lately) — trust the process.`
        : ctx.mocks.direction === "down"
          ? `Mocks have dipped to ${ctx.mocks.recentAvgPct}% — we review the mistakes, not just the score.`
          : `Mocks are steady at ${ctx.mocks.recentAvgPct}%. ${ctx.examDaysLeft} days left to push them.`,
    );

  return parts.join(" ");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The deterministic mentor responder. Routes the message to an intent and
 * answers in the mentor's voice using the live context. This is the local
 * stand-in for the LLM described by the prompt architecture above.
 */
export function mentorReply(
  ctx: MentorContext,
  data: ChronicleData,
  message: string,
): string {
  const p = message.toLowerCase();
  const trimmed = p.trim();

  const has = (...words: string[]) => words.some((w) => p.includes(w));

  // greetings / thanks
  if (/^(hi|hey|hello|yo|hiya|namaste|sup|good (morning|afternoon|evening))[\s!.,]*$/.test(trimmed))
    return `${mentorBriefing(ctx)}\n\nWhat do you want to work on — your plan, your weak areas, or your mocks?`;
  if (has("thank", "thanks", "got it", "appreciate"))
    return "That's what I'm here for. Now close the laptop and go execute the next block.";

  // today's plan / schedule
  if (has("plan", "schedule", "today", "what should i do", "routine")) {
    const plan = recommendDailySchedule(ctx);
    const lines = plan.blocks
      .filter((b) => b.kind !== "break" && b.kind !== "wellbeing")
      .map((b) => `• ${b.start}–${b.end}  ${b.title}`);
    return `Here's how I'd run today (${plan.studyHours}h of focused work):\n\n${lines.join("\n")}\n\n${plan.note} Open the full plan tab for the rationale behind each block.`;
  }

  // weak subjects / focus
  if (has("focus", "weak", "subject", "priorit", "struggl")) {
    const top = ctx.weakSubjects.slice(0, 3);
    if (!top.length) return "I need a bit more logged data on subjects to call out weak areas. Keep journaling your study blocks.";
    const body = top
      .map((w, i) => `${i + 1}. ${w.name} — ${w.reasons.slice(0, 2).join(", ").toLowerCase()}.`)
      .join("\n");
    return `Your priority order right now:\n\n${body}\n\nStart with ${top[0].name} tomorrow morning while your focus is freshest — that's where the marks are hiding.`;
  }

  // mocks
  if (has("mock", "test", "score", "prelims", "trend")) {
    if (ctx.mocks.count < 2) return "Log a couple more mocks and I'll read your trajectory properly.";
    const dir =
      ctx.mocks.direction === "up"
        ? `climbing (+${ctx.mocks.delta}% recently)`
        : ctx.mocks.direction === "down"
          ? `slipping (−${Math.abs(ctx.mocks.delta)}% recently)`
          : "holding steady";
    const weak = ctx.mocks.weakSections[0];
    return `Across ${ctx.mocks.count} mocks you're ${dir}. Latest sits at ${ctx.mocks.latestPct}%, recent Prelims GS average ${ctx.mocks.recentAvgPct ?? "–"}%, accuracy ${ctx.mocks.accuracyAvg ?? "–"}%.${weak ? `\n\nWeakest section: ${weak.name} at ${weak.accuracy}%. ` : " "}${ctx.mocks.negativeAvg != null && ctx.mocks.negativeAvg >= 14 ? `You're also bleeding ~${ctx.mocks.negativeAvg} marks to negatives — tighten attempt discipline.` : "Review every wrong answer before the next paper."}`;
  }

  // revision
  if (has("revis", "recall", "spaced", "forget")) {
    const plan = suggestRevisionPlan(data, ctx);
    return `Revision status: ${ctx.revision.due} due now (${ctx.revision.overdue} overdue), ${ctx.revision.upcoming7} coming this week.\n\n${plan.summary}\n\nClear overdue cards first — lapsed recall is where you quietly lose marks. The Plan tab has your 7-day revision map.`;
  }

  // risks / behind / worried
  if (has("risk", "behind", "worried", "danger", "on track", "ready", "pace")) {
    if (!ctx.risks.length)
      return `No red flags. ${ctx.examDaysLeft} days out, weighted readiness ${ctx.coverage.weightedReadiness}%. Keep compounding.`;
    const body = ctx.risks
      .slice(0, 3)
      .map((r) => `• [${cap(r.severity)}] ${r.title} — ${r.evidence}`)
      .join("\n");
    return `Here's what I'm watching, most urgent first:\n\n${body}\n\nThe top fix: ${ctx.risks[0].mitigation}`;
  }

  // consistency
  if (has("consist", "streak", "discipline", "motivat", "lazy")) {
    return `Consistency check: ${ctx.study.activeDays30}/30 active days, current streak ${ctx.study.streak} (best ${ctx.study.longest}), ${ctx.study.last7PerDay}h/day this week.\n\n${ctx.study.activeDays30 >= 24 ? "This is championship-level discipline. Guard it." : "Aim for 25+ active days a month — showing up imperfectly beats waiting to feel ready."}`;
  }

  // mood / burnout / sleep
  if (has("tired", "burnout", "burn out", "burnt", "exhaust", "stress", "sleep", "mood", "overwhelm", "anxious")) {
    return `Recovery read: mood ${ctx.mind.avgMood}/5 (${ctx.mind.moodTrend}), energy ${ctx.mind.avgEnergy}/5, sleep ${ctx.mind.avgSleep}h.\n\n${ctx.mind.avgSleep > 0 && ctx.mind.avgSleep < 6.5 ? "Your sleep is under 6.5h — that's quietly capping your retention. Protect it like a study slot." : "Your recovery markers are holding. Keep guarding sleep and one rest block."} A rested mind out-scores a frazzled one every single time.`;
  }

  // coverage / syllabus
  if (has("cover", "syllabus", "topic", "complete", "left")) {
    return `Coverage: ${ctx.coverage.untouchedTopics} of ${ctx.coverage.totalTopics} topics still untouched; overall mastery ${ctx.coverage.overallMastery}%, weighted readiness ${ctx.coverage.weightedReadiness}%.${ctx.coverage.neglected.length ? `\n\nMost neglected: ${ctx.coverage.neglected.slice(0, 3).map((n) => `${n.name} (${n.hours14}h/14d)`).join(", ")}.` : ""}\n\nFirst-reading the untouched topics is the highest-leverage move you can make right now.`;
  }

  // weekly / monthly report
  if (has("weekly", "week report", "this week")) {
    const r = buildWeeklyReport(data, ctx);
    return `${r.headline}\n\nGrade: ${r.grade} (${r.score}/100). ${r.metrics.map((m) => `${m.label} ${m.value}`).slice(0, 3).join(" · ")}.\n\nOpen the Reports tab for the full breakdown.`;
  }
  if (has("monthly", "month report", "this month")) {
    const r = buildMonthlyReport(data, ctx);
    return `${r.headline}\n\nGrade: ${r.grade} (${r.score}/100). ${r.metrics.map((m) => `${m.label} ${m.value}`).slice(0, 3).join(" · ")}.\n\nOpen the Reports tab for the full breakdown.`;
  }

  // mistakes
  if (has("mistake", "error", "wrong")) {
    return `Mistakes: ${ctx.mistakes.total} logged, ${ctx.mistakes.open} still open, ${ctx.mistakes.masteredPct}% mastered, ${ctx.mistakes.dueReviews} due for review.${ctx.mistakes.dominantCategory ? `\n\nYour dominant error type is ${ctx.mistakes.dominantCategory} — that's the pattern to break.` : ""}${ctx.mistakes.recurring.length ? ` ${ctx.mistakes.recurring[0].topic} keeps recurring (${ctx.mistakes.recurring[0].count}×).` : ""}`;
  }

  // fallback — capabilities, in voice
  return `I've read your whole chronicle — hours, mocks, coverage, revision, mistakes and mood. Ask me about your plan for today, your weak subjects, mock trends, revision, preparation risks, consistency, or just say "how am I doing?" and I'll give you the honest read.`;
}
