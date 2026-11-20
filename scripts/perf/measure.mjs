#!/usr/bin/env node
/**
 * Lab performance measurements: a production build of the app against the
 * local mock Supabase, driven by Playwright with Chrome DevTools throttling.
 *
 *     npx playwright install chromium            # once
 *     npm run perf:measure -- --label after      # builds against the mock, then measures
 *     npm run perf:measure -- --label after --no-build --only logout,login
 *
 * Writes docs/perf/<label>.json and prints a summary. Everything it creates
 * (accounts, browser profiles, the database) is local and thrown away. The
 * build points at the mock, so run `npm run build` again before using the
 * app for real. docs/performance-testing-guide.md explains every number.
 *
 * Profiles (documented in the guide):
 *   desktop  1440×900, DPR 1, no CPU slowdown, 40 ms RTT, 10 Mbps both ways
 *   mobile   412×823, DPR 1.75, touch, 4× CPU slowdown, 150 ms RTT,
 *            1.6 Mbps down and 675 kbps up (Lighthouse's mobile throttling)
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildDataset } from "./dataset.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = "http://localhost:3100";
const MOCK = "http://localhost:54321";
const PASSWORD = "studyHard2027";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const LABEL = arg("label", "run");
const RUNS = Number(arg("runs", "3"));
const ONLY = new Set((arg("only", "public,routes,heavy,reload,nav,logout,login,interact,film") ?? "").split(","));
const PROFILE_NAMES = (arg("profiles", "desktop,mobile") ?? "").split(",");

const PROFILES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpu: 1,
    net: { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8 },
    settleMs: 2000,
  },
  mobile: {
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    cpu: 4,
    net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
    settleMs: 3000,
  },
};

/* ── processes ─────────────────────────────────────────────────── */

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };
const children = [];
function start(cmd, args, ready) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let out = "";
    const onData = (d) => {
      out += d;
      if (out.includes(ready)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`${cmd} exited (${code}):\n${out.slice(-2000)}`)));
  });
}
const stopAll = () => children.forEach((c) => c.kill("SIGTERM"));

/* ── accounts ──────────────────────────────────────────────────── */

async function createAccount(email, dataset) {
  const anon = mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${MOCK}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password: PASSWORD, data: { full_name: "Meera Iyer" } }),
  });
  const session = await res.json();
  const token = session.access_token ?? session.session?.access_token;
  if (!token) throw new Error(`sign-up failed for ${email}: ${JSON.stringify(session).slice(0, 300)}`);
  const save = await fetch(`${MOCK}/rest/v1/rpc/save_chronicle_state`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${token}` },
    body: JSON.stringify({ p_data: buildDataset(dataset), p_base_version: 0 }),
  });
  if (!save.ok) throw new Error(`seeding ${email} failed: ${save.status} ${await save.text()}`);
  return email;
}
let accountSeq = 0;
const freshAccount = (dataset) => createAccount(`perf.${dataset}.${Date.now()}.${accountSeq++}@example.com`, dataset);

/* ── measuring a page ──────────────────────────────────────────── */

/** Runs before any page script: observers for the Web Vitals and long tasks. */
const PERF_INIT = `(() => {
  const P = (window.__perf = { lcp: 0, lcpEl: null, cls: 0, fcp: 0, longtasks: [], loafs: [], events: [] });
  const obs = (type, fn, extra) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...(extra || {}) }); } catch (e) {} };
  obs('largest-contentful-paint', (e) => { P.lcp = e.startTime; const el = e.element; P.lcpEl = el ? el.tagName.toLowerCase() + (el.getAttribute('alt') !== null ? '[img]' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : '') : (e.url || null); });
  let win = 0, first = 0, last = 0;
  obs('layout-shift', (e) => { if (e.hadRecentInput) return; if (win && e.startTime - last < 1000 && e.startTime - first < 5000) { win += e.value; last = e.startTime; } else { win = e.value; first = last = e.startTime; } P.cls = Math.max(P.cls, win); });
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') P.fcp = e.startTime; });
  obs('longtask', (e) => P.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]));
  obs('long-animation-frame', (e) => P.loafs.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration || 0)]));
  obs('event', (e) => { if (e.interactionId) P.events.push([e.name, Math.round(e.startTime), Math.round(e.duration), e.interactionId]); }, { durationThreshold: 16 });
  const seen = (sel) => { for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.width > 0) return true; } return false; };
  // When the page's heading first appeared: the moment the page is usable.
  // "main h1" is an app page's heading; a bare "h1" covers the sign-in screens and the public site.
  P.firstHeading = null; P.firstMainHeading = null;
  const watch = () => {
    if (P.firstHeading === null && seen('h1')) P.firstHeading = performance.now();
    if (P.firstMainHeading === null && seen('main h1')) P.firstMainHeading = performance.now();
    if (P.firstHeading === null || P.firstMainHeading === null) requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  P.when = (sel, timeout) => new Promise((resolve) => {
    const until = performance.now() + (timeout || 60000);
    const tick = () => (seen(sel) ? resolve(performance.now()) : performance.now() > until ? resolve(null) : requestAnimationFrame(tick));
    tick();
  });
})();`;

async function newContext(browser, profile, extra = {}) {
  const p = PROFILES[profile];
  const context = await browser.newContext({
    viewport: p.viewport,
    deviceScaleFactor: p.deviceScaleFactor,
    isMobile: p.isMobile,
    hasTouch: p.hasTouch,
    ...(p.userAgent ? { userAgent: p.userAgent } : {}),
    // The service worker would serve repeat visits from its own cache; it is
    // kept out so every run measures the same thing.
    serviceWorkers: "block",
    ...extra,
  });
  await context.addInitScript(PERF_INIT);
  return context;
}

/** Throttles a page the way the profile says, and counts what it downloads. */
async function instrument(page, profile) {
  const p = PROFILES[profile];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...p.net });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  const requests = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    if (!requests.has(e.requestId)) requests.set(e.requestId, { url: e.request.url, type: e.type ?? "Other", bytes: 0, t: e.timestamp });
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.type = e.type ?? r.type;
  });
  cdp.on("Network.dataReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.bytes += e.encodedDataLength;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.done = e.encodedDataLength;
  });
  return {
    cdp,
    requests,
    reset: () => requests.clear(),
    offline: (on) => cdp.send("Network.emulateNetworkConditions", on ? { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } : { offline: false, ...p.net }),
    clearCache: () => cdp.send("Network.clearBrowserCache"),
    summary() {
      const list = [...requests.values()];
      const bytesOf = (r) => Math.max(r.bytes, r.done ?? 0);
      const by = {};
      for (const r of list) {
        const k = r.type;
        by[k] ??= { count: 0, kb: 0 };
        by[k].count++;
        by[k].kb += bytesOf(r) / 1024;
      }
      for (const k of Object.keys(by)) by[k].kb = Math.round(by[k].kb);
      const supabase = list.filter((r) => r.url.startsWith(MOCK));
      return {
        requests: list.length,
        kb: Math.round(list.reduce((a, r) => a + bytesOf(r), 0) / 1024),
        jsKb: Math.round(list.filter((r) => r.type === "Script").reduce((a, r) => a + bytesOf(r), 0) / 1024),
        mediaKb: Math.round(list.filter((r) => r.type === "Media").reduce((a, r) => a + bytesOf(r), 0) / 1024),
        supabaseRequests: supabase.length,
        supabaseKb: Math.round(supabase.reduce((a, r) => a + bytesOf(r), 0) / 1024),
        supabaseCalls: supabase.map((r) => r.url.replace(MOCK, "").replace(/\?.*$/, "")),
        byType: by,
      };
    },
  };
}

/** Web Vitals, long tasks and memory for the page as it stands. */
async function vitals(page, tools) {
  const v = await page.evaluate(() => {
    const P = window.__perf;
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = P.fcp || 0;
    const tbt = P.longtasks.filter(([s]) => s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return {
      heading: P.firstMainHeading !== null ? Math.round(P.firstMainHeading) : P.firstHeading !== null ? Math.round(P.firstHeading) : null,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: Math.round(fcp),
      lcp: Math.round(P.lcp),
      lcpElement: P.lcpEl,
      cls: Math.round(P.cls * 1000) / 1000,
      tbt: Math.round(tbt),
      longTasks: P.longtasks.length,
      longestTask: P.longtasks.reduce((a, [, d]) => Math.max(a, d), 0),
      domNodes: document.getElementsByTagName("*").length,
    };
  });
  const { metrics } = await tools.cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { ...v, heapMb: Math.round((m.JSHeapUsedSize / 1048576) * 10) / 10 };
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 1000) / 1000;
};
/** Median of every numeric field across runs; the first run's text fields. */
function combine(runs) {
  const out = {};
  for (const k of Object.keys(runs[0] ?? {})) {
    const vals = runs.map((r) => r[k]);
    out[k] = typeof vals[0] === "number" ? median(vals) : vals[0];
  }
  out.runs = runs.length;
  return out;
}

/**
 * A service worker registration with a push subscription, for a browser that
 * can't reach a real push service. Records what the page asked of it.
 */
const FAKE_PUSH = `(() => {
  const calls = (window.__pushCalls = []);
  const sub = {
    endpoint: 'https://push.example.test/send/perf-device',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'x', auth: 'y' } }; },
    unsubscribe() { calls.push(['unsubscribe', performance.now()]); return new Promise((r) => setTimeout(() => r(true), 400)); },
  };
  const reg = {
    waiting: null, installing: null, active: {}, scope: location.origin + '/',
    addEventListener() {}, removeEventListener() {}, update: async () => {},
    pushManager: { getSubscription: async () => { calls.push(['getSubscription', performance.now()]); return sub; }, subscribe: async () => sub },
  };
  const sw = { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg), controller: null, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => sw, configurable: true });
})();`;

/* ── flows ─────────────────────────────────────────────────────── */

async function signIn(page, email) {
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
async function waitDashboard(page, timeout = 60_000) {
  await page.waitForURL(/\/dashboard/, { timeout });
  await page.locator("main h1").first().waitFor({ timeout });
}
/** A signed-in browser profile with the account's data on it, saved for reuse. */
async function signedInState(browser, profile, dataset) {
  const email = await freshAccount(dataset);
  const context = await newContext(browser, profile);
  const page = await context.newPage();
  await signIn(page, email);
  await waitDashboard(page);
  await page.waitForTimeout(2500); // the first sync settles and the base copy is stored
  const state = await context.storageState({ indexedDB: true });
  await context.close();
  return { email, state };
}

const ROUTES = [
  ["/dashboard", "Command Center"],
  ["/journal", "Daily Journal"],
  ["/wellbeing", "Life Dashboard"],
  ["/goals", "Goals"],
  ["/roadmap", "Roadmap"],
  ["/habits", "My Habits"],
  ["/revision", "Revision"],
  ["/performance-review", "Performance Review"],
  ["/diary", "Personal Diary"],
  ["/coach", "Study Coach"],
  ["/settings", "Settings"],
  ["/knowledge-graph", "Knowledge Graph"],
];

/** A cold load of `path`: the browser's HTTP cache empty, the account's data already on the device. */
async function coldLoad(browser, profile, state, path, ready = "main h1") {
  const context = await newContext(browser, profile, state ? { storageState: state } : {});
  const page = await context.newPage();
  const tools = await instrument(page, profile);
  const t0 = Date.now();
  // "commit", not "load": the home page's film holds the load event back, and
  // the heading is timed from inside the page anyway.
  await page.goto(`${APP}${path}`, { waitUntil: "commit", timeout: 90_000 });
  await page.evaluate((sel) => window.__perf.when(sel, 60000), ready);
  const readyWall = Date.now() - t0;
  await page.waitForTimeout(PROFILES[profile].settleMs);
  const v = await vitals(page, tools);
  const net = tools.summary();
  const url = new URL(page.url()).pathname;
  const loadEvent = await page.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0]?.loadEventStart || 0));
  await context.close();
  return { url, ready: v.heading, readyWall, ...v, loadEvent, requests: net.requests, kb: net.kb, jsKb: net.jsKb, mediaKb: net.mediaKb, supabaseRequests: net.supabaseRequests, supabaseKb: net.supabaseKb, supabaseCalls: net.supabaseCalls.join(" ") };
}

async function measureLoads(browser, profile, state, routes, label, ready = "main h1") {
  const out = {};
  for (const [path] of routes) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await coldLoad(browser, profile, state, path, ready));
    out[path] = combine(runs);
    log(`${label} ${profile} ${path}`, out[path]);
  }
  return out;
}

async function measureReload(browser, profile, state) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await newContext(browser, profile, { storageState: state });
    const page = await context.newPage();
    const tools = await instrument(page, profile);
    await page.goto(`${APP}/dashboard`, { waitUntil: "load" });
    await page.evaluate(() => window.__perf.when("main h1"));
    await page.waitForTimeout(PROFILES[profile].settleMs);
    tools.reset();
    await page.reload({ waitUntil: "commit" });
    await page.evaluate(() => window.__perf.when("main h1"));
    await page.waitForTimeout(PROFILES[profile].settleMs);
    const v = await vitals(page, tools);
    const net = tools.summary();
    runs.push({ ready: v.heading, ...v, requests: net.requests, kb: net.kb, supabaseRequests: net.supabaseRequests, supabaseKb: net.supabaseKb, supabaseCalls: net.supabaseCalls.join(" ") });
    await context.close();
  }
  return combine(runs);
}

/** Moves between pages by clicking the app's own links, twice over. */
async function measureNav(browser, profile, state) {
  const context = await newContext(browser, profile, { storageState: state });
  const page = await context.newPage();
  const tools = await instrument(page, profile);
  await page.goto(`${APP}/dashboard`, { waitUntil: "load" });
  await page.evaluate(() => window.__perf.when("main h1"));
  await page.waitForTimeout(PROFILES[profile].settleMs);
  const mobile = PROFILES[profile].isMobile;
  const targets = mobile
    ? [["/journal", "Journal"], ["/goals", "Goals"], ["/wellbeing", "Life"], ["/revision", "Revision"]]
    : ROUTES.filter(([p]) => p !== "/knowledge-graph").map(([p, label]) => [p, label]);
  const passes = [];
  for (let pass = 0; pass < 2; pass++) {
    const times = {};
    const order = [...targets, ["/dashboard", "Command Center"]];
    for (const [path, label] of order) {
      const link = mobile
        ? page.locator(`nav[aria-label="Quick access"] a[href="${path}"]`).first()
        : page.locator(`aside a[href="${path}"]`).first();
      if (mobile && path === "/dashboard") {
        await page.goto(`${APP}/dashboard`);
        await page.evaluate(() => window.__perf.when("main h1"));
        continue;
      }
      const before = await page.evaluate(() => window.__perf.longtasks.length);
      // Input as a person gives it: on a laptop the pointer rests on the link a
      // moment before the click; on a phone a finger lands on it. The time is
      // taken from the click (the tap's end), as the person experiences it.
      if (mobile) {
        await link.dispatchEvent("touchstart");
        await page.waitForTimeout(60);
      } else {
        await link.hover();
        await page.waitForTimeout(150);
      }
      const clickAt = await link.evaluate((el) => {
        const t = performance.now();
        el.click();
        return t;
      });
      await page.waitForURL((u) => u.pathname === path, { timeout: 30_000 });
      const shown = await page.evaluate(
        ([p]) =>
          new Promise((resolve) => {
            const tick = () => {
              const h = document.querySelector("main h1");
              if (location.pathname === p && h && h.getBoundingClientRect().height > 0) requestAnimationFrame(() => resolve(performance.now()));
              else requestAnimationFrame(tick);
            };
            tick();
          }),
        [path],
      );
      await page.waitForTimeout(300);
      const tasks = await page.evaluate((n) => window.__perf.longtasks.slice(n), before);
      times[path] = { ms: Math.round(shown - clickAt), longTasks: tasks.length, blocking: tasks.reduce((a, [, d]) => a + Math.max(0, d - 50), 0) };
      void label;
    }
    passes.push(times);
  }
  const net = tools.summary();
  await context.close();
  const summarize = (t) => ({ median: median(Object.values(t).map((x) => x.ms)), max: Math.max(...Object.values(t).map((x) => x.ms)), blocking: Object.values(t).reduce((a, x) => a + x.blocking, 0), pages: t });
  return { first: summarize(passes[0]), second: summarize(passes[1]), requests: net.requests };
}

/** Signing in on a fresh device, then signing out, in three situations. */
async function measureLoginLogout(browser, profile, dataset, variant) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const email = await freshAccount(dataset);
    const context = await newContext(browser, profile);
    // A device with background notifications on: a stand-in push subscription
    // whose unsubscribe takes 400 ms, as a call to the push service does.
    if (variant === "push") await context.addInitScript(FAKE_PUSH);
    const page = await context.newPage();
    await instrument(page, profile);
    await page.goto(`${APP}/login`, { waitUntil: "load" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    const t0 = Date.now();
    await page.getByRole("button", { name: "Sign in" }).click();
    await waitDashboard(page);
    const login = Date.now() - t0;
    await page.waitForTimeout(PROFILES[profile].settleMs);

    if (variant !== "clean" && variant !== "push") {
      // A change the cloud hasn't had yet: a setting switched just before signing out.
      await page.goto(`${APP}/settings#appearance`);
      await page.getByRole("switch", { name: "Reduce transparency" }).first().waitFor();
      await page.waitForTimeout(500);
      await page.getByRole("switch", { name: "Reduce transparency" }).first().click();
    }
    // Supabase can't be reached (a dropped connection, a captive portal): every
    // request to it fails at once. The app's own pages still load.
    if (variant === "unreachable") await page.route(`${MOCK}/**`, (route) => route.abort("internetdisconnected"));
    // A congested connection: every request to Supabase takes 1.5 s longer.
    if (variant === "slow") {
      await page.route(`${MOCK}/**`, async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue().catch(() => {});
      });
    }

    await page.getByRole("button", { name: /^Account:/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Account" });
    await dialog.waitFor();
    const s0 = Date.now();
    await dialog.getByRole("button", { name: "Sign out" }).click();
    let feedback = null;
    let askedToConfirm = false;
    // The boot screen's spoken label, not any text on the page that mentions signing out.
    const shown = page.locator('[aria-live="polite"]', { hasText: "Signing out" }).first();
    const confirmButton = page.getByRole("button", { name: "Sign out", exact: true }).last();
    const asked = page.getByText("Some changes haven't synced yet").first();
    const outcome = await Promise.race([
      shown.waitFor({ timeout: 30_000 }).then(() => "feedback"),
      asked.waitFor({ timeout: 30_000 }).then(() => "confirm"),
      page.waitForURL(/\/welcome|\/login/, { timeout: 30_000 }).then(() => "left"),
    ]).catch(() => "timeout");
    if (outcome === "feedback") feedback = Date.now() - s0;
    if (outcome === "confirm") {
      askedToConfirm = true;
      feedback = Date.now() - s0;
      // The old flow asks; a person reads it and answers. Measured up to the question, then answered at once.
      const inDialog = page.locator('[role="dialog"]', { hasText: "Some changes haven't synced yet" }).getByRole("button", { name: "Sign out" });
      await (await inDialog.count() ? inDialog.first() : confirmButton).click();
    }
    let logout = null;
    try {
      await page.waitForURL(/\/welcome/, { timeout: 30_000 });
      await page.getByRole("heading", { name: /personal operating system/ }).waitFor({ timeout: 30_000 });
      logout = Date.now() - s0;
    } catch {
      // Recorded as never reaching the welcome page within 30 s.
    }
    const leftover = await page
      .evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("upsc-chronicle-auth")).length)
      .catch(() => -1);
    // A sign-out that didn't wait for the server finishes in the background:
    // how long until the saved session is gone from the browser.
    let goneAfter = leftover === 0 ? 0 : null;
    for (let t = 0; goneAfter === null && t < 15_000; t += 250) {
      await page.waitForTimeout(250);
      const n = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("upsc-chronicle-auth")).length).catch(() => -1);
      if (n === 0) goneAfter = Date.now() - s0;
    }
    runs.push({ login, logoutMs: logout ?? 30_000, reachedWelcome: logout === null ? 0 : 1, feedbackMs: feedback ?? logout, askedToConfirm: askedToConfirm ? 1 : 0, sessionLeft: leftover, sessionGoneMs: goneAfter ?? -1, url: new URL(page.url()).pathname });
    await context.close();
  }
  return combine(runs);
}

/** Interaction latency (an INP proxy): the slowest event per interaction. */
async function measureInteractions(browser, profile, state) {
  const context = await newContext(browser, profile, { storageState: state });
  const page = await context.newPage();
  await instrument(page, profile);
  const results = {};
  const capture = async (name, act) => {
    const before = await page.evaluate(() => ({ e: window.__perf.events.length, t: window.__perf.longtasks.length }));
    await act();
    await page.waitForTimeout(800);
    const got = await page.evaluate((b) => ({ e: window.__perf.events.slice(b.e), t: window.__perf.longtasks.slice(b.t) }), before);
    const byInteraction = new Map();
    for (const [, , dur, id] of got.e) byInteraction.set(id, Math.max(byInteraction.get(id) ?? 0, dur));
    results[name] = { worstMs: Math.max(0, ...byInteraction.values()), interactions: byInteraction.size, longTasks: got.t.length, longestTask: got.t.reduce((a, [, d]) => Math.max(a, d), 0) };
  };

  await page.goto(`${APP}/habits`, { waitUntil: "load" });
  await page.evaluate(() => window.__perf.when("main h1"));
  await page.waitForTimeout(PROFILES[profile].settleMs);
  const tick = page.locator('button[aria-label^="Mark "][aria-label$=" as done today"], button[aria-label^="Untick "]').first();
  await capture("habit check-in", () => tick.click());
  await capture("habit check-in again", () => page.locator('button[aria-label^="Mark "][aria-label$=" as done today"], button[aria-label^="Untick "]').first().click());

  await page.goto(`${APP}/journal`, { waitUntil: "load" });
  await page.evaluate(() => window.__perf.when("main h1"));
  await page.waitForTimeout(PROFILES[profile].settleMs);
  await capture("open the journal composer", async () => {
    await page.getByRole("button", { name: /New entry|Log today|Edit today/ }).first().click();
    await page.getByRole("dialog").first().waitFor();
  });
  await capture("type in the composer", async () => {
    const field = page.getByPlaceholder("One line that captures the day");
    await field.click();
    await field.pressSequentially("Revised the Preamble", { delay: 40 });
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const discard = page.getByRole("button", { name: /Discard|Close without saving|Leave/ });
  if (await discard.count()) await discard.first().click();

  await page.goto(`${APP}/dashboard`, { waitUntil: "load" });
  await page.evaluate(() => window.__perf.when("main h1"));
  await page.waitForTimeout(PROFILES[profile].settleMs);
  await capture("open search", async () => {
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search pages").waitFor();
  });
  await capture("type in search", () => page.keyboard.type("revision", { delay: 50 }));
  await page.keyboard.press("Escape");

  await page.goto(`${APP}/settings#appearance`, { waitUntil: "load" });
  await page.getByRole("switch", { name: "Reduce transparency" }).first().waitFor();
  await page.waitForTimeout(PROFILES[profile].settleMs);
  await capture("switch reduce transparency", () => page.getByRole("switch", { name: "Reduce transparency" }).first().click());
  await capture("switch it back", () => page.getByRole("switch", { name: "Reduce transparency" }).first().click());
  await context.close();
  return results;
}

/** The home page's film: what it downloads in the first 20 seconds. */
async function measureFilm(browser, profile) {
  const context = await newContext(browser, profile);
  const page = await context.newPage();
  const tools = await instrument(page, profile);
  await page.goto(`${APP}/`, { waitUntil: "load" });
  await page.waitForTimeout(20_000);
  const v = await vitals(page, tools);
  const net = tools.summary();
  const playing = await page.evaluate(() => {
    const vid = document.querySelector("video");
    return vid ? { paused: vid.paused, currentTime: Math.round(vid.currentTime), src: vid.currentSrc.replace(location.origin, "") } : null;
  });
  await context.close();
  return { ...v, kb20s: net.kb, mediaKb20s: net.mediaKb, requests20s: net.requests, video: playing };
}

/* ── run ───────────────────────────────────────────────────────── */

const results = { label: LABEL, at: new Date().toISOString(), runs: RUNS, chromium: null, profiles: {} };
function log(what, value) {
  const keys = ["ready", "readyWall", "fcp", "lcp", "cls", "tbt", "jsKb", "kb", "requests", "supabaseRequests", "heapMb", "domNodes"];
  const parts = keys.filter((k) => value?.[k] !== undefined && value?.[k] !== null).map((k) => `${k}=${value[k]}`);
  console.log(`  ${what}: ${parts.join(" ")}`);
}

function save() {
  mkdirSync(join(root, "docs", "perf"), { recursive: true });
  const file = join(root, "docs", "perf", `${LABEL}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2) + "\n");
  return file;
}

/** One scenario: its result is saved at once, and a failure is recorded rather than ending the run. */
async function step(r, key, fn) {
  try {
    r[key] = await fn();
  } catch (e) {
    r[key] = { error: String(e?.message ?? e).split("\n")[0] };
    console.log(`  ✗ ${key}: ${r[key].error}`);
  }
  save();
  return r[key];
}

async function main() {
  console.log("Starting the mock Supabase…");
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  if (!process.argv.includes("--no-build")) {
    console.log("Building the app against it…");
    execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "ignore" });
  }
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const browser = await chromium.launch();
  results.chromium = browser.version();
  try {
    for (const profile of PROFILE_NAMES) {
      const r = (results.profiles[profile] = {});
      console.log(`\n▶ ${profile}`);
      if (ONLY.has("public")) {
        await step(r, "public", () => measureLoads(browser, profile, null, [["/"], ["/welcome"], ["/login"]], "public", "h1"));
      }
      const needsTypical = ["routes", "reload", "nav", "interact"].some((k) => ONLY.has(k));
      const typical = needsTypical ? await signedInState(browser, profile, "typical") : null;
      if (ONLY.has("routes")) await step(r, "routes", () => measureLoads(browser, profile, typical.state, ROUTES, "routes"));
      if (ONLY.has("reload")) {
        const v = await step(r, "reload", () => measureReload(browser, profile, typical.state));
        log(`reload ${profile}`, v);
      }
      if (ONLY.has("nav")) {
        const v = await step(r, "nav", () => measureNav(browser, profile, typical.state));
        if (v?.first) console.log(`  nav ${profile}: first median ${v.first.median} ms, second median ${v.second.median} ms`);
      }
      if (ONLY.has("interact")) {
        const v = await step(r, "interact", () => measureInteractions(browser, profile, typical.state));
        console.log(`  interact ${profile}:`, JSON.stringify(v));
      }
      if (ONLY.has("heavy") && profile === "mobile") {
        const heavy = await signedInState(browser, profile, "heavy");
        await step(r, "heavy", () => measureLoads(browser, profile, heavy.state, [["/dashboard"], ["/journal"], ["/habits"], ["/coach"], ["/performance-review"], ["/diary"], ["/roadmap"]], "heavy"));
        const v = await step(r, "heavyReload", () => measureReload(browser, profile, heavy.state));
        log(`heavy reload ${profile}`, v);
        if (ONLY.has("interact")) {
          const w = await step(r, "heavyInteract", () => measureInteractions(browser, profile, heavy.state));
          console.log(`  heavy interact ${profile}:`, JSON.stringify(w));
        }
      }
      if (ONLY.has("login") || ONLY.has("logout")) {
        r.session = {};
        const variants = (arg("variants", "clean,pending,push,slow,unreachable") ?? "").split(",");
        for (const variant of variants) {
          const v = await step(r.session, variant, () => measureLoginLogout(browser, profile, "typical", variant));
          console.log(`  session ${profile} ${variant}:`, JSON.stringify(v));
        }
      }
      if (ONLY.has("film")) {
        const v = await step(r, "film", () => measureFilm(browser, profile));
        console.log(`  film ${profile}:`, JSON.stringify(v));
      }
    }
  } finally {
    await browser.close();
    stopAll();
  }
  console.log(`\nWrote ${save()}`);
}

main().catch((e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});
