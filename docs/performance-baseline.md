# Performance baseline

Measured on `main` at `90d9fe6` (20 November 2026), before any change in the
`perf/fast-startup-logout-navigation` branch. Raw results are in `docs/perf/`
(`baseline-*.json`, `compute-baseline.md`, `bundle-baseline.json`,
`render-baseline-*.json`). How to repeat every number:
[`performance-testing-guide.md`](performance-testing-guide.md).

## What these numbers are

- **Laboratory data only.** A production build (`next build` + `next start`)
  against the local mock Supabase, driven by Playwright 1.65 in Chromium 159
  (headless shell) on an 8-core x86 server. No field (real-user) data was
  available: none is reported, and none should be inferred.
- **Profiles.** Desktop: 1440×900, no CPU slowdown, 40 ms RTT, 10 Mbps.
  Mobile: 412×823 at DPR 1.75, touch, **4× CPU slowdown**, 150 ms RTT,
  1.6 Mbps down / 675 kbps up (Lighthouse's mobile throttling). Emulation, not
  a physical phone.
- **Accounts.** *typical*: the demo's sample account (≈5 months, 153 KB).
  *heavy*: the same person two years in (731 journal days, 122 Roadmap plans,
  205 diary entries, 1.8 MB), close to the README's own size estimates.
- **Cold load** = empty HTTP cache, the account's data already on the device,
  service worker blocked. Medians of 3 runs (2 for some mobile scenarios).
  TBT is approximated from long tasks after FCP within the settle window.
- **Lighthouse could not run here**: the full Chrome binary dies in its crash
  handler under this sandbox, and the headless shell times out on
  Lighthouse's protocol calls. The same metrics were taken with Playwright and
  the Chrome DevTools Protocol instead (`scripts/perf/measure.mjs`).

## Sign-out (the reported problem)

Time from pressing **Sign out** to the welcome screen's heading. "Feedback" is
when "Signing out…" first appears.

| Situation | Desktop | Mobile |
| --- | ---: | ---: |
| Nothing pending | 461 ms (feedback 318) | 884 ms (feedback 350) |
| A change still unsaved | 670 ms (feedback 652) | **3 050 ms (feedback 2 645)** |
| Push notifications on this device | 909 ms | 1 430 ms |
| Slow connection (+1.5 s per Supabase request) | **5 217 ms (feedback 3 632)** | **7 635 ms (feedback 5 677)** |
| Supabase unreachable, change pending | **8 207 ms, after a confirmation dialog at 7 663 ms** | **10 619 ms, dialog at 7 855 ms** |

Causes, traced in the code:

1. `signOut` waited for `flush(8_000)` before showing anything.
2. With the network down, every sync read failed only after **7 s**: the
   Supabase client retries GET requests 3 times (1 s, 2 s, 4 s) by default,
   on top of the sync engine's own retries. That is the 7.7 s before the dialog.
3. An unsynced change then opened a blocking "Sign out anyway?" dialog.
4. Push clean-up ran in series: wait for the worker, a server request, then the
   push service.
5. The library's sign-out waited for the auth server's answer; offline it fell
   back to a full page reload.

## Data volume (the "mobile is laggy" problem)

Pure calculations over the two accounts, Node, one desktop core (a mid-range
phone is ≈4× slower):

| Calculation | typical | heavy |
| --- | ---: | ---: |
| Notifications: evaluate + inbox (runs on every store change) | 5.1 ms | **114 ms** |
| Habits: today + streaks (dashboard, habits page, coach) | 3.9 ms | **104 ms** |
| Habits: 90-day consistency | 5.7 ms | **117 ms** |
| Study Coach briefing / analysis | 5.0 / 5.5 ms | **116 / 117 ms** |

Cause: `habitStart` read every check-in of a habit, and streaks call it once
per day since the habit began: two years of history meant hundreds of
thousands of steps per evaluation.

In the browser (mobile profile, heavy account):

| | Value |
| --- | ---: |
| Ticking one habit: slowest event / longest task | **1 752 ms / 2 027 ms** |
| Total Blocking Time: My Habits / Study Coach / Performance Review | 2 073 / 2 029 / 2 233 ms |
| Total Blocking Time: dashboard | 948 ms |
| Warm reload of the dashboard: heading / TBT | 2 033 / 788 ms |

React profiler (profiling build, desktop CPU, `render-baseline-*.json`):
ticking a habit rendered 359 components in 2 commits, **410 ms** of React
work on the heavy account. Any saved change also re-rendered the whole app
shell (412 components) twice, because the sync status lived in the same
context as the account. An idle dashboard spent 80 ms rendering every minute
(the notifications clock).

## Page loads

| Route (typical account) | Desktop FCP / LCP | Mobile FCP / LCP / TBT | JS downloaded (desktop / mobile) |
| --- | --- | --- | --- |
| `/` (public) | 296 / 296 ms | 1 044 / 1 056 / 41 ms | 330 / 323 KB |
| `/welcome` | 528 / 528 ms | 2 748 / 2 748 / 0 ms | 331 / 331 KB |
| `/dashboard` | 676 / 820 ms | 3 392 / 3 744 / 249 ms | **768** / 554 KB |
| `/journal` | 656 / 804 ms | 3 376 / 3 736 / 221 ms | 774 / 551 KB |
| `/habits` | 636 / 752 ms | 3 284 / 3 624 / 214 ms | 768 / 567 KB |

Every app page downloaded about the same 768 KB of JavaScript on a laptop and
made 106–111 requests: Next prefetched every link in view, and the sidebar
shows sixteen, so each page load fetched the code of nearly every page. CLS was
0 on app pages.

## The public home page

- The film started by itself on every visit: **3.8 MB** of video in the first
  20 s on the mobile profile (720p file), 10.2 MB on desktop.
- Its native captions counted as layout shifts (≈0.06 per cue): **CLS 0.124**
  over a film run on desktop, above the 0.1 threshold.
- LCP is the cover image (`next/image` with `priority`): 296 ms desktop,
  1 056 ms mobile.

## Sign-in and network

- Sign-in (button to dashboard heading): 1 205 ms desktop, 4 590 ms mobile.
- A fresh device asked for the version, then downloaded the snapshot: two
  round trips where one would do.
- Every app open: one announcements call and one version check (plus CORS
  preflights). The mock did not compress responses; it now gzips JSON like
  Supabase's gateway, and the baseline above was taken with that.

## Checks on the unchanged code

`npm test` 255/255, `npm run lint` clean, `npx tsc --noEmit` clean,
`npm run check:classes` clean, `npm run test:db` all suites passed (schema and
10 migrations applied twice). No baseline failures.
