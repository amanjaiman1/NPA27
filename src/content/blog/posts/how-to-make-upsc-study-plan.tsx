import Link from "next/link";
import { Callout, TableWrap } from "@/components/marketing/prose";
import { PAGES } from "@/lib/seo/pages";
import { CSE_2027, longDate } from "@/content/upsc-calendar";
import { postPath } from "../index";

export const toc = [
  { id: "backwards", label: "Start from the exam date" },
  { id: "budget", label: "Turn the time into hours" },
  { id: "phases", label: "Split it into phases" },
  { id: "weeks", label: "Plan weeks, not days" },
  { id: "sample", label: "A sample week" },
  { id: "revision", label: "Build revision and mocks in from the start" },
  { id: "working", label: "If you work or study full time" },
  { id: "adjust", label: "Review and adjust every week" },
  { id: "mistakes", label: "Common planning mistakes" },
];

export default function Body() {
  return (
    <>
      <p>
        Most UPSC study plans are written on a good day. They assume eight focused hours, every day, for a year, with no
        illness, no family events and no topic that takes longer than expected. Within a few weeks reality diverges from
        the plan, and the plan is quietly abandoned.
      </p>
      <p>
        A plan you can follow looks different. It is built backwards from the exam date, priced in hours you actually
        study, organised in weeks rather than perfect days, and adjusted on a fixed day each week. This guide walks
        through building one.
      </p>

      <h2 id="backwards">Start from the exam date</h2>
      <p>
        For CSE 2027, UPSC&apos;s examination calendar lists Prelims on {longDate(CSE_2027.prelims)} and the start of
        Mains on {longDate(CSE_2027.mainsStart)}. Those two dates fix the shape of the plan: everything before Prelims
        has to cover the syllabus, revise it and practise for an objective paper, and the months between Prelims and
        Mains are short. Many candidates therefore prepare for Mains alongside Prelims rather than starting it after.
      </p>
      <p>
        Count the weeks you have left. The{" "}
        <Link href={PAGES.countdown.path}>Prelims 2027 countdown</Link> shows the days and turns them into study hours
        for your week. UPSC can revise its calendar, so check{" "}
        <a href={CSE_2027.source.url} rel="noopener">
          its website
        </a>{" "}
        before relying on a date.
      </p>

      <h2 id="budget">Turn the time into hours</h2>
      <p>
        A plan made of dates is a wish list until it is priced in hours. Multiply the hours you really study in a week
        (measure two ordinary weeks if you have not yet) by the weeks left. That is your budget.
      </p>
      <p>
        Then estimate, roughly, how many hours each remaining subject needs for a first reading, and how many for
        revision. You will not get these right, and you do not need to. The point is to find out early whether the
        syllabus fits. If it does not, decide now what to shorten, what to cover from a single source, or whether the
        attempt you are aiming at is realistic. Finding out in April is much worse.
      </p>
      <Callout title="Use your real average">
        <p>
          Plan on the hours your ordinary days produce, not your best days. If your last four weeks averaged five hours a
          day, a plan that needs eight is a plan that will fail. Our guide on{" "}
          <Link href={postPath("how-many-hours-to-study-for-upsc")}>how many hours to study</Link> covers choosing a
          target.
        </p>
      </Callout>

      <h2 id="phases">Split it into phases</h2>
      <p>
        Preparation changes character as the exam gets closer. Splitting it into phases keeps each week&apos;s work clear.
        A common shape looks like this; the lengths depend on how long you have.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th scope="col">Phase</th>
              <th scope="col">Main work</th>
              <th scope="col">Running alongside</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Foundation</td>
              <td>Basic books for each subject, the syllabus itself, previous years&apos; papers to see what is asked</td>
              <td>Newspaper, the optional&apos;s basics</td>
            </tr>
            <tr>
              <td>Coverage</td>
              <td>Standard books and notes for every GS subject and the optional</td>
              <td>Spaced revision, some answer writing, monthly current affairs</td>
            </tr>
            <tr>
              <td>Prelims focus</td>
              <td>Revision cycles, full-length mocks and their analysis, CSAT practice</td>
              <td>Current affairs revision, the mistake notebook</td>
            </tr>
            <tr>
              <td>Mains focus</td>
              <td>Answer writing, essay, ethics and case studies, the optional&apos;s papers</td>
              <td>Revision of GS content for answers</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        The phases overlap, and they should. Revision starts in the first month, not the last, and answer writing does
        not wait until after Prelims.
      </p>

      <h2 id="weeks">Plan weeks, not days</h2>
      <p>
        Within a phase, plan each week with a handful of targets: hours by subject, the topics to finish, the revisions
        to clear, and a mock if one is due. Leave the order of each day flexible. A weekly plan survives a bad Tuesday; a
        daily timetable does not.
      </p>
      <p>Two habits make weekly plans hold up:</p>
      <ul>
        <li>
          <strong>Keep a buffer.</strong> Leave one day, or half of two days, without new targets. It absorbs whatever
          went wrong earlier in the week, and if nothing did, it becomes a revision day.
        </li>
        <li>
          <strong>Put the hardest work first.</strong> The weakest subject gets the freshest hours of the day, usually
          the morning.
        </li>
      </ul>

      <h2 id="sample">A sample week</h2>
      <p>
        Here is one way a coverage-phase week at about six hours a study day could look. It is an illustration, not a
        recommendation: your subjects and hours will differ.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th scope="col">Block</th>
              <th scope="col">Monday to Friday</th>
              <th scope="col">Saturday</th>
              <th scope="col">Sunday</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Morning (2.5 h)</td>
              <td>Main subject of the week, new topics</td>
              <td>Sectional test or a mock</td>
              <td rowSpan={3}>Buffer and weekly review</td>
            </tr>
            <tr>
              <td>Midday (1 h)</td>
              <td>Newspaper and current affairs notes</td>
              <td>Mock analysis</td>
            </tr>
            <tr>
              <td>Afternoon (2.5 h)</td>
              <td>Revisions due, then the optional or a second subject</td>
              <td>Mistake notebook and revision</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>

      <h2 id="revision">Build revision and mocks in from the start</h2>
      <p>
        Plans that leave revision for &ldquo;later&rdquo; meet a syllabus that has been half-forgotten by the time later
        arrives. Give revision its own slot every day, before new reading, and let it grow as the plan goes on. Our
        guide to a <Link href={postPath("upsc-revision-schedule-spaced-repetition")}>spaced revision schedule</Link>{" "}
        covers the timing.
      </p>
      <p>
        Mocks belong in the plan early too, even when the scores will be low. Each one, properly{" "}
        <Link href={postPath("how-to-analyse-upsc-mock-test")}>analysed</Link>, tells you which parts of the plan are
        working.
      </p>

      <h2 id="working">If you work or study full time</h2>
      <ul>
        <li>Plan around a weekday minimum you can manage after work, and put long blocks on weekends.</li>
        <li>Give the mornings to the hardest subject if your schedule allows it.</li>
        <li>Use short gaps for current affairs and revision, which need less sustained focus.</li>
        <li>Choose a timeline that matches the hours. Fewer hours a week means more weeks, and that is fine.</li>
      </ul>

      <h2 id="adjust">Review and adjust every week</h2>
      <p>
        Once a week, look at what happened against what you planned: hours by subject, topics finished, revisions
        cleared, mock results. Then adjust next week, not the whole plan. Move a subject up, slow down new topics if
        revision is behind, or lower the hours target for a while if you are running short of sleep. Once a month, check
        whether the phases still fit the time left.
      </p>
      <p>
        A printable <Link href={PAGES.weeklyReview.path}>weekly review template</Link> keeps this to twenty minutes. In
        DoOrDie, the <Link href={PAGES.planner.path}>study planner</Link> does much of it with your data: goals that
        measure themselves and show whether you are on pace, a suggested day built from your weak subjects and revision
        queue, and a weekly review with the numbers already filled in.
      </p>

      <h2 id="mistakes">Common planning mistakes</h2>
      <ul>
        <li>
          <strong>Planning on best-case hours.</strong> The plan should work on ordinary days.
        </li>
        <li>
          <strong>Copying someone else&apos;s timetable.</strong> Their background, hours and optional are not yours.
        </li>
        <li>
          <strong>No time for revision until the end.</strong> Revision delayed is revision that has to start from
          scratch.
        </li>
        <li>
          <strong>Replanning after every bad day.</strong> Adjust weekly; replan monthly at most.
        </li>
        <li>
          <strong>Too many sources.</strong> A plan with three books per subject runs out of time. Choose one standard
          source and revise it.
        </li>
      </ul>
    </>
  );
}
