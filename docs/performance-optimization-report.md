# Performance optimization report

What was changed, why, and what it measured afterwards. The before numbers
and the conditions are in [`performance-baseline.md`](performance-baseline.md);
how to repeat them, in [`performance-testing-guide.md`](performance-testing-guide.md).
All figures are laboratory measurements (production build, mock Supabase,
Playwright with DevTools throttling). No physical device and no field data.

## 1. Sign-out

**Before:** a full sync with an 8 s timeout, then (if anything was unsynced) a
blocking dialog, then push clean-up in series, then the library's sign-out
waiting on the server (a full reload when offline).

**Now** (`components/account/account-session.tsx`, `components/auth/auth-provider.tsx`, `lib/push.ts`):

1. "Signing out…" at once; a second press does nothing; the app unmounts, so
   nothing more can be edited. `/welcome` is prefetched meanwhile.
2. Edits are already in the browser under the account's own key (the store
   writes on every change), so nothing depends on the network for durability.
3. One last save and the push request run **in parallel**, sharing a 1 s wait
   (`SIGN_OUT_SYNC_WAIT_MS`). No dialog: if the save doesn't make it, the
   changes stay on this device for this account and sync at the next sign-in;
   the welcome screen says so (`/welcome?unsynced=1`). The local copy is
   erased only when the cloud confirmed it (or the syncing tab knows nothing
   is pending).
4. Unloading keeps the existing order: writes off and storage detached before
   memory is cleared (`lib/account/session.ts`, unchanged).
5. The library's sign-out (`signOut({ scope: "local" })`) gets 1.2 s (300 ms
   when the save already found the connection slow). If it hasn't finished,
   or it reports the server couldn't be told, the device is signed out anyway
   and the library finishes in the background; only once it has stopped is the
   saved session removed, so nothing can write it back. A marker
   (`lib/sign-out-marker.ts`) makes a reload, the app's gate and the home
   page's redirect treat that account as signed out meanwhile; a new sign-in
   waits for the old sign-out to finish.
6. Push (`releasePushSubscription`): the server request (with the token,
   `keepalive`) and the browser's `unsubscribe()` start together; no wait for
   `serviceWorker.ready`. If the browser couldn't unsubscribe, the endpoint is
   remembered and ended when the app next opens (`retryPushRelease`), unless the
   browser was subscribed again since. Ownership checks on the server are
   unchanged.

Also: the sync engine's reads now use `.retry(false)` (the client's built-in
1 s/2 s/4 s retry made every offline read take 7 s; the engine has its own
backoff), and the Admin Center's sign-out uses the same push release.

| Sign-out, button to welcome heading | Desktop before → after | Mobile before → after |
| --- | --- | --- |
| Nothing pending | 461 → **408 ms** | 884 → **703 ms** |
| A change unsaved | 670 → **557 ms** | 3 050 → **1 653 ms** (feedback 2 645 → 305) |
| Push on this device | 909 → **417 ms** | 1 430 → **781 ms** |
| Slow connection | 5 217 → **1 650 ms** (feedback 3 632 → 303) | 7 635 → **1 822 ms** (feedback 5 677 → 327) |
| Supabase unreachable | 8 207 + dialog → **402 ms**, no dialog | 10 619 + dialog → **734 ms**, no dialog |

On the slow connection the saved session is gone from the browser about 3 s
after pressing Sign out (the library finishing in the background), guarded by
the marker until then. Mobile "a change unsaved" is over 1 s because the save
itself needs most of the 1 s window on the throttled upload; when it misses,
the change stays local and syncs at the next sign-in.

`/welcome` is the post-sign-out page and exists (`(product)/(auth)/welcome`);
`/` stays the public home page and no longer redirects an account that is
still finishing its sign-out back to the dashboard. No redirect loop was found.

## 2. Startup, reload and sign-in

- Habit settings are worked out once per habit object (a `WeakMap`; habits are
  immutable records), and the activity layer (`habitContext`) is shared by the
  notifications, dashboard, coach and reviews for the same records.
- The notification rules no longer run in the first render or in the render
  of a tap: they wait for the first paint and then follow the store through
  `useDeferredValue`; the minute tick is a transition. Read state is only
  pruned once the evaluation is current.
- A load no longer writes the whole store back (`updateNotifySettings({})`
  made a full write on every hydration).
- A fresh device downloads the snapshot directly (no version request first).
- `/login` and `/signup` warm the dashboard's code in idle time.

| | Before → after |
| --- | --- |
| Heavy account, mobile, warm reload: heading / TBT | 2 033 / 788 → **712 / 124 ms** |
| Sign-in to dashboard: desktop / mobile | 1 205 / 4 590 → **715 / 4 209 ms** |
| Calculations, heavy (Node): notifications / habits today / 90-day consistency / coach briefing | 114 / 104 / 117 / 116 → **11.5 / 4.1 / 4.6 / 11.2 ms** |

## 3. Rendering

- **Sync status has its own context** (`useSyncStatus`). `useAccount()` is
  now stable for the whole session, so a save no longer re-renders the shell
  (412 components, twice per save, in the baseline profile).
- **Study Coach** read the whole store (`useChronicle((s) => s)`), rebuilding
  every view on any change; it now reads its record slices.

| Mobile interaction (slowest event) | Before → after |
| --- | --- |
| Tick a habit, typical account | 160 → **96 ms** |
| Tick a habit, heavy account | **1 752 → 176 ms** (longest task 2 027 → 155) |
| Open search, typical | 88 → **24 ms** |

| Total Blocking Time, mobile, heavy account | Before → after |
| --- | --- |
| My Habits | 2 073 → **237 ms** |
| Study Coach | 2 029 → **497 ms** |
| Performance Review | 2 233 → **893 ms** |
| Dashboard | 948 → **329 ms** |
| Journal / Diary / Roadmap | 582 / 588 / 496 → **230 / 337 / 239 ms** |

## 4. Navigation and what loads

- The shell's navigation (sidebar, rail, phone dock, top bar) uses `AppLink`:
  no prefetch on sight; the page loads when the pointer reaches the link, it is
  focused, or a finger lands on it. The dashboard and the four everyday pages
  are warmed one by one in idle time (`useIdlePrefetch`), skipped with Save-Data
  or 2G.
- Loaded on first use instead of with every page: search (⌘K), Appearance,
  the bell's settings tab, the five-step review form and the morning sleep
  check-in (each warmed on hover or focus, or in idle time).
- Shared layouts, the sidebar state and the route progress bar are unchanged.

| Per page load | Before → after |
| --- | --- |
| JS downloaded, desktop app pages | 768 KB → **387–543 KB** |
| Requests, desktop app pages | 106–111 → **45–69** |
| JS downloaded, mobile dashboard | 554 → **475 KB** |
| Mobile dashboard, typical: LCP / TBT | 3 744 / 249 → **3 498 / 158 ms** |

Navigation: the second visit to a page stays ≈25 ms on desktop. The first
visit to a page that isn't warmed now waits for its code (118 ms median on
desktop measured with a click that doesn't hover first; 33 ms before, when
everything had been prefetched). The harness now hovers 150 ms before the
click, as a pointer does; that run and a mobile navigation run are still to do
(see Limitations).

## 5. Home page and media

- The film no longer plays by itself on phones, with Save-Data, on a slow
  connection or with reduced motion: the cover and **Watch the film** (the
  cover stays the LCP image). On a computer it still starts by itself, after
  the page's `load` event and an idle moment.
- Captions are drawn by the page in a fixed-size box: the browser's caption box
  resized with every line and each change counted as a layout shift.

| Home page | Before → after |
| --- | --- |
| Mobile: bytes in the first 20 s / video | 4 292 KB / 3 814 KB → **485 KB / 0** |
| Desktop: CLS during the film | 0.124 → **0** |
| LCP (cover image), desktop / mobile | 296 / 1 056 → 300 / 1 064 ms (unchanged) |

## 6. Supabase and network

- Offline failures are reported at once instead of after 7 s of hidden retries.
- One round trip less on a fresh device's first sync.
- The mock gzips JSON as Supabase does, so lab payloads match production.
- No new tables, policies, Realtime channels, polling or paid services. RLS,
  the versioned save, the three-way merge and account-scoped storage are
  unchanged. No user-specific response is cached anywhere new.

## 7. Regression results

| Check | Result |
| --- | --- |
| `npm test` | 255/255 pass (same as baseline) |
| `npx tsc --noEmit`, `npm run lint`, `npm run check:classes` | clean |
| `npm run test:db` | all suites pass on the baseline; no SQL or migration changed |
| `npm run test:e2e` | 20/20 scenarios pass (sign-out, isolation, two devices, merges, files, deletion, password reset) |
| `npm run test:e2e:admin` | see the pull request description for the run on the final build |

## 8. Remaining limitations

- No physical-device or field (CrUX/RUM) data; all numbers are emulation.
- Lighthouse couldn't run in this sandbox; run PageSpeed Insights on the
  deployed site.
- Mobile app pages still reach LCP at ≈3.5 s on the throttled profile: about
  470 KB of JavaScript (framework 130 KB, framer-motion 35 KB, Supabase 52 KB,
  icons ≈25 KB) on a 1.6 Mbps link, and the static HTML of app pages is a
  boot screen until JavaScript runs. Replacing framer-motion or rendering the
  shell on the server were out of scope.
- Navigation on a phone was measured afterwards (section 9). Service-worker
  start-up time and the first page change after a new deploy (which reloads
  the whole app) are still unmeasured.
- Store persistence still serialises the whole snapshot on each change
  (≈5 ms desktop, ≈20 ms mobile for the heavy account). Deferring it would
  widen a cross-tab race and a crash window, so it was left as it is.
- The React profile was not re-taken after the changes; the interaction and
  TBT numbers above are the evidence.

## 9. Follow-up: the progress bar, and page changes on a phone

Reported from a phone: the bar along the top ran to its end, but the page
(Journal, and many others) opened a long time after.

**Why.** The bar gave up after eight seconds: a page change that took longer
lost its bar, and the page arrived later with nothing on screen saying so.
Reproduced by holding each page's data back nine seconds
(`npm run perf:nav -- --slow-data 9000`): the bar went at 8.0 s and the
pages arrived at 9.4–9.6 s, every time. It also finished as soon as the
address changed, even if what arrived was a stand-in (the route's
loading.tsx, which phones don't show, or a page still waiting for this
device's data).

**The bar now** (`components/layout/route-transition.tsx`):

- finishes when the address has changed *and* nothing stands in for the
  page: the stand-ins (`Loading`, `PageLoading`, `BootScreen`) render
  `RouteProgressHold`;
- never gives up while the next page's data or code is still downloading
  (it counts the router's `_rsc` requests and the code `<script>`/stylesheet
  elements added to `<head>`) or while a whole new document is loading. It
  stops only after five seconds with nothing loading and the address
  unchanged: the tap led nowhere;
- ignores taps and pushes to the page already open, and back/forward between
  hashes of one page (Settings' sections), which used to start a bar nothing
  would finish;
- keeps creeping after eight seconds (to 97% over 40 s), so a long wait never
  looks finished.

**Page changes are quicker:**

- Router cache (`next.config.mjs`, `experimental.staleTimes`): a page the
  tab already has is reused for 30 minutes if it was warmed, five if it was
  only opened, instead of Next's five minutes and 30 seconds. Safe because
  nothing the server sends is personal or changes before the next build.
- Journal days (`journal/[date]`) are built once per date and then served as
  static pages, instead of a server render for every visit and prefetch.
- Each device also warms the four pages it opens most from the menu
  (`mostVisited` in `app-link.tsx`), beside the dock's pages.

Lab results, mobile profiles, typical account (`docs/perf/nav-*.json`):

| Page changes | Before → after |
| --- | --- |
| Page data held back 9 s: bar finishes (content at 9.4–9.6 s) | at 8.0 s, 1.4–1.6 s early → **with the page**, within 25 ms of it |
| Menu pages, first visit, mobile: bar finishes vs page | −33 to +1 ms → −31 to +2 ms (unchanged: already right) |
| Weaker connection (400 ms, 500 kbps), dock and menu pages after 5 min of use | 397–621 ms → **74–203 ms** |
| Dock pages in the first minutes | 66–215 ms (unchanged) |

Also run, with no gap between the bar and the page before or after: code
held back 2.5 s (`nav-before-slowcode.json`), a heavy two-year account on
the weaker connection (`nav-before-mobile-slow-heavy.json`), and the
Command Center's own links tapped 35 s after it opened
(`nav-before-inpage*.json`). In the lab, Next waits for a page's code before
it changes the address, so a phone mostly sees the eight-second cut-off. The
reports from a real phone fit that: slow networks, a service worker that has
to start first, and a whole-app reload on the first page change after each
deploy can all take that long. The last two weren't measured.

`npm run perf:nav` re-runs all of this: `--profile mobile|mobile-slow|desktop`,
`--slow-data <ms>`, `--slow-code <ms>`, `--dataset heavy`, `--sw`,
`--stale` (waits out five minutes and opens every page again).
