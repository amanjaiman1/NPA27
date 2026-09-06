import type { LucideIcon } from "lucide-react";
import { Moon, Footprints, Scale, Smartphone } from "lucide-react";
import type { LifeEntry } from "./types";
import { LIFE_TARGETS } from "./life";

/* ════════════════════════════════════════════════════════════════
   The four life metrics that get a page of their own.

   Each one says how to read a day, how a run of days should be rolled
   up, and which direction is "better" — everything the detail page and
   the aggregation helpers need, so neither has to special-case a
   metric by name.
   ════════════════════════════════════════════════════════════════ */

export type MetricId = "sleep" | "running" | "weight" | "screen";

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Headline for the detail page. */
  title: string;
  description: string;
  icon: LucideIcon;
  unit: string;
  /** Longer unit for prose ("kilometres"). */
  unitLong: string;
  /**
   * The day's value, or undefined when the day has no reading. Weight is
   * undefined on days it wasn't measured, which matters: a missing weight is
   * not a zero, and averaging zeros would be a lie.
   */
  read: (e: LifeEntry) => number | undefined;
  /**
   * How a bucket of days becomes one number. `sum` for things you accumulate
   * (kilometres), `mean` for things you are (weight, hours slept).
   */
  rollUp: "sum" | "mean";
  /** Chart shape that suits the metric. */
  chart: "bars" | "line";
  target?: number;
  /** True when a smaller number is the better one. */
  lowerBetter?: boolean;
  decimals: number;
  /** A day counts as "active" for streaks when this holds. */
  isActiveDay: (v: number) => boolean;
}

export const METRICS: Record<MetricId, MetricDef> = {
  sleep: {
    id: "sleep",
    label: "Sleep",
    title: "Every night, accounted for.",
    description:
      "How much you actually slept, night after night — against the target you set, and against how the rest of the day went.",
    icon: Moon,
    unit: "h",
    unitLong: "hours",
    read: (e) => (e.sleepHours > 0 ? e.sleepHours : undefined),
    rollUp: "mean",
    chart: "bars",
    target: LIFE_TARGETS.sleepHours,
    decimals: 1,
    isActiveDay: (v) => v >= LIFE_TARGETS.sleepHours - 0.5,
  },
  running: {
    id: "running",
    label: "Running",
    title: "Every kilometre, on the record.",
    description:
      "Distance run since day one — by day, by week, by month, by year. Rest days included, because they're part of it.",
    icon: Footprints,
    unit: "km",
    unitLong: "kilometres",
    read: (e) => e.runKm,
    rollUp: "sum",
    chart: "bars",
    decimals: 1,
    isActiveDay: (v) => v > 0,
  },
  weight: {
    id: "weight",
    label: "Weight",
    title: "The line, over time.",
    description:
      "Weight is noisy day to day and only means something across weeks, so this shows the trend rather than the wobble.",
    icon: Scale,
    unit: "kg",
    unitLong: "kilograms",
    read: (e) => e.weightKg,
    rollUp: "mean",
    chart: "line",
    decimals: 1,
    isActiveDay: (v) => v > 0,
  },
  screen: {
    id: "screen",
    label: "Screen time",
    title: "Where the hours leak.",
    description:
      "Time on a screen that wasn't study — the ceiling you set, and how often the day went over it.",
    icon: Smartphone,
    unit: "m",
    unitLong: "minutes",
    read: (e) => e.screenTimeMin,
    rollUp: "mean",
    chart: "bars",
    target: LIFE_TARGETS.screenTimeMin,
    lowerBetter: true,
    decimals: 0,
    isActiveDay: (v) => v <= LIFE_TARGETS.screenTimeMin,
  },
};

export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

export function isMetricId(v: unknown): v is MetricId {
  return typeof v === "string" && v in METRICS;
}

/** "7.4h", "52.6 km", "84 m" — a value with its unit, at the right precision. */
export function formatMetric(m: MetricDef, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = v.toFixed(m.decimals);
  return m.unit === "h" || m.unit === "m" ? `${n}${m.unit}` : `${n} ${m.unit}`;
}

/** Screen time reads better as hours once it's past an hour or two. */
export function formatMinutesAsClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
