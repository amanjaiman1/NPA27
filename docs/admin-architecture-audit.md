# Admin Center: architecture audit

What the app looked like before the Admin Center, and the design the Admin
Center follows. Written from the code on `main` at `da8860f` (19 November
2026), before any of it was built. Where the build changed a decision, the
change is noted at the end.

Setup steps for the owner are in [`ADMIN_SETUP.md`](ADMIN_SETUP.md). The
feature-access layer is described in [`feature-access.md`](feature-access.md).

> **Since then.** The Trust & Review system
> ([`trust-review-architecture-audit.md`](trust-review-architecture-audit.md))
> moved the Performance Review to `/performance-review` and made `/reviews`
> the public reviews page; `/testimonials` redirects there. The reviews page
> now carries review markup where it's eligible (never on the organisation).
> The notes below describe the Admin Center as it was first built.

## 1. The existing application

### Route groups

| Group | Paths | Layout | Who sees it |
| --- | --- | --- | --- |
| `src/app/(marketing)` | `/`, `/features`, the five feature pages, `/resources/*`, `/blog/*`, `/about`, `/contact`, legal pages | `site-root` wrapper, `SiteHeader`, `SiteFooter`, site-wide JSON-LD. No account code: the SEO audit fails the build if a public page loads Supabase or the store. | Everyone, indexed |
| `src/app/(product)` | Everything below | `AuthProvider`, `ConfirmProvider`, `ToastProvider`, `PwaLayer`, `CrashReporter`; `robots: noindex, nofollow` | Private |
| `src/app/(product)/(auth)` | `/welcome`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` | Redirects a signed-in visitor to `safeNext(?next=)`, which only accepts same-site paths | Signed-out visitors |
| `src/app/(product)/(app)` | `/dashboard`, `/journal`, `/goals`, `/wellbeing`, `/revision`, `/roadmap`, `/habits`, `/coach`, `/reviews` (Performance Review), `/diary`, `/settings` and the rest | `RequireAccount` → `OnboardingGate` → `SleepGate` → `AppShell` | Signed-in students |
| `src/app/api` | `account/delete`, `push/*`, `report` | Route handlers, `runtime = "nodejs"`, `dynamic = "force-dynamic"`; `X-Robots-Tag: noindex` from `next.config.mjs` | Server |

`/reviews` is already the in-app Performance Review, so the public testimonials
page cannot live there (see section 9).

### Authentication

- Supabase Auth with email and password. The browser client
  (`src/lib/supabase.ts`) keeps the session in `localStorage` under
  `upsc-chronicle-auth`. There are **no auth cookies and no middleware**, so a
  server component can never know who is asking.
- `AuthProvider` (`src/components/auth/auth-provider.tsx`) restores the
  session, exposes `useAuth()` (`status`, `user: {id, email, name}`,
  `signIn`, `signOut`…) and reads no roles: `app_metadata` is not used
  anywhere.
- `RequireAccount` is the client-side gate in front of the app. A signed-out
  visitor is sent to `/login?next=<path>`; after sign-in the auth layout sends
  them back to that path.
- Server routes identify a caller from `Authorization: Bearer <access token>`,
  verified by Supabase (`admin.auth.getUser(token)` or `userIdFromToken`). A
  user id is never read from a request body.
- Account deletion (`/api/account/delete`) needs a token minted in the last
  ten minutes (the app asks for the password again), deletes Storage files,
  then deletes the auth user; `on delete cascade` removes every row the
  account owns.

### Privileged server access

`src/lib/supabase-admin.ts` creates a Supabase client with the service-role
key, which **bypasses Row Level Security**. `isAdminConfigured` only says the
key is present. Neither says anything about who the visitor is: a service-role
client is a database credential, not an administrator. It is used by account
deletion, the push dispatcher (through `chronicle_dispatch_snapshots`, which
returns trimmed snapshots) and the report route.

### Data

- **`chronicle_state`**: one row per account, `data jsonb` holding the whole
  chronicle (journal, life log, goals, Roadmap plans, revision, habits,
  Performance Reviews, Personal Diary, coach history, settings, appearance,
  notification state), plus `version` and `updated_at`. RLS lets an account
  read only its own row. Browsers cannot write the table directly: every save
  goes through `save_chronicle_state(p_data, p_base_version)`, which only
  touches the caller's row and refuses a stale version, so devices merge
  instead of overwriting.
- **`chronicle_push_subscriptions`**, **`chronicle_push_log`**: per-account
  rows for background notifications.
- **Storage**: private bucket `chronicle-attachments`, paths
  `<user id>/<sha256>`, owner-only policies.
- **Browser**: every key is scoped to the account (`upsc-chronicle-store:<id>`
  and friends; `src/lib/account/scope.ts`), so two people on one browser never
  see each other's data.

Migrations live in `supabase/migrations/`, run in name order, are additive and
safe to re-run (`create … if not exists`, `create or replace`, `drop policy if
exists` before `create policy`, guarded `alter table`). Functions are `security
definer` with `set search_path = ''`, and their `execute` grant is revoked
from `public, anon, authenticated` and given back only to the role that needs
it.

### Tests

| Command | What it runs |
| --- | --- |
| `npm test` | `node --test` over `tests/*.test.ts` (pure modules; 201 checks) |
| `npm run test:db` | `schema.sql` and every migration, twice, in PGlite with Supabase's roles, `auth.uid()` and Storage recreated, then `supabase/tests/rls_isolation.sql` |
| `npm run test:e2e` | Starts `scripts/mock-supabase.mjs`, builds the app against it, runs 20 browser scenarios in Playwright |
| `npm run seo:audit` | Production build, then checks every public page |

The mock Supabase is the same PGlite database with a small HTTP layer: email
auth, `chronicle_state` reads, the `save_chronicle_state` call and Storage.
Every request runs as the caller's role with their JWT claims, so RLS behaves
as on Supabase. It had no generic RPC endpoint and no Auth admin endpoints
beyond deleting a user; both are added (section 11).

## 2. What the Admin Center must not disturb

- `chronicle_state` stays as it is. No admin data goes into it, and no admin
  screen reads it. The only new code that reads it is a database function that
  counts the days a person has used the app, run when that person submits a
  review (section 6).
- The student app keeps loading exactly as before. The Admin Center has its own
  layout and never mounts `AccountSession`, the store's account, sync or the
  notification engine.
- Public pages stay free of account code.
- Every existing feature stays available to every account (section 10).

## 3. Roles and permissions

A role says who may run the platform. It is separate from anything that could
one day describe what an account has paid for (section 10).

| Permission | Super Admin | Admin | Moderator |
| --- | :-: | :-: | :-: |
| `admin.access`: open the Admin Center | ✓ | ✓ | ✓ |
| `analytics.read`: account and registration figures | ✓ | ✓ | |
| `users.read`: the user directory | ✓ | ✓ | |
| `users.suspend`: suspend and restore accounts | ✓ | ✓ | |
| `reviews.moderate`: read, publish, reject, hide and answer reviews | ✓ | ✓ | ✓ |
| `feedback.manage`: the Feedback Center | ✓ | ✓ | only if the setting "Moderators can handle feedback" is on |
| `announcements.manage` | ✓ | ✓ | |
| `changelog.manage` | ✓ | ✓ | |
| `settings.manage`: platform settings | ✓ | | |
| `access.manage`: grant and revoke Admin and Moderator | ✓ | | |
| `audit.read`: the full audit log | ✓ | | |

An ordinary student has **no row**: no membership means no Admin Center.

The matrix exists twice on purpose: in TypeScript (`src/lib/platform/roles.ts`,
for the API and the navigation) and in SQL (`platform_permissions`, checked
inside every admin database function). A test compares the two.

### Memberships

`platform_admin_memberships (user_id → auth.users on delete cascade, role,
granted_by, created_at, updated_at)`, with `role` limited to `super_admin`,
`admin` and `moderator`. RLS on, no policies, no table privileges for `anon` or
`authenticated`: nothing in the browser can read or change it. Roles are never
read from `user_metadata`, `app_metadata`, the profile or a request.

Rules, enforced in the database:

- Only a Super Admin can grant or revoke Admin and Moderator, and never to or
  from themselves.
- Super Admin is never granted through the app. The first one, and any later
  one, is added by the owner in the Supabase SQL Editor
  ([`ADMIN_SETUP.md`](ADMIN_SETUP.md)). There is no endpoint that can create
  one.
- A trigger refuses any change that would leave no Super Admin, unless the
  account itself is being deleted from Supabase. The app's own account
  deletion refuses to delete the last Super Admin, with an explanation.
- A trigger writes every membership change to the audit log, including changes
  made by hand in the SQL Editor.

## 4. Where authorization happens

Three layers, each enough on its own to refuse:

1. **The Admin Center's pages** (`/admin/*`, client components) render nothing
   until `GET /api/admin/me` confirms a role, and show only the modules the
   role allows. Without cookies there is nothing a middleware or a server
   component could check, so the pages hold no data at all: everything comes
   from the API.
2. **The API** (`/api/admin/*`, one dispatcher, `src/lib/platform/server`)
   runs `requireAdmin(permission)` for every route: it verifies the bearer
   token with Supabase, takes the user id from the verified token, loads the
   membership with the service-role client, and checks the permission. No
   token is `401`; a token without the permission is `403`. Every route in the
   table declares its permission, and a test fails if one doesn't.
3. **The database.** Every admin function takes the actor's id, looks up the
   actor's role itself and raises if the permission is missing, and writes the
   audit entry in the same transaction as the change. These functions are
   executable by `service_role` only, so a browser cannot call them even with
   a valid student token.

Mutating admin requests must also come from the site's own pages
(`Sec-Fetch-Site: same-origin`, or a matching `Origin`). The bearer token
already rules out cross-site request forgery, since another site can't read
it; the check is a second fence.

## 5. Data model

All new tables are in `public`, have RLS enabled with **no policies**, and have
their table privileges revoked from `anon` and `authenticated`. Every read and
write goes through a function that checks who is asking (section 4). Public
content is only ever returned by functions that select published rows and safe
columns.

| Table | Holds | Notes |
| --- | --- | --- |
| `platform_admin_memberships` | Elevated roles | See section 3 |
| `platform_settings` | Typed platform settings, one row per key | Keys and value ranges are checked in SQL and TypeScript; defaults live in SQL |
| `platform_admin_audit_log` | What administrators did | Append-only: a trigger refuses `update`, `delete` and `truncate` for every role, including the service role |
| `platform_reviews` | Student reviews, one per account | Consent flags with timestamps, a usage summary taken at submission, moderation state, a public response |
| `platform_feedback` | Bug reports, feature requests, suggestions, usability problems, general feedback | Status, priority, a public response, a link to a changelog entry |
| `platform_feedback_notes` | Private notes on feedback | A separate table, so no function that returns feedback to its author can include them |
| `platform_announcements` | Announcements | Draft, published (now or scheduled), archived; optional end date |
| `platform_announcement_reads` | Per-account read and dismissed state | Kept out of `chronicle_state`, as the brief asks |
| `platform_changelog_entries` | Public product updates | Draft or published, publication date, optional feature, image, SEO fields |

Storage: a private bucket `platform-feedback` for screenshots attached to
feedback, images only, 2 MB. Only the server writes or signs links to it.

Every table that belongs to an account (`reviews`, `feedback`,
`announcement_reads`, `memberships`) cascades when the account is deleted, and
the app's account deletion also clears the account's screenshots.

## 6. Reviews and testimonials

- **Eligibility** is worked out in the database, from the person's own
  `chronicle_state`, when they open the review form or submit:
  - a *qualifying day* is a date with a journal entry, a Life Dashboard entry,
    a revision pass, a habit check-in, a mock or a completed Roadmap activity;
    the Personal Diary is not read;
  - only dates from the account's creation day to today count, so backdated
    records can't make an account look older than it is;
  - eligible when the first qualifying day is at least 14 days ago **and**
    there are at least 5 qualifying days. Both thresholds are platform
    settings.
  The account's creation date alone never qualifies anyone.
- **Submission**: rating, written review, optional headline, features used,
  what was useful, suggestions (never published), optional preparation stage,
  display name. Two consents, stored with timestamps: the team may read it
  (required), and it may be published on the website (optional, off by
  default).
- **Verification** shown to moderators: the usage summary (first qualifying
  day, number of qualifying days, which features have records), whether the
  account's email is confirmed and when it was created. Never the records
  themselves.
- **States**: `pending` → `published` (approved, consented, on the site),
  `approved` (accepted but not public: no consent, or consent withdrawn),
  `rejected` (with a reason the author sees), `hidden` (taken off the site,
  with a reason), `withdrawn` (by the author).
- An edit that changes anything public sends a published or approved review
  back to `pending`. Withdrawing public consent takes it off the site at once.
  Nothing is ever rewritten by a moderator; a moderator can only add a public
  response.
- **Public pages** read published, consented reviews through
  `platform_public_reviews` with the anon key, cached for five minutes and
  revalidated the moment a moderator or the author changes one.

## 7. Feedback, announcements, changelog, settings

- **Feedback**: submitted from Settings → Help & feedback through
  `/api/feedback`, which stores it (as the user, through
  `platform_submit_feedback`) and, if email is configured, also emails the
  team as before. Authors see their items' status and the team's response;
  private notes stay in their own table. At most 10 submissions a day per
  account, enforced in the database. *Since then
  (`20261212120000_help_feedback.sql`):* Help & feedback moved out of
  Settings to a button at the bottom right of the app, nothing is emailed,
  feedback no longer carries an email address, and crash reports are stored
  for the team under Feedback → Crash reports instead of being emailed.
- **Announcements**: published now or scheduled, optional end date, archived
  when done. The app fetches them once when it opens, again when it returns
  to the foreground after 15 minutes, and again when the team changes them:
  a content-free message on the private Realtime channel `platform-updates`,
  sent by the Admin API after the change (added later, in
  `20261205120000_live_updates.sql`; see ADMIN_SETUP.md, "Changes reach open
  apps at once"). No polling. Read and dismissed state is per account in
  `platform_announcement_reads`.
- **Changelog**: `/changelog` and `/changelog/[slug]`, published entries only,
  in the sitemap. An entry can be linked from the feedback it answers; the
  page then says how many requests led to it, without showing any of them.
- **Settings**: typed keys only (review thresholds, whether reviews are open,
  testimonial display, moderator access to feedback, support email,
  announcement defaults, an app-wide notice). No free-form editing. Signups
  stay a Supabase setting: turning them off needs the Supabase Management API,
  which the app's keys can't reach, so the settings page links to it instead
  of pretending.

## 8. Privacy boundary

Administrators see account metadata (id, email, created, email confirmed, last
sign-in, suspended or not, role) and the platform's own records (reviews,
feedback, announcements, changelog, audit log). No admin function reads
`chronicle_state`, Storage attachments or anything inside an account. There is
no "view this account" screen.

Analytics come from `auth.users` counts and the platform tables. "Signed in
recently" counts fresh sign-ins (`last_sign_in_at`), which is not the same as
using the app, and the dashboard says so. Supabase usage (database size,
egress, monthly active users) is only visible in the Supabase dashboard; the
Admin Center links to it rather than inventing figures.

Audit entries hold ids, an action, a reason and small metadata (old and new
status, role names, setting values). Never passwords, tokens, keys, review or
feedback text, or account records. Emails are looked up when the log is shown,
not stored in it.

## 9. Routes

| Path | Kind | Notes |
| --- | --- | --- |
| `/admin`, `/admin/users`, `/admin/reviews`, `/admin/feedback`, `/admin/announcements`, `/admin/changelog`, `/admin/settings`, `/admin/access`, `/admin/audit` | `src/app/(product)/(admin)/admin` | Inside `(product)` to share its `AuthProvider` and dialogs, outside `(app)` so no account or chronicle loads. noindex, not in the sitemap |
| `/api/admin/*` | One catch-all route | Route table in `src/lib/platform/server/admin-api.ts` |
| `/api/reviews`, `/api/feedback` | Student routes | Run the user's own database functions with the user's token |
| `/announcements` | In-app | Every published announcement |
| `/testimonials` | Public | `/reviews` was taken by the Performance Review (since moved: `/testimonials` now redirects to `/reviews`) |
| `/changelog`, `/changelog/[slug]` | Public | Published entries only |

## 10. Feature access, for later

`src/lib/features.ts` names every product feature (`FeatureKey`) and resolves
access through a `FeatureAccessProvider`. The only provider today grants every
feature to every signed-in account. The app shell and navigation already ask
it, so a future entitlement provider replaces one object instead of touching
every module. It is given an account id and nothing else: never a platform
role, so an administrator gains nothing commercial and a future plan grants
no administration. No payment code, plan, price, label, lock or upsell exists.
See [`feature-access.md`](feature-access.md).

## 11. Test plan

- `npm test`: the permission matrix, input validation, the admin dispatcher
  with stand-ins (every route needs a permission, 401 and 403 paths, forged
  roles), feature access.
- `npm run test:db`: `supabase/tests/platform_admin.sql` after the isolation
  checks: no table is readable or writable by `anon` or `authenticated`;
  admin functions aren't executable by them; the SQL matrix; the last Super
  Admin; the append-only log; the review, feedback, announcement and
  changelog rules.
- `npm run test:e2e:admin`: the real API and pages against the mock Supabase:
  bootstrap with the SQL from `ADMIN_SETUP.md`, RBAC for every role, review
  moderation to the public page and back, suspension enforced at sign-in,
  feedback with private notes, scheduled announcements, changelog drafts,
  audit entries.
- The existing `npm run test:e2e` (20 scenarios) and `npm run seo:audit` as
  regression.

The mock gains what these need: a generic `/rest/v1/rpc/<function>` call that
runs as the caller, the `auth.users` columns Supabase has (`email_confirmed_at`,
`last_sign_in_at`, `banned_until`), Auth admin `GET`/`PUT
/admin/users/<id>` with `ban_duration`, refusal of sign-in for banned
accounts, and `/__mock/sql` for tests to run the documented setup SQL.

## 12. Supabase Free plan

- No new service, secret or dependency: the existing service-role key, the
  anon key and plain `fetch`.
- Lists are paginated and filtered in SQL; the overview is one database call.
- Token checks are cached for 30 seconds per server instance, so moving around
  the Admin Center doesn't call Supabase Auth on every click. Roles are read
  fresh on every request, so a revoked role stops working at once.
- Students' apps make one small call for announcements when they open, and one
  to learn whether to show the Admin Center link. Public pages are cached.

## 13. After building it

What the implementation added to, or changed in, the plan above, and what
it found on the way.

- **The Admin Center's theme.** The product layout's `ThemeModeSync` applied
  the chronicle store's theme on mount. Outside the app the store never
  loads, so it applied the default, and every account saw Lavender in the
  Admin Center whatever it had chosen. It now waits for the store to load;
  pages without it keep the theme painted before React. This also removes a
  brief Lavender frame in the app, before an account's data loaded, for
  people who chose Light or Dark.
- **The sitemap is built per request.** Next 14 doesn't clear a stored route
  handler when a cache tag is revalidated (only pages and fetches), so a
  stored `sitemap.xml` would have missed a new changelog entry for up to five
  minutes. Its database answer is still cached and tagged, so this costs no
  extra database calls.
- **Refusals that are rules.** Suspending yourself, or an account with a role,
  is refused as `forbidden` (403), not `invalid`.
- **One call for the student's inbox.** `platform_my_announcements` also
  returns how many of the team's answers to the person's feedback are unread,
  so the bell can say so without another request, and
  `platform_mark_announcements_read` marks a whole page as read in one call.
- **The rule on the reviews page is the rule in force.** `platform_public_site`
  returns the eligibility thresholds, so `/testimonials` states the real
  numbers rather than the defaults.
- **No review structured data.** Search engines treat a site's reviews of
  itself as self-serving, so `/testimonials` has no `Review` or
  `AggregateRating` markup.

Known limits, by design or by platform:

- A suspended account's open session keeps working until its access token
  expires (an hour by Supabase's default). New sign-ins and refreshes are
  refused at once, and a suspended administrator's role stops at once.
- Whether new accounts can be created is a Supabase setting; the settings
  page links to it.
- Database size, egress and quota appear only in the Supabase dashboard.
- Email delivery of feedback (Resend) can't be exercised against the mock;
  without Resend the Feedback Center still receives everything. (Email was
  later removed altogether; see the note in section 7.)
- The menu's Admin Center link is checked at most every five minutes per
  tab; `/admin` itself always checks on the server.
