#!/usr/bin/env node
/**
 * Lighthouse, mobile and desktop presets, against the production build and
 * the mock Supabase: the public home page, the welcome screen, and the
 * dashboard of a signed-in account with data (a Chrome profile signed in by
 * Playwright first, and Lighthouse told to keep its storage).
 *
 *     npm i -g lighthouse@12        # or set LIGHTHOUSE=/path/to/bin/lighthouse
 *     node --import tsx scripts/perf/lighthouse.mjs --label after [--no-build]
 *
 * Writes docs/perf/lighthouse-<label>.json with the scores and metrics.
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildDataset } from "./dataset.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = "http://localhost:3100";
const MOCK = "http://localhost:54321";
const LIGHTHOUSE = process.env.LIGHTHOUSE ?? "lighthouse";
const label = (() => {
  const i = process.argv.indexOf("--label");
  return i >= 0 ? process.argv[i + 1] : "run";
})();

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
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

async function signedInProfile() {
  const dir = mkdtempSync(join(tmpdir(), "lh-profile-"));
  const anon = mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = `lh.${Date.now()}@example.com`;
  const s = await (await fetch(`${MOCK}/auth/v1/signup`, { method: "POST", headers: { "content-type": "application/json", apikey: anon }, body: JSON.stringify({ email, password: "studyHard2027" }) })).json();
  await fetch(`${MOCK}/rest/v1/rpc/save_chronicle_state`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ p_data: buildDataset("typical"), p_base_version: 0 }),
  });
  const ctx = await chromium.launchPersistentContext(dir, { serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("studyHard2027");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(2500);
  await ctx.close();
  return dir;
}

async function lighthouse(url, preset, profileDir) {
  const outFile = join(tmpdir(), `lh-${Date.now()}.json`);
  // Chromium started by Playwright (the launcher Lighthouse ships can't start
  // it in every sandbox), with a debugging port Lighthouse connects to.
  const port = 9300 + Math.floor(Math.random() * 500);
  const args = [`--remote-debugging-port=${port}`];
  const browserOrContext = profileDir
    ? await chromium.launchPersistentContext(profileDir, { args, serviceWorkers: "block" })
    : await chromium.launch({ args });
  const cli = [
    url,
    "--output=json",
    `--output-path=${outFile}`,
    "--quiet",
    `--port=${port}`,
    "--only-categories=performance",
    ...(preset === "desktop" ? ["--preset=desktop"] : []),
    ...(profileDir ? ["--disable-storage-reset"] : []),
  ];
  try {
    execFileSync(LIGHTHOUSE, cli, { stdio: "ignore", timeout: 180_000 });
  } finally {
    await browserOrContext.close();
  }
  const lhr = JSON.parse(readFileSync(outFile, "utf8"));
  rmSync(outFile, { force: true });
  const a = lhr.audits;
  const ms = (id) => Math.round(a[id]?.numericValue ?? NaN);
  return {
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    fcp: ms("first-contentful-paint"),
    lcp: ms("largest-contentful-paint"),
    tbt: ms("total-blocking-time"),
    cls: Math.round((a["cumulative-layout-shift"]?.numericValue ?? 0) * 1000) / 1000,
    si: ms("speed-index"),
    tti: ms("interactive"),
    bytesKb: Math.round((a["total-byte-weight"]?.numericValue ?? 0) / 1024),
    lcpElement: a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 120) ?? null,
  };
}

async function main() {
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  if (!process.argv.includes("--no-build")) execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "ignore" });
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const results = { label, at: new Date().toISOString(), lighthouse: execFileSync(LIGHTHOUSE, ["--version"], { encoding: "utf8" }).trim(), runs: {} };
  try {
    for (const preset of ["mobile", "desktop"]) {
      for (const path of ["/", "/welcome"]) {
        const runs = [await lighthouse(`${APP}${path}`, preset), await lighthouse(`${APP}${path}`, preset), await lighthouse(`${APP}${path}`, preset)];
        runs.sort((x, y) => x.score - y.score);
        results.runs[`${preset} ${path}`] = runs[1];
        console.log(preset, path, JSON.stringify(runs[1]));
      }
      const profile = await signedInProfile();
      const runs = [await lighthouse(`${APP}/dashboard`, preset, profile), await lighthouse(`${APP}/dashboard`, preset, profile), await lighthouse(`${APP}/dashboard`, preset, profile)];
      runs.sort((x, y) => x.score - y.score);
      results.runs[`${preset} /dashboard (signed in)`] = runs[1];
      console.log(preset, "/dashboard", JSON.stringify(runs[1]));
      rmSync(profile, { recursive: true, force: true });
    }
  } finally {
    kids.forEach((k) => k.kill("SIGTERM"));
  }
  mkdirSync(join(root, "docs", "perf"), { recursive: true });
  writeFileSync(join(root, "docs", "perf", `lighthouse-${label}.json`), JSON.stringify(results, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  kids.forEach((k) => k.kill("SIGTERM"));
  process.exit(1);
});
