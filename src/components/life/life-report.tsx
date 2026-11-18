"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Info,
  Lightbulb,
  Minus,
  Paperclip,
  Pencil,
  TriangleAlert,
  ThumbsUp,
} from "lucide-react";
import type { ISODate, JournalEntry, LifeEntry, LifeField } from "@/lib/types";
import {
  MIN_GROUP,
  MIN_PAIRS,
  SPAN_PRESETS,
  buildLifeReport,
  describeSpan,
  factorLinks,
  normalizeSpan,
  presetSpan,
  strengthLabel,
  type DailyRow,
  type DateSpan,
  type ReportBucket,
  type ReportGroup,
  type ReportMetric,
  type SpanPreset,
} from "@/lib/life";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { BarChart } from "@/components/charts/bar-chart";
import { cn, formatDate, round, weekday } from "@/lib/utils";

const GROUP_ORDER: ReportGroup[] = ["Study", "Sleep", "Movement", "Wellbeing", "Mind"];

/** "7.5 h", "3.2/5", "45 min". */
export function formatReading(unit: string, decimals: number, v: number): string {
  const n = round(v, decimals);
  if (unit === "/5") return `${n}/5`;
  if (unit === "days") return `${n} day${n === 1 ? "" : "s"}`;
  return `${n} ${unit}`;
}

function ChangeLine({ m }: { m: ReportMetric }) {
  if (m.value == null) return <p className="text-[0.7rem] text-paper/45">No readings in this period</p>;
  if (m.change == null) {
    return (
      <p className="text-[0.7rem] text-paper/45">
        {m.id === "weight" ? "One reading so far" : "No earlier readings to compare"}
      </p>
    );
  }
  const same = m.change === 0;
  const up = m.change > 0;
  const good = same || m.better == null ? null : (m.better === "higher") === up;
  const Icon = same ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1 text-[0.7rem] font-semibold",
        good == null ? "text-paper/55" : good ? "text-positive" : "text-danger",
      )}
    >
      <Icon className="h-3 w-3" />
      {same ? "Same" : `${up ? "+" : "−"}${formatReading(m.unit, m.decimals, Math.abs(m.change))}`}
      <span className="font-normal text-paper/50">
        {m.id === "weight" ? "since the first reading" : `vs ${m.previous != null ? formatReading(m.unit, m.decimals, m.previous) : "—"} before`}
      </span>
    </p>
  );
}

function MetricCard({ m, showBasis }: { m: ReportMetric; showBasis: boolean }) {
  const coverage =
    m.id === "studyDays"
      ? `of ${m.days} days`
      : m.id === "exerciseDays"
        ? `of ${m.recorded} day${m.recorded === 1 ? "" : "s"} with activity recorded`
        : `recorded on ${m.recorded} of ${m.days} days`;
  return (
    <Card className="p-4" data-testid={`report-metric-${m.id}`}>
      <p className="truncate text-[0.72rem] font-semibold text-paper/50">{m.label}</p>
      {m.value == null ? (
        <p className="mt-1.5 text-lg font-semibold text-paper/45">Not recorded</p>
      ) : (
        <p className="tabular mt-1.5 font-display text-[1.35rem] font-bold leading-tight tracking-tightest text-paper">
          {m.id === "bedtimeSpread" ? `±${m.value} min` : formatReading(m.unit, m.decimals, m.value)}
        </p>
      )}
      <p className="mt-0.5 text-[0.68rem] text-paper/50">{coverage}</p>
      <div className="mt-2">
        <ChangeLine m={m} />
      </div>
      {showBasis && <p className="mt-2 border-t border-line pt-2 text-[0.68rem] leading-relaxed text-paper/55">{m.basis}</p>}
    </Card>
  );
}

type Series = "study" | "sleep" | "active" | "screen" | "mood";

/** A bucket's value for the chosen series; null when nothing behind it was recorded. */
function seriesValue(s: Series, b: ReportBucket): number | null {
  switch (s) {
    case "study":
      return b.journalDays ? b.studyHours : null;
    case "sleep":
      return b.sleep;
    case "active":
      return b.activityDays ? b.activeDays : null;
    case "screen":
      return b.screen;
    case "mood":
      return b.mood;
  }
}

const SERIES_META: Record<Series, { label: string; format: (v: number) => string; title: (g: string) => string; field?: LifeField[] }> = {
  study: { label: "Study", format: (v) => `${round(v, 1)} h`, title: (g) => (g === "day" ? "Hours studied each day" : `Hours studied each ${g}`) },
  sleep: { label: "Sleep", format: (v) => `${round(v, 1)} h`, title: (g) => (g === "day" ? "Hours slept each night" : `Average sleep each ${g}`), field: ["sleep"] },
  active: {
    label: "Active days",
    format: (v) => `${v}`,
    title: (g) => (g === "day" ? "Days with exercise (1) or without (0)" : `Active days each ${g}`),
    field: ["exercise", "walk", "run"],
  },
  screen: { label: "Screen", format: (v) => `${Math.round(v)} min`, title: (g) => (g === "day" ? "Screen time each day" : `Average screen time each ${g}`), field: ["screen"] },
  mood: { label: "Mood", format: (v) => `${round(v, 1)}/5`, title: (g) => (g === "day" ? "Mood each day" : `Average mood each ${g}`) },
};

/** A cell value: the reading, or a dash that says it wasn't recorded (never a made-up 0). */
function Cell({ v, unit, className }: { v: number | null | undefined; unit?: string; className?: string }) {
  if (v == null) {
    return (
      <td className={cn("px-2.5 py-2 text-right text-paper/30", className)} title="Not recorded">
        —
      </td>
    );
  }
  return (
    <td className={cn("tabular whitespace-nowrap px-2.5 py-2 text-right text-paper/85", className)}>
      {v}
      {unit && <span className="text-paper/45">{unit}</span>}
    </td>
  );
}

const PAGE = 14;

function DailyTable({
  rows,
  tracked,
  onEdit,
}: {
  rows: DailyRow[];
  tracked: Set<LifeField>;
  onEdit: (date: ISODate) => void;
}) {
  const [onlyLogged, setOnlyLogged] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const logged = rows.filter((r) => r.hasJournal || r.hasLife || r.note || r.files);
  const list = onlyLogged ? logged : rows;
  const shown = list.slice(0, limit);
  const has = (f: LifeField) => tracked.has(f);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.75rem] text-paper/55">
          {onlyLogged
            ? `${logged.length} of ${rows.length} days have something logged.`
            : `Every day in the period, ${rows.length} in all. A dash means not recorded.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setOnlyLogged((v) => !v);
            setLimit(PAGE);
          }}
          className="text-[0.75rem] font-semibold text-accent hover:underline"
        >
          {onlyLogged ? "Show every day" : "Only days with something logged"}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-paper/50">
          Nothing logged in this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-[0.78rem]">
            <thead className="bg-paper/[0.03] text-[0.64rem] text-paper/50">
              <tr>
                <th className="px-2.5 py-2 text-left font-semibold">Day</th>
                <th className="px-2.5 py-2 text-right font-semibold">Study</th>
                <th className="px-2.5 py-2 text-right font-semibold">Mood</th>
                {has("sleep") && <th className="px-2.5 py-2 text-right font-semibold">Sleep</th>}
                {has("sleep") && <th className="px-2.5 py-2 text-right font-semibold">Quality</th>}
                {has("exercise") && <th className="px-2.5 py-2 text-right font-semibold">Exercise</th>}
                {has("walk") && <th className="px-2.5 py-2 text-right font-semibold">Walk</th>}
                {has("run") && <th className="px-2.5 py-2 text-right font-semibold">Run</th>}
                {has("water") && <th className="px-2.5 py-2 text-right font-semibold">Water</th>}
                {has("meditation") && <th className="px-2.5 py-2 text-right font-semibold">Meditation</th>}
                {has("screen") && <th className="px-2.5 py-2 text-right font-semibold">Screen</th>}
                {has("weight") && <th className="px-2.5 py-2 text-right font-semibold">Weight</th>}
                {has("deepWork") && <th className="px-2.5 py-2 text-right font-semibold">Deep work</th>}
                <th className="px-2.5 py-2 text-left font-semibold">Note</th>
                <th className="px-2.5 py-2">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.date} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-2.5 py-2 text-paper/80">
                    {r.hasJournal ? (
                      <Link href={`/journal/${r.date}`} className="hover:text-accent hover:underline" title="Open the journal entry">
                        {weekday(r.date)} {formatDate(r.date)}
                      </Link>
                    ) : (
                      <span>
                        {weekday(r.date)} {formatDate(r.date)}
                      </span>
                    )}
                  </td>
                  <Cell v={r.study} unit="h" />
                  <Cell v={r.mood} unit="/5" />
                  {has("sleep") && <Cell v={r.sleep} unit="h" />}
                  {has("sleep") && <Cell v={r.quality} unit="/5" />}
                  {has("exercise") && (
                    <td className="whitespace-nowrap px-2.5 py-2 text-right">
                      {r.exercise == null ? (
                        <span className="text-paper/30" title="Not recorded">
                          —
                        </span>
                      ) : (
                        <span className="tabular text-paper/85">
                          {r.exercise}
                          <span className="text-paper/45">m</span>
                          {r.exerciseType && <span className="ml-1 text-paper/50">{r.exerciseType}</span>}
                        </span>
                      )}
                    </td>
                  )}
                  {has("walk") && <Cell v={r.walk} unit="km" />}
                  {has("run") && <Cell v={r.run} unit="km" />}
                  {has("water") && <Cell v={r.water} unit="L" />}
                  {has("meditation") && <Cell v={r.meditation} unit="m" />}
                  {has("screen") && <Cell v={r.screen} unit="m" />}
                  {has("weight") && <Cell v={r.weight} unit="kg" />}
                  {has("deepWork") && <Cell v={r.deepWork} unit="h" />}
                  <td className="max-w-[16rem] px-2.5 py-2 text-paper/65">
                    <span className="line-clamp-2">{r.note ?? ""}</span>
                    {r.files > 0 && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[0.68rem] text-paper/50">
                        <Paperclip className="h-3 w-3" /> {r.files}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(r.date)}
                      aria-label={`Edit ${formatDate(r.date)}`}
                      title="Edit this day"
                      className="grid h-8 w-8 place-items-center rounded-lg text-paper/45 hover:bg-paper/[0.06] hover:text-paper"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > shown.length && (
        <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, list.length - shown.length)} more
        </Button>
      )}
    </div>
  );
}

/**
 * Reports over a chosen period: headline numbers with what they're made of and
 * how they compare with the period before, a chart, plain observations, how
 * habits move with study, and every day in a table.
 */
export function LifeReportPanel({
  journal,
  lifeLog,
  tracked,
  today,
  onEdit,
  completedGoals,
}: {
  journal: JournalEntry[];
  lifeLog: LifeEntry[];
  tracked: LifeField[];
  today: ISODate;
  onEdit: (date: ISODate) => void;
  /** Goals completed on a date inside the span, worked out by the page. */
  completedGoals: (span: DateSpan) => number;
}) {
  const [preset, setPreset] = useState<SpanPreset>("30d");
  const [custom, setCustom] = useState<DateSpan>(() => presetSpan("30d", today));
  const [series, setSeries] = useState<Series>("study");
  const [showBasis, setShowBasis] = useState(false);

  const span = useMemo(
    () => (preset === "custom" ? normalizeSpan(custom, today) : presetSpan(preset, today)),
    [preset, custom, today],
  );
  const trackedSet = useMemo(() => new Set(tracked), [tracked]);
  const report = useMemo(() => buildLifeReport({ journal, lifeLog, span, tracked }), [journal, lifeLog, span, tracked]);
  const links = useMemo(() => factorLinks(lifeLog, journal, span, tracked), [lifeLog, journal, span, tracked]);
  const seriesOptions = (Object.keys(SERIES_META) as Series[]).filter((s) => {
    const f = SERIES_META[s].field;
    return !f || f.some((x) => trackedSet.has(x));
  });
  const activeSeries = seriesOptions.includes(series) ? series : "study";
  const meta = SERIES_META[activeSeries];
  const chart = report.buckets.map((b) => ({
    label: b.label,
    value: seriesValue(activeSeries, b),
    sublabel: b.full,
  }));
  const goalsDone = completedGoals(span);

  return (
    <section className="space-y-5" aria-labelledby="life-report-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="life-report-title" className="flex items-center gap-2 text-sm font-semibold tracking-snugg text-paper">
            <CalendarRange className="h-4 w-4 text-paper/50" /> Reports
          </h2>
          <p className="mt-1 text-[0.75rem] text-paper/55">
            {describeSpan(report.span)} · compared with {describeSpan(report.previous)}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <Segmented
          value={preset}
          onChange={setPreset}
          options={SPAN_PRESETS.map((p) => ({ label: p.label, value: p.id }))}
          className="w-fit"
        />
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[0.72rem] font-semibold text-paper/60">
              From
              <Input
                type="date"
                value={custom.from}
                max={today}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="mt-1 w-44"
              />
            </label>
            <label className="text-[0.72rem] font-semibold text-paper/60">
              To
              <Input
                type="date"
                value={custom.to}
                max={today}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="mt-1 w-44"
              />
            </label>
            {(custom.to > today || custom.from > custom.to) && (
              <p className="pb-2 text-[0.72rem] text-warning">
                Adjusted to {describeSpan(span)}: a report can&rsquo;t run past today or end before it starts.
              </p>
            )}
          </div>
        )}
      </div>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-[0.78rem] text-paper/65">
        <span>
          <span className="tabular font-semibold text-paper">{report.coverage.journal}</span> of {report.days} days in the journal
        </span>
        <span>
          <span className="tabular font-semibold text-paper">{report.coverage.life}</span> of {report.days} days on the Life Dashboard
        </span>
        <span>
          <span className="tabular font-semibold text-paper">{goalsDone}</span> goal{goalsDone === 1 ? "" : "s"} completed
        </span>
        <button
          type="button"
          onClick={() => setShowBasis((v) => !v)}
          aria-pressed={showBasis}
          className="ml-auto inline-flex items-center gap-1 font-semibold text-accent hover:underline"
        >
          <Info className="h-3.5 w-3.5" /> {showBasis ? "Hide how numbers are worked out" : "How numbers are worked out"}
        </button>
      </Card>

      {GROUP_ORDER.map((g) => {
        const list = report.metrics.filter((m) => m.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="space-y-2">
            <p className="eyebrow">{g}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
              {list.map((m) => (
                <MetricCard key={m.id} m={m} showBasis={showBasis} />
              ))}
            </div>
          </div>
        );
      })}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">{meta.title(report.granularity)}</p>
          {seriesOptions.length > 1 && (
            <Segmented
              value={activeSeries}
              onChange={setSeries}
              options={seriesOptions.map((s) => ({ label: SERIES_META[s].label, value: s }))}
            />
          )}
        </div>
        <BarChart data={chart} height={170} formatValue={meta.format} />
        <p className="mt-3 text-[0.7rem] text-paper/50">
          A dashed gap means nothing was recorded{report.granularity === "day" ? " that day" : ` that ${report.granularity}`}; it is not a zero.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="eyebrow mb-3 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" /> Observations
          </p>
          {report.observations.length === 0 ? (
            <p className="text-[0.8rem] leading-relaxed text-paper/55">
              Nothing to point out yet. Observations appear once there are enough days to compare, at least {MIN_GROUP} on
              each side of a comparison.
            </p>
          ) : (
            <ul className="space-y-3">
              {report.observations.map((o) => {
                const Icon = o.tone === "positive" ? ThumbsUp : o.tone === "attention" ? TriangleAlert : Lightbulb;
                return (
                  <li key={o.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                        o.tone === "positive"
                          ? "bg-positive/15 text-positive"
                          : o.tone === "attention"
                            ? "bg-warning/15 text-warning"
                            : "bg-accent/15 text-accent",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-paper/85">{o.text}</p>
                      <p className="mt-0.5 text-[0.7rem] text-paper/50">{o.basis}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-1">Habits and study</p>
          <p className="mb-3 text-[0.72rem] leading-relaxed text-paper/55">
            How each habit moves with your study hours on the same day, using only days that have both. It shows what goes
            together, not what causes what, and needs at least {MIN_PAIRS} shared days.
          </p>
          {links.length === 0 ? (
            <p className="text-[0.8rem] text-paper/55">Not enough days with both readings in this period yet.</p>
          ) : (
            <ul className="space-y-3">
              {links.map((l) => (
                <li key={l.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-paper">{l.label}</span>
                    <span className="text-[0.7rem] text-paper/55">
                      {strengthLabel(l.r)} · {l.n} days
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-paper/[0.07]" aria-hidden>
                    <div
                      className={cn("absolute top-0 h-full rounded-full", l.r >= 0 ? "left-1/2 bg-positive" : "right-1/2 bg-danger/70")}
                      style={{ width: `${Math.min(50, Math.abs(l.r) * 50)}%` }}
                    />
                    <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-paper/25" />
                  </div>
                  <p className="mt-1 text-[0.72rem] text-paper/60">{l.sentence}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <p className="eyebrow mb-3">Day by day</p>
        <DailyTable rows={report.daily} tracked={trackedSet} onEdit={onEdit} />
      </Card>
    </section>
  );
}
