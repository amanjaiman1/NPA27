"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  BookMarked,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  History,
  ListChecks,
  Repeat,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { TopicStatus } from "@/lib/types";
import {
  EMPTY_TOPIC_QUERY,
  activeTopicFilters,
  buildTopicIndex,
  filterTopics,
  topicSummary,
  type TopicQuery,
  type TopicRecord,
} from "@/lib/topics";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/subjects";
import { newRevisionItem } from "@/lib/revision";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { cn, daysBetween, formatDate, toISODate } from "@/lib/utils";

const PAGE = 40;

const STATUS_TONE: Record<TopicStatus, "outline" | "default" | "accent" | "positive"> = {
  untouched: "outline",
  learning: "default",
  revised: "accent",
  mastered: "positive",
};

/**
 * Every topic the journal says you finished, in one searchable place: where it
 * sits in the syllabus, how often and when you did it, and whether its
 * revision is scheduled. From here a topic opens its subject or its days, and
 * a selection can be put on the revision queue or moved on in the syllabus in
 * one go.
 */
export function TopicsExplorer({ onNewEntry }: { onNewEntry: () => void }) {
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const revisions = useChronicle((s) => s.revisions);
  const mistakes = useChronicle((s) => s.mistakes);
  const upsertRevision = useChronicle((s) => s.upsertRevision);
  const setTopicsStatus = useChronicle((s) => s.setTopicsStatus);
  const today = toISODate(new Date());

  const [query, setQuery] = useState<TopicQuery>(EMPTY_TOPIC_QUERY);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const deferredQ = useDeferredValue(query.q);

  const index = useMemo(
    () => buildTopicIndex(journal, subjects, revisions, mistakes, today),
    [journal, subjects, revisions, mistakes, today],
  );
  const summary = useMemo(() => topicSummary(index), [index]);
  const results = useMemo(
    () => filterTopics(index, { ...query, q: deferredQ }, subjects),
    [index, query, deferredQ, subjects],
  );
  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const filters = activeTopicFilters(query);
  const selectedRecords = results.filter((r) => selected.has(r.key));
  const canQueue = selectedRecords.filter((r) => r.subjectId && r.revisionState === "none");
  const canStatus = selectedRecords.filter((r) => r.topicId && r.subjectId);

  function set<K extends keyof TopicQuery>(k: K, v: TopicQuery[K]) {
    setQuery((q) => ({ ...q, [k]: v }));
    setLimit(PAGE);
    setDone(null);
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function queueSelected() {
    for (const r of canQueue) upsertRevision(newRevisionItem(r.subjectId!, r.name, new Date()));
    setDone(`${canQueue.length} topic${canQueue.length === 1 ? "" : "s"} added to the revision queue, due today.`);
    setSelected(new Set());
  }

  function statusSelected(status: TopicStatus) {
    const bySubject = new Map<string, string[]>();
    for (const r of canStatus) {
      const list = bySubject.get(r.subjectId!) ?? [];
      list.push(r.topicId!);
      bySubject.set(r.subjectId!, list);
    }
    for (const [subjectId, ids] of bySubject) setTopicsStatus(subjectId, ids, status);
    setDone(`${canStatus.length} topic${canStatus.length === 1 ? "" : "s"} marked ${STATUS_LABEL[status].toLowerCase()} in the syllabus.`);
    setSelected(new Set());
  }

  if (!index.length) {
    return (
      <EmptyState
        icon={<ListChecks className="h-5 w-5" />}
        title="No completed topics yet"
        description="When you finish a topic, add it to that day's entry. It will show up here with its subject, its history and its revision."
        action={<Button onClick={onNewEntry}>Write today&rsquo;s entry</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SummaryCell label="Topics recorded" value={summary.total} />
        <SummaryCell label="From the syllabus" value={summary.syllabus} hint={`${summary.custom} of your own`} />
        <SummaryCell label="Revision due" value={summary.due} tone={summary.due ? "warning" : undefined} />
        <SummaryCell label="Not scheduled" value={summary.unscheduled} hint="syllabus topics with no revision" />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
            <Input
              value={query.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Search topics, subjects or papers…"
              className="pl-10"
              aria-label="Search completed topics"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={query.sort}
              onChange={(e) => set("sort", e.target.value as TopicQuery["sort"])}
              aria-label="Sort topics"
              className="sm:w-44"
            >
              <option value="recent">Most recent</option>
              <option value="oldest">First finished</option>
              <option value="count">Most often</option>
              <option value="name">A–Z</option>
              <option value="subject">By subject</option>
            </Select>
            <button
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
                showFilters || filters
                  ? "border-paper/25 bg-paper/[0.06] text-paper"
                  : "border-line text-paper/65 hover:border-paper/25 hover:text-paper",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {filters > 0 && (
                <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-paper px-1 text-[0.65rem] font-semibold text-ink">
                  {filters}
                </span>
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterField label="Subject">
              <Select value={query.subjectId} onChange={(e) => set("subjectId", e.target.value)}>
                <option value="all">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Syllabus status">
              <Select value={query.status} onChange={(e) => set("status", e.target.value as TopicQuery["status"])}>
                <option value="all">Any status</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Revision">
              <Select value={query.revision} onChange={(e) => set("revision", e.target.value as TopicQuery["revision"])}>
                <option value="all">Any</option>
                <option value="due">Due now</option>
                <option value="queued">Scheduled</option>
                <option value="none">Not scheduled</option>
              </Select>
            </FilterField>
            <FilterField label="Finished from">
              <Input type="date" value={query.from ?? ""} max={today} onChange={(e) => set("from", e.target.value || undefined)} />
            </FilterField>
            <FilterField label="Finished until">
              <Input type="date" value={query.to ?? ""} max={today} onChange={(e) => set("to", e.target.value || undefined)} />
            </FilterField>
            <FilterField label="Source">
              <Segmented
                value={query.source}
                onChange={(v) => set("source", v)}
                options={[
                  { label: "All", value: "all" },
                  { label: "Syllabus", value: "syllabus" },
                  { label: "Your own", value: "custom" },
                ]}
              />
            </FilterField>
            {filters > 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  onClick={() => setQuery((q) => ({ ...EMPTY_TOPIC_QUERY, q: q.q, sort: q.sort }))}
                  className="text-xs font-semibold text-paper/60 hover:text-paper"
                >
                  Clear filters
                </button>
              </div>
            )}
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-paper/55" role="status">
            {results.length} of {index.length} topic{index.length === 1 ? "" : "s"}
            {query.q && ` matching “${query.q}”`}
          </p>
          {results.length > 0 && (
            <button
              onClick={() =>
                setSelected((prev) =>
                  prev.size === Math.min(results.length, limit)
                    ? new Set()
                    : new Set(results.slice(0, limit).map((r) => r.key)),
                )
              }
              className="text-xs font-semibold text-paper/60 hover:text-paper"
            >
              {selected.size && selected.size === Math.min(results.length, limit) ? "Clear selection" : "Select shown"}
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <Card className="glass-sticky sticky top-20 z-10 flex flex-wrap items-center gap-2 border-accent/30 p-3">
          <span className="text-sm font-semibold text-paper">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={!canQueue.length} onClick={queueSelected}>
              <Repeat className="h-3.5 w-3.5" /> Add {canQueue.length || ""} to revision
            </Button>
            <Button size="sm" variant="outline" disabled={!canStatus.length} onClick={() => statusSelected("revised")}>
              Mark revised
            </Button>
            <Button size="sm" variant="outline" disabled={!canStatus.length} onClick={() => statusSelected("mastered")}>
              Mark mastered
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="grid h-9 w-9 place-items-center rounded-full text-paper/55 hover:bg-paper/[0.06] hover:text-paper"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}
      {done && (
        <p className="text-xs text-positive" role="status">
          {done}
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No topics match"
          description="Try a different search, or clear the filters."
        />
      ) : (
        <ul className="space-y-2">
          {results.slice(0, limit).map((r) => (
            <TopicRow
              key={r.key}
              record={r}
              subject={r.subjectId ? subjectName.get(r.subjectId) : undefined}
              today={today}
              open={open === r.key}
              onToggleOpen={() => setOpen((o) => (o === r.key ? null : r.key))}
              selected={selected.has(r.key)}
              onSelect={() => toggle(r.key)}
            />
          ))}
        </ul>
      )}
      {results.length > limit && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, results.length - limit)} more
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <Card className="p-3.5">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-paper/55">{label}</p>
      <p className={cn("tabular mt-1 font-display text-xl font-bold", tone === "warning" ? "text-warning" : "text-paper")}>
        {value}
      </p>
      {hint && <p className="truncate text-[0.68rem] text-paper/50">{hint}</p>}
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-paper/55">{label}</p>
      {children}
    </div>
  );
}

function TopicRow({
  record: r,
  subject,
  today,
  open,
  onToggleOpen,
  selected,
  onSelect,
}: {
  record: TopicRecord;
  subject?: string;
  today: string;
  open: boolean;
  onToggleOpen: () => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const revisionText = !r.revision ? "Revision not scheduled" : scheduleText(r.revision.nextDue, today);
  return (
    <li>
      <Card className={cn("overflow-hidden transition-colors", selected && "border-accent/40")}>
        <div className="flex items-start gap-3 p-3.5 sm:p-4">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select ${r.name}`}
            className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
          />
          <button type="button" onClick={onToggleOpen} aria-expanded={open} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              {r.source === "syllabus" ? (
                <BookMarked className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="From the syllabus" />
              ) : (
                <CircleDashed className="h-3.5 w-3.5 shrink-0 text-paper/45" aria-label="Your own topic" />
              )}
              <span className="text-sm font-medium text-paper">{r.name}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-paper/55">
              {subject && <span className="truncate">{subject}</span>}
              {r.status && <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  r.revisionState === "due" && "font-semibold text-warning",
                )}
              >
                {r.revisionState === "due" ? <AlarmClock className="h-3 w-3" /> : <Repeat className="h-3 w-3" />}
                {revisionText}
              </span>
              <span className="inline-flex items-center gap-1">
                <History className="h-3 w-3" />
                {r.dates.length > 1 ? `${r.dates.length}× · last ${formatDate(r.last)}` : formatDate(r.last)}
              </span>
              {r.openMistakes > 0 && (
                <span className="inline-flex items-center gap-1 text-danger">
                  <TriangleAlert className="h-3 w-3" /> {r.openMistakes} open mistake{r.openMistakes === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </button>
          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-paper/40 transition-transform", open && "rotate-180")} />
        </div>
        {open && (
          <div className="space-y-3 border-t border-line px-4 py-3.5 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <Detail label="First finished" value={formatDate(r.first)} />
              <Detail
                label="Confidence"
                value={r.confidence != null ? `${r.confidence}%` : "—"}
                hint={r.revisionCount ? `${r.revisionCount} revision${r.revisionCount === 1 ? "" : "s"} counted` : undefined}
              />
              <Detail
                label="Revision ladder"
                value={r.revision ? `Step ${r.revision.repetitions}` : "Not on the queue"}
                hint={r.revision?.lastRevised ? `last revised ${formatDate(r.revision.lastRevised)}` : undefined}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-paper/55">Recorded on</p>
              <div className="flex flex-wrap gap-1.5">
                {[...r.dates].reverse().map((d) => (
                  <Link
                    key={d}
                    href={`/journal/${d}`}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-paper/75 transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    {formatDate(d)}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              {r.subjectId && (
                <Link href={`/subjects?subject=${encodeURIComponent(r.subjectId)}`} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                  Open {subject ?? "subject"} <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {r.revisionState !== "none" && (
                <Link href="/revision" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                  Revision queue <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}

function scheduleText(nextDue: string, today: string): string {
  if (nextDue < today) {
    const late = daysBetween(nextDue, today);
    return `Revision ${late} day${late === 1 ? "" : "s"} overdue`;
  }
  if (nextDue === today) return "Revision due today";
  const n = daysBetween(today, nextDue);
  return `Revision in ${n} day${n === 1 ? "" : "s"}`;
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-paper/55">{label}</p>
      <p className="tabular mt-0.5 text-sm text-paper">{value}</p>
      {hint && <p className="text-[0.68rem] text-paper/50">{hint}</p>}
    </div>
  );
}
