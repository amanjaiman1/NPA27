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

export const REVIEW_LIMITS = { body: [30, 1500], headline: [3, 80], useful: 600, suggestions: 1000, name: [2, 40] } as const;

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
  "review.response_set": "Public response added",
  "review.response_removed": "Public response removed",
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
