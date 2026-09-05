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
| Install prompt + Settings card | `src/components/pwa/install-prompt.tsx` |
| SW registration, update toast, offline pill | `src/components/pwa/pwa-layer.tsx` |
| Install / SW hooks | `src/lib/pwa.ts` |
| `theme-color` ↔ surface sync | `src/components/pwa/theme-color-sync.tsx` |
| Manifest link, icons, iOS meta | `src/app/layout.tsx` |
| No-store headers for `sw.js` / manifest | `next.config.mjs` |

## Installing

- **Chrome / Edge / Android** — an install banner appears bottom-right after the
  browser reports installability; there's also a permanent **Install as an app**
  card in Settings (the palette icon), and the browser's own address-bar
  install button works.
- **iOS Safari** — no install API exists, so the banner shows the
  Share → *Add to Home Screen* recipe instead.
- Dismissing the banner suppresses it for 14 days
  (`upsc-chronicle-install-dismissed` in `localStorage`); Settings still offers it.

`beforeinstallprompt` often fires before React hydrates, so an inline script in
`app/layout.tsx` stashes the event on `window.__chronicleInstallEvent` and the
`useInstall()` hook picks it up.

## Caching strategy

The service worker only ever touches **same-origin GET** requests. Supabase
auth/sync traffic, anything cross-origin, and all mutations go straight to the
network, untouched.

| Request | Strategy | Cache |
| --- | --- | --- |
| Documents (navigations) | network-first → cached route → `offline.html` | `chronicle-pages-v1` |
| `/_next/static/*`, `/_next/image` | cache-first (content-hashed, immutable) | `chronicle-assets-v1` |
| Other static assets, fonts, images | stale-while-revalidate | `chronicle-assets-v1` |
| `offline.html`, manifest, icons | precached on install | `chronicle-shell-v2` |
| RSC/flight payloads (`?_rsc`, `RSC:1`), `/api/*` | never cached (vary by header) | — |

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

## Icons

`scripts/generate-icons.py` renders the Chronicle mark (the same ring-and-node
as `components/layout/logo.tsx`) in ivory over a vivid crimson plate — matching
the app's default Ivory + Crimson appearance — using only the Python standard
library:

```bash
python3 scripts/generate-icons.py
```

It writes `icon-192`, `icon-512`, `icon-maskable-{192,512}` (mark inside the
80% safe zone) and `apple-touch-icon.png` into `public/icons/`. Re-run it after
changing the mark or the accent colour. `offline.html` hand-copies the Ivory
surface tokens (it can't import the app's CSS), so refresh it too if those move
— see `docs/design-system.md`.

## Notes and caveats

- The service worker is only registered in **production builds**
  (`next start`, or the deployed site) — `next dev` is left alone so HMR works.
- It needs a secure context: HTTPS, or `localhost`.
- Data already lives in `localStorage` and syncs to Supabase when online, so
  logging offline is safe; the sync provider pushes when the connection returns.
- With cloud sync enabled, an expired Supabase session cannot be refreshed
  offline, so a cold offline launch after the token expires shows the sign-in
  screen. Local-only builds (no Supabase env vars) are unaffected.
