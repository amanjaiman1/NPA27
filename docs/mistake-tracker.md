# Mistake Tracker — Module Design

> Every mistake becomes a **learning asset**. Capture the question, your answer,
> the correct answer and why — then let spaced repetition drill it until it's
> mastered. The system automatically surfaces the mistakes you keep repeating.

## 1. Database schema

`Mistake` (in `src/lib/types.ts`):

```
Mistake
├─ id, date (when the mistake was made), subjectId, topic
├─ category   one of the six UPSC error categories ↓
│  ── the learning asset ──
├─ question, userAnswer, correctAnswer, explanation, source
│  ── spaced-repetition review workflow ──
├─ status        Open | Reviewing | Mastered
├─ reviewCount   clean recalls so far
├─ lastReviewed, nextReview   ISODate
└─ intervalDays  current SR interval
```

**Error categories** (`MistakeCategory`): `Conceptual`, `Factual`, `Guessing`,
`Revision Failure`, `Time Pressure`, `Careless`.

A persist **migration (v4)** upgrades older mistakes: maps legacy categories
(`Silly`/`Misreading` → Careless, `Time Management` → Time Pressure), moves the
old `correction`/`description` into `explanation`, converts `Resolved` →
`Mastered`, and backfills the review fields.

### Relational mapping (future backend)

```
mistakes(id, user_id, date, subject_id, topic, category, question, user_answer,
         correct_answer, explanation, source, status, review_count,
         last_reviewed, next_review, interval_days)
```

## 2. Review workflow (spaced repetition)

Mistakes are reviewed like flashcards. `reviewMistake(id, gotItRight)`:

- **Recalled correctly** → `reviewCount++`, interval advances along
  `[1, 3, 7, 16, 35]` days, `nextReview = today + interval`. After **3 clean
  recalls** the mistake graduates to **Mastered**.
- **Missed again** → `reviewCount` resets to 0, interval back to 1 day,
  status `Reviewing`.

The **Review queue** panel presents one due card at a time: shows the question,
*Reveal answer* flips to your answer (struck through) vs the correct answer plus
explanation, then *Recalled it* / *Missed again* drive the algorithm. As each is
graded it leaves the queue and the next due card appears.

## 3. Revision reminders

`dueForReview` returns every non-mastered mistake whose `nextReview ≤ today`,
sorted soonest-first; `upcomingCount` counts those due in the next 7 days. The
**Due now** stat tile and the review queue surface these as reminders, so no
mistake is forgotten until it's genuinely mastered.

## 4. Automatic recurring-mistake discovery

`recurring()` groups mistakes by `subjectId + normalised topic` and flags any
cluster of **two or more** as a recurring pattern — with the repeat count, how
many are still open, the dominant error category, and the latest occurrence.
Patterns are ranked by frequency and shown in the **Recurring mistakes** panel;
clicking one filters the log to just that topic. (The seed deliberately plants
clusters — Anti-Defection, Inflation indices, Protected areas, Congress sessions
— so the discovery is visible immediately.)

## 5. Analytics

Pure functions in `src/lib/mistakes.ts`:

- `masteryStats` — total / open / reviewing / mastered / mastered %.
- `categoryCounts` — distribution across the six error categories ("why you lose
  marks").
- `subjectCounts` — where mistakes cluster.
- `categorySubjectMatrix` — subject × category grid for the matrix heatmap.

## 6. Heatmaps

Two views:

1. **Calendar heatmap** — mistakes logged per day over ~17 weeks (reuses the
   GitHub-style `Heatmap` with a count-based scale and custom tooltips), so you
   can see whether error volume is trending down.
2. **Subject × error-type matrix** (`MatrixHeatmap`) — a grayscale grid where the
   darkest cells expose your worst subject/category combinations. Clicking a cell
   filters the mistake log to that intersection.

## 7. Dashboard layout

```
┌──────────────────────────────────────────────────────────────────┐
│  MISTAKE TRACKER — "Every mistake, a learning asset."  [+ Log]     │
├──────────────────────────────────────────────────────────────────┤
│ Total │ Active │ Due now │ Mastered │ Mastered % │ Recurring        │  ← tiles
├───────────────────────────────┬──────────────────────────────────┤
│  REVIEW QUEUE (flashcard)     │  RECURRING MISTAKES (auto)        │
│  Q → reveal → Recalled/Missed │  3× Anti-Defection · Polity …     │
├───────────────────────────────┼──────────────────────────────────┤
│  Error categories (bars)      │  By subject (bars)                │
├───────────────────────────────┼──────────────────────────────────┤
│  Mistake heatmap (calendar)   │  Subject × error-type matrix      │
├───────────────────────────────┴──────────────────────────────────┤
│  MISTAKE LOG — filters (type / status) + search; expandable cards  │
│  showing question · your answer · correct answer · explanation     │
└──────────────────────────────────────────────────────────────────┘
```
