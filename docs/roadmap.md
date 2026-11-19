# Roadmap

The Roadmap (`/roadmap`) is where each person plans their own preparation:
year by year, month by month and week by week. It replaces the fixed CSE 2027
plan the app used to show.

Three rules run through it:

1. **Nothing is planned for you.** A new account opens an empty Roadmap.
   Every plan in it is one the person made.
2. **Progress comes only from planned activities.** A plan's percentage is
   completed activities out of all its activities. Nothing is estimated, and
   no other module's numbers are mixed in.
3. **Goals and the journal are pointed at, never changed.** Linking a goal or
   a journal day stores a reference. The goal's progress and the journal entry
   stay exactly as they were.

## The record

Plans live in the account's snapshot, under `plans` (`RoadmapPlan` in
`src/lib/types.ts`). Activities and milestones live inside their plan.

```
RoadmapPlan
├─ level        year | month | week
├─ start, end   calendar dates; the source of truth for the period
├─ year         year plans only
├─ title        optional; without one the period is the name ("January 2027")
├─ parentId     the plan it sits under (a month in a year; a week in a month or a year)
├─ focus, objectives[], outcomes, notes
├─ goalIds[]    goals it works towards (references)
├─ items[]      PlanItem: activities and milestones, in the order you set
├─ review       wentWell, improve, nextPriorities, reviewedAt
├─ archivedAt   set when archived; the plan stays readable
└─ createdAt, updatedAt

PlanItem
├─ kind         activity | milestone
├─ title, description, notes
├─ status       notStarted | inProgress | completed | deferred
├─ priority     High | Medium | Low (activities; absent reads as Medium)
├─ targetDate   an activity's target, or the day a milestone is due
├─ subjectId, category
├─ goalId, goalMilestoneId   a goal it serves, and one of its milestones (references)
├─ journalDates[]            journal days deliberately linked to it
├─ completedAt
└─ carriedFrom, carriedTo    { planId, itemId } when carried forward
```

The rules are pure functions in `src/lib/roadmap.ts`, tested in
`tests/roadmap.test.ts`. The screens are in `src/components/roadmap/`.

## Levels and periods

- **Each level works on its own or nested.** A month can sit inside a year or
  stand alone. A week can sit inside a month, directly inside a year, or stand
  alone. A plan's parent is chosen in the form ("Part of"), suggested from the
  dates, and can be changed or removed later.
- **One plan per period.** A year is keyed by its year, a month by its month,
  a week by its first day. The form says when a period already has a plan, and
  the store refuses a second one as a backstop.
- **A week belongs to the month holding most of its days.** A week from
  29 December to 4 January is shown in both months' calendars, but only one
  month lists it as its own week to plan, so it is never planned twice.
  Weekly plans that overlap (from a changed week start) are allowed, with a
  note.
- **The week start is a setting** (Weekly tab → "Weeks start on", saved as
  `profile.weekStart`, Monday by default). It applies to the Roadmap only.
  Goals and Reviews keep their Monday weeks.
- **A year can run on other dates** ("My year doesn't run January to
  December"), up to two years long.

Dates are calendar dates (`yyyy-mm-dd`) read in the device's own calendar, the
same as every other date in the app. Day arithmetic steps whole days, so a
clock change never adds or loses one, and every time zone gets the same weeks
and months. Leap years, month ends and weeks across a year end are covered by
the tests.

## Statuses and progress

Activities are **Not started**, **In progress**, **Completed** or
**Deferred**. Only you change a status: no link, sync or review ever marks
anything done.

- **A plan's own progress** counts its own activities, including any carried
  forward to a later plan. They were planned for this period and not done in it.
- **A plan with plans under it** also shows the total for everything inside
  it. Each piece of work is counted once: an activity carried from one week to
  the next inside the same month counts where it ended up.
- **Overdue** means open (not completed or deferred) and past its target date,
  or past the plan's last day when it has no date.
- **Milestones** are counted separately ("2 of 5 milestones reached"), never in
  the activity percentage.
- Labels keep the two kinds of progress apart: plans say **Planned work done**;
  a linked goal shows **Goal achievement (from Goals)** next to how much was
  **Planned for it here**.

## Working with plans

- **Create.** Only the period is needed. A new year can create its twelve
  months, and a new month its weeks, if you tick the box. Plans already made
  for those dates that stand alone can be brought in.
- **Duplicate** copies a plan's own content to another period with new ids:
  title, focus, objectives, outcomes, notes, linked goals, and its activities
  and milestones as not started, with dates moved along. Reviews, journal links
  and the plans under it are not copied.
- **Delete** asks what happens to the plans under it. **Keep them** moves them
  up a level (a month's weeks go to its year) or lets them stand alone.
  **Delete them too** removes them as well. Goals and journal days are never
  touched either way.
- **Archive** applies to a top-level plan, and everything under it is archived
  with it. Archived plans leave the current overview and lists ("Show
  archived" brings them back into view) and can be searched. Their activities
  open to be read but not changed, until the plan is restored.
- **Carry forward** copies unfinished activities from a week or a month into
  the next week's or month's plan (created blank if needed). Nothing is
  carried unless you choose to. The copy is a new activity marked "From
  …"; the original stays where it was, marked deferred and "Carried to …", so
  the record of what was planned when is never rewritten. "Bring it back here"
  undoes it while the copy is still untouched.
- **Reorder** activities and milestones with the arrows.
- **Find** searches titles, focus, objectives, notes and reviews, with filters
  for level, year, month, week, status (including overdue), priority, goal,
  subject and category.
- **Review.** Each plan has its own weekly, monthly or yearly review: what was
  completed, still open and carried forward (read from the activities), and
  three questions to answer. It's stored on the plan.

## Links to the rest of the app

- **Goals.** A plan can list goals it works towards, and an activity can serve
  one goal and one of its milestones. These are references only. The goal's
  detail shows a read-only "In your roadmap" section. Completing a planned
  activity never ticks off a goal milestone; the activity says when one is
  still open in Goals. Deleting a goal removes the references to it and nothing
  else.
- **Journal.** A journal day is linked to an activity on purpose, from the
  activity. Linking doesn't mark the activity done, and unlinking deletes
  nothing. The journal day shows "Planned work done this day" for the
  activities that link to it. Deleting a journal day removes its links; moving
  an entry to another date moves them. A week's or month's page shows
  **Planned and recorded**: the planned activities by subject next to the
  hours the journal recorded on those dates, side by side and never combined.
- **Reviews.** Performance Review shows the plan beside a weekly, monthly or
  yearly review when a plan covers that period, and links to it. Its figures
  count the period's planned activities: completed, deferred or carried, and
  still open.
- **Habits.** A habit connected to the Roadmap counts activities on the day
  they are marked completed; planned or open activities never count.
- **Study Coach.** It can suggest carrying last week's open activities into
  this week, or adding a neglected subject to this week's plan, and does
  either only after you confirm.
- **Dashboard.** "This week's plan" appears when you have plans that aren't
  archived, and shows nothing otherwise.
- **Subjects.** Deleting a subject keeps the activities that used it; they
  lose the subject label.

## Sync, privacy and the free plan

- **Private by the same rule as everything else.** Plans are part of the
  account's own `chronicle_state` row, so the existing Row Level Security keeps
  them to their owner. No table or policy was added.
- **Merging.** Plans and their items are matched by `id` and merged field by
  field (see [accounts](./accounts.md)). Linked goals and journal days merge as
  sets, so links added on two devices are both kept. `updatedAt` takes the
  later time instead of being reported as a clash. If two devices each create
  a plan for the same period while offline, both are kept and the overview
  says so; nothing is merged or deleted without you.
- **Consistent everywhere.** `normalizePlans` makes plans from the cloud, an
  older version or a backup file consistent, the same way on every device:
  text is trimmed but never cut short, dates match the level, clashing ids are
  renamed deterministically, and a parent link that can't hold is removed.
- **Size.** A full week (eight activities with every field filled, and a
  review) is about 3 KB. A heavy year of 65 plans and 464 items is about
  170 KB of text.
- **Devices still on the previous version.** A version from before the
  Roadmap doesn't know the `plans` key, so the snapshot it saves leaves it
  out. The migration `supabase/migrations/20261125120000_roadmap_plans.sql`
  makes `save_chronicle_state` keep the stored plans when a save has no
  `plans` key at all. A save that includes it, even as an empty list, is
  taken as written. Without the migration, plans removed that way come back
  the next time a device on this version syncs, because applying the cloud's
  copy never removes a key it leaves out. Tested in
  `supabase/tests/rls_isolation.sql`.
- **The push dispatcher doesn't read plans.** No notification rule uses them,
  so the same migration leaves `plans` out of the dispatcher's reader and the
  15-minute schedule doesn't download them.

## The retired fixed plan

The old Roadmap was a CSE 2027 plan written into the code (`lib/plan.ts`)
and switched on with `profile.useRoadmap`. It was never saved per account, so
retiring it deleted no one's data. `normalizeProfile` removes the old switch
from any profile it sees. That step is idempotent and leaves everything else
untouched: journal, goals, revision, Life Dashboard, reviews and settings stay
as they were.
