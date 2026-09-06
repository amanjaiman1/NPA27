# Intelligent notifications

Nothing in the Chronicle nags you on a timer. Every notification is *derived* —
a pure function reads the same data the pages read and returns the set of things
that are true right now. There is no notification table, no scheduler, no
server job. Delete your read-state and the exact same list comes back, because
the list was never stored in the first place.

That one decision is what makes the system honest: a notification cannot drift
out of sync with reality, because it *is* reality, recomputed.

## The five layers

Each layer only knows about the one below it. You can stop after layer 3 and
still have a complete, useful feature — layers 4 and 5 are delivery mechanisms.

| Layer | What it does | File |
| --- | --- | --- |
| 1 · Rules engine | Pure `(data, now, settings) → Notice[]`. No React, no storage, no side effects. | `src/lib/notifications.ts` |
| 2 · State | Which notices are read / dismissed / snoozed, plus your settings. | `src/lib/store.ts` |
| 3 · Notification centre | Bell + unread count, grouped panel, deep links. | `src/components/notifications/centre.tsx` |
| 3 · Settings pane | Permission ask, delivery options, per-rule and per-category mutes. | `src/components/notifications/settings-pane.tsx` |
| 4 · Browser notifications | Permission flow, quiet hours, rate limit, daily digest — fires the OS-level toast. | `src/components/notifications/notifier.tsx` |
| 5 · Background push | Delivers when the app is **closed**: a cron-driven dispatcher, per-device subscriptions, and the worker's `push` / `notificationclick` handlers. Off unless configured. | `src/app/api/push/*`, `src/lib/push*.ts`, `public/sw.js` |

The store binding lives in `src/components/notifications/use-notifications.ts`,
which is the only place the engine is called from the UI.

### Data flow

```
ChronicleData ──┐
   (store)      │
                ├──► evaluate(data, { now, settings }) ──► Notice[]   (layer 1, pure)
settings ───────┘                                            │
                                                             ▼
                        ┌── buildInbox(notices, notifyState, today)   (pure)
                        │                                    │
                        ▼                                    ▼
                unread count (bell)                 grouped panel (layer 3)
                        │
                        ▼
                planDelivery(inbox, settings, log, now)  ◄── quiet hours,
                        │                                    cap, gap, dedupe
                        ▼
                registration.showNotification(...)   (layer 4)
                        │
                        └── recordDelivery(...) ──► notifyLog

                     ...or, one day, a `push` event  (layer 5)
```

`evaluate`, `buildInbox`, `planDelivery` and `recordDelivery` are all pure and
all tested under plain `node`. The component layer only supplies the clock, the
permission state and the one actual side effect.

The engine is called with an explicit `now`, never `new Date()` internally.
Every rule is therefore testable at any instant, and the timezone bug class that
bit the life dashboard (`docs/life-dashboard.md`) cannot recur here.

## What a notice is

```ts
interface Notice {
  id: string;         // stable identity of this *occurrence*
  ruleId: RuleId;     // which rule produced it
  category: Category; // revision | goals | journal | habits | study | review | life | exam
  priority: Priority; // critical | high | normal | low
  title: string;
  body: string;
  href: string;       // deep link into the page that resolves it
  cta: string;        // the verb on the button
  count?: number;     // for rules that speak for many items at once
  dedupeKey: string;  // rule + subject, with no time bucket
}
```

### Stable ids, and why they carry a time bucket

Read-state has to survive recomputation, so an id may not contain anything
volatile — no array index, no timestamp, no message text. It is built from the
rule and the thing it is about:

```
goal-deadline:g_4f2a:2026-09-06
└─ ruleId ──┘ └ scope ┘ └ bucket ┘
```

The **bucket** is what lets a notice legitimately come back. Marking *"today's
journal is unlogged"* as read should silence it today and say nothing about
tomorrow — so its bucket is the date, and tomorrow's is a different notice with
a different id. A rule that should stay dismissed forever once acknowledged
(`exam-countdown` at the 100-day mark) uses the milestone as its bucket instead
of the date. Rules pick their own bucket; that choice *is* the nag policy.

`dedupeKey` deliberately omits the bucket. It is the identity used by layer 4 to
answer "have I already interrupted them about this recently?" — so re-firing
daily in the centre does not mean re-buzzing daily on the lock screen.

## Rule catalogue

Every rule reads through an existing pure module rather than re-deriving
anything, so a notification and the page it links to can never disagree.

| Rule | Fires when | Priority | Reads | Links to |
| --- | --- | --- | --- | --- |
| `revision-overdue` | Any scheduled revision is past due | high · critical at ≥8 items or ≥7 days late | `bucketRevisions` | `/revision` |
| `revision-due-today` | Something is due today and nothing is overdue | normal | `bucketRevisions` | `/revision` |
| `mistakes-due` | Mistakes are due for recall review | normal | `dueForReview` | `/mistakes` |
| `journal-unlogged` | No entry for today, after your reminder hour | high | `journal` | `/journal?new=1` |
| `journal-streak-risk` | A streak of ≥3 days dies at midnight | critical | `currentStreak` | `/journal?new=1` |
| `habits-pending` | Daily habits unticked, after your reminder hour | normal | `habits` | `/habits` |
| `goal-deadline` | An active goal's deadline is ≤3 days out | high · critical on the day and the day before | `computeGoalProgress` | `/goals` |
| `goal-at-risk` | Pace says the goal will miss its target | normal | `computeGoalProgress` | `/goals` |
| `goal-ready` | A goal has *met* its target and can be closed | normal | `computeGoalProgress` | `/goals` |
| `mock-drought` | No mock attempted in 14 days | high | `mocks` | `/mocks` |
| `review-unwritten` | A week or month ended with no review written | normal | `reviewPeriods` · `findReviewFor` | `/reviews` |
| `reflection-gap` | No reflection in 7 days | low | `reflections` | `/reflections` |
| `subject-stale-topics` | Topics untouched for 45+ days | low | `staleTopics` | `/subjects` |
| `book-stalled` | A *Reading* book has seen no pages in 14 days | low | `journal.booksStudied` | `/books` |
| `ca-gap` | No current affairs logged in 3 days | low | `currentAffairs` | `/current-affairs` |
| `sleep-debt` | 7-day average sleep below 6 hours | normal | `lifeLog` · `sleep` | `/wellbeing` |
| `exam-countdown` | Days-to-exam crosses 365 / 180 / 100 / 50 / 30 / 7 / 1 | high | `profile.examDate` | `/roadmap` |

`goal-deadline` escalates to `critical` on the deadline day and the day before.
`sleep-debt` needs at least four recorded nights in the window — three is not an
average. Sleep is unioned by date across `sleep` and `lifeLog`, because the same
night can be recorded from either page and counting it twice would skew the
figure that decides whether to speak up at all.

### Two pairs of rules are mutually exclusive

- `revision-due-today` is suppressed while `revision-overdue` holds. Being told
  about today's three cards while nine are rotting is worse than being told
  nothing.
- `journal-unlogged` is suppressed while `journal-streak-risk` holds — both would
  say "log today", and only one of them explains what it costs.

Per goal, at most one notice: `goal-ready`, else `goal-deadline`, else
`goal-at-risk`. A goal already at its target that is *not* `readyToComplete` is a
`manual` goal whose number you typed yourself, and gets nothing at all.

### Rules that stay quiet on purpose

`review-unwritten` only asks about a period with at least one logged day inside
it. Without that, a Chronicle opened for the first time would greet you with
"last month has no review" for a month you had not started — and a week you
logged nothing in has nothing to review anyway.

`mock-drought` and `reflection-gap` measure from `profile.startDate` when there
is no history at all, so a three-day-old Chronicle is not scolded for a fortnight
of inactivity that never happened. `book-stalled` needs either a journal mention
or a `startedOn` to measure from; with neither, it says nothing rather than
guessing.

### Grouping, not spamming

Rules about many small things emit **one** notice carrying a `count`, not one per
item — nine overdue revisions is a single row titled *"9 revisions overdue"* whose
body reads *"The oldest has been waiting 12 days."* Rules about a specific named
thing (a goal, a book) emit one notice per thing, because the deep link and the
wording differ; their ids carry the entity id as the scope segment, which is what
lets you dismiss one goal's warning without silencing another's.

## Priority

Priority drives sort order, the colour of the dot, and whether a notice may
interrupt you.

| Priority | Meaning | Weight | May interrupt |
| --- | --- | --- | --- |
| `critical` | Something is lost at midnight if ignored | 0 | yes, bypasses the per-day cap |
| `high` | Actively slipping | 1 | yes |
| `normal` | Worth doing today | 2 | yes, subject to the cap |
| `low` | Ambient | 3 | never — it lives in the centre only, and is left out of the digest too |

Ordering is `(weight, ruleId, id)` — fully deterministic, so the panel never
reshuffles between renders.

## Noise control

Four independent gates sit between "this is true" and "this buzzes your phone".
All four are settings, all four default to something conservative.

- **Quiet hours** — default 22:00 → 07:00, and it wraps midnight correctly. The
  end is exclusive, so 07:00 is already out. It suppresses *delivery* only; the
  centre keeps listing everything. `critical` does **not** bypass it — being woken
  at 3am by a study app is never the right answer.
- **Per-day cap** — default 4. `critical` ignores the cap; `low` never counts
  toward it because `low` is never delivered at all.
- **Minimum gap** — default 45 minutes, so one sync that makes four rules true at
  once does not produce four toasts. `critical` ignores the gap.
- **Per-subject cooldown** — one interruption per `dedupeKey` per day, however
  many times the notice re-appears in the centre.
- **Snooze** — per-notice, `snoozedUntil[id] = ISODate`, hidden from both the
  centre and delivery until that date. Urgent things come back sooner: 1 day for
  `critical`/`high`, 3 for `normal`, 7 for `low`. Because it is keyed on the
  occurrence id, a snooze cannot silence tomorrow's genuinely new instance.

Only one notification is sent at a time when not digesting; the rest wait for the
next gap, in priority order.

**Digest mode** (default on) replaces all of that: one notification per day at
your chosen hour summarising everything outstanding — *"3 things need you
today"*, or the notice's own wording when there is exactly one. `lastDigestOn`
guarantees once-daily across reloads and multiple tabs. The default `digestHour`
of 7 is deliberately the hour quiet hours end, so the out-of-the-box behaviour is
a single summary the moment the night is over.

A delivery is recorded only once the OS has accepted it. Recording one that never
appeared would burn the day's cap and the cooldown on a notification nobody saw.

## Where state lives

Three keys on the store, and nothing else. Notices themselves are never
persisted — only your reaction to them.

| Key | Contents | Synced? |
| --- | --- | --- |
| `notify` | Your settings | **yes** — preferences should follow you |
| `notifyState` | `readIds`, `dismissedIds`, `snoozedUntil` | **yes** — acknowledging on your phone should not leave the laptop nagging |
| `notifyLog` | `lastSentAt`, `lastSentOn`, `sentToday`, `sentOnDate`, `lastDigestOn` | **no** — per-device delivery bookkeeping |

Background push adds two Postgres tables: `chronicle_push_subscriptions` (one row
per device) and `chronicle_push_log` (the server's own copy of the delivery
bookkeeping above). See `supabase/schema.sql`.

`notifyLog` is the one deliberate exception. Each device fires its own OS
notifications, so each keeps its own count; sharing it would let the phone's
digest silence the laptop's.

Dismissing implies reading — an unread counter that still counts something you
explicitly threw away would be lying.

Read/dismiss/snooze entries whose notice has stopped being true are swept **once
per day**, not on every recomputation. Several rules only hold during part of the
day, so sweeping continuously would discard "I've seen this" for a notice merely
between its hours, and it would come back unread.

## Settings

Stored in the synced snapshot, so they follow you across devices. Settings are
read back through `withDefaults`, so an object persisted before a new option
existed gains that option's default rather than carrying `undefined`.

| Setting | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Master switch for the whole centre |
| `deliver` | `false` | Whether to fire OS-level notifications at all (requires permission) |
| `digest` | `true` | One summary per day instead of individual toasts |
| `digestHour` | `7` | When the digest fires |
| `quietFrom` / `quietTo` | `22` / `7` | Quiet hours |
| `maxPerDay` | `4` | Per-day delivery cap |
| `minGapMinutes` | `45` | Minimum spacing between deliveries |
| `reminderHour` | `18` | When "you haven't logged today" starts being fair |
| `mutedRules` | `[]` | Individually silenced rules |
| `mutedCategories` | `[]` | Silenced categories |

## Permission

The browser only grants notification permission from a user gesture, and asking
cold is the fastest way to get denied permanently. So: the bell works with no
permission at all, and the ask is attached to the **Enable notifications**
toggle in the centre's settings pane — a real button press, with the value of
the feature already visible above it.

`denied` is terminal and cannot be re-prompted from script; the pane says so
plainly and points at the browser's own site settings instead of pretending a
retry will help.

## What works when

| Situation | Centre / bell | OS notification |
| --- | --- | --- |
| App open | yes | yes, from the page |
| App backgrounded, tab alive | yes, on next focus | yes, from the page |
| App fully closed | on next launch | yes, **if background push is set up** |

Layer 4 fires from the page, so on its own it needs the page alive. Layer 5 is
what covers a closed app, and it needs a server — there is no client-side
substitute for waking a process that isn't running.

## Background push (layer 5)

Off unless configured. With it, the flow is:

```
scheduler ──► GET /api/push/dispatch          (Bearer CRON_SECRET)
                 │
                 ├─ read every chronicle_push_subscriptions row
                 ├─ batch-read chronicle_state + chronicle_push_log
                 │
                 └─ per user:
                      tz   = pickTimeZone(their devices)   ← the user's zone
                      now  = zonedNow(tz)
                      evaluate → buildInbox → planDelivery   ← the same pure engine
                      web-push each device, payload tailored to its OS
                      advance chronicle_push_log
```

The dispatcher runs **the same four pure functions the browser runs**, so a
pushed notification and the bell cannot disagree. That is the whole reason the
engine has no React and no browser globals in it.

### The server is in the wrong timezone, deliberately corrected

The engine reads local getters — `toISODate`, `getHours` — which is right in a
browser, where "local" *is* the user, and wrong on a server, which is in UTC. Left
alone, an Indian user's quiet hours would begin at 03:30 their time and "today"
would roll over mid-afternoon.

`zonedNow(tz)` in `lib/zoned-time.ts` returns a `Date` whose component getters
already read as the user's wall clock, so no rule needed changing. The device's
IANA zone is captured at subscribe time; where a user's devices disagree the
majority wins, with an alphabetical tie-break so the choice is stable.

That carrier Date is for the engine only — it does not represent the real instant
and must never be stored. `DeliveryLog` keeps both clocks on purpose:
`lastSentAt` is a true instant, because the minimum-gap check is a duration;
every date field is the user's local day, because those are compared against the
user's calendar.

### Per-platform tailoring

One payload, fields a platform doesn't support are simply ignored:

| | Android | macOS / desktop |
| --- | --- | --- |
| Action buttons (**Open**, **Later**) | yes | ignored |
| Vibration pattern | yes, longer when critical | — |
| `renotify` over an existing tag | critical only | — |
| `requireInteraction` | — | critical only |
| App badge count | launcher icon | dock icon |

**Later** dismisses the notification and nothing else — the point is to clear
your lock screen *without* being pulled into the app. It resolves nothing, so the
notice comes back by the normal rules.

The badge count rides along with the push so `sw.js` can set it while the app is
closed; the page keeps it honest afterwards and clears it when the last notice is
read.

### Setting it up

1. **Cloud sync must be on.** The dispatcher reads your synced snapshot. On a
   local-only install your data never leaves the browser, so there is nothing to
   push from — the settings pane says so rather than offering a dead switch.
2. Run `supabase/schema.sql` again. The push tables are additive and idempotent.
3. `node scripts/generate-vapid.mjs`, and put the output in your environment.
4. Set `SUPABASE_SERVICE_ROLE_KEY` and a long random `CRON_SECRET`. See
   `.env.example` for all five.
5. **Rebuild.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined at build time, so
   setting it on a running server has no effect.
6. Point a scheduler at `/api/push/dispatch` with
   `Authorization: Bearer $CRON_SECRET`. Any of:
   - **Vercel Cron** — add `vercel.json` as below. Vercel sends the
     `CRON_SECRET` bearer itself. Note the Hobby plan only permits one run a
     day, which is why this file isn't committed: on Hobby a sub-daily schedule
     fails the deploy.

     ```json
     { "crons": [{ "path": "/api/push/dispatch", "schedule": "*/15 * * * *" }] }
     ```

   - **GitHub Actions** — a `schedule:` workflow with one `curl` step, using a
     repository secret for the bearer.
   - **Supabase** — `pg_cron` + `pg_net` calling the URL on a schedule.
7. In the app: bell → gear → **Enable system notifications**, then **Even when
   the app is closed**.

Call it often — every 15 minutes is reasonable. Frequency is not how often you
get notified; the engine's own gates decide that. A rare cron just means an
hour-gated rule fires up to an hour late.

### Operational notes

- A send failing with **404 or 410** means the push service has retired that
  endpoint, and the row is deleted. Every other failure is treated as transient
  and the device kept — otherwise one bad afternoon would unsubscribe everybody.
- The log only advances if at least one device accepted. Recording a send that
  failed everywhere would burn the day's cap on a notification nobody saw.
- Regenerating the VAPID keys silences every existing subscription. Browsers
  reject a push signed by a key they did not subscribe with.
- `subscribe` and `unsubscribe` take the user id from the **verified bearer
  token**, never from the request body, and the delete is scoped to that user as
  well as the endpoint.
- The server is a third sender alongside your Mac and your phone, and keeps its
  own count in `chronicle_push_log` — `notifyLog` in the browser is per-device and
  never synced, so sharing one would let one device silence another.

### iOS

Web push needs the app **installed** to the home screen (16.4+); a Safari tab
will never deliver. On macOS, Safari needs the site added to the Dock; Chrome and
Edge work once installed.

## Notes and caveats

- The engine imports nothing from `react` or `next`, and touches no browser
  global. It runs under plain `node`, which is how it is tested.
- `iOS` supports web push only for **installed** PWAs (16.4+), and only after
  the user adds the app to the home screen. Safari in a tab will never deliver.
- Read/dismiss state is keyed by notice id, and ids are stable by construction —
  but a rule that changes its id scheme will orphan its old read-state, which
  reads as "unread again", not as a crash. Treat an id format as an API.
- Nothing here writes to your data. A notification can suggest logging a
  revision; only you can log it.
