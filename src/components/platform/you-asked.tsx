import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageSquareHeart } from "lucide-react";
import { featureLabel } from "@/lib/platform/content";
import type { YouAskedItem } from "@/lib/platform/types";
import { changelogDate } from "./changelog-entry";

/**
 * "You asked. We improved.": feedback themes, in the team's words, beside the
 * change that shipped. Only entries with real feedback linked to them reach
 * this list (platform_public_you_asked); no sender and no message is shown.
 */
export function YouAskedList({ items, compact = false }: { items: YouAskedItem[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <ol className={compact ? "grid gap-3 md:grid-cols-3" : "space-y-3"}>
      {items.map((i) => (
        <li key={i.slug} className="min-w-0">
          <Link
            href={`/changelog/${i.slug}`}
            className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35"
          >
            <p className="flex items-start gap-2 text-sm leading-relaxed text-paper/75">
              <MessageSquareHeart className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="eyebrow mb-0.5 block">You asked</span>“{i.askedTheme}”
              </span>
            </p>
            <p className="flex items-start gap-2 text-sm leading-relaxed text-paper">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden />
              <span>
                <span className="eyebrow mb-0.5 block">We improved</span>
                <span className="font-semibold group-hover:text-accent">{i.title}</span>
              </span>
            </p>
            <p className="mt-auto flex flex-wrap items-center gap-x-2 text-xs text-paper/50">
              <span className="font-semibold text-positive">Shipped</span>
              <span>{changelogDate(i.publishedAt)}</span>
              {i.featureKey && <span>· {featureLabel(i.featureKey)}</span>}
              <span>
                · {i.requests} {i.requests === 1 ? "request" : "requests"}
              </span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-paper/35 group-hover:text-accent" aria-hidden />
            </p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
