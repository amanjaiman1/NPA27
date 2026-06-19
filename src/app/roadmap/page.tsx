"use client";

import { useMemo, useState } from "react";
import {
  Route,
  CalendarRange,
  Clock,
  BookOpen,
  Flag,
  Sparkles,
  Sun,
  Repeat,
  ListChecks,
  AlertTriangle,
  Target,
} from "lucide-react";
import { useMounted } from "@/lib/hooks";
import { useChronicle } from "@/lib/store";
import { Loading } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/misc";
import { toISODate, formatDate, daysBetween, cn } from "@/lib/utils";
import {
  phases,
  weeks,
  currentWeek,
  currentPhase,
  weekNumberFor,
  daysToPrelims,
  weeksToPrelims,
  dailyTemplate,
  weeklyRhythm,
  dailyNonNegotiables,
  sources,
  principles,
  antiPatterns,
  PRELIMS_DATE,
  MAINS_DATE,
  type PlanPhase,
  type PlanWeek,
  type PlanTask,
} from "@/lib/plan";

/* Map a task track to a badge tone so the eye can scan by type. */
function trackTone(track: string): React.ComponentProps<typeof Badge>["tone"] {
  if (track.startsWith("Optional")) return "accent";
  if (track.startsWith("GS")) return "outline";
  if (track === "Answer Writing" || track === "Consolidate") return "positive";
  if (track === "Revision") return "warning";
  return "ghost";
}

function WeekCard({
  w,
  isCurrent,
  isPast,
}: {
  w: PlanWeek;
  isCurrent: boolean;
  isPast: boolean;
}) {
  return (
    <Card
      hover
      className={cn(
        "p-5",
        isCurrent && "border-accent/40 bg-accent/[0.06]",
        isPast && !isCurrent && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[0.7rem] font-semibold uppercase tracking-wider text-paper/45">
              Week {w.week}
            </span>
            <span className="text-[0.7rem] text-paper/35">
              {formatDate(w.startDate)} – {formatDate(w.endDate)}
            </span>
            {isCurrent && <Badge tone="solid">This week</Badge>}
          </div>
          <p className="mt-2 text-sm font-semibold text-paper">{w.primary}</p>
          <p className="mt-0.5 text-xs text-paper/50">{w.focus}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-paper/10 bg-paper/[0.04] px-2.5 py-1 text-[0.7rem] text-paper/60">
          <Clock className="h-3 w-3" />
          {w.hoursTarget}h/day
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {w.tasks.map((t: PlanTask, i) => (
          <li key={i} className="flex flex-col gap-1">
            <Badge tone={trackTone(t.track)} className="w-fit">
              {t.track}
            </Badge>
            <p className="text-sm leading-snug text-paper/80">{t.label}</p>
            {t.detail && (
              <p className="text-[0.7rem] italic text-paper/40">{t.detail}</p>
            )}
          </li>
        ))}
      </ul>

      {w.optional && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-paper/70">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          {w.optional}
        </p>
      )}

      {w.milestone && (
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-positive">
          <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {w.milestone}
        </p>
      )}
    </Card>
  );
}

function PhaseRail({
  activeId,
  selectedId,
  onSelect,
}: {
  activeId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {phases.map((p, i) => {
        const isActive = p.id === activeId;
        const isSelected = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              "rounded-2xl border p-4 text-left transition-all duration-200",
              isSelected
                ? "border-accent/40 bg-accent/[0.07]"
                : "border-paper/[0.08] bg-paper/[0.03] hover:border-paper/20",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="tabular text-[0.7rem] font-semibold text-paper/40">
                {String(i + 1).padStart(2, "0")}
              </span>
              {isActive && <Badge tone="solid">Now</Badge>}
            </div>
            <p className="mt-2 text-sm font-semibold text-paper">{p.name}</p>
            <p className="mt-0.5 text-[0.7rem] text-paper/45">{p.subtitle}</p>
          </button>
        );
      })}
    </div>
  );
}

export default function RoadmapPage() {
  const mounted = useMounted();
  const profile = useChronicle((s) => s.profile);
  const today = toISODate(new Date());

  const active = useMemo(() => currentPhase(today), [today]);
  const thisWeek = useMemo(() => currentWeek(today), [today]);
  const weekNo = useMemo(() => weekNumberFor(today), [today]);

  const [selectedId, setSelectedId] = useState<string>(active.id);

  if (!mounted) return <Loading />;

  const selectedPhase: PlanPhase =
    phases.find((p) => p.id === selectedId) ?? active;
  const selectedWeeks = weeks.filter((w) => w.phaseId === selectedPhase.id);

  const totalWeeks = weeks.length;
  const dPrelims = daysToPrelims(today);
  const wPrelims = weeksToPrelims(today);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="The Roadmap · CSE 2027"
        title="From today to the academy — one week at a time."
        description="Your subject-wise micro-plan: GS2 → GS3 → GS1 → GS4, with Sociology running alongside. The hours ramp honestly from 6 toward 10. Revision, current affairs and answer writing are baked in."
      />

      {/* Countdown / context strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-paper/40">
            <CalendarRange className="h-4 w-4" />
            <span className="text-[0.7rem] font-medium uppercase tracking-wider">
              Plan week
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {weekNo > totalWeeks ? `${totalWeeks}+` : weekNo}
            <span className="text-base text-paper/40"> / {totalWeeks}</span>
          </p>
          <p className="mt-1 text-xs text-paper/40">detailed foundation weeks</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-paper/40">
            <Target className="h-4 w-4" />
            <span className="text-[0.7rem] font-medium uppercase tracking-wider">
              To Prelims
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">{dPrelims}d</p>
          <p className="mt-1 text-xs text-paper/40">
            ~{wPrelims} weeks · est. {formatDate(PRELIMS_DATE)}
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-paper/40">
            <Clock className="h-4 w-4" />
            <span className="text-[0.7rem] font-medium uppercase tracking-wider">
              To Mains
            </span>
          </div>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {Math.max(0, daysBetween(today, MAINS_DATE))}d
          </p>
          <p className="mt-1 text-xs text-paper/40">est. {formatDate(MAINS_DATE)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-paper/40">
            <Sparkles className="h-4 w-4" />
            <span className="text-[0.7rem] font-medium uppercase tracking-wider">
              Mission
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-snug text-paper">
            {profile.mission ?? "IPS — CSE 2027"}
          </p>
        </Card>
      </div>

      {/* This week's focus */}
      {thisWeek ? (
        <Card className="relative overflow-hidden p-6">
          <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-accent/[0.08] blur-2xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="solid">This week · Week {thisWeek.week}</Badge>
              <span className="text-xs text-paper/45">
                {formatDate(thisWeek.startDate)} – {formatDate(thisWeek.endDate)}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-paper/60">
                <Clock className="h-3.5 w-3.5" /> {thisWeek.hoursTarget}h/day
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-light text-paper">
              {thisWeek.primary}
            </h2>
            <p className="mt-1 text-sm text-paper/55">{thisWeek.focus}</p>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {thisWeek.tasks.map((t, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-1 rounded-xl border border-paper/[0.08] bg-paper/[0.03] p-3"
                >
                  <Badge tone={trackTone(t.track)} className="w-fit">
                    {t.track}
                  </Badge>
                  <p className="text-sm text-paper/80">{t.label}</p>
                  {t.detail && (
                    <p className="text-[0.7rem] italic text-paper/40">{t.detail}</p>
                  )}
                </li>
              ))}
            </ul>
            {thisWeek.optional && (
              <p className="mt-4 flex items-start gap-2 text-xs text-paper/70">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                {thisWeek.optional}
              </p>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg shadow-soft">
              <Route className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-paper">
                You are past the detailed foundation window.
              </h2>
              <p className="mt-1 text-sm text-paper/55">
                You are now in <strong className="text-paper/80">{active.name}</strong>{" "}
                — {active.mission} See the phase objectives below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Phase rail */}
      <div>
        <SectionHeader
          eyebrow="The five phases"
          title="The macro journey"
          description="Tap a phase to see its weeks and objectives."
        />
        <div className="mt-4">
          <PhaseRail
            activeId={active.id}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      {/* Selected phase detail */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-paper">{selectedPhase.name}</h3>
          {selectedPhase.id === active.id && <Badge tone="solid">Now</Badge>}
          <span className="text-xs text-paper/40">
            {formatDate(selectedPhase.startDate)} – {formatDate(selectedPhase.endDate)}
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-paper/60">
          {selectedPhase.mission}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {selectedPhase.blocks.map((b, i) => (
            <div
              key={i}
              className="rounded-xl border border-paper/[0.08] bg-paper/[0.03] p-4"
            >
              <p className="text-sm font-semibold text-paper">{b.label}</p>
              <ul className="mt-2 space-y-1.5">
                {b.points.map((pt, j) => (
                  <li key={j} className="flex gap-2 text-xs text-paper/60">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-paper/40" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Weekly micro-plan for the selected phase (if it has detailed weeks) */}
      {selectedWeeks.length > 0 ? (
        <div>
          <SectionHeader
            eyebrow="Week by week"
            title={`${selectedPhase.name} — the micro-plan`}
            description={`${selectedWeeks.length} weeks, broken into subject-wise tasks.`}
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {selectedWeeks.map((w) => (
              <WeekCard
                key={w.week}
                w={w}
                isCurrent={thisWeek?.week === w.week}
                isPast={w.week < weekNo}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-6 text-sm text-paper/55">
          This phase is planned at the objective level above. Week-by-week detail
          kicks in once you reach it — the foundation and completion phases
          (Jun–Dec 2026) carry the granular weekly plan.
        </Card>
      )}

      {/* Daily template + weekly rhythm */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sun className="h-4 w-4 text-paper/45" />
            <h3 className="text-base font-semibold text-paper">The default day</h3>
          </div>
          <ul className="space-y-2.5">
            {dailyTemplate.map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="tabular w-28 shrink-0 text-xs text-paper/45">
                  {s.time}
                </span>
                <span className="text-sm text-paper/75">{s.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-paper/[0.06] pt-4">
            <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-paper/40">
              Daily non-negotiables
            </p>
            <ul className="space-y-1.5">
              {dailyNonNegotiables.map((n, i) => (
                <li key={i} className="flex gap-2 text-xs text-paper/65">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Repeat className="h-4 w-4 text-paper/45" />
            <h3 className="text-base font-semibold text-paper">Weekly rhythm</h3>
          </div>
          <ul className="space-y-2.5">
            {weeklyRhythm.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-paper/75">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-paper/40" />
                {r}
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-paper/[0.06] pt-4">
            <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-paper/40">
              Principles toppers actually follow
            </p>
            <ul className="space-y-1.5">
              {principles.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-paper/65">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-paper/40" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Sources + anti-patterns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-paper/45" />
            <h3 className="text-base font-semibold text-paper">
              The source list (resist adding more)
            </h3>
          </div>
          <ul className="divide-y divide-paper/[0.06]">
            {sources.map((s, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <Badge tone="outline" className="w-14 justify-center">
                  {s.paper}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm text-paper/80">
                    <span className="text-paper/55">{s.subject}:</span> {s.source}
                  </p>
                  {s.note && <p className="text-[0.7rem] text-paper/40">{s.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="text-base font-semibold text-paper">
              Mistakes you must not repeat
            </h3>
          </div>
          <ul className="space-y-3">
            {antiPatterns.map((a, i) => (
              <li
                key={i}
                className="flex gap-2 rounded-xl border border-paper/[0.08] bg-paper/[0.03] p-3 text-sm text-paper/75"
              >
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-paper/40" />
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl border border-accent/20 bg-accent/[0.06] p-3 text-xs leading-relaxed text-paper/70">
            The academy needs you steady for 14 months — not on fire for 14 days.
            Treat sleep, food and a clear head as part of the syllabus.
          </p>
        </Card>
      </div>
    </div>
  );
}
