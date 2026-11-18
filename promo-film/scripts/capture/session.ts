/**
 * The capture session: the app running against the local mock Supabase, a
 * fresh demonstration account, and the demo data restored into it the way a
 * person restores a backup (Settings → Data → Restore from file).
 *
 * Needs a build made against the mock first:
 *
 *     node scripts/mock-supabase.mjs --print-env > /tmp/mock.env
 *     set -a; . /tmp/mock.env; set +a; MOCK_APP_URL=http://localhost:3100 npx next build
 *
 * (`npm run test:e2e` makes the same build.) Run `npm run build` again before
 * using the app for real.
 */

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { demoData } from "./demo-data";
import type { ThemeMode } from "../../../src/lib/types";

export const FILM_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const APP_ROOT = join(FILM_ROOT, "..");
export const APP = "http://localhost:3100";
const PASSWORD = "demoAccount2027";

const children: ChildProcess[] = [];

function start(cmd: string, args: string[], ready: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: APP_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
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

export function stopServers() {
  children.forEach((c) => c.kill("SIGTERM"));
}

export async function startServers() {
  const mockEnv = Object.fromEntries(
    execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: APP_ROOT, encoding: "utf8" })
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on", env);
  await start("npx", ["next", "start", "-p", "3100"], "Ready", env);
}

export async function launch(): Promise<Browser> {
  return chromium.launch({
    args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"],
  });
}

export async function newContext(
  browser: Browser,
  opts: { width: number; height: number; scale: number; sidebarCollapsed?: boolean; mobile?: boolean; timezoneId?: string },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.scale,
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
    reducedMotion: "no-preference",
    colorScheme: "light",
    timezoneId: opts.timezoneId ?? "Asia/Kolkata",
    locale: "en-IN",
  });
  const collapsed = opts.sidebarCollapsed ? "1" : "0";
  await context.addInitScript((c) => {
    localStorage.setItem("upsc-chronicle-install-dismissed", String(Date.now()));
    localStorage.setItem("upsc-chronicle-sidebar", c);
  }, collapsed);
  return context;
}

/** The morning check-in comes before the app; the demo account skips it. */
export async function passSleepPromptIfShown(page: Page) {
  const prompt = page.getByTestId("sleep-prompt");
  try {
    await prompt.waitFor({ timeout: 4000 });
  } catch {
    return;
  }
  await prompt.getByRole("button", { name: "Skip for today" }).click();
  await prompt.waitFor({ state: "detached" });
}

/** Sign up, finish first-run setup, then restore the demo data over it. */
export async function createDemoAccount(page: Page, theme: ThemeMode, email = "demo.account@example.com", opts: { withToday?: boolean } = {}) {
  const work = join(FILM_ROOT, ".work");
  mkdirSync(work, { recursive: true });
  // One file per account: parallel workers must never restore each other's data.
  const backupFile = join(work, `demo-account-${email.replace(/[^a-z0-9.]/gi, "_")}.json`);
  writeFileSync(backupFile, JSON.stringify({ app: "the-upsc-chronicle", schemaVersion: 14, data: demoData(theme, opts) }));

  await page.goto(`${APP}/signup`);
  await page.getByLabel("Your name").fill("Meera");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Welcome. Let's make this yours.").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Which attempt are you preparing for?").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my chronicle" }).click();
  await passSleepPromptIfShown(page);
  await restore(page, backupFile);
}

export async function restore(page: Page, backupFile: string) {
  await page.goto(`${APP}/settings#data`);
  await passSleepPromptIfShown(page);
  await page.locator('input[type="file"]').setInputFiles(backupFile);
  await page.getByRole("button", { name: "Restore backup" }).click();
  await page.getByText("Backup restored.").waitFor();
  await page.waitForTimeout(2500);
}

/** Switch theme the way a person does: Appearance, then Light or Dark. */
export async function setTheme(page: Page, theme: ThemeMode) {
  const current = await page.evaluate(() => document.documentElement.getAttribute("data-theme-mode"));
  if (current === theme) return;
  await page.getByRole("button", { name: /appearance/i }).first().click();
  const label = theme === "dark" ? "Dark" : theme === "lavender" ? "Lavender" : "Light";
  await page.getByRole("radio", { name: new RegExp(`^${label}`) }).click();
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

export async function settle(page: Page, ms = 1600) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
