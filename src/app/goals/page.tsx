"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Target,
  Check,
  Trash2,
  Pencil,
  Search,
  ArrowRight,
  ArrowUpRight,
  TriangleAlert,
  CircleGauge,
  Sparkles,
  CalendarClock,
  Zap,
  PauseCircle,
  Link2,
  ChevronRight,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Goal, GoalHorizon, GoalMetric, GoalStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, Chip, Segmented } from "@/components/ui/misc";
import { RadialProgress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import { Sparkline } from "@/components/charts/sparkline";
import {
  GOAL_METRICS,
  metricDef,
  computeGoalProgress,
  contributionSeries,
  goalPortfolio,
  byUrgency,
  healthLabel,
  paceNote,
  type GoalData,
  type GoalHealth,
  type GoalProgress,
} from "@/lib/goals";
import { formatDate, formatDayShort, toISODate, uid, round, cn } from "@/lib/utils";

const HORIZONS: GoalHorizon[] = ["Daily", "Weekly", "Monthly", "Quarterly", "Long-term"];
const STATUSES: GoalStatus[] = ["Active", "Completed", "Missed", "Paused"];

/** Badge tone per health state, so the same colour always means the same thing. */
const HEALTH_TONE: Record<GoalHealth, "positive" | "warning" | "danger" | "accent" | "outline" | "ghost"> = {
  achieved: "positive",
  onTrack: "positive",
  atRisk: "warning",
  behind: "danger",
  missed: "danger",
  paused: "ghost",
  unmeasurable: "warning",
  open: "outline",
};

function emptyGoal(): Goal {
  return {
    id: uid("g"),
    title: "",
    horizon: "Weekly",
    metric: "studyHours",
    metricLabel: "",
    target: 10,
    current: 0,
    unit: "",
    status: "Active",
    createdOn: toISODate(new Date()),
  };
}

/**
 * A progress bar with the even-pace mark on it. The bar alone says "40%"; the
 * mark is what tells you whether 40% is ahead or behind for the day you're on.
 */
function PaceBar({ p }: { p: GoalProgress }) {
  const pct = p.pct ?? 0;
  const fill =
    p.health === "achieved"
      ? "bg-positive"
      : p.health === "behind" || p.health === "missed"
        ? "bg-danger"
        : p.health === "atRisk"
          ? "bg-warning"
          : "bg-accent";
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-paper/10">
      <div
        className={cn("h-full rounded-full transition-all duration-700 ease-out", fill)}
        style={{ width: `${pct}%` }}
      />
      {p.expectedPct != null && p.expectedPct > 0 && p.expectedPct < 100 && (
        <span
          className="absolute top-0 h-full w-px bg-paper/45"
          style={{ left: `${p.expectedPct}%` }}
          title={`Even pace for today would be ${p.expectedPct}%`}
        />
      )}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning" | "positive";
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-paper/45">
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
            tone === "positive" && "text-positive",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "tabular mt-2 font-display text-[1.6rem] font-bold leading-none tracking-tightest",
          tone === "danger" ? "text-danger" : "text-paper",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-[0.7rem] text-paper/45">{hint}</p>}
    </Card>
  );
}

type StatusFilter = "All" | GoalStatus;
type Sort = "urgency" | "deadline" | "progress";

export default function GoalsPage() {
  const hydrated = useHasHydrated();
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
  const upsert = useChronicle((s) => s.upsertGoal);
  const remove = useChronicle((s) => s.deleteGoal);
  const confirm = useConfirm();

  const today = toISODate(new Date());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goal>(emptyGoal());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("Active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("urgency");
  const [slipping, setSlipping] = useState(false);

  const data: GoalData = useMemo(
    () => ({ journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog }),
    [journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog],
  );

  const all = useMemo(
    () => goals.map((g) => computeGoalProgress(g, data, today)),
    [goals, data, today],
  );
  const portfolio = useMemo(() => goalPortfolio(all), [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((p) => {
      if (status !== "All" && p.goal.status !== status) return false;
      if (slipping && !["behind", "atRisk", "missed"].includes(p.health)) return false;
      if (!q) return true;
      return (
        p.goal.title.toLowerCase().includes(q) ||
        p.metric.label.toLowerCase().includes(q) ||
        p.goal.horizon.toLowerCase().includes(q)
      );
    });
    if (sort === "urgency") return list.sort(byUrgency);
    if (sort === "progress") return list.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    return list.sort(
      (a, b) =>
        (a.daysToDeadline ?? Number.POSITIVE_INFINITY) -
        (b.daysToDeadline ?? Number.POSITIVE_INFINITY),
    );
  }, [all, status, query, sort, slipping]);

  const detail = detailId ? (all.find((p) => p.goal.id === detailId) ?? null) : null;
  /** Live reading of whatever the composer is currently pointed at. */
  const preview = useMemo(
    () => (open ? computeGoalProgress(draft, data, today) : null),
    [open, draft, data, today],
  );

  if (!hydrated) return <Loading />;

  function openAdd() {
    setDraft(emptyGoal());
    setEditing(false);
    setOpen(true);
  }
  function openEdit(g: Goal) {
    setDraft({ ...g });
    setEditing(true);
    setOpen(true);
  }
  async function save() {
    if (!draft.title.trim()) return;
    if (
      await confirm({
        title: editing ? "Save changes to this goal?" : "Add this goal?",
        description: editing
          ? "The goal will be updated."
          : "It will be saved to your goal tracker.",
        tone: "default",
        confirmLabel: editing ? "Save changes" : "Add goal",
      })
    ) {
      upsert({ ...draft, title: draft.title.trim() });
      setOpen(false);
    }
  }
  async function del(g: Goal) {
    if (
      await confirm({
        title: "Delete this goal?",
        description: `"${g.title}" will be permanently removed from your goals.`,
        confirmLabel: "Delete goal",
      })
    ) {
      remove(g.id);
      setDetailId((cur) => (cur === g.id ? null : cur));
    }
  }
  function setGoalStatus(g: Goal, next: GoalStatus) {
    upsert({ ...g, status: next });
  }

  const metric = metricDef(draft.metric);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Goal Tracking"
        title="Ambition, broken into the achievable."
        description="Set the number and name what feeds it — hours from the journal, mastery from the syllabus, passes from the revision queue. The progress then reads itself from what you've actually done."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />

      {/* Portfolio health */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          icon={Target}
          label="Active"
          value={`${portfolio.active}`}
          hint={`${portfolio.tracked} of ${portfolio.total} tracked automatically`}
        />
        <SummaryTile
          icon={CircleGauge}
          label="Average progress"
          value={portfolio.avgProgress == null ? "—" : `${portfolio.avgProgress}%`}
          hint={
            portfolio.completionRate == null
              ? "nothing to measure yet"
              : `${Math.round(portfolio.completionRate * 100)}% completed all time`
          }
        />
        <SummaryTile
          icon={Zap}
          label="On track"
          value={`${portfolio.onTrack}`}
          hint={`${portfolio.completed} completed`}
          tone="positive"
        />
        <SummaryTile
          icon={TriangleAlert}
          label="Slipping"
          value={`${portfolio.atRisk + portfolio.behind + portfolio.missed}`}
          hint={
            portfolio.overdue > 0
              ? `${portfolio.overdue} past its deadline`
              : `${portfolio.atRisk} at risk · ${portfolio.behind} behind`
          }
          tone={portfolio.atRisk + portfolio.behind + portfolio.missed > 0 ? "danger" : undefined}
        />
      </div>

      {/* Anything that has quietly hit its target */}
      {portfolio.readyToComplete > 0 && (
        <Card className="flex flex-wrap items-center gap-4 border-positive/30 bg-positive/[0.06] p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-positive/15 text-positive">
            <Check className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-paper/75">
            <span className="font-semibold text-paper">
              {portfolio.readyToComplete} goal
              {portfolio.readyToComplete === 1 ? " has" : "s have"} hit target.
            </span>{" "}
            Nothing is marked complete for you — check it and close it off.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setStatus("Active");
              setSort("progress");
              setSlipping(false);
            }}
          >
            Show them <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Card>
      )}

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title="No goals set"
          description="Define what you're chasing — start with this week, and let the journal keep score."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Set your first goal
            </Button>
          }
        />
      ) : (
        <>
          {/* Filters */}
          <div className="space-y-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search goals…"
                  className="pl-10"
                />
              </div>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="sm:w-44"
              >
                <option value="urgency">Most urgent first</option>
                <option value="deadline">Nearest deadline</option>
                <option value="progress">Furthest along</option>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Segmented
                value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
                options={[
                  { label: "Active", value: "Active" },
                  { label: "Completed", value: "Completed" },
                  { label: "Paused", value: "Paused" },
                  { label: "All", value: "All" },
                ]}
              />
              <Chip active={slipping} onClick={() => setSlipping((s) => !s)}>
                Needs attention
              </Chip>
            </div>
          </div>

          {/* The goals */}
          {visible.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="Nothing matches"
              description="Try another status, or clear the search."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
              {visible.map((p) => {
                const g = p.goal;
                const spark = contributionSeries(g, data, today, 21).map((s) => s.value);
                const unitText = g.unit || p.metric.unit;
                return (
                  <Card key={g.id} hover className="group flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setDetailId(g.id)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Open goal: ${g.title}`}
                      >
                        <p className="text-sm font-medium leading-snug text-paper">
                          {g.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] text-paper/45">
                          <span>{g.horizon}</span>
                          <span className="h-0.5 w-0.5 rounded-full bg-paper/30" />
                          {p.tracked ? (
                            <span className="inline-flex items-center gap-1 text-accent/90">
                              <Link2 className="h-3 w-3" />
                              {p.metric.source}
                            </span>
                          ) : (
                            <span>tracked by hand</span>
                          )}
                          <span className="h-0.5 w-0.5 rounded-full bg-paper/30" />
                          <span>
                            {p.window.label} · {formatDayShort(p.window.start)}–
                            {formatDayShort(p.window.end)}
                          </span>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Badge tone={HEALTH_TONE[p.health]}>{healthLabel(p.health)}</Badge>
                        <button
                          onClick={() => openEdit(g)}
                          aria-label={`Edit goal: ${g.title}`}
                          title="Edit goal"
                          className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => del(g)}
                          aria-label={`Delete goal: ${g.title}`}
                          title="Delete goal"
                          className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {p.target != null ? (
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-end justify-between gap-2">
                          <span className="tabular text-sm font-semibold text-paper">
                            {/* An em dash, not 0 — a goal that can't be measured
                                hasn't scored zero, it has nothing to read. */}
                            {p.current ?? "—"}
                            <span className="font-normal text-paper/45">
                              {" / "}
                              {p.target} {unitText}
                            </span>
                          </span>
                          <span className="tabular text-xs text-paper/45">
                            {p.pct}%
                            {p.paceDelta != null && p.paceDelta !== 0 && (
                              <span
                                className={cn(
                                  "ml-1.5 font-semibold",
                                  p.paceDelta > 0 ? "text-positive" : "text-danger",
                                )}
                              >
                                {p.paceDelta > 0 ? "+" : "−"}
                                {Math.abs(p.paceDelta)} vs pace
                              </span>
                            )}
                          </span>
                        </div>
                        <PaceBar p={p} />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-paper/45">
                        {g.metricLabel || "Long-term aspiration — no number attached."}
                      </p>
                    )}

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className="min-w-0 flex-1 text-[0.72rem] leading-relaxed text-paper/55">
                        {paceNote(p)}
                      </p>
                      {spark.length > 2 && (
                        <Sparkline values={spark} width={64} height={22} fill={false} />
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <div className="flex items-center gap-1.5">
                        {p.readyToComplete ? (
                          <Button size="sm" onClick={() => setGoalStatus(g, "Completed")}>
                            <Check className="h-3.5 w-3.5" /> Complete it
                          </Button>
                        ) : g.status === "Active" ? (
                          <button
                            onClick={() => setGoalStatus(g, "Paused")}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-medium text-paper/55 transition-colors hover:border-paper/25 hover:text-paper"
                          >
                            <PauseCircle className="h-3 w-3" /> Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => setGoalStatus(g, "Active")}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-medium text-paper/55 transition-colors hover:border-paper/25 hover:text-paper"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                      {g.deadline && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[0.7rem]",
                            p.overdue ? "font-semibold text-danger" : "text-paper/40",
                          )}
                        >
                          <CalendarClock className="h-3 w-3" />
                          {p.overdue
                            ? `${Math.abs(p.daysToDeadline ?? 0)}d overdue`
                            : `${p.daysToDeadline}d left · ${formatDate(g.deadline)}`}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Detail */}
      {detail && (
        <Modal
          open={!open}
          onClose={() => setDetailId(null)}
          title={detail.goal.title}
          description={`${detail.goal.horizon} · ${formatDate(detail.window.start)} – ${formatDate(detail.window.end)}`}
          className="sm:max-w-xl"
          footer={
            <>
              <Button variant="danger" onClick={() => del(detail.goal)} className="mr-auto">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button variant="ghost" onClick={() => setDetailId(null)}>
                Close
              </Button>
              <Button onClick={() => openEdit(detail.goal)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <RadialProgress
                value={detail.pct ?? 0}
                size={86}
                stroke={8}
                label={detail.pct == null ? "—" : `${detail.pct}%`}
                sublabel="of target"
              />
              <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-paper/55">Measured</span>
                  <span className="tabular font-semibold text-paper">
                    {detail.current ?? "—"} {detail.goal.unit || detail.metric.unit}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-paper/55">Target</span>
                  <span className="tabular font-semibold text-paper">
                    {detail.target ?? "none"}
                  </span>
                </p>
                {detail.expectedPct != null && (
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-paper/55">Even pace by today</span>
                    <span className="tabular font-semibold text-paper">
                      {detail.expectedPct}%
                    </span>
                  </p>
                )}
                {detail.perDay != null && (
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-paper/55">Rate so far</span>
                    <span className="tabular font-semibold text-paper">
                      {detail.perDay} {detail.goal.unit || detail.metric.unit}/day
                    </span>
                  </p>
                )}
                <p className="flex items-center justify-between gap-3 border-t border-line pt-1.5">
                  <span className="text-paper/55">Status</span>
                  <Badge tone={HEALTH_TONE[detail.health]}>{healthLabel(detail.health)}</Badge>
                </p>
              </div>
            </div>

            <p className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-paper/70">
              {paceNote(detail)}
            </p>

            {/* Where the number comes from */}
            <div>
              <p className="eyebrow mb-2">Fed by</p>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/[0.02] p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                  <Link2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-paper">{detail.metric.label}</p>
                  <p className="text-[0.72rem] text-paper/50">{detail.metric.hint}</p>
                </div>
                {detail.tracked && (
                  <Link
                    href={detail.metric.href}
                    className="inline-flex shrink-0 items-center gap-1 text-[0.75rem] font-semibold text-accent transition-opacity hover:opacity-80"
                  >
                    {detail.metric.source}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>

            {/* Daily shape */}
            {(() => {
              const series = contributionSeries(detail.goal, data, today, 31);
              if (series.length < 3) return null;
              return (
                <div>
                  <p className="eyebrow mb-2">Day by day</p>
                  <BarChart
                    data={series.map((s) => ({
                      label: formatDayShort(s.date).split(" ")[0],
                      value: s.value,
                      sublabel: formatDate(s.date),
                    }))}
                    height={140}
                    formatValue={(v) =>
                      `${round(v, 1)} ${detail.goal.unit || detail.metric.unit}`
                    }
                  />
                </div>
              );
            })()}

            <Field label="Status">
              <Segmented
                value={detail.goal.status}
                onChange={(v) => setGoalStatus(detail.goal, v as GoalStatus)}
                options={STATUSES.map((s) => ({ label: s, value: s }))}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Composer */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit goal" : "New goal"}
        description={
          editing
            ? "Change what it measures, or move the target."
            : "Name the number, then say what should feed it."
        }
        className="sm:max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draft.title.trim()}>
              {editing ? "Save changes" : "Add goal"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Goal">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. 45 hours of study this week"
            />
          </Field>

          <Field
            label="What feeds it"
            hint={metric.hint}
          >
            <Select
              value={draft.metric ?? "manual"}
              onChange={(e) => {
                const next = e.target.value as GoalMetric;
                const def = metricDef(next);
                // Adopt the metric's own unit unless one was deliberately typed.
                setDraft((d) => ({
                  ...d,
                  metric: next,
                  unit: !d.unit || d.unit === metricDef(d.metric).unit ? def.unit : d.unit,
                }));
              }}
            >
              {GOAL_METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.id === "manual" ? "" : ` — from ${m.source}`}
                </option>
              ))}
            </Select>
          </Field>

          {metric.needsSubject && (
            <Field label="Subject" hint="This metric is measured for one subject.">
              <Select
                value={draft.linkedSubjectId ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, linkedSubjectId: e.target.value || undefined })
                }
              >
                <option value="">Choose a subject…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Horizon" hint="Sets the window progress is measured over.">
              <Select
                value={draft.horizon}
                onChange={(e) =>
                  setDraft({ ...draft, horizon: e.target.value as GoalHorizon })
                }
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline">
              <Input
                type="date"
                value={draft.deadline ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, deadline: e.target.value || undefined })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Target">
              <Input
                type="number"
                value={draft.target ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, target: parseFloat(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Unit">
              <Input
                value={draft.unit ?? ""}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                placeholder={metric.unit || "hrs"}
              />
            </Field>
            <Field
              label="Current"
              hint={draft.metric !== "manual" ? "Read from your data." : undefined}
            >
              <Input
                type="number"
                disabled={draft.metric !== "manual"}
                value={
                  draft.metric !== "manual"
                    ? (preview?.current ?? 0)
                    : (draft.current ?? 0)
                }
                onChange={(e) =>
                  setDraft({ ...draft, current: parseFloat(e.target.value) || 0 })
                }
              />
            </Field>
          </div>

          {/* Live reading, so the connection is obvious before saving */}
          {preview && (
            <div
              className={cn(
                "rounded-xl border p-3.5",
                preview.problem
                  ? "border-warning/30 bg-warning/[0.06]"
                  : "border-accent/25 bg-accent/[0.05]",
              )}
            >
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-paper/50">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Reading right now
              </p>
              {preview.problem ? (
                <p className="text-sm text-paper/70">{preview.problem}</p>
              ) : (
                <p className="text-sm text-paper/75">
                  <span className="tabular font-semibold text-paper">
                    {preview.current ?? 0} {draft.unit || metric.unit}
                  </span>{" "}
                  {preview.target != null && (
                    <>
                      of {preview.target} — {preview.pct}% of the way,{" "}
                    </>
                  )}
                  measured over {preview.window.label} (
                  {formatDate(preview.window.start)} – {formatDate(preview.window.end)}).
                  {preview.expectedPct != null && (
                    <>
                      {" "}
                      Even pace for today would be {preview.expectedPct}%.
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {draft.target === 0 && (
            <Field label="Describe it instead" hint="Shown when there's no number to hit.">
              <Input
                value={draft.metricLabel ?? ""}
                onChange={(e) => setDraft({ ...draft, metricLabel: e.target.value })}
                placeholder="e.g. Reach final selection"
              />
            </Field>
          )}
        </div>
      </Modal>

      {/* Where the numbers come from */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <ArrowUpRight className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-paper/70">
          Goals read from the rest of the Chronicle — the journal, syllabus tracker,
          mock tests, revision queue, library, current affairs, reflections and the
          life dashboard. Log the day and every goal that depends on it moves.
        </p>
        <Link
          href="/journal"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent transition-opacity hover:opacity-80"
        >
          Log today <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    </div>
  );
}
