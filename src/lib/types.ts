/* ════════════════════════════════════════════════════════════════
   THE UPSC CHRONICLE — UNIFIED DOMAIN MODEL
   A single typed graph that connects every feature: a day in the
   journal links to subjects, mocks, mistakes, current affairs, the
   knowledge graph, habits, reflections and milestones.
   ════════════════════════════════════════════════════════════════ */

export type ISODate = string; // "yyyy-mm-dd"
export type Theme = "dark" | "light";

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

export interface JournalEntry {
  id: string;
  date: ISODate; // unique per day
  blocks: StudyBlock[];
  totalHours: number;
  mood: number; // 1-5
  energy: number; // 1-5
  focus: number; // 1-5
  tasksPlanned?: number;
  tasksDone?: number;
  highlights?: string;
  reflection?: string;
  tags?: string[];
}

/* ── Mock Tests ──────────────────────────────────────────────── */

export type MockType =
  | "Prelims GS"
  | "Prelims CSAT"
  | "Mains GS"
  | "Mains Essay"
  | "Mains Optional"
  | "Sectional";

export interface MockTest {
  id: string;
  date: ISODate;
  name: string;
  type: MockType;
  provider?: string;
  score: number;
  max: number;
  attempted?: number;
  correct?: number;
  wrong?: number;
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

export type MistakeType =
  | "Conceptual"
  | "Silly"
  | "Factual"
  | "Time Management"
  | "Misreading";
export type MistakeStatus = "Open" | "Reviewing" | "Resolved";

export interface Mistake {
  id: string;
  date: ISODate;
  subjectId: string;
  topic: string;
  type: MistakeType;
  description: string;
  correction?: string;
  status: MistakeStatus;
  source?: string;
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

/* ── Goals ───────────────────────────────────────────────────── */

export type GoalHorizon =
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Quarterly"
  | "Long-term";
export type GoalStatus = "Active" | "Completed" | "Missed" | "Paused";

export interface Goal {
  id: string;
  title: string;
  horizon: GoalHorizon;
  metricLabel?: string;
  target?: number;
  current?: number;
  unit?: string;
  deadline?: ISODate;
  status: GoalStatus;
  createdOn: ISODate;
  linkedSubjectId?: string;
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

export type GraphNodeType = "subject" | "topic" | "concept" | "event";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  subjectId?: string;
  strength: number; // 0-100 mastery
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation?: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  targetExam: string;
  examDate: ISODate;
  attemptNumber: number;
  optionalSubject: string;
  startDate: ISODate;
  dailyHourTarget: number;
}

/* ── Root state ──────────────────────────────────────────────── */

export interface ChronicleData {
  profile: Profile;
  subjects: Subject[];
  journal: JournalEntry[];
  mocks: MockTest[];
  revisions: RevisionItem[];
  currentAffairs: CurrentAffair[];
  mistakes: Mistake[];
  habits: Habit[];
  sleep: SleepLog[];
  exercise: ExerciseLog[];
  goals: Goal[];
  books: Book[];
  milestones: Milestone[];
  reflections: Reflection[];
  reviews: Review[];
  graph: KnowledgeGraph;
  selection: SelectionStage[];
}
