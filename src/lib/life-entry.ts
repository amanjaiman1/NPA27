import type { ExerciseType, ISODate, LifeEntry, LifeField } from "./types";
import { round } from "./utils";
import { checkSleep, hoursFromTimes, isClock, MAX_SLEEP_HOURS, sleepMinutes } from "./sleep";

/* ════════════════════════════════════════════════════════════════
   The Life Dashboard form, as pure functions.

   The form edits strings so that an empty box can mean "not recorded".
   Turning it back into an entry keeps that distinction: a blank stays
   absent, a typed 0 is stored as 0, and nothing is filled in for you.
   ════════════════════════════════════════════════════════════════ */

export type LifeNumberKey =
  | "sleepHours"
  | "exerciseMinutes"
  | "walkKm"
  | "runKm"
  | "waterLiters"
  | "meditationMin"
  | "screenTimeMin"
  | "weightKg"
  | "deepWorkHours";

export interface LifeInputDef {
  key: LifeNumberKey;
  field: LifeField;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: string;
  /** Stored as a whole number. */
  integer?: boolean;
}

export const LIFE_INPUTS: LifeInputDef[] = [
  // Time asleep, only when it differs from bedtime to wake-up (lay awake, woke in the night).
  { key: "sleepHours", field: "sleep", label: "Time asleep, if different", unit: "h", min: 0.25, max: MAX_SLEEP_HOURS, step: "0.25" },
  { key: "exerciseMinutes", field: "exercise", label: "Exercise", unit: "min", min: 0, max: 600, step: "5", integer: true },
  { key: "walkKm", field: "walk", label: "Walked", unit: "km", min: 0, max: 100, step: "0.1" },
  { key: "runKm", field: "run", label: "Ran", unit: "km", min: 0, max: 100, step: "0.1" },
  { key: "waterLiters", field: "water", label: "Water", unit: "L", min: 0, max: 15, step: "0.25" },
  { key: "meditationMin", field: "meditation", label: "Meditation", unit: "min", min: 0, max: 600, step: "5", integer: true },
  { key: "screenTimeMin", field: "screen", label: "Screen time", unit: "min", min: 0, max: 1440, step: "5", integer: true },
  { key: "weightKg", field: "weight", label: "Weight", unit: "kg", min: 20, max: 300, step: "0.1" },
  { key: "deepWorkHours", field: "deepWork", label: "Deep work", unit: "h", min: 0, max: 24, step: "0.25" },
];

export const EXERCISE_TYPES: ExerciseType[] = ["Run", "Walk", "Gym", "Yoga", "Cycling", "Sports", "Other"];

export function inputDef(key: LifeNumberKey): LifeInputDef {
  return LIFE_INPUTS.find((d) => d.key === key) as LifeInputDef;
}

export interface LifeDraft {
  date: ISODate;
  numbers: Record<LifeNumberKey, string>;
  /** 1–5, or undefined when not rated. */
  sleepQuality?: number;
  bedtime: string;
  wakeTime: string;
  exerciseType: ExerciseType | "";
  note: string;
}

export type LifeDraftErrors = Partial<Record<LifeNumberKey | "date" | "sleepQuality" | "sleepTimes", string>>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The form's starting state for a day: what is saved, and blanks for the rest. */
export function draftFromEntry(date: ISODate, entry?: LifeEntry): LifeDraft {
  const numbers = {} as Record<LifeNumberKey, string>;
  for (const d of LIFE_INPUTS) {
    const v = entry?.[d.key];
    numbers[d.key] = typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  }
  // Hours that are simply bedtime to wake-up aren't a separate answer: the box
  // is for time asleep when it differs, so it starts empty.
  const fromTimes = entry ? sleepMinutes(entry.date, entry.bedtime, entry.wakeTime) : null;
  if (fromTimes != null && typeof entry?.sleepHours === "number" && Math.abs(entry.sleepHours * 60 - fromTimes) <= 2) {
    numbers.sleepHours = "";
  }
  return {
    date,
    numbers,
    sleepQuality: typeof entry?.sleepQuality === "number" ? entry.sleepQuality : undefined,
    bedtime: entry?.bedtime ?? "",
    wakeTime: entry?.wakeTime ?? "",
    exerciseType: entry?.exerciseType ?? "",
    note: entry?.note ?? "",
  };
}

/** Hours from bedtime to wake-up for the draft's day, or null until both are set. */
export function sleepFromTimes(draft: Pick<LifeDraft, "date" | "bedtime" | "wakeTime">): number | null {
  return hoursFromTimes(draft.date, draft.bedtime, draft.wakeTime) ?? null;
}

/**
 * The entry a draft describes, with a message per field that can't be saved.
 *
 * `entry` is null when the day would carry nothing at all, so the caller can
 * drop the day instead of storing an empty record. Links to journal files are
 * not part of the draft: they're saved the moment they're made, so `existing`
 * supplies them.
 */
export function entryFromDraft(
  draft: LifeDraft,
  today: ISODate,
  existing?: LifeEntry,
): { entry: LifeEntry | null; errors: LifeDraftErrors } {
  const errors: LifeDraftErrors = {};
  if (!ISO.test(draft.date)) errors.date = "Pick a valid date.";
  else if (draft.date > today) errors.date = "The date can't be in the future.";

  const entry: LifeEntry = { id: `life-${draft.date}`, date: draft.date };
  for (const d of LIFE_INPUTS) {
    const raw = draft.numbers[d.key]?.trim() ?? "";
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors[d.key] = "Enter a number, or leave it blank.";
      continue;
    }
    if (n < d.min || n > d.max) {
      errors[d.key] = `Between ${d.min} and ${d.max} ${d.unit}.`;
      continue;
    }
    entry[d.key] = d.integer ? Math.round(n) : round(n, 2);
  }

  if (draft.sleepQuality != null) {
    if (!Number.isInteger(draft.sleepQuality) || draft.sleepQuality < 1 || draft.sleepQuality > 5) {
      errors.sleepQuality = "Rate from 1 to 5.";
    } else entry.sleepQuality = draft.sleepQuality;
  }
  if (isClock(draft.bedtime)) entry.bedtime = draft.bedtime;
  if (isClock(draft.wakeTime)) entry.wakeTime = draft.wakeTime;
  if (entry.bedtime && entry.wakeTime) {
    const check = checkSleep(draft.date, entry.bedtime, entry.wakeTime);
    if (!check.ok) errors.sleepTimes = check.message;
  }
  // No time asleep typed: the night's length is bedtime to wake-up.
  if (entry.sleepHours == null && !errors.sleepHours && !errors.sleepTimes) {
    const h = sleepFromTimes(draft);
    if (h != null) entry.sleepHours = h;
  }
  if (draft.exerciseType) entry.exerciseType = draft.exerciseType;
  const note = draft.note.trim().slice(0, 280);
  if (note) entry.note = note;
  if (existing?.fileIds?.length) entry.fileIds = [...existing.fileIds];

  const carries = Object.keys(entry).some((k) => k !== "id" && k !== "date");
  return { entry: carries ? entry : null, errors };
}

/** Whether two drafts differ in anything that would be saved. */
export function draftsDiffer(a: LifeDraft, b: LifeDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
