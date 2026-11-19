# The Habit Engine

A habit can keep itself from records you already keep. Connect it to the Daily
Journal, the Life Dashboard, Revision or the Roadmap, and it fills in as you
record there; the ones you check off by hand get a button on My Habits (`/habits`)
and the dashboard. Code: `src/lib/habit-engine.ts` (pure functions, shared by
the browser and the server's reminders).

## A habit's settings

| Setting | Values | Notes |
| --- | --- | --- |
| Tracking | Automatic, Hybrid, Manual | Hybrid reads its source and also takes a check-in for a day the source doesn't cover (`allowManual`). |
| Source | Daily Journal, Life Dashboard, Revision, Roadmap, or your check-in | `source`; absent means a check-in. |
| What counts | See the table below | `metric`; sets the unit. |
| Target | A number in the metric's unit, or a time | `target`; times are minutes after midnight (bedtimes are minutes after noon, so 23:30 sorts before 00:30). |
| Subject | For "Hours on one subject"; optional for topics, revision and roadmap | `subjectId`. |
| When it's due | Every day, chosen days, so many days a week, a weekly total | `schedule`. A weekly total needs the week's sum to reach the target. |
| Count records from | A day, today or earlier | `countFrom`, default the day it was created. |
| Reminder | A time | `remindAt`: the "habits still open" note uses it instead of the general reminder hour. |
| Paused | On or off | `pauses`, one stretch at a time. |
| Name, description, category, icon | | Description is never sent to the reminder dispatcher. |

| Source | What counts (metric) | Unit, and how a day is met |
| --- | --- | --- |
| Daily Journal | Hours studied, Hours on one subject, Topics finished | hours or a count, at least the target |
| Life Dashboard | Hours slept, In bed by, Up by, Minutes of exercise, Kilometres walked, Kilometres run, Minutes of meditation, Litres of water, Screen time under a limit | at least the target; by the time; at most the limit |
| Revision | Topics revised, Minutes of revision | a count or minutes, at least the target |
| Roadmap | Planned activities completed | a count, at least the target |
| Your check-in | Done or not | ticked |

Only structured records count. Free text (journal notes, wins, a diary entry, a
goal note) never does, a Roadmap activity counts only once it is marked
completed (on the day it was), and goals never count towards a habit.

## How a day is worked out

For each day, `evaluateDay`:

1. Before the habit's first day (`habitStart`), after today, or while paused,
   the day is not counted at all.
2. The day's events for the habit's metric are added up (two journal blocks of
   3 hours are 6 hours, one day). Records count from `countFrom`.
3. Your correction for the day, if any, comes first: **done**, **missed**, or a
   **value** that replaces the measured amount. It is stored on the habit
   (`overrides[date]`), so a record that arrives later can't undo it.
4. Otherwise a manual habit reads your check-in; an automatic one is met when
   the amount reaches the target; a hybrid one is also met by a check-in.
5. The result is a status (`done`, `partial`, `missed`, `open` for today,
   `rest` for a day not due, `paused`, `before`, `future`), the amount, the
   target, a 0 to 1 progress and the events behind it, each with a link.

So the example in the brief holds: "Daily study, 6 hours, from the Daily
Journal" with 3 hours logged today shows "3 h of 6 h", 50%.

Because the day is computed from the records each time, editing a journal day
changes the habit with it, deleting it takes its contribution away, and
moving `countFrom` earlier fills in history from records you already kept,
with nothing to rebuild. A manual habit connected to a source later becomes a
hybrid, so its check-ins so far keep counting.

## Streaks and consistency

- A streak counts consecutive due days kept. A rest day (not in the schedule)
  or a paused day neither breaks it nor adds to it, and today doesn't break it
  while it is still open. Weekly habits count weeks.
- Consistency is kept days over due days for a window. Today counts once it is
  kept. My Habits shows 7, 30 and 90 days, this week and this month; the
  detail view shows the last eight weeks and a month calendar.

## Where it shows

- **My Habits** (`/habits`, under Command in the sidebar): today's habits with progress and where it came from, every
  habit with streaks and its last five weeks, a consistency table, and a habit
  in full (calendar, records behind any day, corrections, pause, archive,
  delete).
- **Dashboard:** the "My Habits" card replaces the Milestones card: today's due habits,
  done and pending counts, the share done, streaks, the actual amounts and
  their source, and "View all habits". Only habits you check off have a button.
- **After saving** a journal day, a night on the Life Dashboard or a revision,
  a note says which habits that record moved.
- **Reminders:** "habits still open" asks the engine, so a habit already met by
  your records never nags; weekly and Roadmap habits aren't chased daily.
- **Performance Review and Study Coach** read habit consistency for a period.

## Data and compatibility

All new fields are optional on the existing `Habit`. A habit saved before the
engine reads as a daily habit you check off; a weekly one keeps its count. The
older `cadence` and `targetPerWeek` are written in step with the schedule, so
a device on an earlier version still reads it sensibly. Revision items gain
`passes` (the days revised, kept unique, at most 200); an item revised before
that counts its `lastRevised` as one pass. No table, no stored progress and no
background job were added: everything is read from the snapshot each account
already syncs.
