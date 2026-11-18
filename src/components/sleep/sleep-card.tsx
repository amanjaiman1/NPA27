"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Moon, Settings2, Sunrise, BedDouble } from "lucide-react";
import type { ISODate, SleepTarget, TimeFormat } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import {
  deviceTimeFormat,
  formatClock,
  formatDuration,
  nightLabel,
  sleepStats,
  targetMinutes,
  timeFormatOf,
  MAX_SLEEP_HOURS,
} from "@/lib/sleep";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, fromISODate, toISODate } from "@/lib/utils";
import { SleepEditor, useSleepQuickActions } from "./sleep-editor";
import { TimeField } from "./time-field";

function shift(date: ISODate, delta: number): ISODate {
  const d = fromISODate(date);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Averages from recorded nights only, with how many nights they stand on. */
export function SleepSummary({ compact }: { compact?: boolean }) {
  const lifeLog = useChronicle((s) => s.lifeLog);
  const profile = useChronicle((s) => s.profile);
  const now = useNow(60_000);
  const today = toISODate(now);
  const format = timeFormatOf(profile);
  const week = useMemo(() => sleepStats(lifeLog, today, 7), [lifeLog, today]);
  const month = useMemo(() => sleepStats(lifeLog, today, 30), [lifeLog, today]);
  const aim = targetMinutes(profile.sleepTarget);

  if (!month.nights && !month.avgBedtime) {
    return <p className="text-[0.75rem] text-paper/55">Averages appear here once a few nights are recorded.</p>;
  }
  const cell = (label: string, value: string, hint: string) => (
    <div className="min-w-0">
      <p className="truncate text-[0.72rem] font-semibold text-paper/50">{label}</p>
      <p className="tabular mt-1 truncate font-display text-lg font-bold tracking-tightest text-paper">{value}</p>
      <p className="truncate text-[0.68rem] text-paper/50">{hint}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        {cell("Last 7 nights", week.avgHours == null ? "—" : formatDuration(week.avgHours * 60), `average of ${week.nights} of 7`)}
        {cell("Last 30 nights", month.avgHours == null ? "—" : formatDuration(month.avgHours * 60), `average of ${month.nights} of 30`)}
        {cell("Usual bedtime", month.avgBedtime ? formatClock(month.avgBedtime, format) : "—", "last 30 days")}
        {cell("Usual wake-up", month.avgWake ? formatClock(month.avgWake, format) : "—", "last 30 days")}
      </div>
      {aim != null && week.avgHours != null && (
        <p className="text-[0.72rem] text-paper/60">
          {Math.abs(week.avgHours * 60 - aim) <= 10
            ? `This week is right on your ${formatDuration(aim)} aim.`
            : `This week averages ${formatDuration(Math.abs(week.avgHours * 60 - aim))} ${week.avgHours * 60 < aim ? "under" : "over"} your ${formatDuration(aim)} aim.`}
        </p>
      )}
      {month.excluded > 0 && (
        <p className="text-[0.72rem] text-warning">
          {month.excluded} night{month.excluded === 1 ? "" : "s"} over {MAX_SLEEP_HOURS} hours {month.excluded === 1 ? "isn't" : "aren't"} counted.
          Check {month.excluded === 1 ? "it" : "them"} in the sleep history.
        </p>
      )}
    </div>
  );
}

/** The sleep schedule you're aiming for, and how clock times are shown. */
export function SleepSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useChronicle((s) => s.profile);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const [target, setTarget] = useState<SleepTarget>({});
  const [format, setFormat] = useState<TimeFormat | "device">("device");

  useEffect(() => {
    if (!open) return;
    setTarget({ ...(profile.sleepTarget ?? {}) });
    setFormat(profile.timeFormat ?? "device");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown: TimeFormat = format === "device" ? deviceTimeFormat() : format;
  const aim = targetMinutes(target);

  function save() {
    const clean: SleepTarget = {};
    if (target.bedtime) clean.bedtime = target.bedtime;
    if (target.wakeTime) clean.wakeTime = target.wakeTime;
    const patch: Parameters<typeof updateProfile>[0] = {
      sleepTarget: clean.bedtime || clean.wakeTime ? clean : undefined,
      timeFormat: format === "device" ? undefined : format,
    };
    updateProfile(patch);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sleep goal and clock"
      description="A goal to compare your nights against. It's never saved as a night you slept."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <TimeField
            label="Aim to sleep at"
            icon={Moon}
            context="bed"
            value={target.bedtime ?? ""}
            onChange={(bedtime) => setTarget((t) => ({ ...t, bedtime: bedtime || undefined }))}
            format={shown}
            size="md"
          />
          <TimeField
            label="Aim to wake at"
            icon={Sunrise}
            context="wake"
            value={target.wakeTime ?? ""}
            onChange={(wakeTime) => setTarget((t) => ({ ...t, wakeTime: wakeTime || undefined }))}
            format={shown}
            size="md"
          />
        </div>
        <p className="text-[0.78rem] text-paper/65">
          {aim != null ? `That allows ${formatDuration(aim)} of sleep a night.` : "Set both to see how much sleep that allows."}
          {(target.bedtime || target.wakeTime) && (
            <button
              type="button"
              onClick={() => setTarget({})}
              className="ml-2 font-semibold text-accent hover:underline"
            >
              Remove the goal
            </button>
          )}
        </p>

        <div>
          <p className="mb-2 text-[0.75rem] font-semibold text-paper/65">Show times as</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Clock format">
            {(
              [
                { id: "device", label: `Device (${deviceTimeFormat() === "12h" ? "11:30 PM" : "23:30"})` },
                { id: "12h", label: "11:30 PM" },
                { id: "24h", label: "23:30" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={format === o.id}
                onClick={() => setFormat(o.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  format === o.id ? "border-accent/40 bg-accent/15 text-accent" : "border-line bg-card text-paper/65 hover:text-paper",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The Life Dashboard's sleep card: last night by default, tonight once a
 * bedtime is in, and any earlier night with the arrows. One tap records
 * "going to bed now" or "woke up now" at the moment it happens.
 */
export function SleepCard() {
  const lifeLog = useChronicle((s) => s.lifeLog);
  const profile = useChronicle((s) => s.profile);
  const quick = useSleepQuickActions();
  const format = timeFormatOf(profile);
  const today = quick.today;
  const tonight = quick.tonightDate && quick.tonightDate > today ? quick.tonightDate : null;
  const tonightStarted = Boolean(tonight && lifeLog.some((l) => l.date === tonight && l.bedtime));
  const latest = tonightStarted && tonight ? tonight : today;

  const [date, setDate] = useState<ISODate>(latest);
  const [moved, setMoved] = useState(false);
  const [settings, setSettings] = useState(false);
  // Follow the current night until you browse to another one.
  useEffect(() => {
    if (!moved) setDate(latest);
  }, [latest, moved]);

  const last = tonight ?? today;
  const label = date === today ? "Last night" : date === tonight ? "Tonight" : "An earlier night";
  const target = profile.sleepTarget;

  function go(next: ISODate) {
    setMoved(next !== latest);
    setDate(next);
  }

  return (
    <Card className="p-5 sm:p-6" data-testid="sleep-card" aria-labelledby="sleep-card-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Moon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="sleep-card-title" className="font-display text-base font-semibold tracking-snugg text-paper">
              Sleep · {label}
            </h2>
            <p className="text-[0.75rem] text-paper/55">{nightLabel(date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(shift(date, -1))}
            aria-label="Previous night"
            className="grid h-9 w-9 place-items-center rounded-full text-paper/60 hover:bg-paper/[0.06] hover:text-paper"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(shift(date, 1))}
            disabled={date >= last}
            aria-label="Next night"
            className="grid h-9 w-9 place-items-center rounded-full text-paper/60 hover:bg-paper/[0.06] hover:text-paper disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== latest && (
            <button
              type="button"
              onClick={() => {
                setMoved(false);
                setDate(latest);
              }}
              className="rounded-full px-2.5 py-1 text-[0.72rem] font-semibold text-accent hover:underline"
            >
              Latest
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettings(true)}
            aria-label="Sleep goal and clock settings"
            title="Sleep goal and clock"
            className="grid h-9 w-9 place-items-center rounded-full text-paper/60 hover:bg-paper/[0.06] hover:text-paper"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {(quick.canBedNow || quick.canWakeNow) && (
        <div className="mb-5 flex flex-col gap-2.5 rounded-2xl border border-accent/25 bg-accent/[0.06] p-3 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[0.78rem] text-paper/75">
            {quick.canWakeNow
              ? `${quick.morning ? "Good morning. " : ""}One tap records the time you woke up.`
              : "Heading to bed? Record the time now, and the morning only needs the wake-up."}
          </p>
          {quick.canWakeNow ? (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                quick.wakeNow();
                setMoved(false);
                setDate(today);
              }}
            >
              <Sunrise className="h-4 w-4" /> Woke up now · {formatClock(quick.nowClock, format)}
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                quick.bedNow();
                setMoved(false);
              }}
            >
              <BedDouble className="h-4 w-4" /> Going to bed now · {formatClock(quick.nowClock, format)}
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <SleepEditor date={date} variant="card" />

        <div className="space-y-3 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Your sleep</p>
            <div className="flex items-center gap-3 text-[0.75rem]">
              {target && targetMinutes(target) != null ? (
                <button type="button" onClick={() => setSettings(true)} className="text-paper/60 hover:text-paper">
                  Aim {formatClock(target.bedtime, format)} to {formatClock(target.wakeTime, format)}
                </button>
              ) : (
                <button type="button" onClick={() => setSettings(true)} className="font-semibold text-accent hover:underline">
                  Set a sleep goal
                </button>
              )}
              <Link href="/wellbeing/sleep" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                Sleep history <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <SleepSummary compact />
        </div>
      </div>

      <SleepSettings open={settings} onClose={() => setSettings(false)} />
    </Card>
  );
}
