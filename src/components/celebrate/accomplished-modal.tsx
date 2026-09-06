"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Clock, CalendarCheck, X } from "lucide-react";
import { useMounted } from "@/lib/hooks";
import { formatDate, formatHours } from "@/lib/utils";
import { motivationFor, accomplishmentSubline } from "@/lib/motivation";
import { Confetti } from "./confetti";

/** The drawn medal: a ring that sweeps in, then a tick. */
function Medal() {
  return (
    <motion.svg
      viewBox="0 0 96 96"
      className="h-24 w-24"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.05 }}
      aria-hidden
    >
      <circle cx="48" cy="48" r="40" className="fill-accent/10" />
      <motion.circle
        cx="48"
        cy="48"
        r="40"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-accent"
        transform="rotate(-90 48 48)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      />
      <motion.path
        d="M32 49.5 43 60 65 37"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: "easeOut", delay: 0.75 }}
      />
    </motion.svg>
  );
}

function Fact({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Flame;
  value: string;
  label: string;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-line bg-paper/[0.03] px-3 py-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-accent" />
      <p className="tabular mt-1.5 font-display text-lg font-bold tracking-tightest text-paper">
        {value}
      </p>
      <p className="mt-0.5 text-[0.65rem] text-paper/50">{label}</p>
    </div>
  );
}

/**
 * Shown the moment a day is marked accomplished — and only then. The caller
 * opens it on the state transition, so re-renders and revisits stay quiet.
 */
export function AccomplishedModal({
  open,
  onClose,
  date,
  journeyDay,
  streak,
  totalAccomplished,
  hoursToday,
  daysToExam,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  journeyDay: number;
  streak: number;
  totalAccomplished: number;
  hoursToday: number;
  daysToExam: number;
}) {
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="Day accomplished"
        >
          <div className="absolute inset-0 bg-scrim/60 backdrop-blur-md" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-line bg-card shadow-lift sm:rounded-3xl"
          >
            {/* the burst sits behind the content, framed by the medal */}
            <Confetti fire={open} />
            <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />

            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-paper/40 transition-colors hover:bg-paper/[0.06] hover:text-paper"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative px-6 pb-6 pt-9 text-center sm:px-8">
              <div className="mx-auto grid place-items-center">
                <Medal />
              </div>

              <p className="eyebrow mt-5">Day {journeyDay} · {formatDate(date)}</p>
              <h2 className="mt-2 font-display text-[1.75rem] font-bold leading-tight tracking-tightest text-paper">
                Day accomplished.
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-[0.95rem] leading-relaxed text-paper/70 text-pretty">
                {motivationFor(journeyDay, streak)}
              </p>
              <p className="mt-2 text-xs text-paper/45">
                {accomplishmentSubline(streak, totalAccomplished)}
              </p>

              <div className="mt-6 flex gap-2.5">
                <Fact icon={Flame} value={`${streak}d`} label="streak" />
                <Fact icon={Clock} value={formatHours(hoursToday)} label="logged today" />
                <Fact icon={CalendarCheck} value={`${daysToExam}`} label="days to exam" />
              </div>

              <button
                onClick={onClose}
                className="mt-6 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-fg shadow-accent transition-all hover:-translate-y-px hover:brightness-[1.08]"
              >
                Keep going
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
