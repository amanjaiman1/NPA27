import Link from "next/link";
import { Callout, TableWrap } from "@/components/marketing/prose";
import { PAGES } from "@/lib/seo/pages";
import { postPath } from "../index";

export const toc = [
  { id: "rules", label: "The rules that shape the numbers" },
  { id: "step-1", label: "Record the raw numbers" },
  { id: "step-2", label: "Accuracy and the cost of negatives" },
  { id: "step-3", label: "Sort every mistake by type" },
  { id: "step-4", label: "Go section by section" },
  { id: "step-5", label: "Look at what you left" },
  { id: "step-6", label: "Check your timing" },
  { id: "step-7", label: "Compare with earlier mocks" },
  { id: "step-8", label: "Decide three fixes" },
  { id: "mains", label: "Analysing a Mains mock" },
];

const ERRORS: [string, string, string][] = [
  ["Conceptual", "You did not understand the idea the question tested.", "Restudy the topic; put it back on the revision ladder."],
  ["Factual", "You knew the area but not the specific fact.", "Add the fact to your notes and to a mistake notebook."],
  ["Guessing", "You guessed without being able to eliminate options.", "Review your guessing rule (see step 2)."],
  ["Revision failure", "You had studied it, but it did not come back.", "Shorten the gap: the topic needs more revision."],
  ["Time pressure", "You ran out of time, or rushed it.", "Practise pacing and a two-round approach."],
  ["Careless", "You misread the question or marked the wrong option.", "Slow down on statements such as 'not correct'."],
];

export default function Body() {
  return (
    <>
      <p>
        A mock test gives you a score in two hours and a lot of information if you spend another hour or two on it.
        Most of the value is in that second part. The score tells you how the test went. The analysis tells you what
        to change before the next one.
      </p>
      <p>
        This guide is mostly about Prelims-style mocks, with a section on Mains at the end. Work through the steps in
        order the first few times; after a month it becomes quick.
      </p>

      <h2 id="rules">The rules that shape the numbers</h2>
      <p>
        UPSC&apos;s Civil Services Preliminary Examination has two objective papers. Paper I (General Studies) has 100
        questions and Paper II (CSAT) has 80, each paper worth 200 marks. CSAT is qualifying: you need at least 33 per
        cent in it, and your Prelims merit is decided by Paper I. A wrong answer costs one-third of the marks for that
        question, and an unanswered question costs nothing. That makes a wrong answer in Paper I worth about minus 0.66
        and a right one plus 2; in CSAT, plus 2.5 and about minus 0.83.
      </p>
      <p>
        These rules come from the examination notice UPSC publishes each year on{" "}
        <a href="https://upsc.gov.in" rel="noopener">
          upsc.gov.in
        </a>
        . Read the current notice before you rely on them: UPSC can change its scheme. Most test series copy these rules,
        but check that yours does before comparing scores.
      </p>

      <h2 id="step-1">Step 1: Record the raw numbers</h2>
      <p>Before anything else, write down:</p>
      <ul>
        <li>Questions attempted, correct, wrong and left blank.</li>
        <li>Your net score, and how many marks negative marking took away.</li>
        <li>The time you took, and roughly how long each section took.</li>
        <li>For each subject or section: questions, attempts and correct answers.</li>
      </ul>
      <p>
        This takes five minutes with the answer key. The section-wise numbers are the most important, so do not skip
        them because they are tedious.
      </p>

      <h2 id="step-2">Step 2: Accuracy and the cost of negatives</h2>
      <p>
        Accuracy is correct answers divided by attempts. It tells you how reliable your attempts are, which is a
        different question from how much you know. Two candidates can have the same score with very different
        profiles: one attempts 90 questions at 60 per cent accuracy, the other 70 at 75 per cent. They need different
        fixes.
      </p>
      <p>
        Negative marking also gives you a rule for guessing. With four options and a penalty of one-third, a completely
        blind guess is worth almost exactly nothing on average. In Paper I, a one-in-four chance of plus 2 and a
        three-in-four chance of minus 0.66 comes to about zero. But eliminate one option and the expected value turns
        clearly positive; eliminate two and it is strongly positive.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th scope="col">Options you can rule out (Paper I)</th>
              <th scope="col">Chance of being right</th>
              <th scope="col">Average marks per such guess</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>None (blind guess)</td>
              <td>1 in 4</td>
              <td>About 0</td>
            </tr>
            <tr>
              <td>One</td>
              <td>1 in 3</td>
              <td>About +0.22</td>
            </tr>
            <tr>
              <td>Two</td>
              <td>1 in 2</td>
              <td>About +0.67</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        These are averages over many questions, and they assume the remaining options really are equally likely. Your
        own data tells you whether your &ldquo;fifty-fifty&rdquo; guesses actually come out right half the time. Many
        people find they are worse than that, which is worth knowing.
      </p>

      <h2 id="step-3">Step 3: Sort every mistake by type</h2>
      <p>
        Go through each wrong answer and give it one type. It is the most useful part of the analysis, because each
        type has a different fix.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">What happened</th>
              <th scope="col">The fix</th>
            </tr>
          </thead>
          <tbody>
            {ERRORS.map(([type, what, fix]) => (
              <tr key={type}>
                <td>
                  <strong>{type}</strong>
                </td>
                <td>{what}</td>
                <td>{fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p>
        Keep each mistake: the question, your answer, the correct answer and a one-line explanation. A mistake notebook
        reviewed on a spaced schedule turns your wrong answers into the most targeted revision material you have. Our
        guide to a <Link href={postPath("upsc-revision-schedule-spaced-repetition")}>spaced revision schedule</Link>{" "}
        explains the timing.
      </p>

      <h2 id="step-4">Step 4: Go section by section</h2>
      <p>
        Lay out accuracy and attempts for each subject. Usually one or two subjects stand out, either because accuracy is
        low (you attempt but get it wrong) or because attempts are low (you skip). Those call for different work: low
        accuracy needs concepts and revision, low attempts need coverage. Check them against your syllabus tracker. A
        subject with low mock accuracy and lots of untouched topics is a clear priority.
      </p>

      <h2 id="step-5">Step 5: Look at what you left</h2>
      <p>
        For each question you left blank, ask: could I have ruled out one or two options? If yes, those were marks you
        left on the table. If no, the question points to a gap in coverage. A pattern of blanks in one subject is a list
        of topics to study.
      </p>

      <h2 id="step-6">Step 6: Check your timing</h2>
      <p>
        Note where the time went. Many candidates use a two-round approach: answer the questions they are sure of
        first, mark the rest, then return. If you finished with no time for a second round, or spent a long time on a
        few hard questions, practise pacing in the next mock. In CSAT especially, pacing can decide whether you clear the
        33 per cent.
      </p>

      <h2 id="step-7">Step 7: Compare with earlier mocks</h2>
      <p>
        A single mock is noisy. Test series vary in difficulty from paper to paper, and a hard set of questions in your
        strong subject can move the score a lot. Look at the last four or five mocks together: is accuracy rising? Are
        attempts stable? Are the marks lost to negatives falling? A moving average across mocks is a better guide than
        the latest score.
      </p>
      <Callout title="Don't rewrite your plan after one bad mock">
        <p>
          React to trends, not to single results. If three mocks in a row show the same weak subject, change the plan.
          If one mock went badly, do the analysis, make the fixes, and keep going.
        </p>
      </Callout>

      <h2 id="step-8">Step 8: Decide three fixes</h2>
      <p>End every analysis with no more than three actions, written down:</p>
      <ol>
        <li>A content fix: the topics to restudy or put back on the revision ladder.</li>
        <li>A mistake fix: the error type you will watch for in the next mock.</li>
        <li>A strategy fix: a change to pacing or to how you guess.</li>
      </ol>
      <p>
        Then check, in the next analysis, whether the fixes worked. That loop, more than the number of mocks you take,
        is what makes mocks useful.
      </p>

      <h2 id="mains">Analysing a Mains mock</h2>
      <p>
        Mains answers are written, so the analysis is about quality rather than right or wrong. With your evaluated copy,
        look at four things for each answer:
      </p>
      <ul>
        <li>
          <strong>Content:</strong> did you address every part of the question, with relevant facts and examples?
        </li>
        <li>
          <strong>Structure:</strong> a clear introduction, a body organised around the question&apos;s demand, and a
          conclusion.
        </li>
        <li>
          <strong>Presentation:</strong> headings, short paragraphs or points, and a diagram or flowchart where it
          helps.
        </li>
        <li>
          <strong>Time:</strong> did you finish the paper? Unattempted questions cost more than imperfect answers.
        </li>
      </ul>
      <p>
        Record the marks for each paper so you can see the trend over several tests, and note the evaluator&apos;s most
        frequent comment. That comment is usually the single most valuable thing on the copy.
      </p>
      <p>
        In DoOrDie, <Link href={`${PAGES.progress.path}#mocks`}>mock analytics</Link> does steps 1, 2, 4 and 7 for you
        when you log a mock section by section: accuracy, marks lost to negatives, section-wise results and the trend
        across mocks. The <Link href={`${PAGES.revision.path}#mistakes`}>mistake tracker</Link> covers step 3, with the
        same six error types and scheduled reviews.
      </p>
    </>
  );
}
