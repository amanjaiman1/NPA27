#!/usr/bin/env -S npx tsx
/**
 * Product screenshots for the public site, taken from the real app running a
 * sample account. Every name and number in them is made up here; no real
 * person's data is ever used.
 *
 *     npm run test:e2e                      # once: builds the app against the mock Supabase
 *     npx tsx scripts/seo-screenshots.ts    # writes public/product/*.webp and
 *                                           # the install dialog's public/screenshots/*.jpg
 *
 * The sample account is built from the same seed the app gives a new account,
 * then restored through Settings → Data, exactly as a user would restore a
 * backup. Dates are relative to the day the script runs, so the screenshots
 * always look current. Re-run after any visible change to these pages.
 */

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { buildSampleChronicle } from "../src/lib/demo/sample-chronicle";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "product");
/**
 * The pictures in the browser's install dialog (`screenshots` in
 * public/manifest.webmanifest). Browsers only take JPEG or PNG there, and
 * every picture of one shape must have the same proportions, so these are
 * JPEG copies at fixed sizes. Change a size here and in the manifest together.
 */
const INSTALL_OUT = join(root, "public", "screenshots");
const INSTALL_SHOTS: Record<string, { width: number; height: number }> = {
  dashboard: { width: 1280, height: 800 },
  journal: { width: 1280, height: 800 },
  revision: { width: 1280, height: 800 },
  goals: { width: 1280, height: 800 },
  "dashboard-mobile": { width: 585, height: 1266 },
  "journal-entry-mobile": { width: 585, height: 1266 },
};
const APP = "http://localhost:3100";
const PASSWORD = "sampleAccount2027";

/* ── the sample account ──────────────────────────────────────── */

// Shared with the interactive demo (/demo), so both show the same made-up aspirant.
const sampleData = () => buildSampleChronicle(new Date());

/* ── servers ─────────────────────────────────────────────────── */

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };
const children: ChildProcess[] = [];
function start(cmd: string, args: string[], ready: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let out = "";
    const onData = (d: Buffer) => {
      out += d;
      if (out.includes(ready)) resolve();
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => reject(new Error(`${cmd} exited (${code}):\n${out.slice(-1500)}`)));
  });
}

/* ── capture ─────────────────────────────────────────────────── */

/** PNG → WebP, encoded by the browser itself (no image library needed). */
async function toWebp(browser: Browser, png: Buffer, quality = 0.84): Promise<Buffer> {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ b64, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", q);
    },
    { b64: png.toString("base64"), q: quality },
  );
  await page.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** A PNG, resized to exactly `width` × `height`, as a JPEG. */
async function toJpeg(browser: Browser, png: Buffer, width: number, height: number, quality = 0.86): Promise<Buffer> {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ b64, w, h, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", q);
    },
    { b64: png.toString("base64"), w: width, h: height, q: quality },
  );
  await page.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** The morning check-in comes before the app; the sample account skips it. */
async function passSleepPromptIfShown(page: Page) {
  const prompt = page.getByTestId("sleep-prompt");
  try {
    await prompt.waitFor({ timeout: 5000 });
  } catch {
    return;
  }
  await prompt.getByRole("button", { name: "Skip for today" }).click();
  await prompt.waitFor({ state: "detached" });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1600); // entry animations and charts
}

const written: string[] = [];
async function shoot(browser: Browser, page: Page, name: string, path: string, before?: (p: Page) => Promise<void>) {
  await page.goto(`${APP}${path}`);
  await settle(page);
  if (before) await before(page);
  const png = await page.screenshot({ type: "png" });
  const webp = await toWebp(browser, png);
  writeFileSync(join(OUT, `${name}.webp`), webp);
  const { width, height } = page.viewportSize()!;
  written.push(`${name}.webp  ${Math.round(webp.length / 1024)} KB  (${width}×${height} css px)`);
  const install = INSTALL_SHOTS[name];
  if (install) {
    const jpeg = await toJpeg(browser, png, install.width, install.height);
    writeFileSync(join(INSTALL_OUT, `${name}.jpg`), jpeg);
    written.push(`../screenshots/${name}.jpg  ${Math.round(jpeg.length / 1024)} KB  (${install.width}×${install.height} px)`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(INSTALL_OUT, { recursive: true });
  const backupFile = join(root, ".next", "sample-account.json");
  writeFileSync(backupFile, JSON.stringify({ app: "the-upsc-chronicle", schemaVersion: 14, data: sampleData() }));

  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
    await context.addInitScript(() => localStorage.setItem("upsc-chronicle-install-dismissed", String(Date.now())));
    const page = await context.newPage();

    // A fresh sample account, set up with the template, then the sample data restored over it.
    await page.goto(`${APP}/signup`);
    await page.getByLabel("Your name").fill("Meera");
    await page.getByLabel("Email").fill("sample.account@example.com");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Welcome. Let's make this yours.").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Which attempt are you preparing for?").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Start my chronicle" }).click();
    await passSleepPromptIfShown(page);
    await page.goto(`${APP}/settings#data`);
    await passSleepPromptIfShown(page);
    await page.locator('input[type="file"]').setInputFiles(backupFile);
    await page.getByRole("button", { name: "Restore backup" }).click();
    await page.getByText("Backup restored.").waitFor();
    await page.waitForTimeout(3000);

    await shoot(browser, page, "dashboard", "/dashboard");
    await shoot(browser, page, "subjects", "/subjects");
    await shoot(browser, page, "journal", "/journal");
    await shoot(browser, page, "journal-entry", "/journal?new=1");
    await shoot(browser, page, "revision", "/revision");
    await shoot(browser, page, "heatmap", "/heatmap");
    await shoot(browser, page, "mocks", "/mocks");
    await shoot(browser, page, "mistakes", "/mistakes");
    await shoot(browser, page, "goals", "/goals");
    await shoot(browser, page, "coach", "/coach");
    await shoot(browser, page, "reviews", "/performance-review");
    await shoot(browser, page, "wellbeing", "/wellbeing");

    // One phone-sized view of the dashboard.
    await page.setViewportSize({ width: 390, height: 844 });
    await shoot(browser, page, "dashboard-mobile", "/dashboard");
    await shoot(browser, page, "journal-entry-mobile", "/journal?new=1");
  } finally {
    await browser.close();
    children.forEach((c) => c.kill("SIGTERM"));
  }
  console.log(`Wrote to public/product:\n  ${written.join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  children.forEach((c) => c.kill("SIGTERM"));
  process.exit(1);
});
