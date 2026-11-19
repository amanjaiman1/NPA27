# DoOrDie — UPSC Chronicle

A personal operating system for UPSC preparation: daily journal, study hours,
syllabus progress, revision, mocks, mistakes, goals, a roadmap of your own
yearly, monthly and weekly plans, habits that keep themselves from those
records, wellbeing, performance reviews, a private diary and a study coach.
Each person who signs up gets their own private chronicle, synced across
their devices through Supabase and kept within Supabase's free plan.

- **Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, Zustand,
  Supabase (Auth, Postgres and Storage), deployed on Vercel.
- **How accounts, sync and isolation work:** [`docs/accounts.md`](docs/accounts.md).
- **Notifications and background push:** [`docs/notifications.md`](docs/notifications.md).
- **Files attached to journal days:** [`docs/attachments.md`](docs/attachments.md).
- **The four everyday modules:** [Daily Journal](docs/daily-journal.md),
  [Life Dashboard](docs/life-dashboard.md) (including sleep), and the look:
  the layout, the three themes (Lavender, the default, Light and Dark), liquid glass
  buttons and Reduce transparency in the
  [design system](docs/design-system.md).
- **The Roadmap** (your own yearly, monthly and weekly plans):
  [`docs/roadmap.md`](docs/roadmap.md).
- **How the modules connect** (who owns which record, and the shared activity
  layer): [`docs/connected-ecosystem.md`](docs/connected-ecosystem.md), with
  [the Habit Engine](docs/habit-engine.md),
  [Performance Review](docs/performance-review.md),
  [the Personal Diary](docs/personal-diary.md) and
  [the Study Coach](docs/study-coach.md).
- **The feature tour** (a walk through every page, opened once for a new
  account and from the Tour button any time):
  [`docs/feature-tour.md`](docs/feature-tour.md).
- **The public site and SEO:** [below](#public-site-and-seo), and the setup steps
  in [`docs/SEO_SETUP_GUIDE.md`](docs/SEO_SETUP_GUIDE.md).
- **The promo film** (58 seconds in 4K, plus a 30-second and a vertical cut),
  made from the real app. It opens the home page:
  [`promo-film/`](promo-film/README.md).

The home page `/` is the public site. The app itself starts at **`/dashboard`**;
someone already signed in who opens `/` is taken there.

---

## Run it locally

```bash
npm ci
npm run dev            # http://localhost:3000
```

Without Supabase variables the app runs in **local-only mode**: no accounts, one
user, data saved only in that browser. That's the quickest way to work on the UI.

### Try multiple accounts locally (no Supabase project needed)

`scripts/mock-supabase.mjs` is a local stand-in for Supabase: email/password
auth, password-reset links (printed in its terminal instead of emailed), account
deletion, file storage for attachments, and the real schema, migrations and Row
Level Security running in an in-memory Postgres.

```bash
node scripts/mock-supabase.mjs --print-env > .env.local   # points the app at the mock
npm run mock:supabase                                      # terminal 1
npm run dev                                                # terminal 2
```

Open two different browsers (or a normal and a private window) and sign up as two
people. Delete `.env.local` when you're done, and never deploy with it.

## Tests

| Command | What it checks |
| --- | --- |
| `npm test` | Unit tests: the three-way merge, the sync engine with two simulated devices (offline edits, clashes, stale devices), per-account browser storage, the one-time move of pre-account data, the new-account template, attached-file rules, completed topics, Life Dashboard reports and form, goals, the clean-up of data older versions wrote, saving a journal day, sleep times and durations, the three themes (synced, painted before load, and what a theme, palette or Liquid Glass saved by an older version becomes), Reduce transparency as a setting of its own, and the Roadmap (periods across month and year ends, leap years and time zones, progress from activities only, carry forward, duplicate, archive, goal and journal links that change neither, two accounts, two devices), and the Admin Center's roles and permissions, the checks on everything it accepts, its API dispatcher with fake dependencies (every address needs the permission the design gives it, 401s, 403s, cross-site refusals, a failed suspension record lifting the ban again, rate limits), and feature access (everything open, no payment code); the review system (moderation needs a listed reason and never "negative", what a review may carry, the new settings and switches, hiding needs its permission) and the interactive demo (the sample account is the same each time and written nowhere, and nothing that acts for an account reaches the server in demo mode). |
| `npm run test:db` | Applies `supabase/schema.sql` and every migration (twice, to prove they re-run safely) to a throwaway Postgres with Supabase's roles, then runs `supabase/tests/rls_isolation.sql`, `supabase/tests/platform_admin.sql` (every Admin Center rule the database enforces: who may call what, roles, the last Super Admin, review eligibility and consent, feedback privacy, announcements, the changelog, settings and the append-only audit log) and `supabase/tests/platform_trust.sql` (badges from records only, consent and edit history, the edit policy, the invitation, reasons for taking a review down, story pages, aggregates only from five reviews, nothing private in public answers). |
| `npm run test:e2e:admin` | 22 scenarios against the mock: the first Super Admin from the setup guide's SQL, the same permissions in TypeScript and the database, roles (never to oneself, never Super Admin from the app, never through a profile or a direct database call), each role's reach, a review from real use to the website and back down, feedback with a screenshot and private notes, announcements and read state, changelog drafts as 404s, suspension blocking sign-in, settings reaching the public site, the audit log (complete, append-only, no private words), the last Super Admin's account; badges from records, a story page, an edit that keeps the approved version up, featuring and hiding; the invitation's Later and No thanks; the Trust Center, the demo page and the reviews page saying only what's true; then the Admin Center in a browser for a student, a Super Admin and a Moderator, on a phone and in all three themes; a student invited on the dashboard writing a review in five steps; and the demo for a visitor and for a signed-in student, whose account it never touches. Builds against the mock like `test:e2e`; `-- --no-build --trust-only` runs just the last three. |
| `npm run test:e2e` | 20 browser scenarios against the mock: two accounts in one browser, the theme following an account with no light flash, a second device, simultaneous edits, direct database access with another account's token, attached files (stored once, linked to a goal without a copy, unreadable by another account, deleted with the last day that holds them), recording, editing and deleting a night's sleep, Reduce transparency (on any theme, painted before load, on a second device, never on another account), Light and Dark frosted and Lavender crisp (synced, painted before load, on a second device), an older device's Blue Glass opening as Light, the Roadmap (empty at first; a year, its months and a week planned by hand; deleting one month; a goal and a journal day linked without changing either; edits from two devices at once; archiving; another account seeing none of it), sign-out, the owner's existing data, a fresh account, account deletion (including its files) and password reset. Needs `npx playwright install chromium` once. It builds the app against the mock, so run `npm run build` again afterwards. |
| `npm run lint`, `npx tsc --noEmit`, `npm run check:classes` | Lint, types, and the Tailwind opacity guard. |

To check isolation on the **real** project, paste `supabase/tests/rls_isolation.sql`
into the Supabase SQL Editor. It runs inside a transaction with two throwaway
users, rolls everything back, and ends with `All isolation checks passed`.

## Public site and SEO

The site has two halves, kept apart by route groups:

| Part | Where | Indexed |
| --- | --- | --- |
| Public pages: home, features, five feature pages, free tools, guides, reviews, the Trust Center, the interactive demo, the changelog, about, contact, legal | `src/app/(marketing)/` | Yes (production only) |
| The app and its sign-in screens | `src/app/(product)/` | No: every page answers `noindex` |

The public pages are rendered on the server and load none of the app's account
or storage code. Shared pieces:

- `src/lib/seo/`: the site address (`NEXT_PUBLIC_SITE_URL`), the list of public
  pages with their titles, descriptions and keywords (`pages.ts`), page metadata
  and structured data.
- `src/components/seo/` and `src/components/marketing/`: breadcrumbs, JSON-LD,
  the header and footer, the free tools, and opt-in analytics.
- `src/content/blog/`: the guides. The comment at the top of `index.ts` explains
  how to add one.
- `src/app/robots.ts` and `src/app/sitemap.ts`: built from the same page list.
  Preview deployments disallow all crawling.

| Command | What it does |
| --- | --- |
| `npm run seo:audit` | Builds as production against the mock Supabase and checks every sitemap page: status, one H1, title and description, canonical, Open Graph, structured data, alt text, broken links, orphan pages, JavaScript size; then that private pages are `noindex` and unknown URLs return 404. Add `-- --out file.md` for a report. Run `npm run build` afterwards. |
| `npm run seo:suggest` | Collects Google search suggestions for the keyword research in `docs/seo-research/`. |
| `npm run seo:screenshots` | Re-takes the product screenshots in `public/product/` from the real app with a made-up sample account. Run `npm run test:e2e` once first. |
| `npm run seo:og` | Re-renders the social sharing image `public/og/doordie.png` from the screenshots. |

Docs: [setup steps](docs/SEO_SETUP_GUIDE.md) ·
[audit](docs/SEO_AUDIT.md) · [keyword map](docs/SEO_KEYWORD_MAP.md) ·
[content roadmap](docs/SEO_CONTENT_ROADMAP.md) ·
[competitors](docs/SEO_COMPETITOR_ANALYSIS.md).

## Set up Supabase

### 1. Database

In the Supabase SQL Editor, run these files in order:

1. `supabase/schema.sql` — the tables and their Row Level Security policies.
2. Every file in `supabase/migrations/`, oldest first. Today that's:
   - `20261115120000_multi_user_sync.sql`: versioned saves, server-side
     timestamps, the write function the app uses, and the trimmed snapshot
     reader for the push dispatcher.
   - `20261118120000_journal_attachments.sql`: the private Storage bucket for
     files attached to journal days, its owner-only policies, and a dispatcher
     snapshot that leaves file details out. See [`docs/attachments.md`](docs/attachments.md).
   - `20261125120000_roadmap_plans.sql`: a device still running the previous
     version can no longer erase Roadmap plans when it saves, and the
     dispatcher's reader leaves plans out (the later
     `20261203120000_dispatch_completed_activities.sql` gives it completed
     activities only).
     The app works without it, but run it before you start planning. See
     [`docs/roadmap.md`](docs/roadmap.md).
   - `20261202120000_diary_coach_privacy.sql`: a device still running an
     earlier version can no longer erase the Study Coach's history when it
     saves, and the dispatcher's reader receives Personal Diary entries as
     dates only, Performance Reviews without what you wrote or their kept
     figures, habits without descriptions, and no coach history. No table or
     policy changes. The app works without it; run it before relying on the
     coach history across devices. See [`docs/personal-diary.md`](docs/personal-diary.md).
   - `20261203120000_dispatch_completed_activities.sql`: the dispatcher's reader
     receives each Roadmap plan's id and its completed activities (id, kind,
     status, completion time, subject), with no titles, notes or anything
     unfinished, so habits that count Roadmap work get background reminders
     too. No table or policy changes. Until it runs, those habits are simply
     left out of background reminders. See [`docs/notifications.md`](docs/notifications.md).
   - `20261204120000_platform_admin.sql`: the Admin Center. Roles, platform
     settings, an append-only audit log, reviews, feedback (with a private
     `platform-feedback` bucket for screenshots), announcements with each
     account's read state, and the changelog. Every new table has row-level
     security on with no direct access; the app reaches them only through
     database functions that check the caller. Nothing existing changes.
     Until it runs, the Admin Center says it isn't set up, and feedback is
     emailed as before. See [`docs/ADMIN_SETUP.md`](docs/ADMIN_SETUP.md).
   - `20261205120000_live_updates.sql`: changes made in the Admin Center reach
     open apps at once. A policy on Realtime's `realtime.messages` lets
     signed-in accounts listen on the private `platform-updates` channel (only
     the server can send on it), and the announcements function also returns
     the next scheduled start or end. No new tables. Until it runs, apps pick
     up changes when they open or come back after 15 minutes.
   - `20261210120000_trust_reviews.sql`: the Trust & Review system on top of
     the Admin Center. The five-step review (new optional answers, context,
     how the name is shown), consent versions and a consent history, an edit
     history, the dashboard invitation and its Later and No thanks, badges
     worked out from each author's records, featured reviews, story pages,
     moderation reasons, the new settings and switches, and the changelog's
     "what changed", "why it matters", feedback theme and Accessibility
     category. Three new tables, all with row-level security on and no direct
     access. Reviews already published stay published. Until it runs, the
     review form and the public reviews pages have nothing to show.

All of them are additive and safe to re-run: nothing is dropped or rewritten, and
existing data keeps working. A SQL file in the repo does nothing until you run it.

### 2. Authentication (Dashboard → Authentication)

| Setting | Value |
| --- | --- |
| **Sign In / Providers → Email** | Enabled. "Confirm email" on is recommended; it needs working email (below). |
| **URL Configuration → Site URL** | Your production URL, e.g. `https://your-app.vercel.app` |
| **URL Configuration → Redirect URLs** | `https://your-app.vercel.app/auth/callback`, `https://your-app.vercel.app/reset-password`, and the same two on `http://localhost:3000` for local work |
| **Emails → SMTP Settings** | A custom SMTP provider. **Required** for confirmation and password-reset emails to reach anyone: Supabase's built-in sender only delivers to members of your Supabase organisation, and at most 2 emails an hour. |
| **Sign In / Providers → Allow new users to sign up** | On to let people register. Turn it off to stop new sign-ups, and add people under Authentication → Users → Add user instead. |
| **Password strength** (optional) | Minimum 8 characters, letters and digits — the same rule the app checks. |

Without custom SMTP you can still run with "Confirm email" off: sign-up then logs
people straight in. Password reset still needs email.

### 3. Environment variables

Copy `.env.example` to `.env.local` for local work, and set the same names in
Vercel → Project → Settings → Environment Variables.

| Variable | Where | Needed for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Accounts and sync |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Accounts and sync (public; data is protected by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Account deletion, background push, and the Admin Center's server routes. Never prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` | see `docs/notifications.md` | Background push (optional) |
| `NEXT_PUBLIC_SITE_URL` | browser + server | The public site's main address for canonical links, the sitemap and social previews (strongly recommended) |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_BING_SITE_VERIFICATION` | see `docs/SEO_SETUP_GUIDE.md` | Contact address, opt-in analytics, Bing verification (optional) |
| `RESEND_API_KEY`, `REPORTS_TO_EMAIL` | **server only** | Crash reports and Settings → Help & feedback, emailed through [Resend](https://resend.com) (optional; without them the form says it isn't set up) |
| `REPORTS_FROM_EMAIL` | **server only** | The sender for those emails. Leave unset to use Resend's test sender, which only delivers to the address the Resend account was created with. |

### Crash reports and feedback

When a page fails, the app emails a crash report: the error, its stack, the
page's path (never the query), the browser and the time. It never includes
the account, a name, or anything written in the app. People can switch these
off in Settings → Help & feedback, and add a note on the error screen.

The same section has a form for bug reports, feature requests, suggestions,
usability problems and general feedback, with an optional screenshot. A
message carries the sender's account id, their email only if they leave
"Include my email" on (it becomes the reply-to address), and their browser
and window size only if they leave "Include technical details" on. Once the
Admin Center migration has run, messages are stored in its Feedback Center
(`POST /api/feedback`), where the team answers them and the sender sees the
answer and its status; the email to the team is a notification on top.

Crash reports, and feedback before that migration, go through `POST /api/report`
(`src/lib/report-server.ts`), which only accepts requests from the site's own
pages, caps sizes, and limits how many it sends per address, per account and
per hour. Resend's free plan allows 3,000 emails a month and 100 a day.

To set it up: create a Resend account, make an API key with "Sending access",
and set `RESEND_API_KEY` and `REPORTS_TO_EMAIL` (where reports go; several
addresses can be separated by commas) in Vercel. With Resend's test sender,
`REPORTS_TO_EMAIL` must be the address you signed up to Resend with. To send
to any address, verify a domain in Resend and set `REPORTS_FROM_EMAIL`, for
example `DoOrDie <reports@your-domain>`. Redeploy after changing them. The
address in `REPORTS_TO_EMAIL` stays on the server; it is never sent to the
browser or shown on the site.

## Admin Center

`/admin` is where the people who run DoOrDie manage it: accounts and
suspensions, review moderation, the Feedback Center, announcements inside
the app, the public changelog (`/changelog`), platform settings, who has
access, and an append-only audit log. Three roles, Super Admin, Admin and
Moderator; everyone else has none and sees "No access". Nobody can sign up
for a role or give themselves one: the first Super Admin is created by the
owner in the Supabase SQL Editor, and Admins and Moderators are granted by a
Super Admin. Every page checks the role on the server, and every database
function checks it again. Administrators see account metadata (email, dates,
status, role), never what anyone wrote in DoOrDie.

Students who have used DoOrDie long enough are invited by a quiet card on
their dashboard (Later asks again in two weeks; No thanks, or a third Later,
stops it), and write a review in five steps; publishing it on the website is a
separate permission, off unless they tick it. Published reviews appear on
`/reviews` with badges the database works out from each author's records,
longer ones get a page of their own, and, if the settings say so, they appear
on the home page and the five feature pages: newest first, never chosen or
filtered by rating. There are no sample or invented reviews anywhere: with
none published, the pages say so. The design: [`docs/trust-review-architecture-audit.md`](docs/trust-review-architecture-audit.md).

`/trust` explains what DoOrDie is (and isn't), how its parts connect, how data
is handled, what's available, how reviews are checked and how to reach the
team. `/demo` opens the real app with a made-up sample account in that tab
only: nothing is saved, and an account signed in on the same browser is never
read or changed (`src/lib/demo/mode.ts`).

Setup, the bootstrap SQL and how each part works: [`docs/ADMIN_SETUP.md`](docs/ADMIN_SETUP.md).
The design and its reasons: [`docs/admin-architecture-audit.md`](docs/admin-architecture-audit.md).
Feature access for the future, which today opens everything to everyone:
[`docs/feature-access.md`](docs/feature-access.md).

To try it locally, run the mock (see "Try multiple accounts locally"), sign up,
and make that account a Super Admin through the mock's SQL endpoint as
`docs/ADMIN_SETUP.md` shows.

## Deploy to Vercel

1. Run the SQL migrations in Supabase **first**. A new build talking to an
   un-migrated database shows "Cloud sync needs a database update" and keeps
   changes on the device until it can save them. Without the attachments
   migration everything works except attaching files, which shows an error.
   Without the Roadmap migration everything works, but a device still running
   the previous version can take plans out of the cloud copy until a device on
   the new version puts them back. Without the diary and coach migration
   everything works, but an older device can drop the coach's history, and
   the dispatcher's copy still includes diary text (it is never sent anywhere,
   but the migration keeps it out of that copy too).
2. Set the environment variables above, then deploy (`git push` to the
   production branch, or **Redeploy** in Vercel).
3. Add the production URLs to Supabase's Redirect URLs (see the table above).
4. Background push only: the GitHub Actions schedule in
   `.github/workflows/push-notifications.yml` needs `PUSH_DISPATCH_URL` and
   `CRON_SECRET` repository secrets. GitHub turns scheduled workflows off in a
   public repository after 60 days without commits; re-enable it from the Actions
   tab if that happens.

### Upgrading the existing single-user deployment

Your existing data is kept and stays yours:

- **The cloud copy** in `chronicle_state` keeps its row and its owner. The
  migration gives it version 1; nothing about its contents changes.
- **Each device you already use** holds a copy in the old shared browser key.
  The first time you sign in there after the upgrade, it moves into your
  account's own key — only for the account that last synced it from that browser
  — and is reconciled with the cloud: entries made while offline are kept. The old
  key is removed only after that first sync succeeds.
- **Your profile** is recognised as already set up, so you won't see first-run
  setup.
- **The Roadmap** is now your own plans, and starts empty. The fixed CSE 2027
  plan it used to show was built into the app rather than saved in your
  account, so retiring it removed none of your data.
- **New accounts** never receive any of it. They start from the syllabus, the
  standard books and a few habit suggestions, with every personal record empty.

Open the app on each of your devices once after deploying. A tab still running
the old version can read but can no longer save (the migration routes all writes
through the new versioned function), so refresh any that were left open.

If a browser holds pre-account data that was never synced to an account, it is
left untouched and not shown to anyone. To recover it: open the browser's
developer tools on the app, copy the value of the `upsc-chronicle-store` key in
Local Storage into a `.json` file, then use Settings → Data → Restore from file.

## Free-plan budget

The Free plan includes 500 MB of database, 5 GB of egress a month, 1 GB of file
storage and 50,000 monthly active users
([pricing](https://supabase.com/pricing)). For this app, egress is the limit that
matters, and it is driven by how often whole snapshots are downloaded:

- A new account's data is about 24 KB; a year of daily logging about 360 KB.
  A heavily used Roadmap adds about 170 KB a year (a full week of plans is
  about 3 KB).
- Opening the app or coming back to it asks only for the version number (a few
  bytes) and downloads the data only when another device changed it.
- Saves upload the snapshot and receive only the new version back.
- The push dispatcher reads a trimmed copy without long text, and from the
  Roadmap only each plan's completed activities.
- Attached files go to Storage, never into the synced data: each costs about
  200 bytes of sync whatever its size. Each file is stored once, photos are
  resized before upload, and the app holds each account to 100 MB of the free
  1 GB. See [`docs/attachments.md`](docs/attachments.md).

- The Admin Center and the app's announcements cost little: one small database
  call when the app opens (announcements, the in-app notice and unread answers to
  feedback together), again when a tab comes back after 15 minutes, and again
  when the team changes one of them. That last one is a Realtime message with no
  content: an app holds a Realtime connection only while it's on screen (the free
  plan allows 200 at once), so a tab in the background lets go after a minute.
  No polling. Public pages read published reviews and the changelog
  at most once every five minutes each. Feedback screenshots are at most 2 MB,
  usually far less after the device shrinks them.

**To watch usage:** Dashboard → Organization → **Usage** shows egress, database
size and monthly active users against the plan. `supabase/usage.sql` (read-only)
shows the database size, the size of each table, and how large accounts'
snapshots have grown. There's no fixed account limit; add people as long as the
Usage page stays comfortably inside the plan.

## Manual steps for the owner

- [ ] Run `supabase/migrations/20261115120000_multi_user_sync.sql` in the SQL Editor.
- [ ] Run `supabase/migrations/20261118120000_journal_attachments.sql` in the SQL Editor
      (journal attachments).
- [ ] Run `supabase/migrations/20261125120000_roadmap_plans.sql` in the SQL Editor
      (Roadmap: keeps plans safe from devices still on the previous version).
- [ ] Run `supabase/migrations/20261202120000_diary_coach_privacy.sql` in the SQL Editor
      (diary and coach privacy in the dispatcher's copy).
- [ ] Run `supabase/migrations/20261203120000_dispatch_completed_activities.sql` in the
      SQL Editor (background reminders for habits that count Roadmap work).
- [ ] Run `supabase/migrations/20261204120000_platform_admin.sql` in the SQL Editor
      (the Admin Center), then make your own account the first Super Admin with the
      SQL in [`docs/ADMIN_SETUP.md`](docs/ADMIN_SETUP.md). Signing in on the
      ordinary sign-in page then opens the Admin Center.
- [ ] Run `supabase/migrations/20261205120000_live_updates.sql` in the SQL Editor
      (Admin Center changes reach open apps at once).
- [ ] Run `supabase/migrations/20261210120000_trust_reviews.sql` in the SQL Editor
      (the review form, badges, the invitation and the public reviews pages).
- [ ] Set `RESEND_API_KEY` and `REPORTS_TO_EMAIL` in Vercel for crash reports and
      feedback (see [Crash reports and feedback](#crash-reports-and-feedback)).
- [ ] Run `supabase/tests/rls_isolation.sql` and confirm `All isolation checks passed`.
- [ ] Set Site URL and the two Redirect URLs in Authentication → URL Configuration.
- [ ] Configure custom SMTP, or decide to run with "Confirm email" off.
- [ ] Choose whether "Allow new users to sign up" stays on.
- [ ] Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (account deletion needs it).
- [ ] Deploy, then open the app once on each of your devices.
- [ ] Public site: set `NEXT_PUBLIC_SITE_URL`, submit the sitemap in Google Search
      Console, and follow the rest of [`docs/SEO_SETUP_GUIDE.md`](docs/SEO_SETUP_GUIDE.md).
