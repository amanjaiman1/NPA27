import Link from "next/link";
import { BellOff, Eye, FlaskConical, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { DEMO_STEPS, SAMPLE_NAME } from "@/lib/demo/guide";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, ButtonLink, Container, CtaBanner, Faq, SectionHeading, Steps } from "@/components/marketing/ui";
import { LeftDemoNote, StartDemo } from "@/components/marketing/start-demo";

const page = PAGES.demo;
export const metadata = pageMetadata(page);

const FACTS: { icon: React.ElementType; title: string; body: React.ReactNode }[] = [
  {
    icon: FlaskConical,
    title: "Made-up data",
    body: `${SAMPLE_NAME} isn't a real person. Every day, score and note in the sample was invented for the demo.`,
  },
  {
    icon: RotateCcw,
    title: "Nothing is saved",
    body: "Log a day, tick off a plan, change a setting: it all works, and it's all discarded when you leave the demo or close the tab.",
  },
  {
    icon: UserRound,
    title: "Your account stays as it is",
    body: "Signed in already? The demo opens in this tab only, without touching your records, and your own account is back when you exit.",
  },
  {
    icon: BellOff,
    title: "A few things wait for an account",
    body: "Reminders, attachments, sync, feedback and reviews need a real account, so the demo shows where they are but doesn't send anything.",
  },
];

export default function DemoPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Interactive demo"
        title="Try DoOrDie with a sample account"
        intro={
          <p>
            The real app, with months of {SAMPLE_NAME}&apos;s made-up preparation already in it: journal days, the syllabus,
            revision, mocks, a plan for the week and the Study Coach. Change anything you like. Nothing is saved, and there&apos;s
            nothing to sign up for.
          </p>
        }
        actions={
          <>
            <LeftDemoNote />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <StartDemo />
              <ButtonLink href="/signup" variant="ghost" track="demo_signup_hero">
                Create a free account instead
              </ButtonLink>
            </div>
            <p className="mt-3 text-xs text-paper/50">Opens in this tab. A bar at the top of every page says it&apos;s the demo, with the way out.</p>
          </>
        }
      />

      <Band className="pt-0 sm:pt-0" labelledBy="tour-title">
        <Container>
          <SectionHeading
            id="tour-title"
            eyebrow="The guided tour"
            title="Seven stops through the app"
            intro="A small guide in the corner takes you through them, one page at a time, with one thing to try on each. Hide it whenever you'd rather look around."
          />
          <div className="mt-8">
            <Steps steps={DEMO_STEPS.map((s) => ({ title: `${s.page}: ${s.title.toLowerCase()}`, body: s.body }))} />
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="how-demo-title">
        <Container>
          <SectionHeading id="how-demo-title" eyebrow="How the demo works" title="Explore freely. Nothing sticks." />
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {FACTS.map((f) => (
              <li key={f.title} className="flex gap-4 rounded-2xl border border-line bg-card p-5 shadow-soft">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                  <f.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold tracking-snugg text-paper">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-paper/65">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Band>

      <Band labelledBy="demo-faq-title">
        <Container className="max-w-3xl">
          <SectionHeading id="demo-faq-title" eyebrow="Questions" title="About the demo" />
          <div className="mt-8">
            <Faq
              items={[
                {
                  q: "Is this the real app?",
                  a: "Yes. The demo runs the same pages as a real account, at the same addresses. Only the data is different: a sample, held in this browser tab's memory.",
                },
                {
                  q: "What happens to what I change?",
                  a: "It stays while you're in the demo, then it's thrown away when you exit or close the tab. It's never written to your browser's storage or sent to our servers.",
                },
                {
                  q: "Can I keep the sample when I sign up?",
                  a: "No. A new account starts empty, so everything in it is yours. Setting it up takes a few minutes.",
                },
                {
                  q: "Does the demo see my own account?",
                  a: (
                    <>
                      No. While it&apos;s open, no account is loaded in that tab, and anything that would use one (sync, reminders,
                      files, messages, reviews, deleting an account) is switched off. How your data is handled is in the{" "}
                      <Link href={PAGES.trust.path} className="font-semibold text-accent hover:underline">
                        Trust Center
                      </Link>
                      .
                    </>
                  ),
                },
              ]}
            />
          </div>
          <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-line bg-card p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-paper/70">
              <Eye className="h-4 w-4 text-accent" aria-hidden /> Ready to look around?
            </p>
            <StartDemo label="Open the demo" />
          </div>
          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-paper/50">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            The demo needs JavaScript, like the app itself.
          </p>
        </Container>
      </Band>

      <CtaBanner
        title="Start your own preparation record"
        body="A free account starts empty, belongs to you alone, and can be downloaded or deleted whenever you like."
        track="cta_demo_footer"
        secondary={{ href: PAGES.trust.path, label: "How your data is handled" }}
      />
    </>
  );
}
