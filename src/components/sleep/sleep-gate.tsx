"use client";

import { useEffect, useMemo, useState } from "react";
import { Sunrise } from "lucide-react";
import { BootRing } from "@/components/ui/loading";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { formatClock, nightLabel, promptStartMinutes, sleepPromptKey, timeFormatOf } from "@/lib/sleep";
import { toISODate } from "@/lib/utils";
import { SleepEditor, useSleepQuickActions } from "./sleep-editor";

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-y-auto px-4 py-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-aura" />
      </div>
      {children}
    </div>
  );
}

/** Friendly greeting based on the current hour. */
function greeting(hour: number): string {
  if (hour < 5) return "Up early";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The morning check-in: last night's bedtime and wake-up, before the day
 * starts. If you tapped "going to bed now" last night, only the wake-up is
 * left, and one tap answers it. It can be skipped; the Life Dashboard has
 * the same card any time.
 */
function SleepPrompt({ promptKey }: { promptKey: string }) {
  const lastNight = useChronicle((s) => s.lifeLog.find((l) => l.date === toISODate(new Date())));
  const profile = useChronicle((s) => s.profile);
  const dismissSleepPrompt = useChronicle((s) => s.dismissSleepPrompt);
  const quick = useSleepQuickActions();
  const format = timeFormatOf(profile);
  const today = quick.today;
  const hour = new Date().getHours();

  return (
    <FullScreen>
      <div
        className="w-full max-w-lg rounded-3xl border border-line bg-card p-5 shadow-lift sm:p-7"
        data-testid="sleep-prompt"
        role="region"
        aria-labelledby="sleep-prompt-title"
      >
        <div className="flex flex-col items-center text-center">
          <Logo className="h-9 w-9" />
          <h1 id="sleep-prompt-title" className="mt-4 font-display text-2xl font-bold tracking-tightest text-paper">
            {greeting(hour)}. How did you sleep?
          </h1>
          <p className="mt-1 text-sm text-paper/60">The night of {nightLabel(today)}</p>
        </div>

        {quick.canWakeNow && lastNight?.bedtime && (
          <div className="mt-6 rounded-2xl border border-accent/25 bg-accent/[0.06] p-4 text-center">
            <p className="text-sm text-paper/75">
              You went to bed at <span className="font-semibold text-paper">{formatClock(lastNight.bedtime, format)}</span>.
            </p>
            <Button size="lg" className="mt-3 w-full" onClick={() => quick.wakeNow(promptKey)}>
              <Sunrise className="h-4 w-4" /> I woke up now · {formatClock(quick.nowClock, format)}
            </Button>
            <p className="mt-2 text-[0.72rem] text-paper/55">Or set the times below.</p>
          </div>
        )}

        <div className="mt-6">
          <SleepEditor date={today} variant="gate" promptKey={promptKey} />
        </div>

        <div className="mt-4 flex flex-col items-center gap-1 text-center">
          <button
            type="button"
            onClick={() => dismissSleepPrompt(promptKey)}
            className="rounded-full px-3 py-1.5 text-[0.8rem] font-semibold text-paper/60 hover:text-paper"
          >
            Skip for today
          </button>
          <p className="text-[0.7rem] text-paper/45">You can record or change it any time on the Life Dashboard.</p>
        </div>
      </div>
    </FullScreen>
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
    return <SleepPrompt promptKey={promptKey} />;
  }

  return <>{children}</>;
}
