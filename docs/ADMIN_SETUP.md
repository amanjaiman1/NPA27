# Admin Center: setup and running it

The Admin Center at `/admin` is where the people who run DoOrDie manage it:
accounts, reviews, feedback, announcements, the public changelog, platform
settings, who has access, and the audit log. It is not a product feature and
it is not for students. Nobody can sign up for it, and nothing a student can
change in their own account (their name, their profile, anything they store)
can give them access.

The design and its reasons are in [admin-architecture-audit.md](admin-architecture-audit.md).
This document is the owner's guide: how to switch it on, how to give others
access, and what each part does.

## Roles

| Role | What it covers | How it's granted |
| --- | --- | --- |
| Super Admin | Everything, including platform settings, admin access and the audit log | Only by running SQL in the Supabase SQL Editor |
| Admin | Users (including suspensions), reviews, feedback, announcements, changelog, figures; the audit log too when "Admins can read the audit log" is on | By a Super Admin, in Admin access |
| Moderator | Reviews, including hiding and restoring them unless "Moderators can hide reviews" is off; feedback too when "Moderators can handle feedback" is on | By a Super Admin, in Admin access |

Everyone else has no row in `public.platform_admin_memberships` and no access.
A role is never a product entitlement: what a student can use in the app is
decided separately (see [feature-access.md](feature-access.md)), and every
student has every feature.

Rules the database enforces, whatever the app does:

- Nobody can change their own role or remove it.
- Super Admin can't be granted, changed or removed from the app at all.
- The last Super Admin can't be removed or demoted, even in the SQL Editor.
  The one exception is deleting that account from Supabase: the account and
  its role go together.
- Every grant, change and removal is written to the audit log, including
  ones made in the SQL Editor (they show as "Supabase SQL Editor").
- A suspended account's role stops working at once.

## Switching it on

### 1. Run the migrations

In the Supabase SQL Editor, run each file in `supabase/` in this order, once.
They are all safe to run again.

1. `supabase/schema.sql`
2. `supabase/migrations/20261115120000_multi_user_sync.sql`
3. `supabase/migrations/20261118120000_journal_attachments.sql`
4. `supabase/migrations/20261125120000_roadmap_plans.sql`
5. `supabase/migrations/20261202120000_diary_coach_privacy.sql`
6. `supabase/migrations/20261203120000_dispatch_completed_activities.sql`
7. `supabase/migrations/20261204120000_platform_admin.sql` (the Admin Center)
8. `supabase/migrations/20261205120000_live_updates.sql` (changes reach open apps at once)
9. `supabase/migrations/20261210120000_trust_reviews.sql` (the five-step review
   form, verification badges, the dashboard invitation, edit history, consent
   history, the public reviews pages and the changelog's new fields)
10. `supabase/migrations/20261212120000_help_feedback.sql` (Help & feedback
    without email: feedback never carries an address, and crash reports are
    kept for the team under Feedback → Crash reports)
11. `supabase/migrations/20261213120000_live_everywhere.sql` (everything updates by itself)
12. `supabase/migrations/20261214120000_last_active.sql` (the table visits are kept in)
13. `supabase/migrations/20261215120000_presence.sql` (Last visit in Users: on the
    site now, when each account opened the app and when it left)

If you use the Supabase CLI, `supabase db push` runs the same migrations.

The Admin Center migration creates the platform tables (all with row-level
security on and no direct access for anyone), the private `platform-feedback`
storage bucket for feedback screenshots (2 MB, PNG, JPEG or WebP), and the
database functions the Admin Center and the app call. The trust migration only
adds to it: new columns and tables for reviews, new settings with their
defaults, and new versions of the review functions. Reviews already published
stay published.

### 2. Check the server's environment

The Admin Center uses what DoOrDie already needs. Nothing new to add:

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Accounts at all |
| `SUPABASE_SERVICE_ROLE_KEY` | The Admin Center's server routes (they check the caller, then act with this key), suspensions, feedback screenshots, and storing crash reports. The same key account deletion already uses. Server only, never `NEXT_PUBLIC_` |

Nothing in the Admin Center sends email. If `RESEND_API_KEY`,
`REPORTS_TO_EMAIL` or `REPORTS_FROM_EMAIL` are still set in Vercel from an
earlier version, nothing reads them now and they can be deleted.

Without the service-role key, `/admin` says the Admin Center isn't set up.

### 3. Make yourself the first Super Admin

1. Sign up in the app with the account you'll run the platform from, and
   confirm its email.
2. Find its user id: Supabase Dashboard → Authentication → Users, and copy
   the UID. Or run `select id, email from auth.users where email = 'you@example.com';`
3. In the SQL Editor, run this with your UID in place of the placeholder:

<!-- bootstrap-sql:start -->
```sql
insert into public.platform_admin_memberships (user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'super_admin')
on conflict (user_id) do update set role = 'super_admin';
```
<!-- bootstrap-sql:end -->

The same statement adds another Super Admin later, or promotes an Admin. It
is recorded in the audit log as done in the SQL Editor.

### 4. Open it

Sign in on the ordinary sign-in page (`/login`) with that email and
password. A Super Admin account goes straight to the Admin Center: there is
nothing to type after the address.

A Super Admin account runs the platform and has no student app. Opening the
site, the installed app or any page of the student app while signed in with
it also opens the Admin Center, so it never goes through student setup or
sees the dashboard. Sign out from the bottom of the Admin Center's menu (on a
phone, open the menu first).

Admins and Moderators are student accounts with extra access. They still
land in the app when they sign in, and reach the Admin Center from the
**Admin Center** link in the account menu. That link can take up to five
minutes to appear in a tab that was already open; `/admin` works at once.
From the Admin Center they can go **Back to the app** or **Sign out**.

The browser remembers the account's role (under
`upsc-chronicle-platform-role:<user id>`) only to know where to go. It is
asked fresh at every sign-in and checked again every few minutes, and
signing out removes it. What anyone may do is still checked on the server
for every page and request.

## Day to day

### Giving someone access

In **Admin access** (Super Admin only), enter the email of an existing
DoOrDie account, pick Admin or Moderator, and say why if you like. They can
open `/admin` straight away. From the same page you can switch someone
between Admin and Moderator, or remove their role (with a reason, which is
kept in the audit log). Their account and data aren't touched.

To remove or demote a Super Admin, use the SQL Editor:

```sql
-- Demote to Admin
update public.platform_admin_memberships set role = 'admin' where user_id = '<UID>';
-- Or remove the role entirely
delete from public.platform_admin_memberships where user_id = '<UID>';
```

Both are refused for the last Super Admin.

### Accounts

**Users** lists every account with what's needed to run the platform: email,
when it joined, its last visit, when it last signed in, whether its email is
confirmed, whether it's suspended, and its role. Never anything the person
wrote in DoOrDie. Search by email or paste an account id.

**Last visit** says whether the account is on the site right now, and
otherwise when it left and when that visit began. The account's dialog has
both times to the second, and how long the visit lasted. The list and an
open dialog change by themselves the moment someone opens the app, leaves
it or comes back. Only times are kept, never what the person did:

- Each tab of the app reports "here" when it opens or comes back on screen,
  and once a minute while it stays there. It reports "left" the moment it
  goes off screen: the tab is closed or hidden, the phone locked, another app
  opened, or the account signs out. "Left" goes with `navigator.sendBeacon`
  through `/api/presence`, the one request browsers finish after a tab has
  closed.
- The account is on the site while any of its tabs is, on any device: the
  phone locking while the laptop is open ends nothing. Each tab sends a
  random id (nothing about the device) and numbers its reports, so a late
  one is ignored.
- Coming back within five minutes carries on the same visit. After longer
  away, the next report starts a new one.
- If a tab's "left" never arrives (the browser was killed, the connection
  dropped), it counts as gone two and a half minutes after its last report,
  and the visit ends at that report.
- Moving between the app and the Admin Center is one visit. Opening a page
  of the public site (the blog, say) counts as leaving: those pages don't
  load accounts. A page left open on screen counts as being on the site. The
  demo reports nothing.
- `platform_mark_presence()` can report only for the signed-in account, with
  the database's clock. `platform_last_active` keeps one row per account,
  no browser can read it, and it goes when the account is deleted.

"Not recorded" means the account hasn't opened the app since
`20261215120000_presence.sql` ran (an account seen only before that shows when
it was last seen, without an opening time). Last sign-in is different: it
changes only when someone signs in again, which can be weeks apart.

Suspending an account (Admin or Super Admin, with a reason and a length)
blocks new sign-ins at once through Supabase Auth's ban. A session that's
already open keeps working until its access token expires, which is within
an hour by Supabase's default. Nothing is deleted, and **Restore** lifts it.
You can't suspend yourself or anyone with a role; remove the role first.
Admins can't delete accounts or change anyone's email or password: people
do that themselves in Settings.

The overview's sign-in figures come from Supabase Auth's `last_sign_in_at`.
They show recent sign-in activity, not how much anyone uses the app.

### Reviews

**Who can write one.** Students write a review in Settings → Review DoOrDie,
once their account has been in use long enough. By default that's 14 days
since its first record and records on at least 5 different days, counted in
the database from the dates of their records (journal days, life entries,
revisions, habit check-ins, mocks and roadmap work), never from what those
records say, and never from the account's creation date alone. Both numbers
are in Platform settings.

**The invitation.** Once a student qualifies and hasn't written a review, a
quiet card on their dashboard asks for one, with **Write a review**, **Later**
and **No thanks**. Later asks again in 14 days; No thanks, or a third Later,
stops it for good. It never pops up and never appears anywhere else. Switch it
off with "Invite eligible students".

**The form** has five steps: a rating from 1 (Poor) to 5 (Excellent), with
nothing chosen in advance; six questions, every one optional (what problem
they had before, what's been most helpful, how it changed the way they
organise their preparation, what to improve, which is never published, and
what they'd tell another aspirant); the features they used; optional context
(their stage, full time or working, a headline, how their name is shown:
their name, initials, or none, and whether to show they're an established
member); and two separate permissions:

- **Private product feedback:** the team may read it. Needed to send it.
- **Public student testimonial:** it may appear on the website after a
  moderator's check. Off unless they tick it, with a preview of exactly how
  it would look. It needs at least 30 characters in "What would you tell
  another aspirant?".

Each permission is stored with its time and the version of the wording they
agreed to, and every change to them is kept in the review's consent history.

| Status | Meaning |
| --- | --- |
| Pending | Waiting for a moderator |
| Published | On the website (`/reviews`, and the home and feature pages if the settings say so) |
| Approved | Checked, but not public: the author didn't allow it |
| Rejected | Not published, with a reason the author sees |
| Hidden | Taken off the website, with a reason the author sees |
| Withdrawn | The author took it back |

**Moderating.** The Reviews page has the figures (how many in each state, the
average of what's on the website, where reviews came from, twelve weeks of
volume, the latest moderation actions) and the queue. Opening a review shows
its account's safe facts (when it joined, whether its email is confirmed),
its history, its consent history and its earlier versions. Never anything
from the student's records.

Rejecting or hiding needs one of these reasons, and an optional note the
author sees: spam, abuse or harassment, personal details, impersonation,
fraud or manipulation, unrelated to DoOrDie, illegal content, or another
policy. **Being negative is never a reason**, and reviews are never edited:
the moderation screen has no way to change what someone wrote. A moderator can
add one public reply, shown under the review, and can **feature** a review on
`/reviews` for being detailed and useful, never for its rating.

**Edits.** If the author changes anything shown publicly, the earlier version
is kept in the review's history and the review goes back to Pending. What the
website shows meanwhile is the "When a published review is edited" setting:
the version a moderator approved (the default), or nothing until a moderator
approves the edit. An edit also takes the review out of Featured until a
moderator features it again. Changes only to "What should we improve?" don't
need a moderator again. If the author turns off public display, withdraws the review
or deletes it, it leaves the website at once: the public pages are rebuilt on
the spot, and are never more than five minutes old in any case.

**Badges** are worked out by the database from the author's records when a
review is published. Nobody can give one to themselves, and moderators can't
add or remove them:

| Badge | Needs |
| --- | --- |
| Verified DoOrDie user | The account met the rule for reviewing |
| Verified active user | Records on at least 15 different days ("Days for Verified active user") |
| Verified feature use | Records in the features the author ticked. Features that leave no dated records, such as the diary or the Study Coach, aren't verified |
| Established member | An account at least 90 days old ("Days for Established member"), and the author's choice to show it |

The website shows the badges, never the counts behind them.

**On the website.** `/reviews` lists every published review, newest first,
whatever its rating, with filters by rating, feature and stage. Reviews with
at least 600 characters of answers ("Length of a story") also get a page of
their own at `/reviews/<address>`, listed in the sitemap; shorter ones don't,
so there are no thin pages. The average rating and the breakdowns appear only
once 5 reviews are published ("Reviews before an average"), and count every
published review. With none published, the site says so plainly: there are no
placeholder or sample reviews anywhere.

### Feedback

Students send messages from **Help & feedback**, the small round button at the
bottom right of every page of the app. It's there for signed-in accounts
only: not on the public site, the sign-in screens, the Admin Center or the
demo. They pick what it's about (bug report, feature request, suggestion,
hard to use, general feedback), write it, and can add a screenshot (made
smaller and stripped of its metadata on the device, at most 2 MB, stored in
the private `platform-feedback` bucket) and their browser's details. It lands
in the Feedback Center at once. Each account can send 10 a day.

**Nothing is emailed**, to the team or to anyone else, and a message never
carries an email address. Answer it here: the author reads the response under
Your messages in Help & feedback, and the bell and a badge on the button tell
them it's there. To see who sent it, **Open the account** (Admins and Super
Admins; the Users page shows the account's email address as usual).

In the Feedback Center, set the status (New, Under review, Planned, In
progress, Resolved, Closed) and priority, add private notes (never shown to
the author), write a response, and link the item to a changelog entry when it
ships. The author sees the status and response, never the notes or the
priority.

**Crash reports** are the Feedback Center's second view. When something
breaks in the app, it sends the error, the page's path, the browser and the
time, and a note if the person wrote one on the error screen and pressed
Send. Never an account, a name, an email or anything written in the app; a
student can switch automatic reports off in Help & feedback. Each distinct
crash (the same error on the same page) is one row, with how many times it
was reported, the latest stack and browser, and the notes. Mark it resolved
when it's fixed: if it happens again, it comes back as new. Delete it if it's
noise. Resolving, reopening and deleting are in the audit log. A crash is
removed 90 days after it was last reported, and at most 1,000 distinct
crashes are kept, so a flood of made-up errors can't fill the database.

### Announcements

Write an announcement, preview it as students will see it, then publish it
now or schedule a start, with an optional end. Categories: Product update, New
feature, Maintenance, Important notice, General. A live announcement shows as
a banner at the top of the app and in the notification bell until the
student opens or dismisses it, and stays on the in-app Announcements page. Each student's read and dismissed
state is kept per account, so dismissing it on a phone dismisses it
everywhere. Archive an announcement to take it down; only drafts can be
deleted.

### Changes reach open apps at once

Anything one person changes shows up for everyone else who has it open,
within a couple of seconds and without reloading:

- **In the Admin Center:** new accounts, sign-ins and suspensions (Users and
  the Overview), visits starting and ending (Users' Last visit), reviews as students send, edit or withdraw them, feedback as
  it arrives, everything other administrators do (moderation, answers,
  announcements, the changelog, settings, roles) and the audit log. A form
  being filled in keeps what's typed; only untouched fields take new values.
  A review its author edits while a moderator has it open says so, and holds
  the decision buttons for a moment.
- **In the app:** announcements and the notice, the team's answers to
  feedback, review decisions, a role granted or removed, and the account's own
  data saved on another device. A suspension ends an open session at once.

How: database triggers (`supabase/migrations/20261213120000_live_everywhere.sql`)
send one small message through Supabase Realtime for every change, whoever
made it, Supabase Auth and the SQL Editor included. Each open screen then
reloads what changed through the routes it always uses. A message names only
the areas that changed, never what changed or for whom. Three private
channels: one every signed-in account may join, one only Admin Center roles
may join, and one per account for that account alone. Nobody can send on them
from a browser.

On the free plan (200 Realtime connections at once), a page holds a
connection only while it's on screen: a tab in the background lets go after a
minute and catches up when it comes back. If Realtime can't be reached, pages
work as before and load when they open.

### Refresh Data

**Refresh Data**, in the header on every page, asks the server again for
everything on screen at once: the page's lists and figures, an open dialog,
your own role. It never reloads the page, so search, filters, the page of a
list, open sections and anything being typed stay as they are. Pressing it
again while it runs does nothing more. Beside it, the header says when it
last finished ("Refreshed 18:42:16", your time, to the second); before the
first press, how old the oldest thing on screen is.

Click that time for the details: each kind of data on screen, updated (and
whether by Refresh Data, a live update, or opening the page) or not, with
Retry for what failed. If something fails, what you see stays, and the toast
names it. Pages that aren't open hold no data, so they load fresh when you
open them; what your role doesn't include is never asked for. How it works:
[`admin-refresh.md`](admin-refresh.md).

### Changelog

Entries are drafts until published. Publish now or on a date; a draft or a
future entry doesn't exist on the public site (its address is a 404). Each
entry has a category (New feature, Improvement, Bug fix, Performance,
Security, Accessibility), a summary, what changed, why it matters, the feature
it's about, full text, an optional image and search title and description, and
lives at `/changelog/<slug>`. Linking feedback to an entry shows "You asked, we
improved" with the number of requests, never who sent them. Give the entry a
feedback theme ("Faster mocks on phones", in your words) and it also appears
under "You asked. We improved." on `/changelog`, the home page and `/trust`,
but only while real feedback is linked to it. Published entries are listed in
the sitemap.

### Platform settings (Super Admin)

| Setting | Default |
| --- | --- |
| Accept new reviews | On |
| Days since first use before a review | 14 |
| Days with records before a review | 5 |
| Invite eligible students (the dashboard card) | On |
| When a published review is edited | Keep the approved version up |
| Reviews before an average | 5 |
| Length of a story (its own page) | 600 characters |
| Days for "Verified active user" | 15 |
| Days for "Established member" | 90 |
| Reviews on the home page, and how many | On, 3 |
| Reviews on the five feature pages | On |
| Moderators can handle feedback | Off |
| Moderators can hide reviews | On |
| Admins can read the audit log | Off |
| Support email on the contact page | Empty (falls back to `NEXT_PUBLIC_CONTACT_EMAIL`) |
| Announcement length and category | 14 days, General |
| Notice in the app (one line on every app page, info or warning) | Off |

Every change is checked by the database and written to the audit log with
its old and new value. Whether new accounts can be created at all is a
Supabase setting (Authentication → Sign In / Providers → Allow new users to
sign up); the Admin Center links to it rather than holding the management
access needed to change it.

### Audit log (Super Admin)

Every administrative action, newest first: who, with which role, did what to
which record, when and why, with the before and after of a change. Filter by
area. Entries can't be edited or deleted by anyone, including a Super Admin
and the service role: the database refuses it. The log stores ids and
labels, never what students wrote, and email addresses are looked up when
the log is read, not copied into it.

### Supabase usage

The Admin Center doesn't show database size, bandwidth or quota: Supabase
doesn't offer those figures to the app, and the overview won't guess them.
See Supabase Dashboard → your project → Usage.

## Running it locally

The mock Supabase used by the tests runs everything without a real project:

```bash
npm run mock:supabase                      # terminal 1: mock on :54321
node scripts/mock-supabase.mjs --print-env > .env.local
npm run dev                                # terminal 2
```

Sign up in the app, then make that account a Super Admin through the mock's
SQL endpoint (it runs as the database owner, like the SQL Editor):

```bash
curl -s localhost:54321/__mock/sql -H 'content-type: application/json' \
  -d "{\"sql\": \"insert into public.platform_admin_memberships (user_id, role) select id, 'super_admin' from auth.users where email = 'you@example.com'\"}"
```

`npm run test:e2e:admin` builds against the mock and checks roles,
permissions, reviews (badges, story pages, edits, the invitation and the
five-step form), feedback, announcements, the changelog, suspension, the audit
log, the Trust Center and the interactive demo end to end, in the browser on a
laptop and a phone.

## When something's wrong

| What you see | Why |
| --- | --- |
| "Not set up yet" on `/admin` | The platform migration hasn't been run |
| "The Admin Center needs Supabase and its service-role key" | `SUPABASE_SERVICE_ROLE_KEY` isn't set on the server |
| "No access" | The account has no role, or it's suspended |
| A Super Admin lands on the student dashboard or setup | The membership row is missing, or says another role: run the step 3 SQL again with the account's UID, then sign in again |
| A page "isn't part of your role" | That role doesn't include the page (Moderators see Reviews, and Feedback only if the setting is on) |
| No Admin Center link in the account menu | Reload the tab; the menu checks at most every five minutes |
| Reviews don't appear on the site | The author didn't allow public display, it isn't published yet, or the display settings are off |
| No average rating on `/reviews` | Fewer reviews are published than "Reviews before an average" |
| No Help & feedback button | It's only in the app, for signed-in accounts: not on the public site, the sign-in screens, the Admin Center or the demo |
| "Crash reports aren't set up" on an error screen, or an empty Crash reports view | The `20261212120000_help_feedback.sql` migration hasn't run, or `SUPABASE_SERVICE_ROLE_KEY` isn't set on the server |
| A student isn't invited to review | They don't meet the rule yet, already wrote one, said Later in the last 14 days or No thanks, or invitations are off |
| A badge is missing from a review | The author's records don't support it: badges are worked out when a moderator publishes the review |
