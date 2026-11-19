import Link from "next/link";
import { CalendarClock, ChartColumn, ListFilter, NotebookPen, Repeat, Send } from "lucide-react";
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
import { Prose, TableWrap } from "@/components/marketing/prose";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";
import { postPath } from "@/content/blog";
import { TestimonialStrip } from "@/components/marketing/testimonials";

const page = PAGES.revision;
export const metadata = pageMetadata(page);

/** Mirrors SR_INTERVALS and nextSchedule() in lib/revision.ts. */
const SCHEDULE: [string, string][] = [
  ["Just added to the queue", "The same day"],
  ["Forgotten at the last revision", "1 day later"],
  ["Remembered once in a row", "3 days later"],
  ["Remembered twice in a row", "7 days later"],
  ["Three times in a row", "14 days later"],
  ["Four times in a row", "30 days later"],
  ["Five or more times in a row", "60 days later"],
];

const FAQS: FaqItem[] = [
  {
    q: "What is spaced repetition?",
    a: (
      <>
        Revising something at increasing intervals: soon after you first learn it, then less and less often as it sticks.
        Each revision comes just as you are starting to forget, which makes the memory last longer than rereading it
        several times in one sitting.
      </>
    ),
  },
  {
    q: "Why these intervals?",
    a: (
      <>
        A ladder of 1, 3, 7, 14, 30 and 60 days is simple and widely used: dense at first, when forgetting is fastest,
        then spreading out. It is not the only good schedule. What matters most is that revisions keep happening and that
        forgetting sends an item back to the start.
      </>
    ),
  },
  {
    q: "What happens if I miss a revision day?",
    a: (
      <>
        Nothing is lost. Missed items stay in the queue as overdue, counted at the top, until you revise them. When you
        do, the next date is counted from that day, so a late revision does not drag a backlog behind it.
      </>
    ),
  },
  {
    q: "How many revisions should I do a day?",
    a: (
      <>
        As many as the queue holds, ideally before new topics. The two-week forecast shows when the queue will be heavy,
        so you can plan lighter new reading on those days. If the queue keeps growing, add new items more slowly.
      </>
    ),
  },
  {
    q: "Can I revise current affairs and my optional this way?",
    a: (
      <>
        Yes. A revision item is a subject and a topic in your own words, so anything from your optional to a set of
        current affairs notes can go on the queue.
      </>
    ),
  },
];

export default function RevisionTrackerPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Free UPSC revision tracker"
        title="A free UPSC revision tracker built on spaced repetition"
        intro={
          <p>
            Reading a topic once is the easy part. Keeping it until the exam means revising it at the right intervals,
            across hundreds of topics, for a year or more. DoOrDie schedules every revision, tells you what is due today
            and counts what is overdue instead of hiding it.
          </p>
        }
        cta="cta_revision"
        shot={SHOTS.revision}
        shotCaption={SAMPLE_NOTE}
      />

      <Band labelledBy="schedule-title">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <SectionHeading
                id="schedule-title"
                eyebrow="The schedule"
                title="Six steps, from tomorrow to two months out"
                intro="A topic you add is due the same day. Each time you revise it, you say whether it came back."
              />
              <CheckList
                className="mt-6"
                items={[
                  "Remembered: the gap to the next revision grows to the next step, from 3 days up to 60.",
                  "Forgot: it drops to the first step and comes back tomorrow, then climbs again.",
                  "The next date is counted from the day you actually revise, so a late revision brings no backlog with it.",
                  "Each item also carries a confidence score from 1 to 5 that rises and falls with your recalls.",
                ]}
              />
            </div>
            <Prose>
              <TableWrap>
                <table>
                  <caption className="sr-only">When an item comes back for revision</caption>
                  <thead>
                    <tr>
                      <th scope="col">Where the item stands</th>
                      <th scope="col">Next revision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE.map(([state, next]) => (
                      <tr key={state}>
                        <td>{state}</td>
                        <td>{next}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <p className="text-sm">
                Want the dates for a topic without signing up? Use the free{" "}
                <Link href={PAGES.revisionCalculator.path}>spaced revision calculator</Link>.
              </p>
            </Prose>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="ways-title">
        <Container>
          <SectionHeading
            id="ways-title"
            eyebrow="Revising"
            title="Three ways in, one schedule"
            intro="However you revise, the schedule, the item's confidence and the topic in your syllabus tracker all move together."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <FeatureCard icon={Repeat} title="From the queue">
              Work through what is overdue and due today, marking each item remembered or forgotten.
            </FeatureCard>
            <FeatureCard icon={NotebookPen} title="From the day's journal">
              Pick items from the queue while logging the day. Saving the entry moves their schedule on.
            </FeatureCard>
            <FeatureCard icon={Send} title="From the syllabus">
              Send any shaky topic from the syllabus tracker to the queue in one click.
            </FeatureCard>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <FeatureCard icon={CalendarClock} title="Due, overdue, upcoming">
              Counts for overdue, due today and the next seven days, and the oldest overdue item.
            </FeatureCard>
            <FeatureCard icon={ChartColumn} title="Two weeks ahead">
              A forecast of items falling due over the next fortnight, so heavy days are no surprise.
            </FeatureCard>
            <FeatureCard icon={ListFilter} title="Find what is shaky">
              Search and filter by subject, or show only overdue or low-confidence items.
            </FeatureCard>
          </div>
        </Container>
      </Band>

      <Band labelledBy="mistakes">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading
                id="mistakes"
                eyebrow="Mistake notebook"
                title="Mistakes come back until they stop happening"
                intro="Every wrong answer in a mock is a topic you thought you knew. The mistake tracker keeps it, schedules it and shows the patterns."
              />
              <CheckList
                className="mt-6"
                items={[
                  "Record the question, your answer, the correct answer, an explanation and the source.",
                  "Give it one of six error types: conceptual, factual, guessing, revision failure, time pressure or careless.",
                  "It is due the day you log it, then comes back at growing gaps while you keep getting it right. Get it wrong and it is back tomorrow.",
                  "Three correct reviews in a row and it is marked mastered.",
                  "Recurring mistakes are grouped by topic, and a grid shows which error types hit which subjects.",
                ]}
              />
            </div>
            <Screenshot {...SHOTS.mistakes} sizes="(min-width: 1024px) 600px, 100vw" caption={SAMPLE_NOTE} />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="why-title">
        <Container className="max-w-3xl">
          <SectionHeading id="why-title" eyebrow="Why it works" title="Why spaced revision beats rereading" />
          <Prose className="mt-6">
            <p>
              The idea that spacing out study helps memory is one of the most replicated findings in learning research. A
              large review of distributed practice by{" "}
              <a href="https://doi.org/10.1037/0033-2909.132.3.354" rel="noopener">
                Cepeda and colleagues (2006)
              </a>{" "}
              found that spreading the same study time across sessions gave better long-term recall than massing it
              together.
            </p>
            <p>
              Revision also works better when it makes you recall rather than reread. In a well-known experiment,{" "}
              <a href="https://doi.org/10.1111/j.1467-9280.2006.01693.x" rel="noopener">
                Roediger and Karpicke (2006)
              </a>{" "}
              found that students who tested themselves remembered more a week later than those who restudied the same
              material. That is why each revision here asks one question: did it come back?
            </p>
            <p>
              Neither finding needs special software, but both need bookkeeping, and that is where a tracker earns its
              place. Across a whole syllabus, nobody can hold hundreds of due dates in their head. For a fuller method,
              read our guide to a{" "}
              <Link href={postPath("upsc-revision-schedule-spaced-repetition")}>spaced repetition revision schedule for UPSC</Link>.
            </p>
          </Prose>
          <div className="mt-10">
            <Limits
              items={[
                "It does not make flashcards or quiz you. You revise from your own notes and say whether it came back.",
                "The intervals are fixed. You cannot change them yet.",
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Revision tracker questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: PAGES.revisionCalculator.path, label: "Spaced revision calculator", description: "Revision dates for any topic, ready for your calendar." },
              { href: postPath("upsc-revision-schedule-spaced-repetition"), label: "A revision schedule for UPSC", description: "How to run spaced repetition across the whole syllabus." },
              { href: postPath("how-to-analyse-upsc-mock-test"), label: "How to analyse a mock test", description: "Turning wrong answers into a mistake notebook." },
              { href: PAGES.syllabus.path, label: "UPSC syllabus tracker", description: "Where revised topics gain confidence." },
            ]}
          />
        </Container>
      </Band>

      <TestimonialStrip placement="feature" feature="revision" />

      <CtaBanner track="cta_revision_footer" />
    </>
  );
}
