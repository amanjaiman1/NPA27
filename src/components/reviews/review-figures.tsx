"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarCheck, Clock, Gauge, ListChecks, Moon, Repeat, Route, Target } from "lucide-react";
import type { PerformanceSnapshot } from "@/lib/types";
import { OBSERVATION_LABEL, type Observation, type ObservationKind } from "@/lib/performance";
import { cn, round } from "@/lib/utils";

/* Shared pieces of the Performance Review: the figures and the summary. */

/** A measured number, with its change on the period before when there is one. */
function Figure({
  icon: Icon,
  label,
  value,
  foot,
  now,
  before,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  foot?: string;
  now?: number | null;
  before?: number | null;
}) {
  const delta = typeof now === "number" && typeof before === "number" && before > 0 ? (now - before) / before : null;
  const dir = delta === null || Math.abs(delta) < 0.005 ? 0 : delta > 0 ? 1 : -1;
  return (
    <div className="inset-panel min-w-0 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[0.68rem] font-medium text-paper/60">
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="tabular mt-1 text-[1.15rem] font-semibold tracking-[-0.02em] text-paper">{value}</p>
      <p className="flex min-w-0 items-center gap-1.5 text-[0.66rem] text-paper/55">
        {dir !== 0 && delta !== null && (
          <span className={cn("tabular inline-flex shrink-0 items-center gap-0.5 font-semibold", dir > 0 ? "text-positive" : "text-danger")}>
            {dir > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
            <span className="sr-only">{dir > 0 ? "up" : "down"}</span>
            {Math.abs(Math.round(delta * 100))}%
          </span>
        )}
        {foot && <span className="truncate">{foot}</span>}
      </p>
    </div>
  );
}

export function FigureGrid({ s, typeWord = "period" }: { s: PerformanceSnapshot; typeWord?: string }) {
  const p = s.previous;
  const was = (v: number | null | undefined, unit = "") => (p && v !== null && v !== undefined ? `was ${round(v, 1)}${unit}` : undefined);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Figure icon={Clock} label="Study hours" value={`${s.studyHours} h`} now={s.studyHours} before={p?.studyHours} foot={was(p?.studyHours, " h") ?? (s.hoursTarget ? `target ${s.hoursTarget} h` : undefined)} />
      <Figure icon={CalendarCheck} label="Active days" value={`${s.activeDays} of ${s.days}`} now={s.activeDays} before={p?.activeDays} foot={was(p?.activeDays)} />
      <Figure icon={Target} label="Topics finished" value={`${s.topicsCompleted}`} now={s.topicsCompleted} before={p?.topicsCompleted} foot={was(p?.topicsCompleted)} />
      <Figure icon={Repeat} label="Revision passes" value={`${s.revision.passes}`} now={s.revision.passes} before={p?.revisionPasses} foot={was(p?.revisionPasses)} />
      <Figure
        icon={ListChecks}
        label="Habits kept"
        value={s.habits.rate === null ? "–" : `${Math.round(s.habits.rate * 100)}%`}
        now={s.habits.rate}
        before={p?.habitRate}
        foot={s.habits.scheduled ? `${s.habits.kept} of ${s.habits.scheduled} due days` : "nothing due"}
      />
      <Figure
        icon={Route}
        label="Roadmap"
        value={s.roadmap.planned ? `${s.roadmap.completed} of ${s.roadmap.planned}` : "–"}
        now={s.roadmap.completed}
        before={p?.roadmapCompleted}
        foot={s.roadmap.planned ? "activities completed" : `nothing planned this ${typeWord}`}
      />
      <Figure icon={Gauge} label="Mocks" value={`${s.mocks.taken}`} now={s.mocks.taken} before={p?.mocksTaken} foot={s.mocks.avgPct !== null ? `average ${s.mocks.avgPct}%` : "none taken"} />
      <Figure
        icon={Moon}
        label="Sleep"
        value={s.sleep.avgHours === null ? "–" : `${s.sleep.avgHours} h`}
        now={s.sleep.avgHours}
        before={p?.sleepAvg}
        foot={s.sleep.nights ? `a night, ${s.sleep.nights} recorded` : "none recorded"}
      />
    </div>
  );
}

const KIND_STYLE: Record<ObservationKind, string> = {
  recorded: "bg-positive/10 text-positive",
  planned: "bg-accent/10 text-accent",
  derived: "bg-paper/[0.07] text-paper/75",
  missing: "bg-warning/15 text-warning",
};

/** The summary: one statement a line, each labelled by where it comes from. */
export function ObservationList({ items }: { items: Observation[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((o, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[0.82rem] leading-relaxed">
          <span className={cn("mt-0.5 w-[5.4rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[0.62rem] font-semibold", KIND_STYLE[o.kind])}>
            {OBSERVATION_LABEL[o.kind]}
          </span>
          <span className="min-w-0 flex-1 text-paper/80">
            {o.text}
            {o.href && (
              <>
                {" "}
                <Link href={o.href} className="whitespace-nowrap text-[0.74rem] font-semibold text-accent hover:underline">
                  See records
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What each label means, said once. */
export function ObservationKey() {
  const order: ObservationKind[] = ["recorded", "planned", "derived", "missing"];
  const what: Record<ObservationKind, string> = {
    recorded: "what you logged",
    planned: "what the Roadmap said",
    derived: "worked out from records",
    missing: "nothing was recorded",
  };
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[0.66rem] text-paper/55">
      {order.map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className={cn("rounded-full px-1.5 py-px text-[0.6rem] font-semibold", KIND_STYLE[k])}>{OBSERVATION_LABEL[k]}</span>
          {what[k]}
        </span>
      ))}
    </p>
  );
}

export function SubjectSplit({ s }: { s: PerformanceSnapshot }) {
  if (!s.subjects.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {s.subjects.slice(0, 8).map((x) => (
        <span key={x.id} className="rounded-full border border-line bg-paper/[0.03] px-2.5 py-1 text-[0.7rem] text-paper/75">
          {x.name}
          <span className="tabular ml-1.5 text-paper/50">
            {x.hours} h · {x.share}%
          </span>
        </span>
      ))}
    </div>
  );
}
