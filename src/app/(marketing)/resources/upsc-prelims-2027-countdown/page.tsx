import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, Faq, RelatedLinks, SectionHeading, type FaqItem } from "@/components/marketing/ui";
import { Prose, TableWrap } from "@/components/marketing/prose";
import { PrelimsCountdown } from "@/components/marketing/tools/prelims-countdown";
import { CSE_2027, daysUntil, longDate, longDateWithDay, todayInIndia } from "@/content/upsc-calendar";
import { postPath } from "@/content/blog";

const page = PAGES.countdown;
export const metadata = pageMetadata(page);

/** Re-rendered every hour, so the count in the HTML is never more than an hour stale. */
export const revalidate = 3600;

export default function PrelimsCountdownPage() {
  const today = todayInIndia();
  const days = daysUntil(today, CSE_2027.prelims);
  const prelims = longDateWithDay(CSE_2027.prelims);

  const faqs: FaqItem[] = [
    {
      q: "How many days are left for UPSC Prelims 2027?",
      a:
        days > 0 ? (
          <>
            As of {longDate(today)}, {days} days are left until UPSC Prelims on {prelims}. The counter at the top of this
            page updates itself every day.
          </>
        ) : (
          <>UPSC Prelims 2027 was held on {prelims}.</>
        ),
    },
    {
      q: "What is the date of UPSC Prelims 2027?",
      a: (
        <>
          {prelims}, according to UPSC&apos;s Examination Calendar 2027. The Indian Forest Service preliminary
          examination is held through the Civil Services Prelims on the same day.
        </>
      ),
    },
    {
      q: "When will the CSE 2027 notification be released?",
      a: (
        <>
          The calendar lists {longDate(CSE_2027.notification)} for the notification, with applications closing on{" "}
          {longDate(CSE_2027.applicationsClose)}. Applications are made online on UPSC&apos;s website.
        </>
      ),
    },
    {
      q: "When does UPSC Mains 2027 start?",
      a: (
        <>
          The Civil Services Main Examination 2027 is scheduled to begin on {longDate(CSE_2027.mainsStart)} and to run
          over {CSE_2027.mainsDays} days. UPSC publishes the paper-wise timetable closer to the date.
        </>
      ),
    },
    {
      q: "Can these dates change?",
      a: (
        <>
          Yes. UPSC says its calendar may be revised if circumstances require it. Treat the dates here as the current
          plan and check{" "}
          <a href={CSE_2027.source.url} rel="noopener" className="font-semibold text-accent hover:underline">
            upsc.gov.in
          </a>{" "}
          before booking travel or making a decision on a date.
        </>
      ),
    },
  ];

  return (
    <>
      <PageHero
        crumbs={[
          { name: PAGES.resources.label, path: PAGES.resources.path },
          { name: page.label, path: page.path },
        ]}
        eyebrow="Free tool"
        title="UPSC Prelims 2027 countdown"
        intro={
          <p>
            UPSC&apos;s Examination Calendar 2027 puts the Civil Services Preliminary Examination on {prelims}. Here is
            how many days that leaves, the rest of the CSE 2027 schedule, and how many study hours those days actually
            hold.
          </p>
        }
      />

      <Band className="pt-0 sm:pt-0">
        <Container>
          <PrelimsCountdown prelims={CSE_2027.prelims} mainsStart={CSE_2027.mainsStart} initialToday={today} />
        </Container>
      </Band>

      <Band tone="raised" labelledBy="dates-title">
        <Container className="max-w-3xl">
          <SectionHeading id="dates-title" eyebrow="Schedule" title="CSE 2027 key dates" />
          <Prose className="mt-6">
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Stage</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Notification released</td>
                    <td>{longDate(CSE_2027.notification)}</td>
                  </tr>
                  <tr>
                    <td>Last date to apply</td>
                    <td>{longDate(CSE_2027.applicationsClose)}</td>
                  </tr>
                  <tr>
                    <td>Preliminary examination (one day)</td>
                    <td>{prelims}</td>
                  </tr>
                  <tr>
                    <td>Main examination begins (five days)</td>
                    <td>{longDateWithDay(CSE_2027.mainsStart)}</td>
                  </tr>
                </tbody>
              </table>
            </TableWrap>
            <p className="text-sm">
              Source:{" "}
              <a href={CSE_2027.source.url} rel="noopener">
                {CSE_2027.source.label}
              </a>
              , released by UPSC on {longDate(CSE_2027.source.released)}. Checked on {longDate(CSE_2027.checked)}.
              UPSC can revise its calendar, so confirm on its website before relying on a date. DoOrDie is not
              affiliated with UPSC.
            </p>
          </Prose>
        </Container>
      </Band>

      <Band labelledBy="use-title">
        <Container className="max-w-3xl">
          <SectionHeading id="use-title" eyebrow="Using the time" title="What to do with the days left" />
          <Prose className="mt-6">
            <p>
              A count of days is a blunt number. Days include rest, illness, family events and the weeks you will spend
              revising and taking mocks rather than reading new material. The planner above turns the count into study
              days and hours, and splits off the weeks you keep for revision at the end. That split is the useful part:
              it is the real budget for finishing the syllabus.
            </p>
            <p>Three checks make the budget honest:</p>
            <ul>
              <li>
                <strong>Use your real average, not your best day.</strong> If your last four weeks averaged five hours a
                day, plan on five, not eight.
              </li>
              <li>
                <strong>Price the syllabus in hours.</strong> Estimate the hours each remaining subject needs for a first
                reading. If the total is more than the hours before the revision weeks, something has to be cut or
                shortened now, not in April.
              </li>
              <li>
                <strong>Protect revision and mocks.</strong> The last weeks before Prelims belong to revision cycles and
                full-length tests. Planning to finish the syllabus in them usually means finishing neither.
              </li>
            </ul>
            <p>
              Our guide on <Link href={postPath("how-to-make-upsc-study-plan")}>how to make a UPSC study plan</Link>{" "}
              walks through turning this budget into phases and weekly targets. In DoOrDie, a countdown to your exam
              date sits on your dashboard, next to the hours you have actually logged.
            </p>
          </Prose>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="UPSC 2027 dates: common questions" />
          <div className="mt-8">
            <Faq items={faqs} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: postPath("how-to-make-upsc-study-plan"), label: "How to make a UPSC study plan", description: "From the exam date backwards, in phases and weeks." },
              { href: postPath("how-many-hours-to-study-for-upsc"), label: "How many hours to study", description: "Choosing a daily target you can keep." },
              { href: PAGES.planner.path, label: "UPSC study planner", description: "Goals and a suggested day built from your data." },
              { href: PAGES.revisionCalculator.path, label: "Spaced revision calculator", description: "Revision dates for every topic you study." },
            ]}
          />
        </Container>
      </Band>

      <CtaBanner
        title="See the countdown next to your real hours"
        body="DoOrDie puts the days left on your dashboard beside the hours you have logged, your syllabus coverage and your revision queue. Free, private to your account."
        track="cta_countdown"
      />
    </>
  );
}
