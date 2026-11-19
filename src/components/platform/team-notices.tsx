"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, MessageSquareReply, X } from "lucide-react";
import { ANNOUNCEMENT_CATEGORY } from "@/lib/platform/content";
import { cn } from "@/lib/utils";
import { AppNoticeBar } from "./app-notice";
import { ANNOUNCEMENT_ICON } from "./announcement-card";
import { useInbox } from "./inbox";

/** What the bell adds for the team: unread announcements, and one line for new answers to feedback. */
export function useTeamUnreadCount(): number {
  const inbox = useInbox();
  if (!inbox) return 0;
  return inbox.unread.length + (inbox.unseenResponses > 0 ? 1 : 0);
}

const plain = (text: string) => text.replace(/[#>*_`-]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * The top of every app page: the app-wide notice while it's on, and the
 * newest announcement the person hasn't read or dismissed. One at a time,
 * so a busy week doesn't stack banners.
 */
export function TeamBanner() {
  const inbox = useInbox();
  if (!inbox) return null;
  const a = inbox.banner;
  const Icon = a ? ANNOUNCEMENT_ICON[a.category] : null;
  return (
    <div className="mb-4 space-y-3 empty:hidden lg:mb-6">
      {inbox.notice && <AppNoticeBar message={inbox.notice.message} tone={inbox.notice.tone} />}
      <AnimatePresence initial={false}>
        {a && Icon && (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="region"
            aria-label="Announcement from the team"
            className="flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-card px-3.5 py-2.5 shadow-soft sm:px-4"
          >
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                a.category === "important" ? "bg-danger/10 text-danger" : a.category === "maintenance" ? "bg-warning/10 text-warning" : "bg-accent/[0.12] text-accent",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <Link href={`/announcements#${a.id}`} onClick={() => inbox.markRead(a.id)} className="group min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-paper group-hover:underline">{a.title}</p>
              <p className="hidden truncate text-xs text-paper/55 sm:block">
                {ANNOUNCEMENT_CATEGORY.label[a.category]} · {plain(a.body)}
              </p>
            </Link>
            <Link
              href={`/announcements#${a.id}`}
              onClick={() => inbox.markRead(a.id)}
              className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline sm:inline-flex"
            >
              Read <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => inbox.dismiss(a.id)}
              aria-label={`Dismiss "${a.title}"`}
              className="lg-clear grid h-8 w-8 shrink-0 place-items-center rounded-full text-paper/50 transition-colors hover:text-paper"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "From the team" at the top of the notification centre. Nothing when there's nothing new. */
export function TeamSection({ onNavigate }: { onNavigate: () => void }) {
  const inbox = useInbox();
  if (!inbox || (!inbox.unread.length && !inbox.unseenResponses)) return null;
  return (
    <section aria-label="From the team">
      <p className="eyebrow mb-2">From the team</p>
      <div className="space-y-2">
        {inbox.unread.map((a) => {
          const Icon = ANNOUNCEMENT_ICON[a.category];
          return (
            <Link
              key={a.id}
              href={`/announcements#${a.id}`}
              onClick={() => {
                inbox.markRead(a.id);
                onNavigate();
              }}
              className="flex items-start gap-3 rounded-2xl border border-line bg-paper/[0.02] px-3.5 py-3 transition-colors hover:bg-paper/[0.05]"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-paper">{a.title}</span>
                <span className="mt-0.5 block truncate text-xs text-paper/55">
                  {ANNOUNCEMENT_CATEGORY.label[a.category]} · {plain(a.body)}
                </span>
              </span>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
            </Link>
          );
        })}
        {inbox.unseenResponses > 0 && (
          <Link
            href="/settings#feedback"
            onClick={onNavigate}
            className="flex items-start gap-3 rounded-2xl border border-line bg-paper/[0.02] px-3.5 py-3 transition-colors hover:bg-paper/[0.05]"
          >
            <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-paper">
                {inbox.unseenResponses === 1 ? "The team answered your feedback" : `The team answered ${inbox.unseenResponses} of your messages`}
              </span>
              <span className="mt-0.5 block text-xs text-paper/55">Read it in Settings, under Help &amp; feedback.</span>
            </span>
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
          </Link>
        )}
      </div>
    </section>
  );
}
