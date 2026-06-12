"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Pencil,
  NotebookPen,
  Search,
  SlidersHorizontal,
  ImageIcon,
  Target,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Chip } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { JournalComposer } from "@/components/journal/composer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { emptyEntry, toDraft, MOOD_LABELS } from "@/components/journal/constants";
import {
  toISODate,
  fromISODate,
  weekday,
  formatHours,
  relativeDay,
  cn,
} from "@/lib/utils";

type Sort = "newest" | "oldest";

export default function JournalPage() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const deleteJournal = useChronicle((s) => s.deleteJournal);
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<JournalEntry>(emptyEntry());

  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [toggles, setToggles] = useState({ mock: false, photos: false, wins: false });
  const [showFilters, setShowFilters] = useState(false);

  // open composer when navigated with ?new=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      const today = toISODate(new Date());
      const existing = journal.find((j) => j.date === today);
      setDraft(existing ? toDraft(existing) : emptyEntry());
      setOpen(true);
      window.history.replaceState({}, "", "/journal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? "Unassigned";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: JournalEntry) => {
      if (subject !== "all" && !e.blocks.some((b) => b.subjectId === subject))
        return false;
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (toggles.mock && !e.mocksAttempted?.length) return false;
      if (toggles.photos && !e.attachments?.length) return false;
      if (toggles.wins && !e.wins?.length) return false;
      if (!q) return true;
      const haystack = [
        e.reflection,
        e.highlights,
        ...(e.wins ?? []),
        ...(e.failures ?? []),
        ...(e.lessons ?? []),
        ...(e.topicsCompleted ?? []),
        ...(e.tags ?? []),
        ...(e.booksStudied ?? []).map((b) => b.title),
        ...(e.currentAffairs ?? []).map((c) => c.title),
        ...(e.revisionSessions ?? []).map((r) => r.topic),
        ...e.blocks.map((b) => subjectName(b.subjectId)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };
    const list = journal.filter(match).sort((a, b) =>
      sort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal, query, subject, from, to, sort, toggles]);

  // group by month
  const groups = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of filtered) {
      const d = fromISODate(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].map(([key, entries]) => {
      const d = fromISODate(entries[0].date);
      return {
        key,
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        hours: Math.round(entries.reduce((a, e) => a + e.totalHours, 0)),
        entries,
      };
    });
  }, [filtered]);

  const activeFilters =
    (subject !== "all" ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0) +
    Object.values(toggles).filter(Boolean).length;

  function startNew() {
    setDraft(emptyEntry());
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
    setToggles({ mock: false, photos: false, wins: false });
  }

  if (!hydrated) return <Loading />;

  const today = toISODate(new Date());

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Daily Study Journal"
        title="Every day, written down."
        description="The atomic unit of the Chronicle. Each entry is a permanent, searchable record — revisit any day years later and relive it."
        actions={
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" /> New entry
          </Button>
        }
      />

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reflections, topics, wins, books…"
              className="pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
              showFilters || activeFilters
                ? "border-paper/25 bg-paper/[0.06] text-paper"
                : "border-paper/12 text-paper/60 hover:border-paper/25 hover:text-paper",
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
              <div>
                <label className="mb-1.5 block text-[0.65rem] uppercase tracking-wider text-paper/40">
                  Subject
                </label>
                <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="all">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[0.65rem] uppercase tracking-wider text-paper/40">
                  From
                </label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[0.65rem] uppercase tracking-wider text-paper/40">
                  To
                </label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[0.65rem] uppercase tracking-wider text-paper/40">
                  Sort
                </label>
                <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={toggles.mock} onClick={() => setToggles((t) => ({ ...t, mock: !t.mock }))}>
                Has mock
              </Chip>
              <Chip active={toggles.photos} onClick={() => setToggles((t) => ({ ...t, photos: !t.photos }))}>
                Has photos
              </Chip>
              <Chip active={toggles.wins} onClick={() => setToggles((t) => ({ ...t, wins: !t.wins }))}>
                Wins logged
              </Chip>
              {activeFilters > 0 && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs text-paper/45 hover:text-paper"
                >
                  Clear all
                </button>
              )}
            </div>
          </Card>
        )}

        <p className="text-xs text-paper/40">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          {query && ` matching “${query}”`}
        </p>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="h-5 w-5" />}
          title={journal.length === 0 ? "No entries yet" : "No entries match"}
          description={
            journal.length === 0
              ? "Log your first study session to begin the Chronicle."
              : "Try adjusting your search or filters."
          }
          action={
            journal.length === 0 ? (
              <Button onClick={startNew}>Write today’s entry</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="sticky top-14 z-10 -mx-1 mb-3 flex items-center gap-3 bg-ink/80 px-1 py-1.5 backdrop-blur">
                <h2 className="text-sm font-semibold tracking-snugg text-paper">
                  {group.label}
                </h2>
                <div className="h-px flex-1 bg-paper/[0.08]" />
                <span className="tabular text-xs text-paper/40">
                  {group.entries.length} days · {group.hours}h
                </span>
              </div>

              <div className="space-y-2.5">
                {group.entries.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.2), duration: 0.3 }}
                  >
                    <Card
                      hover
                      onClick={() => router.push(`/journal/${e.date}`)}
                      className="group cursor-pointer p-4 sm:p-5"
                    >
                      <div className="flex items-start gap-4">
                        {/* date */}
                        <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-paper/[0.08] bg-paper/[0.03] py-2">
                          <span className="tabular text-lg font-semibold leading-none text-paper">
                            {fromISODate(e.date).getDate()}
                          </span>
                          <span className="mt-1 text-[0.6rem] uppercase tracking-wider text-paper/40">
                            {weekday(e.date)}
                          </span>
                        </div>

                        {/* content */}
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
                            {e.blocks.length > 3 && (
                              <Badge tone="ghost">+{e.blocks.length - 3}</Badge>
                            )}
                            <span className="ml-auto hidden text-[0.7rem] text-paper/30 sm:block">
                              {e.date === today ? "Today" : relativeDay(e.date, today)}
                            </span>
                          </div>

                          {(e.highlights || e.reflection) && (
                            <p className="mt-2 line-clamp-1 text-sm text-paper/70">
                              {e.highlights || e.reflection}
                            </p>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-paper/40">
                            <span>Mood · {MOOD_LABELS[e.mood]}</span>
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
                            {e.attachments?.length ? (
                              <span className="inline-flex items-center gap-1">
                                <ImageIcon className="h-3 w-3" /> {e.attachments.length}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* actions */}
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              startEdit(e);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg text-paper/35 opacity-0 transition-all hover:bg-paper/[0.06] hover:text-paper group-hover:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={async (ev) => {
                              ev.stopPropagation();
                              if (
                                await confirm({
                                  title: "Delete this journal entry?",
                                  description: `Your entry for ${e.date} and everything in it will be permanently removed.`,
                                  confirmLabel: "Delete entry",
                                })
                              )
                                deleteJournal(e.id);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg text-paper/35 opacity-0 transition-all hover:bg-paper/[0.06] hover:text-paper group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-paper/25" />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <JournalComposer open={open} onClose={() => setOpen(false)} initial={draft} />
    </div>
  );
}
