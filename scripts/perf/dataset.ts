/* ════════════════════════════════════════════════════════════════
   MADE-UP ACCOUNTS FOR PERFORMANCE MEASUREMENT
   Two deterministic accounts for scripts/perf/measure.mjs:

   - typical: the interactive demo's sample (about five months of use).
   - heavy:   the same person two years in, logging every day: about two
              years of journal days, nights, revision passes, diary
              entries, Roadmap plans and reviews. It is what the app has
              to stay fast for as history piles up.

   Every name, number and note is invented here. Nothing comes from any
   real account, and nothing here is used by the app itself.
   ════════════════════════════════════════════════════════════════ */

import { buildSampleChronicle, type SampleChronicle } from "../../src/lib/demo/sample-chronicle";
import { toISODate } from "../../src/lib/utils";
import type {
  CoachDecision,
  JournalEntry,
  LifeEntry,
  Mistake,
  MockTest,
  PlanItem,
  Reflection,
  Review,
  RevisionItem,
  RoadmapPlan,
} from "../../src/lib/types";

export type DatasetName = "typical" | "heavy";

function random(seed: number) {
  let s = seed;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  return { rand, int, pick };
}

const WORDS =
  "today the revision went better than expected because the notes were short and the questions came back quickly but the afternoon slipped into scrolling and the evening mock review took longer than planned which is fine since every mistake was written down with the reason and a page number to check tomorrow morning before starting the next topic in polity or economy".split(
    " ",
  );

function prose(r: ReturnType<typeof random>, words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(r.pick(WORDS));
  const text = out.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

export function buildDataset(name: DatasetName, now: Date = new Date()): SampleChronicle {
  const base = buildSampleChronicle(now);
  if (name === "typical") return base;

  const r = random(730);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return toISODate(d);
  };
  const SPAN = 730;
  const subjects = base.subjects;
  const studied = subjects.flatMap((s) => s.topics.map((t) => ({ s, t })));

  /* journal: every day for two years, with the sample's recent days kept */
  const have = new Set(base.journal.map((e) => e.date));
  const journal: JournalEntry[] = [...base.journal];
  for (let i = SPAN; i > 0; i--) {
    const date = daysAgo(i);
    if (have.has(date)) continue;
    const blocks = Array.from({ length: r.int(2, 4) }, () => {
      const { s, t } = r.pick(studied);
      return { subjectId: s.id, hours: r.int(1, 6) / 2, topics: [t.name] };
    });
    journal.push({
      id: `j-${date}`,
      date,
      wakeTime: `0${r.int(5, 7)}:${r.pick(["00", "15", "30", "45"])}`,
      sleepTime: `${r.pick(["22", "23"])}:${r.pick(["00", "30"])}`,
      blocks,
      totalHours: blocks.reduce((a, b) => a + b.hours, 0),
      completedTopics: r.rand() < 0.4 ? [{ id: `tc-${date}`, name: r.pick(studied).t.name }] : [],
      booksStudied: r.rand() < 0.3 ? [{ title: "Indian Polity", fromPage: r.int(1, 300), toPage: r.int(301, 600) }] : [],
      revisionSessions: Array.from({ length: r.int(0, 3) }, () => {
        const { s, t } = r.pick(studied);
        return { subjectId: s.id, topic: t.name, minutes: r.pick([20, 30, 45]) };
      }),
      mocksAttempted: [],
      currentAffairs: r.rand() < 0.5 ? [{ title: "Editorial on fiscal federalism", source: "The Hindu" }] : [],
      mood: r.int(2, 5),
      energy: r.int(2, 5),
      motivation: r.int(2, 5),
      focus: r.int(2, 5),
      wins: r.rand() < 0.5 ? [prose(r, 8)] : [],
      failures: r.rand() < 0.3 ? [prose(r, 7)] : [],
      lessons: r.rand() < 0.4 ? [prose(r, 9)] : [],
      highlights: prose(r, 10),
      reflection: prose(r, r.int(15, 45)),
      tags: r.rand() < 0.3 ? [r.pick(["mock", "revision", "answer-writing", "slow-day"])] : [],
    });
  }
  journal.sort((a, b) => a.date.localeCompare(b.date));

  /* nights and readings for every day */
  const haveLife = new Set(base.lifeLog.map((l) => l.date));
  const lifeLog: LifeEntry[] = [...base.lifeLog];
  for (let i = SPAN; i > 0; i--) {
    const date = daysAgo(i);
    if (haveLife.has(date)) continue;
    lifeLog.push({
      id: `life-${date}`,
      date,
      bedtime: `${r.pick(["22", "23"])}:${r.pick(["00", "15", "30", "45"])}`,
      wakeTime: `0${r.int(5, 7)}:${r.pick(["00", "15", "30"])}`,
      sleepHours: r.int(55, 85) / 10,
      sleepQuality: r.int(2, 5),
      exerciseMinutes: r.int(0, 60),
      walkKm: r.int(5, 50) / 10,
      waterLiters: r.int(15, 35) / 10,
      screenTimeMin: r.int(60, 240),
      weightKg: 68 + r.int(-20, 20) / 10,
      deepWorkHours: r.int(10, 60) / 10,
    });
  }
  lifeLog.sort((a, b) => a.date.localeCompare(b.date));

  /* a long revision queue, each item with its pass history */
  const revisions: RevisionItem[] = [...base.revisions];
  for (let i = 0; i < 220; i++) {
    const { s, t } = studied[(i * 11) % studied.length];
    const passes = Array.from({ length: r.int(1, 12) }, () => daysAgo(r.int(2, SPAN))).sort();
    const unique = [...new Set(passes)];
    revisions.push({
      id: `rh-${i}`,
      subjectId: s.id,
      topic: `${t.name} (${i})`,
      addedOn: unique[0] ?? daysAgo(SPAN),
      lastRevised: unique[unique.length - 1],
      nextDue: daysAgo(r.int(-40, 5)),
      intervalDays: r.pick([1, 3, 7, 14, 30, 60]),
      repetitions: unique.length,
      confidence: r.int(1, 5),
      passes: unique,
    });
  }

  /* mocks every fortnight */
  const mocks: MockTest[] = [...base.mocks];
  for (let i = 0; i < 48; i++) {
    const sections = ["Polity", "History", "Geography", "Economy", "Environment", "Science & Tech", "Current Affairs"].map((n) => {
      const attempted = r.int(9, 15);
      const correct = r.int(5, attempted);
      return { name: n, questions: 15, attempted, correct, wrong: attempted - correct, score: correct * 2 - (attempted - correct) * 0.66, max: 30, timeSpent: r.int(12, 20) };
    });
    mocks.push({
      id: `mh-${i}`,
      date: daysAgo(160 + i * 12),
      name: `Archive mock ${i + 1}`,
      type: "Prelims GS",
      category: "Prelims",
      score: Math.round(sections.reduce((a, s) => a + s.score, 0)),
      max: 200,
      attempted: sections.reduce((a, s) => a + s.attempted, 0),
      correct: sections.reduce((a, s) => a + s.correct, 0),
      wrong: sections.reduce((a, s) => a + s.wrong, 0),
      sections,
      notes: prose(r, 30),
    });
  }
  mocks.sort((a, b) => a.date.localeCompare(b.date));

  /* a long mistake notebook */
  const mistakes: Mistake[] = [...base.mistakes];
  for (let i = 0; i < 160; i++) {
    const { s, t } = r.pick(studied);
    mistakes.push({
      id: `xh-${i}`,
      date: daysAgo(r.int(1, SPAN)),
      subjectId: s.id,
      topic: t.name,
      category: r.pick(["Conceptual", "Factual", "Guessing", "Revision Failure", "Time Pressure", "Careless"] as const),
      question: prose(r, 14),
      userAnswer: prose(r, 6),
      correctAnswer: prose(r, 8),
      explanation: prose(r, 30),
      status: r.pick(["Open", "Reviewing", "Mastered"] as const),
      reviewCount: r.int(0, 3),
      nextReview: daysAgo(r.int(-20, 10)),
      intervalDays: r.pick([1, 3, 7, 16, 35]),
    });
  }

  /* two years of diary entries */
  const reflections: Reflection[] = [...base.reflections];
  for (let i = 0; i < 200; i++) {
    const date = daysAgo(SPAN - i * 3);
    reflections.push({
      id: `dh-${i}`,
      date,
      title: prose(r, 5).replace(/\.$/, ""),
      content: `## ${prose(r, 4)}\n\n${prose(r, r.int(80, 170))}\n\n- ${prose(r, 8)}\n- ${prose(r, 8)}`,
      tags: r.rand() < 0.5 ? [r.pick(["mock", "family", "health", "plan"])] : [],
      category: r.pick(["Reflection", "Gratitude", "Planning", "Free writing"]),
      createdAt: `${date}T21:00:00.000Z`,
      updatedAt: `${date}T21:05:00.000Z`,
    });
  }

  /* weekly and monthly reviews */
  const reviews: Review[] = [...base.reviews];
  for (let i = 3; i < 100; i++) {
    const end = daysAgo(7 * (i - 1) + 1);
    const start = daysAgo(7 * (i - 1) + 7);
    reviews.push({
      id: `rvh-${i}`,
      type: "Weekly",
      periodLabel: `Week ending ${end}`,
      startDate: start,
      endDate: end,
      status: "completed",
      rating: r.int(2, 5),
      answers: { wentWell: prose(r, 40), struggled: prose(r, 30), change: prose(r, 25), priorities: prose(r, 20) },
      createdAt: `${end}T20:00:00.000Z`,
      updatedAt: `${end}T20:30:00.000Z`,
      completedAt: `${end}T20:30:00.000Z`,
    });
  }

  /* a heavily used Roadmap: months and weeks for two years */
  const plans: RoadmapPlan[] = [...base.plans];
  const stamp = (d: string) => `${d}T09:00:00.000Z`;
  for (let m = 1; m <= 24; m++) {
    const first = new Date(today.getFullYear(), today.getMonth() - m, 1, 12);
    const last = new Date(today.getFullYear(), today.getMonth() - m + 1, 0, 12);
    const start = toISODate(first);
    const end = toISODate(last);
    const monthId = `mh-${m}`;
    plans.push({
      id: monthId,
      level: "month",
      start,
      end,
      focus: prose(r, 10),
      objectives: [prose(r, 6), prose(r, 6), prose(r, 6)],
      items: Array.from({ length: 4 }, (_, k): PlanItem => ({
        id: `${monthId}-m${k}`,
        kind: "milestone",
        title: prose(r, 6),
        targetDate: end,
        status: r.pick(["completed", "completed", "deferred", "inProgress"] as const),
        createdAt: stamp(start),
      })),
      createdAt: stamp(start),
      updatedAt: stamp(end),
      review: { wentWell: prose(r, 25), improve: prose(r, 20), nextPriorities: prose(r, 15), reviewedAt: stamp(end) },
    });
    for (let w = 0; w < 4; w++) {
      const ws = new Date(first);
      ws.setDate(1 + w * 7);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const wStart = toISODate(ws);
      const weekId = `wh-${m}-${w}`;
      plans.push({
        id: weekId,
        level: "week",
        parentId: monthId,
        start: wStart,
        end: toISODate(we),
        focus: prose(r, 8),
        items: Array.from({ length: 8 }, (_, k): PlanItem => {
          const status = r.pick(["completed", "completed", "completed", "deferred", "notStarted"] as const);
          const target = new Date(ws);
          target.setDate(ws.getDate() + (k % 7));
          const day = toISODate(target);
          return {
            id: `${weekId}-a${k}`,
            kind: "activity",
            title: prose(r, 7),
            description: prose(r, 18),
            priority: r.pick(["High", "Medium", "Low"] as const),
            targetDate: day,
            status,
            subjectId: r.pick(studied).s.id,
            ...(status === "completed" ? { completedAt: `${day}T17:00:00.000Z` } : {}),
            createdAt: stamp(wStart),
          };
        }),
        createdAt: stamp(wStart),
        updatedAt: stamp(toISODate(we)),
      });
    }
  }

  /* the coach's history */
  const decisions: CoachDecision[] = Array.from({ length: 200 }, (_, i) => ({
    id: `cdh-${i}`,
    recId: `neglected:${r.pick(studied).s.id}`,
    status: r.pick(["accepted", "dismissed", "applied", "done"] as const),
    title: prose(r, 6),
    fingerprint: `fp-${i}`,
    at: `${daysAgo(r.int(1, SPAN))}T08:00:00.000Z`,
  }));
  const briefings = Array.from({ length: 60 }, (_, i) => ({
    id: `briefing:${daysAgo(60 - i)}`,
    date: daysAgo(60 - i),
    headlines: [prose(r, 6), prose(r, 6), prose(r, 6)],
  }));

  /* habits checked in for two years */
  const habits = base.habits.map((h) => {
    const log = { ...h.log };
    for (let i = SPAN; i > 100; i--) if (r.rand() < 0.7) log[daysAgo(i)] = true;
    return { ...h, createdOn: daysAgo(SPAN), log };
  });

  return {
    ...base,
    profile: { ...base.profile, startDate: daysAgo(SPAN), onboardedAt: daysAgo(SPAN), tourSeenAt: daysAgo(SPAN) },
    journal,
    lifeLog,
    revisions,
    mocks,
    mistakes,
    reflections,
    reviews,
    plans,
    habits,
    coach: { decisions, briefings },
  };
}

/** Run directly to print each dataset's size. */
if (process.argv[1]?.endsWith("dataset.ts")) {
  for (const n of ["typical", "heavy"] as const) {
    const d = buildDataset(n);
    console.log(n, `${Math.round(JSON.stringify(d).length / 1024)} KB`, `journal ${d.journal.length}`, `plans ${d.plans.length}`, `diary ${d.reflections.length}`);
  }
}
