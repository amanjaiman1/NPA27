# Trust & Review system: architecture audit

Written before building the Trust & Review system, against `main` after the
Admin Center (PR #57). It records what already exists, what's missing, and
how the new parts attach to what's there. The rule throughout: **extend the
Admin Center, never duplicate it.** One role table, one `requireAdmin()`, one
audit log, one settings table, one changelog, one review table.

## 1. What already exists

### Admin Center (reused as is)

| Piece | Where |
| --- | --- |
| Roles (Super Admin, Admin, Moderator) | `public.platform_admin_memberships`; `src/lib/platform/roles.ts` mirrors `public.platform_permissions` (a test compares them) |
| Server-side checks | `requireAdmin()` in `src/lib/platform/server/auth.ts`; every `platform_admin_*` function calls `platform_assert()` again |
| Admin API | one route table, `src/lib/platform/server/admin-api.ts`, behind `src/app/api/admin/[...path]/route.ts`; every route declares a permission |
| Layout and navigation | `src/app/(product)/(admin)/admin/*`, `src/components/admin/*`, `src/lib/platform/nav.ts` (already has **Reviews** at `/admin/reviews`) |
| Audit log | `public.platform_admin_audit_log`, append-only, written by `platform_audit()` |
| Settings | `public.platform_settings` with typed keys (`SETTINGS` in `src/lib/platform/validate.ts`, `platform_setting_problem()` in SQL) |
| Changelog | `public.platform_changelog_entries`, `/admin/changelog`, public `/changelog` and `/changelog/<slug>` |
| Feedback | `public.platform_feedback` with `changelog_entry_id`, which already powers "You asked, we improved: N requests" |

### Reviews (extended, not replaced)

`public.platform_reviews` already has one review per account, rating,
headline, body, useful, private suggestions, features, stage, display name,
two separate consents with timestamps, six statuses (pending, approved,
rejected, published, hidden, withdrawn), a usage snapshot, the moderation
reason, a public response and dates. Students reach it only through
`platform_my_review`, `platform_submit_review`, `platform_set_review_consent`,
`platform_withdraw_review` and `platform_delete_my_review` (their own row,
via `auth.uid()`); moderators through `platform_admin_*_review`; visitors
through `platform_public_reviews`.

Eligibility is already computed from structured records, never from text:
`platform_usage_summary()` reads only the **dates** of journal days with study
hours, life entries, revision passes, habit check-ins, mocks and completed
Roadmap activities, clamped to the account's creation date. Thresholds (14
days, 5 usage days) are settings. Registration age alone never qualifies.

Students write a review in Settings → Review DoOrDie
(`src/components/settings/review-*.tsx`). Public reviews show on
`/testimonials` and in a strip on the home page and five feature pages.

### The rest of the product

- **Chronicle data** is one `chronicle_state` JSONB row per account, RLS-isolated,
  saved with versions. Reviews stay out of it.
- **Local and cloud modes** are chosen at build time (`isCloudConfigured`).
  `AccountSession` always activates an account and enables persistence;
  `scope.ts` drops every store write while no account is active.
- **Feature tour**: `src/components/tour/*`. Its "live pictures" are
  illustrations with fixed figures, not the real pages.
- **Synthetic data**: `sampleData()` inside `scripts/seo-screenshots.ts` builds a
  complete made-up account ("Meera") for the product screenshots. It isn't
  exported or deterministic across calls.
- **Public site**: `src/lib/seo/pages.ts` drives metadata, sitemap, footer and
  breadcrumbs; `pageMetadata()`, `softwareApplication()` and `breadcrumbList()`
  make metadata and JSON-LD; `npm run seo:audit` checks every sitemap URL.
- **Themes**: Lavender, Light and Dark (older "Blue Glass" opens as Light).

## 2. What's missing

| Wanted | Gap |
| --- | --- |
| Invitation in the app, with "later" and "no thanks" | None exists; students must find Settings |
| Multi-step review flow with the new questions | The form is one page; no "problem before", "how it changed", "advice to another aspirant", full-time or working, or display-name preference |
| Private feedback without a long text | `body` is required (30+ characters) even for a private review |
| Revision history for edits | Edits overwrite the row |
| Consent history | Only the latest consent and its time are kept |
| Keep or remove the published version while an edit waits | A material edit always takes the review down |
| Restore a hidden review, featured reviews, reason categories, submission source | Not modelled |
| Verification levels | Only the raw usage snapshot, admin-side |
| "Moderators may hide" and "Admins may read the audit log" switches | Fixed in the permission matrix |
| Public `/reviews` with stories, filters, statistics, detail pages | `/reviews` is the in-app Performance Review; the public page is `/testimonials` |
| `/demo`, `/trust` | Don't exist |
| Changelog "what changed", "why it matters", Accessibility, public feedback themes | Entries have a summary and a body only |
| Homepage trust narrative | A review strip only |

## 3. How it integrates

### Data (one additive migration, `20261210120000_trust_reviews.sql`)

- `platform_reviews` gains: `problem_before`, `change_note`, `aspirant_type`,
  `display_preference`, `consent_version`, `source`, `moderation_code`,
  `featured_at`/`featured_by`, `slug`, and `public_version`, the snapshot
  actually shown on the site. `body` becomes optional, and a public
  testimonial needs at least 30 characters of it.
- New tables, RLS on and no direct access, like every platform table:
  `platform_review_revisions` (earlier versions, kept on material edits),
  `platform_review_consent_events` (every grant and withdrawal, with the
  wording version), `platform_review_invitations` (postponed or dismissed).
- `platform_permissions()` keeps its matrix and gains two settings-driven
  switches: Moderators may hide and restore reviews (`reviews.hide`, on by
  default, as today) and Admins may read the audit log (off by default).
  `roles.ts` follows; the parity test covers every combination.
- New settings in the existing table: invitation on or off, edit policy,
  the minimum number of reviews before an average is shown, how long a
  review must be to get its own page, the activity needed for "Verified
  active user", and the tenure for "Established member".
- Changelog entries gain `what_changed`, `why_it_matters`, `asked_theme` and
  the Accessibility category. A feedback theme shows publicly only when
  real feedback is linked to the entry.

Nothing moves into `chronicle_state`, and no new role, audit or settings
table is created.

### Visibility rule

A review is on the website only while `public_version` holds a snapshot
**and** public consent is on. Publishing or restoring writes the snapshot;
withdrawing consent, withdrawing the review, hiding, rejecting or approving
it privately clear it at once. A material edit sends the review back to
Pending; under the default policy the last approved version stays up until
the new one is checked, and under the other it comes down.

### Verification (computed in the database, never set by anyone)

| Badge | Meaning |
| --- | --- |
| Verified DoOrDie user | Sent from a signed-in account that met the eligibility rule in force when it was sent |
| Verified active user | The account has records on at least the configured number of days (15 by default) |
| Verified feature use | The account has records in that feature (journal, life dashboard, revision, habits, mocks, roadmap); features that leave no dated records aren't verified |
| Established member | The account is older than the configured tenure (90 days) and the author chose to show it |

Badges are worked out from the usage snapshot when a review is published and
stored in its public version. The public answer carries the badges, never
the counts behind them. A badge says the account is real and was used; it
doesn't vouch for what the review says.

### Routes

- **Public reviews move to `/reviews`**, as asked. The in-app Performance Review
  moves to `/performance-review`. A redirect sends `/reviews?open=…` (the
  link in reminders and pushes already delivered) to `/performance-review`,
  and `/testimonials` redirects permanently to `/reviews`.
- `/reviews/<slug>` exists only for reviews long enough to be a story; shorter
  ones have no page of their own, so there are no thin pages.
- `/trust` and `/demo` are new public pages. `/admin/reviews` stays the only
  place reviews are managed.

### The demo

The demo runs **the real app pages** on a synthetic account held only in
memory. `/demo` (public) explains it; "Start the demo" marks the tab as a demo
and opens the dashboard. In that tab, `RequireAccount` mounts a demo session
instead of a real one: no account becomes active, so `scope.ts` writes
nothing; no sync starts; the store is filled from a deterministic sample
built in code (the screenshot sample, moved into `src/lib/demo`). Anything
that would reach the network with a real session (sending feedback, push
subscriptions, attachments, account deletion) is switched off in demo mode.
Leaving the demo clears the tab's flag, and a real account, if signed in,
loads as usual.

### Homepage

Proposition, the demo, student experiences, how it works, privacy, recent
improvements, product status, sign-up. **No invented reviews**: until real
ones are published, that slot says honestly that DoOrDie is new and points
to the demo. Published reviews take the slot automatically.

## 4. Risks and how they're handled

- **Moving `/reviews`**: every in-app reference changes, and the redirect covers
  links already sent in notifications.
- **Demo data reaching an account**: no account is active during the demo, so
  persistence can't write; the e2e test checks that a signed-in student's
  stored data and cloud version are unchanged after using the demo.
- **Cost on the free plan**: one database function call per app open for
  announcements, which now also answers whether to show the review
  invitation. Public pages stay cached for five minutes and tagged.

## 5. As built

Everything above was built as planned, on top of `main` after PR #58 (the
Super Admin's landing in the Admin Center, and live updates). Where the two
meet:

- `platform_my_announcements` is defined by three migrations in turn. This
  one keeps what the live-updates migration added (`now`, `nextChangeAt`)
  and adds `reviewInvite`; `supabase/tests/platform_trust.sql` checks that
  no field goes missing.
- A moderation decision, a reply or a settings change already sends a live
  update for `reviews`. The inbox now listens for it too, so the dashboard
  invitation appears or goes when the review settings change.
- `RequireAccount` decides the demo before the Super Admin redirect, and
  asks for no role in the demo: that would use the session of whoever is
  signed in. A Super Admin can open the demo; leaving it goes back to the
  Admin Center.
- The live-updates channel isn't joined in demo mode.

Changes from the plan:

- The guide in the demo needed room: on short pages it covered the last
  buttons. The page now ends with space as tall as the open guide.
- The SEO audit clears Next's stored database answers before it builds, as
  the admin end-to-end test already did. Answers kept from an earlier run
  described review pages the audit's empty database doesn't have.
- `CtaBanner` and `PageHero` gained an optional second button and custom
  actions, so `/trust` and `/demo` don't need their own copies.

What it doesn't do, or not yet:

- **No reviews exist yet.** Every public place a review would appear says so
  plainly until students publish some. Nothing was seeded, and nothing
  invented stands in for them.
- **Badges verify features that leave dated records only**: the journal,
  life entries, revision, habits, mocks and the Roadmap. A student can say
  they used the dashboard, the coach or the diary, but that isn't verified.
- **The consent wording has one version at a time** (`REVIEW_CONSENT_VERSION`
  in `src/lib/platform/content.ts`). Change the wording and the date
  together. Reviews keep the version their author agreed to; nobody is asked
  to agree again automatically.
- **Product status is a list in code** (`src/content/product-status.ts`), not
  an Admin Center setting. Everything in it is Available today.
- **The demo lasts as long as the tab.** Client-side navigation keeps what a
  visitor changed; a full reload starts the sample again. A duplicated tab
  copies the demo flag, as browsers copy sessionStorage.

Checked by: 252 unit tests, the three database suites (isolation, platform,
trust) applied twice, the admin end-to-end suite (22 scenarios, including the
five-step form, badges, story pages, edits, the invitation, `/trust`, and the
demo for a visitor and a signed-in student), the accounts end-to-end suite
(20 scenarios), the SEO audit (27 sitemap URLs, no failures or warnings), lint,
the type check and both builds.
