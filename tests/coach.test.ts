import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChronicleData, CoachLog, Goal, JournalEntry, PlanItem, Profile, Reflection, RevisionItem, RoadmapPlan, Subject } from "@/lib/types";
import {
  buildBriefing,
  buildRecommendations,
  coachDataOf,
  latestDecisions,
  visibleRecommendations,
  type CoachInput,
  type Recommendation,
} from "@/lib/coach";
import * as mentor from "@/lib/mentor";

/* Thursday 19 November 2026; this week runs from Monday the 16th. */
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
  { id: "polity", name: "Polity", paper: "GS2", weightage: 60, topics: [{ id: "t1", name: "Parliament", status: "learning", confidence: 40, revisionCount: 1 }] },
  {
    id: "economy",
    name: "Economy",
    paper: "GS3",
    weightage: 80,
    topics: [
      { id: "t2", name: "Inflation", status: "untouched", confidence: 0, revisionCount: 0 },
      { id: "t3", name: "Banking", status: "untouched", confidence: 0, revisionCount: 0 },
    ],
  },
];

const day = (date: string, hours: number, subjectId = "polity"): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [{ subjectId, hours }],
  totalHours: hours,
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
});

const revision = (id: string, nextDue: string): RevisionItem => ({
  id,
  subjectId: "polity",
  topic: `Topic ${id}`,
  addedOn: "2026-10-01",
  nextDue,
  intervalDays: 3,
  repetitions: 1,
  confidence: 3,
});

const thisWeek = (items: PlanItem[] = []): RoadmapPlan => ({
  id: "w",
  level: "week",
  start: "2026-11-16",
  end: "2026-11-22",
  items,
  createdAt: "2026-11-16T08:00:00",
  updatedAt: "2026-11-16T08:00:00",
});

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  title: "A goal",
  horizon: "Monthly",
  status: "Active",
  createdOn: "2026-11-01",
  target: 180,
  ...over,
});

function input(over: Partial<CoachInput> = {}): CoachInput {
  return {
    profile,
    journal: [day("2026-11-17", 6), day("2026-11-18", 5)],
    subjects,
    revisions: [],
    plans: [],
    habits: [],
    goals: [],
    mocks: [],
    lifeLog: [],
    books: [],
    currentAffairs: [],
    mistakes: [],
    ...over,
  };
}

const ids = (recs: Recommendation[]) => recs.map((r) => r.id);

test("the same records always give the same advice, and reading them changes nothing", () => {
  const data = input({ revisions: ["a", "b", "c"].map((id) => revision(id, "2026-11-10")), plans: [thisWeek()] });
  const before = JSON.stringify(data);
  const first = buildRecommendations(data, TODAY);
  assert.deepEqual(buildRecommendations(data, TODAY), first);
  assert.deepEqual(buildBriefing(data, first, TODAY), buildBriefing(data, first, TODAY));
  assert.equal(JSON.stringify(data), before);
});

test("overdue revision is spread four a day from today, as a proposal", () => {
  const overdue = ["a", "b", "c", "d", "e"].map((id, i) => revision(id, `2026-11-1${i}`));
  const rec = buildRecommendations(input({ revisions: overdue }), TODAY).find((r) => r.id === "revision:overdue");
  assert.ok(rec);
  assert.equal(rec.title, "Clear 5 overdue revisions");
  const change = rec.changes?.[0];
  assert.equal(change?.kind, "rescheduleRevision");
  if (change?.kind !== "rescheduleRevision") return;
  assert.deepEqual(
    change.moves.map((m) => m.to),
    [TODAY, TODAY, TODAY, TODAY, "2026-11-20"],
  );
  // Fewer than three is left to the queue itself.
  assert.ok(!ids(buildRecommendations(input({ revisions: overdue.slice(0, 2) }), TODAY)).includes("revision:overdue"));
});

test("a subject left out lately is brought back into this week's plan, unless the plan already has it", () => {
  const recs = buildRecommendations(input({ plans: [thisWeek()] }), TODAY);
  const rec = recs.find((r) => r.id === "neglected:economy");
  assert.ok(rec);
  assert.ok(!ids(recs).includes("neglected:polity"));
  assert.deepEqual(rec.changes, [
    {
      kind: "addActivity",
      planId: "w",
      title: "Economy: Inflation",
      subjectId: "economy",
      priority: "High",
      targetDate: "2026-11-20",
      text: rec.changes?.[0]?.text,
    },
  ]);

  const planned = thisWeek([
    { id: "x", kind: "activity", title: "Economy reading", subjectId: "economy", status: "notStarted", createdAt: "2026-11-16T08:00:00" },
  ]);
  const again = buildRecommendations(input({ plans: [planned] }), TODAY).find((r) => r.id === "neglected:economy");
  assert.ok(again);
  assert.equal(again.changes, undefined);
});

test("the Personal Diary never reaches the coach, not even as a count", () => {
  const entry: Reflection = { id: "r1", date: "2026-11-18", content: "Private words" };
  const state = { ...input(), reflections: [entry] } as unknown as ChronicleData;
  assert.equal("reflections" in coachDataOf(state), false);

  // Both goals are far behind pace; only the one that doesn't count diary entries is raised.
  const goals = [
    goal({ id: "diary", title: "Write in the diary", metric: "reflectionsWritten", target: 20 }),
    goal({ id: "hours", title: "180 hours this month", metric: "studyHours" }),
  ];
  const recs = buildRecommendations(input({ goals }), TODAY);
  assert.ok(ids(recs).includes("goal:hours"));
  assert.ok(!ids(recs).includes("goal:diary"));
  assert.ok(!buildBriefing(input({ goals }), [], TODAY).goals.some((g) => g.title === "Write in the diary"));
});

test("a decision keeps a recommendation away until its evidence changes", () => {
  const rec = buildRecommendations(input({ plans: [thisWeek()] }), TODAY).find((r) => r.id === "neglected:economy");
  assert.ok(rec);
  const decide = (status: "accepted" | "dismissed", fingerprint: string, at = "2026-11-19T09:00:00Z"): CoachLog => ({
    decisions: [{ id: `d-${status}`, recId: rec.id, status, title: rec.title, fingerprint, at }],
    briefings: [],
  });

  const dismissed = visibleRecommendations([rec], decide("dismissed", rec.fingerprint));
  assert.deepEqual([dismissed.shown.length, dismissed.settled.length], [0, 1]);

  const renewed = visibleRecommendations([rec], decide("dismissed", "older evidence"));
  assert.equal(renewed.shown[0]?.renewed, true);

  const accepted = visibleRecommendations([rec], decide("accepted", rec.fingerprint));
  assert.equal(accepted.shown[0]?.decision?.status, "accepted");

  // The latest decision is the one that counts.
  const log: CoachLog = {
    decisions: [
      { id: "1", recId: rec.id, status: "dismissed", title: rec.title, fingerprint: rec.fingerprint, at: "2026-11-19T10:00:00Z" },
      { id: "2", recId: rec.id, status: "accepted", title: rec.title, fingerprint: rec.fingerprint, at: "2026-11-18T10:00:00Z" },
    ],
    briefings: [],
  };
  assert.equal(latestDecisions(log).get(rec.id)?.id, "1");
});

test("the briefing leads with the exam countdown and at most three priorities", () => {
  const data = input({ revisions: ["a", "b", "c"].map((id) => revision(id, "2026-11-10")), plans: [thisWeek()] });
  const recs = visibleRecommendations(buildRecommendations(data, TODAY), undefined).shown;
  const b = buildBriefing(data, recs, TODAY);
  assert.match(b.headline, /^185 days to UPSC CSE 2027\. 11 h studied this week/);
  assert.ok(b.priorities.length <= 3);
  assert.equal(b.priorities[0].text, recs[0].title);
});

test("the coach shows no AI prompt: its talk is fixed rules over your records", () => {
  for (const gone of ["MENTOR_SYSTEM_PROMPT", "composeMentorPrompt", "buildContextDigest"]) {
    assert.equal(gone in mentor, false, `${gone} should no longer exist`);
  }
  const state = { ...input(), reflections: [], accomplished: [], sleep: [], exercise: [], milestones: [], reviews: [], topicLinks: [], selection: [], files: [], coach: { decisions: [], briefings: [] } } as unknown as ChronicleData;
  const ctx = mentor.buildMentorContext(state, TODAY);
  const reply = mentor.mentorReply(ctx, state, "Which subject should I focus on?");
  assert.equal(mentor.mentorReply(ctx, state, "Which subject should I focus on?"), reply);
  assert.ok(reply.length > 0);
});
