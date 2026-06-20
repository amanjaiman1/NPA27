"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createSeedData, createFreshData } from "./seed";
import { toISODate, uid, clockHoursBetween } from "./utils";
import { emptyEntry } from "@/components/journal/constants";
import {
  type Surface,
  type Palette,
  DEFAULT_SURFACE,
  DEFAULT_PALETTE,
} from "./theme";
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
  Topic,
  TopicStatus,
  TopicLink,
  Habit,
  LifeEntry,
} from "./types";

interface ChronicleState extends ChronicleData {
  surface: Surface;
  palette: Palette;
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
  resetData: () => void;
  /** Replace all synced data with a snapshot pulled from the cloud. */
  applyCloudSnapshot: (snap: Partial<CloudSnapshot>) => void;
  updateProfile: (patch: Partial<ChronicleData["profile"]>) => void;

  /* journal */
  upsertJournal: (entry: JournalEntry) => void;
  deleteJournal: (id: string) => void;

  /* mocks */
  upsertMock: (m: MockTest) => void;
  deleteMock: (id: string) => void;

  /* subjects / topics */
  updateTopic: (subjectId: string, topicId: string, patch: Partial<Topic>) => void;
  reviseTopic: (topicId: string) => void;
  setTopicStatusById: (topicId: string, status: TopicStatus) => void;

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

  /* reviews */
  upsertReview: (r: Review) => void;

  /* habits */
  toggleHabit: (habitId: string, date: string) => void;
  addHabit: (name: string) => void;

  /* life dashboard */
  upsertLifeEntry: (entry: LifeEntry) => void;

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
  "surface",
  "palette",
] as const;

export type CloudSnapshot = Pick<ChronicleState, (typeof SNAPSHOT_KEYS)[number]>;

const SR_INTERVALS = [1, 3, 7, 14, 30, 60];
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

export const useChronicle = create<ChronicleState>()(
  persist(
    (set) => ({
      ...createFreshData(),
      surface: DEFAULT_SURFACE,
      palette: DEFAULT_PALETTE,
      _hasHydrated: false,
      lastSleepPrompt: undefined,

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
          }
          return next as Partial<ChronicleState>;
        }),
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

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

      reviseItem: (id, remembered) =>
        set((s) => ({
          revisions: s.revisions.map((it): RevisionItem => {
            if (it.id !== id) return it;
            const reps = remembered ? it.repetitions + 1 : 0;
            const interval = SR_INTERVALS[Math.min(reps, SR_INTERVALS.length - 1)];
            const next = new Date();
            next.setDate(next.getDate() + interval);
            return {
              ...it,
              repetitions: reps,
              intervalDays: interval,
              lastRevised: toISODate(new Date()),
              nextDue: toISODate(next),
              confidence: Math.max(
                1,
                Math.min(5, it.confidence + (remembered ? 1 : -1)),
              ),
            };
          }),
        })),

      upsertReview: (r) =>
        set((s) => {
          const idx = s.reviews.findIndex((x) => x.id === r.id);
          const reviews = [...s.reviews];
          if (idx >= 0) reviews[idx] = r;
          else reviews.unshift(r);
          return { reviews };
        }),

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

      logDailySleep: ({ date, promptKey, sleepTime, wakeTime }) =>
        set((s) => {
          const sleepHours = clockHoursBetween(sleepTime, wakeTime);

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
    }),
    {
      name: "upsc-chronicle-store",
      version: 7,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) => {
        const state = persisted as Partial<ChronicleState> | undefined;
        // v<6: a clean slate. Aman starts logging from today, so we discard the
        // previously-seeded demo records entirely and rebuild from fresh data.
        if (version < 6) {
          return {
            ...createFreshData(),
            surface: DEFAULT_SURFACE,
            palette: DEFAULT_PALETTE,
          } as ChronicleState;
        }
        // v6 -> v7: retire the light/dark toggle in favour of independent
        // surface + palette settings. Keep all logged data; map old theme.
        if (version < 7) {
          const old = (state ?? {}) as Partial<ChronicleState> & {
            theme?: string;
          };
          const surface: Surface = old.theme === "light" ? "white" : "black";
          const next: Record<string, unknown> = {
            ...old,
            surface,
            palette: DEFAULT_PALETTE,
          };
          delete next.theme;
          return next as unknown as ChronicleState;
        }
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
        // re-apply appearance attributes after hydration
        if (state && typeof document !== "undefined") {
          document.documentElement.setAttribute("data-surface", state.surface);
          document.documentElement.setAttribute("data-palette", state.palette);
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
