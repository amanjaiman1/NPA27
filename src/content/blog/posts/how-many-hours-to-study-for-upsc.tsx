import Link from "next/link";
import { Callout } from "@/components/marketing/prose";
import { PAGES } from "@/lib/seo/pages";
import { postPath } from "../index";

export const toc = [
  { id: "no-number", label: "Why there is no single number" },
  { id: "focused", label: "Focused hours, not desk hours" },
  { id: "choose", label: "How to choose your target" },
  { id: "weekly", label: "Think in weeks" },
  { id: "phases", label: "Different phases, different days" },
  { id: "job", label: "If you work or study full time" },
  { id: "too-high", label: "Signs your target is too high" },
  { id: "sleep", label: "Sleep is part of the plan" },
  { id: "track", label: "How to track hours honestly" },
];

export default function Body() {
  return (
    <>
      <p>
        Search for how many hours to study for UPSC and you will find confident answers: eight, ten, fourteen. None of
        them comes from UPSC, which sets a syllabus and an exam, not a timetable. Most come from interviews with
        successful candidates, describing their own days in hindsight.
      </p>
      <p>
        Those accounts are worth reading, but they cannot tell you your number. What they share is more useful than the
        hours they quote: the candidates studied consistently for a long time. This guide is about finding the number
        of hours you can repeat, week after week, until the exam.
      </p>

      <h2 id="no-number">Why there is no single number</h2>
      <p>How many hours a day you need depends on things that differ from person to person:</p>
      <ul>
        <li>
          <strong>Time until the exam.</strong> Eighteen months of preparation at six hours a day is a lot more study
          than six months at ten.
        </li>
        <li>
          <strong>Your starting point.</strong> A graduate in history needs less time on that part of GS Paper I than an
          engineer coming to it fresh. The same goes for your optional.
        </li>
        <li>
          <strong>Your other commitments.</strong> A full-time job or college changes what is possible on a weekday.
        </li>
        <li>
          <strong>The phase you are in.</strong> First reading, revision and the weeks before Prelims each ask for a
          different kind of day.
        </li>
      </ul>
      <p>
        So the honest answer to &ldquo;how many hours?&rdquo; is: enough to cover the syllabus and revise it before the
        exam, at a pace you can keep. Working that out takes some arithmetic, and a few weeks of honest records.
      </p>

      <h2 id="focused">Focused hours, not desk hours</h2>
      <p>
        Ten hours at the desk and ten hours of study are rarely the same thing. Before you set a target, decide what
        counts. A sensible rule is that an hour counts when you were actually working on the material: reading with
        notes, revising from memory, writing answers or solving questions. Breaks, planning, scrolling through PDFs and
        &ldquo;studying&rdquo; with the phone face up do not count.
      </p>
      <p>
        By that rule, most people find their real number is a few hours lower than their desk time. That is normal, and
        it is the number worth planning around. A plan built on desk hours runs out of time; a plan built on focused
        hours does not.
      </p>

      <h2 id="choose">How to choose your target</h2>
      <ol>
        <li>
          <strong>Measure two normal weeks first.</strong> Log your focused hours every day without trying to impress
          yourself. The average of those two weeks is your baseline.
        </li>
        <li>
          <strong>Set the target a little above the baseline.</strong> Close enough that an ordinary day reaches it. A
          target you only hit on your best days is a source of guilt, not a plan.
        </li>
        <li>
          <strong>Check it against the syllabus.</strong> Multiply the weekly total by the weeks you have left, and
          compare it with a rough estimate of the hours your remaining subjects need. Our{" "}
          <Link href={PAGES.countdown.path}>Prelims 2027 countdown</Link> does the multiplication for you.
        </li>
        <li>
          <strong>Raise it slowly, if you need to.</strong> Add half an hour a day for a few weeks, and only keep the
          increase if the extra time is focused and your sleep holds.
        </li>
      </ol>
      <Callout title="A useful test">
        <p>
          Could you hit your target on a day when nothing goes especially well: you slept a little badly, a chapter was
          dull, someone needed you for an hour? If not, it is a stretch target. Keep it for good days and plan on
          something lower.
        </p>
      </Callout>

      <h2 id="weekly">Think in weeks, not days</h2>
      <p>
        Daily targets are brittle. A family event, an illness or a slow chapter breaks them, and a broken target
        tempts you to write off the whole day. A weekly target absorbs that. Thirty-six hours across six study days can
        be six hours every day, or seven, five, eight, four, six and six.
      </p>
      <p>
        Weekly totals are also what you should compare. One short day is noise. Three weeks of falling totals is a
        pattern worth acting on.
      </p>

      <h2 id="phases">Different phases, different days</h2>
      <p>
        The kind of hour changes over a preparation, even when the number does not. Early on, most hours go to first
        reading and making notes. Later, more of them go to revision, answer writing and mocks, which are more tiring
        per hour. A day of three full-length mocks and their analysis can be as demanding as ten hours of reading.
      </p>
      <p>
        So keep the total steady, and change the mix. When you move into a revision-heavy phase, protect the revision
        hours first and let new reading take what is left.
      </p>

      <h2 id="job">If you work or study full time</h2>
      <p>
        Many candidates prepare alongside a job or a degree, with two or three hours on a weekday. That is workable,
        but it needs more planning, not less:
      </p>
      <ul>
        <li>Set a weekday minimum you can hit after a tiring day, and put the longer blocks on weekends.</li>
        <li>Use the morning for the hardest material if you can. Evenings suit revision and current affairs better.</li>
        <li>Plan in weekly totals; a late meeting should cost you one session, not your week.</li>
        <li>Protect sleep. Cutting it to find study time tends to cost more focus than it buys.</li>
        <li>
          Be realistic about the timeline. Fewer hours a week means more weeks, and that is a sound plan, not a failure.
        </li>
      </ul>

      <h2 id="too-high">Signs your target is too high</h2>
      <ul>
        <li>You keep sleeping less to reach it.</li>
        <li>Big days are followed by days of almost nothing.</li>
        <li>Your hours are rising but your mock accuracy and revision recall are not.</li>
        <li>Your mood or focus ratings are drifting down week after week.</li>
        <li>You dread the number before the day has started.</li>
      </ul>
      <p>
        Any one of these is a reason to lower the target for a while. Lowering it is not giving up; it is choosing the
        pace that gets you to the exam.
      </p>

      <h2 id="sleep">Sleep is part of the plan</h2>
      <p>
        It is tempting to treat sleep as the reserve you borrow from. The evidence points the other way. A joint
        statement from the American Academy of Sleep Medicine and the Sleep Research Society recommends that adults
        sleep{" "}
        <a href="https://doi.org/10.5665/sleep.4716" rel="noopener">
          seven or more hours a night
        </a>{" "}
        on a regular basis, and research on memory has found that sleep after learning plays a part in{" "}
        <a href="https://doi.org/10.1038/nrn2762" rel="noopener">
          consolidating what you learned
        </a>
        . An hour of study bought with an hour of sleep is often a bad trade.
      </p>
      <p>
        This is general information, not medical advice. If you are struggling to sleep for weeks at a time, talk to a
        doctor.
      </p>

      <h2 id="track">How to track hours honestly</h2>
      <ul>
        <li>Write the hours for each subject at the end of the day, rounded to the half hour.</li>
        <li>Use the same rule for what counts, every day.</li>
        <li>Look at the weekly total and the split by subject, not the single day.</li>
        <li>
          Put hours next to output: topics finished, revisions done, mock results. Hours alone can rise while progress
          stalls.
        </li>
      </ul>
      <p>
        A <Link href={PAGES.daily.path}>daily study tracker</Link> makes this a two-minute job and adds the totals for
        you, and a weekly review turns them into decisions. For the routine around it, read{" "}
        <Link href={postPath("how-to-track-upsc-preparation")}>how to track your UPSC preparation</Link>, and for
        keeping the hours going through a long preparation,{" "}
        <Link href={postPath("consistency-in-upsc-preparation")}>how to stay consistent</Link>.
      </p>
    </>
  );
}
