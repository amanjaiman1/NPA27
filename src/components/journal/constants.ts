import type { JournalEntry } from "@/lib/types";
import { toISODate, uid } from "@/lib/utils";
import { completedTopicsOf } from "@/lib/topics";

export const MOOD_LABELS = ["", "Drained", "Low", "Steady", "Good", "In flow"];
export const ENERGY_LABELS = ["", "Empty", "Low", "Okay", "High", "Charged"];
export const MOTIVATION_LABELS = ["", "Lost", "Shaky", "Steady", "Driven", "On fire"];
export const FOCUS_LABELS = ["", "Scattered", "Patchy", "Okay", "Sharp", "Locked in"];

/** A fresh entry for a given date (defaults to today). */
export function emptyEntry(date = toISODate(new Date())): JournalEntry {
  return {
    id: uid("j"),
    date,
    wakeTime: "",
    sleepTime: "",
    blocks: [{ subjectId: "", hours: 2 }],
    totalHours: 0,
    completedTopics: [],
    booksStudied: [],
    revisionSessions: [],
    mocksAttempted: [],
    currentAffairs: [],
    mood: 3,
    energy: 3,
    motivation: 3,
    focus: 3,
    wins: [],
    failures: [],
    lessons: [],
    highlights: "",
    reflection: "",
    tags: [],
  };
}

/** Normalise a stored entry into a fully-populated draft for editing. */
export function toDraft(entry: JournalEntry): JournalEntry {
  const draft: JournalEntry = {
    ...emptyEntry(entry.date),
    ...entry,
    blocks: entry.blocks.map((b) => ({ ...b })),
    completedTopics: completedTopicsOf(entry).map((c) => ({ ...c })),
    booksStudied: (entry.booksStudied ?? []).map((b) => ({ ...b })),
    revisionSessions: (entry.revisionSessions ?? []).map((r) => ({ ...r })),
    mocksAttempted: (entry.mocksAttempted ?? []).map((m) => ({ ...m })),
    currentAffairs: (entry.currentAffairs ?? []).map((c) => ({ ...c })),
    wins: [...(entry.wins ?? [])],
    failures: [...(entry.failures ?? [])],
    lessons: [...(entry.lessons ?? [])],
    tags: [...(entry.tags ?? [])],
    fileIds: [...(entry.fileIds ?? [])],
    motivation: entry.motivation ?? entry.focus ?? 3,
  };
  delete draft.topicsCompleted;
  return draft;
}

/**
 * Merge an edited list of label strings back into structured objects,
 * preserving any existing object whose key matches (so seeded extras like
 * scores or page ranges aren't lost on edit).
 */
export function mergeByKey<T>(
  labels: string[],
  existing: T[],
  key: keyof T,
): T[] {
  return labels.map(
    (s) =>
      existing.find((e) => (e[key] as unknown) === s) ??
      ({ [key]: s } as unknown as T),
  );
}
