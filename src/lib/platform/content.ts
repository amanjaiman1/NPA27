/* ════════════════════════════════════════════════════════════════
   ADMIN CENTER VOCABULARY
   The fixed lists the database accepts (reviews, feedback,
   announcements, changelog, settings), with the words the app shows for
   them. Kept in step with the CHECK constraints and functions in
   supabase/migrations/20261204120000_platform_admin.sql.
   ════════════════════════════════════════════════════════════════ */

import { FEATURES, type FeatureKey } from "@/lib/features";

const labelled = <T extends string>(entries: readonly (readonly [T, string])[]) => ({
  ids: entries.map(([id]) => id) as T[],
  label: Object.fromEntries(entries) as Record<T, string>,
});

export const REVIEW_STATUS = labelled([
  ["pending", "Waiting for a moderator"],
  ["published", "On the website"],
  ["approved", "Approved, not public"],
  ["rejected", "Not published"],
  ["hidden", "Taken off the website"],
  ["withdrawn", "Withdrawn by the author"],
] as const);
export type ReviewStatus = (typeof REVIEW_STATUS.ids)[number];

export const REVIEW_STAGE = labelled([
  ["foundation", "Building foundations"],
  ["prelims", "Preparing for Prelims"],
  ["mains", "Preparing for Mains"],
  ["interview", "Interview stage"],
  ["working", "Preparing while working"],
  ["repeat", "Repeat attempt"],
] as const);
export type ReviewStage = (typeof REVIEW_STAGE.ids)[number];

/** The features a review can say it used. The same list the database accepts. */
export const REVIEW_FEATURES: FeatureKey[] = [
  "dashboard",
  "journal",
  "subjects",
  "revision",
  "mocks",
  "mistakes",
  "goals",
  "roadmap",
  "habits",
  "life",
  "performanceReview",
  "diary",
  "coach",
  "currentAffairs",
  "library",
  "heatmap",
  "knowledgeGraph",
];
export const featureLabel = (key: string): string => (FEATURES as Record<string, { label: string }>)[key]?.label ?? key;

/** `body` (what they'd tell another aspirant) is optional, but a public testimonial needs `body[0]` characters. */
export const REVIEW_LIMITS = {
  body: [30, 1500],
  headline: [3, 80],
  useful: 600,
  suggestions: 1000,
  problemBefore: 600,
  changeNote: 800,
  name: [2, 40],
} as const;

/** The name shown with a public review. The same rule as platform_review_public_name in SQL. */
export function publicReviewName(name: string, preference: DisplayPreference): string {
  if (preference === "anonymous") return "A DoOrDie aspirant";
  if (preference === "initials") {
    const initials = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w[0].toUpperCase()}.`)
      .join(" ");
    return initials || "A DoOrDie aspirant";
  }
  return name.trim();
}

/** The 1–5 scale, in words. Nothing is preselected. */
export const RATING_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Poor",
  2: "Below expectations",
  3: "Average",
  4: "Good",
  5: "Excellent",
};

export const ASPIRANT_TYPE = labelled([
  ["full_time", "Preparing full time"],
  ["working", "Preparing while working"],
] as const);
export type AspirantType = (typeof ASPIRANT_TYPE.ids)[number];

export const DISPLAY_PREFERENCE = labelled([
  ["name", "The name I give"],
  ["initials", "My initials only"],
  ["anonymous", "No name"],
] as const);
export type DisplayPreference = (typeof DISPLAY_PREFERENCE.ids)[number];

/**
 * The version of the consent wording a student agreed to. Change it whenever
 * the words in the review form's last step change; each grant and withdrawal
 * records the version it was given under.
 */
export const REVIEW_CONSENT_VERSION = "2026-11-19";

/** Why a moderator rejects or hides a review. Being critical is not among them. */
export const MODERATION_CODE = labelled([
  ["spam", "Spam or advertising"],
  ["abuse", "Abusive or hateful"],
  ["personal_info", "Personal details of someone"],
  ["impersonation", "Impersonating someone"],
  ["fraud", "Fraudulent or not a real experience"],
  ["unrelated", "Not about DoOrDie"],
  ["illegal", "Illegal content"],
  ["policy", "Another policy breach"],
] as const);
export type ModerationCode = (typeof MODERATION_CODE.ids)[number];

/** What each badge on a public review means. The public page shows these words. */
export const BADGE_MEANING = {
  verifiedUser: {
    label: "Verified DoOrDie user",
    meaning: "Sent from a signed-in DoOrDie account that met the rule for reviewing: enough days since its first record, and records on enough different days.",
  },
  activeUser: {
    label: "Verified active user",
    meaning: "The account has study or life records on many different days, more than the minimum for reviewing.",
  },
  features: {
    label: "Verified feature use",
    meaning: "The account has records in the features marked. Features that leave no dated records, such as the diary or the Study Coach, aren't verified.",
  },
  established: {
    label: "Established member",
    meaning: "The account has existed for a few months, and its owner chose to show that.",
  },
} as const;

export const FEEDBACK_CATEGORY = labelled([
  ["bug", "Bug report"],
  ["feature", "Feature request"],
  ["suggestion", "Suggestion"],
  ["usability", "Hard to use"],
  ["general", "General feedback"],
] as const);
export type FeedbackCategory = (typeof FEEDBACK_CATEGORY.ids)[number];

export const FEEDBACK_STATUS = labelled([
  ["new", "New"],
  ["under_review", "Under review"],
  ["planned", "Planned"],
  ["in_progress", "In progress"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const);
export type FeedbackStatus = (typeof FEEDBACK_STATUS.ids)[number];

export const FEEDBACK_PRIORITY = labelled([
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const);
export type FeedbackPriority = (typeof FEEDBACK_PRIORITY.ids)[number];

export const ANNOUNCEMENT_CATEGORY = labelled([
  ["product_update", "Product update"],
  ["new_feature", "New feature"],
  ["maintenance", "Maintenance"],
  ["important", "Important notice"],
  ["general", "General"],
] as const);
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORY.ids)[number];

export const ANNOUNCEMENT_STATE = labelled([
  ["draft", "Draft"],
  ["scheduled", "Scheduled"],
  ["live", "Live"],
  ["ended", "Ended"],
  ["archived", "Archived"],
] as const);
export type AnnouncementState = (typeof ANNOUNCEMENT_STATE.ids)[number];

export const CHANGELOG_CATEGORY = labelled([
  ["new_feature", "New feature"],
  ["improvement", "Improvement"],
  ["bug_fix", "Bug fix"],
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["security", "Security"],
] as const);
export type ChangelogCategory = (typeof CHANGELOG_CATEGORY.ids)[number];

/** Words for audit log actions. Anything unlisted shows as its id. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "role.granted": "Role granted",
  "role.changed": "Role changed",
  "role.revoked": "Role removed",
  "user.suspended": "Account suspended",
  "user.restored": "Account restored",
  "review.published": "Review published",
  "review.approved": "Review approved privately",
  "review.rejected": "Review rejected",
  "review.hidden": "Review taken off the website",
  "review.restored": "Hidden review restored",
  "review.featured": "Review featured",
  "review.unfeatured": "Review no longer featured",
  "review.response_set": "Public response added",
  "review.response_removed": "Public response removed",
  "crash.resolved": "Crash report resolved",
  "crash.reopened": "Crash report reopened",
  "crash.deleted": "Crash report deleted",
  "feedback.updated": "Feedback updated",
  "feedback.note_added": "Private note added",
  "feedback.responded": "Response sent",
  "feedback.response_removed": "Response removed",
  "announcement.created": "Announcement drafted",
  "announcement.updated": "Announcement edited",
  "announcement.published": "Announcement published",
  "announcement.scheduled": "Announcement scheduled",
  "announcement.unpublished": "Announcement unpublished",
  "announcement.archived": "Announcement archived",
  "announcement.restored": "Announcement restored",
  "announcement.deleted": "Draft deleted",
  "changelog.created": "Changelog entry drafted",
  "changelog.updated": "Changelog entry edited",
  "changelog.published": "Changelog entry published",
  "changelog.scheduled": "Changelog entry scheduled",
  "changelog.unpublished": "Changelog entry unpublished",
  "changelog.deleted": "Changelog draft deleted",
  "setting.updated": "Setting changed",
};
