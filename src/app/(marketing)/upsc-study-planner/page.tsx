import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import {
  Band,
  CheckList,
  Container,
  CtaBanner,
  Faq,
  Limits,
  RelatedLinks,
  Screenshot,
  SectionHeading,
  Steps,
  type FaqItem,
} from "@/components/marketing/ui";
import { Prose, TableWrap } from "@/components/marketing/prose";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";
import { postPath } from "@/content/blog";

const page = PAGES.planner;
export const metadata = pageMetadata(page);

/** Mirrors the metric catalogue in lib/goals.ts. */
const GOAL_MEASURES = [
  "Hours studied",
  "Days studied",
  "Current study streak",
  "Deep-work hours",
  "Topics completed",
  "Revision passes",
  "Mocks attempted",
  "Average mock score",
  "Hours on one subject",
  "Mastery of one subject",
  "Books finished",
  "Current affairs logged",
  "Diary entries written",
  "Mistakes mastered",
];

const FAQS: FaqItem[] = [
  {
    q: "Can it make a UPSC timetable for me?",
    a: (
      <>
        It suggests a time-blocked day: which subject, when, for how long, and why, based on your weak subjects, your
        revision queue, mistakes due and your daily hours target. It is not a timetable editor where you drag sessions
        around a calendar, and the suggestion is a starting point you can ignore.
      </>
    ),
  },
  {
    q: "Can I set daily study targets?",
    a: (
      <>
        Yes, in two ways. Your profile has a daily hours target that the dashboard and the suggested day work from. And
        any goal can be daily, weekly, monthly, quarterly or long-term, so &ldquo;6 hours today&rdquo; and &ldquo;45
        hours this week&rdquo; can both be tracked.
      </>
    ),
  },
  {
    q: "Does it work for working professionals?",
    a: (
      <>
        Goals and weekly reviews work at any number of hours, so set targets that fit your week. The suggested day is
        built for 5 to 12 hours of study, so on shorter days use it as a priority order rather than a timetable.
      </>
    ),
  },
  {
    q: "Is there a ready-made study plan?",
    a: (
      <>
        No. The Roadmap starts empty and holds only the plans you write: a yearly plan for your strategy, monthly plans
        for focus and milestones, and weekly plans with the activities you tick off. Use one level or all three. If you
        want a method to follow, the guide on making a UPSC study plan walks through it, and the plan you write from it
        stays yours to change.
      </>
    ),
  },
  {
    q: "How is roadmap progress different from goal progress?",
    a: (
      <>
        Roadmap progress is how much of the work you planned is done: completed activities out of all the activities
        in a plan. Goal progress is how close you are to an outcome, measured from your journal, syllabus, revision or
        mocks. An activity can serve a goal, and the goal is shown alongside it, but finishing the activity never
        changes the goal&apos;s number. Each keeps its own.
      </>
    ),
  },
  {
    q: "How do goals know my progress?",
    a: (
      <>
        When you create a goal you choose what it measures: hours from the journal, mastery from the syllabus tracker,
        passes from the revision queue, mocks from mock analytics and so on. Its progress then updates from that data.
        You can also choose to track a goal yourself and type the number in.
      </>
    ),
  },
];

export default function StudyPlannerPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="UPSC study planner"
        title="A UPSC study planner that plans from what you have actually done"
        intro={
          <p>
            Most study plans are written once, on a good day, and quietly abandoned by the third week. DoOrDie plans the
            other way round. It starts from your logged hours, your weak subjects and your revision queue, suggests the
            day ahead, and keeps your goals honest about whether you are on pace.
          </p>
        }
        cta="cta_planner"
        shot={SHOTS.goals}
        shotCaption={SAMPLE_NOTE}
      />

      <Band labelledBy="goals-title">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <SectionHeading
                id="goals-title"
                eyebrow="Goals"
                title="Goals that measure themselves"
                intro="Set the number, choose what feeds it, and the progress reads itself from your data."
              />
              <CheckList
                className="mt-6"
                items={[
                  "Daily, weekly, monthly, quarterly or long-term, with an optional deadline.",
                  "Each goal shows its progress, its pace, and whether it is on track, at risk or behind.",
                  "Linked goals update on their own; nothing to retype at the end of the week.",
                  "Reminders when a deadline is near, when a goal is off pace, or when it is ready to close.",
                ]}
              />
            </div>
            <Prose>
              <TableWrap>
                <table>
                  <caption className="sr-only">What a goal can measure</caption>
                  <thead>
                    <tr>
                      <th scope="col">A goal can measure</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{GOAL_MEASURES.join(" · ")}</td>
                    </tr>
                    <tr>
                      <td>Or anything else, tracked by hand</td>
                    </tr>
                  </tbody>
                </table>
              </TableWrap>
            </Prose>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="roadmap">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <SectionHeading
                id="roadmap"
                eyebrow="Roadmap"
                title="Your plan, year by year, month by month and week by week"
                intro="The Roadmap starts empty. Every plan in it is one you write, at the level of detail you want."
              />
              <CheckList
                className="mt-6"
                items={[
                  "Use one level or all three: a week can sit inside a month, and a month inside a year, but none has to.",
                  "Weekly plans hold activities with a priority, a target date, a subject and a status you set.",
                  "Progress is the share of planned activities you finished. Nothing is estimated or filled in for you.",
                  "Link an activity to a goal or a journal day. Both stay exactly as they were, and links can be removed.",
                  "Carry unfinished work into next week, duplicate a plan, and archive old years while keeping them readable.",
                ]}
              />
            </div>
            <Prose>
              <TableWrap>
                <table>
                  <caption className="sr-only">The three planning levels</caption>
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">What goes in it</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Yearly plan</td>
                      <td>The year&apos;s focus, objectives and milestones, and the goals it serves</td>
                    </tr>
                    <tr>
                      <td>Monthly plan</td>
                      <td>The month&apos;s focus, milestones and deadlines, and the weeks it breaks into</td>
                    </tr>
                    <tr>
                      <td>Weekly plan</td>
                      <td>The activities you will do, ticked off as you go, and a short review at the end</td>
                    </tr>
                  </tbody>
                </table>
              </TableWrap>
            </Prose>
          </div>
        </Container>
      </Band>

      <Band labelledBy="day-title">
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading
                id="day-title"
                eyebrow="The day ahead"
                title="A suggested day, built from your own data"
                intro="The study coach reads your hours, syllabus coverage, revision queue, mistakes and mocks, then proposes a plan."
              />
              <CheckList
                className="mt-6"
                items={[
                  "A time-blocked day sized to your daily hours target, with breaks, and a reason for every block.",
                  "Weak subjects get the fresh morning hours; due revisions and mistakes get their own slots.",
                  "A revision plan for the days ahead, and weekly and monthly reports with what to change.",
                  "It is a set of rules applied to your data, not an AI model, so its reasoning is shown and its suggestions are yours to override.",
                ]}
              />
            </div>
            <Screenshot {...SHOTS.coach} sizes="(min-width: 1024px) 600px, 100vw" caption={SAMPLE_NOTE} />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="use-title">
        <Container>
          <SectionHeading
            id="use-title"
            eyebrow="How to use it"
            title="Plan in weeks, adjust every Sunday"
            intro="A plan that survives a year of preparation is light on detail and quick to change."
          />
          <div className="mt-10">
            <Steps
              steps={[
                { title: "Set a daily hours target", body: "One you can hit on an ordinary day, not your best day. It lives in your profile." },
                { title: "Pick two or three weekly goals", body: "Hours, mocks, revision passes or a subject's mastery. Link each to what measures it." },
                { title: "Plan the week", body: "List the week's activities in a weekly plan, inside the month if you plan by month too." },
                { title: "Check the suggested day", body: "Each morning, see what the coach would put first. Take it, reorder it or ignore it." },
                { title: "Log the day", body: "Your journal entry is what moves the goals and shapes tomorrow's suggestion." },
                { title: "Review the week", body: "The weekly review shows what happened. Write next week's focus and adjust the goals." },
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band labelledBy="why-title">
        <Container className="max-w-3xl">
          <SectionHeading id="why-title" eyebrow="Why it matters" title="Why plans built from data hold up better" />
          <Prose className="mt-6">
            <p>
              A plan written in advance assumes every day goes to plan. Real preparation has sick days, family events and
              topics that take three times longer than expected. When the plan cannot absorb that, people abandon it,
              and planning starts to feel pointless.
            </p>
            <p>
              Planning from your own record avoids most of that. Weekly targets absorb a bad day. Goals that measure
              themselves tell you on Wednesday, not Sunday, that the week is slipping. And a suggested day that already
              knows your weakest subject and your overdue revisions takes the hardest decision of the morning off your
              plate.
            </p>
            <p>
              For a full method, from the exam date backwards, read{" "}
              <Link href={postPath("how-to-make-upsc-study-plan")}>how to make a UPSC study plan you can follow</Link>,
              and see how many weeks you have with the{" "}
              <Link href={PAGES.countdown.path}>Prelims 2027 countdown</Link>.
            </p>
          </Prose>
          <div className="mt-10">
            <Limits
              items={[
                "There is no drag-and-drop timetable or calendar, and nothing syncs to Google Calendar.",
                "The suggested day is not saved as a schedule. It is recalculated from your data each time.",
                "The Roadmap holds the plans you write. It doesn't generate a plan for you, and it moves unfinished work to next week only when you ask.",
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Study planner questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: postPath("how-to-make-upsc-study-plan"), label: "How to make a UPSC study plan", description: "Work backwards from the exam and plan in weeks." },
              { href: PAGES.countdown.path, label: "UPSC Prelims 2027 countdown", description: "Days left and the study hours they hold." },
              { href: PAGES.progress.path, label: "UPSC progress tracker", description: "Mock analytics and reviews that close the loop." },
              { href: PAGES.daily.path, label: "Daily study tracker", description: "The daily log your goals are measured from." },
            ]}
          />
        </Container>
      </Band>

      <CtaBanner track="cta_planner_footer" />
    </>
  );
}
