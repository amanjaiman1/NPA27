"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Moon,
  BrainCircuit,
  Droplets,
  Wind,
  Activity,
  Footprints,
  Smartphone,
  Scale,
  ChevronRight,
  Plus,
  Pencil,
  Sparkles,
  BookOpen,
  Paperclip,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { ISODate, LifeEntry, LifeField } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkline } from "@/components/charts/sparkline";
import { LifeForm, TrackedFieldsDialog } from "@/components/life/life-form";
import { LifeReportPanel } from "@/components/life/life-report";
import { SleepCard } from "@/components/sleep/sleep-card";
import { LIFE_TARGETS, todayEntry, trackedFields, type DateSpan } from "@/lib/life";
import { computeGoalProgress, goalCategory, type GoalData } from "@/lib/goals";
import { METRIC_IDS, METRICS, formatMetric, formatMinutesAsClock, type MetricId } from "@/lib/metrics";
import { toISODate, formatDate, formatHours, round } from "@/lib/utils";

/** Which tracked field each deep-dive page belongs to. */
const DEEP_DIVE_FIELD: Record<MetricId, LifeField> = {
  sleep: "sleep",
  running: "run",
  weight: "weight",
  screen: "screen",
};

interface Tile {
  field: LifeField;
  icon: typeof Moon;
  label: string;
  value: number | undefined;
  unit: string;
  target?: number;
  lowerBetter?: boolean;
  detail?: string;
  href?: string;
}

function tilesFor(e: LifeEntry | undefined): Tile[] {
  return [
    {
      field: "exercise",
      icon: Activity,
      label: "Exercise",
      value: e?.exerciseMinutes,
      unit: "min",
      target: LIFE_TARGETS.exerciseMinutes,
      detail: e?.exerciseType,
    },
    { field: "walk", icon: Footprints, label: "Walking", value: e?.walkKm, unit: "km", target: LIFE_TARGETS.walkKm },
    { field: "run", icon: Footprints, label: "Running", value: e?.runKm, unit: "km", href: "/wellbeing/running" },
    { field: "water", icon: Droplets, label: "Water", value: e?.waterLiters, unit: "L", target: LIFE_TARGETS.waterLiters },
    { field: "meditation", icon: Wind, label: "Meditation", value: e?.meditationMin, unit: "min", target: LIFE_TARGETS.meditationMin },
    {
      field: "screen",
      icon: Smartphone,
      label: "Screen time",
      value: e?.screenTimeMin,
      unit: "min",
      target: LIFE_TARGETS.screenTimeMin,
      lowerBetter: true,
      href: "/wellbeing/screen",
    },
    { field: "weight", icon: Scale, label: "Weight", value: e?.weightKg, unit: "kg", href: "/wellbeing/weight" },
    { field: "deepWork", icon: BrainCircuit, label: "Deep work", value: e?.deepWorkHours, unit: "h", target: LIFE_TARGETS.deepWorkHours },
  ];
}

function TodayTile({ t }: { t: Tile }) {
  const has = typeof t.value === "number";
  const pct = has && t.target ? Math.min(100, ((t.value as number) / t.target) * 100) : 0;
  const hit = has && t.target != null && (t.lowerBetter ? (t.value as number) <= t.target : (t.value as number) >= t.target);
  const inner = (
    <>
      <div className="flex items-center gap-2 text-paper/50">
        <t.icon className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-wider">{t.label}</span>
        {t.href && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper/35" />}
      </div>
      {has ? (
        <p className="tabular mt-2 text-2xl font-semibold text-paper">
          {round(t.value as number, 1)}
          <span className="ml-1 text-sm font-normal text-paper/50">{t.unit}</span>
        </p>
      ) : (
        <p className="mt-2.5 text-sm font-medium text-paper/45">Not logged</p>
      )}
      {has && t.target ? (
        <>
          <Progress value={pct} className="mt-2" barClassName={hit ? "bg-positive" : "bg-accent"} />
          <p className="mt-1 truncate text-[0.62rem] text-paper/45">
            {t.detail ? `${t.detail} · ` : ""}
            {t.lowerBetter ? "limit" : "aim"} {t.target} {t.unit}
          </p>
        </>
      ) : (
        <p className="mt-2 truncate text-[0.62rem] text-paper/45">{has ? t.detail || "today" : t.target ? `aim ${t.target} ${t.unit}` : "today"}</p>
      )}
    </>
  );
  return t.href ? (
    <Link href={t.href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45">
      <Card hover className="h-full p-4">
        {inner}
      </Card>
    </Link>
  ) : (
    <Card className="h-full p-4">{inner}</Card>
  );
}

/**
 * The deep-dive pages, summarised over the whole log. They're reachable
 * whether or not today has been logged.
 */
function MetricDeepDives({ lifeLog, tracked }: { lifeLog: LifeEntry[]; tracked: Set<LifeField> }) {
  const cards = useMemo(() => {
    const byDate = [...lifeLog].sort((a, b) => a.date.localeCompare(b.date));
    return METRIC_IDS.filter((id) => tracked.has(DEEP_DIVE_FIELD[id])).map((id) => {
      const m = METRICS[id];
      const readings = byDate
        .map((e) => ({ date: e.date, value: m.read(e) }))
        .filter((r): r is { date: string; value: number } => r.value != null);
      const values = readings.map((r) => r.value);
      const total = values.reduce((a, b) => a + b, 0);
      const headline = !values.length ? null : m.rollUp === "sum" ? total : round(total / values.length, 2);
      return { m, readings, latest: readings[readings.length - 1] ?? null, headline, spark: values.slice(-30) };
    });
  }, [lifeLog, tracked]);

  if (!cards.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-paper/50" />
        <h2 className="text-sm font-semibold tracking-snugg text-paper">Go deeper</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        {cards.map(({ m, readings, latest, headline, spark }) => (
          <Link
            key={m.id}
            href={`/wellbeing/${m.id}`}
            className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
          >
            <Card hover className="flex h-full flex-col p-4">
              <div className="flex items-center gap-2 text-paper/55">
                <m.icon className="h-4 w-4 text-accent" />
                <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-wider">{m.label}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper/35 transition-transform group-hover:translate-x-0.5" />
              </div>
              {readings.length === 0 ? (
                <>
                  <p className="tabular mt-2 text-2xl font-semibold text-paper/40">—</p>
                  <p className="mt-1 text-[0.68rem] text-paper/50">No readings yet. Open to see how it works.</p>
                </>
              ) : (
                <>
                  <p className="tabular mt-2 text-2xl font-semibold text-paper">
                    {m.id === "screen" ? formatMinutesAsClock(headline ?? 0) : formatMetric(m, headline)}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-paper/50">
                    {m.rollUp === "sum" ? "all time" : "daily average"} · {readings.length} {readings.length === 1 ? "day" : "days"}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="text-[0.68rem] text-paper/50">
                      latest{" "}
                      <span className="tabular font-semibold text-paper/75">
                        {m.id === "screen" ? formatMinutesAsClock(latest!.value) : formatMetric(m, latest!.value)}
                      </span>
                    </span>
                    <Sparkline values={spark} width={64} height={22} fill={false} />
                  </div>
                </>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function LifeDashboardPage() {
  const hydrated = useHasHydrated();
  const lifeLog = useChronicle((s) => s.lifeLog);
  const journal = useChronicle((s) => s.journal);
  const profile = useChronicle((s) => s.profile);
  const goals = useChronicle((s) => s.goals);
  const subjects = useChronicle((s) => s.subjects);
  const mocks = useChronicle((s) => s.mocks);
  const revisions = useChronicle((s) => s.revisions);
  const books = useChronicle((s) => s.books);
  const currentAffairs = useChronicle((s) => s.currentAffairs);
  const reflections = useChronicle((s) => s.reflections);
  const mistakes = useChronicle((s) => s.mistakes);

  const today = toISODate(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState<ISODate>(today);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  // `/wellbeing?date=<day>` (from the journal) opens that day; `?log=1` opens today.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const date = params.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today) openForm(date);
    else if (params.get("log") === "1") openForm(today);
    if (date || params.get("log")) window.history.replaceState({}, "", "/wellbeing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const tracked = useMemo(() => trackedFields(profile.lifeFields, lifeLog), [profile.lifeFields, lifeLog]);
  const trackedSet = useMemo(() => new Set(tracked), [tracked]);
  const te = useMemo(() => todayEntry(lifeLog, today), [lifeLog, today]);
  const todayJournal = useMemo(() => journal.find((e) => e.date === today), [journal, today]);

  const goalData: GoalData = useMemo(
    () => ({ journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog }),
    [journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog],
  );
  /** Goals that live off this page's data: health goals and deep-work goals. */
  const lifeGoals = useMemo(
    () =>
      goals
        .filter((g) => g.status === "Active" && (g.metric === "deepWorkHours" || goalCategory(g) === "Health"))
        .map((g) => computeGoalProgress(g, goalData, today)),
    [goals, goalData, today],
  );

  function openForm(date: ISODate) {
    setFormDate(date);
    setFormOpen(true);
  }

  if (!hydrated) return <Loading />;

  // Sleep has its own card above; the rest are today's tiles.
  const tiles = tilesFor(te).filter((t) => trackedSet.has(t.field));
  const todayFiles = te?.fileIds?.length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Life Dashboard"
        title="The body carries the mind."
        description="Log what you track, in under a minute. An empty box means not recorded, never zero, and every report says how many days it stands on."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setFieldsOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> What you track
            </Button>
            <Button onClick={() => openForm(today)}>
              {te ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {te ? "Edit today" : "Log today"}
            </Button>
          </div>
        }
      />

      {trackedSet.has("sleep") && <SleepCard />}

      {/* Today */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-snugg text-paper">Today · {formatDate(today)}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-paper/60">
            {todayJournal ? (
              <Link href={`/journal/${today}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                <BookOpen className="h-3.5 w-3.5" />
                Journal: {todayJournal.totalHours > 0 ? `${formatHours(todayJournal.totalHours)} studied` : "no study hours yet"}
              </Link>
            ) : (
              <Link href="/journal?new=1" className="inline-flex items-center gap-1.5 hover:text-accent">
                <BookOpen className="h-3.5 w-3.5" /> No journal entry yet
              </Link>
            )}
            {todayFiles > 0 && (
              <button type="button" onClick={() => openForm(today)} className="inline-flex items-center gap-1.5 hover:text-accent">
                <Paperclip className="h-3.5 w-3.5" /> {todayFiles} file{todayFiles === 1 ? "" : "s"} linked
              </button>
            )}
          </div>
        </div>
        {te?.note && <p className="text-[0.8rem] text-paper/70">&ldquo;{te.note}&rdquo;</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <TodayTile key={t.field} t={t} />
          ))}
        </div>
        {!te && (
          <p className="text-[0.75rem] text-paper/55">
            Nothing logged for today.{" "}
            <button type="button" onClick={() => openForm(today)} className="font-semibold text-accent hover:underline">
              Log it now
            </button>
          </p>
        )}
      </section>

      {/* Goals that feed on this page */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-snugg text-paper">
            <Target className="h-4 w-4 text-paper/50" /> Health and deep-work goals
          </h2>
          <Link href="/goals" className="text-[0.75rem] font-semibold text-accent hover:underline">
            All goals
          </Link>
        </div>
        {lifeGoals.length === 0 ? (
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <p className="min-w-0 flex-1 text-[0.8rem] text-paper/60">
              Goals in the Health category, or measured by deep-work hours, show up here.
            </p>
            <Link href="/goals?new=1" className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
              Set one <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            {lifeGoals.map((p) => (
              <Link key={p.goal.id} href={`/goals?goal=${encodeURIComponent(p.goal.id)}`} className="rounded-2xl">
                <Card hover className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-paper">{p.goal.title}</p>
                    <span className="tabular shrink-0 text-xs text-paper/55">{p.pct == null ? "—" : `${p.pct}%`}</span>
                  </div>
                  <Progress value={p.pct ?? 0} className="mt-2" />
                  <p className="mt-1.5 truncate text-[0.68rem] text-paper/50">
                    {p.tracked ? `From ${p.metric.source}` : "Tracked by hand"} · {p.window.label}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <LifeReportPanel
        journal={journal}
        lifeLog={lifeLog}
        tracked={tracked}
        today={today}
        onEdit={openForm}
        completedGoals={(span: DateSpan) =>
          goals.filter((g) => g.status === "Completed" && g.completedOn && g.completedOn >= span.from && g.completedOn <= span.to).length
        }
      />

      <MetricDeepDives lifeLog={lifeLog} tracked={trackedSet} />

      <LifeForm open={formOpen} date={formDate} onClose={() => setFormOpen(false)} onChooseFields={() => setFieldsOpen(true)} />
      <TrackedFieldsDialog open={fieldsOpen} onClose={() => setFieldsOpen(false)} />
    </div>
  );
}
