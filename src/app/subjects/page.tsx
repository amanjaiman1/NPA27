"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Search,
  Repeat,
  AlarmClock,
  TriangleAlert,
  Snowflake,
  Target,
  NotebookPen,
  CheckSquare,
  Square,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { PaperCode, Subject, Topic, TopicStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, Segmented, Chip } from "@/components/ui/misc";
import { RadialProgress, Progress } from "@/components/ui/progress";
import { hoursBySubject } from "@/lib/selectors";
import { newRevisionItem } from "@/lib/revision";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  PAPER_ORDER,
  PAPER_LABEL,
  STALE_AFTER_DAYS,
  buildLinkage,
  linkageFor,
  rollupSubject,
  weakestTopics,
  staleTopics,
  coverageByPaper,
  syllabusStats,
  daysSinceTouched,
  isStale,
  type LinkageIndex,
} from "@/lib/subjects";
import { toISODate, formatDate, uid, cn } from "@/lib/utils";

const STATUS_SHADE: Record<TopicStatus, string> = {
  untouched: "bg-paper/10",
  learning: "bg-accent/30",
  revised: "bg-accent/60",
  mastered: "bg-accent",
};

function emptySubject(): Subject {
  return { id: "", name: "", paper: "GS1", topics: [], weightage: undefined };
}

/** The four statuses as explicit choices, so progress is set rather than cycled. */
function StatusPicker({
  value,
  onChange,
  size = "md",
}: {
  value: TopicStatus;
  onChange: (s: TopicStatus) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {STATUS_ORDER.map((st) => (
        <button
          key={st}
          type="button"
          onClick={() => onChange(st)}
          aria-label={STATUS_LABEL[st]}
          aria-pressed={value === st}
          title={STATUS_LABEL[st]}
          className={cn(
            "rounded-md border transition-colors",
            size === "sm" ? "h-4 w-4" : "h-5 w-5",
            STATUS_SHADE[st],
            value === st
              ? "border-paper/60 ring-1 ring-paper/30"
              : "border-transparent opacity-45 hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
}

function TopicRow({
  subject,
  topic,
  linkage,
  today,
  selecting,
  selected,
  onToggleSelect,
}: {
  subject: Subject;
  topic: Topic;
  linkage: LinkageIndex;
  today: string;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const setProgress = useChronicle((s) => s.setTopicProgress);
  const updateTopic = useChronicle((s) => s.updateTopic);
  const deleteTopic = useChronicle((s) => s.deleteTopic);
  const upsertRevision = useChronicle((s) => s.upsertRevision);
  const confirm = useConfirm();

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(topic.name);

  const l = linkageFor(linkage, subject.id, topic.name);
  const since = daysSinceTouched(topic, today);
  const stale = isStale(topic, today);

  async function del() {
    if (
      await confirm({
        title: "Delete this topic?",
        description: `"${topic.name}" will be removed from ${subject.name}, along with any knowledge-graph links to it.`,
        confirmLabel: "Delete topic",
      })
    )
      deleteTopic(subject.id, topic.id);
  }

  function commitRename() {
    const clean = name.trim();
    if (clean && clean !== topic.name) updateTopic(subject.id, topic.id, { name: clean });
    else setName(topic.name);
    setRenaming(false);
  }

  return (
    <div className="group/topic rounded-xl px-2 py-2 transition-colors hover:bg-paper/[0.03]">
      <div className="flex items-center gap-2.5">
        {selecting && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-label={selected ? `Deselect ${topic.name}` : `Select ${topic.name}`}
            className="shrink-0 text-paper/40 transition-colors hover:text-paper"
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-accent" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        )}

        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(topic.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-accent/40 bg-paper/[0.04] px-2 py-1 text-sm text-paper outline-none"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setRenaming(true)}
            className="min-w-0 flex-1 truncate text-left text-sm text-paper/80"
            title="Double-click to rename"
          >
            {topic.name}
          </button>
        )}

        {/* linkage, so the topic's history elsewhere is visible here */}
        <div className="flex shrink-0 items-center gap-1.5">
          {l.openMistakes > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-danger"
              title={`${l.openMistakes} open mistake${l.openMistakes === 1 ? "" : "s"}`}
            >
              <TriangleAlert className="h-2.5 w-2.5" />
              {l.openMistakes}
            </span>
          )}
          {l.revisions > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold",
                l.revisionDue
                  ? "bg-warning/15 text-warning"
                  : "bg-accent/15 text-accent",
              )}
              title={
                l.revisionDue
                  ? "On the revision queue and due now"
                  : "On the revision queue"
              }
            >
              {l.revisionDue ? (
                <AlarmClock className="h-2.5 w-2.5" />
              ) : (
                <Repeat className="h-2.5 w-2.5" />
              )}
              {l.revisions}
            </span>
          )}
          {l.journalMentions > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[0.6rem] text-paper/35"
              title={`Named in ${l.journalMentions} journal entr${l.journalMentions === 1 ? "y" : "ies"}`}
            >
              <NotebookPen className="h-2.5 w-2.5" />
              {l.journalMentions}
            </span>
          )}
          {stale && (
            <span
              className="inline-flex items-center gap-0.5 text-[0.6rem] text-paper/35"
              title={`Not touched for ${since} days`}
            >
              <Snowflake className="h-2.5 w-2.5" />
              {since}d
            </span>
          )}
        </div>

        <StatusPicker
          value={topic.status}
          onChange={(st) => setProgress(subject.id, topic.id, st)}
        />

        <span className="tabular w-9 shrink-0 text-right text-[0.7rem] text-paper/50">
          {topic.confidence}%
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          {l.revisions === 0 && (
            <button
              onClick={() =>
                upsertRevision(newRevisionItem(subject.id, topic.name))
              }
              aria-label={`Add ${topic.name} to the revision queue`}
              title="Add to the revision queue"
              className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-accent sm:opacity-0 sm:group-hover/topic:opacity-100"
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${topic.name}`}
            title="Rename topic"
            className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover/topic:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={del}
            aria-label={`Delete ${topic.name}`}
            title="Delete topic"
            className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover/topic:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Confidence is its own reading, not a by-product of the status. */}
      <div className="mt-1.5 flex items-center gap-2.5 pl-1 pr-1">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={topic.confidence}
          onChange={(e) =>
            setProgress(
              subject.id,
              topic.id,
              topic.status,
              parseInt(e.target.value, 10),
            )
          }
          aria-label={`Confidence in ${topic.name}`}
          className="h-1 flex-1 cursor-pointer accent-accent"
        />
        <span className="w-24 shrink-0 text-right text-[0.62rem] text-paper/35">
          {topic.revisionCount > 0 && `${topic.revisionCount}× revised`}
          {topic.revisionCount > 0 && topic.lastTouched && " · "}
          {topic.lastTouched && formatDate(topic.lastTouched)}
        </span>
      </div>
    </div>
  );
}

function SubjectCard({
  subject,
  hours,
  linkage,
  today,
  onEdit,
}: {
  subject: Subject;
  hours: number;
  linkage: LinkageIndex;
  today: string;
  onEdit: () => void;
}) {
  const addTopic = useChronicle((s) => s.addTopic);
  const setTopicsStatus = useChronicle((s) => s.setTopicsStatus);
  const deleteSubject = useChronicle((s) => s.deleteSubject);
  const revisions = useChronicle((s) => s.revisions);
  const mistakes = useChronicle((s) => s.mistakes);
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | TopicStatus>("all");

  const r = rollupSubject(subject, hours, linkage, today);

  const shown = subject.topics.filter(
    (t) => statusFilter === "all" || t.status === statusFilter,
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitAdd() {
    const clean = adding.trim();
    if (!clean) return;
    addTopic(subject.id, clean);
    setAdding("");
  }

  async function removeSubject() {
    const linkedRevisions = revisions.filter((x) => x.subjectId === subject.id).length;
    const linkedMistakes = mistakes.filter((x) => x.subjectId === subject.id).length;
    const extras = [
      linkedRevisions ? `${linkedRevisions} revision item${linkedRevisions === 1 ? "" : "s"}` : null,
      linkedMistakes ? `${linkedMistakes} logged mistake${linkedMistakes === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    if (
      await confirm({
        title: `Delete ${subject.name}?`,
        description:
          `Its ${subject.topics.length} topic${subject.topics.length === 1 ? "" : "s"} will go with it` +
          (extras.length ? `, along with ${extras.join(" and ")}.` : ".") +
          " Journal hours already logged against it are kept.",
        confirmLabel: "Delete subject",
      })
    )
      deleteSubject(subject.id);
  }

  return (
    <Card className="group overflow-hidden">
      <div className="flex items-center gap-4 p-5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
          aria-expanded={open}
        >
          <RadialProgress value={r.mastery} size={56} stroke={5} label={`${r.mastery}`} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-paper">
              {subject.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-paper/40">
              {r.topics} topic{r.topics === 1 ? "" : "s"} · {Math.round(r.hours)}h studied
              {r.counts.mastered > 0 && ` · ${r.counts.mastered} mastered`}
            </p>
            <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-paper/[0.06]">
              {STATUS_ORDER.map((st) =>
                r.counts[st] ? (
                  <div
                    key={st}
                    className={STATUS_SHADE[st]}
                    style={{ width: `${(r.counts[st] / Math.max(1, r.topics)) * 100}%` }}
                    title={`${r.counts[st]} ${STATUS_LABEL[st].toLowerCase()}`}
                  />
                ) : null,
              )}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            {r.revisionDue > 0 && (
              <Badge tone="warning">{r.revisionDue} due</Badge>
            )}
            {r.withOpenMistakes > 0 && (
              <Badge tone="danger">{r.withOpenMistakes} shaky</Badge>
            )}
            {r.stale > 0 && r.revisionDue === 0 && r.withOpenMistakes === 0 && (
              <Badge tone="ghost">{r.stale} cold</Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onEdit}
              aria-label={`Edit ${subject.name}`}
              title="Edit subject"
              className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={removeSubject}
              aria-label={`Delete ${subject.name}`}
              title="Delete subject"
              className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Collapse" : "Expand"}
              className="grid h-7 w-7 place-items-center rounded-lg text-paper/30"
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
              />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-paper/[0.06] px-4 py-4">
          {/* toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All {r.topics}
            </Chip>
            {STATUS_ORDER.map((st) =>
              r.counts[st] ? (
                <Chip
                  key={st}
                  active={statusFilter === st}
                  onClick={() => setStatusFilter(st)}
                >
                  {STATUS_LABEL[st]} {r.counts[st]}
                </Chip>
              ) : null,
            )}
            <button
              onClick={() => {
                setSelecting((v) => !v);
                setSelected(new Set());
              }}
              className={cn(
                "ml-auto rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors",
                selecting
                  ? "border-accent/35 bg-accent/15 text-accent"
                  : "border-line text-paper/55 hover:text-paper",
              )}
            >
              {selecting ? "Done" : "Select"}
            </button>
          </div>

          {/* bulk bar */}
          {selecting && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.05] p-2.5">
              <span className="text-[0.72rem] font-semibold text-paper/70">
                {selected.size} selected
              </span>
              <button
                onClick={() => setSelected(new Set(shown.map((t) => t.id)))}
                className="text-[0.7rem] font-medium text-accent hover:underline"
              >
                Select all {shown.length}
              </button>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-[0.68rem] text-paper/45">Mark as</span>
                {STATUS_ORDER.map((st) => (
                  <button
                    key={st}
                    disabled={selected.size === 0}
                    onClick={() => {
                      setTopicsStatus(subject.id, [...selected], st);
                      setSelected(new Set());
                    }}
                    className={cn(
                      "rounded-full border border-line px-2.5 py-1 text-[0.68rem] font-medium transition-colors",
                      selected.size === 0
                        ? "text-paper/25"
                        : "text-paper/65 hover:border-paper/25 hover:text-paper",
                    )}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </span>
            </div>
          )}

          {shown.length === 0 ? (
            <p className="py-4 text-center text-sm text-paper/40">
              {subject.topics.length === 0
                ? "No topics yet — add the first one below."
                : "No topics with that status."}
            </p>
          ) : (
            <div className="space-y-0.5">
              {shown.map((t) => (
                <TopicRow
                  key={t.id}
                  subject={subject}
                  topic={t}
                  linkage={linkage}
                  today={today}
                  selecting={selecting}
                  selected={selected.has(t.id)}
                  onToggleSelect={() => toggle(t.id)}
                />
              ))}
            </div>
          )}

          {/* add a topic */}
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAdd();
              }}
              placeholder="Add a topic…"
              className="flex-1"
            />
            <Button variant="ghost" onClick={submitAdd} disabled={!adding.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

type Sort = "weakest" | "strongest" | "name" | "hours" | "topics";

export default function SubjectsPage() {
  const hydrated = useHasHydrated();
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const revisions = useChronicle((s) => s.revisions);
  const mistakes = useChronicle((s) => s.mistakes);
  const upsertSubject = useChronicle((s) => s.upsertSubject);
  const upsertRevision = useChronicle((s) => s.upsertRevision);
  const confirm = useConfirm();

  const today = toISODate(new Date());
  const [paper, setPaper] = useState<"all" | PaperCode>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("weakest");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Subject>(emptySubject());

  const hoursMap = useMemo(() => {
    const m = new Map<string, number>();
    hoursBySubject(journal, subjects).forEach((s) => m.set(s.subjectId, s.hours));
    return m;
  }, [journal, subjects]);

  const linkage = useMemo(
    () => buildLinkage(revisions, mistakes, journal, today),
    [revisions, mistakes, journal, today],
  );
  const stats = useMemo(() => syllabusStats(subjects, today), [subjects, today]);
  const coverage = useMemo(() => coverageByPaper(subjects), [subjects]);
  const weakest = useMemo(
    () => weakestTopics(subjects, linkage, today, 6),
    [subjects, linkage, today],
  );
  const cold = useMemo(() => staleTopics(subjects, today, 6), [subjects, today]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = subjects.filter((s) => {
      if (paper !== "all" && s.paper !== paper) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.topics.some((t) => t.name.toLowerCase().includes(q))
      );
    });
    const m = (s: Subject) =>
      s.topics.length
        ? s.topics.reduce((a, t) => a + t.confidence, 0) / s.topics.length
        : 0;
    if (sort === "weakest") return [...list].sort((a, b) => m(a) - m(b));
    if (sort === "strongest") return [...list].sort((a, b) => m(b) - m(a));
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "topics")
      return [...list].sort((a, b) => b.topics.length - a.topics.length);
    return [...list].sort(
      (a, b) => (hoursMap.get(b.id) ?? 0) - (hoursMap.get(a.id) ?? 0),
    );
  }, [subjects, paper, query, sort, hoursMap]);

  if (!hydrated) return <Loading />;

  function openAdd() {
    setDraft(emptySubject());
    setEditing(false);
    setOpen(true);
  }
  function openEdit(s: Subject) {
    setDraft({ ...s });
    setEditing(true);
    setOpen(true);
  }
  async function saveSubject() {
    const name = draft.name.trim();
    if (!name) return;
    /* A new subject needs a stable slug id, since revisions, mistakes, journal
       blocks and goals all reference subjects by it. */
    const id = editing
      ? draft.id
      : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
        uid("sub");
    if (!editing && subjects.some((s) => s.id === id)) {
      await confirm({
        title: "That subject already exists",
        description: `"${name}" would collide with a subject you already have. Rename it, or edit the existing one.`,
        tone: "default",
        confirmLabel: "Got it",
      });
      return;
    }
    if (
      await confirm({
        title: editing ? "Save changes to this subject?" : "Add this subject?",
        description: editing
          ? "The subject will be updated."
          : `"${name}" will be added to your syllabus.`,
        tone: "default",
        confirmLabel: editing ? "Save changes" : "Add subject",
      })
    ) {
      upsertSubject({ ...draft, id, name });
      setOpen(false);
    }
  }

  const groups = PAPER_ORDER.filter((p) => visible.some((s) => s.paper === p));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subject Progress"
        title="The syllabus, mastered piece by piece."
        description="Every subject from untouched to mastered. Add and edit topics, set confidence directly, and send anything shaky straight to the revision queue."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> New subject
          </Button>
        }
      />

      {/* Overall */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-4 p-5">
          <RadialProgress
            value={stats.mastery}
            size={68}
            stroke={6}
            label={`${stats.mastery}%`}
            sublabel="overall"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-paper">Syllabus confidence</p>
            <p className="text-xs text-paper/45">across {stats.topics} topics</p>
          </div>
        </Card>
        <Card className="flex flex-col justify-center p-5">
          <p className="tabular text-2xl font-semibold text-paper">
            {stats.mastered}
            <span className="text-base font-normal text-paper/40">
              /{stats.topics}
            </span>
          </p>
          <p className="mt-1 text-xs text-paper/45">topics mastered</p>
          <Progress value={(stats.mastered / Math.max(1, stats.topics)) * 100} className="mt-2" />
        </Card>
        <Card className="flex flex-col justify-center p-5">
          <p className="tabular text-2xl font-semibold text-paper">
            {Math.round(stats.solidShare * 100)}%
          </p>
          <p className="mt-1 text-xs text-paper/45">revised or better</p>
          <Progress value={stats.solidShare * 100} className="mt-2" />
        </Card>
        <Card className="flex flex-col justify-center p-5">
          <p className="tabular text-2xl font-semibold text-paper">{stats.stale}</p>
          <p className="mt-1 text-xs text-paper/45">
            untouched for {STALE_AFTER_DAYS}+ days
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-paper/35">
            <Snowflake className="h-3 w-3" />
            {stats.untouched} never opened
          </div>
        </Card>
      </div>

      {/* Status spread */}
      {stats.topics > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-snugg text-paper">
              Where the syllabus stands
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {STATUS_ORDER.map((st) => (
                <span
                  key={st}
                  className="inline-flex items-center gap-1.5 text-[0.7rem] text-paper/50"
                >
                  <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_SHADE[st])} />
                  {STATUS_LABEL[st]}
                  <span className="tabular font-semibold text-paper/70">
                    {stats.counts[st]}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper/[0.06]">
            {STATUS_ORDER.map((st) =>
              stats.counts[st] ? (
                <div
                  key={st}
                  className={STATUS_SHADE[st]}
                  style={{ width: `${(stats.counts[st] / stats.topics) * 100}%` }}
                />
              ) : null,
            )}
          </div>
        </Card>
      )}

      {/* What needs attention */}
      {(weakest.length > 0 || cold.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold tracking-snugg text-paper">
                Weakest ground
              </h2>
            </div>
            <p className="mb-3 text-xs text-paper/45">
              Lowest confidence first, with anything you&rsquo;ve actually got wrong
              pulled forward.
            </p>
            <ul className="space-y-1.5">
              {weakest.map((w) => (
                <li
                  key={`${w.subjectId}-${w.topic.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm"
                >
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-sm", STATUS_SHADE[w.topic.status])}
                  />
                  <span className="min-w-0 flex-1 truncate text-paper/80">
                    {w.topic.name}
                    <span className="ml-1.5 text-[0.68rem] text-paper/35">
                      {w.subjectName}
                    </span>
                  </span>
                  {w.linkage.openMistakes > 0 && (
                    <Badge tone="danger">{w.linkage.openMistakes} wrong</Badge>
                  )}
                  <span className="tabular w-9 shrink-0 text-right text-[0.7rem] text-paper/50">
                    {w.topic.confidence}%
                  </span>
                  {w.linkage.revisions === 0 && (
                    <button
                      onClick={() =>
                        upsertRevision(newRevisionItem(w.subjectId, w.topic.name))
                      }
                      title="Add to the revision queue"
                      aria-label={`Add ${w.topic.name} to the revision queue`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-paper/30 transition-colors hover:bg-paper/[0.06] hover:text-accent"
                    >
                      <Repeat className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-paper/45" />
              <h2 className="text-sm font-semibold tracking-snugg text-paper">
                Gone cold
              </h2>
            </div>
            <p className="mb-3 text-xs text-paper/45">
              Studied once and left alone for {STALE_AFTER_DAYS}+ days.
            </p>
            {cold.length === 0 ? (
              <p className="py-6 text-center text-sm text-paper/40">
                Nothing has been left that long.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {cold.map((w) => (
                  <li
                    key={`${w.subjectId}-${w.topic.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm"
                  >
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-sm", STATUS_SHADE[w.topic.status])}
                    />
                    <span className="min-w-0 flex-1 truncate text-paper/80">
                      {w.topic.name}
                      <span className="ml-1.5 text-[0.68rem] text-paper/35">
                        {w.subjectName}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[0.7rem] text-paper/45">
                      {w.staleDays}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Coverage by paper */}
      {coverage.length > 1 && (
        <Card className="overflow-hidden">
          <div className="p-5 pb-3">
            <p className="eyebrow mb-1">Coverage</p>
            <h2 className="text-base font-semibold text-paper">Paper by paper</h2>
          </div>
          <ul className="divide-y divide-line">
            {coverage.map((c) => (
              <li key={c.paper} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-paper/80">
                  {c.label}
                </span>
                <span className="tabular w-20 shrink-0 text-right text-[0.72rem] text-paper/45">
                  {c.mastered}/{c.topics} done
                </span>
                <div className="w-24 shrink-0">
                  <Progress value={c.mastery} />
                </div>
                <span className="tabular w-10 shrink-0 text-right text-sm font-semibold text-paper">
                  {c.mastery}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Filters */}
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subjects and topics…"
              className="pl-10"
            />
          </div>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="sm:w-48"
          >
            <option value="weakest">Weakest first</option>
            <option value="strongest">Strongest first</option>
            <option value="name">By name</option>
            <option value="hours">Most hours</option>
            <option value="topics">Most topics</option>
          </Select>
        </div>
        <div className="no-scrollbar overflow-x-auto px-0.5">
          <Segmented
            value={paper}
            onChange={(v) => setPaper(v as "all" | PaperCode)}
            options={[
              { label: "All", value: "all" },
              ...PAPER_ORDER.filter((p) => subjects.some((s) => s.paper === p)).map(
                (p) => ({ label: p, value: p }),
              ),
            ]}
          />
        </div>
      </div>

      {/* The syllabus */}
      {subjects.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title="No subjects yet"
          description="Add the first subject, then fill in its topics."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> New subject
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Nothing matches"
          description="Try another paper, or clear the search."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((p) => {
            const subs = visible.filter((s) => s.paper === p);
            return (
              <div key={p}>
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-paper/40" />
                  <h2 className="text-sm font-semibold tracking-snugg text-paper">
                    {PAPER_LABEL[p]}
                  </h2>
                  <Badge tone="ghost">{subs.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {subs.map((s) => (
                    <SubjectCard
                      key={s.id}
                      subject={s}
                      hours={hoursMap.get(s.id) ?? 0}
                      linkage={linkage}
                      today={today}
                      onEdit={() => openEdit(s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Where this connects */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-paper/70">
          Confidence here rises on its own when you tick a topic off in the day&rsquo;s
          journal or clear it from the revision queue — and anything you get wrong
          in a mock shows up against the topic it belongs to.
        </p>
        <Link
          href="/revision"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent transition-opacity hover:opacity-80"
        >
          Revision queue <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>

      {/* Subject composer */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit subject" : "New subject"}
        description={
          editing
            ? "Rename it, or move it to a different paper."
            : "Add a subject, then fill in its topics from the card."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSubject} disabled={!draft.name.trim()}>
              {editing ? "Save changes" : "Add subject"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Internal Security"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Paper">
              <Select
                value={draft.paper}
                onChange={(e) =>
                  setDraft({ ...draft, paper: e.target.value as PaperCode })
                }
              >
                {PAPER_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PAPER_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exam weight" hint="Optional, 0–100.">
              <Input
                type="number"
                value={draft.weightage ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    weightage: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                placeholder="—"
              />
            </Field>
          </div>
          <Field label="Description">
            <Input
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Optional one-liner"
            />
          </Field>
          {editing && (
            <p className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-[0.72rem] text-paper/50">
              {draft.topics.length} topic{draft.topics.length === 1 ? "" : "s"} — add,
              rename and delete those from the subject card itself.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
