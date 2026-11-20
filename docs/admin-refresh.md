# Admin Center: Refresh Data

One **Refresh Data** button, in the Admin Center's header on every page,
asks the server again for every piece of Admin Center data on screen, from
every module, at once. It doesn't reload the page: filters, search, the page
of a list, open sections, open dialogs and anything being typed stay as they
are. Next to it, the header says how fresh what's on screen is, and a panel
shows what came of each kind of data.

The code: `src/lib/platform/admin-refresh.ts` (the coordinator, no React),
`src/lib/platform/client.ts` (`useAdmin`, `useAdminView`,
`useAdminRefreshState`) and `src/components/admin/refresh-data.tsx` (the
header's control and its panel). Tests: `tests/admin-refresh.test.ts` and
scenarios 26 to 28 of `tests/e2e/admin.e2e.mjs`.

## 1. How the Admin Center loaded its data before

Every page is a client component that asks the protected Admin API
(`/api/admin/*`, `src/lib/platform/server/admin-api.ts`) for what it shows.
Each request verifies the session's token and reads the caller's role
afresh (`requireAdmin`), and every database function checks the role again.
Responses are `Cache-Control: private, no-store`.

| Module | Data source (Admin API → database function) | Loaded by | Kept | Pagination, filters | Live updates | Shared with |
| --- | --- | --- | --- | --- | --- | --- |
| Your role | `me` (the verified actor) | `AdminRoot`'s gate | for the session | – | `role`, `access` | every page (`useAdminActor`) |
| Overview | `overview` → `platform_admin_overview` | `useAdmin` | while open | – | users, reviews, feedback, announcements, changelog, audit; scheduled starts (`useRefreshAt`) | – |
| Users | `users?…`, `users/:id` → `platform_admin_list_users`, `_get_user`, `_presence` | `useAdmin` ×2 | while open | server-side pages, filter, search | users, access, reviews, feedback, activity; visits running out | list and dialog show the same account |
| Reviews | `reviews?status&limit&offset` (with counts and stats), `reviews/:id` | `useAdmin` | while open | server-side pages, tabs | reviews | – |
| Feedback | `feedback?…`, `feedback/:id`, and `changelog` in the dialog | `useAdmin` ×3 | while open | server-side pages, status, category, priority, search | feedback, changelog | – |
| Crash reports | `crashes?status=new&limit=1` (the count), `crashes?…`, `crashes/:id` | `useAdmin` | while open | server-side pages, status | feedback | the count and the list |
| Announcements | `announcements` (items, readership, defaults) | `useAdmin` | while open | all at once | announcements, settings; starts and ends | the editor's defaults |
| Changelog | `changelog` | `useAdmin` | while open | all at once | changelog, feedback; scheduled dates | the Feedback dialog |
| Platform settings | `settings` | `useAdmin` | while open | – | settings | – |
| Admin access | `access` (members and role history) | `useAdmin` | while open | – | access | your role |
| Audit log | `audit?action&targetType&targetId&before` | its own loader | pages loaded so far | cursor ("Load older"), filters | audit | the Overview's recent actions |

What that meant for a refresh:

- **Nothing is cached once a page closes.** A page's data lives in its
  components; leaving the page drops it, and opening it again always asks
  the server. So a module that isn't open can't be stale. Refreshing it
  would fetch data nothing shows. The router keeps page shells, never data.
- **The live updates already keep what's on screen current**
  (`components/platform/live-updates.ts`, one Realtime connection per tab).
  A manual refresh is for when they can't: Realtime unreachable, a tab that
  slept, or simply wanting to be sure.
- **Each `useAdmin` threw away every answer but the newest request's.** A
  newer request that failed hid an older one that worked, and nothing gave
  up on a request that hung: a page could wait forever.
- **Quiet failures were silent**, which suits live updates but not a button
  that has to say how it went.
- **The audit log's live merge could add an entry twice** when two merges
  overlapped (it read what was shown from a ref, not from the latest state).
- **The announcement editor reset itself** when the default category
  arrived changed (a refresh, or a live update after a settings change),
  wiping a draft being written. The publish dialog did the same with its
  dates when the default length changed.
- **`AdminRoot`'s error screen reloaded the browser** to try again.

## 2. The design

```
Refresh Data (header)
      │
      ▼
Coordinator ── the plan: for every resource, in the role and on screen?
      │            not in the role → skipped, never asked for
      │            not open        → nothing held: loads fresh when opened
      ▼
Views on screen (registered while mounted)
  useAdmin(path) … every list, dialog and figure    useAdminView(…) … the audit log, your role
      │
      ▼
The protected Admin API, one request per address, at most four at a time, 15 s each
      │
      ▼
Each view puts its answer on screen (unless a newer one is there)
      │
      ▼
Per-resource outcome: updated · failed (what's shown stays) · not in your role · not set up · not open
```

- **Resources** are listed once, in `ADMIN_RESOURCES`: overview, users,
  visits (they come with the user list), reviews, feedback, crash reports,
  announcements, changelog, settings, access, audit and your role, each with
  the permission it needs. `adminResourceOf(path)` maps every Admin API
  address to one; a unit test fails if a GET route has none.
- **Views** register while they're mounted. `useAdmin` does it by itself,
  so every page, dialog and figure takes part with no code of its own;
  `useAdminView(resource, key, refresh)` is for anything that loads its own
  way (the audit log, the role check in `AdminRoot`).
- **One refresh at a time.** Pressing again while one runs joins it: no
  second set of requests. Views showing the same address share one request.
  At most four requests are in flight, so a busy page can't flood Supabase.
- **Timeouts.** Each request in a refresh is given 15 seconds, and each page
  load 20, then cancelled. A slow resource never holds up the rest.
- **The newest answer wins, whichever arrives first.** Each view numbers
  its requests (`createResponseOrder`): an answer shows only if no newer
  request's answer already has, and never after the view moved to another
  address (filter, page, record). So a slow request can't overwrite a live
  update or a refresh, and a newer request that fails doesn't block an older
  one that worked. A change the admin makes (`set`) counts as the newest,
  for the address it was made on only.
- **One run at a time.** A second press joins the run under way. A full
  refresh asked for during a retry waits for it, then runs in full.
- **Partial failures.** Each resource's outcome is its own. A view that
  fails keeps what it showed; only something that no longer exists (a 404)
  says so in place, and counts as up to date. A refusal (403) means the role
  changed meanwhile: "not in your role", not an error. If the role itself is
  refused (403) or the session has ended (401), the run ends there
  (`summary.ended`), counts as failed, and the Admin Center says so instead
  of a toast. Problems are described in plain words, never in the server's
  own (`FAILURE_TEXT`).
- **Permissions.** The plan only includes resources the role covers; the
  server checks every request anyway. A Moderator's refresh asks for the
  Overview and their role, and nothing else.
- **No cache to invalidate.** Since nothing is kept once closed, "invalidate
  what isn't open" needs no code: the panel lists those modules as not open,
  loading fresh when opened.
- **Manual and automatic.** Views report their own loads (on opening, after
  a change made here, from a live update), so each resource's time says how
  it last loaded. Freshness is per view: a live update that reaches one
  view doesn't excuse another view of the same data that failed, while a
  view whose request was overtaken by a newer answer counts as up to date.
- **Timestamps** are real completion times, in the admin's own time zone, to
  the second. The header shows the last Refresh Data's finishing time, or
  before one, the oldest load time among what's on screen. The record lives
  for the session and resets on sign-out or a change of account.

Nothing new on the server beyond one field: the users routes now say
whether visit times loaded (`visits: "ok" | "not_set_up" | "failed"`), so a
failed lookup shows as Visits failing rather than as "not recorded".

## 3. The header and the panel

- **Refresh Data**: the icon turns while it runs ("Refreshing…"), then shows
  the outcome for a moment ("Up to date", "Partly refreshed", "Not
  refreshed"). A toast says "Admin data refreshed successfully." or "Some
  information could not be refreshed. Your existing data is still
  available." with the resources that failed and a **Details** button.
- **The status** beside it ("Refreshed 18:42:16") opens the panel: each
  resource on screen with its state, its time and how it last loaded, a
  Retry for what failed, then one line for what isn't open and one for what
  the role doesn't include. On a phone both are round buttons, and the panel
  opens under the header, clear of the toasts. The panel is in the same
  stack as the app's modals (`useOverlayLayer`): Escape and Tab go to
  whichever is on top, Tab stays inside the panel, and Retry stays focusable
  (`aria-disabled`) while a run is going. While a modal is open, the panel is
  reached through the toast's **Details**.

## 4. Adding a module

1. Add its resource to `ADMIN_RESOURCES` and its address to
   `adminResourceOf` (and to `adminAreasFor` in `live.ts` for live updates).
2. Load its data with `useAdmin(path)`. That's all: it takes part in Refresh
   Data, live updates and the panel. If it loads some other way, register it
   with `useAdminView` and give it a `refresh(ctx)` that fetches through
   `ctx.get` and puts the answer on screen, or throws.
3. If an answer carries another resource's data (as the user list carries
   visits), pass `report` to `useAdmin` to say how that part fared.

## 5. Tests

- `tests/admin-refresh.test.ts`: every route has a resource; one request per
  address; a second press joins the run; resources outside the role never
  asked for; a 403 as outside the role; one failure kept to its resource and
  a retry for it alone; timeouts cancel the request; at most four at once;
  offline said plainly; visits not set up versus failed; a gone record; a
  live update during a run not hiding a failed view; a view that throws; a
  session's end; the answer order; the audit log's merge, keeping entries
  newer than the fresh page; a full refresh during a retry, queued and run in
  full; the role refused, ending the run; a retry before any refresh leaving
  the last refresh unset; no page reloads anywhere in the Admin Center.
- `tests/e2e/admin.e2e.mjs` scenario 26, with live updates switched off in
  the browser so only Refresh Data can change the screen: a new account in
  the Overview's figures; a suspension on the second page of a search, with
  the search, the page and the scroll position kept; reviews, feedback,
  announcements and the changelog changed elsewhere, refreshed or loaded
  fresh; an open section and an unsent review response kept; a setting being
  edited and an email being typed kept; five presses making one refresh with
  one request per address; one resource failing, named in the toast and the
  panel without the server's words, and retried; the audit log; and no page
  load throughout. Scenario 27: a Moderator's refresh asks only for what the
  role covers, and an account without a role gets 403 from every address.
  Scenario 28: a phone, and all three themes.
