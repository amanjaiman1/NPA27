"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Trophy,
  Flame,
  CalendarDays,
  Target,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { Loading } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Segmented, EmptyState } from "@/components/ui/misc";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { Heatmap } from "@/components/charts/heatmap";
import type { HeatCell } from "@/lib/selectors";
import {
  METRICS,
  METRIC_IDS,
  formatMetric,
  formatMinutesAsClock,
  isMetricId,
} from "@/lib/metrics";
import {
  RANGES,
  buildMetricSeries,
  movingAverage,
  type RangeId,
} from "@/lib/metric-series";
import { formatDate, fromISODate, relativeDay, round, toISODate, cn } from "@/lib/utils";

/* ── small pieces ─────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  foot,
  tone = "default",
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  foot?: React.ReactNode;
  tone?: "default" | "positive" | "danger";
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-paper/55">
        <Icon className="h-3.5 w-3.5 text-accent" />
        <span className="text-[0.62rem] font-semibold uppercase leading-tight tracking-[0.08em]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "tabular mt-2 font-display text-[1.6rem] font-bold tracking-tightest",
          tone === "positive" && "text-positive",
          tone === "danger" && "text-danger",
          tone === "default" && "text-paper",
        )}
      >
        {value}
      </p>
      {foot && <p className="mt-0.5 text-[0.7rem] text-paper/50">{foot}</p>}
    </Card>
  );
}

/** Average of clock times, handling the wrap past midnight. */
function averageClock(times: string[]): string | null {
  const mins = times
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      // Measure from noon so an 00:30 bedtime sits next to 23:30, not 23 hours away.
      const raw = h * 60 + m;
      return raw < 12 * 60 ? raw + 24 * 60 : raw;
    })
    .filter((v): v is number => v != null);
  if (!mins.length) return null;
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) % (24 * 60);
  return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
}

/* ── the page ─────────────────────────────────────────────────── */

export default function MetricPage() {
  const params = useParams<{ metric: string }>();
  const hydrated = useHasHydrated();
  const lifeLog = useChronicle((s) => s.lifeLog);
  const [range, setRange] = useState<RangeId>("month");

  const id = params?.metric;
  if (!isMetricId(id)) notFound();
  const metric = METRICS[id];

  const series = useMemo(
    () => buildMetricSeries(lifeLog, metric, range),
    [lifeLog, metric, range],
  );

  /** A year of days for the calendar, with shades from the metric's own spread. */
  const { heatCells, recordedDates } = useMemo(() => {
    const all = lifeLog
      .map((e) => ({ date: e.date, value: metric.read(e) }))
      .filter((r): r is { date: string; value: number } => r.value != null);
    const byDate = new Map(all.map((r) => [r.date, r.value]));

    /**
     * Shade boundaries are drawn from the days that carry a reading *above zero*,
     * not from every reading. Quantiles over the whole set let a metric with many
     * rest days collapse the scale: three quarters of running days are 0 km, which
     * put the 20th, 40th and 60th percentiles all on 0. Every real run then
     * cleared all three at once and landed in the top two shades — the two
     * lightest were never painted, so a 4 km jog looked the same as a 12 km one.
     *
     * Three quartile cuts over the non-zero readings give the four shades one
     * band each.
     */
    const scale = all
      .map((r) => r.value)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const quantile = (q: number) =>
      scale.length ? scale[Math.min(scale.length - 1, Math.floor(scale.length * q))] : 0;
    const cuts = [quantile(0.25), quantile(0.5), quantile(0.75)];

    const cells: HeatCell[] = [];
    const today = new Date();
    for (let i = 363; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = toISODate(d);
      const v = byDate.get(date);
      /**
       * Darker always means *more of the metric*, which is what the Less→More
       * legend claims, so `lowerBetter` deliberately plays no part here — a
       * heavy screen-time day is a dark square and the legend says so. (This
       * used to read `metric.lowerBetter ? rank : rank`, both branches
       * identical, which looked like an inversion that was never finished.)
       *
       * Level 0 is reserved for "nothing recorded at all", so it is keyed off
       * the reading being absent rather than off its value.
       */
      const level = (
        v == null || v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length
      ) as HeatCell["level"];
      cells.push({ date, hours: v ?? 0, level });
    }
    return { heatCells: cells, recordedDates: new Set(byDate.keys()) };
  }, [lifeLog, metric]);

  if (!hydrated) return <Loading />;

  const headline =
    metric.rollUp === "sum"
      ? formatMetric(metric, series.total)
      : formatMetric(metric, series.mean);
  const headlineLabel =
    metric.rollUp === "sum" ? `Total this ${rangeWord(range)}` : `Average this ${rangeWord(range)}`;

  const changeGood =
    series.change == null
      ? null
      : metric.lowerBetter
        ? series.change < 0
        : series.change > 0;

  const chartData = series.buckets.map((b) => ({
    label: b.label,
    value: b.value ?? 0,
    sublabel: b.full,
    meta: `${b.full} · ${b.recorded ? formatMetric(metric, b.value) : "no reading"}`,
  }));

  const smoothed = movingAverage(series.readings, 7);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/wellbeing"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-paper/70 transition-colors hover:text-paper"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Life dashboard
        </Link>
        <PageHeader
          eyebrow={`${metric.label} · ${series.recordedDays} of ${series.windowDays} days recorded`}
          title={metric.title}
          description={metric.description}
          actions={
            <Segmented
              value={range}
              onChange={(v) => setRange(v as RangeId)}
              options={RANGES.map((r) => ({ label: r.label, value: r.id }))}
            />
          }
        />
      </div>

      {series.recordedDays === 0 ? (
        <EmptyState
          icon={<metric.icon className="h-5 w-5" />}
          title={`No ${metric.label.toLowerCase()} recorded in this window`}
          description="Log a day in the life dashboard and it will show up here."
        />
      ) : (
        <>
          {/* ── the four numbers ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={metric.icon}
              label={headlineLabel}
              value={
                metric.id === "screen" && metric.rollUp === "mean"
                  ? formatMinutesAsClock(series.mean ?? 0)
                  : headline
              }
              foot={
                metric.rollUp === "sum"
                  ? `${formatMetric(metric, series.mean)} per recorded day`
                  : `${formatMetric(metric, series.total)} in total`
              }
            />
            <StatCard
              icon={
                series.change == null
                  ? Minus
                  : series.change > 0
                    ? ArrowUpRight
                    : ArrowDownRight
              }
              label={`vs previous ${rangeWord(range)}`}
              value={
                series.change == null
                  ? "—"
                  : `${series.change > 0 ? "+" : ""}${round(series.change * 100, 1)}%`
              }
              tone={changeGood == null ? "default" : changeGood ? "positive" : "danger"}
              foot={
                series.previous.mean != null || series.previous.total
                  ? `was ${
                      metric.rollUp === "sum"
                        ? formatMetric(metric, series.previous.total)
                        : formatMetric(metric, series.previous.mean)
                    }`
                  : "nothing to compare with yet"
              }
            />
            <StatCard
              icon={Trophy}
              label={metric.lowerBetter ? "Lowest day" : "Best day"}
              value={formatMetric(metric, series.best?.value)}
              foot={series.best ? formatDate(series.best.date) : undefined}
            />
            {metric.target != null ? (
              <StatCard
                icon={Target}
                label={metric.lowerBetter ? "Days under the ceiling" : "Days on target"}
                value={
                  series.targetHitRate == null
                    ? "—"
                    : `${Math.round(series.targetHitRate * 100)}%`
                }
                foot={`target ${formatMetric(metric, metric.target)}${
                  metric.lowerBetter ? " or less" : " or more"
                }`}
              />
            ) : (
              <StatCard
                icon={Flame}
                label="Current streak"
                value={`${series.streak}d`}
                foot={`longest ${series.longestStreak} days`}
              />
            )}
          </div>

          {/* ── the shape of it ──────────────────────────────────── */}
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1">
                  {series.granularity === "day" ? "By day" : "By month"}
                </p>
                <h2 className="text-base font-semibold text-paper">
                  {metric.label} over the {rangeWord(range)}
                </h2>
              </div>
              {metric.target != null && (
                <Badge tone="outline">
                  target {formatMetric(metric, metric.target)}
                </Badge>
              )}
            </div>
            {metric.chart === "line" ? (
              <LineChart
                data={chartData.filter((d) => d.value > 0)}
                height={220}
                target={metric.target}
                formatValue={(v) => formatMetric(metric, v)}
              />
            ) : (
              <BarChart
                data={chartData}
                height={200}
                target={metric.target}
                formatValue={(v) => formatMetric(metric, v)}
              />
            )}
          </Card>

          {/* ── weekday shape + what it adds up to ───────────────── */}
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-5 sm:p-6">
              <p className="eyebrow mb-1">Rhythm</p>
              <h2 className="mb-5 text-base font-semibold text-paper">
                Average by weekday
              </h2>
              <BarChart
                data={series.byWeekday}
                height={170}
                formatValue={(v) => formatMetric(metric, v)}
              />
            </Card>

            <Card className="p-5 sm:p-6">
              <p className="eyebrow mb-1">Reading it</p>
              <h2 className="mb-4 text-base font-semibold text-paper">
                What the numbers say
              </h2>
              <ul className="space-y-3 text-sm">
                {insightsFor(id, series, lifeLog).map((line, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="text-paper/70">{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* ── the year ─────────────────────────────────────────── */}
          <Card className="p-5 sm:p-6">
            <div className="mb-5">
              <p className="eyebrow mb-1">Consistency</p>
              <h2 className="text-base font-semibold text-paper">
                The last twelve months
              </h2>
            </div>
            <Heatmap
              cells={heatCells}
              legendLow="Less"
              legendHigh="More"
              formatTooltip={(cell) => ({
                /* Keyed off whether the day was recorded, not off the value: a
                   logged rest day is "0.0 km", not "No reading". */
                primary: recordedDates.has(cell.date)
                  ? metric.id === "screen"
                    ? formatMinutesAsClock(cell.hours)
                    : formatMetric(metric, cell.hours)
                  : "No reading",
                secondary: formatDate(cell.date),
              })}
            />
          </Card>

          {/* ── the readings themselves ──────────────────────────── */}
          <Card className="overflow-hidden">
            <div className="flex items-end justify-between p-5 pb-3 sm:px-6">
              <div>
                <p className="eyebrow mb-1">Day by day</p>
                <h2 className="text-base font-semibold text-paper">Recent readings</h2>
              </div>
              <span className="text-xs text-paper/45">
                {Math.min(14, series.readings.length)} of {series.readings.length}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {[...series.readings]
                .reverse()
                .slice(0, 14)
                .map((r, i, arr) => {
                  const prev = arr[i + 1];
                  const delta = prev ? round(r.value - prev.value, 2) : null;
                  const good =
                    delta == null || delta === 0
                      ? null
                      : metric.lowerBetter
                        ? delta < 0
                        : delta > 0;
                  return (
                    <li
                      key={r.date}
                      className="flex items-center gap-3 px-5 py-3 sm:px-6"
                    >
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-paper/30" />
                      <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                        {formatDate(r.date)}
                        <span className="ml-2 text-[0.7rem] text-paper/40">
                          {relativeDay(r.date, toISODate(new Date()))}
                        </span>
                      </span>
                      {delta != null && delta !== 0 && (
                        <span
                          className={cn(
                            "tabular text-[0.7rem]",
                            good ? "text-positive" : "text-danger",
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(metric.decimals)}
                        </span>
                      )}
                      <span className="tabular w-16 shrink-0 text-right text-sm font-semibold text-paper">
                        {metric.id === "screen"
                          ? formatMinutesAsClock(r.value)
                          : formatMetric(metric, r.value)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </Card>

          {/* the smoothed line is only interesting for a noisy metric */}
          {metric.id === "weight" && smoothed.length > 3 && (
            <Card className="p-5 sm:p-6">
              <p className="eyebrow mb-1">Signal, not noise</p>
              <h2 className="mb-5 text-base font-semibold text-paper">
                Seven-day average
              </h2>
              <LineChart
                data={smoothed.map((r) => ({
                  label: `${fromISODate(r.date).getDate()}`,
                  value: r.value,
                  meta: formatDate(r.date),
                }))}
                height={200}
                showDots={false}
                formatValue={(v) => formatMetric(metric, v)}
              />
            </Card>
          )}
        </>
      )}

      {/* ── the other three ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-line pt-6">
        {METRIC_IDS.filter((m) => m !== id).map((m) => {
          const other = METRICS[m];
          return (
            <Link
              key={m}
              href={`/wellbeing/${m}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-paper/70 shadow-soft transition-all hover:-translate-y-px hover:text-paper"
            >
              <other.icon className="h-3.5 w-3.5 text-accent" />
              {other.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function rangeWord(range: RangeId): string {
  switch (range) {
    case "week":
      return "week";
    case "month":
      return "month";
    case "year":
      return "year";
    case "all":
      return "whole run";
  }
}

/** The metric-specific reading of the window, in plain sentences. */
function insightsFor(
  id: keyof typeof METRICS,
  series: ReturnType<typeof buildMetricSeries>,
  lifeLog: { date: string; bedtime?: string; wakeTime?: string; sleepQuality?: number }[],
): string[] {
  const metric = METRICS[id];
  const out: string[] = [];
  const from = series.buckets[0]?.start ?? "";
  const window = lifeLog.filter((e) => e.date >= from);

  if (id === "sleep") {
    const bed = averageClock(window.map((e) => e.bedtime ?? "").filter(Boolean));
    const wake = averageClock(window.map((e) => e.wakeTime ?? "").filter(Boolean));
    if (bed && wake) out.push(`You typically go to sleep around ${bed} and wake at ${wake}.`);
    if (series.targetHitRate != null)
      out.push(
        `${Math.round(series.targetHitRate * 100)}% of recorded nights hit the ${formatMetric(
          metric,
          metric.target,
        )} target${series.streak > 1 ? `, and you're on a ${series.streak}-night run` : ""}.`,
      );
    if (series.worst)
      out.push(
        `The shortest night was ${formatMetric(metric, series.worst.value)} on ${formatDate(
          series.worst.date,
        )}.`,
      );
    const quality = window
      .map((e) => e.sleepQuality)
      .filter((q): q is number => typeof q === "number" && q > 0);
    if (quality.length)
      out.push(
        `Average quality rating ${round(
          quality.reduce((a, b) => a + b, 0) / quality.length,
          1,
        )} out of 5.`,
      );
  }

  if (id === "running") {
    const days = series.readings.filter((r) => r.value > 0);
    out.push(
      `${days.length} of ${series.windowDays} days involved a run — ${
        series.windowDays - days.length
      } rest days.`,
    );
    if (days.length)
      out.push(
        `Average ${formatMetric(
          metric,
          round(days.reduce((a, b) => a + b.value, 0) / days.length, 2),
        )} per run, longest ${formatMetric(metric, series.best?.value)}.`,
      );
    if (series.streak > 0)
      out.push(`Currently ${series.streak} days in a row, longest ever ${series.longestStreak}.`);
    out.push(`That's ${formatMetric(metric, series.total)} on the board for this window.`);
  }

  if (id === "weight") {
    const first = series.readings[0];
    const last = series.readings[series.readings.length - 1];
    if (first && last && first.date !== last.date) {
      const delta = round(last.value - first.value, 1);
      out.push(
        `${delta === 0 ? "No change" : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} kg`} across this window — ${formatMetric(
          metric,
          first.value,
        )} on ${formatDate(first.date)} to ${formatMetric(metric, last.value)} on ${formatDate(last.date)}.`,
      );
    }
    if (series.best && series.worst)
      out.push(
        `Range ${formatMetric(metric, series.worst.value)} to ${formatMetric(
          metric,
          series.best.value,
        )}.`,
      );
    out.push(
      `${series.recordedDays} weigh-ins in ${series.windowDays} days — the trend is only as good as how often you step on the scale.`,
    );
  }

  if (id === "screen") {
    out.push(`Daily average ${formatMinutesAsClock(series.mean ?? 0)}.`);
    if (metric.target != null) {
      const over = series.readings.filter((r) => r.value > metric.target!).length;
      out.push(
        `${over} of ${series.recordedDays} recorded days went over the ${formatMinutesAsClock(
          metric.target,
        )} ceiling.`,
      );
    }
    out.push(
      `${formatMinutesAsClock(series.total)} in total across this window — that's ${round(
        series.total / 60,
        1,
      )} hours.`,
    );
    if (series.best)
      out.push(
        `Quietest day was ${formatMinutesAsClock(series.best.value)} on ${formatDate(
          series.best.date,
        )}.`,
      );
  }

  return out.filter(Boolean);
}
