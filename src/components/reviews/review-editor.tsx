"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lock, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { Review, ReviewQuestionKey } from "@/lib/types";
import {
  REVIEW_QUESTIONS,
  answersOf,
  isCompleted,
  legacyListsOf,
  measurePeriod,
  suggestAnswers,
  summarize,
  type PerformanceData,
  type ReviewPeriod,
} from "@/lib/performance";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, RatingPicker, Textarea } from "@/components/ui/form";
import { Disclosure } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, toISODate, uid } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { FigureGrid, ObservationKey, ObservationList, SubjectSplit } from "./review-figures";

/** This account's records, as the Performance Review reads them. Never the diary. */
export function usePerformanceData(): PerformanceData {
  const journal = useChronicle((s) => s.journal);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const revisions = useChronicle((s) => s.revisions);
  const plans = useChronicle((s) => s.plans);
  const subjects = useChronicle((s) => s.subjects);
  const goals = useChronicle((s) => s.goals);
  const habits = useChronicle((s) => s.habits);
  const mocks = useChronicle((s) => s.mocks);
  const profile = useChronicle((s) => s.profile);
  return useMemo(
    () => ({ journal, lifeLog, revisions, plans, subjects, goals, habits, mocks, profile }),
    [journal, lifeLog, revisions, plans, subjects, goals, habits, mocks, profile],
  );
}

export const TYPE_WORD: Record<Review["type"], string> = { Weekly: "week", Monthly: "month", Yearly: "year", Custom: "period" };

/**
 * Writing a review: the period's figures and summary, then six questions.
 * Saving keeps it as a draft with live figures; completing it freezes them.
 */
export function ReviewEditor({
  open,
  onClose,
  period,
  review,
}: {
  open: boolean;
  onClose: () => void;
  period: ReviewPeriod | null;
  /** The review for this period, if one exists. */
  review: Review | null;
}) {
  const data = usePerformanceData();
  const upsert = useChronicle((s) => s.upsertReview);
  const confirm = useConfirm();
  const toast = useToast();
  const today = toISODate(useNow(60_000));

  const [answers, setAnswers] = useState<Partial<Record<ReviewQuestionKey, string>>>({});
  const [rating, setRating] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    setAnswers(review ? answersOf(review) : {});
    setRating(review?.rating);
  }, [open, review]);

  const completed = review ? isCompleted(review) : false;
  const live = useMemo(() => (period ? measurePeriod(data, period, today) : null), [data, period, today]);
  const frozen = completed && review?.snapshot ? review.snapshot : null;
  const figures = frozen ?? live;
  const typeWord = period ? TYPE_WORD[period.type] : "period";
  const observations = useMemo(() => (figures ? summarize(figures, typeWord) : []), [figures, typeWord]);
  const suggestions = useMemo(() => (figures ? suggestAnswers(figures, data, typeWord) : {}), [figures, data, typeWord]);
  const running = period ? period.endDate >= today : false;

  if (!period) return null;

  function base(): Review {
    const p = period as ReviewPeriod;
    return {
      ...(review ?? {}),
      id: review?.id ?? uid("rev"),
      type: p.type,
      periodLabel: p.label,
      startDate: p.startDate,
      endDate: p.endDate,
    };
  }

  function clean(): Partial<Record<ReviewQuestionKey, string>> {
    const out: Partial<Record<ReviewQuestionKey, string>> = {};
    for (const q of REVIEW_QUESTIONS) {
      const v = answers[q.key]?.trim();
      if (v) out[q.key] = v;
    }
    return out;
  }

  function saveDraft() {
    if (!live) return;
    const a = clean();
    upsert({
      ...base(),
      status: "draft",
      answers: a,
      ...legacyListsOf(a),
      rating,
      totalHours: live.studyHours,
      mocksTaken: live.mocks.taken,
    });
    toast({ title: "Draft saved", description: "Its figures stay live until you complete it." });
    onClose();
  }

  function saveChanges() {
    const a = clean();
    upsert({ ...base(), answers: a, ...legacyListsOf(a), rating });
    toast({ title: "Review updated", description: "What you wrote changed. The figures stay as they were." });
    onClose();
  }

  async function complete() {
    if (!live) return;
    if (running) {
      const ok = await confirm({
        title: `Complete it before the ${typeWord} is over?`,
        description: `The ${typeWord} runs until ${formatDate(period!.endDate)}. Completing now freezes the figures as they are today; anything you record later won't be in it unless you refresh them.`,
        tone: "default",
        confirmLabel: "Complete now",
        consequence: "You can refresh the figures later.",
      });
      if (!ok) return;
    }
    const a = clean();
    const now = new Date().toISOString();
    upsert({
      ...base(),
      status: "completed",
      completedAt: now,
      snapshot: { ...live, takenAt: now },
      answers: a,
      ...legacyListsOf(a),
      rating,
      totalHours: live.studyHours,
      mocksTaken: live.mocks.taken,
    });
    toast({ title: "Review completed", description: "Its figures are kept as they are now. A later edit to your records won't change it." });
    onClose();
  }

  async function refresh() {
    if (!live || !review) return;
    const ok = await confirm({
      title: "Refresh this review's figures?",
      description: `They were taken on ${formatDate((review.snapshot?.takenAt ?? review.completedAt ?? new Date().toISOString()).slice(0, 10))}. Refreshing measures ${period!.label} again from your records as they are now. What you wrote stays.`,
      tone: "default",
      confirmLabel: "Refresh figures",
      consequence: "The old figures are replaced.",
    });
    if (!ok) return;
    const now = new Date().toISOString();
    upsert({ ...review, snapshot: { ...live, takenAt: now }, totalHours: live.studyHours, mocksTaken: live.mocks.taken });
    toast({ title: "Figures refreshed", description: `Measured again from your records on ${formatDate(today)}.` });
  }

  const set = (key: ReviewQuestionKey, v: string) => setAnswers((a) => ({ ...a, [key]: v }));
  const older = review && !review.snapshot && completed;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${period.type} review · ${period.label}`}
      description={`${formatDate(period.startDate)} to ${formatDate(period.endDate)}${running ? `, still running` : ""}`}
      className="sm:max-w-3xl"
      footer={
        completed ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={saveChanges}>Save changes</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} className="mr-auto">
              Cancel
            </Button>
            <Button variant="ghost" onClick={saveDraft} hint="Keep it to finish later. The figures stay live.">
              Save draft
            </Button>
            <Button onClick={() => void complete()} hint="Keep it as the record of this period. The figures are frozen.">
              Complete review
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {/* Where the figures stand */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper/[0.04] px-3.5 py-2.5 text-[0.76rem] text-paper/70">
          <span className="inline-flex items-center gap-1.5">
            {frozen ? <Lock className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />}
            {frozen
              ? `Completed. Figures as measured on ${formatDate(frozen.takenAt.slice(0, 10))}.`
              : older
                ? "Written before figures were kept with reviews: these are measured now."
                : "Draft. The figures update as you record, until you complete it."}
          </span>
          {completed && (
            <Button size="sm" variant="subtle" onClick={() => void refresh()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {frozen ? "Refresh figures" : "Keep these figures"}
            </Button>
          )}
        </div>

        {figures && (
          <section aria-label="Figures" className="space-y-3">
            <FigureGrid s={figures} typeWord={typeWord} />
            <SubjectSplit s={figures} />
          </section>
        )}

        <section aria-labelledby="review-summary" className="space-y-2.5">
          <h3 id="review-summary" className="text-[0.88rem] font-semibold text-paper">
            Summary from your records
          </h3>
          <ObservationKey />
          <ObservationList items={observations} />
          {figures?.habitRows && figures.habitRows.length > 0 && (
            <Disclosure summary={`Habits, one by one (${figures.habitRows.length})`}>
              <ul className="divide-y divide-line text-[0.8rem]">
                {figures.habitRows.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-paper/80">{h.name}</span>
                    <span className="tabular shrink-0 text-paper/65">
                      {h.kept} of {h.due} · {Math.round((h.kept / h.due) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          {figures?.unfinished && figures.unfinished.length > 0 && (
            <Disclosure summary={`Planned and still open (${figures.unfinished.length})`}>
              <ul className="space-y-1 text-[0.8rem]">
                {figures.unfinished.map((u) => (
                  <li key={u.href} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-paper/80">{u.title}</span>
                    <Link href={u.href} className="shrink-0 text-[0.72rem] font-semibold text-accent hover:underline">
                      Open in Roadmap
                    </Link>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </section>

        {/* The questions */}
        <section aria-labelledby="review-questions" className="space-y-4">
          <div>
            <h3 id="review-questions" className="text-[0.88rem] font-semibold text-paper">
              Your review
            </h3>
            <p className="mt-0.5 text-[0.74rem] text-paper/55">
              Answer what&apos;s useful and skip the rest. A suggestion from the figures can start you off; it&apos;s only added if you choose it.
            </p>
          </div>
          {REVIEW_QUESTIONS.map((q) => {
            const suggestion = suggestions[q.key];
            const value = answers[q.key] ?? "";
            return (
              <div key={q.key}>
                <Field label={q.label} hint={q.hint} optional>
                  <Textarea value={value} onChange={(e) => set(q.key, e.target.value)} placeholder={q.placeholder} className="min-h-[72px]" maxLength={2000} />
                </Field>
                {suggestion && !value.includes(suggestion) && (
                  <button
                    type="button"
                    onClick={() => set(q.key, value.trim() ? `${value.trim()}\n${suggestion}` : suggestion)}
                    className="mt-1.5 inline-flex max-w-full items-start gap-1.5 rounded-lg px-2 py-1 text-left text-[0.72rem] text-paper/65 transition-colors hover:bg-accent/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
                  >
                    <Wand2 className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                    <span>
                      <span className="font-semibold text-accent">Use a suggestion:</span> {suggestion}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
          <Field label="Overall, how did it go?" optional hint="1 is a hard period, 5 a great one.">
            <RatingPicker value={rating ?? 0} onChange={(v) => setRating(v === rating ? undefined : v)} labels={["Hard", "Difficult", "Steady", "Good", "Great"]} />
          </Field>
        </section>

        <p className="flex items-center gap-1.5 text-[0.7rem] text-paper/50">
          <Lock className="h-3 w-3" aria-hidden /> Your Personal Diary is never read for a review.
        </p>
      </div>
    </Modal>
  );
}
