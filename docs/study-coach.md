# Study Coach

The coach (`/coach`) reads the study record by fixed rules: the same records
always give the same briefing and the same suggestions. No AI model, nothing
paid, nothing sent anywhere. Code: `src/lib/coach.ts` (briefing, suggestions,
analysis), `src/lib/mentor.ts` (the plan, reports and "Talk to mentor", as
before), and `src/components/coach/`.

## Views

- **Briefing:** today's priorities (the top suggestions, then revision due and
  today's hours), preparation (this week's hours against the daily target,
  syllabus started and mastered, revision due, the latest mock), habits due
  today, goals by urgency, last night's sleep and this week's plan.
- **Suggestions:** each says what to do, why, the evidence (the figures, the
  dates they cover and a link to the records), and an action.
- **Analysis:** study time, subjects, revision, mocks, habits, the plan and
  sleep, each finding with its evidence; then the risk radar and weak subjects.
- **Today's plan, Reports, Talk to mentor:** as before.
- **History:** past briefings and every decision.

## The suggestions

| Rule (id) | When | Can apply |
| --- | --- | --- |
| Overdue revision (`revision:overdue`) | 3 or more topics past their revision day | Move them to 4 a day from today; intervals and history unchanged |
| Neglected subject (`neglected:<subject>`) | A subject with open topics and no hours in 14 days, by weightage | Add "Subject: first untouched topic" to this week's plan, high priority |
| Left open last week (`carry:<plan>`) | Last week's plan has activities not started or in progress | Carry them into this week's plan (last week keeps them, marked as carried) |
| Behind this week's pace (`pace:<week>`) | From the third day, under 75% of the target pace and 2 h or more behind | |
| Days not logged (`journal:gap`) | Two days or more since the last journal entry | |
| Habit slipped (`habit:<habit>`) | Kept on under half its due days in two weeks | |
| Goal behind or at risk (`goal:<goal>`) | An active goal's pace says so (diary-counting goals are skipped) | |
| Short sleep (`sleep:<week>`) | Under 6.5 h a night over 3 or more nights this week | |
| Mock gap (`mocks:gap`, `mocks:none`) | 21 days since the last mock, or none with the exam under 8 months away | |

Suggestions are ranked by how much they matter, and the briefing takes the top
three.

## Changes only on confirmation

A suggestion that could change something carries its changes, said in words.
**Apply…** shows them and asks; only **Apply changes** goes through the same
store actions the Roadmap and Revision pages use (`savePlanItem`,
`carryForward`, `upsertRevision`). Nothing is changed by building the
suggestions, and a change that no longer fits (the topic was revised since)
is skipped.

## Decisions and repeats

You can apply a suggestion, say you'll do it, mark it done, or dismiss it.
Each is kept in `coach.decisions` (synced, at most 300) with the suggestion's
`fingerprint`: the evidence, condensed. A suggestion you applied, finished or
dismissed stays away while its fingerprint is the same; if the evidence
changes, it comes back marked "New evidence since you…". One you said you'll
do stays, marked. Each day's priorities are kept in `coach.briefings` (at most
60, one per day).

## Privacy

`CoachInput` names exactly the records the coach reads; the Personal Diary is
not one of them, and the page strips it before anything is built. The reminder
dispatcher never receives the coach's history. A device on an earlier version
can't erase it: the database keeps `coach` when a save leaves it out.
