"use client";

import type { DeviceDelivery } from "@/lib/notifications";

/* ════════════════════════════════════════════════════════════════
   WHAT THIS DEVICE HAS ALREADY SHOWN
   The page and the server both notify, and each keeps its own count.
   This small record, kept on the device, is what stops them repeating
   each other: the service worker writes to it when a server push
   arrives, the page writes to it when it notifies, and both read it.

   It lives in the Cache API because that is the one store both a page
   and a service worker can reach — the worker has no localStorage.
   The names and the entry shape must match `public/sw.js`.
   ════════════════════════════════════════════════════════════════ */

export const DELIVERY_CACHE = "chronicle-deliveries";
export const DELIVERY_KEY = "/__chronicle/deliveries";

/** Long enough for every gate (they look at today and the last few hours). */
const KEEP_MS = 3 * 86_400_000;
const MAX_ENTRIES = 60;

/** An entry as stored: a delivery, and the account it was for. */
export interface StoredDelivery extends DeviceDelivery {
  /** Signing in as someone else on this device must not inherit their record. */
  account: string | null;
}

function sanitize(raw: unknown, nowMs: number): StoredDelivery[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredDelivery[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { tag, at, source, account } = e as Record<string, unknown>;
    if (typeof tag !== "string" || !tag) continue;
    if (typeof at !== "number" || !Number.isFinite(at) || nowMs - at > KEEP_MS) continue;
    if (source !== "push" && source !== "page") continue;
    out.push({ tag, at, source, account: typeof account === "string" ? account : null });
  }
  return out.slice(-MAX_ENTRIES);
}

async function readAll(nowMs: number): Promise<StoredDelivery[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(DELIVERY_CACHE);
  const res = await cache.match(DELIVERY_KEY);
  if (!res) return [];
  return sanitize(await res.json().catch(() => []), nowMs);
}

/** What this device has shown for `account` lately. Empty on any failure. */
export async function readDeviceDeliveries(account: string): Promise<DeviceDelivery[]> {
  try {
    const all = await readAll(Date.now());
    return all.filter((e) => e.account === account);
  } catch {
    return [];
  }
}

/** Note that the page has just shown `tag`, so a later push of it stays quiet. */
export async function rememberDelivery(tag: string, account: string): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const nowMs = Date.now();
    const all = await readAll(nowMs);
    all.push({ tag, at: nowMs, source: "page", account });
    const cache = await caches.open(DELIVERY_CACHE);
    await cache.put(
      DELIVERY_KEY,
      new Response(JSON.stringify(all.slice(-MAX_ENTRIES)), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    // Storage is blocked or full. The cost is a possible repeat, never a miss.
  }
}
