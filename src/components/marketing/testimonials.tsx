/* Reviews on the public site. Server components: plain HTML, no Supabase
   in the browser. Which reviews appear is decided by the database (published,
   with the author's consent) and the settings (where, how many). Never by
   rating: the newest come first, and the page shows every one. */

import Link from "next/link";
import { ArrowRight, MessageSquareReply, Star } from "lucide-react";
import { REVIEW_STAGE, featureLabel } from "@/lib/platform/content";
import { getPublicReviews, getPublicSite } from "@/lib/platform/public-content";
import type { PublicReview } from "@/lib/platform/types";
import type { FeatureKey } from "@/lib/features";
import { cn } from "@/lib/utils";
import { Band, Container, SectionHeading } from "./ui";

const day = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function StarRow({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn("h-4 w-4", n <= value ? "fill-warning text-warning" : "text-paper/25")} />
      ))}
    </span>
  );
}

/** One published review, as its author wrote it. `full` adds what they found useful and the team's reply. */
export function TestimonialCard({ review: r, full = false }: { review: PublicReview; full?: boolean }) {
  return (
    <figure className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-card p-6 shadow-soft">
      <StarRow value={r.rating} />
      {r.headline && <p className="mt-3 font-semibold leading-snug tracking-snugg text-paper">{r.headline}</p>}
      <blockquote className={cn("mt-2 flex-1 whitespace-pre-line break-words text-[0.95rem] leading-relaxed text-paper/75", !full && "line-clamp-6")}>
        {r.body}
      </blockquote>
      {full && r.useful && (
        <p className="mt-3 text-sm leading-relaxed text-paper/65">
          <span className="font-semibold text-paper">Most useful:</span> {r.useful}
        </p>
      )}
      <figcaption className="mt-4 text-xs leading-relaxed text-paper/55">
        <span className="font-semibold text-paper">{r.displayName}</span>
        {r.stage ? ` · ${REVIEW_STAGE.label[r.stage]}` : ""}
        <span className="block">{day.format(new Date(r.publishedAt))}</span>
        {full && r.features.length > 0 && <span className="mt-1 block">Uses {r.features.map(featureLabel).join(", ")}</span>}
      </figcaption>
      {full && r.response && (
        <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-sm leading-relaxed text-paper/75">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent">
            <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Reply from the DoOrDie team
          </p>
          <p className="whitespace-pre-line break-words">{r.response}</p>
        </div>
      )}
    </figure>
  );
}

/**
 * A few of the newest published reviews, on the home page or a feature
 * page, where the settings allow. On a feature page, reviews that say they
 * used that feature come first. Renders nothing until there are reviews.
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
  if (!on || !reviews.items.length) return null;
  const count = placement === "home" ? site.testimonials.homeCount : 3;
  const pool = feature
    ? [...reviews.items.filter((r) => r.features.includes(feature)), ...reviews.items.filter((r) => !r.features.includes(feature))]
    : reviews.items;
  const shown = pool.slice(0, count);

  return (
    <Band tone={tone} labelledBy="testimonials-title">
      <Container>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeading
            id="testimonials-title"
            eyebrow="Reviews"
            title="What aspirants say about DoOrDie"
            intro="Written by students after real use, and published as they wrote them. The newest come first, whatever their rating."
          />
          <Link href="/testimonials" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            {reviews.total === 1 ? "Read the review" : `Read all ${reviews.total} reviews`} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <ul className={cn("mt-8 grid gap-4", shown.length > 1 && "md:grid-cols-2", shown.length > 2 && "lg:grid-cols-3")}>
          {shown.map((r) => (
            <li key={r.id} className="min-w-0">
              <TestimonialCard review={r} />
            </li>
          ))}
        </ul>
      </Container>
    </Band>
  );
}
