import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, Faq, RelatedLinks, SectionHeading, type FaqItem } from "@/components/marketing/ui";
import { Prose, TableWrap } from "@/components/marketing/prose";
import { RevisionCalculator } from "@/components/marketing/tools/revision-calculator";
import { SR_INTERVALS as GAPS } from "@/lib/revision";
import { postPath } from "@/content/blog";

const page = PAGES.revisionCalculator;
export const metadata = pageMetadata(page);

/** A fixed worked example, so the method is readable without running the calculator. */
const EXAMPLE_START = "2026-12-01";
function exampleDates(): { gap: number; date: string; day: number }[] {
  let at = new Date(`${EXAMPLE_START}T00:00:00Z`);
  let day = 0;
  return GAPS.map((gap) => {
    at = new Date(at.getTime() + gap * 86_400_000);
    day += gap;
    return {
      gap,
      day,
      date: new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(at),
    };
  });
}

const FAQS: FaqItem[] = [
  {
    q: "Why do the gaps get longer?",
    a: (
      <>
        Forgetting is fastest just after you learn something and slows down with each successful recall. Short gaps
        early catch the topic before it fades; longer gaps later keep it without wasting time on what you already know.
      </>
    ),
  },
  {
    q: "What if I can't recall the topic at a revision?",
    a: (
      <>
        Reread it properly, then start the schedule again with that day as the study date. A missed recall is useful
        information: the topic needed more work than one reading gave it.
      </>
    ),
  },
  {
    q: "What if I miss a revision date?",
    a: (
      <>
        Revise it as soon as you can and count the next gap from the day you actually revised. Pushing every later date
        back is better than cramming two revisions together.
      </>
    ),
  },
  {
    q: "How long should a revision take?",
    a: (
      <>
        Much less than the first study. Try to recall the main points from memory first, then check your notes and fix
        what you missed. For most topics that is ten to thirty minutes.
      </>
    ),
  },
  {
    q: "Do I have to do this by hand for every topic?",
    a: (
      <>
        For a few topics, the calendar file works well. For a whole syllabus, a tracker is easier: the{" "}
        <Link href={PAGES.revision.path} className="font-semibold text-accent hover:underline">
          DoOrDie revision tracker
        </Link>{" "}
        uses the same ladder of gaps for every topic and adjusts it each time you say whether a topic came back.
      </>
    ),
  },
];

export default function RevisionCalculatorPage() {
  const example = exampleDates();
  return (
    <>
      <PageHero
        crumbs={[
          { name: PAGES.resources.label, path: PAGES.resources.path },
          { name: page.label, path: page.path },
        ]}
        eyebrow="Free tool"
        title="Spaced repetition revision calculator"
        intro={
          <p>
            Enter the day you studied a topic and get six revision dates, each gap longer than the last: 1, 3, 7, 14, 30
            and 60 days. Add them to your calendar in one click. It runs in your browser, with no sign-up, and nothing is
            stored.
          </p>
        }
      />

      <Band className="pt-0 sm:pt-0">
        <Container>
          <RevisionCalculator />
        </Container>
      </Band>

      <Band tone="raised" labelledBy="how-title">
        <Container className="max-w-3xl">
          <SectionHeading id="how-title" eyebrow="The method" title="How the schedule works" />
          <Prose className="mt-6">
            <p>
              The first revision comes the day after you study the topic. Each one after that waits longer than the one
              before: 3 days, then 7, 14, 30 and finally 60. Every gap is counted from the previous revision, so the
              whole ladder spans about four months. If you study a topic on 1 December 2026, the dates are:
            </p>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Revision</th>
                    <th scope="col">Gap</th>
                    <th scope="col">Date</th>
                    <th scope="col">Days after studying</th>
                  </tr>
                </thead>
                <tbody>
                  {example.map((r, i) => (
                    <tr key={r.day}>
                      <td>{i + 1}</td>
                      <td>
                        {r.gap} {r.gap === 1 ? "day" : "days"}
                      </td>
                      <td>{r.date}</td>
                      <td>{r.day}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p>
              The ladder rests on two well-supported findings from learning research: spacing study out beats massing it
              together, and trying to recall something strengthens memory more than rereading it. Each revision should
              start with recall, from memory, before you open your notes.
            </p>
            <p>
              The schedule assumes the topic came back each time. If it did not, the right move is to restart, not to
              continue up the ladder. Our guide to a{" "}
              <Link href={postPath("upsc-revision-schedule-spaced-repetition")}>spaced repetition revision schedule for UPSC</Link>{" "}
              covers how to run this across a whole syllabus without the queue burying you.
            </p>
          </Prose>
        </Container>
      </Band>

      <Band labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Revision calculator questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: PAGES.revision.path, label: "UPSC revision tracker", description: "The same ladder, run for every topic automatically." },
              { href: postPath("upsc-revision-schedule-spaced-repetition"), label: "A revision schedule for UPSC", description: "Running spaced repetition across the syllabus." },
              { href: PAGES.weeklyReview.path, label: "Weekly review template", description: "Check each Sunday whether revision kept up." },
              { href: PAGES.countdown.path, label: "Prelims 2027 countdown", description: "How many revision cycles fit before the exam." },
            ]}
          />
        </Container>
      </Band>

      <CtaBanner
        title="Let the schedule run itself"
        body="DoOrDie keeps a revision queue for every topic, brings each one back on time, and restarts it when you forget. Free, private to your account."
        track="cta_revision_calculator"
      />
    </>
  );
}
