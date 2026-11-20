"use client";

import { useEffect, useMemo, useState } from "react";
import type { JournalEntry } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { habitContext, habitsMovedOn, movedSummary } from "@/lib/habit-engine";
import { AccomplishedModal } from "@/components/celebrate/accomplished-modal";
import { toISODate, formatDate, daysBetween } from "@/lib/utils";
import { JournalFields, commitJournalEntry, prepareJournalEntry, useJournalEditor, type JournalCelebration } from "./journal-editor";

/**
 * The day, written down, in a dialog. Opens on the essentials — study, topics,
 * revision, how it felt, notes and files — with the rarely used lists folded
 * under "More". Saving does everything the day implies in one step: files are
 * kept, finished syllabus topics move on (and can join the revision queue),
 * revisions ticked off are rescheduled, and linked goals pick the day up.
 * The form itself lives in `journal-editor.tsx`, shared with Daily Capture.
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
  const journal = useChronicle((s) => s.journal);
  const profile = useChronicle((s) => s.profile);
  const confirm = useConfirm();
  const toast = useToast();
  const editor = useJournalEditor(initial);
  const { draft, dirty, uploading, error, setError, reset } = editor;
  const [celebration, setCelebration] = useState<JournalCelebration | null>(null);

  const existingDates = useMemo(() => new Set(journal.map((j) => j.date)), [journal]);
  const isEdit = existingDates.has(initial.date);

  useEffect(() => {
    if (open) reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const todayISO = toISODate(new Date());
  const wouldReplaceAnotherDay = draft.date !== initial.date && existingDates.has(draft.date);

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
    editor.discardUploads(new Set());
    onClose();
  }

  async function save() {
    if (uploading) return;
    const prepared = prepareJournalEntry(draft, todayISO);
    if (!prepared.entry) {
      setError(prepared.error);
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
    const entry = prepared.entry;
    const { celebration: earned } = commitJournalEntry(editor, entry, { previousDate: isEdit ? initial.date : undefined, isEdit });
    if (earned) setCelebration(earned);

    // What the day did for the habits that read the journal and revision.
    const after = useChronicle.getState();
    toast({
      title: isEdit ? "Entry updated" : `${formatDate(entry.date)} saved`,
      description: movedSummary(habitsMovedOn(after.habits, habitContext(after, todayISO), entry.date, ["journal", "revision"])),
    });

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
        <JournalFields editor={editor} isEdit={isEdit} />
      </Modal>
    </>
  );
}
