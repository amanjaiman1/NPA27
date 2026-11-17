"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Flag,
  Clock,
  Star,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Gauge,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Review, ReviewType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Select, ListEditor, RatingPicker } from "@/components/ui/form";
import { Segmented, EmptyState } from "@/components/ui/misc";
import {
  reviewPeriods,
  buildReviewDraft,
  computeReviewMetrics,
  findReviewFor,
  type PeriodWindow,
  type ReviewMetrics,
} from "@/lib/review-builder";
import { toISODate, formatDate, round, cn } from "@/lib/utils";

const LISTS = [
  { key: "wins", label: "Wins", icon: Trophy },
  { key: "struggles", label: "Struggles", icon: AlertTriangle },
  { key: "lessons", label: "Lessons", icon: Lightbulb },
  { key: "nextFocus", label: "Next focus", icon: Flag },
] as const;

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < value ? "fill-paper text-paper" : "text-paper/20",
          )}
        />
      ))}
    </span>
  );
}

/** A computed number the user didn't have to type. */
function Metric({
  icon: Icon,
  label,
  value,
  change,
  foot,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  change?: number | null;
  foot?: string;
}) {
  const dir = change == null || change === 0 ? 0 : change > 0 ? 1 : -1;
  return (
    <div className="rounded-xl border border-line bg-paper/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-paper/40">
        <Icon className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate text-[0.6rem] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="tabular mt-1.5 text-xl font-semibold text-paper">{value}</p>
      <div className="flex items-center gap-1.5">
        {dir !== 0 && (
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 text-[0.66rem] font-semibold",
              dir > 0 ? "text-positive" : "text-danger",
            )}
          >
            {dir > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(Math.round((change ?? 0) * 100))}%
          </span>
        )}
        {foot && <span className="truncate text-[0.66rem] text-paper/40">{foot}</span>}
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const hydrated = useHasHydrated();
  const reviews = useChronicle((s) => s.reviews);
  const journal = useChronicle((s) => s.journal);
  const mocks = useChronicle((s) => s.mocks);
  const subjects = useChronicle((s) => s.subjects);
  const upsert = useChronicle((s) => s.upsertReview);
  const remove = useChronicle((s) => s.deleteReview);
  const confirm = useConfirm();

  const today = toISODate(new Date());
  const [type, setType] = useState<ReviewType>("Weekly");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Review | null>(null);
  const [metrics, setMetrics] = useState<ReviewMetrics | null>(null);
  const [editing, setEditing] = useState(false);

  const periods = useMemo(() => reviewPeriods(type, today, 8), [type, today]);

  const filtered = useMemo(
    () =>
      [...reviews]
        .filter((r) => r.type === type)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [reviews, type],
  );

  /** Metrics for every listed review, so a saved review can still show the
   *  computed picture next to what was written at the time. */
  const metricsFor = useMemo(() => {
    const m = new Map<string, ReviewMetrics>();
    for (const r of filtered) {
      m.set(
        r.id,
        computeReviewMetrics(
          { journal, mocks, subjects },
          {
            type: r.type,
            key: `${r.type}:${r.startDate}`,
            periodLabel: r.periodLabel,
            startDate: r.startDate,
            endDate: r.endDate,
          },
        ),
      );
    }
    return m;
  }, [filtered, journal, mocks, subjects]);

  if (!hydrated) return <Loading />;

  /** The next period that hasn't been reviewed yet — the obvious thing to write. */
  const nextUnreviewed =
    periods.find((p) => !findReviewFor(reviews, p)) ?? periods[0];

  function startFor(w: PeriodWindow) {
    const existing = findReviewFor(reviews, w);
    const built = buildReviewDraft({ journal, mocks, subjects }, w);
    if (existing) {
      // Keep what was written; refresh the measured half from the journal.
      setDraft({
        ...existing,
        totalHours: built.review.totalHours,
        mocksTaken: built.review.mocksTaken,
      });
      setEditing(true);
    } else {
      setDraft(built.review);
      setEditing(false);
    }
    setMetrics(built.metrics);
    setOpen(true);
  }

  function openEdit(r: Review) {
    setDraft({ ...r });
    setMetrics(metricsFor.get(r.id) ?? null);
    setEditing(true);
    setOpen(true);
  }

  async function save() {
    if (!draft) return;
    if (
      await confirm({
        title: editing ? "Save changes to this review?" : "Save this review?",
        description: `${draft.periodLabel} will be ${editing ? "updated" : "added to your reviews"}.`,
        tone: "default",
        confirmLabel: editing ? "Save changes" : "Save review",
      })
    ) {
      upsert(draft);
      setOpen(false);
    }
  }

  async function del(r: Review) {
    if (
      await confirm({
        title: "Delete this review?",
        description: `"${r.periodLabel}" will be permanently removed.`,
        confirmLabel: "Delete review",
      })
    )
      remove(r.id);
  }

  function patch(p: Partial<Review>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reviews"
        title="Zoom out. See the arc."
        description="The daily grind hides the progress. Every number here is read straight from your journal and mocks — all you add is what it meant."
        actions={
          <Button onClick={() => startFor(nextUnreviewed)}>
            <Plus className="h-4 w-4" /> Write review
          </Button>
        }
      />

      <Segmented
        value={type}
        onChange={(v) => setType(v as ReviewType)}
        options={[
          { label: "Weekly", value: "Weekly" },
          { label: "Monthly", value: "Monthly" },
          { label: "Yearly", value: "Yearly" },
        ]}
      />

      {/* Periods waiting to be reviewed */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold tracking-snugg text-paper">
            {type} periods
          </h2>
          <span className="text-[0.7rem] text-paper/40">
            already measured — pick one to write up
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => {
            const done = findReviewFor(reviews, p);
            return (
              <button
                key={p.key}
                onClick={() => startFor(p)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                  done
                    ? "border-line bg-paper/[0.03] text-paper/45 hover:text-paper"
                    : "border-accent/35 bg-accent/15 text-accent hover:-translate-y-px",
                )}
                title={`${formatDate(p.startDate)} – ${formatDate(p.endDate)}`}
              >
                {p.periodLabel}
                {done && <span className="ml-1.5 text-paper/30">written</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-5 w-5" />}
          title={`No ${type.toLowerCase()} reviews yet`}
          description="Pick a period above — the hours, mocks and highlights are filled in for you."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => {
            const m = metricsFor.get(r.id);
            return (
              <Card key={r.id} className="group p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper/[0.06] pb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-paper">
                        {r.periodLabel}
                      </h3>
                      <Badge tone="outline">{r.type}</Badge>
                      {m && m.phase && <Badge tone="ghost">{m.phase}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-paper/40">
                      {formatDate(r.startDate)} — {formatDate(r.endDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.totalHours !== undefined && (
                      <div className="flex items-center gap-1.5 text-sm text-paper/60">
                        <Clock className="h-4 w-4 text-paper/40" />
                        <span className="tabular">{r.totalHours}h</span>
                      </div>
                    )}
                    {r.mocksTaken !== undefined && (
                      <div className="text-sm text-paper/60">
                        <span className="tabular">{r.mocksTaken}</span> mocks
                      </div>
                    )}
                    {r.rating !== undefined && <Stars value={r.rating} />}
                    <button
                      onClick={() => openEdit(r)}
                      aria-label={`Edit ${r.periodLabel}`}
                      title="Edit review"
                      className="grid h-8 w-8 place-items-center rounded-lg text-paper/30 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => del(r)}
                      aria-label={`Delete ${r.periodLabel}`}
                      title="Delete review"
                      className="grid h-8 w-8 place-items-center rounded-lg text-paper/30 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* The measured picture, recomputed from the journal */}
                {m && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric
                      icon={Clock}
                      label="Hours"
                      value={`${m.totalHours}h`}
                      change={m.change.hours}
                      foot={`was ${m.previous.totalHours}h`}
                    />
                    <Metric
                      icon={CalendarCheck}
                      label="Active days"
                      value={`${m.activeDays}`}
                      change={m.change.activeDays}
                      foot={`of ${m.days}`}
                    />
                    <Metric
                      icon={Target}
                      label="Mocks"
                      value={`${m.mocksTaken}`}
                      foot={m.avgMockPct != null ? `avg ${m.avgMockPct}%` : "none sat"}
                    />
                    <Metric
                      icon={Gauge}
                      label="Consistency"
                      value={`${Math.round(m.consistency * 100)}%`}
                      foot={`${m.loggedDays} days logged`}
                    />
                  </div>
                )}

                {m && m.topSubjects.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.topSubjects.slice(0, 5).map((s) => (
                      <span
                        key={s.name}
                        className="rounded-full border border-line bg-paper/[0.03] px-2.5 py-1 text-[0.7rem] text-paper/65"
                      >
                        {s.name}
                        <span className="tabular ml-1.5 text-paper/40">
                          {s.hours}h · {s.share}%
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  {LISTS.map(({ key, label, icon: Icon }) => {
                    const items = r[key] as string[] | undefined;
                    if (!items?.length) return null;
                    return (
                      <div key={key}>
                        <div className="mb-2 flex items-center gap-2 text-paper/45">
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-[0.7rem] font-medium uppercase tracking-wider">
                            {label}
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {items.map((it, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-sm leading-relaxed text-paper/65"
                            >
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-paper/40" />
                              {it}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <Modal
        open={open && draft !== null}
        onClose={() => setOpen(false)}
        title={editing ? "Edit review" : `Review · ${draft?.periodLabel ?? ""}`}
        description={
          editing
            ? "The measured numbers refresh from your journal; the writing is yours."
            : "Hours, mocks and the opening notes are filled in from what you logged. Edit anything."
        }
        className="sm:max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save changes" : "Save review"}</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-5">
            <Field label="Period">
              <Select
                value={`${draft.type}:${draft.startDate}`}
                onChange={(e) => {
                  const w = periods.find((p) => p.key === e.target.value);
                  if (w) startFor(w);
                }}
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.periodLabel}
                    {findReviewFor(reviews, p) ? " · already written" : ""}
                  </option>
                ))}
                {/* A review being edited may sit outside the recent window. */}
                {!periods.some((p) => p.key === `${draft.type}:${draft.startDate}`) && (
                  <option value={`${draft.type}:${draft.startDate}`}>
                    {draft.periodLabel}
                  </option>
                )}
              </Select>
            </Field>

            {metrics && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-wider text-paper/40">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Measured for you
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric
                    icon={Clock}
                    label="Hours"
                    value={`${metrics.totalHours}h`}
                    change={metrics.change.hours}
                  />
                  <Metric
                    icon={CalendarCheck}
                    label="Active days"
                    value={`${metrics.activeDays}`}
                    foot={`of ${metrics.days}`}
                  />
                  <Metric
                    icon={Target}
                    label="Mocks"
                    value={`${metrics.mocksTaken}`}
                    foot={
                      metrics.avgMockPct != null ? `avg ${metrics.avgMockPct}%` : undefined
                    }
                  />
                  <Metric
                    icon={Gauge}
                    label="Avg / day"
                    value={`${metrics.avgHoursPerDay}h`}
                    foot={
                      metrics.bestDay
                        ? `best ${round(metrics.bestDay.hours, 1)}h`
                        : undefined
                    }
                  />
                </div>
              </div>
            )}

            <Field label="How the period felt">
              <RatingPicker
                value={draft.rating ?? 3}
                onChange={(v) => patch({ rating: v })}
              />
            </Field>

            {LISTS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <ListEditor
                  variant="rows"
                  items={(draft[key] as string[] | undefined) ?? []}
                  onChange={(items) => patch({ [key]: items } as Partial<Review>)}
                  placeholder={
                    key === "wins"
                      ? "What went right"
                      : key === "struggles"
                        ? "What fought back"
                        : key === "lessons"
                          ? "What you'd tell yourself"
                          : "What gets the attention next"
                  }
                  emptyHint="Nothing yet"
                />
              </Field>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
