"use client";

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { BootRing } from "@/components/ui/loading";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { promptStartMinutes, sleepPromptKey } from "@/lib/sleep";
import { toISODate } from "@/lib/utils";

const SleepPrompt = lazy(() => import("./sleep-prompt").then((m) => ({ default: m.SleepPrompt })));

export function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-y-auto px-4 py-8">
      <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 -z-10" />
      {children}
    </div>
  );
}

/**
 * Asks about the night once a day, before the app opens.
 *
 * - The day moves on at `promptStartMinutes`: two hours before your usual
 *   wake-up, between 03:00 and 07:00. So an early riser is asked when they
 *   get up, and someone still awake at 1 AM isn't asked about a night they
 *   haven't had.
 * - Answering on any device counts for all of them (`lastSleepPrompt`
 *   syncs), and so does a night already recorded for today.
 * - A 60s tick re-checks, so a tab left open across the start still asks.
 */
export function SleepGate({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const hydrated = useHasHydrated();
  const lastSleepPrompt = useChronicle((s) => s.lastSleepPrompt);
  const lifeLog = useChronicle((s) => s.lifeLog);

  const todayISO = toISODate(new Date());
  const loggedToday = useChronicle(
    (s) =>
      s.journal.some((j) => j.date === todayISO && Boolean(j.sleepTime) && Boolean(j.wakeTime)) ||
      s.lifeLog.some((l) => l.date === todayISO && Boolean(l.bedtime) && Boolean(l.wakeTime)),
  );
  const startMinutes = useMemo(() => promptStartMinutes(lifeLog), [lifeLog]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // Avoid deciding before the persisted store has loaded, otherwise we'd flash
  // the prompt over an already-answered day.
  //
  // This gate wraps the whole app from `app/layout.tsx`, which makes it *the*
  // screen you see on a browser refresh — so it carries the cold-start ring.
  if (!mounted || !hydrated) {
    return (
      <FullScreen>
        {/* CSS, not the Lottie: this wait ends at hydration, so a JS player
            cannot start until it is over. One animation, no hand-off. */}
        <BootRing className="h-[5.25rem] w-[5.25rem]" />
      </FullScreen>
    );
  }

  const promptKey = sleepPromptKey(new Date(), startMinutes);
  // Before the day's start it's still the previous day's check-in, which can't
  // be about tonight; only a day that has started is asked about.
  const answered = lastSleepPrompt === promptKey || loggedToday || promptKey !== todayISO;
  if (!answered) {
    return (
      <Suspense
        fallback={
          <FullScreen>
            <BootRing className="h-[5.25rem] w-[5.25rem]" />
          </FullScreen>
        }
      >
        <SleepPrompt promptKey={promptKey} />
      </Suspense>
    );
  }

  return <>{children}</>;
}
