"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Pencil,
  NotebookPen,
  Search,
  SlidersHorizontal,
  Target,
  Trophy,
  ChevronRight,
  Paperclip,
  ListChecks,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Chip, Segmented } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { JournalComposer } from "@/components/journal/composer";
import { JournalAnalysisView } from "@/components/journal/analysis";
import { TopicsExplorer } from "@/components/journal/topics-explorer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { emptyEntry, toDraft, MOOD_LABELS } from "@/components/journal/constants";
import { completedTopicsOf } from "@/lib/topics";
import { buildFileRefs, describeLinks } from "@/lib/files";
import { toISODate, fromISODate, weekday, formatHours, relativeDay, formatDate, cn } from "@/lib/utils";

type Sort = "newest" | "oldest";
type Tab = "entries" | "topics" | "analysis";

/** Months are rendered a few at a time, so a year of entries doesn't all mount at once. */
const PAGE = 45;

export default function JournalPage() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const files = useChronicle((s) => s.files);
  const goals = useChronicle((s) => s.goals);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const deleteJournal = useChronicle((s) => s.deleteJournal);
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<JournalEntry>(emptyEntry());
  const [tab, setTab] = useState<Tab>("entries");

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [subject, setSubject] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [toggles, setToggles] = useState({ mock: false, wins: false, files: false });
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // ?new=1 opens today's entry; ?tab=topics opens the topics view. Only once
  // the store has hydrated, or today's entry wouldn't be found yet.
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "topics" || params.get("tab") === "analysis") setTab(params.get("tab") as Tab);
    if (params.get("new") === "1") {
      startNew();
      window.history.replaceState({}, "", "/journal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const subjectName = useMemo(() => {
    const m = new Map(subjects.map((s) => [s.id, s.name] as const));
    return (id: string) => m.get(id) ?? "Unassigned";
  }, [subjects]);
  const fileName = useMemo(() => new Map(files.map((f) => [f.id, f.name] as const)), [files]);

  const filtered = useMemo(() => {
    const words = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (e: JournalEntry) => {
      if (subject !== "all" && !e.blocks.some((b) => b.subjectId === subject)) return false;
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (toggles.mock && !e.mocksAttempted?.length) return false;
      if (toggles.wins && !e.wins?.length) return false;
      if (toggles.files && !e.fileIds?.length) return false;
      if (!words.length) return true;
      const haystack = [
        e.reflection,
        e.highlights,
        ...(e.wins ?? []),
        ...(e.failures ?? []),
        ...(e.lessons ?? []),
        ...completedTopicsOf(e).map((c) => c.name),
        ...(e.tags ?? []),
        ...(e.booksStudied ?? []).map((b) => b.title),
        ...(e.currentAffairs ?? []).map((c) => c.title),
        ...(e.revisionSessions ?? []).map((r) => r.topic),
        ...(e.fileIds ?? []).map((id) => fileName.get(id)),
        ...e.blocks.map((b) => subjectName(b.subjectId)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    };
    return journal
      .filter(match)
      .sort((a, b) => (sort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [journal, deferredQuery, subject, from, to, sort, toggles, subjectName, fileName]);

  useEffect(() => setLimit(PAGE), [deferredQuery, subject, from, to, sort, toggles]);

  const groups = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of filtered.slice(0, limit)) {
      const key = e.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    // Month totals come from every match, not only the rows shown.
    const totals = new Map<string, { days: number; hours: number }>();
    for (const e of filtered) {
      const key = e.date.slice(0, 7);
      const t = totals.get(key) ?? { days: 0, hours: 0 };
      t.days++;
      t.hours += e.totalHours;
      totals.set(key, t);
    }
    return [...map.entries()].map(([key, entries]) => {
      const d = fromISODate(entries[0].date);
      return {
        key,
        label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        days: totals.get(key)?.days ?? entries.length,
        hours: Math.round(totals.get(key)?.hours ?? 0),
        entries,
      };
    });
  }, [filtered, limit]);

  const activeFilters =
    (subject !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) + Object.values(toggles).filter(Boolean).length;

  /** "New entry" means today's entry, which may already exist. */
  function startNew() {
    const today = toISODate(new Date());
    const existing = useChronicle.getState().journal.find((j) => j.date === today);
    setDraft(existing ? toDraft(existing) : emptyEntry());
    setOpen(true);
  }
  function startEdit(e: JournalEntry) {
    setDraft(toDraft(e));
    setOpen(true);
  }
  function clearFilters() {
    setSubject("all");
    setFrom("");
    setTo("");
    setToggles({ mock: false, wins: false, files: false });
  }
  async function remove(e: JournalEntry) {
    const refs = buildFileRefs({ journal, goals, lifeLog });
    const own = (e.fileIds ?? []).filter((id) => (refs.get(id)?.journal ?? []).every((d) => d === e.date));
    const links = own
      .map((id) => describeLinks({ goals: refs.get(id)?.goals ?? [], life: refs.get(id)?.life ?? [] }))
      .filter(Boolean);
    const ok = await confirm({
      title: "Delete this journal entry?",
      description:
        `Your entry for ${formatDate(e.date)} and everything in it will be permanently removed` +
        (own.length ? `, including ${own.length} attached file${own.length === 1 ? "" : "s"}` : "") +
        (links.length ? ` (also linked to ${links[0]})` : "") +
        ".",
      confirmLabel: "Delete entry",
    });
    if (ok) deleteJournal(e.date);
  }

  if (!hydrated) return <Loading />;

  const today = toISODate(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Daily Journal"
        title="Every day, written down."
        description="Log what you studied, finished and revised. Search any day later, or switch view to see your topics and what the days add up to."
        actions={
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" /> {journal.some((j) => j.date === today) ? "Edit today" : "Log today"}
          </Button>
        }
      />

      <Segmented
        value={tab}
        onChange={(v) => setTab(v)}
        options={[
          { label: "Entries", value: "entries" },
          { label: "Topics", value: "topics" },
          { label: "Analysis", value: "analysis" },
        ]}
        className="w-fit"
      />

      {tab === "analysis" ? (
        <JournalAnalysisView journal={journal} subjects={subjects} />
      ) : tab === "topics" ? (
        <TopicsExplorer onNewEntry={startNew} />
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes, topics, wins, books, files…"
                  aria-label="Search entries"
                  className="pl-10"
                />
              </div>
              <button
                onClick={() => setShowFilters((s) => !s)}
                aria-expanded={showFilters}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
                  showFilters || activeFilters
                    ? "border-paper/25 bg-paper/[0.06] text-paper"
                    : "border-line text-paper/65 hover:border-paper/25 hover:text-paper",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilters > 0 && (
                  <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-paper px-1 text-[0.65rem] font-semibold text-ink">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>

            {showFilters && (
              <Card className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <FilterField label="Subject">
                    <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                      <option value="all">All subjects</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </FilterField>
                  <FilterField label="From">
                    <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
                  </FilterField>
                  <FilterField label="To">
                    <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
                  </FilterField>
                  <FilterField label="Sort">
                    <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </Select>
                  </FilterField>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip active={toggles.files} onClick={() => setToggles((t) => ({ ...t, files: !t.files }))}>
                    Has files
                  </Chip>
                  <Chip active={toggles.mock} onClick={() => setToggles((t) => ({ ...t, mock: !t.mock }))}>
                    Has mock
                  </Chip>
                  <Chip active={toggles.wins} onClick={() => setToggles((t) => ({ ...t, wins: !t.wins }))}>
                    Wins logged
                  </Chip>
                  {activeFilters > 0 && (
                    <button onClick={clearFilters} className="ml-auto text-xs font-semibold text-paper/60 hover:text-paper">
                      Clear all
                    </button>
                  )}
                </div>
              </Card>
            )}

            <p className="text-xs text-paper/55" role="status">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
              {query && ` matching “${query}”`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<NotebookPen className="h-5 w-5" />}
              title={journal.length === 0 ? "No entries yet" : "No entries match"}
              description={
                journal.length === 0
                  ? "Log your first study day to begin the journal."
                  : "Try a different search, or clear the filters."
              }
              action={journal.length === 0 ? <Button onClick={startNew}>Write today’s entry</Button> : undefined}
            />
          ) : (
            <div className="space-y-8">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="glass-sticky glass-strip sticky top-14 z-10 mb-3 flex items-center gap-3 bg-ink py-1.5 sm:bg-ink/85 sm:backdrop-blur-xl">
                    <h2 className="text-sm font-semibold tracking-snugg text-paper">{group.label}</h2>
                    <div className="h-px flex-1 bg-paper/[0.08]" />
                    <span className="tabular text-xs text-paper/55">
                      {group.days} day{group.days === 1 ? "" : "s"} · {group.hours}h
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {group.entries.map((e) => {
                      const topics = completedTopicsOf(e).length;
                      return (
                        <li key={e.date}>
                          <Card
                            hover
                            onClick={() => router.push(`/journal/${e.date}`)}
                            className="group cursor-pointer p-4 sm:p-5"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-line bg-paper/[0.03] py-2">
                                <span className="tabular text-lg font-semibold leading-none text-paper">
                                  {fromISODate(e.date).getDate()}
                                </span>
                                <span className="mt-1 text-[0.6rem] uppercase tracking-wider text-paper/50">{weekday(e.date)}</span>
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="tabular rounded-full bg-paper px-2 py-0.5 text-[0.7rem] font-semibold text-ink">
                                    {formatHours(e.totalHours)}
                                  </span>
                                  {e.blocks.slice(0, 3).map((b, bi) => (
                                    <Badge key={bi} tone="outline">
                                      {subjectName(b.subjectId)}
                                    </Badge>
                                  ))}
                                  {e.blocks.length > 3 && <Badge tone="ghost">+{e.blocks.length - 3}</Badge>}
                                  <span className="ml-auto hidden text-[0.7rem] text-paper/45 sm:block">
                                    {relativeDay(e.date, today)}
                                  </span>
                                </div>

                                {(e.highlights || e.reflection) && (
                                  <p className="mt-2 line-clamp-1 text-sm text-paper/70">{e.highlights || e.reflection}</p>
                                )}

                                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-paper/55">
                                  <span>Mood · {MOOD_LABELS[e.mood]}</span>
                                  {topics > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                      <ListChecks className="h-3 w-3" /> {topics} topic{topics === 1 ? "" : "s"}
                                    </span>
                                  )}
                                  {e.fileIds?.length ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Paperclip className="h-3 w-3" /> {e.fileIds.length}
                                    </span>
                                  ) : null}
                                  {e.wins?.length ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Trophy className="h-3 w-3" /> {e.wins.length}
                                    </span>
                                  ) : null}
                                  {e.mocksAttempted?.length ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Target className="h-3 w-3" /> mock
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    startEdit(e);
                                  }}
                                  aria-label={`Edit entry for ${formatDate(e.date)}`}
                                  title="Edit entry"
                                  className="grid h-8 w-8 place-items-center rounded-lg text-paper/40 transition-all hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    void remove(e);
                                  }}
                                  aria-label={`Delete entry for ${formatDate(e.date)}`}
                                  title="Delete entry"
                                  className="hidden h-8 w-8 place-items-center rounded-lg text-paper/40 transition-all hover:bg-paper/[0.06] hover:text-paper sm:grid sm:opacity-0 sm:group-hover:opacity-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <ChevronRight className="h-4 w-4 text-paper/30" />
                              </div>
                            </div>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {filtered.length > limit && (
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                    Show older entries ({filtered.length - limit} more)
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <JournalComposer open={open} onClose={() => setOpen(false)} initial={draft} />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-wider text-paper/55">{label}</label>
      {children}
    </div>
  );
}
