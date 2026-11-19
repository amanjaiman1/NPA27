/* The shapes the platform functions return (supabase/migrations/20261204120000_platform_admin.sql). */

import type { PlatformRole } from "./roles";
import type {
  AnnouncementCategory,
  AnnouncementState,
  ChangelogCategory,
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
  ReviewStage,
  ReviewStatus,
} from "./content";

export interface AccountBrief {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  suspended: boolean;
  role: PlatformRole | null;
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

export interface UserDetail extends AccountBrief {
  reviewStatus: ReviewStatus | null;
  feedbackCount: number;
  history: HistoryEntry[];
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

export interface AuthorReview {
  id: string;
  rating: number;
  headline: string | null;
  body: string;
  useful: string | null;
  suggestions: string | null;
  features: string[];
  stage: ReviewStage | null;
  displayName: string;
  feedbackConsent: boolean;
  feedbackConsentAt: string | null;
  publicConsent: boolean;
  publicConsentAt: string | null;
  status: ReviewStatus;
  usage: ReviewUsage;
  moderationReason: string | null;
  moderatedAt: string | null;
  response: string | null;
  responseAt: string | null;
  publishedAt: string | null;
  submittedAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
}

export interface AdminReview extends AuthorReview {
  userId: string;
  account: { emailConfirmed: boolean; createdAt: string } | null;
  history?: HistoryEntry[];
}

export interface ReviewList extends Page<AdminReview> {
  counts: Partial<Record<ReviewStatus, number>>;
}

export interface PublicReview {
  id: string;
  rating: number;
  headline: string | null;
  body: string;
  useful: string | null;
  features: string[];
  stage: ReviewStage | null;
  displayName: string;
  publishedAt: string;
  response: string | null;
  responseAt: string | null;
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

export interface AdminFeedback extends Omit<MyFeedback, "responseSeen"> {
  userId: string;
  priority: FeedbackPriority;
  context: { userAgent?: string; screen?: string; installed?: boolean };
  shareEmail: boolean;
  email: string | null;
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
  items: MyAnnouncement[];
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
