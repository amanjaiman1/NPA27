# Bundle analysis

From `@next/bundle-analyzer` 14.2.35 (dev only, loaded when `ANALYZE` is set)
and `scripts/perf/bundle-report.mjs`. Sizes are gzip. Baseline data:
`docs/perf/bundle-baseline.json`. Re-create with `npm run perf:bundle`.

## First-load JavaScript per route (baseline)

| Route | First load | Largest parts |
| --- | ---: | --- |
| `/` | 121 KB | Next.js and React 131 · tailwind-merge 8 · marketing components 7 |
| `/welcome`, `/login` | 281–283 KB | Next.js 130 · framer-motion 34 · Supabase auth 25 · UI 11 · store 9 |
| `/dashboard` | 395 KB | Next.js 138 · framer-motion 35 · lucide icons 30 · UI 29 · Supabase auth 25 · shell 22 |
| other app pages | 362–390 KB | the same, plus the page |
| `/admin` | 307 KB | Next.js 131 · framer-motion 34 · Supabase auth 25 · UI 21 |

## Largest packages (all client chunks)

| Package | Size | Notes |
| --- | ---: | --- |
| next (with React DOM) | 202 KB over 48 chunks | the framework; ≈130 KB on every route |
| lucide-react | 183 KB over 57 chunks | per-icon modules, already tree-shaken; ≈25 KB per app page |
| framer-motion | 39 KB | every app and sign-in page (shell, dialogs, toasts) |
| @supabase/* | ≈52 KB | auth 25, PostgREST 9, storage 7, realtime 6, phoenix 4 |
| d3-force + d3-quadtree | 5.6 KB | Knowledge Graph only (already route-scoped) |
| tailwind-merge | 8 KB | `cn()` |

The public pages carry no account, store or Supabase code (checked by the SEO
audit), and stay that way.

## What changed

- **Prefetching**, the largest effect: the shell's links no longer prefetch
  on sight (`components/layout/app-link.tsx`), so an app page load no longer
  downloads every other page's code. Desktop: 768 KB → 387–543 KB of JavaScript
  per page load; mobile dashboard: 554 → 475 KB.
- **On first use**: search (⌘K), Appearance, the notification settings tab,
  the review form, and the morning check-in with its time picker, about
  20 KB of the shell's code, now load when they're opened (or in idle time).
  The feature tour already did.
- **No dependency removed or replaced, and no framework upgrade.** framer-motion
  and supabase-js are the largest candidates left; swapping them would touch
  most of the app and was out of scope.
