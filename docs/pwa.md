# Installable app (PWA)

The Chronicle installs to a home screen / desktop and keeps working without a
connection. No PWA framework is used — the pieces are small and explicit.

## What's in the box

| Piece | File |
| --- | --- |
| Web app manifest | `public/manifest.webmanifest` |
| Service worker | `public/sw.js` |
| Offline fallback document | `public/offline.html` |
| Icons (192, 512, maskable, apple-touch) | `public/icons/*` |
| Icon generator | `scripts/generate-icons.py` |
| Pictures in the install dialog | `public/screenshots/*.jpg`, written by `scripts/seo-screenshots.ts` |
| The app: install banner, Settings and Appearance card | `src/components/pwa/install-prompt.tsx` |
| The app: SW registration, update toast, offline pill | `src/components/pwa/pwa-layer.tsx` |
| The public site: SW registration, "Install app" in the header, the offer on the home page | `src/components/marketing/install-app.tsx` |
| Registration, install state and hooks, for both | `src/lib/pwa.ts` |
| `theme-color` ↔ surface sync | `src/components/pwa/theme-color-sync.tsx` |
| Manifest link, icons, iOS meta | `src/app/layout.tsx` |
| No-store headers for `sw.js` / manifest | `next.config.mjs` |

## Installing

The app can be installed from the public site as well as from inside the app,
because the site is where people arrive.

- **On the public site**, an **Install app** button sits in the header beside
  *Sign in*, and the home page's "Works on any device" card offers the same.
  They appear only where they can help: when the browser is ready to install
  (Chrome, Edge, Android), on an iPhone or iPad, and in Safari 17 or later on a
  Mac. Elsewhere, and once the app is installed, they don't show at all.
- **In the app**, a banner appears bottom-right once the browser reports the
  app installable, and **Settings → Install the app** (also under the theme
  choices in Appearance) is always there, including after the banner was
  dismissed.
- **Chrome / Edge / Android** open the browser's own install dialog. With
  `screenshots` and a `description` in the manifest, Chrome shows its richer
  dialog: the pictures in `public/screenshots/`, wide ones on a computer and
  narrow ones on a phone.
- **iPhone and iPad** have no install API, so the steps are shown instead:
  Share → *Add to Home Screen*. **Safari on a Mac**: File → *Add to Dock*.
- Dismissing the app's banner suppresses it for 14 days
  (`upsc-chronicle-install-dismissed` in `localStorage`); Settings still offers it.

`beforeinstallprompt` often fires before React hydrates, so an inline script in
`app/layout.tsx` stashes the event on `window.__chronicleInstallEvent`.
`lib/pwa.ts` keeps one install state for the whole page and every button reads
it, so they change together: the browser's event can only be used once, and
after one button has opened the dialog the others stop offering it.

### Why the public site registers the worker too

Chrome still requires a service worker with a fetch handler before it shows
its own install offer (the address-bar icon, the Android banner) and fires
`beforeinstallprompt`. When the public site was split from the app, only the
app's pages registered the worker, so a visitor who came to the home page was
never offered the app. The public pages now register it as well, after the page
has finished loading and the browser is idle, so it never competes with what
the visitor came to see. It loads only `lib/pwa.ts`, none of the app.

Lighthouse and PageSpeed Insights no longer have a PWA section (it was removed
in Lighthouse 12), so they can't confirm any of this. Chrome DevTools →
Application → Manifest shows the manifest, its installability and any errors.

## Caching strategy

The service worker only ever touches **same-origin GET** requests. Supabase
auth/sync traffic, anything cross-origin, and all mutations go straight to the
network, untouched.

| Request | Strategy | Cache |
| --- | --- | --- |
| Documents (navigations) | network-first, with navigation preload → cached route → `offline.html` | `chronicle-pages-<version>` |
| `/_next/static/*`, `/_next/image` | cache-first (content-hashed, immutable) | `chronicle-assets-<version>` |
| Other static assets, fonts, images | stale-while-revalidate | `chronicle-assets-<version>` |
| `offline.html`, manifest, icons, loading animations | precached on install | `chronicle-shell-<version>` |
| RSC/flight payloads (`?_rsc`, `RSC:1`), `/api/*` | never cached (vary by header) | — |
| Video (`/media/*.mp4`) | never touched — range requests are left to the browser | — |

`<version>` is `CACHE_VERSION` in `public/sw.js`.

**Navigation preload** is switched on when the worker activates: the browser
starts the network request for a page while the worker is still waking up, and
the worker uses that response. A page therefore arrives as fast with the worker
as without it, which matters now that the public site runs it on every visit.

Pages are keyed by **pathname with the query stripped**, so `/journal?new=1`
reuses the cached `/journal` document — the app reads its own query string on
the client, so the HTML is interchangeable.

A route you have opened before works offline. A route you have never opened
falls back to `offline.html`, which is a standalone document with no app
JavaScript — it renders even when nothing else can, and reloads itself as soon
as the connection returns.

### Rolling out a new version

Documents are network-first, so a fresh build is picked up on the next online
navigation. When a new worker finishes installing, a *"A new version is
ready → Reload"* toast appears; accepting posts `SKIP_WAITING` and reloads once
the new worker takes control. Registrations are also re-checked on window focus
and hourly.

Bump `CACHE_VERSION` in `public/sw.js` to discard every previous cache on the
next activation (do this if a caching rule changes, not for ordinary releases).

`sw.js` and the manifest are served with `max-age=0, must-revalidate` via
`next.config.mjs`, so an update can never be blocked by a stale worker.

## The installed window

The manifest asks for `standalone`: the app opens in its own window with the
system's title bar, coloured by `theme_color`, and on a phone full screen. It
used to ask for `window-controls-overlay` first, which lets an app draw over its
title bar; this app draws no title bar of its own, so an installed window that
had it switched on had nothing to be dragged by. It was removed.

## Icons

`scripts/generate-icons.py` renders the Chronicle mark (the same ring-and-node
as `components/layout/logo.tsx`) in ivory over a vivid crimson plate, using only
the Python standard library. The icons kept the crimson brand plate when the app
moved to its Light, Dark and Lavender themes:

```bash
python3 scripts/generate-icons.py
```

It writes `icon-192`, `icon-512`, `icon-maskable-{192,512}` (mark inside the
80% safe zone) and `apple-touch-icon.png` into `public/icons/`. Re-run it after
changing the mark or the accent colour. `offline.html` hand-copies the Light
and Dark tokens (it can't import the app's CSS), so refresh it too if those move
— see `docs/design-system.md`.

## Notes and caveats

- The service worker is only registered in **production builds**
  (`next start`, or the deployed site) — `next dev` is left alone so HMR works.
  It is registered on every page, public and private, after the page has loaded.
- It needs a secure context: HTTPS, or `localhost`.
- Data already lives in `localStorage` and syncs to Supabase when online, so
  logging offline is safe; the sync provider pushes when the connection returns.
- With cloud sync enabled, an expired Supabase session cannot be refreshed
  offline, so a cold offline launch after the token expires shows the sign-in
  screen. Local-only builds (no Supabase env vars) are unaffected.
