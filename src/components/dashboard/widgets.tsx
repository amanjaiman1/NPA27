"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarCheck,
  Check,
  ClipboardList,
  Clock,
  Flame,
  LineChart as LineChartIcon,
  Milestone as MilestoneIcon,
  NotebookPen,
  PieChart,
  Plus,
  Repeat,
  Smile,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import {
  avgMood,
  buildHeatmap,
  currentStreak,
  hoursBySubject,
  isAccomplished,
  lastNDaysHours,
  longestStreak,
  mockSeries,
  studyDays,
  todayEntry,
  totalHours,
} from "@/lib/selectors";
import { daysBetween, formatDate, formatHours, relativeDay, toISODate, weekday } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { activePlans, planName } from "@/lib/roadmap";
import { byUrgency, computeGoalProgress, type GoalData } from "@/lib/goals";
import { Card } from "@/components/ui/card";
import { Panel, PanelLink, MetricCard } from "@/components/ui/panel";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress, RadialProgress } from "@/components/ui/progress";
import { Heatmap } from "@/components/charts/heatmap";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";

const MOOD = ["", "Drained", "Low", "Steady", "Good", "In flow"];
const QUOTES = [
  "Discipline is choosing between what you want now and what you want most.",
  "The scoreboard is quiet on the days that matter most.",
  "Slow is smooth, smooth is fast.",
  "You are not behind. You are exactly one focused day ahead of yesterday.",
  "Revision is where the exam is actually won.",
  "Show up. The mood will follow the motion.",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/* ── Welcome ──────────────────────────────────────────────────── */

/**
 * The greeting: who, which day of the journey, what it's all for, how long is
 * left, and the way to log today. Calm and compact, so the numbers that follow
 * are on the first screen.
 */
export function WelcomePanel({ className }: { className?: string }) {
  const profile = useChronicle((s) => s.profile);
  const mounted = useMounted();
  const now = new Date();
  const today = toISODate(now);
  const daysLeft = daysBetween(today, profile.examDate);
  const journeyDay = Math.max(1, daysBetween(profile.startDate, today));
  const firstName = profile.name.split(" ")[0] || "there";
  const quote = QUOTES[journeyDay % QUOTES.length];
  const elapsed =
    journeyDay + daysLeft > 0 ? Math.max(0, Math.min(100, (journeyDay / (journeyDay + Math.max(0, daysLeft))) * 100)) : 0;

  return (
    <Card className={cn("relative isolate overflow-hidden p-6 sm:p-7", className)}>
      {/* A soft pool of the accent in the corner: light, not decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(110%_75%_at_100%_0%,rgb(var(--accent)/0.13),transparent_62%),radial-gradient(80%_70%_at_0%_100%,rgb(var(--aura-2)/0.09),transparent_62%)]"
      />
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={profile.name || "You"} size="lg" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[0.82rem] font-semibold text-paper">{profile.name || "Your chronicle"}</p>
              {mounted && (
                <p className="truncate text-[0.72rem] text-paper/60">
                  {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1" title={`${Math.round(elapsed)}% of your preparation time has passed`}>
            <RadialProgress
              value={elapsed}
              size={76}
              stroke={6}
              label={<span className="text-[1.05rem]">{Math.max(0, daysLeft)}</span>}
              sublabel="days left"
            />
          </div>
        </div>

        <h1 className="mt-5 text-[1.7rem] font-semibold leading-[1.15] tracking-[-0.035em] text-paper sm:text-[2rem]">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1.5 text-[0.88rem] text-paper/65">
          Day <span className="tabular font-semibold text-paper">{journeyDay}</span> of your preparation for{" "}
          {profile.targetExam}.
        </p>
        {profile.mission ? (
          <p className="mt-3 flex items-start gap-2 text-[0.85rem] leading-relaxed text-paper/75">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-medium text-paper">Mission:</span> {profile.mission}
            </span>
          </p>
        ) : (
          <p className="mt-3 max-w-md text-[0.85rem] italic leading-relaxed text-paper/60">“{quote}”</p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <Link
            href="/journal?new=1"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-accent transition-all duration-200 hover:-translate-y-px hover:brightness-[1.06]"
          >
            <Plus className="h-4 w-4" />
            Log today&apos;s study
          </Link>
          <Link
            href="/journal"
            className="glass-ghost inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-paper/25"
          >
            Journal
            <ArrowUpRight className="h-4 w-4 text-paper/60" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

/* ── Headline numbers ─────────────────────────────────────────── */

/** Fourteen small squares, one per day, filled where something was studied. */
function DayDots({ days }: { days: { date: string; hours: number }[] }) {
  return (
    <div className="grid grid-cols-7 gap-1" role="img" aria-label={`Studied on ${days.filter((d) => d.hours > 0).length} of the last ${days.length} days`}>
      {days.map((d) => (
        <span
          key={d.date}
          title={`${formatDate(d.date)}: ${d.hours > 0 ? formatHours(d.hours) : "nothing logged"}`}
          className={cn("h-2 w-2 rounded-full", d.hours > 0 ? "bg-[rgb(var(--bloom-1))]" : "bg-paper/15")}
        />
      ))}
    </div>
  );
}

/**
 * Streak, hours, days studied and mood, each with a small picture of the
 * last two weeks. A change against the week before is shown only when that
 * week had something to compare with.
 */
export function MetricGrid({ className }: { className?: string }) {
  const journal = useChronicle((s) => s.journal);
  const m = useMemo(() => {
    const days14 = lastNDaysHours(journal, 14);
    const last7 = round1(days14.slice(7).reduce((a, d) => a + d.hours, 0));
    const prev7 = round1(days14.slice(0, 7).reduce((a, d) => a + d.hours, 0));
    const active30 = lastNDaysHours(journal, 30).filter((d) => d.hours > 0).length;
    const since = days14[0]?.date ?? "";
    const moods = journal
      .filter((e) => e.date >= since && e.totalHours > 0 && e.mood > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.mood);
    const change = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
    return {
      days14,
      last7,
      change,
      active30,
      moods,
      streak: currentStreak(journal),
      longest: longestStreak(journal),
      total: totalHours(journal),
      days: studyDays(journal),
      mood: avgMood(journal, 14),
    };
  }, [journal]);

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 xl:gap-5", className)}>
      <MetricCard
        label="Study streak"
        icon={Flame}
        value={m.streak}
        unit={m.streak === 1 ? "day" : "days"}
        hint={`Best ${m.longest} ${m.longest === 1 ? "day" : "days"}`}
        chart={<DayDots days={m.days14} />}
      />
      <MetricCard
        label="Total hours"
        icon={Clock}
        value={m.total}
        unit="h"
        hint={`${formatHours(m.last7)} in the last 7 days`}
        chart={
          m.days14.some((d) => d.hours > 0) ? (
            <Sparkline values={m.days14.map((d) => d.hours)} width={96} height={34} label="Hours per day, last 14 days" />
          ) : undefined
        }
        delta={
          m.change !== null
            ? { text: `${m.change > 0 ? "+" : ""}${m.change}%`, tone: m.change > 0 ? "up" : m.change < 0 ? "down" : "neutral", label: "against the 7 days before" }
            : undefined
        }
        href="/heatmap"
      />
      <MetricCard
        label="Days studied"
        icon={CalendarCheck}
        value={m.days}
        hint={`${m.active30} of the last 30 days`}
        chart={
          <RadialProgress value={(m.active30 / 30) * 100} size={40} stroke={4} label={<span className="text-[0.6rem]">{m.active30}</span>} />
        }
      />
      <MetricCard
        label="Average mood"
        icon={Smile}
        value={m.mood ? m.mood : "—"}
        unit={m.mood ? "/ 5" : undefined}
        hint={m.mood ? `${MOOD[Math.round(m.mood)]}, last 14 days` : "Nothing logged in 14 days"}
        chart={m.moods.length >= 2 ? <Sparkline values={m.moods} width={96} height={34} label="Mood, last 14 days" /> : undefined}
      />
    </div>
  );
}

/* ── Study activity ───────────────────────────────────────────── */

export function ActivityPanel({ className }: { className?: string }) {
  const journal = useChronicle((s) => s.journal);
  const cells = useMemo(() => buildHeatmap(journal, 364), [journal]);
  const yearHours = Math.round(cells.reduce((a, c) => a + c.hours, 0));
  const activeDays = cells.filter((c) => c.hours > 0).length;
  const longest = longestStreak(journal);
  const perActive = activeDays ? round1(yearHours / activeDays) : 0;

  return (
    <Panel
      className={className}
      eyebrow="Study activity"
      title="A year of preparation, day by day"
      action={<PanelLink href="/heatmap">Full view</PanelLink>}
    >
      <Heatmap cells={cells} />
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: "Hours this year", v: `${yearHours}h` },
          { k: "Active days", v: activeDays },
          { k: "Per active day", v: perActive ? formatHours(perActive) : "—" },
          { k: "Longest streak", v: `${longest} ${longest === 1 ? "day" : "days"}` },
        ].map((s) => (
          <div key={s.k} className="inset-panel px-3.5 py-3">
            <dt className="text-[0.7rem] text-paper/60">{s.k}</dt>
            <dd className="tabular mt-1 text-[1.05rem] font-semibold tracking-[-0.02em] text-paper">{s.v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ── Today ────────────────────────────────────────────────────── */

export function TodayPanel({ className }: { className?: string }) {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const accomplished = useChronicle((s) => s.accomplished);
  const target = useChronicle((s) => s.profile.dailyHourTarget);
  const plans = useChronicle((s) => s.plans);
  const mounted = useMounted();
  const today = toISODate(new Date());
  const entry = todayEntry(journal);
  const done = mounted && isAccomplished(accomplished, today);
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
  const hours = entry?.totalHours ?? 0;
  const pct = target > 0 ? Math.min(100, (hours / target) * 100) : 0;
  // Planned for today in the Roadmap, still open: real items, linked to their plan.
  const planned = useMemo(
    () =>
      activePlans(plans)
        .flatMap((p) =>
          (p.items ?? [])
            .filter((i) => i.kind === "activity" && i.targetDate === today && (i.status === "notStarted" || i.status === "inProgress"))
            .map((i) => ({ plan: p, item: i })),
        )
        .slice(0, 3),
    [plans, today],
  );

  return (
    <Panel
      className={className}
      eyebrow="Today"
      title={entry ? `${formatHours(hours)} logged` : "Nothing logged yet"}
      description={target ? `Daily target ${formatHours(target)}` : undefined}
      action={
        done ? (
          <Badge tone="positive">
            <Check className="h-3 w-3" /> Accomplished
          </Badge>
        ) : undefined
      }
    >
      <div className="flex h-full flex-col">
        <Progress value={pct} className="h-2" barClassName={pct >= 100 ? "bg-positive" : undefined} />
        <p className="tabular mt-1.5 text-[0.72rem] text-paper/60">
          {target ? `${Math.round(pct)}% of today's target` : "Set a daily target in Settings"}
        </p>

        {entry && entry.blocks.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {entry.blocks.slice(0, 4).map((b, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[0.82rem] text-paper/80">{name(b.subjectId)}</span>
                <Progress value={entry.totalHours ? (b.hours / entry.totalHours) * 100 : 0} className="w-16" />
                <span className="tabular w-12 text-right text-[0.75rem] text-paper/65">{formatHours(b.hours)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[0.82rem] leading-relaxed text-paper/65">
            One entry keeps the streak alive. It takes a minute: subjects, hours and how the day went.
          </p>
        )}

        {entry && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {entry.mood > 0 && <Badge>Mood: {MOOD[entry.mood]}</Badge>}
            {entry.focus > 0 && <Badge>Focus {entry.focus}/5</Badge>}
          </div>
        )}

        {planned.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="eyebrow mb-2">Planned for today</p>
            <ul className="space-y-1.5">
              {planned.map(({ plan, item }) => (
                <li key={item.id}>
                  <Link
                    href={`/roadmap?plan=${encodeURIComponent(plan.id)}&item=${encodeURIComponent(item.id)}`}
                    className="flex items-center gap-2 rounded-lg px-1 py-1 text-[0.8rem] text-paper/80 transition-colors hover:bg-[var(--nav-hover)] hover:text-paper"
                  >
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="max-w-[6rem] shrink-0 truncate text-[0.68rem] text-paper/55">{planName(plan)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto pt-5">
          <Link
            href="/journal?new=1"
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200",
              entry
                ? "glass-ghost border border-line text-paper hover:border-paper/25"
                : "bg-accent text-accent-fg shadow-accent hover:-translate-y-px hover:brightness-[1.06]",
            )}
          >
            <NotebookPen className="h-4 w-4" />
            {entry ? "Update today's entry" : "Log today's study"}
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/* ── Study performance ────────────────────────────────────────── */

export function TrendPanel({ className }: { className?: string }) {
  const journal = useChronicle((s) => s.journal);
  const target = useChronicle((s) => s.profile.dailyHourTarget);
  const days = lastNDaysHours(journal, 14);
  const total = round1(days.reduce((a, d) => a + d.hours, 0));
  const data = days.map((d) => ({
    label: weekday(d.date).slice(0, 1),
    value: round1(d.hours),
    sublabel: formatDate(d.date),
  }));

  return (
    <Panel
      className={className}
      eyebrow="Last 14 days"
      title="Study hours per day"
      icon={LineChartIcon}
      action={target ? <span className="rounded-full bg-paper/[0.05] px-2.5 py-1 text-[0.7rem] font-medium text-paper/65">Goal {target}h</span> : undefined}
    >
      <p className="tabular -mt-1 mb-4 text-[0.78rem] text-paper/65">
        <span className="font-semibold text-paper">{formatHours(total)}</span> in total,{" "}
        <span className="font-semibold text-paper">{formatHours(round1(total / 14))}</span> a day on average
      </p>
      <BarChart data={data} target={target || undefined} formatValue={(v) => `${v}h`} height={150} />
    </Panel>
  );
}

export function FocusPanel({ className }: { className?: string }) {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const data = hoursBySubject(journal, subjects, 30)
    .filter((s) => s.hours > 0)
    .slice(0, 6)
    .map((s) => ({ label: s.name, value: s.hours }));
  const total = Math.round(data.reduce((a, s) => a + s.value, 0));

  return (
    <Panel
      className={className}
      eyebrow="Last 30 days"
      title="Where the hours went"
      icon={PieChart}
      action={<PanelLink href="/subjects">Subjects</PanelLink>}
    >
      {data.length ? (
        <Donut segments={data} size={132} thickness={15} centerLabel={`${total}h`} centerSub="total" />
      ) : (
        <p className="py-6 text-center text-[0.82rem] text-paper/60">Log study hours to see the subject split.</p>
      )}
    </Panel>
  );
}

/* ── Revision ─────────────────────────────────────────────────── */

export function RevisionPanel({ className }: { className?: string }) {
  const revisions = useChronicle((s) => s.revisions);
  const subjects = useChronicle((s) => s.subjects);
  const today = toISODate(new Date());
  const dueAll = revisions.filter((r) => r.nextDue <= today);
  const overdue = dueAll.filter((r) => r.nextDue < today).length;
  const due = [...dueAll].sort((a, b) => a.nextDue.localeCompare(b.nextDue)).slice(0, 4);
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  return (
    <Panel
      className={className}
      eyebrow="Revision"
      title={dueAll.length ? `${dueAll.length} due` : "All caught up"}
      description={overdue ? `${overdue} overdue` : dueAll.length ? "Due today" : "Nothing due today"}
      icon={Repeat}
      action={<PanelLink href="/revision">Queue</PanelLink>}
    >
      {due.length === 0 ? (
        <p className="text-[0.82rem] leading-relaxed text-paper/65">
          Every topic is on schedule. New revisions appear here on the day they come back.
        </p>
      ) : (
        <ul className="space-y-2">
          {due.map((r) => (
            <li key={r.id} className="inset-panel flex items-center gap-3 px-3 py-2.5">
              <span className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-[0.62rem] font-semibold text-accent">
                R{r.repetitions}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.82rem] font-medium text-paper">{r.topic}</p>
                <p className="truncate text-[0.7rem] text-paper/60">{name(r.subjectId)}</p>
              </div>
              {r.nextDue < today && <span className="shrink-0 text-[0.66rem] font-semibold text-danger">Overdue</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Mock performance ─────────────────────────────────────────── */

export function MockPanel({ className }: { className?: string }) {
  const mocks = useChronicle((s) => s.mocks);
  const stats = useMemo(() => {
    const prelims = mockSeries(mocks, "Prelims GS");
    const series = prelims.length ? prelims : mockSeries(mocks);
    const type = prelims.length ? "Prelims GS" : null;
    const latest = series[series.length - 1];
    const prev = series[series.length - 2];
    const best = series.reduce((b, s) => Math.max(b, s.pct), 0);
    const avg = series.length ? Math.round(series.reduce((a, s) => a + s.pct, 0) / series.length) : 0;
    // The weakest section of the latest mock, by share of marks: a real
    // improvement area, from what was recorded.
    const latestMock = latest ? [...mocks].sort((a, b) => a.date.localeCompare(b.date)).filter((m) => (type ? m.type === type : true)).at(-1) : undefined;
    const weakest = latestMock?.sections
      ?.filter((s) => s.max > 0)
      .map((s) => ({ name: s.name, pct: Math.round((s.score / s.max) * 100) }))
      .sort((a, b) => a.pct - b.pct)[0];
    return { series, type, latest, prev, best, avg, weakest, areas: latestMock?.weakAreas ?? [] };
  }, [mocks]);
  const delta = stats.latest && stats.prev ? stats.latest.pct - stats.prev.pct : null;

  return (
    <Panel
      className={className}
      eyebrow="Mock performance"
      title={stats.type ? "Prelims GS" : stats.series.length ? "All mocks" : "No mocks yet"}
      icon={TrendingUp}
      action={<PanelLink href="/mocks">Analytics</PanelLink>}
    >
      {!stats.latest ? (
        <p className="text-[0.82rem] leading-relaxed text-paper/65">
          Log a mock test to see your scores over time, your best and the section that needs the most work.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="tabular text-[2rem] font-semibold leading-none tracking-[-0.04em] text-paper">{stats.latest.pct}%</p>
              <p className="mt-1.5 text-[0.75rem] text-paper/65">
                Latest · {relativeDay(stats.latest.date, toISODate(new Date()))}
                {delta !== null && delta !== 0 && (
                  <span className={cn("ml-1.5 font-semibold", delta > 0 ? "text-positive" : "text-danger")}>
                    {delta > 0 ? "+" : ""}
                    {delta} pts
                  </span>
                )}
              </p>
            </div>
            {stats.series.length >= 2 && (
              <Sparkline
                values={stats.series.slice(-10).map((s) => s.pct)}
                width={128}
                height={46}
                tone={delta !== null && delta < 0 ? "down" : "up"}
                label="Mock scores, most recent ten"
              />
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { k: "Mocks", v: stats.series.length },
              { k: "Best", v: `${stats.best}%` },
              { k: "Average", v: `${stats.avg}%` },
            ].map((s) => (
              <div key={s.k} className="inset-panel px-3 py-2.5">
                <dt className="text-[0.68rem] text-paper/60">{s.k}</dt>
                <dd className="tabular mt-0.5 text-[0.95rem] font-semibold text-paper">{s.v}</dd>
              </div>
            ))}
          </dl>
          {(stats.weakest || stats.areas.length > 0) && (
            <div>
              <p className="eyebrow mb-1.5">To work on</p>
              <div className="flex flex-wrap gap-1.5">
                {stats.weakest && (
                  <Badge tone="warning">
                    {stats.weakest.name} · {stats.weakest.pct}%
                  </Badge>
                )}
                {stats.areas.slice(0, 3).map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ── Goals ────────────────────────────────────────────────────── */

const HEALTH: Record<string, { label: string; tone: "positive" | "warning" | "danger" | "default" }> = {
  achieved: { label: "Achieved", tone: "positive" },
  onTrack: { label: "On track", tone: "positive" },
  atRisk: { label: "At risk", tone: "warning" },
  behind: { label: "Behind", tone: "danger" },
  missed: { label: "Missed", tone: "danger" },
};

export function GoalsPanel({ className }: { className?: string }) {
  const goals = useChronicle((s) => s.goals);
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const mocks = useChronicle((s) => s.mocks);
  const revisions = useChronicle((s) => s.revisions);
  const books = useChronicle((s) => s.books);
  const currentAffairs = useChronicle((s) => s.currentAffairs);
  const reflections = useChronicle((s) => s.reflections);
  const mistakes = useChronicle((s) => s.mistakes);
  const lifeLog = useChronicle((s) => s.lifeLog);

  /**
   * Progress is computed the same way the Goals page computes it, from the same
   * module, so the two pages never disagree.
   */
  const active = useMemo(() => {
    const data: GoalData = { journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog };
    return goals
      .filter((g) => g.status === "Active")
      .map((g) => computeGoalProgress(g, data))
      .filter((p) => p.target != null)
      .sort(byUrgency) // whatever is slipping earns the space
      .slice(0, 4);
  }, [goals, journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog]);
  const activeCount = goals.filter((g) => g.status === "Active").length;

  return (
    <Panel
      className={className}
      eyebrow="Goals"
      title={activeCount ? `${activeCount} in motion` : "No active goals"}
      icon={Target}
      action={<PanelLink href="/goals">All goals</PanelLink>}
    >
      {active.length === 0 ? (
        <p className="text-[0.82rem] leading-relaxed text-paper/65">
          Set a goal with a target, such as hours this week or a subject&apos;s mastery, and its progress will show
          here.
        </p>
      ) : (
        <ul className="space-y-4">
          {active.map((p) => {
            const h = HEALTH[p.health];
            return (
              <li key={p.goal.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Link href={`/goals?goal=${encodeURIComponent(p.goal.id)}`} className="min-w-0 truncate text-[0.84rem] font-medium text-paper hover:text-accent">
                    {p.goal.title}
                  </Link>
                  {h && <Badge tone={h.tone}>{h.label}</Badge>}
                </div>
                <Progress
                  value={p.pct ?? 0}
                  className="h-2"
                  barClassName={
                    p.health === "achieved" || p.health === "onTrack"
                      ? "bg-positive"
                      : p.health === "behind" || p.health === "missed"
                        ? "bg-danger"
                        : p.health === "atRisk"
                          ? "bg-warning"
                          : undefined
                  }
                />
                <p className="tabular mt-1 text-[0.7rem] text-paper/60">
                  {p.current ?? 0} of {p.target} {p.goal.unit || p.metric.unit}
                  {p.pct != null && ` · ${Math.round(p.pct)}%`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ── Milestones ───────────────────────────────────────────────── */

export function MilestonesPanel({ className }: { className?: string }) {
  const milestones = useChronicle((s) => s.milestones);
  const today = toISODate(new Date());
  const recent = milestones
    .filter((m) => m.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <Panel className={className} eyebrow="Milestones" title="Along the way" icon={MilestoneIcon} action={<PanelLink href="/timeline">Timeline</PanelLink>}>
      {recent.length === 0 ? (
        <p className="text-[0.82rem] leading-relaxed text-paper/65">Milestones you reach are recorded on your timeline.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-4">
          {recent.map((m) => (
            <li key={m.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-accent ring-4 ring-accent/15" />
              <p className="text-[0.84rem] font-medium leading-snug text-paper">{m.title}</p>
              <p className="text-[0.7rem] text-paper/60">{relativeDay(m.date, today)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ── Coach ────────────────────────────────────────────────────── */

export function CoachNudge({ className }: { className?: string }) {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const bySub = hoursBySubject(journal, subjects, 14);
  const neglected = [...bySub].reverse().find((s) => s.hours < 1);
  const top = bySub[0];

  const insight = neglected
    ? `${neglected.name} hasn't seen much time in the last two weeks. A short revision block could keep it warm.`
    : top
      ? `${top.name} is your anchor subject lately. Consider rotating in a weaker area to balance the syllabus.`
      : "Log a few days to unlock personalised coaching insights.";

  return (
    <Card className={cn("relative overflow-hidden p-5 sm:p-6", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/[0.08] blur-2xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-fg shadow-accent">
            <Sparkles className="h-[1.1rem] w-[1.1rem]" />
          </span>
          <p className="eyebrow">Coach&apos;s read</p>
        </div>
        <p className="mt-4 text-[0.9rem] leading-relaxed text-paper/80">{insight}</p>
        <div className="mt-auto pt-5">
          <Link
            href="/coach"
            className="glass-ghost inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[0.8rem] font-semibold text-paper transition-colors hover:border-paper/25"
          >
            Talk to your coach <ArrowUpRight className="h-3.5 w-3.5 text-paper/60" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
