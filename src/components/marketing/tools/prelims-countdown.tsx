"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/components/marketing/analytics";

/* ════════════════════════════════════════════════════════════════
   PRELIMS COUNTDOWN AND STUDY-HOURS PLANNER
   The page renders `initialToday` on the server (refreshed hourly), so
   the number is right in the HTML; this then keeps it right in the tab
   and does the planner arithmetic. All dates are India dates.
   ════════════════════════════════════════════════════════════════ */

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function daysUntil(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const n = (v: number) => new Intl.NumberFormat("en-IN").format(Math.max(0, Math.round(v)));

function NumberInput({
  id,
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-paper">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-xs text-paper/55">
        {hint}
      </p>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="mt-2 h-11 w-full rounded-xl border border-line bg-paper/[0.03] px-3.5 text-base text-paper outline-none focus:border-accent/55 focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}

export function PrelimsCountdown({
  prelims,
  mainsStart,
  initialToday,
}: {
  prelims: string;
  mainsStart: string;
  initialToday: string;
}) {
  const [today, setToday] = useState(initialToday);
  const [hours, setHours] = useState(6);
  const [restDays, setRestDays] = useState(1);
  const [revisionWeeks, setRevisionWeeks] = useState(8);
  const [touched, setTouched] = useState(false);

  // Keep the count right if the tab is left open across midnight.
  useEffect(() => {
    setToday(todayInIndia());
    const id = window.setInterval(() => setToday(todayInIndia()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const touch = () => {
    if (!touched) {
      setTouched(true);
      track("tool_use", { tool: "prelims_countdown" });
    }
  };

  const days = daysUntil(today, prelims);
  const mainsDays = daysUntil(today, mainsStart);

  const plan = useMemo(() => {
    const left = Math.max(0, days);
    const studyDays = left - Math.floor(left / 7) * restDays - Math.max(0, (left % 7) - (7 - restDays));
    const totalHours = studyDays * hours;
    const revisionDays = Math.min(left, revisionWeeks * 7);
    const revisionStudyDays = revisionDays - Math.floor(revisionDays / 7) * restDays;
    const revisionHours = Math.max(0, revisionStudyDays) * hours;
    return {
      studyDays: Math.max(0, studyDays),
      totalHours,
      revisionHours,
      newHours: Math.max(0, totalHours - revisionHours),
      weeks: Math.floor(left / 7),
      extra: left % 7,
    };
  }, [days, hours, restDays, revisionWeeks]);

  if (days < 0) {
    return (
      <div className="rounded-3xl border border-line bg-card p-8 text-center shadow-lift">
        <p className="font-display text-2xl font-bold text-paper">UPSC Prelims 2027 has taken place.</p>
        <p className="mt-2 text-sm text-paper/65">Check upsc.gov.in for results and the next examination calendar.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl border border-line bg-card p-8 text-center shadow-lift">
        <div className="pointer-events-none absolute inset-0 bg-aura opacity-70" aria-hidden />
        <div className="relative" aria-live="polite">
          <p className="eyebrow">Days left until Prelims</p>
          <p className="tabular mt-3 font-display text-[4.5rem] font-bold leading-none tracking-tightest text-paper sm:text-[5.5rem]">
            {n(days)}
          </p>
          <p className="mt-3 text-sm text-paper/70">
            {days === 0
              ? "Prelims is today. All the best."
              : `That is ${plan.weeks} week${plan.weeks === 1 ? "" : "s"}${plan.extra ? ` and ${plan.extra} day${plan.extra === 1 ? "" : "s"}` : ""}.`}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-2xl border border-line bg-paper/[0.03] p-4">
              <p className="text-xs text-paper/55">Days to Mains</p>
              <p className="tabular mt-1 text-2xl font-bold text-paper">{n(mainsDays)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper/[0.03] p-4">
              <p className="text-xs text-paper/55">Counted from</p>
              <p className="tabular mt-1 text-2xl font-bold text-paper">{today.split("-").reverse().join("/")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-line bg-card p-6 shadow-soft sm:p-8">
        <h2 className="font-display text-xl font-bold tracking-tightest text-paper">What those days hold</h2>
        <p className="mt-1 text-sm text-paper/60">Change the numbers to match your week. Nothing is saved or sent anywhere.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3" onInput={touch}>
          <NumberInput id="cd-hours" label="Hours a day" hint="On a study day" value={hours} min={0.5} max={16} step={0.5} onChange={setHours} />
          <NumberInput id="cd-rest" label="Rest days" hint="Per week" value={restDays} min={0} max={3} onChange={setRestDays} />
          <NumberInput
            id="cd-rev"
            label="Revision weeks"
            hint="Kept at the end"
            value={revisionWeeks}
            min={0}
            max={26}
            onChange={setRevisionWeeks}
          />
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-paper/[0.03] p-4">
            <dt className="text-xs text-paper/55">Study days left</dt>
            <dd className="tabular mt-1 text-2xl font-bold text-paper">{n(plan.studyDays)}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-paper/[0.03] p-4">
            <dt className="text-xs text-paper/55">Study hours left</dt>
            <dd className="tabular mt-1 text-2xl font-bold text-paper">{n(plan.totalHours)}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-paper/[0.03] p-4">
            <dt className="text-xs text-paper/55">Hours before the revision weeks</dt>
            <dd className="tabular mt-1 text-2xl font-bold text-paper">{n(plan.newHours)}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-paper/[0.03] p-4">
            <dt className="text-xs text-paper/55">Hours in the revision weeks</dt>
            <dd className="tabular mt-1 text-2xl font-bold text-paper">{n(plan.revisionHours)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-paper/55">
          Rough arithmetic, not a forecast: real weeks lose days to illness, travel and bad days. Plan on less than the
          total.
        </p>
      </div>
    </div>
  );
}
