import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardList, Repeat } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, SectionHeading } from "@/components/marketing/ui";
import { POSTS, postPath } from "@/content/blog";

const page = PAGES.resources;
export const metadata = pageMetadata(page);

const TOOLS = [
  {
    page: PAGES.countdown,
    icon: CalendarClock,
    body: "Days left until Prelims on 23 May 2027, the CSE 2027 schedule, and a planner that turns the days into study hours.",
  },
  {
    page: PAGES.revisionCalculator,
    icon: Repeat,
    body: "Six spaced revision dates for any topic, from the day you studied it, ready to download to your calendar.",
  },
  {
    page: PAGES.weeklyReview,
    icon: ClipboardList,
    body: "A printable one-page review: hours, subjects, revision, mocks, mistakes by type, and next week's focus.",
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Free tools"
        title="Free UPSC preparation tools"
        intro={
          <p>
            Small, useful tools for organising your preparation. They work in your browser without an account, and
            nothing you type into them is stored or sent.
          </p>
        }
      />

      <Band className="pt-0 sm:pt-0">
        <Container>
          <ul className="grid gap-4 md:grid-cols-3">
            {TOOLS.map(({ page: p, icon: Icon, body }) => (
              <li key={p.path}>
                <Link
                  href={p.path}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-4 text-lg font-bold tracking-snugg text-paper group-hover:text-accent">{p.label}</span>
                  <span className="mt-2 flex-1 text-sm leading-relaxed text-paper/65">{body}</span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                    Open the tool <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="guides-title">
        <Container>
          <SectionHeading
            id="guides-title"
            eyebrow="Guides"
            title="Read alongside the tools"
            intro="Each guide explains a method in full, from what to record each day to how to review a mock."
          />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {POSTS.map((post) => (
              <li key={post.slug}>
                <Link
                  href={postPath(post.slug)}
                  className="flex h-full items-start justify-between gap-4 rounded-2xl border border-line bg-card p-5 shadow-soft transition-colors hover:border-accent/35"
                >
                  <span>
                    <span className="block font-semibold text-paper">{post.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-paper/60">{post.excerpt}</span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Band>

      <CtaBanner />
    </>
  );
}
