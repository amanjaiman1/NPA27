import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { reviewMarkup } from "@/lib/seo/schema";
import { getPublicReview } from "@/lib/platform/public-content";
import { featureLabel } from "@/lib/platform/content";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Container, CtaBanner } from "@/components/marketing/ui";
import { BadgeRow, StarRow, TeamReply, reviewContext, reviewDate, reviewPath } from "@/components/marketing/review-card";

// Only long reviews (stories) have a page; a short one, a withdrawn one or an
// unknown address is a 404, so there are no thin pages. Built on first visit,
// cached for five minutes, and rebuilt at once when the review changes.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams(): { slug: string }[] {
  return [];
}

const title = (headline: string | null, date: string) => headline ?? `A DoOrDie review from ${reviewDate(date)}`;
const excerpt = (text: string) => (text.length > 155 ? `${text.slice(0, 152).replace(/\s+\S*$/, "")}…` : text);

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const r = await getPublicReview(params.slug);
  if (!r || !r.story) return { title: "Review not found", robots: { index: false, follow: true } };
  return pageMetadata(
    { path: reviewPath(r.slug), title: `${title(r.headline, r.publishedAt)}: a DoOrDie review`, description: excerpt(r.problemBefore ?? r.body ?? "") },
    { type: "article", publishedTime: r.publishedAt },
  );
}

export default async function ReviewPage({ params }: { params: { slug: string } }) {
  const r = await getPublicReview(params.slug);
  if (!r || !r.story) notFound();
  const context = reviewContext(r);
  const answers = [
    { q: "What problem were you trying to solve before using DoOrDie?", a: r.problemBefore },
    { q: "What has been most helpful?", a: r.useful },
    { q: "How has DoOrDie changed the way you organise your preparation?", a: r.changeNote },
    { q: "What would you tell another aspirant considering DoOrDie?", a: r.body },
  ].filter((x): x is { q: string; a: string } => Boolean(x.a));

  return (
    <>
      {r.body && r.displayName !== "A DoOrDie aspirant" && (
        <JsonLd data={reviewMarkup({ name: r.displayName, date: r.publishedAt, headline: r.headline, body: r.body, rating: r.rating, url: reviewPath(r.slug) })} />
      )}
      <article>
        <header className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-aura opacity-60" aria-hidden />
          <Container className="relative max-w-3xl pb-8 pt-8 sm:pt-12">
            <Breadcrumbs
              crumbs={[
                { name: PAGES.reviews.label, path: PAGES.reviews.path },
                { name: title(r.headline, r.publishedAt), path: reviewPath(r.slug) },
              ]}
            />
            <StarRow value={r.rating} className="mt-8" />
            <h1 className="mt-3 text-balance font-display text-[2rem] font-bold leading-[1.1] tracking-tightest text-paper sm:text-[2.6rem]">
              {title(r.headline, r.publishedAt)}
            </h1>
            <p className="mt-4 text-sm text-paper/60">
              <span className="font-semibold text-paper">{r.displayName}</span>
              {context ? ` · ${context}` : ""} · Published {reviewDate(r.publishedAt)}
            </p>
            <BadgeRow badges={r.badges} className="mt-4" />
          </Container>
        </header>
        <Container className="max-w-3xl pb-12">
          <div className="space-y-8">
            {answers.map((x) => (
              <section key={x.q}>
                <h2 className="text-base font-semibold tracking-snugg text-paper">{x.q}</h2>
                <p className="mt-2 whitespace-pre-line break-words text-[1.02rem] leading-relaxed text-paper/75">{x.a}</p>
              </section>
            ))}
            {r.features.length > 0 && (
              <p className="text-sm text-paper/60">
                <span className="font-semibold text-paper">Features used:</span> {r.features.map(featureLabel).join(", ")}
              </p>
            )}
            <TeamReply review={r} />
          </div>
          <Link href={PAGES.reviews.path} className="mt-12 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Every review
          </Link>
        </Container>
      </article>
      <CtaBanner track="cta_review_story_footer" />
    </>
  );
}
