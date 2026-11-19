import type {
  ChronicleData,
  CoachDecision,
  CoachLog,
  ISODate,
  PlanPriority,
  RoadmapPlan,
} from "./types";
import { addDays, isCarried, normalizeWeekStart, ownCounts, weekPlanFor, weekStartOf } from "./roadmap";
import { byUrgency, computeGoalProgress, healthLabel, paceNote, type GoalData } from "./goals";
import { habitConsistency, habitContext, habitSource, habitStart, habitStreaks, isActiveHabit, isPaused, SOURCE_LABEL, summarizeToday, todayHabits, type HabitContext } from "./habit-engine";
import { countedSleepHours } from "./sleep";
import { daysBetween, formatDate, round, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   THE STUDY COACH
   A deterministic reading of this account's records: the same records
   always give the same briefing and the same recommendations, every one
   with the figures it rests on (the dates they cover, and a link to the
   records). No model, nothing paid, nothing sent anywhere.

   It reads the study record (journal, syllabus, revision, mocks, the
   Roadmap, goals, habits, life). It never reads the Personal Diary:
   `CoachData` leaves it out, and a goal that counts diary entries is
   skipped, so not even a count reaches it.

   It never changes a plan, a goal or the revision queue by itself. A
   recommendation that could change something carries `changes`, said in
   words; the page shows them and applies them only when you confirm.
   What you decide is kept (CoachLog): a recommendation you dismissed or
   applied stays away until its evidence changes (`fingerprint`).
   ════════════════════════════════════════════════════════════════ */

export type CoachData = Omit<ChronicleData, "reflections">;

/** Exactly the records the coach reads. The diary is not one of them. */
export type CoachInput = Pick<
  CoachData,
  "profile" | "journal" | "subjects" | "revisions" | "plans" | "habits" | "goals" | "mocks" | "lifeLog" | "books" | "currentAffairs" | "mistakes"
>;

/** The study record without the diary, for the coach. */
export function coachDataOf(state: ChronicleData): CoachData {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reflections, ...rest } = state;
  return rest;
}

export interface Evidence {
  /** The figure, in words: "Economy: 0 h from 1 Nov to 14 Nov". */
  text: string;
  /** The days it covers. */
  from?: ISODate;
  to?: ISODate;
  /** Where to see the records. */
  href?: string;
}

export type ProposedChange =
  | {
      kind: "addActivity";
      planId: string;
      title: string;
      subjectId?: string;
      priority: PlanPriority;
      targetDate?: ISODate;
      text: string;
    }
  | { kind: "carryForward"; fromPlanId: string; toPlanId: string; itemIds: string[]; text: string }
  | { kind: "rescheduleRevision"; moves: { id: string; to: ISODate }[]; text: string };

export type CoachArea = "study" | "revision" | "plan" | "habits" | "goals" | "life" | "mocks";

export const AREA_LABEL: Record<CoachArea, string> = {
  study: "Study",
  revision: "Revision",
  plan: "Plan",
  habits: "Habits",
  goals: "Goals",
  life: "Life",
  mocks: "Mocks",
};

export interface Recommendation {
  /** Stable for the same situation: `neglected:economy`. */
  id: string;
  area: CoachArea;
  /** Higher comes first. */
  rank: number;
  /** What to do. */
  title: string;
  /** Why, in a sentence. */
  why: string;
  evidence: Evidence[];
  action: { label: string; href: string };
  /** What applying it would change. Nothing changes until you confirm. */
  changes?: ProposedChange[];
  /** The evidence, condensed: a different fingerprint is new evidence. */
  fingerprint: string;
}

/* ── Reading the records ─────────────────────────────────────── */

interface Reading {
  today: ISODate;
  weekStart: number;
  ctx: HabitContext;
  hoursByDay: Map<ISODate, number>;
  subjectHours: (id: string, from: ISODate, to: ISODate) => number;
  lastStudied: Map<string, ISODate>;
  thisWeek: { start: ISODate; end: ISODate; plan?: RoadmapPlan };
  lastWeek: { start: ISODate; end: ISODate; plan?: RoadmapPlan };
}

function read(data: CoachInput, today: ISODate): Reading {
  const weekStart = normalizeWeekStart(data.profile.weekStart);
  const hoursByDay = new Map<ISODate, number>();
  const lastStudied = new Map<string, ISODate>();
  const blocks: { date: ISODate; subjectId: string; hours: number }[] = [];
  for (const e of data.journal) {
    if (e.date > today) continue;
    hoursByDay.set(e.date, (hoursByDay.get(e.date) ?? 0) + (e.totalHours || 0));
    for (const b of e.blocks ?? []) {
      if (!b?.subjectId || !(b.hours > 0)) continue;
      blocks.push({ date: e.date, subjectId: b.subjectId, hours: b.hours });
      const last = lastStudied.get(b.subjectId);
      if (!last || e.date > last) lastStudied.set(b.subjectId, e.date);
    }
  }
  const start = weekStartOf(today, weekStart);
  const lastStart = addDays(start, -7);
  return {
    today,
    weekStart,
    ctx: habitContext(data, today),
    hoursByDay,
    subjectHours: (id, from, to) => round(blocks.filter((b) => b.subjectId === id && b.date >= from && b.date <= to).reduce((s, b) => s + b.hours, 0), 1),
    lastStudied,
    thisWeek: { start, end: addDays(start, 6), plan: weekPlanFor(data.plans.filter((p) => !p.archivedAt), start) },
    lastWeek: { start: lastStart, end: addDays(lastStart, 6), plan: weekPlanFor(data.plans.filter((p) => !p.archivedAt), lastStart) },
  };
}

function hoursBetween(r: Reading, from: ISODate, to: ISODate): number {
  let sum = 0;
  for (const [d, h] of r.hoursByDay) if (d >= from && d <= to) sum += h;
  return round(sum, 1);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const h = (n: number) => `${round(n, 1)} h`;
const span = (from: ISODate, to: ISODate) => `${formatDate(from)} to ${formatDate(to)}`;

function goalData(data: CoachInput): GoalData {
  // The diary is not the coach's to read, so no goal sees it here.
  return {
    journal: data.journal,
    subjects: data.subjects,
    mocks: data.mocks,
    revisions: data.revisions,
    books: data.books,
    currentAffairs: data.currentAffairs,
    reflections: [],
    mistakes: data.mistakes,
    lifeLog: data.lifeLog,
  };
}

/* ── Recommendations ─────────────────────────────────────────── */

export function buildRecommendations(data: CoachInput, today: ISODate = toISODate(new Date())): Recommendation[] {
  const r = read(data, today);
  const out: Recommendation[] = [];

  /* Revision that has slipped past its day */
  const overdue = data.revisions.filter((x) => x.nextDue < today).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const dueToday = data.revisions.filter((x) => x.nextDue === today).length;
  if (overdue.length >= 3) {
    const perDay = 4;
    const moves = overdue.map((x, i) => ({ id: x.id, to: addDays(today, Math.floor(i / perDay)) }));
    const lastDay = moves[moves.length - 1].to;
    out.push({
      id: "revision:overdue",
      area: "revision",
      rank: 90 + Math.min(9, overdue.length),
      title: `Clear ${plural(overdue.length, "overdue revision")}`,
      why: "Overdue topics fade fastest. Spread over the next few days, each day stays light.",
      evidence: [
        { text: `${plural(overdue.length, "topic")} past their revision day; the oldest, “${overdue[0].topic}”, was due ${formatDate(overdue[0].nextDue)}.`, href: "/revision" },
        ...(dueToday ? [{ text: `${plural(dueToday, "more topic")} due today.`, href: "/revision" }] : []),
      ],
      action: { label: "Open the revision queue", href: "/revision" },
      changes: [
        {
          kind: "rescheduleRevision",
          moves,
          text: `Move ${plural(overdue.length, "overdue topic")} to ${perDay} a day, from today to ${formatDate(lastDay)}. Their intervals and history stay as they are.`,
        },
      ],
      fingerprint: `${overdue.length}|${overdue[0].id}`,
    });
  }

  /* A subject left out lately */
  const from14 = addDays(today, -13);
  const neglected = data.subjects
    .map((s) => {
      const open = s.topics.filter((t) => t.status !== "mastered");
      const untouched = s.topics.filter((t) => t.status === "untouched");
      return { s, open, untouched, recent: r.subjectHours(s.id, from14, today), last: r.lastStudied.get(s.id) };
    })
    .filter((x) => x.open.length > 0 && x.recent === 0 && (x.last || x.untouched.length > 0))
    .sort((a, b) => (b.s.weightage ?? 0) - (a.s.weightage ?? 0) || b.untouched.length - a.untouched.length)
    .slice(0, 2);
  for (const x of neglected) {
    const plan = r.thisWeek.plan;
    const already = plan?.items?.some((i) => i.kind === "activity" && i.subjectId === x.s.id && i.status !== "completed" && i.status !== "deferred");
    const topic = x.untouched[0]?.name ?? x.open[0]?.name;
    const title = topic ? `${x.s.name}: ${topic}` : `${x.s.name}: a study block`;
    const target = plan ? (addDays(today, 1) <= plan.end ? addDays(today, 1) : plan.end) : undefined;
    out.push({
      id: `neglected:${x.s.id}`,
      area: "study",
      rank: 70 + Math.min(20, Math.round((x.s.weightage ?? 0) / 5)),
      title: `Bring ${x.s.name} back into the week`,
      why: x.last
        ? `No hours on it in the last 14 days, and ${plural(x.open.length, "topic")} still aren't mastered.`
        : `It hasn't been studied in the journal yet, and ${plural(x.untouched.length, "topic")} are untouched.`,
      evidence: [
        { text: `${x.s.name}: 0 h from ${span(from14, today)}.`, from: from14, to: today, href: `/subjects?subject=${x.s.id}` },
        { text: x.last ? `Last studied on ${formatDate(x.last)}.` : "No study block for it in the journal.", href: x.last ? `/journal/${x.last}` : "/journal" },
        { text: `${plural(x.untouched.length, "topic")} of ${x.s.topics.length} not started.`, href: `/subjects?subject=${x.s.id}` },
      ],
      action: plan ? { label: "Open this week's plan", href: `/roadmap?plan=${plan.id}` } : { label: "Plan the week", href: "/roadmap" },
      changes:
        plan && !already
          ? [
              {
                kind: "addActivity",
                planId: plan.id,
                title,
                subjectId: x.s.id,
                priority: "High",
                targetDate: target,
                text: `Add “${title}” to this week's plan, high priority${target ? `, for ${formatDate(target)}` : ""}.`,
              },
            ]
          : undefined,
      fingerprint: `${r.thisWeek.start}|${x.last ?? "never"}|${x.untouched.length}`,
    });
  }

  /* Last week's unfinished activities */
  const lw = r.lastWeek.plan;
  const tw = r.thisWeek.plan;
  if (lw && (!tw || lw.id !== tw.id)) {
    const open = (lw.items ?? []).filter((i) => i.kind === "activity" && (i.status === "notStarted" || i.status === "inProgress") && !isCarried(data.plans, i));
    if (open.length) {
      out.push({
        id: `carry:${lw.id}`,
        area: "plan",
        rank: 80 + Math.min(9, open.length),
        title: `${plural(open.length, "activity", "activities")} left open from last week`,
        why: tw
          ? "Carrying them into this week keeps them in view, and last week's record stays as it was."
          : "There's no plan for this week to carry them into yet.",
        evidence: open.slice(0, 5).map((i) => ({ text: `“${i.title}”${i.status === "inProgress" ? " (in progress)" : ""}`, from: r.lastWeek.start, to: r.lastWeek.end, href: `/roadmap?plan=${lw.id}&item=${i.id}` })),
        action: tw ? { label: "Open last week's plan", href: `/roadmap?plan=${lw.id}` } : { label: "Plan this week", href: "/roadmap" },
        changes: tw
          ? [
              {
                kind: "carryForward",
                fromPlanId: lw.id,
                toPlanId: tw.id,
                itemIds: open.map((i) => i.id),
                text: `Carry ${plural(open.length, "open activity", "open activities")} from last week into this week's plan. Last week keeps them, marked as carried forward.`,
              },
            ]
          : undefined,
        fingerprint: open.map((i) => i.id).sort().join(","),
      });
    }
  }

  /* This week's hours against the daily target */
  const target = data.profile.dailyHourTarget || 0;
  const elapsed = daysBetween(r.thisWeek.start, today) + 1;
  if (target > 0 && elapsed >= 3) {
    const done = hoursBetween(r, r.thisWeek.start, today);
    // Today is still going: the pace counts the days before it.
    const pace = round(target * (elapsed - 1), 1);
    const gap = round(pace - done, 1);
    if (pace > 0 && done < pace * 0.75 && gap >= 2) {
      out.push({
        id: `pace:${r.thisWeek.start}`,
        area: "study",
        rank: 60 + Math.min(20, Math.round(gap)),
        title: `${h(gap)} behind this week's pace`,
        why: `${h(done)} so far this week, against ${h(pace)} for ${plural(elapsed - 1, "day")} at your ${h(target)} a day.`,
        evidence: [{ text: `${h(done)} logged from ${span(r.thisWeek.start, today)}.`, from: r.thisWeek.start, to: today, href: "/journal" }],
        action: { label: "Log today's study", href: "/journal?new=1" },
        fingerprint: `${r.thisWeek.start}|${Math.round(gap)}`,
      });
    }
  }

  /* Days not written down */
  const lastEntry = [...r.hoursByDay.keys()].sort().pop();
  if (lastEntry) {
    const gapDays = daysBetween(lastEntry, today) - 1;
    if (gapDays >= 2) {
      out.push({
        id: "journal:gap",
        area: "study",
        rank: 75,
        title: `${plural(gapDays, "day")} not logged`,
        why: "A day not written down can't be learned from, and the habits that fill in from the journal stay empty.",
        evidence: [{ text: `The last journal entry is for ${formatDate(lastEntry)}.`, from: addDays(lastEntry, 1), to: addDays(today, -1), href: `/journal/${lastEntry}` }],
        action: { label: "Log a day", href: "/journal?new=1" },
        fingerprint: lastEntry,
      });
    }
  }

  /* A habit that has slipped */
  for (const habit of data.habits) {
    if (!isActiveHabit(habit) || isPaused(habit, today)) continue;
    if (daysBetween(habitStart(habit), today) < 13) continue;
    const c = habitConsistency(habit, r.ctx, from14, today);
    if (c.unit !== "day" || c.due < 4 || c.rate === null || c.rate >= 0.5) continue;
    const source = habitSource(habit);
    out.push({
      id: `habit:${habit.id}`,
      area: "habits",
      rank: 50 + Math.round((1 - c.rate) * 20),
      title: `“${habit.name}” has slipped`,
      why: `Kept on ${c.kept} of ${c.due} due days in the last two weeks.${source !== "manual" ? ` It fills in from ${SOURCE_LABEL[source]}, so recording there is what keeps it.` : ""}`,
      evidence: [{ text: `${c.kept} of ${c.due} due days kept, ${span(from14, today)}.`, from: from14, to: today, href: `/habits?habit=${habit.id}` }],
      action: { label: "Open the habit", href: `/habits?habit=${habit.id}` },
      fingerprint: `${c.kept}/${c.due}`,
    });
  }

  /* Goals falling behind */
  const gd = goalData(data);
  for (const goal of data.goals) {
    if (goal.status !== "Active" || goal.metric === "reflectionsWritten") continue;
    const p = computeGoalProgress(goal, gd, today);
    if (p.health !== "behind" && p.health !== "atRisk") continue;
    out.push({
      id: `goal:${goal.id}`,
      area: "goals",
      rank: p.health === "behind" ? 72 : 58,
      title: `“${goal.title}” is ${p.health === "behind" ? "behind" : "at risk"}`,
      why: paceNote(p),
      evidence: [
        {
          text: `${p.pct ?? 0}% done${p.expectedPct !== null ? `, ${p.expectedPct}% expected by now` : ""}${goal.deadline ? `; due ${formatDate(goal.deadline)}` : ""}.`,
          from: p.window.start,
          to: today,
          href: `/goals?goal=${goal.id}`,
        },
      ],
      action: { label: "Open the goal", href: `/goals?goal=${goal.id}` },
      fingerprint: `${p.health}|${Math.round((p.pct ?? 0) / 10)}`,
    });
  }

  /* Sleep */
  const from7 = addDays(today, -6);
  const nights = data.lifeLog.filter((e) => e.date >= from7 && e.date <= today).map((e) => countedSleepHours(e)).filter((x): x is number => x !== undefined);
  if (nights.length >= 3) {
    const mean = round(nights.reduce((a, b) => a + b, 0) / nights.length, 1);
    if (mean < 6.5) {
      out.push({
        id: `sleep:${r.thisWeek.start}`,
        area: "life",
        rank: 55 + Math.round((6.5 - mean) * 10),
        title: "Sleep is running short",
        why: `${h(mean)} a night on average. Short nights cost recall and focus the next day.`,
        evidence: [{ text: `${plural(nights.length, "night")} recorded, ${span(from7, today)}, averaging ${h(mean)}.`, from: from7, to: today, href: "/wellbeing/sleep" }],
        action: { label: "Open sleep", href: "/wellbeing/sleep" },
        fingerprint: `${r.thisWeek.start}|${Math.round(mean * 2) / 2}`,
      });
    }
  }

  /* Mocks */
  const lastMock = [...data.mocks].filter((m) => m.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const examDays = data.profile.examDate ? daysBetween(today, data.profile.examDate) : null;
  if (lastMock) {
    const since = daysBetween(lastMock.date, today);
    if (since >= 21) {
      out.push({
        id: "mocks:gap",
        area: "mocks",
        rank: 52 + Math.min(15, Math.floor(since / 7)),
        title: `No mock in ${since} days`,
        why: "A full mock every two to three weeks shows what the hours are turning into.",
        evidence: [
          { text: `The last was “${lastMock.name}” on ${formatDate(lastMock.date)}.`, href: "/mocks" },
          ...(examDays !== null && examDays > 0 ? [{ text: `${examDays} days to the exam.` }] : []),
        ],
        action: { label: "Open Mock Analytics", href: "/mocks" },
        fingerprint: `${lastMock.id}|${Math.floor(since / 7)}`,
      });
    }
  } else if (examDays !== null && examDays > 0 && examDays < 240 && data.journal.length >= 14) {
    out.push({
      id: "mocks:none",
      area: "mocks",
      rank: 54,
      title: "Take a first mock",
      why: "A mock now shows where the preparation stands while there's time to act on it.",
      evidence: [{ text: `No mock recorded, and ${examDays} days to the exam.`, href: "/mocks" }],
      action: { label: "Open Mock Analytics", href: "/mocks" },
      fingerprint: `${Math.floor(examDays / 30)}`,
    });
  }

  return out.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}

/* ── What you decided ────────────────────────────────────────── */

export const DECISION_LABEL: Record<CoachDecision["status"], string> = {
  accepted: "Accepted",
  dismissed: "Dismissed",
  applied: "Applied",
  done: "Done",
};

/** The latest decision about each recommendation. */
export function latestDecisions(log: CoachLog | undefined): Map<string, CoachDecision> {
  const out = new Map<string, CoachDecision>();
  for (const d of log?.decisions ?? []) {
    const prev = out.get(d.recId);
    if (!prev || d.at >= prev.at) out.set(d.recId, d);
  }
  return out;
}

export interface ShownRecommendation extends Recommendation {
  /** Your last decision about it, if any. */
  decision?: CoachDecision;
  /** Shown again because its evidence changed since you decided. */
  renewed?: boolean;
}

/**
 * Which recommendations to show. One you dismissed, applied or marked done
 * stays away while its evidence is the same; one you accepted stays, marked.
 */
export function visibleRecommendations(recs: Recommendation[], log: CoachLog | undefined): { shown: ShownRecommendation[]; settled: ShownRecommendation[] } {
  const decided = latestDecisions(log);
  const shown: ShownRecommendation[] = [];
  const settled: ShownRecommendation[] = [];
  for (const rec of recs) {
    const d = decided.get(rec.id);
    if (!d) shown.push(rec);
    else if (d.fingerprint !== rec.fingerprint) shown.push({ ...rec, decision: d, renewed: true });
    else if (d.status === "accepted") shown.push({ ...rec, decision: d });
    else settled.push({ ...rec, decision: d });
  }
  return { shown, settled };
}

/* ── The briefing ────────────────────────────────────────────── */

export interface Briefing {
  date: ISODate;
  /** One line on the state of things. */
  headline: string;
  priorities: { text: string; href: string; area: CoachArea }[];
  preparation: { label: string; value: string; note: string; href: string }[];
  habits: { due: number; done: number; pending: { name: string; href: string }[] };
  goals: { title: string; health: string; note: string; href: string }[];
  life: { text: string; href: string }[];
  plan: { text: string; href: string } | null;
}

export function buildBriefing(data: CoachInput, recs: ShownRecommendation[], today: ISODate = toISODate(new Date())): Briefing {
  const r = read(data, today);
  const target = data.profile.dailyHourTarget || 0;
  const weekHours = hoursBetween(r, r.thisWeek.start, today);
  const elapsed = daysBetween(r.thisWeek.start, today) + 1;
  const due = data.revisions.filter((x) => x.nextDue <= today).length;
  const overdue = data.revisions.filter((x) => x.nextDue < today).length;
  const topics = data.subjects.reduce((n, s) => n + s.topics.length, 0);
  const mastered = data.subjects.reduce((n, s) => n + s.topics.filter((t) => t.status === "mastered").length, 0);
  const started = data.subjects.reduce((n, s) => n + s.topics.filter((t) => t.status !== "untouched").length, 0);
  const examDays = data.profile.examDate ? daysBetween(today, data.profile.examDate) : null;
  const lastMock = [...data.mocks].filter((m) => m.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];

  const priorities = recs.slice(0, 3).map((x) => ({ text: x.title, href: x.action.href, area: x.area }));
  if (due > 0 && !recs.some((x) => x.id === "revision:overdue") && priorities.length < 3)
    priorities.push({ text: `Revise ${plural(due, "topic")} due today`, href: "/revision", area: "revision" });
  const todayHours = r.hoursByDay.get(today) ?? 0;
  if (target > 0 && todayHours < target && priorities.length < 3)
    priorities.push({ text: todayHours > 0 ? `${h(target - todayHours)} more to reach today's ${h(target)}` : `Study ${h(target)} today`, href: "/journal?new=1", area: "study" });

  const list = todayHabits(data.habits, r.ctx);
  const summary = summarizeToday(list);

  const gd = goalData(data);
  const goals = data.goals
    .filter((g) => g.status === "Active" && g.metric !== "reflectionsWritten")
    .map((g) => computeGoalProgress(g, gd, today))
    .sort(byUrgency)
    .slice(0, 3)
    .map((p) => ({ title: p.goal.title, health: healthLabel(p.health), note: paceNote(p), href: `/goals?goal=${p.goal.id}` }));

  const life: Briefing["life"] = [];
  const last = data.lifeLog.find((e) => e.date === today);
  const slept = last ? countedSleepHours(last) : undefined;
  life.push(slept !== undefined ? { text: `Slept ${h(slept)} last night.`, href: "/wellbeing/sleep" } : { text: "Last night's sleep isn't recorded.", href: "/wellbeing" });
  const yesterday = data.lifeLog.find((e) => e.date === addDays(today, -1));
  if (yesterday?.exerciseMinutes) life.push({ text: `${yesterday.exerciseMinutes} minutes of exercise yesterday.`, href: "/wellbeing" });

  const plan = r.thisWeek.plan;
  const counts = plan ? ownCounts(data.plans, plan, today) : null;

  const pace = target * elapsed;
  const headline =
    examDays !== null && examDays > 0
      ? `${examDays} days to ${data.profile.targetExam || "the exam"}. ${h(weekHours)} studied this week${target ? `, against ${h(pace)} at your daily target` : ""}.`
      : `${h(weekHours)} studied this week${target ? `, against ${h(pace)} at your daily target` : ""}.`;

  return {
    date: today,
    headline,
    priorities,
    preparation: [
      { label: "This week", value: h(weekHours), note: target ? `of ${h(pace)} at ${h(target)} a day` : `${plural(elapsed, "day")} so far`, href: "/journal" },
      { label: "Syllabus", value: topics ? `${Math.round((started / topics) * 100)}%` : "–", note: topics ? `started, ${mastered} of ${topics} mastered` : "no topics yet", href: "/subjects" },
      { label: "Revision", value: `${due}`, note: overdue ? `due, ${overdue} overdue` : "due today", href: "/revision" },
      {
        label: "Latest mock",
        value: lastMock && lastMock.max > 0 ? `${Math.round((lastMock.score / lastMock.max) * 100)}%` : "–",
        note: lastMock ? `${lastMock.name}, ${formatDate(lastMock.date)}` : "none recorded",
        href: "/mocks",
      },
    ],
    habits: {
      due: summary.due,
      done: summary.done,
      pending: list.filter((t) => !t.done).slice(0, 4).map((t) => ({ name: t.habit.name, href: `/habits?habit=${t.habit.id}` })),
    },
    goals,
    life,
    plan: plan && counts ? { text: `This week's plan: ${counts.completed} of ${counts.total} activities done${counts.overdue ? `, ${counts.overdue} overdue` : ""}.`, href: `/roadmap?plan=${plan.id}` } : null,
  };
}

/* ── The analysis ────────────────────────────────────────────── */

export interface Finding {
  text: string;
  evidence: Evidence[];
  tone?: "good" | "bad";
}

export interface AnalysisSection {
  area: CoachArea;
  title: string;
  findings: Finding[];
}

/** The preparation, section by section, each finding with the records behind it. */
export function buildAnalysis(data: CoachInput, today: ISODate = toISODate(new Date())): AnalysisSection[] {
  const r = read(data, today);
  const sections: AnalysisSection[] = [];
  const from7 = addDays(today, -6);
  const prev7 = addDays(today, -13);
  const from30 = addDays(today, -29);
  const target = data.profile.dailyHourTarget || 0;

  // Study time
  const h7 = hoursBetween(r, from7, today);
  const hPrev = hoursBetween(r, prev7, addDays(today, -7));
  const days7 = [...r.hoursByDay.entries()].filter(([d, x]) => d >= from7 && d <= today && x > 0).length;
  const study: Finding[] = [
    {
      text: `${h(h7)} in the last 7 days, on ${plural(days7, "day")}: ${h(h7 / 7)} a day${target ? ` against a target of ${h(target)}` : ""}.`,
      evidence: [{ text: `Journal, ${span(from7, today)}`, from: from7, to: today, href: "/journal" }],
      tone: target ? (h7 / 7 >= target * 0.9 ? "good" : h7 / 7 < target * 0.6 ? "bad" : undefined) : undefined,
    },
  ];
  if (hPrev > 0) {
    const change = (h7 - hPrev) / hPrev;
    if (Math.abs(change) >= 0.1)
      study.push({
        text: `That's ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change * 100))}% on the 7 days before (${h(hPrev)}).`,
        evidence: [{ text: `Journal, ${span(prev7, addDays(today, -7))}`, from: prev7, to: addDays(today, -7), href: "/journal" }],
        tone: change > 0 ? "good" : "bad",
      });
  }
  sections.push({ area: "study", title: "Study time", findings: study });

  // Subjects
  const bySubject = data.subjects
    .map((s) => ({ s, hours: r.subjectHours(s.id, from30, today), mastered: s.topics.filter((t) => t.status === "mastered").length, total: s.topics.length }))
    .filter((x) => x.total > 0);
  const studied = bySubject.filter((x) => x.hours > 0).sort((a, b) => b.hours - a.hours);
  const idle = bySubject.filter((x) => x.hours === 0 && x.mastered < x.total);
  const subjects: Finding[] = [];
  if (studied.length) {
    subjects.push({
      text: `Most time in the last 30 days: ${studied
        .slice(0, 3)
        .map((x) => `${x.s.name} (${h(x.hours)})`)
        .join(", ")}.`,
      evidence: studied.slice(0, 3).map((x) => ({ text: `${x.s.name}: ${h(x.hours)}, ${x.mastered} of ${x.total} topics mastered`, from: from30, to: today, href: `/subjects?subject=${x.s.id}` })),
    });
  }
  if (idle.length) {
    subjects.push({
      text: `No hours in the last 30 days: ${idle
        .slice(0, 4)
        .map((x) => x.s.name)
        .join(", ")}${idle.length > 4 ? ` and ${idle.length - 4} more` : ""}.`,
      evidence: idle.slice(0, 4).map((x) => ({ text: `${x.s.name}: last studied ${r.lastStudied.get(x.s.id) ? formatDate(r.lastStudied.get(x.s.id) as ISODate) : "never"}`, href: `/subjects?subject=${x.s.id}` })),
      tone: "bad",
    });
  }
  if (subjects.length) sections.push({ area: "study", title: "Subjects", findings: subjects });

  // Revision
  let passes7 = 0;
  for (const [d, list] of r.ctx.index) if (d >= from7 && d <= today) passes7 += list.filter((e) => e.kind === "revisionPass").length;
  const due = data.revisions.filter((x) => x.nextDue <= today).length;
  const overdue = data.revisions.filter((x) => x.nextDue < today).length;
  sections.push({
    area: "revision",
    title: "Revision",
    findings: [
      {
        text: `${plural(passes7, "revision pass", "revision passes")} in the last 7 days. ${due ? `${plural(due, "topic")} due now${overdue ? `, ${overdue} of them overdue` : ""}.` : "Nothing is due."}`,
        evidence: [{ text: `Revision queue and journal, ${span(from7, today)}`, from: from7, to: today, href: "/revision" }],
        tone: overdue > 5 ? "bad" : passes7 >= 7 ? "good" : undefined,
      },
    ],
  });

  // Mocks
  const mocks = [...data.mocks].filter((m) => m.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (mocks.length) {
    const pct = (m: (typeof mocks)[number]) => (m.max > 0 ? Math.round((m.score / m.max) * 100) : 0);
    const recent = mocks.slice(-3);
    const before = mocks.slice(-6, -3);
    const avg = (xs: typeof mocks) => (xs.length ? Math.round(xs.reduce((s, m) => s + pct(m), 0) / xs.length) : null);
    const a = avg(recent);
    const b = avg(before);
    sections.push({
      area: "mocks",
      title: "Mocks",
      findings: [
        {
          text: `Last ${plural(recent.length, "mock")} averaged ${a}%${b !== null ? `, against ${b}% for the ${before.length} before` : ""}.`,
          evidence: recent.map((m) => ({ text: `${m.name}: ${pct(m)}% on ${formatDate(m.date)}`, href: "/mocks" })),
          tone: a !== null && b !== null ? (a > b ? "good" : a < b ? "bad" : undefined) : undefined,
        },
      ],
    });
  }

  // Habits
  const rows = data.habits
    .filter((x) => isActiveHabit(x) && habitStart(x) <= today)
    .map((x) => ({ x, c: habitConsistency(x, r.ctx, from30, today), s: habitStreaks(x, r.ctx) }))
    .filter((row) => row.c.due > 0 && row.c.rate !== null);
  if (rows.length) {
    const due30 = rows.reduce((n, row) => n + row.c.due, 0);
    const kept30 = rows.reduce((n, row) => n + row.c.kept, 0);
    const best = [...rows].sort((p, q) => (q.c.rate ?? 0) - (p.c.rate ?? 0))[0];
    const worst = [...rows].sort((p, q) => (p.c.rate ?? 0) - (q.c.rate ?? 0))[0];
    const findings: Finding[] = [
      {
        text: `Habits kept on ${kept30} of ${due30} due days in the last 30 days (${Math.round((kept30 / due30) * 100)}%).`,
        evidence: [{ text: `Habit Engine, ${span(from30, today)}`, from: from30, to: today, href: "/habits" }],
        tone: kept30 / due30 >= 0.8 ? "good" : kept30 / due30 < 0.5 ? "bad" : undefined,
      },
    ];
    if (rows.length > 1 && best.x.id !== worst.x.id)
      findings.push({
        text: `Strongest: “${best.x.name}” (${Math.round((best.c.rate ?? 0) * 100)}%). Weakest: “${worst.x.name}” (${Math.round((worst.c.rate ?? 0) * 100)}%).`,
        evidence: [
          { text: `${best.x.name}: ${best.c.kept} of ${best.c.due}`, href: `/habits?habit=${best.x.id}` },
          { text: `${worst.x.name}: ${worst.c.kept} of ${worst.c.due}`, href: `/habits?habit=${worst.x.id}` },
        ],
      });
    sections.push({ area: "habits", title: "Habits", findings });
  }

  // Plan
  const plan = r.thisWeek.plan;
  if (plan) {
    const c = ownCounts(data.plans, plan, today);
    sections.push({
      area: "plan",
      title: "This week's plan",
      findings: [
        {
          text: `${c.completed} of ${c.total} planned activities done${c.overdue ? `, ${c.overdue} past their date` : ""}${c.deferred ? `, ${c.deferred} deferred` : ""}.`,
          evidence: [{ text: `Roadmap, ${span(plan.start, plan.end)}`, from: plan.start, to: plan.end, href: `/roadmap?plan=${plan.id}` }],
          tone: c.overdue > 2 ? "bad" : undefined,
        },
      ],
    });
  }

  // Life
  const nights = data.lifeLog
    .filter((e) => e.date >= from7 && e.date <= today)
    .map((e) => countedSleepHours(e))
    .filter((x): x is number => x !== undefined);
  if (nights.length) {
    const mean = round(nights.reduce((a, b) => a + b, 0) / nights.length, 1);
    sections.push({
      area: "life",
      title: "Sleep",
      findings: [
        {
          text: `${h(mean)} a night over ${plural(nights.length, "night")} recorded in the last 7 days.`,
          evidence: [{ text: `Life Dashboard, ${span(from7, today)}`, from: from7, to: today, href: "/wellbeing/sleep" }],
          tone: mean < 6.5 ? "bad" : mean >= 7 ? "good" : undefined,
        },
      ],
    });
  }

  return sections;
}

/* ── Planned changes ─────────────────────────────────────────── */

/** The lines a confirmation shows, and that the history keeps. */
export function changeLines(changes: ProposedChange[] | undefined): string[] {
  return (changes ?? []).map((c) => c.text);
}
