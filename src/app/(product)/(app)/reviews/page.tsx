"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarRange, Download, GitCompareArrows, Lock, PencilLine, Plus, Route, Search, Star, Trash2 } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { PerformanceSnapshot, Review, ReviewType } from "@/lib/types";
import {
  REVIEW_QUESTIONS,
  answersOf,
  customPeriod,
  figuresFor,
  findReview,
  isCompleted,
  periodOfReview,
  periodTrend,
  recentPeriods,
  reviewMarkdown,
  reviewMatches,
  type ReviewPeriod,
} from "@/lib/performance";
import { planForPeriod, planName } from "@/lib/roadmap";
import { roadmapHref } from "@/components/roadmap/shared";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { BarChart } from "@/components/charts/bar-chart";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ReviewEditor, TYPE_WORD, usePerformanceData } from "@/components/reviews/review-editor";
import { cn, daysBetween, formatDate, toISODate } from "@/lib/utils";
import { useNow } from "@/lib/hooks";

/* ════════════════════════════════════════════════════════════════
   PERFORMANCE REVIEW
   Pick a week, a month, a year or any dates; the figures are gathered
   from the records the other modules keep (lib/performance.ts), and you
   answer six questions. Drafts stay live; a completed review keeps its
   figures. History below: search, filter, compare two, export.
   ════════════════════════════════════════════════════════════════ */

type TypeFilter = ReviewType | "All";
type StatusFilter = "all" | "draft" | "completed";

const STATUS_LABEL = { draft: "Draft", completed: "Completed" } as const;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileSafe = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export default function ReviewsPage() {
  const hydrated = useHasHydrated();
  const reviews = useChronicle((s) => s.reviews);
  const plans = useChronicle((s) => s.plans);
  const remove = useChronicle((s) => s.deleteReview);
  const data = usePerformanceData();
  const confirm = useConfirm();
  const toast = useToast();
  const today = toISODate(useNow(60_000));

  const [type, setType] = useState<ReviewType>("Weekly");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: "", to: "" }));
  const [editor, setEditor] = useState<{ open: boolean; period: ReviewPeriod | null; review: Review | null }>({ open: false, period: null, review: null });
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const periods = useMemo(() => (type === "Custom" ? [] : recentPeriods(type, today, 8)), [type, today]);
  const trend = useMemo(() => (type === "Custom" ? [] : periodTrend(data, type, today, type === "Yearly" ? 4 : 8)), [data, type, today]);

  const history = useMemo(
    () =>
      [...reviews]
        .filter((r) => typeFilter === "All" || r.type === typeFilter)
        .filter((r) => statusFilter === "all" || (statusFilter === "draft" ? !isCompleted(r) : isCompleted(r)))
        .filter((r) => reviewMatches(r, query))
        .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.endDate.localeCompare(a.endDate)),
    [reviews, typeFilter, statusFilter, query],
  );
  const figures = useMemo(() => {
    const m = new Map<string, { snapshot: PerformanceSnapshot; frozen: boolean }>();
    for (const r of history.slice(0, 40)) m.set(r.id, figuresFor(r, data, today));
    return m;
  }, [history, data, today]);

  if (!hydrated) return <Loading />;

  const openPeriod = (p: ReviewPeriod) => setEditor({ open: true, period: p, review: findReview(reviews, p) ?? null });
  const openReview = (r: Review) => setEditor({ open: true, period: periodOfReview(r), review: r });
  const nextPeriod = periods.find((p) => !findReview(reviews, p)) ?? periods[0];

  const customError =
    custom.from && custom.to
      ? custom.from > custom.to
        ? "The start must be on or before the end."
        : daysBetween(custom.from, custom.to) > 366
          ? "Choose at most a year."
          : custom.from > today
            ? "Choose dates that have started."
            : null
      : null;

  async function del(r: Review) {
    const ok = await confirm({
      title: `Delete the review of ${r.periodLabel}?`,
      description: "What you wrote and its kept figures go. Your journal, plans and other records aren't touched.",
      confirmLabel: "Delete review",
    });
    if (!ok) return;
    remove(r.id);
    setPicked((p) => p.filter((id) => id !== r.id));
    toast({ title: "Review deleted" });
  }

  function exportOne(r: Review) {
    const f = figures.get(r.id) ?? figuresFor(r, data, today);
    download(`review-${fileSafe(r.type)}-${fileSafe(r.periodLabel)}.md`, reviewMarkdown(r, f.snapshot));
    toast({ title: "Review exported", description: "Saved as a Markdown file." });
  }

  function exportShown() {
    const text = history.map((r) => reviewMarkdown(r, (figures.get(r.id) ?? figuresFor(r, data, today)).snapshot)).join("\n\n---\n\n");
    download(`reviews-${today}.md`, text);
    toast({ title: `${history.length} ${history.length === 1 ? "review" : "reviews"} exported`, description: "Saved as one Markdown file." });
  }

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance Review"
        title="Zoom out. See the arc."
        description="Choose a week, a month or any dates. The figures are gathered from your journal, roadmap, goals, revision, habits and life records; you answer six questions. Your Personal Diary is never read."
        actions={
          type !== "Custom" && nextPeriod ? (
            <Button onClick={() => openPeriod(nextPeriod)} hint={`Opens ${nextPeriod.label}, already measured.`}>
              <Plus className="h-4 w-4" aria-hidden /> Review {nextPeriod.label}
            </Button>
          ) : null
        }
      />

      {/* ── Choose a period ───────────────────────────────── */}
      <Panel eyebrow="Choose a period" title="Which stretch to look back on" icon={CalendarRange}>
        <div className="space-y-4">
          <Segmented<ReviewType>
            className="w-fit"
            label="Kind of review"
            value={type}
            onChange={setType}
            options={[
              { value: "Weekly", label: "Weekly" },
              { value: "Monthly", label: "Monthly" },
              { value: "Yearly", label: "Yearly" },
              { value: "Custom", label: "Custom dates" },
            ]}
          />
          {type === "Custom" ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!custom.from || !custom.to || customError) return;
                openPeriod(customPeriod(custom.from, custom.to));
              }}
            >
              <Field label="From" className="w-44">
                <Input type="date" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </Field>
              <Field label="To" className="w-44">
                <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </Field>
              <Button type="submit" disabled={!custom.from || !custom.to || Boolean(customError)}>
                Measure these dates
              </Button>
              <p className={cn("basis-full text-[0.72rem]", customError ? "font-medium text-danger" : "text-paper/55")} role={customError ? "alert" : undefined}>
                {customError ?? "Any stretch up to a year: a revision sprint, a mock series, the weeks before Prelims."}
              </p>
            </form>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2">
                {periods.map((p) => {
                  const r = findReview(reviews, p);
                  const state = r ? (isCompleted(r) ? "completed" : "draft") : null;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => openPeriod(p)}
                      aria-label={`${p.label}: ${state ? STATUS_LABEL[state] : "not reviewed yet"}`}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-px",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                        state === "completed"
                          ? "border-line bg-paper/[0.03] text-paper/60 hover:text-paper"
                          : state === "draft"
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-accent/35 bg-accent/15 text-accent",
                      )}
                    >
                      {p.label}
                      {state && <span className="ml-1.5 font-normal opacity-75">{state === "completed" ? "done" : "draft"}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[0.72rem] text-paper/55">Each is already measured. Pick one to see its figures and write it up.</p>
            </div>
          )}
        </div>
      </Panel>

      {/* ── Trends ─────────────────────────────────────────── */}
      {type !== "Custom" && trend.length > 1 && (
        <Panel eyebrow="Trends" title={`The last ${trend.length} ${TYPE_WORD[type]}s`} description="Study hours, with the other figures beside them. Measured from your records as they are now." icon={CalendarCheck}>
          <BarChart
            data={trend.map((t) => ({ label: t.period.label.replace(/ \d{4}$/, ""), value: t.totals.studyHours, sublabel: `${t.totals.studyHours} h` }))}
            height={140}
            formatValue={(v) => `${v} h`}
          />
          <div className="-mx-1 mt-4 overflow-x-auto px-1">
            <table className="w-full min-w-[36rem] text-[0.76rem]">
              <thead>
                <tr className="border-b border-line text-left text-[0.68rem] text-paper/55">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">{type === "Weekly" ? "Week" : type === "Monthly" ? "Month" : "Year"}</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Hours</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Days</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Topics</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Revision</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Habits</th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-semibold">Roadmap</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...trend].reverse().map(({ period, totals }) => (
                  <tr key={period.key} className="border-b border-line/60 last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium text-paper/85">
                      <button type="button" onClick={() => openPeriod(period)} className="hover:underline">
                        {period.label}
                      </button>
                    </th>
                    <td className="px-2 py-1.5 text-right text-paper/80">{totals.studyHours}</td>
                    <td className="px-2 py-1.5 text-right text-paper/80">{totals.activeDays}</td>
                    <td className="px-2 py-1.5 text-right text-paper/80">{totals.topicsCompleted}</td>
                    <td className="px-2 py-1.5 text-right text-paper/80">{totals.revisionPasses}</td>
                    <td className="px-2 py-1.5 text-right text-paper/80">{totals.habitRate === null ? "–" : `${Math.round(totals.habitRate * 100)}%`}</td>
                    <td className="py-1.5 pl-2 text-right text-paper/80">{totals.roadmapPlanned ? `${totals.roadmapCompleted}/${totals.roadmapPlanned}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── History ────────────────────────────────────────── */}
      <section aria-labelledby="review-history" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="review-history" className="text-[1.02rem] font-semibold tracking-[-0.02em] text-paper">
              Your reviews
            </h2>
            <p className="mt-0.5 text-[0.78rem] text-paper/60">
              {reviews.length ? `${reviews.length} written. Select two to compare them.` : "Reviews you write are kept here."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" disabled={picked.length !== 2} onClick={() => setComparing(true)} hint="Pick two reviews below, then compare their figures side by side.">
              <GitCompareArrows className="h-3.5 w-3.5" aria-hidden /> Compare{picked.length ? ` (${picked.length}/2)` : ""}
            </Button>
            <Button size="sm" variant="ghost" disabled={!history.length} onClick={exportShown} hint="Every review shown below, as one Markdown file.">
              <Download className="h-3.5 w-3.5" aria-hidden /> Export
            </Button>
          </div>
        </div>

        {reviews.length > 0 && (
          <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search reviews</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/45" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search what you wrote, or a period" className="pl-9" />
            </label>
            <Segmented<TypeFilter>
              label="Show reviews of"
              compact
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "All", label: "All" },
                { value: "Weekly", label: "Weeks" },
                { value: "Monthly", label: "Months" },
                { value: "Yearly", label: "Years" },
                { value: "Custom", label: "Custom" },
              ]}
            />
            <Segmented<StatusFilter>
              label="Status"
              compact
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Any" },
                { value: "draft", label: "Drafts" },
                { value: "completed", label: "Completed" },
              ]}
            />
          </Card>
        )}

        {history.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="h-5 w-5" />}
            title={reviews.length ? "No reviews match" : "No reviews yet"}
            description={
              reviews.length
                ? "Try other words, or show every kind and status."
                : "Pick a period above. Its hours, topics, revision, habits and plan are measured for you; you write what it meant."
            }
          />
        ) : (
          <ul className="space-y-3">
            {history.map((r) => {
              const f = figures.get(r.id);
              const s = f?.snapshot;
              const done = isCompleted(r);
              const answers = answersOf(r);
              const first = REVIEW_QUESTIONS.find((q) => answers[q.key]?.trim());
              const plan = r.type !== "Custom" ? planForPeriod(plans, r.type, r.startDate) : undefined;
              const isPicked = picked.includes(r.id);
              return (
                <li key={r.id}>
                  <Card className={cn("p-4 transition-colors sm:p-5", isPicked && "border-accent/45")}>
                    <div className="flex flex-wrap items-start gap-3">
                      <label className="mt-1 inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={isPicked}
                          onChange={() => togglePick(r.id)}
                          className="h-4 w-4 accent-accent"
                          aria-label={`Select ${r.periodLabel} to compare`}
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[1rem] font-semibold text-paper">
                            <button type="button" onClick={() => openReview(r)} className="text-left hover:underline">
                              {r.periodLabel}
                            </button>
                          </h3>
                          <Badge tone="outline">{r.type}</Badge>
                          <Badge tone={done ? "positive" : "warning"}>{done ? "Completed" : "Draft"}</Badge>
                          {f?.frozen && (
                            <span className="inline-flex items-center gap-1 text-[0.66rem] text-paper/50">
                              <Lock className="h-3 w-3" aria-hidden /> figures kept
                            </span>
                          )}
                          {plan && (
                            <Link
                              href={roadmapHref({ plan: plan.id })}
                              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.66rem] font-semibold text-paper/65 hover:border-accent/40 hover:text-accent"
                            >
                              <Route className="h-3 w-3" aria-hidden /> {planName(plan)}
                            </Link>
                          )}
                        </div>
                        <p className="mt-0.5 text-[0.72rem] text-paper/55">
                          {formatDate(r.startDate)} to {formatDate(r.endDate)}
                          {r.rating ? (
                            <span className="ml-2 inline-flex items-center gap-0.5 align-middle" aria-label={`Rated ${r.rating} of 5`}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star key={i} className={cn("h-3 w-3", i < (r.rating ?? 0) ? "fill-current text-warning" : "text-paper/20")} aria-hidden />
                              ))}
                            </span>
                          ) : null}
                        </p>
                        {s && (
                          <p className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.76rem] text-paper/75">
                            <span>{s.studyHours} h studied</span>
                            <span>{s.activeDays} active days</span>
                            <span>{s.topicsCompleted} topics</span>
                            <span>{s.revision.passes} revision passes</span>
                            {s.habits.rate !== null && <span>habits {Math.round(s.habits.rate * 100)}%</span>}
                            {s.roadmap.planned > 0 && (
                              <span>
                                plan {s.roadmap.completed}/{s.roadmap.planned}
                              </span>
                            )}
                          </p>
                        )}
                        {first && (
                          <p className="mt-2 line-clamp-2 text-[0.8rem] leading-relaxed text-paper/70">
                            <span className="font-semibold text-paper/85">{first.label} </span>
                            {answers[first.key]}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton label={`Open ${r.periodLabel}`} size="sm" onClick={() => openReview(r)}>
                          <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label={`Export ${r.periodLabel}`} hint="As a Markdown file." size="sm" onClick={() => exportOne(r)}>
                          <Download className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label={`Delete ${r.periodLabel}`} size="sm" onClick={() => void del(r)}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ReviewEditor
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        period={editor.period}
        review={editor.review ? reviews.find((r) => r.id === editor.review?.id) ?? editor.review : null}
      />
      <CompareModal
        open={comparing}
        onClose={() => setComparing(false)}
        a={reviews.find((r) => r.id === picked[0]) ?? null}
        b={reviews.find((r) => r.id === picked[1]) ?? null}
      />
    </div>
  );
}

function CompareModal({ open, onClose, a, b }: { open: boolean; onClose: () => void; a: Review | null; b: Review | null }) {
  const data = usePerformanceData();
  const today = toISODate(new Date());
  if (!a || !b) return null;
  const [older, newer] = a.startDate <= b.startDate ? [a, b] : [b, a];
  const fa = figuresFor(older, data, today).snapshot;
  const fb = figuresFor(newer, data, today).snapshot;
  const rows: { label: string; a: number | null; b: number | null; unit?: string; pct?: boolean }[] = [
    { label: "Study hours", a: fa.studyHours, b: fb.studyHours, unit: " h" },
    { label: "Active days", a: fa.activeDays, b: fb.activeDays },
    { label: "Days in the period", a: fa.days, b: fb.days },
    { label: "Topics finished", a: fa.topicsCompleted, b: fb.topicsCompleted },
    { label: "Revision passes", a: fa.revision.passes, b: fb.revision.passes },
    { label: "Habits kept", a: fa.habits.rate, b: fb.habits.rate, pct: true },
    { label: "Roadmap completed", a: fa.roadmap.completed, b: fb.roadmap.completed },
    { label: "Roadmap planned", a: fa.roadmap.planned, b: fb.roadmap.planned },
    { label: "Mocks", a: fa.mocks.taken, b: fb.mocks.taken },
    { label: "Average mock", a: fa.mocks.avgPct, b: fb.mocks.avgPct, unit: "%" },
    { label: "Sleep a night", a: fa.sleep.avgHours, b: fb.sleep.avgHours, unit: " h" },
  ];
  const show = (v: number | null, r: (typeof rows)[number]) => (v === null ? "–" : r.pct ? `${Math.round(v * 100)}%` : `${v}${r.unit ?? ""}`);
  return (
    <Modal open={open} onClose={onClose} title="Two reviews side by side" description="Each column uses that review's kept figures, or measures it now if it has none." className="sm:max-w-2xl">
      <table className="w-full text-[0.82rem]">
        <thead>
          <tr className="border-b border-line text-left text-[0.72rem] text-paper/60">
            <th scope="col" className="py-2 pr-3 font-semibold">Figure</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">{older.periodLabel}</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">{newer.periodLabel}</th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r) => {
            const d = r.a !== null && r.b !== null ? r.b - r.a : null;
            return (
              <tr key={r.label} className="border-b border-line/60 last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-paper/80">{r.label}</th>
                <td className="px-2 py-2 text-right text-paper/80">{show(r.a, r)}</td>
                <td className="px-2 py-2 text-right text-paper/80">{show(r.b, r)}</td>
                <td className={cn("py-2 pl-2 text-right font-semibold", d === null || Math.abs(d) < 1e-9 ? "text-paper/50" : d > 0 ? "text-positive" : "text-danger")}>
                  {d === null ? "–" : `${d > 0 ? "+" : ""}${r.pct ? `${Math.round(d * 100)} pts` : `${Math.round(d * 10) / 10}${r.unit ?? ""}`}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
