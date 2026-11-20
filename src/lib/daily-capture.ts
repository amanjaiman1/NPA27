import type { Goal, GoalStatus, Habit, ISODate, LifeEntry, LifeField } from "./types";
import { LIFE_INPUTS } from "./life-entry";

/**
 * Daily Capture: one workspace for a day's journal, Life Dashboard readings,
 * goal updates and habit check-ins. It keeps no data of its own. Each tab
 * holds a draft against the records the standalone pages use, and saving
 * applies the drafts through the store's existing actions (see
 * `components/capture/capture-workspace.tsx`). The helpers here are the parts
 * with rules worth testing: what a draft changes, and applying it so that a
 * retry never applies anything twice.
 */

export type CaptureSection = "day" | "life" | "goals" | "habit";
export const CAPTURE_SECTIONS: CaptureSection[] = ["day", "life", "goals", "habit"];

export function parseSection(v: string | null | undefined): CaptureSection {
  return CAPTURE_SECTIONS.includes(v as CaptureSection) ? (v as CaptureSection) : "day";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A day from the address bar: a valid date no later than today, else today. */
export function parseCaptureDate(v: string | null | undefined, today: ISODate): ISODate {
  return v && ISO.test(v) && !Number.isNaN(Date.parse(v)) && v <= today ? v : today;
}

/* ── goals ─────────────────────────────────────────────────────── */

/** One goal's unsaved update for the day. An absent key changes nothing. */
export interface GoalDraft {
  /** The new total as typed, for a hand-tracked goal. */
  value?: string;
  /** Goes with the reading when there is one, otherwise becomes a goal note. */
  note?: string;
  /** Milestone id → whether it should be done. */
  milestones?: Record<string, boolean>;
  status?: GoalStatus;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A hand-tracked goal's total as of a day: that day's reading, else the latest one before it. */
export function readingOn(goal: Goal, date: ISODate): { value: number; onDay: boolean } {
  const log = goal.progressLog ?? [];
  const same = log.find((p) => p.date === date);
  if (same) return { value: same.value, onDay: true };
  const before = log.filter((p) => p.date < date).sort((a, b) => a.date.localeCompare(b.date));
  if (before.length) return { value: before[before.length - 1].value, onDay: false };
  return { value: goal.current ?? 0, onDay: false };
}

/** A typed amount: zero or more, or null when it isn't one. */
export function parseAmount(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface GoalChanges {
  /** A reading to record for the day. */
  value: number | null;
  /** Milestones whose done state has to flip. */
  milestones: string[];
  status: GoalStatus | null;
  note: string;
  /** The typed total isn't a number of zero or more. */
  invalid: boolean;
}

/** What a draft would change, measured against the goal as it is now. */
export function goalChanges(goal: Goal, draft: GoalDraft | undefined, date: ISODate): GoalChanges {
  const out: GoalChanges = { value: null, milestones: [], status: null, note: draft?.note?.trim() ?? "", invalid: false };
  if (!draft) return out;
  if (draft.value !== undefined) {
    const n = parseAmount(draft.value);
    if (n === null) out.invalid = true;
    else if (round2(n) !== round2(readingOn(goal, date).value)) out.value = n;
  }
  for (const [id, want] of Object.entries(draft.milestones ?? {})) {
    const m = (goal.milestones ?? []).find((x) => x.id === id);
    if (m && Boolean(m.doneOn) !== want) out.milestones.push(id);
  }
  if (draft.status && draft.status !== goal.status) out.status = draft.status;
  return out;
}

export function hasGoalChanges(c: GoalChanges): boolean {
  return c.invalid || c.value !== null || c.milestones.length > 0 || c.status !== null || c.note.length > 0;
}

/** Whether the goal already carries something from that day. */
export function goalUpdatedOn(goal: Goal, date: ISODate): boolean {
  return (
    (goal.progressLog ?? []).some((p) => p.date === date) ||
    (goal.milestones ?? []).some((m) => m.doneOn === date) ||
    (goal.notes ?? []).some((n) => n.date === date) ||
    (goal.journalDates ?? []).includes(date)
  );
}

export interface GoalStore {
  goals: Goal[];
  logGoalProgress: (id: string, value: number, note?: string, date?: ISODate) => void;
  toggleGoalMilestone: (goalId: string, milestoneId: string, date?: ISODate) => void;
  addGoalNote: (goalId: string, text: string, date?: ISODate) => void;
  setGoalStatus: (id: string, status: GoalStatus) => void;
  setGoalJournalDates: (goalId: string, dates: ISODate[]) => void;
}

/**
 * Applies one goal's draft to the original goal. Every step is measured
 * against the goal as it is at that moment, and the steps that can be
 * repeated harmlessly go first, so a retry after a failure part-way through
 * never ticks a milestone back or records a reading twice.
 */
export function applyGoalDraft(get: () => GoalStore, goalId: string, draft: GoalDraft, date: ISODate): void {
  const goal = get().goals.find((g) => g.id === goalId);
  if (!goal) throw new Error("This goal no longer exists.");
  const c = goalChanges(goal, draft, date);
  if (c.invalid) throw new Error("Enter a total of zero or more.");
  for (const id of c.milestones) get().toggleGoalMilestone(goalId, id, date);
  if (c.status) get().setGoalStatus(goalId, c.status);
  // One reading per day, so recording it again replaces it with the same value.
  if (c.value !== null) get().logGoalProgress(goalId, c.value, c.note || undefined, date);
  else if (c.note) get().addGoalNote(goalId, c.note, date);
}

/** Goals whose link to the day's journal entry differs from `wanted`. */
export function linkChanges(goals: Goal[], wanted: string[], date: ISODate): Goal[] {
  const want = new Set(wanted);
  return goals.filter((g) => (g.journalDates ?? []).includes(date) !== want.has(g.id));
}

/** Links or unlinks the day on each goal that differs; already-right goals are left alone. */
export function applyGoalLinks(get: () => GoalStore, wanted: string[], date: ISODate): number {
  const changed = linkChanges(get().goals, wanted, date);
  for (const g of changed) {
    const had = g.journalDates ?? [];
    get().setGoalJournalDates(g.id, had.includes(date) ? had.filter((d) => d !== date) : [...had, date]);
  }
  return changed.length;
}

/* ── habits ────────────────────────────────────────────────────── */

/** Habit id → whether the day should be checked off by hand. */
export type HabitDrafts = Record<string, boolean>;

const checkedOn = (h: Habit, date: ISODate) => h.log?.[date] === true;

/** Habits whose manual check-in for the day differs from the draft. */
export function habitChanges(habits: Habit[], drafts: HabitDrafts, date: ISODate): string[] {
  return Object.entries(drafts)
    .filter(([id, want]) => {
      const h = habits.find((x) => x.id === id);
      return h ? checkedOn(h, date) !== want : false;
    })
    .map(([id]) => id);
}

/**
 * Sets each check-in to the wanted state. The store's action toggles, so it
 * runs only where the habit differs right now: applying the same drafts twice
 * changes nothing the second time. Days a connected habit gets from the
 * journal, the Life Dashboard or revision are read from those records by the
 * Habit Engine and never written here, so they can't be counted twice.
 */
export function applyHabitDrafts(
  get: () => { habits: Habit[]; toggleHabit: (habitId: string, date: string) => void },
  drafts: HabitDrafts,
  date: ISODate,
): string[] {
  const ids = habitChanges(get().habits, drafts, date);
  for (const id of ids) get().toggleHabit(id, date);
  return ids;
}

/** The habits as they'll be once the drafts are saved, to preview the day. */
export function previewHabits(habits: Habit[], drafts: HabitDrafts, date: ISODate): Habit[] {
  if (!Object.keys(drafts).length) return habits;
  return habits.map((h) => {
    if (!(h.id in drafts) || checkedOn(h, date) === drafts[h.id]) return h;
    const log = { ...(h.log ?? {}) };
    if (drafts[h.id]) log[date] = true;
    else delete log[date];
    return { ...h, log };
  });
}

/* ── life ──────────────────────────────────────────────────────── */

/** How many of the tracked measurements a day's entry has a reading for. */
export function lifeRecorded(entry: LifeEntry | null | undefined, tracked: LifeField[]): number {
  if (!entry) return 0;
  const has = (k: string) => typeof (entry as unknown as Record<string, unknown>)[k] === "number";
  return tracked.filter((f) =>
    f === "sleep"
      ? Boolean(entry.bedtime || entry.wakeTime) || has("sleepHours")
      : LIFE_INPUTS.some((d) => d.field === f && has(d.key)),
  ).length;
}
