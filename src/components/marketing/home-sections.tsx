/* The home page's trust narrative, after the product itself: try it with a
   sample account, what changed lately and why, and what's available today.
   Server components. Nothing here counts users or invents a number: the
   changes are the published changelog, and the status is the list in
   content/product-status.ts. */

import Link from "next/link";
import { ArrowRight, CheckCircle2, FlaskConical } from "lucide-react";
import { PAGES } from "@/lib/seo/pages";
import { CHANGELOG_CATEGORY } from "@/lib/platform/content";
import type { PublicChangelog } from "@/lib/platform/public-content";
import type { YouAskedItem } from "@/lib/platform/types";
import { DEMO_STEPS, SAMPLE_NAME } from "@/lib/demo/guide";
import { PRODUCT_MODULES, statusCounts } from "@/content/product-status";
import { CHANGELOG_ICON, changelogDate } from "@/components/platform/changelog-entry";
import { YouAskedList } from "@/components/platform/you-asked";
import { Band, ButtonLink, Container, SectionHeading } from "./ui";
import { StartDemo } from "./start-demo";

/** "Try it before you sign up": the demo, from the home page. */
export function DemoInvite({ tone = "plain" }: { tone?: "plain" | "raised" }) {
  return (
    <Band tone={tone} labelledBy="demo-title">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-line bg-card px-6 py-10 shadow-lift sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-aura opacity-60" aria-hidden />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="eyebrow flex items-center gap-1.5 text-accent">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Interactive demo
              </p>
              <h2 id="demo-title" className="mt-3 text-balance font-display text-[1.75rem] font-bold leading-[1.15] tracking-tightest text-paper sm:text-[2.1rem]">
                Try it before you sign up
              </h2>
              <p className="mt-3 text-pretty text-[0.98rem] leading-relaxed text-paper/70">
                Open the real app with {SAMPLE_NAME}&apos;s made-up preparation in it and change whatever you like. Nothing is
                saved, and there&apos;s no form to fill in.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <StartDemo />
                <ButtonLink href={PAGES.demo.path} variant="ghost" track="home_demo_details">
                  What&apos;s in the demo
                </ButtonLink>
              </div>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2" aria-label="The demo's guided tour">
              {DEMO_STEPS.map((s, i) => (
                <li key={s.path} className="flex items-center gap-2.5 rounded-2xl border border-line bg-paper/[0.03] px-3.5 py-2.5 text-sm text-paper/75">
                  <span className="tabular font-display text-xs font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {s.page}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </Band>
  );
}

/** The latest published changes, and the feedback behind them. Nothing at all until something is published. */
export function RecentImprovements({
  changelog,
  asked,
  tone = "raised",
}: {
  changelog: PublicChangelog;
  asked: YouAskedItem[];
  tone?: "plain" | "raised";
}) {
  const latest = changelog.items.slice(0, 3);
  if (!latest.length) return null;
  return (
    <Band tone={tone} labelledBy="improvements-title">
      <Container>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeading
            id="improvements-title"
            eyebrow="Recent improvements"
            title="What changed lately"
            intro="Every update goes in the changelog, newest first, with what changed and why it matters."
          />
          <Link href={PAGES.changelog.path} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            The full changelog <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {latest.map((e) => {
            const Icon = CHANGELOG_ICON[e.category];
            return (
              <li key={e.slug} className="min-w-0">
                <Link
                  href={`${PAGES.changelog.path}/${e.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35"
                >
                  <span className="flex items-center gap-2 text-xs text-paper/55">
                    <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                    {CHANGELOG_CATEGORY.label[e.category]} · {changelogDate(e.publishedAt)}
                  </span>
                  <span className="mt-2 font-semibold leading-snug tracking-snugg text-paper group-hover:text-accent">{e.title}</span>
                  <span className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-paper/65">{e.whyItMatters ?? e.summary}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {asked.length > 0 && (
          <div className="mt-10">
            <h3 className="font-display text-lg font-bold tracking-tightest text-paper">You asked. We improved.</h3>
            <p className="mt-1 text-sm text-paper/60">Themes from students&apos; feedback, in our words. Who asked stays private.</p>
            <div className="mt-4">
              <YouAskedList items={asked.slice(0, 3)} compact />
            </div>
          </div>
        )}
      </Container>
    </Band>
  );
}

/** What's available today, from the same list as the Trust Center. */
export function ProductStatusBand({ tone = "plain" }: { tone?: "plain" | "raised" }) {
  const counts = statusCounts();
  const allAvailable = counts.available === PRODUCT_MODULES.length;
  return (
    <Band tone={tone} labelledBy="status-title">
      <Container>
        <SectionHeading
          id="status-title"
          eyebrow="Product status"
          title="What's available today"
          intro={
            allAvailable
              ? `All ${PRODUCT_MODULES.length} parts of DoOrDie are available to every account, free, with nothing in beta or still being built.`
              : `${counts.available} of ${PRODUCT_MODULES.length} parts of DoOrDie are available to every account, free. The Trust Center says where the rest stand.`
          }
        />
        <ul className="mt-8 flex flex-wrap gap-2">
          {PRODUCT_MODULES.map((m) => (
            <li key={m.key} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-paper/75 shadow-soft">
              <CheckCircle2 className={m.status === "available" ? "h-3.5 w-3.5 text-positive" : "h-3.5 w-3.5 text-paper/35"} aria-hidden />
              {m.name}
            </li>
          ))}
        </ul>
        <Link href={`${PAGES.trust.path}#status`} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          Feature status in the Trust Center <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Container>
    </Band>
  );
}
