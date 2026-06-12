"use client";

import { useMemo } from "react";
import { Moon, Activity, BedDouble, Gauge, Footprints } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { avgSleep } from "@/lib/selectors";
import {
  toISODate,
  formatDate,
  weekday,
  avg,
  sum,
  round,
} from "@/lib/utils";

export default function WellbeingPage() {
  const hydrated = useHasHydrated();
  const sleep = useChronicle((s) => s.sleep);
  const exercise = useChronicle((s) => s.exercise);

  const sleepData = useMemo(() => {
    const map = new Map(sleep.map((s) => [s.date, s.hours]));
    const out: { label: string; value: number; sublabel: string }[] = [];
    const today = new Date();
    for (let i = 20; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = toISODate(d);
      out.push({
        label: weekday(iso).slice(0, 1),
        value: round(map.get(iso) ?? 0, 1),
        sublabel: formatDate(iso),
      });
    }
    return out;
  }, [sleep]);

  const sleepQuality = useMemo(
    () => round(avg(sleep.slice(0, 14).map((s) => s.quality)), 1),
    [sleep],
  );

  const exStats = useMemo(() => {
    const cutoff = toISODate(new Date(Date.now() - 7 * 86400000));
    const week = exercise.filter((e) => e.date >= cutoff);
    const minutes = sum(week.map((e) => e.minutes));
    const byType = new Map<string, number>();
    exercise.forEach((e) =>
      byType.set(e.type, (byType.get(e.type) ?? 0) + e.minutes),
    );
    const segments = [...byType.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    return {
      weekMinutes: minutes,
      weekSessions: week.length,
      segments,
      recent: [...exercise]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    };
  }, [exercise]);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Wellbeing"
        title="The body carries the mind."
        description="No amount of study compensates for a broken body clock. Sleep and movement aren't distractions from prep — they're the foundation of it."
      />

      {/* Sleep */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-paper/45" />
          <h2 className="text-sm font-semibold tracking-snugg text-paper">Sleep</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col justify-center p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <BedDouble className="h-4 w-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">
                Avg sleep · 14d
              </span>
            </div>
            <p className="tabular mt-2 text-3xl font-semibold text-paper">
              {avgSleep(sleep, 14)}h
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm text-paper/50">
              <Gauge className="h-4 w-4 text-paper/40" />
              Quality {sleepQuality}/5
            </div>
          </Card>
          <Card className="p-6 lg:col-span-2">
            <p className="eyebrow mb-4">Last 3 weeks · hours per night</p>
            <BarChart
              data={sleepData}
              target={7}
              formatValue={(v) => `${v}h`}
              height={160}
            />
          </Card>
        </div>
      </section>

      {/* Exercise */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-paper/45" />
          <h2 className="text-sm font-semibold tracking-snugg text-paper">
            Movement
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col justify-center p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <Footprints className="h-4 w-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">
                This week
              </span>
            </div>
            <p className="tabular mt-2 text-3xl font-semibold text-paper">
              {exStats.weekMinutes}m
            </p>
            <p className="mt-1 text-sm text-paper/45">
              across {exStats.weekSessions} sessions
            </p>
          </Card>
          <Card className="p-6">
            <p className="eyebrow mb-4">By activity · total minutes</p>
            <Donut segments={exStats.segments} size={130} thickness={15} />
          </Card>
          <Card className="p-6">
            <p className="eyebrow mb-4">Recent</p>
            <ul className="space-y-2.5">
              {exStats.recent.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <Badge tone="outline">{e.type}</Badge>
                  <span className="tabular text-paper/70">{e.minutes}m</span>
                  <span className="ml-auto text-[0.7rem] text-paper/35">
                    {formatDate(e.date)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>
    </div>
  );
}
