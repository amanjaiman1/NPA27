import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, cleanPath, composeEmail, isNoise, parseReport, type CrashReport, type FeedbackReport } from "@/lib/report";
import { DEFAULT_FROM, RESEND_ENDPOINT, handleReport, resetReportLimits, sameSite, type ReportDeps } from "@/lib/report-server";

/* ── what a report may hold ──────────────────────────────────── */

test("a page is kept as its path only, never the query or the fragment", () => {
  assert.equal(cleanPath("https://itsdoordie.site/journal/2026-11-19?new=1#data"), "/journal/2026-11-19");
  assert.equal(cleanPath("/settings#feedback"), "/settings");
  assert.equal(cleanPath("reviews?open=Weekly:2026-11-09"), "/reviews");
  assert.equal(cleanPath(42), "");
});

test("a crash report is checked and tidied, and anything unexpected is dropped", () => {
  const parsed = parseReport({
    kind: "crash",
    message: "TypeError: x is undefined\u0000",
    source: "somewhere",
    page: "/mocks?id=7",
    stack: "at Mocks (page.js:1:2)",
    signedIn: "yes",
    at: "2026-11-19T10:00:00+05:30",
    userId: "should not survive",
    email: "someone@example.com",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.report, {
    kind: "crash",
    message: "TypeError: x is undefined",
    source: "window",
    page: "/mocks",
    stack: "at Mocks (page.js:1:2)",
    at: "2026-11-19T04:30:00.000Z",
  });
  assert.deepEqual(parseReport({ kind: "crash", message: "   " }), { ok: false, error: "A crash report needs the error message." });
  const long = parseReport({ kind: "crash", message: "x".repeat(5000) });
  assert.ok(long.ok);
  if (long.ok) assert.equal((long.report as CrashReport).message.length, LIMITS.crashMessage);
  assert.deepEqual(parseReport([1, 2]), { ok: false, error: "Expected a report." });
  assert.deepEqual(parseReport({ kind: "other" }), { ok: false, error: "Unknown kind of report." });
});

test("a message needs a topic and enough words, and keeps details only when asked", () => {
  assert.deepEqual(parseReport({ kind: "feedback", topic: "praise", message: "Lovely app, thank you" }), {
    ok: false,
    error: "Choose what the message is about.",
  });
  assert.deepEqual(parseReport({ kind: "feedback", topic: "problem", message: "short" }), { ok: false, error: "Write at least 10 characters." });

  const without = parseReport({ kind: "feedback", topic: "problem", message: "Saving a mock fails", includeDetails: false, userAgent: "Firefox", screen: "390×844" });
  assert.ok(without.ok);
  if (without.ok) assert.deepEqual(without.report, { kind: "feedback", topic: "problem", message: "Saving a mock fails", includeEmail: false, includeDetails: false });

  const withDetails = parseReport({ kind: "feedback", topic: "problem", message: "Saving a mock fails", includeDetails: true, userAgent: "Firefox", screen: "<b>", installed: true });
  assert.ok(withDetails.ok);
  if (withDetails.ok) {
    const r = withDetails.report as FeedbackReport;
    assert.equal(r.userAgent, "Firefox");
    assert.equal(r.screen, undefined);
    assert.equal(r.installed, true);
  }
});

test("a crash email says nothing about the person; a message's reply goes to them only if they chose", () => {
  const crash = composeEmail(
    { kind: "crash", message: "TypeError: x is undefined", source: "render", page: "/mocks", note: "I pressed Save" },
    { receivedAt: "2026-11-19T10:00:00.000Z", build: "abc1234" },
  );
  assert.equal(crash.subject, "[DoOrDie] Crash (with a note): TypeError: x is undefined");
  assert.match(crash.text, /Page:\s+\/mocks/);
  assert.match(crash.text, /I pressed Save/);
  assert.equal(crash.replyTo, undefined);
  assert.doesNotMatch(crash.text, /Account|From:/);

  const message: FeedbackReport = { kind: "feedback", topic: "suggestion", message: "A dark calendar would help", includeEmail: true, includeDetails: false };
  const ctx = { receivedAt: "2026-11-19T10:00:00.000Z", userId: "user-1", userEmail: "aspirant@example.com" };
  const shared = composeEmail(message, ctx);
  assert.equal(shared.subject, "[DoOrDie] Suggestion: A dark calendar would help");
  assert.equal(shared.replyTo, "aspirant@example.com");
  assert.match(shared.text, /Account:\s+user-1/);

  const kept = composeEmail({ ...message, includeEmail: false }, ctx);
  assert.equal(kept.replyTo, undefined);
  assert.doesNotMatch(kept.text, /aspirant@example\.com/);
});

test("errors that aren't the app's to fix are left out", () => {
  assert.equal(isNoise("ResizeObserver loop completed with undelivered notifications."), true);
  assert.equal(isNoise("Script error."), true);
  assert.equal(isNoise("TypeError: Failed to fetch"), true);
  assert.equal(isNoise("TypeError: x is undefined", "at chrome-extension://abc/content.js:1:1"), true);
  assert.equal(isNoise("TypeError: Cannot read properties of undefined (reading 'map')", "at Mocks (/_next/static/chunks/app.js:1:2)"), false);
});

/* ── the route ───────────────────────────────────────────────── */

interface Sent {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function harness(over: Partial<ReportDeps> = {}, answer: () => Response | Promise<Response> = () => new Response("{}", { status: 200 })) {
  const sent: Sent[] = [];
  const deps: ReportDeps = {
    env: { apiKey: "re_test", to: "team@example.com, second@example.com", build: "abc1234" },
    send: (async (url: string, init: RequestInit) => {
      sent.push({ url, init, body: JSON.parse(String(init.body)) });
      return answer();
    }) as typeof fetch,
    now: () => Date.parse("2026-11-19T10:00:00Z"),
    ...over,
  };
  return { deps, sent };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://itsdoordie.site/api/report", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const crash = (message = "TypeError: x is undefined", extra: Record<string, unknown> = {}) => ({ kind: "crash", message, source: "render", page: "/mocks", ...extra });
const feedback = (extra: Record<string, unknown> = {}) => ({ kind: "feedback", topic: "problem", message: "Saving a mock fails", ...extra });

beforeEach(() => resetReportLimits());

test("only the site's own pages may send", async () => {
  const { deps, sent } = harness();
  assert.equal((await handleReport(post(crash(), { "sec-fetch-site": "cross-site" }), deps)).status, 403);
  const noHeaders = new Request("https://itsdoordie.site/api/report", { method: "POST", body: JSON.stringify(crash()) });
  assert.equal((await handleReport(noHeaders, deps)).status, 403);
  // Older browsers without Sec-Fetch-Site: the Origin must be this host.
  const origin = (o: string) => new Request("https://itsdoordie.site/api/report", { method: "POST", headers: { origin: o, host: "itsdoordie.site" } });
  assert.equal(sameSite(origin("https://itsdoordie.site")), true);
  assert.equal(sameSite(origin("https://elsewhere.example")), false);
  assert.equal(sameSite(origin("null")), false);
  assert.equal(sent.length, 0);
});

test("a crash report becomes one plain-text email to the team", async () => {
  const { deps, sent } = harness();
  const res = await handleReport(post(crash()), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, RESEND_ENDPOINT);
  assert.equal((sent[0].init.headers as Record<string, string>).Authorization, "Bearer re_test");
  assert.equal(sent[0].body.from, DEFAULT_FROM);
  assert.deepEqual(sent[0].body.to, ["team@example.com", "second@example.com"]);
  assert.equal(sent[0].body.subject, "[DoOrDie] Crash: TypeError: x is undefined");
  assert.match(String(sent[0].body.text), /Version:\s+abc1234/);
  assert.equal("html" in sent[0].body, false);
  assert.equal("reply_to" in sent[0].body, false);
});

test("bad requests are turned away before anything is sent", async () => {
  const { deps, sent } = harness();
  assert.equal((await handleReport(post("{not json"), deps)).status, 400);
  assert.equal((await handleReport(post({ kind: "crash" }), deps)).status, 400);
  assert.equal((await handleReport(post(crash("x".repeat(LIMITS.body + 10))), deps)).status, 413);
  const unset = harness({ env: { apiKey: "", to: "" } });
  const res = await handleReport(post(crash()), unset.deps);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "Reports aren't set up on this server yet." });
  assert.equal(sent.length + unset.sent.length, 0);
});

test("the same crash on the same page is emailed once; a note from the person always goes", async () => {
  const { deps, sent } = harness();
  await handleReport(post(crash()), deps);
  const again = await handleReport(post(crash()), deps);
  assert.deepEqual(await again.json(), { ok: true, skipped: "already reported" });
  await handleReport(post(crash("TypeError: x is undefined", { note: "It happens every time I save" })), deps);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.subject, "[DoOrDie] Crash (with a note): TypeError: x is undefined");
});

test("one address can't flood the inbox", async () => {
  const { deps, sent } = harness();
  const statuses: number[] = [];
  for (let i = 0; i < 7; i++) statuses.push((await handleReport(post(crash(`Error number ${i}`)), deps)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
  assert.equal(sent.length, 6);
  // Another address is counted on its own.
  assert.equal((await handleReport(post(crash("Error elsewhere"), { "x-forwarded-for": "198.51.100.2" }), deps)).status, 200);
});

test("a failed send isn't counted as reported, so it can be tried again", async () => {
  let fail = true;
  const { deps, sent } = harness({}, () => (fail ? new Response("quota", { status: 429 }) : new Response("{}", { status: 200 })));
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await handleReport(post(crash()), deps)).status, 502);
  } finally {
    console.error = originalError;
  }
  fail = false;
  assert.equal((await handleReport(post(crash()), deps)).status, 200);
  assert.equal(sent.length, 2);

  const down = harness({ send: (async () => Promise.reject(new Error("offline"))) as typeof fetch });
  assert.equal((await handleReport(post(crash("Another")), down.deps)).status, 502);
});

test("a message is tied to the signed-in account, and its email goes only if the person chose", async () => {
  const identify = async (auth: string | null) => (auth === "Bearer good" ? { id: "user-1", email: "aspirant@example.com" } : null);
  const { deps, sent } = harness({ identify });

  assert.equal((await handleReport(post(feedback(), { authorization: "Bearer bad" }), deps)).status, 401);
  assert.equal((await handleReport(post(feedback()), deps)).status, 401);

  assert.equal((await handleReport(post(feedback({ includeEmail: true }), { authorization: "Bearer good" }), deps)).status, 200);
  assert.equal(sent[0].body.reply_to, "aspirant@example.com");
  assert.match(String(sent[0].body.text), /Account:\s+user-1/);

  assert.equal((await handleReport(post(feedback({ includeEmail: false, message: "Another thing that broke" }), { authorization: "Bearer good" }), deps)).status, 200);
  assert.equal("reply_to" in sent[1].body, false);
  assert.doesNotMatch(String(sent[1].body.text), /aspirant@example\.com/);
});

test("one account can send a handful of messages an hour", async () => {
  const identify = async () => ({ id: "user-1" });
  const { deps } = harness({ identify });
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await handleReport(post(feedback({ message: `Message number ${i}` }), { authorization: "Bearer x" }), deps)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});
