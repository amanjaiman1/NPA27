# SEO keyword map

Which searches the public site answers, which page answers each one, and which
searches it deliberately leaves alone. Check this file before writing a new page
or guide: every keyword has exactly one destination, so two pages never compete
for the same search.

Last researched: 17 November 2026. The "free" variants were checked again on
19 November 2026 (see [Positioning as a free UPSC tracker](#positioning-as-a-free-upsc-tracker)).

## How this was researched

- **Search suggestions.** `scripts/seo-suggest.mjs` asked Google's public
  autocomplete (India: `gl=in`) for 77 seed phrases across the clusters below,
  plus a–z expansions of five core phrases: about 290 requests. The raw results
  are in [`seo-research/suggestions-2026-11.json`](seo-research/suggestions-2026-11.json).
  Bing's suggestion endpoint returned nothing from the research environment, so
  the data is Google-only.
- **Search results.** The main phrases were searched by hand to see who already
  answers them (November 2026). That is the basis of the competition column and
  of [`SEO_COMPETITOR_ANALYSIS.md`](SEO_COMPETITOR_ANALYSIS.md).
- **No search volumes.** The project has no paid keyword tool, and
  autocomplete shows that a phrase is searched, not how often. No numbers in this
  file are volumes. Once the site is live, Google Search Console's impressions
  are the first real demand data; replace these judgements with them.

Re-run the research every three or four months: `npm run seo:suggest`.

### Columns

| Column | Meaning |
| --- | --- |
| **Intent** | *Tool*: wants a product or tracker. *Info*: wants an answer. *File*: wants a PDF, Excel or printable. *Nav*: looking for a specific site (often UPSC's own). |
| **Evidence** | What autocomplete showed: *exact* (the phrase itself is suggested), *n variants* (the phrase plus n related suggestions), *none*. |
| **Priority** | *P1*: the page exists to answer this. *P2*: covered by a section of a P1 page, or the next page to write. *P3*: later, or only with a distinct angle. |
| **Competition** | An estimate from the results seen, not a measured score. *Low*: small trackers, forum threads and document uploads. *Medium*: several dedicated products. *High*: large coaching institutes, edtech companies, news sites or UPSC itself. |
| **Status** | *Live*: published in this release. *Secondary*: a supporting keyword on a live page. *Planned*: in [`SEO_CONTENT_ROADMAP.md`](SEO_CONTENT_ROADMAP.md). *Not targeted*: deliberately skipped, with the reason. |

## One page per keyword

The primary keyword of every indexable page. The same values are in
`src/lib/seo/pages.ts` and `src/content/blog/index.ts`; keep the three in step.

| URL | Primary keyword | Secondary keywords |
| --- | --- | --- |
| `/` | free UPSC tracker | UPSC preparation tracker, upsc tracker, upsc tracker app, upsc tracker website, upsc study tracker, IAS preparation tracker, civil services preparation tracker |
| `/features` | UPSC preparation app | free upsc preparation app, free upsc app, upsc study tracker app |
| `/upsc-syllabus-tracker` | UPSC syllabus tracker | upsc syllabus tracker app, upsc prelims / mains / cse syllabus tracker, optional syllabus tracker |
| `/upsc-study-planner` | UPSC study planner | upsc study planner app, upsc planner, upsc planner 2027 |
| `/upsc-revision-tracker` | UPSC revision tracker | upsc revision planner, upsc revision plan, mistake notebook |
| `/upsc-progress-tracker` | UPSC progress tracker | UPSC preparation progress tracker, free upsc progress tracker, upsc mock test tracker, mock analytics |
| `/daily-study-tracker` | UPSC daily study tracker | upsc study hours log, upsc daily journal, upsc consistency tracker, upsc habit tracker |
| `/resources` | (hub page, no keyword) | free UPSC tools |
| `/resources/upsc-prelims-2027-countdown` | days left for UPSC Prelims 2027 | upsc countdown 2027, upsc countdown timer, upsc prelims 2027 date, upsc calendar 2027, upsc timetable 2027 |
| `/resources/spaced-revision-calculator` | spaced repetition calculator | revision date calculator |
| `/resources/weekly-review-template` | UPSC weekly review template | upsc weekly planner |
| `/blog` | (hub page, no keyword) | UPSC preparation guides |
| `/blog/how-to-track-upsc-preparation` | how to track UPSC preparation | how to track IAS preparation |
| `/blog/how-many-hours-to-study-for-upsc` | how many hours to study for UPSC | upsc study hours per day, how to track study hours |
| `/blog/upsc-revision-schedule-spaced-repetition` | spaced repetition for UPSC | upsc revision schedule, spaced repetition schedule for upsc, how to revise for upsc, upsc revision strategy |
| `/blog/how-to-analyse-upsc-mock-test` | how to analyse UPSC mock test | how to analyse upsc prelims mock test, mock test analysis sheet upsc |
| `/blog/how-to-make-upsc-study-plan` | how to make a UPSC study plan | upsc study plan, upsc 1 year study plan, upsc self study plan |
| `/blog/consistency-in-upsc-preparation` | how to maintain consistency in UPSC preparation | consistency in upsc preparation |

About, contact, the legal pages and the 404 page target no keyword.

Two pairs sit close together and are kept apart on purpose:

- **Revision guide and revision calculator.** The guide answers *how* to
  schedule revision (informational). The calculator *produces* the dates (tool).
  Each links to the other.
- **Study-hours guide and daily study tracker.** The guide answers *how many*
  hours. The feature page is for people looking for a tool to *log* them.

## Positioning as a free UPSC tracker

Since 19 November 2026 the site presents DoOrDie as a **free UPSC tracker**:
the home page's title, H1 and description lead with the phrase, and every
feature page's title and H1 say "free" (for example "Free UPSC Syllabus
Tracker with Topic-wise Progress"). It is simply true (there is no paid plan),
and people searching for a tool add the word: "free upsc app" alone has ten
suggestions.

What autocomplete showed on 19 November 2026 (India, Google):

| Phrase | Suggestions |
| --- | --- |
| free upsc tracker, upsc tracker free, best free upsc tracker | none |
| free upsc preparation tracker, upsc preparation tracker free | none |
| free upsc progress tracker, upsc progress tracker free, upsc progress tracker app | none |
| free upsc study tracker, free upsc syllabus tracker, free upsc study planner | none |
| upsc progress tracker | the phrase itself, then UPS and Royal Mail parcel tracking |
| upsc tracker app | the phrase, upsc syllabus tracker app, upsc study tracker app, and another product's app |
| upsc tracker website | the phrase, and another product's website |
| free upsc app | 10, including free upsc preparation app and free upsc preparation app in hindi |

No suggestions means a phrase is too rare for autocomplete to show, not that
nobody types it. The exact "free UPSC tracker" phrases look like low demand
and low competition: a page that says exactly that has a fair chance of ranking
for them, and Search Console will show whether anyone searches them. Ranking
first can't be promised for any phrase; it depends on links from other sites,
how long the site has been indexed and what competitors publish. See
[`SEO_SETUP_GUIDE.md`](SEO_SETUP_GUIDE.md) for asking Google to recrawl the
changed pages.

Not done, on purpose:

- **No separate "free UPSC tracker" page.** It would compete with the home
  page for the same search.
- **No invented ratings or user counts** in structured data (against Google's
  policies), and no FAQ markup (Google stopped showing FAQ results).
- **No keyword lists in the copy.** The structured data carries a short
  `keywords` field and an `alternateName`; Google may ignore both, and they
  do no harm.

## A. Product searches (looking for a tool)

Autocomplete confirms people look for a UPSC tracker by name, and want it free,
as an app, or as a sheet. Several short phrases belong to something else: "upsc
app" and "upsc dashboard" mean UPSC's own application portal, and "upsc
productivity" is a syllabus topic in ecology and economics.

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| free upsc tracker | Tool | none (see above) | `/` | P1 | Low (estimate) | Says "free UPSC tracker" in the title, H1 and description; what is free, honestly | From every feature page, guide and footer | Live |
| upsc preparation tracker | Tool | exact | `/` | P1 | Medium | What it tracks, real screenshots, honest limits, free | From every feature page, guide and footer | Secondary |
| upsc tracker app, upsc tracker website | Tool | exact (each), alongside other products' names | `/` | P2 | Medium | Say plainly it is a web app you can install | | Secondary |
| free upsc preparation app, free upsc app | Tool | 10 variants | `/features` | P2 | High | Every feature is free; it is a web app, not a store download | | Secondary |
| upsc tracker | Tool | 10 variants (app, pdf, excel, sheet, website) | `/` | P1 | Medium | As above | Logo and footer link to `/` | Secondary |
| upsc study tracker | Tool | 5 variants (app, pdf) | `/` | P1 | Medium | As above | | Secondary |
| ias preparation tracker, civil services preparation tracker | Tool | none (Google suggests "upsc preparation tracker" instead) | `/` | P2 | Low | Mention IAS and Civil Services in the copy where natural | | Secondary |
| upsc preparation app | Tool | 10 variants (free, download, by government, in hindi) | `/features` | P1 | High | Full feature list; say plainly it is a web app you can install, not a store app | Home, header, footer | Live |
| best app for upsc preparation | Tool, comparing | 10 variants (free, offline, hindi medium, reddit) | — | P3 | High | A fair guide to *choosing* a tracker, with criteria that do not assume DoOrDie wins | | Planned |
| upsc preparation app in hindi, best app for hindi medium | Tool | variants | — | — | High | Needs a Hindi interface first | | Not targeted (see H) |
| upsc app, upsc dashboard | Nav | 10 variants each (apply online, candidate login) | — | — | — | | | Not targeted: people want UPSC's portal |
| upsc preparation app by government | Nav | variant | — | — | — | | | Not targeted: DoOrDie is not a government app (see `/disclaimer`) |
| mission upsc tracker, upsc tracker pro, target upsc tracker | Nav | variants | — | — | — | | | Not targeted: other products' names |
| upsc productivity | Info | 10 variants (ecosystem, agricultural, labour productivity) | — | — | — | | | Not targeted: a syllabus topic, unrelated |

## B. Syllabus

Strong demand for the syllabus itself (the PDF, topic-wise, in Hindi), and
smaller but clear demand for a tracker, including "excel", "pdf" and "app"
versions and separate Prelims and Mains trackers.

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| upsc syllabus tracker | Tool | 7 variants (pdf, excel, app, mains, prelims, cse) | `/upsc-syllabus-tracker` | P1 | Medium | Papers covered, the five topic statuses, how weak papers show up, screenshots, limits | Home, features, tracking guide, study-plan guide | Live |
| upsc syllabus tracker app | Tool | variant | `/upsc-syllabus-tracker` | P1 | Medium | | | Secondary |
| upsc prelims syllabus tracker, upsc mains syllabus tracker, upsc cse syllabus tracker | Tool | variants | `/upsc-syllabus-tracker` | P2 | Low | Sections on the Prelims and Mains papers | | Secondary |
| upsc optional syllabus tracker | Tool | weak (2 suggestions) | `/upsc-syllabus-tracker` | P3 | Low | Explain how the optional is added | | Secondary |
| upsc syllabus tracker excel / pdf | File | variants | — | P2 | Medium | A real printable checklist, built from the app's topic list and checked against UPSC's notification | | Planned (printable syllabus checklist) |
| upsc syllabus checklist (pdf), prelims / mains syllabus checklist | File | 10 variants | — | P2 | Medium | Same printable checklist | | Planned |
| upsc syllabus, upsc gs syllabus, upsc syllabus pdf, topic wise | Info / File | 10 variants each | — | P3 | High | Would repeat UPSC's own notification; only worth it with a clear extra (for example, the syllabus mapped to a revision order) | | Not targeted for now |

## C. Planning, study hours and the exam calendar

The largest cluster. People want a planner (often as a PDF), a study plan for
their year or situation, a daily timetable, and an answer to "how many hours".
The exam calendar terms ("days left", "countdown", "calendar 2027") are frequent
and time-bound.

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| upsc study planner | Tool | 10 variants (pdf, excel, app, 2026, 2027) | `/upsc-study-planner` | P1 | Medium | Goals that measure themselves, the suggested day, weekly reviews; says there is no timetable editor | Home, features, study-plan guide | Live |
| upsc study planner app, upsc planner, upsc planner 2027 | Tool | variants (planner also: book, diary) | `/upsc-study-planner` | P2 | Medium | | | Secondary |
| upsc study planner pdf / excel, upsc daily planner pdf | File | variants | — | P2 | Medium | A printable daily planner page, same style as the weekly review template | | Planned |
| how to make a upsc study plan, upsc study plan | Info | 10 variants (for 2027, working professionals, beginners, 6 months) | `/blog/how-to-make-upsc-study-plan` | P1 | High | Work back from the exam date, phases, weekly planning, adjusting | → planner, countdown, calculator | Live |
| upsc study plan for working professionals, upsc time table for working professionals | Info | in 4 seeds | — | P2 | High | Realistic weekday and weekend hours, what to cut, how to track with little time | → daily tracker, study-plan guide | Planned (first) |
| upsc study plan for college students, how many hours to study for upsc with college | Info | variants | — | P3 | High | | | Planned |
| upsc 1 year study plan, upsc self study plan, without coaching | Info | variants | `/blog/how-to-make-upsc-study-plan` | P3 | High | | | Secondary |
| how many hours to study for upsc | Info | 10 variants (per day, prelims, mains, reddit, with college) | `/blog/how-many-hours-to-study-for-upsc` | P1 | High | No invented "topper" numbers; sustainable targets, focused vs total hours, tracking | → daily tracker, countdown | Live |
| upsc study hours, upsc study hours per day | Info | 10 variants | `/blog/how-many-hours-to-study-for-upsc` | P1 | High | | | Secondary |
| upsc daily timetable, upsc daily routine, upsc daily schedule | Info | 10 variants | — | P2 | High | Example days for full-time and working aspirants; must link to, not repeat, the hours guide | | Planned |
| days left for upsc prelims 2027, upsc prelims 2027 how many days left | Tool | 10 variants | `/resources/upsc-prelims-2027-countdown` | P1 | Medium | Day count rendered on the server and refreshed hourly; UPSC's dates with the source; study-hours planner | → planner, daily tracker, study-plan guide | Live |
| upsc countdown 2027, upsc countdown timer, upsc exam countdown | Tool | 10 variants | `/resources/upsc-prelims-2027-countdown` | P1 | Medium | | | Secondary |
| upsc prelims 2027 exam date, upsc calendar 2027, upsc timetable 2027 | Info / Nav | 10 variants each | `/resources/upsc-prelims-2027-countdown` | P2 | High | Must match UPSC's calendar; update when the notification is published (13 January 2027) | | Secondary |
| upsc weekly planner | Tool / File | exact | `/resources/weekly-review-template` | P3 | Low | | | Secondary |
| upsc monthly plan | — | 2 of 3 suggestions are about salary and payment | — | — | — | | | Not targeted: wrong intent |
| upsc daily target(s) | Nav | variants are mostly "Target UPSC" products | — | — | — | | | Not targeted: another brand |

## D. Revision

Clear demand for revision strategy and for spaced repetition by name. A
dedicated "revision tracker" is a small but exact match.

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| upsc revision tracker | Tool | exact | `/upsc-revision-tracker` | P1 | Low–Medium | The 1, 3, 7, 14, 30, 60 day ladder, overdue handling, mistakes returning, limits | Home, features, revision guide, calculator | Live |
| upsc revision planner, upsc revision plan | Tool | variants | `/upsc-revision-tracker` | P2 | Low | | | Secondary |
| spaced repetition for upsc, spaced repetition upsc | Info | 6 variants (schedule, what is, how often) | `/blog/upsc-revision-schedule-spaced-repetition` | P1 | Medium | What the research says, with citations; the ladder; missed revisions | → revision tracker, calculator | Live |
| upsc revision schedule, spaced repetition schedule for upsc | Info | variants | `/blog/upsc-revision-schedule-spaced-repetition` | P1 | Medium | | | Secondary |
| how to revise for upsc, how to revise upsc syllabus, upsc revision strategy | Info | 2–5 variants | `/blog/upsc-revision-schedule-spaced-repetition` | P2 | High | Avoid "toppers' strategy" claims | | Secondary |
| spaced repetition calculator, revision date calculator | Tool | not researched (no seed) | `/resources/spaced-revision-calculator` | P2 | Low (estimate) | Dates for six revisions, calendar file download | → revision guide, revision tracker | Live |
| upsc revision checklist | File | variant | — | P3 | Low | Could be part of the printable syllabus checklist | | Planned |

## E. Progress, mocks, mistakes and habits

Exact matches exist for "upsc progress tracker" and "upsc habit tracker".
"Progress tracker" is mixed up with parcel tracking (UPS), so at first the page
was given the longer "preparation progress tracker". Since 19 November 2026 it
targets "UPSC progress tracker" itself, the phrase people type, and keeps the
longer one as a secondary keyword. Mock analysis is a real how-to need.
"Mistake notebook" and "mock test tracker" show no suggestions.

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| upsc progress tracker, upsc preparation progress tracker, free upsc progress tracker | Tool | exact (mixed with UPS parcel tracking) | `/upsc-progress-tracker` | P1 | Low–Medium | Hours by subject, coverage, mock trends, negative-marking cost, reviews | Home, features, tracking guide, mock guide | Live |
| how to analyse upsc mock test, how to analyse upsc prelims mock test | Info | 4 variants | `/blog/how-to-analyse-upsc-mock-test` | P1 | High | Step-by-step, the real marking scheme (one-third penalty), error types | → progress tracker | Live |
| mock test analysis sheet upsc | File / Info | variant | `/blog/how-to-analyse-upsc-mock-test` | P2 | Medium | Could add a printable analysis sheet later | | Secondary |
| upsc mock test tracker | Tool | none | `/upsc-progress-tracker` | P3 | Low | | | Secondary |
| upsc daily journal, my upsc journal | Tool | variants (also physical "journal book" and another brand) | `/daily-study-tracker` | P2 | Medium | | | Secondary |
| upsc consistency tracker | Tool | only as "understand upsc consistency tracker / sheet", which looks like another product's name | `/daily-study-tracker` | P2 | Low | Streaks and heatmap | | Secondary |
| upsc habit tracker | Tool | exact | `/daily-study-tracker` | P2 | Low | | | Secondary |
| how to maintain consistency in upsc preparation | Info | 3 variants | `/blog/consistency-in-upsc-preparation` | P1 | High | Minimum day, forgiving streaks, slumps; sleep advice with sources | → daily tracker | Live |
| upsc mistake notebook | Info | none | — | P3 | Low | How to keep one and turn it into recall checks | → revision tracker | Planned |
| upsc study log, upsc error log | — | suggestions are "logo" and "login error" | — | — | — | | | Not targeted: wrong intent |

## F. How-to questions

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| how to track upsc preparation | Info | none (a Quora thread ranks for it) | `/blog/how-to-track-upsc-preparation` | P1 | Low–Medium | The closest guide to the product: what to record, a daily log, a weekly review | → all five feature pages | Live |
| how to track study hours | Info | 10 variants, mostly not UPSC | `/blog/how-many-hours-to-study-for-upsc` | P3 | Medium | Section on tracking hours honestly | | Secondary |
| how to start upsc preparation (from zero, after 12th, at home) | Info | 10 variants | — | P3 | High | Only with a distinct angle, for example "your first 30 days: set up, baseline, first review" | | Planned |
| how to prepare for upsc | Info | 10 variants | — | — | High | | | Not targeted: too broad; coaching institutes answer it with full courses |

## G. Long-tail, templates and files

People want files: Excel trackers, PDF planners, Notion templates. A page that
promises a file and then only offers the app would be a doorway page, so
templates are built only as real, usable files.

| Keyword | Intent | Evidence | URL | Priority | Competition | Content needs | Internal links | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| upsc weekly review template | File | not seeded; "weekly planner" seen | `/resources/weekly-review-template` | P2 | Low | Printable, no sign-up. Built because the weekly review is central to the guides. If Search Console shows no impressions after three months, keep it as a supporting page and don't expand it. | → progress tracker, tracking guide | Live |
| upsc tracker pdf, upsc study tracker pdf | File | 4 variants | — | P2 | Medium | The printable syllabus checklist and daily planner (B and C) | | Planned |
| upsc tracker excel, upsc tracker sheet | File | 2–4 variants | — | P3 | Medium | Only as a real spreadsheet download; possibly an export of your own data from the app | | Not targeted for now |
| upsc notion template | File | exact | — | — | Medium | | | Not targeted: would be a different product |
| upsc preparation for working professionals | Info | variants | — | P2 | High | The working-professionals guide (C) | | Planned |
| can i prepare for upsc while doing phd, upsc student diet plan, and similar | Info | single suggestions | — | — | — | | | Not targeted: off-topic for a tracker |

## H. Hindi

Hindi demand is large, in both Devanagari ("यूपीएससी की तैयारी कैसे करें",
"यूपीएससी सिलेबस", "यूपीएससी टाइम टेबल", "आईएएस की तैयारी": 10 suggestions each)
and Latin script ("upsc ki taiyari kaise kare", "upsc ka syllabus", "upsc time
table hindi", "upsc preparation hindi": 6 to 10 each). "upsc tracker hindi"
returned nothing.

**Decision: deferred.** The app's interface is English only, so a Hindi page
would bring Hindi-medium aspirants to a product they can't comfortably use.
Machine-translated pages would be low quality and are the kind of scaled content
search engines discount. Hindi pages become worth doing when:

1. The app has at least a Hindi onboarding and main screens.
2. Someone fluent writes and reviews the Hindi guides (not a translation of the English ones).
3. The site adds `/hi/` routes with `hreflang` links between the English and Hindi versions.
4. Keyword research is repeated in Hindi, Devanagari and Latin script separately.

| Keyword | Intent | Evidence | Status |
| --- | --- | --- | --- |
| यूपीएससी की तैयारी कैसे करें, upsc ki taiyari kaise kare | Info | 10 variants each | Not targeted (deferred) |
| यूपीएससी सिलेबस, upsc ka syllabus | Info / File | 10 variants each | Not targeted (deferred) |
| यूपीएससी टाइम टेबल, upsc time table hindi | Info | 6–10 variants | Not targeted (deferred) |
| upsc preparation app in hindi, best app for hindi medium | Tool | variants | Not targeted until the app has Hindi |

## Adding a keyword

1. Search this file for the phrase and close variants. If a page already owns
   it, improve that page instead of writing a new one.
2. Give the new page one primary keyword and add a row here with status
   *Planned*, then *Live* when it ships.
3. Set the same primary keyword in `src/lib/seo/pages.ts` or
   `src/content/blog/index.ts`.
4. Link to the new page from at least one related page, and from it to the
   feature page it leads to.
