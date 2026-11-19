/* One published review, in the forms the public site shows it: the card,
   the badges, the team's reply, and the honest "none yet" state. No data
   fetching and no hooks, so server pages and the reviews page's filter
   (a client component) render exactly the same thing. Nothing here invents
   a review: with none published, NoReviewsYet says so. */

import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, CalendarClock, MessageSquareReply, PlayCircle, Star, Wrench } from "lucide-react";
import { ASPIRANT_TYPE, BADGE_MEANING, REVIEW_STAGE, featureLabel } from "@/lib/platform/content";
import type { PublicReview, ReviewBadges } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import { ButtonLink } from "./ui";

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
export const reviewDate = (iso: string) => monthYear.format(new Date(iso));
export const reviewPath = (slug: string) => `/reviews/${slug}`;

export function StarRow({ value, className, size = "md" }: { value: number; className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", n <= value ? "fill-warning text-warning" : "text-paper/25")} />
      ))}
    </span>
  );
}

/** The badges a review earned from its author's records. Each says what it means on hover; the reviews page explains all of them. */
export function BadgeRow({ badges, className }: { badges: ReviewBadges | undefined; className?: string }) {
  if (!badges) return null;
  const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold";
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Verification">
      {badges.verifiedUser && (
        <li className={cn(pill, "border-accent/25 bg-accent/[0.08] text-accent")} title={BADGE_MEANING.verifiedUser.meaning}>
          <BadgeCheck className="h-3 w-3" aria-hidden /> {BADGE_MEANING.verifiedUser.label}
        </li>
      )}
      {badges.activeUser && (
        <li className={cn(pill, "border-positive/25 bg-positive/10 text-positive")} title={BADGE_MEANING.activeUser.meaning}>
          <Activity className="h-3 w-3" aria-hidden /> {BADGE_MEANING.activeUser.label}
        </li>
      )}
      {badges.features.length > 0 && (
        <li className={cn(pill, "border-line bg-paper/[0.03] text-paper/70")} title={BADGE_MEANING.features.meaning}>
          <Wrench className="h-3 w-3" aria-hidden /> Verified use: {badges.features.map(featureLabel).join(", ")}
        </li>
      )}
      {badges.established && (
        <li className={cn(pill, "border-line bg-paper/[0.03] text-paper/70")} title={BADGE_MEANING.established.meaning}>
          <CalendarClock className="h-3 w-3" aria-hidden /> {BADGE_MEANING.established.label}
        </li>
      )}
    </ul>
  );
}

/** "Preparing for Prelims · while working", from what the author chose to share. */
export function reviewContext(r: Pick<PublicReview, "stage" | "aspirantType">): string | null {
  const parts = [r.stage ? REVIEW_STAGE.label[r.stage] : null, r.aspirantType ? ASPIRANT_TYPE.label[r.aspirantType] : null].filter(
    (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
  );
  return parts.length ? parts.join(" · ") : null;
}

/**
 * One published review, as its author wrote it. A card shows the headline and
 * what they'd tell another aspirant; a story links to its own page.
 */
export function TestimonialCard({ review: r, featured = false, headingLevel = 3 }: { review: PublicReview; featured?: boolean; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const context = reviewContext(r);
  const quote = r.body ?? r.useful ?? r.changeNote ?? r.problemBefore;
  return (
    <figure
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border bg-card p-6 shadow-soft",
        featured ? "border-accent/30 ring-1 ring-accent/10" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <StarRow value={r.rating} />
        {featured && <span className="rounded-full bg-accent/[0.1] px-2.5 py-0.5 text-[0.66rem] font-semibold text-accent">Featured by the team</span>}
      </div>
      {r.headline && <Heading className="mt-3 font-semibold leading-snug tracking-snugg text-paper">{r.headline}</Heading>}
      {quote && (
        <blockquote className="mt-2 line-clamp-6 flex-1 whitespace-pre-line break-words text-[0.95rem] leading-relaxed text-paper/75">{quote}</blockquote>
      )}
      <figcaption className="mt-4 text-xs leading-relaxed text-paper/55">
        <span className="font-semibold text-paper">{r.displayName}</span>
        {context ? ` · ${context}` : ""}
        <span className="block">Published {reviewDate(r.publishedAt)}</span>
      </figcaption>
      <BadgeRow badges={r.badges} className="mt-3" />
      {r.story && (
        <Link href={reviewPath(r.slug)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          Read the full story <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </figure>
  );
}

/** The team's public reply under a review. */
export function TeamReply({ review: r }: { review: Pick<PublicReview, "response"> }) {
  if (!r.response) return null;
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-sm leading-relaxed text-paper/75">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent">
        <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Reply from the DoOrDie team
      </p>
      <p className="whitespace-pre-line break-words">{r.response}</p>
    </div>
  );
}

/**
 * The honest state before any review is published: no placeholders, no
 * invented quotes. It says what's true, and offers the product itself.
 */
export function NoReviewsYet({ minDays, minUsageDays }: { minDays?: number; minUsageDays?: number }) {
  const rule =
    minDays !== undefined && minUsageDays !== undefined
      ? `after ${minDays} days of real use, on at least ${minUsageDays} different days`
      : "after a couple of weeks of real use";
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-line bg-paper/[0.02] px-6 py-10 text-center sm:px-12">
      <p className="text-lg font-semibold tracking-snugg text-paper">No student reviews published yet</p>
      <p className="mx-auto mt-2 max-w-xl text-pretty text-sm leading-relaxed text-paper/65">
        DoOrDie is new, and we won&apos;t fill this space with made-up quotes. Students can review it {rule}; every review is
        checked only for spam and abuse, and published as written. Until the first ones arrive, see the product for yourself.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <ButtonLink href="/demo" size="md" track="reviews_empty_demo">
          <PlayCircle className="h-4 w-4" aria-hidden /> Explore the demo
        </ButtonLink>
        <ButtonLink href="/trust" size="md" variant="ghost">
          How DoOrDie works
        </ButtonLink>
      </div>
    </div>
  );
}

