import type {
  Book,
  CurrentAffair,
  Goal,
  GoalHorizon,
  GoalMetric,
  ISODate,
  JournalEntry,
  LifeEntry,
  Mistake,
  MockTest,
  Reflection,
  RevisionItem,
  Subject,
} from "./types";
import { fromISODate, toISODate, daysBetween, round, avg } from "./utils";
import { currentStreak, subjectMastery } from "./selectors";

/* ════════════════════════════════════════════════════════════════
   Goals that measure themselves.

   A goal's `current` used to be a number you typed in by hand, and
   `linkedSubjectId` was on the type but read by nothing — so "study 40
   hours this week" sat at whatever figure you last remembered to update,
   while the journal right next door already knew the answer.

   A goal now names *what to measure*, and the number is read from the
   data every render. Everything here is a pure function of
   (goal, data, today), which is what makes it testable and keeps the
   page a rendering concern.
   ════════════════════════════════════════════════════════════════ */

/* `GoalMetric` lives in types.ts with the rest of the domain model — that file
   deliberately imports nothing, so defining it here would be circular. */
export type { GoalMetric } from "./types";

/**
 * How a metric relates to its window.
 *  - `sum`      adds up the days inside it (40 hours *this week*)
 *  - `average`  means the readings inside it (average mock score)
 *  - `snapshot` is a reading of the here and now, so the window doesn't
 *               apply (a streak, a mastery percentage, a lifetime count)
 *
 * Pace and projection only make sense for `sum`; the others can't be
 * "half done by Wednesday".
 */
export type MetricKind = "sum" | "average" | "snapshot";

export interface MetricDef {
  id: GoalMetric;
  label: string;
  /** Default unit, used when the goal doesn't override it. */
  unit: string;
  kind: MetricKind;
  /** Meaningless without `linkedSubjectId`. */
  needsSubject?: boolean;
  /** Where this number comes from, for attribution and a link through. */
  source: string;
  href: string;
  hint: string;
}

export const GOAL_METRICS: MetricDef[] = [
  {
    /* Counted as `sum` so a hand-tracked goal still gets a pace projection —
       "15 of 130 lectures with 40 days left" is exactly where that's useful.
       Measurement short-circuits before the window is consulted, and
       `contributionSeries` skips it, since a typed total has no daily shape. */
    id: "manual",
    label: "Track it myself",
    unit: "",
    kind: "sum",
    source: "You",
    href: "/goals",
    hint: "You set the number by hand. Use this for anything the app can't see.",
  },
  {
    id: "studyHours",
    label: "Hours studied",
    unit: "hrs",
    kind: "sum",
    source: "Daily Journal",
    href: "/journal",
    hint: "Total hours logged in your journal across the goal's window.",
  },
  {
    id: "studyDays",
    label: "Days studied",
    unit: "days",
    kind: "sum",
    source: "Daily Journal",
    href: "/heatmap",
    hint: "Days in the window that carry study hours.",
  },
  {
    id: "studyStreak",
    label: "Current study streak",
    unit: "days",
    kind: "snapshot",
    source: "Daily Journal",
    href: "/heatmap",
    hint: "Consecutive days studied, counting back from today.",
  },
  {
    id: "deepWorkHours",
    label: "Deep-work hours",
    unit: "hrs",
    kind: "sum",
    source: "Life Dashboard",
    href: "/wellbeing",
    hint: "Deep-work hours recorded in the life dashboard.",
  },
  {
    id: "topicsCompleted",
    label: "Topics completed",
    unit: "topics",
    kind: "sum",
    source: "Daily Journal",
    href: "/subjects",
    hint: "Topics you ticked off in journal entries inside the window.",
  },
  {
    id: "revisionPasses",
    label: "Revision passes",
    unit: "passes",
    kind: "sum",
    source: "Revision Tracker",
    href: "/revision",
    hint: "Scheduled revision items actually revised inside the window.",
  },
  {
    id: "mocksTaken",
    label: "Mocks attempted",
    unit: "mocks",
    kind: "sum",
    source: "Mock Tests",
    href: "/mocks",
    hint: "Mock tests dated inside the window.",
  },
  {
    id: "mockAverage",
    label: "Average mock score",
    unit: "%",
    kind: "average",
    source: "Mock Tests",
    href: "/mocks",
    hint: "Mean percentage across mocks sat inside the window.",
  },
  {
    id: "subjectHours",
    label: "Hours on one subject",
    unit: "hrs",
    kind: "sum",
    needsSubject: true,
    source: "Daily Journal",
    href: "/subjects",
    hint: "Hours from journal study blocks for the linked subject.",
  },
  {
    id: "subjectMastery",
    label: "Subject mastery",
    unit: "%",
    kind: "snapshot",
    needsSubject: true,
    source: "Syllabus Tracker",
    href: "/subjects",
    hint: "Average confidence across the linked subject's topics.",
  },
  {
    id: "booksCompleted",
    label: "Books finished",
    unit: "books",
    kind: "sum",
    source: "Library",
    href: "/books",
    hint: "Books marked finished inside the window.",
  },
  {
    id: "currentAffairsLogged",
    label: "Current affairs logged",
    unit: "items",
    kind: "sum",
    source: "Current Affairs",
    href: "/current-affairs",
    hint: "Current-affairs items dated inside the window.",
  },
  {
    id: "reflectionsWritten",
    label: "Reflections written",
    unit: "entries",
    kind: "sum",
    source: "Reflection Journal",
    href: "/reflections",
    hint: "Reflections dated inside the window.",
  },
  {
    id: "mistakesMastered",
    label: "Mistakes mastered",
    unit: "mistakes",
    kind: "snapshot",
    source: "Mistake Tracker",
    href: "/mistakes",
    hint: "Mistakes that have graduated to mastered, all time.",
  },
];

export function metricDef(id: GoalMetric | undefined): MetricDef {
  return GOAL_METRICS.find((m) => m.id === (id ?? "manual")) ?? GOAL_METRICS[0];
}

/** The slice of the store a goal can measure itself against. */
export interface GoalData {
  journal: JournalEntry[];
  subjects: Subject[];
  mocks: MockTest[];
  revisions: RevisionItem[];
  books: Book[];
  currentAffairs: CurrentAffair[];
  reflections: Reflection[];
  mistakes: Mistake[];
  lifeLog: LifeEntry[];
}

/* ── the window a goal is judged over ────────────────────────── */

export interface GoalWindow {
  start: ISODate;
  end: ISODate;
  /** Human phrasing of the span, e.g. "this week". */
  label: string;
  /** Days in the window, inclusive. */
  totalDays: number;
  /** Days of it already gone, inclusive of today, clamped to the window. */
  elapsedDays: number;
  /** Days remaining, 0 once the window has closed. */
  daysLeft: number;
  /** True once today is past the end. */
  closed: boolean;
}

function shift(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function startOfWeek(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return shift(iso, -((d.getDay() + 6) % 7)); // Monday-first, as elsewhere
}

/**
 * Which stretch of time a goal is measured over, from its horizon.
 *
 * Recurring horizons resolve to the *current* calendar period, so a weekly goal
 * starts again each Monday rather than accumulating forever. A long-term goal
 * runs from when it was set to its deadline. The window is shown on screen next
 * to every goal, because a progress bar whose span you can't see is a guess.
 */
export function goalWindow(goal: Goal, today: ISODate): GoalWindow {
  let start: ISODate;
  let end: ISODate;
  let label: string;

  const horizon: GoalHorizon = goal.horizon;
  if (horizon === "Daily") {
    start = today;
    end = today;
    label = "today";
  } else if (horizon === "Weekly") {
    start = startOfWeek(today);
    end = shift(start, 6);
    label = "this week";
  } else if (horizon === "Monthly") {
    const d = fromISODate(today);
    start = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
    end = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    label = "this month";
  } else if (horizon === "Quarterly") {
    const d = fromISODate(today);
    const q = Math.floor(d.getMonth() / 3);
    start = toISODate(new Date(d.getFullYear(), q * 3, 1));
    end = toISODate(new Date(d.getFullYear(), q * 3 + 3, 0));
    label = "this quarter";
  } else {
    start = goal.createdOn <= today ? goal.createdOn : today;
    end = goal.deadline && goal.deadline >= start ? goal.deadline : today;
    label = goal.deadline ? "until the deadline" : "since you set it";
  }

  /* A deadline inside the period ends the window early — that is the date the
     goal is actually answerable by. A deadline beyond it is left to drive
     urgency only, so the window stays the clean calendar period. */
  if (goal.deadline && goal.deadline >= start && goal.deadline < end) {
    end = goal.deadline;
  }

  const totalDays = Math.max(1, daysBetween(start, end) + 1);
  const cappedToday = today > end ? end : today < start ? start : today;
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(start, cappedToday) + 1));
  return {
    start,
    end,
    label,
    totalDays,
    elapsedDays,
    daysLeft: Math.max(0, daysBetween(today, end)),
    closed: today > end,
  };
}

/* ── measuring ───────────────────────────────────────────────── */

function inRange<T extends { date: ISODate }>(rows: T[], w: GoalWindow, today: ISODate): T[] {
  // Never count the future: a window that runs past today must not be credited
  // with days that haven't happened.
  const end = w.end > today ? today : w.end;
  return rows.filter((r) => r.date >= w.start && r.date <= end);
}

function mockPct(m: MockTest): number | null {
  return m.max > 0 ? (m.score / m.max) * 100 : null;
}

/** The measured value of a goal's metric. `null` when it can't be computed. */
export function measureGoal(
  goal: Goal,
  data: GoalData,
  w: GoalWindow,
  today: ISODate,
): number | null {
  const def = metricDef(goal.metric);
  if (def.id === "manual") return goal.current ?? 0;
  if (def.needsSubject && !goal.linkedSubjectId) return null;

  const entries = inRange(data.journal, w, today);

  switch (def.id) {
    case "studyHours":
      return round(entries.reduce((a, e) => a + e.totalHours, 0), 1);
    case "studyDays":
      return entries.filter((e) => e.totalHours > 0).length;
    case "studyStreak":
      return currentStreak(data.journal, fromISODate(today));
    case "deepWorkHours":
      return round(
        inRange(data.lifeLog, w, today).reduce((a, e) => a + (e.deepWorkHours ?? 0), 0),
        1,
      );
    case "topicsCompleted":
      return entries.reduce((a, e) => a + (e.topicsCompleted?.length ?? 0), 0);
    case "revisionPasses":
      // Reads the schedule rather than the journal's free-text sessions, so it
      // counts real passes over tracked items however they were logged.
      return data.revisions.filter(
        (r) => r.lastRevised && r.lastRevised >= w.start && r.lastRevised <= (w.end > today ? today : w.end),
      ).length;
    case "mocksTaken":
      return inRange(data.mocks, w, today).length;
    case "mockAverage": {
      const pcts = inRange(data.mocks, w, today)
        .map(mockPct)
        .filter((v): v is number => v != null);
      return pcts.length ? round(avg(pcts), 1) : null;
    }
    case "subjectHours": {
      let hours = 0;
      for (const e of entries) {
        for (const b of e.blocks ?? []) {
          if (b?.subjectId === goal.linkedSubjectId && b.hours > 0) hours += b.hours;
        }
      }
      return round(hours, 1);
    }
    case "subjectMastery": {
      const subject = data.subjects.find((s) => s.id === goal.linkedSubjectId);
      return subject ? subjectMastery(subject) : null;
    }
    case "booksCompleted":
      return data.books.filter(
        (b) =>
          b.status === "Completed" &&
          b.finishedOn &&
          b.finishedOn >= w.start &&
          b.finishedOn <= (w.end > today ? today : w.end),
      ).length;
    case "currentAffairsLogged":
      return inRange(data.currentAffairs, w, today).length;
    case "reflectionsWritten":
      return inRange(data.reflections, w, today).length;
    case "mistakesMastered":
      return data.mistakes.filter((m) => m.status === "Mastered").length;
    default:
      return goal.current ?? 0;
  }
}

/* ── progress, pace and health ───────────────────────────────── */

export type GoalHealth =
  | "achieved"
  | "onTrack"
  | "atRisk"
  | "behind"
  | "missed"
  | "paused"
  | "unmeasurable"
  | "open";

export interface GoalProgress {
  goal: Goal;
  metric: MetricDef;
  window: GoalWindow;
  /** Whether the number came from the data rather than being typed in. */
  tracked: boolean;
  current: number | null;
  target: number | null;
  /** 0–100, clamped. Null when there's nothing to measure against. */
  pct: number | null;
  health: GoalHealth;
  /** Where progress "should" be by now if spread evenly, 0–100. */
  expectedPct: number | null;
  /** How far ahead (+) or behind (−) the even pace, in percentage points. */
  paceDelta: number | null;
  /** What's still needed per remaining day to land on target. */
  requiredPerDay: number | null;
  /** Current rate per elapsed day. */
  perDay: number | null
  /** Days until the deadline; negative once it's passed. Null without one. */
  daysToDeadline: number | null;
  overdue: boolean;
  /** Set when a tracked goal has hit its target but is still marked Active. */
  readyToComplete: boolean;
  /** Why the number can't be computed, when it can't. */
  problem: string | null;
}

const HEALTH_LABEL: Record<GoalHealth, string> = {
  achieved: "Target reached",
  onTrack: "On track",
  atRisk: "At risk",
  behind: "Behind",
  missed: "Window closed",
  paused: "Paused",
  unmeasurable: "Needs setup",
  open: "No target set",
};

export function healthLabel(h: GoalHealth): string {
  return HEALTH_LABEL[h];
}

export function computeGoalProgress(
  goal: Goal,
  data: GoalData,
  today: ISODate = toISODate(new Date()),
): GoalProgress {
  const metric = metricDef(goal.metric);
  const window = goalWindow(goal, today);
  const tracked = metric.id !== "manual";
  const target = goal.target && goal.target > 0 ? goal.target : null;

  let problem: string | null = null;
  if (metric.needsSubject && !goal.linkedSubjectId) {
    problem = "Pick a subject for this metric to mean anything.";
  }

  const current = measureGoal(goal, data, window, today);
  if (tracked && current === null && !problem) {
    problem = "Nothing recorded yet for this measure.";
  }

  const pct =
    target != null && current != null
      ? Math.max(0, Math.min(100, round((current / target) * 100, 0)))
      : null;

  const daysToDeadline = goal.deadline ? daysBetween(today, goal.deadline) : null;
  const overdue =
    goal.status === "Active" && daysToDeadline != null && daysToDeadline < 0;

  /* Even pace only applies to something that accumulates day by day. An average
     score or a streak isn't "40% done on Tuesday", so those get no projection
     and are judged purely on whether they've hit the number. */
  const paceApplies = metric.kind === "sum" && target != null && pct != null;
  const expectedPct = paceApplies
    ? round((window.elapsedDays / window.totalDays) * 100, 0)
    : null;
  const paceDelta = expectedPct != null && pct != null ? pct - expectedPct : null;

  const remaining = target != null && current != null ? Math.max(0, target - current) : null;
  const requiredPerDay =
    paceApplies && remaining != null
      ? round(remaining / Math.max(1, window.daysLeft || 1), 2)
      : null;
  const perDay =
    metric.kind === "sum" && current != null && window.elapsedDays > 0
      ? round(current / window.elapsedDays, 2)
      : null;

  let health: GoalHealth;
  if (goal.status === "Completed" || (pct != null && pct >= 100)) health = "achieved";
  /* Parked on purpose, so it isn't failing. Without this a paused goal in a
     window that has run on reads as 100 points behind pace and shouts for
     attention it explicitly isn't asking for. */
  else if (goal.status === "Paused") health = "paused";
  else if (problem) health = "unmeasurable";
  else if (target == null) health = "open";
  else if (window.closed || overdue) health = "missed";
  else if (paceDelta == null) health = "onTrack";
  else if (paceDelta >= -5) health = "onTrack";
  else if (paceDelta >= -20) health = "atRisk";
  else health = "behind";

  return {
    goal,
    metric,
    window,
    tracked,
    current,
    target,
    pct,
    health,
    expectedPct,
    paceDelta,
    requiredPerDay,
    perDay,
    daysToDeadline,
    overdue,
    readyToComplete:
      tracked && goal.status === "Active" && pct != null && pct >= 100,
    problem,
  };
}

/**
 * Per-day contribution across the window, for a sparkline. Only summable
 * metrics have a shape worth drawing; the rest return an empty series.
 */
export function contributionSeries(
  goal: Goal,
  data: GoalData,
  today: ISODate = toISODate(new Date()),
  maxPoints = 31,
): { date: ISODate; value: number }[] {
  const metric = metricDef(goal.metric);
  // A hand-typed total is a single number with no per-day shape — measuring it
  // day by day would draw a flat line at the full value.
  if (metric.kind !== "sum" || metric.id === "manual") return [];
  const w = goalWindow(goal, today);
  const end = w.end > today ? today : w.end;
  const days = daysBetween(w.start, end) + 1;
  if (days < 2) return [];

  // Long windows are sampled from the tail so the line stays readable.
  const from = days > maxPoints ? shift(end, -(maxPoints - 1)) : w.start;
  const out: { date: ISODate; value: number }[] = [];
  for (let d = from; d <= end; d = shift(d, 1)) {
    const day: GoalWindow = { ...w, start: d, end: d, totalDays: 1, elapsedDays: 1, daysLeft: 0, closed: false };
    out.push({ date: d, value: measureGoal(goal, data, day, today) ?? 0 });
  }
  return out;
}

export interface GoalPortfolio {
  total: number;
  active: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  behind: number;
  missed: number;
  readyToComplete: number;
  overdue: number;
  tracked: number;
  /** Mean progress across active goals that have a target, 0–100. */
  avgProgress: number | null;
  /** Completed as a share of everything that isn't paused, 0–1. */
  completionRate: number | null;
}

export function goalPortfolio(progress: GoalProgress[]): GoalPortfolio {
  const active = progress.filter((p) => p.goal.status === "Active");
  const measurable = active.filter((p) => p.pct != null);
  const counted = progress.filter((p) => p.goal.status !== "Paused");
  const completed = progress.filter((p) => p.goal.status === "Completed").length;
  return {
    total: progress.length,
    active: active.length,
    completed,
    onTrack: active.filter((p) => p.health === "onTrack").length,
    atRisk: active.filter((p) => p.health === "atRisk").length,
    behind: active.filter((p) => p.health === "behind").length,
    missed: active.filter((p) => p.health === "missed").length,
    readyToComplete: progress.filter((p) => p.readyToComplete).length,
    overdue: active.filter((p) => p.overdue).length,
    tracked: progress.filter((p) => p.tracked).length,
    avgProgress: measurable.length
      ? round(avg(measurable.map((p) => p.pct as number)), 0)
      : null,
    completionRate: counted.length ? round(completed / counted.length, 4) : null,
  };
}

/** Most urgent first: things slipping, then things closing soon. */
const HEALTH_ORDER: GoalHealth[] = [
  "behind",
  "atRisk",
  "missed",
  "unmeasurable",
  "onTrack",
  "open",
  "paused",
  "achieved",
];

export function byUrgency(a: GoalProgress, b: GoalProgress): number {
  const rank = HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health);
  if (rank !== 0) return rank;
  const ad = a.daysToDeadline ?? Number.POSITIVE_INFINITY;
  const bd = b.daysToDeadline ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return a.goal.title.localeCompare(b.goal.title);
}

/** One line describing where a goal stands, for a card footer. */
export function paceNote(p: GoalProgress): string {
  if (p.goal.status === "Completed") return "Marked complete.";
  if (p.goal.status === "Paused") return "Paused — not being tracked for now.";
  if (p.problem) return p.problem;
  if (p.health === "achieved") return "Target reached — mark it complete.";
  if (p.target == null) return p.goal.metricLabel || "No target — tracked as an aspiration.";
  if (p.health === "missed")
    return p.overdue
      ? `Deadline passed ${Math.abs(p.daysToDeadline ?? 0)} day${Math.abs(p.daysToDeadline ?? 0) === 1 ? "" : "s"} ago.`
      : "The window closed short of the target.";
  if (p.metric.kind !== "sum")
    return `${p.current ?? 0}${p.metric.unit === "%" ? "%" : ""} of ${p.target} needed.`;
  if (p.requiredPerDay != null && p.window.daysLeft > 0)
    return `${p.requiredPerDay} ${p.goal.unit || p.metric.unit} a day for the last ${p.window.daysLeft} day${p.window.daysLeft === 1 ? "" : "s"}.`;
  return `${p.window.daysLeft === 0 ? "Last day" : "Keep going"} — ${round((p.target ?? 0) - (p.current ?? 0), 1)} ${p.goal.unit || p.metric.unit} to go.`;
}
