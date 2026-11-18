import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Download,
  HeartPulse,
  Layers,
  Lock,
  Newspaper,
  NotebookPen,
  Repeat,
  Smartphone,
  Target,
  TriangleAlert,
} from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES, RESOURCE_PAGES } from "@/lib/seo/pages";
import { filmVideo, softwareApplication } from "@/lib/seo/schema";
import { HomeFilm } from "@/components/marketing/home-film";
import { InstallAppInline } from "@/components/marketing/install-app-inline";
import { JsonLd } from "@/components/seo/json-ld";
import {
  Band,
  ButtonLink,
  CheckList,
  Container,
  CtaBanner,
  Eyebrow,
  Faq,
  FeatureCard,
  Screenshot,
  SectionHeading,
  Steps,
  type FaqItem,
} from "@/components/marketing/ui";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";
import { POSTS, postPath } from "@/content/blog";

export const metadata = pageMetadata(PAGES.home);

/**
 * Runs only on a full page load of "/" (typing the address, an old bookmark or
 * an installed app); following a link to the home page from elsewhere on the
 * site runs nothing. Crawlers carry neither a session nor an email link, so
 * they always get the page below.
 *
 * 1. An email link that landed here: Supabase falls back to the Site URL when
 *    a link's own destination isn't in its Redirect URLs list. This page has
 *    no account code, so the link's tokens (in the #fragment) are handed to
 *    the page that does: the password-reset screen for a reset link, the
 *    confirmation screen for anything else.
 * 2. Someone already signed in on this browser came for their dashboard, not
 *    the brochure.
 */
const FILM_SCHEMA = filmVideo();

const HOME_REDIRECTS = `try{var h=location.hash;if(/(^|[#&])(access_token|error_description|error_code)=/.test(h)){location.replace((/(^|[#&])type=recovery(&|$)/.test(h)?'/reset-password':'/auth/callback')+h)}else{var s=JSON.parse(localStorage.getItem('upsc-chronicle-auth')||'null');if(s&&s.user&&s.user.id)location.replace('/dashboard')}}catch(e){}`;

const FEATURE_LIST = [
  "Topic-wise UPSC syllabus tracker",
  "Daily study journal with hours per subject",
  "Spaced repetition revision tracker",
  "Mock test analytics with negative marking",
  "Mistake notebook with scheduled reviews",
  "Goals measured from your own data",
  "Weekly, monthly and yearly reviews",
  "Current affairs notes linked to the syllabus",
  "Sleep and wellbeing tracking",
  "Works offline and syncs across devices",
];

const FAQS: FaqItem[] = [
  {
    q: "What is a UPSC preparation tracker?",
    a: (
      <>
        A place to record your preparation and see what it adds up to: what you studied each day and for how long, how
        much of the syllabus you have covered, what is due for revision, and how your mock tests are going. In DoOrDie
        these live in one account and feed each other: a day&apos;s entry counts toward your streak, goals and weekly
        review, and a revision you log moves both its schedule and the topic&apos;s confidence.
      </>
    ),
  },
  {
    q: "How do I track UPSC syllabus completion?",
    a: (
      <>
        Each subject is split into topics. You mark every topic as untouched, learning, revised or mastered and can set
        your confidence in it. The{" "}
        <Link href={PAGES.syllabus.path} className="font-semibold text-accent hover:underline">
          syllabus tracker
        </Link>{" "}
        then shows how much of the syllabus is at each stage, paper by paper, and points out topics you have not touched
        for 45 days or more.
      </>
    ),
  },
  {
    q: "Can I track Prelims and Mains preparation separately?",
    a: (
      <>
        Partly. Subjects are organised by paper (GS I to IV, Essay, CSAT, your optional and current affairs), so you can
        see coverage for each one. Mocks are logged by type (Prelims GS, CSAT, Mains GS, Essay, Optional or sectional)
        and analysed separately. There is no separate Prelims mode for the syllabus, because Prelims GS draws on the same
        subjects.
      </>
    ),
  },
  {
    q: "Can I keep a daily study log?",
    a: (
      <>
        Yes. The{" "}
        <Link href={PAGES.daily.path} className="font-semibold text-accent hover:underline">
          daily journal
        </Link>{" "}
        has one entry per day: hours per subject, topics completed, revisions, books, mocks, current affairs, your mood,
        energy and focus, and the day&apos;s wins, failures and lessons. Every past day stays searchable.
      </>
    ),
  },
  {
    q: "Can I track revisions?",
    a: (
      <>
        Yes. Anything you add to the revision queue comes back at growing gaps of 1, 3, 7, 14, 30 and 60 days. Mark it
        remembered and the next gap is longer; forget it and it starts again. You can tick revisions off in the{" "}
        <Link href={PAGES.revision.path} className="font-semibold text-accent hover:underline">
          revision tracker
        </Link>{" "}
        or in the day&apos;s journal entry. Mistakes from mocks get their own review schedule too.
      </>
    ),
  },
  {
    q: "Can I see how my preparation is progressing?",
    a: (
      <>
        Yes. The dashboard and study heatmap show hours, streaks and consistency. Mock analytics show score and accuracy
        trends. Goals track themselves from your data, and weekly, monthly and yearly reviews are measured for you, so
        you only add what the numbers meant. See the{" "}
        <Link href={PAGES.progress.path} className="font-semibold text-accent hover:underline">
          progress tracker
        </Link>
        .
      </>
    ),
  },
  {
    q: "Can I use it on more than one device?",
    a: (
      <>
        Yes. Sign in on any phone, tablet or computer with a modern browser and your data follows your account. You can
        also install it as an app from the browser. It keeps working offline and syncs when you are back online.
      </>
    ),
  },
  {
    q: "Is DoOrDie free?",
    a: <>Yes. DoOrDie is free to use. There is no paid plan and there are no ads.</>,
  },
  {
    q: "Do I need to register?",
    a: (
      <>
        To keep a tracker, yes. An account keeps your data private to you and lets it sync between devices. You need an
        email address and a password. The{" "}
        <Link href={PAGES.resources.path} className="font-semibold text-accent hover:underline">
          free tools
        </Link>{" "}
        on this site work without an account.
      </>
    ),
  },
];

export default function HomePage() {
  const guides = POSTS.slice(0, 3);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HOME_REDIRECTS }} />
      <JsonLd data={softwareApplication(FEATURE_LIST)} />

      {/* ── The film: the first thing a visitor sees ─────────── */}
      <JsonLd data={FILM_SCHEMA} />
      <HomeFilm
        cta={
          <ButtonLink href="/signup" arrow size="md" track="cta_film" className="h-9 shrink-0 px-3.5 text-xs sm:h-12 sm:px-6 sm:text-[0.95rem]">
            Start tracking free
          </ButtonLink>
        }
      />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-aura opacity-80" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-60" aria-hidden />
        <Container className="relative pb-16 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>UPSC preparation tracker</Eyebrow>
            <h1
              id="hero-title"
              className="mt-4 text-balance font-display text-[2.4rem] font-bold leading-[1.06] tracking-tightest text-paper sm:text-[3.6rem]"
            >
              Your entire UPSC preparation, organised in one place.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-[1.05rem] leading-relaxed text-paper/70 sm:text-lg">
              DoOrDie is a free UPSC preparation tracker for Civil Services aspirants. Log each study day, track the
              syllabus topic by topic, keep revisions on a spaced schedule and see how your mock tests are trending, all
              in one private account.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" arrow track="cta_hero">
                Start tracking free
              </ButtonLink>
              <ButtonLink href={PAGES.features.path} variant="ghost">
                Explore features
              </ButtonLink>
            </div>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-paper/60">
              {["Free to use", "No ads", "Private to your account", "Phone and laptop"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto mt-14 max-w-5xl">
            <Screenshot {...SHOTS.dashboard} priority sizes="(min-width: 1100px) 1024px, 100vw" />
            <div className="absolute -bottom-8 -right-3 hidden w-[22%] overflow-hidden rounded-[1.6rem] border-4 border-card shadow-lift lg:block">
              <Image
                src={SHOTS.dashboardMobile.src}
                width={SHOTS.dashboardMobile.width}
                height={SHOTS.dashboardMobile.height}
                alt={SHOTS.dashboardMobile.alt}
                sizes="240px"
                className="h-auto w-full"
              />
            </div>
          </div>
          <p className="mt-12 text-center text-xs text-paper/50">{SAMPLE_NOTE}</p>
        </Container>
      </section>

      {/* ── What you can track ───────────────────────────────── */}
      <Band labelledBy="track-title">
        <Container>
          <SectionHeading
            id="track-title"
            eyebrow="What it tracks"
            title="Everything your preparation produces, connected"
            intro="Hours, topics, revisions, mocks and mistakes usually live in different notebooks. Here they feed each other: one journal entry counts toward your streak, your goals and your weekly review."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Layers} title="Syllabus tracker" href={PAGES.syllabus.path} linkLabel="Syllabus tracker">
              GS I to IV, Essay, CSAT, current affairs and your optional, split into topics. Move each one from
              untouched to mastered and see which paper is falling behind.
            </FeatureCard>
            <FeatureCard icon={NotebookPen} title="Daily study journal" href={PAGES.daily.path} linkLabel="Daily study tracker">
              Hours per subject, topics, revisions, mocks, mood and the day&apos;s lessons, logged in a few minutes. A
              heatmap and streaks show your consistency.
            </FeatureCard>
            <FeatureCard icon={Repeat} title="Spaced revision" href={PAGES.revision.path} linkLabel="Revision tracker">
              Topics come back at growing gaps of 1, 3, 7, 14, 30 and 60 days. Remember one and the gap grows; forget it
              and it starts again. Overdue items are never hidden.
            </FeatureCard>
            <FeatureCard icon={BarChart3} title="Mock analytics" href={PAGES.progress.path} linkLabel="Progress tracker">
              Score, accuracy and attempts across mocks, section by section, including the marks negative marking cost
              you each time.
            </FeatureCard>
            <FeatureCard icon={Target} title="Goals and a daily plan" href={PAGES.planner.path} linkLabel="Study planner">
              Goals that measure themselves from your data, and a suggested time-blocked day built from your weak
              subjects and revision queue.
            </FeatureCard>
            <FeatureCard icon={TriangleAlert} title="Mistake notebook" href={`${PAGES.revision.path}#mistakes`} linkLabel="How mistakes are reviewed">
              Record the question, your answer and the right one, with the type of error. Each mistake returns for review
              until you get it right three times in a row.
            </FeatureCard>
            <FeatureCard icon={Newspaper} title="Current affairs notes" href={`${PAGES.features.path}#current-affairs`} linkLabel="More about it">
              Notes on the news, tagged by category, marked for Prelims or Mains, linked to a syllabus subject and
              searchable later.
            </FeatureCard>
            <FeatureCard icon={HeartPulse} title="Sleep and wellbeing" href={`${PAGES.features.path}#wellbeing`} linkLabel="More about it">
              Sleep, exercise, screen time and deep work beside your study hours, with reports over any period you choose.
            </FeatureCard>
          </div>
        </Container>
      </Band>

      {/* ── Product walkthrough ──────────────────────────────── */}
      <Band tone="raised" labelledBy="tour-title">
        <Container>
          <SectionHeading
            id="tour-title"
            eyebrow="A closer look"
            title="What a day of tracking looks like"
            intro="Four screens you would use most days, shown with a sample account."
            center
          />
          <div className="mt-14 space-y-20">
            <TourRow
              title="Log the day in a few minutes"
              shot={SHOTS.journalEntry}
              href={PAGES.daily.path}
              link="How the daily study tracker works"
              points={[
                "Add a block for each subject with the hours you put in.",
                "Note topics completed, revisions done, books read and mocks taken.",
                "Rate mood, energy, motivation and focus, and write down the day's wins and lessons.",
                "Pick a revision from your queue here and its schedule moves on by itself.",
              ]}
            />
            <TourRow
              reverse
              title="Watch the syllabus fill in"
              shot={SHOTS.subjects}
              href={PAGES.syllabus.path}
              link="How the syllabus tracker works"
              points={[
                "Every topic is untouched, learning, revised or mastered, with a confidence score.",
                "See the weakest topics first, including ones you have got wrong in mocks.",
                "Topics left alone for 45 days or more are flagged before they go cold.",
                "Add, rename or remove topics to match how you break up the syllabus.",
              ]}
            />
            <TourRow
              title="Revision that comes back on time"
              shot={SHOTS.revision}
              href={PAGES.revision.path}
              link="How the revision tracker works"
              points={[
                "Overdue, due today and the next seven days, counted at the top.",
                "A two-week forecast shows when the queue will be heavy.",
                "Confidence for every item shows what is sticking and what isn't.",
              ]}
            />
            <TourRow
              reverse
              title="Know whether your mocks are improving"
              shot={SHOTS.mocks}
              href={PAGES.progress.path}
              link="How progress tracking works"
              points={[
                "Score and accuracy trends for Prelims GS, CSAT, Mains and sectional tests.",
                "Marks lost to negative marking, per mock and on average.",
                "Section-wise accuracy and time, so you know which subject cost the marks.",
              ]}
            />
          </div>
        </Container>
      </Band>

      {/* ── How it works ─────────────────────────────────────── */}
      <Band labelledBy="how-title">
        <Container>
          <SectionHeading
            id="how-title"
            eyebrow="How it works"
            title="From sign-up to your first weekly review"
            intro="Setting up takes a few minutes. After that, the daily habit is one journal entry."
          />
          <div className="mt-10">
            <Steps
              steps={[
                { title: "Create a free account", body: "Sign up with your name, email and a password, then confirm your email." },
                {
                  title: "Set up in a minute",
                  body: "Choose your exam year and date, your optional, a daily hours target and the habits you want to keep. The syllabus and a standard book list are filled in for you.",
                },
                { title: "Log each study day", body: "Hours per subject, what you covered, what you revised and how the day went." },
                { title: "Revise what is due", body: "The revision queue and your mistake reviews tell you what to look at today, and what is overdue." },
                { title: "Take mocks and log them", body: "Section-wise entries show where marks are won and lost, and whether it is getting better." },
                {
                  title: "Review every week",
                  body: "The week's numbers are measured for you. You add what they meant and what changes next week.",
                },
              ]}
            />
          </div>
        </Container>
      </Band>

      {/* ── Why a dedicated tracker ──────────────────────────── */}
      <Band tone="raised" labelledBy="why-title">
        <Container>
          <SectionHeading
            id="why-title"
            eyebrow="Why a dedicated tracker"
            title="Notebooks and spreadsheets work, until the preparation gets long"
            intro="Most aspirants start with a notebook or a spreadsheet, and both are fine for a few weeks. Over a year or more, the gaps start to show."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <Compare
              title="A notebook"
              good={["Nothing to set up", "No screen while you plan"]}
              bad={["No totals unless you add them up", "Hard to search months later", "Revision dates are yours to remember"]}
            />
            <Compare
              title="A spreadsheet"
              good={["Totals and charts, if you build them", "Flexible columns"]}
              bad={["You build and fix it yourself", "Nothing reminds you what is due", "Awkward to fill in on a phone"]}
            />
            <Compare
              highlight
              title="A dedicated tracker"
              good={[
                "One entry counts toward hours, streaks, goals and reviews",
                "Reminds you what is due and what has gone cold",
                "Built for a phone as much as a laptop",
                "Export everything to a file at any time",
              ]}
              bad={["Takes a minute a day to keep up"]}
            />
          </div>
        </Container>
      </Band>

      {/* ── Trust ────────────────────────────────────────────── */}
      <Band labelledBy="trust-title">
        <Container>
          <SectionHeading
            id="trust-title"
            eyebrow="Your data"
            title="Built for a long and private preparation"
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Lock} title="Private to your account">
              Each account&apos;s data is kept separate by the database itself, not only by the app. Other users can
              never read your journal.
            </FeatureCard>
            <FeatureCard icon={Download} title="Export or delete any time">
              Download all of your data as a file from Settings. Delete your account and everything in it whenever you
              choose.
            </FeatureCard>
            <FeatureCard icon={Smartphone} title="Works on any device">
              Use it in the browser on a phone or laptop, or install it as an app. It works offline and syncs when you
              reconnect.
              <InstallAppInline />
            </FeatureCard>
            <FeatureCard icon={Layers} title="Independent">
              DoOrDie is a preparation tool, not affiliated with or endorsed by UPSC.{" "}
              <Link href={PAGES.disclaimer.path} className="font-semibold text-accent hover:underline">
                Read the disclaimer
              </Link>
              .
            </FeatureCard>
          </div>
        </Container>
      </Band>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <Band tone="raised" labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Frequently asked questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
        </Container>
      </Band>

      {/* ── Guides and tools ─────────────────────────────────── */}
      <Band labelledBy="guides-title">
        <Container>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <SectionHeading
              id="guides-title"
              eyebrow="Guides and free tools"
              title="Practical help for running your preparation"
            />
            <Link href={PAGES.blog.path} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              All guides <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {guides.map((p) => (
              <li key={p.slug}>
                <Link
                  href={postPath(p.slug)}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35"
                >
                  <span className="eyebrow">{p.topic}</span>
                  <span className="mt-2 font-display text-lg font-bold leading-snug tracking-snugg text-paper group-hover:text-accent">
                    {p.title}
                  </span>
                  <span className="mt-2 flex-1 text-sm leading-relaxed text-paper/60">{p.excerpt}</span>
                  <span className="mt-4 text-xs text-paper/50">{p.readingMinutes} min read</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {RESOURCE_PAGES.map((r) => (
              <Link
                key={r.path}
                href={r.path}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper/[0.03] px-5 py-4 text-sm font-semibold text-paper transition-colors hover:border-accent/35 hover:text-accent"
              >
                {r.label}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            ))}
          </div>
        </Container>
      </Band>

      <CtaBanner />
    </>
  );
}

function TourRow({
  title,
  points,
  shot,
  href,
  link,
  reverse = false,
}: {
  title: string;
  points: string[];
  shot: (typeof SHOTS)[keyof typeof SHOTS];
  href: string;
  link: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={
        reverse
          ? "grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14"
          : "grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14"
      }
    >
      <div className={reverse ? "lg:order-2" : undefined}>
        <h3 className="font-display text-2xl font-bold tracking-tightest text-paper">{title}</h3>
        <CheckList className="mt-5" items={points} />
        <Link href={href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          {link} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <Screenshot {...shot} sizes="(min-width: 1024px) 640px, 100vw" className={reverse ? "lg:order-1" : undefined} />
    </div>
  );
}

function Compare({
  title,
  good,
  bad,
  highlight = false,
}: {
  title: string;
  good: string[];
  bad: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-2xl border border-accent/40 bg-card p-6 shadow-lift ring-1 ring-accent/20"
          : "rounded-2xl border border-line bg-card p-6 shadow-soft"
      }
    >
      <h3 className="text-lg font-bold tracking-snugg text-paper">{title}</h3>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-positive">Works well</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-paper/70">
        {good.map((g) => (
          <li key={g}>+ {g}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-paper/55">Gets in the way</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-paper/70">
        {bad.map((b) => (
          <li key={b}>− {b}</li>
        ))}
      </ul>
    </div>
  );
}
