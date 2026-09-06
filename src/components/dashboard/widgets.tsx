"use client";

import Link from "next/link";
import {
  Flame,
  Clock,
  CalendarCheck,
  Smile,
  ArrowUpRight,
  ArrowRight,
  Repeat,
  Target,
  Sparkles,
  TrendingUp,
  Route,
  Check,
  Milestone as MilestoneIcon,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import { HeroVideo } from "./hero-video";
import { AccomplishButton } from "@/components/celebrate/accomplish-button";
import {
  buildHeatmap,
  currentStreak,
  longestStreak,
  totalHours,
  studyDays,
  lastNDaysHours,
  hoursBySubject,
  avgMood,
  mockSeries,
  todayEntry,
  isAccomplished,
} from "@/lib/selectors";
import {
  toISODate,
  daysBetween,
  formatHours,
  formatDate,
  weekday,
  relativeDay,
} from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { Card } from "@/components/ui/card";
import { RadialProgress, Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  currentWeek,
  currentPhase,
  daysToPrelims,
} from "@/lib/plan";
import { Heatmap } from "@/components/charts/heatmap";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { Sparkline } from "@/components/charts/sparkline";

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

/* ── Greeting hero ───────────────────────────────────────────── */

export function CommandPanel() {
  const profile = useChronicle((s) => s.profile);
  const journal = useChronicle((s) => s.journal);
  const today = toISODate(new Date());
  const daysLeft = daysBetween(today, profile.examDate);
  const journeyDay = daysBetween(profile.startDate, today);
  const streak = currentStreak(journal);
  const longest = longestStreak(journal);
  const total = totalHours(journal);
  const days = studyDays(journal);
  const mood = avgMood(journal, 14);
  const firstName = profile.name.split(" ")[0];
  const quote = QUOTES[journeyDay % QUOTES.length];

  return (
    /* The greeting, the countdown and the four headline numbers share one tall
       panel. That is mostly for the film behind them: the clip is portrait, so
       a short wide band showed almost nothing of the frame — this gives it a
       canvas roughly twice as tall to fill.

       `on-media` flips the whole subtree to a fixed light-on-dark palette, so
       everything here stays legible over the video on any surface. */
    <Card className="on-media relative isolate overflow-hidden rounded-3xl border-white/10">
      <HeroVideo />

      {/* Scrims, darkest where the copy sits. Several cheap gradient layers
          beat one flat overlay: the text gets real contrast while the clip
          keeps its shape. No backdrop-filter anywhere over the video — that
          re-rasterises every frame and is what made phones stutter. */}
      <div className="pointer-events-none absolute inset-0 bg-[rgb(6,6,8)]/40" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgb(6,6,8)]/90 via-[rgb(6,6,8)]/55 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgb(6,6,8)]/70 via-transparent to-[rgb(6,6,8)]/35" />
      {/* a breath of brand colour so it still belongs to the palette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-transparent" />

      <div className="relative z-10 p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="eyebrow mb-3 text-white/90">
              Day {journeyDay} of the journey · {profile.targetExam}
            </p>
            <h1 className="font-display text-[2.1rem] font-bold leading-[1.05] tracking-tightest text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-[2.9rem]">
              {greeting()}, {firstName}.
            </h1>
            <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
              “{quote}”
            </p>
            {profile.mission && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[rgb(6,6,8)]/70 px-3 py-1 text-xs text-white/90">
                <Target className="h-3.5 w-3.5" />
                <span className="text-white/60">Mission</span> {profile.mission}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href="/journal?new=1"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-accent transition-all hover:-translate-y-px hover:brightness-[1.08]"
              >
                Log today
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <AccomplishButton onMedia />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[rgb(6,6,8)]/70 px-4 py-2.5 text-sm font-medium text-white/90">
                <Flame className="h-4 w-4 text-accent" />
                {streak}-day streak
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center">
            <div className="rounded-full bg-[rgb(6,6,8)]/60 p-2.5 ring-1 ring-white/10">
              <RadialProgress
                value={Math.max(0, Math.min(100, ((560 - daysLeft) / 560) * 100))}
                size={124}
                stroke={7}
                label={<span className="text-2xl">{daysLeft}</span>}
                sublabel={<span className="text-white/85">days left</span>}
              />
            </div>
          </div>
        </div>

        {/* The headline numbers, as glass tiles on the film — from `sm` up. A
            phone keeps the panel hero-sized and gets them as ordinary cards
            underneath instead (see StatStrip), because stretching the panel on a
            narrow screen pushed everything else off the first view. */}
        <div className="mt-6 hidden grid-cols-2 gap-2.5 sm:mt-8 sm:grid sm:gap-3 lg:grid-cols-4">
          <MediaStat icon={Flame} label="Current streak" value={`${streak}d`} hint={`Best: ${longest} days`} />
          <MediaStat icon={Clock} label="Total hours" value={`${total}h`} hint="Since day one" />
          <MediaStat icon={CalendarCheck} label="Days studied" value={`${days}`} hint="Logged sessions" />
          <MediaStat
            icon={Smile}
            label="Avg mood"
            value={mood ? `${mood}/5` : "—"}
            hint={mood ? MOOD[Math.round(mood)] : "No data"}
          />
        </div>
      </div>
    </Card>
  );
}

/* ── Headline numbers ────────────────────────────────────────── */

/**
 * The same four numbers as the tiles inside the panel, as ordinary cards.
 * Phone-only: above `sm` they live on the film instead.
 */
export function StatStrip() {
  const journal = useChronicle((s) => s.journal);
  const streak = currentStreak(journal);
  const longest = longestStreak(journal);
  const total = totalHours(journal);
  const days = studyDays(journal);
  const mood = avgMood(journal, 14);

  return (
    <div className="grid grid-cols-2 gap-3 sm:hidden">
      <StatCard icon={Flame} label="Current streak" value={`${streak}d`} hint={`Best: ${longest} days`} />
      <StatCard icon={Clock} label="Total hours" value={`${total}h`} hint="Since day one" />
      <StatCard icon={CalendarCheck} label="Days studied" value={`${days}`} hint="Logged sessions" />
      <StatCard
        icon={Smile}
        label="Avg mood"
        value={mood ? `${mood}/5` : "—"}
        hint={mood ? MOOD[Math.round(mood)] : "No data"}
      />
    </div>
  );
}

function StatCard({
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
    <Card hover className="h-full p-4">
      <div className="flex items-center gap-2 text-paper/45">
        <Icon className="h-3.5 w-3.5 text-accent" />
        <span className="text-[0.62rem] font-semibold uppercase leading-tight tracking-[0.07em]">
          {label}
        </span>
      </div>
      <p className="tabular mt-2 font-display text-2xl font-bold tracking-tightest text-paper">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[0.7rem] text-paper/45">{hint}</p>}
    </Card>
  );
}

/* ── Headline numbers, on the film ───────────────────────────── */

function MediaStat({
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
    <div className="rounded-2xl border border-white/15 bg-[rgb(6,6,8)]/70 p-3.5 sm:p-4">
      <div className="flex items-center gap-2 text-white/85">
        <Icon className="h-3.5 w-3.5 text-accent" />
        {/* Two tiles per row on a phone: let the label wrap rather than
            clipping "Current streak" to "Current stre…". */}
        <span className="text-[0.62rem] font-semibold uppercase leading-tight tracking-[0.07em] sm:text-[0.68rem] sm:tracking-[0.1em]">
          {label}
        </span>
      </div>
      <p className="tabular mt-2 font-display text-2xl font-bold tracking-tightest text-white sm:text-[1.75rem]">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[0.7rem] text-white/80">{hint}</p>}
    </div>
  );
}

/* ── Heatmap card ────────────────────────────────────────────── */

export function HeatmapCard() {
  const journal = useChronicle((s) => s.journal);
  const cells = buildHeatmap(journal, 364);
  const yearHours = Math.round(cells.reduce((a, c) => a + c.hours, 0));
  const activeDays = cells.filter((c) => c.hours > 0).length;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Consistency</p>
          <h3 className="text-base font-semibold text-paper">Study heatmap</h3>
        </div>
        <Link
          href="/heatmap"
          className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper"
        >
          Full view
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <Heatmap cells={cells} />
      <div className="mt-4 flex gap-6 border-t border-paper/[0.06] pt-4 text-sm">
        <div>
          <span className="tabular font-semibold text-paper">{yearHours}h</span>
          <span className="ml-1.5 text-paper/40">this year</span>
        </div>
        <div>
          <span className="tabular font-semibold text-paper">{activeDays}</span>
          <span className="ml-1.5 text-paper/40">active days</span>
        </div>
      </div>
    </Card>
  );
}

/* ── 14-day trend ────────────────────────────────────────────── */

export function TrendCard() {
  const journal = useChronicle((s) => s.journal);
  const target = useChronicle((s) => s.profile.dailyHourTarget);
  const days = lastNDaysHours(journal, 14);
  const data = days.map((d) => ({
    label: weekday(d.date).slice(0, 1),
    value: Math.round(d.hours * 10) / 10,
    sublabel: formatDate(d.date),
  }));

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Last 14 days</p>
          <h3 className="text-base font-semibold text-paper">Hours per day</h3>
        </div>
        <span className="text-xs text-paper/40">goal {target}h/day</span>
      </div>
      <BarChart data={data} target={target} formatValue={(v) => `${v}h`} height={170} />
    </Card>
  );
}

/* ── Today snapshot ──────────────────────────────────────────── */

export function TodayCard() {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const accomplished = useChronicle((s) => s.accomplished);
  const mounted = useMounted();
  const entry = todayEntry(journal);
  const accomplishedToday =
    mounted && isAccomplished(accomplished, toISODate(new Date()));

  if (!entry) {
    return (
      <Card className="flex h-full flex-col items-center justify-center p-6 text-center sm:p-8">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-paper/[0.06] text-paper/50">
          <Clock className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-paper">Today is a blank page</p>
        <p className="mt-1 text-xs text-paper/45">
          Log your first session to keep the streak alive.
        </p>
        <Link
          href="/journal?new=1"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-soft hover:opacity-90"
        >
          Start today’s entry
        </Link>
        <AccomplishButton className="mt-2.5 text-xs" />
      </Card>
    );
  }

  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Today</p>
          <h3 className="text-base font-semibold text-paper">
            {formatHours(entry.totalHours)} logged
          </h3>
        </div>
        <Link href="/journal" className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper">
          Edit
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-2">
        {entry.blocks.map((b, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-paper/70">
              {name(b.subjectId)}
            </span>
            <Progress value={(b.hours / entry.totalHours) * 100} className="w-20" />
            <span className="tabular w-12 text-right text-xs text-paper/50">
              {formatHours(b.hours)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper/[0.06] pt-4 text-xs text-paper/50">
        <span className="rounded-full bg-paper/[0.05] px-2.5 py-1">
          Mood {MOOD[entry.mood]}
        </span>
        <span className="rounded-full bg-paper/[0.05] px-2.5 py-1">
          Focus {entry.focus}/5
        </span>
        {accomplishedToday && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-semibold text-accent">
            <Check className="h-3 w-3" />
            Accomplished
          </span>
        )}
      </div>
    </Card>
  );
}

/* ── Subject focus donut ─────────────────────────────────────── */

export function FocusDonut() {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const data = hoursBySubject(journal, subjects, 30)
    .filter((s) => s.hours > 0)
    .slice(0, 6)
    .map((s) => ({ label: s.name, value: s.hours }));
  const total = Math.round(data.reduce((a, s) => a + s.value, 0));

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <p className="eyebrow mb-1">Last 30 days</p>
        <h3 className="text-base font-semibold text-paper">Where the hours went</h3>
      </div>
      <Donut
        segments={data}
        size={140}
        thickness={16}
        centerLabel={`${total}h`}
        centerSub="total"
      />
    </Card>
  );
}

/* ── Revision due ────────────────────────────────────────────── */

export function RevisionDueCard() {
  const revisions = useChronicle((s) => s.revisions);
  const subjects = useChronicle((s) => s.subjects);
  const today = toISODate(new Date());
  const due = revisions
    .filter((r) => r.nextDue <= today)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 4);
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-paper/45" />
          <h3 className="text-base font-semibold text-paper">Due for revision</h3>
        </div>
        <Link href="/revision" className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper">
          All
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {due.length === 0 ? (
        <p className="py-4 text-sm text-paper/40">All caught up. Nothing due today.</p>
      ) : (
        <ul className="space-y-2.5">
          {due.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper/[0.05] text-[0.6rem] font-semibold text-paper/60">
                R{r.repetitions}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-paper/80">{r.topic}</p>
                <p className="truncate text-[0.7rem] text-paper/40">{name(r.subjectId)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-paper/10 px-2 py-0.5 text-[0.6rem] text-paper/60">
                due
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Mock momentum ───────────────────────────────────────────── */

export function MockMomentumCard() {
  const mocks = useChronicle((s) => s.mocks);
  const series = mockSeries(mocks, "Prelims GS");
  const values = series.map((s) => s.pct);
  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = latest && prev ? latest.pct - prev.pct : 0;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-paper/45" />
          <h3 className="text-base font-semibold text-paper">Mock momentum</h3>
        </div>
        <Link href="/mocks" className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper">
          Analytics
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="tabular text-3xl font-semibold text-paper">
            {latest ? `${latest.pct}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-paper/40">
            latest Prelims GS{" "}
            {delta !== 0 && (
              <span className={delta > 0 ? "text-paper/70" : "text-paper/40"}>
                ({delta > 0 ? "+" : ""}
                {delta}%)
              </span>
            )}
          </p>
        </div>
        <Sparkline values={values} width={140} height={48} />
      </div>
    </Card>
  );
}

/* ── Goals progress ──────────────────────────────────────────── */

export function GoalsCard() {
  const goals = useChronicle((s) => s.goals);
  const active = goals
    .filter((g) => g.status === "Active" && g.target)
    .slice(0, 4);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-paper/45" />
          <h3 className="text-base font-semibold text-paper">Goals in motion</h3>
        </div>
        <Link href="/goals" className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper">
          All
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="space-y-3.5">
        {active.map((g) => {
          const pct = Math.round(((g.current ?? 0) / (g.target ?? 1)) * 100);
          return (
            <li key={g.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-paper/75">{g.title}</span>
                <span className="tabular shrink-0 text-xs text-paper/45">
                  {g.current}/{g.target} {g.unit}
                </span>
              </div>
              <Progress value={pct} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── Recent milestones mini ──────────────────────────────────── */

export function MilestonesMini() {
  const milestones = useChronicle((s) => s.milestones);
  const today = toISODate(new Date());
  const recent = milestones
    .filter((m) => m.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MilestoneIcon className="h-4 w-4 text-paper/45" />
          <h3 className="text-base font-semibold text-paper">Recent milestones</h3>
        </div>
        <Link href="/timeline" className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper">
          Timeline
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ol className="relative space-y-4 border-l border-line pl-4">
        {recent.map((m) => (
          <li key={m.id} className="relative">
            <span className="absolute -left-[1.32rem] top-1 h-2 w-2 rounded-full bg-accent" />
            <p className="text-sm font-medium text-paper">{m.title}</p>
            <p className="text-[0.7rem] text-paper/40">{relativeDay(m.date, today)}</p>
            {m.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-paper/50">{m.description}</p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ── Coach nudge ─────────────────────────────────────────────── */

export function CoachNudge() {
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
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-accent/[0.07] blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg shadow-soft">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-paper">Coach’s read</h3>
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wider text-paper/40">
              AI
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-paper/55">{insight}</p>
          <Link
            href="/coach"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-paper/70 hover:text-paper"
          >
            Talk to your coach <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}


/* ── This week's plan (Roadmap) ──────────────────────────────── */

export function ThisWeekCard() {
  const today = toISODate(new Date());
  const week = currentWeek(today);
  const phase = currentPhase(today);
  const dLeft = daysToPrelims(today);

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-accent/[0.07] blur-2xl" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-paper/45" />
            <h3 className="text-base font-semibold text-paper">This week&apos;s plan</h3>
          </div>
          <Link
            href="/roadmap"
            className="inline-flex items-center gap-1 text-xs text-paper/45 transition-colors hover:text-paper"
          >
            Roadmap
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {week ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="solid">Week {week.week}</Badge>
              <span className="text-xs text-paper/45">{phase.name}</span>
              <span className="inline-flex items-center gap-1 text-xs text-paper/55">
                <Clock className="h-3.5 w-3.5" /> {week.hoursTarget}h/day
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-paper">{week.primary}</p>
            <p className="mt-0.5 text-xs text-paper/50">{week.focus}</p>
            <ul className="mt-3 space-y-1.5">
              {week.tasks.slice(0, 3).map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-paper/70">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0">
                    <span className="text-paper/45">{t.track}:</span> {t.label}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div>
            <p className="text-sm font-medium text-paper">{phase.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-paper/55">
              {phase.mission}
            </p>
          </div>
        )}

        <p className="mt-4 border-t border-paper/[0.06] pt-3 text-[0.7rem] text-paper/40">
          {dLeft} days to estimated Prelims
        </p>
      </div>
    </Card>
  );
}
