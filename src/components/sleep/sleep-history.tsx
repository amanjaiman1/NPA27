"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarPlus, Pencil, Trash2, TriangleAlert } from "lucide-react";
import type { ISODate } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import {
  MAX_SLEEP_HOURS,
  formatClock,
  formatDuration,
  nightLabel,
  shortDay,
  sleepNights,
  timeFormatOf,
  type SleepNight,
} from "@/lib/sleep";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, toISODate } from "@/lib/utils";
import { SleepEditor } from "./sleep-editor";
import { SleepSummary } from "./sleep-card";

const PAGE = 21;

/** Edits any night in a dialog, with the night chosen by the day you woke up. */
export function SleepNightDialog({ date, onClose }: { date: ISODate | null; onClose: () => void }) {
  const now = useNow(60_000);
  const today = toISODate(now);
  const [day, setDay] = useState<ISODate | null>(date);
  // Opening on a night starts the picker there.
  useEffect(() => {
    setDay(date);
  }, [date]);
  const current = day ?? date;

  return (
    <Modal
      open={Boolean(date)}
      onClose={onClose}
      title="Record or edit a night"
      description={current ? `The night of ${nightLabel(current)}` : undefined}
      className="sm:max-w-xl"
    >
      {current && (
        <div className="space-y-5">
          <label className="block text-[0.75rem] font-semibold text-paper/65">
            Woke up on
            <Input
              type="date"
              value={current}
              max={today}
              onChange={(e) => e.target.value && setDay(e.target.value > today ? today : e.target.value)}
              className="mt-1.5 w-44"
            />
          </label>
          <SleepEditor
            date={current}
            variant="sheet"
            onSaved={onClose}
            onDeleted={onClose}
          />
        </div>
      )}
    </Modal>
  );
}

function NightRow({
  n,
  format,
  onEdit,
  onDelete,
}: {
  n: SleepNight;
  format: ReturnType<typeof timeFormatOf>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const minutes = n.hours != null ? n.hours * 60 : n.timesMinutes;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 sm:px-6" data-testid="sleep-night">
      <div className="w-32 shrink-0">
        <p className="text-sm font-medium text-paper">{shortDay(n.date)}</p>
        <p className="text-[0.68rem] text-paper/50">woke up</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="tabular text-sm text-paper/80">
          {n.bedtime ? formatClock(n.bedtime, format) : "—"}
          <ArrowRight className="mx-1.5 inline h-3 w-3 align-[-1px] text-paper/40" aria-label="to" />
          {n.wakeTime ? formatClock(n.wakeTime, format) : "—"}
          {n.quality != null && <span className="ml-2 text-[0.72rem] text-paper/55">quality {n.quality}/5</span>}
        </p>
        <p className="text-[0.68rem] text-paper/50">
          {n.pending
            ? "Wake-up not recorded yet"
            : n.implausible
              ? `Over ${MAX_SLEEP_HOURS} hours, so it isn't counted in averages. Check the times.`
              : n.manualHours
                ? `Time asleep entered: ${formatDuration((n.hours ?? 0) * 60)} of ${formatDuration(n.timesMinutes ?? 0)} in bed`
                : n.timesMinutes == null && n.hours != null
                  ? "Hours only, no times"
                  : nightLabel(n.date)}
        </p>
      </div>
      <p
        className={cn(
          "tabular w-20 shrink-0 text-right font-display text-base font-bold tracking-tightest",
          n.implausible ? "text-warning" : "text-paper",
        )}
      >
        {n.implausible && <TriangleAlert className="mr-1 inline h-3.5 w-3.5" aria-label="Implausible" />}
        {minutes != null ? formatDuration(minutes) : "—"}
      </p>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit the night of ${nightLabel(n.date)}`}
          className="grid h-9 w-9 place-items-center rounded-lg text-paper/55 hover:bg-paper/[0.06] hover:text-paper"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete the night of ${nightLabel(n.date)}`}
          className="grid h-9 w-9 place-items-center rounded-lg text-paper/55 hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/**
 * Every recorded night, newest first, with averages over the last week and
 * month. Nights can be edited or deleted here; deleting one removes only its
 * sleep, never the rest of that day.
 */
export function SleepHistory() {
  const lifeLog = useChronicle((s) => s.lifeLog);
  const profile = useChronicle((s) => s.profile);
  const clearSleep = useChronicle((s) => s.clearSleep);
  const confirm = useConfirm();
  const now = useNow(60_000);
  const today = toISODate(now);
  const format = timeFormatOf(profile);
  const nights = useMemo(() => sleepNights(lifeLog), [lifeLog]);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<ISODate | null>(null);

  async function remove(n: SleepNight) {
    const ok = await confirm({
      title: "Delete this night's sleep?",
      description: `Bedtime, wake-up, hours and quality for the night of ${nightLabel(n.date)} will be removed. Everything else logged that day stays.`,
      confirmLabel: "Delete night",
    });
    if (ok) clearSleep(n.date);
  }

  return (
    <section className="space-y-4" aria-labelledby="sleep-history-title" data-testid="sleep-history">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Every night</p>
          <h2 id="sleep-history-title" className="text-base font-semibold text-paper">
            Sleep history
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(today)}>
          <CalendarPlus className="h-4 w-4" /> Record a night
        </Button>
      </div>

      <Card className="p-5 sm:p-6">
        <SleepSummary />
      </Card>

      <Card className="overflow-hidden">
        {nights.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-paper/55">No nights recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {nights.slice(0, limit).map((n) => (
              <NightRow key={n.date} n={n} format={format} onEdit={() => setEditing(n.date)} onDelete={() => void remove(n)} />
            ))}
          </ul>
        )}
        {nights.length > limit && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, nights.length - limit)} more of {nights.length - limit}
            </Button>
          </div>
        )}
      </Card>

      <SleepNightDialog date={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
