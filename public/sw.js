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

// v5 — four new metric routes under /wellbeing, and a reworked wallpaper layer.
const CACHE_VERSION = "v5";
const SHELL_CACHE = `chronicle-shell-${CACHE_VERSION}`;
const PAGE_CACHE = `chronicle-pages-${CACHE_VERSION}`;
const ASSET_CACHE = `chronicle-assets-${CACHE_VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE];

/** A standalone document — no app JS — so the fallback can never fail. */
const OFFLINE_URL = "/offline.html";

/** Precached on install — the bare minimum for a cold, offline start. */
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  // The command centre's poster frames (30 KB phone, 61 KB desktop), so the
  // panel still looks like itself offline. The clips are never precached —
  // they're megabytes, and they stream over range requests, which this worker
  // deliberately leaves alone.
  "/media/hero-poster.jpg",
  "/media/hero-poster-sm.jpg",
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
