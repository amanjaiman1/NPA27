#!/usr/bin/env -S npx tsx
/**
 * Product screenshots for the public site, taken from the real app running a
 * sample account. Every name and number in them is made up here; no real
 * person's data is ever used.
 *
 *     npm run test:e2e                      # once: builds the app against the mock Supabase
 *     npx tsx scripts/seo-screenshots.ts    # writes public/product/*.webp
 *
 * The sample account is built from the same seed the app gives a new account,
 * then restored through Settings → Data, exactly as a user would restore a
 * backup. Dates are relative to the day the script runs, so the screenshots
 * always look current. Re-run after any visible change to these pages.
 */

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { buildBooks, buildHabits, buildSelection, buildSyllabus, buildTopicLinks } from "../src/lib/seed";
import { sleepDayKey, toISODate } from "../src/lib/utils";
import { SR_INTERVALS } from "../src/lib/revision";
import type {
  Book,
  ChronicleData,
  CurrentAffair,
  Goal,
  JournalEntry,
  LifeEntry,
  Milestone,
  Mistake,
  MistakeCategory,
  MockSection,
  MockTest,
  Reflection,
  Review,
  RevisionItem,
  TopicStatus,
} from "../src/lib/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "product");
const APP = "http://localhost:3100";
const PASSWORD = "sampleAccount2027";

/* ── deterministic randomness, so re-runs give the same pictures ── */

let seed = 20270523;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const half = (n: number) => Math.round(n * 2) / 2;

const today = new Date();
today.setHours(12, 0, 0, 0);
const daysAgo = (n: number): string => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return toISODate(d);
};

/* ── the sample account ──────────────────────────────────────── */

const START = 150;

function sampleData(): ChronicleData & Record<string, unknown> {
  const subjects = buildSyllabus("Sociology");
  const progress: Record<string, TopicStatus[]> = {
    polity: ["mastered", "mastered", "revised", "mastered", "revised", "revised", "learning", "revised", "learning"],
    economy: ["revised", "revised", "learning", "revised", "learning", "learning", "untouched", "learning"],
    geography: ["revised", "learning", "untouched", "revised", "learning", "learning", "untouched"],
    "modern-history": ["revised", "revised", "revised", "mastered", "revised", "learning", "learning", "untouched"],
    environment: ["learning", "revised", "learning", "untouched", "learning", "untouched", "untouched"],
    ethics: ["learning", "learning", "untouched", "untouched", "untouched", "learning", "untouched", "untouched"],
    sociology: ["revised", "learning", "learning", "learning", "untouched", "learning", "untouched"],
    csat: ["revised", "learning", "revised", "learning", "untouched"],
    "current-affairs": ["learning", "learning", "revised", "learning", "learning", "untouched"],
    "art-culture": ["learning", "untouched", "untouched", "untouched", "learning", "untouched", "untouched"],
    ir: ["learning", "learning", "untouched", "untouched", "learning", "untouched"],
    society: ["learning", "untouched", "learning", "untouched", "untouched", "untouched"],
    "social-justice": ["learning", "untouched", "untouched", "learning", "untouched", "untouched"],
    "sci-tech": ["untouched", "untouched", "untouched", "untouched", "untouched", "learning"],
    essay: ["learning", "untouched", "untouched", "learning", "untouched", "learning"],
  };
  for (const s of subjects) {
    const plan = progress[s.id] ?? [];
    s.topics = s.topics.map((t, i) => {
      const status = plan[i] ?? "untouched";
      if (status === "untouched") return t;
      const confidence =
        status === "mastered" ? int(82, 95) : status === "revised" ? int(58, 76) : int(28, 50);
      const revisionCount = status === "mastered" ? int(4, 5) : status === "revised" ? int(2, 3) : int(0, 1);
      return { ...t, status, confidence, revisionCount, lastTouched: daysAgo(int(1, 50)) };
    });
  }
  const studied = subjects.flatMap((s) => s.topics.filter((t) => t.status !== "untouched").map((t) => ({ s, t })));

  /* journal */
  const pool = ["polity", "polity", "economy", "economy", "geography", "modern-history", "environment", "sociology", "sociology", "csat", "current-affairs", "ethics", "ir"];
  const highlights = [
    "Finished Parliament and its committees, with notes",
    "Two hours of answer writing, slow but better structured",
    "Revised Fundamental Rights from my own notes",
    "Mock review took longer than the mock, worth it",
    "Economy: inflation and monetary policy finally clicked",
    "Sociology thinkers, Durkheim and Weber compared",
    "Short day, but the revision queue is clear",
    "Mapped the monsoon chapter onto PYQ themes",
    "CSAT practice: comprehension accuracy up",
    "Environment: protected areas and conventions",
    "Ethics case study practice with a timer",
    "Newspaper plus two editorials summarised",
  ];
  const mockDays = new Map<number, string>();
  const journal: JournalEntry[] = [];
  const accomplished: string[] = [];
  for (let i = 120; i >= 0; i--) {
    if (i > 0 && rand() < 0.1) continue;
    const date = daysAgo(i);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const ramp = 5 + ((120 - i) / 120) * 2.6;
    const hours = i === 0 ? 3.5 : Math.max(2.5, Math.min(10, half(ramp + between(-1.2, 1.3) - (weekday === 0 ? 1.5 : 0))));
    const subjectsToday = [...new Set(Array.from({ length: int(2, 4) }, () => pick(pool)))];
    let left = hours;
    const blocks = subjectsToday.map((id, k) => {
      const share = k === subjectsToday.length - 1 ? left : Math.max(0.5, half(hours / subjectsToday.length + between(-0.5, 0.5)));
      left = Math.max(0, left - share);
      const subject = subjects.find((s) => s.id === id)!;
      return { subjectId: id, hours: share, topics: [pick(subject.topics).name] };
    }).filter((b) => b.hours > 0);
    const total = blocks.reduce((a, b) => a + b.hours, 0);
    const good = total >= 7;
    const entry: JournalEntry = {
      id: `j-${date}`,
      date,
      wakeTime: `0${int(5, 6)}:${pick(["10", "20", "30", "45"])}`,
      sleepTime: `${pick(["22", "23"])}:${pick(["15", "30", "45"])}`,
      blocks,
      totalHours: total,
      topicsCompleted: rand() < 0.35 ? [pick(studied).t.name] : [],
      booksStudied: [],
      revisionSessions:
        rand() < 0.55
          ? Array.from({ length: int(1, 2) }, () => {
              const { s, t } = pick(studied);
              return { subjectId: s.id, topic: t.name, minutes: pick([20, 30, 40]) };
            })
          : [],
      mocksAttempted: [],
      currentAffairs: [],
      mood: Math.min(5, Math.max(2, Math.round(between(2.6, 4.4) + (good ? 0.5 : -0.3)))),
      energy: int(2, 5),
      motivation: Math.min(5, int(3, 5)),
      focus: Math.min(5, Math.max(2, Math.round(between(2.5, 4.5) + (good ? 0.4 : 0)))),
      wins: rand() < 0.4 ? [pick(["Hit the daily target", "Cleared every revision due", "First answer under 7 minutes", "No phone until noon"])] : [],
      failures: rand() < 0.25 ? [pick(["Lost an hour to scrolling", "Skipped answer writing", "Slept late"])] : [],
      lessons: rand() < 0.3 ? [pick(["Revise before starting new topics", "Short breaks keep the afternoon alive", "Write the answer outline first"])] : [],
      highlights: pick(highlights),
      reflection: "",
      tags: [],
    };
    journal.push(entry);
    if (good && rand() < 0.45) accomplished.push(date);
  }

  /* mocks */
  const mocks: MockTest[] = [];
  const gsSections: [string, number][] = [["Polity", 15], ["Modern History", 12], ["Geography", 14], ["Economy", 14], ["Environment", 15], ["Science & Tech", 12], ["Current Affairs", 18]];
  const gsDays = [96, 86, 76, 66, 56, 46, 36, 26, 16, 6];
  gsDays.forEach((d, n) => {
    const accuracy = 0.55 + (n / (gsDays.length - 1)) * 0.13 + between(-0.03, 0.03);
    const attemptRate = 0.78 + (n / (gsDays.length - 1)) * 0.1;
    const sections: MockSection[] = gsSections.map(([name, q]) => {
      const strong = name === "Polity" ? 0.12 : name === "Science & Tech" ? -0.1 : name === "Current Affairs" ? -0.05 : 0;
      const attempted = Math.min(q, Math.round(q * (attemptRate + between(-0.08, 0.06))));
      const correct = Math.min(attempted, Math.round(attempted * Math.min(0.92, accuracy + strong + between(-0.06, 0.06))));
      const wrong = attempted - correct;
      return { name, questions: q, attempted, correct, wrong, score: Math.round((correct * 2 - wrong * 0.66) * 10) / 10, max: q * 2, timeSpent: Math.round(q * between(1.05, 1.25)) };
    });
    const attempted = sections.reduce((a, s) => a + s.attempted, 0);
    const correct = sections.reduce((a, s) => a + s.correct, 0);
    const wrong = attempted - correct;
    const score = Math.round((correct * 2 - wrong * 0.66) * 10) / 10;
    const date = daysAgo(d);
    mockDays.set(d, `Prelims GS Mock ${String(n + 1).padStart(2, "0")}`);
    mocks.push({
      id: `m-gs-${n + 1}`,
      date,
      name: `Prelims GS Mock ${String(n + 1).padStart(2, "0")}`,
      type: "Prelims GS",
      category: "Prelims",
      provider: "Practice test series",
      score,
      max: 200,
      attempted,
      correct,
      wrong,
      unattempted: 100 - attempted,
      negative: Math.round(wrong * 0.66 * 10) / 10,
      markPerQ: 2,
      negPerWrong: 0.66,
      durationMin: 120,
      timeTakenMin: sections.reduce((a, s) => a + (s.timeSpent ?? 0), 0),
      sections,
      weakAreas: ["Science & Tech", "Current Affairs"],
    });
  });
  const csatSections: [string, number][] = [["Comprehension", 27], ["Quantitative", 26], ["Reasoning", 18], ["Data Interpretation", 9]];
  [80, 50, 20].forEach((d, n) => {
    const sections: MockSection[] = csatSections.map(([name, q]) => {
      const attempted = Math.min(q, Math.round(q * between(0.72, 0.9)));
      const correct = Math.min(attempted, Math.round(attempted * (0.68 + n * 0.04 + between(-0.05, 0.05))));
      const wrong = attempted - correct;
      return { name, questions: q, attempted, correct, wrong, score: Math.round((correct * 2.5 - wrong * 0.83) * 10) / 10, max: q * 2.5, timeSpent: Math.round(q * between(1.3, 1.6)) };
    });
    const attempted = sections.reduce((a, s) => a + s.attempted, 0);
    const correct = sections.reduce((a, s) => a + s.correct, 0);
    const wrong = attempted - correct;
    mocks.push({
      id: `m-csat-${n + 1}`,
      date: daysAgo(d),
      name: `CSAT Mock ${String(n + 1).padStart(2, "0")}`,
      type: "Prelims CSAT",
      category: "Prelims",
      provider: "Practice test series",
      score: Math.round((correct * 2.5 - wrong * 0.83) * 10) / 10,
      max: 200,
      attempted,
      correct,
      wrong,
      unattempted: 80 - attempted,
      negative: Math.round(wrong * 0.83 * 10) / 10,
      markPerQ: 2.5,
      negPerWrong: 0.83,
      durationMin: 120,
      timeTakenMin: sections.reduce((a, s) => a + (s.timeSpent ?? 0), 0),
      sections,
    });
  });
  [58, 28].forEach((d, n) => {
    const score = n === 0 ? 88 : 101;
    mocks.push({
      id: `m-mains-${n + 1}`,
      date: daysAgo(d),
      name: `GS Paper II answer-writing test ${n + 1}`,
      type: "Mains GS",
      category: "Mains",
      provider: "Practice test series",
      score,
      max: 250,
      durationMin: 180,
      timeTakenMin: 180,
      sections: [{ name: "GS Paper II", attempted: 0, correct: 0, wrong: 0, score, max: 250, timeSpent: 180 }],
    });
  });
  for (const e of journal) {
    const d = Math.round((today.getTime() - new Date(`${e.date}T12:00:00`).getTime()) / 86_400_000);
    const name = mockDays.get(d);
    if (name) e.mocksAttempted = [{ name }];
  }

  /* revisions: some overdue, some due today, most ahead */
  const offsets = [-3, -2, -1, 0, 0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 8, 9, 11, 13, 15, 18, 21, 25, 29, 34, 40];
  const revisions: RevisionItem[] = offsets.map((off, i) => {
    const { s, t } = studied[(i * 7) % studied.length];
    const repetitions = t.status === "mastered" ? int(3, 5) : t.status === "revised" ? int(1, 3) : int(0, 1);
    const intervalDays = SR_INTERVALS[Math.min(repetitions, SR_INTERVALS.length - 1)];
    return {
      id: `r-${i}`,
      subjectId: s.id,
      topic: t.name,
      addedOn: daysAgo(intervalDays - off + int(5, 30)),
      lastRevised: daysAgo(intervalDays - off),
      nextDue: daysAgo(-off),
      intervalDays,
      repetitions,
      confidence: Math.min(5, Math.max(1, repetitions + int(1, 2))),
    };
  });

  /* mistakes: correct facts only — they appear in screenshots */
  const mistakeDefs: [string, string, MistakeCategory, string, string][] = [
    ["polity", "Constitutional Bodies", "Factual", "Tenure of the Comptroller and Auditor General", "Six years, or until the age of 65, whichever is earlier."],
    ["polity", "Fundamental Rights", "Conceptual", "Rights that cannot be suspended during an Emergency", "Articles 20 and 21 (after the 44th Amendment)."],
    ["economy", "Money & Banking", "Conceptual", "What a cut in the repo rate does", "Banks borrow from the RBI more cheaply, which tends to lower lending rates."],
    ["geography", "Climatology", "Factual", "Coriolis deflection in the southern hemisphere", "To the left of the direction of motion."],
    ["environment", "Agreements", "Factual", "Year the Kyoto Protocol was adopted", "1997."],
    ["modern-history", "Gandhian Era", "Factual", "Year of the Champaran Satyagraha", "1917."],
    ["csat", "Quantitative Aptitude", "Time Pressure", "Left two percentage questions unattempted", "Do the quick arithmetic questions first, then return."],
    ["environment", "Biodiversity", "Guessing", "Biodiversity hotspots with parts in India", "Four: the Himalaya, Indo-Burma, the Western Ghats and Sri Lanka, and Sundaland."],
    ["economy", "Inflation", "Careless", "Marked the statement about WPI as CPI", "Read each statement to the end before marking."],
    ["polity", "Parliament", "Revision Failure", "Quorum of the Lok Sabha", "One-tenth of the total membership of the House."],
    ["sociology", "Sociological Thinkers", "Conceptual", "Weber's ideal type", "An analytical construct for comparison, not an average or a moral ideal."],
    ["geography", "Indian Physiography", "Factual", "Highest peak of the Western Ghats", "Anamudi."],
  ];
  const mistakes: Mistake[] = [];
  mistakeDefs.forEach(([subjectId, topic, category, question, correctAnswer], i) => {
    for (const copy of [0, 1]) {
      if (copy === 1 && i % 3 !== 0) continue;
      const reviewCount = (i + copy) % 4;
      const status = reviewCount >= 3 ? "Mastered" : reviewCount === 0 ? "Open" : "Reviewing";
      mistakes.push({
        id: `x-${i}-${copy}`,
        date: daysAgo(int(3, 80)),
        subjectId,
        topic,
        category,
        question,
        correctAnswer,
        source: pick(["Prelims GS Mock", "Sectional test", "PYQ practice"]),
        status,
        reviewCount,
        lastReviewed: reviewCount ? daysAgo(int(1, 6)) : undefined,
        nextReview: daysAgo(-pick([0, 0, 1, 2, 4, 7])),
        intervalDays: [1, 3, 7, 16][reviewCount] ?? 35,
      });
    }
  });

  /* habits */
  const habits = buildHabits(["news", "answer", "revise", "wake"], daysAgo(START));
  const habitOdds: Record<string, number> = { news: 0.85, answer: 0.55, revise: 0.72, wake: 0.66 };
  for (const h of habits) {
    for (let i = 100; i >= 0; i--) if (rand() < habitOdds[h.id]) h.log[daysAgo(i)] = true;
  }

  /* life dashboard */
  const lifeLog: LifeEntry[] = [];
  for (let i = 100; i >= 0; i--) {
    const date = daysAgo(i);
    const study = journal.find((e) => e.date === date)?.totalHours ?? 0;
    const sleepHours = Math.round(between(6, 8.1) * 10) / 10;
    lifeLog.push({
      id: `l-${date}`,
      date,
      sleepHours,
      sleepQuality: Math.min(5, Math.max(2, Math.round(sleepHours - 3 + between(-0.6, 0.6)))),
      walkKm: Math.round(between(1, 4.5) * 10) / 10,
      runKm: rand() < 0.35 ? Math.round(between(3, 6) * 10) / 10 : 0,
      exerciseMinutes: int(15, 55),
      exerciseType: pick(["Walk", "Run", "Yoga"]),
      waterLiters: Math.round(between(2, 3.4) * 10) / 10,
      meditationMin: pick([0, 0, 5, 10, 10, 15]),
      weightKg: Math.round((68.6 - ((100 - i) / 100) * 1.3 + between(-0.3, 0.3)) * 10) / 10,
      screenTimeMin: int(70, 190),
      deepWorkHours: Math.round(study * between(0.55, 0.75) * 10) / 10,
    });
  }

  /* goals, books, reviews, reflections, current affairs, milestones */
  const goals: Goal[] = [
    { id: "g1", title: "Study 50 hours this week", horizon: "Weekly", metric: "studyHours", target: 50, unit: "h", status: "Active", createdOn: daysAgo(20) },
    { id: "g2", title: "Take four Prelims mocks this month", horizon: "Monthly", metric: "mocksTaken", target: 4, unit: "mocks", status: "Active", createdOn: daysAgo(15) },
    { id: "g3", title: "Bring Polity to 80% mastery", horizon: "Quarterly", metric: "subjectMastery", linkedSubjectId: "polity", target: 80, unit: "%", deadline: daysAgo(-45), status: "Active", createdOn: daysAgo(40) },
    { id: "g4", title: "Finish three standard books", horizon: "Long-term", metric: "booksCompleted", target: 3, unit: "books", deadline: daysAgo(-120), status: "Active", createdOn: daysAgo(100) },
    { id: "g5", title: "Sixty revision passes this month", horizon: "Monthly", metric: "revisionPasses", target: 60, unit: "passes", status: "Active", createdOn: daysAgo(10) },
  ];
  const books: Book[] = buildBooks("Sociology").map((b, i) => {
    const plan: [Book["status"], number][] = [["Completed", 1], ["Reading", 0.54], ["Reading", 0.7], ["Completed", 1], ["Reading", 0.37], ["To Read", 0], ["To Read", 0], ["Reading", 0.19], ["To Read", 0], ["Reading", 0.39]];
    const [status, share] = plan[i] ?? ["To Read", 0];
    return {
      ...b,
      status,
      currentPage: Math.round(b.totalPages * share),
      startedOn: share > 0 ? daysAgo(int(40, 140)) : undefined,
      finishedOn: status === "Completed" ? daysAgo(int(20, 60)) : undefined,
    };
  });
  const reviews: Review[] = [1, 2].map((w) => {
    const end = daysAgo(7 * (w - 1) + 1);
    const start = daysAgo(7 * (w - 1) + 7);
    return {
      id: `rv-${w}`,
      type: "Weekly",
      periodLabel: `Week ending ${end}`,
      startDate: start,
      endDate: end,
      totalHours: journal.filter((e) => e.date >= start && e.date <= end).reduce((a, e) => a + e.totalHours, 0),
      mocksTaken: 1,
      rating: w === 1 ? 4 : 3,
      wins: ["Revision queue cleared on five days", "Mock accuracy up on the week before"],
      struggles: ["Science & Tech still untouched", "Two late nights"],
      lessons: ["Revision first, new topics after"],
      nextFocus: ["Start Science & Tech basics", "One full CSAT mock"],
    };
  });
  const reflections: Reflection[] = [3, 9, 16, 24, 33].map((d, i) => ({
    id: `rf-${i}`,
    date: daysAgo(d),
    prompt: "What drained you this week, and what gave you energy?",
    content: pick([
      "The mock result stung, but the review showed most marks were lost to careless reading, which is fixable.",
      "A good week. Waking up early made the mornings mine again.",
      "Felt behind on GS3. Writing it down helped: it is two weeks of work, not a crisis.",
    ]),
    mood: int(3, 5),
    gratitude: ["A quiet morning", "Friends who ask how it is going"],
  }));
  const caTitles: [string, CurrentAffair["category"], string][] = [
    ["Monetary policy review: key points", "Economy", "RBI"],
    ["Notes on a new biodiversity report", "Environment", "PIB"],
    ["Bilateral summit: outcomes to remember", "International", "The Hindu"],
    ["A Supreme Court judgment on federalism", "Polity", "Indian Express"],
    ["Union scheme for rural housing: features", "Schemes", "PIB"],
    ["Space mission milestones this month", "Science & Tech", "PIB"],
    ["Index rankings to note for Prelims", "Reports & Indices", "The Hindu"],
    ["Monsoon forecast and its regional pattern", "Geography", "IMD"],
  ];
  const currentAffairs: CurrentAffair[] = caTitles.map(([title, category, source], i) => ({
    id: `ca-${i}`,
    date: daysAgo(i * 3 + 1),
    title,
    source,
    category,
    tags: [category.toLowerCase()],
    summary: "Short notes on what happened and why it matters for the syllabus.",
    prelimsRelevant: i % 2 === 0,
    mainsRelevant: i % 3 !== 1,
    bookmarked: i < 2,
  }));
  const milestones: Milestone[] = [
    { id: "ms-1", date: daysAgo(START), title: "Started preparation", type: "Start" },
    { id: "ms-2", date: daysAgo(96), title: "First full-length Prelims mock", type: "Achievement" },
    { id: "ms-3", date: daysAgo(40), title: "Finished the first reading of Laxmikanth", type: "Achievement" },
  ];

  return {
    profile: {
      name: "Meera",
      targetExam: "UPSC CSE 2027",
      examDate: "2027-05-23",
      attemptNumber: 1,
      optionalSubject: "Sociology",
      startDate: daysAgo(START),
      dailyHourTarget: 8,
      timezone: "Asia/Kolkata",
      onboardedAt: daysAgo(START),
    },
    accomplished,
    subjects,
    journal,
    mocks,
    revisions,
    currentAffairs,
    mistakes,
    habits,
    sleep: [],
    exercise: [],
    lifeLog,
    goals,
    books,
    milestones,
    reflections,
    reviews,
    topicLinks: buildTopicLinks(subjects, daysAgo(START)),
    selection: buildSelection("UPSC CSE 2027"),
    files: [],
    plans: [],
    // The default theme, so the public site shows what a new account sees.
    themeMode: "lavender",
    lastSleepPrompt: sleepDayKey(new Date()),
  };
}

/* ── servers ─────────────────────────────────────────────────── */

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };
const children: ChildProcess[] = [];
function start(cmd: string, args: string[], ready: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let out = "";
    const onData = (d: Buffer) => {
      out += d;
      if (out.includes(ready)) resolve();
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => reject(new Error(`${cmd} exited (${code}):\n${out.slice(-1500)}`)));
  });
}

/* ── capture ─────────────────────────────────────────────────── */

/** PNG → WebP, encoded by the browser itself (no image library needed). */
async function toWebp(browser: Browser, png: Buffer, quality = 0.84): Promise<Buffer> {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ b64, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", q);
    },
    { b64: png.toString("base64"), q: quality },
  );
  await page.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** The morning check-in comes before the app; the sample account skips it. */
async function passSleepPromptIfShown(page: Page) {
  const prompt = page.getByTestId("sleep-prompt");
  try {
    await prompt.waitFor({ timeout: 5000 });
  } catch {
    return;
  }
  await prompt.getByRole("button", { name: "Skip for today" }).click();
  await prompt.waitFor({ state: "detached" });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1600); // entry animations and charts
}

const written: string[] = [];
async function shoot(browser: Browser, page: Page, name: string, path: string, before?: (p: Page) => Promise<void>) {
  await page.goto(`${APP}${path}`);
  await settle(page);
  if (before) await before(page);
  const png = await page.screenshot({ type: "png" });
  const webp = await toWebp(browser, png);
  writeFileSync(join(OUT, `${name}.webp`), webp);
  const { width, height } = page.viewportSize()!;
  written.push(`${name}.webp  ${Math.round(webp.length / 1024)} KB  (${width}×${height} css px)`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const backupFile = join(root, ".next", "sample-account.json");
  writeFileSync(backupFile, JSON.stringify({ app: "the-upsc-chronicle", schemaVersion: 14, data: sampleData() }));

  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
    await context.addInitScript(() => localStorage.setItem("upsc-chronicle-install-dismissed", String(Date.now())));
    const page = await context.newPage();

    // A fresh sample account, set up with the template, then the sample data restored over it.
    await page.goto(`${APP}/signup`);
    await page.getByLabel("Your name").fill("Meera");
    await page.getByLabel("Email").fill("sample.account@example.com");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Welcome. Let's make this yours.").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Which attempt are you preparing for?").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Start my chronicle" }).click();
    await passSleepPromptIfShown(page);
    await page.goto(`${APP}/settings#data`);
    await passSleepPromptIfShown(page);
    await page.locator('input[type="file"]').setInputFiles(backupFile);
    await page.getByRole("button", { name: "Restore backup" }).click();
    await page.getByText("Backup restored.").waitFor();
    await page.waitForTimeout(3000);

    await shoot(browser, page, "dashboard", "/dashboard");
    await shoot(browser, page, "subjects", "/subjects");
    await shoot(browser, page, "journal", "/journal");
    await shoot(browser, page, "journal-entry", "/journal?new=1");
    await shoot(browser, page, "revision", "/revision");
    await shoot(browser, page, "heatmap", "/heatmap");
    await shoot(browser, page, "mocks", "/mocks");
    await shoot(browser, page, "mistakes", "/mistakes");
    await shoot(browser, page, "goals", "/goals");
    await shoot(browser, page, "coach", "/coach");
    await shoot(browser, page, "reviews", "/reviews");
    await shoot(browser, page, "wellbeing", "/wellbeing");

    // One phone-sized view of the dashboard.
    await page.setViewportSize({ width: 390, height: 844 });
    await shoot(browser, page, "dashboard-mobile", "/dashboard");
    await shoot(browser, page, "journal-entry-mobile", "/journal?new=1");
  } finally {
    await browser.close();
    children.forEach((c) => c.kill("SIGTERM"));
  }
  console.log(`Wrote to public/product:\n  ${written.join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  children.forEach((c) => c.kill("SIGTERM"));
  process.exit(1);
});
