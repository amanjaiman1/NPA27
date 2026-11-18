"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Forward } from "lucide-react";
import type { ISODate, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { activitiesOf, carryable, formatDay, isCarried, nextPlanOf, planName, timingOf } from "@/lib/roadmap";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { cn, toISODate } from "@/lib/utils";
import { Block, useRoadmapNav } from "./shared";

function TitleList({ titles, empty }: { titles: string[]; empty: string }) {
  if (!titles.length) return <p className="text-[0.75rem] text-paper/55">{empty}</p>;
  const shown = titles.slice(0, 6);
  return (
    <ul className="space-y-1">
      {shown.map((t, i) => (
        <li key={i} className="line-clamp-2 text-[0.8rem] leading-snug text-paper/80" title={t}>
          {t}
        </li>
      ))}
      {titles.length > shown.length && <li className="text-[0.72rem] text-paper/55">and {titles.length - shown.length} more</li>}
    </ul>
  );
}

/**
 * Looking back. What was done and what wasn't is read from the activities;
 * the rest is yours to write. Carrying forward and planning the next period
 * are one step from here, and nothing is changed until you choose.
 */
export function PlanReviewBlock({
  plan,
  today,
  onCarry,
  onPlanNext,
}: {
  plan: RoadmapPlan;
  today: ISODate;
  onCarry: () => void;
  onPlanNext: () => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const savePlanReview = useChronicle((s) => s.savePlanReview);
  const nav = useRoadmapNav();
  const [wentWell, setWentWell] = useState("");
  const [improve, setImprove] = useState("");
  const [nextPriorities, setNextPriorities] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWentWell(plan.review?.wentWell ?? "");
    setImprove(plan.review?.improve ?? "");
    setNextPriorities(plan.review?.nextPriorities ?? "");
    setSaved(false);
  }, [plan.id, plan.review?.wentWell, plan.review?.improve, plan.review?.nextPriorities]);

  const acts = activitiesOf(plan);
  const done = acts.filter((i) => i.status === "completed").map((i) => i.title);
  const open = carryable(plans, plan).map((i) => i.title);
  const carried = acts.filter((i) => isCarried(plans, i)).map((i) => i.title);
  const timing = timingOf(plan, today);
  const next = nextPlanOf(plans, plan);
  const dirty =
    wentWell !== (plan.review?.wentWell ?? "") || improve !== (plan.review?.improve ?? "") || nextPriorities !== (plan.review?.nextPriorities ?? "");
  const nextNoun = plan.level === "week" ? "week" : plan.level === "month" ? "month" : "year";
  const reviewsHref = "/reviews";
  const when = useMemo(() => {
    const at = plan.review?.reviewedAt ? new Date(plan.review.reviewedAt) : null;
    return at && !Number.isNaN(at.getTime()) ? formatDay(toISODate(at)) : null;
  }, [plan.review?.reviewedAt]);

  return (
    <Block
      id={`review-${plan.id}`}
      title={`${nextNoun === "week" ? "Weekly" : nextNoun === "month" ? "Monthly" : "Yearly"} review`}
      hint={
        timing.state === "ended"
          ? `This ${plan.level} has ended. What happened, and what comes next?`
          : timing.state === "current"
            ? `Write it on the last day, or whenever you're ready. ${timing.daysLeft} day${timing.daysLeft === 1 ? "" : "s"} left.`
            : `This ${plan.level} hasn't started yet.`
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-paper/[0.02] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold text-positive">
            <Check className="h-3.5 w-3.5" /> Completed · {done.length}
          </p>
          <TitleList titles={done} empty="Nothing completed yet." />
        </div>
        <div className="rounded-xl border border-line bg-paper/[0.02] p-3">
          <p className="mb-1.5 text-[0.72rem] font-semibold text-paper/80">Still open · {open.length}</p>
          <TitleList titles={open} empty="Nothing left open." />
          {open.length > 0 && plan.level !== "year" && (
            <Button variant="subtle" size="sm" className="-ml-2 mt-1.5" onClick={onCarry}>
              <Forward className="h-3.5 w-3.5" /> Carry forward
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-line bg-paper/[0.02] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold text-paper/80">
            <Forward className="h-3.5 w-3.5" /> Carried forward · {carried.length}
          </p>
          <TitleList titles={carried} empty="Nothing carried forward." />
        </div>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          savePlanReview(plan.id, { wentWell, improve, nextPriorities });
          setSaved(true);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="What went well?">
            <Textarea value={wentWell} onChange={(e) => { setWentWell(e.target.value); setSaved(false); }} maxLength={1000} className="min-h-[88px]" />
          </Field>
          <Field label="What needs improvement?">
            <Textarea value={improve} onChange={(e) => { setImprove(e.target.value); setSaved(false); }} maxLength={1000} className="min-h-[88px]" />
          </Field>
          <Field label={`What comes first next ${nextNoun}?`}>
            <Textarea
              value={nextPriorities}
              onChange={(e) => { setNextPriorities(e.target.value); setSaved(false); }}
              maxLength={1000}
              className="min-h-[88px]"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={!dirty}>
            Save review
          </Button>
          {saved && !dirty ? (
            <span className="inline-flex items-center gap-1 text-[0.75rem] text-positive" role="status">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          ) : (
            when && <span className="text-[0.72rem] text-paper/55">Last saved {when}</span>
          )}
          <span className="flex-1" />
          {plan.level !== "year" &&
            (next ? (
              <Button variant="ghost" size="sm" onClick={() => nav({ plan: next.id })}>
                Open {planName(next)} <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onPlanNext}>
                Plan next {nextNoun}
              </Button>
            ))}
        </div>
      </form>
      <p className={cn("text-[0.72rem] text-paper/55")}>
        This review is about the plan. For the hours, mocks and subjects your journal recorded, see{" "}
        <Link href={reviewsHref} className="font-semibold text-accent hover:underline">
          Reviews
        </Link>
        .
      </p>
    </Block>
  );
}
