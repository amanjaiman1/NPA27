"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isCloudConfigured } from "./supabase";

/* ════════════════════════════════════════════════════════════════
   BACKGROUND PUSH — the browser half
   Subscribing a device, and telling the server about it. Everything
   here is a no-op unless a VAPID public key was built in.
   ════════════════════════════════════════════════════════════════ */

/** Inlined at build time; absent in a build with no push configured. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** True when this build has a VAPID key to subscribe against. */
export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY);

/**
 * Whether the browser can do push at all.
 *
 * Distinct from *permission*: Firefox on Android has PushManager and may still
 * be denied, while a desktop Safari tab has no PushManager until the site is
 * added to the Dock. The UI needs to tell those apart to say anything useful.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * VAPID keys travel as base64url; `applicationServerKey` wants raw bytes.
 * Chrome tolerates the string form, Firefox historically did not, so convert.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  // Backed by an explicit ArrayBuffer: a bare `new Uint8Array(n)` is typed over
  // ArrayBufferLike, which includes SharedArrayBuffer and so is not a valid
  // `BufferSource` for `applicationServerKey`.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Which OS this device is, for the dispatcher's benefit — Android takes action
 * buttons and vibration patterns that macOS ignores.
 *
 * Read from `userAgentData` where available and the UA string otherwise. Best
 * effort by nature: a wrong guess costs a slightly less tailored notification,
 * never a failed delivery, so nothing here is load-bearing.
 */
export function detectPlatform(): string | null {
  if (typeof navigator === "undefined") return null;
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const hint = (uaData?.platform || "").toLowerCase();
  const ua = navigator.userAgent.toLowerCase();

  if (hint.includes("android") || ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  if (hint.includes("macos") || ua.includes("mac os x")) {
    return navigator.maxTouchPoints > 1 ? "ios" : "macos";
  }
  if (hint.includes("windows") || ua.includes("windows")) return "windows";
  if (hint.includes("linux") || ua.includes("linux")) return "linux";
  return null;
}

/** The device's IANA zone, so the server can respect the user's quiet hours. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The signed-in user's access token, for the API routes to verify. */
async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function serviceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // `ready` resolves only once a worker is active, which is exactly the
  // precondition for subscribing. It is registered in production builds only.
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return navigator.serviceWorker.ready;
}

export type PushFailure =
  | "unsupported"
  | "unconfigured"
  | "no-cloud"
  | "no-worker"
  | "denied"
  | "not-signed-in"
  | "server-rejected"
  | "failed";

/**
 * Subscribe this device and register it server-side.
 *
 * Both halves matter and they can fail independently: a browser subscription
 * the server never heard about would look enabled and never deliver, so a
 * rejected registration tears the local subscription back down rather than
 * leaving that lie in place.
 */
export async function subscribeToPush(): Promise<
  { ok: true } | { ok: false; reason: PushFailure; detail?: string }
> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "unconfigured" };
  if (!isCloudConfigured) return { ok: false, reason: "no-cloud" };
  if (Notification.permission !== "granted") return { ok: false, reason: "denied" };

  const token = await accessToken();
  if (!token) return { ok: false, reason: "not-signed-in" };

  const reg = await serviceWorkerReady();
  if (!reg) return { ok: false, reason: "no-worker" };

  let sub: PushSubscription;
  try {
    // Reuse an existing subscription rather than churning the endpoint — a new
    // one would orphan the row the server already has.
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        // Required by Chrome, and honest: every push here shows a notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
  } catch (e) {
    return { ok: false, reason: "failed", detail: String(e) };
  }

  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      platform: detectPlatform(),
      timezone: deviceTimeZone(),
      userAgent: navigator.userAgent,
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    // Don't leave a subscription the server cannot use.
    await sub.unsubscribe().catch(() => {});
    return {
      ok: false,
      reason: "server-rejected",
      detail: res ? `HTTP ${res.status}` : "network",
    };
  }
  return { ok: true };
}

/**
 * Ask the server to push a test notification to this account's devices.
 *
 * Goes through the server rather than calling `showNotification` locally, which
 * would prove nothing: a local notification works even with no subscription at
 * all. This exercises the real path end to end.
 */
export async function sendTestPush(): Promise<
  { ok: true; sent: number; devices: number } | { ok: false; error: string }
> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "Sign in first." };

  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!res) return { ok: false, error: "Couldn't reach the server." };
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    sent?: number;
    devices?: number;
  };
  if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  if (!body.sent) {
    return { ok: false, error: "The push service accepted nothing. Try re-enabling." };
  }
  return { ok: true, sent: body.sent, devices: body.devices ?? body.sent };
}

/** Unsubscribe this device and forget it server-side. */
export async function unsubscribeFromPush(): Promise<boolean> {
  const reg = await serviceWorkerReady();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return true;

  const token = await accessToken();
  if (token) {
    // Told to forget first: if this fails, the row would keep being pushed to a
    // dead endpoint until the push service reports it gone.
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => null);
  }
  return sub.unsubscribe().catch(() => false);
}

/**
 * Whether *this device* is subscribed.
 *
 * Deliberately read from the browser rather than from settings. A synced flag
 * would be wrong — your Mac being subscribed says nothing about your phone —
 * and a stored local flag could disagree with reality after the browser drops a
 * subscription on its own, which it does.
 */
export function usePushSubscription() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PushFailure | null>(null);

  const refresh = useCallback(async () => {
    if (!isPushSupported() || !isPushConfigured) {
      setSubscribed(false);
      return;
    }
    const reg = await serviceWorkerReady();
    const sub = await reg?.pushManager.getSubscription();
    setSubscribed(Boolean(sub));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await subscribeToPush();
    if (!result.ok) setError(result.reason);
    await refresh();
    setBusy(false);
    return result.ok;
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    await unsubscribeFromPush();
    await refresh();
    setBusy(false);
  }, [refresh]);

  return {
    /** `null` until the browser has been asked. */
    subscribed,
    busy,
    error,
    enable,
    disable,
    supported: isPushSupported(),
    configured: isPushConfigured,
    cloudConfigured: isCloudConfigured,
  };
}
