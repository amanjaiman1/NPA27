import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { useChronicle, blankChronicleState } from "@/lib/store";
import type { Goal, Habit, JournalEntry, Subject } from "@/lib/types";
import { toISODate } from "@/lib/utils";
import { shiftDay } from "@/lib/life";
import { activityEvents, evaluateDay, habitContext, todayHabits } from "@/lib/habit-engine";
import {
  applyGoalDraft,
  applyGoalLinks,
  applyHabitDrafts,
  goalChanges,
  goalUpdatedOn,
  habitChanges,
  hasGoalChanges,
  lifeRecorded,
  parseCaptureDate,
  parseSection,
  previewHabits,
  readingOn,
} from "@/lib/daily-capture";

const store = () => useChronicle.getState();
const today = toISODate(new Date());
const yesterday = shiftDay(today, -1);

const subjects: Subject[] = [{ id: "polity", name: "Polity", paper: "GS2", topics: [] }];

const manualGoal = (over: Partial<Goal> = {}): Goal => ({
  id: "m",
  title: "Answer writing",
  horizon: "Monthly",
  metric: "manual",
  target: 30,
  current: 0,
  unit: "answers",
  status: "Active",
  createdOn: shiftDay(today, -30),
  milestones: [
    { id: "s1", title: "First ten" },
    { id: "s2", title: "Twenty" },
  ],
  ...over,
});

const entry = (date: string, hours = 6): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [{ subjectId: "polity", hours }],
  totalHours: hours,
  mood: 4,
  energy: 3,
  motivation: 4,
  focus: 3,
});

const manualHabit: Habit = { id: "read", name: "Read the paper", cadence: "daily", createdOn: shiftDay(today, -10), log: {} };
const studyHabit: Habit = {
  id: "study",
  name: "Study six hours",
  cadence: "daily",
  createdOn: shiftDay(today, -10),
  countFrom: shiftDay(today, -10),
  log: {},
  source: "journal",
  metric: "studyHours",
  target: 6,
};

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState({
    ...blankChronicleState(),
    subjects: structuredClone(subjects),
    goals: [manualGoal(), manualGoal({ id: "other", title: "Other goal", milestones: undefined })],
    habits: [structuredClone(manualHabit), structuredClone(studyHabit)],
  });
});

test("the address bar can't open a future or malformed day, or an unknown tab", () => {
  assert.equal(parseCaptureDate(shiftDay(today, 1), today), today);
  assert.equal(parseCaptureDate("2026-13-45x", today), today);
  assert.equal(parseCaptureDate(yesterday, today), yesterday);
  assert.equal(parseSection("goals"), "goals");
  assert.equal(parseSection("nope"), "day");
});

test("a reading for an earlier day joins the history without moving the goal's figure", () => {
  store().logGoalProgress("m", 12, "today's total");
  store().logGoalProgress("m", 8, "caught up", yesterday);
  const g = store().goals.find((x) => x.id === "m")!;
  assert.deepEqual(
    g.progressLog!.map((p) => [p.date, p.value]),
    [
      [yesterday, 8],
      [today, 12],
    ],
    "kept in date order",
  );
  assert.equal(g.current, 12, "the figure is still the latest reading");
  assert.deepEqual(readingOn(g, yesterday), { value: 8, onDay: true });
  // The same day again replaces its reading instead of adding one.
  store().logGoalProgress("m", 9, undefined, yesterday);
  assert.equal(store().goals.find((x) => x.id === "m")!.progressLog!.length, 2);
});

test("milestones and notes take the captured day", () => {
  store().toggleGoalMilestone("m", "s1", yesterday);
  store().addGoalNote("m", "Mornings work", yesterday);
  const g = store().goals.find((x) => x.id === "m")!;
  assert.equal(g.milestones!.find((m) => m.id === "s1")!.doneOn, yesterday);
  assert.equal(g.notes![0].date, yesterday);
  assert.ok(goalUpdatedOn(g, yesterday));
  assert.ok(!goalUpdatedOn(g, today));
});

test("a goal draft updates the original goal once, and a retry changes nothing more", () => {
  const draft = { value: "10", note: "Ten done", milestones: { s1: true }, status: "Active" as const };
  applyGoalDraft(store, "m", draft, today);
  const once = structuredClone(store().goals);
  assert.equal(store().goals.length, 2, "no second copy of the goal");
  const g = store().goals.find((x) => x.id === "m")!;
  assert.equal(g.current, 10);
  assert.equal(g.progressLog!.length, 1);
  assert.equal(g.progressLog![0].note, "Ten done", "the note goes with the reading");
  assert.ok(g.milestones!.find((m) => m.id === "s1")!.doneOn);

  // Measured against the goal as it is now, the same draft has nothing left to do
  // except a note, which is why a saved goal's draft is cleared.
  const left = goalChanges(g, { ...draft, note: undefined }, today);
  assert.equal(hasGoalChanges(left), false);
  applyGoalDraft(store, "m", { ...draft, note: undefined }, today);
  assert.deepEqual(store().goals, once, "applying again doesn't tick the milestone back or add a reading");
});

test("an invalid total is refused without touching the goal", () => {
  const before = structuredClone(store().goals);
  assert.throws(() => applyGoalDraft(store, "m", { value: "-3" }, today));
  assert.deepEqual(store().goals, before);
  assert.throws(() => applyGoalDraft(store, "missing", { value: "3" }, today), /no longer exists/);
});

test("goal links to the day are set, not toggled", () => {
  store().saveJournalEntry({ entry: entry(today) });
  assert.equal(applyGoalLinks(store, ["m"], today), 1);
  assert.equal(applyGoalLinks(store, ["m"], today), 0, "already linked: nothing to do");
  assert.deepEqual(store().goals.find((g) => g.id === "m")!.journalDates, [today]);
  applyGoalLinks(store, [], today);
  assert.equal(store().goals.find((g) => g.id === "m")!.journalDates, undefined);
});

test("manual check-ins are set to the wanted state, so saving twice never unticks", () => {
  const drafts = { read: true };
  assert.deepEqual(habitChanges(store().habits, drafts, today), ["read"]);
  assert.deepEqual(applyHabitDrafts(store, drafts, today), ["read"]);
  assert.deepEqual(applyHabitDrafts(store, drafts, today), [], "the retry finds nothing to change");
  assert.equal(store().habits.find((h) => h.id === "read")!.log[today], true);
  applyHabitDrafts(store, { read: false }, today);
  assert.equal(store().habits.find((h) => h.id === "read")!.log[today], undefined, "reversal removes the day");
});

test("a connected habit is completed by the journal entry itself, with one event per source record", () => {
  store().saveJournalEntry({ entry: entry(today, 6.5) });
  // Saving the same day again (an edit) replaces the entry, never adds a second event.
  store().saveJournalEntry({ entry: entry(today, 6.5), previousDate: today });
  const s = store();
  const events = activityEvents(s).filter((e) => e.date === today && e.kind === "study");
  assert.equal(events.length, 1);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
  const ctx = habitContext(s, today);
  const study = s.habits.find((h) => h.id === "study")!;
  const day = evaluateDay(study, ctx, today);
  assert.equal(day.done, true);
  assert.equal(day.via, "source");
  assert.equal(study.log[today], undefined, "nothing was written to the habit's own log");
  const list = todayHabits(s.habits, ctx);
  assert.equal(list.filter((t) => t.done).length, 1, "only the connected habit is done");
});

test("the habit preview shows unsaved check-ins without changing the saved habits", () => {
  const saved = store().habits;
  const preview = previewHabits(saved, { read: true }, today);
  assert.equal(preview.find((h) => h.id === "read")!.log[today], true);
  assert.equal(saved.find((h) => h.id === "read")!.log[today], undefined);
  assert.equal(previewHabits(saved, {}, today), saved, "no drafts: the same array");
});

test("life readings are counted per tracked measurement, empty ones not at all", () => {
  assert.equal(lifeRecorded(null, ["sleep", "water"]), 0);
  assert.equal(lifeRecorded({ id: "life-x", date: today, bedtime: "23:00", wakeTime: "06:30" }, ["sleep", "water"]), 1);
  assert.equal(lifeRecorded({ id: "life-x", date: today, sleepHours: 7, waterLiters: 2 }, ["sleep", "water", "weight"]), 2);
});
