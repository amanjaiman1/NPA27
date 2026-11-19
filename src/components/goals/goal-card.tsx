"use client";

import { useState } from "react";
import {
  BookOpen,
  CalendarClock,
  Check,
  ListChecks,
  MessageSquareText,
  Paperclip,
  PauseCircle,
  Pencil,
  Play,
  Trash2,
  TrendingUp,
  Link2,
} from "lucide-react";
import type { GoalPriority } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  goalCategory,
  goalPriority,
  healthLabel,
  milestoneCounts,
  paceNote,
  type GoalHealth,
  type GoalProgress,
} from "@/lib/goals";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Sparkline } from "@/components/charts/sparkline";
import { cn, formatDate, formatDayShort } from "@/lib/utils";
import { Progress, type ProgressTone } from "@/components/ui/progress";

/** Badge tone per health state, so the same colour always means the same thing. */
export const HEALTH_TONE: Record<GoalHealth, "positive" | "warning" | "danger" | "accent" | "outline" | "ghost"> = {
  achieved: "positive",
  onTrack: "positive",
  atRisk: "warning",
  behind: "danger",
  missed: "danger",
  paused: "ghost",
  unmeasurable: "warning",
  open: "outline",
};

const PRIORITY_DOT: Record<GoalPriority, string> = {
  High: "bg-danger",
  Medium: "bg-warning",
  Low: "bg-paper/35",
};

export function PriorityLabel({ priority }: { priority: GoalPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[priority])} aria-hidden />
      {priority} priority
    </span>
  );
}

/**
 * A progress bar with the even-pace mark on it. The bar alone says "40%"; the
 * mark is what tells you whether 40% is ahead or behind for the day you're on.
 */
export function PaceBar({ p }: { p: GoalProgress }) {
  const pct = p.pct ?? 0;
  const tone: ProgressTone =
    p.health === "achieved"
      ? "positive"
      : p.health === "behind" || p.health === "missed"
        ? "danger"
        : p.health === "atRisk"
          ? "warning"
          : "accent";
  return (
    <Progress
      value={pct}
      className="h-2"
      tone={tone}
      label={`${p.goal.title}: ${p.pct ?? 0}% of target`}
      marker={
        p.expectedPct != null && p.expectedPct > 0 && p.expectedPct < 100
          ? { at: p.expectedPct, label: `Even pace for today would be ${p.expectedPct}%` }
          : undefined
      }
    />
  );
}

/** "12 / 40 hrs". An em dash stands in for a number that can't be read. */
export function ProgressFigure({ p }: { p: GoalProgress }) {
  const unit = p.goal.unit || p.metric.unit;
  return (
    <span className="tabular text-sm font-semibold text-paper">
      {p.current ?? "—"}
      <span className="font-normal text-paper/50">
        {" / "}
        {p.target} {unit}
      </span>
    </span>
  );
}

/**
 * One goal in the list. Shows where it stands at a glance and offers the next
 * action in place: complete it, update a hand-tracked number, or pause it.
 */
export function GoalCard({
  p,
  spark,
  onOpen,
  onEdit,
  onDelete,
}: {
  p: GoalProgress;
  /** Per-day values for the sparkline; empty when the measure has no daily shape. */
  spark: number[];
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const g = p.goal;
  const setGoalStatus = useChronicle((s) => s.setGoalStatus);
  const logGoalProgress = useChronicle((s) => s.logGoalProgress);
  const [updating, setUpdating] = useState(false);
  const [value, setValue] = useState("");
  const steps = milestoneCounts(g);
  const files = g.fileIds?.length ?? 0;
  const days = g.journalDates?.length ?? 0;
  const notes = g.notes?.length ?? 0;
  const manual = !p.tracked;
  const parsed = value.trim() === "" ? NaN : Number(value);
  const valueOk = Number.isFinite(parsed) && parsed >= 0;

  function startUpdate() {
    setValue(String(g.current ?? 0));
    setUpdating(true);
  }
  function saveUpdate() {
    if (!valueOk) return;
    logGoalProgress(g.id, parsed);
    setUpdating(false);
  }

  return (
    <Card hover className="group flex flex-col p-5" data-testid="goal-card">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" aria-label={`Open goal: ${g.title}`}>
          <p className="text-sm font-medium leading-snug text-paper">{g.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] text-paper/50">
            <PriorityLabel priority={goalPriority(g)} />
            <span className="h-0.5 w-0.5 rounded-full bg-paper/30" />
            <span>{goalCategory(g)}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-paper/30" />
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
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Badge tone={HEALTH_TONE[p.health]}>{healthLabel(p.health)}</Badge>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit goal: ${g.title}`}
            title="Edit goal"
            className="grid h-8 w-8 place-items-center rounded-lg text-paper/35 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete goal: ${g.title}`}
            title="Delete goal"
            className="grid h-8 w-8 place-items-center rounded-lg text-paper/35 transition-colors hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {p.target != null ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <ProgressFigure p={p} />
            <span className="tabular text-xs text-paper/50">
              {p.pct}%
              {p.paceDelta != null && p.paceDelta !== 0 && g.status === "Active" && (
                <span className={cn("ml-1.5 font-semibold", p.paceDelta > 0 ? "text-positive" : "text-danger")}>
                  {p.paceDelta > 0 ? "+" : "−"}
                  {Math.abs(p.paceDelta)} vs pace
                </span>
              )}
            </span>
          </div>
          <PaceBar p={p} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-paper/50">{g.metricLabel || "Long-term aspiration with no number attached."}</p>
      )}

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="min-w-0 flex-1 text-[0.72rem] leading-relaxed text-paper/60">{paceNote(p)}</p>
        {spark.length > 2 && <Sparkline values={spark} width={64} height={22} fill={false} />}
      </div>

      {(steps.total > 0 || files > 0 || days > 0 || notes > 0) && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-left text-[0.68rem] text-paper/50 hover:text-paper/75"
        >
          {steps.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> {steps.done} of {steps.total} milestones
            </span>
          )}
          {days > 0 && (
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> {days} journal day{days === 1 ? "" : "s"}
            </span>
          )}
          {files > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" /> {files} file{files === 1 ? "" : "s"}
            </span>
          )}
          {notes > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquareText className="h-3 w-3" /> {notes} note{notes === 1 ? "" : "s"}
            </span>
          )}
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {updating ? (
          <form
            className="flex w-full items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveUpdate();
            }}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={`New total for ${g.title}`}
              className="h-9 w-28 py-1.5"
            />
            <span className="truncate text-xs text-paper/50">
              of {p.target ?? "—"} {g.unit || p.metric.unit}
            </span>
            <span className="flex-1" />
            <Button type="button" size="sm" variant="ghost" onClick={() => setUpdating(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!valueOk}>
              Save
            </Button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {p.readyToComplete || (manual && g.status === "Active" && p.pct != null && p.pct >= 100) ? (
                <Button size="sm" onClick={() => setGoalStatus(g.id, "Completed")}>
                  <Check className="h-3.5 w-3.5" /> Mark complete
                </Button>
              ) : null}
              {manual && g.status === "Active" && (
                <button
                  type="button"
                  onClick={startUpdate}
                  className="lg-clear inline-flex items-center gap-1.5 rounded-full border border-accent/35 px-2.5 py-1 text-[0.7rem] font-semibold text-accent transition-all"
                >
                  <TrendingUp className="h-3 w-3" /> Update progress
                </button>
              )}
              {g.status === "Active" ? (
                <button
                  type="button"
                  onClick={() => setGoalStatus(g.id, "Paused")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-medium text-paper/60 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  <PauseCircle className="h-3 w-3" /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setGoalStatus(g.id, "Active")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-medium text-paper/60 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  <Play className="h-3 w-3" /> {g.status === "Completed" ? "Reopen" : "Resume"}
                </button>
              )}
            </div>
            {g.status === "Completed" && g.completedOn ? (
              <span className="text-[0.7rem] text-positive">Completed {formatDate(g.completedOn)}</span>
            ) : g.deadline ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[0.7rem]",
                  p.overdue ? "font-semibold text-danger" : "text-paper/45",
                )}
              >
                <CalendarClock className="h-3 w-3" />
                {p.overdue
                  ? `${Math.abs(p.daysToDeadline ?? 0)}d overdue`
                  : p.daysToDeadline === 0
                    ? "Due today"
                    : `${p.daysToDeadline}d left · ${formatDate(g.deadline)}`}
              </span>
            ) : (
              <span className="text-[0.7rem] text-paper/40">
                {p.window.label} · {formatDayShort(p.window.start)}–{formatDayShort(p.window.end)}
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
