import { test } from "node:test";
import assert from "node:assert/strict";
import type { Goal } from "@/lib/types";
import {
  byPriority,
  computeGoalProgress,
  goalCategory,
  goalViewCounts,
  inGoalView,
  validateGoal,
  type GoalData,
} from "@/lib/goals";

const TODAY = "2026-11-15";
const empty: GoalData = {
  journal: [],
  subjects: [],
  mocks: [],
  revisions: [],
  books: [],
  currentAffairs: [],
  reflections: [],
  mistakes: [],
  lifeLog: [],
};

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  title: "A goal",
  horizon: "Weekly",
  metric: "manual",
  target: 10,
  current: 0,
  status: "Active",
  createdOn: "2026-11-01",
  ...over,
});

test("a milestone goal's progress is the share of its steps done", () => {
  const g = goal({
    metric: "milestones",
    target: 0,
    milestones: [
      { id: "a", title: "Part 1", doneOn: "2026-11-10" },
      { id: "b", title: "Part 2" },
      { id: "c", title: "Part 3" },
      { id: "d", title: "Part 4", doneOn: "2026-11-12" },
    ],
  });
  const p = computeGoalProgress(g, empty, TODAY);
  assert.equal(p.target, 4, "the target is the number of steps, whatever was typed");
  assert.equal(p.current, 2);
  assert.equal(p.pct, 50);
  const none = computeGoalProgress(goal({ metric: "milestones" }), empty, TODAY);
  assert.equal(none.health, "unmeasurable");
});

test("views: overdue goals are active ones past their date; completed and paused have their own", () => {
  const all = [
    goal({ id: "late", horizon: "Long-term", deadline: "2026-11-10" }),
    goal({ id: "fine", horizon: "Long-term", deadline: "2026-12-10" }),
    goal({ id: "done", status: "Completed" }),
    goal({ id: "rest", status: "Paused" }),
  ].map((g) => computeGoalProgress(g, empty, TODAY));
  const counts = goalViewCounts(all);
  assert.deepEqual(counts, { active: 2, overdue: 1, completed: 1, paused: 1, all: 4 });
  assert.deepEqual(all.filter((p) => inGoalView(p, "overdue")).map((p) => p.goal.id), ["late"]);
});

test("priority sorts high first and the category follows the measure until chosen", () => {
  const list = [
    goal({ id: "low", priority: "Low" }),
    goal({ id: "high", priority: "High" }),
    goal({ id: "medium" }),
  ].map((g) => computeGoalProgress(g, empty, TODAY));
  assert.deepEqual([...list].sort(byPriority).map((p) => p.goal.id), ["high", "medium", "low"]);
  assert.equal(goalCategory(goal({ metric: "mocksTaken" })), "Mock tests");
  assert.equal(goalCategory(goal({ metric: "mocksTaken", category: "Personal" })), "Personal");
});

test("goal validation flags each problem next to its field", () => {
  assert.deepEqual(validateGoal(goal({}), TODAY, true), {});
  assert.ok(validateGoal(goal({ title: "  " }), TODAY, true).title);
  assert.ok(validateGoal(goal({ target: -1 }), TODAY, true).target);
  assert.ok(validateGoal(goal({ metric: "mockAverage", target: 120 }), TODAY, true).target, "a percentage over 100");
  assert.ok(validateGoal(goal({ metric: "subjectHours" }), TODAY, true).subject);
  assert.ok(validateGoal(goal({ metric: "milestones", milestones: [{ id: "a", title: " " }] }), TODAY, true).milestones);
  assert.ok(validateGoal(goal({ deadline: "2026-11-01" }), TODAY, true).deadline, "a new goal can't be due in the past");
  assert.equal(validateGoal(goal({ deadline: "2026-11-05" }), TODAY, false).deadline, undefined, "an existing one can stay overdue");
});
