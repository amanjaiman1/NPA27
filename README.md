# The UPSC Chronicle

> A personal operating system for the UPSC journey — part digital autobiography, part study-analytics platform, part memory archive. It documents and visualises the complete preparation journey of a candidate from Day 1 until final selection.

This is **not** a task manager or a generic study dashboard. Every day of preparation becomes a permanent part of a searchable, visual timeline. The experience is designed to be emotionally engaging, highly analytical, and aesthetically premium.

---

## Design language

- **Black & white, dark by default.** The entire theme is composed from just two tokens — `--ink` (surface) and `--paper` (foreground) — layered with opacity. Light mode is the same system with the tokens swapped, so every component is theme-agnostic.
- **Editorial typography.** Geist (UI), Geist Mono (data/numbers), and Fraunces (display serif for the "autobiography" voice).
- **Apple-level polish**, inspired by Notion + Linear + GitHub + Obsidian: a collapsible command sidebar, a ⌘K command palette, frosted surfaces, film-grain texture, and restrained motion.
- **Mobile-first**, fast, and animated with Framer Motion. Charts are hand-built in SVG/CSS (no chart library) to stay grayscale, crisp, and lightweight.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS (two-token design system) |
| State | Zustand + `persist` (localStorage) |
| Animation | Framer Motion |
| Icons | lucide-react |
| Charts | Custom SVG/CSS (heatmap, line, bar, donut, sparkline) |

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (all routes prerender)
```

On first load the app seeds a full, deterministic year of realistic data (≈364 journal days, 25 mocks, habits, sleep, books, milestones, etc.) so every visualisation is alive immediately. All data persists locally and can be reset.

---

## Information architecture

The app is organised into six intent-based zones, surfaced in the sidebar and the ⌘K palette:

```
The UPSC Chronicle
│
├── Command
│   ├── Command Center        /                  Dashboard overview of the whole journey
│   └── Milestone Timeline    /timeline          The journey as a single line, Day 0 → exam
│
├── Daily Engine
│   ├── Daily Journal         /journal           The atomic unit — log + reflect on each day
│   ├── Current Affairs       /current-affairs    Searchable, tagged news vault
│   ├── Revision              /revision          Spaced-repetition queue (due / upcoming)
│   └── Mistake Tracker       /mistakes          Errors → corrections → resolved
│
├── Analytics
│   ├── Study Heatmap         /heatmap           Year heatmap + monthly/weekday rhythm
│   ├── Subject Progress      /subjects          Syllabus mastery by paper & topic
│   ├── Mock Analytics        /mocks             Score trends, momentum, history
│   └── Knowledge Graph       /knowledge-graph    Subjects & concepts as a node-link web
│
├── Reflect & Review
│   ├── Reviews               /reviews           Weekly · Monthly · Yearly retrospectives
│   └── Reflections           /reflections       Emotional journal (the inner game)
│
├── Life & Discipline
│   ├── Habits                /habits            Daily disciplines, streaks, adherence
│   ├── Wellbeing             /wellbeing         Sleep + exercise analytics
│   ├── Goals                 /goals             Daily → Long-term goal ladder
│   └── Library               /books             Book progress & revisions
│
└── Endgame
    ├── AI Study Coach        /coach             Data-driven insights + chat guidance
    └── Selection Archive     /archive           Prelims → Mains → Interview → Final
```

### Navigation structure

- **Sidebar** (desktop): grouped, collapsible to an icon rail, with an active-route indicator, profile card, exam countdown, and theme toggle. On mobile it becomes a slide-in drawer.
- **Command palette** (⌘K / Ctrl+K): fuzzy jump to any module, fully keyboard-navigable.
- **Top bar**: contextual section label, exam countdown chip, "Log today" CTA, and mobile menu.

---

## Domain model (database schema)

All entities live in a single typed graph (`src/lib/types.ts`). It is currently persisted client-side, but the shape maps 1:1 onto relational tables for a future backend. `ISODate` = `yyyy-mm-dd`.

```
Profile            name, targetExam, examDate, attemptNumber, optionalSubject,
                   startDate, dailyHourTarget

Subject            id, name, paper(GS1..GS4|Essay|CSAT|Optional|CurrentAffairs),
                   weightage, topics[]
  └─ Topic         id, name, status(untouched|learning|revised|mastered),
                   confidence, revisionCount, lastTouched

JournalEntry       id, date(unique/day), blocks[], totalHours,
                   mood, energy, focus, tasksPlanned, tasksDone,
                   highlights, reflection, tags[]
  └─ StudyBlock    subjectId → Subject, hours, topics[]

MockTest           id, date, name, type, provider, score, max,
                   attempted, correct, wrong, notes, weakAreas[]
RevisionItem       id, subjectId → Subject, topic, addedOn, lastRevised,
                   nextDue, intervalDays, repetitions, confidence
CurrentAffair      id, date, title, source, category, tags[], summary,
                   prelims/mainsRelevant, linkedSubjectId → Subject, bookmarked
Mistake            id, date, subjectId → Subject, topic, type, description,
                   correction, status(Open|Reviewing|Resolved), source

Habit              id, name, cadence, targetPerWeek, log{date→bool}
SleepLog           id, date, hours, quality, bedtime, wakeup
ExerciseLog        id, date, type, minutes, intensity, note

Goal               id, title, horizon, target, current, unit, deadline,
                   status, linkedSubjectId → Subject
Book               id, title, author, subjectId → Subject, totalPages,
                   currentPage, status, rating, started/finishedOn, isStandard
Milestone          id, date, title, type, description, pinned
Reflection         id, date, prompt, content, mood, gratitude[]
Review             id, type(Weekly|Monthly|Yearly), period, dates,
                   totalHours, mocksTaken, rating, wins/struggles/lessons/nextFocus[]

KnowledgeGraph     nodes[](GraphNode), edges[](GraphEdge)
SelectionStage     id, name, attempt, status, date, score, notes
```

### Relationships

`Subject` is the hub of the graph. The journal's `StudyBlock`, plus `RevisionItem`, `CurrentAffair`, `Mistake`, `Goal`, `Book`, and the `KnowledgeGraph` all reference a subject, which is how a single day's entry can flow into mastery, analytics, and the knowledge web. Analytics are derived (never stored) via pure selectors in `src/lib/selectors.ts` (streaks, heatmap cells, hours-by-subject, mock series, adherence, etc.).

---

## Key user flows

1. **Log a day** → ⌘K or "Log today" → composer (subjects + hours, mood/energy/focus, highlight, reflection) → entry joins the timeline → heatmap, streak, subject hours, and dashboard update instantly.
2. **Review what's due** → Revision shows ripe items → mark *Recalled*/*Forgot* → the spaced-repetition scheduler advances/resets the interval and reschedules.
3. **Learn from a mock** → log score → trend, momentum and best update → capture weak areas → file mistakes → queue weak topics for revision.
4. **Zoom out** → Weekly/Monthly/Yearly reviews → wins, struggles, lessons, next focus.
5. **Get guidance** → AI Coach reads journal, mocks, subjects, revision and sleep, and answers "what should I focus on this week?" with specifics drawn from real data.

---

## Page hierarchy & components

```
src/
├── app/
│   ├── layout.tsx              fonts, theme bootstrap, AppShell
│   ├── globals.css             design tokens + utilities
│   └── <route>/page.tsx        one client page per module (hydration-gated)
├── components/
│   ├── layout/                 app-shell, sidebar, topbar, command-palette, logo
│   ├── ui/                     button, card, badge, progress, modal, form, misc, …
│   ├── charts/                 heatmap, line-chart, bar-chart, donut, sparkline
│   └── dashboard/widgets.tsx   composable Command Center widgets
└── lib/
    ├── types.ts                unified domain model
    ├── seed.ts                 deterministic year of demo data
    ├── store.ts                Zustand store + persistence + actions
    ├── selectors.ts            pure analytics functions
    ├── nav.ts                  navigation config (sidebar + palette)
    ├── hooks.ts                useMounted, useMediaQuery, useMeasure
    └── utils.ts                dates, formatting, cn()
```

---

## Future scalability

- **Backend swap.** The store is the single integration point. The `ChronicleData` shape maps directly to Postgres tables (Prisma/Drizzle); swap localStorage persistence for an API layer with the same actions. Selectors stay unchanged.
- **Multi-user & auth.** Add an auth provider, scope every entity by `userId`, and move derivations server-side where useful.
- **Real AI coach.** The current coach is deterministic and data-driven; the same computed context can be fed to an LLM for richer, conversational mentoring.
- **Sync & offline.** localStorage today → IndexedDB + background sync, or a CRDT layer for multi-device continuity.
- **Force-directed knowledge graph**, richer spaced-repetition (SM-2), PDF/notes attachments, exports, shareable "selection story" pages, and notification-driven revision reminders.

---

*Built as a demonstration of a world-class, end-to-end product: information architecture, data model, design system, and a fully navigable application.*
