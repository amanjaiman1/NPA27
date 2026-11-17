/* ════════════════════════════════════════════════════════════════
   THE GUIDES
   Metadata for every published article, newest first. The body of each
   article is a component in ./posts/<slug>.tsx, wired up in ./bodies.ts.

   To publish a new guide:
     1. Write ./posts/<slug>.tsx (see an existing one for the structure).
     2. Add its metadata here and its body to ./bodies.ts.
     3. Add its keyword to docs/SEO_KEYWORD_MAP.md, and check no other page
        already targets it.
   It then appears on /blog, in the sitemap and in the footer automatically.

   `updated` must only change when the article's content changes — it is
   shown to readers and sent to search engines as the modified date.
   ════════════════════════════════════════════════════════════════ */

import type { PageId } from "@/lib/seo/pages";

export type PostTopic = "Planning" | "Study hours" | "Revision" | "Mock tests" | "Consistency";

export interface PostMeta {
  slug: string;
  /** The H1 and the <title> (before " | DoOrDie"). Keep it under ~60 characters. */
  title: string;
  /** A few words for menus and the footer. */
  short: string;
  /** Meta description: the search snippet. */
  description: string;
  /** One or two sentences for the guide's card on /blog. */
  excerpt: string;
  published: string;
  updated: string;
  /** Rounded up from the word count at ~200 words a minute. */
  readingMinutes: number;
  primaryKeyword: string;
  topic: PostTopic;
  /** The product page this guide naturally leads to. */
  feature: PageId;
}

export const POSTS: PostMeta[] = [
  {
    slug: "how-to-track-upsc-preparation",
    title: "How to Track Your UPSC Preparation (A Simple System)",
    short: "Tracking your preparation",
    description:
      "What to record each day, what to review each week, and how to turn study hours, syllabus progress, revisions and mocks into decisions about what to study next.",
    excerpt:
      "Six things worth recording, a five-minute daily log, a twenty-minute weekly review, and the mistakes that make tracking feel like a second job.",
    published: "2026-11-17",
    updated: "2026-11-17",
    readingMinutes: 7,
    primaryKeyword: "how to track UPSC preparation",
    feature: "progress",
    topic: "Planning",
  },
  {
    slug: "how-many-hours-to-study-for-upsc",
    title: "How Many Hours Should You Study for UPSC Each Day?",
    short: "How many hours to study",
    description:
      "There is no official number. How to choose a daily target you can sustain, why focused hours matter more than total hours, and how to track them honestly.",
    excerpt:
      "Why the hours you can repeat for a year matter more than the hours you can manage for a week, and how to measure the right ones.",
    published: "2026-11-17",
    updated: "2026-11-17",
    readingMinutes: 6,
    primaryKeyword: "how many hours to study for UPSC",
    feature: "daily",
    topic: "Study hours",
  },
  {
    slug: "upsc-revision-schedule-spaced-repetition",
    title: "A Spaced Repetition Revision Schedule for UPSC",
    short: "A revision schedule",
    description:
      "How spaced repetition works, a revision ladder of 1, 3, 7, 14, 30 and 60 days, what to do when you miss a revision, and how to run it across the whole syllabus.",
    excerpt:
      "A revision ladder you can start today, what the research on spacing actually says, and how to keep the queue from burying you.",
    published: "2026-11-17",
    updated: "2026-11-17",
    readingMinutes: 6,
    primaryKeyword: "spaced repetition for UPSC",
    feature: "revision",
    topic: "Revision",
  },
  {
    slug: "how-to-analyse-upsc-mock-test",
    title: "How to Analyse a UPSC Mock Test, Step by Step",
    short: "Analysing a mock test",
    description:
      "A step-by-step method for analysing Prelims and Mains mocks: accuracy, attempts, the cost of negative marking, error types, timing, and what to change before the next test.",
    excerpt:
      "The score is the least useful number on the sheet. A step-by-step review that turns each mock into a short list of fixes.",
    published: "2026-11-17",
    updated: "2026-11-17",
    readingMinutes: 7,
    primaryKeyword: "how to analyse UPSC mock test",
    feature: "progress",
    topic: "Mock tests",
  },
  {
    slug: "how-to-make-upsc-study-plan",
    title: "How to Make a UPSC Study Plan You Can Actually Follow",
    short: "Making a study plan",
    description:
      "Work backwards from the exam date, split the time into phases, plan weeks rather than perfect days, build in revision and mocks, and adjust the plan every week.",
    excerpt:
      "Plans fail when they assume perfect days. How to plan in weeks, leave room for revision and real life, and adjust without starting over.",
    published: "2026-11-17",
    updated: "2026-11-17",
    readingMinutes: 6,
    primaryKeyword: "how to make a UPSC study plan",
    feature: "planner",
    topic: "Planning",
  },
  {
    slug: "consistency-in-upsc-preparation",
    title: "How to Stay Consistent in UPSC Preparation",
    short: "Staying consistent",
    description:
      "Practical ways to keep studying through a long UPSC preparation: a minimum day, weekly targets, streaks that forgive, habits, sleep, and a review that catches slumps early.",
    excerpt:
      "Consistency is a system, not a personality trait. A minimum day, forgiving streaks, and the early warning signs of a slump.",
    published: "2026-11-17",
    updated: "2026-11-17",
    readingMinutes: 5,
    primaryKeyword: "how to maintain consistency in UPSC preparation",
    feature: "daily",
    topic: "Consistency",
  },
];

export function postPath(slug: string): string {
  return `/blog/${slug}`;
}

export function findPost(slug: string): PostMeta | undefined {
  return POSTS.find((p) => p.slug === slug);
}
