import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_RESOURCES,
  ADMIN_RESOURCE_IDS,
  adminResourceOf,
  createResponseOrder,
  getAdminRefreshSnapshot,
  mergeNewestPage,
  noteAdminLoad,
  refreshAdminData,
  registerAdminView,
  resetAdminRefresh,
  retryAdminResource,
  setAdminRefreshClock,
  subscribeAdminRefresh,
  type AdminFetch,
  type AdminResourceId,
  type ViewReport,
} from "@/lib/platform/admin-refresh";
import { ADMIN_ROUTES } from "@/lib/platform/server/admin-api";
import type { Permission } from "@/lib/platform/roles";

/* ── helpers ───────────────────────────────────────────────────── */

let now = 1_000;
setAdminRefreshClock(() => now);
const everything = () => true;

/** A pretend Admin API: each address answers as told (a value, or a function returning a promise). */
function api(answers: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const signals = new Map<string, AbortSignal>();
  let open = 0;
  let mostAtOnce = 0;
  const fetch: AdminFetch = async <T>(path: string, signal: AbortSignal): Promise<T> => {
    calls.push(path);
    signals.set(path, signal);
    open++;
    mostAtOnce = Math.max(mostAtOnce, open);
    try {
      const a = path in answers ? answers[path] : answers["*"];
      return (typeof a === "function" ? await (a as () => Promise<unknown>)() : a ?? { path }) as T;
    } finally {
      open--;
    }
  };
  return { fetch, calls, signals, mostAtOnce: () => mostAtOnce };
}

/** Views on screen for one test, taken off at the end. */
function screen() {
  const off: (() => void)[] = [];
  const shown = new Map<string, unknown>();
  return {
    shown,
    view(resource: AdminResourceId, key: string, report?: ViewReport) {
      const remove = registerAdminView({
        resource,
        key,
        refresh: async (ctx) => {
          shown.set(key, await ctx.get(key));
          return report;
        },
      });
      off.push(remove);
      return remove;
    },
    clear() {
      off.splice(0).forEach((f) => f());
      resetAdminRefresh();
    },
  };
}

const status = (id: AdminResourceId) => getAdminRefreshSnapshot().resources.find((r) => r.id === id);
const deferred = <T = unknown>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/* ── what there is to refresh ──────────────────────────────────── */

test("every address the Admin Center reads belongs to a resource, and every resource is read somewhere", () => {
  const gets = ADMIN_ROUTES.filter((r) => r.method === "GET").map((r) => r.path);
  for (const path of gets) assert.ok(adminResourceOf(path), `GET ${path} belongs to no resource`);
  const read = new Set(gets.map((p) => adminResourceOf(p)));
  for (const r of ADMIN_RESOURCES) {
    assert.ok(read.has(r.via ?? r.id), `${r.id} is read by no route`);
    assert.ok(r.label && r.covers, `${r.id} needs a label and what it covers`);
  }
  assert.deepEqual(ADMIN_RESOURCES.map((r) => r.id), [...ADMIN_RESOURCE_IDS], "one entry per resource, in order");
  assert.equal(adminResourceOf("users?filter=all&limit=25"), "users");
  assert.equal(adminResourceOf("feedback/2f000000-0000-4000-8000-000000000001"), "feedback");
  assert.equal(adminResourceOf("nothing"), null);
});

/* ── one refresh ───────────────────────────────────────────────── */

test("Refresh Data asks every view on screen afresh, once per address, and says what came back", async () => {
  const s = screen();
  try {
    const a = api();
    s.view("overview", "overview");
    s.view("overview", "overview"); // the same address shown twice
    s.view("users", "users?filter=all&limit=25&offset=0", { also: { visits: { state: "updated" } } });
    s.view("users", "users/0a000000-0000-4000-8000-000000000001", { also: { visits: { state: "updated" } } });
    now = 5_000;
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.deepEqual([...a.calls].sort(), ["overview", "users/0a000000-0000-4000-8000-000000000001", "users?filter=all&limit=25&offset=0"]);
    assert.equal(summary.outcome, "success");
    assert.deepEqual([...summary.updated].sort(), ["overview", "users", "visits"]);
    assert.ok(summary.unopened.includes("reviews") && summary.unopened.includes("audit"), "what isn't open is said to be so");
    assert.equal(summary.finishedAt, 5_000);
    for (const id of ["overview", "users", "visits"] as const) {
      assert.equal(status(id)?.state, "updated");
      assert.equal(status(id)?.updatedBy, "refresh");
      assert.equal(status(id)?.updatedAt, 5_000);
    }
    assert.equal(status("reviews")?.state, "unopened");
    assert.equal(getAdminRefreshSnapshot().last?.id, summary.id);
    assert.equal(getAdminRefreshSnapshot().running, false);
  } finally {
    s.clear();
  }
});

test("pressing it again while it runs joins the run under way: no second set of requests", async () => {
  const s = screen();
  try {
    const slow = deferred();
    const a = api({ overview: () => slow.promise });
    s.view("overview", "overview");
    const first = refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(getAdminRefreshSnapshot().running, true, "it says it's running at once");
    assert.equal(status("overview")?.state, "refreshing");
    const again = refreshAdminData({ can: everything, fetch: a.fetch });
    const third = refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(again, first);
    assert.equal(third, first);
    slow.resolve({ fresh: true });
    await first;
    assert.deepEqual(a.calls, ["overview"]);
    // Once it's over, a new press is a new refresh.
    await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(a.calls.length, 2);
  } finally {
    s.clear();
  }
});

test("what the role doesn't include is never asked for, and is told apart from a failure", async () => {
  const s = screen();
  try {
    const a = api();
    const moderator = (p: Permission) => p === "admin.access" || p === "reviews.moderate";
    s.view("users", "users?filter=all"); // can't happen in the app; the API would refuse it anyway
    s.view("reviews", "reviews?status=pending");
    const summary = await refreshAdminData({ can: moderator, fetch: a.fetch });
    assert.deepEqual(a.calls, ["reviews?status=pending"]);
    assert.equal(summary.outcome, "success");
    for (const id of ["users", "visits", "feedback", "settings", "access", "audit"] as const) assert.ok(summary.skipped.includes(id), `${id} skipped`);
    assert.ok(!summary.failed.length);
  } finally {
    s.clear();
  }
});

test("a refusal from the server (a role changed meanwhile) is outside the role, not a failure", async () => {
  const s = screen();
  try {
    const a = api({ "audit?limit=50": () => Promise.reject({ status: 403, code: "forbidden" }) });
    s.view("audit", "audit?limit=50");
    s.view("overview", "overview");
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(summary.outcome, "success");
    assert.ok(summary.skipped.includes("audit"));
    assert.equal(status("audit")?.state, "skipped");
    assert.equal(status("audit")?.problem, "Not part of your role any more.");
  } finally {
    s.clear();
  }
});

test("one failure stays with its own resource, the rest refresh, and a retry asks for it alone", async () => {
  const s = screen();
  try {
    let auditWorks = false;
    const a = api({
      "audit?limit=50": () => (auditWorks ? Promise.resolve({ items: [] }) : Promise.reject({ status: 500, code: "server", message: "relation \"secret\" does not exist" })),
    });
    s.view("overview", "overview");
    s.view("audit", "audit?limit=50");
    now = 7_000;
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(summary.outcome, "partial");
    assert.deepEqual(summary.failed, ["audit"]);
    assert.ok(summary.updated.includes("overview"));
    assert.equal(status("audit")?.state, "failed");
    assert.equal(status("audit")?.problem, "The server couldn't answer just now.", "never the server's own words");
    assert.equal(status("overview")?.state, "updated");

    auditWorks = true;
    now = 9_000;
    const retry = await retryAdminResource("audit", { can: everything, fetch: a.fetch });
    assert.deepEqual(retry.updated, ["audit"]);
    assert.deepEqual(a.calls.filter((c) => c === "overview"), ["overview"], "the retry left the rest alone");
    assert.equal(status("audit")?.state, "updated");
    assert.equal(status("audit")?.updatedAt, 9_000);
    const last = getAdminRefreshSnapshot().last;
    assert.equal(last?.outcome, "success", "the retry is folded into the refresh it followed");
    assert.equal(last?.finishedAt, 7_000);
  } finally {
    s.clear();
  }
});

test("a request that takes too long is given up and cancelled, and the others don't wait for it", async () => {
  const s = screen();
  try {
    const a = api({ crashes: () => new Promise(() => undefined) });
    s.view("crashes", "crashes");
    s.view("feedback", "feedback");
    const started = Date.now();
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch, timeoutMs: 60 });
    assert.ok(Date.now() - started < 2_000);
    assert.deepEqual(summary.failed, ["crashes"]);
    assert.ok(summary.updated.includes("feedback"));
    assert.equal(status("crashes")?.problem, "The server took too long to answer.");
    assert.equal(a.signals.get("crashes")?.aborted, true, "the request itself was cancelled");
  } finally {
    s.clear();
  }
});

test("no more than four requests at once, however many views", async () => {
  const s = screen();
  try {
    const a = api({ "*": () => new Promise((r) => setTimeout(() => r({}), 5)) });
    for (let i = 0; i < 6; i++) s.view("feedback", `feedback/${i}`);
    for (let i = 0; i < 6; i++) s.view("reviews", `reviews/${i}`);
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(a.calls.length, 12);
    assert.ok(a.mostAtOnce() <= 4, `${a.mostAtOnce()} at once`);
    assert.equal(summary.outcome, "success");
  } finally {
    s.clear();
  }
});

test("everything failing for want of a connection says so", async () => {
  const s = screen();
  try {
    const a = api({ "*": () => Promise.reject({ status: 0, code: "offline" }) });
    s.view("overview", "overview");
    s.view("role", "me");
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(summary.outcome, "failed");
    assert.equal(summary.offline, true);
    assert.equal(status("overview")?.problem, "Couldn't reach the server. Check your connection.");
  } finally {
    s.clear();
  }
});

test("visits come with the user list: not set up is said plainly, and a failed lookup fails only them", async () => {
  const s = screen();
  try {
    const a = api();
    s.view("users", "users?filter=all", { also: { visits: { state: "unavailable", problem: "Run the presence migration." } } });
    let summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(summary.outcome, "success");
    assert.equal(status("visits")?.state, "unavailable");
    assert.ok(summary.unavailable.includes("visits"));
    s.clear();

    s.view("users", "users?filter=all", { also: { visits: { state: "failed", problem: "Visit times couldn't be loaded." } } });
    summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(summary.outcome, "partial");
    assert.deepEqual(summary.failed, ["visits"]);
    assert.equal(status("users")?.state, "updated");
  } finally {
    s.clear();
  }
});

test("something open that no longer exists counts as up to date, with a note", async () => {
  const s = screen();
  try {
    s.view("users", "users/0a000000-0000-4000-8000-000000000001", { gone: true });
    const summary = await refreshAdminData({ can: everything, fetch: api().fetch });
    assert.equal(summary.outcome, "success");
    assert.equal(status("users")?.note, "Something you had open no longer exists.");
  } finally {
    s.clear();
  }
});

test("a live update during a refresh doesn't hide a view that failed, and a view that leaves meanwhile isn't on screen", async () => {
  const s = screen();
  try {
    const gate = deferred();
    const a = api({
      overview: () => gate.promise,
      crashes: () => gate.promise.then(() => Promise.reject({ status: 500 })),
      feedback: () => gate.promise,
    });
    s.view("overview", "overview");
    s.view("crashes", "crashes");
    const leaving = s.view("feedback", "feedback");
    now = 10_000;
    const run = refreshAdminData({ can: everything, fetch: a.fetch });
    now = 11_000;
    noteAdminLoad("crashes", "live"); // a live update reached crash reports elsewhere
    leaving(); // the page with the feedback left the screen
    gate.resolve(undefined);
    const summary = await run;
    assert.equal(summary.outcome, "partial", "the view that failed still failed");
    assert.deepEqual(summary.failed, ["crashes"]);
    assert.equal(status("overview")?.state, "updated");
    assert.equal(status("feedback")?.state, "unopened");
  } finally {
    s.clear();
  }
});

test("a view that throws at once fails alone", async () => {
  const off = [
    registerAdminView({
      resource: "settings",
      key: "settings",
      refresh: () => {
        throw new Error("broken view");
      },
    }),
    registerAdminView({ resource: "overview", key: "overview", refresh: async (ctx) => void (await ctx.get("overview")) }),
  ];
  try {
    const summary = await refreshAdminData({ can: everything, fetch: api().fetch });
    assert.deepEqual(summary.failed, ["settings"]);
    assert.ok(summary.updated.includes("overview"));
  } finally {
    off.forEach((f) => f());
    resetAdminRefresh();
  }
});

test("the end of a session stops a refresh under way and forgets what it found", async () => {
  const s = screen();
  try {
    const a = api({ overview: () => new Promise(() => undefined) });
    s.view("overview", "overview");
    const run = refreshAdminData({ can: everything, fetch: a.fetch, timeoutMs: 10_000 });
    resetAdminRefresh();
    await assert.rejects(run);
    assert.equal(getAdminRefreshSnapshot().running, false);
    assert.equal(getAdminRefreshSnapshot().last, null);
    assert.equal(a.signals.get("overview")?.aborted, true);
  } finally {
    s.clear();
  }
});

test("the snapshot is the same object until something changes, and subscribers hear each change", async () => {
  const s = screen();
  let heard = 0;
  const stop = subscribeAdminRefresh(() => heard++);
  try {
    const before = getAdminRefreshSnapshot();
    assert.equal(getAdminRefreshSnapshot(), before);
    s.view("changelog", "changelog");
    assert.ok(heard >= 1);
    assert.notEqual(getAdminRefreshSnapshot(), before);
    assert.equal(status("changelog")?.state, "loading", "a view just on screen is loading");
    noteAdminLoad("changelog", "opened");
    assert.equal(status("changelog")?.state, "updated");
    assert.equal(status("changelog")?.updatedBy, "opened");
  } finally {
    stop();
    s.clear();
  }
});

/* ── the order answers go on screen in ─────────────────────────── */

test("an older, slower answer never overwrites a newer one; a newer failure doesn't block an older success", () => {
  let o = createResponseOrder();
  const older = o.begin();
  const newer = o.begin();
  assert.equal(o.take(newer), true);
  assert.equal(o.take(older), false, "the slow one arrives last and is dropped");

  o = createResponseOrder();
  const works = o.begin();
  const fails = o.begin();
  assert.equal(o.isLatest(fails), true);
  assert.equal(o.take(works), true, "the newer one failed, so the older answer shows");
  assert.equal(o.isLatest(works), false);

  o = createResponseOrder();
  const forOldFilter = o.begin();
  o.reset(); // another filter, page or record
  assert.equal(o.take(forOldFilter), false, "nothing asked for the old address shows");
  assert.equal(o.superseded(forOldFilter), true);
  const forNewFilter = o.begin();
  assert.equal(o.take(forNewFilter), true);
});

test("the audit log's newest page merges in: new on top, fresh copies replace old, older pages stay", () => {
  const e = (id: number, label = "") => ({ id, label });
  assert.deepEqual(mergeNewestPage([e(5), e(4), e(3)], [e(7), e(6), e(5), e(4)], 50).items.map((x) => x.id), [7, 6, 5, 4, 3]);
  assert.equal(mergeNewestPage([e(5), e(4)], [e(6), e(5)], 50).restart, false);
  assert.equal(mergeNewestPage([e(5, "old")], [e(6), e(5, "new")], 50).items[1].label, "new");
  // More happened than a page holds: start again from the top.
  const gap = mergeNewestPage([e(5), e(4)], [e(9), e(8)], 2);
  assert.equal(gap.restart, true);
  assert.deepEqual(gap.items.map((x) => x.id), [9, 8]);
  assert.deepEqual(mergeNewestPage([], [e(2), e(1)], 50).items.map((x) => x.id), [2, 1]);
  assert.deepEqual(mergeNewestPage([e(2)], [], 50).items.map((x) => x.id), [2]);
  // Entries newer than the fresh page (a live update got them first) stay on top.
  assert.deepEqual(mergeNewestPage([e(12), e(11), e(10), e(9)], [e(10), e(9)], 50).items.map((x) => x.id), [12, 11, 10, 9]);
});

test("a full refresh asked for during a retry waits, then runs in full", async () => {
  const s = screen();
  try {
    let auditWorks = false;
    const a = api({ "audit?limit=50": () => (auditWorks ? Promise.resolve({ items: [] }) : Promise.reject({ status: 500 })) });
    s.view("overview", "overview");
    s.view("audit", "audit?limit=50");
    await refreshAdminData({ can: everything, fetch: a.fetch });
    auditWorks = true;
    const retry = retryAdminResource("audit", { can: everything, fetch: a.fetch });
    const full = refreshAdminData({ can: everything, fetch: a.fetch });
    assert.deepEqual((await retry).updated, ["audit"]);
    const summary = await full;
    assert.equal(summary.outcome, "success");
    assert.ok(summary.updated.includes("overview"), "not the retry's answer: the queued run covered everything");
    assert.equal(a.calls.filter((c) => c === "overview").length, 2);
  } finally {
    s.clear();
  }
});

test("a refusal on the role itself ends the refresh: no access, and not a partial success", async () => {
  const s = screen();
  try {
    const a = api({ me: () => Promise.reject({ status: 403, code: "forbidden" }) });
    s.view("role", "me");
    s.view("overview", "overview");
    const summary = await refreshAdminData({ can: everything, fetch: a.fetch });
    assert.equal(summary.ended, "no_access");
    assert.equal(summary.outcome, "failed");
  } finally {
    s.clear();
  }
});

test("a retry before any refresh leaves the last refresh unset", async () => {
  const s = screen();
  try {
    const a = api();
    s.view("audit", "audit?limit=50");
    await retryAdminResource("audit", { can: everything, fetch: a.fetch });
    assert.equal(getAdminRefreshSnapshot().last, null);
  } finally {
    s.clear();
  }
});

/* ── no page reloads ───────────────────────────────────────────── */

test("nothing in the Admin Center reloads the page to refresh it", () => {
  const root = process.cwd();
  const files = [
    "src/lib/platform/admin-refresh.ts",
    "src/lib/platform/client.ts",
    ...readdirSync(join(root, "src/components/admin")).map((f) => `src/components/admin/${f}`),
  ];
  const pages = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? pages(`${dir}/${d.name}`) : d.name.endsWith(".tsx") ? [`${dir}/${d.name}`] : []));
  for (const file of [...files, ...pages("src/app/(product)/(admin)")]) {
    const src = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(src, /location\.reload\s*\(|router\.refresh\s*\(/, `${file} reloads the page`);
  }
});
