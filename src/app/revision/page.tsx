"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  X,
  Repeat,
  AlarmClock,
  CalendarClock,
  Gauge,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Search,
  NotebookPen,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { RevisionItem } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, RatingPicker } from "@/components/ui/form";
import { EmptyState, Chip } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import {
  bucketRevisions,
  revisionStats,
  revisionForecast,
  subjectBreakdown,
  confidenceSpread,
  describeSchedule,
  newRevisionItem,
  resolveTopicId,
  SR_INTERVALS,
} from "@/lib/revision";
import { toISODate, formatDate, cn } from "@/lib/utils";

function ConfidencePips({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" title={`Confidence ${value}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < value ? "bg-accent" : "bg-paper/15",
          )}
        />
      ))}
    </span>
  );
}

type Filter = "all" | "overdue" | "weak";

export default function RevisionPage() {
  const hydrated = useHasHydrated();
  const revisions = useChronicle((s) => s.revisions);
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const revise = useChronicle((s) => s.reviseItem);
  const upsert = useChronicle((s) => s.upsertRevision);
  const remove = useChronicle((s) => s.deleteRevision);
  const confirm = useConfirm();

  const today = toISODate(new Date());
  const [query, setQuery] = useState("");
  const [subjectId, setSubjectId] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RevisionItem>(() => newRevisionItem("", ""));
  const [editing, setEditing] = useState(false);

  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  /**
   * Which items a journal entry has ticked off, and when. This is what makes the
   * link visible from this side: an item revised through the diary says so,
   * rather than looking like it moved on its own.
   */
  const viaJournal = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of journal) {
      for (const s of e.revisionSessions ?? []) {
        if (!s.revisionItemId) continue;
        const prev = m.get(s.revisionItemId);
        if (!prev || e.date > prev) m.set(s.revisionItemId, e.date);
      }
    }
    return m;
  }, [journal]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return revisions.filter((r) => {
      if (subjectId !== "all" && r.subjectId !== subjectId) return false;
      if (filter === "overdue" && r.nextDue >= today) return false;
      if (filter === "weak" && r.confidence > 2) return false;
      if (!q) return true;
      return (
        r.topic.toLowerCase().includes(q) || name(r.subjectId).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisions, query, subjectId, filter, today, subjects]);

  const stats = useMemo(() => revisionStats(revisions, today), [revisions, today]);
  const forecast = useMemo(() => revisionForecast(revisions, today, 14), [revisions, today]);
  const bySubject = useMemo(
    () => subjectBreakdown(revisions, subjects, today),
    [revisions, subjects, today],
  );
  const spread = useMemo(() => confidenceSpread(revisions), [revisions]);
  const { overdue, dueToday, upcoming } = useMemo(
    () => bucketRevisions(visible, today),
    [visible, today],
  );

  if (!hydrated) return <Loading />;

  function openAdd() {
    setDraft(newRevisionItem(subjects[0]?.id ?? "", ""));
    setEditing(false);
    setOpen(true);
  }
  function openEdit(item: RevisionItem) {
    setDraft({ ...item });
    setEditing(true);
    setOpen(true);
  }
  async function save() {
    if (!draft.topic.trim() || !draft.subjectId) return;
    if (
      await confirm({
        title: editing ? "Save changes to this item?" : "Add to the revision queue?",
        description: editing
          ? "The item will be updated."
          : `"${draft.topic.trim()}" will be scheduled for revision.`,
        tone: "default",
        confirmLabel: editing ? "Save changes" : "Add item",
      })
    ) {
      upsert({ ...draft, topic: draft.topic.trim() });
      setOpen(false);
    }
  }
  async function del(item: RevisionItem) {
    if (
      await confirm({
        title: "Remove from the revision queue?",
        description: `"${item.topic}" and its schedule history will be deleted.`,
        confirmLabel: "Remove item",
      })
    )
      remove(item.id);
  }

  /** One row of the queue. */
  function Row({ r, tone }: { r: RevisionItem; tone: "overdue" | "today" | "ahead" }) {
    const journalDate = viaJournal.get(r.id);
    const loggedHere = journalDate && journalDate === r.lastRevised;
    const linkedTopic = resolveTopicId(r, subjects);
    return (
      <Card className="group flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[0.6rem] font-semibold",
                tone === "overdue"
                  ? "bg-danger/15 text-danger"
                  : "bg-paper/[0.06] text-paper/60",
              )}
            >
              R{r.repetitions}
            </span>
            <p className="min-w-0 truncate text-sm font-medium text-paper">{r.topic}</p>
            {loggedHere && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[0.62rem] font-semibold text-accent"
                title={`Logged in your journal on ${formatDate(journalDate!)}`}
              >
                <NotebookPen className="h-3 w-3" /> via journal
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-[0.7rem] text-paper/45">
            <span className="max-w-full truncate">{name(r.subjectId)}</span>
            <ConfidencePips value={r.confidence} />
            <span className={cn(tone === "overdue" && "font-semibold text-danger")}>
              {describeSchedule(r, today)}
            </span>
            <span>
              last: {r.lastRevised ? formatDate(r.lastRevised) : "never"}
            </span>
            {r.intervalDays > 0 && <span>interval {r.intervalDays}d</span>}
            {!linkedTopic && (
              <span
                className="text-paper/30"
                title="This topic name doesn't match a topic in the syllabus, so revising it won't credit the subject tracker."
              >
                unlinked
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {tone !== "ahead" && (
            <>
              <button
                onClick={() => revise(r.id, false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-paper/60 transition-colors hover:border-paper/30 hover:text-paper"
              >
                <X className="h-3.5 w-3.5" /> Forgot
              </button>
              <button
                onClick={() => revise(r.id, true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-opacity hover:opacity-90"
              >
                <Check className="h-3.5 w-3.5" /> Recalled
              </button>
            </>
          )}
          <button
            onClick={() => openEdit(r)}
            aria-label={`Edit ${r.topic}`}
            title="Edit item"
            className="grid h-8 w-8 place-items-center rounded-lg text-paper/30 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => del(r)}
            aria-label={`Remove ${r.topic}`}
            title="Remove item"
            className="grid h-8 w-8 place-items-center rounded-lg text-paper/30 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </Card>
    );
  }

  const maxSpread = Math.max(...spread.map((s) => s.count), 1);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revision Tracker"
        title="The exam is won in revision."
        description="Spaced repetition turns fragile memory into permanent recall. Tick items off here, or straight from the day's journal entry — either way the next pass reschedules itself."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            icon: AlarmClock,
            label: "Overdue",
            value: `${stats.overdue}`,
            hint: stats.worstOverdueDays
              ? `worst ${stats.worstOverdueDays}d late`
              : "nothing late",
            danger: stats.overdue > 0,
          },
          {
            icon: Repeat,
            label: "Due today",
            value: `${stats.dueToday}`,
            hint: `${stats.dueNow} to clear in total`,
          },
          {
            icon: CalendarClock,
            label: "Next 7 days",
            value: `${stats.next7}`,
            hint: `${stats.total} items tracked`,
          },
          {
            icon: Gauge,
            label: "Avg confidence",
            value: `${stats.avgConfidence}/5`,
            hint: `${Math.round(stats.strongShare * 100)}% at 4 or better`,
          },
        ].map((s) => (
          <Card key={s.label} className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-paper/45">
              <s.icon className={cn("h-4 w-4", s.danger && "text-danger")} />
              <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-[0.08em]">
                {s.label}
              </span>
            </div>
            <p
              className={cn(
                "tabular mt-2 font-display text-[1.6rem] font-bold leading-none tracking-tightest",
                s.danger ? "text-danger" : "text-paper",
              )}
            >
              {s.value}
            </p>
            <p className="mt-1 truncate text-[0.7rem] text-paper/45">{s.hint}</p>
          </Card>
        ))}
      </div>

      {revisions.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title="Nothing on the revision queue yet"
          description="Add a topic you want to keep, and the schedule takes it from there — one day, then three, a week, a fortnight, a month."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add your first item
            </Button>
          }
        />
      ) : (
        <>
          {/* The load ahead */}
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="p-5 sm:p-6 lg:col-span-2">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="eyebrow mb-1">The fortnight ahead</p>
                  <h2 className="text-base font-semibold text-paper">
                    Items falling due
                  </h2>
                </div>
                {stats.overdue > 0 && (
                  <Badge tone="danger">
                    {stats.overdue} overdue folded into today
                  </Badge>
                )}
              </div>
              <BarChart
                data={forecast.map((f) => ({
                  label: f.label,
                  value: f.count,
                  sublabel: `${formatDate(f.date)}${f.overdue ? ` · ${f.overdue} overdue` : ""}`,
                }))}
                height={170}
                formatValue={(v) => `${v} item${v === 1 ? "" : "s"}`}
              />
            </Card>

            <Card className="p-5 sm:p-6">
              <p className="eyebrow mb-1">How well it&rsquo;s sticking</p>
              <h2 className="mb-4 text-base font-semibold text-paper">
                Confidence spread
              </h2>
              <ul className="space-y-2.5">
                {spread
                  .slice()
                  .reverse()
                  .map((s) => (
                    <li key={s.level} className="flex items-center gap-3">
                      <span className="tabular w-6 shrink-0 text-xs text-paper/45">
                        {s.level}/5
                      </span>
                      <div className="min-w-0 flex-1">
                        <Progress value={(s.count / maxSpread) * 100} />
                      </div>
                      <span className="tabular w-8 shrink-0 text-right text-xs font-semibold text-paper">
                        {s.count}
                      </span>
                    </li>
                  ))}
              </ul>
              <div className="mt-4 space-y-1.5 border-t border-line pt-3.5 text-[0.72rem] text-paper/50">
                <p className="flex items-center justify-between gap-2">
                  <span>Never revised</span>
                  <span className="tabular font-semibold text-paper">
                    {stats.untouched}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span>Mature (60-day interval)</span>
                  <span className="tabular font-semibold text-paper">
                    {stats.mature}
                  </span>
                </p>
              </div>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search topics and subjects…"
                className="pl-10"
              />
            </div>
            <Select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="sm:w-52"
            >
              <option value="all">All subjects</option>
              {bySubject.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.name} ({s.total})
                </option>
              ))}
            </Select>
            <div className="flex shrink-0 items-center gap-1.5">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>
              <Chip active={filter === "overdue"} onClick={() => setFilter("overdue")}>
                Overdue
              </Chip>
              <Chip active={filter === "weak"} onClick={() => setFilter("weak")}>
                Shaky
              </Chip>
            </div>
          </div>

          {/* The queue */}
          {overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="Nothing matches this filter"
              description="Try a different subject, or clear the search."
            />
          ) : (
            <div className="space-y-8">
              {overdue.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <AlarmClock className="h-4 w-4 text-danger" />
                    <h2 className="text-sm font-semibold tracking-snugg text-paper">
                      Overdue
                    </h2>
                    <Badge tone="danger">{overdue.length}</Badge>
                    <span className="text-[0.7rem] text-paper/40">
                      the ones actually slipping
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {overdue.map((r) => (
                      <Row key={r.id} r={r} tone="overdue" />
                    ))}
                  </div>
                </section>
              )}

              {dueToday.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-accent" />
                    <h2 className="text-sm font-semibold tracking-snugg text-paper">
                      Due today
                    </h2>
                    <Badge tone="accent">{dueToday.length}</Badge>
                  </div>
                  <div className="space-y-2.5">
                    {dueToday.map((r) => (
                      <Row key={r.id} r={r} tone="today" />
                    ))}
                  </div>
                </section>
              )}

              {overdue.length === 0 && dueToday.length === 0 && (
                <EmptyState
                  icon={<Check className="h-5 w-5" />}
                  title="Inbox zero on revision"
                  description="Nothing is due right now. Come back when the next item ripens."
                />
              )}

              {upcoming.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-paper/45" />
                    <h2 className="text-sm font-semibold tracking-snugg text-paper">
                      Scheduled ahead
                    </h2>
                    <Badge tone="outline">{upcoming.length}</Badge>
                  </div>
                  <div className="space-y-2.5">
                    {upcoming.map((r) => (
                      <Row key={r.id} r={r} tone="ahead" />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Per subject */}
          {bySubject.length > 1 && (
            <Card className="overflow-hidden">
              <div className="p-5 pb-3 sm:px-6">
                <p className="eyebrow mb-1">By subject</p>
                <h2 className="text-base font-semibold text-paper">
                  Where the backlog is
                </h2>
              </div>
              <ul className="divide-y divide-line">
                {bySubject.map((s) => (
                  <li
                    key={s.subjectId}
                    className="flex items-center gap-3 px-5 py-3 sm:px-6"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-paper/80">
                      {s.name}
                    </span>
                    {s.overdue > 0 && <Badge tone="danger">{s.overdue} overdue</Badge>}
                    <span className="tabular w-16 shrink-0 text-right text-[0.72rem] text-paper/45">
                      {s.dueNow} due
                    </span>
                    <span className="tabular w-14 shrink-0 text-right text-[0.72rem] text-paper/45">
                      {s.avgConfidence}/5
                    </span>
                    <span className="tabular w-10 shrink-0 text-right text-sm font-semibold text-paper">
                      {s.total}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Where this connects */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-paper/70">
          The day&rsquo;s journal entry can tick these off for you. Whatever you mark
          as revised there advances its schedule here, and credits the topic in
          your subject tracker.
        </p>
        <Link
          href="/journal"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent transition-opacity hover:opacity-80"
        >
          Open the journal <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>

      {/* Add / edit */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit revision item" : "Add to the revision queue"}
        description={
          editing
            ? "Change what this item tracks, or reschedule it by hand."
            : "New items are due straight away — the ladder starts once you've revised it once."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draft.topic.trim() || !draft.subjectId}>
              {editing ? "Save changes" : "Add item"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Topic">
            <Input
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
              placeholder="e.g. Fundamental Rights"
            />
          </Field>
          <Field
            label="Subject"
            hint="Matching a topic name in the syllabus lets a recall also raise that topic's confidence."
          >
            <Select
              value={draft.subjectId}
              onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}
            >
              <option value="">Choose a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Next due">
              <Input
                type="date"
                value={draft.nextDue}
                onChange={(e) => setDraft({ ...draft, nextDue: e.target.value })}
              />
            </Field>
            <Field label="Confidence">
              <RatingPicker
                value={draft.confidence}
                onChange={(v) => setDraft({ ...draft, confidence: v })}
              />
            </Field>
          </div>
          {editing && (
            <p className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-[0.72rem] text-paper/50">
              {draft.repetitions} successful recall
              {draft.repetitions === 1 ? "" : "s"} so far · current interval{" "}
              {draft.intervalDays}d · the ladder runs{" "}
              {SR_INTERVALS.join(" → ")} days.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
