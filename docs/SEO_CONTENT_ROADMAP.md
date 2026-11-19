# SEO content roadmap

What is published, what to write next and when, and the rules every page
follows. Keywords and their target pages are in
[`SEO_KEYWORD_MAP.md`](SEO_KEYWORD_MAP.md).

The plan assumes one person writing alongside their own preparation: **two
pieces a month**. A smaller number of careful pages does more for a new site
than a large number of thin ones. If a month is busy, skip it rather than
publish something rushed.

## Published (17 November 2026)

| Type | Page | Primary keyword |
| --- | --- | --- |
| Home | `/` | free UPSC tracker (since 19 November 2026; was UPSC preparation tracker) |
| Overview | `/features` | UPSC preparation app |
| Feature | `/upsc-syllabus-tracker` | UPSC syllabus tracker |
| Feature | `/daily-study-tracker` | UPSC daily study tracker |
| Feature | `/upsc-revision-tracker` | UPSC revision tracker |
| Feature | `/upsc-progress-tracker` | UPSC progress tracker (since 19 November 2026) |
| Feature | `/upsc-study-planner` | UPSC study planner |
| Tool | `/resources/upsc-prelims-2027-countdown` | days left for UPSC Prelims 2027 |
| Tool | `/resources/spaced-revision-calculator` | spaced repetition calculator |
| Tool | `/resources/weekly-review-template` | UPSC weekly review template |
| Guide | `/blog/how-to-track-upsc-preparation` | how to track UPSC preparation |
| Guide | `/blog/how-many-hours-to-study-for-upsc` | how many hours to study for UPSC |
| Guide | `/blog/upsc-revision-schedule-spaced-repetition` | spaced repetition for UPSC |
| Guide | `/blog/how-to-analyse-upsc-mock-test` | how to analyse UPSC mock test |
| Guide | `/blog/how-to-make-upsc-study-plan` | how to make a UPSC study plan |
| Guide | `/blog/consistency-in-upsc-preparation` | how to maintain consistency in UPSC preparation |

Plus `/resources`, `/blog`, `/about`, `/contact`, `/privacy-policy`, `/terms`
and `/disclaimer`.

## Next pieces, month by month

Dates follow UPSC's calendar for CSE 2027: notification on 13 January 2027,
applications until 2 February, Prelims on 23 May, Mains from 20 August
([UPSC exam calendar](https://upsc.gov.in/examinations/exam-calendar)).

| When | Piece | Keyword (cluster) | Leads to | Notes |
| --- | --- | --- | --- | --- |
| December 2026 | Guide: UPSC study plan for working professionals | upsc study plan for working professionals (C, G) | `/daily-study-tracker`, `/upsc-study-planner` | Realistic weekday and weekend hours, what to drop, using a minimum day. No invented success stories. |
| December 2026 | Tool: printable UPSC syllabus checklist | upsc syllabus checklist, upsc syllabus tracker pdf (B, G) | `/upsc-syllabus-tracker` | Built from the app's topic list (`src/lib/seed.ts`) and checked line by line against the syllabus in UPSC's notification. Print-friendly, like the weekly review template. |
| January 2027 (by 13 Jan) | Update: countdown page | upsc calendar 2027 (C) | — | Add the notification's facts when UPSC publishes them: application window, any change to dates. Bump `updated` in `src/lib/seo/pages.ts`. |
| January 2027 | Guide: a UPSC daily timetable | upsc daily timetable, upsc daily routine (C) | `/upsc-study-planner` | Example days for full-time and working aspirants. Links to the study-hours guide rather than repeating it. |
| February 2027 | Guide: how to keep a UPSC mistake notebook | upsc mistake notebook (E) | `/upsc-revision-tracker` | Error types, rewriting a mistake as a question, recall checks. |
| February 2027 | Tool: printable daily planner | upsc daily planner pdf (C, G) | `/upsc-study-planner` | One page: blocks, revision due, mistakes to recall, a two-line evening review. |
| March 2027 | Guide: the last ten weeks before Prelims | (new research needed) | `/upsc-revision-tracker`, `/upsc-progress-tracker` | Revision rounds, mock frequency, CSAT practice. Research the keyword first. |
| March 2027 | Refresh: mock test analysis guide | how to analyse UPSC mock test (E) | — | Re-check the marking scheme against the 2027 notification. |
| April 2027 | Guide: how to choose a UPSC preparation app | best app for upsc preparation (A) | `/features` | Fair criteria (privacy, cost, ads, offline, data export, what it does not do), stating plainly that DoOrDie is ours. |
| May 2027 (after 23 May) | Update: countdown page | days left for UPSC Prelims 2027 (C) | — | Say Prelims 2027 is over and count down to Mains on 20 August. See "Year-specific pages" below. |
| June 2027 | Guide: getting back on track after Prelims | (new research needed) | `/daily-study-tracker` | A short reset week for Mains or for the next attempt. |
| July 2027 | Guide: tracking Mains answer-writing practice | (new research needed) | `/upsc-progress-tracker` | The mock tracker already records Mains tests as score out of maximum. |

Later, when there is time: studying for UPSC alongside college (C, G); your
first 30 days of preparation (F), only with a distinct angle; a printable mock
analysis sheet (E).

## Bigger bets (product decisions, not SEO tasks)

These would open new searches but change the product, so they are the owner's
call:

- **A study timer.** The most common feature in competitors' pitches
  ([`SEO_COMPETITOR_ANALYSIS.md`](SEO_COMPETITOR_ANALYSIS.md)). It would make the
  daily tracker page stronger for "study hours" searches.
- **A public, browsable syllabus.** Topic pages built from the app's syllabus.
  Only worth doing if each page adds something UPSC's PDF does not, such as
  a suggested revision order or links to the guides; otherwise they are thin
  duplicates.
- **Hindi.** Requires a Hindi interface and a fluent writer first. See cluster H
  in the keyword map.
- **A Play Store listing** that wraps the existing web app (a Trusted Web
  Activity). Google charges a one-time developer registration fee, so this is
  not free.

## Editorial checklist

Every new page or guide, before it is merged:

- [ ] Its primary keyword is in the keyword map, and no other page owns it.
- [ ] Title under about 60 characters, with the keyword near the start. Meta
      description between about 120 and 160 characters, written as a summary a
      person would click.
- [ ] One H1. Headings describe what the section says, not a teaser.
- [ ] It answers the question in the first few paragraphs, then adds the detail.
- [ ] Every factual claim about the exam links to UPSC's own notice or calendar.
      Claims about learning or sleep cite the research.
- [ ] No invented numbers, quotes, testimonials, ratings or "toppers say"
      claims. Examples are labelled as examples.
- [ ] Product mentions describe what the feature does today, including what it
      does not do. No "AI" claims (the study coach is rule-based).
- [ ] No promise of selection, ranks or results.
- [ ] Links to the one feature page it leads to and to at least two related
      guides or tools, and at least one existing page links back to it.
- [ ] Images have alt text that describes them. Screenshots use the sample
      account, never real data.
- [ ] Registered in `src/content/blog/index.ts` (guides) or
      `src/lib/seo/pages.ts` (pages), so it reaches the sitemap, breadcrumbs and
      footer.
- [ ] `npm run seo:audit` passes.

## Refresh rules

- **Exam dates.** Update the countdown page, and any guide that mentions a date,
  on the day UPSC publishes a notification, a revised calendar or a result date.
- **`updated` dates.** Change a page's `updated` value only when its content
  changes in a way a reader would notice. Fixing a typo is not an update.
- **Twice a year,** re-read every guide: check facts and links, and remove
  anything that is no longer true of the product.
- **Year-specific pages.** The countdown URL contains "2027" because the search
  does. When UPSC publishes the CSE 2028 calendar (the 2027 one came out on 20
  May 2026), add `/resources/upsc-prelims-2028-countdown`, link to it from the
  2027 page, and keep the 2027 page up with a note that the exam has passed.
  Don't redirect it while it still gets visits.
- **Search Console signals** (after the site has three months of data):
  - A page with impressions but few clicks: rewrite its title and description.
  - A page ranking for a search it doesn't answer well: add a section that
    answers it, or note the search in the keyword map for a new page.
  - A page with no impressions after three months: check the keyword map for
    intent mismatch, and improve or merge it.
  - Two pages appearing for the same search: make one the clear answer and
    link the other to it.

## Measuring it

- **Search Console:** impressions, clicks and average position per page and per
  search, and indexing status. Review monthly (about 30 minutes). See
  [`SEO_SETUP_GUIDE.md`](SEO_SETUP_GUIDE.md).
- **GA4 (if enabled):** `cta_click` (which sign-up buttons are used),
  `tool_use` (the free tools) and `sign_up`, counted only for visitors who
  allowed analytics.
- **Sign-ups in Supabase:** the number that matters, under Authentication →
  Users.
