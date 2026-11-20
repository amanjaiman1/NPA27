"use client";

import { useEffect, useMemo } from "react";
import { Check, Plus } from "lucide-react";
import { AppLink as Link } from "./app-link";
import { essentialNavItems } from "@/lib/nav";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { cn, toISODate } from "@/lib/utils";
import { useVisibleNav } from "@/components/features/feature-access";

/**
 * On a phone, one button where a thumb reaches: "+" opens Daily Capture,
 * the form that records the whole day (journal, life, goals and habits).
 * Everything else is in the menu at the top left. Until today is logged the
 * button breathes a soft halo; once it is, it carries a check.
 *
 * It publishes the space it takes as `--bottom-nav-h` so floating notices and
 * the page itself can keep clear of it.
 */
export function CaptureButton() {
  const items = useVisibleNav(essentialNavItems);
  const canCapture = items.some((i) => i.href === "/journal");
  const journal = useChronicle((s) => s.journal);
  const today = toISODate(useNow(60_000));
  const logged = useMemo(() => journal.some((j) => j.date === today), [journal, today]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () =>
      root.style.setProperty(
        "--bottom-nav-h",
        mq.matches || !canCapture ? "0px" : "calc(4.5rem + max(0.875rem, env(safe-area-inset-bottom)))",
      );
    apply();
    mq.addEventListener?.("change", apply);
    return () => {
      mq.removeEventListener?.("change", apply);
      root.style.removeProperty("--bottom-nav-h");
    };
  }, [canCapture]);

  if (!canCapture) return null;

  return (
    <nav
      aria-label="Quick access"
      className="pointer-events-none fixed inset-x-0 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-30 flex justify-center lg:hidden"
    >
      <Link
        href="/journal?new=1"
        aria-label={logged ? "Update today in Daily Capture" : "Capture today in Daily Capture"}
        className="group pointer-events-auto relative grid h-[3.75rem] w-[3.75rem] place-items-center rounded-full bg-accent text-accent-fg shadow-accent transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-95"
      >
        {/* A soft glow under the glass, and a halo that breathes until today is logged. */}
        <span aria-hidden className="pointer-events-none absolute -inset-3 -z-10 rounded-full bg-accent/30 blur-xl" />
        {!logged && <span aria-hidden className="capture-halo pointer-events-none absolute inset-0 rounded-full ring-2 ring-accent/60" />}
        <Plus
          className="relative h-7 w-7 drop-shadow-sm transition-transform duration-300 ease-out group-hover:rotate-90 group-active:rotate-90"
          strokeWidth={2.75}
          aria-hidden
        />
        {logged && (
          <span
            aria-hidden
            className={cn("absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-positive text-card shadow-soft ring-2 ring-card")}
          >
            <Check className="h-3 w-3" strokeWidth={3.5} />
          </span>
        )}
      </Link>
    </nav>
  );
}
