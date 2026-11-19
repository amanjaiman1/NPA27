import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModeration, parseReviewFields, settingProblem } from "@/lib/platform/validate";
import { MODERATION_CODE, REVIEW_CONSENT_VERSION, REVIEW_FEATURES, publicReviewName } from "@/lib/platform/content";
import { handleAdminRequest, type AdminDeps } from "@/lib/platform/server/admin-api";
import { permissionsFor, type PlatformRole } from "@/lib/platform/roles";

/* The review system's first line of defence: what moderators may do and say,
   what a student's review may carry, and the switches the settings expose.
   The database enforces the same rules again (supabase/tests/platform_trust.sql). */

const errorOf = (p: { ok: boolean; error?: string }) => (p.ok ? null : p.error);

test("taking a review down needs one of the listed reasons; being critical isn't one", () => {
  assert.deepEqual([...MODERATION_CODE.ids], ["spam", "abuse", "personal_info", "impersonation", "fraud", "unrelated", "illegal", "policy"]);
  for (const action of ["reject", "hide"]) {
    assert.match(errorOf(parseModeration({ action })) ?? "", /Choose the reason/);
    assert.match(errorOf(parseModeration({ action, code: "negative" })) ?? "", /never one/);
    assert.match(errorOf(parseModeration({ action, code: "low_rating" })) ?? "", /Choose the reason/);
    const ok = parseModeration({ action, code: "spam", reason: "Links to a coaching site" });
    assert.ok(ok.ok);
    if (ok.ok) assert.deepEqual({ code: ok.value.code, reason: ok.value.reason }, { code: "spam", reason: "Links to a coaching site" });
  }
  // A note to the author is optional; the listed reason is what's required.
  const bare = parseModeration({ action: "hide", code: "personal_info" });
  assert.ok(bare.ok && bare.value.reason === null);
  assert.match(errorOf(parseModeration({ action: "reject", code: "abuse", reason: "x".repeat(501) })) ?? "", /500/);
});

test("publishing, approving and featuring carry no reason or code, and unknown actions are refused", () => {
  for (const action of ["publish", "approve", "restore", "feature", "unfeature"]) {
    const p = parseModeration({ action, code: "spam", reason: "ignored" });
    assert.ok(p.ok, action);
    if (p.ok) assert.deepEqual({ code: p.value.code, reason: p.value.reason }, { code: null, reason: null }, action);
  }
  assert.equal(errorOf(parseModeration({ action: "edit" })), "Unknown action.");
  assert.equal(errorOf(parseModeration({ action: "rewrite", body: "Better words" })), "Unknown action.");
  assert.equal(errorOf(parseModeration({ action: "publish", seen: "yesterday" })), "Unreadable time.");
});

test("a review carries the five steps' answers, typed, and never more", () => {
  const r = parseReviewFields({
    rating: 3,
    problemBefore: "Hours in one notebook, mocks in another.",
    changeNote: "x".repeat(900),
    features: ["dashboard", "journal", "roadmap"],
    stage: "prelims",
    aspirantType: "working",
    displayPreference: "initials",
    displayName: "Priya Sharma",
    showTenure: "true",
    feedbackConsent: true,
    publicConsent: false,
    consentVersion: `${REVIEW_CONSENT_VERSION}-and-a-very-long-tail`,
    source: "email",
    badges: { activeUser: true },
    usage: { usageDays: 999 },
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.problemBefore, "Hours in one notebook, mocks in another.");
  assert.equal((r.value.changeNote as string).length, 801, "cut just past the limit, so the database refuses it");
  assert.deepEqual(r.value.features, ["dashboard", "journal", "roadmap"]);
  assert.equal(r.value.aspirantType, "working");
  assert.equal(r.value.displayPreference, "initials");
  assert.equal(r.value.showTenure, false, "only an explicit true");
  assert.equal(r.value.publicConsent, false, "public is never assumed");
  assert.equal((r.value.consentVersion as string).length, 21);
  assert.equal(r.value.source, "settings", "an unknown source is the settings page");
  assert.ok(!("badges" in r.value) && !("usage" in r.value), "badges and usage are the database's to work out");

  const defaults = parseReviewFields({ rating: 5, aspirantType: "student", displayPreference: "nickname", source: "invitation" });
  assert.ok(defaults.ok);
  if (defaults.ok) {
    assert.equal(defaults.value.aspirantType, null);
    assert.equal(defaults.value.displayPreference, "name");
    assert.equal(defaults.value.source, "invitation");
    assert.equal(defaults.value.body, null, "a review can be private feedback with no advice text");
  }
});

test("the features a review can name include the dashboard and nothing that doesn't exist", () => {
  assert.ok(REVIEW_FEATURES.includes("dashboard"));
  for (const f of ["settings", "announcements"]) assert.ok(!REVIEW_FEATURES.includes(f as never), f);
  assert.equal(new Set(REVIEW_FEATURES).size, REVIEW_FEATURES.length);
});

test("the name shown with a review is the author's choice: name, initials or none", () => {
  assert.equal(publicReviewName("  Priya  ", "name"), "Priya");
  assert.equal(publicReviewName("priya sharma", "initials"), "P. S.");
  assert.equal(publicReviewName("   ", "initials"), "A DoOrDie aspirant");
  assert.equal(publicReviewName("Priya Sharma", "anonymous"), "A DoOrDie aspirant");
});

test("the new settings are typed and bounded", () => {
  assert.equal(settingProblem("review_edit_policy", "keep_previous"), null);
  assert.equal(settingProblem("review_edit_policy", "remove_until_approved"), null);
  assert.equal(settingProblem("review_edit_policy", "publish_at_once"), "Unknown option.");
  assert.equal(settingProblem("review_invite_enabled", false), null);
  assert.equal(settingProblem("moderators_hide_reviews", "yes"), "Expected on or off.");
  assert.equal(settingProblem("admins_read_audit", true), null);
  assert.equal(settingProblem("review_aggregate_min", 5), null);
  assert.match(settingProblem("review_aggregate_min", 0) ?? "", /Between 1 and 50/);
  assert.match(settingProblem("review_story_min_chars", 50) ?? "", /Between 200 and 3000/);
  assert.equal(settingProblem("verified_active_usage_days", 15), null);
  assert.match(settingProblem("established_member_days", 7) ?? "", /Between 30 and 1095/);
});

test("permission switches: moderators hide by default, admins read the audit log only when allowed", () => {
  assert.ok(permissionsFor("moderator").includes("reviews.hide"));
  assert.ok(!permissionsFor("moderator", { moderatorsHideReviews: false }).includes("reviews.hide"));
  assert.ok(!permissionsFor("admin").includes("audit.read"));
  assert.ok(permissionsFor("admin", { adminsReadAudit: true }).includes("audit.read"));
  assert.ok(!permissionsFor("moderator", { adminsReadAudit: true }).includes("audit.read"), "the switch is the admins' only");
  for (const role of ["super_admin", "admin"] as PlatformRole[]) assert.ok(permissionsFor(role).includes("reviews.hide"), role);
});

const REVIEW = "0e000000-0000-4000-8000-000000000005";
const MOD = "0c000000-0000-4000-8000-000000000003";

function moderatorDeps(canHide: boolean) {
  const rpc: { fn: string; args: Record<string, unknown> }[] = [];
  const deps: AdminDeps = {
    verify: async (token) => (token === "t-mod" ? { id: MOD, email: "mod@example.com" } : null),
    whoami: async () => ({ role: "moderator", permissions: permissionsFor("moderator", { moderatorsHideReviews: canHide }) }),
    rpc: async <T>(fn: string, args: Record<string, unknown>) => {
      rpc.push({ fn, args });
      return { fn } as T;
    },
    setBan: async () => undefined,
    signScreenshot: async () => null,
    revalidate: () => undefined,
    allowMutation: () => true,
  };
  return { deps, rpc };
}

async function moderate(deps: AdminDeps, body: unknown) {
  const path = `reviews/${REVIEW}/moderate`;
  const request = new Request(`https://doordie.example/api/admin/${path}`, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", authorization: "Bearer t-mod", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handleAdminRequest(request, path.split("/"), deps);
  return { status: res.status, body: (await res.json()) as { error?: string } };
}

test("hiding needs reviews.hide, and the listed reason reaches the database", async () => {
  const off = moderatorDeps(false);
  const refused = await moderate(off.deps, { action: "hide", code: "abuse" });
  assert.equal(refused.status, 403);
  assert.equal(off.rpc.length, 0, "nothing reaches the database");
  // Rejecting a pending review is still moderation, switch or no switch.
  const reject = await moderate(off.deps, { action: "reject", code: "spam", reason: "Advertising" });
  assert.equal(reject.status, 200);
  assert.equal(off.rpc.at(-1)?.args.p_code, "spam");

  const on = moderatorDeps(true);
  const hidden = await moderate(on.deps, { action: "hide", code: "personal_info", reason: "Phone number in the text" });
  assert.equal(hidden.status, 200);
  const call = on.rpc.find((c) => c.fn === "platform_admin_moderate_review");
  assert.ok(call);
  assert.deepEqual({ action: call?.args.p_action, code: call?.args.p_code, reason: call?.args.p_reason }, {
    action: "hide",
    code: "personal_info",
    reason: "Phone number in the text",
  });
  const noCode = await moderate(on.deps, { action: "hide" });
  assert.equal(noCode.status, 400);
});
