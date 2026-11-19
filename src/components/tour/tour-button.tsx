"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-context";

/**
 * Opens the feature tour, from the top bar of every page: a labelled pill on a
 * computer, an icon on a phone. Until the tour has been seen once it carries a
 * dot, which is how someone who signed up before it existed finds it; the dot
 * pulses a few times when a page opens and then stays still. The first time
 * the tour is closed, a bubble here says it can be opened again.
 */
export function TourButton({ variant }: { variant: "pill" | "icon" }) {
  const { open, prepare, fresh, hint, dismissHint, isOpen } = useTour();
  const label = fresh ? "Take the feature tour (new)" : "Take the feature tour";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={open}
        onPointerEnter={prepare}
        onFocus={prepare}
        data-tour-button=""
        aria-label={label}
        title="Take the feature tour"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          "lg-clear relative inline-flex items-center justify-center rounded-full text-paper/70 transition-all duration-200 hover:text-paper",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
          variant === "pill" ? "h-10 gap-2 px-3.5 text-[0.8rem] font-semibold tracking-snugg" : "h-10 w-10",
        )}
      >
        <Compass className={cn(variant === "pill" ? "h-4 w-4" : "h-5 w-5", "tour-compass")} aria-hidden />
        {variant === "pill" && <span aria-hidden>Tour</span>}
        {fresh && (
          <span aria-hidden className="absolute right-1 top-1 grid h-2.5 w-2.5 place-items-center">
            <span className="tour-new absolute inset-0 rounded-full bg-accent/60" />
            <span className="relative h-2 w-2 rounded-full bg-accent ring-2 ring-[rgb(var(--card))]" />
          </span>
        )}
      </button>

      <AnimatePresence>
        {hint && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-64 origin-top-right"
          >
            {/* The arrow, pointing at the button. */}
            <span
              aria-hidden
              className={cn(
                "absolute -top-1.5 h-3 w-3 rotate-45 rounded-[3px] border-l border-t border-line bg-card",
                variant === "pill" ? "right-8" : "right-3.5",
              )}
            />
            <div className="relative flex items-start gap-3 rounded-2xl border border-line bg-card p-3.5 shadow-lift">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                <Compass className="h-4 w-4" aria-hidden />
              </span>
              <p className="min-w-0 flex-1 text-[0.78rem] leading-relaxed text-paper/75">
                <span className="font-semibold text-paper">Lost later?</span> The tour is always here.
              </p>
              <button
                type="button"
                onClick={dismissHint}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-paper/50 transition-colors hover:text-paper"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
