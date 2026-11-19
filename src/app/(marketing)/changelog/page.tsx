import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { getPublicChangelog, getYouAsked } from "@/lib/platform/public-content";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner } from "@/components/marketing/ui";
import { ChangelogEntryView } from "@/components/platform/changelog-entry";
import { YouAskedList } from "@/components/platform/you-asked";

const page = PAGES.changelog;
export const metadata = pageMetadata(page);
// Rebuilt at most every five minutes, and at once when an entry is published or changed.
export const revalidate = 300;

export default async function ChangelogPage() {
  const [log, asked] = await Promise.all([getPublicChangelog(50), getYouAsked(6)]);
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Changelog"
        title="What's new in DoOrDie"
        intro={
          <p>
            Every update, newest first: new features, improvements, fixes, accessibility, and the work on speed and security you
            don&apos;t see. Where an update came from students&apos; suggestions, it says so.
          </p>
        }
      />
      {asked.length > 0 && (
        <Band className="pt-0 sm:pt-0" labelledBy="you-asked-title">
          <Container className="max-w-3xl">
            <h2 id="you-asked-title" className="font-display text-2xl font-bold tracking-tightest text-paper">
              You asked. We improved.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-paper/65">
              Themes from students&apos; feedback, in our words, beside the change that answered them. Who asked, and what they
              wrote, stays private.
            </p>
            <div className="mt-6">
              <YouAskedList items={asked} />
            </div>
          </Container>
        </Band>
      )}
      <Band className="pt-0 sm:pt-0" labelledBy="all-updates-title">
        <Container className="max-w-3xl">
          <h2 id="all-updates-title" className="sr-only">
            Every update
          </h2>
          {log.items.length ? (
            <ol className="relative space-y-10 border-l border-line pl-6 sm:pl-8">
              {log.items.map((entry) => (
                <li key={entry.id} className="relative">
                  <span aria-hidden className="absolute -left-[1.94rem] top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-ink sm:-left-[2.44rem]" />
                  <ChangelogEntryView entry={{ ...entry, body: "" }} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-paper/[0.02] px-6 py-14 text-center">
              <p className="text-base font-semibold text-paper">Nothing here yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-paper/60">
                The first entry appears with the next update to DoOrDie.
              </p>
            </div>
          )}
          {log.total > log.items.length && (
            <p className="mt-10 text-sm text-paper/55">
              The newest {log.items.length} of {log.total} updates.
            </p>
          )}
        </Container>
      </Band>
      <CtaBanner track="cta_changelog_footer" />
    </>
  );
}
