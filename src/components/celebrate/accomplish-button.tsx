"use client";

import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { accomplishedStreak, isAccomplished, todayEntry } from "@/lib/selectors";
import { daysBetween, toISODate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AccomplishedModal } from "./accomplished-modal";

/**
 * "Mark day accomplished" — and the celebration it triggers.
 *
 * The modal is opened from the store action's return value, which is true only
 * on the transition into accomplished. Unmarking, re-rendering or coming back
 * tomorrow therefore never replays it.
 *
 * `onMedia` is for the command-centre hero, where the control sits on the film
 * and has to hold its own against a moving background.
 */
export function AccomplishButton({
  onMedia = false,
  className,
}: {
  onMedia?: boolean;
  className?: string;
}) {
  const mounted = useMounted();
  const profile = useChronicle((s) => s.profile);
  const journal = useChronicle((s) => s.journal);
  const accomplished = useChronicle((s) => s.accomplished);
  const toggle = useChronicle((s) => s.toggleAccomplished);
  const [celebrating, setCelebrating] = useState(false);

  const today = toISODate(new Date());
  const done = isAccomplished(accomplished, today);
  const streak = accomplishedStreak(accomplished);
  const entry = todayEntry(journal);

  // Until the store has hydrated, render the resting state rather than risk a
  // mismatch between server and client markup.
  const marked = mounted && done;

  return (
    <>
      <button
        onClick={() => {
          if (toggle(today)) setCelebrating(true);
        }}
        aria-pressed={marked}
        title={marked ? "Marked accomplished — click to undo" : "Mark today accomplished"}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold tracking-snugg transition-all",
          marked
            ? onMedia
              ? "border border-accent/50 bg-accent/25 text-white"
              : "border border-accent/40 bg-accent/15 text-accent"
            : onMedia
              ? "border border-white/25 bg-[rgb(6,6,8)]/70 text-white/90 hover:border-white/45"
              : "border border-line bg-card text-paper/80 shadow-soft hover:-translate-y-px hover:border-paper/25",
          className,
        )}
      >
        {marked ? (
          <CheckCircle2 className={cn("h-4 w-4", onMedia ? "text-white" : "text-accent")} />
        ) : (
          <Circle className="h-4 w-4 opacity-70" />
        )}
        {marked ? "Day accomplished" : "Mark day accomplished"}
      </button>

      <AccomplishedModal
        open={celebrating}
        onClose={() => setCelebrating(false)}
        date={today}
        journeyDay={daysBetween(profile.startDate, today)}
        streak={streak}
        totalAccomplished={(accomplished ?? []).length}
        hoursToday={entry?.totalHours ?? 0}
        daysToExam={daysBetween(today, profile.examDate)}
      />
    </>
  );
}
