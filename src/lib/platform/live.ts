/* ════════════════════════════════════════════════════════════════
   LIVE UPDATES FROM THE ADMIN CENTER
   When an administrator changes something students see (an
   announcement, the app-wide notice, an answer to feedback, a review's
   status), the Admin API sends one message on a Supabase Realtime
   channel, and every open app reloads that part of the page by itself.

   The message carries no content and no account: only which areas
   changed. Each app then asks the database for its own data, through
   the same functions it always uses, so nobody receives anything they
   couldn't already read.

   The channel is private. Only signed-in accounts can join it, and only
   the server (with the service-role key) can send on it: the policy is
   in supabase/migrations/20261205120000_live_updates.sql.

   Shared by the server (lib/platform/server/live.ts) and the browser
   (components/platform/live-updates.ts).
   ════════════════════════════════════════════════════════════════ */

/** The Realtime topic. Matches the policy on `realtime.messages`. */
export const LIVE_TOPIC = "platform-updates";
/** The broadcast event on it. */
export const LIVE_EVENT = "changed";

export const LIVE_AREAS = ["announcements", "notice", "feedback", "reviews"] as const;
/**
 * What changed:
 * - `announcements`: published, scheduled, edited, archived or unpublished
 * - `notice`: the one-line notice at the top of every app page (Platform settings)
 * - `feedback`: a status or an answer the author can see
 * - `reviews`: a moderation decision, a public reply, or the review settings
 */
export type LiveArea = (typeof LIVE_AREAS)[number];

export function isLiveArea(value: unknown): value is LiveArea {
  return typeof value === "string" && (LIVE_AREAS as readonly string[]).includes(value);
}

export interface LivePayload {
  areas: LiveArea[];
  /** When the server sent it (ISO). */
  at: string;
}

/** The areas a received message names. Anything unexpected is ignored. */
export function liveAreasOf(payload: unknown): LiveArea[] {
  const areas = (payload as { areas?: unknown } | null)?.areas;
  return Array.isArray(areas) ? [...new Set(areas.filter(isLiveArea))] : [];
}
