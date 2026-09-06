/* ════════════════════════════════════════════════════════════════
   PUSH DISPATCH — the decision half
   Pure: given a user's synced snapshot, their devices and the server's
   delivery log, work out what (if anything) to send each device.
   No network, no database, no clock of its own — so it is testable.
   ════════════════════════════════════════════════════════════════ */

import type { ChronicleData } from "./types";
import {
  evaluate,
  buildInbox,
  planDelivery,
  withDefaults,
  type DeliveryLog,
  type NotifySettings,
  type NotifyState,
  type Notice,
} from "./notifications";
import { pickTimeZone, zonedNow, zonedDayAndHour } from "./zoned-time";

/** A device row, as stored in `chronicle_push_subscriptions`. */
export interface SubscriptionRow {
  id: string;
  endpoint: string;
  key_p256dh: string;
  key_auth: string;
  platform: string | null;
  timezone: string | null;
}

/**
 * The synced snapshot, as far as the dispatcher cares: the app data the rules
 * read, plus the two notification keys that travel with it.
 */
export type Snapshot = Partial<ChronicleData> & {
  notify?: Partial<NotifySettings> | null;
  notifyState?: Partial<NotifyState> | null;
};

/** What the service worker expects to find in `event.data.json()`. */
export interface PushPayload {
  title: string;
  body: string;
  href: string;
  tag: string;
  /** Android renders these as buttons; other platforms ignore them. */
  actions?: { action: string; title: string }[];
  /** Re-alert for a tag that is already on screen. Android only. */
  renotify?: boolean;
  /** Keeps a critical notification on a desktop screen until acknowledged. */
  requireInteraction?: boolean;
  vibrate?: number[];
  /**
   * Unread count for the app badge — the number on the macOS dock icon or the
   * Android launcher icon. Sent with the push so the badge is right even though
   * the app was never opened.
   */
  badgeCount?: number;
}

export type UserDecision =
  | { send: false; reason: string }
  | {
      send: true;
      /** Digest sends one summary; otherwise one notice. */
      digest: boolean;
      notices: Notice[];
      payload: PushPayload;
      /** Fold this back into `chronicle_push_log` after a successful send. */
      nextLog: DeliveryLog;
    };

/**
 * Fill in the fields whose right value depends on the receiving OS.
 *
 * Android is the only platform here that renders action buttons and honours a
 * vibration pattern, and `requireInteraction` is meaningless on a phone but
 * useful on a desktop, where a critical notice should not slide away unseen.
 * Everything unsupported is simply ignored by the browser, so this is tailoring
 * rather than branching — the same notification arrives either way.
 */
export function payloadForPlatform(
  base: PushPayload,
  platform: string | null,
  priority?: string,
): PushPayload {
  const android = platform === "android";
  const desktop =
    platform === "macos" || platform === "windows" || platform === "linux";

  return {
    ...base,
    actions: android
      ? [
          { action: "open", title: "Open" },
          { action: "later", title: "Later" },
        ]
      : undefined,
    renotify: android ? priority === "critical" : undefined,
    vibrate: android
      ? priority === "critical"
        ? [80, 60, 80]
        : [60]
      : undefined,
    requireInteraction: desktop && priority === "critical" ? true : undefined,
  };
}

/**
 * Decide what to send one user.
 *
 * Runs exactly the same pipeline the browser runs — `evaluate`, `buildInbox`,
 * `planDelivery` — so a pushed notification and the bell can never disagree. The
 * only difference is *whose* clock: the browser is already in the user's
 * timezone, and the server has to be put there deliberately.
 */
export function decideForUser(
  snapshot: Snapshot | null | undefined,
  rows: SubscriptionRow[],
  log: Partial<DeliveryLog> | null | undefined,
  at: Date = new Date(),
): UserDecision {
  if (!snapshot) return { send: false, reason: "No synced snapshot." };
  if (rows.length === 0) return { send: false, reason: "No devices." };

  const settings = withDefaults(snapshot.notify);
  if (!settings.enabled) return { send: false, reason: "Notifications are off." };
  if (!settings.deliver) return { send: false, reason: "Delivery is off." };

  /**
   * The user's zone, not the server's. Without this every scheduling decision
   * would be made in UTC: quiet hours would start at the wrong time of day and
   * "today" would roll over mid-afternoon. Falls back to UTC when no device has
   * ever reported one.
   */
  const tz = pickTimeZone(rows.map((r) => r.timezone)) ?? "UTC";
  const now = zonedNow(tz, at);
  const { date: today } = zonedDayAndHour(tz, at);

  /**
   * The engine wants a whole `ChronicleData`. A snapshot is missing whatever the
   * user has never touched, so the gaps are filled rather than trusted — a rule
   * reading `undefined.length` would take down the dispatch for everyone.
   */
  const data: ChronicleData = {
    profile: snapshot.profile as ChronicleData["profile"],
    accomplished: snapshot.accomplished ?? [],
    subjects: snapshot.subjects ?? [],
    journal: snapshot.journal ?? [],
    mocks: snapshot.mocks ?? [],
    revisions: snapshot.revisions ?? [],
    currentAffairs: snapshot.currentAffairs ?? [],
    mistakes: snapshot.mistakes ?? [],
    habits: snapshot.habits ?? [],
    sleep: snapshot.sleep ?? [],
    exercise: snapshot.exercise ?? [],
    lifeLog: snapshot.lifeLog ?? [],
    goals: snapshot.goals ?? [],
    books: snapshot.books ?? [],
    milestones: snapshot.milestones ?? [],
    reflections: snapshot.reflections ?? [],
    reviews: snapshot.reviews ?? [],
    topicLinks: snapshot.topicLinks ?? [],
    selection: snapshot.selection ?? [],
  };
  if (!data.profile) return { send: false, reason: "Snapshot has no profile." };

  const notices = evaluate(data, { now, settings });
  const inbox = buildInbox(notices, snapshot.notifyState, today);
  const plan = planDelivery(inbox, settings, log, now);

  if (plan.kind === "none") return { send: false, reason: plan.reason };

  const digest = plan.kind === "digest";
  const lead = plan.notices[0];
  const base: PushPayload = {
    title: digest ? plan.title : lead.title,
    body: digest ? plan.body : lead.body,
    /**
     * A digest links home rather than to any one page — sending it to the top
     * notice's destination would quietly drop everything else it mentions.
     */
    href: digest ? "/" : lead.href,
    tag: digest ? "chronicle-digest" : lead.dedupeKey,
    // Everything still unread, not just what is being sent — the badge is a
    // count of what is waiting, and one push may stand for several notices.
    badgeCount: inbox.unread,
  };

  return {
    send: true,
    digest,
    notices: plan.notices,
    payload: base,
    nextLog: foldLog(log, plan.notices, at, today, digest),
  };
}

/**
 * Record a delivery.
 *
 * Two clocks, on purpose, and mixing them up is how the per-subject cooldown
 * broke: `lastSentAt` is the **true instant**, because the minimum-gap check is a
 * duration; every date field is the **user's local day**, because those are
 * compared against the user's calendar. Using UTC for the dates — as this
 * originally did — meant that whenever the server and the user disagreed about
 * what day it was, the daily gates silently stopped applying and the same notice
 * could be pushed twice.
 */
function foldLog(
  log: Partial<DeliveryLog> | null | undefined,
  notices: { dedupeKey: string }[],
  at: Date,
  today: string,
  digest: boolean,
): DeliveryLog {
  const current = {
    lastSentAt: {},
    lastSentOn: {},
    sentToday: 0,
    sentOnDate: null,
    lastDigestOn: null,
    ...(log ?? {}),
  } as DeliveryLog;

  const sentToday = current.sentOnDate === today ? current.sentToday : 0;
  const lastSentAt = { ...(current.lastSentAt ?? {}) };
  const lastSentOn = { ...(current.lastSentOn ?? {}) };
  for (const n of notices) {
    lastSentAt[n.dedupeKey] = at.toISOString();
    lastSentOn[n.dedupeKey] = today;
  }

  return {
    lastSentAt,
    lastSentOn,
    sentToday: sentToday + (digest ? 1 : notices.length),
    sentOnDate: today,
    lastDigestOn: digest ? today : current.lastDigestOn,
  };
}

/** Group flat subscription rows by their owner. */
export function groupByUser<T extends { user_id: string }>(
  rows: T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(row.user_id);
    if (list) list.push(row);
    else out.set(row.user_id, [row]);
  }
  return out;
}

/**
 * Whether a failed send means the device is gone for good.
 *
 * 404 and 410 are the push service saying the endpoint no longer exists — the
 * app was uninstalled, or the browser rotated it. Anything else (a timeout, a
 * 429, a 500) is transient and the row must be kept, or one bad afternoon would
 * quietly unsubscribe everybody.
 */
export function isGoneForever(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
