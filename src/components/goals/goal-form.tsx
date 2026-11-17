"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { Goal, GoalCategory, GoalHorizon, GoalMetric, GoalPriority } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  GOAL_CATEGORIES,
  GOAL_METRICS,
  GOAL_PRIORITIES,
  computeGoalProgress,
  metricDef,
  suggestedCategory,
  validateGoal,
  type GoalData,
} from "@/lib/goals";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { cn, formatDate, toISODate, uid } from "@/lib/utils";

const HORIZONS: GoalHorizon[] = ["Daily", "Weekly", "Monthly", "Quarterly", "Long-term"];

export function emptyGoal(): Goal {
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
    category: "Study",
    priority: "Medium",
  };
}

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="mt-1 text-[0.72rem] text-danger" role="alert">
      {children}
    </p>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-[0.78rem] font-semibold tracking-snugg text-paper/80">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Creating and editing a goal, in three short groups: what it is, how it's
 * measured, and when it's due. A live reading shows what the goal would say
 * today before it is saved, and problems are flagged next to the field that
 * causes them rather than after a click.
 */
export function GoalForm({
  open,
  initial,
  isNew,
  onClose,
  data,
}: {
  open: boolean;
  initial: Goal;
  isNew: boolean;
  onClose: () => void;
  data: GoalData;
}) {
  const subjects = useChronicle((s) => s.subjects);
  const upsertGoal = useChronicle((s) => s.upsertGoal);
  const logGoalProgress = useChronicle((s) => s.logGoalProgress);
  const [draft, setDraft] = useState<Goal>(initial);
  const [touched, setTouched] = useState(false);
  const today = toISODate(new Date());

  useEffect(() => {
    if (open) {
      setDraft({ ...initial, milestones: initial.milestones?.map((m) => ({ ...m })) });
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const metric = metricDef(draft.metric);
  const errors = validateGoal(draft, today, isNew);
  const valid = Object.keys(errors).length === 0;
  const preview = useMemo(() => (open ? computeGoalProgress(draft, data, today) : null), [open, draft, data, today]);

  function patch(p: Partial<Goal>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function save() {
    setTouched(true);
    if (!valid) return;
    const milestones = (draft.milestones ?? [])
      .map((m) => ({ ...m, title: m.title.trim() }))
      .filter((m) => m.title);
    const goal: Goal = {
      ...draft,
      title: draft.title.trim(),
      metricLabel: draft.metricLabel?.trim() || undefined,
      unit: draft.unit?.trim() || undefined,
      milestones: milestones.length ? milestones : undefined,
      target: metric.id === "milestones" ? milestones.length : draft.target,
    };
    if (!goal.milestones) delete goal.milestones;
    upsertGoal(goal);
    // A hand-tracked number typed here is a reading too: keep it in the history.
    if (metric.id === "manual" && (goal.current ?? 0) !== (initial.current ?? 0)) {
      logGoalProgress(goal.id, goal.current ?? 0);
    }
    onClose();
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? "New goal" : "Edit goal"}
      description={isNew ? "Name it, say what feeds it, and when it's due." : "Changes keep the goal's history and links."}
      className="sm:max-w-xl"
      footer={
        <>
          {touched && !valid && (
            <p className="mr-auto text-xs text-danger" role="alert">
              Fix the highlighted fields to save.
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{isNew ? "Add goal" : "Save changes"}</Button>
        </>
      }
    >
      <div className="space-y-7">
        <Group title="The goal">
          <div>
            <Field label="Name">
              <Input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                onBlur={() => setTouched(true)}
                placeholder="e.g. 45 hours of study this week"
                maxLength={140}
                aria-invalid={Boolean(show("title"))}
                className={cn(show("title") && "border-danger/60")}
              />
            </Field>
            <FieldError>{show("title")}</FieldError>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select value={draft.category ?? suggestedCategory(draft.metric)} onChange={(e) => patch({ category: e.target.value as GoalCategory })}>
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">Priority</p>
              <Segmented
                value={draft.priority ?? "Medium"}
                onChange={(v) => patch({ priority: v as GoalPriority })}
                options={GOAL_PRIORITIES.map((p) => ({ label: p, value: p }))}
              />
            </div>
          </div>
        </Group>

        <Group title="How it's measured">
          <Field label="What feeds it" hint={metric.hint}>
            <Select
              value={draft.metric ?? "manual"}
              onChange={(e) => {
                const next = e.target.value as GoalMetric;
                const def = metricDef(next);
                setDraft((d) => ({
                  ...d,
                  metric: next,
                  unit: !d.unit || d.unit === metricDef(d.metric).unit ? def.unit : d.unit,
                  // Follow the metric's natural category until one is chosen by hand.
                  category: !d.category || d.category === suggestedCategory(d.metric) ? suggestedCategory(next) : d.category,
                  milestones: next === "milestones" && !d.milestones?.length ? [{ id: uid("gm"), title: "" }] : d.milestones,
                }));
              }}
            >
              {GOAL_METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.id === "manual" || m.id === "milestones" ? "" : ` — from ${m.source}`}
                </option>
              ))}
            </Select>
          </Field>

          {metric.needsSubject && (
            <div>
              <Field label="Subject" hint="This measure is for one subject.">
                <Select
                  value={draft.linkedSubjectId ?? ""}
                  onChange={(e) => patch({ linkedSubjectId: e.target.value || undefined })}
                  aria-invalid={Boolean(show("subject"))}
                >
                  <option value="">Choose a subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <FieldError>{show("subject")}</FieldError>
            </div>
          )}

          {metric.id !== "milestones" ? (
            <div>
              <div className={cn("grid gap-4", metric.id === "manual" ? "grid-cols-3" : "grid-cols-2")}>
                <Field label="Target">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={draft.target ?? 0}
                    onChange={(e) => patch({ target: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                    aria-invalid={Boolean(show("target"))}
                  />
                </Field>
                <Field label="Unit">
                  <Input value={draft.unit ?? ""} onChange={(e) => patch({ unit: e.target.value })} placeholder={metric.unit || "e.g. chapters"} maxLength={20} />
                </Field>
                {metric.id === "manual" && (
                  <Field label="Done so far">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={draft.current ?? 0}
                      onChange={(e) => patch({ current: e.target.value === "" ? 0 : Math.max(0, parseFloat(e.target.value)) })}
                    />
                  </Field>
                )}
              </div>
              <FieldError>{show("target")}</FieldError>
              {draft.target === 0 && (
                <Field label="Describe it instead" hint="Shown when there's no number to hit." className="mt-4">
                  <Input value={draft.metricLabel ?? ""} onChange={(e) => patch({ metricLabel: e.target.value })} placeholder="e.g. Reach the interview stage" />
                </Field>
              )}
            </div>
          ) : (
            <MilestoneEditor goal={draft} onChange={(milestones) => patch({ milestones })} error={show("milestones")} />
          )}
        </Group>

        <Group title="When">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Horizon" hint="The window progress is measured over.">
              <Select value={draft.horizon} onChange={(e) => patch({ horizon: e.target.value as GoalHorizon })}>
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Field label="Target date" hint="Optional.">
                <Input
                  type="date"
                  value={draft.deadline ?? ""}
                  min={isNew ? today : undefined}
                  onChange={(e) => patch({ deadline: e.target.value || undefined })}
                  aria-invalid={Boolean(show("deadline"))}
                />
              </Field>
              <FieldError>{show("deadline")}</FieldError>
            </div>
          </div>
          {metric.id !== "milestones" && <MilestoneEditor goal={draft} onChange={(milestones) => patch({ milestones })} optional />}
        </Group>

        {preview && (
          <div
            className={cn(
              "rounded-xl border p-3.5",
              preview.problem ? "border-warning/30 bg-warning/[0.06]" : "border-accent/25 bg-accent/[0.05]",
            )}
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-paper/55">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Reading right now
            </p>
            {preview.problem ? (
              <p className="text-sm text-paper/75">{preview.problem}</p>
            ) : (
              <p className="text-sm text-paper/80">
                <span className="tabular font-semibold text-paper">
                  {preview.current ?? 0} {draft.unit || metric.unit}
                </span>
                {preview.target != null && <> of {preview.target} — {preview.pct}% of the way,</>} measured over{" "}
                {preview.window.label} ({formatDate(preview.window.start)} – {formatDate(preview.window.end)}).
                {preview.expectedPct != null && <> Even pace for today would be {preview.expectedPct}%.</>}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MilestoneEditor({
  goal,
  onChange,
  optional,
  error,
}: {
  goal: Goal;
  onChange: (m: Goal["milestones"]) => void;
  optional?: boolean;
  error?: string;
}) {
  const list = goal.milestones ?? [];
  return (
    <div>
      <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">
        Milestones{optional && <span className="font-normal text-paper/45"> · optional steps on the way</span>}
      </p>
      {list.length > 0 && (
        <ul className="mb-2 space-y-2">
          {list.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2">
              <Input
                value={m.title}
                onChange={(e) => onChange(list.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))}
                placeholder={`Step ${i + 1}`}
                aria-label={`Milestone ${i + 1}`}
                maxLength={120}
                className="flex-1"
              />
              <Input
                type="date"
                value={m.dueOn ?? ""}
                onChange={(e) => onChange(list.map((x) => (x.id === m.id ? { ...x, dueOn: e.target.value || undefined } : x)))}
                aria-label={`Milestone ${i + 1} due`}
                className="w-40 shrink-0"
              />
              <button
                type="button"
                onClick={() => onChange(list.filter((x) => x.id !== m.id))}
                aria-label={`Remove milestone ${i + 1}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-paper/45 hover:bg-paper/[0.06] hover:text-paper"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onChange([...list, { id: uid("gm"), title: "" }])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add a milestone
      </button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
