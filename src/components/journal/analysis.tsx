"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Clock,
  CalendarCheck,
  Gauge,
  Star,
  Flame,
  Target,
  BookOpen,
  Repeat,
  FileCheck2,
  Newspaper,
  Sunrise,
  Moon,
  Tag,
  Trophy,
  TriangleAlert,
  Lightbulb,
  PenLine,
} from "lucide-react";
import type { JournalEntry, Subject } from "@/lib/types";
import {
  analyseJournal,
  describeWindow,
  GRANULARITIES,
  type Granularity,
  type JournalAnalysis,
} from "@/lib/journal-analysis";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, RadialProgress } from "@/components/ui/progress";
import { Segmented, EmptyState } from "@/components/ui/misc";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { Donut } from "@/components/charts/donut";
import { formatDate, formatHours, round, cn } from "@/lib/utils";

/* ── formatting helpers ──────────────────────────────────────── */

/**
 * A fractional change as a readable string. Percentages stop meaning anything
 * once they run into four figures — going from 2 logged hours to 200 is "+9900%",
 * which tells you nothing — so past 10x it switches to a multiplier.
 */
function formatChange(f: number | null): string {
  if (f == null) return "—";
  if (f > 10) return `×${round(f + 1, 1)}`;
  if (f < -0.999) return "−100%";
  const pct = f * 100;
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${round(Math.abs(pct), pct >= 10 || pct <= -10 ? 0 : 1)}%`;
}

function hoursLabel(h: number): string {
  return h >= 100 ? `${Math.round(h)}h` : `${round(h, 1)}h`;
}

/* ── small pieces ────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  foot,
  change,
  goodWhenUp = true,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  foot?: React.ReactNode;
  change?: number | null;
  goodWhenUp?: boolean;
}) {
  const dir = change == null || change === 0 ? 0 : change > 0 ? 1 : -1;
  const good = dir === 0 ? null : (dir > 0) === goodWhenUp;
  const DirIcon = dir === 0 ? Minus : dir > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-paper/50">
        <Icon className="h-3.5 w-3.5 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <p className="tabular mt-2 font-display text-[1.55rem] font-bold leading-none tracking-tightest text-paper">
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {/* Nothing to compare against reads better as no chip at all — an arrow
            next to a dash just looks like two dashes. */}
        {change != null && (
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 text-[0.7rem] font-semibold",
              good == null ? "text-paper/40" : good ? "text-positive" : "text-danger",
            )}
          >
            <DirIcon className="h-3 w-3" />
            {formatChange(change)}
          </span>
        )}
        {foot && <span className="truncate text-[0.7rem] text-paper/45">{foot}</span>}
      </div>
    </Card>
  );
}

/** One 1–5 rating as a labelled bar. */
function RatingBar({
  label,
  value,
  shift,
}: {
  label: string;
  value: number | null;
  shift?: number | null;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[0.7rem] font-medium uppercase tracking-wider text-paper/45">
          {label}
        </span>
        <span className="tabular text-sm font-semibold text-paper">
          {value == null ? "—" : `${value}`}
          <span className="ml-0.5 text-[0.7rem] font-normal text-paper/35">/5</span>
          {shift != null && shift !== 0 && (
            <span
              className={cn(
                "ml-1.5 text-[0.68rem] font-semibold",
                shift > 0 ? "text-positive" : "text-danger",
              )}
            >
              {shift > 0 ? "+" : "−"}
              {Math.abs(shift)}
            </span>
          )}
        </span>
      </div>
      <Progress value={value == null ? 0 : (value / 5) * 100} />
    </div>
  );
}

function CountTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-paper/40">
        <Icon className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate text-[0.6rem] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="tabular mt-1.5 text-xl font-semibold text-paper">{value}</p>
      {hint && <p className="truncate text-[0.66rem] text-paper/40">{hint}</p>}
    </div>
  );
}

/* ── the view ────────────────────────────────────────────────── */

export function JournalAnalysisView({
  journal,
  subjects,
}: {
  journal: JournalEntry[];
  subjects: Subject[];
}) {
  const [granularity, setGranularity] = useState<Granularity>("day");

  const a: JournalAnalysis = useMemo(
    () => analyseJournal(journal, subjects, granularity),
    [journal, subjects, granularity],
  );

  const perBucket = granularity === "day" ? "day" : granularity === "week" ? "week" : granularity === "month" ? "month" : "year";

  if (journal.length === 0) {
    return (
      <EmptyState
        icon={<Gauge className="h-5 w-5" />}
        title="Nothing to analyse yet"
        description="Log a few days in the journal and this fills in — volume, consistency, subject split, state of mind and how it all trends."
      />
    );
  }

  const trend = a.buckets.map((b) => ({
    label: b.label,
    value: b.hours,
    sublabel: b.full,
    meta: `${b.full} · ${hoursLabel(b.hours)}${b.loggedDays ? ` · ${b.loggedDays} day${b.loggedDays === 1 ? "" : "s"} logged` : " · nothing logged"}`,
  }));

  const consistencyPct = Math.round(a.totals.consistency * 100);

  return (
    <div className="space-y-6">
      {/* granularity + window */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Analysis</p>
          <h2 className="text-base font-semibold text-paper">
            {describeWindow(a)}
            <span className="ml-2 text-sm font-normal text-paper/40">
              · by {perBucket}
            </span>
          </h2>
        </div>
        <Segmented
          value={granularity}
          onChange={(v) => setGranularity(v as Granularity)}
          options={GRANULARITIES.map((g) => ({ label: g.label, value: g.id }))}
        />
      </div>

      {/* headline numbers, each against the window before */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Hours studied"
          value={hoursLabel(a.totals.hours)}
          change={a.change.hours}
          foot={`was ${hoursLabel(a.previous.hours)}`}
        />
        <StatCard
          icon={CalendarCheck}
          label="Days studied"
          value={`${a.totals.activeDays}`}
          change={a.change.activeDays}
          foot={`of ${a.window.days} days`}
        />
        <StatCard
          icon={Gauge}
          label="Average a day"
          value={hoursLabel(a.totals.avgHoursPerDay)}
          change={a.change.avgHoursPerDay}
          foot={`${hoursLabel(a.totals.avgHoursPerActiveDay)} on active days`}
        />
        <StatCard
          icon={Star}
          label="Best day"
          value={a.best ? formatHours(a.best.hours) : "—"}
          foot={a.best ? formatDate(a.best.date) : "nothing logged"}
        />
      </div>

      {/* the trend */}
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">Volume</p>
            <h3 className="text-base font-semibold text-paper">
              Hours per {perBucket}
            </h3>
          </div>
          <Badge tone="outline">
            {a.buckets.length} {perBucket}s
          </Badge>
        </div>
        {granularity === "day" ? (
          <LineChart
            data={trend}
            height={210}
            formatValue={(v) => hoursLabel(v)}
          />
        ) : (
          <BarChart data={trend} height={210} formatValue={(v) => hoursLabel(v)} />
        )}
      </Card>

      {/* consistency + state of mind */}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5 sm:p-6">
          <p className="eyebrow mb-1">Consistency</p>
          <h3 className="mb-5 text-base font-semibold text-paper">
            How much of the window you showed up for
          </h3>
          <div className="flex items-center gap-5">
            <RadialProgress
              value={consistencyPct}
              size={92}
              stroke={8}
              label={`${consistencyPct}%`}
              sublabel="logged"
            />
            <div className="min-w-0 flex-1 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-paper/55">Days with an entry</span>
                <span className="tabular font-semibold text-paper">
                  {a.totals.loggedDays} / {a.window.days}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-paper/55">Days studied</span>
                <span className="tabular font-semibold text-paper">
                  {a.totals.activeDays}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-paper/55">Logged but no hours</span>
                <span className="tabular font-semibold text-paper">
                  {a.totals.restDays}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
                <span className="inline-flex items-center gap-1.5 text-paper/55">
                  <Flame className="h-3.5 w-3.5 text-accent" /> Streak
                </span>
                <span className="tabular font-semibold text-paper">
                  {a.streak.current}d
                  <span className="ml-1.5 text-[0.7rem] font-normal text-paper/40">
                    best {a.streak.longest}d
                  </span>
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <p className="eyebrow mb-1">State of mind</p>
          <h3 className="mb-5 text-base font-semibold text-paper">
            Averages across the window
          </h3>
          <div className="space-y-4">
            <RatingBar label="Mood" value={a.mind.mood} shift={a.moodShift} />
            <RatingBar label="Energy" value={a.mind.energy} />
            <RatingBar label="Motivation" value={a.mind.motivation} />
            <RatingBar label="Focus" value={a.mind.focus} />
          </div>
        </Card>
      </div>

      {/* subject split + weekday rhythm */}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5 sm:p-6">
          <p className="eyebrow mb-1">Where the hours went</p>
          <h3 className="mb-5 text-base font-semibold text-paper">
            Split by subject
          </h3>
          {a.subjects.length === 0 ? (
            <p className="py-8 text-center text-sm text-paper/40">
              No subject blocks recorded in this window.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut
                segments={a.subjects.slice(0, 6).map((s) => ({
                  label: s.name,
                  value: s.hours,
                }))}
                size={140}
                thickness={16}
                centerLabel={hoursLabel(a.totals.hours)}
                centerSub="total"
              />
              <ul className="min-w-0 flex-1 space-y-2">
                {a.subjects.slice(0, 6).map((s) => (
                  <li key={s.subjectId} className="flex items-center gap-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-paper/70">
                      {s.name}
                    </span>
                    <span className="tabular shrink-0 font-semibold text-paper">
                      {hoursLabel(s.hours)}
                    </span>
                    <span className="tabular w-11 shrink-0 text-right text-[0.7rem] text-paper/40">
                      {s.share}%
                    </span>
                  </li>
                ))}
                {a.subjects.length > 6 && (
                  <li className="pt-0.5 text-[0.7rem] text-paper/35">
                    +{a.subjects.length - 6} more subject
                    {a.subjects.length - 6 === 1 ? "" : "s"}
                  </li>
                )}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <p className="eyebrow mb-1">Rhythm</p>
          <h3 className="mb-5 text-base font-semibold text-paper">
            Average hours by weekday
          </h3>
          <BarChart
            data={a.weekday.map((w) => ({
              label: w.label,
              value: w.avgHours,
              sublabel: `${w.activeDays} day${w.activeDays === 1 ? "" : "s"} studied`,
            }))}
            height={170}
            formatValue={(v) => hoursLabel(v)}
          />
          {(a.rhythm.avgWake || a.rhythm.avgSleep) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3.5 text-sm">
              {a.rhythm.avgSleep && (
                <span className="inline-flex items-center gap-1.5 text-paper/55">
                  <Moon className="h-3.5 w-3.5 text-accent" /> Asleep around{" "}
                  <span className="tabular font-semibold text-paper">
                    {a.rhythm.avgSleep}
                  </span>
                </span>
              )}
              {a.rhythm.avgWake && (
                <span className="inline-flex items-center gap-1.5 text-paper/55">
                  <Sunrise className="h-3.5 w-3.5 text-accent" /> Awake around{" "}
                  <span className="tabular font-semibold text-paper">
                    {a.rhythm.avgWake}
                  </span>
                </span>
              )}
              <span className="text-[0.7rem] text-paper/35">
                from {a.rhythm.nights} night{a.rhythm.nights === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* output + discipline */}
      <Card className="p-5 sm:p-6">
        <p className="eyebrow mb-1">Output</p>
        <h3 className="mb-5 text-base font-semibold text-paper">
          What the hours produced
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CountTile
            icon={Target}
            label="Topics done"
            value={a.totals.topics}
            hint={
              a.totals.activeDays
                ? `${round(a.totals.topics / a.totals.activeDays, 1)} a day`
                : undefined
            }
          />
          <CountTile icon={Repeat} label="Revisions" value={a.totals.revisions} />
          <CountTile icon={FileCheck2} label="Mocks" value={a.totals.mocks} />
          <CountTile icon={BookOpen} label="Book sessions" value={a.totals.books} />
          <CountTile
            icon={Newspaper}
            label="Current affairs"
            value={a.totals.currentAffairs}
          />
        </div>

        <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-[0.7rem] font-medium uppercase tracking-wider text-paper/45">
                Planned tasks completed
              </span>
              <span className="tabular text-sm font-semibold text-paper">
                {a.totals.taskCompletion == null
                  ? "—"
                  : `${Math.round(a.totals.taskCompletion * 100)}%`}
              </span>
            </div>
            <Progress
              value={
                a.totals.taskCompletion == null ? 0 : a.totals.taskCompletion * 100
              }
            />
            <p className="mt-1.5 text-[0.7rem] text-paper/40">
              {a.totals.tasksPlanned === 0
                ? "No tasks planned in this window."
                : `${a.totals.tasksDone} of ${a.totals.tasksPlanned} tasks`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
            {[
              { icon: Trophy, label: "Wins", value: a.narrative.wins },
              { icon: TriangleAlert, label: "Failures", value: a.narrative.failures },
              { icon: Lightbulb, label: "Lessons", value: a.narrative.lessons },
              { icon: PenLine, label: "Written", value: a.narrative.reflections },
            ].map((n) => (
              <div key={n.label}>
                <div className="flex items-center gap-1.5 text-paper/40">
                  <n.icon className="h-3.5 w-3.5" />
                  <span className="text-[0.6rem] font-medium uppercase tracking-wider">
                    {n.label}
                  </span>
                </div>
                <p className="tabular mt-0.5 text-lg font-semibold text-paper">
                  {n.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {a.tags.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-paper/40">
              <Tag className="h-3.5 w-3.5" />
              <span className="text-[0.6rem] font-medium uppercase tracking-wider">
                Most used tags
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.tags.slice(0, 10).map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/[0.03] px-2.5 py-1 text-[0.72rem] text-paper/70"
                >
                  {t.tag}
                  <span className="tabular text-[0.66rem] text-paper/40">
                    {t.count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* per-bucket table — the in-depth read */}
      <Card className="overflow-hidden">
        <div className="p-5 pb-3 sm:px-6">
          <p className="eyebrow mb-1">Bucket by bucket</p>
          <h3 className="text-base font-semibold text-paper">
            Every {perbucketSingular(perBucket)} in the window
          </h3>
        </div>
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-y border-line text-[0.62rem] uppercase tracking-wider text-paper/40">
                <th className="px-5 py-2 text-left font-medium sm:px-6">
                  {perbucketSingular(perBucket)}
                </th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-3 py-2 text-right font-medium">Logged</th>
                <th className="px-3 py-2 text-right font-medium">Avg</th>
                <th className="px-3 py-2 text-right font-medium">Topics</th>
                <th className="px-3 py-2 text-right font-medium">Mocks</th>
                <th className="px-5 py-2 text-right font-medium sm:px-6">Mood</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...a.buckets].reverse().map((b) => (
                <tr key={b.key} className="text-paper/75">
                  <td className="whitespace-nowrap px-5 py-2.5 text-paper sm:px-6">
                    {b.full}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold text-paper">
                    {b.hours > 0 ? hoursLabel(b.hours) : "—"}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">
                    {b.loggedDays}
                    <span className="text-paper/35">/{b.days}</span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">
                    {b.activeDays > 0
                      ? hoursLabel(round(b.hours / b.activeDays, 2))
                      : "—"}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{b.topics || "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right">{b.mocks || "—"}</td>
                  <td className="tabular px-5 py-2.5 text-right sm:px-6">
                    {b.avgMood == null ? "—" : b.avgMood}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function perbucketSingular(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}
