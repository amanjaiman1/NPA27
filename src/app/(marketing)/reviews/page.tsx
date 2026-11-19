import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { reviewedApplication, type MarkedReview } from "@/lib/seo/schema";
import { getPublicReviews, getPublicSite, type PublicReviews } from "@/lib/platform/public-content";
import { BADGE_MEANING, featureLabel } from "@/lib/platform/content";
import { JsonLd } from "@/components/seo/json-ld";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner, Limits, SectionHeading } from "@/components/marketing/ui";
import { NoReviewsYet, StarRow, TestimonialCard, reviewContext, reviewDate, reviewPath } from "@/components/marketing/review-card";
import { ReviewExplorer } from "@/components/marketing/review-explorer";

const page = PAGES.reviews;
export const metadata = pageMetadata(page);
// Rebuilt at most every five minutes, and at once when a review is published, hidden or withdrawn.
export const revalidate = 300;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const ANONYMOUS = "A DoOrDie aspirant";

/** The headline figures, only from published reviews, and only once there are enough of them. */
function Figures({ reviews }: { reviews: PublicReviews }) {
  if (reviews.averageRating === null || !reviews.distribution) {
    return (
      <p className="rounded-2xl border border-line bg-card px-5 py-4 text-sm leading-relaxed text-paper/70 shadow-soft">
        <span className="font-semibold text-paper">
          {reviews.total} published {reviews.total === 1 ? "experience" : "experiences"} so far.
        </span>{" "}
        An average rating appears once {reviews.minForAggregate} are published, so a handful of ratings can&apos;t give the wrong idea.
      </p>
    );
  }
  const dist = reviews.distribution;
  const features = Object.entries(reviews.featureCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return (
    <div className="grid gap-4 rounded-2xl border border-line bg-card p-6 shadow-soft md:grid-cols-[auto_1fr_1fr] md:items-center md:gap-8">
      <div>
        <p className="font-display text-5xl font-bold tracking-tightest text-paper">{reviews.averageRating.toFixed(1)}</p>
        <StarRow value={Math.round(reviews.averageRating)} className="mt-1" />
        <p className="mt-1 text-xs text-paper/55">from all {reviews.total} published reviews</p>
      </div>
      <ul className="space-y-1.5" aria-label="How many reviews gave each rating">
        {(["5", "4", "3", "2", "1"] as const).map((k) => (
          <li key={k} className="flex items-center gap-2 text-xs text-paper/65">
            <span className="w-12 shrink-0">{k} {k === "1" ? "star" : "stars"}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/[0.08]">
              <span className="block h-full rounded-full bg-warning" style={{ width: `${(dist[k] / reviews.total) * 100}%` }} />
            </span>
            <span className="tabular w-6 text-right">{dist[k]}</span>
          </li>
        ))}
      </ul>
      {features.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-paper/70">Features reviewers used most</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {features.map(([f, n]) => (
              <li key={f} className="rounded-full border border-line px-2.5 py-1 text-xs text-paper/70">
                {featureLabel(f)} · {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function ReviewsPage() {
  const [reviews, site] = await Promise.all([getPublicReviews(200), getPublicSite()]);
  const featured = reviews.items.filter((r) => r.featured).slice(0, 3);
  const stories = reviews.items.filter((r) => r.story && !r.featured).slice(0, 4);
  const aggregate = reviews.averageRating !== null ? { average: reviews.averageRating, count: reviews.total } : null;
  const marked: MarkedReview[] = reviews.items
    .filter((r) => r.body && r.displayName !== ANONYMOUS)
    .slice(0, 10)
    .map((r) => ({ name: r.displayName, date: r.publishedAt, headline: r.headline, body: r.body as string, rating: r.rating, url: r.story ? reviewPath(r.slug) : undefined }));
  const rules = site.reviewRules;
  const verification = site.verification;

  return (
    <>
      {reviews.total > 0 && <JsonLd data={reviewedApplication(aggregate, marked)} />}
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Reviews"
        title="Real Aspirants. Real Experiences."
        intro={
          <p>
            Discover how students are organising their UPSC preparation with DoOrDie.{" "}
            {reviews.total > 0
              ? `${reviews.total} published ${reviews.total === 1 ? "experience" : "experiences"}, newest first, whatever their rating.`
              : null}
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="space-y-14">
          {reviews.total === 0 ? (
            <NoReviewsYet minDays={rules?.minDays} minUsageDays={rules?.minUsageDays} />
          ) : (
            <>
              <Figures reviews={reviews} />
              {featured.length > 0 && (
                <section aria-labelledby="featured-title">
                  <SectionHeading
                    id="featured-title"
                    title="Featured experiences"
                    intro="Chosen by the team for being detailed and useful to someone deciding, never for their rating."
                  />
                  <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {featured.map((r) => (
                      <li key={r.slug} className="min-w-0">
                        <TestimonialCard review={r} featured />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {stories.length > 0 && (
                <section aria-labelledby="stories-title">
                  <SectionHeading id="stories-title" title="Student stories" intro="Longer experiences, each with a page of its own." />
                  <ul className="mt-6 grid gap-4 md:grid-cols-2">
                    {stories.map((r) => (
                      <li key={r.slug} className="min-w-0">
                        <Link
                          href={reviewPath(r.slug)}
                          className="group flex h-full flex-col rounded-2xl border border-line bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35"
                        >
                          <StarRow value={r.rating} size="sm" />
                          <span className="mt-3 font-display text-lg font-bold leading-snug tracking-snugg text-paper group-hover:text-accent">
                            {r.headline ?? `An experience from ${reviewDate(r.publishedAt)}`}
                          </span>
                          <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-paper/65">{r.problemBefore ?? r.body}</span>
                          <span className="mt-4 text-xs text-paper/55">
                            {r.displayName}
                            {reviewContext(r) ? ` · ${reviewContext(r)}` : ""} · {reviewDate(r.publishedAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <ReviewExplorer reviews={reviews.items} />
            </>
          )}
        </Container>
      </Band>

      <Band tone="raised" labelledBy="badges-title">
        <Container>
          <SectionHeading
            id="badges-title"
            eyebrow="Verification"
            title="What the badges mean"
            intro="Badges are worked out by the database from each account's own records when a review is published. Nobody can give one to themselves, and moderators can't add or remove them."
          />
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              { ...BADGE_MEANING.verifiedUser, extra: rules ? `Today that's ${days(rules.minDays)} since the first record, with records on ${days(rules.minUsageDays)}.` : null },
              { ...BADGE_MEANING.activeUser, extra: verification ? `Today that's records on at least ${days(verification.activeDays)}.` : null },
              { ...BADGE_MEANING.features, extra: null },
              { ...BADGE_MEANING.established, extra: verification ? `Today that's an account at least ${days(verification.establishedDays)} old.` : null },
            ].map((b) => (
              <div key={b.label} className="rounded-2xl border border-line bg-card p-5 shadow-soft">
                <dt className="font-semibold text-paper">{b.label}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-paper/65">
                  {b.meaning} {b.extra}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm leading-relaxed text-paper/60">
            A badge confirms that a real account wrote the review and used DoOrDie. It doesn&apos;t mean anyone has checked
            each thing the review says. Badges never show how much anyone studied.
          </p>
        </Container>
      </Band>
      <Band labelledBy="how-reviews-title">
        <Container>
          <h2 id="how-reviews-title" className="sr-only">
            How reviews work
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Limits
              title="How reviews get here"
              items={[
                rules
                  ? `Only signed-in students can write one, once ${days(rules.minDays)} have passed since their first record and they have records on at least ${days(rules.minUsageDays)}. Signing up long ago isn't enough on its own.`
                  : "Only signed-in students can write one, and only after using DoOrDie on several different days.",
                "A moderator checks each one for spam, abuse and personal details. A review is never turned down for being critical, and never edited.",
                "It appears only if its author agreed to that, and comes down as soon as they change their mind or withdraw it. If they edit it, a moderator looks again.",
              ]}
            />
            <Limits
              title="What we don't do"
              items={[
                "Pick reviews by their rating, or leave low ones out of the average.",
                "Pay for reviews, offer anything in return for one, or write any ourselves.",
                <>
                  Show anything from a student&apos;s preparation records. How reviews are handled is in the{" "}
                  <Link href={PAGES.privacy.path} className="font-semibold text-accent hover:underline">
                    privacy policy
                  </Link>
                  .
                </>,
              ]}
            />
          </div>
        </Container>
      </Band>
      <CtaBanner track="cta_reviews_footer" />
    </>
  );
}
