# Daily Capture

**Daily Journal** in the sidebar opens the journal at `/journal` with the
Daily Capture form over it: a popup with four tabs for the day, saved together
with **Save All Changes** (or Ctrl/⌘ + S). A full save closes the form;
closing with unsaved edits asks first and keeps them as a draft. The journal's
"Capture today" button opens the form again.

| Tab | What it edits | Saved through |
|---|---|---|
| Day Update | the day's journal entry (study, topics, revision, mood, notes, files, more details) | `saveJournalEntry` |
| Life | the day's Life Dashboard readings (only the tracked fields) | `upsertLifeEntry` / `deleteLifeEntry` |
| Goals | the account's own goals: a new total, milestones, status, a note, and "Worked on this" (links the journal day) | `logGoalProgress`, `toggleGoalMilestone`, `setGoalStatus`, `addGoalNote`, `setGoalJournalDates` |
| Habit | manual check-ins; connected habits are shown as the Habit Engine reads them | `toggleHabit` |

The address keeps the day and tab: `/journal?date=2026-11-18&section=goals`.
`/journal?new=1` opens today's Day Update. Behind the form is the journal
itself (entries, topics, analysis; `components/journal/journal-list.tsx`);
`/journal?tab=topics|analysis` and `/journal/history` show it without the form. The standalone Goals, My Habits and Life Dashboard pages are
unchanged.

## Layout

The form opens on the day: a week strip (logged days have a green dot, days
with unsaved edits an amber one, and the calendar button jumps anywhere) and
four one-line tabs, each with its figure. Day Update leads with its two most
important parts, **Study** and **Topics completed**, as large cards. Study
shows the day's total against the daily target, the split by subject, and
quick inputs: tap a subject you often study to add it, nudge hours in
half-hour steps, or repeat your last day's subjects. Revision, how the day
felt, reflection, files and the more detailed lists follow, quieter.

## No new data

Daily Capture stores nothing of its own. The forms are the same components
the entry dialog and the Life Dashboard dialog use
(`components/journal/journal-editor.tsx`, `LifeFields` in
`components/life/life-form.tsx`), and saving goes through the store, so the
account-scoped persistence and the versioned `save_chronicle_state` sync are
untouched.

## Saving

`saveAll` in `components/capture/capture-workspace.tsx` applies only the tabs
with changes, in this order: journal entry, life entry (it mirrors bedtime and
wake-up onto the journal), goals, check-ins. Each section succeeds or fails on
its own; failed sections keep their edits and show why. It then waits for the
cloud (`flush`) and the header says whether the changes are synced, still on
their way, or kept on this device while offline.

- If the day's entry or readings changed on another device or tab after
  editing began, saving asks before replacing them.
- Retries can't double-apply anything: goal and habit drafts hold wanted states
  and are measured against the records at save time (`lib/daily-capture.ts`),
  goal readings are one per day, and a saved goal's draft (with its note) is
  cleared.
- Connected habits are never written to. The Habit Engine derives them from
  the saved journal, life and revision records, with one event per source
  record, so a journal entry can't complete a habit twice.

Goal readings, milestones and notes recorded for an earlier day carry that
day's date. A reading for an earlier day joins the history without moving the
goal's current figure, which is always its latest reading.

## Drafts

Unsaved edits are kept in this browser tab's sessionStorage, per account and
day (`upsc-capture-draft:<account id>:<date>`), so a reload, another page or
another day doesn't lose them. Switching days keeps each day's edits under its
own key, and the page lists other days still waiting. Closing or reloading the
tab with unsaved edits asks first.
