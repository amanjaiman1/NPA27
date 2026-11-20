#!/usr/bin/env node
/**
 * What React renders for one interaction: a profiling build of the app
 * (`next build --profile --no-mangling`, so components keep their names)
 * and a stand-in for the React DevTools hook that records every commit.
 * The same approach the DevTools Profiler uses: a component rendered in a
 * commit when its fiber was replaced since the last commit and performed
 * work.
 *
 *     node --import tsx scripts/perf/render-probe.mjs --label after [--no-build] [--dataset heavy]
 *
 * Writes docs/perf/render-<label>.json. The build it leaves behind is a
 * profiling build against the mock: run `npm run build` before using the app.
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
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const LABEL = arg("label", "run");
const DATASET = arg("dataset", "typical");

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };
const kids = [];
const start = (cmd, args, ready) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    kids.push(c);
    let out = "";
    const on = (d) => ((out += d), out.includes(ready) && resolve(c));
    c.stdout.on("data", on);
    c.stderr.on("data", on);
    c.on("exit", (code) => reject(new Error(`${cmd} exited ${code}: ${out.slice(-1500)}`)));
  });

/** A minimal DevTools hook: React (profiling build) reports each commit to it. */
const HOOK = `(() => {
  const commits = (window.__commits = []);
  let previous = new WeakSet();
  const NAMED = new Set([0, 1, 11, 14, 15]); // function, class, forwardRef, memo, simple memo
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    onCommitFiberRoot(_id, root) {
      if (!window.__recording) { previous = collect(root.current, null); return; }
      const rendered = new Map();
      let count = 0;
      const next = collect(root.current, (fiber) => {
        if (previous.has(fiber) || !(fiber.flags & 1) || !NAMED.has(fiber.tag)) return;
        const t = fiber.type && (fiber.type.type || fiber.type.render || fiber.type);
        const name = (t && (t.displayName || t.name)) || 'Anonymous';
        rendered.set(name, (rendered.get(name) || 0) + 1);
        count++;
      });
      previous = next;
      commits.push({ ms: Math.round((root.current.actualDuration || 0) * 10) / 10, components: count, top: [...rendered.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25) });
    },
  };
  function collect(fiber, visit) {
    const seen = new WeakSet();
    const stack = [fiber];
    while (stack.length) {
      const f = stack.pop();
      if (!f) continue;
      seen.add(f);
      if (visit) visit(f);
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return seen;
  }
})();`;

async function main() {
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  if (!process.argv.includes("--no-build")) {
    console.log("Building a profiling build…");
    execFileSync("npx", ["next", "build", "--profile", "--no-mangling"], { cwd: root, env, stdio: "ignore" });
  }
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const anon = mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = `probe.${Date.now()}@example.com`;
  const s = await (await fetch(`${MOCK}/auth/v1/signup`, { method: "POST", headers: { "content-type": "application/json", apikey: anon }, body: JSON.stringify({ email, password: "studyHard2027" }) })).json();
  await fetch(`${MOCK}/rest/v1/rpc/save_chronicle_state`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ p_data: buildDataset(DATASET), p_base_version: 0 }),
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  await context.addInitScript(HOOK);
  const page = await context.newPage();
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("studyHard2027");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(3000);

  const results = { label: LABEL, dataset: DATASET, at: new Date().toISOString(), interactions: {} };
  async function record(name, act) {
    await page.evaluate(() => {
      window.__commits.length = 0;
      window.__recording = true;
    });
    await act();
    await page.waitForTimeout(1200);
    const commits = await page.evaluate(() => {
      window.__recording = false;
      return window.__commits.slice();
    });
    const top = new Map();
    for (const c of commits) for (const [n, k] of c.top) top.set(n, (top.get(n) ?? 0) + k);
    results.interactions[name] = {
      commits: commits.length,
      renderMs: Math.round(commits.reduce((a, c) => a + c.ms, 0) * 10) / 10,
      components: commits.reduce((a, c) => a + c.components, 0),
      top: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    };
    console.log(name, JSON.stringify({ ...results.interactions[name], top: results.interactions[name].top.slice(0, 8) }));
  }

  await page.goto(`${APP}/habits`);
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(1500);
  await record("habit check-in", () => page.locator('button[aria-label^="Mark "][aria-label$=" as done today"], button[aria-label^="Untick "]').first().click());

  await page.goto(`${APP}/settings#appearance`);
  await page.getByRole("switch", { name: "Reduce transparency" }).first().waitFor();
  await page.waitForTimeout(1500);
  await record("switch reduce transparency", () => page.getByRole("switch", { name: "Reduce transparency" }).first().click());

  await page.goto(`${APP}/dashboard`);
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(1500);
  await record("navigate dashboard to journal", async () => {
    await page.locator('aside a[href="/journal"]').first().click();
    await page.waitForURL(/journal/);
    await page.locator("main h1").first().waitFor();
  });

  await page.goto(`${APP}/dashboard`);
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(1500);
  await record("a minute on the dashboard, untouched", () => page.waitForTimeout(61_000));

  await browser.close();
  kids.forEach((k) => k.kill("SIGTERM"));
  mkdirSync(join(root, "docs", "perf"), { recursive: true });
  writeFileSync(join(root, "docs", "perf", `render-${LABEL}.json`), JSON.stringify(results, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  kids.forEach((k) => k.kill("SIGTERM"));
  process.exit(1);
});
