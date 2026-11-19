import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { deactivateAccount } from "@/lib/account/session";
import { useChronicle } from "@/lib/store";
import { buildSampleChronicle } from "@/lib/demo/sample-chronicle";
import { loadSampleAccount } from "@/lib/demo/load";
import { DEMO_STEPS } from "@/lib/demo/guide";
import { DemoBlockedError, assertNotDemo, enterDemo, isDemo, leaveDemo } from "@/lib/demo/mode";
import { ApiError, apiCall } from "@/lib/platform/client";
import { FileError, fileLink, listStoredObjects, removeStoredPaths } from "@/lib/file-storage";
import { sendTestPush, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { PRODUCT_MODULES, PRODUCT_STATUS, statusCounts } from "@/content/product-status";

/* The interactive demo: the sample account is made up and the same every
   time, it never reaches storage, and nothing that would act for a real
   account can run while the demo is on, even with someone signed in. */

const NOW = new Date("2026-11-19T10:00:00");
const today = "2026-11-19";

let disk: MemoryStorage;
let tab: MemoryStorage;
let fetches: string[];
const realFetch = globalThis.fetch;

beforeEach(() => {
  disk = new MemoryStorage();
  tab = new MemoryStorage();
  fetches = [];
  setStorageBackend(disk as unknown as Storage);
  setActiveAccount(null);
  // A browser tab, as far as the demo flag is concerned.
  (globalThis as unknown as { window: unknown }).window = { sessionStorage: tab, location: { assign: () => undefined } };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  leaveDemo();
  deactivateAccount();
  delete (globalThis as unknown as { window?: unknown }).window;
  globalThis.fetch = realFetch;
  setStorageBackend(null);
});

test("the sample account is the same for the same day, and moves with the calendar", () => {
  const a = buildSampleChronicle(NOW);
  assert.equal(JSON.stringify(a), JSON.stringify(buildSampleChronicle(NOW)));
  const later = buildSampleChronicle(new Date("2026-12-03T10:00:00"));
  assert.equal(later.journal.length, a.journal.length, "the same days, two weeks on");
  assert.ok(later.journal.at(-1)!.date > a.journal.at(-1)!.date);
});

test("the sample is a whole, made-up preparation, recorded up to today", () => {
  const s = buildSampleChronicle(NOW);
  assert.equal(s.profile.name, "Meera");
  assert.ok(s.profile.onboardedAt && s.profile.tourSeenAt, "set up long ago, so no first-run screens stand in the way");
  assert.ok(s.lastSleepPrompt, "today's sleep question already answered");
  assert.equal(s.files.length, 0, "no attachments: there's no storage behind the demo");
  for (const e of s.journal) assert.ok(e.date <= today, e.date);
  for (const m of s.mocks) assert.ok(m.date <= today, m.date);
  assert.ok(s.journal.some((e) => e.date === today), "today has an entry to open");
  assert.ok(s.revisions.some((r) => r.nextDue <= today), "something to revise today");
  const [month, week] = s.plans;
  assert.equal(month.level, "month");
  assert.equal(week.level, "week");
  assert.equal(week.parentId, month.id);
  assert.ok(week.start <= today && today <= week.end, "this week's plan");
  const items = week.items ?? [];
  assert.ok(items.every((i) => (i.status === "completed") === (i.targetDate! < today)), "done up to yesterday, the rest ahead");
  assert.doesNotMatch(JSON.stringify(s), /@[a-z0-9-]+\.[a-z]{2,}/i, "no email addresses anywhere");
});

test("loaded into the store, the sample is written nowhere", async () => {
  await loadSampleAccount(NOW);
  const s = useChronicle.getState();
  assert.equal(s._hasHydrated, true);
  assert.equal(s.profile.name, "Meera");
  assert.ok(s.journal.length > 100);
  s.updateProfile({ name: "Changed in the demo" });
  s.upsertJournal({ ...s.journal[0], totalHours: 9 });
  assert.equal(disk.length, 0, "no account is active, so nothing reached storage");
  deactivateAccount();
  assert.equal(useChronicle.getState().journal.length, 0, "leaving blanks the memory too");
});

test("the demo flag belongs to the tab", () => {
  assert.equal(isDemo(), false);
  enterDemo();
  assert.equal(isDemo(), true);
  assert.equal(tab.getItem("doordie-demo"), "1");
  assert.equal(disk.length, 0, "never in localStorage, which other tabs share");
  leaveDemo();
  assert.equal(isDemo(), false);
  assert.doesNotThrow(() => assertNotDemo());
});

test("in the demo, nothing that acts for an account reaches the server", async () => {
  enterDemo();
  assert.throws(() => assertNotDemo("Deleting an account"), (e: unknown) => e instanceof DemoBlockedError && /isn't available in the demo/.test(e.message));
  await assert.rejects(apiCall("/api/reviews"), (e: unknown) => e instanceof ApiError && e.status === 403 && e.code === "demo");
  await assert.rejects(apiCall("/api/feedback", { method: "POST", body: { message: "hi" } }), ApiError);
  await assert.rejects(fileLink("someone/file.pdf"), FileError);
  assert.equal(await removeStoredPaths(["someone/file.pdf"]), false, "files are never deleted from the demo");
  assert.deepEqual(await listStoredObjects("someone"), []);
  assert.deepEqual(await subscribeToPush(), { ok: false, reason: "not-signed-in" });
  assert.equal((await sendTestPush()).ok, false);
  assert.equal(await unsubscribeFromPush(), false, "this browser's real subscription is left alone");
  assert.deepEqual(fetches, [], "not one request");
});

test("the guided tour has seven stops, each a real page of the app", () => {
  assert.equal(DEMO_STEPS.length, 7);
  const routes = new Set<string>(Object.values(FEATURES).flatMap((f) => [...f.routes]));
  assert.equal(new Set(DEMO_STEPS.map((s) => s.path)).size, 7, "no stop twice");
  for (const s of DEMO_STEPS) {
    assert.ok(routes.has(s.path), s.path);
    assert.ok(s.title && s.body && s.tryIt, s.path);
  }
});

test("the product status lists real features under their own names", () => {
  const keys = new Set(PRODUCT_MODULES.map((m) => m.key));
  assert.equal(keys.size, PRODUCT_MODULES.length);
  for (const m of PRODUCT_MODULES) {
    assert.ok(m.key in FEATURES, m.key);
    assert.equal(m.name, FEATURES[m.key as FeatureKey].label);
    assert.ok(m.status in PRODUCT_STATUS, m.status);
  }
  const counts = statusCounts();
  assert.equal(counts.available + counts.beta + counts.in_development + counts.planned, PRODUCT_MODULES.length);
});
