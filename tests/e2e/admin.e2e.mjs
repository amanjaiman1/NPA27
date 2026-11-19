#!/usr/bin/env node
/**
 * The Admin Center end to end, against the local mock Supabase: the first
 * Super Admin from the setup guide, every role's permissions (in TypeScript
 * and in the database), reviews from writing one to the website, feedback
 * and its private notes, announcements, the changelog, suspension, settings
 * and the audit log. Then the Admin Center itself in a browser: no access for
 * a student, every page for a Super Admin, a Moderator's limits, a phone, and
 * all three themes.
 *
 *     npx playwright install chromium     # once
 *     npm run test:e2e:admin              # builds against the mock, then runs
 *     npm run test:e2e:admin -- --no-build
 *
 * Everything here is local and thrown away at the end. The build points at
 * the mock, so run `npm run build` again before using the app for real.
 * Screenshots of each Admin Center page land in ../admin-e2e-shots.
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PLATFORM_ROLES, permissionsFor } from "../../src/lib/platform/roles.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = "http://localhost:3100";
const MOCK = "http://localhost:54321";
const PASSWORD = "studyHard2027";
const SHOTS = join(root, "..", "admin-e2e-shots");

// `next start` keeps the public pages it rebuilt from one run to the next,
// and the mock's database starts empty each time, so whatever a public page
// shows carries this run's id: a page left over from an earlier run can't
// make a check pass, or fail.
const RUN = Date.now().toString(36);
const REVIEW_MARK = `REVIEW-${RUN}`;
const SUGGESTION_MARK = `SUGGESTION-${RUN}`;
const ENTRY_TITLE = `Faster mocks on phones ${RUN}`;
const ENTRY_SLUG = `faster-mocks-on-phones-${RUN}`;
const SUPPORT = `help-${RUN}@doordie.example`;

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const env = { ...process.env, ...mockEnv, NEXT_TELEMETRY_DISABLED: "1", MOCK_APP_URL: APP };
const ANON = mockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
async function waitFor(what, test, timeout = 20_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/* ── talking to the mock and the app ───────────────────────────── */

/** SQL as the database owner, like the Supabase SQL Editor. */
async function sql(query) {
  const res = await fetch(`${MOCK}/__mock/sql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: query }) });
  const body = await res.json();
  return res.ok ? { ok: true, rows: body } : { ok: false, error: body };
}

async function signUpApi(name, email) {
  const res = await fetch(`${MOCK}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password: PASSWORD, data: { name } }),
  });
  const j = await res.json();
  check(res.ok && j.access_token, `couldn't sign up ${email}: ${JSON.stringify(j)}`);
  return { name, email, id: j.user.id, token: j.access_token };
}

async function signInApi(email, password = PASSWORD) {
  const res = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: await res.json() };
}

/** The app's own routes, as its pages call them (same origin, bearer token). */
async function api(token, method, path, body, { origin = APP } = {}) {
  const headers = { origin };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${APP}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json, headers: res.headers };
}
const data = (r) => r.body?.data;

/** A database function called straight through the Data API, as a browser could. */
async function rpcAs(token, fn, args = {}) {
  const res = await fetch(`${MOCK}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token ?? ANON}` },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** A public page as a visitor gets it, with React's text separators removed so sentences match. */
const pageText = async (path) => {
  const res = await fetch(`${APP}${path}`);
  return { status: res.status, text: (await res.text()).replace(/<!-- -->/g, "") };
};

const q = (s) => String(s).replace(/'/g, "''");

/**
 * Real use, as the database counts it: an account a month old with study
 * logged on `days` different days over the last three weeks. The journal
 * text is a marker that must never show up anywhere an administrator looks.
 */
async function giveUsage(user, days = 6) {
  check((await sql(`update auth.users set created_at = now() - interval '30 days' where id = '${user.id}'`)).ok, "couldn't backdate the account");
  // Whole entries, as the app saves them: the dashboard reads every field.
  const journal = Array.from({ length: days }, (_, i) => ({
    id: `e2e-${i}`,
    date: new Date(Date.now() - (20 - i * 3) * 86_400_000).toISOString().slice(0, 10),
    blocks: [{ subjectId: "polity", hours: 4, topics: ["Parliament"] }],
    totalHours: 4,
    mood: 4,
    energy: 3,
    motivation: 4,
    focus: 3,
    highlights: "PRIVATE-JOURNAL-TEXT",
  }));
  const r = await sql(
    `insert into public.chronicle_state (user_id, data) values ('${user.id}', '${q(JSON.stringify({ journal }))}'::jsonb)
     on conflict (user_id) do update set data = excluded.data`,
  );
  check(r.ok, `couldn't store usage: ${JSON.stringify(r.error)}`);
}

/** The bootstrap statement exactly as docs/ADMIN_SETUP.md gives it to the owner. */
function bootstrapSql(userId) {
  const guide = readFileSync(join(root, "docs", "ADMIN_SETUP.md"), "utf8");
  const block = /<!-- bootstrap-sql:start -->\s*```sql\n([\s\S]*?)```\s*<!-- bootstrap-sql:end -->/.exec(guide)?.[1];
  const placeholder = "00000000-0000-0000-0000-000000000000";
  check(block?.includes(placeholder), "the setup guide has the bootstrap SQL, with a placeholder for the user id");
  return block.replace(placeholder, userId);
}

const auditRows = async (where = "true") =>
  (await sql(`select id, action, target_type, target_id, actor_id, actor_role, reason, metadata::text as metadata from public.platform_admin_audit_log where ${where} order by id`)).rows;

/* ── the API scenarios ─────────────────────────────────────────── */

async function apiScenarios(people) {
  const { owner, admin, mod, s1, s2 } = people;

  await scenario("1. Nobody has the Admin Center until the owner runs the guide's SQL", async () => {
    check((await api(null, "GET", "/api/admin/me")).status === 401, "no session should be 401");
    check((await api(owner.token, "GET", "/api/admin/me")).status === 403, "an account without a role should be 403");
    const r = await sql(bootstrapSql(owner.id));
    check(r.ok, `the bootstrap SQL failed: ${JSON.stringify(r.error)}`);
    const me = await api(owner.token, "GET", "/api/admin/me");
    check(me.status === 200 && data(me).role === "super_admin", `the owner should be Super Admin: ${JSON.stringify(me.body)}`);
    check(data(me).userId === owner.id && data(me).email === owner.email, "the actor is the verified account");
    const granted = await auditRows(`target_id = '${owner.id}' and action = 'role.granted'`);
    check(granted.length === 1 && JSON.parse(granted[0].metadata).via === "sql", "the SQL Editor grant is audited as such");
    // Running it again changes nothing and logs nothing.
    check((await sql(bootstrapSql(owner.id))).ok, "the bootstrap SQL is safe to run twice");
    check((await auditRows(`target_id = '${owner.id}'`)).length === 1, "a repeat run adds no audit entry");
  });

  await scenario("2. TypeScript and the database agree on what every role may do", async () => {
    for (const role of PLATFORM_ROLES) {
      for (const flag of [false, true]) {
        const r = await sql(`select public.platform_permissions('${role}', ${flag}) as p`);
        const fromDb = r.rows?.[0]?.p;
        const fromTs = permissionsFor(role, { moderatorsHandleFeedback: flag });
        check(JSON.stringify(fromDb) === JSON.stringify(fromTs), `${role} (feedback setting ${flag}): database ${JSON.stringify(fromDb)}, app ${JSON.stringify(fromTs)}`);
      }
    }
  });

  await scenario("3. Roles are granted by email, never to oneself, never as Super Admin, never through a profile", async () => {
    check((await api(owner.token, "POST", "/api/admin/access", { email: admin.email, role: "admin", reason: "Runs the Feedback Center" })).status === 200, "granting Admin");
    check((await api(owner.token, "POST", "/api/admin/access", { email: mod.email, role: "moderator" })).status === 200, "granting Moderator");
    check(data(await api(mod.token, "GET", "/api/admin/me")).role === "moderator", "the Moderator's role is live at once");
    check((await api(owner.token, "POST", "/api/admin/access", { email: s1.email, role: "super_admin" })).status === 400, "Super Admin can't be granted in the app");
    check((await api(owner.token, "POST", "/api/admin/access", { email: "nobody@example.com", role: "admin" })).status === 404, "an unknown email is a 404");
    check((await api(admin.token, "POST", "/api/admin/access", { email: s1.email, role: "moderator" })).status === 403, "an Admin can't grant roles");
    check((await api(mod.token, "PATCH", `/api/admin/access/${mod.id}`, { role: "admin" })).status === 403, "a Moderator can't promote themselves");
    check((await api(owner.token, "PATCH", `/api/admin/access/${owner.id}`, { role: "admin" })).status === 403, "nobody changes their own role");
    check((await api(owner.token, "DELETE", `/api/admin/access/${owner.id}`, { reason: "Testing" })).status === 403, "nobody removes their own role");

    // A forged claim in the profile, or in the request, changes nothing.
    const forged = await fetch(`${MOCK}/auth/v1/user`, {
      method: "PUT",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${s1.token}` },
      body: JSON.stringify({ data: { role: "super_admin", is_admin: true, platform_role: "super_admin" } }),
    });
    check(forged.ok, "the profile update itself is allowed");
    check((await api(s1.token, "GET", "/api/admin/me")).status === 403, "a profile claiming a role gets nowhere");
    check((await api(s1.token, "GET", "/api/admin/users?role=super_admin")).status === 403, "nor does a query string");

    // The database's admin functions can't be called from a browser at all.
    for (const [fn, args] of [
      ["platform_admin_set_role", { p_actor: owner.id, p_user: s1.id, p_role: "admin" }],
      ["platform_admin_whoami", { p_user: owner.id }],
      ["platform_admin_list_users", { p_actor: owner.id }],
      ["platform_admin_audit", { p_actor: owner.id }],
    ]) {
      const r = await rpcAs(s1.token, fn, args);
      check(r.status === 403 || r.status === 401 || r.status === 404, `${fn} answered ${r.status} to a student`);
      check((await rpcAs(null, fn, args)).status >= 400, `${fn} answered a visitor`);
    }
    check((await rpcAs(s1.token, "platform_my_role")).body === null, "a student's own role is none");
    check((await rpcAs(owner.token, "platform_my_role")).body?.role === "super_admin", "the owner's own role reads back");

    // The last Super Admin stays, even in the SQL Editor.
    const del = await sql(`delete from public.platform_admin_memberships where user_id = '${owner.id}'`);
    check(!del.ok && /last_super_admin/.test(JSON.stringify(del.error)), `deleting the last Super Admin: ${JSON.stringify(del)}`);
    const demote = await sql(`update public.platform_admin_memberships set role = 'admin' where user_id = '${owner.id}'`);
    check(!demote.ok && /last_super_admin/.test(JSON.stringify(demote.error)), "demoting the last Super Admin");
    // Every change above is in the log, with who did it.
    const roleLog = await auditRows(`action like 'role.%'`);
    check(roleLog.some((e) => e.action === "role.granted" && e.target_id === admin.id && e.actor_id === owner.id && e.reason === "Runs the Feedback Center"), "the Admin grant is audited with its reason");
    check(roleLog.some((e) => e.action === "role.granted" && e.target_id === mod.id), "the Moderator grant is audited");
  });

  await scenario("4. Each role reaches its own pages' data and no one else's", async () => {
    const expect = async (token, path, status, who) => {
      const r = await api(token, "GET", path);
      check(r.status === status, `${who} GET ${path}: ${r.status}, expected ${status}`);
    };
    for (const p of ["/api/admin/overview", "/api/admin/users", "/api/admin/reviews", "/api/admin/feedback", "/api/admin/announcements", "/api/admin/changelog"]) {
      await expect(admin.token, p, 200, "Admin");
    }
    for (const p of ["/api/admin/settings", "/api/admin/access", "/api/admin/audit"]) await expect(admin.token, p, 403, "Admin");
    await expect(mod.token, "/api/admin/reviews", 200, "Moderator");
    for (const p of ["/api/admin/users", "/api/admin/feedback", "/api/admin/announcements", "/api/admin/changelog", "/api/admin/settings"]) {
      await expect(mod.token, p, 403, "Moderator");
    }
    // The setting widens the Moderator role to feedback, on the next request, in the database too.
    check((await api(owner.token, "PATCH", "/api/admin/settings", { moderators_handle_feedback: true })).status === 200, "turning the setting on");
    await expect(mod.token, "/api/admin/feedback", 200, "Moderator with the setting on");
    check(data(await api(mod.token, "GET", "/api/admin/me")).permissions.includes("feedback.manage"), "the Moderator's permissions say so");
    check((await api(owner.token, "PATCH", "/api/admin/settings", { moderators_handle_feedback: false })).status === 200, "turning it off");
    await expect(mod.token, "/api/admin/feedback", 403, "Moderator with the setting off");
    // The overview's figures for a Moderator leave out accounts entirely.
    const modView = data(await api(mod.token, "GET", "/api/admin/overview"));
    check(modView.reviews && !modView.accounts && !modView.recentAccounts, "a Moderator's overview has no account figures");
    const full = data(await api(owner.token, "GET", "/api/admin/overview"));
    check(full.accounts.total >= 5, `the overview counts accounts: ${JSON.stringify(full.accounts)}`);
    // Changes must come from the site's own pages.
    check((await api(owner.token, "PATCH", "/api/admin/settings", { reviews_open: true }, { origin: "https://evil.example" })).status === 403, "a cross-site change is refused");
  });

  await scenario("5. A review goes from real use, through a moderator, to the website, and comes down when its author says so", async () => {
    const fresh = data(await api(s1.token, "GET", "/api/reviews"));
    check(fresh.review === null && fresh.open === true && fresh.eligibility.eligible === false, `a new account isn't eligible: ${JSON.stringify(fresh)}`);
    const review = {
      rating: 2,
      headline: "Useful, but the mocks page is slow",
      body: `${REVIEW_MARK}: I log every day and the revision reminders work, but the mocks page is slow on my phone.`,
      useful: "The revision reminders",
      suggestions: `${SUGGESTION_MARK}: make mocks faster`,
      features: ["journal", "mocks"],
      stage: "prelims",
      displayName: "Student O.",
      feedbackConsent: true,
      publicConsent: true,
    };
    check((await api(s1.token, "POST", "/api/reviews", review)).status === 403, "a brand-new account can't review yet");
    check((await sql(`update auth.users set created_at = now() - interval '90 days' where id = '${s1.id}'`)).ok, "backdating");
    check((await api(s1.token, "POST", "/api/reviews", review)).status === 403, "an old account with no records still can't: age alone isn't use");
    await giveUsage(s1);
    const elig = data(await api(s1.token, "GET", "/api/reviews")).eligibility;
    check(elig.eligible && elig.usageDays === 6 && elig.daysSinceFirstUse === 20, `real use counts: ${JSON.stringify(elig)}`);
    check((await api(s1.token, "POST", "/api/reviews", { ...review, feedbackConsent: false })).status === 400, "the team must be allowed to read it");

    const sent = data(await api(s1.token, "POST", "/api/reviews", review));
    check(sent?.status === "pending" && sent.feedbackConsentAt && sent.publicConsentAt, `sent and waiting: ${JSON.stringify(sent)}`);
    check(!(await pageText("/testimonials")).text.includes(REVIEW_MARK), "a pending review isn't public");

    const queue = data(await api(mod.token, "GET", "/api/admin/reviews?status=pending"));
    check(queue.items.some((r) => r.id === sent.id && r.rating === 2), "the low rating is in the queue like any other");
    check(!JSON.stringify(queue).includes("PRIVATE-JOURNAL-TEXT"), "nothing from the author's records reaches the moderator");

    // Whatever a moderator sends, the words and the rating stay the author's.
    check((await api(mod.token, "POST", `/api/admin/reviews/${sent.id}/moderate`, { action: "publish", body: "Edited", rating: 5 })).status === 200, "publishing");
    const live = data(await api(mod.token, "GET", `/api/admin/reviews/${sent.id}`));
    check(live.status === "published" && live.rating === 2 && live.body === review.body, "moderators can't edit a review");

    await waitFor("the review on /testimonials", async () => (await pageText("/testimonials")).text.includes(REVIEW_MARK));
    const page = (await pageText("/testimonials")).text;
    check(!page.includes(SUGGESTION_MARK) && !page.includes(s1.email), "suggestions and the author's email stay private");
    await waitFor("the review on the home page", async () => (await pageText("/")).text.includes(REVIEW_MARK));
    await waitFor("the review on a feature page", async () => (await pageText("/upsc-progress-tracker")).text.includes(REVIEW_MARK));

    // Taking back public display takes it down at once, everywhere.
    const off = data(await api(s1.token, "PATCH", "/api/reviews", { publicConsent: false }));
    check(off.status === "approved" && off.publicConsent === false && off.publicConsentAt === null, `consent withdrawn: ${JSON.stringify(off)}`);
    await waitFor("the review off /testimonials", async () => !(await pageText("/testimonials")).text.includes(REVIEW_MARK));
    await waitFor("the review off the home page", async () => !(await pageText("/")).text.includes(REVIEW_MARK));

    // Allowing it again sends it back to a moderator, and so does editing what's public.
    check(data(await api(s1.token, "PATCH", "/api/reviews", { publicConsent: true })).status === "pending", "consent again means moderation again");
    check((await api(mod.token, "POST", `/api/admin/reviews/${sent.id}/moderate`, { action: "reject" })).status === 400, "a rejection needs a reason");
    check((await api(mod.token, "POST", `/api/admin/reviews/${sent.id}/moderate`, { action: "reject", reason: "It includes a phone number" })).status === 200, "rejecting");
    check(data(await api(s1.token, "GET", "/api/reviews")).review.moderationReason === "It includes a phone number", "the author sees why");
    check(data(await api(s1.token, "POST", "/api/reviews", { ...review, body: `${review.body} Fixed.` })).status === "pending", "an edit goes back to a moderator");
    const onlyPrivate = data(await api(s1.token, "POST", "/api/reviews", { ...review, body: `${review.body} Fixed.`, suggestions: `${SUGGESTION_MARK}: changed` }));
    check(onlyPrivate.status === "pending", "still waiting");

    check(data(await api(s1.token, "DELETE", "/api/reviews?mode=withdraw")).status === "withdrawn", "withdrawing");
    check(!data(await api(mod.token, "GET", "/api/admin/reviews?status=pending")).items.some((r) => r.id === sent.id), "a withdrawn review leaves the queue");
    check((await api(s1.token, "DELETE", "/api/reviews?mode=delete")).status === 200, "deleting");
    check(data(await api(s1.token, "GET", "/api/reviews")).review === null, "deleted means gone");

    const log = await auditRows(`target_type = 'review'`);
    check(log.some((e) => e.action === "review.published" && e.actor_id === mod.id && e.actor_role === "moderator"), "publishing is audited with the moderator");
    check(log.some((e) => e.action === "review.rejected" && e.reason === "It includes a phone number"), "the rejection is audited with its reason");
    check(!JSON.stringify(log).includes(REVIEW_MARK) && !JSON.stringify(log).includes(SUGGESTION_MARK), "the audit log holds no review text");
  });

  await scenario("6. Feedback reaches the team with its screenshot; the author sees the answer, never the notes", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    const sent = await api(s1.token, "POST", "/api/feedback", {
      category: "bug",
      message: "FEEDBACK-E2E: the Save button on Mocks does nothing on my phone.",
      shareEmail: false,
      includeDetails: true,
      context: { userAgent: "e2e", screen: "390×844", installed: false },
      screenshot: { type: "image/png", data: png },
    });
    check(sent.status === 200 && data(sent).screenshot === "stored" && data(sent).status === "new", `sent: ${JSON.stringify(sent.body)}`);
    check(!("userId" in data(sent)) && !("email" in data(sent)), "the answer to the author carries no account fields");
    const id = data(sent).id;
    const fake = await api(s1.token, "POST", "/api/feedback", {
      category: "bug",
      message: "This screenshot is really a script.",
      screenshot: { type: "image/png", data: Buffer.from("<script>alert(1)</script>").toString("base64") },
    });
    check(fake.status === 400, "a file that isn't the image it claims is refused");

    const list = data(await api(admin.token, "GET", "/api/admin/feedback"));
    const item = list.items.find((f) => f.id === id);
    check(item && item.email === null && item.shareEmail === false, "the email stays hidden when not shared");
    const detail = data(await api(admin.token, "GET", `/api/admin/feedback/${id}`));
    check(detail.screenshotUrl && detail.context.screen === "390×844", "the team sees the screenshot and the details shared");
    const shot = await fetch(new URL(detail.screenshotUrl, MOCK));
    check(shot.ok && (await shot.arrayBuffer()).byteLength > 20, "the screenshot link opens for the team");

    check((await api(admin.token, "PATCH", `/api/admin/feedback/${id}`, { status: "in_progress", priority: "high" })).status === 200, "triage");
    check((await api(admin.token, "POST", `/api/admin/feedback/${id}/notes`, { body: "PRIVATE-NOTE-E2E: reproduced on Android" })).status === 200, "a private note");
    check((await api(admin.token, "PUT", `/api/admin/feedback/${id}/response`, { response: "Fixed in the next update. Thank you!" })).status === 200, "a response");

    const mine = await api(s1.token, "GET", "/api/feedback");
    const seen = data(mine).items.find((f) => f.id === id);
    check(seen.status === "in_progress" && seen.response === "Fixed in the next update. Thank you!" && seen.responseSeen === false, "the author sees the status and answer");
    check(!JSON.stringify(mine.body).includes("PRIVATE-NOTE-E2E") && !JSON.stringify(mine.body).includes('"priority"'), "the author never sees notes or priority");
    check((await rpcAs(s1.token, "platform_my_announcements")).body.unseenResponses === 1, "the app knows there's an unread answer");
    check((await api(s1.token, "PATCH", "/api/feedback", {})).status === 200, "marking it read");
    check((await rpcAs(s1.token, "platform_my_announcements")).body.unseenResponses === 0, "read");
    check(data(await api(s2.token, "GET", "/api/feedback")).items.length === 0, "another student sees none of it");

    // Ten a day per account, counted by the database.
    let last;
    for (let i = 0; i < 10; i++) last = await api(s2.token, "POST", "/api/feedback", { category: "general", message: `Message number ${i} from the second student.` });
    check(last.status === 200, "ten messages are fine");
    check((await api(s2.token, "POST", "/api/feedback", { category: "general", message: "One message too many today." })).status === 429, "the eleventh waits for tomorrow");
    check((await api(s1.token, "POST", "/api/feedback", { category: "general", message: "Sent from another site." }, { origin: "https://evil.example" })).status === 403, "feedback from another site is refused");

    const log = await auditRows(`target_type = 'feedback'`);
    check(log.some((e) => e.action === "feedback.note_added") && log.some((e) => e.action === "feedback.responded"), "notes and answers are audited");
    check(!JSON.stringify(log).includes("PRIVATE-NOTE-E2E") && !JSON.stringify(log).includes("FEEDBACK-E2E"), "the audit log holds neither the note nor the message");
  });

  await scenario("7. Announcements wait for their start, and read state belongs to each account", async () => {
    const draft = data(await api(admin.token, "POST", "/api/admin/announcements", { title: "Draft only", body: "Not ready.", category: "general" }));
    check(draft.status === "draft" && draft.state === "draft", "a new announcement is a draft");
    const live = data(await api(admin.token, "POST", "/api/admin/announcements", {
      title: "ANNOUNCE-E2E: Habits now count Roadmap work",
      body: "Connect a habit to the **Roadmap** and it fills itself in.",
      category: "new_feature",
    }));
    const published = data(await api(admin.token, "POST", `/api/admin/announcements/${live.id}/action`, { action: "publish" }));
    check(published.state === "live", `publishing now is live: ${JSON.stringify(published)}`);
    const later = data(await api(admin.token, "POST", "/api/admin/announcements", { title: "Maintenance on Sunday", body: "Sync pauses for ten minutes.", category: "maintenance" }));
    const scheduled = data(await api(admin.token, "POST", `/api/admin/announcements/${later.id}/action`, { action: "publish", startsAt: new Date(Date.now() + 3_600_000).toISOString() }));
    check(scheduled.state === "scheduled", "a future start is scheduled");
    check((await api(admin.token, "DELETE", `/api/admin/announcements/${live.id}`, {})).status === 400, "a published announcement can't be deleted, only archived");
    check((await api(mod.token, "POST", "/api/admin/announcements", { title: "Moderator news", body: "No." })).status === 403, "Moderators can't announce");

    const forS1 = (await rpcAs(s1.token, "platform_my_announcements")).body;
    check(forS1.items.length === 1 && forS1.items[0].id === live.id, `students see only what has started: ${JSON.stringify(forS1.items.map((i) => i.title))}`);
    check((await rpcAs(null, "platform_my_announcements")).status >= 400, "visitors get nothing");
    const markDraft = await rpcAs(s1.token, "platform_mark_announcement", { p_id: draft.id, p_action: "read" });
    check(markDraft.status >= 400 && /not_found/.test(JSON.stringify(markDraft.body)), "a draft can't even be marked as read");
    check((await rpcAs(s1.token, "platform_mark_announcement", { p_id: live.id, p_action: "dismiss" })).status === 200, "dismissing");
    check((await rpcAs(s1.token, "platform_my_announcements")).body.items[0].dismissedAt, "dismissed for the first student");
    check((await rpcAs(s2.token, "platform_my_announcements")).body.items[0].readAt === null, "still unread for the second");

    // Time passes: the scheduled one starts.
    check((await sql(`update public.platform_announcements set starts_at = now() - interval '1 minute' where id = '${later.id}'`)).ok, "moving the clock");
    check((await rpcAs(s2.token, "platform_my_announcements")).body.items.length === 2, "the scheduled announcement appears once it starts");
    check((await rpcAs(s2.token, "platform_mark_announcements_read")).body.marked === 2, "opening the page reads both");

    const counts = data(await api(admin.token, "GET", "/api/admin/announcements")).items.find((a) => a.id === live.id);
    check(counts.reads >= 2 && counts.dismissals === 1, `the team sees how many read and dismissed: ${JSON.stringify(counts)}`);
    check(data(await api(admin.token, "POST", `/api/admin/announcements/${later.id}/action`, { action: "archive" })).state === "archived", "archiving");
    check((await rpcAs(s2.token, "platform_my_announcements")).body.items.length === 1, "an archived announcement comes down");
  });

  await scenario("8. Changelog drafts don't exist in public; a published entry does, in the sitemap too", async () => {
    const entry = data(await api(admin.token, "POST", "/api/admin/changelog", {
      title: ENTRY_TITLE,
      summary: "The Mocks page now opens twice as fast on a phone.",
      body: "## What changed\nWe load charts only when you scroll to them.",
      category: "performance",
      featureKey: "mocks",
    }));
    check(entry.status === "draft" && entry.slug === ENTRY_SLUG, `a draft with an address: ${JSON.stringify(entry)}`);
    check((await pageText(`/changelog/${entry.slug}`)).status === 404, "a draft's address is a 404");
    check(!(await pageText("/changelog")).text.includes(ENTRY_TITLE), "a draft isn't listed");
    check((await rpcAs(null, "platform_public_changelog_entry", { p_slug: entry.slug })).body === null, "nor returned to a visitor");

    // The feedback that asked for it is linked, so the entry can say so.
    const fb = data(await api(admin.token, "GET", "/api/admin/feedback?status=all")).items.find((f) => f.message.startsWith("FEEDBACK-E2E"));
    check((await api(admin.token, "PATCH", `/api/admin/feedback/${fb.id}`, { changelogEntryId: entry.id, status: "resolved" })).status === 200, "linking the feedback");

    check(data(await api(admin.token, "POST", `/api/admin/changelog/${entry.id}/action`, { action: "publish" })).state === "published", "publishing");
    await waitFor("the entry's page", async () => (await pageText(`/changelog/${entry.slug}`)).status === 200);
    const page = (await pageText(`/changelog/${entry.slug}`)).text;
    check(page.includes(ENTRY_TITLE) && page.includes("1 request from students led to this"), "the entry says it came from a request");
    check(!page.includes("FEEDBACK-E2E"), "without showing the request");
    await waitFor("the entry in the list", async () => (await pageText("/changelog")).text.includes(ENTRY_TITLE));
    await waitFor("the entry in the sitemap", async () => (await pageText("/sitemap.xml")).text.includes(`/changelog/${entry.slug}`));
    const mine = data(await api(s1.token, "GET", "/api/feedback")).items.find((f) => f.id === fb.id);
    check(mine.status === "resolved" && mine.changelog?.slug === entry.slug && mine.changelog.published, "the author sees it shipped");

    check(data(await api(admin.token, "POST", `/api/admin/changelog/${entry.id}/action`, { action: "unpublish" })).state === "draft", "unpublishing");
    await waitFor("the entry gone again", async () => (await pageText(`/changelog/${entry.slug}`)).status === 404);
  });

  await scenario("9. A suspension stops sign-in and is recorded; a role holder can't be suspended; restoring lifts it", async () => {
    check((await api(admin.token, "POST", `/api/admin/users/${s2.id}/suspend`, { reason: "spam" })).status === 400, "a suspension needs a real reason");
    check((await api(admin.token, "POST", `/api/admin/users/${mod.id}/suspend`, { reason: "Testing the rule" })).status === 403, "someone with a role can't be suspended");
    check((await api(admin.token, "POST", `/api/admin/users/${admin.id}/suspend`, { reason: "Testing the rule" })).status === 403, "nobody suspends themselves");
    check((await api(mod.token, "POST", `/api/admin/users/${s2.id}/suspend`, { reason: "Testing the rule" })).status === 403, "Moderators can't suspend");
    const done = await api(admin.token, "POST", `/api/admin/users/${s2.id}/suspend`, { reason: "Repeated spam in feedback", length: "7" });
    check(done.status === 200 && data(done).suspended === true, `suspended: ${JSON.stringify(done.body)}`);
    const signIn = await signInApi(s2.email);
    check(signIn.status === 400 && signIn.body.error_code === "user_banned", `a suspended account can't sign in: ${JSON.stringify(signIn.body)}`);
    const detail = data(await api(admin.token, "GET", `/api/admin/users/${s2.id}`));
    check(detail.suspended && detail.history.some((h) => h.action === "user.suspended" && h.reason === "Repeated spam in feedback"), "the history shows it, with the reason");
    check(!JSON.stringify(detail).includes("PRIVATE-JOURNAL-TEXT") && !("data" in detail), "an account's details never include its records");
    const search = data(await api(admin.token, "GET", `/api/admin/users?q=${encodeURIComponent("student.two")}`));
    check(search.total === 1 && search.items[0].id === s2.id && search.items[0].suspended, "search by email finds it");
    check(data(await api(admin.token, "GET", "/api/admin/users?filter=suspended")).items.some((u) => u.id === s2.id), "the Suspended filter finds it");
    check((await api(admin.token, "POST", `/api/admin/users/${s2.id}/restore`, {})).status === 200, "restoring");
    check((await signInApi(s2.email)).status === 200, "restored accounts sign in again");
    const userLog = await auditRows(`target_id = '${s2.id}'`);
    check(userLog.map((e) => e.action).join(",") === "user.suspended,user.restored", `suspension and restore audited in order: ${userLog.map((e) => e.action)}`);
  });

  await scenario("10. Settings are checked, recorded, and reach the public site", async () => {
    check((await api(owner.token, "PATCH", "/api/admin/settings", { review_min_days: -1 })).status === 400, "out of range is refused");
    check((await api(owner.token, "PATCH", "/api/admin/settings", { grant_admin: true })).status === 400, "unknown settings are refused");
    check((await api(admin.token, "PATCH", "/api/admin/settings", { reviews_open: false })).status === 403, "only a Super Admin changes settings");
    const saved = data(await api(owner.token, "PATCH", "/api/admin/settings", { support_email: SUPPORT, app_notice: { enabled: true, message: "NOTICE-E2E: maintenance on Sunday", tone: "warning" } }));
    check(saved.values.support_email === SUPPORT && saved.changed.support_email.by === owner.email, "saved, with who changed it");
    await waitFor("the support address on /contact", async () => (await pageText("/contact")).text.includes(SUPPORT));
    check((await rpcAs(s1.token, "platform_my_announcements")).body.notice?.message === "NOTICE-E2E: maintenance on Sunday", "the app gets the notice");
    const log = await auditRows(`action = 'setting.updated' and target_id = 'support_email'`);
    check(log.length === 1 && JSON.parse(log[0].metadata).to === SUPPORT, "the change is audited with its new value");
  });

  await scenario("11. The audit log is complete, append-only, and holds no one's private words", async () => {
    const page = data(await api(owner.token, "GET", "/api/admin/audit?limit=200"));
    const actions = new Set(page.items.map((e) => e.action));
    for (const a of ["role.granted", "review.published", "review.rejected", "feedback.updated", "feedback.note_added", "feedback.responded", "announcement.published", "announcement.scheduled", "announcement.archived", "changelog.created", "changelog.published", "changelog.unpublished", "setting.updated", "user.suspended", "user.restored"]) {
      check(actions.has(a), `the log has ${a}`);
    }
    check(page.items.every((e, i, all) => i === 0 || all[i - 1].id > e.id), "newest first");
    const older = data(await api(owner.token, "GET", `/api/admin/audit?limit=5&before=${page.items[4].id}`));
    check(older.items.length === 5 && older.items[0].id < page.items[4].id, "and pages backwards by id");
    const roles = data(await api(owner.token, "GET", "/api/admin/audit?action=role."));
    check(roles.items.length > 0 && roles.items.every((e) => e.action.startsWith("role.")), "filtered by area");

    for (const attempt of [
      "update public.platform_admin_audit_log set reason = 'rewritten'",
      "delete from public.platform_admin_audit_log",
      "truncate public.platform_admin_audit_log",
    ]) {
      const r = await sql(attempt);
      check(!r.ok, `the database refused: ${attempt}`);
    }
    const everything = JSON.stringify(await auditRows());
    for (const secret of ["PRIVATE-JOURNAL-TEXT", REVIEW_MARK, SUGGESTION_MARK, "FEEDBACK-E2E", "PRIVATE-NOTE-E2E", s1.email, s2.email, PASSWORD]) {
      check(!everything.includes(secret), `the audit log holds ${secret}`);
    }
  });

  await scenario("12. The last Super Admin can't delete their account from the app", async () => {
    const fresh = await signInApi(owner.email);
    const r = await api(fresh.body.access_token, "POST", "/api/account/delete", { confirm: "DELETE" });
    check(r.status === 409 && r.body.code === "last_super_admin", `deleting the last Super Admin: ${r.status} ${JSON.stringify(r.body)}`);
    check(data(await api(owner.token, "GET", "/api/admin/me")).role === "super_admin", "still there");
  });
}

/* ── in the browser ────────────────────────────────────────────── */

async function signInUi(page, email, next) {
  await page.goto(`${APP}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** First-run setup for an account made through the API, if the app asks for it. */
async function onboardIfAsked(page, name) {
  const field = page.getByLabel("What should we call you?");
  try {
    await field.waitFor({ timeout: 8000 });
  } catch {
    return;
  }
  if (!(await field.inputValue())) await field.fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Which attempt are you preparing for?").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my chronicle" }).click();
}

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

async function passTourIfShown(page) {
  const tour = page.getByRole("dialog", { name: "DoOrDie feature tour" });
  try {
    await tour.waitFor({ timeout: 6000 });
  } catch {
    return;
  }
  await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
  await tour.waitFor({ state: "detached" });
}

/** The app's error screen, which the shell's banners would otherwise hide from a check. */
async function notCrashed(page, where) {
  check(!(await page.getByText("This page ran into a problem.").count()), `${where} crashed`);
}

/** Into the app proper: setup, the sleep check-in and the tour out of the way. */
async function intoApp(page, person) {
  await page.goto(`${APP}/dashboard`);
  await onboardIfAsked(page, person.name);
  await passSleepPromptIfShown(page);
  await passTourIfShown(page);
  await page.getByRole("button", { name: /^Account:/ }).waitFor();
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await notCrashed(page, "the dashboard");
}

async function accountMenuLinks(page) {
  await page.getByRole("button", { name: /^Account:/ }).click();
  const menu = page.getByRole("dialog", { name: "Account" });
  await menu.waitFor();
  const links = await menu.getByRole("link").allInnerTexts();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  return links.map((l) => l.replace(/\s+/g, " ").trim());
}

const ADMIN_PAGES = [
  ["Overview", "Overview"],
  ["Users", "Users"],
  ["Reviews", "Reviews"],
  ["Feedback", "Feedback"],
  ["Announcements", "Announcements"],
  ["Changelog", "Changelog"],
  ["Platform settings", "Platform settings"],
  ["Admin access", "Admin access"],
  ["Audit log", "Audit log"],
];

/** The page's own content doesn't spill sideways. */
const fitsWidth = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector("main");
    return stage ? stage.scrollWidth <= stage.clientWidth + 1 : document.documentElement.scrollWidth <= window.innerWidth + 1;
  });

async function noErrorShown(page, where) {
  // Inside the page only: Next's route announcer is an alert too, outside <main>.
  const alerts = await page.locator("main [role=alert]").allInnerTexts();
  check(!alerts.some((t) => t.trim()), `${where} shows an error: ${alerts.join(" | ")}`);
}

async function browserScenarios(browser, people) {
  const { owner, mod, s1 } = people;
  mkdirSync(SHOTS, { recursive: true });

  await scenario("13. A student who opens /admin is told there's no access, and their menu has no link to it", async () => {
    const page = await (await browser.newContext()).newPage();
    await signInUi(page, s1.email, "/admin");
    await page.getByRole("heading", { name: "No access" }).waitFor();
    check(!(await page.locator("[data-admin-center]").count()), "nothing of the Admin Center rendered");
    await page.screenshot({ path: join(SHOTS, "no-access.png") });
    await intoApp(page, s1);
    const links = await accountMenuLinks(page);
    check(!links.some((l) => l.includes("Admin Center")), `a student's menu: ${links}`);
    // The app-wide notice the Super Admin switched on, and a new announcement as a banner.
    await page.getByText("NOTICE-E2E: maintenance on Sunday").waitFor();
    const a = data(await api(owner.token, "POST", "/api/admin/announcements", { title: "BANNER-E2E: Weekly reviews are faster", body: "They open in half the time.", category: "product_update" }));
    await api(owner.token, "POST", `/api/admin/announcements/${a.id}/action`, { action: "publish" });
    await page.reload();
    const banner = page.getByRole("region", { name: "Announcement from the team" });
    await banner.getByText("BANNER-E2E: Weekly reviews are faster").waitFor();
    await page.screenshot({ path: join(SHOTS, "student-banner.png") });
    await banner.getByRole("button", { name: /^Dismiss/ }).click();
    await banner.waitFor({ state: "detached" });
    await page.reload();
    await page.getByText("NOTICE-E2E: maintenance on Sunday").waitFor();
    await notCrashed(page, "the dashboard with a notice");
    check(!(await page.getByText("BANNER-E2E: Weekly reviews are faster").count()), "a dismissed announcement stays dismissed");
    // It's still on the Announcements page, with its text.
    await page.goto(`${APP}/announcements`);
    await page.getByRole("heading", { name: "Announcements", level: 1 }).waitFor();
    await page.getByRole("heading", { name: "BANNER-E2E: Weekly reviews are faster" }).waitFor();
    await page.getByText("They open in half the time.").waitFor();
    await notCrashed(page, "the Announcements page");
    await page.screenshot({ path: join(SHOTS, "student-announcements.png") });
    // The team's answer is in Settings, under Help & feedback.
    await page.goto(`${APP}/settings#feedback`);
    await page.getByText("Fixed in the next update. Thank you!").waitFor();
    await page.getByRole("heading", { name: "Review DoOrDie" }).waitFor();
    await page.getByRole("button", { name: "Write a review" }).waitFor();
    await notCrashed(page, "Settings");
    await page.screenshot({ path: join(SHOTS, "student-settings.png"), fullPage: true });
    await page.close();
  });

  await scenario("14. A Super Admin gets the link, and every Admin Center page renders its own data", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signInUi(page, owner.email, "/admin");
    await page.getByRole("heading", { name: "Overview", level: 1 }).waitFor();
    const nav = page.getByRole("navigation", { name: "Admin Center" });
    for (const [link, title] of ADMIN_PAGES) {
      await nav.getByRole("link", { name: link, exact: true }).click();
      await page.getByRole("heading", { name: title, level: 1 }).waitFor();
      await page.waitForLoadState("networkidle");
      await noErrorShown(page, title);
      await page.screenshot({ path: join(SHOTS, `desktop-${link.toLowerCase().replace(/\s+/g, "-")}.png`), fullPage: true });
      check(await fitsWidth(page), `${title} spills sideways on a laptop`);
    }
    // A setting saved through the page, and put back.
    await nav.getByRole("link", { name: "Platform settings", exact: true }).click();
    const open = page.getByRole("switch", { name: "Accept new reviews" });
    check((await open.getAttribute("aria-checked")) === "true", "reviews start open");
    await open.click();
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await page.getByText("Settings saved").waitFor();
    check(data(await api(owner.token, "GET", "/api/admin/settings")).values.reviews_open === false, "the page saved it");
    await open.click();
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await waitFor("reviews open again", async () => data(await api(owner.token, "GET", "/api/admin/settings")).values.reviews_open === true);
    // The link in the account menu.
    await intoApp(page, owner);
    const links = await accountMenuLinks(page);
    check(links.some((l) => l.includes("Admin Center") && l.includes("Super Admin")), `the owner's menu: ${links}`);

    // All three themes.
    for (const [mode, surface] of [["lavender", "lavender"], ["light", "white"], ["dark", "black"]]) {
      await page.evaluate(([id, m]) => localStorage.setItem(`upsc-chronicle-theme:${id}`, m), [owner.id, mode]);
      await page.goto(`${APP}/admin/reviews`);
      await page.getByRole("heading", { name: "Reviews", level: 1 }).waitFor();
      check((await page.evaluate(() => document.documentElement.getAttribute("data-surface"))) === surface, `the ${mode} theme applies`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: join(SHOTS, `theme-${mode}.png`) });
    }
    await ctx.close();
  });

  await scenario("15. A Moderator sees only Reviews, and a page outside the role says so without loading it", async () => {
    const page = await (await browser.newContext()).newPage();
    const asked = [];
    page.on("request", (r) => r.url().includes("/api/admin/") && asked.push(new URL(r.url()).pathname));
    await signInUi(page, mod.email, "/admin/settings");
    await page.getByRole("heading", { name: "Platform settings isn't part of your role" }).waitFor();
    check(!asked.includes("/api/admin/settings"), `the settings page asked for its data anyway: ${asked}`);
    const links = await page.getByRole("navigation", { name: "Admin Center" }).getByRole("link").allInnerTexts();
    check(JSON.stringify(links.map((l) => l.trim())) === JSON.stringify(["Overview", "Reviews"]), `a Moderator's navigation: ${links}`);
    await page.goto(`${APP}/admin/reviews`);
    await page.getByRole("heading", { name: "Reviews", level: 1 }).waitFor();
    await page.waitForLoadState("networkidle");
    await noErrorShown(page, "a Moderator's Reviews page");
    await page.close();
  });

  await scenario("16. On a phone, every page fits and the menu opens as a drawer", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await signInUi(page, owner.email, "/admin");
    await page.getByRole("heading", { name: "Overview", level: 1 }).waitFor();
    for (const [link, title] of ADMIN_PAGES) {
      await page.getByRole("button", { name: "Open the Admin Center menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Admin Center menu" });
      await drawer.waitFor();
      await drawer.getByRole("link", { name: link, exact: true }).click();
      await drawer.waitFor({ state: "detached" });
      await page.getByRole("heading", { name: title, level: 1 }).waitFor();
      await page.waitForLoadState("networkidle");
      await noErrorShown(page, `${title} on a phone`);
      await page.screenshot({ path: join(SHOTS, `phone-${link.toLowerCase().replace(/\s+/g, "-")}.png`), fullPage: true });
      check(await fitsWidth(page), `${title} spills sideways on a phone`);
    }
    await ctx.close();
  });
}

/* ── run ───────────────────────────────────────────────────────── */

async function main() {
  console.log("Starting the mock Supabase…");
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  if (!process.argv.includes("--no-build")) {
    console.log("Building the app against it (a minute or two)…");
    execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "ignore" });
  }
  // The mock's database starts empty every run, so answers Next stored from an
  // earlier run (published reviews, changelog entries) would be wrong here.
  rmSync(join(root, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  await start("npx", ["next", "start", "-p", "3100"], "Ready");
  const browser = await chromium.launch();
  try {
    const people = {
      owner: await signUpApi("Platform Owner", "owner@example.com"),
      admin: await signUpApi("Team Admin", "admin@example.com"),
      mod: await signUpApi("Team Moderator", "moderator@example.com"),
      s1: await signUpApi("Student One", "student.one@example.com"),
      s2: await signUpApi("Student Two", "student.two@example.com"),
    };
    await apiScenarios(people);
    await browserScenarios(browser, people);
    console.log(`\nAll ${passed} scenarios passed. Screenshots: ${SHOTS}`);
  } catch (e) {
    console.log("✗");
    console.error(`\n${e.stack ?? e}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    stopAll();
  }
}

main().catch((e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});
