import Link from "next/link";
import { BellRing, BookOpen, Clock3, Flame, ListChecks, Search, Smile, Sunrise } from "lucide-react";
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
  Steps,
  type FaqItem,
} from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";
import { postPath } from "@/content/blog";

const page = PAGES.daily;
export const metadata = pageMetadata(page);

const FAQS: FaqItem[] = [
  {
    q: "Does it have a study timer?",
    a: (
      <>
        No. You enter the hours for each subject yourself, usually at the end of the day, to the nearest half hour. A
        timer measures time at the desk; writing the hours down yourself asks you how much of it was really studied.
      </>
    ),
  },
  {
    q: "What should count as a study hour?",
    a: (
      <>
        Time spent actually studying: reading with notes, revising, answer writing, solving questions. Breaks and
        planning do not count. Whatever rule you choose, keep it the same every day, so your weekly totals can be
        compared fairly. Our guide on{" "}
        <Link href={postPath("how-many-hours-to-study-for-upsc")} className="font-semibold text-accent hover:underline">
          how many hours to study for UPSC
        </Link>{" "}
        goes into this.
      </>
    ),
  },
  {
    q: "Can I log a day I missed?",
    a: <>Yes. Every entry has a date, so you can add or edit any past day. One entry is kept per date.</>,
  },
  {
    q: "How is the streak counted?",
    a: (
      <>
        The streak counts consecutive days with study hours logged. Today only breaks it if it ends with nothing logged,
        so the morning check-in never resets it. You can also mark a day as accomplished when it went the way you wanted.
      </>
    ),
  },
  {
    q: "Can I track habits as well as hours?",
    a: (
      <>
        Yes. Pick habits during setup, such as reading the newspaper, answer writing or revising old notes, add your own,
        and tick them off each day. Each habit shows its streak and how often you have kept it.
      </>
    ),
  },
];

export default function DailyStudyTrackerPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="UPSC daily study tracker"
        title="A daily study tracker for UPSC that takes a few minutes a day"
        intro={
          <p>
            Most of what decides an attempt happens on ordinary days. DoOrDie gives each day one entry: the hours you
            put into each subject, what you covered and revised, and how the day went. Over weeks, those entries become
            a record you can learn from instead of a feeling you have to trust.
          </p>
        }
        cta="cta_daily"
        shot={SHOTS.journal}
        shotCaption={SAMPLE_NOTE}
      />

      <Band labelledBy="log-title">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading
                id="log-title"
                eyebrow="What you log"
                title="One entry per day, as detailed as you want"
                intro="Only the study blocks are needed. Everything else is there for the days you want a fuller record."
              />
              <CheckList
                className="mt-6"
                items={[
                  <>
                    <strong className="text-paper">Study blocks:</strong> a subject and the hours you spent on it. The
                    day&apos;s total adds itself up.
                  </>,
                  <>
                    <strong className="text-paper">What you covered:</strong> topics completed, books and pages read,
                    current affairs and any mock you took.
                  </>,
                  <>
                    <strong className="text-paper">Revisions:</strong> pick items from your revision queue and their
                    schedule moves on when you save.
                  </>,
                  <>
                    <strong className="text-paper">State of mind:</strong> mood, energy, motivation and focus, each on a
                    five-point scale.
                  </>,
                  <>
                    <strong className="text-paper">Reflection:</strong> the day&apos;s wins, failures and lessons, a
                    one-line highlight and a longer note.
                  </>,
                  <>
                    <strong className="text-paper">Daily rhythm:</strong> wake-up and bedtime, filled in from a short
                    check-in when you open the app each morning.
                  </>,
                ]}
              />
            </div>
            <Screenshot {...SHOTS.journalEntry} sizes="(min-width: 1024px) 600px, 100vw" />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="consistency-title">
        <Container>
          <SectionHeading
            id="consistency-title"
            eyebrow="Consistency"
            title="See every study day at once"
            intro="A heatmap shades each day by the hours you studied, so a slipping week shows up long before it becomes a slipping month."
          />
          <Screenshot {...SHOTS.heatmap} className="mt-10" caption={SAMPLE_NOTE} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Flame} title="Streaks">
              Your current and longest run of study days, and accomplished days you mark yourself.
            </FeatureCard>
            <FeatureCard icon={Clock3} title="Totals that add up">
              Total hours, active days, average hours per active day and your best day, worked out for you.
            </FeatureCard>
            <FeatureCard icon={ListChecks} title="Habits">
              Daily disciplines such as the newspaper or answer writing, each with its own streak.
            </FeatureCard>
            <FeatureCard icon={Search} title="Every day searchable">
              Search past entries by topic, book, win or reflection, or filter them, and open any day again.
            </FeatureCard>
          </div>
        </Container>
      </Band>

      <Band labelledBy="reminders-title">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={BellRing} title="Gentle reminders">
              Choose whether to be reminded when today is not logged after a set hour, or when a streak is about to end.
              Quiet hours are respected.
            </FeatureCard>
            <FeatureCard icon={Sunrise} title="Morning check-in">
              One question when you open the app: when did you sleep and wake? It fills in the day&apos;s rhythm.
            </FeatureCard>
            <FeatureCard icon={Smile} title="How the day felt">
              Mood and focus next to hours show whether long days are good days, or just long.
            </FeatureCard>
            <FeatureCard icon={BookOpen} title="Analysis view">
              Switch the journal to Analysis to see what the days add up to over a week, a month or longer.
            </FeatureCard>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="use-title">
        <Container>
          <SectionHeading id="use-title" eyebrow="How to use it" title="A routine that survives a long preparation" />
          <div className="mt-10">
            <Steps
              steps={[
                { title: "Log at the end of the day", body: "Five minutes before you stop. Hours by subject first; the rest only if you have something to say." },
                { title: "Count focused time only", body: "Round to the half hour and leave out breaks. The same rule every day makes weeks comparable." },
                { title: "Write one honest line", body: "The highlight is the line you will reread in three months. Make it specific." },
                { title: "Note a lesson when there is one", body: "Wins, failures and lessons turn bad days into something useful." },
                { title: "Look at the week, not the day", body: "Every Sunday, check the heatmap and the weekly total, not whether one day was perfect." },
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band labelledBy="why-title">
        <Container className="max-w-3xl">
          <SectionHeading id="why-title" eyebrow="Why it matters" title="Why keep a daily study log" />
          <Prose className="mt-6">
            <p>
              Memory is a poor judge of effort. A week can feel like a heavy one and turn out to be thirty hours, or feel
              lost and still add up to forty. A daily log replaces the impression with the number, and the number is what
              you can plan around.
            </p>
            <p>
              Patterns appear quickly once the days are written down: which weekday always slips, which subject gets
              pushed to the end of the queue, whether late nights cost you the next morning. You cannot fix a pattern you
              cannot see.
            </p>
            <p>
              And a visible run of study days is motivating in a quiet way. The goal is not a perfect streak but a long,
              steady one. Our guide on{" "}
              <Link href={postPath("consistency-in-upsc-preparation")}>staying consistent in UPSC preparation</Link>{" "}
              covers how to keep it going through bad weeks.
            </p>
          </Prose>
          <div className="mt-10">
            <Limits
              items={[
                "There is no built-in study timer. You enter hours yourself.",
                "Photos and file attachments cannot be added to entries.",
                "It does not track or block other apps. If you want, you can log screen time yourself in the life dashboard.",
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Daily study tracker questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: postPath("how-many-hours-to-study-for-upsc"), label: "How many hours to study for UPSC", description: "Choosing a daily target you can keep for a year." },
              { href: postPath("consistency-in-upsc-preparation"), label: "Staying consistent", description: "A minimum day, forgiving streaks and early warning signs." },
              { href: PAGES.syllabus.path, label: "UPSC syllabus tracker", description: "Topic-wise progress across every paper." },
              { href: PAGES.progress.path, label: "UPSC progress tracker", description: "What the days add up to: hours, coverage and mocks." },
            ]}
          />
        </Container>
      </Band>

      <CtaBanner track="cta_daily_footer" />
    </>
  );
}
