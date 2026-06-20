"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, Sunrise, Loader2, ArrowRight } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  toISODate,
  sleepDayKey,
  clockHoursBetween,
  formatDate,
  formatHours,
} from "@/lib/utils";

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-5">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-bloom-field" />
        <div className="bloom-scrim absolute inset-0" />
      </div>
      {children}
    </div>
  );
}

/** Friendly greeting based on the current hour. */
function greeting(hour: number): string {
  if (hour < 5) return "Still up?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The blocking sleep/wake prompt. Shown until the user records last night's
 * sleep and this morning's wake-up. Submitting fans the values out to both
 * today's journal entry and today's life-dashboard entry.
 */
function SleepPrompt({ promptKey }: { promptKey: string }) {
  const logDailySleep = useChronicle((s) => s.logDailySleep);
  const journal = useChronicle((s) => s.journal);
  const lifeLog = useChronicle((s) => s.lifeLog);

  const today = toISODate(new Date());

  // Pre-fill from anything already recorded for today, so re-opening is easy.
  const existing = useMemo(() => {
    const j = journal.find((e) => e.date === today);
    const l = lifeLog.find((e) => e.date === today);
    return {
      sleepTime: j?.sleepTime || l?.bedtime || "",
      wakeTime: j?.wakeTime || l?.wakeTime || "",
    };
  }, [journal, lifeLog, today]);

  const [sleepTime, setSleepTime] = useState(existing.sleepTime);
  const [wakeTime, setWakeTime] = useState(existing.wakeTime);

  const canSubmit = Boolean(sleepTime && wakeTime);
  const duration = canSubmit ? clockHoursBetween(sleepTime, wakeTime) : 0;
  const hour = new Date().getHours();

  function submit() {
    if (!canSubmit) return;
    logDailySleep({ date: today, promptKey, sleepTime, wakeTime });
  }

  return (
    <FullScreen>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="w-full max-w-md rounded-2xl border border-paper/12 bg-ink/80 p-7 shadow-glow backdrop-blur-xl"
      >
        <div className="flex flex-col items-center text-center">
          <Logo className="h-9 w-9" />
          <h1 className="mt-4 font-display text-xl tracking-snugg text-paper">
            {greeting(hour)}.
          </h1>
          <p className="mt-1 text-sm text-paper/55">
            Before you begin, log your rest. We&apos;ll carry it into your
            journal and life dashboard for{" "}
            <span className="text-paper/80">{formatDate(today)}</span>.
          </p>
        </div>

        <div className="mt-7 space-y-4">
          <Field label="When did you go to sleep?">
            <div className="relative">
              <Moon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
              <Input
                type="time"
                value={sleepTime}
                onChange={(e) => setSleepTime(e.target.value)}
                className="pl-9"
                autoFocus
                required
              />
            </div>
          </Field>

          <Field label="When did you wake up?">
            <div className="relative">
              <Sunrise className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
              <Input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </Field>

          <div className="flex h-5 items-center justify-center text-xs text-paper/50">
            {canSubmit ? (
              <span>
                That&apos;s{" "}
                <span className="tabular text-paper/80">
                  {formatHours(duration)}
                </span>{" "}
                of sleep.
              </span>
            ) : (
              <span>Enter both times to continue.</span>
            )}
          </div>
        </div>

        <Button type="submit" disabled={!canSubmit} size="lg" className="mt-2 w-full">
          Start my day
          <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="mt-4 text-center text-[0.7rem] text-paper/35">
          You won&apos;t be asked again until tomorrow after 7 AM.
        </p>
      </form>
    </FullScreen>
  );
}

/**
 * Gates the whole app behind the once-a-day sleep prompt.
 *
 * - The prompt is keyed by `sleepDayKey`, which only rolls over at 07:00 local,
 *   so once answered it won't reappear until the next day after 7 AM.
 * - A 60s tick re-evaluates the key so a tab left open across the 7 AM
 *   boundary still prompts without a manual refresh.
 */
export function SleepGate({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const hydrated = useHasHydrated();
  const lastSleepPrompt = useChronicle((s) => s.lastSleepPrompt);

  // Re-evaluate the effective day periodically (and when the tab regains focus)
  // so the gate is correct even if the page stays open across 7 AM.
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
  if (!mounted || !hydrated) {
    return (
      <FullScreen>
        <div className="flex items-center gap-2 text-sm text-paper/55">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </FullScreen>
    );
  }

  const promptKey = sleepDayKey(new Date());
  if (lastSleepPrompt !== promptKey) {
    return <SleepPrompt promptKey={promptKey} />;
  }

  return <>{children}</>;
}
