"use client";

import { useEffect, useRef } from "react";
import { useChronicle } from "@/lib/store";
import { useAccount } from "@/components/account/account-session";
import { DIGEST_TAG, foldDeviceDeliveries, planDelivery } from "@/lib/notifications";
import { useNotifications, useNotificationPermission } from "./use-notifications";
import { readDeviceDeliveries, rememberDelivery } from "./device-deliveries";

/**
 * Hands a notice to the operating system.
 *
 * Routed through the service worker registration when there is one: a worker
 * notification survives the page being closed, is clickable through the
 * `notificationclick` handler in `sw.js`, and is the only form iOS accepts.
 * `new Notification()` is the fallback for `next dev`, where no worker is
 * registered at all.
 */
async function show(opts: {
  title: string;
  body: string;
  href: string;
  tag: string;
}): Promise<boolean> {
  const { title, body, href, tag } = opts;
  const payload: NotificationOptions & { data: { href: string } } = {
    body,
    tag,
    icon: "/icons/icon-192.png?v=2",
    badge: "/icons/icon-192.png?v=2",
    data: { href },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, payload);
        return true;
      }
    }
  } catch {
    /* fall through to the page-level API */
  }

  try {
    if (typeof Notification === "undefined") return false;
    const n = new Notification(title, payload);
    n.onclick = () => {
      window.focus();
      window.location.assign(href);
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Layer 4 of the notification system: decides whether anything in the inbox is
 * allowed to interrupt, and fires it. Renders nothing.
 *
 * The decision itself lives in `planDelivery` — pure, and tested. This component
 * only supplies the clock, the permission state and the side effect, so the
 * gates (quiet hours, per-day cap, minimum gap, per-subject cooldown) can be
 * verified without a browser.
 */
export function Notifier() {
  const { inbox, settings, notifyLog, now, evaluated, ready } = useNotifications();
  const { permission } = useNotificationPermission();
  const { accountId } = useAccount();
  const record = useChronicle((s) => s.recordNoticeDelivery);

  /**
   * Set while a notification is being shown. Another run in that window — data
   * changing as it goes out, or React 18 mounting effects twice in development —
   * would otherwise send a second one before the first is in the log. Cleared
   * once it is; from then on the log does the deduping, and the change to it
   * re-runs the effect, so nothing skipped here is lost.
   */
  const busy = useRef(false);

  /**
   * The app badge: the count on the macOS dock icon and the Android launcher
   * icon. The worker sets it when a push arrives with the app closed; this keeps
   * it honest while the app is open, and clears it the moment the last notice is
   * read rather than leaving a stale number sitting on the icon.
   *
   * Installed PWAs only. Unsupported elsewhere, hence the capability check and
   * the swallowed rejection.
   */
  useEffect(() => {
    // Not before the inbox is worked out: an empty one would clear the badge for a moment.
    if (!evaluated) return;
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    const unread = inbox.unread;
    if (unread > 0) void navigator.setAppBadge(unread).catch(() => {});
    else void navigator.clearAppBadge().catch(() => {});
  }, [evaluated, inbox.unread]);

  /**
   * Re-run every minute (`now`) as well as on every change, because the digest
   * hour and the end of quiet hours arrive without anything else changing.
   *
   * Waits for `ready`, not just hydration: until the first sync lands, the data
   * here can be days behind another device, and a notice already read on the
   * phone would be announced again on the laptop.
   */
  useEffect(() => {
    if (!ready || !evaluated) return;
    if (permission !== "granted") return;
    if (!settings.enabled || !settings.deliver) return;

    /**
     * Decided without any I/O first. Folding in what the server has pushed can
     * only make the gates stricter, so when the page's own log already says
     * "nothing", the device record is never read — which is nearly every minute.
     */
    const first = planDelivery(inbox, settings, notifyLog, new Date());
    if (first.kind === "none") return;

    let stale = false;
    void (async () => {
      const shown = await readDeviceDeliveries(accountId);
      // A newer run (fresher data, or the next minute) decides instead.
      if (stale) return;

      const at = new Date();
      // The newest log, not this render's: a delivery recorded a moment ago by
      // an earlier run must count here.
      const log = foldDeviceDeliveries(useChronicle.getState().notifyLog, shown, at);
      const plan = planDelivery(inbox, settings, log, at);
      if (plan.kind === "none") return;

      if (busy.current) return;
      busy.current = true;

      const digest = plan.kind === "digest";

      const title = digest ? plan.title : plan.notices[0].title;
      const body = digest ? plan.body : plan.notices[0].body;
      /**
       * The digest links home, not to any one page — picking the top notice's
       * destination would silently drop the other things it is telling you about.
       */
      const href = digest ? "/dashboard" : plan.notices[0].href;
      const tag = digest ? DIGEST_TAG : plan.notices[0].dedupeKey;

      try {
        const sent = await show({ title, body, href, tag });
        /**
         * Only recorded once the OS actually accepted it — recording a delivery
         * that never appeared would burn the day's cap and the per-subject
         * cooldown on a notification nobody saw. And recorded even if this run
         * has since gone stale: it *was* shown, and an unrecorded delivery is
         * one that gets sent again.
         */
        if (sent) {
          record(plan.notices, at, digest);
          void rememberDelivery(tag, accountId);
        }
      } finally {
        busy.current = false;
      }
    })();

    return () => {
      stale = true;
    };
  }, [ready, evaluated, permission, inbox, settings, notifyLog, now, record, accountId]);

  return null;
}
