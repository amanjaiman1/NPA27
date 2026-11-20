import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS,
  isSafeImageUrl,
  isUuid,
  parseAuditQuery,
  parseChangelog,
  parseFeedbackSubmission,
  parseReviewFields,
  parseRoleChange,
  parseRoleGrant,
  parseSettings,
  parseSuspension,
  settingProblem,
  slugify,
} from "@/lib/platform/validate";

/* What the Admin API and the student routes accept. The database checks the
   same rules again; these tests pin the first line of defence. */

const errorOf = (p: { ok: boolean; error?: string }) => (p.ok ? null : p.error);

test("settings are typed: unknown keys, wrong types and out-of-range numbers are refused", () => {
  assert.equal(settingProblem("reviews_open", true), null);
  assert.equal(settingProblem("reviews_open", "true"), "Expected on or off.");
  assert.equal(settingProblem("review_min_days", 14), null);
  assert.equal(settingProblem("review_min_days", 14.5), "Expected a whole number.");
  assert.match(settingProblem("review_min_days", 400) ?? "", /Between 0 and 365/);
  assert.match(settingProblem("testimonials_home_count", 0) ?? "", /Between 1 and 6/);
  assert.equal(settingProblem("support_email", ""), null);
  assert.equal(settingProblem("support_email", "help@example.com"), null);
  assert.equal(settingProblem("support_email", "not an email"), "That isn't an email address.");
  assert.equal(settingProblem("announcement_default_category", "maintenance"), null);
  assert.equal(settingProblem("announcement_default_category", "sale"), "Unknown option.");
  assert.equal(settingProblem("is_admin", true), "Unknown setting.");
});

test("the app-wide notice needs words before it can be switched on, and nothing extra", () => {
  assert.equal(settingProblem("app_notice", { enabled: false, message: "", tone: "info" }), null);
  assert.equal(settingProblem("app_notice", { enabled: true, message: "Maintenance on Sunday, 9 pm.", tone: "warning" }), null);
  assert.match(settingProblem("app_notice", { enabled: true, message: " ", tone: "info" }) ?? "", /Write the notice/);
  assert.match(settingProblem("app_notice", { enabled: true, message: "x".repeat(241), tone: "info" }) ?? "", /240/);
  assert.match(settingProblem("app_notice", { enabled: true, message: "Hello there", tone: "info", html: "<b>" }) ?? "", /Unknown notice field/);
  assert.ok(settingProblem("app_notice", { enabled: true, message: "Hello there", tone: "danger" }));
});

test("a settings change is all or nothing", () => {
  assert.equal(errorOf(parseSettings({})), "Nothing to save.");
  assert.equal(errorOf(parseSettings([])), "Nothing to save.");
  assert.match(errorOf(parseSettings({ reviews_open: false, review_min_days: -1 })) ?? "", /^Days since first use:/);
  assert.deepEqual(parseSettings({ reviews_open: false }), { ok: true, value: { reviews_open: false } });
  // Every setting the page offers has a definition the server checks.
  for (const key of Object.keys(SETTINGS)) assert.notEqual(settingProblem(key, Symbol("x")), "Unknown setting.");
});

test("roles granted in the app are Admin or Moderator, by an email address", () => {
  const ok = parseRoleGrant({ email: "  Someone@Example.com ", role: "moderator", reason: "Helping with reviews" });
  assert.deepEqual(ok, { ok: true, value: { email: "someone@example.com", role: "moderator", reason: "Helping with reviews" } });
  assert.match(errorOf(parseRoleGrant({ email: "a@b.co", role: "super_admin" })) ?? "", /SQL Editor/);
  assert.match(errorOf(parseRoleGrant({ email: "a@b.co", role: "owner" })) ?? "", /Admin or Moderator/);
  assert.equal(errorOf(parseRoleGrant({ email: "nobody", role: "admin" })), "Enter the account's email address.");
  assert.equal(parseRoleChange({ role: "super_admin" }).ok, false);
  assert.equal(parseRoleChange({ role: "admin" }).ok, true);
});

test("a suspension needs a reason and a known length, and becomes Supabase's ban duration", () => {
  assert.equal(errorOf(parseSuspension({ reason: "spam" })), "Give a reason of at least 5 characters.");
  assert.equal(errorOf(parseSuspension({ reason: "Repeated spam", length: "forever" })), "Choose how long the suspension lasts.");
  const week = parseSuspension({ reason: "Repeated spam", length: "7" });
  assert.ok(week.ok);
  if (!week.ok) return;
  assert.equal(week.value.banDuration, "168h");
  const days = (Date.parse(week.value.until) - Date.now()) / 86_400_000;
  assert.ok(days > 6.99 && days < 7.01);
  const indefinite = parseSuspension({ reason: "Repeated spam" });
  assert.ok(indefinite.ok && /^\d+h$/.test(indefinite.value.banDuration));
});

test("audit filters accept action groups and ids only", () => {
  const q = parseAuditQuery(new URLSearchParams("action=role.&limit=500&before=120"));
  assert.ok(q.ok);
  if (!q.ok) return;
  assert.equal(q.value.filters.action, "role.");
  assert.equal(q.value.limit, 200);
  assert.equal(q.value.before, 120);
  assert.equal(parseAuditQuery(new URLSearchParams("action=role.%25")).ok, false);
  assert.equal(parseAuditQuery(new URLSearchParams("actorId=1 or 1=1")).ok, false);
  assert.equal(parseAuditQuery(new URLSearchParams("targetType=user;drop")).ok, false);
  const loose = parseAuditQuery(new URLSearchParams("before=abc"));
  assert.ok(loose.ok && loose.value.before === null);
});

test("a review's fields are typed and capped before the database sees them", () => {
  assert.equal(errorOf(parseReviewFields({ rating: 0 })), "Choose a rating from 1 to 5 stars.");
  assert.equal(errorOf(parseReviewFields({ rating: 4.5 })), "Choose a rating from 1 to 5 stars.");
  assert.equal(errorOf(parseReviewFields({ rating: "5" })), "Choose a rating from 1 to 5 stars.");
  const r = parseReviewFields({
    rating: 2,
    body: "x".repeat(5000),
    features: ["journal", 7, { evil: true }, "mocks"],
    feedbackConsent: "yes",
    publicConsent: true,
    status: "published",
    userId: "someone-else",
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.rating, 2, "a low rating is accepted like any other");
  assert.equal((r.value.body as string).length, 1501, "long text is cut just past the limit, so the database refuses it");
  assert.deepEqual(r.value.features, ["journal", "mocks"]);
  assert.equal(r.value.feedbackConsent, false, "consent is only ever an explicit true");
  assert.equal(r.value.publicConsent, true);
  assert.ok(!("status" in r.value) && !("userId" in r.value), "a review can't set its own status or owner");
});

const b64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString("base64");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const feedback = (extra: Record<string, unknown> = {}) => ({ category: "bug", message: "The Save button on Mocks does nothing.", ...extra });

test("feedback needs a known category and a real message", () => {
  assert.equal(errorOf(parseFeedbackSubmission(feedback({ category: "problem" }))), "Choose what the message is about.");
  assert.match(errorOf(parseFeedbackSubmission(feedback({ message: "short" }))) ?? "", /at least 10 characters/);
  // No email goes with a message any more, whatever an old tab asks for: the team answers in the app.
  const ok = parseFeedbackSubmission(feedback({ shareEmail: true }));
  assert.ok(ok.ok && !("shareEmail" in ok.value) && ok.value.screenshot === null);
});

test("technical details are kept only when the person switched them on, and only the known ones", () => {
  const context = { userAgent: "Mozilla/5.0", screen: "390×844", installed: true, cookies: "secret" };
  const off = parseFeedbackSubmission(feedback({ context }));
  assert.ok(off.ok && Object.keys(off.value.context).length === 0);
  const on = parseFeedbackSubmission(feedback({ includeDetails: true, context }));
  assert.ok(on.ok);
  if (on.ok) assert.deepEqual(on.value.context, { userAgent: "Mozilla/5.0", screen: "390×844", installed: true });
});

test("a screenshot must be the image it claims to be, and at most 2 MB", () => {
  const png = parseFeedbackSubmission(feedback({ screenshot: { type: "image/png", data: b64(PNG) } }));
  assert.ok(png.ok && png.value.screenshot?.type === "image/png");
  const script = parseFeedbackSubmission(feedback({ screenshot: { type: "image/png", data: Buffer.from("<script>alert(1)</script>").toString("base64") } }));
  assert.equal(errorOf(script), "That file isn't the image it says it is.");
  const svg = parseFeedbackSubmission(feedback({ screenshot: { type: "image/svg+xml", data: b64(PNG) } }));
  assert.equal(errorOf(svg), "Attach a PNG, JPEG or WebP image.");
  const huge = parseFeedbackSubmission(feedback({ screenshot: { type: "image/png", data: "A".repeat(3_000_000) } }));
  assert.equal(errorOf(huge), "The screenshot is over 2 MB.");
});

test("changelog addresses and images are safe to put in a page", () => {
  assert.equal(slugify("Habits now count Roadmap work!"), "habits-now-count-roadmap-work");
  assert.equal(slugify("  --Ünïcode & Spaces--  "), "n-code-spaces");
  const long = slugify(`${"a".repeat(79)} b`);
  assert.ok(long.length <= 80 && !long.endsWith("-"));
  assert.equal(isSafeImageUrl("https://images.example.com/update.png"), true);
  assert.equal(isSafeImageUrl("/media/hero-poster.jpg"), true);
  for (const bad of ["//evil.example/x.png", "http://example.com/x.png", "javascript:alert(1)", 'https://x.example/a"onerror="x', "data:image/png;base64,AAAA"]) {
    assert.equal(isSafeImageUrl(bad), false, bad);
  }
  const noAlt = parseChangelog({ title: "Faster sync", summary: "Sync now takes half the time.", category: "performance", imageUrl: "/media/x.png" });
  assert.equal(errorOf(noAlt), "Describe the image for people who can't see it.");
  assert.equal(errorOf(parseChangelog({ title: "Faster sync", summary: "Sync now takes half the time.", category: "pricing" })), "Choose a category.");
  assert.equal(errorOf(parseChangelog({ title: "Faster sync", summary: "Sync now takes half the time.", category: "performance", featureKey: "premium" })), "Unknown feature.");
  const ok = parseChangelog({ title: "Faster sync", summary: "Sync now takes half the time.", category: "performance" });
  assert.ok(ok.ok && ok.value.slug === "faster-sync" && ok.value.publishedAt === null);
});

test("ids are UUIDs", () => {
  assert.equal(isUuid("0d000000-0000-4000-8000-000000000004"), true);
  assert.equal(isUuid("0d000000-0000-4000-8000-00000000000"), false);
  assert.equal(isUuid("' or 1=1 --"), false);
});
