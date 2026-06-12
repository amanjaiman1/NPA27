"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  TriangleAlert,
  Trash2,
  Check,
  X,
  ChevronDown,
  Repeat,
  Sparkles,
  CalendarClock,
  Search,
  Layers,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Mistake, MistakeCategory, MistakeStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Heatmap } from "@/components/charts/heatmap";
import { MatrixHeatmap } from "@/components/charts/matrix";
import { BarChart } from "@/components/charts/bar-chart";
import { buildHeatFromCounts } from "@/lib/selectors";
import {
  MISTAKE_CATEGORIES,
  CATEGORY_SHORT,
  masteryStats,
  categoryCounts,
  subjectCounts,
  dueForReview,
  upcomingCount,
  mistakesByDate,
  recurring,
  categorySubjectMatrix,
} from "@/lib/mistakes";
import { formatDate, relativeDay, toISODate, uid, cn } from "@/lib/utils";

const STATUSES: MistakeStatus[] = ["Open", "Reviewing", "Mastered"];

function emptyMistake(subjectId: string): Mistake {
  return {
    id: uid("mis"),
    date: toISODate(new Date()),
    subjectId,
    topic: "",
    category: "Conceptual",
    question: "",
    userAnswer: "",
    correctAnswer: "",
    explanation: "",
    source: "",
    status: "Open",
    reviewCount: 0,
    nextReview: toISODate(new Date()),
    intervalDays: 1,
  };
}

/* ── Review queue (spaced-repetition flashcard) ──────────────── */

function ReviewPanel({
  due,
  upcoming,
  subjectName,
  onReview,
}: {
  due: Mistake[];
  upcoming: number;
  subjectName: (id: string) => string;
  onReview: (id: string, ok: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const m = due[0];
  useEffect(() => {
    setRevealed(false);
  }, [m?.id]);

  if (!m) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-paper/[0.06] text-paper/60">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-paper">Review queue is clear</p>
        <p className="mt-1 text-xs text-paper/45">
          {upcoming > 0
            ? `${upcoming} mistake${upcoming > 1 ? "s" : ""} scheduled in the next 7 days.`
            : "Nothing due. Log new mistakes to keep the loop going."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-paper/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-paper/45" />
          <h3 className="text-sm font-semibold text-paper">Review queue</h3>
        </div>
        <span className="font-mono text-xs text-paper/45">{due.length} due</span>
      </div>

      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="default">{m.category}</Badge>
          <span className="text-xs text-paper/55">{subjectName(m.subjectId)}</span>
          <span className="text-xs text-paper/30">· {m.topic}</span>
          {m.source && (
            <span className="ml-auto text-[0.7rem] text-paper/30">{m.source}</span>
          )}
        </div>

        <p className="font-display text-lg leading-snug text-paper">
          {m.question || m.topic}
        </p>

        {!revealed ? (
          <Button className="mt-5" onClick={() => setRevealed(true)}>
            Reveal answer
          </Button>
        ) : (
          <div className="mt-4 space-y-3 animate-fade-in">
            {m.userAnswer && (
              <div className="flex items-start gap-2 rounded-xl border border-paper/[0.08] bg-paper/[0.02] p-3">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40" />
                <div>
                  <p className="text-[0.65rem] uppercase tracking-wider text-paper/35">
                    Your answer
                  </p>
                  <p className="text-sm text-paper/60 line-through decoration-paper/30">
                    {m.userAnswer}
                  </p>
                </div>
              </div>
            )}
            {m.correctAnswer && (
              <div className="flex items-start gap-2 rounded-xl border border-paper/20 bg-paper/[0.05] p-3">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper" />
                <div>
                  <p className="text-[0.65rem] uppercase tracking-wider text-paper/45">
                    Correct
                  </p>
                  <p className="text-sm font-medium text-paper">{m.correctAnswer}</p>
                </div>
              </div>
            )}
            {m.explanation && (
              <p className="text-sm leading-relaxed text-paper/60">{m.explanation}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onReview(m.id, false)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-paper/12 px-4 py-2.5 text-sm font-medium text-paper/60 transition-colors hover:border-paper/30 hover:text-paper"
              >
                <X className="h-4 w-4" /> Missed again
              </button>
              <button
                onClick={() => onReview(m.id, true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
              >
                <Check className="h-4 w-4" /> Recalled it
              </button>
            </div>
            <p className="text-center text-[0.65rem] text-paper/30">
              Reviewed {m.reviewCount}× · 3 clean recalls graduates it to mastered
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function MistakesPage() {
  const hydrated = useHasHydrated();
  const mistakes = useChronicle((s) => s.mistakes);
  const subjects = useChronicle((s) => s.subjects);
  const upsert = useChronicle((s) => s.upsertMistake);
  const review = useChronicle((s) => s.reviewMistake);
  const setStatus = useChronicle((s) => s.setMistakeStatus);
  const remove = useChronicle((s) => s.deleteMistake);
  const confirm = useConfirm();

  const [catFilter, setCatFilter] = useState<MistakeCategory | "all">("all");
  const [subjFilter, setSubjFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<MistakeStatus | "all">("all");
  const [topicKey, setTopicKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Mistake>(emptyMistake(""));

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? id;
  const today = toISODate(new Date());

  const stats = useMemo(() => masteryStats(mistakes), [mistakes]);
  const due = useMemo(() => dueForReview(mistakes, today), [mistakes, today]);
  const upcoming = useMemo(() => upcomingCount(mistakes, today), [mistakes, today]);
  const cats = useMemo(() => categoryCounts(mistakes), [mistakes]);
  const subs = useMemo(() => subjectCounts(mistakes, subjects), [mistakes, subjects]);
  const patterns = useMemo(() => recurring(mistakes, subjects), [mistakes, subjects]);
  const matrix = useMemo(
    () => categorySubjectMatrix(mistakes, subjects),
    [mistakes, subjects],
  );
  const heatCells = useMemo(
    () => buildHeatFromCounts(mistakesByDate(mistakes), 118),
    [mistakes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...mistakes]
      .filter((m) => catFilter === "all" || m.category === catFilter)
      .filter((m) => subjFilter === "all" || m.subjectId === subjFilter)
      .filter((m) => statusFilter === "all" || m.status === statusFilter)
      .filter(
        (m) =>
          !topicKey ||
          `${m.subjectId}::${m.topic.trim().toLowerCase()}` === topicKey,
      )
      .filter(
        (m) =>
          !q ||
          [m.question, m.topic, m.explanation, m.correctAnswer]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [mistakes, catFilter, subjFilter, statusFilter, topicKey, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function cycleStatus(m: Mistake) {
    const next = STATUSES[(STATUSES.indexOf(m.status) + 1) % STATUSES.length];
    setStatus(m.id, next);
  }

  if (!hydrated) return <Loading />;

  const activeFilters =
    (catFilter !== "all" ? 1 : 0) +
    (subjFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (topicKey ? 1 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mistake Tracker"
        title="Every mistake, a learning asset."
        description="Toppers don't make fewer mistakes — they never repeat them. Capture the question, your answer and the correction; the system schedules reviews and surfaces the patterns you keep falling for."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyMistake(subjects[0]?.id ?? ""));
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Log mistake
          </Button>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: stats.total, icon: Layers },
          { label: "Active", value: stats.open + stats.reviewing, icon: TriangleAlert },
          { label: "Due now", value: due.length, icon: CalendarClock },
          { label: "Mastered", value: stats.mastered, icon: Check },
          { label: "Mastered %", value: `${stats.masteredPct}%`, icon: Sparkles },
          { label: "Recurring", value: patterns.length, icon: Repeat },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-paper/40">
              <s.icon className="h-3.5 w-3.5" />
              <span className="text-[0.62rem] font-medium uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-paper">{s.value}</p>
          </Card>
        ))}
      </div>

      {mistakes.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert className="h-5 w-5" />}
          title="No mistakes logged yet"
          description="Capture your first wrong answer to turn it into a learning asset."
          action={
            <Button
              onClick={() => {
                setDraft(emptyMistake(subjects[0]?.id ?? ""));
                setOpen(true);
              }}
            >
              Log your first mistake
            </Button>
          }
        />
      ) : (
        <>
          {/* Review queue + recurring patterns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ReviewPanel
              due={due}
              upcoming={upcoming}
              subjectName={subjectName}
              onReview={review}
            />

            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Repeat className="h-4 w-4 text-paper/45" />
                <h3 className="text-sm font-semibold text-paper">
                  Recurring mistakes
                </h3>
                <span className="ml-auto text-[0.7rem] text-paper/35">
                  auto-detected
                </span>
              </div>
              {patterns.length === 0 ? (
                <p className="py-6 text-center text-sm text-paper/40">
                  No repeated topics yet. Two mistakes on the same topic and it
                  surfaces here.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {patterns.slice(0, 6).map((p) => (
                    <li key={p.key}>
                      <button
                        onClick={() => {
                          setTopicKey(p.key);
                          setCatFilter("all");
                          setSubjFilter("all");
                          setStatusFilter("all");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-paper/[0.08] p-2.5 text-left transition-colors hover:border-paper/20 hover:bg-paper/[0.03]"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper text-ink">
                          <span className="tabular text-sm font-semibold">{p.count}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-paper">
                            {p.topic}
                          </span>
                          <span className="block truncate text-[0.7rem] text-paper/45">
                            {p.subjectName} · mostly {p.dominantCategory}
                          </span>
                        </span>
                        {p.openCount > 0 && (
                          <Badge tone="outline">{p.openCount} open</Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Analytics */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="eyebrow mb-1">Error categories</p>
              <h3 className="mb-5 text-base font-semibold text-paper">
                Why you lose marks
              </h3>
              <BarChart
                data={cats.map((c) => ({
                  label: CATEGORY_SHORT[c.category],
                  value: c.count,
                  sublabel: c.category,
                }))}
                height={180}
                formatValue={(v) => `${v}`}
              />
            </Card>
            <Card className="p-5">
              <p className="eyebrow mb-1">By subject</p>
              <h3 className="mb-5 text-base font-semibold text-paper">
                Where they cluster
              </h3>
              <BarChart
                data={subs.slice(0, 8).map((s) => ({
                  label: s.name.split(" ")[0],
                  value: s.count,
                  sublabel: s.name,
                }))}
                height={180}
                formatValue={(v) => `${v}`}
              />
            </Card>
          </div>

          {/* Heatmaps */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="eyebrow mb-1">When</p>
              <h3 className="mb-4 text-base font-semibold text-paper">
                Mistake heatmap
              </h3>
              <Heatmap
                cells={heatCells}
                cellSize={13}
                legendLow="0"
                legendHigh="4+"
                formatTooltip={(c) => ({
                  primary:
                    c.hours > 0
                      ? `${c.hours} mistake${c.hours > 1 ? "s" : ""}`
                      : "Clean day",
                  secondary: formatDate(c.date),
                })}
              />
            </Card>
            <Card className="p-5">
              <p className="eyebrow mb-1">Where × why</p>
              <h3 className="mb-4 text-base font-semibold text-paper">
                Subject × error type
              </h3>
              <MatrixHeatmap
                rowLabels={matrix.rows.map((r) => r.name)}
                colLabels={matrix.cols.map((c) => CATEGORY_SHORT[c])}
                values={matrix.values}
                max={matrix.max}
                onCell={(r, c) => {
                  setSubjFilter(matrix.rows[r].id);
                  setCatFilter(matrix.cols[c]);
                  setTopicKey(null);
                }}
              />
            </Card>
          </div>

          {/* Log + filters */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-snugg text-paper">
                Mistake log
              </h2>
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper/35" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search mistakes…"
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={catFilter === "all"} onClick={() => setCatFilter("all")}>
                All types
              </Chip>
              {MISTAKE_CATEGORIES.map((c) => (
                <Chip key={c} active={catFilter === c} onClick={() => setCatFilter(c)}>
                  {CATEGORY_SHORT[c]}
                </Chip>
              ))}
              <div className="mx-1 h-4 w-px bg-paper/10" />
              {STATUSES.map((s) => (
                <Chip
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                >
                  {s}
                </Chip>
              ))}
              {activeFilters > 0 && (
                <button
                  onClick={() => {
                    setCatFilter("all");
                    setSubjFilter("all");
                    setStatusFilter("all");
                    setTopicKey(null);
                  }}
                  className="ml-1 text-xs text-paper/45 hover:text-paper"
                >
                  Clear ({activeFilters})
                </button>
              )}
            </div>

            {topicKey && (
              <p className="text-xs text-paper/45">
                Showing recurring topic — {filtered.length} mistakes
              </p>
            )}

            <div className="space-y-2.5">
              {filtered.map((m) => {
                const isOpen = expanded.has(m.id);
                return (
                  <Card key={m.id} className="group overflow-hidden">
                    <button
                      onClick={() => toggle(m.id)}
                      className="flex w-full items-start gap-3 p-4 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="default">{m.category}</Badge>
                          <span className="text-xs text-paper/55">
                            {subjectName(m.subjectId)}
                          </span>
                          <span className="text-xs text-paper/30">· {m.topic}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.6rem] font-medium",
                              m.status === "Mastered"
                                ? "bg-paper text-ink"
                                : m.status === "Reviewing"
                                  ? "bg-paper/15 text-paper"
                                  : "border border-paper/15 text-paper/50",
                            )}
                          >
                            {m.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-paper/80">
                          {m.question || m.topic}
                        </p>
                        <p className="mt-1.5 text-[0.7rem] text-paper/35">
                          {formatDate(m.date)}
                          {m.status !== "Mastered" &&
                            ` · next review ${relativeDay(m.nextReview, today)}`}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "mt-1 h-4 w-4 shrink-0 text-paper/30 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {isOpen && (
                      <div className="space-y-3 border-t border-paper/[0.06] px-4 py-4">
                        {m.userAnswer && (
                          <div>
                            <p className="text-[0.65rem] uppercase tracking-wider text-paper/35">
                              Your answer
                            </p>
                            <p className="text-sm text-paper/60 line-through decoration-paper/30">
                              {m.userAnswer}
                            </p>
                          </div>
                        )}
                        {m.correctAnswer && (
                          <div>
                            <p className="text-[0.65rem] uppercase tracking-wider text-paper/45">
                              Correct answer
                            </p>
                            <p className="text-sm font-medium text-paper">
                              {m.correctAnswer}
                            </p>
                          </div>
                        )}
                        {m.explanation && (
                          <div>
                            <p className="text-[0.65rem] uppercase tracking-wider text-paper/35">
                              Explanation
                            </p>
                            <p className="text-sm leading-relaxed text-paper/60">
                              {m.explanation}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => cycleStatus(m)}
                            className="rounded-full border border-paper/12 px-3 py-1 text-xs text-paper/60 transition-colors hover:border-paper/25 hover:text-paper"
                          >
                            {m.status} ›
                          </button>
                          <div className="flex items-center gap-2 text-[0.7rem] text-paper/35">
                            <span>{m.source}</span>
                            <button
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: "Delete this mistake?",
                                    description:
                                      "It will be removed from your log and review queue.",
                                    confirmLabel: "Delete",
                                  })
                                )
                                  remove(m.id);
                              }}
                              className="text-paper/30 transition-colors hover:text-paper"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-paper/40">
                  No mistakes match these filters.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Composer */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a mistake"
        description="Capture it as a learning asset — question, your answer, the correction."
        className="sm:max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft.topic.trim() && !draft.question?.trim()) return;
                if (
                  await confirm({
                    title: "Save this mistake?",
                    description:
                      "It will be logged as a learning asset and scheduled for review.",
                    tone: "default",
                    confirmLabel: "Save mistake",
                  })
                ) {
                  upsert(draft);
                  setOpen(false);
                }
              }}
            >
              Save mistake
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Subject">
              <Select
                value={draft.subjectId}
                onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Error category">
              <Select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as MistakeCategory })
                }
              >
                {MISTAKE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Topic">
              <Input
                value={draft.topic}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                placeholder="e.g. Anti-Defection Law"
              />
            </Field>
            <Field label="Source">
              <Input
                value={draft.source ?? ""}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="e.g. Prelims FLT #12"
              />
            </Field>
          </div>
          <Field label="Question">
            <Textarea
              value={draft.question ?? ""}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="What was asked?"
              className="min-h-[64px]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Your answer">
              <Input
                value={draft.userAnswer ?? ""}
                onChange={(e) => setDraft({ ...draft, userAnswer: e.target.value })}
                placeholder="What you marked"
              />
            </Field>
            <Field label="Correct answer">
              <Input
                value={draft.correctAnswer ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, correctAnswer: e.target.value })
                }
                placeholder="The right answer"
              />
            </Field>
          </div>
          <Field label="Explanation / takeaway">
            <Textarea
              value={draft.explanation ?? ""}
              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
              placeholder="Why the correct answer is right — and how you'll remember it."
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
