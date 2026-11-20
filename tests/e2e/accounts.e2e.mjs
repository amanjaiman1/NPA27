#!/usr/bin/env node
/**
 * Multi-account checks in a real browser, against the local mock Supabase.
 *
 *     npx playwright install chromium     # once
 *     npm run test:e2e                     # builds against the mock, then runs
 *     npm run test:e2e -- --no-build       # reuse the last build
 *
 * Every account, browser profile ("device") and database used here is local
 * and thrown away at the end. The build it makes points at the mock, so run
 * `npm run build` again before using the app for real.
 */

import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = "http://localhost:3100";
const MOCK = "http://localhost:54321";
const PASSWORD = "studyHard2027";

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };

/* ── processes ─────────────────────────────────────────────────── */

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
    child.on("exit", (code) => reject(new Error(`${cmd} ${args.join(" ")} exited (${code}):\n${out.slice(-2000)}`)));
  });
}
const stopAll = () => children.forEach((c) => c.kill("SIGTERM"));

/* ── checks ────────────────────────────────────────────────────── */

let passed = 0;
async function scenario(name, fn) {
  process.stdout.write(`• ${name} … `);
  await fn();
  passed++;
  console.log("✓");
}
function check(cond, message) {
  if (!cond) throw new Error(message);
}
const mock = async (path) => (await fetch(`${MOCK}${path}`)).json();
async function cloudOf(email) {
  return mock(`/__mock/snapshot?email=${encodeURIComponent(email)}`);
}
async function waitFor(what, test, timeout = 20_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const storageOf = (page) =>
  page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
const sessionOf = async (page) => JSON.parse((await storageOf(page))["upsc-chronicle-auth"] ?? "null");

/* ── flows ─────────────────────────────────────────────────────── */

async function signUp(page, name, email) {
  await page.goto(`${APP}/signup`);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Welcome. Let's make this yours.").waitFor();
}

async function onboard(page, expectedName) {
  const nameField = page.getByLabel("What should we call you?");
  check((await nameField.inputValue()) === expectedName, "setup should start with the name given at sign-up");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Which attempt are you preparing for?").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my chronicle" }).click();
}

/** The morning check-in can be skipped; scenario 9 records sleep properly. */
async function passSleepPromptIfShown(page) {
  const prompt = page.getByTestId("sleep-prompt");
  try {
    await prompt.waitFor({ timeout: 4000 });
  } catch {
    return;
  }
  await prompt.getByRole("button", { name: "Skip for today" }).click();
  await prompt.waitFor({ state: "detached" });
}

/**
 * A new account's first visit to the dashboard opens the feature tour over
 * it. Skip it, as someone in a hurry would, so the run can carry on. It waits
 * only when the tour is due: a recent setup, and the tour never seen.
 */
async function passTourIfShown(page) {
  try {
    await page.waitForURL(/\/dashboard(?:[?#]|$)/, { timeout: 8000 });
  } catch {
    return;
  }
  const due = await page.evaluate(() => {
    const id = JSON.parse(localStorage.getItem("upsc-chronicle-auth") ?? "null")?.user?.id;
    const raw = id && localStorage.getItem(`upsc-chronicle-store:${id}`);
    const profile = raw ? JSON.parse(raw)?.state?.profile : null;
    if (!profile?.onboardedAt || profile.tourSeenAt) return false;
    const age = (Date.now() - new Date(`${profile.onboardedAt}T00:00:00`).getTime()) / 86_400_000;
    return age > -2 && age < 8;
  });
  if (!due) return;
  const tour = page.getByRole("dialog", { name: "DoOrDie feature tour" });
  try {
    await tour.waitFor({ timeout: 8000 });
  } catch {
    return;
  }
  await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
  await tour.waitFor({ state: "detached" });
}

/** Picks a time in the sleep card's picker, by typing or by tapping hour and minute. */
async function pickTime(page, field, { type, hour, minute }) {
  await field.click();
  const sheet = page.getByTestId("time-sheet");
  await sheet.waitFor();
  if (type) {
    await sheet.getByLabel("Or type it").fill(type);
    await sheet.getByRole("button", { name: "Set", exact: true }).click();
  } else {
    await sheet.getByRole("button", { name: hour, exact: true }).click();
    await sheet.getByRole("button", { name: minute, exact: true }).click();
  }
  await sheet.waitFor({ state: "detached" });
}
const lifeDayOf = async (email, date) => (await cloudOf(email))?.data?.lifeLog?.find((l) => l.date === date);
const htmlAttr = (pg, name) => pg.evaluate((n) => document.documentElement.getAttribute(n), name);

async function signIn(page, email, password = PASSWORD) {
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page) {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("dialog", { name: "Account" }).getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/welcome/);
}

/**
 * Today's entry in the composer (new or existing). /journal is Daily Capture
 * now; the entry dialog it shares its form with opens from History.
 */
async function openComposer(page) {
  await page.goto(`${APP}/journal/history?new=1`);
  const composer = page.getByRole("dialog", { name: /^(New|Edit) entry$/ });
  await composer.waitFor();
  return composer;
}

/** Picks files in the composer and waits until each is uploaded and attached. */
async function attachFiles(composer, files) {
  await composer.getByTestId("attachment-input").setInputFiles(files);
  for (const f of files) await composer.getByRole("button", { name: `Preview ${f.name}` }).waitFor({ timeout: 20_000 });
}

async function saveComposer(page, composer) {
  await composer.getByRole("button", { name: /^Save (entry|changes)$/ }).click();
  await composer.waitFor({ state: "detached" });
  // The day's first real entry is celebrated (the morning check-in no longer
  // pre-creates it). Close the celebration so the run can carry on.
  const party = page.getByRole("dialog", { name: "Day accomplished" });
  try {
    await party.waitFor({ timeout: 2500 });
  } catch {
    return;
  }
  await party.getByRole("button", { name: "Keep going" }).click();
  await party.waitFor({ state: "detached" });
}

async function writeJournal(page, highlight, { files } = {}) {
  const composer = await openComposer(page);
  if ((await composer.getByLabel("Subject 1", { exact: true }).count()) === 0) {
    await composer.getByRole("button", { name: "Add a subject" }).click();
  }
  await composer.getByLabel("Subject 1", { exact: true }).selectOption({ label: "Polity & Governance" });
  await composer.getByLabel("Hours for subject 1", { exact: true }).fill("5");
  await composer.getByPlaceholder("One line that captures the day").fill(highlight);
  if (files) await attachFiles(composer, files);
  await saveComposer(page, composer); // no confirmation step any more
}

/** A 1×1 PNG and a short text file, as Playwright file payloads. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const textFile = (name, text) => ({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
const storedFor = (userId) => mock(`/__mock/storage?user=${userId}`);

async function addHabit(page, name, { navigate = true } = {}) {
  if (navigate) await page.goto(`${APP}/habits`);
  await page.getByRole("button", { name: "Create a habit" }).click();
  await page.getByLabel("Habit name").fill(name);
  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  await page.getByRole("heading", { name }).waitFor();
}

/** How see-through the first card in <main> is: 1 is solid, lower is glass. */
async function cardAlpha(page) {
  return page.evaluate(() => {
    const c = getComputedStyle(document.querySelector("main .bg-card")).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : [];
    return parts.length === 4 ? Number(parts[3]) : 1;
  });
}

async function dashboardGreets(page, firstName) {
  await page.getByText(new RegExp(`, ${firstName}\\.`)).first().waitFor();
}

/* ── run ───────────────────────────────────────────────────────── */

async function main() {
  console.log("Starting the mock Supabase…");
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  if (!process.argv.includes("--no-build")) {
    console.log("Building the app against it (a minute or two)…");
    execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "ignore" });
  }
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const browser = await chromium.launch();
  const laptop = await browser.newContext(); // one browser profile, shared by A and B
  const phone = await browser.newContext(); // a second device for A
  const page = await laptop.newPage();
  const A = { name: "Student One", email: "student.one@example.com" };
  const B = { name: "Student Two", email: "student.two@example.com" };
  const C = { name: "Student Three", email: "student.three@example.com" };
  const ids = {};

  try {
    await scenario("1. Registration gives each account its own clean chronicle", async () => {
      // "/" is the public site; the app itself sends a signed-out visitor to welcome.
      await page.goto(`${APP}/dashboard`);
      await page.waitForURL(/\/welcome/);
      await signUp(page, A.name, A.email);
      await onboard(page, A.name);
      await passSleepPromptIfShown(page);
      await passTourIfShown(page);
      await dashboardGreets(page, "Student");
      ids.A = (await sessionOf(page)).user.id;
      const cloud = await waitFor("A's setup in the cloud", async () => {
        const c = await cloudOf(A.email);
        return c?.data?.profile?.onboardedAt ? c : null;
      });
      check(cloud.data.profile.name === A.name, "A's profile reached the cloud");
      check(cloud.data.journal.every((e) => !e.highlights), "A starts with no journal content");
    });

    await scenario("2. A's journal, settings and look stay with A", async () => {
      await writeJournal(page, "A-only highlight");
      await page.goto(`${APP}/settings#appearance`);
      await page.getByRole("radio", { name: /^Dark/ }).click();
      await page.getByRole("switch", { name: "Reduce transparency" }).click();
      await page.getByRole("switch", { name: "Daily digest" }).click();
      await waitFor("A's edits in the cloud", async () => {
        const c = await cloudOf(A.email);
        return (
          c &&
          JSON.stringify(c.data).includes("A-only highlight") &&
          c.data.themeMode === "dark" &&
          c.data.reduceTransparency === true &&
          c.data.notify?.digest === false
        );
      });
      check((await htmlAttr(page, "data-surface")) === "black", "A's dark theme applied");
      check((await htmlAttr(page, "data-transparency")) === "reduced", "A's reduced transparency applied");
      // Record the theme the moment <body> appears, before the app's scripts run.
      await page.addInitScript(() => {
        new MutationObserver((_, obs) => {
          if (!document.body) return;
          window.__firstPaintSurface = document.documentElement.dataset.surface ?? null;
          obs.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      await page.reload();
      check(
        (await page.evaluate(() => window.__firstPaintSurface)) === "black",
        "the dark theme isn't painted before the app loads (a light flash)",
      );
      await signOut(page);
      const keys = Object.keys(await storageOf(page));
      check(!keys.some((k) => k.includes(ids.A)), `A's data left in the browser after sign-out: ${keys.filter((k) => k.includes(ids.A))}`);
      check(!keys.includes("upsc-chronicle-auth"), "the session was removed");
      check((await htmlAttr(page, "data-surface")) === "lavender", "the signed-out screen isn't in the default theme, Lavender");
      check((await htmlAttr(page, "data-transparency")) === null, "the signed-out screen kept A's reduced transparency");
    });

    await scenario("3. B, on the same browser, sees none of A's data", async () => {
      await signUp(page, B.name, B.email);
      await onboard(page, B.name);
      await passSleepPromptIfShown(page);
      await passTourIfShown(page);
      ids.B = (await sessionOf(page)).user.id;
      await page.goto(`${APP}/journal`);
      await page.getByText("Daily Journal").first().waitFor();
      check(!(await page.content()).includes("A-only highlight"), "B can see A's journal");
      check((await htmlAttr(page, "data-surface")) === "lavender", "B inherited A's theme instead of starting in Lavender");
      check((await htmlAttr(page, "data-transparency")) === null, "B inherited A's reduced transparency");
      await writeJournal(page, "B-only highlight");
      await waitFor("B's entry in the cloud", async () => JSON.stringify((await cloudOf(B.email))?.data ?? "").includes("B-only highlight"));
      const b = await cloudOf(B.email);
      check(b.data.notify?.digest !== false, "A's notification change leaked into B");
      check(!JSON.stringify(b.data).includes("A-only highlight"), "A's entry is in B's cloud copy");
      await signOut(page);
    });

    await scenario("4. Switching back: A sees only A's data, with A's look", async () => {
      await signIn(page, A.email);
      await passSleepPromptIfShown(page);
      await passTourIfShown(page);
      await dashboardGreets(page, "Student");
      await page.goto(`${APP}/journal/${today()}`);
      await page.getByText("A-only highlight").waitFor();
      check(!(await page.content()).includes("B-only highlight"), "A can see B's journal");
      check(
        (await htmlAttr(page, "data-surface")) === "black" && (await htmlAttr(page, "data-transparency")) === "reduced",
        "A's look wasn't restored",
      );
      const keys = Object.keys(await storageOf(page));
      check(!keys.some((k) => k.includes(ids.B)), "B's data is still in the browser");
    });

    const phonePage = await phone.newPage();
    await scenario("5. A second device gets A's data from the cloud", async () => {
      await signIn(phonePage, A.email);
      await passSleepPromptIfShown(phonePage);
      await passTourIfShown(phonePage);
      await phonePage.goto(`${APP}/journal/${today()}`);
      await phonePage.getByText("A-only highlight").waitFor();
      check((await htmlAttr(phonePage, "data-surface")) === "black", "the theme didn't follow A to the phone");
      check((await htmlAttr(phonePage, "data-transparency")) === "reduced", "reduced transparency didn't follow A to the phone");
    });

    await scenario("6. Edits made on both devices at once are all kept", async () => {
      await phonePage.goto(`${APP}/habits`); // load the page, then lose the connection
      await phone.setOffline(true);
      await addHabit(phonePage, "Phone habit", { navigate: false });
      await addHabit(page, "Laptop habit");
      await waitFor("the laptop's habit in the cloud", async () => JSON.stringify((await cloudOf(A.email)).data.habits).includes("Laptop habit"));
      await phone.setOffline(false); // the app syncs when the connection returns
      await waitFor("both habits in the cloud", async () => {
        const h = JSON.stringify((await cloudOf(A.email)).data.habits);
        return h.includes("Laptop habit") && h.includes("Phone habit");
      });
      await page.evaluate(() => window.dispatchEvent(new Event("focus"))); // laptop looks for changes
      await page.getByRole("heading", { name: "Phone habit" }).waitFor({ timeout: 15_000 });
      await phonePage.goto(`${APP}/habits`);
      await phonePage.getByRole("heading", { name: "Laptop habit" }).waitFor();
    });

    await scenario("7. The database refuses A's session access to B's row", async () => {
      const { access_token } = await sessionOf(phonePage);
      const headers = { apikey: mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
      const rows = await (await fetch(`${MOCK}/rest/v1/chronicle_state?select=data&user_id=eq.${ids.B}`, { headers })).json();
      check(Array.isArray(rows) && rows.length === 0, "A could read B's snapshot");
      const all = await (await fetch(`${MOCK}/rest/v1/chronicle_state?select=user_id`, { headers })).json();
      check(all.length === 1 && all[0].user_id === ids.A, "A can see more than its own row");
      for (const [method, init] of [
        ["PATCH", { body: JSON.stringify({ data: {} }) }],
        ["DELETE", {}],
        ["POST", { body: JSON.stringify({ user_id: ids.B, data: {} }) }],
      ]) {
        const target = method === "POST" ? "" : `?user_id=eq.${ids.B}`;
        const res = await fetch(`${MOCK}/rest/v1/chronicle_state${target}`, { method, headers, ...init });
        check(res.status === 403, `${method} on B's row returned ${res.status}, expected 403`);
      }
      check(JSON.stringify((await cloudOf(B.email)).data).includes("B-only highlight"), "B's data changed");
    });

    await scenario("8. Attached files are stored once, linked without copies, and private", async () => {
      const p = phonePage;
      let composer = await openComposer(p);
      await attachFiles(composer, [
        { name: "map.png", mimeType: "image/png", buffer: PNG },
        textFile("plan.txt", "Polity: chapters 4 to 6\n"),
      ]);
      await saveComposer(p, composer);
      const cloud = await waitFor("both files in A's cloud copy", async () => {
        const c = await cloudOf(A.email);
        return c?.data?.files?.length === 2 ? c : null;
      });
      check(cloud.data.files.every((f) => f.path.startsWith(`${ids.A}/`)), "a file was stored outside A's folder");
      check(!JSON.stringify(cloud.data).includes("base64"), "file contents went into the synced data");
      const day = cloud.data.journal.find((e) => e.date === today());
      check(day?.fileIds?.length === 2, "today's entry doesn't hold both files");
      check((await storedFor(ids.A)).length === 2, "Storage doesn't hold exactly two objects for A");

      // The same bytes under another name: linked to the stored copy, not uploaded again.
      composer = await openComposer(p);
      await composer.getByTestId("attachment-input").setInputFiles([textFile("plan-copy.txt", "Polity: chapters 4 to 6\n")]);
      await composer.getByText("“plan.txt” is already attached to this day.").waitFor();
      await composer.getByRole("button", { name: "Cancel" }).click();
      await composer.waitFor({ state: "detached" });
      check((await storedFor(ids.A)).length === 2, "a duplicate upload was stored");

      // Link the photo to a goal: a reference, not a copy.
      await p.goto(`${APP}/goals`);
      await p.getByRole("button", { name: "New goal" }).first().click();
      const form = p.getByRole("dialog", { name: "New goal" });
      await form.getByLabel("Name", { exact: true }).fill("Finish Polity notes");
      await form.getByRole("button", { name: "Add goal" }).click();
      await form.waitFor({ state: "detached" });
      await p.getByRole("button", { name: "Open goal: Finish Polity notes" }).click();
      const detail = p.getByRole("dialog", { name: "Finish Polity notes" });
      await detail.getByRole("button", { name: /^Journal & files/ }).click();
      await detail.getByRole("button", { name: "Link a file from the journal" }).click();
      const picker = p.getByRole("dialog", { name: "Link files from your journal" });
      await picker.getByRole("button", { name: /map\.png/ }).click();
      await picker.getByRole("button", { name: /^Link 1 file/ }).click();
      await detail.getByRole("button", { name: "Preview map.png" }).waitFor();
      const linked = await waitFor("the goal's link in the cloud", async () => {
        const c = await cloudOf(A.email);
        const g = c?.data?.goals?.find((x) => x.title === "Finish Polity notes");
        return g?.fileIds?.length === 1 ? c : null;
      });
      check(linked.data.files.length === 2 && (await storedFor(ids.A)).length === 2, "linking made a copy");

      // Unlinking keeps the file with its journal day.
      await detail.getByRole("button", { name: "Unlink map.png" }).click();
      await waitFor("the goal's link removed", async () => {
        const g = (await cloudOf(A.email)).data.goals.find((x) => x.title === "Finish Polity notes");
        return g && !g.fileIds;
      });
      check((await cloudOf(A.email)).data.files.length === 2, "unlinking deleted the file");

      // Another account can't read, list, overwrite or delete A's files.
      const { access_token: aToken } = await sessionOf(p);
      const bLogin = await (
        await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: B.email, password: PASSWORD }),
        })
      ).json();
      const as = (token, extra = {}) => ({ apikey: mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, ...extra });
      const aPath = cloud.data.files[0].path;
      const signAs = (token) =>
        fetch(`${MOCK}/storage/v1/object/sign/chronicle-attachments/${aPath}`, {
          method: "POST",
          headers: as(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ expiresIn: 60 }),
        });
      check((await signAs(aToken)).status === 200, "A can't open A's own file");
      check((await signAs(bLogin.access_token)).status !== 200, "B got a link to A's file");
      const listed = await (
        await fetch(`${MOCK}/storage/v1/object/list/chronicle-attachments`, {
          method: "POST",
          headers: as(bLogin.access_token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ prefix: ids.A }),
        })
      ).json();
      check(Array.isArray(listed) && listed.length === 0, "B can list A's folder");
      const put = await fetch(`${MOCK}/storage/v1/object/chronicle-attachments/${ids.A}/intruder`, {
        method: "POST",
        headers: as(bLogin.access_token, { "Content-Type": "text/plain" }),
        body: "not yours",
      });
      check(put.status === 403, `B writing into A's folder returned ${put.status}, expected 403`);
      await fetch(`${MOCK}/storage/v1/object/chronicle-attachments`, {
        method: "DELETE",
        headers: as(bLogin.access_token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: [aPath] }),
      });
      check((await storedFor(ids.A)).length === 2, "B deleted A's file");

      // Removing a file from the only day that holds it deletes it from Storage too.
      composer = await openComposer(p);
      await composer.getByRole("button", { name: "Remove plan.txt" }).click();
      await saveComposer(p, composer);
      await waitFor("plan.txt removed from the cloud and from Storage", async () => {
        const c = await cloudOf(A.email);
        return c.data.files.length === 1 && (await storedFor(ids.A)).length === 1;
      });
    });

    await scenario("9. Sleep is recorded in a few taps, edited, and deleted without touching the rest of the day", async () => {
      const p = phonePage;
      // Another reading on the same day, from the Life Dashboard form.
      await p.goto(`${APP}/wellbeing?log=1`);
      const form = p.getByRole("dialog", { name: /the day$/ });
      await form.waitFor();
      await form.getByLabel("Water (L)").fill("2.5");
      await form.getByRole("button", { name: "Save", exact: true }).click();
      await form.waitFor({ state: "detached" });
      await waitFor("the water reading in the cloud", async () => (await lifeDayOf(A.email, today()))?.waterLiters === 2.5);

      await p.goto(`${APP}/wellbeing`);
      const card = p.getByTestId("sleep-card");
      await card.waitFor();
      // Bedtime typed, the keyboard way; wake-up tapped, hour then minute.
      await pickTime(p, card.getByRole("button", { name: /^Went to bed: not set/ }), { type: "2330" });
      await pickTime(p, card.getByRole("button", { name: /^Woke up: not set/ }), { hour: "7 AM", minute: "0 minutes" });
      await card.getByTestId("sleep-duration").getByText("7h 30m").waitFor();
      await card.getByTestId("sleep-save").click();
      const saved = await waitFor("the night in the cloud", async () => {
        const day = await lifeDayOf(A.email, today());
        return day?.sleepHours === 7.5 ? day : null;
      });
      check(saved.bedtime === "23:30" && saved.wakeTime === "07:00", `stored ${saved.bedtime}–${saved.wakeTime}`);
      check(saved.waterLiters === 2.5, "recording sleep lost the day's water reading");

      // Edit the wake-up: only the minute changes.
      await pickTime(p, card.getByRole("button", { name: /^Woke up: 7:00 AM/ }), { hour: "7 AM", minute: "15 minutes" });
      await card.getByTestId("sleep-duration").getByText("7h 45m").waitFor();
      await card.getByTestId("sleep-save").click();
      await waitFor("the edit in the cloud", async () => (await lifeDayOf(A.email, today()))?.sleepHours === 7.75);

      // Impossible times aren't saved.
      await pickTime(p, card.getByRole("button", { name: /^Went to bed: 11:30 PM/ }), { type: "7:15am" });
      await card.getByText("Bedtime and wake-up can't be the same time.").waitFor();
      await pickTime(p, card.getByRole("button", { name: /^Went to bed: 7:15 AM/ }), { type: "11:30 pm" });

      // The history lists it, and deleting it keeps the day's other reading.
      await p.goto(`${APP}/wellbeing/sleep`);
      const history = p.getByTestId("sleep-history");
      await history.getByTestId("sleep-night").first().getByText("7h 45m").waitFor();
      await history.getByRole("button", { name: /^Delete the night of/ }).first().click();
      await p.getByRole("dialog", { name: "Delete this night's sleep?" }).getByRole("button", { name: "Delete night" }).click();
      await waitFor("the night deleted, the water kept", async () => {
        const day = await lifeDayOf(A.email, today());
        return Boolean(day && day.waterLiters === 2.5 && !day.bedtime && !day.wakeTime && day.sleepHours === undefined);
      });
      check(!JSON.stringify((await cloudOf(B.email))?.data?.lifeLog ?? []).includes("23:30"), "A's sleep reached B");
    });

    await scenario("10. Reduce transparency follows the account, on either theme, without a flash", async () => {
      await page.goto(`${APP}/settings#appearance`);
      await passSleepPromptIfShown(page);
      check((await htmlAttr(page, "data-surface")) === "black", "A's dark theme from scenario 2 isn't showing");
      check((await htmlAttr(page, "data-transparency")) === "reduced", "A's reduced transparency from scenario 2 isn't showing");
      await waitFor("nearly solid cards", async () => (await cardAlpha(page)) > 0.9, 5000);

      // Painted before the app loads, so a reload never flashes see-through panels.
      await page.addInitScript(() => {
        new MutationObserver((_, obs) => {
          if (!document.body) return;
          window.__firstPaintTransparency = document.documentElement.getAttribute("data-transparency");
          obs.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      await page.reload();
      check((await page.evaluate(() => window.__firstPaintTransparency)) === "reduced", "reduced transparency isn't painted before the app loads");

      // It holds on either theme, and changing the theme leaves it alone.
      await page.getByRole("radio", { name: /^Light/ }).click();
      check(
        (await htmlAttr(page, "data-surface")) === "white" && (await htmlAttr(page, "data-transparency")) === "reduced",
        "Light with reduced transparency",
      );
      await waitFor("nearly solid cards on Light", async () => (await cardAlpha(page)) > 0.9, 5000);
      await page.getByRole("radio", { name: /^Dark/ }).click();

      // Off again: glass, in the same theme. Surfaces ease across for under half a second.
      await page.getByRole("switch", { name: "Reduce transparency" }).click();
      check((await htmlAttr(page, "data-transparency")) === null, "reduce transparency didn't turn off");
      check((await htmlAttr(page, "data-surface")) === "black", "turning it off changed the theme");
      await waitFor("translucent cards", async () => (await cardAlpha(page)) < 0.8, 5000);
      await waitFor("the change in A's cloud copy", async () => (await cloudOf(A.email))?.data?.reduceTransparency === false);
      check((await cloudOf(A.email)).data.themeMode === "dark", "the synced theme changed with transparency");

      // And it reaches A's other device.
      await phonePage.reload();
      await waitFor("glass on the phone", async () => (await htmlAttr(phonePage, "data-transparency")) === null);
      check((await htmlAttr(phonePage, "data-surface")) === "black", "the phone lost the dark theme");
    });

    await scenario("11. Three themes follow the account: Light and Dark frosted, Lavender crisp; an older device's Blue Glass opens as Light", async () => {
      // Light and Dark alike: see-through cards and a frosted bar.
      for (const [radio, surface] of [[/^Light/, "white"], [/^Dark/, "black"]]) {
        await page.getByRole("radio", { name: radio }).click();
        check((await htmlAttr(page, "data-surface")) === surface, `the ${surface} surface wasn't applied`);
        await waitFor(`frosted cards on ${surface}`, async () => {
          const a = await cardAlpha(page);
          return a >= 0.45 && a < 0.8;
        }, 5000);
        const bar = await page.evaluate(() => getComputedStyle(document.querySelector(".chrome-glass")).backdropFilter);
        check(/blur/.test(bar), `the bars aren't frosted on ${surface} (${bar})`);
      }

      // Lavender: crisp white panels rather than see-through ones, synced,
      // painted before the app loads, and on A's other device.
      await page.getByRole("radio", { name: /^Lavender/ }).click();
      check((await htmlAttr(page, "data-surface")) === "lavender", "Lavender wasn't applied");
      await waitFor("crisp panels on Lavender", async () => (await cardAlpha(page)) >= 0.85, 5000);
      await waitFor("Lavender in A's cloud copy", async () => (await cloudOf(A.email))?.data?.themeMode === "lavender");
      await page.reload();
      check((await page.evaluate(() => window.__firstPaintSurface)) === "lavender", "Lavender isn't painted before the app loads");
      await phonePage.reload();
      await waitFor("Lavender on the phone", async () => (await htmlAttr(phonePage, "data-surface")) === "lavender");

      await page.getByRole("radio", { name: /^Dark/ }).click();
      await waitFor("Dark in A's cloud copy", async () => (await cloudOf(A.email))?.data?.themeMode === "dark");

      // A device still on an older version saves Blue Glass, with a colour
      // palette and Liquid Glass. Retried if this device saved in between.
      const { access_token } = await sessionOf(page);
      await waitFor("the older device's save", async () => {
        const now = await cloudOf(A.email);
        const res = await fetch(`${MOCK}/rest/v1/rpc/save_chronicle_state`, {
          method: "POST",
          headers: { apikey: mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_data: { ...now.data, themeMode: "blue", palette: "lagoon", material: "glass" },
            p_base_version: now.version,
          }),
        });
        return (await res.json())?.[0]?.saved === true;
      });

      // Here it opens as Light, and the retired choices never reach the page.
      await page.reload();
      await waitFor("Blue Glass opened as Light", async () => (await htmlAttr(page, "data-surface")) === "white");
      check((await htmlAttr(page, "data-theme-mode")) === "light", "the saved Blue Glass wasn't read as Light");
      check(
        (await htmlAttr(page, "data-palette")) === null && (await htmlAttr(page, "data-material")) === null,
        "a retired palette or material reached the page",
      );
      await page.getByRole("radio", { name: /^Light/, checked: true }).waitFor();

      // Choosing again works as normal; A goes back to Dark for the rest of the run.
      await page.getByRole("radio", { name: /^Dark/ }).click();
      await waitFor("Dark back in A's cloud copy", async () => (await cloudOf(A.email))?.data?.themeMode === "dark");
      check((await htmlAttr(page, "data-surface")) === "black", "Dark no longer applies");
    });

    // The Roadmap, planned for next year so the dates never run into today.
    const Y = new Date().getFullYear() + 1;
    const week = (() => {
      const d = new Date(Date.UTC(Y, 0, 8)); // the Monday on or after 8 January: a week wholly in January
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const plansOf = async (email) => (await cloudOf(email))?.data?.plans ?? [];
    const weekOf = async (email) => (await plansOf(email)).find((p) => p.level === "week" && p.start === week);
    const itemOf = (plan, title) => plan?.items?.find((i) => i.title === title);
    const crumbs = (pg) => pg.getByRole("navigation", { name: "Breadcrumb" });
    const roadmap = {};

    await scenario("12. The Roadmap starts empty; a year, its months and a week are planned by hand", async () => {
      check((await plansOf(A.email)).length === 0, "A's roadmap didn't start empty");
      await page.goto(`${APP}/roadmap`);
      await passSleepPromptIfShown(page);
      await page.getByRole("heading", { name: "My Roadmap" }).waitFor();
      await page.getByText("Your roadmap starts empty.").waitFor();
      const html = await page.content();
      for (const old of ["Foundation & Notes", "Prelims Grind", "Mains Intensive"]) check(!html.includes(old), `the retired plan shows: ${old}`);

      // A year…
      await page.getByRole("button", { name: "Create a plan" }).first().click();
      const form = page.getByRole("dialog", { name: "Create a plan" });
      await form.getByRole("radio", { name: /^A year/ }).click();
      await form.getByLabel("Year", { exact: true }).selectOption(String(Y));
      await form.getByLabel("Title", { exact: true }).fill("Attempt year");
      await form.getByRole("button", { name: "Create plan" }).click();
      await page.getByRole("heading", { name: "Attempt year", exact: true }).waitFor();

      // …three months, from the year's own month grid…
      for (const m of ["January", "February", "March"]) {
        await page.getByRole("button", { name: `Plan ${m} ${Y}` }).click();
        await page.getByRole("dialog", { name: "New monthly plan" }).getByRole("button", { name: "Create plan" }).click();
        await page.getByRole("heading", { name: `${m} ${Y}`, exact: true }).waitFor();
        await crumbs(page).getByRole("button", { name: "Attempt year" }).click();
        await page.getByRole("heading", { name: "Attempt year", exact: true }).waitFor();
      }
      const four = await waitFor("the year and its months in A's cloud", async () => {
        const p = await plansOf(A.email);
        return p.length === 4 ? p : null;
      });
      const year = four.find((p) => p.level === "year");
      roadmap.year = year.id;
      check(year.year === Y && year.title === "Attempt year", "the year isn't what was entered");
      check(four.filter((p) => p.level === "month").every((p) => p.parentId === year.id), "a month isn't in the year");

      // …and deleting February leaves the year, January and March exactly as they were.
      const before = Object.fromEntries(four.map((p) => [p.id, JSON.stringify(p)]));
      await page.getByRole("button", { name: new RegExp(`^February ${Y}`) }).click();
      await page.getByRole("heading", { name: `February ${Y}`, exact: true }).waitFor();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("dialog", { name: `Delete February ${Y}?` }).getByRole("button", { name: "Delete plan" }).click();
      await page.getByRole("heading", { name: "Attempt year", exact: true }).waitFor();
      const three = await waitFor("February gone from A's cloud", async () => {
        const p = await plansOf(A.email);
        return p.length === 3 ? p : null;
      });
      check(!three.some((p) => p.level === "month" && p.start === `${Y}-02-01`), "February is still there");
      for (const p of three) check(JSON.stringify(p) === before[p.id], `deleting February changed ${p.title ?? p.start}`);

      // A week inside January, planned activity by activity.
      await page.getByRole("button", { name: new RegExp(`^January ${Y}`) }).click();
      await page.getByRole("heading", { name: `January ${Y}`, exact: true }).waitFor();
      const [y, mo, d] = week.split("-").map(Number);
      const label = `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${y}`;
      await page.getByRole("button", { name: `Plan the week of ${label}` }).click();
      const weekForm = page.getByRole("dialog", { name: "New weekly plan" });
      await weekForm.getByLabel("Title", { exact: true }).fill("First full week");
      await weekForm.getByRole("button", { name: "Create plan" }).click();
      await page.getByRole("heading", { name: "First full week", exact: true }).waitFor();
      for (const t of ["Revise Polity notes", "Two Prelims mocks", "One full essay"]) {
        await page.getByLabel("New activity").fill(t);
        await page.getByRole("button", { name: "Add activity" }).click();
        await page.getByRole("button", { name: `Edit “${t}”` }).waitFor();
      }
      const w = await waitFor("the week and its activities in A's cloud", async () => {
        const p = await weekOf(A.email);
        return p?.items?.length === 3 ? p : null;
      });
      roadmap.week = w.id;
      const january = three.find((p) => p.level === "month" && p.start === `${Y}-01-01`);
      check(w.parentId === january.id, "the week isn't in January");
      check(w.items.every((i) => i.status === "notStarted"), "new activities didn't start as not started");
      await page.getByText("Activities · 0 of 3 done").waitFor();
    });

    await scenario("13. Roadmap work points at a goal and a journal day without changing either, and follows A to the phone", async () => {
      // A goal, made in Goals.
      await page.goto(`${APP}/goals?new=1`);
      const goalForm = page.getByRole("dialog", { name: "New goal" });
      await goalForm.getByLabel("Name", { exact: true }).fill("Four Prelims mocks");
      await goalForm.getByRole("button", { name: "Add goal" }).click();
      await goalForm.waitFor({ state: "detached" });
      const goalBefore = await waitFor("A's goal in the cloud", async () =>
        (await cloudOf(A.email))?.data?.goals?.find((g) => g.title === "Four Prelims mocks"),
      );
      const goalCount = (await cloudOf(A.email)).data.goals.length;
      const entryBefore = JSON.stringify((await cloudOf(A.email)).data.journal.find((e) => e.date === today()));
      check(entryBefore?.includes("A-only highlight"), "A's journal entry for today is missing");

      // The activity serves the goal, by reference.
      await page.goto(`${APP}/roadmap?plan=${roadmap.week}`);
      await page.getByRole("heading", { name: "First full week", exact: true }).waitFor();
      await page.getByRole("button", { name: "Edit “Two Prelims mocks”" }).click();
      let item = page.getByRole("dialog", { name: "Activity" });
      await item.getByRole("radio", { name: "Link goal “Four Prelims mocks”" }).check();
      await item.getByRole("button", { name: "Save", exact: true }).click();
      await item.waitFor({ state: "detached" });
      await waitFor("the goal link in A's cloud", async () => itemOf(await weekOf(A.email), "Two Prelims mocks")?.goalId === goalBefore.id);

      // Finishing planned work moves roadmap progress only.
      await page.getByRole("button", { name: "Mark “Revise Polity notes” complete" }).click();
      await page.getByRole("button", { name: "Mark “Two Prelims mocks” complete" }).click();
      await page.getByText("Activities · 2 of 3 done").waitFor();
      await page.getByText("Goal achievement (from Goals)").first().waitFor();
      await waitFor("two activities completed in A's cloud", async () => {
        const w = await weekOf(A.email);
        return w?.items?.filter((i) => i.status === "completed").length === 2;
      });
      const after = await cloudOf(A.email);
      check(after.data.goals.length === goalCount, "the roadmap added or removed a goal");
      check(
        JSON.stringify(after.data.goals.find((g) => g.id === goalBefore.id)) === JSON.stringify(goalBefore),
        "completing roadmap activities changed the goal",
      );

      // A journal day linked on purpose: the activity stays open, the entry stays as it was.
      await page.getByRole("button", { name: "Edit “One full essay”" }).click();
      item = page.getByRole("dialog", { name: "Activity" });
      await item.getByLabel("Journal day to link").selectOption(today());
      await item.getByRole("button", { name: "Link", exact: true }).click();
      await item.getByRole("button", { name: "Save", exact: true }).click();
      await item.waitFor({ state: "detached" });
      const linked = await waitFor("the journal link in A's cloud", async () => {
        const it = itemOf(await weekOf(A.email), "One full essay");
        return it?.journalDates?.includes(today()) ? it : null;
      });
      check(linked.status === "notStarted", "linking a journal day marked the activity done");
      await page.goto(`${APP}/journal/${today()}`);
      await page.getByText("Planned work done this day").waitFor();
      await page.getByRole("link", { name: /One full essay/ }).waitFor();
      check(JSON.stringify((await cloudOf(A.email)).data.journal.find((e) => e.date === today())) === entryBefore, "linking changed the journal entry");

      // Unlinking deletes nothing.
      await page.goto(`${APP}/roadmap?plan=${roadmap.week}`);
      await page.getByRole("button", { name: "Edit “One full essay”" }).click();
      item = page.getByRole("dialog", { name: "Activity" });
      await item.getByRole("button", { name: /^Unlink / }).click();
      await item.getByRole("button", { name: "Save", exact: true }).click();
      await item.waitFor({ state: "detached" });
      await waitFor("the journal link gone from A's cloud", async () => {
        const it = itemOf(await weekOf(A.email), "One full essay");
        return it && !it.journalDates;
      });
      check(JSON.stringify((await cloudOf(A.email)).data.journal.find((e) => e.date === today())) === entryBefore, "unlinking changed the journal entry");

      // The phone has it all, and activities added on both devices at once are both kept.
      await phonePage.goto(`${APP}/roadmap?plan=${roadmap.week}`);
      await passSleepPromptIfShown(phonePage);
      await phonePage.getByRole("heading", { name: "First full week", exact: true }).waitFor();
      await phonePage.getByText("Activities · 2 of 3 done").waitFor();
      await phone.setOffline(true);
      await phonePage.getByLabel("New activity").fill("Phone activity");
      await phonePage.getByRole("button", { name: "Add activity" }).click();
      await phonePage.getByRole("button", { name: "Edit “Phone activity”" }).waitFor();
      await page.getByLabel("New activity").fill("Laptop activity");
      await page.getByRole("button", { name: "Add activity" }).click();
      await waitFor("the laptop's activity in A's cloud", async () => Boolean(itemOf(await weekOf(A.email), "Laptop activity")));
      await phone.setOffline(false);
      const merged = await waitFor("both new activities in A's cloud", async () => {
        const w = await weekOf(A.email);
        return itemOf(w, "Laptop activity") && itemOf(w, "Phone activity") ? w : null;
      });
      check(merged.items.length === 5, `the week has ${merged.items.length} items, not 5`);
      check(merged.items.filter((i) => i.status === "completed").length === 2, "the merge lost a completion");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.getByRole("button", { name: "Edit “Phone activity”" }).waitFor({ timeout: 15_000 });

      // Archiving the year keeps everything in it, readable.
      await page.goto(`${APP}/roadmap?plan=${roadmap.year}`);
      await page.getByRole("button", { name: "Archive", exact: true }).click();
      await page.getByText("Archived", { exact: true }).waitFor();
      const archived = await waitFor("the archived year in A's cloud", async () => {
        const p = await plansOf(A.email);
        return p.find((x) => x.id === roadmap.year)?.archivedAt ? p : null;
      });
      check(archived.length === 4 && archived.find((p) => p.id === roadmap.week).items.length === 5, "archiving lost plans or activities");
      await page.goto(`${APP}/roadmap?plan=${roadmap.week}`);
      await page.getByText("Part of an archived plan (Attempt year)").waitFor();
      await page.getByText("Activities · 2 of 5 done").waitFor();
      await page.getByRole("button", { name: "View “Laptop activity”" }).click();
      const readOnly = page.getByRole("dialog", { name: "Activity" });
      check(await readOnly.getByRole("textbox").first().isDisabled(), "an archived activity can still be edited");
      await readOnly.getByRole("button", { name: "Close", exact: true }).last().click();
      check((await page.getByLabel("New activity").count()) === 0, "an archived week still takes new activities");
      await page.goto(`${APP}/roadmap?tab=years`);
      await page.getByRole("button", { name: /^Show archived/ }).waitFor();
      check(!(await page.getByText("Attempt year").count()), "an archived year is still in the current list");

      // B, signed in elsewhere, has an empty roadmap of B's own.
      const bCtx = await browser.newContext();
      const bPage = await bCtx.newPage();
      await signIn(bPage, B.email);
      await passSleepPromptIfShown(bPage);
      await passTourIfShown(bPage);
      await dashboardGreets(bPage, "Student");
      await bPage.goto(`${APP}/roadmap`);
      await bPage.getByText("Your roadmap starts empty.").waitFor();
      check(!(await bPage.content()).includes("Attempt year"), "B can see A's roadmap");
      const b = await cloudOf(B.email);
      check((b.data.plans ?? []).length === 0 && !JSON.stringify(b.data).includes("First full week"), "A's plans reached B's cloud copy");
      await bCtx.close();
    });

    await scenario("14. After sign-out nothing private is reachable", async () => {
      await signOut(page);
      check((await htmlAttr(page, "data-surface")) === "lavender", "the signed-out screen kept A's dark theme");
      check((await htmlAttr(page, "data-theme-mode")) === "lavender", "the signed-out screen isn't in the default theme");
      await page.goto(`${APP}/journal/${today()}`);
      await page.waitForURL(/\/login/);
      check(!(await page.content()).includes("A-only highlight"), "A's journal is still rendered");
      const keys = Object.keys(await storageOf(page));
      check(!keys.some((k) => k.startsWith("upsc-chronicle-store")), `stores left behind: ${keys}`);
    });

    await scenario("15. Notification preferences are per account", async () => {
      const a = await cloudOf(A.email);
      const b = await cloudOf(B.email);
      check(a.data.notify.digest === false && b.data.notify?.digest !== false, "digest settings crossed accounts");
    });

    await scenario("16. Pre-account data on the owner's browser moves into the owner's account only", async () => {
      const owner = await (await fetch(`${MOCK}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com", password: PASSWORD, data: { full_name: "Owner" } }),
      })).json();
      const entry = (date, highlights) => ({ id: `j-${date}`, date, blocks: [{ subjectId: "polity", hours: 4 }], totalHours: 4, mood: 4, energy: 3, motivation: 4, focus: 4, highlights });
      const profile = { name: "Owner", targetExam: "UPSC CSE 2027", examDate: "2027-05-24", attemptNumber: 2, optionalSubject: "Sociology", startDate: "2026-06-15", dailyHourTarget: 9 };
      // What the cloud held before this upgrade…
      await fetch(`${MOCK}/rest/v1/rpc/save_chronicle_state`, {
        method: "POST",
        headers: { apikey: mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${owner.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_data: { profile, journal: [entry("2026-11-01", "Owner cloud entry")], lastSleepPrompt: today() }, p_base_version: 0 }),
      });
      // …and the old browser copy, with one entry that never synced.
      const ownerCtx = await browser.newContext();
      const op = await ownerCtx.newPage();
      await op.goto(`${APP}/welcome`);
      await op.evaluate(
        ({ id, state }) => {
          localStorage.setItem("upsc-chronicle-store", JSON.stringify({ state, version: 9 }));
          localStorage.setItem(`upsc-chronicle-cloud-synced:${id}`, new Date(Date.now() + 60_000).toISOString());
        },
        { id: owner.user.id, state: { profile, journal: [entry("2026-11-01", "Owner cloud entry"), entry("2026-11-02", "Owner offline entry")], lastSleepPrompt: today() } },
      );
      await signIn(op, "owner@example.com");
      await passSleepPromptIfShown(op);
      await passTourIfShown(op);
      await dashboardGreets(op, "Owner"); // straight in: no setup for an existing profile
      await waitFor("both owner entries in the cloud", async () => {
        const d = JSON.stringify((await cloudOf("owner@example.com")).data.journal);
        return d.includes("Owner cloud entry") && d.includes("Owner offline entry");
      });
      const keys = Object.keys(await storageOf(op));
      check(!keys.includes("upsc-chronicle-store"), "the pre-account copy wasn't cleaned up");
      check(keys.includes(`upsc-chronicle-store:${owner.user.id}`), "the owner's data isn't in the owner's namespace");
      await signOut(op);
      await signUp(op, C.name, C.email);
      check(!(await op.content()).includes("Owner"), "a new account on the owner's browser saw owner data");
      await ownerCtx.close().catch(() => {});
    });

    const cPage = await (await browser.newContext()).newPage();
    await scenario("17. A fresh account starts clean, with only reference content", async () => {
      await signIn(cPage, C.email);
      await onboard(cPage, C.name);
      await passSleepPromptIfShown(cPage);
      await passTourIfShown(cPage);
      const c = await waitFor("C's setup in the cloud", async () => {
        const s = await cloudOf(C.email);
        return s?.data?.profile?.onboardedAt ? s : null;
      });
      const text = JSON.stringify(c.data);
      for (const leak of ["A-only highlight", "B-only highlight", "Owner", "Aman", "Laptop habit", "Attempt year", "Four Prelims mocks"]) {
        check(!text.includes(leak), `C's data contains "${leak}"`);
      }
      check((c.data.plans ?? []).length === 0, "C starts with a roadmap plan");
      check(!("useRoadmap" in c.data.profile), "C's profile has the retired roadmap switch");
      check(c.data.subjects.every((s) => s.topics.every((t) => t.status === "untouched")), "C starts with progress");
      check(c.data.subjects.length > 10 && c.data.books.length > 0, "C is missing the reference syllabus");
      ids.C = (await sessionOf(cPage)).user.id;
      await writeJournal(cPage, "C entry", { files: [textFile("c-notes.txt", "C's private notes\n")] });
      await waitFor("C's file in Storage", async () => (await storedFor(ids.C)).length === 1);
    });

    await scenario("18. Deleting an account removes only that account", async () => {
      await cPage.goto(`${APP}/settings#danger`);
      await cPage.getByRole("button", { name: "Delete my account" }).click();
      const dialog = cPage.getByRole("dialog", { name: "Delete your account?" });
      await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
      await dialog.getByLabel("Your password").fill(PASSWORD);
      await dialog.getByRole("button", { name: "Delete forever" }).click();
      await cPage.waitForURL(/\/welcome\?deleted=1/);
      await cPage.getByText("Your account and its data have been deleted.").waitFor();
      const emails = (await mock("/__mock/rows")).map((r) => r.email);
      check(!emails.includes(C.email), "C's row survived");
      check(emails.includes(A.email) && emails.includes(B.email), "deleting C touched other accounts");
      check((await storedFor(ids.C)).length === 0, "C's files survived the account deletion");
      check((await storedFor(ids.A)).length === 1, "deleting C touched A's files");
      const keys = Object.keys(await storageOf(cPage));
      check(!keys.some((k) => k.startsWith("upsc-chronicle-store:")), "C's data stayed in the browser");
      await signIn(cPage, C.email);
      await cPage.getByText("That email and password don't match an account.").waitFor();
    });

    await scenario("Password reset by email link", async () => {
      const p = await (await browser.newContext()).newPage();
      await p.goto(`${APP}/forgot-password`);
      await p.getByLabel("Email").fill(B.email);
      await p.getByRole("button", { name: "Send reset link" }).click();
      await p.getByText(/a reset link\s+is on its way/).waitFor();
      const mail = await mock("/__mock/last-email");
      check(mail?.to === B.email, "no reset email was sent");
      await p.goto(mail.link);
      await p.getByText("Choose a new password").waitFor();
      await p.getByLabel("New password", { exact: true }).fill("brandNew2028");
      await p.getByLabel("Confirm new password").fill("brandNew2028");
      await p.getByRole("button", { name: "Save new password" }).click();
      await passSleepPromptIfShown(p);
      await passTourIfShown(p);
      await dashboardGreets(p, "Student");
      await signOut(p);
      await signIn(p, B.email, PASSWORD);
      await p.getByText("That email and password don't match an account.").waitFor();
      await signIn(p, B.email, "brandNew2028");
      await passSleepPromptIfShown(p);
      await passTourIfShown(p);
      await dashboardGreets(p, "Student");
      check((await htmlAttr(p, "data-surface")) === "lavender", "B got A's dark theme");
      check((await htmlAttr(p, "data-transparency")) === null, "B got a reduced transparency B never chose");
    });

    await scenario("An expired reset link explains itself", async () => {
      const p = await (await browser.newContext()).newPage();
      await p.goto(`${APP}/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
      await p.getByText("This link has expired or was already used. Request a new one.").waitFor();
    });

    console.log(`\nAll ${passed} scenarios passed.`);
    await browser.close();
  } catch (e) {
    console.log("✗");
    const shot = join(root, "..", "e2e-failure.png");
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`\n${e.stack ?? e}\n(screenshot of the shared browser: ${shot})`);
    process.exitCode = 1;
    await browser.close().catch(() => {});
  } finally {
    stopAll();
  }
}

main().catch((e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});
