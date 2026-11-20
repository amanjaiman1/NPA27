"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Minus, Trash2, Sunrise, Moon, ChevronDown, AlertTriangle, Target, Check, GraduationCap, BookOpenCheck, Copy, PenLine, Paperclip, RotateCcw, Smile } from "lucide-react";
import type { Goal, ISODate, JournalEntry, LifeEntry, StudyBlock, Subject, TopicCompletion } from "@/lib/types";
import { useChronicle, type JournalSaveResult } from "@/lib/store";
import { Field, Input, Textarea, Select, ListEditor } from "@/components/ui/form";
import { RadialProgress } from "@/components/ui/progress";
import { RevisionPicker } from "./revision-picker";
import { TopicPicker } from "./topic-picker";
import { AttachmentTray, type SessionFile } from "@/components/attachments/attachment-tray";
import { removeStoredPaths } from "@/lib/file-storage";
import { toDraft, mergeByKey, MOOD_LABELS, ENERGY_LABELS, MOTIVATION_LABELS, FOCUS_LABELS } from "./constants";
import { round, formatHours, cn, toISODate, formatDate } from "@/lib/utils";
import { accomplishedStreak } from "@/lib/selectors";
import { formatClock, timeFormatOf } from "@/lib/sleep";

/**
 * The journal form, shared by the entry dialog (`composer.tsx`) and the Daily
 * Capture workspace. The editor hook holds a draft of one day; nothing reaches
 * the store until `commitJournalEntry` runs, which saves through the same
 * `saveJournalEntry` action either way.
 */

/** A titled block of the form. Light on chrome: a label, and the controls. */
function Section({
  title,
  aside,
  hint,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.78rem] font-semibold tracking-snugg text-paper/80">{title}</h3>
        {aside && <span className="text-xs text-paper/55">{aside}</span>}
      </div>
      {hint && <p className="-mt-1.5 text-[0.7rem] text-paper/45">{hint}</p>}
      {children}
    </section>
  );
}

/** One 1–5 rating, compact enough that four fit in two rows. */
function RatingRow({
  label,
  value,
  onChange,
  labels,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: string[];
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-paper/70">{label}</span>
        <span className="text-[0.68rem] text-paper/50">{labels[value]}</span>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${label}: ${labels[v]}`}
            title={labels[v]}
            onClick={() => onChange(v)}
            className={cn(
              "h-8 flex-1 rounded-lg border text-[0.7rem] font-semibold transition-colors",
              v <= value
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-paper/[0.03] text-paper/45 hover:border-paper/25 hover:text-paper",
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── the page layout (Daily Capture) ───────────────────────────── */

/** The two things a day is mostly about: a large card that leads the page. */
function HeroCard({
  icon: Icon,
  title,
  hint,
  aside,
  children,
}: {
  icon: typeof Plus;
  title: string;
  hint: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative min-w-0 overflow-hidden rounded-3xl border border-line bg-card p-5 shadow-soft sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent/[0.08] to-transparent" aria-hidden />
      <header className="relative mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent" aria-hidden>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[1.08rem] font-semibold tracking-snugg text-paper">{title}</h3>
            <p className="text-[0.76rem] text-paper/55">{hint}</p>
          </div>
        </div>
        {aside}
      </header>
      <div className="relative space-y-4">{children}</div>
    </section>
  );
}

/** Everything else: a quieter card with a small heading. */
function PlainCard({
  icon: Icon,
  title,
  aside,
  children,
  className,
}: {
  icon: typeof Plus;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-card p-5 shadow-soft", className)}>
      <header className="mb-3.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[0.88rem] font-semibold tracking-snugg text-paper">
          <Icon className="h-4 w-4 text-accent" aria-hidden /> {title}
        </h3>
        {aside && <span className="text-[0.72rem] text-paper/55">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** Shades of the accent for each subject's share of the day, in row order. */
const SHADES = ["bg-accent", "bg-accent/70", "bg-accent/50", "bg-accent/35", "bg-accent/25", "bg-accent/15"];

/**
 * Hours by subject, built for speed: tap a subject you usually study to add
 * it, nudge the hours in half-hour steps, or repeat your last day's subjects.
 * The ring shows the day against your daily target.
 */
function StudyCard({
  draft,
  patch,
  subjects,
  journal,
  target,
}: {
  draft: JournalEntry;
  patch: (p: Partial<JournalEntry>) => void;
  subjects: Subject[];
  journal: JournalEntry[];
  target: number;
}) {
  const blocks = draft.blocks;
  const total = round(blocks.reduce((a, b) => a + (Number(b.hours) || 0), 0), 2);
  const counted = blocks.filter((b) => b.subjectId && Number(b.hours) > 0);
  const used = new Set(blocks.map((b) => b.subjectId).filter(Boolean));

  // Subjects you study most often come first among the quick picks.
  const ranked = useMemo(() => {
    const seen = new Map<string, number>();
    for (const j of journal) if (j.date < draft.date) for (const b of j.blocks ?? []) if (b.subjectId) seen.set(b.subjectId, (seen.get(b.subjectId) ?? 0) + 1);
    return [...subjects].sort((a, b) => (seen.get(b.id) ?? 0) - (seen.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [journal, subjects, draft.date]);
  const quick = ranked.filter((s) => !used.has(s.id)).slice(0, 6);
  const last = useMemo(
    () =>
      journal
        .filter((j) => j.date < draft.date && (j.blocks ?? []).some((b) => b.subjectId && b.hours > 0))
        .reduce<JournalEntry | null>((best, j) => (!best || j.date > best.date ? j : best), null),
    [journal, draft.date],
  );

  const setBlock = (i: number, p: Partial<StudyBlock>) => {
    const next = [...blocks];
    next[i] = { ...next[i], ...p };
    patch({ blocks: next });
  };
  const addSubject = (id: string) => {
    const empty = blocks.findIndex((b) => !b.subjectId);
    if (empty >= 0) setBlock(empty, { subjectId: id, hours: Number(blocks[empty].hours) || 1 });
    else patch({ blocks: [...blocks, { subjectId: id, hours: 1 }] });
  };
  const step = (i: number, by: number) => setBlock(i, { hours: Math.min(24, Math.max(0, round((Number(blocks[i].hours) || 0) + by, 2))) });
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : null;
  const left = target > 0 ? round(target - total, 2) : 0;

  return (
    <HeroCard
      icon={GraduationCap}
      title="Study"
      hint="What you studied today, and for how long."
      aside={
        pct != null ? (
          <RadialProgress
            value={pct}
            tone={pct >= 100 ? "positive" : "accent"}
            ariaLabel="Study hours against your daily target"
            size={58}
            stroke={5}
            label={<span className="tabular text-[0.72rem] font-semibold text-paper">{pct}%</span>}
          />
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p className="tabular text-[2.1rem] font-semibold leading-none tracking-[-0.03em] text-paper">{formatHours(total)}</p>
        <p className={cn("pb-1 text-[0.78rem]", total > 24 ? "font-semibold text-danger" : left <= 0 && target > 0 ? "font-semibold text-positive" : "text-paper/60")}>
          {total > 24
            ? "More than 24 hours. Check the rows below."
            : target > 0
              ? left > 0
                ? `${formatHours(left)} to your ${formatHours(target)} target`
                : `Daily target of ${formatHours(target)} reached`
              : `${counted.length} ${counted.length === 1 ? "subject" : "subjects"}`}
        </p>
      </div>

      {total > 0 && (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-paper/[0.06]" aria-hidden>
          {blocks.map((b, i) =>
            Number(b.hours) > 0 && b.subjectId ? (
              <span key={i} className={cn("h-full transition-all duration-300", SHADES[i % SHADES.length])} style={{ width: `${(Number(b.hours) / Math.max(total, target || 0)) * 100}%` }} />
            ) : null,
          )}
        </div>
      )}

      <ul className="space-y-2" aria-label="Study by subject">
        {blocks.map((b, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={cn("hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block", b.subjectId ? SHADES[i % SHADES.length] : "bg-paper/20")} aria-hidden />
            <Select
              value={b.subjectId}
              aria-label={`Subject ${i + 1}`}
              onChange={(e) => setBlock(i, { subjectId: e.target.value })}
              className="min-w-0 flex-1 font-medium"
            >
              <option value="">Choose a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="flex h-10 shrink-0 items-center rounded-xl border border-line bg-paper/[0.03]">
              <button type="button" onClick={() => step(i, -0.5)} aria-label={`Half an hour less for subject ${i + 1}`} className="grid h-full w-7 place-items-center rounded-l-xl text-paper/55 hover:text-paper sm:w-8">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                max="24"
                aria-label={`Hours for subject ${i + 1}`}
                value={b.hours}
                onChange={(e) => setBlock(i, { hours: parseFloat(e.target.value) || 0 })}
                className="tabular h-full w-10 bg-transparent sm:w-11 text-center text-sm font-semibold text-paper outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="hidden pr-1 text-xs text-paper/45 sm:inline" aria-hidden>
                h
              </span>
              <button type="button" onClick={() => step(i, 0.5)} aria-label={`Half an hour more for subject ${i + 1}`} className="grid h-full w-7 place-items-center rounded-r-xl text-paper/55 hover:text-paper sm:w-8">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => patch({ blocks: blocks.filter((_, bi) => bi !== i) })}
              aria-label={`Remove subject ${i + 1}`}
              className="grid h-10 w-8 shrink-0 place-items-center rounded-xl text-paper/40 hover:bg-paper/[0.06] hover:text-paper sm:w-9"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.72rem] font-semibold text-paper/55">Add a subject</p>
          {last && used.size === 0 && (
            <button
              type="button"
              onClick={() => patch({ blocks: last.blocks.filter((b) => b.subjectId && b.hours > 0).map((b) => ({ ...b })) })}
              className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-accent hover:underline"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> Same as {formatDate(last.date)}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addSubject(s.id)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-paper/75 transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Plus className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{s.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => patch({ blocks: [...blocks, { subjectId: "", hours: 1 }] })}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-paper/25 px-3 py-1.5 text-xs font-semibold text-paper/60 hover:text-paper"
          >
            <Plus className="h-3 w-3" aria-hidden /> Another row
          </button>
        </div>
      </div>
    </HeroCard>
  );
}

/**
 * Wake-up and bedtime come from the morning check-in (kept on the Life
 * Dashboard). The form shows them for whichever day it points at and saves
 * those values, so it can neither change nor drop them.
 */
export function recordedSleepFor(date: ISODate, journal: JournalEntry[], lifeLog: LifeEntry[]) {
  const day = journal.find((j) => j.date === date);
  const life = lifeLog.find((l) => l.date === date);
  return {
    wakeTime: life?.wakeTime || day?.wakeTime || undefined,
    sleepTime: life?.bedtime || day?.sleepTime || undefined,
  };
}

export function linkedGoalIds(goals: Goal[], date: ISODate): string[] {
  return goals.filter((g) => g.journalDates?.includes(date)).map((g) => g.id);
}

function hasMore(d: JournalEntry): boolean {
  return Boolean(
    d.wins?.length ||
      d.failures?.length ||
      d.lessons?.length ||
      d.booksStudied?.length ||
      d.currentAffairs?.length ||
      d.mocksAttempted?.length ||
      d.tags?.length,
  );
}

/** Everything an unsaved edit holds, as plain data (kept as a draft across reloads). */
export interface JournalDraftSnapshot {
  draft: JournalEntry;
  sessionFiles: SessionFile[];
  replaced: Record<string, string>;
  goalIds: string[];
  scheduleRevision: boolean;
}

export interface JournalEditor {
  /** The entry the edit started from. */
  base: JournalEntry;
  draft: JournalEntry;
  patch: (p: Partial<JournalEntry>) => void;
  sessionFiles: SessionFile[];
  replaced: Record<string, string>;
  uploading: boolean;
  goalIds: string[];
  setGoalIds: React.Dispatch<React.SetStateAction<string[]>>;
  scheduleRevision: boolean;
  setScheduleRevision: (v: boolean) => void;
  more: boolean;
  setMore: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: (e: string | null) => void;
  /** The entry itself changed (goal links are reported separately). */
  dirty: boolean;
  reset: (initial: JournalEntry, restore?: JournalDraftSnapshot) => void;
  snapshot: () => JournalDraftSnapshot;
  onBusyChange: (busy: boolean) => void;
  onSessionFile: (f: SessionFile) => void;
  onReplace: (from: string, to: string) => void;
  /** Deletes what this edit uploaded and isn't keeping. */
  discardUploads: (keep: Set<string>) => void;
}

export function useJournalEditor(initial: JournalEntry): JournalEditor {
  const [base, setBase] = useState<JournalEntry>(initial);
  const [draft, setDraft] = useState<JournalEntry>(() => toDraft(initial));
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [replaced, setReplaced] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [goalIds, setGoalIds] = useState<string[]>(() => linkedGoalIds(useChronicle.getState().goals, initial.date));
  const [scheduleRevision, setScheduleRevision] = useState(true);
  const [more, setMore] = useState(() => hasMore(initial));
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback((p: Partial<JournalEntry>) => {
    setDraft((d) => ({ ...d, ...p }));
    setError(null);
  }, []);

  const reset = useCallback((next: JournalEntry, restore?: JournalDraftSnapshot) => {
    const d = restore?.draft ?? toDraft(next);
    setBase(next);
    setDraft(d);
    setSessionFiles(restore?.sessionFiles ?? []);
    setReplaced(restore?.replaced ?? {});
    setGoalIds(restore?.goalIds ?? linkedGoalIds(useChronicle.getState().goals, next.date));
    setScheduleRevision(restore?.scheduleRevision ?? true);
    setMore(hasMore(d));
    setError(null);
  }, []);

  const onBusyChange = useCallback((b: boolean) => setUploading(b), []);
  const onSessionFile = useCallback((f: SessionFile) => setSessionFiles((list) => [...list, f]), []);
  const onReplace = useCallback(
    (from: string, to: string) =>
      setReplaced((m) => {
        // A replacement of a replacement still traces back to the original.
        const origin = Object.entries(m).find(([, v]) => v === from)?.[0] ?? from;
        return { ...m, [origin]: to };
      }),
    [],
  );

  /** Uploaded this session but not kept: delete what this session created. */
  const discardUploads = useCallback(
    (keep: Set<string>) => {
      const stored = new Set(useChronicle.getState().files.map((f) => f.path));
      const paths = sessionFiles
        .filter((s) => s.created && !keep.has(s.record.id) && !stored.has(s.record.path))
        .map((s) => s.record.path);
      if (paths.length) void removeStoredPaths(paths);
    },
    [sessionFiles],
  );

  const baseJson = useMemo(() => JSON.stringify(toDraft(base)), [base]);
  const dirty = useMemo(() => JSON.stringify(draft) !== baseJson || sessionFiles.length > 0, [draft, baseJson, sessionFiles]);
  const snapshot = useCallback(
    () => ({ draft, sessionFiles, replaced, goalIds, scheduleRevision }),
    [draft, sessionFiles, replaced, goalIds, scheduleRevision],
  );

  return useMemo(
    () => ({
      base,
      draft,
      patch,
      sessionFiles,
      replaced,
      uploading,
      goalIds,
      setGoalIds,
      scheduleRevision,
      setScheduleRevision,
      more,
      setMore,
      error,
      setError,
      dirty,
      reset,
      snapshot,
      onBusyChange,
      onSessionFile,
      onReplace,
      discardUploads,
    }),
    [base, draft, patch, sessionFiles, replaced, uploading, goalIds, scheduleRevision, more, error, dirty, reset, snapshot, onBusyChange, onSessionFile, onReplace, discardUploads],
  );
}

/** Checks the draft and builds the entry to save, or says what to fix. */
export function prepareJournalEntry(
  draft: JournalEntry,
  today: ISODate,
): { entry: JournalEntry; error?: undefined } | { entry?: undefined; error: string } {
  const blocks = draft.blocks
    .map((b) => ({ ...b, hours: Math.max(0, Number(b.hours) || 0) }))
    .filter((b) => b.subjectId && b.hours > 0);
  const totalHours = round(blocks.reduce((a, b) => a + b.hours, 0), 1);
  if (totalHours > 24) return { error: `That adds up to ${formatHours(totalHours)}. A day can't hold more than 24 hours.` };
  if (!draft.date || draft.date > today) return { error: "Pick today or an earlier day." };
  const s = useChronicle.getState();
  // Read at save time, so a check-in saved a moment ago is the one kept.
  const sleep = recordedSleepFor(draft.date, s.journal, s.lifeLog);
  const topics: TopicCompletion[] = (draft.completedTopics ?? []).filter((c) => c.name.trim());
  return {
    entry: {
      ...draft,
      blocks,
      totalHours,
      completedTopics: topics,
      wakeTime: sleep.wakeTime,
      sleepTime: sleep.sleepTime,
      highlights: draft.highlights?.trim() || undefined,
      reflection: draft.reflection?.trim() || undefined,
    },
  };
}

export interface JournalCelebration {
  date: ISODate;
  hours: number;
  streak: number;
  total: number;
}

/**
 * Saves a prepared entry with everything the day implies (files, goal links,
 * syllabus topics, revisions) and marks a first entry for the day accomplished.
 */
export function commitJournalEntry(
  editor: Pick<JournalEditor, "sessionFiles" | "replaced" | "goalIds" | "scheduleRevision" | "discardUploads">,
  entry: JournalEntry,
  opts: { previousDate?: ISODate; isEdit: boolean },
): { result: JournalSaveResult; celebration: JournalCelebration | null } {
  const s = useChronicle.getState();
  const kept = new Set(entry.fileIds ?? []);
  const result = s.saveJournalEntry({
    entry,
    previousDate: opts.previousDate,
    newFiles: editor.sessionFiles.filter((f) => kept.has(f.record.id)).map((f) => f.record),
    goalIds: editor.goalIds,
    scheduleRevision: editor.scheduleRevision,
    replaced: editor.replaced,
  });
  editor.discardUploads(kept);
  let celebration: JournalCelebration | null = null;
  if (result.isNewDay && !opts.isEdit && s.markAccomplished(entry.date)) {
    // Read back rather than reusing an earlier copy, so the streak counts the day just added.
    const marked = useChronicle.getState().accomplished ?? [];
    celebration = { date: entry.date, hours: entry.totalHours, streak: accomplishedStreak(marked), total: marked.length };
  }
  return { result, celebration };
}

/**
 * The form itself. `dialog` is the single column the entry dialog has always
 * shown; `page` lays the same fields out as a writing page, for Daily Capture,
 * where the date and the goal links live elsewhere in the workspace.
 */
export function JournalFields({
  editor,
  isEdit,
  variant = "dialog",
}: {
  editor: JournalEditor;
  isEdit: boolean;
  variant?: "dialog" | "page";
}) {
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const goals = useChronicle((s) => s.goals);
  const profile = useChronicle((s) => s.profile);
  const clock = timeFormatOf(profile);
  const { draft, patch, base, goalIds, setGoalIds, more, setMore } = editor;
  const page = variant === "page";

  const existingDates = useMemo(() => new Set(journal.map((j) => j.date)), [journal]);
  const todayISO = toISODate(new Date());
  const wouldReplaceAnotherDay = draft.date !== base.date && existingDates.has(draft.date);
  const totalDraftHours = round(draft.blocks.reduce((a, b) => a + (Number(b.hours) || 0), 0), 1);
  const recordedSleep = useMemo(() => recordedSleepFor(draft.date, journal, lifeLog), [journal, lifeLog, draft.date]);
  const studiedSubjects = useMemo(() => [...new Set(draft.blocks.map((b) => b.subjectId).filter(Boolean))], [draft.blocks]);
  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "Active" || goalIds.includes(g.id)).sort((a, b) => a.title.localeCompare(b.title)),
    [goals, goalIds],
  );
  const newSyllabusTopics = useMemo(() => {
    const before = new Set(
      (journal.find((j) => j.date === base.date)?.completedTopics ?? []).map((c) => c.topicId).filter(Boolean),
    );
    return (draft.completedTopics ?? []).filter((c) => c.topicId && !before.has(c.topicId)).length;
  }, [draft.completedTopics, journal, base.date]);

  const sleepLine = (
    <p className="flex flex-wrap items-center gap-3 text-xs text-paper/60" title="From your morning check-in">
      <span className="inline-flex items-center gap-1">
        <Sunrise className="h-3.5 w-3.5 text-paper/45" aria-hidden />
        <span className="sr-only">Woke at</span>
        {recordedSleep.wakeTime ? formatClock(recordedSleep.wakeTime, clock) : "—"}
      </span>
      <span className="inline-flex items-center gap-1">
        <Moon className="h-3.5 w-3.5 text-paper/45" aria-hidden />
        <span className="sr-only">Went to bed at</span>
        {recordedSleep.sleepTime ? formatClock(recordedSleep.sleepTime, clock) : "—"}
      </span>
      <span className={cn("text-paper/45", !page && "hidden sm:inline")}>from the morning check-in</span>
    </p>
  );

  const study = (
    <Section title="Study" aside={`${formatHours(totalDraftHours)} total`} hint={page ? "Hours by subject. Empty rows are left out." : undefined}>
      <div className="space-y-2">
        {draft.blocks.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={b.subjectId}
              aria-label={`Subject ${i + 1}`}
              onChange={(e) => {
                const blocks = [...draft.blocks];
                blocks[i] = { ...blocks[i], subjectId: e.target.value };
                patch({ blocks });
              }}
              className="min-w-0 flex-1"
            >
              <option value="">Choose a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="relative w-24 shrink-0">
              <Input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                max="24"
                aria-label={`Hours for subject ${i + 1}`}
                value={b.hours}
                onChange={(e) => {
                  const blocks = [...draft.blocks];
                  blocks[i] = { ...blocks[i], hours: parseFloat(e.target.value) || 0 };
                  patch({ blocks });
                }}
                className="pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-paper/45">h</span>
            </div>
            <button
              type="button"
              onClick={() => patch({ blocks: draft.blocks.filter((_, bi) => bi !== i) })}
              aria-label={`Remove subject ${i + 1}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-paper/45 hover:bg-paper/[0.06] hover:text-paper"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => patch({ blocks: [...draft.blocks, { subjectId: "", hours: 1 }] })}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add a subject
      </button>
    </Section>
  );

  const topics = (
    <Section title="Topics completed" aside={draft.completedTopics?.length ? `${draft.completedTopics.length}` : undefined}>
      <TopicPicker
        value={draft.completedTopics ?? []}
        onChange={(completedTopics) => patch({ completedTopics })}
        subjects={subjects}
        journal={journal}
        prefer={studiedSubjects}
      />
      {newSyllabusTopics > 0 && (
        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-paper/70">
          <input
            type="checkbox"
            checked={editor.scheduleRevision}
            onChange={(e) => editor.setScheduleRevision(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
          />
          <span>
            Put {newSyllabusTopics === 1 ? "this topic" : `these ${newSyllabusTopics} topics`} on the revision queue, first pass
            tomorrow.
          </span>
        </label>
      )}
    </Section>
  );

  const revision = (
    <Section title="Revision">
      <RevisionPicker date={draft.date} sessions={draft.revisionSessions ?? []} onChange={(revisionSessions) => patch({ revisionSessions })} />
    </Section>
  );

  const feel = (
    <Section title="How the day felt">
      <div className={cn("grid grid-cols-1 gap-x-5 gap-y-3", !page && "sm:grid-cols-2")}>
        <RatingRow label="Mood" value={draft.mood} onChange={(v) => patch({ mood: v })} labels={MOOD_LABELS} />
        <RatingRow label="Energy" value={draft.energy} onChange={(v) => patch({ energy: v })} labels={ENERGY_LABELS} />
        <RatingRow label="Motivation" value={draft.motivation} onChange={(v) => patch({ motivation: v })} labels={MOTIVATION_LABELS} />
        <RatingRow label="Focus" value={draft.focus} onChange={(v) => patch({ focus: v })} labels={FOCUS_LABELS} />
      </div>
    </Section>
  );

  const notes = (
    <Section title={page ? "Write about your day" : "Notes"} hint={page ? "One line that sums it up, then as much as you like." : undefined}>
      <Input
        value={draft.highlights ?? ""}
        onChange={(e) => patch({ highlights: e.target.value })}
        placeholder="One line that captures the day"
        aria-label="Highlight of the day"
        maxLength={200}
        className={cn(page && "text-[0.95rem] font-medium")}
      />
      <Textarea
        value={draft.reflection ?? ""}
        onChange={(e) => patch({ reflection: e.target.value })}
        placeholder="How did today really go?"
        aria-label="Reflection"
        className={page ? "min-h-[190px] text-[0.92rem] leading-relaxed" : "min-h-[96px]"}
      />
    </Section>
  );

  const files = (
    <Section title="Files" aside={draft.fileIds?.length ? `${draft.fileIds.length}` : undefined}>
      <AttachmentTray
        entryDate={draft.date}
        otherDates={isEdit && draft.date !== base.date ? [base.date] : undefined}
        fileIds={draft.fileIds ?? []}
        onChange={(fileIds) => patch({ fileIds })}
        sessionFiles={editor.sessionFiles}
        onSessionFile={editor.onSessionFile}
        onReplace={editor.onReplace}
        onBusyChange={editor.onBusyChange}
      />
    </Section>
  );

  const goalLinks = activeGoals.length > 0 && (
    <Section title="Goals this day served" hint="Linked days show up on the goal, with their files.">
      <div className="flex flex-wrap gap-1.5">
        {activeGoals.map((g) => {
          const on = goalIds.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => setGoalIds((ids) => (on ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                on ? "border-accent/40 bg-accent/[0.12] text-accent" : "border-line text-paper/60 hover:border-paper/25 hover:text-paper",
              )}
            >
              {on ? <Check className="h-3 w-3" /> : <Target className="h-3 w-3" />}
              <span className="truncate">{g.title}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );

  const moreDetails = (
    <section className={cn("rounded-2xl border border-line", page && "bg-card shadow-soft")}>
      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className={cn("flex w-full items-center justify-between gap-3 text-left", page ? "px-5 py-4 sm:px-6" : "px-4 py-3")}
      >
        <span>
          <span className="block text-[0.78rem] font-semibold text-paper/80">More details</span>
          <span className="block text-[0.7rem] text-paper/45">Wins, setbacks, lessons, books, current affairs, mocks and tags</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-paper/45 transition-transform", more && "rotate-180")} />
      </button>
      {more && (
        <div className={cn("space-y-6 border-t border-line pb-4 pt-4", page ? "px-5 sm:px-6" : "px-4")}>
          <Section title="Wins">
            <ListEditor items={draft.wins ?? []} onChange={(wins) => patch({ wins })} placeholder="What went well?" />
          </Section>
          <Section title="Setbacks">
            <ListEditor items={draft.failures ?? []} onChange={(failures) => patch({ failures })} placeholder="What slipped?" />
          </Section>
          <Section title="Lessons">
            <ListEditor items={draft.lessons ?? []} onChange={(lessons) => patch({ lessons })} placeholder="What will you carry into tomorrow?" />
          </Section>
          <div className="grid gap-6 sm:grid-cols-2">
            <Section title="Books">
              <ListEditor
                variant="chips"
                items={(draft.booksStudied ?? []).map((b) => b.title)}
                onChange={(items) => patch({ booksStudied: mergeByKey(items, draft.booksStudied ?? [], "title") })}
                placeholder="Book title"
              />
            </Section>
            <Section title="Current affairs">
              <ListEditor
                variant="chips"
                items={(draft.currentAffairs ?? []).map((c) => c.title)}
                onChange={(items) => patch({ currentAffairs: mergeByKey(items, draft.currentAffairs ?? [], "title") })}
                placeholder="Headline or topic"
              />
            </Section>
            <Section title="Mocks attempted">
              <ListEditor
                variant="chips"
                items={(draft.mocksAttempted ?? []).map((m) => m.name)}
                onChange={(items) => patch({ mocksAttempted: mergeByKey(items, draft.mocksAttempted ?? [], "name") })}
                placeholder="Mock name"
              />
            </Section>
            <Section title="Tags">
              <ListEditor variant="chips" items={draft.tags ?? []} onChange={(tags) => patch({ tags })} placeholder="deep-work, revision…" />
            </Section>
          </div>
        </div>
      )}
    </section>
  );

  if (page) {
    const topicCount = draft.completedTopics?.length ?? 0;
    return (
      <div className="space-y-5">
        {/* What the day was mostly about, first and largest. */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <StudyCard draft={draft} patch={patch} subjects={subjects} journal={journal} target={profile.dailyHourTarget} />
          <HeroCard
            icon={BookOpenCheck}
            title="Topics completed"
            hint="Search your syllabus or type your own. Topics from today's subjects come first."
            aside={
              <span className="text-right">
                <span className="tabular block text-[2.1rem] font-semibold leading-none tracking-[-0.03em] text-paper">{topicCount}</span>
                <span className="text-[0.7rem] text-paper/55">{topicCount === 1 ? "topic" : "topics"}</span>
              </span>
            }
          >
            <TopicPicker
              value={draft.completedTopics ?? []}
              onChange={(completedTopics) => patch({ completedTopics })}
              subjects={subjects}
              journal={journal}
              prefer={studiedSubjects}
            />
            {topicCount === 0 && (
              <p className="rounded-xl border border-dashed border-paper/15 px-3.5 py-3 text-[0.76rem] leading-relaxed text-paper/55">
                Nothing marked yet. A finished syllabus topic moves forward on Subject Progress and can join the revision queue.
              </p>
            )}
            {newSyllabusTopics > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-accent/[0.07] px-3.5 py-3 text-xs text-paper/75">
                <input
                  type="checkbox"
                  checked={editor.scheduleRevision}
                  onChange={(e) => editor.setScheduleRevision(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span>
                  Put {newSyllabusTopics === 1 ? "this topic" : `these ${newSyllabusTopics} topics`} on the revision queue, first pass tomorrow.
                </span>
              </label>
            )}
          </HeroCard>
        </div>

        {/* Then the rest of the day, quieter. */}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <PlainCard icon={RotateCcw} title="Revision" aside={draft.revisionSessions?.length ? `${draft.revisionSessions.length} done` : undefined}>
            <RevisionPicker date={draft.date} sessions={draft.revisionSessions ?? []} onChange={(revisionSessions) => patch({ revisionSessions })} />
          </PlainCard>
          <PlainCard icon={Smile} title="How the day felt">
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              <RatingRow label="Mood" value={draft.mood} onChange={(v) => patch({ mood: v })} labels={MOOD_LABELS} />
              <RatingRow label="Energy" value={draft.energy} onChange={(v) => patch({ energy: v })} labels={ENERGY_LABELS} />
              <RatingRow label="Motivation" value={draft.motivation} onChange={(v) => patch({ motivation: v })} labels={MOTIVATION_LABELS} />
              <RatingRow label="Focus" value={draft.focus} onChange={(v) => patch({ focus: v })} labels={FOCUS_LABELS} />
            </div>
          </PlainCard>
        </div>

        <PlainCard icon={PenLine} title="Reflection">
          <div className="space-y-2.5">
            <Input
              value={draft.highlights ?? ""}
              onChange={(e) => patch({ highlights: e.target.value })}
              placeholder="One line that captures the day"
              aria-label="Highlight of the day"
              maxLength={200}
              className="font-medium"
            />
            <Textarea
              value={draft.reflection ?? ""}
              onChange={(e) => patch({ reflection: e.target.value })}
              placeholder="How did today really go?"
              aria-label="Reflection"
              className="min-h-[140px] leading-relaxed"
            />
          </div>
        </PlainCard>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <PlainCard icon={Paperclip} title="Files" aside={draft.fileIds?.length ? `${draft.fileIds.length}` : undefined}>
            <AttachmentTray
              entryDate={draft.date}
              otherDates={isEdit && draft.date !== base.date ? [base.date] : undefined}
              fileIds={draft.fileIds ?? []}
              onChange={(fileIds) => patch({ fileIds })}
              sessionFiles={editor.sessionFiles}
              onSessionFile={editor.onSessionFile}
              onReplace={editor.onReplace}
              onBusyChange={editor.onBusyChange}
            />
          </PlainCard>
          <PlainCard icon={Sunrise} title="Morning check-in">
            {sleepLine}
            <p className="mt-2 text-[0.7rem] text-paper/45">Wake-up and bedtime are recorded in the Life tab.</p>
          </PlainCard>
        </div>

        {moreDetails}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* The day */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Field label="Date" className="w-44">
          <Input
            type="date"
            value={draft.date}
            max={todayISO}
            onChange={(e) => {
              const picked = e.target.value;
              patch({ date: picked && picked > todayISO ? todayISO : picked });
            }}
          />
        </Field>
        <div className="pb-2.5">{sleepLine}</div>
      </div>
      {wouldReplaceAnotherDay && (
        <p className="-mt-4 flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs text-paper/80">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          {formatDate(draft.date)} already has an entry. Saving here will replace it.
        </p>
      )}
      {study}
      {topics}
      {revision}
      {feel}
      {notes}
      {files}
      {goalLinks}
      {moreDetails}
    </div>
  );
}
