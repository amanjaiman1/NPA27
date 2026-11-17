# SEO audit

The state of the site before the public-site work, what was changed, and how the
result was checked. Dated 17 November 2026.

The full per-page results of the automated audit are in
[`seo-research/audit-latest.md`](seo-research/audit-latest.md). Re-create them
with `npm run seo:audit -- --out docs/seo-research/audit-latest.md`.

## Before (main at `2aead30`)

The deployment was the private app and nothing else. A search engine visiting
any address got the app's loading screen.

| Check | Before |
| --- | --- |
| Public pages | None. `/` was the dashboard; signed-out visitors were sent to `/welcome` by script in the browser |
| Content in the HTML | About 87 visible words on every page (the loading screen); everything else was drawn in the browser after sign-in |
| Titles | The same title on every address: "DoOrDie — Your Preparation, Documented" |
| Meta descriptions | One description shared by every address |
| H1 headings | None in the HTML |
| Canonical links | None |
| Robots rules | No robots meta tag and no `robots.txt` (404) |
| Sitemap | None (`/sitemap.xml` returned 404) |
| Open Graph and Twitter cards | None, so shared links had no image or summary |
| Structured data | None |
| Private pages | Not marked `noindex` |
| Preview deployments | Indistinguishable from production for a crawler |
| Search Console | Verification tag present (PR #40); nothing to index |

## What changed

| Problem | Fix |
| --- | --- |
| No public pages | A public site in `src/app/(marketing)/`: home, features, five feature pages, three free tools, six guides, about, contact, privacy policy, terms and disclaimer. 23 indexable addresses. |
| Content only drawn in the browser | Public pages are rendered on the server and contain their full text. They load none of the app's account or storage code. |
| The app at `/` | The app moved to `/dashboard`. Signed-in visitors opening `/` are sent there, and email links that land on `/` are passed to the confirmation or password screen. Every in-app link, notification, the service worker, the offline page and the installed-app start address were updated. |
| One title and description for everything | Each page's title and description are written once in `src/lib/seo/pages.ts` (guides in `src/content/blog/index.ts`) and checked for length and uniqueness. Titles use the template "Page \| DoOrDie". |
| No H1 | Exactly one H1 per public page, with headings in order. |
| No canonical | Every public page has a canonical link to its own address on the main domain (`NEXT_PUBLIC_SITE_URL`). |
| No robots rules | `src/app/robots.ts`: production allows everything except `/api/` and points to the sitemap. Previews and local builds disallow everything and every page says `noindex`. |
| No sitemap | `src/app/sitemap.ts`, generated from the same page list, with real last-modified dates. |
| Private pages indexable | Everything under `src/app/(product)/` (the app and sign-in screens) is `noindex, nofollow`. API responses send `X-Robots-Tag: noindex`. The 404 page is `noindex`. |
| No social cards | Open Graph and Twitter card tags on every page, with a 1200×630 image made from a real screenshot. |
| No structured data | Organization and WebSite on every public page; WebApplication (free, no ratings) on the home page; BreadcrumbList on inner pages; BlogPosting on guides. No FAQ markup, since Google no longer shows FAQ results, and no invented ratings. |
| No product images | 14 screenshots of the real app with a made-up sample account, in WebP, with descriptive alt text and fixed dimensions. |
| Claims the product can't back | "AI" labels removed from the study coach and mock recommendations, which are rule-based. Every feature page has a "What it doesn't do" section. |
| No trust pages | About, contact, privacy policy, terms and a disclaimer stating DoOrDie is not affiliated with UPSC or the Government of India. |
| No measurement | Optional Google Analytics 4, off unless configured, asking consent first, on public pages and sign-in screens only. |

## After: automated checks

`npm run seo:audit` builds the site as production (placeholder domain
`https://doordie.example`, mock Supabase) and checks every sitemap address.

**Result: 0 failures, 0 warnings.**

| Check | Result |
| --- | --- |
| Sitemap | 23 addresses, all on the canonical domain, all with last-modified dates |
| Status | All 23 return 200 |
| H1 | Exactly one on every page |
| Titles | Present and unique, 23 to 64 characters |
| Descriptions | Present and unique, 104 to 172 characters |
| Canonical | Every page points to itself |
| Open Graph and Twitter | Absolute image URL, title and `summary_large_image` on every page |
| Structured data | Present and valid JSON on every page |
| Images | None without alt text |
| Internal links | 26 link targets checked, none broken, no orphan pages |
| Text in the HTML | 1,822 words on the home page, 1,080 to 1,170 on feature pages, 1,400 to 1,750 on guides |
| App code on public pages | None of the account or storage code loads on any public page |
| JavaScript per public page | 103 to 105 KB compressed for most pages; 106 to 118 KB for the three tools |
| Private routes | All 12 checked are `noindex` and absent from the sitemap |
| Unknown addresses | Return 404 with `noindex` |
| API | `X-Robots-Tag: noindex` |

From `next build` (First Load JS): public pages 102 to 117 kB, of which 87.6 kB
is the framework code shared by every page (unchanged by this work). App pages
are 113 to 271 kB.

## Other validation

| Check | Result |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | No errors |
| Lint (`npm run lint`) | No warnings or errors |
| Tailwind opacity guard (`npm run check:classes`) | Clean (192 files) |
| Unit tests (`npm test`) | 26 of 26 pass |
| Browser tests (`npm run test:e2e`) | 14 of 14 pass: account isolation, two devices, simultaneous edits, database access with another account's token, sign-out, the owner's existing data, a fresh account, account deletion, password reset and expired links |
| Email links landing on `/` (checked by hand in a browser) | An expired link reaches the "This link can't be used" screen; a reset link reaches `/reset-password`; a stored session goes to `/dashboard`; a plain visit and a `#section` link stay on the home page |
| Visual review | Public pages reviewed as screenshots at phone and desktop widths, with layout fixes made |

## Not checked here

These need the live site or tools that could not run in the build environment:

- **Lighthouse / PageSpeed.** Not run: Lighthouse could not drive the browser
  in the build environment. Run [PageSpeed Insights](https://pagespeed.web.dev/)
  on the home page and a guide after deploying
  ([`SEO_SETUP_GUIDE.md`](SEO_SETUP_GUIDE.md), step 7). Real-user Core Web
  Vitals appear in Search Console once enough people have visited.
- **Google's own tools.** The Rich Results Test, the Schema Markup Validator
  and Search Console's URL Inspection need the public address. The home page's
  WebApplication markup is expected not to produce a rich result, because
  Google requires ratings for that and the site has none it could honestly
  show.
- **The real domain.** All checks used a placeholder domain. Canonical links
  and the sitemap are only right in production once `NEXT_PUBLIC_SITE_URL` is
  set to the main domain.
- **Indexing and rankings.** Search engines decide when to crawl and how to
  rank. Expect weeks before pages appear and months before positions settle.

## Known limitations

- The guides and tools are in English only. Hindi is deferred until the app has
  a Hindi interface ([`SEO_KEYWORD_MAP.md`](SEO_KEYWORD_MAP.md), cluster H).
- The `sign_up` analytics event can be missed when Supabase's "Confirm email" is
  off, because the app opens immediately. Supabase's user list is the reliable
  count.
- The domain is new and has no links from other sites. That, more than anything
  on the page, limits how quickly it can rank;
  [`SEO_COMPETITOR_ANALYSIS.md`](SEO_COMPETITOR_ANALYSIS.md) lists honest ways to
  earn links.
