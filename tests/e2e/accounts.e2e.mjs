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

/** Today's entry in the composer (new or existing). */
async function openComposer(page) {
  await page.goto(`${APP}/journal?new=1`);
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
  await page.getByPlaceholder("Add a new daily discipline…").fill(name);
  await page.getByRole("button", { name: "Add habit" }).first().click();
  await page.getByRole("button", { name: "Add habit" }).last().click(); // the confirmation
  await page.getByRole("heading", { name }).waitFor();
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
      await page.getByRole("button", { name: /Teal/ }).click();
      await page.getByRole("radio", { name: /^Dark/ }).click();
      await page.getByRole("switch", { name: "Daily digest" }).click();
      await waitFor("A's edits in the cloud", async () => {
        const c = await cloudOf(A.email);
        return (
          c &&
          JSON.stringify(c.data).includes("A-only highlight") &&
          c.data.palette === "lagoon" &&
          c.data.themeMode === "dark" &&
          c.data.notify?.digest === false
        );
      });
      check((await page.evaluate(() => document.documentElement.dataset.palette)) === "lagoon", "A's palette applied");
      check((await page.evaluate(() => document.documentElement.dataset.surface)) === "black", "A's dark theme applied");
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
      check((await page.evaluate(() => document.documentElement.dataset.palette)) === "rose", "the signed-out screen uses the default look");
      check((await page.evaluate(() => document.documentElement.dataset.surface)) === "white", "the signed-out screen is light");
    });

    await scenario("3. B, on the same browser, sees none of A's data", async () => {
      await signUp(page, B.name, B.email);
      await onboard(page, B.name);
      await passSleepPromptIfShown(page);
      ids.B = (await sessionOf(page)).user.id;
      await page.goto(`${APP}/journal`);
      await page.getByText("Daily Journal").first().waitFor();
      check(!(await page.content()).includes("A-only highlight"), "B can see A's journal");
      check((await page.evaluate(() => document.documentElement.dataset.palette)) === "rose", "B inherited A's look");
      check((await page.evaluate(() => document.documentElement.dataset.surface)) === "white", "B inherited A's theme");
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
      await dashboardGreets(page, "Student");
      await page.goto(`${APP}/journal/${today()}`);
      await page.getByText("A-only highlight").waitFor();
      check(!(await page.content()).includes("B-only highlight"), "A can see B's journal");
      check((await page.evaluate(() => document.documentElement.dataset.palette)) === "lagoon", "A's look wasn't restored");
      const keys = Object.keys(await storageOf(page));
      check(!keys.some((k) => k.includes(ids.B)), "B's data is still in the browser");
    });

    const phonePage = await phone.newPage();
    await scenario("5. A second device gets A's data from the cloud", async () => {
      await signIn(phonePage, A.email);
      await passSleepPromptIfShown(phonePage);
      await phonePage.goto(`${APP}/journal/${today()}`);
      await phonePage.getByText("A-only highlight").waitFor();
      check((await phonePage.evaluate(() => document.documentElement.dataset.palette)) === "lagoon", "appearance didn't follow A to the phone");
      check((await phonePage.evaluate(() => document.documentElement.dataset.surface)) === "black", "the theme didn't follow A to the phone");
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

    await scenario("10. Liquid Glass follows the account, on either theme, without a flash", async () => {
      await page.goto(`${APP}/settings#appearance`);
      await passSleepPromptIfShown(page);
      const surface = await htmlAttr(page, "data-surface");
      check(surface === "black", "A's dark theme from scenario 2 isn't showing");
      await page.getByRole("switch", { name: "Liquid Glass" }).click();
      check((await htmlAttr(page, "data-material")) === "glass", "glass wasn't applied");
      check((await htmlAttr(page, "data-surface")) === surface, "turning glass on changed the theme");
      const cardAlpha = () =>
        page.evaluate(() => {
          const c = getComputedStyle(document.querySelector("main .bg-card")).backgroundColor;
          const m = /rgba?\(([^)]+)\)/.exec(c);
          const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : [];
          return parts.length === 4 ? Number(parts[3]) : 1;
        });
      // Surfaces ease across for under half a second; then cards are see-through.
      await waitFor("translucent cards", async () => (await cardAlpha()) < 0.8, 5000);
      await waitFor("glass in A's cloud copy", async () => (await cloudOf(A.email))?.data?.material === "glass");
      check((await cloudOf(A.email)).data.themeMode === "dark", "the synced theme changed with glass");

      // The theme can still be changed underneath it.
      await page.getByRole("radio", { name: /^Light/ }).click();
      check((await htmlAttr(page, "data-material")) === "glass" && (await htmlAttr(page, "data-surface")) === "white", "Light + glass");
      await page.getByRole("radio", { name: /^Dark/ }).click();

      // Reduce transparency keeps glass but makes it nearly solid.
      await page.getByRole("switch", { name: "Reduce transparency" }).click();
      check((await htmlAttr(page, "data-transparency")) === "reduced", "reduce transparency not applied");
      await waitFor("nearly solid cards", async () => (await cardAlpha()) > 0.9, 5000);
      await page.getByRole("switch", { name: "Reduce transparency" }).click();

      // Painted before the app loads, so a reload never flashes Standard.
      await page.addInitScript(() => {
        new MutationObserver((_, obs) => {
          if (!document.body) return;
          window.__firstPaintMaterial = document.documentElement.getAttribute("data-material");
          obs.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      await page.reload();
      check((await page.evaluate(() => window.__firstPaintMaterial)) === "glass", "glass isn't painted before the app loads");

      // And it reaches A's other device.
      await phonePage.reload();
      await waitFor("glass on the phone", async () => (await htmlAttr(phonePage, "data-material")) === "glass");
      check((await htmlAttr(phonePage, "data-surface")) === "black", "the phone lost the dark theme");
    });

    await scenario("11. After sign-out nothing private is reachable", async () => {
      await signOut(page);
      check((await htmlAttr(page, "data-material")) === "standard", "the signed-out screen kept A's glass");
      await page.goto(`${APP}/journal/${today()}`);
      await page.waitForURL(/\/login/);
      check(!(await page.content()).includes("A-only highlight"), "A's journal is still rendered");
      const keys = Object.keys(await storageOf(page));
      check(!keys.some((k) => k.startsWith("upsc-chronicle-store")), `stores left behind: ${keys}`);
    });

    await scenario("12. Notification preferences are per account", async () => {
      const a = await cloudOf(A.email);
      const b = await cloudOf(B.email);
      check(a.data.notify.digest === false && b.data.notify?.digest !== false, "digest settings crossed accounts");
    });

    await scenario("13. Pre-account data on the owner's browser moves into the owner's account only", async () => {
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
    await scenario("14. A fresh account starts clean, with only reference content", async () => {
      await signIn(cPage, C.email);
      await onboard(cPage, C.name);
      await passSleepPromptIfShown(cPage);
      const c = await waitFor("C's setup in the cloud", async () => {
        const s = await cloudOf(C.email);
        return s?.data?.profile?.onboardedAt ? s : null;
      });
      const text = JSON.stringify(c.data);
      for (const leak of ["A-only highlight", "B-only highlight", "Owner", "Aman", "Laptop habit"]) {
        check(!text.includes(leak), `C's data contains "${leak}"`);
      }
      check(c.data.subjects.every((s) => s.topics.every((t) => t.status === "untouched")), "C starts with progress");
      check(c.data.subjects.length > 10 && c.data.books.length > 0, "C is missing the reference syllabus");
      ids.C = (await sessionOf(cPage)).user.id;
      await writeJournal(cPage, "C entry", { files: [textFile("c-notes.txt", "C's private notes\n")] });
      await waitFor("C's file in Storage", async () => (await storedFor(ids.C)).length === 1);
    });

    await scenario("15. Deleting an account removes only that account", async () => {
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
      await dashboardGreets(p, "Student");
      await signOut(p);
      await signIn(p, B.email, PASSWORD);
      await p.getByText("That email and password don't match an account.").waitFor();
      await signIn(p, B.email, "brandNew2028");
      await passSleepPromptIfShown(p);
      await dashboardGreets(p, "Student");
      check((await htmlAttr(p, "data-material")) === "standard", "B got A's Liquid Glass");
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
