"use client";

import { useEffect, useRef } from "react";
import { useChronicle } from "@/lib/store";
import { planDelivery } from "@/lib/notifications";
import { useNotifications, useNotificationPermission } from "./use-notifications";

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
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
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
  const { inbox, settings, notifyLog, hydrated } = useNotifications();
  const { permission } = useNotificationPermission();
  const record = useChronicle((s) => s.recordNoticeDelivery);

  /**
   * Guards against a second effect run firing the same thing twice before the
   * store write that would have deduped it has landed. React 18 in development
   * mounts effects twice, and without this the first toast arrives in pairs.
   */
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (permission !== "granted") return;
    if (!settings.enabled || !settings.deliver) return;

    const now = new Date();
    const plan = planDelivery(inbox, settings, notifyLog, now);
    if (plan.kind === "none") return;

    const digest = plan.kind === "digest";
    const key = digest
      ? `digest:${plan.notices.map((n) => n.id).join(",")}`
      : `one:${plan.notices[0].id}`;
    if (inFlight.current === key) return;
    inFlight.current = key;

    const title = digest ? plan.title : plan.notices[0].title;
    const body = digest ? plan.body : plan.notices[0].body;
    /**
     * The digest links home, not to any one page — picking the top notice's
     * destination would silently drop the other things it is telling you about.
     */
    const href = digest ? "/" : plan.notices[0].href;
    const tag = digest ? "chronicle-digest" : plan.notices[0].dedupeKey;

    let cancelled = false;
    void show({ title, body, href, tag }).then((sent) => {
      if (cancelled) return;
      /**
       * Only recorded once the OS actually accepted it. Recording a delivery
       * that never appeared would burn the day's cap and the per-subject
       * cooldown on a notification nobody ever saw.
       */
      if (sent) record(plan.notices, now, digest);
      else inFlight.current = null;
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, permission, inbox, settings, notifyLog, record]);

  return null;
}
