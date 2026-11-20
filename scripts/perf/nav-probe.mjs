#!/usr/bin/env node
/**
 * Page-to-page, as the person sees it: for each tap, when the progress bar
 * appeared, when it finished, when the address changed, and when the new
 * page's heading was on screen. A bar that finishes before the page is there
 * shows as a positive "gap".
 *
 *     npm run perf:nav -- --no-build                 # after a build against the mock
 *     npm run perf:nav -- --profile desktop --label nav-desktop
 *
 * Same lab setup as measure.mjs (docs/performance-testing-guide.md): a
 * production build against the local mock Supabase, Chrome DevTools
 * throttling, a fresh account with the "typical" dataset. Writes
 * docs/perf/<label>.json.
 *
 * Each page is opened twice: the first time its code may still have to be
 * downloaded, the second time it's in memory. `--stale` then waits out the
 * router's five-minute prefetch window (Next's `staleTimes.static`) and opens
 * them a third time, as after a few minutes of using the app.
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
const LABEL = arg("label", "nav-mobile");
const PROFILE = arg("profile", "mobile");
const DATASET = arg("dataset", "typical");
const STALE = process.argv.includes("--stale");

const PROFILES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpu: 1,
    net: { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8 },
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
  },
};
// A weaker phone connection: what a train, a basement or a busy tower gives.
PROFILES["mobile-slow"] = {
  ...PROFILES.mobile,
  net: { latency: 400, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (300 * 1024) / 8 },
};
/** `--sw`: let the app's service worker run, as on a real phone with the app installed. */
const SW = process.argv.includes("--sw");
/**
 * `--slow-code <ms>`: hold every page-code download back this long, as when
 * the page's code comes after its data (a poor connection, or the first visit
 * after an update). `--slow-data <ms>`: the same for the page's data (the RSC
 * payload), as on a connection that stalls.
 */
const SLOW_CODE = Number(arg("slow-code", "0"));
const SLOW_DATA = Number(arg("slow-data", "0"));
const P = PROFILES[PROFILE];
if (!P) throw new Error(`Unknown profile ${PROFILE}`);

/** The dock's four pages, then pages opened from the menu. */
const DOCK = ["/journal", "/goals", "/wellbeing", "/revision"];
const MENU = ["/habits", "/coach", "/roadmap", "/diary", "/performance-review", "/mocks", "/subjects", "/settings", "/dashboard"];

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

async function createAccount(email) {
  const anon = mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${MOCK}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password: PASSWORD, data: { full_name: "Meera Iyer" } }),
  });
  const session = await res.json();
  const token = session.access_token ?? session.session?.access_token;
  if (!token) throw new Error(`sign-up failed: ${JSON.stringify(session).slice(0, 300)}`);
  const save = await fetch(`${MOCK}/rest/v1/rpc/save_chronicle_state`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${token}` },
    body: JSON.stringify({ p_data: buildDataset(DATASET), p_base_version: 0 }),
  });
  if (!save.ok) throw new Error(`seeding failed: ${save.status} ${await save.text()}`);
}

/* ── what the page records ─────────────────────────────────────── */

const RECORDER = `(() => {
  const N = (window.__nav = { events: [] });
  const log = (...e) => N.events.push([Math.round(performance.now()), ...e]);
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m].bind(history);
    history[m] = (s, t, u) => { const r = orig(s, t, u); log('url', m, location.pathname + location.search); return r; };
  }
  window.addEventListener('popstate', () => log('url', 'pop', location.pathname));
  let bar = 'idle', fallback = false, heading = '';
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const tick = () => {
    const b = document.querySelector('.route-progress');
    const state = b ? b.getAttribute('data-state') || 'on' : 'idle';
    if (state !== bar) { bar = state; log('bar', state); }
    const f = Boolean(document.querySelector('[data-route-loading], [aria-label="Loading page"]'));
    if (f !== fallback) { fallback = f; log('fallback', f); }
    const h = [...document.querySelectorAll('main h1')].find(visible);
    const text = h ? h.textContent.trim().slice(0, 40) : '';
    if (text !== heading) { heading = text; log('h1', text); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

/* ── a tap ─────────────────────────────────────────────────────── */

async function open(page, path, fromMenu) {
  if (fromMenu && P.isMobile) {
    await page.locator('nav[aria-label="Quick access"] button', { hasText: "More" }).click();
    await page.locator(`aside a[href="${path}"]`).first().waitFor({ state: "visible" });
    await page.waitForTimeout(400); // the drawer's slide
  }
  const link = P.isMobile && !fromMenu
    ? page.locator(`nav[aria-label="Quick access"] a[href="${path}"]`).first()
    : page.locator(`aside a[href="${path}"]`).first();
  return tap(page, link, path);
}

/** Taps `link` the way a person does and times what follows, until `path`'s heading is on screen. */
async function tap(page, link, path) {
  if (P.isMobile) {
    await link.dispatchEvent("touchstart");
    await page.waitForTimeout(60);
  } else {
    await link.hover();
    await page.waitForTimeout(150);
  }
  const tapAt = await link.evaluate((el) => {
    const t = performance.now();
    el.click();
    return t;
  });
  // The page is there when its heading is: wait for it, then for the bar to fade.
  await page.waitForFunction(
    (p) => location.pathname === p && [...document.querySelectorAll("main h1")].some((h) => h.getBoundingClientRect().height > 0),
    path,
    { timeout: 60_000, polling: "raf" },
  );
  await page.waitForTimeout(900);
  const events = await page.evaluate((t) => window.__nav.events.filter(([at]) => at >= t - 1), Math.round(tapAt));
  const first = (kind, value) => events.find((e) => e[1] === kind && (value === undefined || e[2] === value))?.[0] ?? null;
  const rel = (t) => (t === null ? null : Math.round(t - tapAt));
  const contentAt = events.filter((e) => e[1] === "h1" && e[2]).map((e) => e[0]).pop() ?? null;
  const barDone = first("bar", "done") ?? (first("bar", "loading") !== null ? first("bar", "idle") : null);
  return {
    path,
    url: rel(first("url")),
    barShown: rel(first("bar", "loading")),
    barDone: rel(barDone),
    fallback: rel(first("fallback", true)),
    content: rel(contentAt),
    gap: barDone !== null && contentAt !== null ? Math.round(contentAt - barDone) : null,
  };
}

function print(name, rows) {
  console.log(`\n${name}`);
  console.log("  page                 url   bar   done  fallback content  gap");
  for (const r of rows) {
    const c = (v) => String(v ?? "–").padStart(6);
    console.log(`  ${r.path.padEnd(20)}${c(r.url)}${c(r.barShown)}${c(r.barDone)}${c(r.fallback)}${c(r.content)}${c(r.gap)}`);
  }
  return rows;
}

async function pass(page, name) {
  const rows = [];
  for (const path of DOCK) rows.push(await open(page, path, false));
  for (const path of MENU) rows.push(await open(page, path, true));
  return print(name, rows);
}

/**
 * Links inside a page (the Command Center's "Journal" button and the like)
 * are Next's own <Link>, which prefetches what's on screen. Tapped after the
 * page has been open a while, as people do.
 */
const IN_PAGE = [
  ["/journal", 'main a[href="/journal"]'],
  ["/coach", 'main a[href="/coach?tab=suggestions"]'],
];
async function inPagePass(page, waitMs) {
  const rows = [];
  for (const [path, selector] of IN_PAGE) {
    await open(page, "/dashboard", true);
    const link = page.locator(selector).first();
    if (!(await link.count())) {
      rows.push({ path, missing: selector });
      continue;
    }
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(waitMs);
    rows.push(await tap(page, link, path));
  }
  return print(`In-page links, tapped ${Math.round(waitMs / 1000)} s after the page opened`, rows.filter((r) => !r.missing));
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
  const results = {
    label: LABEL,
    profile: PROFILE,
    dataset: DATASET,
    serviceWorker: SW,
    slowCodeMs: SLOW_CODE,
    slowDataMs: SLOW_DATA,
    at: new Date().toISOString(),
    passes: {},
  };
  try {
    const email = `perf.nav.${Date.now()}@example.com`;
    await createAccount(email);
    const context = await browser.newContext({
      viewport: P.viewport,
      deviceScaleFactor: P.deviceScaleFactor,
      isMobile: P.isMobile,
      hasTouch: P.hasTouch,
      ...(P.userAgent ? { userAgent: P.userAgent } : {}),
      serviceWorkers: SW ? "allow" : "block",
    });
    await context.addInitScript(RECORDER);
    const page = await context.newPage();
    await page.goto(`${APP}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
    await page.locator("main h1").first().waitFor({ timeout: 60_000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...P.net });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
    // Whatever the app warms in idle time gets its chance, as in real use.
    await page.waitForTimeout(8_000);
    const hold = (ms) => (route) => setTimeout(() => route.continue().catch(() => undefined), ms);
    if (SLOW_CODE) await page.route(/\/_next\/static\/chunks\//, hold(SLOW_CODE));
    if (SLOW_DATA) await page.route((url) => url.searchParams.has("_rsc"), hold(SLOW_DATA));
    // `--in-page-only`: just the in-page links, for a quick check.
    if (!process.argv.includes("--in-page-only")) {
      results.passes.first = await pass(page, "First visit to each page");
      results.passes.second = await pass(page, "Second visit");
    }
    results.passes.inPage = await inPagePass(page, Number(arg("wait", "35000")));
    if (STALE) {
      console.log("\nWaiting out the five-minute prefetch window…");
      await page.waitForTimeout(5 * 60_000 + 10_000);
      results.passes.stale = await pass(page, "After five minutes");
    }
    await context.close();
  } finally {
    await browser.close();
    stopAll();
  }
  mkdirSync(join(root, "docs", "perf"), { recursive: true });
  const file = join(root, "docs", "perf", `${LABEL}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});
