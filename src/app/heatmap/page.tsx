"use client";

import { useMemo } from "react";
import { Flame, Award, Clock, CalendarCheck, Gauge, Star } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Heatmap } from "@/components/charts/heatmap";
import { BarChart } from "@/components/charts/bar-chart";
import {
  buildHeatmap,
  currentStreak,
  longestStreak,
  totalHours,
  studyDays,
} from "@/lib/selectors";
import { fromISODate, formatDate, formatHours, round } from "@/lib/utils";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-paper/40">
        <Icon className="h-4 w-4" />
        <span className="text-[0.7rem] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="tabular mt-2.5 text-2xl font-semibold text-paper">{value}</p>
      {hint && <p className="mt-1 text-xs text-paper/40">{hint}</p>}
    </Card>
  );
}

export default function HeatmapPage() {
  const hydrated = useHasHydrated();
  const journal = useChronicle((s) => s.journal);

  const cells = useMemo(() => buildHeatmap(journal, 364), [journal]);

  const stats = useMemo(() => {
    const active = journal.filter((e) => e.totalHours > 0);
    const total = totalHours(journal);
    const days = studyDays(journal);
    const best = active.reduce(
      (m, e) => (e.totalHours > m.totalHours ? e : m),
      active[0] ?? { totalHours: 0, date: "" },
    );

    // monthly totals (last 12 months)
    const monthMap = new Map<string, number>();
    for (const e of journal) {
      const d = fromISODate(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + e.totalHours);
    }
    const months: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months.push({
        label: MO[d.getMonth()],
        value: Math.round(monthMap.get(key) ?? 0),
      });
    }

    // weekday averages
    const wdTotals = Array(7).fill(0);
    const wdCounts = Array(7).fill(0);
    for (const e of active) {
      const wd = fromISODate(e.date).getDay();
      wdTotals[wd] += e.totalHours;
      wdCounts[wd]++;
    }
    const weekdays = WD.map((label, i) => ({
      label,
      value: wdCounts[i] ? round(wdTotals[i] / wdCounts[i], 1) : 0,
    }));

    return {
      total,
      days,
      avgPerActive: days ? round(total / days, 1) : 0,
      best,
      months,
      weekdays,
    };
  }, [journal]);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Study Heatmap"
        title="Consistency, made visible."
        description="Discipline compounds. Each square is a day; the brighter it glows, the deeper you went. The streak is the story."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={Flame}
          label="Current streak"
          value={`${currentStreak(journal)}d`}
        />
        <StatTile
          icon={Award}
          label="Longest streak"
          value={`${longestStreak(journal)}d`}
        />
        <StatTile icon={Clock} label="Total hours" value={`${stats.total}h`} />
        <StatTile icon={CalendarCheck} label="Active days" value={`${stats.days}`} />
        <StatTile
          icon={Gauge}
          label="Avg / active day"
          value={`${stats.avgPerActive}h`}
        />
        <StatTile
          icon={Star}
          label="Best day"
          value={formatHours(stats.best.totalHours)}
          hint={stats.best.date ? formatDate(stats.best.date) : undefined}
        />
      </div>

      <Card className="p-6">
        <p className="eyebrow mb-1">Past 12 months</p>
        <h3 className="mb-5 text-base font-semibold text-paper">
          The year at a glance
        </h3>
        <Heatmap cells={cells} cellSize={13} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <p className="eyebrow mb-1">Monthly volume</p>
          <h3 className="mb-5 text-base font-semibold text-paper">
            Hours per month
          </h3>
          <BarChart
            data={stats.months}
            formatValue={(v) => `${v}h`}
            height={190}
          />
        </Card>
        <Card className="p-6">
          <p className="eyebrow mb-1">Rhythm</p>
          <h3 className="mb-5 text-base font-semibold text-paper">
            Average hours by weekday
          </h3>
          <BarChart
            data={stats.weekdays}
            formatValue={(v) => `${v}h`}
            height={190}
          />
        </Card>
      </div>
    </div>
  );
}
