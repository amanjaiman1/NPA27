/* ════════════════════════════════════════════════════════════════
   LIVE UPDATES
   Whenever something changes that someone else should see (a student
   sends a review, an administrator publishes an announcement, another
   device saves the same account, Supabase Auth registers a new account,
   SQL runs in the SQL Editor), the database sends one small message
   through Supabase Realtime, and every open screen showing that thing
   reloads it by itself. The triggers and the channel policies are in
   supabase/migrations/20261213120000_live_everywhere.sql.

   A message names only the areas that changed (and, for synced data,
   the new version): never content and never another account's id. Each
   screen then asks for its own data through the same functions and API
   routes it always uses, so nobody receives anything they couldn't
   already read. Three private channels:

     platform-updates        every signed-in account
     platform-admin-updates  Admin Center roles only
     account:<id>            that account only

   Shared by the browser (components/platform/live-updates.ts) and the
   tests. The browser listens; only the database sends.
   ════════════════════════════════════════════════════════════════ */

/** The broadcast event every message is sent as. */
export const LIVE_EVENT = "changed";
/** Every signed-in account: announcements, the notice in the app, review settings, the changelog. */
export const PLATFORM_TOPIC = "platform-updates";
/** Admin Center roles only: accounts and their visits, reviews, feedback, announcements, changelog, settings, access, audit. */
export const ADMIN_TOPIC = "platform-admin-updates";
/** One account only: its synced data, its feedback and review, read state, role and session. */
export const accountTopic = (userId: string) => `account:${userId}`;

export const LIVE_AREAS = [
  "announcements",
  "notice",
  "reviews",
  "feedback",
  "changelog",
  "users",
  "settings",
  "access",
  "audit",
  "chronicle",
  "role",
  "session",
  "activity",
] as const;

/**
 * What changed:
 * - `announcements`: published or edited (for students), any change or a read (Admin Center), read state (the reader's devices)
 * - `notice`: the one-line notice at the top of every app page
 * - `reviews`: a review sent, edited, moderated or answered; the invitation to review; the review settings
 * - `feedback`: feedback sent, triaged, noted or answered
 * - `changelog`: an update written or published
 * - `users`: an account signed up, signed in, confirmed its email, was suspended or restored, or was deleted
 * - `settings`: Platform settings
 * - `access`: Admin Center roles, and the settings that widen what a role may do
 * - `audit`: a new audit log entry
 * - `chronicle`: the account's own synced data, saved on another device
 * - `role`: the account's own Admin Center role
 * - `session`: the account was suspended, restored or deleted
 * - `activity`: an account opened the app, left it, or came back (Users, "Last visit")
 */
export type LiveArea = (typeof LIVE_AREAS)[number];

export function isLiveArea(value: unknown): value is LiveArea {
  return typeof value === "string" && (LIVE_AREAS as readonly string[]).includes(value);
}

export interface LivePayload {
  areas: LiveArea[];
  /** Synced data only: the version that save produced. */
  version?: number;
  /**
   * Set by the browser, never by the database: not a message but a reload
   * after a gap (the tab was in the background, the connection dropped), in
   * case something changed meanwhile.
   */
  catchUp?: boolean;
}

/** The areas a received message names. Anything unexpected is ignored. */
export function liveAreasOf(payload: unknown): LiveArea[] {
  const areas = (payload as { areas?: unknown } | null)?.areas;
  return Array.isArray(areas) ? [...new Set(areas.filter(isLiveArea))] : [];
}

/** The version a synced-data message carries, if any. */
export function liveVersionOf(payload: unknown): number | null {
  const v = (payload as { version?: unknown } | null)?.version;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * What an Admin API path shows, so the page loading it reloads when one of
 * these changes. Only what the page displays: the reviews list doesn't
 * reload when a setting changes.
 */
export function adminAreasFor(path: string): LiveArea[] {
  switch (path.split(/[/?]/)[0]) {
    case "overview":
      return ["users", "reviews", "feedback", "announcements", "changelog", "audit"];
    case "users":
      // The list's roles and visits, and one account's review, feedback count and history.
      return ["users", "access", "reviews", "feedback", "activity"];
    case "reviews":
      return ["reviews"];
    case "feedback":
      // Each item's linked update, and the list of updates to link to.
      return ["feedback", "changelog"];
    case "crashes":
      // Crash reports, shown in the Feedback Center.
      return ["feedback"];
    case "announcements":
      // The defaults a new one starts with are settings.
      return ["announcements", "settings"];
    case "changelog":
      // How many requests each update answered.
      return ["changelog", "feedback"];
    case "settings":
      return ["settings"];
    case "access":
      return ["access"];
    case "audit":
      return ["audit"];
    default:
      return [];
  }
}
