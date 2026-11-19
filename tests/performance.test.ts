import { test } from "node:test";
import assert from "node:assert/strict";
import type { Habit, JournalEntry, PlanItem, Profile, Review, RoadmapPlan, Subject } from "@/lib/types";
import {
  answersOf,
  customPeriod,
  figuresFor,
  findReview,
  isCompleted,
  legacyListsOf,
  measurePeriod,
  periodLabel,
  previousPeriod,
  recentPeriods,
  reviewMarkdown,
  reviewMatches,
  summarize,
  type PerformanceData,
} from "@/lib/performance";
import { reviewPeriods } from "@/lib/review-builder";

/* Thursday 19 November 2026. */
const TODAY = "2026-11-19";

const profile: Profile = {
  name: "Tester",
  targetExam: "UPSC CSE 2027",
  examDate: "2027-05-23",
  attemptNumber: 1,
  optionalSubject: "",
  startDate: "2026-10-01",
  dailyHourTarget: 6,
};

const subjects: Subject[] = [
  { id: "polity", name: "Polity", paper: "GS2", topics: [{ id: "t1", name: "Parliament", status: "learning", confidence: 40, revisionCount: 1 }] },
  { id: "economy", name: "Economy", paper: "GS3", topics: [{ id: "t2", name: "Inflation", status: "untouched", confidence: 0, revisionCount: 0 }] },
];

const day = (date: string, blocks: [string, number][], over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: blocks.map(([subjectId, hours]) => ({ subjectId, hours })),
  totalHours: blocks.reduce((n, [, h]) => n + h, 0),
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
  ...over,
});

const activity = (id: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id,
  kind: "activity",
  title: `Activity ${id}`,
  status: "notStarted",
  createdAt: "2026-11-16T08:00:00",
  ...over,
});

const week = (id: string, start: string, end: string, items: PlanItem[]): RoadmapPlan => ({
  id,
  level: "week",
  start,
  end,
  items,
  createdAt: `${start}T08:00:00`,
  updatedAt: `${start}T08:00:00`,
});

function records(over: Partial<PerformanceData> = {}): PerformanceData {
  return { journal: [], lifeLog: [], revisions: [], plans: [], subjects, goals: [], habits: [], mocks: [], profile, ...over };
}

const review = (over: Partial<Review> = {}): Review => ({
  id: "rv1",
  type: "Weekly",
  periodLabel: "9–15 Nov",
  startDate: "2026-11-09",
  endDate: "2026-11-15",
  ...over,
});

/* ── periods ─────────────────────────────────────────────────── */

test("review weeks run Monday to Sunday, the same weeks the reminder asks about", () => {
  const weeks = recentPeriods("Weekly", TODAY, 3);
  assert.deepEqual(
    weeks.map((p) => [p.key, p.endDate, p.label]),
    [
      ["Weekly:2026-11-16", "2026-11-22", "16–22 Nov"],
      ["Weekly:2026-11-09", "2026-11-15", "9–15 Nov"],
      ["Weekly:2026-11-02", "2026-11-08", "2–8 Nov"],
    ],
  );
  // Whatever day the Roadmap's weeks start on, a review written here
  // answers the "review not written" reminder for the same week.
  assert.deepEqual(
    weeks.map((p) => p.key),
    reviewPeriods("Weekly", TODAY, 3).map((p) => p.key),
  );
  assert.deepEqual(
    recentPeriods("Monthly", TODAY, 2).map((p) => [p.key, p.endDate, p.label]),
    [
      ["Monthly:2026-11-01", "2026-11-30", "Nov 2026"],
      ["Monthly:2026-10-01", "2026-10-31", "Oct 2026"],
    ],
  );
});

test("the period before is the same kind of period", () => {
  const jan = recentPeriods("Monthly", "2027-01-10", 1)[0];
  assert.deepEqual([previousPeriod(jan).startDate, previousPeriod(jan).endDate], ["2026-12-01", "2026-12-31"]);
  const custom = customPeriod("2026-11-20", "2026-11-11");
  assert.deepEqual([custom.startDate, custom.endDate, custom.key], ["2026-11-11", "2026-11-20", "Custom:2026-11-11:2026-11-20"]);
  const before = previousPeriod(custom);
  assert.deepEqual([before.startDate, before.endDate], ["2026-11-01", "2026-11-10"]);
  assert.equal(periodLabel("Custom", "2026-12-28", "2027-01-03"), "28 Dec 2026 – 3 Jan 2027");
});

test("a review is found for its own period only, and older reviews count as finished", () => {
  const custom = review({ type: "Custom", startDate: "2026-11-01", endDate: "2026-11-10" });
  assert.equal(findReview([custom], customPeriod("2026-11-01", "2026-11-10")), custom);
  assert.equal(findReview([custom], customPeriod("2026-11-01", "2026-11-12")), undefined);
  assert.equal(isCompleted(review()), true);
  assert.equal(isCompleted(review({ status: "draft" })), false);
});

/* ── measuring ───────────────────────────────────────────────── */

test("a running week is measured only up to today", () => {
  const data = records({
    journal: [day("2026-11-16", [["polity", 4], ["economy", 2]]), day("2026-11-18", [["polity", 3]]), day("2026-11-21", [["polity", 9]])],
  });
  const s = measurePeriod(data, recentPeriods("Weekly", TODAY, 1)[0], TODAY, "t");
  assert.equal(s.days, 4);
  assert.equal(s.daysLogged, 2);
  assert.equal(s.studyHours, 9);
  assert.equal(s.hoursTarget, 24);
  assert.equal(s.sessions, 3);
  assert.deepEqual(
    s.subjects.map((x) => [x.id, x.hours, x.share]),
    [
      ["polity", 7, 78],
      ["economy", 2, 22],
    ],
  );
  assert.deepEqual(s.bestDay, { date: "2026-11-16", hours: 6 });
});

test("work carried forward inside the period counts once, where it ended up", () => {
  const last = week("w1", "2026-11-09", "2026-11-15", [
    activity("a1", { status: "completed", completedAt: "2026-11-10T09:00:00" }),
    activity("a2", { status: "deferred", carriedTo: { planId: "w2", itemId: "b1" } }),
    activity("a3", { status: "deferred" }),
  ]);
  const next = week("w2", "2026-11-16", "2026-11-22", [activity("b1", { carriedFrom: { planId: "w1", itemId: "a2" } })]);
  const fortnight = customPeriod("2026-11-09", "2026-11-22");
  const s = measurePeriod(records({ plans: [last, next] }), fortnight, TODAY, "t");
  assert.deepEqual(s.roadmap, { planned: 3, completed: 1, deferred: 1, open: 1 });
  assert.deepEqual(s.unfinished, [{ title: "Activity b1", href: "/roadmap?plan=w2&item=b1" }]);
});

test("habits count only the days they were due", () => {
  const studyHabit: Habit = {
    id: "h1",
    name: "Study",
    cadence: "daily",
    createdOn: "2026-11-01",
    log: {},
    source: "journal",
    metric: "studyHours",
    target: 3,
    countFrom: "2026-11-01",
    schedule: { kind: "weekdays", days: [1, 3] },
  };
  const data = records({ habits: [studyHabit], journal: [day("2026-11-09", [["polity", 4]]), day("2026-11-11", [["polity", 1]])] });
  const s = measurePeriod(data, recentPeriods("Weekly", TODAY, 2)[1], TODAY, "t");
  assert.deepEqual(s.habits, { scheduled: 2, kept: 1, rate: 0.5 });
  assert.deepEqual(s.habitRows, [{ id: "h1", name: "Study", due: 2, kept: 1 }]);
});

test("a completed review keeps its figures; a draft's stay live", () => {
  const data = records({ journal: [day("2026-11-10", [["polity", 5]])] });
  const period = recentPeriods("Weekly", TODAY, 2)[1];
  const frozen = measurePeriod(data, period, TODAY, "then");
  const later = records({ journal: [day("2026-11-10", [["polity", 5]]), day("2026-11-12", [["economy", 4]])] });

  const done = figuresFor(review({ status: "completed", snapshot: frozen }), later, TODAY);
  assert.equal(done.frozen, true);
  assert.equal(done.snapshot.studyHours, 5);

  const draft = figuresFor(review({ status: "draft", snapshot: frozen }), later, TODAY);
  assert.equal(draft.frozen, false);
  assert.equal(draft.snapshot.studyHours, 9);
});

/* ── the summary and the questions ───────────────────────────── */

test("every line of the summary says what kind of statement it is", () => {
  const data = records({ journal: [day("2026-11-10", [["polity", 5]])] });
  const s = measurePeriod(data, recentPeriods("Weekly", TODAY, 2)[1], TODAY, "t");
  const lines = summarize(s, "week");
  assert.ok(lines.every((o) => ["recorded", "planned", "derived", "missing"].includes(o.kind)));
  assert.ok(lines.some((o) => o.kind === "recorded" && o.text === "5 h of study on 1 day of 7, in 1 session."));
  assert.ok(lines.some((o) => o.kind === "missing" && o.text === "6 days with no journal entry."));
  assert.ok(lines.some((o) => o.kind === "missing" && o.text === "No mock test this period."));
  assert.ok(lines.some((o) => o.kind === "missing" && o.text === "No Roadmap activities were planned for this week."));

  const future = measurePeriod(data, customPeriod("2026-12-01", "2026-12-07"), TODAY, "t");
  assert.deepEqual(summarize(future, "period"), [{ kind: "missing", text: "This period hasn't started yet." }]);
});

test("an older review's lists become its answers, and answers keep the lists in step", () => {
  const old = review({ wins: ["Kept the mornings"], struggles: ["Phone"], lessons: ["Leave it outside"], nextFocus: ["Polity", "Two mocks"] });
  const answers = answersOf(old);
  assert.deepEqual(answers, { wentWell: "Kept the mornings", struggled: "Phone", change: "Leave it outside", priorities: "Polity\nTwo mocks" });
  assert.deepEqual(legacyListsOf(answers), { wins: ["Kept the mornings"], struggles: ["Phone"], lessons: ["Leave it outside"], nextFocus: ["Polity", "Two mocks"] });
  // Written answers win over the lists.
  assert.deepEqual(answersOf({ ...old, answers: { wentWell: "New words" } }), { wentWell: "New words" });
});

test("reviews can be searched and kept as Markdown", () => {
  const r = review({ status: "draft", answers: { wentWell: "Finished Parliament", priorities: "Economy" } });
  assert.equal(reviewMatches(r, "parliament"), true);
  assert.equal(reviewMatches(r, "weekly economy"), true);
  assert.equal(reviewMatches(r, "history"), false);
  const md = reviewMarkdown(r, null);
  assert.match(md, /^# Weekly review: 9–15 Nov\n\n2026-11-09 to 2026-11-15 \(draft\)\n/);
  assert.match(md, /## What went well\?\n\nFinished Parliament/);
  assert.doesNotMatch(md, /What did you struggle with/);
});
