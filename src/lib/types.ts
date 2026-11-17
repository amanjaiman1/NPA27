/* ════════════════════════════════════════════════════════════════
   THE UPSC CHRONICLE — UNIFIED DOMAIN MODEL
   A single typed graph that connects every feature: a day in the
   journal links to subjects, mocks, mistakes, current affairs, the
   knowledge graph, habits, reflections and milestones.
   ════════════════════════════════════════════════════════════════ */

export type ISODate = string; // "yyyy-mm-dd"
export type Theme = "dark" | "light";

/**
 * The appearance the user picked: always light, always dark, or whichever the
 * device is set to (most phones switch at sunset). Synced with the account.
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * How surfaces are drawn, on top of either theme. `glass` turns cards, bars,
 * menus and dialogs translucent; it never changes Light or Dark itself.
 */
export type Material = "standard" | "glass";

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

export interface Habit {
  id: string;
  name: string;
  cadence: "daily" | "weekly";
  icon?: string;
  createdOn: ISODate;
  targetPerWeek?: number;
  archived?: boolean;
  log: Record<ISODate, boolean>;
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

/* ── Milestones / Timeline ───────────────────────────────────── */

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

/* ── Emotional Reflection Journal ────────────────────────────── */

export interface Reflection {
  id: string;
  date: ISODate;
  prompt?: string;
  content: string;
  mood: number; // 1-5
  gratitude?: string[];
}

/* ── Reviews (weekly / monthly / yearly) ─────────────────────── */

export type ReviewType = "Weekly" | "Monthly" | "Yearly";

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

/* ── Selection Journey Archive ───────────────────────────────── */

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
  /** Whether the built-in CSE 2027 week-by-week roadmap is shown. */
  useRoadmap?: boolean;
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
  milestones: Milestone[];
  reflections: Reflection[];
  reviews: Review[];
  topicLinks: TopicLink[];
  selection: SelectionStage[];
  /** Every file attached in the journal. See `FileRecord`. */
  files: FileRecord[];
}
