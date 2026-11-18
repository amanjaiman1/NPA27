/* The UPSC Chronicle — service worker.
 *
 * Goals, in order of importance:
 *   1. Never break the live app. Anything uncertain falls through to the
 *      network, and a failed cache write is always swallowed.
 *   2. Make the installed app usable offline. The Chronicle keeps its data in
 *      localStorage (synced to Supabase when online), so a cached shell plus
 *      cached routes gives a genuinely working offline app.
 *   3. Ship updates promptly. Documents are network-first, so a new build is
 *      picked up as soon as the device has a connection.
 *
 * Bump CACHE_VERSION to retire every previous cache on the next activation.
 */

// v11 — Lavender is the default; the precached offline page opens in it.
// (v10: a third theme, Lavender. v9: the redesign, with Light and Dark.)
const CACHE_VERSION = "v11";
const SHELL_CACHE = `chronicle-shell-${CACHE_VERSION}`;
const PAGE_CACHE = `chronicle-pages-${CACHE_VERSION}`;
const ASSET_CACHE = `chronicle-assets-${CACHE_VERSION}`;
/**
 * What this device has shown lately — see "what this device has shown" below.
 * Not versioned: it is data, not a copy of the site, and must outlive updates.
 */
const DELIVERY_CACHE = "chronicle-deliveries";
const KNOWN_CACHES = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE, DELIVERY_CACHE];

/** A standalone document — no app JS — so the fallback can never fail. */
const OFFLINE_URL = "/offline.html";

/** Precached on install — the bare minimum for a cold, offline start. */
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  // The loading animations, 15 KB together. These specifically must not be
  // fetched over the network on a cold start: the boot ring exists to cover a
  // slow connection, so waiting for the network to deliver it would defeat it.
  "/animations/boot.json",
  "/animations/page-transition.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

// ---------------------------------------------------------------- lifecycle

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // Individually, so one 404 can't fail the whole install.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { cache: "reload" }));
            if (res && res.ok) await shell.put(url, res);
          } catch {
            /* offline during install — runtime caching will pick it up */
          }
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("chronicle-") && !KNOWN_CACHES.includes(n))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING" || data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// -------------------------------------------- what this device has shown
//
// The page and the server both notify, each with its own count, so the same
// digest could arrive from the server at 07:30 and again from the page when the
// app was opened. This record, kept on the device, is shared by the two: the
// worker notes every push it shows, the page notes every notification it shows,
// and each reads the other's before notifying. The shape and the names must
// match `src/components/notifications/device-deliveries.ts`.

const DELIVERY_KEY = "/__chronicle/deliveries";
const DELIVERY_KEEP_MS = 3 * 86400000;
const DELIVERY_MAX = 60;
/** The fallback tag and the server's test: never a real delivery. */
const UNCOUNTED_TAGS = ["chronicle", "chronicle-test"];

async function readDeliveries() {
  try {
    const cache = await caches.open(DELIVERY_CACHE);
    const res = await cache.match(DELIVERY_KEY);
    const list = res ? await res.json() : [];
    const now = Date.now();
    return Array.isArray(list)
      ? list.filter(
          (e) =>
            e &&
            typeof e.tag === "string" &&
            typeof e.at === "number" &&
            now - e.at <= DELIVERY_KEEP_MS,
        )
      : [];
  } catch {
    return [];
  }
}

async function writeDeliveries(list) {
  try {
    const cache = await caches.open(DELIVERY_CACHE);
    await cache.put(
      DELIVERY_KEY,
      new Response(JSON.stringify(list.slice(-DELIVERY_MAX)), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    /* storage full or blocked — the cost is a possible repeat, never a miss */
  }
}

/** The device's own calendar day, which is the user's. */
function localDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// -------------------------------------------------------------- notifications

/**
 * Server-sent push, from `/api/push/dispatch`.
 *
 * The payload is `{ title, body, href, tag }` plus optional per-platform extras
 * the dispatcher fills in from the subscribing device's OS — `actions` and
 * `vibrate` for Android, `requireInteraction` for a desktop. Anything a platform
 * doesn't support it simply ignores, so there is no branching here: every field
 * is passed through and the browser decides.
 *
 * Everything is validated rather than trusted. A push arrives from the network,
 * and `showNotification` throws on a malformed option — which would mean *no*
 * notification, and a push that shows nothing costs the origin its push
 * permission in some browsers. So a bad payload degrades to a plain, correct
 * notification instead of none.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }
  if (typeof payload !== "object" || payload === null) payload = {};

  const str = (v, fallback) => (typeof v === "string" && v ? v : fallback);
  const title = str(payload.title, "DoOrDie");
  const href = str(payload.href, "/dashboard");

  const options = {
    body: str(payload.body, "Something needs your attention."),
    // Re-using a tag replaces the previous notification about the same thing
    // instead of stacking duplicates on the lock screen.
    tag: str(payload.tag, "chronicle"),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // The href travels in `data` so `notificationclick` can route without
    // re-parsing the body.
    data: { href },
  };

  // Android renders these as buttons. Each needs a string `action` and `title`,
  // and the platform caps how many it will show — two is safely within it.
  if (Array.isArray(payload.actions)) {
    const actions = payload.actions
      .filter(
        (a) =>
          a && typeof a.action === "string" && typeof a.title === "string",
      )
      .slice(0, 2)
      .map((a) => ({ action: a.action, title: a.title }));
    if (actions.length) options.actions = actions;
  }

  // `renotify` without a `tag` is a TypeError, so it is only honoured when one
  // is actually set.
  if (payload.renotify === true && options.tag) options.renotify = true;
  if (payload.requireInteraction === true) options.requireInteraction = true;
  if (
    Array.isArray(payload.vibrate) &&
    payload.vibrate.length &&
    payload.vibrate.every((n) => typeof n === "number" && n >= 0)
  ) {
    options.vibrate = payload.vibrate;
  }

  /**
   * The badge — the number on the macOS dock icon or the Android launcher icon.
   * Setting it here is the whole point of sending the count with the push: the
   * app was never opened, so nothing on the page could have set it.
   *
   * Installed PWAs only, and not supported everywhere, so a rejection is
   * swallowed. It must not be allowed to fail the event and take the
   * notification down with it.
   */
  const badgeCount = payload.badgeCount;
  if (typeof badgeCount === "number" && Number.isFinite(badgeCount)) {
    try {
      if (badgeCount > 0) self.navigator.setAppBadge?.(badgeCount);
      else self.navigator.clearAppBadge?.();
    } catch {
      /* not supported here; the notification still shows */
    }
  }

  // Whose push this is, so a shared computer keeps each account's record apart.
  const account = typeof payload.account === "string" ? payload.account : null;
  const counted = !UNCOUNTED_TAGS.includes(options.tag);

  event.waitUntil(
    (async () => {
      const shown = counted ? await readDeliveries() : [];
      const today = localDay(Date.now());
      /**
       * Already shown on this device today — the open app got there first. A
       * push must still show something, so it is shown silently: it replaces
       * the one on screen, or waits quietly in the tray, and never buzzes twice.
       */
      const repeat =
        counted &&
        shown.some(
          (e) => e.tag === options.tag && e.account === account && localDay(e.at) === today,
        );
      if (repeat) {
        options.silent = true;
        delete options.vibrate;
        delete options.renotify;
      }

      try {
        await self.registration.showNotification(title, options);
      } catch {
        // An option this browser rejects must not cost the notification itself.
        await self.registration.showNotification(title, {
          body: options.body,
          tag: options.tag,
          icon: options.icon,
          data: options.data,
        });
      }

      if (counted && !repeat) {
        shown.push({ tag: options.tag, at: Date.now(), source: "push", account });
        await writeDeliveries(shown);
      }
    })(),
  );
});

/**
 * Ask an open window of the app to change page itself, as an ordinary in-app
 * navigation. Resolves true once it confirms; false when nothing answers in
 * time — a public page or the sign-in screen has no one listening.
 */
function askToRoute(client, path) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const channel = new MessageChannel();
    channel.port1.onmessage = () => finish(true);
    setTimeout(() => finish(false), 700);
    try {
      client.postMessage({ type: "chronicle:navigate", href: path }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

/**
 * Focus an already-open tab and route it, rather than opening a second copy of
 * the app. `clients.matchAll` needs `includeUncontrolled` because a tab loaded
 * before this worker took control is not yet controlled by it, but is still the
 * window the user means.
 *
 * When that tab is inside the app, it changes page in place — instant, with
 * nothing reloaded. Only a tab elsewhere on the site is navigated the slow way.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  /**
   * "Later" dismisses and does nothing else — the point of the button is to get
   * the notification off your lock screen *without* being pulled into the app.
   * The notice itself is untouched and will be offered again by the normal rules,
   * which is the honest behaviour: nothing was resolved.
   */
  if (event.action === "later") return;

  let target;
  try {
    target = new URL(event.notification.data?.href || "/dashboard", self.location.origin);
  } catch {
    target = new URL("/dashboard", self.location.origin);
  }
  // Only ever somewhere on this site, whatever the payload said.
  if (target.origin !== self.location.origin) {
    target = new URL("/dashboard", self.location.origin);
  }
  const path = target.pathname + target.search + target.hash;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Same-origin only; navigating a foreign window is not ours to do.
      const ours = clientList.filter((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      // The window last in use, if there are several.
      const client =
        ours.find((c) => c.focused) ||
        ours.find((c) => c.visibilityState === "visible") ||
        ours[0];
      if (!client) {
        await self.clients.openWindow(target.href);
        return;
      }

      const focused = (await client.focus().catch(() => null)) || client;
      if (await askToRoute(focused, path)) return;
      if ("navigate" in focused) {
        // Rejects for a window this worker doesn't control yet; it has at
        // least been brought forward.
        await focused.navigate(target.href).catch(() => {});
      }
    })(),
  );
});

// ---------------------------------------------------------------- strategies

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image")
  );
}

function isStaticAsset(url) {
  return /\.(?:css|js|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|webmanifest|json|txt)$/i.test(
    url.pathname,
  );
}

/** Cache-first: content-hashed assets never change under the same URL. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && res.type === "basic") {
    cache.put(request, res.clone()).catch(() => {});
  }
  return res;
}

/** Stale-while-revalidate: instant from cache, refreshed in the background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === "basic") {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const res = await network;
  if (res) return res;
  throw new Error("offline and not cached");
}

/**
 * Network-first for documents, with the last-known-good copy of that route as
 * the offline fallback and the offline page as a final resort.
 *
 * Pages are keyed by pathname (query stripped) so that `/journal?new=1` and
 * `/journal` share one entry — the app reads its own query string on the
 * client, so the HTML is interchangeable.
 */
async function documentStrategy(request) {
  const url = new URL(request.url);
  const key = new Request(url.origin + url.pathname, {
    headers: { accept: "text/html" },
  });
  const cache = await caches.open(PAGE_CACHE);

  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === "basic") {
      cache.put(key, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const hit = (await cache.match(key)) || (await caches.match(key));
    if (hit) return hit;
    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title>" +
        "<body style=\"background:#08080a;color:#eaebf0;font:16px/1.6 system-ui;" +
        'display:grid;place-items:center;height:100vh;margin:0">' +
        "<p>You’re offline. Reconnect to open this page.</p>",
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

// ---------------------------------------------------------------- fetch

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only ever touch same-origin GETs. Supabase sync, auth and any other
  // cross-origin or mutating traffic goes straight to the network.
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith("http")) return;

  // Next.js flight/RSC payloads and API routes vary by header — never cache.
  if (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(documentStrategy(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      cacheFirst(request, ASSET_CACHE).catch(() => fetch(request)),
    );
    return;
  }

  if (isStaticAsset(url) || request.destination === "font" || request.destination === "image") {
    event.respondWith(
      staleWhileRevalidate(request, ASSET_CACHE).catch(() => Response.error()),
    );
  }
});
