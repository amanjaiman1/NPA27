import { test } from "node:test";
import assert from "node:assert/strict";
import { deepEqual, merge3, mergeTwoWay } from "@/lib/sync/merge";

test("deepEqual ignores key order, as JSONB reorders keys", () => {
  assert.ok(deepEqual({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.ok(!deepEqual({ a: 1 }, { a: 2 }));
  assert.ok(deepEqual({ a: 1, b: undefined }, { a: 1 }));
});

test("edits to different journal days on two devices are both kept", () => {
  const base = { journal: [{ id: "j1", date: "2026-11-01", totalHours: 4 }] };
  const local = { journal: [...base.journal, { id: "j2", date: "2026-11-02", totalHours: 6 }] };
  const remote = { journal: [...base.journal, { id: "j3", date: "2026-11-03", totalHours: 7 }] };
  const { value, conflicts } = merge3(base, local, remote);
  assert.deepEqual(
    value.journal.map((e) => e.date).sort(),
    ["2026-11-01", "2026-11-02", "2026-11-03"],
  );
  assert.equal(conflicts.length, 0);
});

test("different fields of the same entry merge without a clash", () => {
  const base = { journal: [{ date: "2026-11-01", totalHours: 4, mood: 3 }] };
  const local = { journal: [{ date: "2026-11-01", totalHours: 6, mood: 3 }] };
  const remote = { journal: [{ date: "2026-11-01", totalHours: 4, mood: 5 }] };
  const { value, conflicts } = merge3(base, local, remote);
  assert.deepEqual(value.journal[0], { date: "2026-11-01", totalHours: 6, mood: 5 });
  assert.equal(conflicts.length, 0);
});

test("a real clash keeps this device's value and reports the other", () => {
  const base = { profile: { name: "Asha", dailyHourTarget: 8 } };
  const local = { profile: { name: "Asha", dailyHourTarget: 9 } };
  const remote = { profile: { name: "Asha", dailyHourTarget: 10 } };
  const { value, conflicts } = merge3(base, local, remote);
  assert.equal(value.profile.dailyHourTarget, 9);
  assert.deepEqual(conflicts, [{ path: "profile.dailyHourTarget", kept: 9, discarded: 10 }]);
});

test("a deletion on one side wins over no change, but loses to an edit", () => {
  const base = { mocks: [{ id: "m1", score: 90 }, { id: "m2", score: 80 }] };
  const local = { mocks: [{ id: "m2", score: 80 }] }; // m1 deleted here
  const remoteUnchanged = base;
  assert.deepEqual(merge3(base, local, remoteUnchanged).value.mocks.map((m) => m.id), ["m2"]);

  const remoteEdited = { mocks: [{ id: "m1", score: 95 }, { id: "m2", score: 80 }] };
  const kept = merge3(base, local, remoteEdited).value.mocks;
  assert.deepEqual(kept.map((m) => m.id).sort(), ["m1", "m2"]);
  assert.equal(kept.find((m) => m.id === "m1")?.score, 95);
});

test("habit ticks on different days from two devices both survive", () => {
  const base = { habits: [{ id: "news", log: { "2026-11-01": true } }] };
  const local = { habits: [{ id: "news", log: { "2026-11-01": true, "2026-11-02": true } }] };
  const remote = { habits: [{ id: "news", log: { "2026-11-01": true, "2026-11-03": true } }] };
  const { value } = merge3(base, local, remote);
  assert.deepEqual(Object.keys(value.habits[0].log).sort(), ["2026-11-01", "2026-11-02", "2026-11-03"]);
});

test("accomplished days merge as a set", () => {
  const base = { accomplished: ["2026-11-01"] };
  const local = { accomplished: ["2026-11-01", "2026-11-02"] };
  const remote = { accomplished: ["2026-11-03"] }; // 11-01 removed remotely
  assert.deepEqual(merge3(base, local, remote).value.accomplished, ["2026-11-02", "2026-11-03"]);
});

test("two-way merge keeps everything from both sides", () => {
  const local = { journal: [{ date: "2026-11-02", totalHours: 5 }], profile: { name: "Old" } };
  const remote = { journal: [{ date: "2026-11-03", totalHours: 6 }], profile: { name: "New" } };
  const { value, conflicts } = mergeTwoWay(local, remote, "remote");
  assert.deepEqual(value.journal.map((e) => e.date).sort(), ["2026-11-02", "2026-11-03"]);
  assert.equal(value.profile.name, "New");
  assert.equal(conflicts.length, 1);
});
