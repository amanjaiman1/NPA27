import { test } from "node:test";
import assert from "node:assert/strict";
import type { Profile, RevisionItem } from "@/lib/types";
import { DIGEST_TAG } from "@/lib/notifications";
import {
  decideForUser,
  foldLog,
  groupByUser,
  isGoneForever,
  payloadForPlatform,
  type PushPayload,
  type Snapshot,
  type SubscriptionRow,
} from "@/lib/push-dispatch";

/* The dispatcher runs on a UTC server and decides in the user's zone, so every
   instant here is a true UTC instant and every expectation is in India's day. */
const utc = (iso: string) => new Date(iso);

const profile: Profile = {
  name: "Tester",
  targetExam: "UPSC CSE 2028",
  examDate: "2028-05-28",
  attemptNumber: 1,
  optionalSubject: "",
  startDate: "2026-11-15",
  dailyHourTarget: 8,
  timezone: "Asia/Kolkata",
};

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

const device = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: "d1",
  endpoint: "https://push.example/1",
  key_p256dh: "p",
  key_auth: "a",
  platform: "android",
  timezone: "Asia/Kolkata",
  ...over,
});

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  profile,
  revisions: [revision("a", "2026-11-14")],
  notify: { deliver: true },
  ...over,
});

test("nothing is sent without a snapshot, a device, or delivery switched on", () => {
  const at = utc("2026-11-15T06:30:00Z");
  assert.deepEqual(decideForUser(null, [device()], null, at), { send: false, reason: "No synced snapshot." });
  assert.deepEqual(decideForUser(snapshot(), [], null, at), { send: false, reason: "No devices." });
  assert.deepEqual(decideForUser(snapshot({ notify: { deliver: false } }), [device()], null, at), {
    send: false,
    reason: "Delivery is off.",
  });
  assert.deepEqual(
    decideForUser(snapshot({ notify: { deliver: true, enabled: false } }), [device()], null, at),
    { send: false, reason: "Notifications are off." },
  );
  assert.deepEqual(decideForUser({ notify: { deliver: true } }, [device()], null, at), {
    send: false,
    reason: "Snapshot has no profile.",
  });
});

test("the digest hour is the user's, not the server's", () => {
  // 01:00 UTC is 06:30 in India: before the default digest hour of 7.
  assert.deepEqual(decideForUser(snapshot(), [device()], null, utc("2026-11-15T01:00:00Z")), {
    send: false,
    reason: "Before the digest hour.",
  });
  // 02:00 UTC — the committed Vercel cron — is 07:30 there.
  const d = decideForUser(snapshot(), [device()], null, utc("2026-11-15T02:00:00Z"));
  assert.equal(d.send, true);
  if (!d.send) return;
  assert.equal(d.digest, true);
  assert.equal(d.payload.tag, DIGEST_TAG);
  assert.equal(d.payload.href, "/dashboard");
  assert.equal(d.payload.badgeCount, 1);
  assert.equal(d.nextLog.lastDigestOn, "2026-11-15");

  // And once it has gone, not again that day.
  assert.deepEqual(decideForUser(snapshot(), [device()], d.nextLog, utc("2026-11-15T09:00:00Z")), {
    send: false,
    reason: "Today's digest already went out.",
  });
});

test("the log records the user's calendar day even when UTC is still on yesterday", () => {
  // 20:00 UTC on the 15th is 01:30 on the 16th in India.
  const at = utc("2026-11-15T20:00:00Z");
  const d = decideForUser(snapshot({ notify: { deliver: true, digestHour: 1 } }), [device()], null, at);
  assert.equal(d.send, true);
  if (!d.send) return;
  assert.equal(d.nextLog.lastDigestOn, "2026-11-16");
  assert.equal(d.nextLog.sentOnDate, "2026-11-16");
  // `lastSentAt` stays a true instant.
  assert.equal(d.nextLog.lastSentAt["revision-overdue"], at.toISOString());
});

test("the profile's zone wins, then the devices' majority, then UTC", () => {
  const at = utc("2026-11-15T01:00:00Z"); // 06:30 India, 01:00 UTC, 20:00 New York
  const noZone = { ...profile, timezone: undefined };
  // Devices in New York: it is 20:00 there, after the digest hour.
  const ny = decideForUser(
    snapshot({ profile: noZone }),
    [device({ timezone: "America/New_York" }), device({ id: "d2", timezone: "America/New_York" }), device({ id: "d3" })],
    null,
    at,
  );
  assert.equal(ny.send, true);
  // No zone anywhere: UTC, where 01:00 is before the digest hour.
  const none = decideForUser(snapshot({ profile: noZone }), [device({ timezone: null })], null, at);
  assert.deepEqual(none, { send: false, reason: "Before the digest hour." });
});

test("the minimum gap holds on the server, measured in real minutes", () => {
  const settings = { deliver: true, digest: false };
  // 06:30 UTC is noon in India: outside quiet hours.
  const first = decideForUser(snapshot({ notify: settings }), [device()], null, utc("2026-11-15T06:30:00Z"));
  assert.equal(first.send, true);
  if (!first.send) return;
  assert.equal(first.digest, false);

  // Ten real minutes later something new is due; the gap must still hold. It
  // used to be measured from the zone-shifted clock, five and a half hours
  // ahead, and so never held at all.
  const next = snapshot({
    notify: settings,
    revisions: [revision("a", "2026-11-14")],
    mistakes: [
      {
        id: "m1",
        date: "2026-11-10",
        subjectId: "polity",
        topic: "x",
        category: "Factual",
        status: "Open",
        nextReview: "2026-11-15",
        reviewCount: 0,
        question: "q",
        source: "Mock",
      } as never,
    ],
  });
  assert.deepEqual(decideForUser(next, [device()], first.nextLog, utc("2026-11-15T06:40:00Z")), {
    send: false,
    reason: "Rate limited or already sent.",
  });
  const later = decideForUser(next, [device()], first.nextLog, utc("2026-11-15T07:20:00Z"));
  assert.equal(later.send, true);
  if (later.send) assert.equal(later.notices[0].ruleId, "mistakes-due");
});

test("read and dismissed notices synced from another device are not pushed", () => {
  const at = utc("2026-11-15T02:00:00Z");
  const read = snapshot({ notifyState: { readIds: ["revision-overdue:2026-11-15"], dismissedIds: [], snoozedUntil: {} } });
  assert.deepEqual(decideForUser(read, [device()], null, at), { send: false, reason: "Nothing to deliver." });
});

test("payloads are tailored to the receiving platform", () => {
  const base: PushPayload = { title: "T", body: "B", href: "/revision", tag: "revision-overdue" };

  const android = payloadForPlatform(base, "android", "critical");
  assert.equal(android.actions?.length, 2);
  assert.equal(android.renotify, true);
  assert.deepEqual(android.vibrate, [80, 60, 80]);
  assert.equal(android.requireInteraction, undefined);
  assert.equal(payloadForPlatform(base, "android", "high").renotify, false);

  const mac = payloadForPlatform(base, "macos", "critical");
  assert.equal(mac.requireInteraction, true);
  assert.equal(mac.actions, undefined);
  assert.equal(payloadForPlatform(base, "macos", "high").requireInteraction, undefined);

  const ios = payloadForPlatform(base, "ios", "critical");
  assert.equal(ios.actions, undefined);
  assert.equal(ios.vibrate, undefined);
  assert.equal(ios.requireInteraction, undefined);
  assert.equal(ios.title, "T");
});

test("only 404 and 410 mean a device is gone for good", () => {
  assert.equal(isGoneForever(404), true);
  assert.equal(isGoneForever(410), true);
  for (const status of [undefined, 400, 401, 413, 429, 500, 503]) {
    assert.equal(isGoneForever(status), false);
  }
});

test("devices are grouped by their owner", () => {
  const grouped = groupByUser([
    { user_id: "u1", id: "a" },
    { user_id: "u2", id: "b" },
    { user_id: "u1", id: "c" },
  ]);
  assert.deepEqual([...grouped.keys()], ["u1", "u2"]);
  assert.deepEqual(grouped.get("u1")?.map((r) => r.id), ["a", "c"]);
});

test("the server's log is folded like the browser's and stays bounded", () => {
  const log = foldLog(
    {
      lastSentAt: { stale: "2026-10-01T00:00:00.000Z" },
      lastSentOn: { stale: "2026-10-01" },
      sentToday: 3,
      sentOnDate: "2026-11-14",
      lastDigestOn: null,
    },
    [{ dedupeKey: "a" }],
    utc("2026-11-15T06:30:00Z"),
    "2026-11-15",
    false,
  );
  assert.equal(log.sentToday, 1);
  assert.equal(log.sentOnDate, "2026-11-15");
  assert.deepEqual(Object.keys(log.lastSentOn), ["a"]);
  assert.deepEqual(Object.keys(log.lastSentAt), ["a"]);
});
