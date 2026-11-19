"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquareReply, Paperclip, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiCall } from "@/lib/platform/client";
import { FEEDBACK_CATEGORY, FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/platform/content";
import type { MyFeedback } from "@/lib/platform/types";

const TONE: Record<FeedbackStatus, "default" | "accent" | "warning" | "positive" | "outline"> = {
  new: "default",
  under_review: "accent",
  planned: "accent",
  in_progress: "warning",
  resolved: "positive",
  closed: "outline",
};

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * "Your messages": what the person sent, where each stands, and the team's
 * answer. Answers count as read once the list has been on screen.
 */
export function FeedbackHistory({ items, onSeen }: { items: MyFeedback[]; onSeen: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  // Answers that were new when the list appeared, or that arrived while it's open, keep their "New" mark while it's open.
  const [fresh, setFresh] = useState(() => new Set(items.filter((i) => i.response && !i.responseSeen).map((i) => i.id)));
  useEffect(() => {
    setFresh((had) => {
      const add = items.filter((i) => i.response && !i.responseSeen && !had.has(i.id));
      return add.length ? new Set([...had, ...add.map((i) => i.id)]) : had;
    });
  }, [items]);
  const pending = items.some((i) => i.response && !i.responseSeen);
  const seen = useRef(onSeen);
  seen.current = onSeen;

  useEffect(() => {
    const el = list.current;
    if (!pending || !el) return;
    const mark = () => void apiCall("/api/feedback", { method: "PATCH" }).then(() => seen.current(), () => undefined);
    if (typeof IntersectionObserver === "undefined") return mark();
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        mark();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pending]);

  return (
    <div ref={list} className="mt-6 border-t border-line pt-5">
      <h3 className="text-sm font-semibold text-paper">Your messages</h3>
      <p className="mt-0.5 text-xs text-paper/50">Your newest 50, with where each one stands.</p>
      <ol className="mt-3 space-y-3">
        {items.map((f) => (
          <li key={f.id} className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-semibold text-paper">{FEEDBACK_CATEGORY.label[f.category] ?? "Feedback"}</span>
              <span className="text-xs text-paper/45">{day.format(new Date(f.createdAt))}</span>
              <Badge tone={TONE[f.status] ?? "default"} className="ml-auto">
                {FEEDBACK_STATUS.label[f.status] ?? f.status}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-line break-words text-sm leading-relaxed text-paper/75">{f.message}</p>
            {f.hasScreenshot && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-paper/45">
                <Paperclip className="h-3 w-3" aria-hidden /> Screenshot attached
              </p>
            )}
            {f.response && (
              <div className="mt-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-3">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent">
                  <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> The team&apos;s answer
                  {f.responseAt && <span className="font-normal text-paper/50">{day.format(new Date(f.responseAt))}</span>}
                  {fresh.has(f.id) && <Badge tone="solid">New</Badge>}
                </p>
                <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-paper/80">{f.response}</p>
              </div>
            )}
            {f.changelog?.published && (
              <Link
                href={`/changelog/${f.changelog.slug}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
              >
                <Rocket className="h-3.5 w-3.5" aria-hidden /> Shipped: {f.changelog.title}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
