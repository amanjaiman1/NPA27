import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountTemplate, createBlankAccount, defaultSetup } from "@/lib/seed";
import { normalizeProfile } from "@/lib/account/normalize";

test("a blank account has no personal records and still needs setup", () => {
  const blank = createBlankAccount();
  assert.equal(blank.profile.name, "");
  assert.equal(blank.profile.onboardedAt, undefined);
  for (const key of ["journal", "mocks", "mistakes", "goals", "reflections", "reviews", "milestones", "revisions", "currentAffairs", "lifeLog", "accomplished"] as const) {
    assert.equal(blank[key].length, 0, `${key} starts empty`);
  }
});

test("no account starts with anyone's personal details", () => {
  const json = JSON.stringify(createAccountTemplate({ ...defaultSetup(), name: "Asha" }));
  for (const personal of ["Aman", "Jaiman", "National Police Academy", "IPS", "Do or die"]) {
    assert.ok(!json.includes(personal), `template mentions "${personal}"`);
  }
});

test("the optional chosen at setup shapes the syllabus and books", () => {
  const law = createAccountTemplate({ ...defaultSetup(), name: "A", optionalSubject: "Law", targetExam: "UPSC CSE 2028" });
  assert.ok(law.subjects.some((s) => s.id === "optional-law" && s.paper === "Optional"));
  assert.ok(!law.subjects.some((s) => s.id === "sociology"));
  assert.ok(!law.books.some((b) => b.subjectId === "sociology"));
  // The Selection Archive is retired: a new account keeps no stages.
  assert.deepEqual(law.selection, []);

  const ids = new Set(law.subjects.flatMap((s) => s.topics.map((t) => t.id)));
  assert.ok(law.topicLinks.length > 0);
  assert.ok(law.topicLinks.every((l) => ids.has(l.source) && ids.has(l.target)), "every graph link points at a real topic");

  const soc = createAccountTemplate({ ...defaultSetup(), name: "B", optionalSubject: "Sociology" });
  assert.ok(soc.subjects.find((s) => s.id === "sociology")?.topics.length);
  assert.ok(soc.topicLinks.length > law.topicLinks.length, "sociology's curated links are included");
});

test("an existing named profile is treated as already set up, once", () => {
  // The shape the old app saved: no `onboardedAt`, no `timezone`.
  const legacy = {
    name: "Owner",
    targetExam: "UPSC CSE 2027",
    examDate: "2027-05-24",
    attemptNumber: 2,
    optionalSubject: "Sociology",
    startDate: "2026-06-15",
    dailyHourTarget: 9,
  };
  const once = normalizeProfile(legacy);
  assert.equal(once.onboardedAt, "2026-06-15");
  assert.equal("useRoadmap" in once, false, "the retired roadmap switch isn't added");
  assert.equal(normalizeProfile(once), once, "idempotent");
  assert.equal(normalizeProfile(createBlankAccount().profile).onboardedAt, undefined, "a blank profile still goes to setup");
});
