# Performance testing guide

How the numbers in [`performance-baseline.md`](performance-baseline.md) and
[`performance-optimization-report.md`](performance-optimization-report.md)
were taken, and how to take them again. Everything runs locally against the
mock Supabase (`scripts/mock-supabase.mjs`); no real account is touched. Each
script leaves a build pointed at the mock, so run `npm run build` before using
the app for real.

## Tools

| Command | What it measures | Output |
| --- | --- | --- |
| `npm run perf:measure -- --label <name>` | Builds, then: cold loads of the public pages and 12 app routes, a warm reload, navigation, interactions, sign-in/sign-out in five network situations, the home film | `docs/perf/<name>.json` |
| `npm run perf:compute` | The pure calculations (notifications, habits, coach, reviews, persistence) over a typical and a heavy account | printed table |
| `npm run perf:render -- --label <name>` | React commits and components rendered per interaction, from a profiling build | `docs/perf/render-<name>.json` |
| `npm run perf:bundle` | Builds with the bundle analyzer and reports each route's first-load JavaScript by package | `docs/perf/bundle-latest.json` |
| `node --import tsx scripts/perf/lighthouse.mjs --label <name>` | Lighthouse, mobile and desktop presets (needs `lighthouse` installed; see below) | `docs/perf/lighthouse-<name>.json` |

Useful `perf:measure` flags: `--no-build` (reuse the last mock build),
`--profiles desktop,mobile`, `--runs 3`,
`--only public,routes,heavy,reload,nav,logout,interact,film`,
`--variants clean,pending,push,slow,unreachable`. `npx playwright install
chromium` once.

## Conditions

- **Desktop**: 1440×900, DPR 1, no CPU slowdown, 40 ms RTT, 10 Mbps.
- **Mobile**: 412×823, DPR 1.75, touch, 4× CPU slowdown, 150 ms RTT, 1.6 Mbps
  down, 675 kbps up (Lighthouse's mobile throttling, applied with
  `Network.emulateNetworkConditions` and `Emulation.setCPUThrottlingRate`).
- Service workers are blocked in measured contexts, so repeat visits don't come
  from the worker's cache. Cold loads clear the HTTP cache but keep the
  account's data on the device (a returning user).
- Accounts come from `scripts/perf/dataset.ts`: *typical* (153 KB) and
  *heavy* (two years, 1.8 MB). Both are invented.

## What each number means

- **heading / ready**: when the page's heading (`main h1`, or `h1` outside the
  app) first had a size. The moment the page is usable.
- **FCP, LCP, CLS**: from the browser's Performance Observer, as the Web
  Vitals library computes them (CLS with session windows).
- **TBT**: long tasks after FCP, minus 50 ms each, within the settle window
  (2 s desktop, 3 s mobile). An approximation of Lighthouse's TBT.
- **INP proxy**: for each scripted interaction, the slowest Event Timing entry
  with an interaction id. Field INP needs real users.
- **Sign-out**: from the press of Sign out to the welcome heading; *feedback*
  is when "Signing out…" appears; *sessionGoneMs* is when the saved session
  left the browser. Variants: *clean*; *pending* (a setting switched just
  before); *push* (a stand-in push subscription whose unsubscribe takes
  400 ms); *slow* (every Supabase request 1.5 s late); *unreachable* (every
  Supabase request fails).
- **JS / KB / requests**: what the browser downloaded during the load and the
  settle window, from the DevTools network events (compressed sizes).

## Lighthouse

`npm i -g lighthouse@12`, then the script above (`LIGHTHOUSE=/path/to/bin`
to point at another install). In the sandbox these numbers were taken in, it
couldn't run: the full Chrome binary exits in its crash handler and the
headless shell times out on Lighthouse's protocol calls. On a normal machine,
or with PageSpeed Insights on the deployed site, it works as usual.

## Field data

Search Console's Core Web Vitals report and PageSpeed Insights' field section
fill in once enough Chrome users visit. Compare the 75th percentile, mobile
and desktop separately, against LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.

## Not covered

Physical phones, Safari and iOS, a real Supabase project's latency, and a
service-worker update cycle were not measured. Check those by hand before
relying on the lab numbers for them.
