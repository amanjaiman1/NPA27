import Link from "next/link";
import { Callout, TableWrap } from "@/components/marketing/prose";
import { PAGES } from "@/lib/seo/pages";
import { postPath } from "../index";

export const toc = [
  { id: "why", label: "Why rereading is not enough" },
  { id: "evidence", label: "What the research says" },
  { id: "ladder", label: "A schedule you can start today" },
  { id: "session", label: "What a revision should look like" },
  { id: "forget", label: "When a topic does not come back" },
  { id: "whole-syllabus", label: "Running it across the syllabus" },
  { id: "backlog", label: "Keeping the queue under control" },
  { id: "tracking", label: "Keeping track of it all" },
];

const LADDER: [number, string, string][] = [
  [1, "The day after you study it", "Catches the topic before most of it fades."],
  [2, "3 days after the first revision", "Checks it survived a few days without you."],
  [3, "7 days after the second", "The first real test of whether it is sticking."],
  [4, "14 days after the third", "Two weeks away; most topics start to feel solid here."],
  [5, "30 days after the fourth", "A monthly check."],
  [6, "60 days after the fifth", "Long-term maintenance, about four months after you first studied it."],
];

export default function Body() {
  return (
    <>
      <p>
        Every aspirant has had the experience of rereading a chapter and finding it familiar, then failing a question on
        it a week later. Familiarity is not memory. The syllabus is too large to keep by rereading it, and the exam asks
        you to recall, not to recognise.
      </p>
      <p>
        Spaced repetition is a simple answer: revise each topic at growing intervals, and make each revision an attempt
        to recall it rather than another read. This guide gives you a schedule you can use today, and a way to run it
        across the whole syllabus without the queue taking over your day.
      </p>

      <h2 id="why">Why rereading is not enough</h2>
      <p>
        Rereading feels productive because the material gets easier to read each time. But ease of reading is not the
        same as being able to produce the material from a blank page in an exam. Revision that only rereads builds the
        first and neglects the second. It is also badly timed: we usually reread what we studied recently, which we
        still remember, and neglect what we studied months ago, which we are forgetting.
      </p>

      <h2 id="evidence">What the research says</h2>
      <p>Two findings from learning research are behind the method.</p>
      <ul>
        <li>
          <strong>Spacing beats massing.</strong> A large review of experiments by{" "}
          <a href="https://doi.org/10.1037/0033-2909.132.3.354" rel="noopener">
            Cepeda and colleagues (2006)
          </a>{" "}
          found that spreading the same amount of study across separate sessions led to better long-term recall than
          doing it all at once.
        </li>
        <li>
          <strong>Recall beats review.</strong> In a well-known study,{" "}
          <a href="https://doi.org/10.1111/j.1467-9280.2006.01693.x" rel="noopener">
            Roediger and Karpicke (2006)
          </a>{" "}
          found that students who tested themselves on a passage remembered more of it a week later than students who
          spent the same time restudying it.
        </li>
      </ul>
      <p>
        A later review of study techniques by{" "}
        <a href="https://doi.org/10.1177/1529100612453266" rel="noopener">
          Dunlosky and colleagues (2013)
        </a>{" "}
        rated both spaced practice and practice testing as highly useful, and rereading and highlighting as much less
        so. None of this is specific to UPSC, but it applies with force to an exam built on recall across a very wide
        syllabus.
      </p>

      <h2 id="ladder">A schedule you can start today</h2>
      <p>
        The ladder below is simple and widely used. Each gap is counted from the previous revision, and each is longer
        than the last.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th scope="col">Revision</th>
              <th scope="col">When</th>
              <th scope="col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {LADDER.map(([n, when, what]) => (
              <tr key={n}>
                <td>{n}</td>
                <td>{when}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p>
        From the first study session to the sixth revision is about 115 days. To get the dates for any topic, and add
        them straight to your calendar, use the free{" "}
        <Link href={PAGES.revisionCalculator.path}>spaced revision calculator</Link>.
      </p>
      <p>
        The exact numbers matter less than you might think. The research supports spacing and recall, not one magic
        ladder. What matters is that every topic keeps coming back, at longer gaps as it gets stronger, and that
        forgetting sends it back to the start.
      </p>

      <h2 id="session">What a revision should look like</h2>
      <ol>
        <li>
          <strong>Recall first, with the notes closed.</strong> Write the headings, the key facts and the arguments you
          remember on a blank page, or say them aloud. This is the part that strengthens memory, so do not skip it.
        </li>
        <li>
          <strong>Then check.</strong> Open your notes and mark what you missed or got wrong.
        </li>
        <li>
          <strong>Fix the gaps.</strong> Reread only the parts you missed, and add anything important to your notes.
        </li>
        <li>
          <strong>Judge honestly.</strong> Did it come back? If you recalled the substance, it moves up the ladder. If
          you mostly recognised it once you looked, it did not come back.
        </li>
      </ol>
      <p>
        Keep sessions short. A revision should take far less time than the first study: often ten to thirty minutes for
        a topic. For Prelims-heavy material, recall the facts; for Mains, recall the structure of an answer as well.
      </p>

      <h2 id="forget">When a topic does not come back</h2>
      <p>
        Start the ladder again from that day. This feels like a setback, but it is the system working: it found a weak
        topic before the exam did. Spend a little more time on it this time, perhaps by rewriting your notes in shorter
        form, and the next round usually holds.
      </p>
      <Callout title="Missed a revision date?">
        <p>
          Revise as soon as you can, and count the next gap from the day you actually revised. Do not try to catch up by
          doubling up, and do not skip ahead to the next rung.
        </p>
      </Callout>

      <h2 id="whole-syllabus">Running it across the whole syllabus</h2>
      <p>
        One topic on a ladder is easy. Several hundred is a system. A few rules keep it workable:
      </p>
      <ul>
        <li>
          <strong>Revise topics, not chapters.</strong> &ldquo;Fundamental Rights&rdquo; is a good unit.
          &ldquo;Laxmikanth, chapters 7 to 12&rdquo; is too big to recall in one sitting.
        </li>
        <li>
          <strong>Add a topic the day you finish it.</strong> If you wait for a weekend to add the week&apos;s topics,
          the first and most important revision is already late.
        </li>
        <li>
          <strong>Revise before new reading.</strong> Do the day&apos;s due revisions first. Left until the evening, they
          are the first thing to be dropped.
        </li>
        <li>
          <strong>Put your mistakes on a ladder too.</strong> A question you got wrong in a mock is a topic you thought
          you knew. Our guide on <Link href={postPath("how-to-analyse-upsc-mock-test")}>analysing a mock test</Link>{" "}
          covers how to keep a mistake notebook.
        </li>
        <li>
          <strong>Include current affairs and your optional.</strong> A month&apos;s notes on a theme can be a
          revision item, just like a GS topic.
        </li>
      </ul>

      <h2 id="backlog">Keeping the queue under control</h2>
      <p>
        The danger of spaced repetition is a backlog: a few busy days and you face fifty overdue items. When that
        happens:
      </p>
      <ul>
        <li>
          <strong>Look ahead.</strong> The number of revisions due each day depends on how many topics you added a few
          days, weeks and months ago. If you know a heavy week is coming, plan lighter new reading for it.
        </li>
        <li>
          <strong>Triage the overdue items.</strong> Start with the weakest and the most recently studied, which are the
          most likely to be fading.
        </li>
        <li>
          <strong>Slow down new topics until it clears.</strong> Adding topics faster than you can revise them only grows
          the debt.
        </li>
        <li>
          <strong>Split or merge.</strong> Split topics that take too long to recall; merge tiny facts into one item.
        </li>
      </ul>
      <p>
        Near the exam, many aspirants also run full passes through the syllabus alongside the ladder. That works well:
        the ladder keeps every topic warm, and the full passes join them back up into subjects.
      </p>

      <h2 id="tracking">Keeping track of it all</h2>
      <p>
        On paper, a revision calendar or a dated list per topic works for a while. Once you have more than a few dozen
        topics, the bookkeeping becomes the hard part, which is the job a tracker does well. The{" "}
        <Link href={PAGES.revision.path}>DoOrDie revision tracker</Link> uses this ladder for every topic, shows what is
        due and overdue, forecasts the next two weeks, and raises the topic&apos;s confidence in your syllabus tracker
        each time it comes back. It is free.
      </p>
    </>
  );
}
