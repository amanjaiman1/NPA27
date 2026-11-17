import type {
  ChronicleData,
  Subject,
  Habit,
  Book,
  TopicLink,
  SelectionStage,
  Profile,
  PaperCode,
} from "./types";
import { toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   STARTING DATA FOR A NEW ACCOUNT

   Every account begins from the same *reference* material — the UPSC
   syllabus, the standard books, a few habit suggestions, the curated
   links between syllabus topics — and nothing personal. A journal, mocks,
   mistakes, goals, reflections and progress all start empty, and the
   profile is filled in by the account's owner during first-run setup.

   Nothing here is shared at runtime: each account gets its own copy, so
   one person ticking off "Fundamental Rights" never touches anyone else's.
   ════════════════════════════════════════════════════════════════ */

/* ── The GS syllabus (shared reference) ──────────────────────── */

interface SubjectDef {
  id: string;
  name: string;
  paper: PaperCode;
  weightage: number;
  topics: string[];
}

const GS_SUBJECTS: SubjectDef[] = [
  { id: "modern-history", name: "Modern History", paper: "GS1", weightage: 70, topics: ["Advent of Europeans", "Revolt of 1857", "Socio-Religious Reform", "INC & Moderates", "Gandhian Era", "Revolutionaries", "Partition & Freedom", "Post-Independence"] },
  { id: "art-culture", name: "Art & Culture", paper: "GS1", weightage: 55, topics: ["Indus Valley", "Temple Architecture", "Classical Dance", "Painting Schools", "Bhakti & Sufi", "Buddhism & Jainism", "UNESCO Sites"] },
  { id: "geography", name: "Geography", paper: "GS1", weightage: 75, topics: ["Geomorphology", "Climatology", "Oceanography", "Indian Physiography", "Monsoon System", "Resource Distribution", "Mapping"] },
  { id: "society", name: "Indian Society", paper: "GS1", weightage: 45, topics: ["Salient Features", "Urbanisation", "Globalisation", "Women & Society", "Population", "Communalism"] },
  { id: "polity", name: "Polity & Governance", paper: "GS2", weightage: 92, topics: ["Constitutional Framework", "Fundamental Rights", "DPSP", "Parliament", "Judiciary", "Federalism", "Local Government", "Constitutional Bodies", "Governance"] },
  { id: "ir", name: "International Relations", paper: "GS2", weightage: 60, topics: ["India & Neighbours", "Groupings", "Global Institutions", "India-US", "India-China", "Diaspora"] },
  { id: "social-justice", name: "Social Justice", paper: "GS2", weightage: 50, topics: ["Welfare Schemes", "Health", "Education", "Poverty", "Vulnerable Sections", "SHGs & NGOs"] },
  { id: "economy", name: "Economy", paper: "GS3", weightage: 90, topics: ["National Income", "Money & Banking", "Fiscal Policy", "Inflation", "External Sector", "Agriculture", "Industry & Infra", "Budget & Survey"] },
  { id: "environment", name: "Environment & Ecology", paper: "GS3", weightage: 82, topics: ["Ecosystems", "Biodiversity", "Climate Change", "Conservation", "Pollution", "Governance", "Agreements"] },
  { id: "sci-tech", name: "Science & Technology", paper: "GS3", weightage: 55, topics: ["Space", "Defence Tech", "Biotechnology", "IT & Computers", "Nano & Robotics", "Health Tech"] },
  { id: "security", name: "Internal Security", paper: "GS3", weightage: 40, topics: ["Security Challenges", "Cyber Security", "Money Laundering", "Border Management", "Left-Wing Extremism", "Security Forces"] },
  { id: "ethics", name: "Ethics (GS4)", paper: "GS4", weightage: 68, topics: ["Ethics & Human Interface", "Attitude", "Foundational Values", "Emotional Intelligence", "Thinkers", "Public Service Values", "Probity", "Case Studies"] },
  { id: "essay", name: "Essay", paper: "Essay", weightage: 60, topics: ["Philosophical", "Polity-based", "Economy-based", "Social", "Quote-based", "Structure Practice"] },
  { id: "csat", name: "CSAT", paper: "CSAT", weightage: 50, topics: ["Comprehension", "Quantitative Aptitude", "Logical Reasoning", "Data Interpretation", "Decision Making"] },
  { id: "current-affairs", name: "Current Affairs", paper: "CurrentAffairs", weightage: 96, topics: ["Daily News", "Editorials", "PIB & PRS", "Govt Schemes", "Reports & Indices", "Yojana & Kurukshetra"] },
];

/* ── Optional subjects ───────────────────────────────────────── */

/** The UPSC optional papers, for the setup and profile pickers. */
export const OPTIONAL_SUBJECTS: string[] = [
  "Agriculture",
  "Animal Husbandry & Veterinary Science",
  "Anthropology",
  "Botany",
  "Chemistry",
  "Civil Engineering",
  "Commerce & Accountancy",
  "Economics",
  "Electrical Engineering",
  "Geography",
  "Geology",
  "History",
  "Law",
  "Literature (any language)",
  "Management",
  "Mathematics",
  "Mechanical Engineering",
  "Medical Science",
  "Philosophy",
  "Physics",
  "Political Science & International Relations",
  "Psychology",
  "Public Administration",
  "Sociology",
  "Statistics",
  "Zoology",
];

/**
 * Optionals with a topic list ready to go. Anything else gets an empty
 * subject that its owner fills in from the Subjects page.
 */
const OPTIONAL_TOPICS: Record<string, string[]> = {
  Sociology: ["Sociological Thinkers", "Social Stratification", "Social Movements", "Sociology of Development", "Indian Society & Change", "Caste & Class", "Research Methods"],
};

/** Stable id for the optional's subject, e.g. "sociology" or "optional-law". */
export function optionalSubjectId(optional: string): string {
  if (optional === "Sociology") return "sociology"; // the id existing data already uses
  const slug = optional.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `optional-${slug || "subject"}`;
}

function toSubject(def: SubjectDef): Subject {
  return {
    id: def.id,
    name: def.name,
    paper: def.paper,
    weightage: def.weightage,
    topics: def.topics.map((name, i) => ({
      id: `${def.id}-t${i}`,
      name,
      status: "untouched",
      confidence: 0,
      revisionCount: 0,
    })),
  };
}

/** The optional's subject, with its topics when a list is known. */
export function buildOptionalSubject(optional: string): Subject {
  return toSubject({
    id: optionalSubjectId(optional),
    name: `${optional} (Optional)`,
    paper: "Optional",
    weightage: 88,
    topics: OPTIONAL_TOPICS[optional] ?? [],
  });
}

/** The syllabus with nothing studied yet, plus the optional when one is chosen. */
export function buildSyllabus(optional: string): Subject[] {
  const subjects = GS_SUBJECTS.map(toSubject);
  if (optional) subjects.push(buildOptionalSubject(optional));
  return subjects;
}

/* ── Books (shared reference, progress private) ──────────────── */

const STANDARD_BOOKS: (Omit<Book, "id" | "currentPage" | "status"> & { optional?: string })[] = [
  { title: "Indian Polity", author: "M. Laxmikanth", subjectId: "polity", paper: "GS2", totalPages: 900, isStandard: true },
  { title: "Indian Economy", author: "Ramesh Singh", subjectId: "economy", paper: "GS3", totalPages: 760, isStandard: true },
  { title: "Certificate Physical & Human Geography", author: "G.C. Leong", subjectId: "geography", paper: "GS1", totalPages: 430, isStandard: true },
  { title: "India's Struggle for Independence", author: "Bipan Chandra", subjectId: "modern-history", paper: "GS1", totalPages: 600, isStandard: true },
  { title: "Environment", author: "Shankar IAS", subjectId: "environment", paper: "GS3", totalPages: 410, isStandard: true },
  { title: "Ethics, Integrity & Aptitude", author: "Lexicon", subjectId: "ethics", paper: "GS4", totalPages: 520, isStandard: true },
  { title: "Introduction to the Constitution", author: "D.D. Basu", subjectId: "polity", paper: "GS2", totalPages: 480, isStandard: true },
  { title: "Contemporary Essays", author: "Ramesh Singh", subjectId: "essay", paper: "Essay", totalPages: 320 },
  { title: "India After Gandhi", author: "Ramachandra Guha", subjectId: "modern-history", paper: "GS1", totalPages: 890 },
  { title: "Sociology: Themes and Perspectives", author: "Haralambos & Holborn", subjectId: "sociology", paper: "Optional", totalPages: 540, isStandard: true, optional: "Sociology" },
];

export function buildBooks(optional: string): Book[] {
  return STANDARD_BOOKS.filter((b) => !b.optional || b.optional === optional).map(
    ({ optional: _optional, ...b }, i) => {
      void _optional;
      return { ...b, id: `book-${i}`, currentPage: 0, status: "To Read" as const };
    },
  );
}

/* ── Habit suggestions ───────────────────────────────────────── */

export interface HabitTemplate {
  id: string;
  name: string;
  icon: string;
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  { id: "news", name: "Read the newspaper", icon: "newspaper" },
  { id: "answer", name: "Answer writing", icon: "pen" },
  { id: "revise", name: "Revise old notes", icon: "repeat" },
  { id: "wake", name: "Wake up early", icon: "sunrise" },
  { id: "nosocial", name: "No social media", icon: "shield" },
  { id: "meditate", name: "Meditate 10 min", icon: "lotus" },
];

export const DEFAULT_HABIT_IDS = ["news", "answer", "revise"];

export function buildHabits(ids: string[], today: string): Habit[] {
  return HABIT_TEMPLATES.filter((h) => ids.includes(h.id)).map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    cadence: "daily" as const,
    createdOn: today,
    targetPerWeek: 7,
    log: {},
  }));
}

/* ── Knowledge graph: curated links between syllabus topics ──── */

// [srcSubject, srcTopic, dstSubject, dstTopic, relation?]
const TOPIC_LINK_DEFS: [string, string, string, string, string?][] = [
  // ── Polity web ──
  ["polity", "Constitutional Framework", "polity", "Fundamental Rights", "leads to"],
  ["polity", "Constitutional Framework", "polity", "DPSP", "leads to"],
  ["polity", "Fundamental Rights", "polity", "DPSP", "contrast"],
  ["polity", "Constitutional Framework", "polity", "Parliament", "leads to"],
  ["polity", "Parliament", "polity", "Judiciary", "related"],
  ["polity", "Parliament", "polity", "Constitutional Bodies", "related"],
  ["polity", "Judiciary", "polity", "Fundamental Rights", "related"],
  ["polity", "Federalism", "polity", "Local Government", "leads to"],
  ["polity", "Federalism", "polity", "Parliament", "related"],
  ["polity", "Governance", "polity", "Constitutional Bodies", "related"],
  // ── Modern History chain: 1857 → National Movement → Congress ──
  ["modern-history", "Advent of Europeans", "modern-history", "Revolt of 1857", "leads to"],
  ["modern-history", "Revolt of 1857", "modern-history", "Socio-Religious Reform", "related"],
  ["modern-history", "Revolt of 1857", "modern-history", "INC & Moderates", "leads to"],
  ["modern-history", "Socio-Religious Reform", "modern-history", "INC & Moderates", "leads to"],
  ["modern-history", "INC & Moderates", "modern-history", "Gandhian Era", "leads to"],
  ["modern-history", "Gandhian Era", "modern-history", "Revolutionaries", "contrast"],
  ["modern-history", "Gandhian Era", "modern-history", "Partition & Freedom", "leads to"],
  ["modern-history", "Partition & Freedom", "modern-history", "Post-Independence", "leads to"],
  // ── History ↔ Polity ↔ Sociology (optional) ──
  ["modern-history", "Post-Independence", "polity", "Constitutional Framework", "prerequisite"],
  ["polity", "Constitutional Framework", "sociology", "Indian Society & Change", "related"],
  ["sociology", "Indian Society & Change", "society", "Salient Features", "related"],
  ["sociology", "Sociological Thinkers", "ethics", "Thinkers", "related"],
  ["sociology", "Caste & Class", "society", "Communalism", "related"],
  ["sociology", "Social Movements", "modern-history", "INC & Moderates", "related"],
  ["sociology", "Sociology of Development", "social-justice", "Welfare Schemes", "related"],
  // ── International Relations ──
  ["ir", "Groupings", "ir", "Global Institutions", "related"],
  ["ir", "India-China", "ir", "India & Neighbours", "related"],
  ["ir", "Groupings", "economy", "External Sector", "related"],
  // ── Economy ──
  ["economy", "External Sector", "economy", "Money & Banking", "related"],
  ["economy", "Money & Banking", "economy", "Inflation", "leads to"],
  ["economy", "Inflation", "economy", "Fiscal Policy", "related"],
  ["economy", "Fiscal Policy", "economy", "Budget & Survey", "leads to"],
  ["economy", "Agriculture", "geography", "Resource Distribution", "related"],
  ["economy", "Industry & Infra", "geography", "Resource Distribution", "related"],
  // ── Geography ↔ Environment ──
  ["geography", "Monsoon System", "geography", "Climatology", "related"],
  ["geography", "Climatology", "environment", "Climate Change", "leads to"],
  ["geography", "Oceanography", "environment", "Ecosystems", "related"],
  ["environment", "Climate Change", "environment", "Agreements", "leads to"],
  ["environment", "Biodiversity", "environment", "Conservation", "leads to"],
  ["environment", "Conservation", "environment", "Governance", "related"],
  ["environment", "Climate Change", "ir", "Global Institutions", "related"],
  ["environment", "Agreements", "ir", "Groupings", "related"],
  // ── Society & Social Justice ──
  ["society", "Salient Features", "society", "Communalism", "related"],
  ["society", "Urbanisation", "geography", "Resource Distribution", "related"],
  ["society", "Globalisation", "economy", "External Sector", "related"],
  ["society", "Women & Society", "social-justice", "Vulnerable Sections", "related"],
  ["social-justice", "Welfare Schemes", "current-affairs", "Govt Schemes", "related"],
  ["social-justice", "Health", "social-justice", "Education", "related"],
  ["social-justice", "Poverty", "economy", "Inflation", "related"],
  // ── Current Affairs as a hub ──
  ["current-affairs", "Govt Schemes", "economy", "Budget & Survey", "related"],
  ["current-affairs", "Reports & Indices", "economy", "National Income", "related"],
  ["current-affairs", "Editorials", "ir", "Global Institutions", "related"],
  ["current-affairs", "PIB & PRS", "polity", "Governance", "related"],
  // ── Science, Tech & Security ──
  ["sci-tech", "Space", "sci-tech", "Defence Tech", "related"],
  ["sci-tech", "Biotechnology", "sci-tech", "Health Tech", "related"],
  ["sci-tech", "IT & Computers", "security", "Cyber Security", "leads to"],
  ["security", "Cyber Security", "security", "Security Challenges", "related"],
  ["security", "Money Laundering", "economy", "Money & Banking", "related"],
  ["security", "Border Management", "ir", "India & Neighbours", "related"],
  // ── Ethics ──
  ["ethics", "Foundational Values", "ethics", "Public Service Values", "leads to"],
  ["ethics", "Public Service Values", "ethics", "Probity", "leads to"],
  ["ethics", "Case Studies", "ethics", "Probity", "related"],
  ["ethics", "Emotional Intelligence", "ethics", "Attitude", "related"],
  // ── Art & Culture ──
  ["art-culture", "Bhakti & Sufi", "modern-history", "Socio-Religious Reform", "related"],
  ["art-culture", "Buddhism & Jainism", "art-culture", "Temple Architecture", "related"],
  ["art-culture", "Temple Architecture", "art-culture", "UNESCO Sites", "related"],
  // ── Essay & CSAT ──
  ["essay", "Polity-based", "polity", "Governance", "related"],
  ["essay", "Economy-based", "economy", "Budget & Survey", "related"],
  ["essay", "Philosophical", "ethics", "Thinkers", "related"],
  ["csat", "Quantitative Aptitude", "csat", "Data Interpretation", "related"],
  ["csat", "Comprehension", "csat", "Logical Reasoning", "related"],
];

/** Links whose two ends both exist in `subjects`. */
export function buildTopicLinks(subjects: Subject[], today: string): TopicLink[] {
  const idOf = new Map<string, string>();
  for (const s of subjects) for (const t of s.topics) idOf.set(`${s.id}::${t.name}`, t.id);
  const seen = new Set<string>();
  const links: TopicLink[] = [];
  TOPIC_LINK_DEFS.forEach(([sa, ta, sb, tb, relation], i) => {
    const source = idOf.get(`${sa}::${ta}`);
    const target = idOf.get(`${sb}::${tb}`);
    if (!source || !target || source === target) return;
    const key = [source, target].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ id: `lk-${i}`, source, target, relation: relation ?? "related", createdOn: today });
  });
  return links;
}

/* ── The selection journey for one attempt ───────────────────── */

/** "UPSC CSE 2027" → "CSE 2027"; anything unrecognised is used as written. */
function attemptLabel(targetExam: string): string {
  return targetExam.replace(/^UPSC\s+/i, "").trim() || targetExam;
}

export function buildSelection(targetExam: string): SelectionStage[] {
  const attempt = attemptLabel(targetExam);
  return [
    { id: "s1", name: "Prelims", attempt, status: "Locked", notes: "The first gate." },
    { id: "s2", name: "Mains", attempt, status: "Locked", notes: "Nine papers that decide the rank." },
    { id: "s3", name: "Interview", attempt, status: "Locked", notes: "The final 275 marks." },
    { id: "s4", name: "Final Result", attempt, status: "Locked", notes: "The name in the list." },
  ];
}

/* ── Profiles ────────────────────────────────────────────────── */

/** The device's IANA zone, or a sensible default where the API is missing. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

/** The next CSE year whose Prelims haven't happened yet (they fall in late May). */
export function nextExamYear(today = new Date()): number {
  return today.getMonth() >= 5 ? today.getFullYear() + 1 : today.getFullYear();
}

/**
 * Prelims dates from UPSC's published examination calendars. Add each year
 * when UPSC publishes its calendar (usually in the May before). The public
 * countdown (app/(marketing)/resources/upsc-prelims-2027-countdown) uses the
 * same date, so the two never disagree.
 */
export const OFFICIAL_PRELIMS_DATES: Record<number, string> = {
  2027: "2027-05-23", // UPSC Examination Calendar 2027
};

/** The official date when known, otherwise an estimate (late May). Editable at any time. */
export function estimatedPrelimsDate(year: number): string {
  return OFFICIAL_PRELIMS_DATES[year] ?? `${year}-05-24`;
}

/** What first-run setup collects. */
export interface AccountSetup {
  name: string;
  targetExam: string;
  examDate: string;
  startDate: string;
  attemptNumber: number;
  optionalSubject: string;
  dailyHourTarget: number;
  timezone: string;
  habits: string[];
  useRoadmap: boolean;
}

export function defaultSetup(today = new Date()): AccountSetup {
  const year = nextExamYear(today);
  return {
    name: "",
    targetExam: `UPSC CSE ${year}`,
    examDate: estimatedPrelimsDate(year),
    startDate: toISODate(today),
    attemptNumber: 1,
    optionalSubject: "",
    dailyHourTarget: 8,
    timezone: deviceTimeZone(),
    habits: DEFAULT_HABIT_IDS,
    useRoadmap: false,
  };
}

function profileFrom(setup: AccountSetup, onboardedAt?: string): Profile {
  return {
    name: setup.name.trim(),
    targetExam: setup.targetExam.trim(),
    examDate: setup.examDate,
    attemptNumber: setup.attemptNumber,
    optionalSubject: setup.optionalSubject,
    startDate: setup.startDate,
    dailyHourTarget: setup.dailyHourTarget,
    timezone: setup.timezone,
    useRoadmap: setup.useRoadmap,
    onboardedAt,
  };
}

/* ── Assemble ────────────────────────────────────────────────── */

/**
 * A complete account built from first-run setup. Only reference material is
 * filled in; every personal record starts empty.
 */
export function createAccountTemplate(setup: AccountSetup, today = new Date()): ChronicleData {
  const todayISO = toISODate(today);
  const subjects = buildSyllabus(setup.optionalSubject);
  return {
    profile: profileFrom(setup, todayISO),
    accomplished: [],
    subjects,
    journal: [],
    mocks: [],
    revisions: [],
    currentAffairs: [],
    mistakes: [],
    habits: buildHabits(setup.habits, todayISO),
    sleep: [],
    exercise: [],
    lifeLog: [],
    goals: [],
    books: buildBooks(setup.optionalSubject),
    milestones: [],
    reflections: [],
    reviews: [],
    topicLinks: buildTopicLinks(subjects, todayISO),
    selection: buildSelection(setup.targetExam),
    files: [],
  };
}

/**
 * What an account holds before setup has run — and what the app holds when no
 * account is active at all. It is the template with an empty name and no
 * `onboardedAt`, which is exactly what sends a new account to setup.
 */
export function createBlankAccount(today = new Date()): ChronicleData {
  const data = createAccountTemplate(defaultSetup(today), today);
  return { ...data, profile: { ...data.profile, onboardedAt: undefined } };
}
