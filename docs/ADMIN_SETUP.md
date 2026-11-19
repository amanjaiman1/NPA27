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
| Admin | Users (including suspensions), reviews, feedback, announcements, changelog, figures | By a Super Admin, in Admin access |
| Moderator | Reviews; feedback too when the "Moderators can handle feedback" setting is on | By a Super Admin, in Admin access |

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

If you use the Supabase CLI, `supabase db push` runs the same migrations.

The last one creates the platform tables (all with row-level security on and
no direct access for anyone), the private `platform-feedback` storage bucket
for feedback screenshots (2 MB, PNG, JPEG or WebP), and the database
functions the Admin Center and the app call.

### 2. Check the server's environment

The Admin Center uses what DoOrDie already needs. Nothing new to add:

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Accounts at all |
| `SUPABASE_SERVICE_ROLE_KEY` | The Admin Center's server routes (they check the caller, then act with this key), suspensions, feedback screenshots. The same key account deletion already uses. Server only, never `NEXT_PUBLIC_` |
| `RESEND_API_KEY`, `REPORTS_TO_EMAIL` (optional) | An email to the team when feedback arrives. Without them, feedback still lands in the Feedback Center |

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

Reload the app (or sign out and back in). Your account menu now has an
**Admin Center** link, and `/admin` opens it. The link can take up to five
minutes to appear in a tab that was already open; `/admin` works at once.

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
when it joined, when it last signed in, whether its email is confirmed,
whether it's suspended, and its role. Never anything the person wrote in
DoOrDie. Search by email or paste an account id.

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

Students write a review in Settings → Review DoOrDie, once their account has
been in use long enough. By default that's 14 days since its first record
and records on at least 5 different days, counted in the database from the
dates of their records (journal days, life entries, revisions, habit
check-ins, mocks and roadmap work), never from what those records say, and
never from the account's creation date alone. Both numbers are in Platform
settings.

Each review carries two separate permissions, each with the time it was
given: that the team may read it (needed to send it), and that it may appear
on the website (optional). A review is published only if its author allowed
that, and a moderator has checked it.

| Status | Meaning |
| --- | --- |
| Pending | Waiting for a moderator |
| Published | On the website (`/testimonials`, and the home and feature pages if the settings say so) |
| Approved | Checked, but not public: the author didn't allow it, or a moderator held it back |
| Rejected | Not published, with a reason the author sees |
| Hidden | Taken off the website, with a reason the author sees |
| Withdrawn | The author took it back |

Moderators reject or hide for spam, abuse, personal details or content
unrelated to DoOrDie. **Never because a review is negative**, and reviews are
never edited: the moderation screen has no way to change what someone wrote.
A moderator can add one public reply, shown under the review.

If the author changes anything shown publicly (rating, headline, text, what
was useful, features, stage or name), the review goes back to Pending and off
the website until a moderator looks again. If they turn off public display,
withdraw it or delete it, it leaves the website at once: the public pages are
rebuilt on the spot, and are never more than five minutes old in any case.

The website shows the newest published reviews first, whatever their rating,
and the average on `/testimonials` counts every published review.

### Feedback

Settings → Help & feedback sends a bug report, feature request, suggestion,
usability problem or general message, optionally with a screenshot (made
smaller and stripped of its metadata on the device, at most 2 MB, stored in
the private `platform-feedback` bucket). If Resend is set up, the team also
gets an email with a link to it. Each account can send 10 a day.

In the Feedback Center, set the status (New, Under review, Planned, In
progress, Resolved, Closed) and priority, add private notes (never shown to
the author), write a response (the author sees it in Settings, and the bell
tells them), and link the item to a changelog entry when it ships. The author
sees the status and response, never the notes or the priority.

### Announcements

Write an announcement, preview it as students will see it, then publish it
now or schedule a start, with an optional end. Categories: Product update, New
feature, Maintenance, Important notice, General. A live announcement shows as
a banner at the top of the app and in the notification bell until the
student opens or dismisses it, and stays on the in-app Announcements page. Each student's read and dismissed
state is kept per account, so dismissing it on a phone dismisses it
everywhere. Archive an announcement to take it down; only drafts can be
deleted.

The app asks for announcements once when it opens and again when a tab comes
back after 15 minutes or more. No polling and no Realtime.

### Changelog

Entries are drafts until published. Publish now or on a date; a draft or a
future entry doesn't exist on the public site (its address is a 404). Each
entry has a category (New feature, Improvement, Bug fix, Performance,
Security), a summary, full text, an optional image and search title and
description, and lives at `/changelog/<slug>`. Linking feedback to an entry
shows "You asked, we improved" with the number of requests, never who sent
them. Published entries are listed in the sitemap.

### Platform settings (Super Admin)

| Setting | Default |
| --- | --- |
| Accept new reviews | On |
| Days since first use before a review | 14 |
| Days with records before a review | 5 |
| Reviews on the home page, and how many | On, 3 |
| Reviews on the five feature pages | On |
| Moderators can handle feedback | Off |
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
permissions, reviews, feedback, announcements, the changelog, suspension and
the audit log end to end, in the browser on a laptop and a phone.

## When something's wrong

| What you see | Why |
| --- | --- |
| "Not set up yet" on `/admin` | The platform migration hasn't been run |
| "The Admin Center needs Supabase and its service-role key" | `SUPABASE_SERVICE_ROLE_KEY` isn't set on the server |
| "No access" | The account has no role, or it's suspended |
| A page "isn't part of your role" | That role doesn't include the page (Moderators see Reviews, and Feedback only if the setting is on) |
| No Admin Center link in the account menu | Reload the tab; the menu checks at most every five minutes |
| Reviews don't appear on the site | The author didn't allow public display, it isn't published yet, or the display settings are off |
