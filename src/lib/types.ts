/* ════════════════════════════════════════════════════════════════
   THE UPSC CHRONICLE — UNIFIED DOMAIN MODEL
   A single typed graph that connects every feature: a day in the
   journal links to subjects, mocks, mistakes, current affairs, the
   knowledge graph, habits and goals.
   ════════════════════════════════════════════════════════════════ */

export type ISODate = string; // "yyyy-mm-dd"
export type Theme = "dark" | "light";

/**
 * The theme the user picked: Lavender (the default), Light or Dark. Synced
 * with the account. Values older versions saved ("blue", "system") are read
 * by `legacyThemeMode` in lib/theme.ts.
 */
export type ThemeMode = "light" | "dark" | "lavender";

/** How clock times are shown: "11:30 PM" or "23:30". */
export type TimeFormat = "12h" | "24h";

/**
 * The bedtime and wake-up a person is aiming for. A target, never a record:
 * it is compared against recorded nights and is not stored with them.
 */
export interface SleepTarget {
  bedtime?: string; // "HH:MM"
  wakeTime?: string; // "HH:MM"
}

/* ── Attached files ─────────────────────────────────────────── */

export type FileKind = "image" | "pdf" | "text" | "document";

/**
 * A file the user attached to a journal day.
 *
 * Only this description travels with the synced snapshot (a couple of hundred
 * bytes). The bytes themselves live in Supabase Storage, in a private bucket,
 * under the account's own folder, and are read through short-lived signed
 * links. Storage's row-level security is what keeps one account's files away
 * from every other account.
 *
 * A file belongs to the journal: it exists while at least one journal day
 * lists it in `fileIds`. Goals and Life Dashboard days only point at it, so
 * removing it from a goal never deletes it, and the same file is never stored
 * twice (records are unique by content hash).
 */
export interface FileRecord {
  id: string;
  /** Lower-case hex SHA-256 of the stored bytes. */
  sha256: string;
  /** Object path inside the bucket: `<user id>/<sha256>`. */
  path: string;
  /** The file's name as the user knows it. */
  name: string;
  /** MIME type it was stored with. */
  type: string;
  /** Bytes stored, after any image downscaling. */
  size: number;
  width?: number;
  height?: number;
  /** When it was first attached (ISO timestamp). */
  addedAt: string;
}

/**
 * A topic recorded as completed on a journal day. `topicId` is set when it was
 * picked from the syllabus tracker, which is what lets the day move that
 * topic's progress and schedule its revision; free-text topics still work.
 */
export interface TopicCompletion {
  id: string;
  name: string;
  subjectId?: string;
  topicId?: string;
}

/* ── Syllabus / Subjects ─────────────────────────────────────── */

export type PaperCode =
  | "GS1"
  | "GS2"
  | "GS3"
  | "GS4"
  | "Essay"
  | "CSAT"
  | "Optional"
  | "CurrentAffairs";

export type TopicStatus =
  | "untouched"
  | "learning"
  | "revised"
  | "mastered";

export interface Topic {
  id: string;
  name: string;
  status: TopicStatus;
  confidence: number; // 0-100
  revisionCount: number;
  lastTouched?: ISODate;
}

export interface Subject {
  id: string;
  name: string;
  paper: PaperCode;
  description?: string;
  weightage?: number; // relative exam weight 0-100
  topics: Topic[];
}

/* ── Daily Journal ───────────────────────────────────────────── */

export interface StudyBlock {
  subjectId: string;
  hours: number;
  topics?: string[];
}

/** A book touched on a given day. */
export interface BookRead {
  bookId?: string; // optional link to a Library book
  title: string;
  fromPage?: number;
  toPage?: number;
}

/** A revision session captured within a day. */
export interface RevisionSession {
  subjectId?: string;
  topic: string;
  minutes?: number;
  /**
   * The scheduled `RevisionItem` this session was logged against, when it came
   * from picking something off the revision queue rather than being typed in
   * freehand. Its presence is what lets saving the day advance that item's
   * spaced-repetition schedule.
   */
  revisionItemId?: string;
  /**
   * Whether it actually came back. `undefined` reads as recalled — you would not
   * be logging the session otherwise — while an explicit `false` sends the item
   * back to the start of the ladder.
   */
  recalled?: boolean;
}

/** A mock attempted on a day (lightweight reference or inline note). */
export interface MockRef {
  mockId?: string; // optional link to a logged MockTest
  name: string;
  score?: number;
  max?: number;
}

/** A current-affairs item covered on a day. */
export interface CARef {
  caId?: string; // optional link to a CurrentAffair
  title: string;
  source?: string;
}

export type AttachmentKind = "image" | "file";

/**
 * A photo or file once attached to a journal day.
 *
 * @deprecated Attachments are no longer created: base64 images in the synced
 * snapshot were the single biggest cost on Supabase's free plan. The type stays
 * so entries saved before the change still load, export, and can be cleaned up
 * from Settings → Data.
 */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** base64 data URL — images are downscaled before storing. */
  dataUrl: string;
  caption?: string;
  size?: number; // bytes (approx)
}

export interface JournalEntry {
  id: string;
  date: ISODate; // unique per day

  /* daily rhythm */
  wakeTime?: string; // "HH:MM"
  sleepTime?: string; // "HH:MM" (when they went to bed)

  /* study */
  blocks: StudyBlock[];
  totalHours: number;
  /** Topics finished this day, linked to the syllabus where possible. */
  completedTopics?: TopicCompletion[];
  /**
   * @deprecated The free-text list used before topics linked to the syllabus.
   * Read through `completedTopicsOf` (lib/topics.ts); new saves never write it.
   */
  topicsCompleted?: string[];
  booksStudied?: BookRead[];
  revisionSessions?: RevisionSession[];
  mocksAttempted?: MockRef[];
  currentAffairs?: CARef[];

  /* state of mind (1-5) */
  mood: number;
  energy: number;
  motivation: number;
  focus: number;

  /* narrative */
  wins?: string[];
  failures?: string[];
  lessons?: string[];
  highlights?: string;
  reflection?: string;
  tags?: string[];

  /** Files attached to this day: ids into `ChronicleData.files`. */
  fileIds?: string[];

  /** @deprecated Kept only for entries saved before photos were removed. */
  attachments?: Attachment[];

  /* legacy / planning */
  tasksPlanned?: number;
  tasksDone?: number;
}

/* ── Mock Tests ──────────────────────────────────────────────── */

export type MockType =
  | "Prelims GS"
  | "Prelims CSAT"
  | "Mains GS"
  | "Mains Essay"
  | "Mains Optional"
  | "Sectional";

export type MockCategory = "Prelims" | "Mains" | "Sectional";

/**
 * Per-section / per-subject breakdown of a mock. For prelims this captures
 * questions/attempts/accuracy; for mains it captures score/max as answer
 * quality. `timeSpent` (minutes) powers the time-allocation analysis.
 */
export interface MockSection {
  name: string; // subject ("Polity") or paper ("GS Paper II") or area ("Quant")
  questions?: number; // total questions in the section (prelims)
  attempted: number;
  correct: number;
  wrong: number;
  score: number; // net marks for this section
  max: number; // maximum marks for this section
  timeSpent?: number; // minutes spent
}

export interface MockTest {
  id: string;
  date: ISODate;
  name: string;
  type: MockType;
  category?: MockCategory;
  provider?: string;
  score: number;
  max: number;
  attempted?: number;
  correct?: number;
  wrong?: number;
  unattempted?: number;
  negative?: number; // marks lost to negative marking
  markPerQ?: number; // marks per correct answer
  negPerWrong?: number; // penalty per wrong answer
  durationMin?: number; // allotted time
  timeTakenMin?: number; // time actually used
  sections?: MockSection[];
  notes?: string;
  weakAreas?: string[];
}

/* ── Revision (spaced repetition) ────────────────────────────── */

export interface RevisionItem {
  id: string;
  subjectId: string;
  topic: string;
  addedOn: ISODate;
  lastRevised?: ISODate;
  nextDue: ISODate;
  intervalDays: number;
  repetitions: number;
  confidence: number; // 1-5
  /**
   * Every day it was revised, oldest first, one entry per day. Written by the
   * Revision page and by journal days that log a pass against this item. Items
   * revised before this was kept have only `lastRevised`, which counts as one
   * pass on that day.
   */
  passes?: ISODate[];
}

/* ── Current Affairs Vault ───────────────────────────────────── */

export type CACategory =
  | "Polity"
  | "Economy"
  | "Environment"
  | "International"
  | "Science & Tech"
  | "Society"
  | "Schemes"
  | "Reports & Indices"
  | "Geography"
  | "Misc";

export interface CurrentAffair {
  id: string;
  date: ISODate;
  title: string;
  source: string;
  category: CACategory;
  tags: string[];
  summary: string;
  prelimsRelevant: boolean;
  mainsRelevant: boolean;
  linkedSubjectId?: string;
  bookmarked: boolean;
}

/* ── Mistake Tracker ─────────────────────────────────────────── */

/** The six UPSC error categories — every mistake is one of these. */
export type MistakeCategory =
  | "Conceptual"
  | "Factual"
  | "Guessing"
  | "Revision Failure"
  | "Time Pressure"
  | "Careless";

/** Review lifecycle: a mistake graduates to "Mastered" after repeated recall. */
export type MistakeStatus = "Open" | "Reviewing" | "Mastered";

export interface Mistake {
  id: string;
  date: ISODate; // when the mistake was made
  subjectId: string;
  topic: string;
  category: MistakeCategory;

  /* the learning asset */
  question?: string;
  userAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
  source?: string;

  /* spaced-repetition review workflow */
  status: MistakeStatus;
  reviewCount: number;
  lastReviewed?: ISODate;
  nextReview: ISODate;
  intervalDays: number;
}

/* ── Habits / Sleep / Exercise ───────────────────────────────── */

/**
 * Where a habit's progress comes from. `manual` is a check-in on the Habits
 * page; every other source is read from records kept elsewhere, so the same
 * activity is never entered twice. See `lib/habit-engine.ts`.
 */
export type HabitSource = "manual" | "journal" | "life" | "revision" | "roadmap";

/**
 * What a habit measures from its source, and so the unit of its target.
 * Each source offers its own (see `HABIT_METRICS` in `lib/habit-engine.ts`).
 */
export type HabitMetric =
  | "check" // manual: done or not
  | "studyHours"
  | "subjectHours"
  | "topicsCompleted"
  | "sleepHours"
  | "bedtimeBy"
  | "wakeBy"
  | "exerciseMinutes"
  | "walkKm"
  | "runKm"
  | "meditationMinutes"
  | "waterLiters"
  | "screenTimeUnder"
  | "revisionPasses"
  | "revisionMinutes"
  | "roadmapActivities";

/**
 * When a habit is due. `daily`: every day. `weekdays`: the listed days (0 is
 * Sunday). `weekly`: a number of qualifying days in each week, on any days.
 */
export type HabitSchedule =
  | { kind: "daily" }
  | { kind: "weekdays"; days: number[] }
  | { kind: "weekly"; timesPerWeek: number }
  /** The week's total must reach the target: "five planned activities a week". */
  | { kind: "weeklyTotal" };

export type HabitCategory = "Study" | "Revision" | "Sleep" | "Health" | "Mind" | "Planning" | "Other";

/**
 * A hand correction for one day, which always wins over what the source says:
 * `done` and `missed` settle the day, `value` replaces the measured amount.
 * Kept per day, so the next record that comes in never undoes it.
 */
export interface HabitOverride {
  kind: "done" | "missed" | "value";
  value?: number;
  /** ISO timestamp of the correction. */
  at: string;
}

/** A stretch the habit was paused for, so those days are not counted. */
export interface HabitPause {
  from: ISODate;
  /** Absent while it is still paused. */
  to?: ISODate;
}

export interface Habit {
  id: string;
  name: string;
  /**
   * @deprecated The schedule before `schedule` existed. Read through
   * `habitSchedule` (lib/habit-engine.ts); kept so older devices still load.
   */
  cadence: "daily" | "weekly";
  icon?: string;
  /** The day it was created. Nothing before it ever counts. */
  createdOn: ISODate;
  /** @deprecated Read through `habitSchedule`. */
  targetPerWeek?: number;
  /** Retired: hidden everywhere, history kept. */
  archived?: boolean;
  /**
   * Manual check-ins, by day. `false` is an untick written by older versions
   * and reads as not done.
   */
  log: Record<ISODate, boolean>;
  description?: string;
  category?: HabitCategory;
  /** Absent means daily (or, for an old weekly habit, its weekly count). */
  schedule?: HabitSchedule;
  /** Absent means `manual`. */
  source?: HabitSource;
  /** Absent means `check`. */
  metric?: HabitMetric;
  /**
   * The amount that completes a day: hours, minutes, km, litres, passes,
   * activities; a time ("HH:MM") is stored as minutes after midnight. Absent
   * for a plain check.
   */
  target?: number;
  /** `subjectHours`: the subject, by id. */
  subjectId?: string;
  /**
   * Automatic habits only: let a manual check-in complete a day the source
   * says nothing about (a hybrid habit).
   */
  allowManual?: boolean;
  /**
   * The first day records from the source count. A new automatic habit starts
   * today; choosing an earlier day counts history from then, and it can be
   * moved at any time without changing a single source record.
   */
  countFrom?: ISODate;
  /** Hand corrections, by day. Always win over the source. */
  overrides?: Record<ISODate, HabitOverride>;
  /** Pauses, oldest first. Paused days are neither kept nor missed. */
  pauses?: HabitPause[];
  /** A reminder in the inbox if the habit is still open by this time ("HH:MM"). */
  remindAt?: string;
}

export interface SleepLog {
  id: string;
  date: ISODate;
  hours: number;
  quality: number; // 1-5
  bedtime?: string;
  wakeup?: string;
}

export type ExerciseType =
  | "Run"
  | "Walk"
  | "Gym"
  | "Yoga"
  | "Cycling"
  | "Sports"
  | "Other";

export interface ExerciseLog {
  id: string;
  date: ISODate;
  type: ExerciseType;
  minutes: number;
  intensity: number; // 1-5
  note?: string;
}

/* ── Life Dashboard (unified daily life log) ─────────────────── */

/**
 * One record per day for the Life Dashboard.
 *
 * Every measurement is optional, and absent means *not recorded*, which is not
 * the same as zero: a day you didn't note your water is missing from the water
 * average, while a day you logged 0 km run is a genuine rest day. Earlier
 * versions filled blanks with defaults (2 L of water, 120 minutes of screen
 * time) that then counted as real readings.
 */
export interface LifeEntry {
  id: string;
  date: ISODate; // unique per day
  sleepHours?: number;
  sleepQuality?: number; // 1-5
  bedtime?: string;
  wakeTime?: string;
  walkKm?: number;
  runKm?: number;
  exerciseMinutes?: number;
  exerciseType?: ExerciseType;
  waterLiters?: number;
  meditationMin?: number;
  weightKg?: number;
  screenTimeMin?: number;
  deepWorkHours?: number;
  /** A line about the day. */
  note?: string;
  /** Journal files linked to this day: ids into `ChronicleData.files`. */
  fileIds?: string[];
}

/** The Life Dashboard measurements a user can choose to track. */
export type LifeField =
  | "sleep"
  | "exercise"
  | "walk"
  | "run"
  | "water"
  | "meditation"
  | "screen"
  | "weight"
  | "deepWork";

/* ── Goals ───────────────────────────────────────────────────── */

export type GoalHorizon =
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Quarterly"
  | "Long-term";
export type GoalStatus = "Active" | "Completed" | "Missed" | "Paused";

/**
 * What a goal measures itself against. `manual` is the number you type in;
 * everything else is read from the data it names — see `lib/goals.ts` for the
 * catalogue, including which need a linked subject and which accumulate over
 * the goal's window rather than being a reading of right now.
 */
export type GoalMetric =
  | "manual"
  | "studyHours"
  | "studyDays"
  | "studyStreak"
  | "deepWorkHours"
  | "topicsCompleted"
  | "revisionPasses"
  | "mocksTaken"
  | "mockAverage"
  | "subjectHours"
  | "subjectMastery"
  | "booksCompleted"
  | "currentAffairsLogged"
  | "reflectionsWritten"
  | "mistakesMastered"
  | "milestones";

export type GoalCategory =
  | "Study"
  | "Syllabus"
  | "Revision"
  | "Mock tests"
  | "Current affairs"
  | "Health"
  | "Personal";

export type GoalPriority = "High" | "Medium" | "Low";

/** A step on the way to a goal, ticked off by hand. */
export interface GoalMilestone {
  id: string;
  title: string;
  dueOn?: ISODate;
  /** The day it was ticked off. Absent while it is still open. */
  doneOn?: ISODate;
}

/** A reading of a hand-tracked goal, kept each time the number is updated. */
export interface GoalProgressEntry {
  id: string;
  date: ISODate;
  value: number;
  note?: string;
}

/** A dated thought about the goal: what's working, what isn't. */
export interface GoalNote {
  id: string;
  date: ISODate;
  text: string;
}

export interface Goal {
  id: string;
  title: string;
  horizon: GoalHorizon;
  metricLabel?: string;
  target?: number;
  /**
   * The progress figure. Only authoritative for a `manual` goal — when `metric`
   * names something measurable, the live value is read from the data instead and
   * this is ignored. See `lib/goals.ts`.
   */
  current?: number;
  unit?: string;
  deadline?: ISODate;
  status: GoalStatus;
  createdOn: ISODate;
  linkedSubjectId?: string;
  /**
   * What this goal measures. Absent means `manual` — the old behaviour of typing
   * the number in — so existing goals keep working untouched.
   */
  metric?: GoalMetric;
  category?: GoalCategory;
  priority?: GoalPriority;
  /** Set when the goal is marked completed; cleared if it is reopened. */
  completedOn?: ISODate;
  milestones?: GoalMilestone[];
  /** History of a hand-tracked goal's number, oldest first. */
  progressLog?: GoalProgressEntry[];
  notes?: GoalNote[];
  /** Journal days that belong with this goal. */
  journalDates?: ISODate[];
  /** Journal files linked to the goal: ids into `ChronicleData.files`. */
  fileIds?: string[];
}

/* ── Books ───────────────────────────────────────────────────── */

export type BookStatus = "To Read" | "Reading" | "Completed" | "Reference";

export interface Book {
  id: string;
  title: string;
  author: string;
  subjectId?: string;
  paper?: PaperCode;
  totalPages: number;
  currentPage: number;
  status: BookStatus;
  rating?: number; // 1-5
  startedOn?: ISODate;
  finishedOn?: ISODate;
  isStandard?: boolean; // a "standard" UPSC reference book
}

/* ── Milestone Timeline (retired) ───────────────────────────── */

/**
 * The Milestone Timeline page is retired. Milestones written there stay in
 * the account, as they were, so nothing anyone recorded is lost, and older
 * devices that still show the page keep working; nothing in this version
 * reads or writes them.
 */

export type MilestoneType =
  | "Start"
  | "Exam"
  | "Achievement"
  | "Phase"
  | "Personal"
  | "Setback"
  | "Selection";

export interface Milestone {
  id: string;
  date: ISODate;
  title: string;
  type: MilestoneType;
  description?: string;
  pinned?: boolean;
}

/* ── Personal Diary ──────────────────────────────────────────── */

/**
 * One Personal Diary entry: private writing, kept apart from the study record.
 * Nothing in the app reads its words: not reviews, not the coach, not the
 * habits, and the notification dispatcher on the server never receives them.
 *
 * The type keeps its old name, `Reflection`, and the store key `reflections`,
 * so every entry written before the diary existed is a diary entry as it is.
 * Those older entries have a prompt, a 1-5 mood and gratitude notes; new ones
 * need only the words.
 */
export interface Reflection {
  id: string;
  date: ISODate;
  /** The writing prompt it answers, if one was chosen. */
  prompt?: string;
  /** The entry itself. Light formatting is kept as Markdown (`lib/diary.ts`). */
  content: string;
  /**
   * @deprecated The 1-5 mood older reflections asked for. Shown on those
   * entries; new entries don't ask. Absent or 0 means not given.
   */
  mood?: number;
  /** @deprecated Gratitude notes from older reflections. Shown on those entries. */
  gratitude?: string[];
  title?: string;
  tags?: string[];
  /** One of `DIARY_CATEGORIES` (lib/diary.ts), or a word of your own. */
  category?: string;
  pinned?: boolean;
  /** Marked as important: easy to find again. */
  important?: boolean;
  /** Files attached to the entry: ids into `ChronicleData.files`. */
  fileIds?: string[];
  /** ISO timestamps. Absent on entries written before the diary. */
  createdAt?: string;
  updatedAt?: string;
}

/* ── Reviews (weekly / monthly / yearly) ─────────────────────── */

/** `Custom` is any range of days you choose; the rest are calendar periods. */
export type ReviewType = "Weekly" | "Monthly" | "Yearly" | "Custom";

/**
 * A Performance Review. The figures are measured from the records of the
 * period (`lib/performance.ts`); what you write is yours. While a review is a
 * draft its figures stay live. Completing it freezes them in `snapshot`, so a
 * later edit to the journal or the plans never rewrites a finished review;
 * "Refresh figures" updates the snapshot on purpose.
 */
export interface Review {
  id: string;
  type: ReviewType;
  periodLabel: string;
  startDate: ISODate;
  endDate: ISODate;
  totalHours?: number;
  mocksTaken?: number;
  rating?: number; // 1-5
  wins?: string[];
  struggles?: string[];
  lessons?: string[];
  nextFocus?: string[];
  /** Absent on reviews written before drafts existed: those read as completed. */
  status?: "draft" | "completed";
  /** The questions the review asks you, by key (`REVIEW_QUESTIONS`). */
  answers?: Partial<Record<ReviewQuestionKey, string>>;
  /** The measured figures as they stood when the review was completed. */
  snapshot?: PerformanceSnapshot;
  /** ISO timestamps. */
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export type ReviewQuestionKey = "wentWell" | "struggled" | "attention" | "unfinished" | "change" | "priorities";

/**
 * A finished review's figures. Plain numbers and labels, copied from the
 * period's records when it was completed, so it reads the same forever.
 */
export interface PerformanceSnapshot {
  /** ISO timestamp the figures were taken. */
  takenAt: string;
  days: number;
  daysLogged: number;
  activeDays: number;
  studyHours: number;
  hoursTarget: number;
  sessions: number;
  topicsCompleted: number;
  subjects: { id: string; name: string; hours: number; share: number }[];
  roadmap: { planned: number; completed: number; deferred: number; open: number };
  revision: { passes: number; dueNow: number; overdue: number };
  habits: { scheduled: number; kept: number; rate: number | null };
  goals: { active: number; completed: number; milestonesDone: number };
  mocks: { taken: number; avgPct: number | null };
  sleep: { nights: number; avgHours: number | null };
  exercise: { days: number; minutes: number };
  /** The day with the most hours. */
  bestDay?: { date: ISODate; hours: number } | null;
  /** Each habit's record in the period. */
  habitRows?: { id: string; name: string; due: number; kept: number }[];
  /** Planned activities still open at the end of the period (up to eight). */
  unfinished?: { title: string; href: string }[];
  /** The period before, measured at the same moment, for the comparison. */
  previous?: PerformanceTotals;
}

/** The headline figures of a period, for comparing one with another. */
export interface PerformanceTotals {
  studyHours: number;
  activeDays: number;
  topicsCompleted: number;
  revisionPasses: number;
  habitRate: number | null;
  roadmapCompleted: number;
  roadmapPlanned: number;
  mocksTaken: number;
  sleepAvg: number | null;
}

/* ── Knowledge Graph ─────────────────────────────────────────── */

/**
 * An Obsidian-style link between two topic nodes. `source` and `target` are
 * Topic ids ("<subjectId>-t<index>"). Subject→topic containment edges are
 * derived at render time rather than stored, so the graph stays in sync with
 * the syllabus. Topic completion status, confidence and revision counts live
 * on the Topic itself and power the node styling and analytics.
 */
export interface TopicLink {
  id: string;
  source: string;
  target: string;
  relation?: string; // e.g. "leads to", "related", "prerequisite", "contrast"
  createdOn?: ISODate;
}

/* ── Selection Journey Archive (retired) ─────────────────────── */

/**
 * The Selection Archive page is retired. Its stages stay in the account, as
 * they were, so nothing anyone recorded is lost, and older devices that still
 * show the page keep working; nothing in this version reads or writes them.
 */
export type StageStatus =
  | "Locked"
  | "In Progress"
  | "Cleared"
  | "Awaiting Result"
  | "Not Cleared";

export interface SelectionStage {
  id: string;
  name: string;
  attempt: string;
  status: StageStatus;
  date?: ISODate;
  score?: string;
  notes?: string;
}

/* ── Profile ─────────────────────────────────────────────────── */

export interface Profile {
  name: string;
  tagline?: string;
  mission?: string;
  targetExam: string;
  examDate: ISODate;
  attemptNumber: number;
  /** Empty when the optional hasn't been chosen yet. */
  optionalSubject: string;
  startDate: ISODate;
  dailyHourTarget: number;
  /**
   * IANA zone for background notifications ("Asia/Kolkata"). The app itself
   * always uses the device's clock; this decides when a push may arrive.
   */
  timezone?: string;
  /**
   * The day a Roadmap week starts on, 0 (Sunday) to 6 (Saturday). Absent
   * means Monday. Only suggests where new weekly plans start; every plan
   * keeps the dates it was given.
   */
  weekStart?: number;
  /**
   * The Life Dashboard measurements this person tracks. Absent means all of
   * them; the form and the dashboard only show what is listed.
   */
  lifeFields?: LifeField[];
  /** The sleep schedule being aimed for. Absent until one is set. */
  sleepTarget?: SleepTarget;
  /** 12- or 24-hour clock. Absent means the device's own convention. */
  timeFormat?: TimeFormat;
  /** Set when first-run setup is finished. Absent means setup is still due. */
  onboardedAt?: ISODate;
  /**
   * The day the feature tour was first closed, whether finished or skipped.
   * Absent means it has never been seen: a new account is shown it on its
   * first visit to the dashboard, and the tour button carries a dot. Synced,
   * so finishing it on the phone means the laptop doesn't show it again.
   */
  tourSeenAt?: ISODate;
  /**
   * Whether the app sends a crash report on its own when something breaks.
   * Absent means yes. A report holds the error and the page's path, never
   * the account or anything written in the app (lib/report.ts).
   */
  crashReports?: boolean;
}

/* ── Root state ──────────────────────────────────────────────── */

export interface ChronicleData {
  profile: Profile;
  /** Days the user has explicitly marked as accomplished. */
  accomplished: ISODate[];
  subjects: Subject[];
  journal: JournalEntry[];
  mocks: MockTest[];
  revisions: RevisionItem[];
  currentAffairs: CurrentAffair[];
  mistakes: Mistake[];
  habits: Habit[];
  sleep: SleepLog[];
  exercise: ExerciseLog[];
  lifeLog: LifeEntry[];
  goals: Goal[];
  books: Book[];
  /** Retired with the Milestone Timeline; kept as it was. */
  milestones: Milestone[];
  reflections: Reflection[];
  reviews: Review[];
  topicLinks: TopicLink[];
  /** Retired with the Selection Archive; kept as it was. */
  selection: SelectionStage[];
  /** Every file attached in the journal or the diary. See `FileRecord`. */
  files: FileRecord[];
  /** The Roadmap: this person's own yearly, monthly and weekly plans. */
  plans: RoadmapPlan[];
  /** What the Study Coach suggested and what you did with it. See `CoachLog`. */
  coach: CoachLog;
}

/* ── Study Coach history ─────────────────────────────────────── */

/**
 * What happened to a recommendation. `fingerprint` is the evidence it was
 * shown with: a dismissed recommendation stays away until its evidence
 * changes, and an applied one records exactly what was changed.
 */
export interface CoachDecision {
  /** This record. Unique, so two devices' histories merge. */
  id: string;
  /** The recommendation it is about: stable, e.g. `neglected:economy`. */
  recId: string;
  status: "accepted" | "dismissed" | "applied" | "done";
  /** The recommendation's title when it was decided. */
  title: string;
  fingerprint: string;
  /** ISO timestamp. */
  at: string;
  /** What applying it changed, in words, one line per change. */
  changes?: string[];
}

/** One day's briefing, as a line of history. */
export interface CoachBriefingRecord {
  /** `briefing:<date>`: one per day. */
  id: string;
  date: ISODate;
  /** The recommendation titles that day, most important first. */
  headlines: string[];
}

export interface CoachLog {
  decisions: CoachDecision[];
  briefings: CoachBriefingRecord[];
}

/* ── Roadmap ─────────────────────────────────────────────────── */

/**
 * The three planning levels. A month may belong to a year; a week to a month
 * or straight to a year. Any of them can also stand alone.
 */
export type PlanLevel = "year" | "month" | "week";

/** A piece of planned work, or a checkpoint to reach by a date. */
export type PlanItemKind = "activity" | "milestone";

export type PlanItemStatus = "notStarted" | "inProgress" | "completed" | "deferred";

export type PlanPriority = "High" | "Medium" | "Low";

/** Where a carried-forward activity went, or came from. */
export interface PlanItemRef {
  planId: string;
  itemId: string;
}

/**
 * Something planned inside one plan. It belongs to that plan only; carrying
 * it forward makes a copy in the next plan and marks this one as moved on.
 */
export interface PlanItem {
  id: string;
  kind: PlanItemKind;
  title: string;
  description?: string;
  /** Activities only. Absent reads as Medium. */
  priority?: PlanPriority;
  /** An activity's target date, or the date a milestone is due. */
  targetDate?: ISODate;
  status: PlanItemStatus;
  /** A syllabus subject, by id. */
  subjectId?: string;
  /** A free label such as "Answer writing". */
  category?: string;
  /** A goal this serves. A reference only: its progress stays in Goals. */
  goalId?: string;
  /** One of that goal's milestones, referenced rather than copied. */
  goalMilestoneId?: string;
  notes?: string;
  /** When it was marked completed (ISO timestamp). Cleared if reopened. */
  completedAt?: string;
  /** Journal days deliberately linked to this activity. */
  journalDates?: ISODate[];
  carriedFrom?: PlanItemRef;
  carriedTo?: PlanItemRef;
  /** ISO timestamp. */
  createdAt: string;
}

/** Looking back at a finished week, month or year. */
export interface PlanReview {
  wentWell?: string;
  improve?: string;
  nextPriorities?: string;
  /** ISO timestamp of the last save. */
  reviewedAt?: string;
}

/**
 * One plan. Dates are calendar dates and are the source of truth: a month
 * runs from its first to its last day, a week for seven days from `start`,
 * and a year from 1 January to 31 December unless other dates were chosen.
 */
export interface RoadmapPlan {
  id: string;
  level: PlanLevel;
  /** Optional. Without one, the period is the name ("January 2027"). */
  title?: string;
  /** Year plans: the year it is for. */
  year?: number;
  start: ISODate;
  end: ISODate;
  /** The plan this one sits under. Never deleted or changed for you. */
  parentId?: string;
  focus?: string;
  objectives?: string[];
  outcomes?: string;
  notes?: string;
  /** Goals this plan works towards, by id. References only. */
  goalIds?: string[];
  items?: PlanItem[];
  review?: PlanReview;
  /** Set when archived (ISO timestamp). Archived plans stay readable. */
  archivedAt?: string;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}
