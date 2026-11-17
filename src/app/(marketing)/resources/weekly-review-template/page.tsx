import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, Faq, RelatedLinks, SectionHeading, Steps, type FaqItem } from "@/components/marketing/ui";
import { PrintButton } from "@/components/marketing/tools/print-button";
import { postPath } from "@/content/blog";
import { cn } from "@/lib/utils";

const page = PAGES.weeklyReview;
export const metadata = pageMetadata(page);

const ERROR_TYPES = ["Conceptual", "Factual", "Guessing", "Revision failure", "Time pressure", "Careless"];

const FAQS: FaqItem[] = [
  {
    q: "When should I do the weekly review?",
    a: (
      <>
        At the same time every week, after the week&apos;s last study session and before you plan the next one. Sunday
        evening works for most people. The habit matters more than the day.
      </>
    ),
  },
  {
    q: "How long should it take?",
    a: (
      <>
        About twenty minutes. If it takes much longer, you are probably redoing arithmetic that a daily log would have
        done for you, or rewriting notes. Keep it to the numbers, three wins, three struggles and next week&apos;s focus.
      </>
    ),
  },
  {
    q: "What if the week went badly?",
    a: (
      <>
        Then the review matters most. Write down what actually happened, without judging it, and pick one small change
        for next week. A bad week you have reviewed is more useful than a good week you have not.
      </>
    ),
  },
  {
    q: "Can I fill it in digitally instead?",
    a: (
      <>
        Yes. In DoOrDie the weekly review is measured for you from your journal and mocks: hours, active days, mocks,
        consistency and hours by subject. You only write the wins, struggles, lessons and next focus. See the{" "}
        <Link href={`${PAGES.progress.path}#reviews-title`} className="font-semibold text-accent hover:underline">
          reviews feature
        </Link>
        .
      </>
    ),
  },
];

function Lines({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-8 border-b border-dashed border-paper/25" />
      ))}
    </div>
  );
}

function Box({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("break-inside-avoid rounded-2xl border border-line p-4", className)}>
      <h3 className="text-sm font-bold uppercase tracking-wider text-paper/75">{title}</h3>
      <div className="mt-3 text-sm text-paper/75">{children}</div>
    </section>
  );
}

function Blank({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <span className="inline-flex items-end gap-2">
      <span>{label}</span>
      <span className={cn("inline-block border-b border-paper/35", wide ? "w-32" : "w-16")} />
    </span>
  );
}

export default function WeeklyReviewTemplatePage() {
  return (
    <>
      <div className="print:hidden">
        <PageHero
          crumbs={[
            { name: PAGES.resources.label, path: PAGES.resources.path },
            { name: page.label, path: page.path },
          ]}
          eyebrow="Free template"
          title="UPSC weekly review template"
          intro={
            <p>
              A one-page weekly review for UPSC preparation: the numbers that show how the week went, the patterns behind
              them, and the one or two changes for next week. Print it, save it as a PDF, or copy the structure into your
              own notebook.
            </p>
          }
        />
      </div>

      <Band className="pt-0 sm:pt-0 print:py-0">
        <Container className="max-w-4xl">
          <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center print:hidden">
            <p className="text-sm text-paper/65">One page. Fill it in by hand, at the same time each week.</p>
            <PrintButton tool="weekly_review_template" />
          </div>

          <article
            aria-label="Weekly review template"
            className="rounded-3xl border border-line bg-card p-6 shadow-lift sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
          >
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
              <h2 className="font-display text-2xl font-bold tracking-tightest text-paper">Weekly review</h2>
              <p className="text-sm text-paper/75">
                <Blank label="Week from" wide /> <Blank label="to" wide />
              </p>
            </header>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
              <Box title="Hours">
                <p className="space-x-4">
                  <Blank label="Total" /> <Blank label="Target" />
                </p>
                <p className="mt-3">
                  <Blank label="Days studied (of 7)" />
                </p>
              </Box>
              <Box title="How the week felt">
                <p>Rate the week (circle one): 1 · 2 · 3 · 4 · 5</p>
                <p className="mt-3 space-x-4">
                  <Blank label="Average sleep (h)" /> <Blank label="Exercise days" />
                </p>
              </Box>
            </div>

            <Box title="Hours by subject" className="mt-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-paper/60">
                    <th scope="col" className="w-2/5 pb-2 font-semibold">
                      Subject
                    </th>
                    <th scope="col" className="w-1/5 pb-2 font-semibold">
                      Hours
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      What I covered
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="h-8 border-b border-dashed border-paper/25">
                      <td />
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
              <Box title="Syllabus">
                <p>Topics finished</p>
                <Lines count={2} label="Topics finished" />
                <p className="mt-3">Topics not touched for over six weeks</p>
                <Lines count={2} label="Topics gone cold" />
              </Box>
              <Box title="Revision">
                <p className="space-y-2">
                  <span className="block">
                    <Blank label="Revisions due this week" />
                  </span>
                  <span className="block">
                    <Blank label="Done" />
                  </span>
                  <span className="block">
                    <Blank label="Still overdue on Sunday" />
                  </span>
                </p>
                <p className="mt-3">Topics that did not come back</p>
                <Lines count={2} label="Topics forgotten" />
              </Box>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
              <Box title="Mocks">
                <p>Test, score, accuracy, marks lost to negatives</p>
                <Lines count={3} label="Mocks this week" />
              </Box>
              <Box title="Mistakes by type">
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {ERROR_TYPES.map((t) => (
                    <li key={t} className="flex items-end justify-between gap-2">
                      <span>{t}</span>
                      <span className="inline-block w-10 border-b border-paper/35" />
                    </li>
                  ))}
                </ul>
              </Box>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3 print:grid-cols-3">
              <Box title="Wins">
                <Lines count={3} label="Wins" />
              </Box>
              <Box title="Struggles">
                <Lines count={3} label="Struggles" />
              </Box>
              <Box title="Lessons">
                <Lines count={3} label="Lessons" />
              </Box>
            </div>

            <Box title="Next week" className="mt-4">
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
                <div>
                  <p>New-topic priority</p>
                  <Lines count={1} label="New-topic priority" />
                </div>
                <div>
                  <p>Revision priority</p>
                  <Lines count={1} label="Revision priority" />
                </div>
                <div>
                  <p>One habit to fix</p>
                  <Lines count={1} label="Habit to fix" />
                </div>
                <div>
                  <p>Hours target</p>
                  <Lines count={1} label="Hours target" />
                </div>
              </div>
            </Box>
            <p className="mt-4 text-center text-xs text-paper/50">doordie · weekly review template</p>
          </article>
        </Container>
      </Band>

      <div className="print:hidden">
        <Band tone="raised" labelledBy="how-title">
          <Container>
            <SectionHeading
              id="how-title"
              eyebrow="How to use it"
              title="A weekly review in twenty minutes"
              intro="Numbers first, then patterns, then decisions. Resist the urge to replan the whole preparation."
            />
            <div className="mt-10">
              <Steps
                steps={[
                  { title: "Fill in the numbers", body: "Hours, days studied, subjects, revisions and mocks. From your log if you keep one; from memory if you must." },
                  { title: "Look for the gap", body: "Which subject got fewer hours than it needed? Which topics went cold? What is still overdue?" },
                  { title: "Read the mistakes", body: "If one error type dominates, that is a skill to fix, not a fact to memorise." },
                  { title: "Write wins and struggles", body: "Three of each, specific. 'Finished Parliament' beats 'good week'." },
                  { title: "Choose next week's focus", body: "One new-topic priority, one revision priority, one habit. Then set the hours target." },
                  { title: "Keep the sheets", body: "Last month's reviews are the quickest way to see whether the changes worked." },
                ]}
              />
            </div>
          </Container>
        </Band>

        <Band labelledBy="faq-title">
          <Container className="max-w-3xl">
            <SectionHeading id="faq-title" eyebrow="Questions" title="Weekly review questions" />
            <div className="mt-8">
              <Faq items={FAQS} />
            </div>
            <RelatedLinks
              title="Related"
              links={[
                { href: postPath("how-to-track-upsc-preparation"), label: "How to track your UPSC preparation", description: "The daily log that makes this review quick." },
                { href: postPath("consistency-in-upsc-preparation"), label: "Staying consistent", description: "What to do when the review shows a slump." },
                { href: PAGES.progress.path, label: "UPSC progress tracker", description: "Weekly reviews measured for you." },
                { href: PAGES.revisionCalculator.path, label: "Spaced revision calculator", description: "Revision dates for each topic you study." },
              ]}
            />
          </Container>
        </Band>

        <CtaBanner
          title="Skip the arithmetic every Sunday"
          body="DoOrDie measures the week for you from your daily log, so the review is only the part that needs you: what it meant, and what changes next."
          track="cta_weekly_review"
        />
      </div>
    </>
  );
}
