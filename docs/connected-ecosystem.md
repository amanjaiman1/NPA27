# How the modules connect

Each module keeps one kind of record and is the only place that record is
written. The others read it. Nothing is copied between modules, so an edit or
a deletion anywhere is reflected everywhere the next time the screen draws.

## Who owns what

| Module | Source of truth for | Reads | Never does |
| --- | --- | --- | --- |
| Daily Journal (`/journal`) | Study hours by subject, topics finished, revision sessions, mocks and books of the day, the day's own notes | Syllabus, revision queue, roadmap (links) | Count habits itself |
| Life Dashboard (`/wellbeing`) | Sleep, wake-up, bedtime, exercise, walking, running, meditation, water, screen time, weight | | |
| Revision (`/revision`) | The spaced-repetition queue and each item's revision days (`passes`) | Syllabus | |
| Roadmap (`/roadmap`) | Your yearly, monthly and weekly plans, their activities and milestones | Goals and journal days (references only) | Change a goal or a journal day |
| Goals (`/goals`) | What you are chasing, targets, deadlines, goal milestones | Journal, mocks, revision, books, current affairs, mistakes, life, diary entry count (for a goal you set to count them) | |
| My Habits (`/habits`) | Each habit's settings, your check-ins, and your corrections for a day | Journal, Life Dashboard, Revision, Roadmap, through the Habit Engine | Copy a record, or read free text |
| Performance Review (`/reviews`) | What you wrote about a period, and the figures it was completed with | Journal, Roadmap, goals, revision, habits, life, mocks | Read the diary |
| Personal Diary (`/diary`) | Your private entries | | Feed anything else |
| Study Coach (`/coach`) | What you decided about its suggestions, and its daily briefings | Journal, syllabus, revision, mocks, Roadmap, goals, habits, life | Read the diary; change a plan, goal or the revision queue without your confirmation |
| Command Center (`/dashboard`) | Nothing of its own | Everything above except the diary | |

## The shared activity layer

`activityEvents` in `src/lib/habit-engine.ts` reads the journal, the Life
Dashboard, the revision queue and the Roadmap and returns one list of activity
events. Each has a stable id built from the record it comes from:

| Record | Event id | Kind |
| --- | --- | --- |
| Hours on a subject in a journal day | `journal:<date>:study:<subjectId>` | `study` |
| A topic finished in a journal day | `journal:<date>:topic:<topicId>` | `topic` |
| A revision of a queue item on a day (Revision page or journal) | `revision:<itemId>:<date>` | `revisionPass` |
| A journal revision session not tied to a queue item | `journal:<date>:revision:<n>` | `revisionPass` |
| Minutes of a journal revision session | `journal:<date>:revision-minutes:<n>` | `revisionMinutes` |
| A night's sleep, bedtime, wake-up | `life:<date>:sleep`, `:bedtime`, `:wake` | `sleep`, `bedtime`, `wake` |
| Exercise, walk, run, meditation, water, screen time | `life:<date>:<field>` | one kind each |
| A Roadmap activity marked completed | `roadmap:<planId>:<itemId>` | `roadmapActivity` |

Events are de-duplicated by id, so a revision logged in the journal and ticked
on the Revision page is one pass. The layer is recomputed from the records each
time; it is never stored. The Habit Engine, the Performance Review and the
Study Coach all read it, so the three always agree.

## Dependency map

```
 Daily Journal ─┐
 Life Dashboard ┤
 Revision ──────┼─► activity layer ─► Habit Engine ─► Habits, dashboard card,
 Roadmap ───────┘   (habit-engine.ts)               reminders, Review, Coach
                                                   │
 Goals ──────────────────────────────────────────► Review, Coach, dashboard
 Mocks, syllabus ────────────────────────────────► Review, Coach, dashboard

 Personal Diary ─► nothing (one count, only for a goal you set to count it)
```

## Privacy

Every record lives in its owner's row of `chronicle_state`, which row level
security limits to that owner; the browser keeps the signed-in account's copy
under keys scoped to that account (`src/lib/account/scope.ts`). There is no
cross-account processing anywhere. The server-side reminder dispatcher reads a
trimmed snapshot that has no diary text, no review writing and no coach history
(`supabase/migrations/20261202120000_diary_coach_privacy.sql`).

See also [the Habit Engine](habit-engine.md), [Performance Review](performance-review.md),
[the Personal Diary](personal-diary.md) and [the Study Coach](study-coach.md).
