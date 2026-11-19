"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createBlankAccount, createAccountTemplate, type AccountSetup } from "./seed";
import { accountStorage, STORE_KEY, writeAppearance } from "./account/scope";
import { normalizeProfile, normalizeSnapshot } from "./account/normalize";
import { toISODate, fromISODate, uid } from "./utils";
import { applyRevision, newRevisionItem, resolveTopicId } from "./revision";
import {
  type ThemeMode,
  DEFAULT_THEME_MODE,
  applyThemeMode,
  applyTransparency,
  isThemeMode,
  legacyThemeMode,
  themeModeFromSurface,
} from "./theme";
import { hoursFromTimes, isClock, MAX_SLEEP_HOURS } from "./sleep";
import { pruneFiles } from "./files";
import {
  type ChildPolicy,
  canParent,
  carryForward as carryPlanItems,
  overlapDays,
  duplicatePlan as duplicatePlanContent,
  moveItem,
  normalizePlans,
  removeItem,
  removePlan,
  retargetJournalDate,
  samePeriod,
  stripGoal,
  stripSubject,
  tidyItem,
  tidyPlan,
  undoCarry,
  withJournalDate,
  withStatus,
} from "./roadmap";
import { completedTopicsOf, normName } from "./topics";
import {
  type NotifySettings,
  type NotifyState,
  type DeliveryLog,
  DEFAULT_NOTIFY_SETTINGS,
  EMPTY_NOTIFY_STATE,
  EMPTY_DELIVERY_LOG,
  recordDelivery,
  withDefaults as withNotifyDefaults,
} from "./notifications";
import type {
  ChronicleData,
  FileRecord,
  ISODate,
  JournalEntry,
  MockTest,
  Mistake,
  MistakeStatus,
  Goal,
  GoalStatus,
  Milestone,
  Reflection,
  Book,
  CurrentAffair,
  RevisionItem,
  Review,
  Subject,
  Topic,
  TopicStatus,
  TopicLink,
  Habit,
  HabitOverride,
  CoachDecision,
  CoachBriefingRecord,
  LifeEntry,
  PlanItem,
  PlanItemStatus,
  PlanReview,
  RoadmapPlan,
} from "./types";

/** What a new or edited habit can be given. */
export type HabitInput = Partial<Omit<Habit, "id" | "createdOn" | "log" | "cadence" | "targetPerWeek">> & { name: string };

/** How many coach decisions and briefings an account keeps. */
const COACH_DECISIONS_KEPT = 300;
const COACH_BRIEFINGS_KEPT = 60;

function isCoachLog(v: unknown): v is ChronicleData["coach"] {
  const c = v as ChronicleData["coach"] | undefined;
  return Boolean(c && Array.isArray(c.decisions) && Array.isArray(c.briefings));
}

/** Only the fields a habit is configured with, trimmed. */
function cleanHabitInput(input: Partial<HabitInput>): Partial<Habit> {
  const out: Partial<Habit> = {};
  const keys = [
    "description",
    "category",
    "icon",
    "schedule",
    "source",
    "metric",
    "target",
    "subjectId",
    "allowManual",
    "countFrom",
    "remindAt",
    "archived",
    "overrides",
    "pauses",
  ] as const;
  for (const k of keys) {
    const v = input[k];
    if (v === undefined || v === null || v === "") continue;
    (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

/**
 * Keeps the older `cadence` and `targetPerWeek` in step with the schedule, so
 * a device still running an earlier version reads the habit sensibly.
 */
function withLegacyCadence(h: Habit): Habit {
  const s = h.schedule;
  if (s?.kind === "weekly") return { ...h, cadence: "weekly", targetPerWeek: s.timesPerWeek };
  return { ...h, cadence: "daily", targetPerWeek: 7 };
}

/** What a journal save did, for the composer to report. */
export interface JournalSaveResult {
  /** The day had no entry before this save — what earns the celebration. */
  isNewDay: boolean;
  /** Spaced-repetition items moved on by the revision picker. */
  revisionsAdvanced: number;
  /** Syllabus topics that moved from untouched to learning. */
  topicsCredited: number;
  /** New revision-queue items for topics finished today. */
  revisionsScheduled: number;
}

/** Where a journal file can be linked from, besides the journal itself. */
export type FileLinkTarget = { kind: "goal"; id: string } | { kind: "life"; date: ISODate };

interface ChronicleState extends ChronicleData {
  /** Light or Dark. Synced, so the choice follows the account. */
  themeMode: ThemeMode;
  /** Nearly solid surfaces and no blur, in either theme. Synced. */
  reduceTransparency: boolean;
  _hasHydrated: boolean;

  /**
   * The `sleepDayKey` for which the daily sleep/wake prompt has already been
   * answered. Synced with the account, so answering on one device counts for all.
   */
  lastSleepPrompt?: string;

  /**
   * Storage paths of files this device removed and still has to delete from
   * the bucket. Per device and not synced: the device that removed a file is
   * the one that deletes it, retrying until it's online.
   */
  fileTrash: string[];

  /* meta */
  setHasHydrated: (v: boolean) => void;
  setThemeMode: (m: ThemeMode) => void;
  setReduceTransparency: (v: boolean) => void;
  /** Back to an empty account that hasn't been set up. */
  resetData: () => void;
  /** Replace all synced data with a snapshot pulled from the cloud. */
  applyCloudSnapshot: (snap: Partial<CloudSnapshot>) => void;
  updateProfile: (patch: Partial<ChronicleData["profile"]>) => void;
  /**
   * Finishes first-run setup: the syllabus, books and habits are built for
   * the answers given, and the profile is marked as set up.
   * Anything already logged is left alone.
   */
  completeOnboarding: (setup: AccountSetup) => void;
  /**
   * Strips photos and files from journal entries saved before attachments were
   * removed. Returns how many were removed.
   */
  removeLegacyAttachments: () => number;

  /* journal */
  upsertJournal: (entry: JournalEntry) => void;
  /**
   * Saves a day from the composer, and everything it touches: files added to
   * it, goals it is linked to, syllabus topics finished and revisions ticked
   * off. `previousDate` is the day the entry was opened on, so changing the
   * date moves the entry instead of copying it.
   */
  saveJournalEntry: (input: {
    entry: JournalEntry;
    previousDate?: ISODate;
    newFiles?: FileRecord[];
    /** The goals this day belongs with. Omit to leave links alone. */
    goalIds?: string[];
    /** Put newly finished syllabus topics on the revision queue. */
    scheduleRevision?: boolean;
    /**
     * Files replaced in this edit, old id → new id. Goals and life days that
     * linked the old file follow it to the new one, once no journal day holds
     * the old one any more.
     */
    replaced?: Record<string, string>;
  }) => JournalSaveResult;
  /** Deletes a day; files only it held go too. */
  deleteJournal: (date: ISODate) => void;

  /**
   * Mark a day accomplished. Returns true only when the day *became*
   * accomplished — that's the signal the celebration listens for, so saving an
   * entry twice, or a re-render, never re-fires it. Idempotent by design.
   */
  markAccomplished: (date: ISODate) => boolean;

  /* mocks */
  upsertMock: (m: MockTest) => void;
  deleteMock: (id: string) => void;

  /* subjects / topics */
  updateTopic: (subjectId: string, topicId: string, patch: Partial<Topic>) => void;
  reviseTopic: (topicId: string) => void;
  setTopicStatusById: (topicId: string, status: TopicStatus) => void;
  /** Appends a topic and returns its new id, or null if the subject is unknown. */
  addTopic: (subjectId: string, name: string) => string | null;
  deleteTopic: (subjectId: string, topicId: string) => void;
  /** Sets status and confidence together; omit `confidence` to keep the higher of the two. */
  setTopicProgress: (
    subjectId: string,
    topicId: string,
    status: TopicStatus,
    confidence?: number,
  ) => void;
  setTopicsStatus: (subjectId: string, topicIds: string[], status: TopicStatus) => void;
  upsertSubject: (subject: Subject) => void;
  /** Also removes revisions and mistakes that referenced the subject. */
  deleteSubject: (id: string) => void;

  /* knowledge graph */
  addTopicLink: (source: string, target: string, relation?: string) => void;
  removeTopicLink: (id: string) => void;

  /* mistakes */
  upsertMistake: (m: Mistake) => void;
  setMistakeStatus: (id: string, status: MistakeStatus) => void;
  reviewMistake: (id: string, gotItRight: boolean) => void;
  deleteMistake: (id: string) => void;

  /* goals */
  upsertGoal: (g: Goal) => void;
  deleteGoal: (id: string) => void;
  setGoalStatus: (id: string, status: GoalStatus) => void;
  /** A hand-tracked goal's new number, kept in its history. */
  logGoalProgress: (id: string, value: number, note?: string) => void;
  toggleGoalMilestone: (goalId: string, milestoneId: string) => void;
  addGoalNote: (goalId: string, text: string) => void;
  deleteGoalNote: (goalId: string, noteId: string) => void;
  setGoalJournalDates: (goalId: string, dates: ISODate[]) => void;

  /* files */
  /** Points a goal or a life day at journal files. Never uploads anything. */
  linkFiles: (target: FileLinkTarget, fileIds: string[]) => void;
  /** Drops a link. The file itself stays in the journal. */
  unlinkFile: (target: FileLinkTarget, fileId: string) => void;
  /** Takes a file out of every journal day, which deletes it and its links. */
  removeFileEverywhere: (fileId: string) => void;
  /** Called by the janitor once paths are gone from the bucket. */
  clearFileTrash: (paths: string[]) => void;

  /* milestones */
  upsertMilestone: (m: Milestone) => void;
  deleteMilestone: (id: string) => void;

  /* personal diary (stored as `reflections`, the name it always had) */
  upsertReflection: (r: Reflection) => void;
  /**
   * Saves a diary entry with any files just uploaded for it. Files already
   * stored (same content) are reused, never copied; files no entry or journal
   * day holds any more are let go. Stamps `createdAt` and `updatedAt`.
   */
  saveDiaryEntry: (input: { entry: Reflection; newFiles?: FileRecord[] }) => Reflection;
  /** Pin an entry to the top, or mark it important. */
  setDiaryFlag: (id: string, flag: "pinned" | "important", on: boolean) => void;
  deleteReflection: (id: string) => void;

  /* books */
  upsertBook: (b: Book) => void;
  updateBookProgress: (id: string, currentPage: number) => void;

  /* current affairs */
  upsertCurrentAffair: (c: CurrentAffair) => void;
  toggleBookmark: (id: string) => void;
  deleteCurrentAffair: (id: string) => void;

  /* revision (spaced repetition) */
  reviseItem: (id: string, remembered: boolean) => void;
  upsertRevision: (item: RevisionItem) => void;
  deleteRevision: (id: string) => void;
  /**
   * Advances every scheduled item a journal entry says was revised, and credits
   * the matching syllabus topic. Returns how many items moved, so the caller can
   * tell the user. Safe to call repeatedly for the same day.
   */
  applyJournalRevisions: (entry: JournalEntry) => number;

  /* reviews */
  upsertReview: (r: Review) => void;
  deleteReview: (id: string) => void;

  /* habits (see lib/habit-engine.ts) */
  /** A manual check-in for a day: ticks it, or unticks it if ticked. */
  toggleHabit: (habitId: string, date: string) => void;
  /** Creates a habit; a bare name makes a daily habit you check off. Returns its id. */
  addHabit: (input: string | HabitInput) => string;
  updateHabit: (id: string, patch: Partial<HabitInput>) => void;
  /** Retires a habit (hidden, history kept) or brings it back. */
  setHabitArchived: (id: string, archived: boolean) => void;
  /** Pauses from today, or resumes. Paused days are neither kept nor missed. */
  setHabitPaused: (id: string, paused: boolean) => void;
  /** A hand correction for a day, which always wins over the source. `null` clears it. */
  setHabitOverride: (id: string, date: ISODate, override: Omit<HabitOverride, "at"> | null) => void;
  deleteHabit: (id: string) => void;

  /* study coach history */
  /** Records what you did with a recommendation. */
  recordCoachDecision: (d: Omit<CoachDecision, "id" | "at">) => void;
  /** Keeps today's briefing headlines, once a day. */
  recordCoachBriefing: (b: Omit<CoachBriefingRecord, "id">) => void;

  /* roadmap
     Plans are this person's own; nothing here creates one for them. A plan
     links to goals and journal days by reference and never edits them. */
  /**
   * Creates or updates a plan (with its items), stamping `updatedAt`. A new
   * plan for a period that already has one is refused: returns false.
   */
  savePlan: (plan: RoadmapPlan) => boolean;
  /** Several new plans at once (a year and its months). Periods already planned are skipped. */
  addPlans: (plans: RoadmapPlan[]) => number;
  /** `keep` moves the plans under it up a level, or makes them stand alone; `delete` removes them too. */
  deletePlan: (id: string, children: ChildPolicy) => void;
  /** A copy of a plan's own content for another period. Returns the new plan's id, or null if that period is taken. */
  duplicatePlan: (
    id: string,
    target: { year?: number; month?: string; start?: ISODate; title?: string; parentId?: string },
  ) => string | null;
  setPlanArchived: (id: string, archived: boolean) => void;
  /**
   * Puts plans under a parent, or takes them out (`parentId` undefined). Only
   * links that can hold are made: the right levels and overlapping dates.
   */
  setPlanParent: (ids: string[], parentId: string | undefined) => number;
  /** Creates or updates one activity or milestone in a plan. */
  savePlanItem: (planId: string, item: PlanItem) => void;
  deletePlanItem: (planId: string, itemId: string) => void;
  setPlanItemStatus: (planId: string, itemId: string, status: PlanItemStatus) => void;
  movePlanItem: (planId: string, itemId: string, delta: -1 | 1) => void;
  /** Copies unfinished activities into another plan; the originals stay, marked as carried. Returns how many moved. */
  carryForward: (fromPlanId: string, itemIds: string[], toPlanId: string) => number;
  undoCarryForward: (planId: string, itemId: string) => { ok: boolean; reason?: string };
  /** Links or unlinks a journal day. Neither record is otherwise changed. */
  setItemJournalLink: (planId: string, itemId: string, date: ISODate, linked: boolean) => void;
  savePlanReview: (planId: string, review: PlanReview) => void;

  /* life dashboard */
  /**
   * Saves a day. `previousDate` moves an entry opened on another date. The
   * bedtime and wake-up are mirrored onto that day's journal entry, so the two
   * never disagree about the same night.
   */
  upsertLifeEntry: (entry: LifeEntry, previousDate?: ISODate) => void;
  deleteLifeEntry: (date: ISODate) => void;

  /* ── notifications ──────────────────────────────────────────
     Notices themselves are never stored — they're derived on demand by
     `lib/notifications.ts`. Only your *reaction* to them lives here. */

  /** Notification preferences. Synced, so they follow you across devices. */
  notify: NotifySettings;
  /**
   * Read / dismissed / snoozed notice ids. Synced too: acknowledging something
   * on your phone should not leave the laptop still nagging about it.
   */
  notifyState: NotifyState;
  /**
   * Per-device delivery bookkeeping for the rate limits. Deliberately *not*
   * synced — each device fires its own OS notifications, so each keeps its own
   * count. Sharing it would let one device's digest silence another's.
   */
  notifyLog: DeliveryLog;
  updateNotifySettings: (patch: Partial<NotifySettings>) => void;
  markNoticeRead: (id: string) => void;
  markNoticesRead: (ids: string[]) => void;
  dismissNotice: (id: string) => void;
  /** Hide a notice until `until` (an ISO date, exclusive of that day). */
  snoozeNotice: (id: string, until: ISODate) => void;
  /** Drop read/dismiss/snooze entries that no live notice claims any more. */
  pruneNotifyState: (stale: {
    readIds: string[];
    dismissedIds: string[];
    snoozedIds: string[];
  }) => void;
  recordNoticeDelivery: (
    delivered: { dedupeKey: string }[],
    now: Date,
    digest?: boolean,
  ) => void;

  /**
   * Record last night's sleep + this morning's wake-up once. They are kept on
   * today's Life Dashboard day (created with only these readings if missing),
   * and copied onto today's journal entry if one exists. No journal entry is
   * created: a placeholder day made saving the real one count as an edit.
   * Also stamps `lastSleepPrompt` so the prompt isn't shown again today.
   */
  logDailySleep: (input: {
    date: ISODate;
    promptKey: string;
    sleepTime: string;
    wakeTime: string;
    sleepHours: number;
  }) => void;

  /**
   * Records or edits one night, on the Life Dashboard day you woke up on.
   * Only the fields given change; every other reading on that day is kept.
   * For each field, `undefined` leaves it alone and `null` clears it. Hours
   * come from the two times unless `hours` is given (time asleep entered by
   * hand). The journal entry for the same day, if there is one, shows the
   * same bedtime and wake-up.
   */
  recordSleep: (input: {
    date: ISODate;
    bedtime?: string | null;
    wakeTime?: string | null;
    hours?: number | null;
    quality?: number | null;
    /** Also mark the morning check-in as answered for this key. */
    promptKey?: string;
  }) => void;
  /** Removes one night's sleep; the day's other readings stay. */
  clearSleep: (date: ISODate) => void;
  /** "Skip for today" on the morning check-in. Synced, so other devices don't ask either. */
  dismissSleepPrompt: (key: string) => void;
}

/**
 * The set of state keys that are persisted *and* synced to the cloud — all
 * logged data plus appearance. Transient bits (hydration flag, action fns)
 * are excluded. Keep this in sync with the `ChronicleData` shape.
 */
export const SNAPSHOT_KEYS = [
  "profile",
  "subjects",
  "journal",
  "mocks",
  "revisions",
  "currentAffairs",
  "mistakes",
  "habits",
  "sleep",
  "exercise",
  "lifeLog",
  "goals",
  "books",
  "milestones",
  "reflections",
  "reviews",
  "topicLinks",
  "selection",
  "accomplished",
  // Descriptions of attached files; the bytes are in Storage, never here.
  "files",
  // The Roadmap: this person's own yearly, monthly and weekly plans.
  "plans",
  // What the Study Coach suggested and what you did with it.
  "coach",
  "themeMode",
  "reduceTransparency",
  // Remembering that today's sleep prompt was answered must follow the user
  // across devices/logins, so it's part of the synced snapshot too.
  "lastSleepPrompt",
  // Notification preferences and what you've already acknowledged travel with
  // you. `notifyLog` deliberately does not — it's per-device delivery
  // bookkeeping, and sharing it would let one device silence another.
  "notify",
  "notifyState",
] as const;

export type CloudSnapshot = Pick<ChronicleState, (typeof SNAPSHOT_KEYS)[number]>;

const MISTAKE_INTERVALS = [1, 3, 7, 16, 35];

const STATUS_CONF: Record<TopicStatus, number> = {
  untouched: 10,
  learning: 40,
  revised: 68,
  mastered: 92,
};
const STATUS_RANK: Record<TopicStatus, number> = {
  untouched: 0,
  learning: 1,
  revised: 2,
  mastered: 3,
};
function statusFromConfidence(c: number): TopicStatus {
  if (c >= 80) return "mastered";
  if (c >= 55) return "revised";
  if (c >= 25) return "learning";
  return "untouched";
}
function maxStatus(a: TopicStatus, b: TopicStatus): TopicStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/**
 * Credits a set of syllabus topics with one revision each — the same +6
 * confidence, `revisionCount` bump and upward-only status ratchet that
 * `reviseTopic` applies to a single topic. Shared so that reviewing from the
 * Revision page and reviewing via a journal entry treat the syllabus identically.
 */
function creditTopics(subjects: Subject[], topicIds: string[]): Subject[] {
  if (!topicIds.length) return subjects;
  const wanted = new Set(topicIds);
  return subjects.map((sub) =>
    !sub.topics.some((t) => wanted.has(t.id))
      ? sub
      : {
          ...sub,
          topics: sub.topics.map((t) => {
            if (!wanted.has(t.id)) return t;
            const confidence = Math.min(100, t.confidence + 6);
            return {
              ...t,
              revisionCount: t.revisionCount + 1,
              lastTouched: toISODate(new Date()),
              confidence,
              status: maxStatus(t.status, statusFromConfidence(confidence)),
            };
          }),
        },
  );
}

/** Adds `date` to a sorted, duplicate-free list of dates. */
function withDate(list: ISODate[] | undefined, date: ISODate): ISODate[] {
  const set = new Set(list ?? []);
  set.add(date);
  return [...set].sort();
}

/** The topics finished on a day that point at the syllabus, by topic id. */
function linkedTopicIds(entry: JournalEntry | undefined): Set<string> {
  const out = new Set<string>();
  if (!entry) return out;
  for (const c of completedTopicsOf(entry)) if (c.topicId) out.add(c.topicId);
  return out;
}

export const useChronicle = create<ChronicleState>()(
  persist(
    (set, get) => ({
      ...createBlankAccount(),
      themeMode: DEFAULT_THEME_MODE,
      reduceTransparency: false,
      _hasHydrated: false,
      lastSleepPrompt: undefined,
      notify: DEFAULT_NOTIFY_SETTINGS,
      notifyState: EMPTY_NOTIFY_STATE,
      notifyLog: EMPTY_DELIVERY_LOG,
      fileTrash: [],

      setHasHydrated: (v) => set({ _hasHydrated: v }),
      // Appearance is per account. Each setter also records the choice under the
      // account's own pre-paint key (see `writeAppearance`), so the next cold
      // start paints this person's look and nobody else's.
      setThemeMode: (m) => {
        applyThemeMode(m, { animate: true });
        writeAppearance("theme", m);
        set({ themeMode: m });
      },
      setReduceTransparency: (v) => {
        applyTransparency(v, { animate: true });
        writeAppearance("transparency", v ? "reduced" : "auto");
        set({ reduceTransparency: v });
      },
      resetData: () => set({ ...createBlankAccount() }),
      applyCloudSnapshot: (snap) =>
        set(() => {
          const normalized = normalizeSnapshot(snap);
          const next: Record<string, unknown> = {};
          for (const k of SNAPSHOT_KEYS) {
            if (normalized[k] !== undefined) next[k] = normalized[k];
          }
          // The normalised values, so a retired choice never reaches the page.
          // Re-applied here so a theme pulled from another device takes effect.
          const { themeMode, reduceTransparency } = normalized;
          if (themeMode) {
            writeAppearance("theme", themeMode);
            applyThemeMode(themeMode);
          }
          if (reduceTransparency !== undefined) {
            writeAppearance("transparency", reduceTransparency ? "reduced" : "auto");
            applyTransparency(reduceTransparency);
          }
          return next as Partial<ChronicleState>;
        }),
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

      completeOnboarding: (setup) =>
        set((s) => {
          const template = createAccountTemplate(setup);
          /**
           * Keep anything the account already has — a syllabus edited on another
           * device before setup finished, say — and only fill in what is still
           * the untouched template. Personal records are never replaced.
           */
          const untouched = (list: unknown[]) => list.length === 0;
          const subjectsUntouched = s.subjects.every((sub) =>
            sub.topics.every((t) => t.status === "untouched" && t.revisionCount === 0),
          );
          return {
            profile: { ...s.profile, ...template.profile },
            subjects: subjectsUntouched ? template.subjects : s.subjects,
            topicLinks: subjectsUntouched ? template.topicLinks : s.topicLinks,
            books: s.books.every((b) => b.currentPage === 0) ? template.books : s.books,
            habits: s.habits.every((h) => Object.keys(h.log).length === 0)
              ? template.habits
              : s.habits,
            // Retired with the Selection Archive: whatever is there stays.
            selection: s.selection,
            goals: untouched(s.goals) ? template.goals : s.goals,
          };
        }),

      removeLegacyAttachments: () => {
        let removed = 0;
        set((s) => ({
          journal: s.journal.map((e) => {
            if (!e.attachments?.length) return e;
            removed += e.attachments.length;
            const rest = { ...e };
            delete rest.attachments;
            return rest;
          }),
        }));
        return removed;
      },

      markAccomplished: (date) => {
        let became = false;
        set((s) => {
          const list = s.accomplished ?? [];
          if (list.includes(date)) return {};
          became = true;
          return { accomplished: [...list, date].sort() };
        });
        return became;
      },

      upsertJournal: (entry) =>
        set((s) => {
          const idx = s.journal.findIndex((j) => j.date === entry.date);
          const journal = [...s.journal];
          // An id another day already uses would make the two move as one.
          const clash = journal.some((j, i) => i !== idx && j.id === entry.id);
          const next = clash ? { ...entry, id: uid("j") } : entry;
          if (idx >= 0) journal[idx] = next;
          else journal.push(next);
          journal.sort((a, b) => a.date.localeCompare(b.date));
          return { journal };
        }),

      saveJournalEntry: ({ entry, previousDate, newFiles = [], goalIds, scheduleRevision = false, replaced = {} }) => {
        const s = get();
        const result: JournalSaveResult = {
          isNewDay: !s.journal.some((j) => j.date === entry.date),
          revisionsAdvanced: 0,
          topicsCredited: 0,
          revisionsScheduled: 0,
        };
        const moving = previousDate && previousDate !== entry.date ? previousDate : null;
        const before =
          s.journal.find((j) => j.date === entry.date) ??
          (moving ? s.journal.find((j) => j.date === moving) : undefined);

        /* ── files: one record per content hash ─────────────────── */
        let files = s.files;
        let fileIds = entry.fileIds ?? [];
        if (newFiles.length) {
          const bySha = new Map(files.map((f) => [f.sha256, f] as const));
          const remap = new Map<string, string>();
          const added: FileRecord[] = [];
          for (const f of newFiles) {
            const existing = bySha.get(f.sha256);
            if (existing) remap.set(f.id, existing.id);
            else {
              bySha.set(f.sha256, f);
              added.push(f);
            }
          }
          if (added.length) files = [...files, ...added];
          fileIds = [...new Set(fileIds.map((id) => remap.get(id) ?? id))];
        }

        /* ── the entry itself: replace this date, leave the old one ─ */
        const rest = s.journal.filter((j) => j.date !== entry.date && j.date !== moving);
        const idTaken = rest.some((j) => j.id === entry.id);
        const saved: JournalEntry = {
          ...entry,
          id: idTaken ? uid("j") : entry.id,
          ...(fileIds.length ? { fileIds } : {}),
        };
        if (!fileIds.length) delete saved.fileIds;
        delete saved.topicsCompleted;
        const journal = [...rest, saved].sort((a, b) => a.date.localeCompare(b.date));

        /* ── goals that belong with this day ───────────────────── */
        let goals = s.goals;
        if (goalIds || moving) {
          const want = goalIds ? new Set(goalIds) : null;
          goals = s.goals.map((g) => {
            const had = g.journalDates ?? [];
            let dates = had.filter((d) => d !== moving);
            const wasLinked = had.includes(entry.date) || (moving ? had.includes(moving) : false);
            const linked = want ? want.has(g.id) : wasLinked;
            dates = dates.filter((d) => d !== entry.date);
            if (linked) dates = withDate(dates, entry.date);
            if (dates.length === had.length && dates.every((d, i) => d === had[i])) return g;
            const next = { ...g };
            if (dates.length) next.journalDates = dates;
            else delete next.journalDates;
            return next;
          });
        }

        let lifeLog = s.lifeLog;

        /* ── syllabus: newly finished topics are at least "learning" ─ */
        const already = linkedTopicIds(before);
        const fresh = completedTopicsOf(saved).filter((c) => c.topicId && !already.has(c.topicId));
        let subjects = s.subjects;
        if (fresh.length) {
          const ids = new Set(fresh.map((c) => c.topicId!));
          subjects = s.subjects.map((sub) =>
            !sub.topics.some((t) => ids.has(t.id))
              ? sub
              : {
                  ...sub,
                  topics: sub.topics.map((t) => {
                    if (!ids.has(t.id)) return t;
                    const status = maxStatus(t.status, "learning");
                    if (status !== t.status) result.topicsCredited++;
                    return {
                      ...t,
                      status,
                      confidence: Math.max(t.confidence, STATUS_CONF[status]),
                      lastTouched:
                        !t.lastTouched || t.lastTouched < saved.date ? saved.date : t.lastTouched,
                    };
                  }),
                },
          );
        }

        /* ── revision queue: schedule what was just finished ──── */
        let revisions = s.revisions;
        if (scheduleRevision && fresh.length) {
          const queued = new Set(s.revisions.map((r) => `${r.subjectId}::${normName(r.topic)}`));
          const today = toISODate(new Date());
          const added: RevisionItem[] = [];
          for (const c of fresh) {
            const found = subjects.find((sub) => sub.topics.some((t) => t.id === c.topicId));
            const topic = found?.topics.find((t) => t.id === c.topicId);
            if (!found || !topic) continue;
            const key = `${found.id}::${normName(topic.name)}`;
            if (queued.has(key)) continue;
            queued.add(key);
            // First pass the day after it was finished, and never in the past.
            const first = fromISODate(saved.date);
            first.setDate(first.getDate() + 1);
            const due = toISODate(first) < today ? today : toISODate(first);
            added.push({
              ...newRevisionItem(found.id, topic.name, fromISODate(saved.date)),
              nextDue: due,
            });
          }
          if (added.length) {
            result.revisionsScheduled = added.length;
            revisions = [...s.revisions, ...added].sort((a, b) => a.nextDue.localeCompare(b.nextDue));
          }
        }

        /* ── a replaced file's links move to its replacement ──── */
        const held = new Set(journal.flatMap((j) => j.fileIds ?? []));
        const moves = Object.entries(replaced).filter(([from, to]) => !held.has(from) && held.has(to));
        if (moves.length) {
          const map = new Map(moves);
          const follow = <T extends { fileIds?: string[] }>(item: T): T =>
            item.fileIds?.some((id) => map.has(id))
              ? { ...item, fileIds: [...new Set(item.fileIds.map((id) => map.get(id) ?? id))] }
              : item;
          goals = goals.map(follow);
          lifeLog = lifeLog.map(follow);
        }

        /* ── files no day holds any more go, with their links ──── */
        const pruned = pruneFiles({ files, journal, goals, lifeLog, reflections: s.reflections });
        files = pruned.files;
        goals = pruned.goals;
        lifeLog = pruned.lifeLog;

        // A day moved to another date takes its links from planned activities along.
        const plans = moving ? retargetJournalDate(s.plans, moving, entry.date) : s.plans;

        set({
          journal,
          files,
          goals,
          lifeLog,
          subjects,
          revisions,
          ...(plans !== s.plans ? { plans } : {}),
          ...(pruned.unusedPaths.length
            ? { fileTrash: [...new Set([...s.fileTrash, ...pruned.unusedPaths])] }
            : {}),
        });
        result.revisionsAdvanced = get().applyJournalRevisions(saved);
        return result;
      },

      deleteJournal: (date) =>
        set((s) => {
          const journal = s.journal.filter((j) => j.date !== date);
          if (journal.length === s.journal.length) return {};
          const goals = s.goals.map((g) => {
            if (!g.journalDates?.includes(date)) return g;
            const next: Goal = { ...g, journalDates: g.journalDates.filter((d) => d !== date) };
            if (!next.journalDates?.length) delete next.journalDates;
            return next;
          });
          const pruned = pruneFiles({ files: s.files, journal, goals, lifeLog: s.lifeLog, reflections: s.reflections });
          // Activities linked to the day keep everything but the link.
          const plans = retargetJournalDate(s.plans, date, null);
          return {
            journal,
            files: pruned.files,
            goals: pruned.goals,
            lifeLog: pruned.lifeLog,
            ...(plans !== s.plans ? { plans } : {}),
            ...(pruned.unusedPaths.length
              ? { fileTrash: [...new Set([...s.fileTrash, ...pruned.unusedPaths])] }
              : {}),
          };
        }),

      upsertMock: (m) =>
        set((s) => {
          const idx = s.mocks.findIndex((x) => x.id === m.id);
          const mocks = [...s.mocks];
          if (idx >= 0) mocks[idx] = m;
          else mocks.push(m);
          mocks.sort((a, b) => a.date.localeCompare(b.date));
          return { mocks };
        }),
      deleteMock: (id) =>
        set((s) => ({ mocks: s.mocks.filter((m) => m.id !== id) })),

      updateTopic: (subjectId, topicId, patch) =>
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            sub.id !== subjectId
              ? sub
              : {
                  ...sub,
                  topics: sub.topics.map((t) =>
                    t.id === topicId ? { ...t, ...patch } : t,
                  ),
                },
          ),
        })),

      addTopic: (subjectId, name) => {
        const clean = name.trim();
        if (!clean) return null;
        /**
         * Ids follow the seed's `<subjectId>-t<n>` convention, but `n` comes from
         * a counter that has to clear every id already present — indexing off
         * `topics.length` would collide the moment a topic in the middle has been
         * deleted, and a duplicate id silently makes two topics move as one.
         */
        const sub = get().subjects.find((x) => x.id === subjectId);
        if (!sub) return null;
        let n = sub.topics.length;
        let id = `${subjectId}-t${n}`;
        while (sub.topics.some((t) => t.id === id)) {
          n += 1;
          id = `${subjectId}-t${n}`;
        }
        set((s) => ({
          subjects: s.subjects.map((x) =>
            x.id !== subjectId
              ? x
              : {
                  ...x,
                  topics: [
                    ...x.topics,
                    {
                      id,
                      name: clean,
                      status: "untouched" as TopicStatus,
                      confidence: 0,
                      revisionCount: 0,
                    },
                  ],
                },
          ),
        }));
        return id;
      },

      deleteTopic: (subjectId, topicId) =>
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            sub.id !== subjectId
              ? sub
              : { ...sub, topics: sub.topics.filter((t) => t.id !== topicId) },
          ),
          // A link to a topic that no longer exists would draw an edge to nothing
          // in the knowledge graph, so those go with it.
          topicLinks: s.topicLinks.filter(
            (l) => l.source !== topicId && l.target !== topicId,
          ),
        })),

      /**
       * Marks progress. Status and confidence are set together because they are
       * two readings of the same thing — the old flow snapped confidence to a
       * fixed number per status, so a topic you were 85% sure of dropped to 68
       * the moment you tagged it "revised".
       */
      setTopicProgress: (subjectId, topicId, status, confidence) =>
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            sub.id !== subjectId
              ? sub
              : {
                  ...sub,
                  topics: sub.topics.map((t) =>
                    t.id !== topicId
                      ? t
                      : {
                          ...t,
                          status,
                          confidence:
                            confidence != null
                              ? Math.max(0, Math.min(100, Math.round(confidence)))
                              : Math.max(t.confidence, STATUS_CONF[status]),
                          lastTouched: toISODate(new Date()),
                        },
                  ),
                },
          ),
        })),

      setTopicsStatus: (subjectId, topicIds, status) => {
        const wanted = new Set(topicIds);
        if (!wanted.size) return;
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            sub.id !== subjectId
              ? sub
              : {
                  ...sub,
                  topics: sub.topics.map((t) =>
                    !wanted.has(t.id)
                      ? t
                      : {
                          ...t,
                          status,
                          // A bulk change is a coarse gesture, so it takes the
                          // status's nominal confidence rather than inventing a
                          // per-topic number.
                          confidence: STATUS_CONF[status],
                          lastTouched: toISODate(new Date()),
                        },
                  ),
                },
          ),
        }));
      },

      upsertSubject: (subject) =>
        set((s) => {
          const idx = s.subjects.findIndex((x) => x.id === subject.id);
          const subjects = [...s.subjects];
          if (idx >= 0) subjects[idx] = subject;
          else subjects.push(subject);
          return { subjects };
        }),

      deleteSubject: (id) =>
        set((s) => ({
          subjects: s.subjects.filter((x) => x.id !== id),
          // Everything that pointed at the subject goes too, rather than being
          // left behind as rows whose subject renders as a raw slug.
          revisions: s.revisions.filter((r) => r.subjectId !== id),
          mistakes: s.mistakes.filter((m) => m.subjectId !== id),
          // Planned activities stay; they just lose the subject label.
          plans: stripSubject(s.plans, id),
        })),

      reviseTopic: (topicId) =>
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            !sub.topics.some((t) => t.id === topicId)
              ? sub
              : {
                  ...sub,
                  topics: sub.topics.map((t) => {
                    if (t.id !== topicId) return t;
                    const confidence = Math.min(100, t.confidence + 6);
                    return {
                      ...t,
                      revisionCount: t.revisionCount + 1,
                      lastTouched: toISODate(new Date()),
                      confidence,
                      status: maxStatus(t.status, statusFromConfidence(confidence)),
                    };
                  }),
                },
          ),
        })),

      setTopicStatusById: (topicId, status) =>
        set((s) => ({
          subjects: s.subjects.map((sub) =>
            !sub.topics.some((t) => t.id === topicId)
              ? sub
              : {
                  ...sub,
                  topics: sub.topics.map((t) =>
                    t.id === topicId
                      ? {
                          ...t,
                          status,
                          confidence: Math.max(t.confidence, STATUS_CONF[status]),
                          lastTouched: toISODate(new Date()),
                        }
                      : t,
                  ),
                },
          ),
        })),

      addTopicLink: (source, target, relation) =>
        set((s) => {
          if (source === target) return {};
          const exists = s.topicLinks.some(
            (l) =>
              (l.source === source && l.target === target) ||
              (l.source === target && l.target === source),
          );
          if (exists) return {};
          return {
            topicLinks: [
              ...s.topicLinks,
              {
                id: uid("lk"),
                source,
                target,
                relation: relation ?? "related",
                createdOn: toISODate(new Date()),
              } as TopicLink,
            ],
          };
        }),
      removeTopicLink: (id) =>
        set((s) => ({ topicLinks: s.topicLinks.filter((l) => l.id !== id) })),

      upsertMistake: (m) =>
        set((s) => {
          const idx = s.mistakes.findIndex((x) => x.id === m.id);
          const mistakes = [...s.mistakes];
          if (idx >= 0) mistakes[idx] = m;
          else mistakes.unshift(m);
          return { mistakes };
        }),
      setMistakeStatus: (id, status) =>
        set((s) => ({
          mistakes: s.mistakes.map((m) => (m.id === id ? { ...m, status } : m)),
        })),
      reviewMistake: (id, gotItRight) =>
        set((s) => ({
          mistakes: s.mistakes.map((m): Mistake => {
            if (m.id !== id) return m;
            const reviewCount = gotItRight ? m.reviewCount + 1 : 0;
            const interval = gotItRight
              ? MISTAKE_INTERVALS[Math.min(reviewCount, MISTAKE_INTERVALS.length - 1)]
              : 1;
            const next = new Date();
            next.setDate(next.getDate() + interval);
            const status: MistakeStatus =
              gotItRight && reviewCount >= 3 ? "Mastered" : "Reviewing";
            return {
              ...m,
              reviewCount,
              intervalDays: interval,
              lastReviewed: toISODate(new Date()),
              nextReview: toISODate(next),
              status,
            };
          }),
        })),
      deleteMistake: (id) =>
        set((s) => ({ mistakes: s.mistakes.filter((m) => m.id !== id) })),

      upsertGoal: (g) =>
        set((s) => {
          const idx = s.goals.findIndex((x) => x.id === g.id);
          const goals = [...s.goals];
          // Completing records the day; reopening clears it.
          const next: Goal =
            g.status === "Completed"
              ? { ...g, completedOn: g.completedOn ?? toISODate(new Date()) }
              : (() => {
                  const open = { ...g };
                  delete open.completedOn;
                  return open;
                })();
          if (idx >= 0) goals[idx] = next;
          else goals.unshift(next);
          return { goals };
        }),
      deleteGoal: (id) =>
        set((s) => {
          // Plans that named the goal keep everything but the link.
          const plans = stripGoal(s.plans, id);
          return { goals: s.goals.filter((g) => g.id !== id), ...(plans !== s.plans ? { plans } : {}) };
        }),

      setGoalStatus: (id, status) => {
        const g = get().goals.find((x) => x.id === id);
        if (g && g.status !== status) get().upsertGoal({ ...g, status });
      },

      logGoalProgress: (id, value, note) =>
        set((s) => ({
          goals: s.goals.map((g) => {
            if (g.id !== id) return g;
            const date = toISODate(new Date());
            const clean = Math.max(0, Math.round(value * 100) / 100);
            const log = [...(g.progressLog ?? [])];
            // One reading per day: a second update the same day replaces the first.
            const today = log.findIndex((p) => p.date === date);
            const entry = { id: today >= 0 ? log[today].id : uid("gp"), date, value: clean, ...(note?.trim() ? { note: note.trim() } : {}) };
            if (today >= 0) log[today] = entry;
            else log.push(entry);
            return { ...g, current: clean, progressLog: log.slice(-200) };
          }),
        })),

      toggleGoalMilestone: (goalId, milestoneId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id !== goalId
              ? g
              : {
                  ...g,
                  milestones: (g.milestones ?? []).map((m) => {
                    if (m.id !== milestoneId) return m;
                    if (m.doneOn) {
                      const open = { ...m };
                      delete open.doneOn;
                      return open;
                    }
                    return { ...m, doneOn: toISODate(new Date()) };
                  }),
                },
          ),
        })),

      addGoalNote: (goalId, text) => {
        const clean = text.trim();
        if (!clean) return;
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id !== goalId
              ? g
              : {
                  ...g,
                  notes: [...(g.notes ?? []), { id: uid("gn"), date: toISODate(new Date()), text: clean.slice(0, 2000) }],
                },
          ),
        }));
      },

      deleteGoalNote: (goalId, noteId) =>
        set((s) => ({
          goals: s.goals.map((g) => {
            if (g.id !== goalId || !g.notes?.length) return g;
            const notes = g.notes.filter((n) => n.id !== noteId);
            const next: Goal = { ...g, notes };
            if (!notes.length) delete next.notes;
            return next;
          }),
        })),

      setGoalJournalDates: (goalId, dates) =>
        set((s) => ({
          goals: s.goals.map((g) => {
            if (g.id !== goalId) return g;
            const clean = [...new Set(dates)].sort();
            const next = { ...g };
            if (clean.length) next.journalDates = clean;
            else delete next.journalDates;
            return next;
          }),
        })),

      linkFiles: (target, fileIds) =>
        set((s) => {
          // Only files that exist, so a goal can't point at someone else's path.
          const known = new Set(s.files.map((f) => f.id));
          const ids = fileIds.filter((id) => known.has(id));
          if (!ids.length) return {};
          const add = <T extends { fileIds?: string[] }>(item: T): T => ({
            ...item,
            fileIds: [...new Set([...(item.fileIds ?? []), ...ids])],
          });
          if (target.kind === "goal") {
            return { goals: s.goals.map((g) => (g.id === target.id ? add(g) : g)) };
          }
          const exists = s.lifeLog.some((l) => l.date === target.date);
          const lifeLog: LifeEntry[] = exists
            ? s.lifeLog.map((l) => (l.date === target.date ? add(l) : l))
            : [...s.lifeLog, add<LifeEntry>({ id: `life-${target.date}`, date: target.date })].sort((a, b) =>
                a.date.localeCompare(b.date),
              );
          return { lifeLog };
        }),

      unlinkFile: (target, fileId) =>
        set((s) => {
          const drop = <T extends { fileIds?: string[] }>(item: T): T => {
            if (!item.fileIds?.includes(fileId)) return item;
            const next: T = { ...item, fileIds: item.fileIds.filter((id) => id !== fileId) };
            if (!next.fileIds?.length) delete (next as { fileIds?: string[] }).fileIds;
            return next;
          };
          return target.kind === "goal"
            ? { goals: s.goals.map((g) => (g.id === target.id ? drop(g) : g)) }
            : { lifeLog: s.lifeLog.map((l) => (l.date === target.date ? drop(l) : l)) };
        }),

      removeFileEverywhere: (fileId) =>
        set((s) => {
          const without = <T extends { fileIds?: string[] }>(e: T): T => {
            if (!e.fileIds?.includes(fileId)) return e;
            const next: T = { ...e, fileIds: e.fileIds.filter((id) => id !== fileId) };
            if (!next.fileIds?.length) delete next.fileIds;
            return next;
          };
          const journal = s.journal.map(without);
          const reflections = s.reflections.map(without);
          const pruned = pruneFiles({ files: s.files, journal, goals: s.goals, lifeLog: s.lifeLog, reflections });
          return {
            journal,
            reflections,
            files: pruned.files,
            goals: pruned.goals,
            lifeLog: pruned.lifeLog,
            ...(pruned.unusedPaths.length
              ? { fileTrash: [...new Set([...s.fileTrash, ...pruned.unusedPaths])] }
              : {}),
          };
        }),

      clearFileTrash: (paths) =>
        set((s) => {
          const gone = new Set(paths);
          const fileTrash = s.fileTrash.filter((p) => !gone.has(p));
          return fileTrash.length === s.fileTrash.length ? {} : { fileTrash };
        }),

      upsertMilestone: (m) =>
        set((s) => {
          const idx = s.milestones.findIndex((x) => x.id === m.id);
          const milestones = [...s.milestones];
          if (idx >= 0) milestones[idx] = m;
          else milestones.push(m);
          milestones.sort((a, b) => a.date.localeCompare(b.date));
          return { milestones };
        }),
      deleteMilestone: (id) =>
        set((s) => ({
          milestones: s.milestones.filter((m) => m.id !== id),
        })),

      upsertReflection: (r) =>
        set((s) => {
          const idx = s.reflections.findIndex((x) => x.id === r.id);
          const reflections = [...s.reflections];
          if (idx >= 0) reflections[idx] = r;
          else reflections.unshift(r);
          return { reflections };
        }),
      saveDiaryEntry: ({ entry, newFiles = [] }) => {
        const s = get();
        const now = new Date().toISOString();
        // The same bytes are one file, wherever they were attached.
        const bySha = new Map(s.files.map((f) => [f.sha256, f]));
        const remap = new Map<string, string>();
        const added: FileRecord[] = [];
        for (const f of newFiles) {
          const known = bySha.get(f.sha256);
          if (known) {
            if (known.id !== f.id) remap.set(f.id, known.id);
          } else {
            bySha.set(f.sha256, f);
            added.push(f);
          }
        }
        const fileIds = [...new Set((entry.fileIds ?? []).map((id) => remap.get(id) ?? id))];
        const existing = s.reflections.find((r) => r.id === entry.id);
        const saved: Reflection = {
          ...entry,
          createdAt: existing?.createdAt ?? entry.createdAt ?? now,
          updatedAt: now,
        };
        if (fileIds.length) saved.fileIds = fileIds;
        else delete saved.fileIds;
        const reflections = existing
          ? s.reflections.map((r) => (r.id === entry.id ? saved : r))
          : [saved, ...s.reflections];
        const pruned = pruneFiles({ files: [...s.files, ...added], journal: s.journal, goals: s.goals, lifeLog: s.lifeLog, reflections });
        set({
          reflections,
          files: pruned.files,
          goals: pruned.goals,
          lifeLog: pruned.lifeLog,
          ...(pruned.unusedPaths.length ? { fileTrash: [...new Set([...s.fileTrash, ...pruned.unusedPaths])] } : {}),
        });
        return saved;
      },
      setDiaryFlag: (id, flag, on) =>
        set((s) => ({
          reflections: s.reflections.map((r) => {
            if (r.id !== id) return r;
            const next = { ...r, updatedAt: new Date().toISOString() };
            if (on) next[flag] = true;
            else delete next[flag];
            return next;
          }),
        })),
      deleteReflection: (id) =>
        set((s) => {
          const reflections = s.reflections.filter((r) => r.id !== id);
          const pruned = pruneFiles({ files: s.files, journal: s.journal, goals: s.goals, lifeLog: s.lifeLog, reflections });
          return {
            reflections,
            files: pruned.files,
            goals: pruned.goals,
            lifeLog: pruned.lifeLog,
            ...(pruned.unusedPaths.length ? { fileTrash: [...new Set([...s.fileTrash, ...pruned.unusedPaths])] } : {}),
          };
        }),

      upsertBook: (b) =>
        set((s) => {
          const idx = s.books.findIndex((x) => x.id === b.id);
          const books = [...s.books];
          if (idx >= 0) books[idx] = b;
          else books.unshift(b);
          return { books };
        }),
      updateBookProgress: (id, currentPage) =>
        set((s) => ({
          books: s.books.map((b) => {
            if (b.id !== id) return b;
            const done = currentPage >= b.totalPages;
            return {
              ...b,
              currentPage: Math.min(currentPage, b.totalPages),
              status: done ? "Completed" : currentPage > 0 ? "Reading" : b.status,
              finishedOn: done ? toISODate(new Date()) : b.finishedOn,
            };
          }),
        })),

      upsertCurrentAffair: (c) =>
        set((s) => {
          const idx = s.currentAffairs.findIndex((x) => x.id === c.id);
          const currentAffairs = [...s.currentAffairs];
          if (idx >= 0) currentAffairs[idx] = c;
          else currentAffairs.unshift(c);
          return { currentAffairs };
        }),
      toggleBookmark: (id) =>
        set((s) => ({
          currentAffairs: s.currentAffairs.map((c) =>
            c.id === id ? { ...c, bookmarked: !c.bookmarked } : c,
          ),
        })),
      deleteCurrentAffair: (id) =>
        set((s) => ({
          currentAffairs: s.currentAffairs.filter((c) => c.id !== id),
        })),

      /**
       * Reviewing from the Revision page. The ladder itself lives in
       * `lib/revision.ts` so that this and the journal fan-out below can't drift
       * apart, and so it can be tested without a store.
       */
      reviseItem: (id, remembered) =>
        set((s) => {
          const item = s.revisions.find((it) => it.id === id);
          if (!item) return {};
          const revisions = s.revisions.map((it) =>
            it.id === id ? applyRevision(it, remembered, new Date()) : it,
          );
          // A successful recall also counts towards the syllabus topic, if the
          // item's free-text name resolves to one.
          const topicId = remembered ? resolveTopicId(item, s.subjects) : null;
          return topicId
            ? { revisions, subjects: creditTopics(s.subjects, [topicId]) }
            : { revisions };
        }),

      upsertRevision: (item) =>
        set((s) => {
          const idx = s.revisions.findIndex((x) => x.id === item.id);
          const revisions = [...s.revisions];
          if (idx >= 0) revisions[idx] = item;
          else revisions.push(item);
          revisions.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
          return { revisions };
        }),

      deleteRevision: (id) =>
        set((s) => ({ revisions: s.revisions.filter((r) => r.id !== id) })),

      /**
       * The bridge from the Daily Journal to the revision queue: picking items in
       * the composer records them on the entry, and saving the day advances their
       * schedules here.
       *
       * Two things this has to get right. It schedules from the entry's own date
       * rather than from now, so back-filling yesterday doesn't push the next pass
       * a day late. And it is idempotent — an item already marked revised on that
       * date is left alone, so editing and re-saving a day cannot walk the ladder
       * forward again (which would silently push a topic from a 3-day interval out
       * to 60 by re-saving five times).
       */
      applyJournalRevisions: (entry) => {
        const s = get();
        const linked = (entry.revisionSessions ?? []).filter((r) => r.revisionItemId);
        if (!linked.length) return 0;

        const creditedTopics: string[] = [];
        let advanced = 0;
        const revisions = s.revisions.map((it) => {
          const hit = linked.find((l) => l.revisionItemId === it.id);
          if (!hit) return it;
          if (it.lastRevised === entry.date) return it; // already counted for this day
          const remembered = hit.recalled !== false;
          advanced++;
          if (remembered) {
            const topicId = resolveTopicId(it, s.subjects);
            if (topicId) creditedTopics.push(topicId);
          }
          return applyRevision(it, remembered, fromISODate(entry.date));
        });

        if (!advanced) return 0;
        set({
          revisions,
          ...(creditedTopics.length
            ? { subjects: creditTopics(s.subjects, creditedTopics) }
            : {}),
        });
        return advanced;
      },

      upsertReview: (r) =>
        set((s) => {
          const now = new Date().toISOString();
          const idx = s.reviews.findIndex((x) => x.id === r.id);
          const reviews = [...s.reviews];
          if (idx >= 0) reviews[idx] = { ...r, updatedAt: now };
          else reviews.unshift({ ...r, createdAt: r.createdAt ?? now, updatedAt: now });
          return { reviews };
        }),

      deleteReview: (id) =>
        set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) })),

      toggleHabit: (habitId, date) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== habitId) return h;
            const log = { ...(h.log ?? {}) };
            // Unticking removes the day rather than writing `false`.
            if (log[date] === true) delete log[date];
            else log[date] = true;
            return { ...h, log };
          }),
        })),
      addHabit: (input) => {
        const fields = typeof input === "string" ? { name: input } : input;
        const habit = withLegacyCadence({
          ...cleanHabitInput(fields),
          id: uid("habit"),
          name: fields.name.trim(),
          createdOn: toISODate(new Date()),
          log: {},
          cadence: "daily",
        });
        set((s) => ({ habits: [...s.habits, habit] }));
        return habit.id;
      },
      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const next: Habit = { ...h, ...cleanHabitInput({ name: h.name, ...patch }) };
            // A field set to undefined in the patch is cleared.
            for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
            if (patch.name !== undefined) next.name = patch.name.trim() || h.name;
            return withLegacyCadence(next);
          }),
        })),
      setHabitArchived: (id, archived) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const next = { ...h };
            if (archived) next.archived = true;
            else delete next.archived;
            return next;
          }),
        })),
      setHabitPaused: (id, paused) =>
        set((s) => {
          const today = toISODate(new Date());
          return {
            habits: s.habits.map((h) => {
              if (h.id !== id) return h;
              const pauses = [...(h.pauses ?? [])];
              const open = pauses.length && !pauses[pauses.length - 1].to ? pauses[pauses.length - 1] : null;
              if (paused) {
                if (open) return h;
                pauses.push({ from: today });
              } else {
                if (!open) return h;
                // Paused and resumed on the same day: as if it never was.
                if (open.from >= today) pauses.pop();
                else pauses[pauses.length - 1] = { ...open, to: today };
              }
              const next: Habit = { ...h, pauses };
              if (!pauses.length) delete next.pauses;
              return next;
            }),
          };
        }),
      setHabitOverride: (id, date, override) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const overrides = { ...(h.overrides ?? {}) };
            if (override) overrides[date] = { ...override, at: new Date().toISOString() };
            else delete overrides[date];
            const next: Habit = { ...h, overrides };
            if (!Object.keys(overrides).length) delete next.overrides;
            return next;
          }),
        })),
      deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),

      recordCoachDecision: (d) =>
        set((s) => ({
          coach: {
            ...s.coach,
            decisions: [...(s.coach?.decisions ?? []), { ...d, id: uid("cd"), at: new Date().toISOString() }].slice(-COACH_DECISIONS_KEPT),
          },
        })),
      recordCoachBriefing: (b) =>
        set((s) => {
          const id = `briefing:${b.date}`;
          const briefings = (s.coach?.briefings ?? []).filter((x) => x.id !== id);
          briefings.push({ ...b, id });
          briefings.sort((x, y) => x.date.localeCompare(y.date));
          return { coach: { decisions: s.coach?.decisions ?? [], briefings: briefings.slice(-COACH_BRIEFINGS_KEPT) } };
        }),

      /* ── roadmap ──────────────────────────────────────────────── */

      savePlan: (plan) => {
        const s = get();
        const exists = s.plans.some((p) => p.id === plan.id);
        // One plan per period. The form says so before saving; this is the backstop.
        if (!exists && samePeriod(s.plans, plan)) return false;
        const stamp = new Date().toISOString();
        const clean = tidyPlan({ ...plan, updatedAt: stamp });
        set({
          plans: exists ? s.plans.map((p) => (p.id === plan.id ? clean : p)) : [...s.plans, clean],
        });
        return true;
      },

      addPlans: (incoming) => {
        let added = 0;
        set((s) => {
          const plans = [...s.plans];
          for (const plan of incoming) {
            if (plans.some((p) => p.id === plan.id) || samePeriod(plans, plan)) continue;
            plans.push(tidyPlan(plan));
            added++;
          }
          return added ? { plans } : {};
        });
        return added;
      },

      deletePlan: (id, children) =>
        set((s) => {
          const plans = removePlan(s.plans, id, children);
          return plans === s.plans ? {} : { plans };
        }),

      duplicatePlan: (id, target) => {
        const s = get();
        const source = s.plans.find((p) => p.id === id);
        if (!source) return null;
        const copy = duplicatePlanContent(source, target);
        if (samePeriod(s.plans, copy)) return null;
        const parent = target.parentId ? s.plans.find((p) => p.id === target.parentId) : undefined;
        if (parent) copy.parentId = parent.id;
        set({ plans: [...s.plans, tidyPlan(copy)] });
        return copy.id;
      },

      setPlanArchived: (id, archived) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== id || Boolean(p.archivedAt) === archived) return p;
            const stamp = new Date().toISOString();
            const next: RoadmapPlan = { ...p, updatedAt: stamp };
            if (archived) next.archivedAt = stamp;
            else delete next.archivedAt;
            return next;
          }),
        })),

      setPlanParent: (ids, parentId) => {
        let moved = 0;
        set((s) => {
          const parent = parentId ? s.plans.find((p) => p.id === parentId) : undefined;
          if (parentId && !parent) return {};
          const wanted = new Set(ids);
          const stamp = new Date().toISOString();
          const plans = s.plans.map((p) => {
            if (!wanted.has(p.id) || p.parentId === parentId) return p;
            if (parent && (!canParent(parent.level, p.level) || overlapDays(parent.start, parent.end, p.start, p.end) === 0)) return p;
            moved++;
            const next: RoadmapPlan = { ...p, updatedAt: stamp };
            if (parentId) next.parentId = parentId;
            else delete next.parentId;
            return next;
          });
          return moved ? { plans } : {};
        });
        return moved;
      },

      savePlanItem: (planId, item) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p;
            const items = p.items ?? [];
            const before = items.find((i) => i.id === item.id);
            // A status change made in the form keeps the completion time honest.
            const next = tidyItem(before && before.status !== item.status ? withStatus({ ...item, status: before.status }, item.status) : item);
            return {
              ...p,
              updatedAt: new Date().toISOString(),
              items: before ? items.map((i) => (i.id === item.id ? next : i)) : [...items, next],
            };
          }),
        })),

      deletePlanItem: (planId, itemId) => set((s) => ({ plans: removeItem(s.plans, planId, itemId) })),

      setPlanItemStatus: (planId, itemId, status) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId || !p.items?.some((i) => i.id === itemId && i.status !== status)) return p;
            return {
              ...p,
              updatedAt: new Date().toISOString(),
              items: p.items.map((i) => (i.id === itemId ? withStatus(i, status) : i)),
            };
          }),
        })),

      movePlanItem: (planId, itemId, delta) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId || !p.items) return p;
            const items = moveItem(p.items, itemId, delta);
            return items === p.items ? p : { ...p, items, updatedAt: new Date().toISOString() };
          }),
        })),

      carryForward: (fromPlanId, itemIds, toPlanId) => {
        const res = carryPlanItems(get().plans, fromPlanId, itemIds, toPlanId);
        if (res.moved) set({ plans: res.plans });
        return res.moved;
      },

      undoCarryForward: (planId, itemId) => {
        const res = undoCarry(get().plans, planId, itemId);
        if (res.ok) set({ plans: res.plans });
        return { ok: res.ok, reason: res.reason };
      },

      setItemJournalLink: (planId, itemId, date, linked) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId || !p.items?.some((i) => i.id === itemId)) return p;
            return {
              ...p,
              updatedAt: new Date().toISOString(),
              items: p.items.map((i) => (i.id === itemId ? withJournalDate(i, date, linked) : i)),
            };
          }),
        })),

      savePlanReview: (planId, review) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p;
            const stamp = new Date().toISOString();
            return tidyPlan({ ...p, review: { ...review, reviewedAt: stamp }, updatedAt: stamp });
          }),
        })),

      upsertLifeEntry: (entry, previousDate) =>
        set((s) => {
          const moving = previousDate && previousDate !== entry.date ? previousDate : null;
          const clean: LifeEntry = { ...entry, id: `life-${entry.date}` };
          // Blank readings are "not recorded": drop them rather than store undefined/NaN.
          for (const [k, v] of Object.entries(clean)) {
            if (v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v)))
              delete (clean as unknown as Record<string, unknown>)[k];
          }
          const lifeLog = s.lifeLog
            .filter((l) => l.date !== entry.date && l.date !== moving)
            .concat(clean)
            .sort((a, b) => a.date.localeCompare(b.date));
          // The journal shows the same night; keep it in step.
          const journal =
            clean.bedtime || clean.wakeTime
              ? s.journal.map((j) =>
                  j.date === clean.date
                    ? { ...j, sleepTime: clean.bedtime ?? j.sleepTime, wakeTime: clean.wakeTime ?? j.wakeTime }
                    : j,
                )
              : s.journal;
          return { lifeLog, journal };
        }),

      deleteLifeEntry: (date) =>
        set((s) => ({ lifeLog: s.lifeLog.filter((l) => l.date !== date) })),

      logDailySleep: ({ date, promptKey, sleepTime, wakeTime, sleepHours }) =>
        get().recordSleep({ date, promptKey, bedtime: sleepTime, wakeTime, hours: sleepHours }),

      recordSleep: ({ date, bedtime, wakeTime, hours, quality, promptKey }) =>
        set((s) => {
          const existing = s.lifeLog.find((l) => l.date === date);
          const next: LifeEntry = { ...(existing ?? { id: `life-${date}`, date }), id: `life-${date}`, date };
          const timesChanged = bedtime !== undefined || wakeTime !== undefined;

          // A value that isn't a clock time is ignored rather than stored.
          if (bedtime === null) delete next.bedtime;
          else if (isClock(bedtime)) next.bedtime = bedtime;
          if (wakeTime === null) delete next.wakeTime;
          else if (isClock(wakeTime)) next.wakeTime = wakeTime;

          if (hours === null) delete next.sleepHours;
          else if (typeof hours === "number" && Number.isFinite(hours) && hours > 0 && hours <= MAX_SLEEP_HOURS) {
            next.sleepHours = Math.round(hours * 100) / 100;
          } else if (timesChanged) {
            // From the times when both are known. Hours worked out from times
            // that are now incomplete go with them; hours that were entered
            // without times (older records) stay.
            const derived = hoursFromTimes(date, next.bedtime, next.wakeTime);
            const hadBoth = isClock(existing?.bedtime) && isClock(existing?.wakeTime);
            if (derived !== undefined) next.sleepHours = derived;
            else if (hadBoth) delete next.sleepHours;
          }

          if (quality === null) delete next.sleepQuality;
          else if (typeof quality === "number" && Number.isInteger(quality) && quality >= 1 && quality <= 5) {
            next.sleepQuality = quality;
          }

          const empty = Object.keys(next).every((k) => k === "id" || k === "date");
          const lifeLog = (empty
            ? s.lifeLog.filter((l) => l.date !== date)
            : [...s.lifeLog.filter((l) => l.date !== date), next]
          ).sort((a, b) => a.date.localeCompare(b.date));

          // The journal day shows the same night; keep the times that changed in
          // step, and never create a journal entry just for them.
          const journal =
            timesChanged && s.journal.some((j) => j.date === date)
              ? s.journal.map((j) => {
                  if (j.date !== date) return j;
                  const out: JournalEntry = { ...j };
                  if (bedtime !== undefined) {
                    if (next.bedtime) out.sleepTime = next.bedtime;
                    else delete out.sleepTime;
                  }
                  if (wakeTime !== undefined) {
                    if (next.wakeTime) out.wakeTime = next.wakeTime;
                    else delete out.wakeTime;
                  }
                  return out;
                })
              : s.journal;

          return { lifeLog, journal, ...(promptKey ? { lastSleepPrompt: promptKey } : {}) };
        }),

      clearSleep: (date) => get().recordSleep({ date, bedtime: null, wakeTime: null, hours: null, quality: null }),

      dismissSleepPrompt: (key) => set({ lastSleepPrompt: key }),

      /* ── notifications ─────────────────────────────────────── */

      /**
       * Merged through `withDefaults` rather than spread blindly, so a settings
       * object persisted before a new option existed gains the new default
       * instead of leaving it `undefined`.
       */
      updateNotifySettings: (patch) =>
        set((s) => ({ notify: withNotifyDefaults({ ...s.notify, ...patch }) })),

      markNoticeRead: (id) =>
        set((s) =>
          s.notifyState.readIds.includes(id)
            ? {}
            : {
                notifyState: {
                  ...s.notifyState,
                  readIds: [...s.notifyState.readIds, id],
                },
              },
        ),

      markNoticesRead: (ids) =>
        set((s) => {
          const next = new Set(s.notifyState.readIds);
          const before = next.size;
          for (const id of ids) next.add(id);
          // Returning `{}` for a no-op keeps zustand from notifying subscribers.
          if (next.size === before) return {};
          return { notifyState: { ...s.notifyState, readIds: [...next] } };
        }),

      /**
       * Dismissal implies read: an unread counter that still counts something
       * you have explicitly thrown away would be lying.
       */
      dismissNotice: (id) =>
        set((s) => ({
          notifyState: {
            ...s.notifyState,
            dismissedIds: s.notifyState.dismissedIds.includes(id)
              ? s.notifyState.dismissedIds
              : [...s.notifyState.dismissedIds, id],
            readIds: s.notifyState.readIds.includes(id)
              ? s.notifyState.readIds
              : [...s.notifyState.readIds, id],
          },
        })),

      snoozeNotice: (id, until) =>
        set((s) => ({
          notifyState: {
            ...s.notifyState,
            snoozedUntil: { ...s.notifyState.snoozedUntil, [id]: until },
          },
        })),

      pruneNotifyState: (stale) =>
        set((s) => {
          if (
            stale.readIds.length === 0 &&
            stale.dismissedIds.length === 0 &&
            stale.snoozedIds.length === 0
          )
            return {};
          const dropRead = new Set(stale.readIds);
          const dropDismissed = new Set(stale.dismissedIds);
          const dropSnoozed = new Set(stale.snoozedIds);
          /** Keyed by notice id, valued by the ISO date the snooze expires. */
          const snoozedUntil: Record<string, ISODate> = {};
          for (const [k, v] of Object.entries(s.notifyState.snoozedUntil)) {
            if (!dropSnoozed.has(k)) snoozedUntil[k] = v;
          }
          return {
            notifyState: {
              readIds: s.notifyState.readIds.filter((i) => !dropRead.has(i)),
              dismissedIds: s.notifyState.dismissedIds.filter(
                (i) => !dropDismissed.has(i),
              ),
              snoozedUntil,
            },
          };
        }),

      recordNoticeDelivery: (delivered, now, digest = false) =>
        set((s) => ({
          notifyLog: recordDelivery(s.notifyLog, delivered, now, digest),
        })),
    }),
    {
      name: STORE_KEY,
      version: 17,
      /**
       * Scoped to the signed-in account: `upsc-chronicle-store:<user id>`.
       * Nothing is read or written until an account is activated, which is why
       * hydration is manual — see `lib/account/session.ts`.
       */
      storage: createJSONStorage(() => accountStorage),
      skipHydration: true,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ChronicleState> & {
          theme?: string;
          graph?: unknown;
          surface?: string;
          palette?: unknown;
          material?: unknown;
        };

        // v<6: the demo era. Those records were discarded then, and still are.
        if (version < 6) return { ...createBlankAccount() } as unknown as ChronicleState;

        // v6 -> v7: the light/dark toggle became surface + palette.
        delete state.theme;
        delete state.graph;

        // v7 -> v8: the appearance system was rebuilt; old choices meant
        // something else, so the look is reset once (data is untouched).
        if (version < 8) state.surface = "white";

        // v8 -> v9: the accomplished-days list (and a wallpaper choice, since
        // retired: see v15).
        if (version < 9 && !Array.isArray(state.accomplished)) state.accomplished = [];

        // v9 -> v10: accounts. A profile that already has a name was set up
        // before first-run setup existed, so it is marked as set up.
        if (version < 10 && state.profile) state.profile = normalizeProfile(state.profile);

        // v11 -> v12: five surfaces became Light / Dark / Auto; journal files
        // arrived; and what older versions invented is cleaned up — morning
        // placeholder days, made-up life readings, unlinked topics, duplicate
        // journal ids (see `normalizeSnapshot`).
        if (version < 12) {
          if (!state.themeMode) state.themeMode = themeModeFromSurface(state.surface);
          if (!Array.isArray(state.files)) state.files = [];
          if (!Array.isArray(state.fileTrash)) state.fileTrash = [];
          const upgraded = normalizeSnapshot(state);
          Object.assign(state, upgraded);
          delete state.surface;
        }

        // v12 -> v13: reduced transparency arrived, off (with a Liquid Glass
        // material, since retired: see v16).
        if (version < 13 && state.reduceTransparency === undefined) {
          state.reduceTransparency = false;
        }

        // v13 -> v14: the Roadmap became your own plans. The fixed CSE 2027
        // plan was never stored per account (it lived in the code), so the
        // only thing it left behind is the switch that showed it; that goes.
        // Everything else is untouched.
        if (version < 14) {
          if (state.profile) state.profile = normalizeProfile(state.profile);
          state.plans = normalizePlans(state.plans);
        }

        // v14 -> v15: wallpapers were retired; each theme paints its own
        // backdrop. The saved choice and its dim go, and nothing else changes.
        if (version < 15) {
          const legacy = state as Record<string, unknown>;
          delete legacy.wallpaper;
          delete legacy.wallpaperDim;
        }

        // v15 -> v16: two themes. Blue Glass became Light, Auto settles on
        // the theme this device shows, and the colour palettes and the Liquid
        // Glass material were retired. Data is untouched.
        if (version < 16) {
          state.themeMode = legacyThemeMode(state.themeMode);
          delete state.palette;
          delete state.material;
        }

        // v16 -> v17: the Study Coach keeps a history. Habits gained sources,
        // schedules and corrections, diary entries titles and files, reviews
        // drafts and snapshots: all optional fields, so the records
        // themselves are untouched and read as they always did.
        if (version < 17 && !isCoachLog(state.coach)) state.coach = { decisions: [], briefings: [] };

        return state as ChronicleState;
      },
      partialize: (s) => {
        // persist everything except the transient hydration flag
        const { _hasHydrated, setHasHydrated, ...rest } = s as ChronicleState;
        void _hasHydrated;
        void setHasHydrated;
        return rest as ChronicleState;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        /**
         * Normalise the notification slice after hydration. Stored settings from
         * before a new option existed would otherwise carry it as `undefined`,
         * and a snapshot written by an older build has no slice at all — both
         * read as a broken settings pane rather than a sensible default.
         */
        if (state) {
          state.updateNotifySettings({});
          if (
            !state.notifyState ||
            !Array.isArray(state.notifyState.readIds) ||
            !Array.isArray(state.notifyState.dismissedIds) ||
            typeof state.notifyState.snoozedUntil !== "object" ||
            state.notifyState.snoozedUntil === null
          ) {
            useChronicle.setState({ notifyState: EMPTY_NOTIFY_STATE });
          }
          if (!state.notifyLog || typeof state.notifyLog.lastSentAt !== "object") {
            useChronicle.setState({ notifyLog: EMPTY_DELIVERY_LOG });
          }
        }
        // Re-apply this account's appearance, and remember it for the next cold
        // start's pre-paint.
        if (state && typeof document !== "undefined") {
          const mode = isThemeMode(state.themeMode) ? state.themeMode : DEFAULT_THEME_MODE;
          const reduced = state.reduceTransparency === true;
          applyThemeMode(mode);
          applyTransparency(reduced);
          writeAppearance("theme", mode);
          writeAppearance("transparency", reduced ? "reduced" : "auto");
        }
      },
    },
  ),
);

/** True only after the persisted store has hydrated on the client. */
export function useHasHydrated(): boolean {
  return useChronicle((s) => s._hasHydrated);
}

/** Read the current synced slice of state (data + appearance) for the cloud. */
export function readCloudSnapshot(): CloudSnapshot {
  const s = useChronicle.getState();
  const snap: Record<string, unknown> = {};
  for (const k of SNAPSHOT_KEYS) snap[k] = s[k];
  return snap as CloudSnapshot;
}

/**
 * The in-memory state when no account is loaded: empty data and the default
 * look. Swapped in on every sign-out and account switch, so nothing of the
 * previous account survives in memory.
 */
export function blankChronicleState(): Partial<ChronicleState> {
  return {
    ...createBlankAccount(),
    themeMode: DEFAULT_THEME_MODE,
    reduceTransparency: false,
    fileTrash: [],
    lastSleepPrompt: undefined,
    notify: DEFAULT_NOTIFY_SETTINGS,
    notifyState: EMPTY_NOTIFY_STATE,
    notifyLog: EMPTY_DELIVERY_LOG,
    _hasHydrated: false,
  };
}
