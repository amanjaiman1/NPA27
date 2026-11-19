import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { getChangelogEntry } from "@/lib/platform/public-content";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Container, CtaBanner } from "@/components/marketing/ui";
import { ChangelogEntryView } from "@/components/platform/changelog-entry";

// Built the first time someone opens an entry, then cached for five minutes,
// or until the team publishes, edits or unpublishes it. Drafts and entries
// scheduled for later don't exist here: the database never returns them.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams(): { slug: string }[] {
  return [];
}

const pathOf = (slug: string) => `${PAGES.changelog.path}/${slug}`;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const entry = await getChangelogEntry(params.slug);
  if (!entry) return { title: "Update not found", robots: { index: false, follow: true } };
  return pageMetadata(
    { path: pathOf(entry.slug), title: entry.seoTitle || entry.title, description: entry.seoDescription || entry.summary },
    { type: "article", publishedTime: entry.publishedAt ?? undefined },
  );
}

export default async function ChangelogEntryPage({ params }: { params: { slug: string } }) {
  const entry = await getChangelogEntry(params.slug);
  if (!entry) notFound();
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-aura opacity-60" aria-hidden />
        <Container className="relative max-w-3xl pb-16 pt-8 sm:pt-12">
          <Breadcrumbs
            crumbs={[
              { name: PAGES.changelog.label, path: PAGES.changelog.path },
              { name: entry.title, path: pathOf(entry.slug) },
            ]}
          />
          <div className="mt-8">
            <ChangelogEntryView entry={entry} full headingLevel={1} />
          </div>
          <Link href={PAGES.changelog.path} className="mt-12 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Every update
          </Link>
        </Container>
      </section>
      <CtaBanner track="cta_changelog_entry_footer" />
    </>
  );
}
