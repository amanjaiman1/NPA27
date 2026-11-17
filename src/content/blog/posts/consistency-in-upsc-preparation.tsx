import Link from "next/link";
import { Callout } from "@/components/marketing/prose";
import { PAGES } from "@/lib/seo/pages";
import { postPath } from "../index";

export const toc = [
  { id: "system", label: "Consistency is a system" },
  { id: "minimum", label: "Define a minimum day" },
  { id: "weekly", label: "Weekly targets absorb bad days" },
  { id: "streaks", label: "Streaks that forgive" },
  { id: "habits", label: "Habits that carry the day" },
  { id: "body", label: "Sleep, movement and energy" },
  { id: "slump", label: "Spot a slump early" },
  { id: "low", label: "When it is more than a slump" },
  { id: "track", label: "Track what keeps you going" },
];

export default function Body() {
  return (
    <>
      <p>
        UPSC preparation usually runs for a year or more, often longer. Over that distance, the steady weeks matter more
        than the heroic ones. Someone who studies a sustainable number of hours almost every week will usually cover
        more, and remember more, than someone who alternates brilliant weeks with lost ones.
      </p>
      <p>
        Consistency is often treated as a personality trait: some people have it, others do not. It is more useful to
        treat it as a system you design. This guide covers the parts of that system.
      </p>

      <h2 id="system">Consistency is a system, not willpower</h2>
      <p>
        Willpower is unreliable. It runs low on bad days, which are exactly the days that decide whether you stay
        consistent. A good system needs less of it: it makes the next action obvious, makes a bad day easy to survive,
        and shows you early when things are slipping.
      </p>

      <h2 id="minimum">Define a minimum day</h2>
      <p>
        Decide, in advance, the smallest day that still counts. For example: the revisions due today, one hour on your
        main subject, and the newspaper. On a good day you do far more. On a bad day you do only the minimum, and the day
        still counts.
      </p>
      <p>
        The minimum day protects the two things that are hardest to restart: the habit of sitting down, and the revision
        queue. Missing a few days of new reading is recoverable. Letting revisions pile up for a week is much harder to
        undo.
      </p>

      <h2 id="weekly">Weekly targets absorb bad days</h2>
      <p>
        A daily target turns every bad day into a failure. A weekly target turns it into a smaller total that the other
        days can make up. Set your hours and topic targets for the week, and treat each day as a contribution rather than
        a test. Our guide on{" "}
        <Link href={postPath("how-many-hours-to-study-for-upsc")}>how many hours to study</Link> covers choosing a target
        you can sustain.
      </p>

      <h2 id="streaks">Streaks that forgive</h2>
      <p>
        A visible run of study days is motivating. It is also fragile: break a long streak and it is tempting to write
        off the week. Two ways to keep streaks helpful:
      </p>
      <ul>
        <li>
          <strong>Count days with some study, not perfect days.</strong> A minimum day keeps the streak alive, which is
          exactly the point.
        </li>
        <li>
          <strong>Never miss twice.</strong> A rule popularised by James Clear in <em>Atomic Habits</em>: missing one day
          is an accident, missing two starts a new habit. When a streak breaks, make the next day a minimum day.
        </li>
      </ul>
      <Callout title="The streak is a nudge, not the goal">
        <p>
          If keeping a streak alive starts to push out sleep, or makes you log hours you did not really study, it has
          stopped helping. The goal is the preparation, not the number.
        </p>
      </Callout>

      <h2 id="habits">Habits that carry the day</h2>
      <p>
        A few small habits do a lot of the work of consistency, because they remove decisions:
      </p>
      <ul>
        <li>
          <strong>A fixed start time.</strong> Starting is the hardest part of most days. A set time, and a set first
          task, makes it automatic.
        </li>
        <li>
          <strong>Revision first.</strong> The day&apos;s due revisions before anything new. They take less willpower to
          start than a fresh chapter, and they get the day moving.
        </li>
        <li>
          <strong>The newspaper at the same time each day.</strong> Current affairs is the one subject that grows every
          day; a fixed slot keeps it from piling up.
        </li>
        <li>
          <strong>A five-minute log at the end.</strong> Writing down the day closes it, and makes tomorrow&apos;s first
          step clear.
        </li>
      </ul>
      <p>
        Track two or three habits at most. More than that and the tracking becomes the habit.
      </p>

      <h2 id="body">Sleep, movement and energy</h2>
      <p>
        Long preparations are physical as well as mental. Irregular sleep, no exercise and long days indoors make
        focus harder, and focus is what turns hours into progress. Adults are generally advised to sleep{" "}
        <a href="https://doi.org/10.5665/sleep.4716" rel="noopener">
          seven or more hours a night
        </a>
        , and a regular wake-up time is often the simplest anchor for the whole day. A short walk or some exercise
        breaks up a long stretch of sitting.
      </p>
      <p>
        If you log sleep and mood alongside study hours, patterns appear quickly: many people find their worst study days
        follow their shortest nights. Seeing it in your own numbers is more persuasive than any advice.
      </p>

      <h2 id="slump">Spot a slump early</h2>
      <p>Slumps rarely arrive suddenly. Watch for these signs in your weekly review:</p>
      <ul>
        <li>Weekly hours falling for three weeks in a row.</li>
        <li>The revision queue growing week on week.</li>
        <li>Mood or focus ratings drifting down.</li>
        <li>More days with almost nothing logged, often in a cluster.</li>
        <li>Starting the day later and later.</li>
      </ul>
      <p>
        Any of these is a cue to adjust before the slump deepens: lower the weekly target for a fortnight, return to
        minimum days, fix sleep, or take a planned rest day. A planned rest is very different from a lost week. The{" "}
        <Link href={PAGES.weeklyReview.path}>weekly review template</Link> has space for exactly these checks.
      </p>

      <h2 id="low">When it is more than a slump</h2>
      <p>
        Long preparation is hard, and low stretches are common. If low mood, anxiety or exhaustion last for weeks, or
        start affecting sleep, appetite or daily life, talk to someone you trust and consider speaking to a professional.
        In India, the government&apos;s{" "}
        <a href="https://telemanas.mohfw.gov.in" rel="noopener">
          Tele-MANAS
        </a>{" "}
        mental health helpline is free and available around the clock on 14416 or 1-800-891-4416. Looking after yourself
        is part of the preparation, not a break from it.
      </p>

      <h2 id="track">Track what keeps you going</h2>
      <p>
        The point of tracking consistency is to see the pattern while you can still change it. A{" "}
        <Link href={PAGES.daily.path}>daily study tracker</Link> with a heatmap makes a slipping week visible at a
        glance, a habit tracker keeps two or three small disciplines on the page, and a weekly review turns the numbers
        into the next adjustment. DoOrDie does all three, and logs sleep and mood next to your hours if you want it to.
        For the wider routine, read{" "}
        <Link href={postPath("how-to-track-upsc-preparation")}>how to track your UPSC preparation</Link>.
      </p>
    </>
  );
}
