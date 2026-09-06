"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createSeedData, createFreshData } from "./seed";
import { toISODate, fromISODate, uid } from "./utils";
import { applyRevision, resolveTopicId } from "./revision";
import { emptyEntry } from "@/components/journal/constants";
import {
  type Surface,
  type Palette,
  DEFAULT_SURFACE,
  DEFAULT_PALETTE,
} from "./theme";
import {
  type WallpaperId,
  DEFAULT_WALLPAPER,
  wallpaperMeta,
} from "./wallpaper";
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
  ISODate,
  JournalEntry,
  MockTest,
  Mistake,
  MistakeStatus,
  MistakeCategory,
  Goal,
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
  LifeEntry,
} from "./types";

interface ChronicleState extends ChronicleData {
  surface: Surface;
  palette: Palette;
  /** The layer behind the app. A custom image's bytes stay in IndexedDB. */
  wallpaper: WallpaperId;
  /** How much canvas colour covers the wallpaper, 0–0.9. */
  wallpaperDim: number;
  _hasHydrated: boolean;

  /**
   * The `sleepDayKey` for which the daily sleep/wake prompt has already been
   * answered. Local-only (not cloud-synced): it's a per-device daily nudge.
   */
  lastSleepPrompt?: string;

  /* meta */
  setHasHydrated: (v: boolean) => void;
  setSurface: (s: Surface) => void;
  setPalette: (p: Palette) => void;
  /** Switching wallpaper resets the dim to that wallpaper's sensible default. */
  setWallpaper: (w: WallpaperId) => void;
  setWallpaperDim: (d: number) => void;
  resetData: () => void;
  /** Replace all synced data with a snapshot pulled from the cloud. */
  applyCloudSnapshot: (snap: Partial<CloudSnapshot>) => void;
  updateProfile: (patch: Partial<ChronicleData["profile"]>) => void;

  /* journal */
  upsertJournal: (entry: JournalEntry) => void;
  deleteJournal: (id: string) => void;

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

  /* milestones */
  upsertMilestone: (m: Milestone) => void;
  deleteMilestone: (id: string) => void;

  /* reflections */
  upsertReflection: (r: Reflection) => void;
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

  /* habits */
  toggleHabit: (habitId: string, date: string) => void;
  addHabit: (name: string) => void;

  /* life dashboard */
  upsertLifeEntry: (entry: LifeEntry) => void;

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
   * Record last night's sleep + this morning's wake-up once, then fan the
   * values out to both today's journal entry and today's life-dashboard
   * entry (creating either if missing). Also stamps `lastSleepPrompt` so the
   * blocking prompt won't reappear until the next day after 7 AM.
   */
  logDailySleep: (input: {
    date: ISODate;
    promptKey: string;
    sleepTime: string;
    wakeTime: string;
    sleepHours: number;
  }) => void;
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
  "surface",
  "palette",
  // The wallpaper *choice* follows the user across devices; a custom photo's
  // bytes never do — they stay in IndexedDB on the device that picked it.
  "wallpaper",
  "wallpaperDim",
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

export const useChronicle = create<ChronicleState>()(
  persist(
    (set, get) => ({
      ...createFreshData(),
      surface: DEFAULT_SURFACE,
      palette: DEFAULT_PALETTE,
      wallpaper: DEFAULT_WALLPAPER,
      wallpaperDim: wallpaperMeta(DEFAULT_WALLPAPER).dim,
      _hasHydrated: false,
      lastSleepPrompt: undefined,
      notify: DEFAULT_NOTIFY_SETTINGS,
      notifyState: EMPTY_NOTIFY_STATE,
      notifyLog: EMPTY_DELIVERY_LOG,

      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setSurface: (s) => {
        if (typeof document !== "undefined")
          document.documentElement.setAttribute("data-surface", s);
        if (typeof localStorage !== "undefined")
          localStorage.setItem("upsc-chronicle-surface", s);
        set({ surface: s });
      },
      setPalette: (p) => {
        if (typeof document !== "undefined")
          document.documentElement.setAttribute("data-palette", p);
        if (typeof localStorage !== "undefined")
          localStorage.setItem("upsc-chronicle-palette", p);
        set({ palette: p });
      },
      setWallpaper: (w) => {
        const dim = wallpaperMeta(w).dim;
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-wallpaper", w);
          document.documentElement.style.setProperty("--wp-dim", String(dim));
        }
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("upsc-chronicle-wallpaper", w);
          localStorage.setItem("upsc-chronicle-wallpaper-dim", String(dim));
        }
        set({ wallpaper: w, wallpaperDim: dim });
      },
      setWallpaperDim: (d) => {
        const dim = Math.max(0, Math.min(0.9, d));
        if (typeof document !== "undefined")
          document.documentElement.style.setProperty("--wp-dim", String(dim));
        if (typeof localStorage !== "undefined")
          localStorage.setItem("upsc-chronicle-wallpaper-dim", String(dim));
        set({ wallpaperDim: dim });
      },
      resetData: () => set({ ...createFreshData() }),
      applyCloudSnapshot: (snap) =>
        set(() => {
          const next: Record<string, unknown> = {};
          for (const k of SNAPSHOT_KEYS) {
            if (snap[k] !== undefined) next[k] = snap[k];
          }
          // Re-apply appearance attributes so a pulled theme takes effect.
          if (typeof document !== "undefined") {
            if (snap.surface)
              document.documentElement.setAttribute("data-surface", snap.surface);
            if (snap.palette)
              document.documentElement.setAttribute("data-palette", snap.palette);
            if (snap.wallpaper)
              document.documentElement.setAttribute("data-wallpaper", snap.wallpaper);
            if (snap.wallpaperDim !== undefined)
              document.documentElement.style.setProperty(
                "--wp-dim",
                String(snap.wallpaperDim),
              );
          }
          return next as Partial<ChronicleState>;
        }),
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

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
          if (idx >= 0) journal[idx] = entry;
          else journal.push(entry);
          journal.sort((a, b) => a.date.localeCompare(b.date));
          return { journal };
        }),
      deleteJournal: (id) =>
        set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

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
          if (idx >= 0) goals[idx] = g;
          else goals.unshift(g);
          return { goals };
        }),
      deleteGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

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
      deleteReflection: (id) =>
        set((s) => ({
          reflections: s.reflections.filter((r) => r.id !== id),
        })),

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
          const idx = s.reviews.findIndex((x) => x.id === r.id);
          const reviews = [...s.reviews];
          if (idx >= 0) reviews[idx] = r;
          else reviews.unshift(r);
          return { reviews };
        }),

      deleteReview: (id) =>
        set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) })),

      toggleHabit: (habitId, date) =>
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id !== habitId
              ? h
              : { ...h, log: { ...h.log, [date]: !h.log[date] } },
          ),
        })),
      addHabit: (name) =>
        set((s) => ({
          habits: [
            ...s.habits,
            {
              id: uid("habit"),
              name,
              cadence: "daily",
              createdOn: toISODate(new Date()),
              targetPerWeek: 7,
              log: {},
            } as Habit,
          ],
        })),

      upsertLifeEntry: (entry) =>
        set((s) => {
          const idx = s.lifeLog.findIndex((l) => l.date === entry.date);
          const lifeLog = [...s.lifeLog];
          if (idx >= 0) lifeLog[idx] = entry;
          else lifeLog.push(entry);
          lifeLog.sort((a, b) => a.date.localeCompare(b.date));
          return { lifeLog };
        }),

      logDailySleep: ({ date, promptKey, sleepTime, wakeTime, sleepHours }) =>
        set((s) => {
          // ── Daily journal: merge into today's entry, or create one ──
          const jIdx = s.journal.findIndex((j) => j.date === date);
          const journal = [...s.journal];
          if (jIdx >= 0) {
            journal[jIdx] = { ...journal[jIdx], wakeTime, sleepTime };
          } else {
            journal.push({
              ...emptyEntry(date),
              wakeTime,
              sleepTime,
              // a fresh auto-created day starts with no logged study blocks
              blocks: [],
              totalHours: 0,
            });
          }
          journal.sort((a, b) => a.date.localeCompare(b.date));

          // ── Life dashboard: merge into today's entry, or create one ──
          const lIdx = s.lifeLog.findIndex((l) => l.date === date);
          const lifeLog = [...s.lifeLog];
          if (lIdx >= 0) {
            lifeLog[lIdx] = {
              ...lifeLog[lIdx],
              bedtime: sleepTime,
              wakeTime,
              sleepHours,
            };
          } else {
            lifeLog.push({
              id: `life-${date}`,
              date,
              sleepHours,
              sleepQuality: 3,
              bedtime: sleepTime,
              wakeTime,
              walkKm: 0,
              runKm: 0,
              exerciseMinutes: 0,
              waterLiters: 2,
              meditationMin: 0,
              screenTimeMin: 120,
              deepWorkHours: 0,
            });
          }
          lifeLog.sort((a, b) => a.date.localeCompare(b.date));

          return { journal, lifeLog, lastSleepPrompt: promptKey };
        }),

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
      name: "upsc-chronicle-store",
      version: 9,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) => {
        const state = persisted as Partial<ChronicleState> | undefined;

        /**
         * v7 -> v8: the appearance system was redesigned — the surfaces were
         * rebuilt and renamed (Ivory · Charcoal · Indigo) and every palette
         * retuned, so a pre-redesign choice no longer means the same thing.
         * Reset the look once to the new default; it's one click to change it
         * back. The standalone keys the pre-paint script reads move too, or the
         * first paint would disagree with the store.
         */
        const resetAppearance = (next: Record<string, unknown>) => {
          if (version >= 8) return next;
          next.surface = DEFAULT_SURFACE;
          next.palette = DEFAULT_PALETTE;
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("upsc-chronicle-surface", DEFAULT_SURFACE);
            localStorage.setItem("upsc-chronicle-palette", DEFAULT_PALETTE);
          }
          return next;
        };

        // v8 -> v9: new keys — the accomplished-days list and the wallpaper
        // choice. Backfill rather than reset, so nothing logged is disturbed.
        if (state && version < 9) {
          if (!Array.isArray(state.accomplished)) state.accomplished = [];
          if (state.wallpaper === undefined) state.wallpaper = DEFAULT_WALLPAPER;
          if (state.wallpaperDim === undefined)
            state.wallpaperDim = wallpaperMeta(DEFAULT_WALLPAPER).dim;
        }
        // v<6: a clean slate. Aman starts logging from today, so we discard the
        // previously-seeded demo records entirely and rebuild from fresh data.
        if (version < 6) {
          return resetAppearance({
            ...createFreshData(),
          } as unknown as Record<string, unknown>) as unknown as ChronicleState;
        }
        // v6 -> v7: retire the light/dark toggle in favour of independent
        // surface + palette settings. Keep all logged data.
        if (version < 7) {
          const old = (state ?? {}) as Partial<ChronicleState> & {
            theme?: string;
          };
          const next: Record<string, unknown> = { ...old };
          delete next.theme;
          return resetAppearance(next) as unknown as ChronicleState;
        }
        if (state) resetAppearance(state as unknown as Record<string, unknown>);
        // v1 -> v2: backfill the expanded Daily Journal fields so older
        // entries render cleanly alongside the richer schema.
        if (state && version < 2 && Array.isArray(state.journal)) {
          state.journal = state.journal.map((e) => ({
            ...e,
            motivation: e.motivation ?? e.focus ?? 3,
            topicsCompleted: e.topicsCompleted ?? [],
            booksStudied: e.booksStudied ?? [],
            revisionSessions: e.revisionSessions ?? [],
            mocksAttempted: e.mocksAttempted ?? [],
            currentAffairs: e.currentAffairs ?? [],
            wins: e.wins ?? [],
            failures: e.failures ?? [],
            lessons: e.lessons ?? [],
            attachments: e.attachments ?? [],
          }));
        }
        // v2 -> v3: introduce the topic-link knowledge graph and retire the
        // old subject-level graph snapshot.
        if (state && version < 3) {
          if (!Array.isArray(state.topicLinks)) {
            state.topicLinks = createSeedData().topicLinks;
          }
          delete (state as Record<string, unknown>).graph;
        }
        // v3 -> v4: upgrade mistakes into review-workflow learning assets
        // (new error categories, Q/answer/explanation, spaced repetition).
        if (state && version < 4 && Array.isArray(state.mistakes)) {
          const catMap: Record<string, MistakeCategory> = {
            Conceptual: "Conceptual",
            Factual: "Factual",
            Guessing: "Guessing",
            Silly: "Careless",
            Careless: "Careless",
            Misreading: "Careless",
            "Time Management": "Time Pressure",
            "Time Pressure": "Time Pressure",
            "Revision Failure": "Revision Failure",
          };
          const today = toISODate(new Date());
          type LegacyMistake = Partial<Mistake> & {
            type?: string;
            description?: string;
            correction?: string;
          };
          state.mistakes = (state.mistakes as LegacyMistake[]).map((m) => {
            const cat = String(m.category ?? m.type ?? "Conceptual");
            const status: MistakeStatus =
              m.status === ("Resolved" as MistakeStatus)
                ? "Mastered"
                : (m.status ?? "Open");
            const reviewCount = m.reviewCount ?? (status === "Mastered" ? 3 : 0);
            return {
              id: m.id ?? `mis-${Math.random().toString(36).slice(2, 8)}`,
              date: m.date ?? today,
              subjectId: m.subjectId ?? "",
              topic: m.topic ?? "",
              category: catMap[cat] ?? "Conceptual",
              question: m.question,
              userAnswer: m.userAnswer,
              correctAnswer: m.correctAnswer,
              explanation: m.explanation ?? m.correction ?? m.description,
              source: m.source,
              status,
              reviewCount,
              lastReviewed: m.lastReviewed,
              nextReview: m.nextReview ?? m.date ?? today,
              intervalDays: m.intervalDays ?? 1,
            } as Mistake;
          });
        }
        // v4 -> v5: introduce the unified Life Dashboard daily log.
        if (state && version < 5 && !Array.isArray(state.lifeLog)) {
          state.lifeLog = createSeedData().lifeLog;
        }
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
        // re-apply appearance attributes after hydration
        if (state && typeof document !== "undefined") {
          document.documentElement.setAttribute("data-surface", state.surface);
          document.documentElement.setAttribute("data-palette", state.palette);
          document.documentElement.setAttribute(
            "data-wallpaper",
            state.wallpaper ?? DEFAULT_WALLPAPER,
          );
          document.documentElement.style.setProperty(
            "--wp-dim",
            String(state.wallpaperDim ?? 0),
          );
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
