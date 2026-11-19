import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Command,
  Flame,
  HeartPulse,
  Layers,
  LayoutDashboard,
  ListChecks,
  Milestone,
  Network,
  Newspaper,
  NotebookPen,
  Palette,
  Quote,
  Repeat,
  Route,
  Search,
  Bell,
  Smartphone,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { SR_INTERVALS } from "@/lib/revision";
import { Kbd, isMac, type GlowSpot } from "./kit";
import type { DemoId } from "./demos";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR — what it says
   Six chapters between a welcome and a last step that asks where to
   begin. Every page in the navigation appears once, under the question
   it answers, with the same names and icons the sidebar uses. Each
   chapter lays its pictures out on a small grid of its own (`cols`,
   `rows` and each feature's `area`), used wherever there is room for
   all of them at once.
   ════════════════════════════════════════════════════════════════ */

export interface Feature {
  id: DemoId;
  name: string;
  icon: LucideIcon;
  /** A few words under the name. */
  short: string;
  /** What it does, in a sentence or two. */
  detail: React.ReactNode;
  /** The page it lives on, for "Open …". */
  href?: string;
  /** Its place in the chapter's grid, as CSS grid lines. */
  area: { col: string; row: string };
}

export interface Chapter {
  id: string;
  /** One or two words, for the step list and the eyebrow. */
  label: string;
  icon: LucideIcon;
  title: string;
  lead: string;
  cols: number;
  rows: number;
  features: Feature[];
  /** Where the background light settles for this chapter. */
  glow: GlowSpot[];
}

const gaps = SR_INTERVALS.join(", ").replace(/, (\d+)$/, " and $1");

export const CHAPTERS: Chapter[] = [
  {
    id: "daily",
    label: "Every day",
    icon: NotebookPen,
    title: "Write each day down in a minute.",
    lead: "A short entry each evening becomes your record: the hours, the subjects, your habits and how the day felt.",
    cols: 3,
    rows: 2,
    glow: [
      { x: 72, y: 26, scale: 1 },
      { x: 10, y: 82, scale: 0.85 },
      { x: 96, y: 94, scale: 0.9 },
    ],
    features: [
      {
        id: "journal",
        name: "Daily Journal",
        icon: NotebookPen,
        short: "One entry for each day",
        detail:
          "Log hours by subject, the topics you finished, your mood and focus, and attach notes, photos or PDFs. Every past day stays searchable.",
        href: "/journal",
        area: { col: "1 / 3", row: "1 / 2" },
      },
      {
        id: "habits",
        name: "Habits",
        icon: ListChecks,
        short: "Small disciplines, kept daily",
        detail:
          "Tick off the newspaper, answer writing or revision each day. Every habit keeps its own streak and shows how often you keep it.",
        href: "/habits",
        area: { col: "3 / 4", row: "1 / 3" },
      },
      {
        id: "life",
        name: "Life Dashboard",
        icon: HeartPulse,
        short: "Sleep and health, beside study",
        detail:
          "Record sleep in two taps, plus exercise, water, screen time and more. Track only what you choose, and see how it moves with your study.",
        href: "/wellbeing",
        area: { col: "1 / 2", row: "2 / 3" },
      },
      {
        id: "library",
        name: "Library",
        icon: BookOpen,
        short: "Your books, page by page",
        detail: "The standard books for each paper are already on the shelf. Note the page you reached and watch each one fill up.",
        href: "/books",
        area: { col: "2 / 3", row: "2 / 3" },
      },
    ],
  },
  {
    id: "remember",
    label: "Remember",
    icon: Repeat,
    title: "Remember what you learn.",
    lead: "Revision comes back at the right moment, and every mistake gets a second chance.",
    cols: 2,
    rows: 2,
    glow: [
      { x: 28, y: 10, scale: 0.95 },
      { x: 90, y: 58, scale: 1 },
      { x: 12, y: 98, scale: 0.8 },
    ],
    features: [
      {
        id: "revision",
        name: "Revision",
        icon: Repeat,
        short: "Spaced repetition, planned for you",
        detail: `A topic comes back ${gaps} days after you learn it. You see what's due today, what's overdue, and the busy days ahead.`,
        href: "/revision",
        area: { col: "1 / 3", row: "1 / 2" },
      },
      {
        id: "mistakes",
        name: "Mistake Tracker",
        icon: TriangleAlert,
        short: "Learn from every wrong answer",
        detail:
          "Save the question, your answer and the right one, with the kind of error. It keeps coming back until you get it right three times in a row.",
        href: "/mistakes",
        area: { col: "1 / 2", row: "2 / 3" },
      },
      {
        id: "current",
        name: "Current Affairs",
        icon: Newspaper,
        short: "A vault for the news",
        detail:
          "Keep notes on the news with the source, tags and a syllabus subject, marked for Prelims or Mains and easy to find again.",
        href: "/current-affairs",
        area: { col: "2 / 3", row: "2 / 3" },
      },
    ],
  },
  {
    id: "stand",
    label: "Progress",
    icon: BarChart3,
    title: "See exactly where you stand.",
    lead: "Your syllabus, your consistency and your scores, measured from what you log.",
    cols: 2,
    rows: 2,
    glow: [
      { x: 84, y: 14, scale: 1 },
      { x: 18, y: 56, scale: 0.9 },
      { x: 60, y: 104, scale: 1 },
    ],
    features: [
      {
        id: "subjects",
        name: "Subject Progress",
        icon: Layers,
        short: "The syllabus, topic by topic",
        detail:
          "GS Papers I to IV, Essay, CSAT and your optional, split into topics you move from untouched to mastered. A topic going cold is flagged.",
        href: "/subjects",
        area: { col: "1 / 2", row: "1 / 2" },
      },
      {
        id: "heatmap",
        name: "Study Heatmap",
        icon: Flame,
        short: "A year of days at a glance",
        detail: "Every day shaded by the hours you studied, with your current and longest streak beside it.",
        href: "/heatmap",
        area: { col: "2 / 3", row: "1 / 2" },
      },
      {
        id: "mocks",
        name: "Mock Analytics",
        icon: BarChart3,
        short: "Every test, section by section",
        detail: "Log Prelims, CSAT and Mains tests. See score and accuracy trends, and what negative marking cost you.",
        href: "/mocks",
        area: { col: "1 / 2", row: "2 / 3" },
      },
      {
        id: "graph",
        name: "Knowledge Graph",
        icon: Network,
        short: "How topics connect",
        detail: "A map of how syllabus topics link up across subjects, with the common links already drawn. Add your own as you learn.",
        href: "/knowledge-graph",
        area: { col: "2 / 3", row: "2 / 3" },
      },
    ],
  },
  {
    id: "aim",
    label: "Plan",
    icon: Target,
    title: "Aim high, and plan the way.",
    lead: "Goals that measure themselves, plans you write yourself, and the milestones along the way.",
    cols: 2,
    rows: 2,
    glow: [
      { x: 12, y: 22, scale: 1.05 },
      { x: 78, y: 86, scale: 0.95 },
      { x: 96, y: 8, scale: 0.8 },
    ],
    features: [
      {
        id: "goals",
        name: "Goals",
        icon: Target,
        short: "Targets that track themselves",
        detail:
          "Set a goal for hours, syllabus, revision, mocks or books, and it measures itself from what you log, with a pace to keep.",
        href: "/goals",
        area: { col: "1 / 2", row: "1 / 3" },
      },
      {
        id: "roadmap",
        name: "Roadmap",
        icon: Route,
        short: "Your year, month and week",
        detail:
          "Write yearly, monthly and weekly plans. Weeks hold activities with dates and priorities, and progress counts only what you finish.",
        href: "/roadmap",
        area: { col: "2 / 3", row: "1 / 2" },
      },
      {
        id: "timeline",
        name: "Milestone Timeline",
        icon: Milestone,
        short: "The journey so far",
        detail: "The moments that matter in your preparation, many of them recorded for you as you go.",
        href: "/timeline",
        area: { col: "2 / 3", row: "2 / 3" },
      },
    ],
  },
  {
    id: "grow",
    label: "Reflect",
    icon: CalendarCheck,
    title: "Look back, then go further.",
    lead: "Reviews and reflections show what worked, and the coach suggests what to do next.",
    cols: 2,
    rows: 2,
    glow: [
      { x: 58, y: 6, scale: 0.9 },
      { x: 6, y: 72, scale: 1 },
      { x: 94, y: 70, scale: 0.95 },
    ],
    features: [
      {
        id: "reviews",
        name: "Reviews",
        icon: CalendarCheck,
        short: "Weekly, monthly and yearly",
        detail:
          "Hours, active days, mocks and the subject split are measured for you. You add the rating, the wins and what to focus on next.",
        href: "/reviews",
        area: { col: "1 / 2", row: "1 / 2" },
      },
      {
        id: "reflections",
        name: "Reflections",
        icon: Quote,
        short: "A private place for feelings",
        detail: "Write how the preparation feels, with gentle prompts, a mood rating and gratitude notes, and see which way your mood is going.",
        href: "/reflections",
        area: { col: "2 / 3", row: "1 / 2" },
      },
      {
        id: "coach",
        name: "Study Coach",
        icon: Sparkles,
        short: "Suggestions from your own data",
        detail:
          "Reads what you've logged and suggests the day ahead, a revision plan and a weekly report. It follows fixed rules, so every tip has a reason you can see.",
        href: "/coach",
        area: { col: "1 / 2", row: "2 / 3" },
      },
      {
        id: "archive",
        name: "Selection Archive",
        icon: Trophy,
        short: "Prelims to the final list",
        detail: "Every stage of the exam, attempt by attempt, from Prelims to the final result, kept in one place.",
        href: "/archive",
        area: { col: "2 / 3", row: "2 / 3" },
      },
    ],
  },
  {
    id: "yours",
    label: "Yours",
    icon: Palette,
    title: "Made to fit the way you work.",
    lead: "Find anything in a keystroke, hear about what matters, and make it look the way you like.",
    cols: 2,
    rows: 2,
    glow: [
      { x: 88, y: 26, scale: 1.05 },
      { x: 28, y: 94, scale: 0.9 },
      { x: 6, y: 12, scale: 0.8 },
    ],
    features: [
      {
        id: "search",
        name: "Search",
        icon: Search,
        short: "Any page, in a keystroke",
        detail: <SearchDetail />,
        area: { col: "1 / 2", row: "1 / 2" },
      },
      {
        id: "notify",
        name: "Notifications",
        icon: Bell,
        short: "Reminders you control",
        detail: "Hear about revisions due, an unlogged day or a streak at risk. Turn each one on or off, and set quiet hours.",
        href: "/settings#notifications",
        area: { col: "2 / 3", row: "1 / 2" },
      },
      {
        id: "themes",
        name: "Themes",
        icon: Palette,
        short: "Lavender, Light or Dark",
        detail: "Try one now: the tour changes with it. Your choice is saved with your account, on every device.",
        href: "/settings#appearance",
        area: { col: "1 / 2", row: "2 / 3" },
      },
      {
        id: "install",
        name: "Install & sync",
        icon: Smartphone,
        short: "Every device, even offline",
        detail:
          "Install it on your phone or computer. It keeps working offline and syncs your account when you're back online.",
        href: "/settings#app",
        area: { col: "2 / 3", row: "2 / 3" },
      },
    ],
  },
];

/** The shortcut, drawn with the keys this computer has. */
function SearchDetail() {
  const mac = isMac();
  return (
    <>
      Press{" "}
      {mac ? (
        <Kbd label="Command">
          <Command className="h-3 w-3" aria-hidden />
        </Kbd>
      ) : (
        <Kbd>Ctrl</Kbd>
      )}{" "}
      <Kbd>K</Kbd> on any page, or use the search bar at the top, then type where you want to go.
    </>
  );
}

export const INTRO_GLOW: GlowSpot[] = [
  { x: 18, y: 18, scale: 1.05 },
  { x: 86, y: 26, scale: 0.9 },
  { x: 52, y: 100, scale: 1.1 },
];

export const FINALE_GLOW: GlowSpot[] = [
  { x: 50, y: 28, scale: 1.15 },
  { x: 14, y: 92, scale: 0.9 },
  { x: 88, y: 90, scale: 0.9 },
];

/** The places the last step offers to start from. */
export interface Choice {
  title: string;
  line: string;
  icon: LucideIcon;
  /** Omitted: stay where you are. */
  href?: string;
}

export const CHOICES: Choice[] = [
  { title: "Write today's entry", line: "Your first day, in a minute", icon: NotebookPen, href: "/journal?new=1" },
  { title: "Set a goal", line: "Something to aim for", icon: Target, href: "/goals?new=1" },
  { title: "Plan this week", line: "Your next seven days", icon: Route, href: "/roadmap?new=week" },
  { title: "Check your syllabus", line: "Mark what you've covered", icon: Layers, href: "/subjects" },
  { title: "Log a mock test", line: "Add one you've already taken", icon: BarChart3, href: "/mocks" },
  { title: "Look around first", line: "Start from the dashboard", icon: LayoutDashboard },
];

/** The icons that orbit the mark on the welcome step: every page, once. */
export const ORBIT_INNER: LucideIcon[] = [NotebookPen, ListChecks, HeartPulse, BookOpen, Repeat, TriangleAlert, Newspaper, Layers];
export const ORBIT_OUTER: LucideIcon[] = [
  Flame,
  BarChart3,
  Network,
  Target,
  Route,
  Milestone,
  CalendarCheck,
  Quote,
  Sparkles,
  Trophy,
  Search,
  Bell,
  Palette,
  Smartphone,
];
