import Link from "next/link";
import { Callout, TableWrap } from "@/components/marketing/prose";
import { PAGES } from "@/lib/seo/pages";
import { postPath } from "../index";

export const toc = [
  { id: "what-for", label: "What tracking is for" },
  { id: "six-things", label: "The six things worth recording" },
  { id: "daily-log", label: "The daily log" },
  { id: "weekly-review", label: "The weekly review" },
  { id: "monthly", label: "Once a month, zoom out" },
  { id: "tools", label: "Notebook, spreadsheet or app?" },
  { id: "mistakes", label: "Mistakes that make tracking a chore" },
  { id: "first-week", label: "Your first week" },
];

export default function Body() {
  return (
    <>
      <p>
        Most aspirants know they should track their preparation. Fewer know what to track, and fewer still keep it up
        past the first month. The usual reason is that the tracking was designed as record-keeping. It answers
        &ldquo;what did I do?&rdquo; when the question that matters is &ldquo;what should I do next?&rdquo;
      </p>
      <p>
        This guide sets out a small system that answers the second question: six things to record, a five-minute daily
        log, a twenty-minute weekly review and a short monthly check. It works on paper, in a spreadsheet or in an app.
      </p>

      <h2 id="what-for">What tracking is for</h2>
      <p>A useful tracker answers three questions, quickly and honestly:</p>
      <ol>
        <li>
          <strong>Am I putting in the time?</strong> Not &ldquo;did I feel busy&rdquo;, but how many focused hours went
          into each subject this week.
        </li>
        <li>
          <strong>Am I covering the syllabus?</strong> Which topics are done, which are half-done, and which have not
          been opened.
        </li>
        <li>
          <strong>Is it sticking?</strong> Whether revision is keeping up, and whether mock results are improving in the
          subjects you have worked on.
        </li>
      </ol>
      <p>
        If a number you record does not help answer one of these, stop recording it. Tracking that does not change a
        decision is a tax on your study time.
      </p>

      <h2 id="six-things">The six things worth recording</h2>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">When</th>
              <th scope="col">Why it matters</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Study hours by subject</td>
              <td>Daily</td>
              <td>Shows where your time actually goes, and which subject keeps getting squeezed.</td>
            </tr>
            <tr>
              <td>Syllabus status by topic</td>
              <td>When it changes</td>
              <td>Turns &ldquo;I have done Polity&rdquo; into a list of the topics that are still weak.</td>
            </tr>
            <tr>
              <td>Revisions done and due</td>
              <td>Daily</td>
              <td>The difference between having read the syllabus and remembering it in the exam hall.</td>
            </tr>
            <tr>
              <td>Mock results, section by section</td>
              <td>After each mock</td>
              <td>Accuracy, attempts and marks lost to negative marking show what to fix, not just how you did.</td>
            </tr>
            <tr>
              <td>Mistakes and their type</td>
              <td>After each mock or practice set</td>
              <td>A repeated type of error is a skill problem, and it will keep costing marks until you fix it.</td>
            </tr>
            <tr>
              <td>Sleep, mood and energy</td>
              <td>Daily (optional)</td>
              <td>Explains bad weeks. Short sleep often shows up in your hours and your focus a day later.</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        Some aspirants add current affairs notes, answers written and pages read in standard books. These are useful
        too, but only start them once the six basics are a habit.
      </p>

      <h2 id="daily-log">The daily log: five minutes at the end of the day</h2>
      <p>
        Log the day just before you stop, while it is fresh. Write the hours for each subject first. Everything else is
        optional on a given day.
      </p>
      <ul>
        <li>
          <strong>Count focused time only.</strong> Reading with notes, revising, answer writing and solving questions
          count. Breaks, planning and scrolling through study material do not. Round to the nearest half hour.
        </li>
        <li>
          <strong>Note what you covered.</strong> The topics finished, the revisions done, any mock taken. One line each.
        </li>
        <li>
          <strong>Write one specific highlight.</strong> &ldquo;Finished Parliament and its committees&rdquo; is
          something you can reread in three months. &ldquo;Productive day&rdquo; is not.
        </li>
        <li>
          <strong>Write down a lesson when there is one.</strong> &ldquo;Revision before new topics, or the revision
          does not happen&rdquo; is worth more than another hour of reading.
        </li>
        <li>
          <strong>Log the bad days too.</strong> A day with one hour, or none, is the most informative entry you will
          write. Skipping it makes the record lie.
        </li>
      </ul>
      <Callout title="Keep the rule the same every day">
        <p>
          Whatever counts as a study hour for you, count it the same way every day. A consistent rule matters more than
          the right rule, because what you will compare is this week against last week.
        </p>
      </Callout>

      <h2 id="weekly-review">The weekly review: twenty minutes, once a week</h2>
      <p>
        The daily log collects the data. The weekly review is where it becomes a decision. Pick a fixed time, such as
        Sunday evening, and work through four steps.
      </p>
      <ol>
        <li>
          <strong>The numbers.</strong> Total hours against your target, days studied, and hours by subject. Note any
          subject that got less than its share.
        </li>
        <li>
          <strong>The syllabus.</strong> Topics finished this week, and any topic you have not touched for six weeks or
          more. Those are the ones you are quietly forgetting.
        </li>
        <li>
          <strong>Revision and mocks.</strong> Is the revision queue growing or shrinking? If you took a mock, what type
          of mistake was most common?
        </li>
        <li>
          <strong>The decision.</strong> One new-topic priority, one revision priority and one habit to fix for next
          week. Then set next week&apos;s hours target.
        </li>
      </ol>
      <p>
        That is the whole review. If it takes much longer than twenty minutes, you are probably adding up numbers by
        hand. A printable version is in our{" "}
        <Link href={PAGES.weeklyReview.path}>UPSC weekly review template</Link>.
      </p>

      <h2 id="monthly">Once a month, zoom out</h2>
      <p>
        Weekly numbers are noisy. A month smooths out the bad weeks and shows the trend. Once a month, compare it with
        the month before:
      </p>
      <ul>
        <li>Average weekly hours, and whether they are rising, flat or falling.</li>
        <li>Coverage by paper: which GS paper or section of your optional moved least.</li>
        <li>
          Mock results over the last four or five tests, not just the latest one. Test series differ in difficulty, so a
          single score says little.
        </li>
        <li>Whether your plan&apos;s phases still fit the time left before the exam.</li>
      </ul>
      <p>
        This is also the moment to change the plan itself, if you need to. Changing it weekly is churn; never changing it
        is wishful thinking. Our guide on <Link href={postPath("how-to-make-upsc-study-plan")}>making a UPSC study
        plan</Link> covers how to adjust without starting over.
      </p>

      <h2 id="tools">Notebook, spreadsheet or app?</h2>
      <p>The best tool is the one you will still be using in six months. Each has real trade-offs.</p>
      <ul>
        <li>
          <strong>A notebook</strong> needs no setup and keeps screens away while you plan. But it has no totals unless
          you add them up, it is hard to search months later, and revision dates are yours to remember.
        </li>
        <li>
          <strong>A spreadsheet</strong> gives you totals and charts, if you build them. You will also maintain it, and
          nothing in it reminds you what is due. It is awkward to fill in on a phone at the end of a long day.
        </li>
        <li>
          <strong>A dedicated tracker</strong> does the arithmetic, schedules revisions and works on a phone. The cost is
          learning a new tool, and trusting it with your data, so check that you can export everything and delete your
          account.
        </li>
      </ul>
      <p>
        DoOrDie is one such tracker: a <Link href={PAGES.daily.path}>daily study log</Link>, a{" "}
        <Link href={PAGES.syllabus.path}>topic-wise syllabus tracker</Link>, a{" "}
        <Link href={PAGES.revision.path}>spaced revision queue</Link> and{" "}
        <Link href={PAGES.progress.path}>mock analytics</Link> in one free account. But the method in this guide works
        with any of them.
      </p>

      <h2 id="mistakes">Mistakes that make tracking a chore</h2>
      <ul>
        <li>
          <strong>Tracking too much from day one.</strong> Twenty columns feel thorough for a week and exhausting by the
          third. Start with hours by subject and add one thing at a time.
        </li>
        <li>
          <strong>Measuring time, never output.</strong> Hours matter, but a week of long days with no topics finished
          and no revision done is not a good week.
        </li>
        <li>
          <strong>Treating a streak as the goal.</strong> A streak is a nudge, not a test. Breaking one does not undo the
          weeks before it.
        </li>
        <li>
          <strong>Reading the daily numbers like a verdict.</strong> One bad day means little. Look at weekly totals and
          monthly trends.
        </li>
        <li>
          <strong>Comparing your hours with someone else&apos;s.</strong> Hours quoted in interviews and on social media
          are not measured the way yours are. Compare yourself with your own last month.
        </li>
        <li>
          <strong>Never acting on what you see.</strong> If the review keeps showing the same neglected subject and
          nothing changes, the tracking has become a ritual.
        </li>
      </ul>

      <h2 id="first-week">Your first week</h2>
      <p>To start, do only this for seven days:</p>
      <ol>
        <li>Each evening, write the hours you studied for each subject and one specific highlight.</li>
        <li>Mark the syllabus topics you have already covered, honestly. &ldquo;Learning&rdquo; is a fine status.</li>
        <li>At the end of the week, total the hours and look at the split by subject.</li>
      </ol>
      <p>
        That first total is your real starting point. It will probably be lower than you expected, which is useful: you
        now have a number to plan from. If you want to choose a sensible daily target from it, read{" "}
        <Link href={postPath("how-many-hours-to-study-for-upsc")}>how many hours to study for UPSC</Link>.
      </p>
    </>
  );
}
