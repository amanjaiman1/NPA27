"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookLock, ChevronLeft, ChevronRight, Download, Lock, Paperclip, Pin, Plus, Search, Star } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { ISODate, Reflection } from "@/lib/types";
import {
  DIARY_CATEGORIES,
  NO_DIARY_FILTER,
  allTags,
  byMonth,
  diaryExport,
  entryTitle,
  excerpt,
  filterEntries,
  promptOfTheDay,
  sortEntries,
  type DiaryFilter,
} from "@/lib/diary";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { DiaryEditor } from "@/components/diary/diary-editor";
import { cn, formatDate, fromISODate, toISODate, uid, weekday } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   PERSONAL DIARY
   Entries on the left (a list, a timeline by month, or a calendar), the
   page on the right. On a phone, one at a time. Everything here stays
   here: see lib/diary.ts for what reads an entry (only this page).
   ════════════════════════════════════════════════════════════════ */

type View = "list" | "timeline" | "calendar";

function blankEntry(date: ISODate): Reflection {
  return { id: uid("diary"), date, content: "" };
}

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

export default function DiaryPage() {
  const hydrated = useHasHydrated();
  const entries = useChronicle((s) => s.reflections);
  const files = useChronicle((s) => s.files);
  const toast = useToast();
  const today = toISODate(new Date());

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<DiaryFilter>(NO_DIARY_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<Reflection | null>(null);
  const [focus, setFocus] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));

  const startNew = useCallback((date: ISODate = today) => {
    const fresh = blankEntry(date);
    setDraftNew(fresh);
    setSelected("new");
  }, [today]);

  // ?new=1 opens a blank page.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      startNew();
      window.history.replaceState({}, "", "/diary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Escape leaves focus mode.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocus(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const shown = useMemo(() => filterEntries(sorted, filter), [sorted, filter]);
  const tags = useMemo(() => allTags(entries), [entries]);
  const thisMonth = entries.filter((e) => e.date.startsWith(today.slice(0, 7))).length;
  const filtering = filter.query || filter.category || filter.tag || filter.flag !== "all" || filter.date;

  const current = selected === "new" ? draftNew : entries.find((e) => e.id === selected) ?? null;
  // A brand-new entry that has just been kept is now a normal entry.
  const onSaved = useCallback((id: string) => setSelected((cur) => (cur === "new" ? id : cur)), []);
  const close = useCallback(() => {
    setSelected(null);
    setDraftNew(null);
    setFocus(false);
  }, []);

  if (!hydrated) return <Loading />;

  function exportShown() {
    const names = new Map(files.map((f) => [f.id, f.name]));
    download(`diary-${today}.md`, diaryExport(shown, names));
    toast({ title: `${shown.length} ${shown.length === 1 ? "entry" : "entries"} exported`, description: "Saved as one Markdown file on this device." });
  }

  const editor = current ? (
    <DiaryEditor
      key={current.id}
      entry={current}
      isNew={selected === "new"}
      focus={focus}
      onFocusChange={setFocus}
      onSaved={onSaved}
      onClose={close}
    />
  ) : null;

  if (focus && editor) {
    return <Card className="mx-auto max-w-4xl p-5 sm:p-8">{editor}</Card>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personal Diary"
        title="Yours alone."
        description="Write freely. Entries save as you type and stay private: nothing here is read by your reviews, the coach, your habits or reminders."
        actions={
          <>
            {entries.length > 0 && (
              <Button variant="ghost" onClick={exportShown} disabled={!shown.length} hint={filtering ? "The entries shown, as one Markdown file." : "Every entry, as one Markdown file."}>
                <Download className="h-4 w-4" aria-hidden /> Export
              </Button>
            )}
            <Button onClick={() => startNew()} hint="A blank page dated today. It's kept once you write something.">
              <Plus className="h-4 w-4" aria-hidden /> New entry
            </Button>
          </>
        }
      />

      {entries.length === 0 && !current ? (
        <EmptyState
          icon={<BookLock className="h-5 w-5" />}
          title="A private place to write"
          description={`Write about the day, a worry or an idea. Nothing here feeds the rest of the app. If you'd like a start: “${promptOfTheDay(today)}”`}
          action={
            <Button onClick={() => startNew()}>
              <Plus className="h-4 w-4" aria-hidden /> Write the first entry
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* ── Entries ───────────────────────────────────── */}
          <Card className={cn("flex min-h-0 flex-col gap-3 p-4", current && "hidden lg:flex")}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[0.84rem] font-semibold text-paper">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </p>
              <p className="text-[0.7rem] text-paper/55">{thisMonth} this month</p>
            </div>
            <label className="relative">
              <span className="sr-only">Search the diary</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/45" aria-hidden />
              <Input value={filter.query} onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))} placeholder="Search your entries" className="pl-9" />
            </label>
            <Segmented<View>
              label="How to show entries"
              compact
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List" },
                { value: "timeline", label: "Timeline" },
                { value: "calendar", label: "Calendar" },
              ]}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["pinned", "Pinned"],
                  ["important", "Important"],
                  ["files", "With files"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter.flag === id}
                  onClick={() => setFilter((f) => ({ ...f, flag: id }))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
                    filter.flag === id ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-paper/65 hover:text-paper",
                  )}
                >
                  {label}
                </button>
              ))}
              <label className="sr-only" htmlFor="diary-category">
                Category
              </label>
              <Select id="diary-category" value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} className="h-8 w-auto py-1 text-[0.72rem]">
                <option value="">Any category</option>
                {DIARY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Tags">
                {tags.slice(0, 10).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={filter.tag === t}
                    onClick={() => setFilter((f) => ({ ...f, tag: f.tag === t ? "" : t }))}
                    className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-medium transition-colors", filter.tag === t ? "bg-accent/15 text-accent" : "bg-paper/[0.05] text-paper/65 hover:text-paper")}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}
            {filtering && (
              <button type="button" onClick={() => setFilter(NO_DIARY_FILTER)} className="self-start text-[0.72rem] font-semibold text-accent hover:underline">
                Clear the filters ({shown.length} shown)
              </button>
            )}

            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 lg:max-h-[calc(100dvh-24rem)]">
              {view === "calendar" ? (
                <DiaryCalendar
                  month={month}
                  onMonth={setMonth}
                  entries={entries}
                  today={today}
                  selectedDate={filter.date}
                  onPickDate={(d) => setFilter((f) => ({ ...f, date: f.date === d ? null : d }))}
                />
              ) : null}
              {view === "calendar" && filter.date && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[0.76rem] font-semibold text-paper/75">{formatDate(filter.date)}</p>
                  <Button size="sm" variant="ghost" onClick={() => startNew(filter.date as ISODate)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Write for this day
                  </Button>
                </div>
              )}
              {shown.length === 0 ? (
                <p className="py-6 text-center text-[0.8rem] text-paper/55">{filtering ? "No entries match." : "No entries yet."}</p>
              ) : view === "timeline" ? (
                <div className="space-y-4">
                  {byMonth(shown).map((g) => (
                    <section key={g.key} aria-label={g.label}>
                      <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-paper/50">{g.label}</p>
                      <ol className="relative space-y-1 border-l border-line pl-3.5">
                        {g.entries.map((r) => (
                          <li key={r.id} className="relative">
                            <span aria-hidden className={cn("absolute -left-[1.16rem] top-3.5 h-2 w-2 rounded-full", r.important ? "bg-warning" : "bg-accent/70")} />
                            <EntryButton entry={r} active={selected === r.id} onOpen={() => setSelected(r.id)} />
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              ) : (
                <ul className="space-y-1">
                  {(view === "calendar" && !filter.date ? shown.filter((r) => r.date.startsWith(month)) : shown).map((r) => (
                    <li key={r.id}>
                      <EntryButton entry={r} active={selected === r.id} onOpen={() => setSelected(r.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* ── The page ──────────────────────────────────── */}
          <Card className={cn("min-w-0 p-4 sm:p-6", !current && "hidden lg:block")}>
            {editor ?? (
              <div className="grid h-full min-h-[24rem] place-items-center text-center">
                <div className="max-w-sm">
                  <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent">
                    <Lock className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="text-[0.95rem] font-semibold text-paper">Open an entry, or start a new one</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-paper/60">Today&apos;s prompt, if it helps: “{promptOfTheDay(today)}”</p>
                  <Button className="mt-4" onClick={() => startNew()}>
                    <Plus className="h-4 w-4" aria-hidden /> New entry
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function EntryButton({ entry: r, active, onOpen }: { entry: Reflection; active: boolean; onOpen: () => void }) {
  const text = excerpt(r, 110);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        active ? "bg-accent/10" : "hover:bg-paper/[0.04]",
      )}
    >
      <span className="flex items-center gap-1.5">
        {r.pinned && <Pin className="h-3 w-3 shrink-0 text-accent" aria-label="Pinned" />}
        {r.important && <Star className="h-3 w-3 shrink-0 fill-current text-warning" aria-label="Important" />}
        <span className="min-w-0 flex-1 truncate text-[0.84rem] font-semibold text-paper">{entryTitle(r)}</span>
        {r.fileIds?.length ? <Paperclip className="h-3 w-3 shrink-0 text-paper/45" aria-label={`${r.fileIds.length} attached`} /> : null}
      </span>
      <span className="mt-0.5 block text-[0.68rem] text-paper/50">
        {weekday(r.date)} {formatDate(r.date)}
        {r.category ? ` · ${r.category}` : ""}
      </span>
      {text && <span className="mt-1 line-clamp-2 block text-[0.74rem] leading-snug text-paper/65">{text}</span>}
    </button>
  );
}

function DiaryCalendar({
  month,
  onMonth,
  entries,
  today,
  selectedDate,
  onPickDate,
}: {
  month: string;
  onMonth: (m: string) => void;
  entries: Reflection[];
  today: ISODate;
  selectedDate: ISODate | null;
  onPickDate: (d: ISODate) => void;
}) {
  const weekStart = useChronicle((s) => s.profile.weekStart) ?? 1;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.date.startsWith(month)) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    return m;
  }, [entries, month]);
  const first = fromISODate(`${month}-01`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() - (weekStart % 7) + 7) % 7;
  const shift = (by: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + by, 1);
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[0.82rem] font-semibold text-paper">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="grid h-7 w-7 place-items-center rounded-full border border-line text-paper/60 hover:text-paper">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= today.slice(0, 7)}
            onClick={() => shift(1)}
            className="grid h-7 w-7 place-items-center rounded-full border border-line text-paper/60 hover:text-paper disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6rem] font-semibold uppercase text-paper/45" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{names[(weekStart + i) % 7]}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} aria-hidden />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const n = counts.get(date) ?? 0;
          const future = date > today;
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              aria-pressed={selectedDate === date}
              aria-label={`${formatDate(date)}: ${n ? `${n} ${n === 1 ? "entry" : "entries"}` : "no entry"}`}
              onClick={() => onPickDate(date)}
              className={cn(
                "relative grid aspect-square place-items-center rounded-lg text-[0.7rem] font-semibold tabular transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                n ? "bg-accent/15 text-paper" : "bg-transparent text-paper/60 hover:bg-paper/[0.05]",
                selectedDate === date && "ring-2 ring-accent",
                date === today && "font-bold text-accent",
                future && "opacity-30",
              )}
            >
              {i + 1}
              {n > 0 && <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
