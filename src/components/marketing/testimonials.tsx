/* Reviews on the public site's other pages. A server component: plain HTML,
   no Supabase in the browser. Which reviews appear is decided by the
   database (published, with the author's consent) and the settings (where,
   how many). Never by rating. With none published, the home page says so. */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublicReviews, getPublicSite } from "@/lib/platform/public-content";
import type { FeatureKey } from "@/lib/features";
import { cn } from "@/lib/utils";
import { Band, Container, SectionHeading } from "./ui";
import { NoReviewsYet, TestimonialCard } from "./review-card";

/**
 * A few published reviews on the home page or a feature page, where the
 * settings allow. Featured ones first, then the newest; on a feature page,
 * reviews that used its feature come first. With no published reviews the
 * home page says so honestly; a feature page shows nothing.
 */
export async function TestimonialStrip({
  placement,
  feature,
  tone = "plain",
}: {
  placement: "home" | "feature";
  feature?: FeatureKey;
  tone?: "plain" | "raised";
}) {
  const [site, reviews] = await Promise.all([getPublicSite(), getPublicReviews(placement === "home" ? 12 : 24)]);
  const on = placement === "home" ? site.testimonials.onHome : site.testimonials.onFeaturePages;
  if (!on) return null;
  if (!reviews.items.length) {
    if (placement !== "home") return null;
    return (
      <Band tone={tone} labelledBy="testimonials-title">
        <Container>
          <SectionHeading id="testimonials-title" eyebrow="Student experiences" title="What aspirants say about DoOrDie" />
          <div className="mt-8">
            <NoReviewsYet minDays={site.reviewRules?.minDays} minUsageDays={site.reviewRules?.minUsageDays} />
          </div>
        </Container>
      </Band>
    );
  }
  const count = placement === "home" ? site.testimonials.homeCount : 3;
  const ranked = [...reviews.items].sort((a, b) => Number(b.featured) - Number(a.featured));
  const pool = feature
    ? [...ranked.filter((r) => r.features.includes(feature)), ...ranked.filter((r) => !r.features.includes(feature))]
    : ranked;
  const shown = pool.slice(0, count);

  return (
    <Band tone={tone} labelledBy="testimonials-title">
      <Container>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeading
            id="testimonials-title"
            eyebrow="Student experiences"
            title="What aspirants say about DoOrDie"
            intro="Written by students after real use, and published as they wrote them. Low ratings are shown like any other."
          />
          <Link href="/reviews" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            {reviews.total === 1 ? "Read the review" : `Read all ${reviews.total} reviews`} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <ul className={cn("mt-8 grid gap-4", shown.length > 1 && "md:grid-cols-2", shown.length > 2 && "lg:grid-cols-3")}>
          {shown.map((r) => (
            <li key={r.slug} className="min-w-0">
              <TestimonialCard review={r} featured={r.featured} />
            </li>
          ))}
        </ul>
      </Container>
    </Band>
  );
}
