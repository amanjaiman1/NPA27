import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { activateAccount, deactivateAccount } from "@/lib/account/session";
import { normalizeProfile, normalizeSnapshot } from "@/lib/account/normalize";
import { useChronicle, blankChronicleState } from "@/lib/store";
import { createAccountTemplate, createBlankAccount, defaultSetup } from "@/lib/seed";
import { computeGoalProgress, type GoalData } from "@/lib/goals";
import { merge3 } from "@/lib/sync/merge";
import type { Goal, JournalEntry, PlanItem, RoadmapPlan } from "@/lib/types";
import {
  NO_FILTERS,
  addDays,
  blankItem,
  blankPlan,
  carryForward,
  currentPlans,
  daysInMonth,
  duplicatePlan,
  formatSpan,
  isArchived,
  isISODate,
  monthEnd,
  normalizePlans,
  overlapDays,
  ownCounts,
  periodClashes,
  removePlan,
  rollupCounts,
  searchRoadmap,
  shiftToMonth,
  shiftYears,
  suggestedParent,
  undoCarry,
  unplannedMonths,
  unplannedWeeks,
  validatePlan,
  weekHomeMonth,
  weekPlanFor,
  weekStartOf,
  weeksOfMonth,
} from "@/lib/roadmap";

const T = "2027-01-01T09:00:00.000Z";
const store = () => useChronicle.getState();

const week = (start: string, over: Partial<RoadmapPlan> = {}): RoadmapPlan => ({ ...blankPlan("week", { start }, T), ...over });
const month = (key: string, over: Partial<RoadmapPlan> = {}): RoadmapPlan => ({ ...blankPlan("month", { month: key }, T), ...over });
const year = (y: number, over: Partial<RoadmapPlan> = {}): RoadmapPlan => ({ ...blankPlan("year", { year: y }, T), ...over });
const act = (title: string, over: Partial<PlanItem> = {}): PlanItem => ({ ...blankItem("activity", title, T), ...over });
const mile = (title: string, over: Partial<PlanItem> = {}): PlanItem => ({ ...blankItem("milestone", title, T), ...over });

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
});

/* ── A: the old plan is gone, and new accounts start empty ─────── */

test("a new account's Roadmap is empty: no fixed CSE 2027 plan, no switch for one", () => {
  const fresh = createAccountTemplate({ ...defaultSetup(), name: "New", targetExam: "UPSC CSE 2027" });
  assert.deepEqual(fresh.plans, []);
  assert.equal("useRoadmap" in fresh.profile, false);
  assert.deepEqual(createBlankAccount().plans, []);
  assert.deepEqual(blankChronicleState().plans, []);
});

test("upgrading removes only the old roadmap switch; every other record is kept", () => {
  const migrate = useChronicle.persist.getOptions().migrate!;
  const before = {
    profile: { name: "Owner", targetExam: "UPSC CSE 2027", examDate: "2027-05-23", startDate: "2026-06-15", attemptNumber: 1, optionalSubject: "Sociology", dailyHourTarget: 8, onboardedAt: "2026-06-15", useRoadmap: true },
    journal: [{ id: "j1", date: "2026-11-01", totalHours: 5, blocks: [], mood: 4, energy: 3, motivation: 3, focus: 3 }],
    goals: [{ id: "g1", title: "Finish Sociology", horizon: "Long-term", status: "Active", createdOn: "2026-06-15" }],
    revisions: [{ id: "r1", subjectId: "polity", topic: "Parliament", nextDue: "2026-11-20" }],
    lifeLog: [{ id: "life-2026-11-01", date: "2026-11-01", waterLiters: 2 }],
    material: "standard",
    reduceTransparency: false,
  };
  const after = migrate(structuredClone(before), 13) as unknown as Record<string, unknown> & { profile: Record<string, unknown> };
  assert.equal("useRoadmap" in after.profile, false, "the switch is gone");
  assert.deepEqual(after.plans, [], "and no plan is made in its place");
  for (const k of ["journal", "goals", "revisions", "lifeLog"] as const) assert.deepEqual(after[k], before[k], `${k} untouched`);
  assert.equal(after.profile.name, "Owner");
  // Idempotent: running the clean-up again changes nothing.
  assert.deepEqual(normalizeProfile(after.profile as never), after.profile);
  const twice = normalizeSnapshot({ profile: after.profile as never, plans: after.plans });
  assert.deepEqual(twice.plans, []);
});

/* ── B, C: years and months ────────────────────────────────────── */

test("a year with months: editing or deleting one month leaves the others exactly as they were", () => {
  const y = year(2027, { title: "My UPSC preparation roadmap", focus: "Foundation, then Prelims" });
  assert.equal(store().savePlan(y), true);
  const jan = month("2027-01", { parentId: y.id });
  const feb = month("2027-02", { parentId: y.id });
  const mar = month("2027-03", { parentId: y.id });
  assert.equal(store().addPlans([jan, feb, mar]), 3);
  const janBefore = structuredClone(store().plans.find((p) => p.id === jan.id));
  const marBefore = structuredClone(store().plans.find((p) => p.id === mar.id));

  store().savePlan({ ...store().plans.find((p) => p.id === feb.id)!, focus: "Modern History" });
  assert.equal(store().plans.find((p) => p.id === feb.id)?.focus, "Modern History");
  store().deletePlan(feb.id, "keep");

  assert.equal(store().plans.some((p) => p.id === feb.id), false);
  assert.deepEqual(store().plans.find((p) => p.id === jan.id), janBefore);
  assert.deepEqual(store().plans.find((p) => p.id === mar.id), marBefore);
  assert.equal(store().plans.find((p) => p.id === y.id)?.focus, "Foundation, then Prelims");
});

test("one plan per period: a second January is refused, and templates skip months already planned", () => {
  store().savePlan(month("2027-01"));
  assert.equal(store().savePlan(month("2027-01")), false);
  const y = year(2027);
  assert.deepEqual(validatePlan(month("2027-01"), store().plans).period?.startsWith("You already have a plan for January 2027"), true);
  store().savePlan(y);
  const added = store().addPlans(["2027-01", "2027-02"].map((m) => month(m, { parentId: y.id })));
  assert.equal(added, 1, "January exists, so only February is added");
  assert.equal(store().plans.filter((p) => p.level === "month").length, 2);
});

test("monthly plans work on their own or inside a year, and suggest the year that covers them", () => {
  const alone = month("2027-04");
  assert.deepEqual(validatePlan(alone, []), {});
  store().savePlan(alone);
  const y = year(2027);
  store().savePlan(y);
  const may = month("2027-05");
  assert.equal(suggestedParent(store().plans, may), y.id);
  store().savePlan({ ...may, parentId: y.id });
  assert.equal(store().plans.find((p) => p.id === may.id)?.parentId, y.id);
  assert.equal(store().plans.find((p) => p.id === alone.id)?.parentId, undefined, "the independent one is left alone");
  // A month can't sit under a year that doesn't cover it.
  const y2 = year(2029);
  store().savePlan(y2);
  assert.ok(validatePlan({ ...month("2027-06"), parentId: y2.id }, store().plans).parent);
});

/* ── D: weeks and progress from real records ───────────────────── */

test("weekly progress is counted from the activities themselves, and nothing is invented", () => {
  const w = week("2027-01-04", {
    items: [
      act("Read 3 History chapters", { status: "completed" }),
      act("Watch 8 Sociology lectures", { status: "inProgress" }),
      act("Prepare notes"),
      act("Revise previous topics", { status: "deferred" }),
      act("Practice test", { targetDate: "2027-01-05" }),
      mile("Unit 1 done", { targetDate: "2027-01-10" }),
    ],
  });
  const c = ownCounts([w], w, "2027-01-07");
  assert.equal(c.total, 5, "milestones aren't activities");
  assert.equal(c.completed, 1);
  assert.equal(c.inProgress, 1);
  assert.equal(c.notStarted, 2);
  assert.equal(c.deferred, 1);
  assert.equal(c.overdue, 1, "only the practice test is past its date");
  assert.equal(c.pct, 20);
  assert.equal(c.milestones, 1);
  assert.equal(ownCounts([week("2027-01-11")], week("2027-01-11"), "2027-01-12").pct, null, "an empty week has no percentage");
  // Once the week is over, open activities without a date are overdue too.
  assert.equal(ownCounts([w], w, "2027-01-11").overdue, 3);
});

test("a month counts each piece of work once, even when it was carried from one week to the next", () => {
  const m = month("2027-01");
  const w1 = week("2027-01-04", { parentId: m.id, items: [act("A", { status: "completed" }), act("B")] });
  const w2 = week("2027-01-11", { parentId: m.id });
  let plans = [m, w1, w2];
  const res = carryForward(plans, w1.id, [w1.items![1].id], w2.id, T);
  assert.equal(res.moved, 1);
  plans = res.plans;
  const w1after = plans.find((p) => p.id === w1.id)!;
  const original = w1after.items!.find((i) => i.title === "B")!;
  assert.equal(original.status, "deferred", "the original is kept, marked as moved on");
  assert.ok(original.carriedTo);
  assert.equal(ownCounts(plans, w1after, "2027-01-12").total, 2, "the first week still shows what it planned");
  assert.equal(ownCounts(plans, w1after, "2027-01-12").carried, 1);
  const roll = rollupCounts(plans, m, "2027-01-12");
  assert.equal(roll.total, 2, "two pieces of work, not three");
  assert.equal(roll.completed, 1);
  // Carrying the same activity again does nothing.
  assert.equal(carryForward(plans, w1.id, [original.id], w2.id, T).moved, 0);
});

test("carry forward moves dates with the week, keeps the history, and can be taken back while untouched", () => {
  const w1 = week("2027-01-25", { items: [act("Notes", { targetDate: "2027-01-29", priority: "High", status: "inProgress" })] });
  const w2 = week("2027-02-01");
  const { plans } = carryForward([w1, w2], w1.id, [w1.items![0].id], w2.id, T);
  const copy = plans.find((p) => p.id === w2.id)!.items![0];
  assert.notEqual(copy.id, w1.items![0].id, "a new activity, not the same record");
  assert.equal(copy.targetDate, "2027-02-05", "Friday stays Friday, across the month end");
  assert.equal(copy.status, "inProgress");
  assert.equal(copy.priority, "High");
  assert.deepEqual(copy.carriedFrom, { planId: w1.id, itemId: w1.items![0].id });
  const back = undoCarry(plans, w1.id, w1.items![0].id, T);
  assert.equal(back.ok, true);
  assert.equal(back.plans.find((p) => p.id === w2.id)!.items!.length, 0);
  assert.equal(back.plans.find((p) => p.id === w1.id)!.items![0].status, "inProgress");
  // Once the copy has been worked on, it stays where it is.
  const worked = plans.map((p) => (p.id === w2.id ? { ...p, items: [{ ...copy, status: "completed" as const }] } : p));
  assert.equal(undoCarry(worked, w1.id, w1.items![0].id, T).ok, false);
});

test("deleting a parent asks what to do with what's inside: keep moves it up, delete removes it", () => {
  const y = year(2027);
  const m = month("2027-01", { parentId: y.id });
  const w = week("2027-01-04", { parentId: m.id, items: [act("A")] });
  const kept = removePlan([y, m, w], m.id, "keep", T);
  assert.equal(kept.length, 2);
  assert.equal(kept.find((p) => p.id === w.id)?.parentId, y.id, "the week moves up to the year");
  assert.equal(kept.find((p) => p.id === w.id)?.items?.length, 1, "with its activities");
  const keptYear = removePlan([y, m, w], y.id, "keep", T);
  assert.equal(keptYear.find((p) => p.id === m.id)?.parentId, undefined, "a month with no year left stands alone");
  assert.equal(keptYear.find((p) => p.id === w.id)?.parentId, m.id, "and its week stays in it");
  assert.deepEqual(removePlan([y, m, w], y.id, "delete", T), []);
});

test("duplicating gives every item a new id and a fresh start, with dates moved to the new period", () => {
  const jan = month("2027-01", { focus: "Modern History", goalIds: ["g1"], items: [mile("Unit 1", { targetDate: "2027-01-31", status: "completed", completedAt: T }), act("Tests", { journalDates: ["2027-01-10"] })] });
  const feb = duplicatePlan(jan, { month: "2027-02" }, T);
  assert.notEqual(feb.id, jan.id);
  assert.equal(feb.start, "2027-02-01");
  assert.equal(feb.end, "2027-02-28");
  assert.equal(feb.focus, "Modern History");
  assert.deepEqual(feb.goalIds, ["g1"]);
  assert.notEqual(feb.goalIds, jan.goalIds, "no shared arrays");
  assert.equal(feb.items![0].targetDate, "2027-02-28", "the 31st lands on February's last day");
  for (const [i, it] of feb.items!.entries()) {
    assert.notEqual(it.id, jan.items![i].id);
    assert.equal(it.status, "notStarted");
    assert.equal(it.completedAt, undefined);
    assert.equal(it.journalDates, undefined);
  }
  feb.items![0].title = "Changed";
  assert.equal(jan.items![0].title, "Unit 1", "editing the copy can't touch the original");
  const nextYear = duplicatePlan(year(2027, { items: [mile("Mains", { targetDate: "2028-02-29" })] }), { year: 2028 }, T);
  assert.equal(nextYear.items![0].targetDate, "2029-02-28");
});

/* ── E: dates at the edges ─────────────────────────────────────── */

test("weeks across a month end or a year end belong to one month, and are never planned twice", () => {
  assert.equal(weekStartOf("2027-01-01", 1), "2026-12-28", "Monday weeks");
  assert.equal(weekStartOf("2027-01-01", 0), "2026-12-27", "Sunday weeks");
  assert.equal(weekStartOf("2027-01-01", 6), "2026-12-26", "Saturday weeks");
  assert.equal(weekHomeMonth("2026-12-28"), "2026-12", "most of 28 Dec – 3 Jan is in December");
  assert.equal(weekHomeMonth("2027-03-29"), "2027-04", "most of 29 Mar – 4 Apr is in April");
  assert.equal(formatSpan("2026-12-28", "2027-01-03"), "28 Dec 2026 – 3 Jan 2027");
  assert.equal(formatSpan("2027-03-29", "2027-04-04"), "29 Mar – 4 Apr 2027");
  assert.deepEqual(weeksOfMonth("2027-01", 1), ["2026-12-28", "2027-01-04", "2027-01-11", "2027-01-18", "2027-01-25"]);
  // The crossing week counts as unplanned for December only, not for both.
  assert.deepEqual(unplannedWeeks([], "2027-01", 1), ["2027-01-04", "2027-01-11", "2027-01-18", "2027-01-25"]);
  assert.ok(unplannedWeeks([], "2026-12", 1).includes("2026-12-28"));
  // Once planned, it is the same single plan seen from either month.
  const crossing = week("2026-12-28");
  assert.equal(weekPlanFor([crossing], "2026-12-28")?.id, crossing.id);
  assert.equal(unplannedWeeks([crossing], "2026-12", 1).includes("2026-12-28"), false);
  // A week starting on a Wednesday covers the slot it mostly sits in.
  assert.equal(weekPlanFor([week("2027-01-06")], "2027-01-04")?.start, "2027-01-06");
  assert.equal(weekPlanFor([week("2027-01-08")], "2027-01-04"), undefined, "three days isn't most of a week");
  // A year rollup counts a crossing week once, under the month it's linked to.
  const y = year(2027, { start: "2026-12-01", end: "2027-11-30" });
  const dec = month("2026-12", { parentId: y.id });
  const jan = month("2027-01", { parentId: y.id });
  const w = week("2026-12-28", { parentId: dec.id, items: [act("x")] });
  assert.equal(rollupCounts([y, dec, jan, w], y, "2027-01-02").total, 1);
  assert.equal(rollupCounts([y, dec, jan, w], jan, "2027-01-02").total, 0);
});

test("month ends and leap years", () => {
  assert.equal(monthEnd("2027-02"), "2027-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(daysInMonth(2100, 2), 28, "2100 is not a leap year");
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(isISODate("2027-02-29"), false);
  assert.equal(isISODate("2028-02-29"), true);
  assert.equal(isISODate("2027-04-31"), false);
  assert.equal(isISODate("2027-4-3"), false);
  assert.equal(shiftToMonth("2027-01-31", "2027-04"), "2027-04-30");
  assert.equal(shiftYears("2028-02-29", 1), "2029-02-28");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(addDays("2027-12-31", 1), "2028-01-01");
  assert.equal(blankPlan("year", { year: 2028 }).end, "2028-12-31");
  assert.equal(overlapDays("2028-01-01", "2028-12-31", "2028-01-01", "2028-12-31"), 366);
  assert.deepEqual(unplannedMonths([], "2026-11-15", "2027-02-01"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("the same dates come out in every time zone, through clock changes", () => {
  const zones = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Europe/London", "Pacific/Auckland", "Pacific/Chatham"];
  const before = process.env.TZ;
  const runs = zones.map((tz) => {
    process.env.TZ = tz;
    return JSON.stringify({
      // Clocks change on 28 Mar 2027 in London and 14 Mar 2027 in Los Angeles.
      steps: ["2027-03-27", "2027-03-13", "2027-10-30", "2027-04-03"].map((d) => [addDays(d, 1), addDays(d, 2), addDays(d, -1)]),
      weeks: weeksOfMonth("2027-03", 1),
      starts: ["2027-03-28", "2027-11-07", "2027-01-01"].map((d) => weekStartOf(d, 1)),
      span: overlapDays("2027-03-22", "2027-04-04", "2027-03-28", "2027-03-31"),
      label: formatSpan("2027-03-22", "2027-03-28"),
    });
  });
  process.env.TZ = before;
  if (before === undefined) delete process.env.TZ;
  for (const [i, r] of runs.entries()) assert.equal(r, runs[0], `${zones[i]} agrees with UTC`);
});

/* ── F: goals keep their own progress ──────────────────────────── */

const emptyGoalData = (journal: JournalEntry[] = []): GoalData => ({
  journal,
  subjects: [],
  mocks: [],
  revisions: [],
  books: [],
  currentAffairs: [],
  reflections: [],
  mistakes: [],
  lifeLog: [],
});

test("finishing planned work never changes a linked goal, and no goal is copied", () => {
  const goal: Goal = {
    id: "g-soc",
    title: "Complete Sociology Optional",
    horizon: "Long-term",
    status: "Active",
    createdOn: "2026-12-01",
    metric: "milestones",
    milestones: [
      { id: "gm1", title: "Unit 1" },
      { id: "gm2", title: "Unit 2" },
    ],
  };
  useChronicle.setState({ goals: [goal] });
  const goalBefore = structuredClone(goal);
  const progressBefore = computeGoalProgress(goal, emptyGoalData(), "2027-01-08");

  const y = year(2027, { goalIds: [goal.id] });
  const m = month("2027-01", { parentId: y.id, goalIds: [goal.id] });
  const w = week("2027-01-04", { parentId: m.id, goalIds: [goal.id], items: [act("Finish Unit 1", { goalId: goal.id, goalMilestoneId: "gm1" }), act("Notes", { goalId: goal.id })] });
  store().addPlans([y, m, w]);
  for (const it of w.items!) store().setPlanItemStatus(w.id, it.id, "completed");

  assert.equal(store().goals.length, 1, "no duplicate goal");
  assert.deepEqual(store().goals[0], goalBefore, "the goal record is untouched, milestone included");
  const progressAfter = computeGoalProgress(store().goals[0], emptyGoalData(), "2027-01-08");
  assert.equal(progressAfter.pct, progressBefore.pct);
  assert.equal(progressAfter.pct, 0, "the goal's own milestones decide its progress");
  assert.equal(rollupCounts(store().plans, y, "2027-01-08").pct, 100, "the roadmap shows its own execution, separately");
  assert.ok(store().plans.find((p) => p.id === w.id)!.items!.every((i) => i.completedAt), "completion is timestamped");

  // Deleting the goal removes the references only.
  store().deleteGoal(goal.id);
  const after = store().plans.find((p) => p.id === w.id)!;
  assert.equal(after.goalIds, undefined);
  assert.equal(after.items!.length, 2, "the activities stay");
  assert.ok(after.items!.every((i) => !i.goalId && !i.goalMilestoneId));
});

/* ── G: the journal records; links are deliberate and reversible ── */

test("linking a journal day to an activity changes neither record, and unlinking deletes nothing", () => {
  const entry = { id: "j-2027-01-05", date: "2027-01-05", totalHours: 4, blocks: [{ subjectId: "history", hours: 4 }], mood: 4, energy: 3, motivation: 3, focus: 3 } as JournalEntry;
  useChronicle.setState({ journal: [entry] });
  const w = week("2027-01-04", { items: [act("Read 3 chapters")] });
  store().savePlan(w);
  const itemId = w.items![0].id;

  store().setItemJournalLink(w.id, itemId, entry.date, true);
  let item = store().plans[0].items![0];
  assert.deepEqual(item.journalDates, ["2027-01-05"]);
  assert.equal(item.status, "notStarted", "a journal entry doesn't complete anything");
  assert.deepEqual(store().journal[0], entry, "the journal entry is untouched");

  store().setItemJournalLink(w.id, itemId, entry.date, false);
  item = store().plans[0].items![0];
  assert.equal(item.journalDates, undefined);
  assert.equal(store().journal.length, 1, "the journal day still exists");
  assert.equal(store().plans[0].items!.length, 1, "the activity still exists");

  // Moving the day takes the link along; deleting the day drops only the link.
  store().setItemJournalLink(w.id, itemId, entry.date, true);
  store().saveJournalEntry({ entry: { ...entry, date: "2027-01-06" }, previousDate: entry.date });
  assert.deepEqual(store().plans[0].items![0].journalDates, ["2027-01-06"]);
  store().deleteJournal("2027-01-06");
  assert.equal(store().plans[0].items![0].journalDates, undefined);
  assert.equal(store().plans[0].items!.length, 1);
});

/* ── H: history ────────────────────────────────────────────────── */

test("an archived year leaves the current view but stays readable, with everything in it", () => {
  const y = year(2026, { items: [mile("Prelims mock series", { status: "completed" })] });
  const m = month("2026-12", { parentId: y.id, items: [act("Revise Polity", { status: "completed" })] });
  store().addPlans([y, m]);
  store().setPlanArchived(y.id, true);
  const plans = store().plans;
  assert.ok(isArchived(plans, plans.find((p) => p.id === m.id)!), "its months count as archived");
  assert.equal(currentPlans(plans, "2026-12-10").month, undefined, "archived plans aren't current");
  assert.equal(searchRoadmap(plans, "Polity", NO_FILTERS, "2027-01-01").items.length, 0);
  assert.equal(searchRoadmap(plans, "Polity", { ...NO_FILTERS, includeArchived: true }, "2027-01-01").items.length, 1);
  assert.equal(plans.find((p) => p.id === m.id)?.items?.[0].status, "completed", "history is kept as it was");
  store().setPlanArchived(y.id, false);
  assert.equal(store().plans.find((p) => p.id === y.id)?.archivedAt, undefined);
});

test("search and filters find plans and activities by words, dates, status, priority, goal, subject and category", () => {
  const w = week("2027-01-04", {
    focus: "Modern History",
    items: [
      act("Spectrum chapters 1-3", { subjectId: "history", priority: "High", category: "Reading", goalId: "g1" }),
      act("Answer writing", { category: "Answer writing", status: "completed", targetDate: "2027-01-06" }),
      act("Overdue test", { targetDate: "2027-01-05" }),
    ],
  });
  const plans = [w, month("2027-02", { title: "Sociology month" })];
  const today = "2027-01-07";
  assert.equal(searchRoadmap(plans, "sociology", NO_FILTERS, today).plans.length, 1);
  assert.equal(searchRoadmap(plans, "spectrum", NO_FILTERS, today).items.length, 1);
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, priority: "High" }, today).items.length, 1);
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, status: "overdue" }, today).items[0].item.title, "Overdue test");
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, goalId: "g1" }, today).items.length, 1);
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, subjectId: "history" }, today).items.length, 1);
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, category: "answer writing" }, today).items.length, 1);
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, month: "2027-02" }, today).plans.length, 1);
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, week: "2027-01-06" }, today).items.length, 2, "dated activities are placed by their own date");
  assert.equal(searchRoadmap(plans, "", { ...NO_FILTERS, year: 2028 }, today).items.length, 0);
});

/* ── I: accounts never see each other's plans ──────────────────── */

test("two accounts on one browser: plans, activities and search stay with their owner", async () => {
  const disk = new MemoryStorage();
  setStorageBackend(disk as unknown as Storage);
  await activateAccount("alice", "cloud");
  store().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  store().savePlan(week("2027-01-04", { title: "Alice's week", items: [act("Alice only activity")] }));
  store().savePlan(year(2027, { title: "Alice's year" }));
  deactivateAccount();
  assert.deepEqual(store().plans, [], "signed out: nothing in memory");

  await activateAccount("bob", "cloud");
  assert.deepEqual(store().plans, [], "bob starts with an empty roadmap");
  assert.equal(searchRoadmap(store().plans, "alice", { ...NO_FILTERS, includeArchived: true }, "2027-01-05").items.length, 0);
  store().completeOnboarding({ ...defaultSetup(), name: "Bob" });
  store().savePlan(month("2027-01", { title: "Bob's January" }));
  deactivateAccount();

  await activateAccount("alice", "cloud");
  assert.deepEqual(store().plans.map((p) => p.title).sort(), ["Alice's week", "Alice's year"]);
  const bobsDisk = disk.getItem("upsc-chronicle-store:bob") ?? "";
  assert.ok(bobsDisk.includes("Bob's January") && !bobsDisk.includes("Alice"), "bob's saved copy holds only bob's plans");
  deactivateAccount();
});

/* ── J: two devices ────────────────────────────────────────────── */

test("edits to one plan on two devices at once are all kept, with no false clash", () => {
  const w = week("2027-01-04", { items: [act("A"), act("B")] });
  const base = { plans: [w] };
  const laptop = { plans: [{ ...w, updatedAt: "2027-01-05T10:00:00.000Z", items: [{ ...w.items![0], status: "completed" as const }, w.items![1], act("C from laptop")] }] };
  const phone = { plans: [{ ...w, updatedAt: "2027-01-05T10:05:00.000Z", goalIds: ["g1"], items: [w.items![0], { ...w.items![1], notes: "from phone" }] }] };
  const { value, conflicts } = merge3(base, laptop, phone);
  const merged = value.plans[0];
  assert.equal(conflicts.length, 0, "different fields, so no clash, and the update time isn't one either");
  assert.equal(merged.updatedAt, "2027-01-05T10:05:00.000Z", "the later time is kept");
  assert.equal(merged.items!.find((i) => i.title === "A")?.status, "completed");
  assert.equal(merged.items!.find((i) => i.title === "B")?.notes, "from phone");
  assert.ok(merged.items!.some((i) => i.title === "C from laptop"));
  assert.deepEqual(merged.goalIds, ["g1"]);
  // Journal links added on each device are both kept.
  const b2 = { plans: [{ ...w, items: [{ ...w.items![0], journalDates: ["2027-01-04"] }, w.items![1]] }] };
  const l2 = { plans: [{ ...w, items: [{ ...w.items![0], journalDates: ["2027-01-04", "2027-01-05"] }, w.items![1]] }] };
  const r2 = { plans: [{ ...w, items: [{ ...w.items![0], journalDates: ["2027-01-04", "2027-01-06"] }, w.items![1]] }] };
  assert.deepEqual(merge3(b2, l2, r2).value.plans[0].items![0].journalDates, ["2027-01-04", "2027-01-05", "2027-01-06"]);
});

test("the same week planned on two devices while offline: both are kept and the clash is shown, not hidden", () => {
  const base = { plans: [] as RoadmapPlan[] };
  const a = week("2027-01-04", { title: "From the laptop" });
  const b = week("2027-01-04", { title: "From the phone" });
  const { value } = merge3(base, { plans: [a] }, { plans: [b] });
  assert.equal(value.plans.length, 2, "nothing is thrown away");
  assert.equal(periodClashes(value.plans).length, 1);
});

/* ── tidying data from anywhere ────────────────────────────────── */

test("plans from older devices or hand-edited backups are made consistent, the same way on every device", () => {
  const messy = [
    { id: "w1", level: "week", start: "2027-01-06", end: "2027-03-01", items: [{ id: "i1", title: " Read ", status: "done?" }, { id: "i1", title: "Again" }, { title: "no id" }], parentId: "nope" },
    { id: "w1", level: "week", start: "2027-01-13" },
    { id: "m1", level: "month", start: "2027-02-14", end: "2027-02-15", objectives: ["  ", "Focus "], goalIds: ["g2", "g1", "g2"] },
    { id: "y1", level: "year", year: 2027, start: "2027-05-01", end: "2031-01-01" },
    { id: "bad", level: "decade", start: "2027-01-01" },
    "garbage",
  ];
  const once = normalizePlans(messy);
  assert.deepEqual(normalizePlans(once), once, "idempotent");
  assert.deepEqual(normalizePlans(structuredClone(messy)), once, "deterministic");
  const w1 = once.find((p) => p.id === "w1")!;
  assert.equal(w1.end, "2027-01-12", "a week is always seven days");
  assert.equal(w1.parentId, undefined, "a parent that doesn't exist is dropped, not guessed");
  assert.deepEqual(w1.items!.map((i) => [i.id, i.title, i.status]), [["i1", "Read", "notStarted"], ["i1~2", "Again", "notStarted"]]);
  assert.ok(once.some((p) => p.id === "w1~2" && p.start === "2027-01-13"), "a clashing id is renamed, not dropped");
  const m1 = once.find((p) => p.id === "m1")!;
  assert.deepEqual([m1.start, m1.end], ["2027-02-01", "2027-02-28"]);
  assert.deepEqual(m1.objectives, ["Focus"]);
  assert.deepEqual(m1.goalIds, ["g1", "g2"]);
  assert.deepEqual([once.find((p) => p.id === "y1")!.start, once.find((p) => p.id === "y1")!.end], ["2027-01-01", "2027-12-31"], "an impossible span falls back to the calendar year");
  assert.equal(once.length, 4);
});
