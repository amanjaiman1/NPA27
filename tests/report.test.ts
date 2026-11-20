import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, cleanPath, isNoise, parseReport, type CrashReport } from "@/lib/report";
import { handleReport, resetReportLimits, sameSite, type ReportDeps } from "@/lib/report-server";

/* Crash reports: what one may hold, and the route that keeps them for the
   team in the Admin Center. Nothing here sends an email any more. */

/* ── what a report may hold ──────────────────────────────────── */

test("a page is kept as its path only, never the query or the fragment", () => {
  assert.equal(cleanPath("https://itsdoordie.site/journal/2026-11-19?new=1#data"), "/journal/2026-11-19");
  assert.equal(cleanPath("/settings#review"), "/settings");
  assert.equal(cleanPath("performance-review?open=Weekly:2026-11-09"), "/performance-review");
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

test("messages don't come this way any more: they go from Help & feedback to the Feedback Center", () => {
  const old = parseReport({ kind: "feedback", topic: "bug", message: "Saving a mock fails", includeEmail: true });
  assert.deepEqual(old, { ok: false, error: "Messages go to the team from Help & feedback in the app now." });
});

test("errors that aren't the app's to fix are left out", () => {
  assert.equal(isNoise("ResizeObserver loop completed with undelivered notifications."), true);
  assert.equal(isNoise("Script error."), true);
  assert.equal(isNoise("TypeError: Failed to fetch"), true);
  assert.equal(isNoise("TypeError: x is undefined", "at chrome-extension://abc/content.js:1:1"), true);
  assert.equal(isNoise("TypeError: Cannot read properties of undefined (reading 'map')", "at Mocks (/_next/static/chunks/app.js:1:2)"), false);
});

/* ── the route ───────────────────────────────────────────────── */

function harness(over: Partial<ReportDeps> = {}) {
  const stored: CrashReport[] = [];
  const deps: ReportDeps = {
    record: async (report) => void stored.push(report),
    now: () => 1_700_000_000_000,
    ...over,
  };
  return { deps, stored };
}

let ip = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://itsdoordie.site/api/report", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": `10.0.0.${ip}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const crash = (message = "TypeError: x is undefined", extra: Record<string, unknown> = {}) => ({ kind: "crash", message, source: "render", page: "/mocks", ...extra });

beforeEach(() => {
  resetReportLimits();
  ip += 1;
});

test("only the site's own pages may send", async () => {
  const { deps, stored } = harness();
  assert.equal((await handleReport(post(crash(), { "sec-fetch-site": "cross-site" }), deps)).status, 403);
  const old = new Request("https://itsdoordie.site/api/report", { method: "POST", headers: { origin: "https://evil.example", host: "itsdoordie.site" } });
  assert.equal(sameSite(old), false);
  assert.equal(
    sameSite(new Request("https://itsdoordie.site/api/report", { method: "POST", headers: { origin: "https://itsdoordie.site", host: "itsdoordie.site" } })),
    true,
  );
  assert.equal(stored.length, 0);
});

test("a crash report is stored for the team, checked and tidied first", async () => {
  const { deps, stored } = harness();
  const res = await handleReport(post(crash("TypeError: x is undefined", { note: "I pressed Save", page: "/mocks?id=7", email: "x@example.com" })), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].page, "/mocks");
  assert.equal(stored[0].note, "I pressed Save");
  assert.ok(!("email" in stored[0]), "nothing about the person is kept");
});

test("bad requests are turned away before anything is stored", async () => {
  const { deps, stored } = harness();
  assert.equal((await handleReport(post("not json"), deps)).status, 400);
  assert.equal((await handleReport(post({ kind: "crash", message: "" }), deps)).status, 400);
  assert.equal((await handleReport(post({ kind: "feedback", topic: "bug", message: "Saving a mock fails" }), deps)).status, 400);
  assert.equal((await handleReport(post("x".repeat(LIMITS.body + 1)), deps)).status, 413);
  assert.equal(stored.length, 0);
});

test("one address can't flood the database", async () => {
  const { deps, stored } = harness();
  for (let i = 0; i < 6; i++) assert.equal((await handleReport(post(crash(`TypeError: crash ${i}`)), deps)).status, 200);
  const seventh = await handleReport(post(crash("TypeError: one too many")), deps);
  assert.equal(seventh.status, 429);
  assert.equal(seventh.headers.get("retry-after"), "600");
  assert.equal(stored.length, 6);
});

test("a server that can't keep reports says so; a failure isn't a success", async () => {
  const unset = harness({
    record: async () => {
      throw Object.assign(new Error("not configured"), { status: 503 });
    },
  });
  const res = await handleReport(post(crash()), unset.deps);
  assert.equal(res.status, 503);
  assert.match(((await res.json()) as { error: string }).error, /aren't set up/);

  const broken = harness({
    record: async () => {
      throw new Error("connection reset");
    },
  });
  assert.equal((await handleReport(post(crash()), broken.deps)).status, 502);
});
