import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarCheck,
  CloudOff,
  Download,
  Flag,
  HeartPulse,
  Layers,
  ListChecks,
  Network,
  Newspaper,
  NotebookPen,
  Palette,
  BookLock,
  Repeat,
  Route,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, Screenshot, SectionHeading } from "@/components/marketing/ui";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";

const page = PAGES.features;
export const metadata = pageMetadata(page);

interface Feature {
  id: string;
  icon: React.ElementType;
  title: string;
  body: React.ReactNode;
  href?: string;
  link?: string;
}

const GROUPS: { title: string; intro: string; features: Feature[] }[] = [
  {
    title: "Every study day",
    intro: "The daily habit everything else is built on.",
    features: [
      {
        id: "journal",
        icon: NotebookPen,
        title: "Daily study journal",
        body: "One entry per day: hours per subject, topics finished, revisions, books, mocks and current affairs covered, mood, energy, motivation and focus, the day's wins, failures and lessons, and attached notes, photos and PDFs. Every past day and every finished topic stays searchable.",
        href: PAGES.daily.path,
        link: "Daily study tracker",
      },
      {
        id: "heatmap",
        icon: Flag,
        title: "Study heatmap and streaks",
        body: "A year of days shaded by hours studied, with your current and longest streak, total hours and best day.",
        href: PAGES.daily.path,
        link: "How consistency is shown",
      },
      {
        id: "habits",
        icon: ListChecks,
        title: "Habits",
        body: "Habits that keep themselves: connect one to your journal hours, a night's sleep, a revision or a finished roadmap activity and it fills in from what you record there. The rest, like the newspaper or answer writing, you tick off. Each has a streak, a calendar and how often you keep it.",
      },
    ],
  },
  {
    title: "Syllabus and revision",
    intro: "Knowing what you have covered, and keeping it.",
    features: [
      {
        id: "syllabus",
        icon: Layers,
        title: "Syllabus tracker",
        body: "GS Papers I to IV, Essay, CSAT, current affairs and your optional, split into topics you move from untouched to mastered, with confidence, revision count and a warning when a topic goes cold.",
        href: PAGES.syllabus.path,
        link: "UPSC syllabus tracker",
      },
      {
        id: "revision",
        icon: Repeat,
        title: "Spaced revision queue",
        body: "Revisions at growing gaps of 1, 3, 7, 14, 30 and 60 days. Overdue, due today and the next week are counted, and a forecast shows heavy days ahead.",
        href: PAGES.revision.path,
        link: "UPSC revision tracker",
      },
      {
        id: "mistakes",
        icon: TriangleAlert,
        title: "Mistake notebook",
        body: "The question, your answer and the correct one, tagged with one of six error types. Mistakes return for review until you get them right three times in a row, and recurring ones are grouped.",
        href: `${PAGES.revision.path}#mistakes`,
        link: "How mistakes are reviewed",
      },
      {
        id: "knowledge-graph",
        icon: Network,
        title: "Knowledge graph",
        body: "A map of how syllabus topics connect, across subjects, with ready-made links such as the Constitution's framework leading to Fundamental Rights. Add your own links as you learn.",
      },
    ],
  },
  {
    title: "Tests and analytics",
    intro: "Where the marks are won and lost.",
    features: [
      {
        id: "mocks",
        icon: BarChart3,
        title: "Mock analytics",
        body: "Prelims GS, CSAT, Mains GS, Essay, Optional and sectional tests, logged section by section. Score and accuracy trends, marks lost to negative marking, time per section, and what moved the score.",
        href: `${PAGES.progress.path}#mocks`,
        link: "UPSC mock test tracker",
      },
      {
        id: "dashboard",
        icon: Sparkles,
        title: "Dashboard and study coach",
        body: "The state of your preparation on one screen, and a coach that gives a daily briefing and suggestions that show the records behind them. It never changes your plan until you confirm, and it runs on fixed rules, not an AI model.",
        href: PAGES.planner.path,
        link: "UPSC study planner",
      },
    ],
  },
  {
    title: "Planning and review",
    intro: "Turning the record into the next decision.",
    features: [
      {
        id: "goals",
        icon: Target,
        title: "Goals",
        body: "Daily to long-term goals that measure themselves from your hours, syllabus, revision, mocks or books, or from milestones you tick off. Each has a pace, a history, notes, and links to journal days and files, with reminders when one slips.",
        href: PAGES.planner.path,
        link: "Goals and planning",
      },
      {
        id: "roadmap",
        icon: Route,
        title: "Your own roadmap",
        body: "Yearly, monthly and weekly plans you write yourself, used alone or one inside another. Weeks hold activities with priorities and dates, and progress counts only the ones you finish. Plans can point at a goal or a journal day without changing either.",
        href: `${PAGES.planner.path}#roadmap`,
        link: "How the roadmap works",
      },
      {
        id: "reviews",
        icon: CalendarCheck,
        title: "Performance reviews for any period",
        body: "A week, a month or any dates you choose. Hours, topics, revision, habits, goals, the plan, mocks and sleep are gathered for you and compared with the period before. You answer six questions and keep it as a record.",
        href: PAGES.progress.path,
        link: "Progress tracking",
      },
      {
        id: "timeline",
        icon: Flag,
        title: "Milestone timeline",
        body: "The milestones of your preparation, many recorded automatically as you go, beside the ones you write yourself.",
      },
    ],
  },
  {
    title: "The rest of your preparation",
    intro: "Inputs that do not fit in a study block, but matter.",
    features: [
      {
        id: "current-affairs",
        icon: Newspaper,
        title: "Current affairs vault",
        body: "Notes on the news with source, category and tags, marked for Prelims or Mains, linked to a syllabus subject, bookmarked and searchable.",
      },
      {
        id: "books",
        icon: BookOpen,
        title: "Book library",
        body: "Standard books for each paper, with page progress, status and ratings, plus any book you add.",
      },
      {
        id: "wellbeing",
        icon: HeartPulse,
        title: "Life dashboard",
        body: "Sleep in two taps, from bedtime and wake-up, plus exercise, walking and running, water, meditation, screen time, deep work and weight: track only what you choose. Reports compare any period with the one before and count only what you actually logged.",
      },
      {
        id: "reflections",
        icon: BookLock,
        title: "Personal diary",
        body: "A private place to write, with titles, tags, pinned entries and attachments, saved as you type. Nothing in it feeds your reviews, the coach or your habits.",
      },
    ],
  },
  {
    title: "Your account and devices",
    intro: "Built to last the whole preparation.",
    features: [
      {
        id: "sync",
        icon: CloudOff,
        title: "Any device, offline too",
        body: "Works in the browser on phone, tablet or computer, can be installed as an app, keeps working offline and syncs your account when you reconnect.",
      },
      {
        id: "notifications",
        icon: BellRing,
        title: "Reminders you control",
        body: "Notices for overdue revisions, mistakes due, an unlogged day, a streak at risk, goals slipping and more. Turn each on or off and set quiet hours.",
      },
      {
        id: "data",
        icon: Download,
        title: "Your data, exportable",
        body: "Download everything as a file, restore from a backup, or delete your account and all of its data from Settings.",
      },
      {
        id: "appearance",
        icon: Palette,
        title: "Make it yours",
        body: "Light, with frosted glass on a soft sky blue; Dark, pure black for late nights; or Lavender, crisp white on a soft pastel glow. Turn on Reduce transparency for nearly solid panels. Your choice is saved with your account.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="UPSC preparation app"
        title="Everything DoOrDie tracks for your UPSC preparation"
        intro={
          <p>
            DoOrDie is one app for the whole preparation: the daily log, the syllabus, revision, mocks, goals and the
            parts of life that affect them. Here is every feature, with links to a closer look at the main ones.
          </p>
        }
        cta="cta_features"
      />

      {GROUPS.map((g, i) => (
        <Band key={g.title} tone={i % 2 ? "raised" : "plain"} labelledBy={`group-${i}`}>
          <Container>
            <SectionHeading id={`group-${i}`} title={g.title} intro={g.intro} />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.features.map((f) => (
                <div
                  key={f.id}
                  id={f.id}
                  className="flex min-w-0 scroll-mt-24 flex-col rounded-2xl border border-line bg-card p-6 shadow-soft"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold tracking-snugg text-paper">{f.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-paper/65">{f.body}</p>
                  {f.href && f.link && (
                    <Link
                      href={f.href}
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
                    >
                      {f.link} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              ))}
            </div>
            {g.title === "The rest of your preparation" && (
              <Screenshot {...SHOTS.wellbeing} className="mx-auto mt-10 max-w-4xl" caption={SAMPLE_NOTE} />
            )}
          </Container>
        </Band>
      ))}

      <CtaBanner track="cta_features_footer" />
    </>
  );
}
