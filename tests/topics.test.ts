import { test } from "node:test";
import assert from "node:assert/strict";
import type { JournalEntry, RevisionItem, Subject } from "@/lib/types";
import {
  EMPTY_TOPIC_QUERY,
  buildTopicIndex,
  completedTopicsOf,
  filterTopics,
  matchSyllabusTopic,
  searchTopicOptions,
  upgradeEntryTopics,
} from "@/lib/topics";

const subjects: Subject[] = [
  {
    id: "polity",
    name: "Polity",
    paper: "GS2",
    topics: [
      { id: "t-fr", name: "Fundamental Rights", status: "learning", confidence: 40, revisionCount: 0 },
      { id: "t-dpsp", name: "Directive Principles", status: "untouched", confidence: 0, revisionCount: 0 },
      { id: "t-intro-p", name: "Introduction", status: "untouched", confidence: 0, revisionCount: 0 },
    ],
  },
  {
    id: "history",
    name: "Modern History",
    paper: "GS1",
    topics: [
      { id: "t-1857", name: "Revolt of 1857", status: "mastered", confidence: 90, revisionCount: 3 },
      { id: "t-intro-h", name: "Introduction", status: "untouched", confidence: 0, revisionCount: 0 },
    ],
  },
];

const day = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [],
  totalHours: 2,
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
  ...over,
});

test("free-text topics link to the syllabus only on a unique exact match", () => {
  assert.deepEqual(matchSyllabusTopic("  fundamental   rights ", subjects), {
    subjectId: "polity",
    topicId: "t-fr",
    name: "Fundamental Rights",
  });
  assert.equal(matchSyllabusTopic("Introduction", subjects), null, "ambiguous across subjects: left unlinked");
  assert.equal(matchSyllabusTopic("Introduction", subjects, "history")?.topicId, "t-intro-h");
  assert.equal(matchSyllabusTopic("Fundamental", subjects), null, "no partial guesses");
});

test("old entries move onto linked completions, once", () => {
  const old = day("2026-11-01", { topicsCompleted: ["Fundamental Rights", "My own notes", " "] });
  const up = upgradeEntryTopics(old, subjects);
  assert.equal(up.topicsCompleted, undefined);
  assert.deepEqual(
    up.completedTopics?.map((c) => [c.name, c.topicId ?? null]),
    [
      ["Fundamental Rights", "t-fr"],
      ["My own notes", null],
    ],
  );
  assert.equal(upgradeEntryTopics(up, subjects), up, "already upgraded: the same object comes back");
  // Ids are deterministic, so two devices upgrading the same entry agree.
  assert.deepEqual(upgradeEntryTopics(old, subjects), up);
  assert.deepEqual(completedTopicsOf(old).map((c) => c.name), ["Fundamental Rights", "My own notes"]);
});

test("the picker finds syllabus topics and topics saved on earlier days", () => {
  const journal = [
    day("2026-11-02", { completedTopics: [{ id: "c1", name: "Answer writing drill", subjectId: "polity" }] }),
    day("2026-11-03", { completedTopics: [{ id: "c2", name: "Fundamental Rights", subjectId: "polity", topicId: "t-fr" }] }),
  ];
  const fr = searchTopicOptions("fund", subjects, journal);
  assert.equal(fr[0].topicId, "t-fr");
  assert.equal(fr[0].timesDone, 1);
  assert.equal(fr[0].lastDone, "2026-11-03");

  const saved = searchTopicOptions("drill", subjects, journal);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].source, "saved");
  assert.equal(saved[0].key, "custom:answer writing drill");

  assert.equal(searchTopicOptions("fund", subjects, journal, { exclude: new Set(["t-fr"]) }).length, 0);
  assert.ok(searchTopicOptions("revolt", subjects, journal, { subjectId: "polity" }).every((o) => o.subjectId === "polity"));
  // Nothing typed: most recently finished first.
  assert.equal(searchTopicOptions("", subjects, journal)[0].name, "Fundamental Rights");
});

test("the topics explorer joins days, syllabus, revisions and mistakes, and filters by subject, source and date", () => {
  const journal = [
    day("2026-11-01", { completedTopics: [{ id: "a", name: "Fundamental Rights", subjectId: "polity", topicId: "t-fr" }] }),
    day("2026-11-05", {
      completedTopics: [
        { id: "b", name: "Fundamental Rights", subjectId: "polity", topicId: "t-fr" },
        { id: "c", name: "Revolt of 1857", subjectId: "history", topicId: "t-1857" },
        { id: "d", name: "Own reading list" },
      ],
    }),
  ];
  const revisions: RevisionItem[] = [
    { id: "r1", subjectId: "polity", topic: "Fundamental Rights", addedOn: "2026-11-01", nextDue: "2026-11-04", intervalDays: 3, repetitions: 1, confidence: 3 },
  ];
  const index = buildTopicIndex(journal, subjects, revisions, [], "2026-11-06");
  const fr = index.find((r) => r.topicId === "t-fr")!;
  assert.deepEqual(fr.dates, ["2026-11-01", "2026-11-05"]);
  assert.equal(fr.revisionState, "due");
  assert.equal(index.find((r) => r.topicId === "t-1857")!.revisionState, "none");
  assert.equal(index.find((r) => r.source === "custom")!.name, "Own reading list");

  const q = (over: Partial<typeof EMPTY_TOPIC_QUERY>) => filterTopics(index, { ...EMPTY_TOPIC_QUERY, ...over }, subjects).map((r) => r.name);
  assert.deepEqual(q({ subjectId: "history" }), ["Revolt of 1857"]);
  assert.deepEqual(q({ source: "custom" }), ["Own reading list"]);
  assert.deepEqual(q({ from: "2026-11-01", to: "2026-11-02" }), ["Fundamental Rights"]);
  assert.deepEqual(q({ q: "gs1" }), ["Revolt of 1857"], "search covers the subject's paper");
  assert.deepEqual(q({ sort: "count" })[0], "Fundamental Rights");
  assert.deepEqual(q({ sort: "name" }), ["Fundamental Rights", "Own reading list", "Revolt of 1857"]);
});
