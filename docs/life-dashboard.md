# Life Dashboard

The Life Dashboard (`/wellbeing`) tracks the habits around study: sleep,
movement, water, meditation, screen time, weight and deep work. It reports on
them over any period, next to what the journal says about study.

Three rules run through every number on the page:

1. **Only what was recorded counts.** An empty box is saved as "not
   recorded". A day without a water reading is left out of the water average;
   it is never a day of 0 litres. A typed 0 is a real 0.
2. **Every number says what it stands on**: how many days carry a reading,
   over what period, and how it is worked out.
3. **Patterns are described as things that go together, never as causes**, and
   only once there are enough days for them to mean anything.

## The record

One record per day (`LifeEntry` in `src/lib/types.ts`). Every reading is
optional.

```
LifeEntry (unique per date)
├─ sleepHours, sleepQuality (1–5), bedtime, wakeTime
├─ exerciseMinutes, exerciseType, walkKm, runKm
├─ waterLiters, meditationMin, screenTimeMin, weightKg
├─ deepWorkHours
├─ note        a line about the day
└─ fileIds     journal files linked to the day (references, never copies)
```

Study hours and mood are read from the Daily Journal, not stored twice.

## What you track

`profile.lifeFields` lists the measurements a person tracks, chosen in
**What you track** on the page or from the form. Until they choose,
`trackedFields` (in `src/lib/life.ts`) uses a short core list (sleep, exercise,
water, screen time) plus any other field they have recorded, so logging one
reading never hides the others. The form asks only for tracked fields and the reports
cover only those. Readings already saved for an untracked field are kept.

## Logging a day

`components/life/life-form.tsx`, backed by the pure functions in
`src/lib/life-entry.ts`:

- Boxes start empty unless that day already has a reading. Nothing is
  pre-filled with a typical value.
- Changing the date loads what is saved for that day. If there are unsaved
  changes, the form asks before discarding them. Future dates are refused.
- Sleep uses the same time buttons and rules as the sleep card (below):
  hours come from bedtime to wake-up, and the box beside them is only for time
  asleep when it differs.
- Each number is checked against a sensible range (sleep 0–24 h, screen time
  0–1440 min, weight 20–300 kg, …) and errors show next to the field.
- Sleep quality can be cleared back to "not rated".
- Journal files can be linked to the day. Links are saved immediately and
  never copy the file (see [attachments](./attachments.md)).
- Saving a day with nothing in it removes the day instead of storing an empty
  record.

The morning check-in records only what it asks: bedtime and wake-up, and the
hours between them. It never creates a journal entry or fills in other
readings.

### What older versions wrote

The old form and the old morning check-in filled every box with a default:
sleep quality 3, 2 L of water, 120 minutes of screen time and zero for every
activity. `normalizeSnapshot` (in `src/lib/account/normalize.ts`) treats that
exact combination as invented and turns those readings back into "not
recorded". A day where anything was changed keeps every value as entered. The
journal entries the check-in used to create (no study, all ratings 3, nothing
written) are removed, and their bed and wake times move to the Life Dashboard
day. Both clean-ups run in the v12 store migration and on every snapshot pulled
from the cloud, and both are idempotent.

## Sleep

Sleep has its own card at the top of the Life Dashboard
(`components/sleep/sleep-card.tsx`), and the rules live in `src/lib/sleep.ts`
(tested in `tests/sleep.test.ts`).

**What a night is.** A night is stored on the day you woke up, exactly as
before: `bedtime`, `wakeTime` (wall-clock "HH:MM"), `sleepHours` and
`sleepQuality` on that day's `LifeEntry`. Nothing about older records
changed. What's new is that everything else is worked out reliably from them:

- The day the bedtime falls on is never asked for. For any night shorter than
  a day it has one answer: a bedtime later on the clock than the wake-up was
  the evening before (23:30 → 07:00 is 7h 30m); an earlier one was the same
  day (00:30 → 07:00, or a 14:00 nap). The old morning prompt asked "last
  night or today?", and picking the wrong one could store a 30-hour night.
- Durations use real local dates, so a night across a clock change counts the
  hours that actually passed.
- Times are wall-clock, not UTC moments: 23:00 is 23:00 on any device, in any
  time zone. The app already uses the device's local clock for every date.
- Hours come from the two times unless **time asleep** is entered under More
  details (lay awake, woke in the night). A night with only one time has no
  hours; nothing is invented.

**Recording.** Two large time buttons, bedtime and wake-up, with the duration
shown as soon as both are set. Tapping one opens a picker: an hour, then a
minute, and it closes (AM or PM starts where that time usually is; ±5 nudges
the minute; typing "2330" or "11:30 pm" works too). Chips set a time in one
tap: **Now**, and **Usual** once three nights are recorded. Times follow the
12- or 24-hour preference (Appearance → Clock, or the card's settings),
defaulting to the device's convention. The picker is custom because native
time inputs can't follow that preference; it is keyboard-operable (one tab
stop per grid, arrow keys within it) and every button has a spoken label.

**One tap at the moment.** From 6 PM, *Going to bed now* records tonight's
bedtime on tomorrow's date. In the morning (3 AM to 3 PM) with a bedtime
waiting, *Woke up now* finishes the night. Both save immediately.

**Checks.** The same time twice is refused. A night over 18 hours is refused
with a hint that AM and PM may be swapped. Under 2 hours or over 13 hours
saves, with a note to check the times.

**Goal, kept apart.** A sleep goal (`profile.sleepTarget`: bedtime and
wake-up) is set from the card's settings. It's compared with nights ("45m
short of your 7h 30m aim", "bed 20 min later than 11:00 PM") and replaces the
built-in 7.5-hour line on the sleep page, but it's never stored as, or mistaken
for, a night you slept.

**History.** `/wellbeing/sleep` lists every night with its times, duration and
quality, flags a night still waiting for its wake-up, time asleep entered by
hand, and any stored night over 18 hours (shown, never averaged, never
rewritten). Each can be edited or deleted. Deleting removes only that night's
four sleep fields; the day's other readings stay. Averages for the last 7 and
30 nights, usual bedtime and wake-up (a circular mean, so 23:30 and 00:30
average to midnight) all say how many nights they stand on.

**The morning check-in** (`components/sleep/sleep-gate.tsx`) uses the same
editor, can be skipped for the day, and starts two hours before your usual
wake-up (between 03:00 and 07:00) instead of always at 07:00. With a bedtime
waiting from the night before, it's one tap. Saving anywhere, or skipping,
counts for every device.

## Reports

`buildLifeReport` in `src/lib/life.ts`, shown by
`components/life/life-report.tsx`.

- **Period**: 7, 30 or 90 days, this month, last month, this year, or custom
  dates. A period can't run past today. Each one is compared with the same
  number of days immediately before it.
- **Headline numbers**, grouped Study, Sleep, Movement, Wellbeing and Mind. Each
  card shows the value (or "Not recorded"), "recorded on X of Y days", and the
  change from the previous period, coloured by whether higher or lower is
  better for that measure. "How numbers are worked out" shows a plain sentence
  for each.
- **Chart** by day, week or month (by the length of the period) for study,
  sleep, active days, screen time or mood. A period with nothing recorded is a
  dashed gap, never a zero bar.
- **Observations**, in hours and days, never percentages: study against the
  previous period, consistency and longest run, sleep and study, exercise and
  study, strongest weekday, and a bedtime that moves around. A comparison
  between two groups of days needs at least `MIN_GROUP` (4) days on each side.
- **Habits and study** (`factorLinks`): how each tracked habit moves with study
  hours on the same day, using only days that carry both. Shown only with at
  least `MIN_PAIRS` (10) shared days, labelled from "No clear link" to "Very
  strong link", with the sample size.
- **Day by day** table: every reading for each day, a dash for "not recorded",
  links to the journal day, and an edit button. It shows days with something
  logged by default, with a switch to show every day.

The correlation matrix and the three scatter reports were removed. They ranked
habits as "helps" or "hurts" from as few as six days (the scatter reports from
three), counted the invented default readings as real ones, and read as
findings when they weren't.

## Links to the rest of the app

- **Goals**: active goals in the Health category or measured by deep-work hours
  are listed on the page and link to the goal. The report counts goals
  completed in the period.
- **Journal**: today's study hours link to today's entry; the table links each
  day to its journal entry. A journal day links back with
  `/wellbeing?date=<day>`, which opens the form on that day.
- **Deep dives**: sleep, running, weight and screen time each have a page at
  `/wellbeing/<metric>`, shown for tracked fields. Their charts also show
  unrecorded periods as gaps.

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  LIFE DASHBOARD          [What you track]  [Log today / Edit today]│
├──────────────────────────────────────────────────────────────────┤
│  TODAY: one tile per tracked field, "Not logged" when empty;      │
│         journal hours today; files linked today                   │
├──────────────────────────────────────────────────────────────────┤
│  HEALTH AND DEEP-WORK GOALS                                       │
├──────────────────────────────────────────────────────────────────┤
│  REPORTS: period picker · coverage line                           │
│  headline cards by group · chart · observations · habits & study  │
│  day-by-day table                                                 │
├──────────────────────────────────────────────────────────────────┤
│  GO DEEPER: sleep · running · weight · screen time                │
└──────────────────────────────────────────────────────────────────┘
```
