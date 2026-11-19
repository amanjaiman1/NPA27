"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  CircleDashed,
  ClipboardList,
  Eye,
  Flag,
  HeartPulse,
  History,
  ListChecks,
  Lock,
  Repeat,
  Route,
  Sparkles,
  Target,
  ThumbsUp,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { CoachLog } from "@/lib/types";
import {
  AREA_LABEL,
  DECISION_LABEL,
  changeLines,
  type AnalysisSection,
  type Briefing,
  type CoachArea,
  type Evidence,
  type ProposedChange,
  type ShownRecommendation,
} from "@/lib/coach";
import { blankItem } from "@/lib/roadmap";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, toISODate } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   The Study Coach's newer views: the daily briefing, recommendations
   with their evidence (and the changes they'd make, applied only on
   confirmation), the preparation analysis and the history of what you
   decided. The engine is lib/coach.ts.
   ════════════════════════════════════════════════════════════════ */

const AREA_ICON: Record<CoachArea, LucideIcon> = {
  study: ClipboardList,
  revision: Repeat,
  plan: Route,
  habits: ListChecks,
  goals: Target,
  life: HeartPulse,
  mocks: Flag,
};

function EvidenceList({ items }: { items: Evidence[] }) {
  return (
    <ul className="space-y-1">
      {items.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-[0.76rem] leading-relaxed text-paper/70">
          <span aria-hidden className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-paper/40" />
          <span className="min-w-0 flex-1">
            {e.text}
            {e.href && (
              <>
                {" "}
                <Link href={e.href} className="whitespace-nowrap font-semibold text-accent hover:underline">
                  See records
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── The briefing ────────────────────────────────────────────── */

export function BriefingPanel({ briefing }: { briefing: Briefing }) {
  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <p className="eyebrow">Today · {formatDate(briefing.date)}</p>
        <p className="mt-1.5 text-[1rem] font-semibold leading-snug text-paper">{briefing.headline}</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section aria-labelledby="brief-priorities">
            <h3 id="brief-priorities" className="mb-2 text-[0.78rem] font-semibold text-paper/60">
              Today&apos;s priorities
            </h3>
            {briefing.priorities.length ? (
              <ol className="space-y-2">
                {briefing.priorities.map((p, i) => {
                  const Icon = AREA_ICON[p.area];
                  return (
                    <li key={p.text}>
                      <Link
                        href={p.href}
                        className="inset-panel group flex items-center gap-3 px-3 py-2.5 transition-colors hover:border-accent/35"
                      >
                        <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[0.7rem] font-bold text-accent-fg">{i + 1}</span>
                        <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <span className="min-w-0 flex-1 text-[0.84rem] font-medium text-paper">{p.text}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-paper/40 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-[0.82rem] text-paper/60">Nothing pressing. Keep the day as planned.</p>
            )}
          </section>
          <section aria-labelledby="brief-prep">
            <h3 id="brief-prep" className="mb-2 text-[0.78rem] font-semibold text-paper/60">
              Preparation
            </h3>
            <dl className="grid grid-cols-2 gap-2">
              {briefing.preparation.map((p) => (
                <Link key={p.label} href={p.href} className="inset-panel block px-3 py-2.5 transition-colors hover:border-accent/35">
                  <dt className="text-[0.66rem] font-medium text-paper/55">{p.label}</dt>
                  <dd>
                    <span className="tabular text-[1.1rem] font-semibold text-paper">{p.value}</span>
                    <span className="mt-0.5 block truncate text-[0.66rem] text-paper/55">{p.note}</span>
                  </dd>
                </Link>
              ))}
            </dl>
          </section>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-semibold text-paper/70">
            <ListChecks className="h-4 w-4 text-accent" aria-hidden /> Habits today
          </p>
          {briefing.habits.due ? (
            <>
              <p className="tabular text-[1.15rem] font-semibold text-paper">
                {briefing.habits.done} of {briefing.habits.due} done
              </p>
              {briefing.habits.pending.length > 0 && (
                <ul className="mt-2 space-y-1 text-[0.78rem]">
                  {briefing.habits.pending.map((p) => (
                    <li key={p.href}>
                      <Link href={p.href} className="text-paper/75 hover:text-paper hover:underline">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[0.8rem] text-paper/60">None due today.</p>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-semibold text-paper/70">
            <Target className="h-4 w-4 text-accent" aria-hidden /> Goals
          </p>
          {briefing.goals.length ? (
            <ul className="space-y-2">
              {briefing.goals.map((g) => (
                <li key={g.href} className="text-[0.78rem]">
                  <Link href={g.href} className="font-medium text-paper hover:underline">
                    {g.title}
                  </Link>
                  <span className="block text-paper/55">
                    {g.health}. {g.note}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.8rem] text-paper/60">No active goals.</p>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-semibold text-paper/70">
            <HeartPulse className="h-4 w-4 text-accent" aria-hidden /> Life and the plan
          </p>
          <ul className="space-y-1.5 text-[0.78rem]">
            {briefing.life.map((l) => (
              <li key={l.text}>
                <Link href={l.href} className="text-paper/75 hover:text-paper hover:underline">
                  {l.text}
                </Link>
              </li>
            ))}
            {briefing.plan && (
              <li>
                <Link href={briefing.plan.href} className="text-paper/75 hover:text-paper hover:underline">
                  {briefing.plan.text}
                </Link>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ── Recommendations ─────────────────────────────────────────── */

/** Applies a recommendation's changes through the store. Only ever called after you confirm. */
function useApplyChanges() {
  const savePlanItem = useChronicle((s) => s.savePlanItem);
  const carry = useChronicle((s) => s.carryForward);
  const upsertRevision = useChronicle((s) => s.upsertRevision);
  return (changes: ProposedChange[]): number => {
    let applied = 0;
    const today = toISODate(new Date());
    for (const c of changes) {
      if (c.kind === "addActivity") {
        const plan = useChronicle.getState().plans.find((p) => p.id === c.planId);
        if (!plan) continue;
        const item = { ...blankItem("activity", c.title), priority: c.priority, ...(c.subjectId ? { subjectId: c.subjectId } : {}), ...(c.targetDate ? { targetDate: c.targetDate } : {}) };
        savePlanItem(c.planId, item);
        applied++;
      } else if (c.kind === "carryForward") {
        if (carry(c.fromPlanId, c.itemIds, c.toPlanId) > 0) applied++;
      } else {
        const items = useChronicle.getState().revisions;
        let moved = 0;
        for (const m of c.moves) {
          const it = items.find((x) => x.id === m.id);
          // Only what is still overdue: anything revised since stays as it is.
          if (!it || it.nextDue >= today) continue;
          upsertRevision({ ...it, nextDue: m.to });
          moved++;
        }
        if (moved) applied++;
      }
    }
    return applied;
  };
}

export function RecommendationsPanel({ shown, settled }: { shown: ShownRecommendation[]; settled: ShownRecommendation[] }) {
  const record = useChronicle((s) => s.recordCoachDecision);
  const apply = useApplyChanges();
  const toast = useToast();
  const [confirming, setConfirming] = useState<ShownRecommendation | null>(null);

  const decide = (rec: ShownRecommendation, status: "accepted" | "dismissed" | "done") => {
    record({ recId: rec.id, status, title: rec.title, fingerprint: rec.fingerprint });
    toast({
      title: status === "dismissed" ? "Dismissed" : status === "done" ? "Marked done" : "Accepted",
      description:
        status === "accepted"
          ? "It stays here, marked, until you've done it."
          : "It won't come back unless the records behind it change.",
    });
  };

  function confirmApply() {
    const rec = confirming;
    if (!rec?.changes) return;
    const n = apply(rec.changes);
    setConfirming(null);
    if (!n) {
      toast({ title: "Nothing to change", description: "The records changed since this was suggested, so it was left alone.", tone: "info" });
      return;
    }
    record({ recId: rec.id, status: "applied", title: rec.title, fingerprint: rec.fingerprint, changes: changeLines(rec.changes) });
    toast({ title: "Changes applied", description: changeLines(rec.changes).join(" ") });
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-[0.78rem] leading-relaxed text-paper/60">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        Worked out by fixed rules from your records, with the figures each rests on. Nothing in your plan, goals or revision queue
        changes unless you choose Apply and confirm.
      </p>
      {shown.length === 0 ? (
        <Card className="p-6 text-[0.84rem] text-paper/65">
          Nothing to suggest right now: the plan, the revision queue and the habits are in hand. New suggestions appear when the
          records call for one.
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((rec) => {
            const Icon = AREA_ICON[rec.area];
            return (
              <li key={rec.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.95rem] font-semibold text-paper">{rec.title}</h3>
                        <Badge tone="outline">{AREA_LABEL[rec.area]}</Badge>
                        {rec.decision?.status === "accepted" && !rec.renewed && <Badge tone="accent">Accepted</Badge>}
                        {rec.renewed && rec.decision && (
                          <Badge tone="warning">
                            New evidence since you {rec.decision.status === "done" ? "marked it done" : `${DECISION_LABEL[rec.decision.status].toLowerCase()} it`}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[0.82rem] leading-relaxed text-paper/75">{rec.why}</p>
                      <div className="mt-2.5">
                        <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-paper/45">The evidence</p>
                        <EvidenceList items={rec.evidence} />
                      </div>
                      {rec.changes && (
                        <div className="mt-3 rounded-xl bg-accent/[0.06] px-3 py-2">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-accent">If you apply it</p>
                          <ul className="mt-1 space-y-0.5 text-[0.78rem] text-paper/80">
                            {changeLines(rec.changes).map((l) => (
                              <li key={l}>{l}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        <Link
                          href={rec.action.href}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs font-semibold text-paper transition-colors hover:border-paper/30"
                        >
                          {rec.action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                        {rec.changes && (
                          <Button size="sm" onClick={() => setConfirming(rec)} hint="Shows exactly what changes, and asks before doing it.">
                            <Wand2 className="h-3.5 w-3.5" aria-hidden /> Apply…
                          </Button>
                        )}
                        {rec.decision?.status !== "accepted" || rec.renewed ? (
                          <Button size="sm" variant="ghost" onClick={() => decide(rec, "accepted")} hint="You'll do it yourself. It stays here, marked.">
                            <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> I&apos;ll do it
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => decide(rec, "done")} hint="It's done. It won't come back unless the records change.">
                          <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Done
                        </Button>
                        <Button size="sm" variant="subtle" onClick={() => decide(rec, "dismissed")} hint="Not useful. Hidden until the records behind it change.">
                          <X className="h-3.5 w-3.5" aria-hidden /> Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {settled.length > 0 && (
        <Card className="px-5 py-2">
          <Disclosure summary={`Hidden until something changes (${settled.length})`}>
            <ul className="divide-y divide-line pb-2">
              {settled.map((rec) => (
                <li key={rec.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[0.8rem]">
                  <span className="min-w-0 flex-1 text-paper/80">{rec.title}</span>
                  <Badge tone="outline">
                    {DECISION_LABEL[rec.decision!.status]} {formatDate(rec.decision!.at.slice(0, 10))}
                  </Badge>
                  <Button size="sm" variant="subtle" onClick={() => decide(rec, "accepted")}>
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Show again
                  </Button>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Card>
      )}

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title="Apply these changes?"
        description={confirming?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button onClick={confirmApply}>
              <Check className="h-4 w-4" aria-hidden /> Apply changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-2">
            {changeLines(confirming?.changes).map((l) => (
              <li key={l} className="inset-panel flex items-start gap-2.5 px-3 py-2.5 text-[0.84rem] leading-relaxed text-paper/85">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                {l}
              </li>
            ))}
          </ul>
          <p className="text-[0.76rem] leading-relaxed text-paper/60">
            Nothing else changes. You can change any of it back in the Roadmap or on the Revision page, and the change is kept
            in the coach&apos;s history.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* ── The analysis ────────────────────────────────────────────── */

export function AnalysisPanel({ sections }: { sections: AnalysisSection[] }) {
  if (!sections.length) return <Card className="p-6 text-[0.84rem] text-paper/65">Log a few days and the analysis fills in.</Card>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((s) => {
        const Icon = AREA_ICON[s.area];
        return (
          <Card key={s.title} className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold text-paper">
              <Icon className="h-4 w-4 text-accent" aria-hidden /> {s.title}
            </h3>
            <ul className="space-y-3">
              {s.findings.map((f, i) => (
                <li key={i}>
                  <p
                    className={cn(
                      "text-[0.84rem] leading-relaxed",
                      f.tone === "good" ? "text-positive" : f.tone === "bad" ? "text-warning" : "text-paper/85",
                    )}
                  >
                    {f.text}
                  </p>
                  <Disclosure summary={<span className="text-[0.72rem] font-medium text-paper/55">Show the evidence</span>} className="-mt-0.5">
                    <EvidenceList items={f.evidence} />
                  </Disclosure>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* ── History ─────────────────────────────────────────────────── */

export function HistoryPanel({ log }: { log: CoachLog | undefined }) {
  const decisions = useMemo(() => [...(log?.decisions ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [log]);
  const briefings = useMemo(() => [...(log?.briefings ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [log]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold text-paper">
          <History className="h-4 w-4 text-accent" aria-hidden /> What you decided
        </h3>
        {decisions.length ? (
          <ul className="divide-y divide-line">
            {decisions.slice(0, 60).map((d) => (
              <li key={d.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={d.status === "dismissed" ? "outline" : d.status === "applied" ? "accent" : "positive"}>{DECISION_LABEL[d.status]}</Badge>
                  <span className="min-w-0 flex-1 text-[0.82rem] font-medium text-paper">{d.title}</span>
                  <span className="text-[0.7rem] text-paper/50">{formatDate(d.at.slice(0, 10))}</span>
                </div>
                {d.changes?.length ? (
                  <ul className="mt-1 space-y-0.5 pl-1 text-[0.74rem] text-paper/65">
                    {d.changes.map((c) => (
                      <li key={c}>· {c}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-[0.8rem] text-paper/60">
            <CircleDashed className="h-4 w-4" aria-hidden /> Nothing yet. Accepting, applying, finishing or dismissing a suggestion is kept here.
          </p>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold text-paper">
          <CalendarDays className="h-4 w-4 text-accent" aria-hidden /> Past briefings
        </h3>
        {briefings.length ? (
          <ul className="divide-y divide-line">
            {briefings.slice(0, 30).map((b) => (
              <li key={b.id} className="py-2.5">
                <p className="text-[0.74rem] font-semibold text-paper/70">{formatDate(b.date)}</p>
                {b.headlines.length ? (
                  <ul className="mt-0.5 space-y-0.5 text-[0.78rem] text-paper/75">
                    {b.headlines.map((h) => (
                      <li key={h}>· {h}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[0.78rem] text-paper/55">Nothing pressing that day.</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.8rem] text-paper/60">Each day&apos;s briefing is kept here, one line per priority.</p>
        )}
      </Card>
    </div>
  );
}
