/* The shapes the platform functions return (supabase/migrations/20261204120000_platform_admin.sql). */

import type { PlatformRole } from "./roles";
import type {
  AnnouncementCategory,
  AnnouncementState,
  AspirantType,
  ChangelogCategory,
  DisplayPreference,
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
  ModerationCode,
  ReviewStage,
  ReviewStatus,
} from "./content";

export interface AccountBrief {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  /** The latest visit. Null if none was recorded, or if the lookup failed. */
  presence?: Presence | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  suspended: boolean;
  role: PlatformRole | null;
}

/**
 * An account's latest visit, as the database worked it out when asked
 * (supabase/migrations/20261215120000_presence.sql).
 */
export interface Presence {
  /** When it opened the app. Null for a visit recorded before visits were kept. */
  openedAt: string | null;
  /** The last moment the app was known to be on screen. */
  seenAt: string;
  /** When it left. Null while it's on the site. */
  leftAt: string | null;
  /** On the site now. */
  online: boolean;
  /** While online: when that runs out unless the app reports again, so a screen knows when to look. */
  onlineUntil: string | null;
  /** The database's time when it answered: with onlineUntil, how long from now, whatever this device's clock says. */
  checkedAt: string;
}

export interface HistoryEntry {
  id: number;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorRole: PlatformRole | null;
  actorEmail: string | null;
}

export interface Page<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

/**
 * Whether visit times came with an answer: looked up, not set up on this
 * project yet (the presence migration hasn't run), or the lookup failed.
 * Accounts load either way; this tells Refresh Data which it was.
 */
export type VisitsStatus = "ok" | "not_set_up" | "failed";

/** A page of Users. */
export interface UserPage extends Page<AccountBrief> {
  visits?: VisitsStatus;
}

export interface UserDetail extends AccountBrief {
  reviewStatus: ReviewStatus | null;
  feedbackCount: number;
  history: HistoryEntry[];
  visits?: VisitsStatus;
}

export interface ReviewUsage {
  firstUseOn: string | null;
  usageDays: number;
  daysSinceFirstUse: number;
  features: string[];
  accountCreatedOn?: string | null;
  measuredAt?: string;
}

export interface Eligibility extends ReviewUsage {
  minDays: number;
  minUsageDays: number;
  eligible: boolean;
}

/** Worked out by the database from the usage it measured. Never set by anyone. */
export interface ReviewBadges {
  verifiedUser: boolean;
  activeUser: boolean;
  /** The chosen features the account has records in. */
  features: string[];
  established: boolean;
}

/** Exactly what the website shows of a review, frozen when it was published. */
export interface PublicReviewVersion {
  rating: number;
  headline: string | null;
  body: string | null;
  useful: string | null;
  problemBefore: string | null;
  changeNote: string | null;
  features: string[];
  stage: ReviewStage | null;
  aspirantType: AspirantType | null;
  /** Already as the author chose: their name, initials, or none. */
  displayName: string;
  badges: ReviewBadges;
}

export interface AuthorReview {
  id: string;
  rating: number;
  headline: string | null;
  /** What they'd tell another aspirant. Needed, at 30+ characters, only for a public testimonial. */
  body: string | null;
  useful: string | null;
  suggestions: string | null;
  problemBefore: string | null;
  changeNote: string | null;
  features: string[];
  stage: ReviewStage | null;
  aspirantType: AspirantType | null;
  displayName: string;
  displayPreference: DisplayPreference;
  showTenure: boolean;
  publicName: string;
  feedbackConsent: boolean;
  feedbackConsentAt: string | null;
  publicConsent: boolean;
  publicConsentAt: string | null;
  consentVersion: string | null;
  status: ReviewStatus;
  usage: ReviewUsage;
  source: "settings" | "invitation";
  moderationReason: string | null;
  moderationCode: ModerationCode | null;
  moderatedAt: string | null;
  response: string | null;
  responseAt: string | null;
  publishedAt: string | null;
  submittedAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
  slug: string | null;
  featuredAt: string | null;
  /** On the website now, possibly as an earlier version while an edit waits. */
  live: boolean;
  publicVersion: PublicReviewVersion | null;
  badges: ReviewBadges;
}

export interface ConsentEvent {
  kind: "feedback_granted" | "public_granted" | "public_withdrawn" | "review_withdrawn";
  version: string | null;
  at: string;
}

export interface ReviewRevision {
  id: number;
  content: Record<string, unknown>;
  status: ReviewStatus;
  at: string;
}

export interface AdminReview extends AuthorReview {
  userId: string;
  account: { emailConfirmed: boolean; createdAt: string } | null;
  history?: HistoryEntry[];
  consentHistory?: ConsentEvent[];
  revisions?: ReviewRevision[];
  verification?: { minDays: number; minUsageDays: number; activeDays: number; establishedDays: number };
}

export interface ReviewList extends Page<AdminReview> {
  counts: Partial<Record<ReviewStatus | "live" | "featured", number>>;
  stats: {
    liveAverage: number | null;
    bySource: Partial<Record<"settings" | "invitation", number>>;
    weekly: Series[];
    activity: { id: number; action: string; targetId: string; createdAt: string; reason: string | null; metadata: Record<string, unknown>; actorEmail: string | null }[];
  };
}

export interface PublicReview extends PublicReviewVersion {
  slug: string;
  publishedAt: string;
  response: string | null;
  responseAt: string | null;
  featured: boolean;
  /** Long enough for a page of its own. */
  story: boolean;
}

export interface MyReview {
  review: AuthorReview | null;
  eligibility: Eligibility;
  open: boolean;
}

export interface ChangelogLink {
  id: string;
  slug: string;
  title: string;
  published: boolean;
}

export interface MyFeedback {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  response: string | null;
  responseAt: string | null;
  responseSeen: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  hasScreenshot: boolean;
  changelog: ChangelogLink | null;
}

/** What the team sees of a message. Never an email address: the team answers in the app. */
export interface AdminFeedback extends Omit<MyFeedback, "responseSeen"> {
  userId: string;
  priority: FeedbackPriority;
  context: { userAgent?: string; screen?: string; installed?: boolean };
  screenshotPath: string | null;
  noteCount: number;
}

export interface FeedbackNote {
  id: string;
  body: string;
  createdAt: string;
  authorEmail: string | null;
}

export interface FeedbackDetail extends AdminFeedback {
  notes: FeedbackNote[];
  history: HistoryEntry[];
  screenshotUrl?: string | null;
}

export interface FeedbackList extends Page<AdminFeedback> {
  counts: Partial<Record<FeedbackStatus, number>>;
}

export type CrashStatus = "new" | "resolved";

/** One distinct crash (the same error on the same page), as the Admin Center lists it. No account, ever. */
export interface AdminCrash {
  id: string;
  message: string;
  source: "render" | "root" | "window" | "promise";
  page: string;
  /** How many times it was reported. */
  reports: number;
  status: CrashStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  noteCount: number;
  signedIn: boolean | null;
  online: boolean | null;
  userAgent: string | null;
  build: string | null;
}

export interface CrashDetail extends AdminCrash {
  stack: string | null;
  componentStack: string | null;
  digest: string | null;
  /** What people wrote on the error screen when they pressed Send, oldest first. */
  notes: { at: string; text: string }[];
  resolvedByEmail: string | null;
  history: HistoryEntry[];
}

export interface CrashList extends Page<AdminCrash> {
  counts: Record<CrashStatus, number>;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: "draft" | "published" | "archived";
  state: AnnouncementState;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reads: number;
  dismissals: number;
}

export interface AnnouncementList {
  accounts: number;
  defaults: { days: number; category: AnnouncementCategory };
  items: AdminAnnouncement[];
}

export interface MyAnnouncement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface MyAnnouncements {
  notice: { message: string; tone: "info" | "warning" } | null;
  /** The team's answers to the person's feedback that they haven't opened yet. */
  unseenResponses: number;
  /** Whether to show the invitation to review: eligible, no review yet, not postponed or dismissed. */
  reviewInvite: boolean;
  items: MyAnnouncement[];
  /**
   * The next scheduled start or end of a published announcement (ISO), and
   * the database's time when it answered, so the app can reload at that
   * moment. Absent before the live-updates migration.
   */
  nextChangeAt?: string | null;
  now?: string;
}

export interface ChangelogEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: ChangelogCategory;
  featureKey: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  requests: number;
  whatChanged: string | null;
  whyItMatters: string | null;
  /** The feedback theme it answers. Public only while real feedback is linked. */
  askedTheme: string | null;
}

/** "You asked. We improved.": a shipped change and the feedback theme behind it. */
export interface YouAskedItem {
  slug: string;
  title: string;
  askedTheme: string;
  summary: string;
  featureKey: string | null;
  category: ChangelogCategory;
  publishedAt: string;
  requests: number;
}

export interface AdminChangelogEntry extends ChangelogEntry {
  status: "draft" | "published";
  state: "draft" | "scheduled" | "published";
  createdAt: string;
  updatedAt: string;
}

export interface SettingsResponse {
  values: Record<string, unknown>;
  defaults: Record<string, unknown>;
  changed: Record<string, { at: string; by: string | null }>;
}

export interface Member extends AccountBrief {
  grantedAt: string;
  updatedAt: string;
  grantedByEmail: string | null;
}

export interface AccessResponse {
  members: Member[];
  history: (HistoryEntry & { targetId: string; targetEmail: string | null })[];
}

export interface AuditEntry extends HistoryEntry {
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  actorId: string | null;
}

export interface Series {
  day?: string;
  week?: string;
  count: number;
}

export interface Overview {
  role: PlatformRole;
  generatedAt: string;
  accounts?: { total: number; new7: number; new30: number; signedIn7: number; signedIn30: number; unconfirmed: number; suspended: number };
  registrations?: Series[];
  recentAccounts?: { id: string; email: string; createdAt: string }[];
  reviews?: {
    byStatus: Partial<Record<ReviewStatus, number>>;
    ratings: Record<"1" | "2" | "3" | "4" | "5", number>;
    weekly: Series[];
    pending: { id: string; rating: number; displayName: string; excerpt: string; submittedAt: string }[];
  };
  feedback?: {
    byStatus: Partial<Record<FeedbackStatus, number>>;
    byCategory: Partial<Record<FeedbackCategory, number>>;
    total: number;
    resolved: number;
    weekly: Series[];
    recent: { id: string; category: FeedbackCategory; status: FeedbackStatus; excerpt: string; createdAt: string }[];
  };
  announcements?: {
    draft: number;
    scheduled: number;
    live: number;
    upcoming: { id: string; title: string; startsAt: string }[];
    readership: { id: string; title: string; startsAt: string; reads: number }[];
  };
  changelog?: { published: number; drafts: number; recent: { id: string; slug: string; title: string; publishedAt: string }[] };
  recentActions?: { id: number; action: string; targetType: string; targetId: string; actorEmail: string | null; createdAt: string }[];
}
