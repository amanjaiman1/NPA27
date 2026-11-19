import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChronicleData, Habit, JournalEntry, Profile, Review, RevisionItem, RoadmapPlan } from "@/lib/types";
import {
  DIGEST_TAG,
  TEST_TAG,
  buildInbox,
  evaluate,
  foldDeviceDeliveries,
  inQuietHours,
  planDelivery,
  pruneDeliveryLog,
  recordDelivery,
  staleStateIds,
  withDefaults,
  type Inbox,
  type Notice,
  type NoticeView,
} from "@/lib/notifications";

/* Every instant here is built from local fields, so the suite reads the same
   in any timezone the tests happen to run in. */
const at = (h: number, m = 0, day = 15) => new Date(2026, 10, day, h, m);
const TODAY = "2026-11-15";

const profile: Profile = {
  name: "Tester",
  targetExam: "UPSC CSE 2028",
  // Far enough away that no countdown milestone is crossed.
  examDate: "2028-05-28",
  attemptNumber: 1,
  optionalSubject: "",
  // Started today, so nothing is "overdue" for a fortnight it never lived.
  startDate: TODAY,
  dailyHourTarget: 8,
};

function data(over: Partial<ChronicleData> = {}): ChronicleData {
  return {
    profile,
    accomplished: [],
    subjects: [],
    journal: [],
    mocks: [],
    revisions: [],
    currentAffairs: [],
    mistakes: [],
    habits: [],
    sleep: [],
    exercise: [],
    lifeLog: [],
    goals: [],
    books: [],
    milestones: [],
    reflections: [],
    reviews: [],
    topicLinks: [],
    selection: [],
    files: [],
    plans: [],
    coach: { decisions: [], briefings: [] },
    ...over,
  };
}

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

const day = (date: string, hours: number): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: hours > 0 ? [{ subjectId: "polity", hours }] : [],
  totalHours: hours,
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
});

const habit = (id: string, log: Record<string, boolean> = {}): Habit => ({
  id,
  name: `Habit ${id}`,
  cadence: "daily",
  createdOn: "2026-11-01",
  log,
});

const ids = (list: Notice[]) => list.map((n) => n.id);
const rules = (list: Notice[]) => list.map((n) => n.ruleId);

function notice(over: Partial<NoticeView> & { id: string }): NoticeView {
  return {
    ruleId: "revision-overdue",
    category: "revision",
    priority: "high",
    title: over.id,
    body: "",
    href: "/revision",
    cta: "Open",
    dedupeKey: over.id.split(":")[0],
    read: false,
    ...over,
  };
}

function inboxOf(items: NoticeView[]): Inbox {
  return {
    items,
    groups: [],
    unread: items.filter((i) => !i.read).length,
    deliverable: items.filter((i) => !i.read && i.priority !== "low"),
  };
}

/* ── the rules ───────────────────────────────────────────────── */

test("nothing at all is evaluated when notifications are switched off", () => {
  const d = data({ revisions: [revision("a", "2026-11-01")] });
  assert.equal(evaluate(d, { now: at(12), settings: { enabled: false } }).length, 0);
  assert.ok(evaluate(d, { now: at(12) }).length > 0);
});

test("overdue revisions escalate to critical at eight items or a week late, and hide today's", () => {
  const two = evaluate(data({ revisions: [revision("a", "2026-11-13"), revision("b", TODAY)] }), {
    now: at(12),
  });
  assert.deepEqual(rules(two), ["revision-overdue"]);
  assert.equal(two[0].priority, "high");
  assert.equal(two[0].id, `revision-overdue:${TODAY}`);

  const late = evaluate(data({ revisions: [revision("a", "2026-11-08")] }), { now: at(12) });
  assert.equal(late[0].priority, "critical");

  const many = Array.from({ length: 8 }, (_, i) => revision(`r${i}`, "2026-11-14"));
  assert.equal(evaluate(data({ revisions: many }), { now: at(12) })[0].priority, "critical");

  const todayOnly = evaluate(data({ revisions: [revision("a", TODAY)] }), { now: at(12) });
  assert.deepEqual(rules(todayOnly), ["revision-due-today"]);
  assert.equal(todayOnly[0].priority, "normal");
});

test("an unlogged day is only mentioned after the reminder hour", () => {
  const d = data();
  assert.ok(!rules(evaluate(d, { now: at(17, 59) })).includes("journal-unlogged"));
  assert.ok(rules(evaluate(d, { now: at(18) })).includes("journal-unlogged"));
  assert.ok(
    !rules(evaluate(d, { now: at(18), settings: { reminderHour: 21 } })).includes("journal-unlogged"),
  );
  // A stub from the sleep prompt, with no hours on it, is not a logged day.
  assert.ok(rules(evaluate(data({ journal: [day(TODAY, 0)] }), { now: at(19) })).includes("journal-unlogged"));
  assert.ok(!rules(evaluate(data({ journal: [day(TODAY, 2)] }), { now: at(19) })).includes("journal-unlogged"));
});

test("a streak of three days at risk after 8pm replaces the plain unlogged reminder", () => {
  const journal = [day("2026-11-12", 4), day("2026-11-13", 5), day("2026-11-14", 6)];
  const evening = evaluate(data({ journal }), { now: at(20, 30) });
  const streak = evening.find((n) => n.ruleId === "journal-streak-risk");
  assert.ok(streak);
  assert.equal(streak.priority, "critical");
  assert.equal(streak.count, 3);
  assert.ok(!rules(evening).includes("journal-unlogged"));

  // Before 8pm it is still only the ordinary reminder.
  assert.ok(rules(evaluate(data({ journal }), { now: at(19) })).includes("journal-unlogged"));
});

test("habits still open are counted together after the reminder hour", () => {
  const habits = [habit("a"), habit("b", { [TODAY]: true }), habit("c"), { ...habit("d"), archived: true }];
  assert.ok(!rules(evaluate(data({ habits }), { now: at(10) })).includes("habits-pending"));
  const pending = evaluate(data({ habits }), { now: at(18) }).find((n) => n.ruleId === "habits-pending");
  assert.ok(pending);
  assert.equal(pending.count, 2);
  assert.equal(pending.body, "Habit a, Habit c");
});

test("a weekly habit is mentioned only once no spare day is left in its week", () => {
  // The 15th is a Sunday, the last day of the week that began on Monday the 9th.
  const weekly: Habit = { ...habit("w"), name: "Full mock", schedule: { kind: "weekly", timesPerWeek: 2 }, log: { "2026-11-10": true } };
  const pending = (h: Habit, now: Date) => evaluate(data({ habits: [h] }), { now }).find((n) => n.ruleId === "habits-pending");

  // Thursday, one of two kept: four days left for one more. No need to say anything.
  assert.equal(pending(weekly, at(18, 0, 12)), undefined);
  // Sunday, still one short, and today is the last chance.
  assert.equal(pending(weekly, at(18))?.body, "Full mock (1 more day this week)");
  // Nothing kept by Sunday: two can't fit in one day, so it isn't nagged about.
  assert.equal(pending({ ...weekly, log: {} }, at(18)), undefined);
  // Kept twice: done for the week.
  assert.equal(pending({ ...weekly, log: { "2026-11-10": true, "2026-11-12": true } }, at(18)), undefined);
});

test("habits that count Roadmap work are left out only when the plans aren't known", () => {
  const roadmap: Habit = { ...habit("r"), name: "A planned activity", source: "roadmap", metric: "roadmapActivities", target: 1, countFrom: "2026-11-01" };
  const pending = (over: Partial<ChronicleData>, roadmapKnown?: boolean) =>
    evaluate(data({ habits: [roadmap], ...over }), { now: at(18), roadmapKnown }).find((n) => n.ruleId === "habits-pending");

  assert.equal(pending({})?.body, "A planned activity");
  assert.equal(pending({}, false), undefined);
  // The dispatcher's copy of the Roadmap: ids and completed activities only, no titles.
  const trimmed = [
    { id: "p1", items: [{ id: "a1", kind: "activity", status: "completed", completedAt: "2026-11-15T09:30:00" }] },
  ] as unknown as RoadmapPlan[];
  assert.equal(pending({ plans: trimmed }), undefined);
});

test("a draft review is asked to be finished, and links straight to it", () => {
  // Last week ran from the 2nd to the 8th, and was lived in.
  const lived = { journal: [day("2026-11-04", 3)] };
  const notice = (reviews: Review[]) =>
    evaluate(data({ ...lived, reviews }), { now: at(12) }).find((n) => n.id === "review-unwritten:Weekly:2026-11-02");
  const review = (over: Partial<Review>): Review => ({ id: "rv", type: "Weekly", periodLabel: "2–8 Nov", startDate: "2026-11-02", endDate: "2026-11-08", ...over });

  const missing = notice([]);
  assert.equal(missing?.title, "Last week has no review");
  assert.equal(missing?.cta, "Write it");
  assert.equal(missing?.href, "/reviews?open=Weekly%3A2026-11-02");

  const draft = notice([review({ status: "draft" })]);
  assert.equal(draft?.title, "Last week's review is still a draft");
  assert.equal(draft?.cta, "Finish it");
  assert.equal(draft?.href, "/reviews?open=Weekly%3A2026-11-02");

  assert.equal(notice([review({ status: "completed" })]), undefined);
  // Written before drafts existed: finished.
  assert.equal(notice([review({})]), undefined);
});

test("muting a rule or its whole category silences it", () => {
  const d = data({ revisions: [revision("a", "2026-11-13")] });
  assert.ok(rules(evaluate(d, { now: at(12) })).includes("revision-overdue"));
  assert.ok(
    !rules(evaluate(d, { now: at(12), settings: { mutedRules: ["revision-overdue"] } })).includes(
      "revision-overdue",
    ),
  );
  assert.ok(
    !rules(evaluate(d, { now: at(12), settings: { mutedCategories: ["revision"] } })).includes(
      "revision-overdue",
    ),
  );
});

test("the exam countdown is keyed by the milestone crossed, not by the day", () => {
  const near = data({ profile: { ...profile, examDate: "2026-12-20" } });
  const a = evaluate(near, { now: at(12) }).find((n) => n.ruleId === "exam-countdown");
  const b = evaluate(near, { now: at(12, 0, 16) }).find((n) => n.ruleId === "exam-countdown");
  assert.equal(a?.id, "exam-countdown:50");
  // A day later it is the same notice, so having read it keeps it read.
  assert.equal(b?.id, "exam-countdown:50");
  assert.equal(a?.count, 35);
});

test("the order is fully deterministic: priority, then rule, then id", () => {
  const d = data({
    revisions: [revision("a", "2026-11-08")],
    habits: [habit("a")],
  });
  const first = ids(evaluate(d, { now: at(18) }));
  const again = ids(evaluate(d, { now: at(18) }));
  assert.deepEqual(first, again);
  const priorities = evaluate(d, { now: at(18) }).map((n) => n.priority);
  const weight = { critical: 0, high: 1, normal: 2, low: 3 } as const;
  assert.deepEqual(
    priorities,
    [...priorities].sort((x, y) => weight[x] - weight[y]),
  );
});

/* ── the inbox ───────────────────────────────────────────────── */

test("dismissed and snoozed notices leave the inbox; read ones only grey out", () => {
  const notices: Notice[] = [
    notice({ id: "a:1", priority: "critical" }),
    notice({ id: "b:1", priority: "high" }),
    notice({ id: "c:1", priority: "normal" }),
    notice({ id: "d:1", priority: "low" }),
    notice({ id: "e:1", priority: "normal" }),
  ];
  const inbox = buildInbox(
    notices,
    {
      readIds: ["b:1"],
      dismissedIds: ["c:1"],
      snoozedUntil: { "e:1": "2026-11-17" },
    },
    TODAY,
  );
  assert.deepEqual(
    inbox.items.map((i) => [i.id, i.read]),
    [
      ["a:1", false],
      ["b:1", true],
      ["d:1", false],
    ],
  );
  assert.equal(inbox.unread, 2);
  // Low never interrupts, and neither does anything already read.
  assert.deepEqual(inbox.deliverable.map((i) => i.id), ["a:1"]);
  assert.deepEqual(inbox.groups.map((g) => g.priority), ["critical", "high", "low"]);

  // The snooze ends on its date.
  const later = buildInbox(notices, { snoozedUntil: { "e:1": "2026-11-17" } }, "2026-11-17");
  assert.ok(later.items.some((i) => i.id === "e:1"));
});

test("only state for notices that are no longer true is swept", () => {
  const live = [notice({ id: "a:1" })];
  assert.deepEqual(
    staleStateIds(live, { readIds: ["a:1", "gone:1"], dismissedIds: ["gone:2"], snoozedUntil: { "gone:3": TODAY, "a:1": TODAY } }),
    { readIds: ["gone:1"], dismissedIds: ["gone:2"], snoozedIds: ["gone:3"] },
  );
});

/* ── delivery ────────────────────────────────────────────────── */

test("quiet hours wrap past midnight, and the end hour is already outside", () => {
  assert.equal(inQuietHours(23, 22, 7), true);
  assert.equal(inQuietHours(3, 22, 7), true);
  assert.equal(inQuietHours(7, 22, 7), false);
  assert.equal(inQuietHours(12, 22, 7), false);
  assert.equal(inQuietHours(13, 13, 15), true);
  assert.equal(inQuietHours(15, 13, 15), false);
  assert.equal(inQuietHours(5, 9, 9), false);
});

const deliverOn = withDefaults({ deliver: true });
const individual = withDefaults({ deliver: true, digest: false });

test("the digest waits for its hour, then goes once a day", () => {
  const inbox = inboxOf([notice({ id: "a:1", title: "First" }), notice({ id: "b:1", title: "Second", priority: "normal" })]);
  assert.equal(planDelivery(inbox, deliverOn, null, at(6, 59)).kind, "none");

  const plan = planDelivery(inbox, deliverOn, null, at(7));
  assert.equal(plan.kind, "digest");
  if (plan.kind === "digest") {
    assert.equal(plan.title, "2 things need you today");
    assert.equal(plan.body, "First · Second");
  }

  const log = recordDelivery(null, inbox.deliverable, at(7), true);
  assert.equal(log.lastDigestOn, TODAY);
  const again = planDelivery(inbox, deliverOn, log, at(9));
  assert.deepEqual(again, { kind: "none", reason: "Today's digest already went out." });
  // Tomorrow it goes again.
  assert.equal(planDelivery(inbox, deliverOn, log, at(8, 0, 16)).kind, "digest");
});

test("a digest of one thing uses that thing's own words", () => {
  const plan = planDelivery(inboxOf([notice({ id: "a:1", title: "Only", body: "This one" })]), deliverOn, null, at(8));
  assert.equal(plan.kind, "digest");
  if (plan.kind === "digest") {
    assert.equal(plan.title, "Only");
    assert.equal(plan.body, "This one");
  }
});

test("nothing is delivered when delivery is off, or nothing may interrupt", () => {
  const inbox = inboxOf([notice({ id: "a:1" })]);
  assert.equal(planDelivery(inbox, withDefaults({ deliver: false }), null, at(12)).kind, "none");
  assert.equal(planDelivery(inbox, withDefaults({ deliver: true, enabled: false }), null, at(12)).kind, "none");
  assert.equal(planDelivery(inboxOf([notice({ id: "a:1", priority: "low" })]), individual, null, at(12)).kind, "none");
});

test("individual notices respect quiet hours, even critical ones", () => {
  const inbox = inboxOf([notice({ id: "a:1", priority: "critical" })]);
  assert.deepEqual(planDelivery(inbox, individual, null, at(23)), { kind: "none", reason: "Quiet hours." });
  assert.equal(planDelivery(inbox, individual, null, at(12)).kind, "individual");
});

test("one at a time, with a minimum gap and a daily cap that critical notices skip", () => {
  const inbox = inboxOf([notice({ id: "a:1", dedupeKey: "a" }), notice({ id: "b:1", dedupeKey: "b" })]);
  const first = planDelivery(inbox, individual, null, at(12));
  assert.equal(first.kind, "individual");
  if (first.kind !== "individual") return;
  assert.deepEqual(first.notices.map((n) => n.id), ["a:1"]);

  const log = recordDelivery(null, first.notices, at(12));
  // Ten minutes later: inside the 45-minute gap.
  assert.equal(planDelivery(inbox, individual, log, at(12, 10)).kind, "none");
  // After the gap the next subject goes, and the first is on cooldown for the day.
  const next = planDelivery(inbox, individual, log, at(13));
  assert.equal(next.kind === "individual" && next.notices[0].id, "b:1");

  const capped = { ...log, sentToday: 4, sentOnDate: TODAY };
  assert.equal(planDelivery(inboxOf([notice({ id: "c:1", dedupeKey: "c" })]), individual, capped, at(15)).kind, "none");
  const critical = inboxOf([notice({ id: "c:1", dedupeKey: "c", priority: "critical" })]);
  assert.equal(planDelivery(critical, individual, capped, at(12, 5)).kind, "individual");
});

test("the gap is measured from the true instant when one is given", () => {
  const inbox = inboxOf([notice({ id: "b:1", dedupeKey: "b" })]);
  const log = recordDelivery(null, [{ dedupeKey: "a" }], new Date(Date.UTC(2026, 10, 15, 6, 0)));
  // A calendar carrier five and a half hours ahead of the real instant, as the
  // server builds for India. Ten real minutes later is still inside the gap.
  const real = new Date(Date.UTC(2026, 10, 15, 6, 10));
  const carrier = new Date(real.getTime() + 5.5 * 3_600_000);
  carrier.setHours(12, 0, 0, 0);
  assert.equal(planDelivery(inbox, individual, log, carrier, real).kind, "none");
  const later = new Date(Date.UTC(2026, 10, 15, 7, 0));
  assert.equal(planDelivery(inbox, individual, log, carrier, later).kind, "individual");
});

test("the log resets its count on a new day and forgets subjects after a week", () => {
  const a = recordDelivery(null, [{ dedupeKey: "x" }, { dedupeKey: "y" }], at(9));
  assert.equal(a.sentToday, 2);
  assert.equal(a.sentOnDate, TODAY);
  assert.equal(a.lastSentOn.x, TODAY);

  const b = recordDelivery(a, [{ dedupeKey: "z" }], at(9, 0, 16));
  assert.equal(b.sentToday, 1);
  assert.equal(b.sentOnDate, "2026-11-16");
  assert.ok("x" in b.lastSentOn);

  // Eight days after the first record and seven after the second.
  const c = recordDelivery(b, [{ dedupeKey: "w" }], at(9, 0, 23));
  assert.deepEqual(Object.keys(c.lastSentOn).sort(), ["w", "z"]);
  assert.deepEqual(Object.keys(c.lastSentAt).sort(), ["w", "z"]);

  // An older log with instants but no recorded days is pruned by the instant.
  const old = pruneDeliveryLog(
    { lastSentAt: { old: new Date(2026, 10, 1).toISOString(), fresh: at(8).toISOString() } },
    at(9),
  );
  assert.deepEqual(Object.keys(old.lastSentAt), ["fresh"]);
});

test("a digest the server already pushed to this device stops the page sending it again", () => {
  const inbox = inboxOf([notice({ id: "a:1" })]);
  assert.equal(planDelivery(inbox, deliverOn, null, at(8)).kind, "digest");

  const shown = [{ tag: DIGEST_TAG, at: at(7, 30).getTime(), source: "push" as const }];
  const log = foldDeviceDeliveries(null, shown, at(8));
  assert.equal(log.lastDigestOn, TODAY);
  assert.equal(log.sentToday, 1);
  assert.deepEqual(planDelivery(inbox, deliverOn, log, at(8)), {
    kind: "none",
    reason: "Today's digest already went out.",
  });

  // Yesterday's push says nothing about today.
  const yesterday = [{ tag: DIGEST_TAG, at: at(7, 30, 14).getTime(), source: "push" as const }];
  assert.equal(planDelivery(inbox, deliverOn, foldDeviceDeliveries(null, yesterday, at(8)), at(8)).kind, "digest");
});

test("a pushed notice puts its subject on cooldown; the page's own and test pushes are not folded", () => {
  const inbox = inboxOf([notice({ id: "a:1", dedupeKey: "a" })]);
  const pushed = foldDeviceDeliveries(null, [{ tag: "a", at: at(9).getTime(), source: "push" }], at(12));
  assert.equal(pushed.lastSentOn.a, TODAY);
  assert.equal(planDelivery(inbox, individual, pushed, at(12)).kind, "none");

  const ignored = foldDeviceDeliveries(
    null,
    [
      { tag: "a", at: at(9).getTime(), source: "page" },
      { tag: TEST_TAG, at: at(9).getTime(), source: "push" },
      { tag: "a", at: Number.NaN, source: "push" },
    ],
    at(12),
  );
  assert.deepEqual(ignored.lastSentOn, {});
  assert.equal(ignored.sentToday, 0);
  assert.equal(planDelivery(inbox, individual, ignored, at(12)).kind, "individual");

  // Folding never loosens: an existing, later record wins.
  const own = recordDelivery(null, [{ dedupeKey: "a" }], at(11));
  const merged = foldDeviceDeliveries(own, [{ tag: "a", at: at(9).getTime(), source: "push" }], at(12));
  assert.equal(merged.lastSentAt.a, at(11).toISOString());
  assert.equal(merged.sentToday, 2);
});
