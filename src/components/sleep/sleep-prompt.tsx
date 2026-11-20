"use client";

import { Sunrise } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { formatClock, nightLabel, timeFormatOf } from "@/lib/sleep";
import { toISODate } from "@/lib/utils";
import { SleepEditor, useSleepQuickActions } from "./sleep-editor";
import { FullScreen } from "./sleep-gate";

/* The morning check-in itself, downloaded only on the mornings it is
   shown: on every other open of the app, the gate lets the page through and
   this code (with the time picker it uses) never loads. */

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
export function SleepPrompt({ promptKey }: { promptKey: string }) {
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
