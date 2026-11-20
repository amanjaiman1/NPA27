"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isCloudConfigured } from "./supabase";
import { isDemo } from "./demo/mode";

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
  // The demo has no account to send to, and must not register this browser for a real one.
  if (isDemo()) return { ok: false, reason: "not-signed-in" };
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "unconfigured" };
  if (!isCloudConfigured) return { ok: false, reason: "no-cloud" };
  if (Notification.permission !== "granted") return { ok: false, reason: "denied" };

  const token = await accessToken();
  if (!token) return { ok: false, reason: "not-signed-in" };
  // Subscribing makes this browser the signed-in account's: a sign-out's
  // unfinished release of it no longer applies.
  forgetRelease();

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
  if (isDemo()) return { ok: false, error: "The demo doesn't send notifications." };
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
  // This browser's subscription may belong to a real account signed in here: the demo leaves it alone.
  if (isDemo()) return false;
  const sub = await currentSubscription(LOOKUP_WAIT_MS);
  if (!sub) return true;
  const token = await accessToken();
  // Both at once: the server forgets the device, and the browser ends the
  // subscription, which also stops pushes to it if the server never hears.
  const [, unsubscribed] = await Promise.all([
    token ? tellServerToForget(sub.endpoint, token) : Promise.resolve(false),
    sub.unsubscribe().catch(() => false),
  ]);
  return unsubscribed;
}

/* ── stopping push when someone signs out ─────────────────────────
   Signing out must stop this device receiving the account's notifications,
   and must not wait on the push service or the worker to do it. Two things
   end a device's pushes, and either is enough:
     • the server forgets the row (POST /api/push/unsubscribe, which checks
       the token and deletes only the caller's own row for that endpoint);
     • the browser ends the subscription, after which every push to that
       endpoint is refused and the dispatcher deletes the row (404/410).
   Both start at once. The server request needs the session's token, so it is
   sent before the session ends; the browser's part carries on in the
   background. If the browser couldn't end it (offline, the tab closed), the
   endpoint is remembered on this device and ended the next time the app
   opens here, unless someone has subscribed this browser again since. */

/** Device-wide: the subscription a sign-out on this browser still has to end. */
const RELEASE_KEY = "upsc-chronicle-push-release";
/** How long finding this device's subscription may take before going on without it. */
const LOOKUP_WAIT_MS = 1_500;

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * This device's subscription, if it has one. Asks for the registration that
 * exists rather than waiting for `serviceWorker.ready`, which never settles
 * on a page without an active worker.
 */
async function currentSubscription(waitMs: number): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const lookup = (async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager?.getSubscription()) ?? null;
  })();
  return within(lookup, waitMs, null);
}

function tellServerToForget(endpoint: string, token: string): Promise<boolean> {
  return fetch("/api/push/unsubscribe", {
    method: "POST",
    // Finishes even if the page goes away straight after.
    keepalive: true,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  }).then(
    (res) => res.ok,
    () => false,
  );
}

function rememberRelease(endpoint: string): void {
  try {
    localStorage.setItem(RELEASE_KEY, endpoint);
  } catch {
    /* storage blocked: the attempt below still runs */
  }
}

function forgetRelease(endpoint?: string): void {
  try {
    if (!endpoint || localStorage.getItem(RELEASE_KEY) === endpoint) localStorage.removeItem(RELEASE_KEY);
  } catch {
    /* nothing to forget */
  }
}

/**
 * Stops this device's background notifications for the account signing out.
 * Returns at once; `told` settles when the server has answered or can't be
 * reached, and never rejects. `token` is the session's access token, read
 * before the session ends.
 */
export function releasePushSubscription(token: string | null): { told: Promise<void> } {
  if (isDemo() || !isPushSupported()) return { told: Promise.resolve() };
  const told = (async () => {
    const sub = await currentSubscription(LOOKUP_WAIT_MS);
    if (!sub) return;
    rememberRelease(sub.endpoint);
    void sub.unsubscribe().then(
      (ok) => ok && forgetRelease(sub.endpoint),
      () => undefined,
    );
    if (token) await tellServerToForget(sub.endpoint, token);
  })().catch(() => undefined);
  return { told };
}

/** Ends a subscription a sign-out on this device couldn't. Run once when the app opens. */
export async function retryPushRelease(): Promise<void> {
  let pending: string | null = null;
  try {
    pending = localStorage.getItem(RELEASE_KEY);
  } catch {
    return;
  }
  if (!pending || isDemo() || !isPushSupported()) return;
  const sub = await currentSubscription(5_000);
  // Gone already, or this browser was subscribed again since (for whoever
  // subscribed it): nothing of the old account's is left to end.
  if (!sub || sub.endpoint !== pending) {
    forgetRelease(pending);
    return;
  }
  if (await sub.unsubscribe().catch(() => false)) forgetRelease(pending);
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
    try {
      const reg = await serviceWorkerReady();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * `finally`, so a throw anywhere on the way — the worker, the push service,
   * the network — can't leave the switch disabled for the rest of the visit.
   */
  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeToPush();
      if (!result.ok) setError(result.reason);
      return result.ok;
    } catch {
      setError("failed");
      return false;
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
    } catch {
      setError("failed");
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
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
