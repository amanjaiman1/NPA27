import Link from "next/link";
import { CalendarCheck, Gauge, HeartPulse, LayoutDashboard, ListChecks, Target } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import {
  Band,
  CheckList,
  Container,
  CtaBanner,
  Faq,
  FeatureCard,
  Limits,
  RelatedLinks,
  Screenshot,
  SectionHeading,
  type FaqItem,
} from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";
import { postPath } from "@/content/blog";

const page = PAGES.progress;
export const metadata = pageMetadata(page);

const FAQS: FaqItem[] = [
  {
    q: "Can I track my mock test scores?",
    a: (
      <>
        Yes. Log each mock with its type (Prelims GS, CSAT, Mains GS, Essay, Optional or a sectional test) and, if you
        want the full analysis, its sections: questions, attempts, correct answers and time. Scores, accuracy and
        attempts are then charted across mocks for each type.
      </>
    ),
  },
  {
    q: "Does it work out negative marking?",
    a: (
      <>
        Yes. For Prelims-style sections it scores 2 marks per correct answer and deducts 0.66 per wrong one in GS, and
        2.5 and 0.83 in CSAT, in line with UPSC&apos;s one-third penalty for a wrong answer. You see the marks lost to
        negative marking for each mock and on average.
      </>
    ),
  },
  {
    q: "Can I compare myself with other aspirants?",
    a: (
      <>
        No. Your data is private to your account and there are no leaderboards. Progress is measured against your own
        earlier weeks and the targets you set.
      </>
    ),
  },
  {
    q: "What goes into a weekly review?",
    a: (
      <>
        The measurable part is gathered for you: hours and active days, topics finished, revision, habits kept,
        goals, the plan, mocks and sleep, each compared with the week before. You answer six short questions: what
        went well, what was hard, which subject needs attention, what is unfinished, what to change and what comes
        next. Monthly reviews, and reviews of any dates you choose, work the same way.
      </>
    ),
  },
  {
    q: "Does it predict my rank or the cut-off?",
    a: (
      <>
        No. Rank and cut-offs depend on the whole field of candidates and on UPSC&apos;s decisions each year, which no
        personal tracker can know. DoOrDie shows your own trends so you can act on them.
      </>
    ),
  },
];

export default function ProgressTrackerPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Free UPSC progress tracker"
        title="A free UPSC progress tracker with numbers you can act on"
        intro={
          <p>
            Progress is hard to feel from the inside. Some weeks feel productive and are not; some feel stuck and turn
            out to be the ones that count. DoOrDie puts the measurable parts side by side (hours and consistency,
            syllabus coverage, revision and mock tests) so you can see which way things are actually moving.
          </p>
        }
        cta="cta_progress"
        shot={SHOTS.dashboard}
        shotCaption={SAMPLE_NOTE}
      />

      <Band labelledBy="dash-title">
        <Container>
          <SectionHeading
            id="dash-title"
            eyebrow="At a glance"
            title="One dashboard for the whole preparation"
            intro="Open the app and the state of things is the first screen you see."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={LayoutDashboard} title="The headline numbers">
              Days to the exam, your current streak, total hours, days studied and average mood.
            </FeatureCard>
            <FeatureCard icon={Gauge} title="Today and this week">
              Today&apos;s hours by subject, this week&apos;s totals, revisions due and how your recent mocks are trending.
            </FeatureCard>
            <FeatureCard icon={Target} title="Goals in progress">
              Each active goal with its progress and whether it is on pace for its deadline.
            </FeatureCard>
            <FeatureCard icon={CalendarCheck} title="Reviews, mostly written">
              Weekly, monthly and custom-period reviews arrive already measured from your journal, revision, habits,
              goals and mocks.
            </FeatureCard>
            <FeatureCard icon={HeartPulse} title="Life dashboard">
              Sleep, exercise, water, screen time and deep work next to your study hours, with reports over any period
              you choose.
            </FeatureCard>
            <FeatureCard icon={ListChecks} title="Today's habits">
              The habits due today, how far each has got and where the figure came from: your journal, sleep, revision
              or a tick.
            </FeatureCard>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="mocks">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading
                id="mocks"
                eyebrow="UPSC mock test tracker"
                title="Mock analytics that explain the score"
                intro="The score is the least useful number on a mock. These are the ones that tell you what to fix."
              />
              <CheckList
                className="mt-6"
                items={[
                  "Latest, average and best scores, accuracy on attempted questions and a projection from recent form.",
                  "Marks lost to negative marking, per mock and on average.",
                  "Section-wise accuracy and time, so you know which subject cost the marks and which one carried you.",
                  "A score chart with a moving average, separate for Prelims GS, CSAT, Mains and sectional tests.",
                  "A plain explanation of what moved the score since last time, and recommendations on what to work on.",
                ]}
              />
              <p className="mt-6 text-sm text-paper/65">
                New to reviewing mocks? Our step-by-step guide to{" "}
                <Link href={postPath("how-to-analyse-upsc-mock-test")} className="font-semibold text-accent hover:underline">
                  analysing a UPSC mock test
                </Link>{" "}
                shows what to look at and in what order.
              </p>
            </div>
            <Screenshot {...SHOTS.mocks} sizes="(min-width: 1024px) 600px, 100vw" caption={SAMPLE_NOTE} />
          </div>
        </Container>
      </Band>

      <Band labelledBy="reviews-title">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
            <Screenshot {...SHOTS.reviews} sizes="(min-width: 1024px) 600px, 100vw" caption={SAMPLE_NOTE} />
            <div>
              <SectionHeading
                id="reviews-title"
                eyebrow="Reviews"
                title="Weekly reviews without the arithmetic"
                intro="A review whose first job is adding up hours is one nobody writes. So the numbers are done for you."
              />
              <CheckList
                className="mt-6"
                items={[
                  "Hours, topics, revision, habits and mocks for the week, the month or any dates you choose, compared with the period before.",
                  "Hours split by subject, so a neglected paper is obvious.",
                  "You answer six short questions, and the review is kept as a record of that period.",
                  "A reminder when a week or month ends without a review, if you want one.",
                ]}
              />
            </div>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="why-title">
        <Container className="max-w-3xl">
          <SectionHeading id="why-title" eyebrow="Why it matters" title="What to measure, and what to ignore" />
          <Prose className="mt-6">
            <p>
              Mock scores are an outcome. They move slowly, and a single bad paper says little. Hours, consistency,
              syllabus coverage and revision are inputs: they move every day, and they are the part you control. A useful
              progress tracker shows both, so a disappointing mock can be traced back to a cause, such as too little
              revision of a subject or a week of short days.
            </p>
            <p>
              The other trap is measuring too much. Totals for their own sake are vanity numbers. Each figure here is
              there because it answers a planning question: what to study next, what to revise, what to change before the
              next mock. Our guide to{" "}
              <Link href={postPath("how-to-track-upsc-preparation")}>tracking your UPSC preparation</Link> sets out a
              simple routine for using them.
            </p>
          </Prose>
          <div className="mt-10">
            <Limits
              items={[
                "Scores are what you enter. Results are not imported from test series.",
                "It does not predict your rank, your marks or the cut-off.",
                "Mains answers are not evaluated. You log the marks your evaluator gives.",
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Progress tracker questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: postPath("how-to-analyse-upsc-mock-test"), label: "How to analyse a UPSC mock test", description: "Accuracy, attempts, negative marking and error types." },
              { href: PAGES.planner.path, label: "UPSC study planner", description: "Goals that measure themselves and a suggested day." },
              { href: PAGES.daily.path, label: "Daily study tracker", description: "The daily log every number here is built from." },
              { href: PAGES.revision.path, label: "UPSC revision tracker", description: "Spaced repetition and the mistake notebook." },
            ]}
          />
        </Container>
      </Band>

      <CtaBanner track="cta_progress_footer" />
    </>
  );
}
