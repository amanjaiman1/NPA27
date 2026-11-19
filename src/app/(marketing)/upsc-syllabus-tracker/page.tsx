import Link from "next/link";
import { Gauge, Layers, ListTree, Network, Snowflake, SquarePen } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, Faq, FeatureCard, Limits, RelatedLinks, SectionHeading, Steps, type FaqItem } from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { SAMPLE_NOTE, SHOTS } from "@/components/marketing/shots";
import { postPath } from "@/content/blog";
import { TestimonialStrip } from "@/components/marketing/testimonials";

const page = PAGES.syllabus;
export const metadata = pageMetadata(page);

const FAQS: FaqItem[] = [
  {
    q: "Does the tracker cover the whole UPSC syllabus?",
    a: (
      <>
        It starts with a working breakdown of the main areas of GS Papers I to IV, Essay, CSAT and current affairs: 15
        subjects and about a hundred topics, plus your optional. That is a practical map, not UPSC&apos;s official
        wording. Read the syllabus in the latest notification on{" "}
        <a href="https://upsc.gov.in" rel="noopener" className="font-semibold text-accent hover:underline">
          upsc.gov.in
        </a>{" "}
        and add any area or sub-topic you want to track separately.
      </>
    ),
  },
  {
    q: "Can I track my optional subject?",
    a: (
      <>
        Yes. Choose your optional during setup and it is added as its own subject. Sociology comes with a starting list
        of topics. For any other optional you add the topics yourself, in whatever breakdown your booklist or notes use.
      </>
    ),
  },
  {
    q: "How is syllabus completion worked out?",
    a: (
      <>
        Two ways, side by side. The count of topics at each stage (untouched, learning, revised, mastered), and an overall
        confidence figure that averages the confidence of every topic. The same two numbers are shown for each subject
        and each paper, so a strong Polity cannot hide an untouched Science and Technology.
      </>
    ),
  },
  {
    q: "Can I see Mains and Prelims coverage separately?",
    a: (
      <>
        Coverage is shown paper by paper (GS I, II, III and IV, Essay, CSAT, your optional and current affairs), which
        covers the Mains papers and CSAT directly. Prelims GS draws on the same subjects as the GS papers, so there is no
        separate Prelims list to keep in step.
      </>
    ),
  },
  {
    q: "What happens to a topic when I revise it?",
    a: (
      <>
        Each revision you log raises the topic&apos;s confidence and its revision count, and its stage only ever moves
        forward. You can also send any topic to the revision queue straight from the tracker, so it comes back on a
        spaced schedule.
      </>
    ),
  },
];

export default function SyllabusTrackerPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Free UPSC syllabus tracker"
        title="A free UPSC syllabus tracker that shows what is covered and what is slipping"
        intro={
          <p>
            The Civil Services syllabus is long enough that &ldquo;I have done Polity&rdquo; stops meaning much. DoOrDie
            breaks it into topics you mark one at a time, so you can see, paper by paper, what you have studied, what you
            have revised and what you have not opened yet.
          </p>
        }
        cta="cta_syllabus"
        shot={SHOTS.subjects}
        shotCaption={SAMPLE_NOTE}
      />

      <Band labelledBy="inside-title">
        <Container>
          <SectionHeading
            id="inside-title"
            eyebrow="What is inside"
            title="Topic-wise progress, from untouched to mastered"
            intro="Every topic carries its stage, a confidence score from 0 to 100, how many times you have revised it and when you last touched it."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={ListTree} title="Set up for you">
              Fifteen subjects across GS Papers I to IV, Essay, CSAT and current affairs, about a hundred topics in all,
              plus the optional you choose during setup.
            </FeatureCard>
            <FeatureCard icon={Layers} title="Four stages per topic">
              Untouched, learning, revised and mastered. Mark several topics at once, or set a topic&apos;s confidence
              directly when you know exactly where you stand.
            </FeatureCard>
            <FeatureCard icon={Gauge} title="Coverage by paper">
              Topics mastered and average confidence for each paper and subject, plus a single bar that shows the whole
              syllabus at a glance.
            </FeatureCard>
            <FeatureCard icon={Snowflake} title="Weak and cold topics">
              The weakest topics come first, with anything you have got wrong in a mock pulled forward. Topics you have
              not touched for 45 days are flagged before they fade.
            </FeatureCard>
            <FeatureCard icon={SquarePen} title="Yours to edit">
              Add topics, rename them, remove ones you do not need, or add a subject of your own, so the list matches how
              you actually break up the syllabus.
            </FeatureCard>
            <FeatureCard icon={Network} title="Connected to the rest">
              Send a shaky topic to the revision queue in one click. Each successful revision, from the queue or the
              day&apos;s journal entry, raises its confidence here. Related topics are linked across subjects.
            </FeatureCard>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="use-title">
        <Container>
          <SectionHeading
            id="use-title"
            eyebrow="How to use it"
            title="Five minutes to set up, then it keeps itself current"
          />
          <div className="mt-10">
            <Steps
              steps={[
                { title: "Choose your optional", body: "Pick it during setup. If it isn't Sociology, add its topics from your booklist." },
                { title: "Mark what you have already done", body: "Be honest on the first pass. Learning is fine; mastered should mean you could answer a question on it today." },
                { title: "Update as you study", body: "Move a topic on when you finish it, or select several at once. Successful revisions raise its confidence by themselves." },
                { title: "Send weak topics to revision", body: "Anything below a confidence you are comfortable with goes to the revision queue." },
                { title: "Check the papers each week", body: "Look for the paper with the lowest confidence and the most untouched topics, and plan the next week around it." },
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band labelledBy="why-title">
        <Container className="max-w-3xl">
          <SectionHeading id="why-title" eyebrow="Why it matters" title="Why track the syllabus by topic" />
          <Prose className="mt-6">
            <p>
              Ticking off whole subjects hides the gaps that cost marks. Polity can feel finished while Local Government
              and the constitutional bodies have only been read once, months ago. Tracking at topic level makes that
              visible, and a confidence score turns a vague sense of being behind into a list of what to do next.
            </p>
            <p>
              It also keeps revision honest. A topic you studied in the first month and never returned to is a weak topic,
              whatever its stage says. That is why the tracker flags anything untouched for 45 days, and why a topic
              you have made mistakes on in a mock is pulled to the top of the weak list.
            </p>
            <p>
              Finally, it makes weekly planning concrete. If GS Paper III has the lowest confidence and the most untouched
              topics, that is where next week&apos;s new hours go. Our guide on{" "}
              <Link href={postPath("how-to-make-upsc-study-plan")}>making a UPSC study plan</Link> shows how to turn that
              into a week you can follow.
            </p>
          </Prose>
          <div className="mt-10">
            <Limits
              items={[
                "It does not include notes, previous-year questions or a question bank. It tracks the work you do with your own sources.",
                "The built-in topic list is a condensed breakdown of each paper, not the official syllabus text. Add sub-topics if you want finer detail.",
                "There is no separate Prelims checklist. Prelims GS uses the same subjects as the GS papers.",
              ]}
            />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-title" eyebrow="Questions" title="Syllabus tracker questions" />
          <div className="mt-8">
            <Faq items={FAQS} />
          </div>
          <RelatedLinks
            title="Related"
            links={[
              { href: PAGES.revision.path, label: "UPSC revision tracker", description: "Spaced repetition for the topics you mark as shaky." },
              { href: PAGES.daily.path, label: "Daily study tracker", description: "Log topics and hours each day; the syllabus updates from it." },
              { href: postPath("how-to-track-upsc-preparation"), label: "How to track your UPSC preparation", description: "What to record each day and review each week." },
              { href: PAGES.progress.path, label: "UPSC progress tracker", description: "Coverage, hours and mock trends side by side." },
            ]}
          />
        </Container>
      </Band>

      <TestimonialStrip placement="feature" feature="subjects" />

      <CtaBanner track="cta_syllabus_footer" />
    </>
  );
}
