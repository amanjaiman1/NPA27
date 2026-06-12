import type { JournalEntry } from "@/lib/types";
import { toISODate, uid } from "@/lib/utils";

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
    topicsCompleted: [],
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
    attachments: [],
  };
}

/** Normalise a stored entry into a fully-populated draft for editing. */
export function toDraft(entry: JournalEntry): JournalEntry {
  return {
    ...emptyEntry(entry.date),
    ...entry,
    blocks: entry.blocks.map((b) => ({ ...b })),
    topicsCompleted: [...(entry.topicsCompleted ?? [])],
    booksStudied: (entry.booksStudied ?? []).map((b) => ({ ...b })),
    revisionSessions: (entry.revisionSessions ?? []).map((r) => ({ ...r })),
    mocksAttempted: (entry.mocksAttempted ?? []).map((m) => ({ ...m })),
    currentAffairs: (entry.currentAffairs ?? []).map((c) => ({ ...c })),
    wins: [...(entry.wins ?? [])],
    failures: [...(entry.failures ?? [])],
    lessons: [...(entry.lessons ?? [])],
    tags: [...(entry.tags ?? [])],
    attachments: (entry.attachments ?? []).map((a) => ({ ...a })),
    motivation: entry.motivation ?? entry.focus ?? 3,
  };
}

/** Count how many sections of an entry carry content (for richness hints). */
export function entryRichness(e: JournalEntry): number {
  let n = 0;
  if (e.totalHours > 0) n++;
  if (e.topicsCompleted?.length) n++;
  if (e.booksStudied?.length) n++;
  if (e.revisionSessions?.length) n++;
  if (e.mocksAttempted?.length) n++;
  if (e.currentAffairs?.length) n++;
  if (e.wins?.length) n++;
  if (e.failures?.length) n++;
  if (e.lessons?.length) n++;
  if (e.reflection?.trim()) n++;
  if (e.attachments?.length) n++;
  return n;
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
