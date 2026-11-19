import { test } from "node:test";
import assert from "node:assert/strict";
import type { Habit, JournalEntry, LifeEntry, PlanItem, RevisionItem, RoadmapPlan } from "@/lib/types";
import {
  activityEvents,
  evaluateDay,
  evaluateWeek,
  habitConsistency,
  habitContext,
  habitSchedule,
  habitStreaks,
  summarizeToday,
  todayHabits,
  weeklyAtRisk,
  type ActivityData,
} from "@/lib/habit-engine";

/* Thursday 19 November 2026. Weeks start on Monday (the default), so this
   week runs from Monday the 16th to Sunday the 22nd. */
const TODAY = "2026-11-19";

const day = (date: string, hours: number, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: hours > 0 ? [{ subjectId: "polity", hours }] : [],
  totalHours: hours,
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
  ...over,
});

const life = (date: string, over: Partial<LifeEntry>): LifeEntry => ({ id: `l-${date}`, date, ...over });

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Study six hours",
  cadence: "daily",
  createdOn: "2026-11-01",
  log: {},
  ...over,
});

const studyHabit = (over: Partial<Habit> = {}) =>
  habit({ source: "journal", metric: "studyHours", target: 6, countFrom: "2026-11-01", ...over });

function records(over: Partial<ActivityData> = {}): ActivityData {
  return { journal: [], lifeLog: [], revisions: [], plans: [], subjects: [], ...over };
}

const ctxOf = (over: Partial<ActivityData> = {}, today = TODAY) => habitContext(records(over), today);

const activity = (id: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id,
  kind: "activity",
  title: `Activity ${id}`,
  status: "completed",
  completedAt: "2026-11-17T10:00:00",
  createdAt: "2026-11-16T08:00:00",
  ...over,
});

const plan = (items: PlanItem[]): RoadmapPlan => ({
  id: "p1",
  level: "week",
  start: "2026-11-16",
  end: "2026-11-22",
  items,
  createdAt: "2026-11-16T08:00:00",
  updatedAt: "2026-11-16T08:00:00",
});

/* ── reading a day ───────────────────────────────────────────── */

test("a habit fed by the journal is kept, partial, missed or still open from the hours logged", () => {
  const ctx = ctxOf({ journal: [day("2026-11-17", 6.5), day("2026-11-18", 3)] });
  const h = studyHabit();
  const kept = evaluateDay(h, ctx, "2026-11-17");
  assert.equal(kept.status, "done");
  assert.equal(kept.via, "source");
  assert.equal(kept.value, 6.5);

  const short = evaluateDay(h, ctx, "2026-11-18");
  assert.equal(short.status, "partial");
  assert.equal(short.done, false);
  assert.equal(short.progress, 0.5);

  assert.equal(evaluateDay(h, ctx, "2026-11-16").status, "missed");
  assert.equal(evaluateDay(h, ctx, TODAY).status, "open");
  assert.equal(evaluateDay(h, ctx, "2026-11-20").status, "future");
});

test("records from before the day a habit counts from don't count", () => {
  const ctx = ctxOf({ journal: [day("2026-11-10", 8), day("2026-11-17", 8)] });
  const h = studyHabit({ createdOn: "2026-11-01", countFrom: "2026-11-15" });
  assert.equal(evaluateDay(h, ctx, "2026-11-10").status, "before");
  assert.equal(evaluateDay(h, ctx, "2026-11-17").status, "done");
});

test("a hand correction always wins over what the records say", () => {
  const ctx = ctxOf({ journal: [day("2026-11-17", 8), day("2026-11-18", 1)] });
  const at = "2026-11-19T08:00:00.000Z";
  const h = studyHabit({
    overrides: {
      "2026-11-17": { kind: "missed", at },
      "2026-11-18": { kind: "done", at },
      "2026-11-16": { kind: "value", value: 7, at },
    },
  });
  const missed = evaluateDay(h, ctx, "2026-11-17");
  assert.equal(missed.done, false);
  assert.equal(missed.status, "missed");
  assert.equal(missed.via, "override");

  const done = evaluateDay(h, ctx, "2026-11-18");
  assert.equal(done.done, true);
  assert.equal(done.via, "override");

  // A corrected amount is measured like a recorded one.
  const value = evaluateDay(h, ctx, "2026-11-16");
  assert.equal(value.value, 7);
  assert.equal(value.done, true);
  assert.equal(value.via, "override");
});

test("a check-in completes an automatic habit only when check-ins are allowed", () => {
  const ctx = ctxOf();
  const log = { "2026-11-18": true };
  assert.equal(evaluateDay(studyHabit({ log }), ctx, "2026-11-18").done, false);
  const hybrid = evaluateDay(studyHabit({ log, allowManual: true }), ctx, "2026-11-18");
  assert.equal(hybrid.done, true);
  assert.equal(hybrid.via, "manual");
});

test("a bedtime target compares across midnight", () => {
  // Target 23:00, stored as minutes after the previous noon (660).
  const h = habit({ source: "life", metric: "bedtimeBy", target: 660 });
  const ctx = ctxOf({ lifeLog: [life("2026-11-17", { bedtime: "22:45" }), life("2026-11-18", { bedtime: "00:30" })] });
  assert.equal(evaluateDay(h, ctx, "2026-11-17").done, true);
  assert.equal(evaluateDay(h, ctx, "2026-11-18").done, false);
});

/* ── events ──────────────────────────────────────────────────── */

test("the same records always give the same events, and a pass recorded twice counts once", () => {
  const revisions: RevisionItem[] = [
    {
      id: "r1",
      subjectId: "polity",
      topic: "Fundamental Rights",
      addedOn: "2026-11-01",
      nextDue: "2026-11-25",
      intervalDays: 7,
      repetitions: 2,
      confidence: 3,
      passes: ["2026-11-18"],
    },
  ];
  // The same pass, also logged in the day's journal entry against the queue item.
  const journal = [day("2026-11-18", 2, { revisionSessions: [{ topic: "Fundamental Rights", revisionItemId: "r1", minutes: 30 }] })];
  const data = records({ journal, revisions });
  const a = activityEvents(data);
  const b = activityEvents(data);
  assert.deepEqual(a, b);
  const passes = a.filter((e) => e.kind === "revisionPass");
  assert.equal(passes.length, 1);
  assert.equal(passes[0].id, "revision:r1:2026-11-18");
  assert.equal(a.filter((e) => e.kind === "revisionMinutes").length, 1);
});

test("only finished Roadmap activities count, on the day they were completed", () => {
  const p = plan([
    activity("a1"),
    activity("a2", { status: "inProgress", completedAt: undefined }),
    activity("a3", { completedAt: undefined }),
    { ...activity("m1"), kind: "milestone" },
  ]);
  const events = activityEvents(records({ plans: [p] })).filter((e) => e.kind === "roadmapActivity");
  assert.deepEqual(
    events.map((e) => [e.id, e.date]),
    [["roadmap:p1:a1", "2026-11-17"]],
  );
});

/* ── schedules, weeks and streaks ────────────────────────────── */

test("older habits keep their schedule through the deprecated fields", () => {
  assert.deepEqual(habitSchedule(habit()), { kind: "daily" });
  assert.deepEqual(habitSchedule(habit({ cadence: "weekly", targetPerWeek: 4 })), { kind: "weekly", timesPerWeek: 4 });
  assert.deepEqual(habitSchedule(habit({ schedule: { kind: "weekdays", days: [5, 1, 1, 9] } })), { kind: "weekdays", days: [1, 5] });
  assert.deepEqual(habitSchedule(habit({ schedule: { kind: "weekdays", days: [] } })), { kind: "daily" });
});

test("rest days and paused days neither break a streak nor add to it", () => {
  const journal = ["2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16", "2026-11-18"].map((d) => day(d, 7));
  const ctx = ctxOf({ journal });
  // Monday, Wednesday and Friday only.
  const h = studyHabit({ schedule: { kind: "weekdays", days: [1, 3, 5] }, countFrom: "2026-11-09", createdOn: "2026-11-09" });
  assert.deepEqual(habitStreaks(h, ctx), { current: 5, longest: 5, unit: "day" });

  // Friday the 13th missed, but paused: still unbroken.
  const gap = ctxOf({ journal: journal.filter((e) => e.date !== "2026-11-13") });
  assert.equal(habitStreaks(h, gap).current, 2);
  const paused = { ...h, pauses: [{ from: "2026-11-13", to: "2026-11-14" }] };
  assert.equal(evaluateDay(paused, gap, "2026-11-13").status, "paused");
  assert.equal(habitStreaks(paused, gap).current, 4);
});

test("a habit kept so many days a week is judged by the week", () => {
  const h = studyHabit({ schedule: { kind: "weekly", timesPerWeek: 3 }, countFrom: "2026-11-02", createdOn: "2026-11-02" });
  const ctx = ctxOf({
    journal: [
      // Last week: three days, kept.
      day("2026-11-09", 6),
      day("2026-11-11", 6),
      day("2026-11-13", 6),
      // This week: one so far.
      day("2026-11-17", 6),
    ],
  });
  const last = evaluateWeek(h, ctx, "2026-11-12");
  assert.equal(last.status, "done");
  assert.equal(last.achieved, 3);
  const now = evaluateWeek(h, ctx, TODAY);
  assert.deepEqual([now.status, now.achieved, now.required], ["open", 1, 3]);
  // The week of 2 November had no study at all.
  assert.equal(evaluateWeek(h, ctx, "2026-11-04").status, "missed");
  assert.deepEqual(habitStreaks(h, ctx), { current: 1, longest: 1, unit: "week" });

  // A week the habit started part-way through asks only for the days it had.
  const late = studyHabit({ schedule: { kind: "weekly", timesPerWeek: 5 }, countFrom: "2026-11-21", createdOn: "2026-11-21" });
  const sunday = ctxOf({ journal: [day("2026-11-21", 6), day("2026-11-22", 6)] }, "2026-11-22");
  const short = evaluateWeek(late, sunday, "2026-11-22");
  assert.deepEqual([short.required, short.achieved, short.done], [2, 2, true]);
});

test("a weekly total adds up the week's records", () => {
  const h = habit({ source: "roadmap", metric: "roadmapActivities", target: 3, schedule: { kind: "weeklyTotal" }, countFrom: "2026-11-01" });
  const ctx = ctxOf({ plans: [plan([activity("a1"), activity("a2", { completedAt: "2026-11-18T09:00:00" })])] });
  const week = evaluateWeek(h, ctx, TODAY);
  assert.deepEqual([week.achieved, week.required, week.status], [2, 3, "open"]);
  // A day's status shows activity without calling the day kept or missed.
  assert.equal(evaluateDay(h, ctx, "2026-11-17").status, "partial");
  assert.equal(evaluateDay(h, ctx, "2026-11-16").status, "rest");
});

test("consistency counts only due days, and today only once it's kept", () => {
  const h = studyHabit({ countFrom: "2026-11-16", createdOn: "2026-11-16" });
  const ctx = ctxOf({ journal: [day("2026-11-16", 6), day("2026-11-18", 6)] });
  assert.deepEqual(habitConsistency(h, ctx, "2026-11-01", TODAY), { due: 3, kept: 2, rate: 2 / 3, unit: "day" });
  const kept = ctxOf({ journal: [day("2026-11-16", 6), day("2026-11-18", 6), day(TODAY, 6)] });
  assert.deepEqual(habitConsistency(h, kept, "2026-11-01", TODAY), { due: 4, kept: 3, rate: 3 / 4, unit: "day" });
});

/* ── today ───────────────────────────────────────────────────── */

test("today's list leaves out rest days, paused, archived and not-yet-started habits", () => {
  const ctx = ctxOf({ journal: [day(TODAY, 7)] });
  const list = todayHabits(
    [
      studyHabit({ id: "kept" }),
      habit({ id: "open", name: "Read the paper" }),
      habit({ id: "rest", schedule: { kind: "weekdays", days: [0] } }),
      habit({ id: "paused", pauses: [{ from: "2026-11-18" }] }),
      habit({ id: "archived", archived: true }),
      habit({ id: "later", createdOn: "2026-11-20" }),
    ],
    ctx,
  );
  assert.deepEqual(
    list.map((t) => [t.habit.id, t.done]),
    [
      ["kept", true],
      ["open", false],
    ],
  );
  assert.deepEqual(summarizeToday(list), { due: 2, done: 1, pending: 1, percent: 50 });
});

test("a weekly habit is at risk only once no spare day is left", () => {
  const h = studyHabit({ schedule: { kind: "weekly", timesPerWeek: 3 }, countFrom: "2026-11-02", createdOn: "2026-11-02" });
  const risk = (journal: JournalEntry[], today: string) => {
    const ctx = ctxOf({ journal }, today);
    const t = todayHabits([h], ctx)[0];
    return weeklyAtRisk(t, ctx);
  };
  // Thursday, one kept: two needed in four days. There's room.
  assert.equal(risk([day("2026-11-17", 6)], TODAY), null);
  // Saturday, one kept: two needed in two days. No room left.
  assert.deepEqual(risk([day("2026-11-17", 6)], "2026-11-21"), { needed: 2, daysLeft: 2, text: "2 more days this week" });
  // Sunday, one kept: two needed in one day. Can't be made, so no nagging.
  assert.equal(risk([day("2026-11-17", 6)], "2026-11-22"), null);
  // Already kept today: nothing more to do today.
  assert.equal(risk([day("2026-11-17", 6), day("2026-11-21", 6)], "2026-11-21"), null);
  // Kept for the week.
  assert.equal(risk(["2026-11-16", "2026-11-17", "2026-11-18"].map((d) => day(d, 6)), "2026-11-21"), null);
});

test("a weekly total is at risk on the week's last two days while it's short", () => {
  const h = habit({ source: "roadmap", metric: "roadmapActivities", target: 5, schedule: { kind: "weeklyTotal" }, countFrom: "2026-11-01" });
  const data = { plans: [plan([activity("a1"), activity("a2")])] };
  const at = (today: string) => {
    const ctx = ctxOf(data, today);
    return weeklyAtRisk(todayHabits([h], ctx)[0], ctx);
  };
  assert.equal(at("2026-11-20"), null);
  assert.deepEqual(at("2026-11-21"), { needed: 3, daysLeft: 2, text: "3 more this week" });
});
