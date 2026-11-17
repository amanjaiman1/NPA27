/* ════════════════════════════════════════════════════════════════
   THE PUBLIC PAGES
   One entry per indexable page of the public site. Page metadata, the
   sitemap, breadcrumbs and the footer all read from here, so a page's
   title and description are written exactly once.

   `primaryKeyword` is the search the page is the destination for. Each
   keyword belongs to exactly one page (see docs/SEO_KEYWORD_MAP.md) so
   pages never compete with each other.

   `updated` is the date the page's content last changed in a way a reader
   would care about. It feeds the sitemap's lastmod, so bump it when the
   content changes, and only then.

   Blog posts live in src/content/blog and are added to the sitemap there.
   ════════════════════════════════════════════════════════════════ */

export type PageKind = "home" | "overview" | "feature" | "resource" | "company" | "legal";

export interface PublicPage {
  path: string;
  /** Short name for links and breadcrumbs. */
  label: string;
  /** The <title>, before the " | DoOrDie" suffix (the home page has none). */
  title: string;
  description: string;
  primaryKeyword?: string;
  kind: PageKind;
  updated: string;
}

const LAUNCH = "2026-11-17";

export const PAGES = {
  home: {
    path: "/",
    label: "Home",
    title: "UPSC Preparation Tracker for Syllabus & Revision | DoOrDie",
    description:
      "Track your UPSC preparation in one private place: daily study hours, topic-wise syllabus progress, spaced revision, mock test analytics and goals. Free, with no ads.",
    primaryKeyword: "UPSC preparation tracker",
    kind: "home",
    updated: LAUNCH,
  },
  features: {
    path: "/features",
    label: "Features",
    title: "UPSC Preparation App Features",
    description:
      "Everything DoOrDie tracks for UPSC preparation: syllabus progress, a daily study journal, spaced revision, mock analytics, a mistake notebook, goals, reviews and more.",
    primaryKeyword: "UPSC preparation app",
    kind: "overview",
    updated: LAUNCH,
  },
  syllabus: {
    path: "/upsc-syllabus-tracker",
    label: "Syllabus tracker",
    title: "UPSC Syllabus Tracker with Topic-wise Progress",
    description:
      "Track the UPSC syllabus topic by topic across GS I–IV, Essay, CSAT and your optional. Move each topic from untouched to mastered and see which paper is falling behind.",
    primaryKeyword: "UPSC syllabus tracker",
    kind: "feature",
    updated: LAUNCH,
  },
  planner: {
    path: "/upsc-study-planner",
    label: "Study planner",
    title: "UPSC Study Planner with Daily Plans and Goals",
    description:
      "Plan UPSC preparation with goals that measure themselves, a suggested time-blocked day built from your weak subjects and revision queue, and weekly reviews.",
    primaryKeyword: "UPSC study planner",
    kind: "feature",
    updated: LAUNCH,
  },
  revision: {
    path: "/upsc-revision-tracker",
    label: "Revision tracker",
    title: "UPSC Revision Tracker with Spaced Repetition",
    description:
      "Keep UPSC revision on schedule. Topics come back at growing gaps of 1, 3, 7, 14, 30 and 60 days, mistakes return for recall checks, and anything overdue is flagged.",
    primaryKeyword: "UPSC revision tracker",
    kind: "feature",
    updated: LAUNCH,
  },
  progress: {
    path: "/upsc-progress-tracker",
    label: "Progress tracker",
    title: "UPSC Progress Tracker: Study Analytics and Mock Tests",
    description:
      "See how your UPSC preparation is really going: hours by subject, syllabus coverage, mock score and accuracy trends, marks lost to negative marking, and weekly reviews.",
    primaryKeyword: "UPSC preparation progress tracker",
    kind: "feature",
    updated: LAUNCH,
  },
  daily: {
    path: "/daily-study-tracker",
    label: "Daily study tracker",
    title: "UPSC Daily Study Tracker and Study Hours Log",
    description:
      "Log each UPSC study day in a few minutes: hours per subject, topics, revisions, mocks, mood and lessons. Streaks and a heatmap show how consistent you really are.",
    primaryKeyword: "UPSC daily study tracker",
    kind: "feature",
    updated: LAUNCH,
  },
  resources: {
    path: "/resources",
    label: "Free tools",
    title: "Free UPSC Preparation Tools and Templates",
    description:
      "Free tools for organising UPSC preparation: a Prelims 2027 countdown with a study-hours planner, a spaced revision calculator and a printable weekly review template.",
    kind: "overview",
    updated: LAUNCH,
  },
  countdown: {
    path: "/resources/upsc-prelims-2027-countdown",
    label: "Prelims 2027 countdown",
    title: "UPSC Prelims 2027 Countdown: Days Left and Study Hours",
    description:
      "How many days are left until UPSC Prelims on 23 May 2027, the CSE 2027 schedule from UPSC's calendar, and a planner that shows the study hours you have before the exam.",
    primaryKeyword: "days left for UPSC Prelims 2027",
    kind: "resource",
    updated: LAUNCH,
  },
  revisionCalculator: {
    path: "/resources/spaced-revision-calculator",
    label: "Spaced revision calculator",
    title: "Spaced Repetition Revision Calculator for UPSC",
    description:
      "Enter the day you studied a topic and get six revision dates spaced 1, 3, 7, 14, 30 and 60 days apart, ready to add to your calendar. Free, with no sign-up.",
    primaryKeyword: "spaced repetition calculator",
    kind: "resource",
    updated: LAUNCH,
  },
  weeklyReview: {
    path: "/resources/weekly-review-template",
    label: "Weekly review template",
    title: "UPSC Weekly Review Template (Printable)",
    description:
      "A printable weekly review template for UPSC aspirants: hours by subject, syllabus covered, revisions, mocks, mistakes, wins, struggles and next week's focus.",
    primaryKeyword: "UPSC weekly review template",
    kind: "resource",
    updated: LAUNCH,
  },
  blog: {
    path: "/blog",
    label: "Guides",
    title: "UPSC Preparation Guides",
    description:
      "Practical guides to running your UPSC preparation: study hours, revision schedules, mock test analysis, study plans and staying consistent.",
    kind: "overview",
    updated: LAUNCH,
  },
  about: {
    path: "/about",
    label: "About",
    title: "About DoOrDie",
    description:
      "Why DoOrDie exists, who builds it, and the principles it is built on: your data is private, the product is honest about what it does, and it is not affiliated with UPSC.",
    kind: "company",
    updated: LAUNCH,
  },
  contact: {
    path: "/contact",
    label: "Contact",
    title: "Contact DoOrDie",
    description:
      "How to reach DoOrDie with a question, a bug report or a feature request, and how to manage your account and data yourself.",
    kind: "company",
    updated: LAUNCH,
  },
  privacy: {
    path: "/privacy-policy",
    label: "Privacy policy",
    title: "Privacy Policy",
    description:
      "What DoOrDie collects, why, where it is stored, who processes it, and how to export or delete your data.",
    kind: "legal",
    updated: LAUNCH,
  },
  terms: {
    path: "/terms",
    label: "Terms of service",
    title: "Terms of Service",
    description:
      "The terms for using DoOrDie, the free UPSC preparation tracker: your account, your data, acceptable use, and what the service does and does not promise.",
    kind: "legal",
    updated: LAUNCH,
  },
  disclaimer: {
    path: "/disclaimer",
    label: "Disclaimer",
    title: "Disclaimer: Not Affiliated with UPSC",
    description:
      "DoOrDie is an independent preparation tool. It is not affiliated with, endorsed by or connected to UPSC or the Government of India.",
    kind: "legal",
    updated: LAUNCH,
  },
} satisfies Record<string, PublicPage>;

export type PageId = keyof typeof PAGES;

export const ALL_PAGES: PublicPage[] = Object.values(PAGES);

/** The feature landing pages, in the order the site presents them. */
export const FEATURE_PAGES: PublicPage[] = [
  PAGES.syllabus,
  PAGES.daily,
  PAGES.revision,
  PAGES.progress,
  PAGES.planner,
];

export const RESOURCE_PAGES: PublicPage[] = [PAGES.countdown, PAGES.revisionCalculator, PAGES.weeklyReview];
