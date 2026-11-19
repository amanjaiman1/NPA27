# Performance Review

The Reviews page (`/reviews`) is now Performance Review: a look back at a
week, a month, a year or any dates you choose, with the figures gathered for
you and six questions for you to answer. Code: `src/lib/performance.ts`, the
page and `src/components/reviews/`.

## The figures

`measurePeriod` reads the period from:

| Source | Figures |
| --- | --- |
| Daily Journal | Study hours, active and logged days, sessions, hours by subject, topics finished, the best day |
| Roadmap | Activities planned for the period (a week plan's activities when its week falls in the period, or any activity dated inside it), completed, deferred or carried forward, still open, and the open ones by name |
| Goals | Goals completed and goal milestones reached in the period, active goals |
| Revision | Passes in the period (the same de-duplicated events as the habits), due and overdue now |
| Habits | Due days kept, per habit, through the Habit Engine |
| Life Dashboard | Nights recorded and average sleep, exercise days and minutes |
| Mocks | Taken, average score |

Each is compared with the period before (the week, month or year before, or as
many days before for custom dates). Days still to come are never counted, so a
running week is measured so far. Weeks run Monday to Sunday, as goals and the
"review not written" reminder count them.

## The summary

Every line says what kind of statement it is:

- **Recorded:** what you logged ("31.5 h of study on 6 of 7 days").
- **Planned:** what the Roadmap said ("10 activities: 6 completed, 2 deferred, 2 still open").
- **Worked out:** derived from records ("75% of your 42 h target", "hours up 12%").
- **No record:** what has nothing behind it ("2 days with no journal entry").

Each line links to the records.

## Writing it

Six questions, all optional: what went well, what you struggled with, which
subject needs attention, what you left unfinished, what you will change, and
the priorities for next time. A suggestion worked out from the figures can be
inserted into an answer with one tap; it is never written in for you. An
overall 1 to 5 rating is optional.

- **Save draft:** kept with live figures that follow your records.
- **Complete review:** the figures are frozen into the review (`snapshot`),
  with the period before, so a later edit to the journal or the plan never
  rewrites a finished review. Completing a period that hasn't ended asks first.
- **Refresh figures:** on a completed review, measures the period again from
  the records as they are now, after asking. What you wrote stays.

## History

Every review, newest first, with search (what you wrote and the period), kind
and status filters, a side-by-side comparison of any two (each with its own
kept figures), Markdown export of one or all shown (each asks first, naming
the file), and trends for the last
eight weeks, six months or four years.

## Privacy

`PerformanceData` has no place for the Personal Diary, so no diary entry can
reach a review. The reminder dispatcher never receives your answers or the
kept figures.

## Compatibility

The type stays `Review` and the store key `reviews`; every review written
before keeps its id. New optional fields: `status` (absent reads as
completed), `answers`, `snapshot`, `createdAt`, `updatedAt`, `completedAt`, and
the `Custom` type. An older review opens with its wins, struggles, lessons and
next focus as answers, and saving writes those lists from the answers too, so
a device on an earlier version still shows it. The older reviews' period
matching is unchanged, so the reminder still sees them.
