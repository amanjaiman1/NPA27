import {
  LayoutDashboard,
  NotebookPen,
  Milestone,
  Route,
  Newspaper,
  Repeat,
  TriangleAlert,
  Flame,
  Layers,
  BarChart3,
  Network,
  CalendarCheck,
  Quote,
  ListChecks,
  Target,
  BookOpen,
  Sparkles,
  Trophy,
  HeartPulse,
  Moon,
  Footprints,
  Scale,
  Smartphone,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  short: string; // for command palette keyword / tooltip
  /** A one-word name for tight spaces (the phone's bottom bar). */
  tab?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Drawn larger, as tiles, at the top of the sidebar. */
  prominent?: boolean;
}

/**
 * The four sections used every day. They lead the sidebar as tiles and make
 * up the bottom bar on a phone; they appear nowhere else in the navigation.
 */
export const essentialNavItems: NavItem[] = [
  { label: "Daily Journal", href: "/journal", icon: NotebookPen, short: "Log today", tab: "Journal" },
  { label: "Goals", href: "/goals", icon: Target, short: "What you're chasing", tab: "Goals" },
  {
    label: "Life Dashboard",
    href: "/wellbeing",
    icon: HeartPulse,
    short: "Sleep, movement, reports & patterns",
    tab: "Life",
  },
  { label: "Revision", href: "/revision", icon: Repeat, short: "Spaced repetition", tab: "Revision" },
];

export const navGroups: NavGroup[] = [
  { label: "Essentials", items: essentialNavItems, prominent: true },
  {
    label: "Command",
    items: [
      { label: "Command Center", href: "/dashboard", icon: LayoutDashboard, short: "Dashboard overview" },
      { label: "Roadmap", href: "/roadmap", icon: Route, short: "The CSE 2027 week-by-week plan" },
      { label: "Milestone Timeline", href: "/timeline", icon: Milestone, short: "The journey so far" },
    ],
  },
  {
    label: "Daily Engine",
    items: [
      { label: "Current Affairs", href: "/current-affairs", icon: Newspaper, short: "News vault" },
      { label: "Mistake Tracker", href: "/mistakes", icon: TriangleAlert, short: "Learn from errors" },
      { label: "Habits", href: "/habits", icon: ListChecks, short: "Daily disciplines" },
      { label: "Library", href: "/books", icon: BookOpen, short: "Book progress" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Study Heatmap", href: "/heatmap", icon: Flame, short: "Consistency map" },
      { label: "Subject Progress", href: "/subjects", icon: Layers, short: "Syllabus mastery" },
      { label: "Mock Analytics", href: "/mocks", icon: BarChart3, short: "Test performance" },
      { label: "Knowledge Graph", href: "/knowledge-graph", icon: Network, short: "Connected concepts" },
    ],
  },
  {
    label: "Reflect & Review",
    items: [
      { label: "Reviews", href: "/reviews", icon: CalendarCheck, short: "Weekly · Monthly · Yearly" },
      { label: "Reflections", href: "/reflections", icon: Quote, short: "Emotional journal" },
    ],
  },
  {
    label: "Endgame",
    items: [
      { label: "Study Coach", href: "/coach", icon: Sparkles, short: "Insights & guidance" },
      { label: "Selection Archive", href: "/archive", icon: Trophy, short: "The result journey" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, short: "Profile, exam, appearance, data & account" },
    ],
  },
];

/** The roadmap is opt-in (it is one specific CSE 2027 plan), so it can be hidden. */
export function visibleNavGroups(useRoadmap: boolean | undefined): NavGroup[] {
  if (useRoadmap) return navGroups;
  return navGroups.map((g) => ({ ...g, items: g.items.filter((i) => i.href !== "/roadmap") }));
}

/**
 * The four life metrics that have a page of their own. These are deliberately
 * kept out of `navGroups` — four more rows would crowd the sidebar — but they
 * still belong in the command palette, so that "running" or "weight" typed into
 * ⌘K goes straight there.
 */
export const metricNavItems: NavItem[] = [
  { label: "Sleep", href: "/wellbeing/sleep", icon: Moon, short: "Every night, hours & quality over time" },
  { label: "Running", href: "/wellbeing/running", icon: Footprints, short: "Distance run by day, week, month, year" },
  { label: "Weight", href: "/wellbeing/weight", icon: Scale, short: "Weight trend and seven-day average" },
  { label: "Screen time", href: "/wellbeing/screen", icon: Smartphone, short: "Where the hours leak" },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

/** Everything the command palette should be able to reach. */
export const searchableNavItems: NavItem[] = [...allNavItems, ...metricNavItems];

export function findNavItem(pathname: string): NavItem | undefined {
  return allNavItems.find((i) => isActivePath(pathname, i.href));
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
