import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { useChronicle, blankChronicleState } from "@/lib/store";
import type { FileRecord, Goal, JournalEntry, Subject } from "@/lib/types";
import { toISODate } from "@/lib/utils";
import { shiftDay } from "@/lib/life";

const store = () => useChronicle.getState();
const today = toISODate(new Date());

const subjects: Subject[] = [
  {
    id: "polity",
    name: "Polity",
    paper: "GS2",
    topics: [
      { id: "t-fr", name: "Fundamental Rights", status: "untouched", confidence: 0, revisionCount: 0 },
      { id: "t-dpsp", name: "Directive Principles", status: "mastered", confidence: 90, revisionCount: 2 },
    ],
  },
];

const record = (id: string, sha = `sha-${id}`): FileRecord => ({
  id,
  sha256: sha,
  path: `user-1/${sha}`,
  name: `${id}.png`,
  type: "image/png",
  size: 2048,
  addedAt: `${today}T08:00:00.000Z`,
});

const entry = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [{ subjectId: "polity", hours: 2 }],
  totalHours: 2,
  mood: 4,
  energy: 4,
  motivation: 4,
  focus: 4,
  ...over,
});

const goal = (id: string, over: Partial<Goal> = {}): Goal => ({
  id,
  title: `Goal ${id}`,
  horizon: "Weekly",
  metric: "studyHours",
  target: 10,
  status: "Active",
  createdOn: shiftDay(today, -10),
  ...over,
});

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState({ ...blankChronicleState(), subjects: structuredClone(subjects), goals: [goal("g1"), goal("g2")] });
});

test("changing an entry's date moves it, with its goal links, instead of copying it", () => {
  const a = shiftDay(today, -3);
  const b = shiftDay(today, -2);
  store().saveJournalEntry({ entry: entry(a), goalIds: ["g1"] });
  assert.deepEqual(store().goals.find((g) => g.id === "g1")!.journalDates, [a]);

  const moved = store().saveJournalEntry({ entry: entry(b), previousDate: a });
  assert.equal(moved.isNewDay, true);
  assert.deepEqual(store().journal.map((e) => e.date), [b], "the old day is gone");
  assert.deepEqual(store().goals.find((g) => g.id === "g1")!.journalDates, [b], "the link moved with it");
  assert.equal(store().goals.find((g) => g.id === "g2")!.journalDates, undefined);

  store().saveJournalEntry({ entry: entry(b), goalIds: [] });
  assert.equal(store().goals.find((g) => g.id === "g1")!.journalDates, undefined, "unticking removes the link");
});

test("the same file attached twice is stored once", () => {
  const d1 = shiftDay(today, -1);
  store().saveJournalEntry({ entry: entry(d1, { fileIds: ["f1"] }), newFiles: [record("f1", "same")] });
  // Another day, a second upload of identical bytes under a new local id.
  store().saveJournalEntry({ entry: entry(today, { fileIds: ["f2"] }), newFiles: [record("f2", "same")] });
  assert.equal(store().files.length, 1);
  assert.deepEqual(store().journal.find((e) => e.date === today)!.fileIds, ["f1"], "points at the existing record");
});

test("finishing a syllabus topic credits it and can schedule its first revision", () => {
  const res = store().saveJournalEntry({
    entry: entry(today, {
      completedTopics: [
        { id: "c1", name: "Fundamental Rights", subjectId: "polity", topicId: "t-fr" },
        { id: "c2", name: "Directive Principles", subjectId: "polity", topicId: "t-dpsp" },
        { id: "c3", name: "My own notes" },
      ],
    }),
    scheduleRevision: true,
  });
  const topics = store().subjects[0].topics;
  assert.equal(topics.find((t) => t.id === "t-fr")!.status, "learning");
  assert.equal(topics.find((t) => t.id === "t-dpsp")!.status, "mastered", "never moved backwards");
  assert.equal(res.topicsCredited, 1);
  assert.equal(res.revisionsScheduled, 2);
  const fr = store().revisions.find((r) => r.topic === "Fundamental Rights")!;
  assert.equal(fr.nextDue, shiftDay(today, 1), "first pass the next day");

  // Saving the same day again doesn't queue the same topic twice.
  const again = store().saveJournalEntry({ entry: store().journal[0], scheduleRevision: true });
  assert.equal(again.revisionsScheduled, 0);
  assert.equal(store().revisions.length, 2);
});

test("a revision for a day logged late is never due in the past", () => {
  const old = shiftDay(today, -7);
  store().saveJournalEntry({
    entry: entry(old, { completedTopics: [{ id: "c1", name: "Fundamental Rights", subjectId: "polity", topicId: "t-fr" }] }),
    scheduleRevision: true,
  });
  assert.equal(store().revisions[0].nextDue, today);
});

test("replacing a file keeps the goal and life links; unlinking never deletes", () => {
  const d = shiftDay(today, -1);
  store().saveJournalEntry({ entry: entry(d, { fileIds: ["old"] }), newFiles: [record("old")] });
  store().linkFiles({ kind: "goal", id: "g1" }, ["old", "not-a-file"]);
  store().linkFiles({ kind: "life", date: d }, ["old"]);
  assert.deepEqual(store().goals.find((g) => g.id === "g1")!.fileIds, ["old"], "unknown ids are ignored");
  assert.deepEqual(store().lifeLog.find((l) => l.date === d)!.fileIds, ["old"]);

  store().saveJournalEntry({
    entry: entry(d, { fileIds: ["new"] }),
    newFiles: [record("new")],
    replaced: { old: "new" },
  });
  assert.deepEqual(store().files.map((f) => f.id), ["new"]);
  assert.deepEqual(store().goals.find((g) => g.id === "g1")!.fileIds, ["new"]);
  assert.deepEqual(store().lifeLog.find((l) => l.date === d)!.fileIds, ["new"]);
  assert.deepEqual(store().fileTrash, ["user-1/sha-old"], "the replaced object is queued for deletion");

  store().unlinkFile({ kind: "goal", id: "g1" }, "new");
  assert.equal(store().goals.find((g) => g.id === "g1")!.fileIds, undefined);
  assert.equal(store().files.length, 1, "the file stays with its journal day");
});

test("deleting the last day that holds a file removes it everywhere", () => {
  const d = shiftDay(today, -1);
  store().saveJournalEntry({ entry: entry(d, { fileIds: ["f"] }), newFiles: [record("f")], goalIds: ["g2"] });
  store().linkFiles({ kind: "goal", id: "g2" }, ["f"]);
  store().deleteJournal(d);
  assert.equal(store().journal.length, 0);
  assert.equal(store().files.length, 0);
  const g2 = store().goals.find((g) => g.id === "g2")!;
  assert.equal(g2.fileIds, undefined);
  assert.equal(g2.journalDates, undefined);
  assert.deepEqual(store().fileTrash, ["user-1/sha-f"]);
  store().clearFileTrash(["user-1/sha-f"]);
  assert.deepEqual(store().fileTrash, []);
});

test("goal history: one reading a day, milestones dated, completion recorded and cleared", () => {
  store().upsertGoal(goal("m", { metric: "manual", target: 100, current: 0, milestones: [{ id: "s1", title: "Read part 1" }] }));
  store().logGoalProgress("m", 10, "first go");
  store().logGoalProgress("m", 25);
  const g = store().goals.find((x) => x.id === "m")!;
  assert.equal(g.current, 25);
  assert.equal(g.progressLog?.length, 1, "a second update the same day replaces the first");
  assert.equal(g.progressLog?.[0].value, 25);

  store().toggleGoalMilestone("m", "s1");
  assert.equal(store().goals.find((x) => x.id === "m")!.milestones?.[0].doneOn, today);
  store().toggleGoalMilestone("m", "s1");
  assert.equal(store().goals.find((x) => x.id === "m")!.milestones?.[0].doneOn, undefined);

  store().setGoalStatus("m", "Completed");
  assert.equal(store().goals.find((x) => x.id === "m")!.completedOn, today);
  store().setGoalStatus("m", "Active");
  assert.equal(store().goals.find((x) => x.id === "m")!.completedOn, undefined);

  store().addGoalNote("m", "  Mornings work better  ");
  const note = store().goals.find((x) => x.id === "m")!.notes![0];
  assert.equal(note.text, "Mornings work better");
  store().deleteGoalNote("m", note.id);
  assert.equal(store().goals.find((x) => x.id === "m")!.notes, undefined);
});

test("a Life Dashboard day saves only what was recorded", () => {
  store().upsertLifeEntry({ id: "x", date: today, waterLiters: 0, sleepHours: undefined, note: "" });
  const day = store().lifeLog.find((l) => l.date === today)!;
  assert.deepEqual(day, { id: `life-${today}`, date: today, waterLiters: 0 });
  store().deleteLifeEntry(today);
  assert.equal(store().lifeLog.length, 0);
});
