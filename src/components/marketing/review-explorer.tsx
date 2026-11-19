"use client";

import { useMemo, useState } from "react";
import { REVIEW_STAGE, featureLabel, type ReviewStage } from "@/lib/platform/content";
import type { PublicReview } from "@/lib/platform/types";
import { TestimonialCard } from "./review-card";

type Sort = "newest" | "highest" | "lowest";

const control =
  "rounded-full border border-line bg-card px-3.5 py-2 text-sm text-paper shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45";

/**
 * Every published review, filtered and sorted in the browser: newest first by
 * default, and nothing is hidden by default. The list comes from the server
 * already public, so filtering here reveals nothing new.
 */
export function ReviewExplorer({ reviews }: { reviews: PublicReview[] }) {
  const [sort, setSort] = useState<Sort>("newest");
  const [rating, setRating] = useState("");
  const [feature, setFeature] = useState("");
  const [stage, setStage] = useState("");
  const [storiesOnly, setStoriesOnly] = useState(false);

  const features = useMemo(
    () => [...new Set(reviews.flatMap((r) => r.features))].sort((a, b) => featureLabel(a).localeCompare(featureLabel(b))),
    [reviews],
  );
  const stages = useMemo(() => REVIEW_STAGE.ids.filter((s) => reviews.some((r) => r.stage === s)), [reviews]);

  const shown = useMemo(() => {
    const list = reviews.filter(
      (r) =>
        (!rating || r.rating === Number(rating)) &&
        (!feature || r.features.includes(feature)) &&
        (!stage || r.stage === stage) &&
        (!storiesOnly || r.story),
    );
    const byDate = (a: PublicReview, b: PublicReview) => b.publishedAt.localeCompare(a.publishedAt);
    return [...list].sort((a, b) =>
      sort === "highest" ? b.rating - a.rating || byDate(a, b) : sort === "lowest" ? a.rating - b.rating || byDate(a, b) : byDate(a, b),
    );
  }, [reviews, rating, feature, stage, storiesOnly, sort]);

  return (
    <section aria-labelledby="all-reviews-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="all-reviews-title" className="font-display text-2xl font-bold tracking-tightest text-paper">
          Every published experience
        </h2>
        <p className="text-xs text-paper/55" aria-live="polite">
          Showing {shown.length} of {reviews.length}
        </p>
      </div>
      <div role="group" aria-label="Sort and filter the reviews" className="mt-5 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="review-sort">Sort</label>
        <select id="review-sort" className={control} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest first</option>
          <option value="highest">Highest rating first</option>
          <option value="lowest">Lowest rating first</option>
        </select>
        <label className="sr-only" htmlFor="review-rating">Rating</label>
        <select id="review-rating" className={control} value={rating} onChange={(e) => setRating(e.target.value)}>
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "star" : "stars"}
            </option>
          ))}
        </select>
        {features.length > 0 && (
          <>
            <label className="sr-only" htmlFor="review-feature">Feature</label>
            <select id="review-feature" className={control} value={feature} onChange={(e) => setFeature(e.target.value)}>
              <option value="">Any feature</option>
              {features.map((f) => (
                <option key={f} value={f}>
                  {featureLabel(f)}
                </option>
              ))}
            </select>
          </>
        )}
        {stages.length > 0 && (
          <>
            <label className="sr-only" htmlFor="review-stage">Preparation stage</label>
            <select id="review-stage" className={control} value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Any stage</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {REVIEW_STAGE.label[s as ReviewStage]}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-sm text-paper shadow-soft">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={storiesOnly} onChange={(e) => setStoriesOnly(e.target.checked)} />
          Long written experiences only
        </label>
      </div>
      {shown.length ? (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <li key={r.slug} className="min-w-0">
              <TestimonialCard review={r} featured={r.featured} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-paper/60">
          No published review matches these filters.
        </p>
      )}
    </section>
  );
}
