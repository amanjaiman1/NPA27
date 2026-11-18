"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Target, Check, Search, ArrowRight, TriangleAlert, CircleGauge, Zap, X } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Goal, GoalCategory } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, Chip, Segmented } from "@/components/ui/misc";
import { GoalForm, emptyGoal } from "@/components/goals/goal-form";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalDetail } from "@/components/goals/goal-detail";
import {
  GOAL_CATEGORIES,
  GOAL_VIEWS,
  computeGoalProgress,
  contributionSeries,
  goalCategory,
  goalPortfolio,
  goalViewCounts,
  inGoalView,
  byPriority,
  byUrgency,
  type GoalData,
  type GoalView,
} from "@/lib/goals";
import { cn, toISODate } from "@/lib/utils";

type Sort = "urgency" | "priority" | "deadline" | "progress";

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning" | "positive";
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-paper/50">
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
            tone === "positive" && "text-positive",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold">{label}</span>
      </div>
      <p
        className={cn(
          "tabular mt-2 font-display text-[1.6rem] font-bold leading-none tracking-tightest",
          tone === "danger" ? "text-danger" : "text-paper",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-[0.7rem] text-paper/50">{hint}</p>}
    </>
  );
  return (
    <Card className={cn("p-4 sm:p-5", onClick && "transition-colors hover:border-paper/25")}>
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
    </Card>
  );
}

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
  const remove = useChronicle((s) => s.deleteGoal);
  const confirm = useConfirm();

  const today = toISODate(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [formGoal, setFormGoal] = useState<Goal>(emptyGoal);
  const [isNew, setIsNew] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<GoalView>("active");
  const [category, setCategory] = useState<"all" | GoalCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("urgency");
  const [slipping, setSlipping] = useState(false);

  // `/goals?goal=<id>` (from a journal day) opens that goal.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("goal");
    if (id && goals.some((g) => g.id === id)) {
      setDetailId(id);
      const g = goals.find((x) => x.id === id);
      if (g && g.status !== "Active") setView("all");
    }
    if (params.get("new") === "1") openAdd();
    if (id || params.get("new")) window.history.replaceState({}, "", "/goals");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const data: GoalData = useMemo(
    () => ({ journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog }),
    [journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog],
  );

  const all = useMemo(() => goals.map((g) => computeGoalProgress(g, data, today)), [goals, data, today]);
  const portfolio = useMemo(() => goalPortfolio(all), [all]);
  const counts = useMemo(() => goalViewCounts(all), [all]);
  const usedCategories = useMemo(() => {
    const used = new Set(goals.map(goalCategory));
    return GOAL_CATEGORIES.filter((c) => used.has(c));
  }, [goals]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((p) => {
      if (!inGoalView(p, view)) return false;
      if (category !== "all" && goalCategory(p.goal) !== category) return false;
      if (slipping && !["behind", "atRisk", "missed"].includes(p.health)) return false;
      if (!q) return true;
      return (
        p.goal.title.toLowerCase().includes(q) ||
        p.metric.label.toLowerCase().includes(q) ||
        p.goal.horizon.toLowerCase().includes(q) ||
        goalCategory(p.goal).toLowerCase().includes(q) ||
        (p.goal.milestones ?? []).some((m) => m.title.toLowerCase().includes(q)) ||
        (p.goal.notes ?? []).some((n) => n.text.toLowerCase().includes(q))
      );
    });
    if (sort === "urgency") return list.sort(byUrgency);
    if (sort === "priority") return list.sort(byPriority);
    if (sort === "progress") return list.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    return list.sort(
      (a, b) => (a.daysToDeadline ?? Number.POSITIVE_INFINITY) - (b.daysToDeadline ?? Number.POSITIVE_INFINITY),
    );
  }, [all, view, category, query, sort, slipping]);

  const sparks = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const p of visible) m.set(p.goal.id, contributionSeries(p.goal, data, today, 21).map((s) => s.value));
    return m;
  }, [visible, data, today]);

  const detail = detailId ? (all.find((p) => p.goal.id === detailId) ?? null) : null;
  const filtered = query.trim() !== "" || category !== "all" || slipping;

  if (!hydrated) return <Loading />;

  function openAdd() {
    setFormGoal(emptyGoal());
    setIsNew(true);
    setFormOpen(true);
  }
  function openEdit(g: Goal) {
    setFormGoal(g);
    setIsNew(false);
    setFormOpen(true);
  }
  async function del(g: Goal) {
    const links = (g.journalDates?.length ?? 0) + (g.fileIds?.length ?? 0);
    if (
      await confirm({
        title: "Delete this goal?",
        description: `“${g.title}” and its milestones, history and notes will be removed.${
          links ? " Linked journal days and files are not deleted." : ""
        }`,
        confirmLabel: "Delete goal",
      })
    ) {
      remove(g.id);
      setDetailId((cur) => (cur === g.id ? null : cur));
    }
  }
  function clearFilters() {
    setQuery("");
    setCategory("all");
    setSlipping(false);
  }

  const attention = portfolio.atRisk + portfolio.behind + portfolio.missed;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Goals"
        title="Ambition, broken into the achievable."
        description="Name the number and what feeds it. Hours come from the journal, mastery from the syllabus, passes from the revision queue, so progress updates itself from what you've actually done."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />

      {goals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile
            icon={Target}
            label="Active"
            value={`${portfolio.active}`}
            hint={`${portfolio.tracked} of ${portfolio.total} update themselves`}
            onClick={() => setView("active")}
          />
          <SummaryTile
            icon={CircleGauge}
            label="Progress"
            value={portfolio.avgProgress == null ? "—" : `${portfolio.avgProgress}%`}
            hint={portfolio.avgProgress == null ? "no targets yet" : "across active goals"}
          />
          <SummaryTile
            icon={Zap}
            label="Completed"
            value={`${portfolio.completed}`}
            hint={
              portfolio.completionRate == null
                ? "nothing finished yet"
                : `${Math.round(portfolio.completionRate * 100)}% of unpaused goals`
            }
            tone={portfolio.completed > 0 ? "positive" : undefined}
            onClick={() => setView("completed")}
          />
          <SummaryTile
            icon={TriangleAlert}
            label="Overdue"
            value={`${counts.overdue}`}
            hint={attention > 0 ? `${portfolio.atRisk} at risk · ${portfolio.behind} behind` : "nothing slipping"}
            tone={counts.overdue > 0 ? "danger" : undefined}
            onClick={() => setView("overdue")}
          />
        </div>
      )}

      {portfolio.readyToComplete > 0 && (
        <Card className="flex flex-wrap items-center gap-4 border-positive/30 bg-positive/[0.06] p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-positive/15 text-positive">
            <Check className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-paper/80">
            <span className="font-semibold text-paper">
              {portfolio.readyToComplete} goal{portfolio.readyToComplete === 1 ? " has" : "s have"} hit the target.
            </span>{" "}
            Nothing is marked complete for you. Check and close it off.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setView("active");
              setSort("progress");
              clearFilters();
            }}
          >
            Show {portfolio.readyToComplete === 1 ? "it" : "them"} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Card>
      )}

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title="No goals yet"
          description="Start with this week. Pick what feeds it, and the journal keeps score."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Set your first goal
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2.5">
            <Segmented
              value={view}
              onChange={setView}
              options={GOAL_VIEWS.map((v) => ({ label: `${v.label} · ${counts[v.id]}`, value: v.id }))}
              className="w-fit"
            />
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search goals, milestones and notes…"
                  aria-label="Search goals"
                  className="pl-10"
                />
              </div>
              {usedCategories.length > 1 && (
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as "all" | GoalCategory)}
                  aria-label="Category"
                  className="sm:w-44"
                >
                  <option value="all">All categories</option>
                  {usedCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="sm:w-48">
                <option value="urgency">Most urgent first</option>
                <option value="priority">Highest priority first</option>
                <option value="deadline">Nearest target date</option>
                <option value="progress">Furthest along</option>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={slipping} onClick={() => setSlipping((s) => !s)} aria-pressed={slipping}>
                Needs attention
              </Chip>
              {filtered && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-paper/55 hover:text-paper"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
              <span className="ml-auto text-[0.72rem] text-paper/50">
                {visible.length} of {counts[view]} shown
              </span>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={filtered ? "Nothing matches" : `No ${GOAL_VIEWS.find((v) => v.id === view)?.label.toLowerCase()} goals`}
              description={
                filtered
                  ? "Try another view, or clear the filters."
                  : view === "overdue"
                    ? "Every active goal is inside its time."
                    : "Goals show up here as their status changes."
              }
              action={
                filtered ? (
                  <Button variant="ghost" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
              {visible.map((p) => (
                <GoalCard
                  key={p.goal.id}
                  p={p}
                  spark={sparks.get(p.goal.id) ?? []}
                  onOpen={() => setDetailId(p.goal.id)}
                  onEdit={() => openEdit(p.goal)}
                  onDelete={() => del(p.goal)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!formOpen && (
        <GoalDetail
          p={detail}
          data={data}
          onClose={() => setDetailId(null)}
          onEdit={openEdit}
          onDelete={del}
        />
      )}

      <GoalForm open={formOpen} initial={formGoal} isNew={isNew} onClose={() => setFormOpen(false)} data={data} />
    </div>
  );
}
