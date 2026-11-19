import Link from "next/link";
import { Bug, Gauge, MessageSquareHeart, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { CHANGELOG_CATEGORY, featureLabel, type ChangelogCategory } from "@/lib/platform/content";
import type { ChangelogEntry } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";

export const CHANGELOG_ICON: Record<ChangelogCategory, React.ElementType> = {
  new_feature: Sparkles,
  improvement: TrendingUp,
  bug_fix: Bug,
  performance: Gauge,
  security: ShieldCheck,
};

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function changelogDate(iso: string | null): string {
  return iso ? longDate.format(new Date(iso)) : "Not published";
}

/** "3 suggestions from students led to this", without showing any of them. */
export function RequestsNote({ count }: { count: number }) {
  if (!count) return null;
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.08] px-3 py-1 text-xs font-semibold text-accent">
      <MessageSquareHeart className="h-3.5 w-3.5" aria-hidden />
      You asked, we improved: {count} {count === 1 ? "request" : "requests"} from students led to this
    </p>
  );
}

/** One update. `full` shows the details and the image; otherwise a summary that links to them. */
export function ChangelogEntryView({ entry, full = false, headingLevel = 2, link = true }: { entry: ChangelogEntry; full?: boolean; headingLevel?: 1 | 2; link?: boolean }) {
  const Icon = CHANGELOG_ICON[entry.category] ?? Sparkles;
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <article className="relative">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/[0.1] px-2.5 py-1 font-semibold text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {CHANGELOG_CATEGORY.label[entry.category]}
        </span>
        {entry.featureKey && <span className="rounded-full border border-line px-2.5 py-1 font-medium text-paper/65">{featureLabel(entry.featureKey)}</span>}
        <time dateTime={entry.publishedAt ?? undefined} className="text-paper/55">
          {changelogDate(entry.publishedAt)}
        </time>
      </div>
      <Heading className={cn("mt-3 font-display font-bold tracking-tightest text-paper", headingLevel === 1 ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl")}>
        {link && !full ? (
          <Link href={`/changelog/${entry.slug}`} className="hover:text-accent">
            {entry.title}
          </Link>
        ) : (
          entry.title
        )}
      </Heading>
      <p className="mt-2 text-[1.02rem] leading-relaxed text-paper/70">{entry.summary}</p>
      {entry.requests > 0 && (
        <div className="mt-3">
          <RequestsNote count={entry.requests} />
        </div>
      )}
      {full && entry.imageUrl && (
        // An address the team chose (https or a path on this site), checked when it was saved.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.imageUrl} alt={entry.imageAlt ?? ""} loading="lazy" className="mt-6 w-full rounded-2xl border border-line object-cover shadow-soft" />
      )}
      {full && entry.body && <RichText text={entry.body} className="mt-6 text-[0.98rem] text-paper/80" />}
    </article>
  );
}
