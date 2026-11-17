# Accounts, isolation and sync

Every account is an independent chronicle. This note explains how that is
enforced, layer by layer, and how one account's data moves between its devices.

## What belongs to whom

| Kind | Examples | Where it lives |
| --- | --- | --- |
| **Private, per account** | Profile and exam date, journal, study hours, syllabus progress, revision schedule, mocks, mistakes, goals, books' progress, current affairs, reviews, reflections, habits, life log, knowledge-graph links, accomplished days, notification preferences and read state, appearance | The account's snapshot: one `chronicle_state` row, mirrored in the browser under the account's own keys |
| **Per account, per device** | Notification delivery bookkeeping, the custom wallpaper photo, the last-synced copy used for merging | Browser only, under keys or IndexedDB slots that carry the account id |
| **Device-wide, not personal** | Sidebar collapsed, PWA install prompt dismissed | Browser only |
| **Shared reference** | The GS syllabus and its topics, the standard book list, habit suggestions, the curated links between syllabus topics, the optional CSE 2027 roadmap | Code (`lib/seed.ts`, `lib/plan.ts`). Each account gets its own copy at setup, so progress on it is private |

A new account starts from the shared reference only: an empty journal, no mocks,
goals or mistakes, a syllabus with nothing studied, and a profile filled in by its
owner during first-run setup (`components/account/onboarding.tsx`).

## The database (the security boundary)

- `chronicle_state` has Row Level Security on, with select/insert/update/delete
  policies of `auth.uid() = user_id`. Since the multi-user migration, browser roles
  can no longer write the table directly at all: the only write path is
  `save_chronicle_state(p_data, p_base_version)`, a function that acts on
  `auth.uid()`'s own row and never on an id the caller supplies.
- A trigger stamps every write server-side: `version` goes up by one,
  `updated_at` is the database clock, and `user_id` can never change.
- `chronicle_push_subscriptions` and `chronicle_push_log` keep their per-user RLS
  policies; the log has no write policy for browsers at all.
- `chronicle_dispatch_snapshots` (the dispatcher's reader) can be executed by the
  service role only.
- Deleting a user cascades to all three tables.
- The service-role key is read only in `lib/supabase-admin.ts`, which runs in API
  routes (push and account deletion) and never in the browser bundle.

`supabase/tests/rls_isolation.sql` proves these rules inside Postgres, and is run
by `npm run test:db` on every change.

## The browser

`lib/account/scope.ts` scopes every key to the active account:

```
upsc-chronicle-store:<account id>          the persisted Zustand store
upsc-chronicle-surface|palette|…:<id>      appearance, read by the pre-paint script
upsc-chronicle-ready:<id>                  this browser has completed a sync
upsc-chronicle-conflicts:<id>              edits that clashed between devices
IndexedDB upsc-chronicle-sync / <id>       the last-synced copy, for merging
IndexedDB upsc-chronicle-media / custom:<id>  the custom wallpaper photo
```

With no active account, every read returns nothing and every write is dropped.
`lib/account/session.ts` loads and unloads an account in a fixed order:

- **Activate:** point storage at the account, reset the store in memory with
  writes still off, turn writes on, then read the account's saved state.
- **Deactivate:** turn writes off and detach storage first, then reset the store
  and the look.

`components/account/account-session.tsx` is mounted once per account, keyed by
its id, so a different account remounts every page, form and cache. Nothing
renders until the right account's data is loaded; a fresh browser waits for the
first download instead of showing an empty dashboard.

**Signing out** pushes anything pending, unsubscribes this device from
background push, stops sync, unloads the account, and — once everything is
confirmed in the cloud — removes the account's keys and IndexedDB entries from
the browser. If changes couldn't be synced (offline), the student is asked; the
changes then stay in the browser, under that account's keys only, and sync at the
next sign-in there. Only this device's session ends (`scope: "local"`).

**Deleting an account** (Settings → Delete account) requires typing DELETE and
re-entering the password, which gives the server a fresh token.
`/api/account/delete` takes the user from that token, refuses tokens older than
ten minutes, and deletes the auth user; the database cascade removes everything
else. The browser's copy is wiped too.

## Sync

`lib/sync/engine.ts` keeps an account's local snapshot and its cloud row in step:

1. **Check, don't download.** On start, on return to the app, when the connection
   comes back and every three minutes while visible, it asks only for the row's
   `version`. Full data is fetched only when that version differs from the one
   this device last synced.
2. **Save on top of a known version.** Edits are debounced (2 s, at most 10 s) and
   saved with `save_chronicle_state(data, version)`. If another device saved in
   between, the save is refused.
3. **Merge, then save.** On a refusal it fetches the newer copy and merges three
   ways (`lib/sync/merge.ts`): the version both devices started from, this
   device's copy, and the cloud's. Journal days and the life log are matched by
   date, every other list by `id`, and objects field by field, so edits to
   different things are all kept and a deletion only wins over an unchanged item.
   When the same field was changed on both devices, this device's value is kept
   and the other is recorded in Settings → Data, where it can be downloaded.
4. **Retry.** Network failures back off (2 s to 60 s); the status shows
   "Offline" and changes stay saved on the device.

Only one tab per account talks to the cloud. Tabs elect a leader with the Web
Locks API; the others save locally, the leader picks those saves up through
`storage` events, and its status is shared over a `BroadcastChannel`
(`lib/sync/coordinator.ts`).

### Data from before accounts

Older versions stored everything under one unscoped key. On the first sign-in
after the upgrade, `lib/account/legacy.ts` moves it into the account that last
synced it from that browser (the old app recorded that account in
`upsc-chronicle-cloud-synced:<id>`). The first sync then decides whose copy is
newer: if the cloud hasn't changed since that browser last synced, the local copy
is saved; otherwise both are merged, keeping everything from each side. The old
key is removed only after that sync succeeds. Data with no such marker is never
given to anyone.

## Free-plan footprint

See the README's *Free-plan budget*. In short: snapshots are text only (a year of
logging is about 360 KB), reads are version checks, writes return a version, and
the dispatcher reads a trimmed copy.
