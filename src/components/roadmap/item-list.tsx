"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CornerDownRight,
  Eye,
  Flag,
  Forward,
  Pencil,
  Plus,
  Target,
  TriangleAlert,
} from "lucide-react";
import type { ISODate, PlanItemKind, PlanItemStatus, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  ITEM_STATUSES,
  LIMITS,
  STATUS_LABEL,
  blankItem,
  blankPlan,
  carryable,
  findItem,
  formatDay,
  formatDayShort,
  isCarried,
  isISODate,
  isOverdue,
  nextPeriodStart,
  nextPlanOf,
  outsidePlan,
  periodLabel,
  planName,
  suggestedParent,
} from "@/lib/roadmap";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { PriorityMark, useRoadmapNav } from "./shared";
import type { ItemFormRequest } from "./item-form";

/**
 * A plan's activities or milestones, with a quick way to add one and to
 * move it on. Order is yours: the arrows move an item up or down.
 */
export function ItemList({
  plan,
  kind,
  today,
  highlightId,
  onOpen,
  readOnly = false,
}: {
  plan: RoadmapPlan;
  kind: PlanItemKind;
  today: ISODate;
  highlightId?: string;
  onOpen: (req: ItemFormRequest) => void;
  /** Archived: shown as it was, and opened to read, not changed. */
  readOnly?: boolean;
}) {
  const plans = useChronicle((s) => s.plans);
  const goals = useChronicle((s) => s.goals);
  const subjects = useChronicle((s) => s.subjects);
  const savePlanItem = useChronicle((s) => s.savePlanItem);
  const setPlanItemStatus = useChronicle((s) => s.setPlanItemStatus);
  const movePlanItem = useChronicle((s) => s.movePlanItem);
  const nav = useRoadmapNav();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [flash, setFlash] = useState<string | undefined>(highlightId);
  const items = useMemo(() => (plan.items ?? []).filter((i) => i.kind === kind), [plan.items, kind]);
  const full = (plan.items?.length ?? 0) >= LIMITS.items;
  const isMilestone = kind === "milestone";
  const noun = isMilestone ? "milestone" : "activity";

  useEffect(() => {
    if (!highlightId || !items.some((i) => i.id === highlightId)) return;
    setFlash(highlightId);
    document.getElementById(`item-${highlightId}`)?.scrollIntoView({ block: "center" });
    const t = window.setTimeout(() => setFlash(undefined), 2400);
    return () => window.clearTimeout(t);
  }, [highlightId, items]);

  function add() {
    const t = title.trim();
    if (!t || full) return;
    const item = blankItem(kind, t);
    if (isISODate(due)) item.targetDate = due;
    savePlanItem(plan.id, item);
    setTitle("");
    setDue("");
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it, i) => {
            const carried = isCarried(plans, it);
            const overdue = isOverdue(it, plan, today);
            const goal = it.goalId ? goals.find((g) => g.id === it.goalId) : undefined;
            const goalMilestone = goal?.milestones?.find((m) => m.id === it.goalMilestoneId);
            const subject = it.subjectId ? subjects.find((s) => s.id === it.subjectId) : undefined;
            const to = carried ? findItem(plans, it.carriedTo) : null;
            const from = it.carriedFrom ? findItem(plans, it.carriedFrom) : null;
            const done = it.status === "completed";
            return (
              <li
                key={it.id}
                id={`item-${it.id}`}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-line bg-paper/[0.02] px-3 py-2.5 transition-shadow",
                  flash === it.id && "ring-2 ring-accent/50",
                  carried && "opacity-75",
                )}
              >
                <button
                  type="button"
                  onClick={() => setPlanItemStatus(plan.id, it.id, done ? "notStarted" : "completed")}
                  disabled={carried || readOnly}
                  aria-pressed={done}
                  aria-label={done ? `Mark “${it.title}” not done` : isMilestone ? `Mark “${it.title}” reached` : `Mark “${it.title}” complete`}
                  className={cn(
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center border transition-colors disabled:cursor-not-allowed",
                    isMilestone ? "rounded-full" : "rounded-md",
                    done ? "border-positive bg-positive text-ink" : "border-paper/35 hover:border-accent",
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpen({ planId: plan.id, item: it })}
                    className={cn(
                      "block max-w-full text-left text-sm font-medium text-paper hover:text-accent",
                      done && "text-paper/60 line-through decoration-paper/40",
                    )}
                  >
                    {isMilestone && <Flag className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-accent" />}
                    {it.title}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-paper/60">
                    {!isMilestone && <PriorityMark priority={it.priority} />}
                    {(it.targetDate || overdue) && (
                      <span className={cn(overdue && "font-semibold text-danger")}>
                        {overdue
                          ? it.targetDate
                            ? `Overdue since ${formatDayShort(it.targetDate)}`
                            : `Open after the ${plan.level} ended`
                          : `${isMilestone ? "Due" : "By"} ${formatDayShort(it.targetDate!)}`}
                      </span>
                    )}
                    {outsidePlan(it, plan) && (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <TriangleAlert className="h-3 w-3" /> Outside this {plan.level}
                      </span>
                    )}
                    {subject && <span>{subject.name}</span>}
                    {it.category && <span>{it.category}</span>}
                    {goal && (
                      <Link
                        href={`/goals?goal=${encodeURIComponent(goal.id)}`}
                        className="inline-flex max-w-[16rem] items-center gap-1 truncate text-accent hover:underline"
                        title={`Serves the goal “${goal.title}”`}
                      >
                        <Target className="h-3 w-3 shrink-0" />
                        <span className="truncate">{goal.title}</span>
                      </Link>
                    )}
                    {(it.journalDates?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {it.journalDates!.length} journal day{it.journalDates!.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {from && (
                      <span className="inline-flex items-center gap-1">
                        <CornerDownRight className="h-3 w-3" /> From {planName(from.plan)}
                      </span>
                    )}
                    {to && (
                      <button
                        type="button"
                        onClick={() => nav({ plan: to.plan.id, item: to.item.id })}
                        className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                      >
                        <Forward className="h-3 w-3" /> Carried to {planName(to.plan)}
                      </button>
                    )}
                  </div>
                  {done && goalMilestone && !goalMilestone.doneOn && goal && (
                    <p className="mt-1 text-[0.68rem] text-info">
                      Done here. The goal&apos;s milestone “{goalMilestone.title}” is still open:{" "}
                      <Link href={`/goals?goal=${encodeURIComponent(goal.id)}`} className="font-semibold underline">
                        tick it in Goals
                      </Link>{" "}
                      if it&apos;s finished.
                    </p>
                  )}
                </div>
                {!isMilestone && (
                  <Select
                    value={it.status}
                    onChange={(e) => setPlanItemStatus(plan.id, it.id, e.target.value as PlanItemStatus)}
                    disabled={carried || readOnly}
                    aria-label={`Status of “${it.title}”`}
                    className="hidden h-8 w-[8.5rem] shrink-0 rounded-lg py-1 pl-2.5 text-[0.72rem] sm:block"
                  >
                    {ITEM_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                )}
                <div className="flex shrink-0 items-center">
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() => movePlanItem(plan.id, it.id, -1)}
                        disabled={i === 0}
                        aria-label={`Move “${it.title}” up`}
                        className="grid h-8 w-7 place-items-center rounded-lg text-paper/50 hover:bg-paper/[0.06] hover:text-paper disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePlanItem(plan.id, it.id, 1)}
                        disabled={i === items.length - 1}
                        aria-label={`Move “${it.title}” down`}
                        className="grid h-8 w-7 place-items-center rounded-lg text-paper/50 hover:bg-paper/[0.06] hover:text-paper disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen({ planId: plan.id, item: it })}
                    aria-label={readOnly ? `View “${it.title}”` : `Edit “${it.title}”`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-paper/50 hover:bg-paper/[0.06] hover:text-paper"
                  >
                    {readOnly ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {readOnly && items.length === 0 && <p className="text-[0.78rem] text-paper/55">No {isMilestone ? "milestones" : "activities"}.</p>}
      {!readOnly && (
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isMilestone ? "Add a milestone…" : "Add an activity…"}
          aria-label={`New ${noun}`}
          maxLength={LIMITS.itemTitle}
          className="flex-1"
          disabled={full}
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label={isMilestone ? "Due date (optional)" : "Target date (optional)"}
            className="w-full sm:w-40"
            disabled={full}
          />
          <Button type="submit" variant="ghost" disabled={!title.trim() || full} aria-label={`Add ${noun}`}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </form>
      )}
      {full && !readOnly && <p className="text-[0.72rem] text-warning">A plan holds up to {LIMITS.items} items. Split the work across another plan.</p>}
      {!isMilestone && !readOnly && items.length > 0 && (
        <p className="text-[0.68rem] text-paper/50">
          Open an activity to add detail: description, subject, goal, notes and the journal days you did it.
        </p>
      )}
    </div>
  );
}

/**
 * Moves unfinished activities on to the next plan of the same kind. Each is
 * copied there; the original stays here, marked as carried forward.
 */
export function CarryDialog({
  plan,
  open,
  onClose,
}: {
  plan: RoadmapPlan;
  open: boolean;
  onClose: () => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const savePlan = useChronicle((s) => s.savePlan);
  const carryForward = useChronicle((s) => s.carryForward);
  const nav = useRoadmapNav();
  const list = useMemo(() => carryable(plans, plan), [plans, plan]);
  const target = nextPlanOf(plans, plan);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ moved: number; to: RoadmapPlan } | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(new Set(list.map((i) => i.id)));
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nextStart = nextPeriodStart(plan);
  const draftNext = useMemo(() => {
    const p = blankPlan(plan.level, { start: nextStart, month: nextStart.slice(0, 7), year: Number(nextStart.slice(0, 4)) });
    const parent = suggestedParent(plans, p);
    if (parent) p.parentId = parent;
    return p;
  }, [plan.level, nextStart, plans]);

  function run() {
    let to = target;
    if (!to) {
      if (!savePlan(draftNext)) return;
      to = useChronicle.getState().plans.find((p) => p.id === draftNext.id);
    }
    if (!to) return;
    const moved = carryForward(plan.id, [...picked], to.id);
    setResult({ moved, to });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Carry forward"
      description={`Unfinished activities from ${planName(plan)}`}
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={() => {
                onClose();
                nav({ plan: result.to.id });
              }}
            >
              Open {planName(result.to)}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={run} disabled={picked.size === 0}>
              <Forward className="h-4 w-4" /> Carry {picked.size || ""} forward
            </Button>
          </>
        )
      }
    >
      {result ? (
        <p className="text-sm text-paper/80" role="status">
          {result.moved} activit{result.moved === 1 ? "y" : "ies"} carried to {planName(result.to)}. The originals stay here, marked as carried
          forward.
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-paper/70">Everything here is done or already carried forward.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[0.8rem] text-paper/75">
            {target ? (
              <>
                Into <span className="font-semibold text-paper">{planName(target)}</span> ({periodLabel(target)}).
              </>
            ) : (
              <>
                {periodLabel(draftNext)} isn&apos;t planned yet. A blank {plan.level === "week" ? "weekly" : "monthly"} plan will be created for it
                {draftNext.parentId ? ` under ${planName(plans.find((p) => p.id === draftNext.parentId)!)}` : ""}.
              </>
            )}{" "}
            Each is copied there as a new activity. Here, the original is kept and marked as carried forward.
          </p>
          <ul className="space-y-1.5">
            {list.map((it) => (
              <li key={it.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2 text-sm text-paper/85">
                  <input
                    type="checkbox"
                    checked={picked.has(it.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(it.id);
                        else n.delete(it.id);
                        return n;
                      })
                    }
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="min-w-0">
                    {it.title}
                    <span className="block text-[0.68rem] text-paper/55">
                      {STATUS_LABEL[it.status]}
                      {it.targetDate ? ` · was by ${formatDay(it.targetDate)}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

