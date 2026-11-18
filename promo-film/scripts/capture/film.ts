/**
 * Films the real app for the promo: every shot the edit uses, in Light and
 * Dark, on a desktop and a phone, frame by frame (see recorder.ts).
 *
 *     npx tsx promo-film/scripts/capture/film.ts            # every shot
 *     npx tsx promo-film/scripts/capture/film.ts --only=L-dashboard-build,D-mocks-build
 *
 * FILM_SCALE (1.8: 2880 px across), FILM_WORKERS (3) and FILM_OUT (public/footage) can be set.
 *
 * Writes promo-film/public/footage/<shot>/0000.jpg … and meta.json (frame
 * count, size, theme, and the boxes of the cards on the last frame).
 *
 * The account is a made-up demonstration account (demo-data.ts) on the local
 * mock Supabase, created fresh for each run and discarded afterwards.
 */
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { Recorder, type SequenceMeta } from "./recorder";
import { APP, FILM_ROOT, createDemoAccount, launch, newContext, passSleepPromptIfShown, setTheme, settle, startServers, stopServers } from "./session";

const OUT = process.env.FILM_OUT ?? join(FILM_ROOT, "public", "footage");
/** Device scale for the desktop takes: 2.4 gives 3840 px across. FILM_SCALE=1 for a quick test. */
const SCALE = Number(process.env.FILM_SCALE ?? 1.8);
const PHONES = process.env.FILM_PHONES !== "0";
const CHOREO = join(FILM_ROOT, "scripts", "capture", "choreo.js");
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const want = (name: string) => only.length === 0 || only.includes(name);

/** A fixed-offset zone where it is early evening now, on today's date. */
function eveningZone(): string {
  const now = new Date();
  const utc = now.getUTCHours() + now.getUTCMinutes() / 60;
  const offset = Math.max(-11, Math.min(14, Math.round(18.9 - utc)));
  return offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}

async function go(page: Page, path: string, wait = 1500) {
  await page.goto(`${APP}${path}`);
  await passSleepPromptIfShown(page);
  await settle(page, wait);
}

/** Boxes of the visible top-level cards, the page header and the shell. */
async function layoutBoxes(page: Page): Promise<SequenceMeta["boxes"]> {
  // A string, not a function: tsx would wrap a function's helpers in __name().
  return (await page.evaluate("__choreo.layoutBoxes()")) as SequenceMeta["boxes"];
}

async function startTake(page: Page, name: string, theme: string) {
  const rec = new Recorder(page, OUT, name, { theme });
  await rec.begin();
  await page.addScriptTag({ path: CHOREO });
  return rec;
}

/** The standard shot: a page builds itself, then holds. */
async function buildShot(page: Page, theme: string, name: string, path: string, opts: { frames?: number; stagger?: number; scrollTo?: number; before?: (p: Page) => Promise<void> } = {}) {
  if (!want(name)) return;
  await go(page, path);
  if (opts.scrollTo) {
    await page.evaluate((y) => { document.querySelector("main.app-stage")!.scrollTop = y; }, opts.scrollTo);
    await page.waitForTimeout(500);
  }
  if (opts.before) await opts.before(page);
  const rec = await startTake(page, name, theme);
  await page.evaluate(`__choreo.build({ start: 100, stagger: ${opts.stagger ?? 80} })`);
  await page.evaluate("__film.sync()");
  await rec.frames(opts.frames ?? 105);
  const meta = await rec.finish(await layoutBoxes(page));
  console.log(`${name}: ${meta.frames} frames`);
}

/** A slow scroll down a page that is already built. */
async function scrollShot(page: Page, theme: string, name: string, path: string, to: number, frames = 120) {
  if (!want(name)) return;
  await go(page, path);
  const rec = await startTake(page, name, theme);
  await page.evaluate(`__choreo.scroll(${to}, 0, ${Math.round((frames / 30) * 1000) - 200})`);
  await rec.frames(frames);
  const meta = await rec.finish(await layoutBoxes(page));
  console.log(`${name}: ${meta.frames} frames`);
}

/** Type into the focused field a character at a time, two frames apart. */
async function typeOnCamera(page: Page, rec: Recorder, text: string, perChar = 2) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await rec.frames(perChar);
  }
}

/* ── the journal: logging today, then the celebration ─────────── */

async function journalShot(page: Page) {
  const name = "L-journal-log";
  if (!want(name)) return;
  await go(page, "/journal");
  const rec = await startTake(page, name, "light");
  await rec.frames(8);
  const open = page.getByRole("button", { name: /^(Log today|Edit today)$/ }).last();
  await open.click();
  for (let i = 0; i < 40 && !(await page.getByRole("dialog").isVisible().catch(() => false)); i++) await rec.frames(1);
  await rec.frames(14);
  const dialog = page.getByRole("dialog");

  // Study: three subjects and their hours.
  const subjects: [string, string][] = [["Polity & Governance", "2.5"], ["Economy", "2"], ["Sociology (Optional)", "2"]];
  for (let i = 0; i < subjects.length; i++) {
    if ((await dialog.locator('select[aria-label^="Subject "]').count()) <= i) {
      await dialog.getByRole("button", { name: "Add a subject" }).click();
      await rec.frames(6);
    }
    await dialog.getByLabel(`Subject ${i + 1}`, { exact: true }).selectOption({ label: subjects[i][0] });
    await rec.frames(6);
    const hours = dialog.getByLabel(`Hours for subject ${i + 1}`);
    await hours.click();
    await hours.press("Control+A");
    await typeOnCamera(page, rec, subjects[i][1], 3);
    await rec.frames(6);
  }

  // A topic finished today, from the syllabus.
  const topic = dialog.getByPlaceholder("Search the syllabus or type a topic…");
  await topic.click();
  await typeOnCamera(page, rec, "Parliam", 2);
  await rec.frames(8);
  const option = dialog.getByRole("option").first();
  if (await option.isVisible().catch(() => false)) await option.click();
  else await page.keyboard.press("Enter");
  await rec.frames(10);

  // One revision done today.
  const tick = dialog.locator("button[role='checkbox'], button[aria-pressed]").first();
  if (await tick.isVisible().catch(() => false)) {
    await tick.click();
    await rec.frames(12);
  }

  // How the day felt, and its highlight.
  const scroller = dialog.locator("div.overflow-y-auto").first();
  await page.evaluate(`(() => { const s = document.querySelector("[role='dialog'] .overflow-y-auto"); if (s) __film.custom(0, 900, (e) => { s.scrollTop = e * (s.scrollHeight - s.clientHeight) * 0.55; }, "inOutCubic"); })()`);
  await rec.frames(30);
  for (const [label, value] of [["Mood", 4], ["Focus", 5]] as const) {
    const r = dialog.getByRole("radio", { name: new RegExp(`^${label}: `) }).nth(value - 1);
    if (await r.isVisible().catch(() => false)) {
      await r.click();
      await rec.frames(6);
    }
  }
  const highlight = dialog.getByLabel("Highlight of the day");
  if (await highlight.isVisible().catch(() => false)) {
    await highlight.click();
    await typeOnCamera(page, rec, "Parliament and its committees, with notes", 1);
    await rec.frames(10);
  }
  void scroller;

  // Save: a new day, so the celebration plays.
  await dialog.getByRole("button", { name: /^Save (entry|changes)$/ }).click();
  await rec.frames(110);
  const meta = await rec.finish(await layoutBoxes(page));
  console.log(`${name}: ${meta.frames} frames`);
  // Close the celebration so later shots start clean.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}

/* ── revision: a pass marked as recalled ───────────────────────── */

async function revisionShot(page: Page) {
  const name = "L-revision-build";
  if (!want(name)) return;
  await go(page, "/revision");
  const rec = await startTake(page, name, "light");
  await page.evaluate(`__choreo.build({ start: 100, stagger: 80 })`);
  await page.evaluate("__film.sync()");
  await rec.frames(80);
  const recalled = page.getByRole("button", { name: /Recalled/ }).first();
  if (await recalled.isVisible().catch(() => false)) {
    await recalled.hover();
    await rec.frames(8);
    await recalled.click();
    await rec.frames(40);
  }
  const meta = await rec.finish(await layoutBoxes(page));
  console.log(`${name}: ${meta.frames} frames`);
}

/* ── habits: today's answer writing ticked ─────────────────────── */

async function habitsShot(page: Page) {
  const name = "L-habits-build";
  if (!want(name)) return;
  await go(page, "/habits");
  const rec = await startTake(page, name, "light");
  await page.evaluate(`__choreo.build({ start: 100, stagger: 90 })`);
  await page.evaluate("__film.sync()");
  await rec.frames(70);
  const toggle = page.getByRole("button", { name: /Answer writing/ }).first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    await rec.frames(36);
  }
  const meta = await rec.finish(await layoutBoxes(page));
  console.log(`${name}: ${meta.frames} frames`);
}

type Theme = "light" | "dark" | "lavender";
interface Task {
  name: string;
  theme: Theme;
  device: "desktop" | "phone";
  run: (page: Page) => Promise<void>;
}

const build = (device: Task["device"], theme: Theme, name: string, path: string, opts: Parameters<typeof buildShot>[4] = {}): Task => ({
  name, theme, device, run: (p) => buildShot(p, theme, name, path, opts),
});
const scroll = (device: Task["device"], theme: Theme, name: string, path: string, to: number, frames = 150): Task => ({
  name, theme, device, run: (p) => scrollShot(p, theme, name, path, to, frames),
});

/**
 * Lavender, then Light, then Dark, switched in Appearance the way a person
 * does it. The Appearance sheet is made transparent for the take so the page
 * underneath can be seen changing; the switch itself is the app's own.
 */
async function themeCycleShot(page: Page) {
  const name = "V-theme-cycle";
  await go(page, "/dashboard");
  const rec = await startTake(page, name, "lavender->light->dark");
  await rec.skip(36); // let the page's own entrance finish before the camera rolls
  await rec.frames(30);
  await page.getByRole("button", { name: /appearance/i }).first().click();
  await page.addStyleTag({ content: "[role='dialog'], .fixed.inset-0 { opacity: 0 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }" });
  await rec.skip(12);
  await page.getByRole("radio", { name: /^Light/ }).click();
  await rec.frames(45);
  await page.getByRole("radio", { name: /^Dark/ }).click();
  await rec.frames(45);
  await page.keyboard.press("Escape");
  await rec.frames(6);
  const meta = await rec.finish(await layoutBoxes(page));
  console.log(`${name}: ${meta.frames} frames`);
  await page.reload();
}

const TASKS: Task[] = [
  { name: "L-journal-log", theme: "light", device: "desktop", run: journalShot },
  build("desktop", "light", "L-dashboard-build", "/dashboard", { frames: 120, stagger: 75 }),
  build("desktop", "light", "L-subjects-build", "/subjects", { frames: 95 }),
  { name: "L-revision-build", theme: "light", device: "desktop", run: revisionShot },
  build("desktop", "light", "L-goals-build", "/goals", { frames: 95 }),
  { name: "L-habits-build", theme: "light", device: "desktop", run: habitsShot },
  build("desktop", "light", "L-wellbeing-build", "/wellbeing", { frames: 95 }),
  build("desktop", "light", "L-sleep-build", "/wellbeing/sleep", { frames: 95 }),
  build("desktop", "light", "L-running-build", "/wellbeing/running", { frames: 90 }),
  build("desktop", "light", "L-screen-build", "/wellbeing/screen", { frames: 90 }),
  build("desktop", "light", "L-reflections-build", "/reflections", { frames: 90 }),
  build("desktop", "light", "L-mistakes-build", "/mistakes", { frames: 95 }),
  { name: "V-theme-cycle", theme: "lavender", device: "desktop", run: themeCycleShot },
  build("desktop", "dark", "D-heatmap-build", "/heatmap", { frames: 105 }),
  build("desktop", "dark", "D-mocks-build", "/mocks", { frames: 105 }),
  build("desktop", "dark", "D-mocks-lower", "/mocks", { frames: 100, scrollTo: 820 }),
  scroll("desktop", "dark", "D-dashboard-scroll", "/dashboard", 980),
  build("phone", "lavender", "PV-dashboard-build", "/dashboard", { frames: 100, stagger: 90 }),
  scroll("phone", "lavender", "PV-dashboard-scroll", "/dashboard", 1500),
  scroll("phone", "dark", "PD-dashboard-scroll", "/dashboard", 1500),
];

/**
 * Takes run in parallel, each worker in its own browser context with its own
 * demonstration account, so their clocks and data never touch. The worker
 * that films the journal starts with today empty and logs it on camera; every
 * other account starts with the same day already logged.
 */
async function main() {
  const tasks = TASKS.filter((t) => want(t.name) && (PHONES || t.device === "desktop"));
  if (!tasks.length) throw new Error("no shots selected");
  await startServers();
  const browser = await launch();
  const timezoneId = eveningZone();
  const workers = Math.max(1, Math.min(Number(process.env.FILM_WORKERS ?? 3), tasks.length));
  console.log(`timezone ${timezoneId}, ${tasks.length} shots, ${workers} workers`);
  const queue = [...tasks];
  // The journal take must be first on its worker: it needs today empty.
  const journal = queue.findIndex((t) => t.name === "L-journal-log");
  if (journal > 0) queue.unshift(...queue.splice(journal, 1));
  let accounts = 0;
  const failures: string[] = [];

  async function worker(w: number) {
    const contexts: Record<string, { page: Page; theme: Theme }> = {};
    while (queue.length) {
      const task = queue.shift()!;
      // Phones open Appearance from the account menu, so each phone theme gets its own account instead.
      const key = task.device === "phone" ? `phone-${task.theme}` : "desktop";
      let slot = contexts[key];
      if (!slot) {
        const ctx: BrowserContext =
          task.device === "desktop"
            ? await newContext(browser, { width: 1600, height: 1000, scale: SCALE, timezoneId })
            : await newContext(browser, { width: 390, height: 844, scale: SCALE > 1.5 ? 2 : 1, mobile: true, timezoneId });
        await ctx.clock.install();
        const page = await ctx.newPage();
        const n = ++accounts;
        await createDemoAccount(page, task.theme, `demo.${task.device}.${n}@example.com`, { withToday: task.name !== "L-journal-log" });
        slot = contexts[key] = { page, theme: task.theme };
      }
      try {
        if (slot.theme !== task.theme) {
          await go(slot.page, "/dashboard", 800);
          await setTheme(slot.page, task.theme);
          slot.theme = task.theme;
        }
        const t0 = Date.now();
        await task.run(slot.page);
        console.log(`  [w${w}] ${task.name} done in ${Math.round((Date.now() - t0) / 1000)} s`);
        if (task.name === "V-theme-cycle") slot.theme = "dark";
      } catch (e) {
        failures.push(task.name);
        console.error(`  [w${w}] ${task.name} FAILED: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
  } finally {
    await browser.close();
    stopServers();
  }
  if (failures.length) {
    console.error(`failed: ${failures.join(",")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  stopServers();
  process.exit(1);
});
