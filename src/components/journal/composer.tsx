"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Sunrise,
  Moon,
  ChevronDown,
  AlertTriangle,
  Target,
  Check,
} from "lucide-react";
import type { JournalEntry, TopicCompletion } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea, Select, ListEditor } from "@/components/ui/form";
import { RevisionPicker } from "./revision-picker";
import { TopicPicker } from "./topic-picker";
import { AccomplishedModal } from "@/components/celebrate/accomplished-modal";
import { AttachmentTray, type SessionFile } from "@/components/attachments/attachment-tray";
import { removeStoredPaths } from "@/lib/file-storage";
import { toDraft, mergeByKey, MOOD_LABELS, ENERGY_LABELS, MOTIVATION_LABELS, FOCUS_LABELS } from "./constants";
import { round, formatHours, cn, toISODate, formatDate, daysBetween } from "@/lib/utils";
import { accomplishedStreak } from "@/lib/selectors";

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

/**
 * The day, written down. Opens on the essentials — study, topics, revision,
 * how it felt, notes and files — with the rarely used lists folded under
 * "More". Saving does everything the day implies in one step: files are
 * kept, finished syllabus topics move on (and can join the revision queue),
 * revisions ticked off are rescheduled, and linked goals pick the day up.
 */
export function JournalComposer({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: JournalEntry;
  onSaved?: (e: JournalEntry) => void;
}) {
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const goals = useChronicle((s) => s.goals);
  const profile = useChronicle((s) => s.profile);
  const saveJournalEntry = useChronicle((s) => s.saveJournalEntry);
  const markAccomplished = useChronicle((s) => s.markAccomplished);
  const confirm = useConfirm();

  const [draft, setDraft] = useState<JournalEntry>(() => toDraft(initial));
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [replaced, setReplaced] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [scheduleRevision, setScheduleRevision] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{
    date: string;
    hours: number;
    streak: number;
    total: number;
  } | null>(null);

  const existingDates = useMemo(() => new Set(journal.map((j) => j.date)), [journal]);
  const isEdit = existingDates.has(initial.date);

  useEffect(() => {
    if (!open) return;
    const d = toDraft(initial);
    setDraft(d);
    setSessionFiles([]);
    setReplaced({});
    setError(null);
    setGoalIds(goals.filter((g) => g.journalDates?.includes(initial.date)).map((g) => g.id));
    // Fold "More" away unless it already holds something.
    setMore(
      Boolean(
        d.wins?.length ||
          d.failures?.length ||
          d.lessons?.length ||
          d.booksStudied?.length ||
          d.currentAffairs?.length ||
          d.mocksAttempted?.length ||
          d.tags?.length,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const todayISO = toISODate(new Date());
  const wouldReplaceAnotherDay = draft.date !== initial.date && existingDates.has(draft.date);
  const totalDraftHours = round(draft.blocks.reduce((a, b) => a + (Number(b.hours) || 0), 0), 1);

  /**
   * Wake-up and bedtime come from the morning check-in (kept on the Life
   * Dashboard). The form shows them for whichever day it points at and saves
   * those values, so it can neither change nor drop them.
   */
  const recordedSleep = useMemo(() => {
    const day = journal.find((j) => j.date === draft.date);
    const life = lifeLog.find((l) => l.date === draft.date);
    return {
      wakeTime: life?.wakeTime || day?.wakeTime || undefined,
      sleepTime: life?.bedtime || day?.sleepTime || undefined,
    };
  }, [journal, lifeLog, draft.date]);

  const studiedSubjects = useMemo(
    () => [...new Set(draft.blocks.map((b) => b.subjectId).filter(Boolean))],
    [draft.blocks],
  );
  const activeGoals = useMemo(
    () =>
      goals
        .filter((g) => g.status === "Active" || goalIds.includes(g.id))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [goals, goalIds],
  );
  const newSyllabusTopics = useMemo(() => {
    const before = new Set(
      (journal.find((j) => j.date === initial.date)?.completedTopics ?? [])
        .map((c) => c.topicId)
        .filter(Boolean),
    );
    return (draft.completedTopics ?? []).filter((c) => c.topicId && !before.has(c.topicId)).length;
  }, [draft.completedTopics, journal, initial.date]);

  function patch(p: Partial<JournalEntry>) {
    setDraft((d) => ({ ...d, ...p }));
    setError(null);
  }

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
  const discardUploads = useCallback((keep: Set<string>) => {
    const stored = new Set(useChronicle.getState().files.map((f) => f.path));
    const paths = sessionFiles
      .filter((s) => s.created && !keep.has(s.record.id) && !stored.has(s.record.path))
      .map((s) => s.record.path);
    if (paths.length) void removeStoredPaths(paths);
  }, [sessionFiles]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(toDraft(initial)) || sessionFiles.length > 0, [draft, initial, sessionFiles]);

  async function close() {
    if (uploading || dirty) {
      const ok = await confirm({
        title: "Discard this entry's changes?",
        description: uploading
          ? "Files are still uploading. Closing stops them and keeps nothing from this edit."
          : "Nothing you changed here will be saved.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    discardUploads(new Set());
    onClose();
  }

  async function save() {
    if (uploading) return;
    const blocks = draft.blocks
      .map((b) => ({ ...b, hours: Math.max(0, Number(b.hours) || 0) }))
      .filter((b) => b.subjectId && b.hours > 0);
    const totalHours = round(blocks.reduce((a, b) => a + b.hours, 0), 1);
    if (totalHours > 24) {
      setError(`That adds up to ${formatHours(totalHours)}. A day can't hold more than 24 hours.`);
      return;
    }
    if (!draft.date || draft.date > todayISO) {
      setError("Pick today or an earlier day.");
      return;
    }
    if (wouldReplaceAnotherDay) {
      const ok = await confirm({
        title: "Replace the entry already logged for that date?",
        description: `${formatDate(draft.date)} already has an entry. Saving replaces it, and its files, with what's in this form.`,
        confirmLabel: "Replace entry",
      });
      if (!ok) return;
    }

    const topics: TopicCompletion[] = (draft.completedTopics ?? []).filter((c) => c.name.trim());
    const entry: JournalEntry = {
      ...draft,
      blocks,
      totalHours,
      completedTopics: topics,
      wakeTime: recordedSleep.wakeTime,
      sleepTime: recordedSleep.sleepTime,
      highlights: draft.highlights?.trim() || undefined,
      reflection: draft.reflection?.trim() || undefined,
    };
    const kept = new Set(entry.fileIds ?? []);
    const result = saveJournalEntry({
      entry,
      previousDate: isEdit ? initial.date : undefined,
      newFiles: sessionFiles.filter((s) => kept.has(s.record.id)).map((s) => s.record),
      goalIds,
      scheduleRevision,
      replaced,
    });
    discardUploads(kept);

    if (result.isNewDay && !isEdit && markAccomplished(entry.date)) {
      // Read back rather than reusing the render's copy, so the streak counts
      // the day just added.
      const marked = useChronicle.getState().accomplished ?? [];
      setCelebration({
        date: entry.date,
        hours: entry.totalHours,
        streak: accomplishedStreak(marked),
        total: marked.length,
      });
    }

    onSaved?.(entry);
    onClose();
  }

  return (
    <>
      {celebration && (
        <AccomplishedModal
          open
          onClose={() => setCelebration(null)}
          date={celebration.date}
          journeyDay={daysBetween(profile.startDate, celebration.date)}
          streak={celebration.streak}
          totalAccomplished={celebration.total}
          hoursToday={celebration.hours}
          daysToExam={daysBetween(toISODate(new Date()), profile.examDate)}
        />
      )}
      <Modal
        open={open}
        onClose={() => void close()}
        title={isEdit ? "Edit entry" : "New entry"}
        description={draft.date ? formatDate(draft.date) : undefined}
        className="sm:max-w-2xl"
        footer={
          <>
            {error && (
              <p className="mr-auto text-xs text-danger" role="alert">
                {error}
              </p>
            )}
            {!error && uploading && <p className="mr-auto text-xs text-paper/55">Waiting for files to finish uploading…</p>}
            <Button variant="ghost" onClick={() => void close()}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={uploading}>
              {isEdit ? "Save changes" : "Save entry"}
            </Button>
          </>
        }
      >
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
            <p
              className="flex items-center gap-3 pb-2.5 text-xs text-paper/60"
              title="From your morning check-in"
            >
              <span className="inline-flex items-center gap-1">
                <Sunrise className="h-3.5 w-3.5 text-paper/45" />
                {recordedSleep.wakeTime ?? "—"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Moon className="h-3.5 w-3.5 text-paper/45" />
                {recordedSleep.sleepTime ?? "—"}
              </span>
              <span className="hidden text-paper/45 sm:inline">from the morning check-in</span>
            </p>
          </div>
          {wouldReplaceAnotherDay && (
            <p className="-mt-4 flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs text-paper/80">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              {formatDate(draft.date)} already has an entry. Saving here will replace it.
            </p>
          )}

          {/* Study */}
          <Section title="Study" aside={`${formatHours(totalDraftHours)} total`}>
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
                    className="flex-1"
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

          {/* Topics */}
          <Section
            title="Topics completed"
            aside={draft.completedTopics?.length ? `${draft.completedTopics.length}` : undefined}
          >
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
                  checked={scheduleRevision}
                  onChange={(e) => setScheduleRevision(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span>
                  Put {newSyllabusTopics === 1 ? "this topic" : `these ${newSyllabusTopics} topics`} on the revision
                  queue, first pass tomorrow.
                </span>
              </label>
            )}
          </Section>

          {/* Revision */}
          <Section title="Revision">
            <RevisionPicker
              date={draft.date}
              sessions={draft.revisionSessions ?? []}
              onChange={(revisionSessions) => patch({ revisionSessions })}
            />
          </Section>

          {/* State of mind */}
          <Section title="How the day felt">
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              <RatingRow label="Mood" value={draft.mood} onChange={(v) => patch({ mood: v })} labels={MOOD_LABELS} />
              <RatingRow label="Energy" value={draft.energy} onChange={(v) => patch({ energy: v })} labels={ENERGY_LABELS} />
              <RatingRow
                label="Motivation"
                value={draft.motivation}
                onChange={(v) => patch({ motivation: v })}
                labels={MOTIVATION_LABELS}
              />
              <RatingRow label="Focus" value={draft.focus} onChange={(v) => patch({ focus: v })} labels={FOCUS_LABELS} />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <Input
              value={draft.highlights ?? ""}
              onChange={(e) => patch({ highlights: e.target.value })}
              placeholder="One line that captures the day"
              aria-label="Highlight of the day"
              maxLength={200}
            />
            <Textarea
              value={draft.reflection ?? ""}
              onChange={(e) => patch({ reflection: e.target.value })}
              placeholder="How did today really go?"
              aria-label="Reflection"
              className="min-h-[96px]"
            />
          </Section>

          {/* Files */}
          <Section title="Files" aside={draft.fileIds?.length ? `${draft.fileIds.length}` : undefined}>
            <AttachmentTray
              entryDate={draft.date}
              otherDates={isEdit && draft.date !== initial.date ? [initial.date] : undefined}
              fileIds={draft.fileIds ?? []}
              onChange={(fileIds) => patch({ fileIds })}
              sessionFiles={sessionFiles}
              onSessionFile={onSessionFile}
              onReplace={onReplace}
              onBusyChange={onBusyChange}
            />
          </Section>

          {/* Goals */}
          {activeGoals.length > 0 && (
            <Section title="Goals this day served" hint="Linked days show up on the goal, with their files.">
              <div className="flex flex-wrap gap-1.5">
                {activeGoals.map((g) => {
                  const on = goalIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setGoalIds((ids) => (on ? ids.filter((x) => x !== g.id) : [...ids, g.id]))
                      }
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        on
                          ? "border-accent/40 bg-accent/[0.12] text-accent"
                          : "border-line text-paper/60 hover:border-paper/25 hover:text-paper",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                      <span className="truncate">{g.title}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Everything else, folded away */}
          <section className="rounded-2xl border border-line">
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-[0.78rem] font-semibold text-paper/80">More details</span>
                <span className="block text-[0.7rem] text-paper/45">
                  Wins, setbacks, lessons, books, current affairs, mocks and tags
                </span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-paper/45 transition-transform", more && "rotate-180")} />
            </button>
            {more && (
              <div className="space-y-6 border-t border-line px-4 pb-4 pt-4">
                <Section title="Wins">
                  <ListEditor items={draft.wins ?? []} onChange={(wins) => patch({ wins })} placeholder="What went well?" />
                </Section>
                <Section title="Setbacks">
                  <ListEditor items={draft.failures ?? []} onChange={(failures) => patch({ failures })} placeholder="What slipped?" />
                </Section>
                <Section title="Lessons">
                  <ListEditor
                    items={draft.lessons ?? []}
                    onChange={(lessons) => patch({ lessons })}
                    placeholder="What will you carry into tomorrow?"
                  />
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
                    <ListEditor
                      variant="chips"
                      items={draft.tags ?? []}
                      onChange={(tags) => patch({ tags })}
                      placeholder="deep-work, revision…"
                    />
                  </Section>
                </div>
              </div>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
