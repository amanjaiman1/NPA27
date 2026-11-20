"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, CalendarDays, Check, ChevronDown, Flag, Link2, Minus, Plus, RotateCcw, Target, TriangleAlert } from "lucide-react";
import type { Goal, GoalStatus, ISODate } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  byPriority,
  computeGoalProgress,
  goalCategory,
  healthLabel,
  milestoneCounts,
  type GoalData,
  type GoalHealth,
  type GoalProgress,
} from "@/lib/goals";
import { goalChanges, goalUpdatedOn, hasGoalChanges, parseAmount, readingOn, type GoalDraft } from "@/lib/daily-capture";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/misc";
import { GoalForm, emptyGoal } from "@/components/goals/goal-form";
import { cn, formatDate, round, toISODate } from "@/lib/utils";

const STATUSES: GoalStatus[] = ["Active", "Paused", "Completed", "Missed"];

const TONE: Record<GoalHealth, ProgressTone> = {
  achieved: "positive",
  onTrack: "accent",
  atRisk: "warning",
  behind: "danger",
  missed: "danger",
  paused: "neutral",
  unmeasurable: "neutral",
  open: "accent",
};

const PILL: Record<ProgressTone, string> = {
  positive: "bg-positive/10 text-positive",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-paper/[0.06] text-paper/60",
};

function useGoalData(): GoalData {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const mocks = useChronicle((s) => s.mocks);
  const revisions = useChronicle((s) => s.revisions);
  const books = useChronicle((s) => s.books);
  const currentAffairs = useChronicle((s) => s.currentAffairs);
  const reflections = useChronicle((s) => s.reflections);
  const mistakes = useChronicle((s) => s.mistakes);
  const lifeLog = useChronicle((s) => s.lifeLog);
  return useMemo(
    () => ({ journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog }),
    [journal, subjects, mocks, revisions, books, currentAffairs, reflections, mistakes, lifeLog],
  );
}

/**
 * The Goals tab: the account's own goals, as cards, each opening onto the
 * update its kind of goal takes (a new total, milestones, a status, a note).
 * Updates are drafts until Save All Changes, and are then written to the
 * original goal. Nothing has to be updated every day.
 */
export function GoalsTab({
  date,
  drafts,
  onDraft,
  links,
  onLinks,
  canLink,
  errors,
}: {
  date: ISODate;
  drafts: Record<string, GoalDraft>;
  onDraft: (goalId: string, next: GoalDraft | null) => void;
  /** Goals the day's journal entry should be linked to. */
  links: string[];
  onLinks: (ids: string[]) => void;
  /** A journal entry exists for the day, or is being written. */
  canLink: boolean;
  /** Messages from the last save, by goal id. */
  errors: Record<string, string>;
}) {
  const goals = useChronicle((s) => s.goals);
  const data = useGoalData();
  const today = toISODate(new Date());
  const [creating, setCreating] = useState<Goal | null>(null);

  const shown = useMemo(() => {
    const keep = (g: Goal) => g.status === "Active" || g.id in drafts || links.includes(g.id) || goalUpdatedOn(g, date);
    return goals
      .filter(keep)
      .map((g) => computeGoalProgress(g, data, today))
      .sort((a, b) => Number(b.goal.status === "Active") - Number(a.goal.status === "Active") || byPriority(a, b));
  }, [goals, drafts, links, date, data, today]);

  const activeCount = goals.filter((g) => g.status === "Active").length;
  const updated = goals.filter((g) => goalUpdatedOn(g, date)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.02rem] font-semibold tracking-snugg text-paper">Goals you&rsquo;re working on</h2>
          <p className="mt-0.5 text-[0.8rem] text-paper/60">
            {activeCount
              ? `${activeCount} active${updated ? ` · ${updated} updated on ${formatDate(date)}` : ""}. Update the ones you worked on; the rest can wait.`
              : "Goals you create show up here, ready to update each day."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/goals" className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
            Manage goals <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setCreating(emptyGoal())}>
            <Plus className="h-3.5 w-3.5" /> New goal
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title={goals.length ? "No active goals" : "No goals yet"}
          description={
            goals.length
              ? "Your goals are paused or finished. Start a new one, or reopen one on the Goals page."
              : "Set a goal for study hours, topics, mocks or anything you track by hand, then record progress here each day."
          }
          action={
            <Button size="sm" onClick={() => setCreating(emptyGoal())}>
              <Plus className="h-3.5 w-3.5" /> Create a goal
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-paper/[0.015] shadow-soft" aria-label="Goals">
          {shown.map((p) => (
            <GoalCaptureCard
              key={p.goal.id}
              p={p}
              date={date}
              draft={drafts[p.goal.id]}
              onDraft={onDraft}
              linked={links.includes(p.goal.id)}
              onLink={(on) => onLinks(on ? [...links, p.goal.id] : links.filter((x) => x !== p.goal.id))}
              canLink={canLink}
              error={errors[p.goal.id]}
            />
          ))}
        </ul>
      )}
      {errors.__links && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs text-paper/80" role="alert">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          {errors.__links}
        </p>
      )}
      {creating && <GoalForm open initial={creating} isNew onClose={() => setCreating(null)} data={data} />}
    </div>
  );
}

const GoalCaptureCard = memo(function GoalCaptureCard({
  p,
  date,
  draft,
  onDraft,
  linked,
  onLink,
  canLink,
  error,
}: {
  p: GoalProgress;
  date: ISODate;
  draft?: GoalDraft;
  onDraft: (goalId: string, next: GoalDraft | null) => void;
  linked: boolean;
  onLink: (on: boolean) => void;
  canLink: boolean;
  error?: string;
}) {
  const g = p.goal;
  const [open, setOpen] = useState(Boolean(draft));
  const unit = g.unit || p.metric.unit;
  const tone = TONE[p.health];
  const changes = goalChanges(g, draft, date);
  const pending = hasGoalChanges(changes) || linked !== (g.journalDates ?? []).includes(date);
  const reading = readingOn(g, date);
  const milestones = g.milestones ?? [];
  const steps = milestoneCounts(g);
  const isMilestones = p.metric.id === "milestones";
  const set = (patch: Partial<GoalDraft>) => onDraft(g.id, { ...draft, ...patch });
  const value = draft?.value ?? String(reading.value);
  const typed = parseAmount(value);
  const status = draft?.status ?? g.status;
  const panelId = `goal-update-${g.id}`;

  const figure = isMilestones
    ? `${steps.done} of ${steps.total} milestones`
    : p.current != null
      ? `${round(p.current, 1)}${p.target != null ? ` / ${round(p.target, 1)}` : ""} ${unit}`.trim()
      : "Not measured yet";

  return (
    <li className="min-w-0">
      <div className={cn("px-4 py-4 transition-colors sm:px-6 sm:py-5", pending && "bg-accent/[0.05]", error && "bg-danger/[0.06]")}>
        <div className="flex items-start gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", PILL[tone])} aria-hidden>
            {isMilestones ? <Flag className="h-[1.05rem] w-[1.05rem]" /> : <Target className="h-[1.05rem] w-[1.05rem]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-[0.92rem] font-semibold leading-snug text-paper">{g.title}</h3>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold", PILL[tone])}>
                {g.status === "Active" ? healthLabel(p.health) : g.status}
              </span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-paper/55">
              <span>{goalCategory(g)}</span>
              <span aria-hidden>·</span>
              <span>{g.horizon}</span>
              {g.deadline && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" aria-hidden /> {formatDate(g.deadline)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.74rem]">
            <span className="tabular font-semibold text-paper">{figure}</span>
            {p.pct != null && <span className="tabular text-paper/55">{Math.round(p.pct)}%</span>}
          </div>
          <Progress value={p.pct ?? 0} tone={tone} label={`${g.title} progress`} valueText={figure} />
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={open ? "outline" : "ghost"}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
          >
            Update progress
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
          <button
            type="button"
            aria-pressed={linked}
            disabled={!canLink && !linked}
            onClick={() => onLink(!linked)}
            title={canLink || linked ? "Link this day's journal entry to the goal" : "Write the Day Update first to link this day"}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              linked ? "border-accent/40 bg-accent/[0.12] text-accent" : "border-line text-paper/65 hover:border-paper/25 hover:text-paper",
            )}
          >
            {linked ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
            Worked on this
          </button>
          {pending ? (
            <span className="text-[0.7rem] font-semibold text-accent">Unsaved</span>
          ) : (
            goalUpdatedOn(g, date) && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-positive">
                <Check className="h-3 w-3" aria-hidden /> Updated
              </span>
            )
          )}
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              key="panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-4 border-t border-line pt-4">
                {!p.tracked && (
                  <div>
                    <p className="mb-1.5 text-[0.76rem] font-semibold text-paper/75">New total</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="One less"
                          onClick={() => set({ value: String(Math.max(0, round((typed ?? reading.value) - 1, 2))) })}
                          className="grid h-10 w-10 place-items-center rounded-xl border border-line text-paper/70 hover:text-paper"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={value}
                          onChange={(e) => set({ value: e.target.value })}
                          aria-label={`New total for ${g.title}`}
                          aria-invalid={typed === null}
                          className="w-28 text-center"
                        />
                        <button
                          type="button"
                          aria-label="One more"
                          onClick={() => set({ value: String(round((typed ?? reading.value) + 1, 2)) })}
                          className="grid h-10 w-10 place-items-center rounded-xl border border-line text-paper/70 hover:text-paper"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-[0.8rem] text-paper/55">{p.target != null ? `of ${p.target} ${unit}` : unit}</span>
                    </div>
                    <p className={cn("mt-1 text-[0.7rem]", typed === null ? "text-danger" : "text-paper/50")}>
                      {typed === null
                        ? "Enter a number of zero or more."
                        : reading.onDay
                          ? `${formatDate(date)} already has a reading of ${reading.value}. Saving replaces it.`
                          : "One reading is kept per day."}
                    </p>
                  </div>
                )}

                {p.tracked && !isMilestones && (
                  <p className="rounded-xl bg-paper/[0.04] px-3.5 py-2.5 text-[0.76rem] leading-relaxed text-paper/65">
                    This goal counts itself from {p.metric.source}. Record the day in Day Update or Life and it moves on its own.
                  </p>
                )}

                {milestones.length > 0 && (
                  <fieldset>
                    <legend className="mb-1.5 text-[0.76rem] font-semibold text-paper/75">Milestones</legend>
                    <ul className="space-y-1">
                      {milestones.map((m) => {
                        const want = draft?.milestones?.[m.id] ?? Boolean(m.doneOn);
                        return (
                          <li key={m.id}>
                            <label className="flex min-h-[2.5rem] cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-paper/[0.04]">
                              <input
                                type="checkbox"
                                checked={want}
                                onChange={(e) => set({ milestones: { ...draft?.milestones, [m.id]: e.target.checked } })}
                                className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                              />
                              <span className={cn("min-w-0 flex-1 text-[0.82rem]", want ? "text-paper/60 line-through" : "text-paper")}>{m.title}</span>
                              {m.doneOn && want && <span className="shrink-0 text-[0.68rem] text-paper/45">{formatDate(m.doneOn)}</span>}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                )}

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <Input
                    value={draft?.note ?? ""}
                    onChange={(e) => set({ note: e.target.value })}
                    placeholder={p.tracked ? "A note for today (optional)" : "What moved it? (optional)"}
                    aria-label={`Note for ${g.title}`}
                    maxLength={200}
                  />
                  <Select value={status} onChange={(e) => set({ status: e.target.value as GoalStatus })} aria-label={`Status of ${g.title}`}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
                {p.readyToComplete && status === "Active" && (
                  <button
                    type="button"
                    onClick={() => set({ status: "Completed" })}
                    className="inline-flex items-center gap-1.5 text-[0.76rem] font-semibold text-positive hover:underline"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden /> Target reached. Mark it completed?
                  </button>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/goals?goal=${encodeURIComponent(g.id)}`} className="inline-flex items-center gap-1 text-[0.74rem] font-semibold text-paper/60 hover:text-paper">
                    Open on Goals <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                  {draft && (
                    <button
                      type="button"
                      onClick={() => onDraft(g.id, null)}
                      className="inline-flex items-center gap-1 text-[0.74rem] font-semibold text-paper/60 hover:text-paper"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden /> Undo changes
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <p className="mt-3 text-[0.74rem] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
});
