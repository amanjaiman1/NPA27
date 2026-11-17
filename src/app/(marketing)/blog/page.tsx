import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES, RESOURCE_PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner } from "@/components/marketing/ui";
import { POSTS, postPath } from "@/content/blog";
import { longDate } from "@/content/upsc-calendar";

const page = PAGES.blog;
export const metadata = pageMetadata(page);

export default function GuidesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Guides"
        title="UPSC preparation guides"
        intro={
          <p>
            Practical methods for running a long preparation: what to track, how many hours to plan, how to revise, how
            to review a mock and how to keep going. Each one is written to be used, not just read.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {POSTS.map((post) => (
              <li key={post.slug}>
                <article className="flex h-full flex-col rounded-2xl border border-line bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35">
                  <p className="eyebrow">{post.topic}</p>
                  <h2 className="mt-2 font-display text-xl font-bold leading-snug tracking-snugg text-paper">
                    <Link href={postPath(post.slug)} className="hover:text-accent">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-paper/65">{post.excerpt}</p>
                  <p className="mt-4 text-xs text-paper/50">
                    <time dateTime={post.updated}>{longDate(post.updated)}</time> · {post.readingMinutes} min read
                  </p>
                </article>
              </li>
            ))}
          </ul>
          <div className="mt-12 rounded-2xl border border-line bg-paper/[0.03] p-6">
            <h2 className="font-display text-lg font-bold tracking-snugg text-paper">Free tools to use with these guides</h2>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {RESOURCE_PAGES.map((r) => (
                <li key={r.path}>
                  <Link href={r.path} className="font-semibold text-accent hover:underline">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Band>
      <CtaBanner />
    </>
  );
}
