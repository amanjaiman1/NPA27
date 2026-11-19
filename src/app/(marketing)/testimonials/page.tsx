import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { getPublicReviews, getPublicSite } from "@/lib/platform/public-content";
import { PageHero } from "@/components/marketing/page-hero";
import { StarRow, TestimonialCard } from "@/components/marketing/testimonials";
import { Band, Container, CtaBanner, Limits } from "@/components/marketing/ui";

const page = PAGES.testimonials;
export const metadata = pageMetadata(page);
// Rebuilt at most every five minutes, and at once when a review is published, hidden or withdrawn.
export const revalidate = 300;

const SHOWN = 60;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export default async function TestimonialsPage() {
  const [reviews, site] = await Promise.all([getPublicReviews(SHOWN), getPublicSite()]);
  const rules = site.reviewRules;
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Reviews"
        title="What aspirants say about DoOrDie"
        intro={
          <p>
            Every review here was written by a student with a DoOrDie account, after real use, and is published exactly as they
            wrote it. The newest come first, whatever their rating.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container>
          {reviews.items.length ? (
            <>
              <p className="flex flex-wrap items-center gap-3 text-sm text-paper/70">
                {reviews.averageRating !== null && (
                  <>
                    <StarRow value={Math.round(reviews.averageRating)} />
                    <span>
                      <span className="font-semibold text-paper">{reviews.averageRating.toFixed(1)}</span> average from{" "}
                      {reviews.total} {reviews.total === 1 ? "review" : "reviews"}
                    </span>
                  </>
                )}
              </p>
              <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reviews.items.map((r) => (
                  <li key={r.id} className="min-w-0">
                    <TestimonialCard review={r} full />
                  </li>
                ))}
              </ul>
              {reviews.total > SHOWN && (
                <p className="mt-6 text-sm text-paper/55">
                  The newest {SHOWN} of {reviews.total}. The average includes them all.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-paper/[0.02] px-6 py-14 text-center">
              <p className="text-base font-semibold text-paper">No reviews yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-paper/60">
                Reviews open to students once they&apos;ve used DoOrDie for a while, so the first ones will appear here soon.
              </p>
            </div>
          )}

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <Limits
              title="How reviews get here"
              items={[
                rules
                  ? `Only signed-in students can write one, once ${days(rules.minDays)} have passed since their first record and they have records on at least ${days(rules.minUsageDays)}.`
                  : "Only signed-in students can write one, and only after using DoOrDie on several different days.",
                "A moderator checks each one for spam, abuse and personal details. A review is never turned down for being critical, and never edited.",
                "It appears only if its author agreed to that, and comes down as soon as they change their mind or withdraw it.",
              ]}
            />
            <Limits
              title="What we don't do"
              items={[
                "Pick reviews by their rating, or hide low ones from the average.",
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
      <CtaBanner track="cta_testimonials_footer" />
    </>
  );
}
