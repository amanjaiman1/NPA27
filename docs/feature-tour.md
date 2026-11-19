# The feature tour

A full-screen walk through the whole app: a welcome, six short chapters with a
live picture of every page, and a last step that asks where to begin. It opens
by itself once for a new account, and anyone can open it again from the top bar.

## When it opens

- **By itself, once:** on the first visit to the dashboard of an account set up
  in the last 7 days that has never seen it (`shouldAutoOpenTour` in
  `src/lib/tour.ts`). It waits for the first sync of the visit, so finishing it
  on one device means another doesn't show it again, then rises over the
  dashboard about a second after the page appears.
- **Never unasked for older accounts.** Their Tour button carries a dot, which
  pulses a few times when a page opens and then rests, until the tour has been
  opened once.
- **Any time:** the **Tour** button in the top bar of every page (a labelled
  pill on a computer, a compass on a phone), **Feature tour** in search
  (Ctrl K, or Command K on a Mac), and **Settings → Feature tour**.

Closing it in any way (finishing, skipping, Escape, or choosing where to start)
records `profile.tourSeenAt`, a date that syncs with the account and merges
field by field like the rest of the profile. The first time it closes without
a page being chosen, a bubble beside the button says it can be found there.

## What's in it

| Step | Pages |
| --- | --- |
| Welcome | The DoOrDie mark drawing itself in two orbits of every page's icon, the day of preparation and the days to the exam |
| Every day | Daily Journal, Habits, Life Dashboard, Library |
| Remember | Revision, Mistake Tracker, Current Affairs |
| Progress | Subject Progress, Study Heatmap, Mock Analytics, Knowledge Graph |
| Plan | Goals, Roadmap, Milestone Timeline |
| Review | Performance Review, Personal Diary, Study Coach |
| Yours | Search, Notifications, Themes (a real theme switch), Install & sync |
| Where to start | Write today's entry, set a goal, plan this week, check the syllabus, log a mock test, or look around first |

Each feature has an **Open** link to its page, which closes the tour and goes
there. The pictures use the account's own subjects, habits, books and exam; the
figures in them are examples, while the day of preparation and the days to the
exam are real.

## How it behaves

- **Moving:** Next and Back, the arrow keys, the step bar at the top, and on a
  phone a swipe across the picture. Escape or **Skip tour** closes it.
- **Inside a chapter** one feature is in focus at a time. Focus moves on by
  itself every 6 seconds until you pick a feature, never past the last one, and
  waits while the mouse rests on the pictures or the list. With Reduce motion it
  doesn't move on by itself at all.
- **Three layouts**, chosen by the window's width and height: the list beside
  every picture at once (from 1024 by 620), every picture above the list (from
  640 wide and 900 tall), or one picture at a time with a swipe.
- **Pictures fit their own size**: each tile is a CSS size container, and small
  tiles drop their extras while tall ones show more.
- **Keyboard and screen readers:** a dialog named "DoOrDie feature tour". The
  app behind it is inert while it's open, Tab stays inside, each step change is
  announced, and focus goes back where it was afterwards. The app's own
  shortcuts (Ctrl K) wait until it's closed.
- **Motion:** it opens out of the Tour button as a widening circle and closes
  back into it. Everything else is transform and opacity, plus one animated
  custom property for the light round the picture in focus. Reduce motion shows
  every picture in its finished state.

## Where it lives

| Part | File |
| --- | --- |
| When it opens by itself | `src/lib/tour.ts` |
| Opening, closing, the seen date, loading on demand | `src/components/tour/tour-provider.tsx` |
| `useTour()`, for anything that opens it | `src/components/tour/tour-context.ts` |
| The button, its dot and the bubble | `src/components/tour/tour-button.tsx` |
| The steps, keyboard, focus and layouts | `src/components/tour/feature-tour.tsx` |
| The words and each chapter's grid | `src/components/tour/chapters.tsx` |
| The pictures | `src/components/tour/demos.tsx` |
| Motion pieces: word reveal, count-up, typing, the tilting stage, the light | `src/components/tour/kit.tsx` |
| The account's subjects, habits, books and exam, for the pictures | `src/components/tour/tour-data.ts` |
| The look | "The feature tour" in `src/app/globals.css` |
| The button in the top bar, search and Settings | `layout/topbar.tsx`, `layout/command-palette.tsx`, `app/(product)/(app)/settings/page.tsx` |

**Loading:** the tour is a chunk of its own, about 24 KB gzipped, loaded with
React's `lazy` and downloaded only when it's about to open. Pointing at or
focusing the button starts the download, so it opens at once. Every page of the
app loads only the provider and the button, about 1.4 KB gzipped, and pages are
otherwise the size they were.

From framer-motion the tour uses only `motion` and `AnimatePresence`, which the
app already loads. Its count-ups and the tilting stage are plain
requestAnimationFrame and CSS: importing more of framer (`animate`,
`useSpring`, motion values) into the tour's chunk made the bundler regroup
framer's modules, and that alone added about 4 KB to almost every page.

## Adding a page to it

1. Add an id to `DemoId` and a picture to `DEMOS` in `demos.tsx`. Draw it with
   tokens (`bg-accent`, `bg-bloom-*`, the status colours) so every theme dresses
   it, and keep symbols as icons: Poppins has no arrows, ticks or ⌘.
2. Add a `Feature` to a chapter in `chapters.tsx`, with its place in the
   chapter's grid (`area`, and `cols`/`rows` if the grid changes), and its icon
   to `ORBIT_INNER` or `ORBIT_OUTER`.
3. If the picture has real controls in it, add its id to `INTERACTIVE_DEMOS`, so
   screen readers reach them.
4. Look at it at 1440×900, 1024×700, 820×1180, 390×844 and 360×740, in all three
   themes, and with Reduce motion.

## Tests and sample accounts

The browser tests (`tests/e2e/accounts.e2e.mjs`) skip the tour with
`passTourIfShown` wherever a new account lands on the dashboard: while the tour
is open the app behind it can't be reached. The made-up accounts behind the
product screenshots and the promo film have `tourSeenAt`, so their Tour button
shows no dot.
