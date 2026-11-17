import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { blogPosting } from "@/lib/seo/schema";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Container, CtaBanner, Eyebrow, RelatedLinks } from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { POSTS, findPost, postPath } from "@/content/blog";
import { BODIES } from "@/content/blog/bodies";
import { longDate } from "@/content/upsc-calendar";

/** Only the guides that exist; anything else is a real 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = findPost(params.slug);
  if (!post) return {};
  return pageMetadata(
    { path: postPath(post.slug), title: post.title, description: post.description },
    { type: "article", publishedTime: post.published, modifiedTime: post.updated },
  );
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const post = findPost(params.slug);
  const body = post ? BODIES[post.slug] : undefined;
  if (!post || !body) notFound();
  const { Body, toc } = body;
  const path = postPath(post.slug);
  const feature = PAGES[post.feature];
  const others = POSTS.filter((p) => p.slug !== post.slug)
    .sort((a, b) => Number(b.topic === post.topic) - Number(a.topic === post.topic))
    .slice(0, 3);

  return (
    <>
      <article>
        <header className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-aura opacity-60" aria-hidden />
          <Container className="relative max-w-3xl pb-8 pt-8 sm:pt-12">
            <Breadcrumbs
              crumbs={[
                { name: PAGES.blog.label, path: PAGES.blog.path },
                { name: post.title, path },
              ]}
            />
            <Eyebrow className="mt-8">{post.topic}</Eyebrow>
            <h1 className="mt-3 text-balance font-display text-[2rem] font-bold leading-[1.1] tracking-tightest text-paper sm:text-[2.75rem]">
              {post.title}
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-paper/70">{post.description}</p>
            <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-paper/55">
              <span>
                By{" "}
                <Link href={PAGES.about.path} className="font-semibold text-paper/75 hover:text-paper">
                  DoOrDie
                </Link>
              </span>
              <span aria-hidden>·</span>
              <span>
                Published <time dateTime={post.published}>{longDate(post.published)}</time>
              </span>
              {post.updated !== post.published && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    Updated <time dateTime={post.updated}>{longDate(post.updated)}</time>
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>{post.readingMinutes} min read</span>
            </p>
          </Container>
        </header>

        <Container className="max-w-3xl pb-8">
          {toc.length > 0 && (
            <nav aria-label="In this guide" className="rounded-2xl border border-line bg-card p-5 shadow-soft">
              <p className="text-sm font-semibold text-paper">In this guide</p>
              <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                {toc.map((t, i) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="text-paper/65 hover:text-accent">
                      <span className="tabular mr-1.5 text-paper/40">{i + 1}.</span>
                      {t.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <Prose className="mt-10">
            <Body />
          </Prose>

          <aside className="mt-12 rounded-2xl border border-line bg-paper/[0.03] p-5 text-sm leading-relaxed text-paper/65">
            <p className="font-semibold text-paper">About this guide</p>
            <p className="mt-1.5">
              Published by DoOrDie, an independent UPSC preparation tracker. Exam rules and dates are checked against
              UPSC&apos;s own documents, which are linked where they are used. UPSC can change its rules, so confirm
              anything important on{" "}
              <a href="https://upsc.gov.in" rel="noopener" className="font-semibold text-accent hover:underline">
                upsc.gov.in
              </a>
              . Spotted a mistake?{" "}
              <Link href={PAGES.contact.path} className="font-semibold text-accent hover:underline">
                Tell us
              </Link>
              .
            </p>
          </aside>

          <RelatedLinks
            title="Read next"
            links={[
              { href: feature.path, label: feature.label, description: feature.description },
              ...others.map((p) => ({ href: postPath(p.slug), label: p.title, description: p.excerpt })),
            ]}
          />
        </Container>
        <JsonLd
          data={blogPosting({
            path,
            title: post.title,
            description: post.description,
            published: post.published,
            updated: post.updated,
          })}
        />
      </article>
      <CtaBanner track={`cta_article_${post.slug}`} />
    </>
  );
}
