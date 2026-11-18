"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, CornerDownRight, Link2, Trash2, Undo2, Unlink } from "lucide-react";
import type { PlanItem, PlanItemKind, PlanItemStatus, PlanPriority } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  CATEGORY_SUGGESTIONS,
  ITEM_STATUSES,
  LIMITS,
  PLAN_PRIORITIES,
  STATUS_LABEL,
  blankItem,
  findItem,
  formatDay,
  isArchived,
  isCarried,
  isISODate,
  outsidePlan,
  planName,
  validateItem,
} from "@/lib/roadmap";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, formatHours, toISODate } from "@/lib/utils";
import { formatClock, timeFormatOf } from "@/lib/sleep";
import { GoalPicker } from "./goal-picker";
import { useRoadmapNav } from "./shared";

export interface ItemFormRequest {
  planId: string;
  item?: PlanItem;
  kind?: PlanItemKind;
}

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="mt-1 text-[0.72rem] text-danger" role="alert">
      {children}
    </p>
  );
}

/**
 * Everything about one activity or milestone. Linking a goal or a journal
 * day only points at it: the goal's progress and the journal entry stay as
 * they are, and an activity is only ever completed by you.
 */
export function ItemForm({ request, onClose }: { request: ItemFormRequest | null; onClose: () => void }) {
  const plans = useChronicle((s) => s.plans);
  const goals = useChronicle((s) => s.goals);
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const clock = timeFormatOf(useChronicle((s) => s.profile));
  const savePlanItem = useChronicle((s) => s.savePlanItem);
  const deletePlanItem = useChronicle((s) => s.deletePlanItem);
  const undoCarryForward = useChronicle((s) => s.undoCarryForward);
  const confirm = useConfirm();
  const nav = useRoadmapNav();
  const plan = request ? plans.find((p) => p.id === request.planId) : undefined;
  const isNew = !request?.item;
  // An archived plan is kept as history: its items open to be read, not changed.
  const readOnly = Boolean(plan && !isNew && isArchived(plans, plan));
  const [draft, setDraft] = useState<PlanItem>(() => blankItem("activity", ""));
  const [touched, setTouched] = useState(false);
  const [pickDay, setPickDay] = useState("");
  const [undoNote, setUndoNote] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setDraft(request.item ? { ...request.item, journalDates: request.item.journalDates ? [...request.item.journalDates] : undefined } : blankItem(request.kind ?? "activity", ""));
    setTouched(false);
    setPickDay("");
    setUndoNote(null);
  }, [request]);

  const patch = (p: Partial<PlanItem>) => setDraft((d) => ({ ...d, ...p }));
  const errors = validateItem(draft);
  const valid = Object.keys(errors).length === 0;
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const goal = goals.find((g) => g.id === draft.goalId);
  const isMilestone = draft.kind === "milestone";
  const carriedOn = plan ? isCarried(plans, draft) : false;
  const from = findItem(plans, draft.carriedFrom);
  const to = findItem(plans, draft.carriedTo);

  const byDate = useMemo(() => new Map(journal.map((e) => [e.date, e] as const)), [journal]);
  const dayOptions = useMemo(() => {
    if (!plan) return [];
    const linked = new Set(draft.journalDates ?? []);
    const entries = [...journal].filter((e) => !linked.has(e.date)).sort((a, b) => b.date.localeCompare(a.date));
    const inside = entries.filter((e) => e.date >= plan.start && e.date <= plan.end);
    const rest = entries.filter((e) => e.date < plan.start || e.date > plan.end).slice(0, 90);
    return [...inside, ...rest];
  }, [journal, plan, draft.journalDates]);

  if (!request || !plan) return null;

  function save() {
    setTouched(true);
    if (!valid || !plan) return;
    savePlanItem(plan.id, { ...draft, title: draft.title.trim() });
    onClose();
  }

  async function remove() {
    if (!plan || !request?.item) return;
    const ok = await confirm({
      title: isMilestone ? "Delete this milestone?" : "Delete this activity?",
      description: `“${draft.title}” will be removed from ${planName(plan)}. Linked goals and journal days are not changed.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    deletePlanItem(plan.id, request.item.id);
    onClose();
  }

  function setDone(done: boolean) {
    patch({ status: done ? "completed" : "notStarted" });
  }

  const statusLocked = carriedOn;
  // "17 Nov 2026 at 9:00 AM", on the clock this person chose.
  const completedOn = (ts: string) => {
    const at = new Date(ts);
    if (Number.isNaN(at.getTime())) return null;
    const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    return `${formatDay(toISODate(at))} at ${formatClock(hhmm, clock)}`;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? (isMilestone ? "New milestone" : "New activity") : isMilestone ? "Milestone" : "Activity"}
      description={readOnly ? `In ${planName(plan)}, which is archived. Restore it to make changes.` : `In ${planName(plan)}`}
      className="sm:max-w-xl"
      footer={
        readOnly ? (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            {!isNew && (
              <Button variant="danger" onClick={() => void remove()} className="mr-auto">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>{isNew ? "Add" : "Save"}</Button>
          </>
        )
      }
    >
      {/* A disabled fieldset turns every control in it off at once; links still work. */}
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <div>
          <Field label={isMilestone ? "Milestone" : "Activity"}>
            <Input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={isMilestone ? "e.g. Finish Sociology Unit 1" : "e.g. Read three Modern History chapters"}
              maxLength={LIMITS.itemTitle}
              aria-invalid={Boolean(show("title"))}
              autoFocus={isNew}
            />
          </Field>
          <FieldError>{show("title")}</FieldError>
        </div>

        {(from || to || draft.carriedFrom || draft.carriedTo) && (
          <div className="space-y-1.5 rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-[0.76rem] text-paper/75">
            {draft.carriedFrom && (
              <p className="flex items-center gap-1.5">
                <CornerDownRight className="h-3.5 w-3.5 text-paper/50" />
                {from ? (
                  <>
                    Carried from{" "}
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { onClose(); nav({ plan: from.plan.id, item: from.item.id }); }}>
                      {planName(from.plan)}
                    </button>
                  </>
                ) : (
                  "Carried from an earlier plan that has since been deleted."
                )}
              </p>
            )}
            {draft.carriedTo && to && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <CornerDownRight className="h-3.5 w-3.5 text-paper/50" />
                  Carried forward to{" "}
                  <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { onClose(); nav({ plan: to.plan.id, item: to.item.id }); }}>
                    {planName(to.plan)}
                  </button>
                </span>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    const res = undoCarryForward(plan.id, draft.id);
                    if (res.ok) onClose();
                    else setUndoNote(res.reason ?? "Couldn't take it back.");
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Bring it back here
                </Button>
              </div>
            )}
            {undoNote && <p className="text-[0.72rem] text-warning">{undoNote}</p>}
          </div>
        )}

        <Field label="Description">
          <Textarea
            value={draft.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Optional detail: chapters, sources, how much"
            maxLength={1000}
            className="min-h-[64px]"
          />
        </Field>

        {isMilestone ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due" hint={`This ${plan.level} runs ${formatDay(plan.start)} to ${formatDay(plan.end)}.`}>
              <Input
                type="date"
                value={draft.targetDate ?? ""}
                onChange={(e) => patch({ targetDate: isISODate(e.target.value) ? e.target.value : undefined })}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 self-end rounded-xl border border-line px-3.5 py-2.5 text-sm text-paper/80">
              <input
                type="checkbox"
                checked={draft.status === "completed"}
                onChange={(e) => setDone(e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              Reached
            </label>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">Priority</p>
                <Segmented
                  value={draft.priority ?? "Medium"}
                  onChange={(v) => patch({ priority: v as PlanPriority })}
                  options={PLAN_PRIORITIES.map((p) => ({ label: p, value: p }))}
                />
              </div>
              <Field label="Status" hint={statusLocked ? "Carried forward. Bring it back here to change it." : undefined}>
                <Select
                  value={draft.status}
                  onChange={(e) => patch({ status: e.target.value as PlanItemStatus })}
                  disabled={statusLocked}
                >
                  {ITEM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target date" hint={`Optional. This ${plan.level} runs ${formatDay(plan.start)} to ${formatDay(plan.end)}.`}>
                <Input
                  type="date"
                  value={draft.targetDate ?? ""}
                  onChange={(e) => patch({ targetDate: isISODate(e.target.value) ? e.target.value : undefined })}
                  aria-invalid={Boolean(show("targetDate"))}
                />
              </Field>
              <Field label="Subject">
                <Select value={draft.subjectId ?? ""} onChange={(e) => patch({ subjectId: e.target.value || undefined })}>
                  <option value="">None</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Category" hint="Optional label, such as Reading or Answer writing.">
              <Input
                value={draft.category ?? ""}
                onChange={(e) => patch({ category: e.target.value || undefined })}
                list="roadmap-categories"
                maxLength={40}
                placeholder="e.g. Lectures"
              />
            </Field>
            <datalist id="roadmap-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
        {outsidePlan(draft, plan) && (
          <p className="-mt-2 text-[0.72rem] text-warning">This date is outside {planName(plan)}. That&apos;s allowed; it&apos;s marked on the plan.</p>
        )}
        {draft.completedAt && draft.status === "completed" && completedOn(draft.completedAt) && (
          <p className="-mt-2 text-[0.72rem] text-paper/60">Completed {completedOn(draft.completedAt)}</p>
        )}

        <div className="space-y-3">
          <GoalPicker
            goals={goals}
            value={draft.goalId ? [draft.goalId] : []}
            onChange={(ids) => {
              const next = { ...draft };
              if (ids[0]) next.goalId = ids[0];
              else delete next.goalId;
              if (ids[0] !== draft.goalId) delete next.goalMilestoneId;
              setDraft(next);
            }}
            label="Goal it serves"
          />
          {goal && (goal.milestones?.length ?? 0) > 0 && (
            <div>
              <Field label="One of its milestones" hint="Optional. Shown here for reference; it's still ticked off in Goals.">
                <Select value={draft.goalMilestoneId ?? ""} onChange={(e) => patch({ goalMilestoneId: e.target.value || undefined })}>
                  <option value="">None</option>
                  {goal.milestones!.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                      {m.doneOn ? " (done)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <FieldError>{show("goalMilestone")}</FieldError>
            </div>
          )}
          {goal && (
            <Link href={`/goals?goal=${encodeURIComponent(goal.id)}`} className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent hover:underline">
              Open “{goal.title}” in Goals <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {!isMilestone && (
          <div>
            <p className="mb-1 text-[0.78rem] font-semibold tracking-snugg text-paper/70">Journal days</p>
            <p className="mb-2 text-[0.7rem] text-paper/55">
              Link the days you recorded this work. Linking doesn&apos;t mark it done, and unlinking deletes nothing.
            </p>
            {(draft.journalDates ?? []).length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {(draft.journalDates ?? []).map((d) => {
                  const e = byDate.get(d);
                  return (
                    <li key={d} className="flex items-center gap-3 rounded-xl border border-line bg-paper/[0.02] px-3 py-2">
                      <BookOpen className="h-4 w-4 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        {e ? (
                          <Link href={`/journal/${d}`} className="text-sm font-medium text-paper hover:text-accent hover:underline">
                            {formatDay(d)}
                          </Link>
                        ) : (
                          <p className="text-sm text-paper/60">{formatDay(d)}</p>
                        )}
                        <p className="truncate text-[0.68rem] text-paper/55">
                          {e ? (e.totalHours > 0 ? `${formatHours(e.totalHours)} studied` : "No study hours") : "This journal day no longer exists."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const left = (draft.journalDates ?? []).filter((x) => x !== d);
                          const next = { ...draft };
                          if (left.length) next.journalDates = left;
                          else delete next.journalDates;
                          setDraft(next);
                        }}
                        aria-label={`Unlink ${formatDay(d)}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-paper/55 hover:bg-paper/[0.06] hover:text-paper"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {dayOptions.length > 0 ? (
              <div className="flex gap-2">
                <Select value={pickDay} onChange={(e) => setPickDay(e.target.value)} aria-label="Journal day to link" className="flex-1">
                  <option value="">Link a journal day…</option>
                  {dayOptions.map((e) => (
                    <option key={e.date} value={e.date}>
                      {formatDay(e.date)}
                      {e.date >= plan.start && e.date <= plan.end ? ` · in this ${plan.level}` : ""}
                      {e.totalHours > 0 ? ` · ${formatHours(e.totalHours)}` : ""}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  disabled={!pickDay}
                  onClick={() => {
                    patch({ journalDates: [...new Set([...(draft.journalDates ?? []), pickDay])].sort() });
                    setPickDay("");
                  }}
                >
                  <Link2 className="h-4 w-4" /> Link
                </Button>
              </div>
            ) : (
              <p className={cn("text-[0.72rem] text-paper/55")}>No journal days to link yet.</p>
            )}
          </div>
        )}

        <Field label="Notes">
          <Textarea
            value={draft.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Anything to remember"
            maxLength={LIMITS.text}
            className="min-h-[64px]"
          />
        </Field>
      </fieldset>
    </Modal>
  );
}

