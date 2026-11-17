/**
 * Product screenshots used on the public site. They come from
 * scripts/seo-screenshots.ts, which runs the real app with a made-up sample
 * account ("Meera"), so no real person's data appears anywhere.
 *
 * Desktop shots are 1280×800 CSS pixels at 1.5×; phone shots 390×844 at 1.5×.
 */

export interface Shot {
  src: string;
  width: number;
  height: number;
  alt: string;
}

const desktop = { width: 1920, height: 1200 };
const phone = { width: 585, height: 1266 };

export const SHOTS = {
  dashboard: {
    src: "/product/dashboard.webp",
    ...desktop,
    alt: "DoOrDie dashboard for a sample aspirant: days to the exam, current study streak, total hours, days studied, average mood, a study heatmap and today's hours by subject",
  },
  dashboardMobile: {
    src: "/product/dashboard-mobile.webp",
    ...phone,
    alt: "The DoOrDie dashboard on a phone, with the days-left ring, streak and study totals",
  },
  subjects: {
    src: "/product/subjects.webp",
    ...desktop,
    alt: "Syllabus tracker showing overall syllabus confidence, topics mastered, the share revised or better, topics untouched for 45 days, and a bar of untouched, learning, revised and mastered topics",
  },
  journal: {
    src: "/product/journal.webp",
    ...desktop,
    alt: "Daily study journal listing each day with its total hours, the subjects studied, a one-line highlight and the day's mood",
  },
  journalEntry: {
    src: "/product/journal-entry.webp",
    ...desktop,
    alt: "Journal entry form with wake-up and sleep times, study blocks of subject and hours, and topics completed",
  },
  journalEntryMobile: {
    src: "/product/journal-entry-mobile.webp",
    ...phone,
    alt: "The journal entry form on a phone",
  },
  revision: {
    src: "/product/revision.webp",
    ...desktop,
    alt: "Revision tracker with overdue, due-today and next-seven-days counts, a chart of revisions falling due over the next fortnight, and how confident each item is",
  },
  heatmap: {
    src: "/product/heatmap.webp",
    ...desktop,
    alt: "Study heatmap with the current and longest streak, total hours, active days, average hours per active day, best day, and a year of daily squares shaded by hours studied",
  },
  mocks: {
    src: "/product/mocks.webp",
    ...desktop,
    alt: "Mock test analytics for Prelims GS: latest score, average, best, accuracy of attempted questions, marks lost to negative marking per mock, and a chart of scores across mocks",
  },
  mistakes: {
    src: "/product/mistakes.webp",
    ...desktop,
    alt: "Mistake tracker with totals, a review card asking a question from a past mistake, and recurring mistakes grouped by topic and error type",
  },
  goals: {
    src: "/product/goals.webp",
    ...desktop,
    alt: "Goals that measure themselves, such as revision passes this month and study hours this week, each showing progress, pace and whether it is on track",
  },
  coach: {
    src: "/product/coach.webp",
    ...desktop,
    alt: "Study coach summary: days to the exam, streak, readiness, mock average, revisions due and mood, with a short written read on what to focus on next",
  },
  reviews: {
    src: "/product/reviews.webp",
    ...desktop,
    alt: "Weekly review with the week's hours, active days, mocks and consistency already measured, and hours split by subject",
  },
  wellbeing: {
    src: "/product/wellbeing.webp",
    ...desktop,
    alt: "Life dashboard logging sleep, deep work, water, meditation, exercise, walking, running, screen time and weight for the day",
  },
} satisfies Record<string, Shot>;

export const SAMPLE_NOTE = "Screenshots from the app, using a sample account with made-up data.";
