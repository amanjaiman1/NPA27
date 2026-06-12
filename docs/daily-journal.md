# Daily Journal — Module Design

> Every day of preparation becomes a separate, permanent historical record. A
> candidate should be able to open any date — years later — and *relive* it:
> what they studied, how they felt, what they won and lost, and the photos that
> framed the day.

## 1. Database schema

The journal is keyed by **one entry per calendar day** (`date` is unique). It is
defined in `src/lib/types.ts` and persisted via the Zustand store (localStorage
today; trivially swappable for a relational backend).

```
JournalEntry
├─ id                string            stable id ("j-YYYY-MM-DD")
├─ date              ISODate (unique)  the day this record belongs to
│
│  ── daily rhythm ──
├─ wakeTime          "HH:MM"?          when the day started
├─ sleepTime         "HH:MM"?          when they went to bed
│
│  ── study ──
├─ blocks            StudyBlock[]      { subjectId → Subject, hours, topics[] }
├─ totalHours        number            derived sum of block hours
├─ topicsCompleted   string[]
├─ booksStudied      BookRead[]        { bookId?, title, fromPage?, toPage? }
├─ revisionSessions  RevisionSession[] { subjectId?, topic, minutes? }
├─ mocksAttempted    MockRef[]         { mockId?, name, score?, max? }
├─ currentAffairs    CARef[]           { caId?, title, source? }
│
│  ── state of mind (1–5) ──
├─ mood              number
├─ energy            number
├─ motivation        number
├─ focus             number
│
│  ── narrative ──
├─ wins              string[]
├─ failures          string[]
├─ lessons           string[]
├─ highlights        string?           one-line headline of the day
├─ reflection        string?           free-form personal reflection
├─ tags              string[]
│
│  ── memory ──
└─ attachments       Attachment[]      { id, kind: image|file, name, dataUrl, caption?, size? }
```

**Relationships.** A `StudyBlock` references a `Subject`; `booksStudied`,
`mocksAttempted`, `currentAffairs`, and `revisionSessions` carry optional foreign
keys (`bookId`, `mockId`, `caId`, `subjectId`) so an entry can deep-link into the
Library, Mock Analytics, Current Affairs Vault, and Subject modules later.
Attachments store downscaled JPEG/`dataUrl`s (images are resized to ≤1280px,
quality ~0.72) to stay within localStorage limits.

**Migration.** The store is at persist `version: 2`; a `migrate()` backfills the
new fields (motivation, wins/failures/lessons, books, revisions, mocks, current
affairs, attachments) onto any v1 entries so older data renders cleanly.

### Relational mapping (future backend)

```
journal_entries(id, user_id, date, wake_time, sleep_time, total_hours,
                mood, energy, motivation, focus, highlights, reflection)
study_blocks(id, entry_id, subject_id, hours)
entry_topics(entry_id, topic)            entry_wins(entry_id, idx, text)
entry_books(entry_id, book_id, title, from_page, to_page)
entry_revisions(entry_id, subject_id, topic, minutes)
entry_mocks(entry_id, mock_id, name, score, max)
entry_current_affairs(entry_id, ca_id, title, source)
entry_failures / entry_lessons / entry_tags (entry_id, idx, text)
attachments(id, entry_id, kind, name, url, caption, size)
```

## 2. UI wireframe

**List / timeline** (`/journal`)

```
┌───────────────────────────────────────────────────────────────┐
│  DAILY STUDY JOURNAL                              [ + New entry]│
│  Every day, written down.                                       │
├───────────────────────────────────────────────────────────────┤
│  [🔍 Search reflections, topics, wins, books…]   [ Filters (2) ]│
│  ▸ Subject ▾   From ▾   To ▾   Sort ▾                            │
│  ( Has mock ) ( Has photos ) ( Wins logged )         Clear all  │
│  312 entries                                                    │
├───────────────────────────────────────────────────────────────┤
│  June 2026                              23 days · 198h          │
│  ┌────┐  6h 30m  · Polity · Economy · +2          Today    ✎ 🗑 ›│
│  │ 12 │  Finished Fundamental Rights revision                   │
│  │ THU│  Mood · In flow   🏆 2   ◎ mock   ▣ 1                    │
│  └────┘                                                         │
│  ┌────┐  8h  · PSIR · Ethics                       Yesterday   ›│
│  │ 11 │  …                                                      │
│  └────┘                                                         │
│  May 2026                               26 days · 232h          │
│  …                                                              │
└───────────────────────────────────────────────────────────────┘
```

**Day detail / "relive"** (`/journal/[date]`)

```
┌───────────────────────────────────────────────────────────────┐
│  ← Journal                                          [ ‹ ] [ › ] │
│  DAY 312 OF THE JOURNEY                                          │
│  Thursday, 12 June 2026                            [ Edit ] [🗑] │
├───────────────────────────────────────────────────────────────┤
│  ┌ Daily rhythm ┐  ┌ State of mind ───────────────────────────┐│
│  │ Wake   05:30 │  │ Mood ▰▰▰▰▱  Energy ▰▰▰▱▱                  ││
│  │ Sleep  23:20 │  │ Motivation ▰▰▰▰▱  Focus ▰▰▰▰▱             ││
│  │ Studied 6h30 │  └──────────────────────────────────────────┘│
│  └──────────────┘                                               │
│  ┌ Study breakdown ───────────────────────────────────────────┐│
│  │ Polity · Fundamental Rights      ▓▓▓▓▓▓░░  3h                ││
│  │ Economy · Inflation              ▓▓▓░░░░░  2h                ││
│  └─────────────────────────────────────────────────────────────┘│
│  [Topics] [Books p.10–48] [Revision] [Mocks 121/200] [CA · Hindu]│
│  ┌ Wins ┐  ┌ Failures ┐  ┌ Lessons ┐                            │
│  “One line that captures the day”  + reflection paragraph        │
│  ┌ Photos & attachments ─ gallery (click → lightbox) ──────────┐│
└───────────────────────────────────────────────────────────────┘
```

## 3. Daily entry flow

1. **Trigger** — "Log today" (top bar / dashboard), "New entry" (journal), or
   "Create this entry" on an empty day detail. ⌘K → Daily Journal also works.
2. **Compose** — a single sectioned modal: Daily rhythm → Study blocks →
   Topics/Books/Revision/Mocks/Current affairs → State of mind (mood, energy,
   motivation, focus) → Wins/Failures/Lessons → Highlight + Reflection → Tags →
   Photos. Lists use chip/row editors; images are auto-compressed on drop.
3. **Save** — `totalHours` is derived from blocks; the entry is **upserted by
   date** (editing today simply updates it). The timeline, heatmap, streak and
   dashboard update instantly.
4. **Relive** — clicking any row opens `/journal/[date]`, a full diary view with
   ‹ / › navigation to the adjacent day (you can browse straight through the
   year). Editing re-opens the same composer pre-filled.

## 4. Search & filtering

- **Search** runs across reflection, highlight, wins, failures, lessons, topics,
  tags, book titles, current-affairs titles, revision topics, and subject names.
- **Filters**: subject, date range (from/to — built for "revisit years later"),
  sort (newest/oldest), and quick toggles — *Has mock*, *Has photos*,
  *Wins logged* — which AND together. An active-filter count shows on the button.
- **Grouping**: results are grouped under sticky **Month YYYY** headers, each
  showing day count and total hours, so a multi-year journal stays browsable.
