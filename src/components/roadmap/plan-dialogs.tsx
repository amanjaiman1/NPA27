"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { ISODate, PlanItem, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  MONTH_NAMES,
  blankPlan,
  childrenOf,
  descendantIds,
  formatSpan,
  isISODate,
  monthKeyOf,
  nextPeriodStart,
  periodLabel,
  planName,
  samePeriod,
  suggestedParent,
  weekEnd,
  type ChildPolicy,
} from "@/lib/roadmap";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "4 activities and 1 milestone". */
function itemsPhrase(items: PlanItem[]): string {
  const acts = items.filter((i) => i.kind === "activity").length;
  const miles = items.length - acts;
  return [acts && count(acts, "activity", "activities"), miles && count(miles, "milestone", "milestones")].filter(Boolean).join(" and ");
}

/** "2 monthly plans and 1 weekly plan". */
function plansPhrase(list: RoadmapPlan[]): string {
  const of = (level: RoadmapPlan["level"], noun: string) => {
    const n = list.filter((p) => p.level === level).length;
    return n ? count(n, `${noun} plan`, `${noun} plans`) : "";
  };
  return [of("month", "monthly"), of("week", "weekly")].filter(Boolean).join(" and ");
}

/**
 * Deleting a plan, with a clear choice about the plans under it. Goals and
 * journal days it linked to are never touched.
 */
export function DeletePlanDialog({
  plan,
  open,
  onClose,
  onDeleted,
}: {
  plan: RoadmapPlan;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const deletePlan = useChronicle((s) => s.deletePlan);
  const [policy, setPolicy] = useState<ChildPolicy>("keep");
  useEffect(() => {
    if (open) setPolicy("keep");
  }, [open]);

  const children = childrenOf(plans, plan.id);
  const under = useMemo(() => [...descendantIds(plans, plan.id)].map((id) => plans.find((p) => p.id === id)!).filter(Boolean), [plans, plan.id]);
  const deeper = under.filter((p) => p.parentId !== plan.id);
  const parent = plan.parentId ? plans.find((p) => p.id === plan.parentId) : undefined;
  const underItems = under.reduce((a, p) => a + (p.items?.length ?? 0), 0);
  const one = children.length === 1;
  const keepWhere =
    parent && plan.level === "month"
      ? `${one ? "It'll" : "They'll"} sit directly under ${planName(parent)}.`
      : `${one ? "It'll stand on its own" : "They'll stand on their own"}${deeper.length ? `, with the plans inside ${one ? "it" : "them"}` : ""}.`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete ${planName(plan)}?`}
      description={periodLabel(plan)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              deletePlan(plan.id, policy);
              onDeleted();
            }}
          >
            <Trash2 className="h-4 w-4" /> {policy === "delete" && under.length ? `Delete ${under.length + 1} plans` : "Delete plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-paper/80">
        <p>
          {plan.items?.length ? `Its ${itemsPhrase(plan.items)} go${plan.items.length === 1 ? "es" : ""} with it.` : "It has no activities or milestones."}{" "}
          Linked goals and journal days stay exactly as they are.
        </p>
        {children.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold text-paper">
              It contains {plansPhrase(children)}
              {deeper.length ? `, with ${plansPhrase(deeper)} inside ${children.length === 1 ? "it" : "them"}` : ""}. What should happen to{" "}
              {under.length === 1 ? "it" : "them"}?
            </legend>
            {(
              [
                { id: "keep", title: under.length === 1 ? "Keep it" : "Keep them", body: keepWhere },
                {
                  id: "delete",
                  title: under.length === 1 ? "Delete it too" : "Delete them too",
                  body: underItems
                    ? `${under.length === 1 ? "It goes" : `All ${under.length} go`} as well, with ${itemsPhrase(under.flatMap((p) => p.items ?? []))}.`
                    : `${under.length === 1 ? "It goes" : `All ${under.length} go`} as well. ${under.length === 1 ? "It has" : "They have"} no activities or milestones.`,
                },
              ] as const
            ).map((o) => (
              <label
                key={o.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
                  policy === o.id ? (o.id === "delete" ? "border-danger/40 bg-danger/[0.05]" : "border-accent/40 bg-accent/[0.06]") : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="child-policy"
                  checked={policy === o.id}
                  onChange={() => setPolicy(o.id)}
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span>
                  <span className="font-semibold text-paper">{o.title}</span>
                  <span className="block text-[0.75rem] text-paper/65">{o.body}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

/**
 * Copies a plan's content to another period: a fresh start with the same
 * structure. Every item gets a new id and starts as not started.
 */
export function DuplicatePlanDialog({
  plan,
  open,
  onClose,
  onDone,
}: {
  plan: RoadmapPlan;
  open: boolean;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const duplicatePlan = useChronicle((s) => s.duplicatePlan);
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState("");
  const [start, setStart] = useState<ISODate>("");
  const [parentId, setParentId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const next = nextPeriodStart(plan);
    setYear(Number(next.slice(0, 4)));
    setMonth(monthKeyOf(next));
    setStart(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const target = useMemo(() => {
    if (plan.level === "year") return blankPlan("year", { year: year || Number(plan.start.slice(0, 4)) + 1 });
    if (plan.level === "month") return blankPlan("month", { month: month || monthKeyOf(plan.start) });
    return blankPlan("week", { start: isISODate(start) ? start : plan.start });
  }, [plan, year, month, start]);
  const taken = samePeriod(plans, target);
  const suggested = useMemo(() => suggestedParent(plans, target), [plans, target]);
  useEffect(() => {
    setParentId(suggested ?? "");
  }, [suggested]);
  const suggestedPlan = suggested ? plans.find((p) => p.id === suggested) : undefined;
  const items = plan.items?.length ?? 0;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => thisYear - 2 + i);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Duplicate ${planName(plan)}`}
      description="A fresh copy for another period."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(taken)}
            onClick={() => {
              const id = duplicatePlan(plan.id, {
                year: plan.level === "year" ? target.year : undefined,
                month: plan.level === "month" ? monthKeyOf(target.start) : undefined,
                start: plan.level === "week" ? target.start : undefined,
                parentId: parentId || undefined,
              });
              if (id) onDone(id);
            }}
          >
            <Copy className="h-4 w-4" /> Duplicate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {plan.level === "year" && (
          <Field label="For the year">
            <Select value={String(target.year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {plan.level === "month" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month">
              <Select value={target.start.slice(5, 7)} onChange={(e) => setMonth(`${target.start.slice(0, 4)}-${e.target.value}`)}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <Select value={target.start.slice(0, 4)} onChange={(e) => setMonth(`${e.target.value}-${target.start.slice(5, 7)}`)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {plan.level === "week" && (
          <Field label="First day of the week" hint={isISODate(start) ? `Runs ${formatSpan(start, weekEnd(start))}` : undefined}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        )}
        {taken && (
          <p className="text-[0.75rem] text-danger" role="alert">
            {periodLabel(taken)} already has a plan ({planName(taken)}). Pick another period.
          </p>
        )}
        {plan.level !== "year" && (
          <Field label="Part of">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">On its own</option>
              {suggestedPlan && <option value={suggestedPlan.id}>{planName(suggestedPlan)}</option>}
            </Select>
          </Field>
        )}
        <p className="text-[0.75rem] leading-relaxed text-paper/65">
          Copied: the title, focus, objectives, outcomes, notes, linked goals
          {items ? ` and ${items} item${items === 1 ? "" : "s"}, each as not started with its date moved along` : ""}. Not copied: the review, journal
          links and any plans under it.
        </p>
      </div>
    </Modal>
  );
}
