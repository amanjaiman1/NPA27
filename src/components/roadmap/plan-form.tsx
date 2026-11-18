"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ISODate, PlanLevel, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  LEVEL_LABEL,
  LIMITS,
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addDays,
  blankPlan,
  carryable,
  formatSpan,
  isISODate,
  monthEnd,
  monthKeyOf,
  monthStart,
  monthsBetween,
  outsidePlan,
  overlapDays,
  overlappingWeeks,
  parentCandidates,
  periodLabel,
  planName,
  suggestedParent,
  unplannedMonths,
  validatePlan,
  weekEnd,
  weekHomeMonth,
  weekSlots,
  weekStartOf,
  yearRange,
} from "@/lib/roadmap";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { cn, fromISODate } from "@/lib/utils";
import { GoalPicker } from "./goal-picker";
import { LEVEL_ICON, useToday, useWeekStart } from "./shared";

/** What to open the form for. Without `plan` it creates one. */
export interface PlanFormRequest {
  plan?: RoadmapPlan;
  level?: PlanLevel;
  /** Show the Year / Month / Week choice first. */
  chooseLevel?: boolean;
  year?: number;
  month?: string;
  start?: ISODate;
  /** A parent to start with; `null` means on its own. */
  parentId?: string | null;
  /** Opened from a week's review: offer its unfinished activities, ticked. */
  carryFrom?: string;
}

const LEVEL_HINT: Record<PlanLevel, string> = {
  year: "Your strategy for the year: its focus, objectives and milestones.",
  month: "A month's focus and milestones, broken into weeks if you like.",
  week: "What you'll actually do this week, activity by activity.",
};

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="mt-1 text-[0.72rem] text-danger" role="alert">
      {children}
    </p>
  );
}

function draftFor(req: PlanFormRequest, plans: RoadmapPlan[], level: PlanLevel, today: ISODate, weekStart: number): RoadmapPlan {
  if (req.plan) {
    return { ...req.plan, objectives: req.plan.objectives ? [...req.plan.objectives] : undefined, goalIds: req.plan.goalIds ? [...req.plan.goalIds] : undefined };
  }
  const plan = blankPlan(level, {
    year: req.year ?? Number(today.slice(0, 4)),
    month: req.month ?? monthKeyOf(today),
    start: req.start ?? weekStartOf(today, weekStart),
  });
  const parent = req.parentId === null ? undefined : req.parentId ?? suggestedParent(plans, plan);
  if (parent) plan.parentId = parent;
  return plan;
}

/**
 * Creating or editing a plan. Only the period is needed; every other field
 * can wait. Activities and milestones are added on the plan itself, so the
 * form stays short.
 */
export function PlanForm({
  request,
  onClose,
  onSaved,
}: {
  request: PlanFormRequest | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const goals = useChronicle((s) => s.goals);
  const savePlan = useChronicle((s) => s.savePlan);
  const addPlans = useChronicle((s) => s.addPlans);
  const setPlanParent = useChronicle((s) => s.setPlanParent);
  const carryForward = useChronicle((s) => s.carryForward);
  const today = useToday();
  const weekStart = useWeekStart();
  const open = request !== null;
  const isNew = !request?.plan;

  const [draft, setDraft] = useState<RoadmapPlan>(() => blankPlan("week", { start: today }));
  const [parentTouched, setParentTouched] = useState(false);
  const [customDates, setCustomDates] = useState(false);
  const [touched, setTouched] = useState(false);
  const [alsoChildren, setAlsoChildren] = useState(false);
  const [adopt, setAdopt] = useState(true);
  const [carry, setCarry] = useState(false);

  useEffect(() => {
    if (!request) return;
    const level = request.plan?.level ?? request.level ?? "week";
    const d = draftFor(request, plans, level, today, weekStart);
    setDraft(d);
    setParentTouched(Boolean(request.plan) || request.parentId !== undefined);
    setCustomDates(d.level === "year" && !(d.start === `${d.year}-01-01` && d.end === `${d.year}-12-31`));
    setTouched(false);
    setAlsoChildren(false);
    setAdopt(true);
    setCarry(Boolean(request.carryFrom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  /** Applies a new period, re-suggesting the parent until one is picked by hand. */
  function setPeriod(next: RoadmapPlan) {
    if (isNew && !parentTouched) {
      const parent = suggestedParent(plans, next);
      if (parent) next.parentId = parent;
      else delete next.parentId;
    }
    setDraft(next);
  }

  function changeLevel(level: PlanLevel) {
    const fresh = blankPlan(level, {
      year: draft.year ?? Number(draft.start.slice(0, 4)),
      month: monthKeyOf(draft.start),
      start: level === "week" ? weekStartOf(draft.level === "week" ? draft.start : today, weekStart) : draft.start,
    });
    setCustomDates(false);
    setParentTouched(false);
    setAlsoChildren(false);
    const parent = suggestedParent(plans, fresh);
    if (parent) fresh.parentId = parent;
    setDraft({ ...fresh, title: draft.title, focus: draft.focus, objectives: draft.objectives, outcomes: draft.outcomes, notes: draft.notes, goalIds: draft.goalIds });
  }

  const patch = (p: Partial<RoadmapPlan>) => setDraft((d) => ({ ...d, ...p }));
  const errors = open ? validatePlan(draft, plans) : {};
  const valid = Object.keys(errors).length === 0;
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const candidates = useMemo(() => parentCandidates(plans, draft), [plans, draft]);

  /* What else the form can do for a new plan. A year brings in monthly plans
     that stand on their own inside it; a month, weekly plans that mostly fall
     in it. Weeks already inside a month stay there. */
  const independents = useMemo(() => {
    if (!isNew || draft.level === "week") return [];
    return plans.filter((p) => {
      if (p.parentId || p.archivedAt) return false;
      if (draft.level === "year") return p.level === "month" && p.start >= draft.start && p.end <= draft.end;
      return p.level === "week" && weekHomeMonth(p.start) === monthKeyOf(draft.start);
    });
  }, [isNew, plans, draft]);
  const missingChildren = useMemo(() => {
    if (!isNew) return 0;
    if (draft.level === "year") return unplannedMonths(plans, draft.start, draft.end).length;
    if (draft.level === "month") {
      const key = monthKeyOf(draft.start);
      return weekSlots(plans, key, weekStart).filter((s) => s.home === key && !s.plan).length;
    }
    return 0;
  }, [isNew, plans, draft, weekStart]);
  const previousWeek = useMemo(() => {
    if (!isNew || draft.level !== "week") return undefined;
    if (request?.carryFrom) return plans.find((p) => p.id === request.carryFrom);
    return plans
      .filter((p) => p.level === "week" && p.start < draft.start && !p.archivedAt)
      .sort((a, b) => b.start.localeCompare(a.start))[0];
  }, [isNew, plans, draft, request]);
  const carryList = previousWeek ? carryable(plans, previousWeek) : [];

  /* Edits that leave things outside the new dates are allowed, and said. */
  const strays = useMemo(() => {
    if (isNew) return { children: 0, items: 0 };
    const children = plans.filter((p) => p.parentId === draft.id && overlapDays(p.start, p.end, draft.start, draft.end) === 0).length;
    const items = (draft.items ?? []).filter((it) => outsidePlan(it, draft)).length;
    return { children, items };
  }, [isNew, plans, draft]);
  const overlaps = draft.level === "week" ? overlappingWeeks(plans, draft) : [];

  function save() {
    setTouched(true);
    if (!valid) return;
    const clean: RoadmapPlan = {
      ...draft,
      objectives: (draft.objectives ?? []).map((o) => o.trim()).filter(Boolean),
      goalIds: [...new Set(draft.goalIds ?? [])].sort(),
    };
    if (!savePlan(clean)) {
      setTouched(true);
      return;
    }
    if (isNew) {
      if (independents.length && adopt) setPlanParent(independents.map((p) => p.id), clean.id);
      if (alsoChildren && clean.level === "year") {
        addPlans(
          monthsBetween(clean.start, clean.end).map((month) => ({ ...blankPlan("month", { month }), parentId: clean.id })),
        );
      }
      if (alsoChildren && clean.level === "month") {
        const key = monthKeyOf(clean.start);
        addPlans(
          weekSlots(useChronicle.getState().plans, key, weekStart)
            .filter((s) => s.home === key && !s.plan)
            .map((s) => ({ ...blankPlan("week", { start: s.start }), parentId: clean.id })),
        );
      }
      if (carry && previousWeek && carryList.length) {
        carryForward(previousWeek.id, carryList.map((i) => i.id), clean.id);
      }
    }
    onSaved(clean.id);
  }

  const thisYear = Number(today.slice(0, 4));
  const years = useMemo(() => {
    const list = new Set<number>();
    for (let y = thisYear - 2; y <= thisYear + 6; y++) list.add(y);
    if (draft.year) list.add(draft.year);
    list.add(Number(draft.start.slice(0, 4)));
    return [...list].sort((a, b) => a - b);
  }, [thisYear, draft.year, draft.start]);
  const Icon = LEVEL_ICON[draft.level];
  const objectives = draft.objectives ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? (request?.chooseLevel ? "Create a plan" : `New ${LEVEL_LABEL[draft.level].toLowerCase()}`) : `Edit ${planName(draft)}`}
      description={isNew ? "Only the period is needed. Everything else can wait." : "Changes keep this plan's activities, milestones and history."}
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
          <Button onClick={save}>{isNew ? "Create plan" : "Save changes"}</Button>
        </>
      }
    >
      <div className="space-y-6">
        {isNew && request?.chooseLevel && (
          <fieldset>
            <legend className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/70">What are you planning?</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Planning level">
              {(["year", "month", "week"] as const).map((lv) => {
                const LvIcon = LEVEL_ICON[lv];
                const on = draft.level === lv;
                return (
                  <button
                    key={lv}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => changeLevel(lv)}
                    className={cn(
                      "flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-colors",
                      on ? "border-accent bg-accent/10 ring-1 ring-accent/40" : "border-line hover:border-paper/30",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-paper">
                      <LvIcon className="h-4 w-4 text-accent" /> {lv === "year" ? "A year" : lv === "month" ? "A month" : "A week"}
                    </span>
                    <span className="text-[0.7rem] leading-snug text-paper/60">{LEVEL_HINT[lv]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-semibold tracking-snugg text-paper/80">
            <Icon className="h-4 w-4 text-accent" /> When
          </legend>

          {draft.level === "year" && (
            <div className="space-y-3">
              <Field label="Year">
                <Select
                  value={String(draft.year ?? thisYear)}
                  onChange={(e) => {
                    const year = Number(e.target.value);
                    const range = customDates ? { start: draft.start, end: draft.end } : yearRange(year);
                    setPeriod({ ...draft, year, ...range });
                  }}
                  aria-invalid={Boolean(show("year") || show("period"))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-[0.78rem] text-paper/75">
                <input
                  type="checkbox"
                  checked={customDates}
                  onChange={(e) => {
                    setCustomDates(e.target.checked);
                    if (!e.target.checked) setPeriod({ ...draft, ...yearRange(draft.year ?? thisYear) });
                  }}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                My year doesn&apos;t run January to December
              </label>
              {customDates && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Starts">
                    <Input
                      type="date"
                      value={draft.start}
                      onChange={(e) => isISODate(e.target.value) && setPeriod({ ...draft, start: e.target.value })}
                    />
                  </Field>
                  <Field label="Ends">
                    <Input
                      type="date"
                      value={draft.end}
                      onChange={(e) => isISODate(e.target.value) && setPeriod({ ...draft, end: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              <FieldError>{show("year") ?? show("dates")}</FieldError>
            </div>
          )}

          {draft.level === "month" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Month">
                <Select
                  value={draft.start.slice(5, 7)}
                  onChange={(e) => {
                    const key = `${draft.start.slice(0, 4)}-${e.target.value}`;
                    setPeriod({ ...draft, start: monthStart(key), end: monthEnd(key) });
                  }}
                  aria-invalid={Boolean(show("period"))}
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, "0")}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Year">
                <Select
                  value={draft.start.slice(0, 4)}
                  onChange={(e) => {
                    const key = `${e.target.value}-${draft.start.slice(5, 7)}`;
                    setPeriod({ ...draft, start: monthStart(key), end: monthEnd(key) });
                  }}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {draft.level === "week" && (
            <div className="space-y-2">
              <Field label="First day of the week">
                <Input
                  type="date"
                  value={draft.start}
                  onChange={(e) => isISODate(e.target.value) && setPeriod({ ...draft, start: e.target.value, end: weekEnd(e.target.value) })}
                  aria-invalid={Boolean(show("period"))}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: "This week", start: weekStartOf(today, weekStart) },
                  { label: "Next week", start: addDays(weekStartOf(today, weekStart), 7) },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setPeriod({ ...draft, start: o.start, end: weekEnd(o.start) })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[0.72rem] font-semibold transition-colors",
                      draft.start === o.start ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-paper/65 hover:text-paper",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
                <span className="ml-1 text-[0.72rem] text-paper/60">
                  Runs {formatSpan(draft.start, draft.end)}
                  {fromISODate(draft.start).getDay() !== weekStart && ` · starts on a ${WEEKDAY_NAMES[fromISODate(draft.start).getDay()]}`}
                </span>
              </div>
              {overlaps.length > 0 && !show("period") && (
                <p className="text-[0.72rem] text-warning">
                  Overlaps {overlaps.map((w) => planName(w)).join(", ")}. That&apos;s allowed; each keeps its own activities.
                </p>
              )}
            </div>
          )}
          <FieldError>{show("period")}</FieldError>

          {draft.level !== "year" && (
            <div>
              <Field
                label="Part of"
                hint={
                  candidates.length
                    ? draft.level === "week"
                      ? "A month or year this week counts towards. Optional."
                      : "A year this month counts towards. Optional."
                    : `No ${draft.level === "week" ? "monthly or yearly" : "yearly"} plan covers these dates, so it stands on its own.`
                }
              >
                <Select
                  value={draft.parentId ?? ""}
                  onChange={(e) => {
                    setParentTouched(true);
                    patch({ parentId: e.target.value || undefined });
                  }}
                  aria-invalid={Boolean(show("parent"))}
                  disabled={!candidates.length && !draft.parentId}
                >
                  <option value="">On its own</option>
                  {draft.parentId && !candidates.some((c) => c.id === draft.parentId) && (
                    <option value={draft.parentId}>
                      {(() => {
                        const p = plans.find((x) => x.id === draft.parentId);
                        return p ? `${planName(p)} (outside these dates)` : "A plan that no longer exists";
                      })()}
                    </option>
                  )}
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {planName(c)}
                      {c.title?.trim() ? ` · ${periodLabel(c)}` : ""} ({c.level === "year" ? "yearly" : "monthly"} plan)
                    </option>
                  ))}
                </Select>
              </Field>
              <FieldError>{show("parent")}</FieldError>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-[0.78rem] font-semibold tracking-snugg text-paper/80">The plan</legend>
          <div>
            <Field label="Title" hint={`Optional. Without one it's called “${planName({ ...draft, title: undefined })}”.`}>
              <Input
                value={draft.title ?? ""}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder={draft.level === "year" ? "e.g. My UPSC preparation roadmap" : draft.level === "month" ? "e.g. Modern History and answer writing" : "e.g. Finish Sociology Unit 1"}
                maxLength={LIMITS.title}
                aria-invalid={Boolean(show("title"))}
              />
            </Field>
            <FieldError>{show("title")}</FieldError>
          </div>
          <Field label="Focus">
            <Textarea
              value={draft.focus ?? ""}
              onChange={(e) => patch({ focus: e.target.value })}
              placeholder={draft.level === "week" ? "What this week is mainly about" : "What matters most in this period"}
              maxLength={600}
              className="min-h-[64px]"
            />
          </Field>

          <div>
            <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">
              Objectives<span className="font-normal text-paper/50"> · the few things this period is for</span>
            </p>
            {objectives.length > 0 && (
              <ul className="mb-2 space-y-2">
                {objectives.map((o, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Input
                      value={o}
                      onChange={(e) => patch({ objectives: objectives.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder={`Objective ${i + 1}`}
                      aria-label={`Objective ${i + 1}`}
                      maxLength={200}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => patch({ objectives: objectives.filter((_, j) => j !== i) })}
                      aria-label={`Remove objective ${i + 1}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-paper/50 hover:bg-paper/[0.06] hover:text-paper"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {objectives.length < LIMITS.objectives && (
              <button
                type="button"
                onClick={() => patch({ objectives: [...objectives, ""] })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add an objective
              </button>
            )}
          </div>

          <Field label="Expected outcomes">
            <Textarea
              value={draft.outcomes ?? ""}
              onChange={(e) => patch({ outcomes: e.target.value })}
              placeholder="How you'll know it went well"
              maxLength={1000}
              className="min-h-[64px]"
            />
          </Field>
        </fieldset>

        <GoalPicker goals={goals} value={draft.goalIds ?? []} onChange={(ids) => patch({ goalIds: ids })} multiple />
        <p className="-mt-3 text-[0.7rem] text-paper/55">
          Linking shows the goal here. Its progress is still measured in Goals; finishing planned work doesn&apos;t change it.
        </p>

        <Field label="Notes">
          <Textarea
            value={draft.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Anything to remember about this period"
            maxLength={LIMITS.text}
            className="min-h-[64px]"
          />
        </Field>

        {isNew && (independents.length > 0 || missingChildren > 0 || carryList.length > 0) && (
          <fieldset className="space-y-2.5 rounded-2xl border border-line p-4">
            <legend className="px-1 text-[0.78rem] font-semibold tracking-snugg text-paper/80">Starting points</legend>
            {independents.length > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 text-[0.8rem] text-paper/80">
                <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
                <span>
                  Bring in the {independents.length} plan{independents.length === 1 ? "" : "s"} you already have for this {draft.level}
                  <span className="block text-[0.7rem] text-paper/55">{independents.map((p) => planName(p)).join(", ")}</span>
                </span>
              </label>
            )}
            {missingChildren > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 text-[0.8rem] text-paper/80">
                <input type="checkbox" checked={alsoChildren} onChange={(e) => setAlsoChildren(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
                <span>
                  {draft.level === "year"
                    ? `Also create an empty monthly plan for each of its ${missingChildren} unplanned month${missingChildren === 1 ? "" : "s"}`
                    : `Also create an empty weekly plan for each of its ${missingChildren} unplanned week${missingChildren === 1 ? "" : "s"}`}
                  <span className="block text-[0.7rem] text-paper/55">Blank, to fill in when you get there. You can skip this and add them one by one.</span>
                </span>
              </label>
            )}
            {carryList.length > 0 && previousWeek && (
              <label className="flex cursor-pointer items-start gap-2.5 text-[0.8rem] text-paper/80">
                <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
                <span>
                  Carry forward {carryList.length} unfinished activit{carryList.length === 1 ? "y" : "ies"} from {planName(previousWeek)}
                  <span className="block text-[0.7rem] text-paper/55">
                    They&apos;re copied here; the originals stay in that week, marked as carried forward.
                  </span>
                </span>
              </label>
            )}
          </fieldset>
        )}

        {!isNew && (strays.children > 0 || strays.items > 0) && (
          <p className="rounded-xl border border-warning/30 bg-warning/[0.06] px-3.5 py-2.5 text-[0.75rem] text-paper/80">
            {strays.children > 0 && `${strays.children} plan${strays.children === 1 ? "" : "s"} under this one would fall outside the new dates. `}
            {strays.items > 0 && `${strays.items} item${strays.items === 1 ? " has a date" : "s have dates"} outside the new period. `}
            Nothing is moved for you; they stay as they are and are marked.
          </p>
        )}

        {isNew && <p className="text-[0.72rem] text-paper/55">Add activities and milestones on the plan once it&apos;s created.</p>}
      </div>
    </Modal>
  );
}
