/* ════════════════════════════════════════════════════════════════
   CHECKING WHAT ARRIVES AT THE ADMIN API
   Every body and query is parsed here before anything reaches the
   database, so a bad request gets a plain 400 and only known fields go
   on. The database checks the same rules again; this is the first fence.
   Pure, so the tests can run it directly.
   ════════════════════════════════════════════════════════════════ */

import { cleanText } from "@/lib/report";
import { isGrantableRole, type GrantableRole } from "./roles";
import {
  ANNOUNCEMENT_CATEGORY,
  CHANGELOG_CATEGORY,
  FEEDBACK_CATEGORY,
  FEEDBACK_PRIORITY,
  FEEDBACK_STATUS,
  MODERATION_CODE,
  type AnnouncementCategory,
  type ChangelogCategory,
  type ModerationCode,
} from "./content";
import { FEATURE_KEYS } from "@/lib/features";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = (error: string): Parsed<never> => ({ ok: false, error });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type Body = Record<string, unknown>;
export function asBody(input: unknown): Body | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Body) : null;
}

/** A trimmed string of at most `max`, or null when empty. Control characters removed. */
function text(v: unknown, max: number): string | null {
  const t = cleanText(v, max + 1);
  return t ? t : null;
}

/** An ISO time, or null for none; undefined when it doesn't parse. */
function time(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return undefined;
  return new Date(v).toISOString();
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function parsePage(params: URLSearchParams, defaultLimit = 25): { limit: number; offset: number } {
  return { limit: int(params.get("limit"), defaultLimit, 1, 100), offset: int(params.get("offset"), 0, 0, 1_000_000) };
}

const USER_FILTERS = ["all", "suspended", "unconfirmed", "staff", "recent"] as const;
export function parseUserQuery(params: URLSearchParams): Parsed<{ search: string | null; filter: string; limit: number; offset: number }> {
  const filter = params.get("filter") ?? "all";
  if (!(USER_FILTERS as readonly string[]).includes(filter)) return bad("Unknown filter.");
  return ok({ search: text(params.get("q"), 200), filter, ...parsePage(params) });
}

/** How long a suspension lasts, as Supabase Auth's `ban_duration`. */
export const SUSPENSION_LENGTHS = [
  { id: "7", label: "7 days", hours: 24 * 7 },
  { id: "30", label: "30 days", hours: 24 * 30 },
  { id: "indefinite", label: "Until restored", hours: 24 * 365 * 100 },
] as const;

export function parseSuspension(input: unknown): Parsed<{ reason: string; banDuration: string; until: string }> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  const reason = text(b.reason, 500);
  if (!reason || reason.length < 5) return bad("Give a reason of at least 5 characters.");
  if (reason.length > 500) return bad("Keep the reason under 500 characters.");
  const length = SUSPENSION_LENGTHS.find((l) => l.id === (b.length ?? "indefinite"));
  if (!length) return bad("Choose how long the suspension lasts.");
  return ok({
    reason,
    banDuration: `${length.hours}h`,
    until: new Date(Date.now() + length.hours * 3_600_000).toISOString(),
  });
}

export function parseRestore(input: unknown): Parsed<{ reason: string | null }> {
  const b = asBody(input) ?? {};
  const reason = text(b.reason, 500);
  if (reason && reason.length > 500) return bad("Keep the reason under 500 characters.");
  return ok({ reason });
}

export const REVIEW_ACTIONS = ["publish", "approve", "reject", "hide", "restore", "feature", "unfeature"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
/** Actions that take a review off the site, and need a listed reason (and optionally a note the author sees). */
export const REASONED_ACTIONS: readonly ReviewAction[] = ["reject", "hide"];

export function parseModeration(
  input: unknown,
): Parsed<{ action: ReviewAction; reason: string | null; code: ModerationCode | null; seen: string | null }> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  if (!(REVIEW_ACTIONS as readonly unknown[]).includes(b.action)) return bad("Unknown action.");
  const action = b.action as ReviewAction;
  const reasoned = REASONED_ACTIONS.includes(action);
  const code = (MODERATION_CODE.ids as unknown[]).includes(b.code) ? (b.code as ModerationCode) : null;
  if (reasoned && !code) return bad("Choose the reason. Being critical of DoOrDie is never one.");
  const reason = text(b.reason, 500);
  if (reason && reason.length > 500) return bad("Keep the note under 500 characters.");
  const seen = time(b.seen);
  if (seen === undefined) return bad("Unreadable time.");
  return ok({ action, reason: reasoned ? reason : null, code: reasoned ? code : null, seen });
}

/** A reply shown to the author or under a review. Empty removes it. */
export function parseResponse(input: unknown, max: number): Parsed<{ response: string | null }> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  const response = text(b.response, max);
  if (response && response.length > max) return bad(`Keep it under ${max.toLocaleString("en-IN")} characters.`);
  return ok({ response });
}

export function parseNote(input: unknown): Parsed<{ body: string }> {
  const b = asBody(input);
  const body = text(b?.body, 2000);
  if (!body) return bad("Write the note.");
  if (body.length > 2000) return bad("Keep the note under 2,000 characters.");
  return ok({ body });
}

export interface FeedbackPatch {
  status?: string;
  priority?: string;
  category?: string;
  changelogEntryId?: string | null;
}
export function parseFeedbackPatch(input: unknown): Parsed<FeedbackPatch> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  const patch: FeedbackPatch = {};
  if (b.status !== undefined) {
    if (!(FEEDBACK_STATUS.ids as unknown[]).includes(b.status)) return bad("Unknown status.");
    patch.status = b.status as string;
  }
  if (b.priority !== undefined) {
    if (!(FEEDBACK_PRIORITY.ids as unknown[]).includes(b.priority)) return bad("Unknown priority.");
    patch.priority = b.priority as string;
  }
  if (b.category !== undefined) {
    if (!(FEEDBACK_CATEGORY.ids as unknown[]).includes(b.category)) return bad("Unknown category.");
    patch.category = b.category as string;
  }
  if (b.changelogEntryId !== undefined) {
    if (b.changelogEntryId !== null && !isUuid(b.changelogEntryId)) return bad("Unknown changelog entry.");
    patch.changelogEntryId = b.changelogEntryId as string | null;
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  return ok(patch);
}

export function parseFeedbackQuery(params: URLSearchParams): Parsed<{ filters: Record<string, string>; limit: number; offset: number }> {
  const status = params.get("status") ?? "open";
  if (!["open", "all", ...FEEDBACK_STATUS.ids].includes(status)) return bad("Unknown status.");
  const category = params.get("category") ?? "";
  if (category && !(FEEDBACK_CATEGORY.ids as string[]).includes(category)) return bad("Unknown category.");
  const priority = params.get("priority") ?? "";
  if (priority && !(FEEDBACK_PRIORITY.ids as string[]).includes(priority)) return bad("Unknown priority.");
  const q = text(params.get("q"), 200) ?? "";
  return ok({ filters: { status, category, priority, q }, ...parsePage(params) });
}

export const CRASH_STATUSES = ["new", "resolved", "all"] as const;
export const CRASH_ACTIONS = ["resolve", "reopen", "delete"] as const;

/** The crash list: new, resolved or all, a page at a time. */
export function parseCrashQuery(params: URLSearchParams): Parsed<{ status: (typeof CRASH_STATUSES)[number]; limit: number; offset: number }> {
  const status = params.get("status") ?? "new";
  if (!(CRASH_STATUSES as readonly string[]).includes(status)) return bad("Unknown status.");
  return ok({ status: status as (typeof CRASH_STATUSES)[number], ...parsePage(params) });
}

export function parseCrashAction(input: unknown): Parsed<{ action: (typeof CRASH_ACTIONS)[number] }> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  if (!(CRASH_ACTIONS as readonly unknown[]).includes(b.action)) return bad("Unknown action.");
  return ok({ action: b.action as (typeof CRASH_ACTIONS)[number] });
}

export interface AnnouncementFields {
  title: string;
  body: string;
  category: AnnouncementCategory;
  endsAt: string | null;
}
export function parseAnnouncement(input: unknown): Parsed<AnnouncementFields> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  const title = text(b.title, 120);
  if (!title || title.length < 3 || title.length > 120) return bad("Give it a title of 3 to 120 characters.");
  const body = text(b.body, 4000);
  if (!body || body.length > 4000) return bad("Write the announcement, up to 4,000 characters.");
  const category = (b.category ?? "general") as AnnouncementCategory;
  if (!ANNOUNCEMENT_CATEGORY.ids.includes(category)) return bad("Unknown category.");
  const endsAt = time(b.endsAt);
  if (endsAt === undefined) return bad("Unreadable end date.");
  return ok({ title, body, category, endsAt });
}

const ANNOUNCEMENT_ACTIONS = ["publish", "unpublish", "archive", "restore"] as const;
export function parseAnnouncementAction(input: unknown): Parsed<{ action: (typeof ANNOUNCEMENT_ACTIONS)[number]; startsAt: string | null; endsAt: string | null }> {
  const b = asBody(input);
  if (!b || !(ANNOUNCEMENT_ACTIONS as readonly unknown[]).includes(b.action)) return bad("Unknown action.");
  const startsAt = time(b.startsAt);
  const endsAt = time(b.endsAt);
  if (startsAt === undefined || endsAt === undefined) return bad("Unreadable date.");
  if (startsAt && endsAt && endsAt <= startsAt) return bad("The end has to come after the start.");
  return ok({ action: b.action as (typeof ANNOUNCEMENT_ACTIONS)[number], startsAt, endsAt });
}

export interface ChangelogFields {
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: ChangelogCategory;
  featureKey: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  whatChanged: string | null;
  whyItMatters: string | null;
  /** The feedback theme in the team's words; public only while real feedback is linked. */
  askedTheme: string | null;
}

export const slugify = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");

/** An https address, or a path on this site. Never "//host", "javascript:" or anything with quotes or spaces. */
export const isSafeImageUrl = (v: string) => /^(https:\/\/[^\s"'<>]+|\/[^/\s"'<>][^\s"'<>]*)$/.test(v) && v.length <= 500;

export function parseChangelog(input: unknown): Parsed<ChangelogFields> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  const title = text(b.title, 120);
  if (!title || title.length < 3 || title.length > 120) return bad("Give it a title of 3 to 120 characters.");
  const slug = slugify(typeof b.slug === "string" && b.slug.trim() ? b.slug : title);
  if (!slug) return bad("The address needs letters or numbers.");
  const summary = text(b.summary, 300);
  if (!summary || summary.length < 10 || summary.length > 300) return bad("Write a summary of 10 to 300 characters.");
  const body = text(b.body, 8000) ?? "";
  if (body.length > 8000) return bad("Keep the details under 8,000 characters.");
  const category = b.category as ChangelogCategory;
  if (!CHANGELOG_CATEGORY.ids.includes(category)) return bad("Choose a category.");
  const featureKey = b.featureKey ? String(b.featureKey) : null;
  if (featureKey && !(FEATURE_KEYS as string[]).includes(featureKey)) return bad("Unknown feature.");
  const imageUrl = text(b.imageUrl, 500);
  if (imageUrl && !isSafeImageUrl(imageUrl)) return bad("Use an https:// image address or a path on this site.");
  const imageAlt = text(b.imageAlt, 200);
  if (imageUrl && !imageAlt) return bad("Describe the image for people who can't see it.");
  const seoTitle = text(b.seoTitle, 70);
  if (seoTitle && seoTitle.length > 70) return bad("Keep the search title under 70 characters.");
  const seoDescription = text(b.seoDescription, 170);
  if (seoDescription && seoDescription.length > 170) return bad("Keep the search description under 170 characters.");
  const publishedAt = time(b.publishedAt);
  if (publishedAt === undefined) return bad("Unreadable date.");
  const whatChanged = text(b.whatChanged, 2000);
  if (whatChanged && whatChanged.length > 2000) return bad("Keep \"What changed\" under 2,000 characters.");
  const whyItMatters = text(b.whyItMatters, 1000);
  if (whyItMatters && whyItMatters.length > 1000) return bad("Keep \"Why it matters\" under 1,000 characters.");
  const askedTheme = text(b.askedTheme, 200);
  if (askedTheme && (askedTheme.length < 5 || askedTheme.length > 200)) return bad("Write the feedback theme in 5 to 200 characters.");
  return ok({
    title,
    slug,
    summary,
    body,
    category,
    featureKey,
    imageUrl,
    imageAlt: imageUrl ? imageAlt : null,
    seoTitle,
    seoDescription,
    publishedAt,
    whatChanged,
    whyItMatters,
    askedTheme,
  });
}

export function parseChangelogAction(input: unknown): Parsed<{ action: "publish" | "unpublish"; publishedAt: string | null }> {
  const b = asBody(input);
  if (!b || (b.action !== "publish" && b.action !== "unpublish")) return bad("Unknown action.");
  const publishedAt = time(b.publishedAt);
  if (publishedAt === undefined) return bad("Unreadable date.");
  return ok({ action: b.action, publishedAt });
}

export function parseRoleGrant(input: unknown): Parsed<{ email: string; role: GrantableRole; reason: string | null }> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  const email = text(b.email, 200)?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Enter the account's email address.");
  if (!isGrantableRole(b.role)) return bad("Only Admin or Moderator can be granted here. Super Admin is added in the Supabase SQL Editor.");
  const reason = text(b.reason, 500);
  if (reason && reason.length > 500) return bad("Keep the reason under 500 characters.");
  return ok({ email, role: b.role, reason });
}

export function parseRoleChange(input: unknown): Parsed<{ role: GrantableRole; reason: string | null }> {
  const b = asBody(input);
  if (!b || !isGrantableRole(b.role)) return bad("Only Admin or Moderator can be granted here.");
  const reason = text(b.reason, 500);
  return ok({ role: b.role, reason });
}

export function parseAuditQuery(params: URLSearchParams): Parsed<{ filters: Record<string, string>; limit: number; before: number | null }> {
  const action = params.get("action") ?? "";
  if (action && !/^[a-z_]+\.?[a-z_]*$/.test(action)) return bad("Unknown action.");
  const targetType = params.get("targetType") ?? "";
  if (targetType && !/^[a-z_]+$/.test(targetType)) return bad("Unknown target.");
  const targetId = text(params.get("targetId"), 100) ?? "";
  const actorId = params.get("actorId") ?? "";
  if (actorId && !isUuid(actorId)) return bad("Unknown actor.");
  const before = params.get("before");
  return ok({
    filters: { action, targetType, targetId, actorId },
    limit: int(params.get("limit"), 50, 1, 200),
    before: before && /^\d+$/.test(before) ? Number(before) : null,
  });
}

/* ── Platform settings ─────────────────────────────────────────── */

export type SettingDef =
  | { kind: "boolean"; label: string; help: string }
  | { kind: "integer"; label: string; help: string; min: number; max: number; unit: string }
  | { kind: "email"; label: string; help: string }
  | { kind: "choice"; label: string; help: string; options: { id: string; label: string }[] }
  | { kind: "notice"; label: string; help: string };

export const SETTINGS = {
  reviews_open: { kind: "boolean", label: "Accept new reviews", help: "When off, nobody can send a new review. Existing reviews can still be edited or withdrawn." },
  review_min_days: { kind: "integer", label: "Days since first use", help: "A review can be sent once this many days have passed since the account's first record.", min: 0, max: 365, unit: "days" },
  review_min_usage_days: { kind: "integer", label: "Days with records", help: "And once the account has records on at least this many different days.", min: 1, max: 365, unit: "days" },
  review_invite_enabled: {
    kind: "boolean",
    label: "Invite eligible students",
    help: "A quiet card on the dashboard only, for everyone who qualifies, with Later and No thanks. It stops after No thanks or the third Later.",
  },
  review_edit_policy: {
    kind: "choice",
    label: "When a published review is edited",
    help: "Edits always go back to a moderator. This decides what the website shows meanwhile.",
    options: [
      { id: "keep_previous", label: "Keep the approved version up" },
      { id: "remove_until_approved", label: "Take it down until approved" },
    ],
  },
  review_aggregate_min: {
    kind: "integer",
    label: "Reviews before an average",
    help: "The average rating and the breakdowns appear on the website only once this many reviews are published.",
    min: 1,
    max: 50,
    unit: "reviews",
  },
  review_story_min_chars: {
    kind: "integer",
    label: "Length of a story",
    help: "Reviews with at least this many characters of answers get a page of their own; shorter ones don't, so there are no thin pages.",
    min: 200,
    max: 3000,
    unit: "characters",
  },
  verified_active_usage_days: {
    kind: "integer",
    label: "Days for \"Verified active user\"",
    help: "The badge needs records on at least this many different days.",
    min: 1,
    max: 365,
    unit: "days",
  },
  established_member_days: {
    kind: "integer",
    label: "Days for \"Established member\"",
    help: "The badge needs an account at least this old, and the author's choice to show it.",
    min: 30,
    max: 1095,
    unit: "days",
  },
  moderators_hide_reviews: { kind: "boolean", label: "Moderators can hide reviews", help: "Lets Moderators take a published review down, and restore a hidden one." },
  admins_read_audit: { kind: "boolean", label: "Admins can read the audit log", help: "Lets Admins open the audit log. Super Admins always can." },
  testimonials_on_home: { kind: "boolean", label: "Reviews on the home page", help: "Show the newest published reviews on the home page." },
  testimonials_home_count: { kind: "integer", label: "How many on the home page", help: "The newest published reviews, never picked by rating.", min: 1, max: 6, unit: "reviews" },
  testimonials_on_feature_pages: { kind: "boolean", label: "Reviews on feature pages", help: "Show a few published reviews on the five feature pages." },
  moderators_handle_feedback: { kind: "boolean", label: "Moderators can handle feedback", help: "Lets Moderators open the Feedback Center as well as reviews." },
  support_email: { kind: "email", label: "Support email", help: "Shown on the contact page. Leave empty to use the address set in the deployment, if any." },
  announcement_default_days: { kind: "integer", label: "Announcements last", help: "The end date offered when publishing an announcement.", min: 1, max: 90, unit: "days" },
  announcement_default_category: {
    kind: "choice",
    label: "Default announcement category",
    help: "Picked first when writing a new announcement.",
    options: ANNOUNCEMENT_CATEGORY.ids.map((id) => ({ id, label: ANNOUNCEMENT_CATEGORY.label[id] })),
  },
  app_notice: { kind: "notice", label: "Notice in the app", help: "A line shown at the top of every page of the app while it's on: planned maintenance, say." },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS;

export function settingProblem(key: string, value: unknown): string | null {
  const def = (SETTINGS as Record<string, SettingDef>)[key];
  if (!def) return "Unknown setting.";
  switch (def.kind) {
    case "boolean":
      return typeof value === "boolean" ? null : "Expected on or off.";
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) return "Expected a whole number.";
      return value < def.min || value > def.max ? `Between ${def.min} and ${def.max} ${def.unit}.` : null;
    case "email":
      if (typeof value !== "string") return "Expected an email address.";
      return value === "" || (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 200) ? null : "That isn't an email address.";
    case "choice":
      return def.options.some((o) => o.id === value) ? null : "Unknown option.";
    case "notice": {
      const n = asBody(value);
      if (!n || typeof n.enabled !== "boolean" || typeof n.message !== "string" || (n.tone !== "info" && n.tone !== "warning")) {
        return "Expected a notice with on or off, a message and a tone.";
      }
      if (Object.keys(n).some((k) => !["enabled", "message", "tone"].includes(k))) return "Unknown notice field.";
      if (n.message.length > 240) return "Keep the notice under 240 characters.";
      if (n.enabled && n.message.trim().length < 3) return "Write the notice before switching it on.";
      return null;
    }
  }
}

export function parseSettings(input: unknown): Parsed<Record<string, unknown>> {
  const b = asBody(input);
  if (!b || !Object.keys(b).length) return bad("Nothing to save.");
  for (const [key, value] of Object.entries(b)) {
    const problem = settingProblem(key, value);
    if (problem) return bad(`${(SETTINGS as Record<string, SettingDef>)[key]?.label ?? key}: ${problem}`);
  }
  return ok(b);
}

/* ── What students send ────────────────────────────────────────── */

/** A review's fields, typed and capped. The database checks the rules (lengths, eligibility, consent) again. */
export function parseReviewFields(input: unknown): Parsed<Record<string, unknown>> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  if (typeof b.rating !== "number" || !Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5) return bad("Choose a rating from 1 to 5 stars.");
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max + 1) : null);
  const features = Array.isArray(b.features) ? b.features.filter((f): f is string => typeof f === "string").slice(0, 20) : [];
  const choice = (v: unknown, allowed: readonly string[]) => (typeof v === "string" && allowed.includes(v) ? v : null);
  return ok({
    rating: b.rating,
    headline: str(b.headline, 80),
    body: str(b.body, 1500),
    useful: str(b.useful, 600),
    suggestions: str(b.suggestions, 1000),
    problemBefore: str(b.problemBefore, 600),
    changeNote: str(b.changeNote, 800),
    features,
    stage: typeof b.stage === "string" && b.stage ? b.stage : null,
    aspirantType: choice(b.aspirantType, ["full_time", "working"]),
    displayName: str(b.displayName, 40),
    displayPreference: choice(b.displayPreference, ["name", "initials", "anonymous"]) ?? "name",
    showTenure: b.showTenure === true,
    feedbackConsent: b.feedbackConsent === true,
    publicConsent: b.publicConsent === true,
    consentVersion: str(b.consentVersion, 20),
    source: b.source === "invitation" ? "invitation" : "settings",
  });
}

export interface FeedbackSubmission {
  category: string;
  message: string;
  context: Record<string, unknown>;
  screenshot: { type: "image/webp" | "image/png" | "image/jpeg"; bytes: Uint8Array } | null;
}

export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SCREENSHOT_TYPES = ["image/webp", "image/png", "image/jpeg"] as const;

/**
 * Feedback from Help & feedback, with an optional screenshot as base64.
 * No email: anything about one in the body (from a tab opened before it was
 * removed) is ignored, and the team answers in the app.
 */
export function parseFeedbackSubmission(input: unknown): Parsed<FeedbackSubmission> {
  const b = asBody(input);
  if (!b) return bad("Expected JSON.");
  if (!(FEEDBACK_CATEGORY.ids as unknown[]).includes(b.category)) return bad("Choose what the message is about.");
  const message = cleanText(b.message, 4001);
  if (message.length < 10) return bad("Write at least 10 characters, so there's something to go on.");
  if (message.length > 4000) return bad("Keep it under 4,000 characters.");
  const ctx = b.includeDetails === true ? asBody(b.context) ?? {} : {};
  const context = {
    ...(typeof ctx.userAgent === "string" ? { userAgent: ctx.userAgent.slice(0, 400) } : {}),
    ...(typeof ctx.screen === "string" && /^\d{2,5}×\d{2,5}$/.test(ctx.screen) ? { screen: ctx.screen } : {}),
    ...(typeof ctx.installed === "boolean" ? { installed: ctx.installed } : {}),
  };
  let screenshot: FeedbackSubmission["screenshot"] = null;
  const shot = asBody(b.screenshot);
  if (shot) {
    if (!(SCREENSHOT_TYPES as readonly unknown[]).includes(shot.type) || typeof shot.data !== "string") {
      return bad("Attach a PNG, JPEG or WebP image.");
    }
    if (shot.data.length > Math.ceil((SCREENSHOT_MAX_BYTES * 4) / 3) + 4) return bad("The screenshot is over 2 MB.");
    const bytes = Uint8Array.from(Buffer.from(shot.data, "base64"));
    if (!bytes.length || bytes.length > SCREENSHOT_MAX_BYTES) return bad("The screenshot is over 2 MB.");
    if (!looksLikeImage(bytes, shot.type as (typeof SCREENSHOT_TYPES)[number])) return bad("That file isn't the image it says it is.");
    screenshot = { type: shot.type as (typeof SCREENSHOT_TYPES)[number], bytes };
  }
  return ok({ category: b.category as string, message, context, screenshot });
}

/** Checks the file's first bytes, so a script can't be stored as a picture. */
function looksLikeImage(bytes: Uint8Array, type: (typeof SCREENSHOT_TYPES)[number]): boolean {
  const at = (i: number, values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (type === "image/png") return at(0, [0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/jpeg") return at(0, [0xff, 0xd8, 0xff]);
  return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
}
