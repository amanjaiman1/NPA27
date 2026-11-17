import { test } from "node:test";
import assert from "node:assert/strict";
import type { JournalEntry, LifeEntry, Subject, ThemeMode } from "@/lib/types";
import { hasInventedLifeReadings, isMorningStub, normalizeSnapshot } from "@/lib/account/normalize";
import { surfaceFor, themeModeFromSurface } from "@/lib/theme";

const stub = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j-${date}`,
  date,
  wakeTime: "06:10",
  sleepTime: "23:40",
  blocks: [],
  totalHours: 0,
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
  ...over,
});

const subjects: Subject[] = [
  {
    id: "polity",
    name: "Polity",
    paper: "GS2",
    topics: [{ id: "t-fr", name: "Fundamental Rights", status: "untouched", confidence: 0, revisionCount: 0 }],
  },
];

test("a morning check-in placeholder is recognised; a real entry never is", () => {
  assert.equal(isMorningStub(stub("2026-11-10")), true);
  assert.equal(isMorningStub(stub("2026-11-10", { mood: 4 })), false, "a rating you changed");
  assert.equal(isMorningStub(stub("2026-11-10", { reflection: "Tired" })), false);
  assert.equal(isMorningStub(stub("2026-11-10", { totalHours: 1 })), false);
  assert.equal(isMorningStub(stub("2026-11-10", { fileIds: ["f1"] })), false);
});

test("placeholders go, and their bed and wake times move to the Life Dashboard day", () => {
  const out = normalizeSnapshot({
    journal: [stub("2026-11-10"), stub("2026-11-11", { totalHours: 5 })],
    lifeLog: [] as LifeEntry[],
    subjects,
  });
  assert.deepEqual(out.journal.map((e) => e.date), ["2026-11-11"]);
  assert.deepEqual(out.lifeLog, [{ id: "life-2026-11-10", date: "2026-11-10", bedtime: "23:40", wakeTime: "06:10" }]);
});

test("invented Life Dashboard readings become not recorded; anything changed is kept", () => {
  const invented: LifeEntry = {
    id: "life-2026-11-10",
    date: "2026-11-10",
    sleepHours: 7.2,
    sleepQuality: 3,
    walkKm: 0,
    runKm: 0,
    exerciseMinutes: 0,
    waterLiters: 2,
    meditationMin: 0,
    screenTimeMin: 120,
    deepWorkHours: 0,
  };
  assert.equal(hasInventedLifeReadings(invented), true);
  assert.equal(hasInventedLifeReadings({ ...invented, waterLiters: 2.5 }), false);
  assert.equal(hasInventedLifeReadings({ ...invented, weightKg: 70 }), false);

  const out = normalizeSnapshot({ journal: [] as JournalEntry[], lifeLog: [invented, { ...invented, date: "2026-11-11", id: "x", screenTimeMin: 45 }] });
  assert.deepEqual(out.lifeLog[0], { id: "life-2026-11-10", date: "2026-11-10", sleepHours: 7.2 }, "the night's own length stays");
  assert.equal(out.lifeLog[1].screenTimeMin, 45);
  assert.equal(out.lifeLog[1].waterLiters, 2, "a day you edited keeps every value");
});

test("two days with the same id get distinct ids, and free-text topics link to the syllabus", () => {
  const a = stub("2026-11-10", { id: "dup", totalHours: 2, topicsCompleted: ["fundamental rights"] });
  const b = stub("2026-11-11", { id: "dup", totalHours: 3 });
  const out = normalizeSnapshot({ journal: [a, b], lifeLog: [] as LifeEntry[], subjects });
  const ids = out.journal.map((e) => e.id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(ids, ["dup", "dup_2026-11-11"]);
  assert.equal(out.journal[0].completedTopics?.[0].topicId, "t-fr");
  assert.equal(out.journal[0].topicsCompleted, undefined);
  // Idempotent: a second pass changes nothing.
  assert.deepEqual(normalizeSnapshot(out), out);
});

test("the old five surfaces become Light or Dark", () => {
  assert.equal(themeModeFromSurface("white"), "light");
  for (const s of ["black", "navy", "velvet", "abyss"]) assert.equal(themeModeFromSurface(s), "dark");
  const legacy: { surface?: unknown; themeMode?: ThemeMode } = { surface: "navy" };
  const out = normalizeSnapshot(legacy);
  assert.equal(out.themeMode, "dark");
  assert.equal("surface" in out, false);
  assert.equal(normalizeSnapshot({ surface: "white", themeMode: "system" as const }).themeMode, "system", "a chosen mode wins");
  assert.equal(surfaceFor("system", true), "black");
  assert.equal(surfaceFor("system", false), "white");
  assert.equal(surfaceFor("dark", false), "black");
});
