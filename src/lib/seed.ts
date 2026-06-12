import type {
  ChronicleData,
  Subject,
  JournalEntry,
  MockTest,
  RevisionItem,
  CurrentAffair,
  Mistake,
  Habit,
  SleepLog,
  ExerciseLog,
  Goal,
  Book,
  Milestone,
  Reflection,
  Review,
  KnowledgeGraph,
  GraphNode,
  SelectionStage,
  Topic,
  TopicStatus,
  CACategory,
  MockType,
} from "./types";

/* Deterministic RNG so seed data is stable across reloads. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260612);
const rand = () => rng();
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const r1 = (n: number) => Math.round(n * 10) / 10;

/* Date helpers anchored to "today". */
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (base: Date, n: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};
const agoISO = (n: number) => iso(addDays(TODAY, -n));
const aheadISO = (n: number) => iso(addDays(TODAY, n));

/* ── Subject definitions ─────────────────────────────────────── */

const subjectDefs: {
  id: string;
  name: string;
  paper: Subject["paper"];
  weightage: number;
  base: number; // baseline mastery 0-1
  topics: string[];
}[] = [
  { id: "modern-history", name: "Modern History", paper: "GS1", weightage: 70, base: 0.82, topics: ["Advent of Europeans", "Revolt of 1857", "Socio-Religious Reform", "INC & Moderates", "Gandhian Era", "Revolutionaries", "Partition & Freedom", "Post-Independence"] },
  { id: "art-culture", name: "Art & Culture", paper: "GS1", weightage: 55, base: 0.6, topics: ["Indus Valley", "Temple Architecture", "Classical Dance", "Painting Schools", "Bhakti & Sufi", "Buddhism & Jainism", "UNESCO Sites"] },
  { id: "geography", name: "Geography", paper: "GS1", weightage: 75, base: 0.7, topics: ["Geomorphology", "Climatology", "Oceanography", "Indian Physiography", "Monsoon System", "Resource Distribution", "Mapping"] },
  { id: "society", name: "Indian Society", paper: "GS1", weightage: 45, base: 0.55, topics: ["Salient Features", "Urbanisation", "Globalisation", "Women & Society", "Population", "Communalism"] },
  { id: "polity", name: "Polity & Governance", paper: "GS2", weightage: 92, base: 0.88, topics: ["Constitutional Framework", "Fundamental Rights", "DPSP", "Parliament", "Judiciary", "Federalism", "Local Government", "Constitutional Bodies", "Governance"] },
  { id: "ir", name: "International Relations", paper: "GS2", weightage: 60, base: 0.5, topics: ["India & Neighbours", "Groupings", "Global Institutions", "India-US", "India-China", "Diaspora"] },
  { id: "social-justice", name: "Social Justice", paper: "GS2", weightage: 50, base: 0.52, topics: ["Welfare Schemes", "Health", "Education", "Poverty", "Vulnerable Sections", "SHGs & NGOs"] },
  { id: "economy", name: "Economy", paper: "GS3", weightage: 90, base: 0.66, topics: ["National Income", "Money & Banking", "Fiscal Policy", "Inflation", "External Sector", "Agriculture", "Industry & Infra", "Budget & Survey"] },
  { id: "environment", name: "Environment & Ecology", paper: "GS3", weightage: 82, base: 0.74, topics: ["Ecosystems", "Biodiversity", "Climate Change", "Conservation", "Pollution", "Governance", "Agreements"] },
  { id: "sci-tech", name: "Science & Technology", paper: "GS3", weightage: 55, base: 0.48, topics: ["Space", "Defence Tech", "Biotechnology", "IT & Computers", "Nano & Robotics", "Health Tech"] },
  { id: "security", name: "Internal Security", paper: "GS3", weightage: 40, base: 0.4, topics: ["Security Challenges", "Cyber Security", "Money Laundering", "Border Management", "Left-Wing Extremism", "Security Forces"] },
  { id: "ethics", name: "Ethics (GS4)", paper: "GS4", weightage: 68, base: 0.58, topics: ["Ethics & Human Interface", "Attitude", "Foundational Values", "Emotional Intelligence", "Thinkers", "Public Service Values", "Probity", "Case Studies"] },
  { id: "essay", name: "Essay", paper: "Essay", weightage: 60, base: 0.5, topics: ["Philosophical", "Polity-based", "Economy-based", "Social", "Quote-based", "Structure Practice"] },
  { id: "csat", name: "CSAT", paper: "CSAT", weightage: 50, base: 0.62, topics: ["Comprehension", "Quantitative Aptitude", "Logical Reasoning", "Data Interpretation", "Decision Making"] },
  { id: "psir", name: "PSIR Optional", paper: "Optional", weightage: 88, base: 0.64, topics: ["Political Theory", "Indian Govt & Politics", "Comparative Politics", "IR Theories", "India & World", "Western Thinkers", "Indian Thinkers"] },
  { id: "current-affairs", name: "Current Affairs", paper: "CurrentAffairs", weightage: 96, base: 0.7, topics: ["Daily News", "Editorials", "PIB & PRS", "Govt Schemes", "Reports & Indices", "Yojana & Kurukshetra"] },
];

function statusFromConfidence(c: number): TopicStatus {
  if (c >= 80) return "mastered";
  if (c >= 55) return "revised";
  if (c >= 25) return "learning";
  return "untouched";
}

function buildSubjects(): Subject[] {
  return subjectDefs.map((s) => {
    const topics: Topic[] = s.topics.map((name, i) => {
      const noise = (rand() - 0.5) * 40;
      const conf = Math.max(
        0,
        Math.min(100, Math.round(s.base * 100 + noise - i * 2)),
      );
      return {
        id: `${s.id}-t${i}`,
        name,
        status: statusFromConfidence(conf),
        confidence: conf,
        revisionCount: conf > 50 ? randInt(1, 5) : randInt(0, 1),
        lastTouched: conf > 20 ? agoISO(randInt(1, 80)) : undefined,
      };
    });
    return {
      id: s.id,
      name: s.name,
      paper: s.paper,
      weightage: s.weightage,
      description: undefined,
      topics,
    };
  });
}

/* ── Journal: one year of entries ────────────────────────────── */

function buildJournal(subjects: Subject[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const totalDays = 364;
  const reflections = [
    "Felt the polity concepts finally clicking today. Momentum is everything.",
    "Slow start but answer-writing in the evening salvaged the day.",
    "Distracted by phone in the morning. Tomorrow: airplane mode till noon.",
    "Best deep-work block this week — three hours on Economy without a break.",
    "Tired but showed up. Discipline over motivation.",
    "Revision is where the real exam is won. Did three old GS notes.",
    "Mock score stung a little. Mistakes are data, not verdicts.",
    "Quiet, consistent day. These are the days that compound.",
    "Current affairs felt overwhelming — need a tighter daily system.",
    "Long walk cleared my head. Came back and wrote my best essay yet.",
  ];
  const highlights = [
    "Completed Laxmikanth Ch. 12",
    "Finished monsoon mechanism map",
    "2 full-length essays written",
    "Revised entire Modern History timeline",
    "Solved 60 CSAT questions",
    "PYQ analysis for Economy done",
    "Watched + noted Rajya Sabha TV debate",
    "Made a one-pager on Climate Summits",
  ];

  for (let i = totalDays; i >= 0; i--) {
    const date = addDays(TODAY, -i);
    const dow = date.getDay();
    const progress = (totalDays - i) / totalDays; // 0 -> 1 over time

    // Occasional rest / off days (slightly more later from fatigue mgmt)
    const restProb = 0.1 + (dow === 0 ? 0.12 : 0) + progress * 0.03;
    if (chance(restProb)) continue;

    // Hours ramp from ~4.5 to ~9.5 with weekday/weekend & noise
    const ramp = 4.5 + progress * 4.5;
    const weekendAdj = dow === 0 || dow === 6 ? -0.6 : 0.3;
    let hours = ramp + weekendAdj + (rand() - 0.5) * 2.4;
    hours = Math.max(1.5, Math.min(13, r1(hours)));

    // 2-4 subjects per day
    const n = randInt(2, 4);
    const chosen: Subject[] = [];
    const pool = [...subjects];
    for (let k = 0; k < n && pool.length; k++) {
      const idx = Math.floor(rand() * pool.length);
      chosen.push(pool.splice(idx, 1)[0]);
    }
    let remaining = hours;
    const blocks = chosen.map((s, idx) => {
      const isLast = idx === chosen.length - 1;
      const h = isLast
        ? r1(Math.max(0.5, remaining))
        : r1(Math.max(0.5, remaining * (0.3 + rand() * 0.4)));
      remaining = r1(remaining - h);
      return {
        subjectId: s.id,
        hours: h,
        topics: s.topics.length ? [pick(s.topics).name] : [],
      };
    });
    const totalHours = r1(blocks.reduce((a, b) => a + b.hours, 0));

    const moodBase = 2.5 + (hours / 13) * 2 + (rand() - 0.5);
    const mood = Math.max(1, Math.min(5, Math.round(moodBase)));
    const energy = Math.max(1, Math.min(5, Math.round(moodBase + (rand() - 0.5))));
    const focus = Math.max(1, Math.min(5, Math.round((hours / 13) * 5 + (rand() - 0.5))));

    entries.push({
      id: `j-${iso(date)}`,
      date: iso(date),
      blocks,
      totalHours,
      mood,
      energy,
      focus,
      tasksPlanned: randInt(4, 8),
      tasksDone: randInt(2, 8),
      highlights: chance(0.4) ? pick(highlights) : undefined,
      reflection: chance(0.5) ? pick(reflections) : undefined,
      tags: chance(0.3) ? [pick(["deep-work", "revision", "mocks", "current-affairs", "answer-writing"])] : undefined,
    });
  }
  return entries;
}

/* ── Mock tests with an improving trend ──────────────────────── */

function buildMocks(): MockTest[] {
  const mocks: MockTest[] = [];
  const types: MockType[] = ["Prelims GS", "Prelims CSAT", "Sectional", "Mains GS"];
  const providers = ["Vision IAS", "Insights", "ForumIAS", "Self-Eval"];
  const weakAreas = ["Modern History", "Environment", "Economy", "Polity", "Map-based", "Assertion-Reason"];
  for (let w = 24; w >= 0; w--) {
    const date = agoISO(w * 7 + randInt(0, 3));
    const type = pick(types);
    const trend = (24 - w) / 24; // improves over time
    if (type === "Prelims GS") {
      const max = 200;
      const score = Math.round((78 + trend * 42 + (rand() - 0.5) * 18) * 1) ;
      const correct = Math.round(score / 2 / 1.5);
      mocks.push({ id: `m-${date}-${w}`, date, name: `Prelims FLT #${25 - w}`, type, provider: pick(providers), score, max, attempted: randInt(85, 98), correct, wrong: randInt(20, 40), notes: undefined, weakAreas: chance(0.6) ? [pick(weakAreas), pick(weakAreas)] : undefined });
    } else if (type === "Prelims CSAT") {
      const max = 200;
      const score = Math.round(120 + trend * 50 + (rand() - 0.5) * 20);
      mocks.push({ id: `m-${date}-${w}`, date, name: `CSAT Practice #${25 - w}`, type, provider: pick(providers), score, max, attempted: randInt(60, 80), correct: randInt(45, 70), wrong: randInt(8, 20) });
    } else if (type === "Sectional") {
      const max = 50;
      const score = Math.round(24 + trend * 18 + (rand() - 0.5) * 8);
      mocks.push({ id: `m-${date}-${w}`, date, name: `${pick(weakAreas)} Sectional`, type, provider: pick(providers), score, max, attempted: randInt(20, 25), correct: randInt(14, 24), wrong: randInt(2, 9) });
    } else {
      const max = 250;
      const score = Math.round(95 + trend * 45 + (rand() - 0.5) * 20);
      mocks.push({ id: `m-${date}-${w}`, date, name: `Mains GS-${randInt(1, 4)} Test`, type, provider: pick(providers), score, max, notes: "Evaluated; intro-conclusion need work." });
    }
  }
  return mocks;
}

function buildRevisions(): RevisionItem[] {
  const items: { subjectId: string; topic: string }[] = [
    { subjectId: "polity", topic: "Amendment Process & Basic Structure" },
    { subjectId: "modern-history", topic: "Gandhian Mass Movements" },
    { subjectId: "economy", topic: "Monetary Policy Tools" },
    { subjectId: "environment", topic: "International Climate Agreements" },
    { subjectId: "geography", topic: "Indian Monsoon Mechanism" },
    { subjectId: "ethics", topic: "Foundational Values & Thinkers" },
    { subjectId: "ir", topic: "India's Neighbourhood First Policy" },
    { subjectId: "art-culture", topic: "Temple Architecture Styles" },
    { subjectId: "sci-tech", topic: "Recent Space Missions" },
    { subjectId: "psir", topic: "Western Political Thinkers" },
    { subjectId: "economy", topic: "External Sector & BoP" },
    { subjectId: "polity", topic: "Constitutional Bodies" },
  ];
  const intervals = [1, 3, 7, 14, 30];
  return items.map((it, i) => {
    const reps = randInt(0, 4);
    const intervalDays = intervals[Math.min(reps, intervals.length - 1)];
    const lastN = randInt(0, intervalDays + 4);
    const due = lastN >= intervalDays;
    return {
      id: `rev-${i}`,
      subjectId: it.subjectId,
      topic: it.topic,
      addedOn: agoISO(randInt(40, 120)),
      lastRevised: agoISO(lastN),
      nextDue: due ? agoISO(randInt(0, 3)) : aheadISO(intervalDays - lastN),
      intervalDays,
      repetitions: reps,
      confidence: randInt(2, 5),
    };
  });
}

function buildCurrentAffairs(): CurrentAffair[] {
  const items: { title: string; cat: CACategory; tags: string[]; subj?: string; summary: string }[] = [
    { title: "RBI holds repo rate, shifts stance to neutral", cat: "Economy", tags: ["RBI", "Monetary Policy", "Inflation"], subj: "economy", summary: "MPC keeps repo unchanged citing balanced inflation-growth dynamics; stance moved to neutral signalling room for future cuts." },
    { title: "Supreme Court verdict on electoral bonds", cat: "Polity", tags: ["Judiciary", "Elections", "Transparency"], subj: "polity", summary: "Court strikes down the scheme citing voters' right to information under Article 19(1)(a)." },
    { title: "India hosts Global Biofuels Alliance summit", cat: "International", tags: ["Energy", "Diplomacy", "G20"], subj: "ir", summary: "Alliance aims to accelerate sustainable biofuels deployment and standardisation across member nations." },
    { title: "New tiger reserve notified in Western Ghats", cat: "Environment", tags: ["Conservation", "Biodiversity", "Tiger"], subj: "environment", summary: "Adds to Project Tiger network; strengthens a critical wildlife corridor." },
    { title: "ISRO tests reusable launch vehicle landing", cat: "Science & Tech", tags: ["ISRO", "Space"], subj: "sci-tech", summary: "Autonomous landing experiment validates approach and landing for future reusable launchers." },
    { title: "Cabinet approves expansion of PM-eBus Sewa", cat: "Schemes", tags: ["Urban", "Transport", "EV"], subj: "social-justice", summary: "Scheme to deploy electric buses across cities under a public-private model." },
    { title: "Economic Survey flags need for skilling", cat: "Reports & Indices", tags: ["Survey", "Employment"], subj: "economy", summary: "Highlights demographic dividend window and the imperative to scale vocational skilling." },
    { title: "India-EU push for trade agreement", cat: "International", tags: ["Trade", "EU", "FTA"], subj: "ir", summary: "Negotiations target market access, data and sustainability chapters." },
    { title: "New Coastal Regulation Zone norms", cat: "Environment", tags: ["Coastal", "Regulation"], subj: "environment", summary: "Revised CRZ rules balance livelihoods of fishing communities with ecological safeguards." },
    { title: "Parliamentary panel on data privacy", cat: "Polity", tags: ["Data", "Privacy", "Governance"], subj: "polity", summary: "Committee reviews implementation of the personal data protection framework." },
  ];
  const sources = ["The Hindu", "Indian Express", "PIB", "PRS", "Down To Earth"];
  return items.map((it, i) => ({
    id: `ca-${i}`,
    date: agoISO(randInt(0, 45)),
    title: it.title,
    source: pick(sources),
    category: it.cat,
    tags: it.tags,
    summary: it.summary,
    prelimsRelevant: chance(0.8),
    mainsRelevant: chance(0.7),
    linkedSubjectId: it.subj,
    bookmarked: chance(0.35),
  }));
}

function buildMistakes(): Mistake[] {
  const data: { subj: string; topic: string; type: Mistake["type"]; desc: string; corr: string }[] = [
    { subj: "polity", topic: "Anti-Defection Law", type: "Conceptual", desc: "Confused the role of the Speaker vs Governor in disqualification.", corr: "Speaker/Chairman decides under 10th Schedule; subject to judicial review." },
    { subj: "environment", topic: "Wetlands", type: "Factual", desc: "Misremembered the number of Ramsar sites in India.", corr: "Track the latest count from PIB; revise list of recent additions." },
    { subj: "economy", topic: "Inflation Indices", type: "Conceptual", desc: "Mixed up WPI base year and CPI components.", corr: "WPI base 2011-12; CPI weights differ for rural/urban." },
    { subj: "csat", topic: "Time-Speed-Distance", type: "Silly", desc: "Calculation slip under time pressure.", corr: "Re-check unit conversions; mark and return." },
    { subj: "modern-history", topic: "Congress Sessions", type: "Factual", desc: "Wrong president-session pairing.", corr: "Make a one-page chronological table; revise weekly." },
    { subj: "geography", topic: "Ocean Currents", type: "Misreading", desc: "Read 'warm' as 'cold' current in the question.", corr: "Underline qualifiers while reading the stem." },
    { subj: "polity", topic: "Emergency Provisions", type: "Conceptual", desc: "Article 352 vs 356 grounds confused.", corr: "352 — war/armed rebellion; 356 — failure of constitutional machinery." },
    { subj: "economy", topic: "Banking", type: "Time Management", desc: "Spent too long on a single data-heavy question.", corr: "60-second rule: skip and flag." },
  ];
  return data.map((d, i) => ({
    id: `mis-${i}`,
    date: agoISO(randInt(2, 60)),
    subjectId: d.subj,
    topic: d.topic,
    type: d.type,
    description: d.desc,
    correction: d.corr,
    status: pick<Mistake["status"]>(["Open", "Reviewing", "Resolved", "Resolved"]),
    source: pick(["Prelims FLT", "Sectional", "Daily Quiz", "Revision"]),
  }));
}

function buildHabits(): Habit[] {
  const defs = [
    { id: "wake", name: "Wake up by 5:30 AM", cadence: "daily" as const, icon: "sunrise" },
    { id: "news", name: "Read the newspaper", cadence: "daily" as const, icon: "newspaper" },
    { id: "answer", name: "Answer writing", cadence: "daily" as const, icon: "pen" },
    { id: "revise", name: "Revise old notes", cadence: "daily" as const, icon: "repeat" },
    { id: "nosocial", name: "No social media", cadence: "daily" as const, icon: "shield" },
    { id: "meditate", name: "Meditate 10 min", cadence: "daily" as const, icon: "lotus" },
  ];
  return defs.map((d) => {
    const log: Record<string, boolean> = {};
    for (let i = 0; i < 75; i++) {
      const key = agoISO(i);
      // higher adherence for core habits
      const p = d.id === "nosocial" ? 0.62 : d.id === "wake" ? 0.7 : 0.78;
      log[key] = chance(p);
    }
    return {
      id: d.id,
      name: d.name,
      cadence: d.cadence,
      icon: d.icon,
      createdOn: agoISO(90),
      targetPerWeek: 7,
      log,
    };
  });
}

function buildSleep(): SleepLog[] {
  const logs: SleepLog[] = [];
  for (let i = 0; i < 60; i++) {
    const hours = r1(Math.max(4.5, Math.min(9, 6.6 + (rand() - 0.5) * 2.2)));
    logs.push({
      id: `sl-${i}`,
      date: agoISO(i),
      hours,
      quality: Math.max(1, Math.min(5, Math.round((hours / 9) * 5 + (rand() - 0.5)))),
      bedtime: pick(["23:10", "23:40", "00:05", "22:50", "00:30"]),
      wakeup: pick(["05:30", "05:50", "06:15", "05:20", "06:40"]),
    });
  }
  return logs;
}

function buildExercise(): ExerciseLog[] {
  const logs: ExerciseLog[] = [];
  const types: ExerciseLog["type"][] = ["Run", "Walk", "Yoga", "Gym", "Cycling"];
  for (let i = 0; i < 60; i++) {
    if (!chance(0.45)) continue;
    logs.push({
      id: `ex-${i}`,
      date: agoISO(i),
      type: pick(types),
      minutes: randInt(20, 65),
      intensity: randInt(2, 5),
    });
  }
  return logs;
}

function buildGoals(): Goal[] {
  return [
    { id: "g1", title: "Finish Polity full syllabus + 3 revisions", horizon: "Quarterly", metricLabel: "Topics revised", target: 9, current: 7, unit: "topics", deadline: aheadISO(70), status: "Active", createdOn: agoISO(60), linkedSubjectId: "polity" },
    { id: "g2", title: "Score 120+ in next Prelims FLT", horizon: "Monthly", metricLabel: "Score", target: 120, current: 112, unit: "marks", deadline: aheadISO(20), status: "Active", createdOn: agoISO(25) },
    { id: "g3", title: "Write 2 essays every week", horizon: "Weekly", metricLabel: "Essays", target: 2, current: 1, unit: "essays", deadline: aheadISO(4), status: "Active", createdOn: agoISO(7), linkedSubjectId: "essay" },
    { id: "g4", title: "Daily 9 hours of focused study", horizon: "Daily", metricLabel: "Hours", target: 9, current: 8, unit: "hrs", status: "Active", createdOn: agoISO(2) },
    { id: "g5", title: "Complete PSIR Paper 1 notes", horizon: "Monthly", metricLabel: "Sections", target: 7, current: 7, unit: "sections", deadline: agoISO(8), status: "Completed", createdOn: agoISO(45), linkedSubjectId: "psir" },
    { id: "g6", title: "Build a current-affairs revision system", horizon: "Quarterly", metricLabel: "Monthly compilations", target: 3, current: 2, unit: "months", deadline: aheadISO(40), status: "Active", createdOn: agoISO(50) },
    { id: "g7", title: "Reach final selection — CSE 2027", horizon: "Long-term", metricLabel: "Journey", deadline: aheadISO(345), status: "Active", createdOn: agoISO(560) },
    { id: "g8", title: "Maintain a 30-day study streak", horizon: "Monthly", metricLabel: "Days", target: 30, current: 18, unit: "days", deadline: aheadISO(12), status: "Active", createdOn: agoISO(18) },
  ];
}

function buildBooks(): Book[] {
  const defs: Omit<Book, "id" | "currentPage" | "status">[] = [
    { title: "Indian Polity", author: "M. Laxmikanth", subjectId: "polity", paper: "GS2", totalPages: 900, isStandard: true, rating: 5, startedOn: agoISO(400) },
    { title: "Indian Economy", author: "Ramesh Singh", subjectId: "economy", paper: "GS3", totalPages: 760, isStandard: true, rating: 4, startedOn: agoISO(300) },
    { title: "Certificate Physical & Human Geography", author: "G.C. Leong", subjectId: "geography", paper: "GS1", totalPages: 430, isStandard: true, rating: 5, startedOn: agoISO(380) },
    { title: "India's Struggle for Independence", author: "Bipan Chandra", subjectId: "modern-history", paper: "GS1", totalPages: 600, isStandard: true, rating: 5, startedOn: agoISO(420) },
    { title: "Environment", author: "Shankar IAS", subjectId: "environment", paper: "GS3", totalPages: 410, isStandard: true, rating: 4, startedOn: agoISO(250) },
    { title: "Ethics, Integrity & Aptitude", author: "Lexicon", subjectId: "ethics", paper: "GS4", totalPages: 520, isStandard: true, rating: 3, startedOn: agoISO(120) },
    { title: "Introduction to the Constitution", author: "D.D. Basu", subjectId: "polity", paper: "GS2", totalPages: 480, isStandard: true, rating: 4 },
    { title: "Contemporary Essays", author: "Ramesh Singh", subjectId: "essay", paper: "Essay", totalPages: 320, rating: 3, startedOn: agoISO(60) },
    { title: "An Introduction to Political Theory", author: "O.P. Gauba", subjectId: "psir", paper: "Optional", totalPages: 540, isStandard: true, rating: 4, startedOn: agoISO(200) },
    { title: "India After Gandhi", author: "Ramachandra Guha", subjectId: "modern-history", paper: "GS1", totalPages: 890, rating: 5, startedOn: agoISO(150) },
  ];
  return defs.map((b, i) => {
    const ratio = rand();
    const completed = ratio > 0.7;
    const currentPage = completed ? b.totalPages : Math.round(b.totalPages * (0.2 + rand() * 0.6));
    return {
      ...b,
      id: `book-${i}`,
      currentPage,
      status: completed ? "Completed" : currentPage > 0 ? "Reading" : "To Read",
      finishedOn: completed ? agoISO(randInt(5, 90)) : undefined,
    };
  });
}

function buildMilestones(): Milestone[] {
  return [
    { id: "ms1", date: agoISO(560), title: "Began the journey", type: "Start", description: "Quit the comfort of routine, committed to civil services. Day Zero.", pinned: true },
    { id: "ms2", date: agoISO(500), title: "Finished NCERTs (6-12)", type: "Phase", description: "Built the foundation across History, Geography, Polity and Economy." },
    { id: "ms3", date: agoISO(430), title: "Chose PSIR as optional", type: "Achievement", description: "After much deliberation, locked Political Science & IR." },
    { id: "ms4", date: agoISO(360), title: "First full-length mock", type: "Exam", description: "Scored 78/200. Humbling, but a baseline to beat." },
    { id: "ms5", date: agoISO(300), title: "Prelims 2025 — not cleared", type: "Setback", description: "Missed the cutoff by 4 marks. Regrouped after a week off." },
    { id: "ms6", date: agoISO(210), title: "Crossed 100 in mocks", type: "Achievement", description: "Consistency in revision started showing on the scoreboard." },
    { id: "ms7", date: agoISO(120), title: "Completed first answer-writing cycle", type: "Phase", description: "60 days of daily answer writing for Mains." },
    { id: "ms8", date: agoISO(30), title: "Best mock yet — 138/200", type: "Achievement", description: "Everything clicked. Proof the system works." },
    { id: "ms9", date: aheadISO(345), title: "UPSC CSE 2027 Prelims", type: "Exam", description: "The next checkpoint.", pinned: true },
  ];
}

function buildReflections(): Reflection[] {
  const prompts = [
    "What did today teach me about myself?",
    "What am I avoiding, and why?",
    "Where did I feel most alive in my studies today?",
    "What would I tell a friend who had my day?",
    "What is one thing I'm grateful for right now?",
  ];
  const contents = [
    "There's a quiet kind of courage in sitting with a hard chapter until it yields. Today I found some of it.",
    "I keep measuring myself against an imaginary topper. The only fair comparison is who I was last month.",
    "Fear of the result is louder on low-energy days. Naming it helped me return to the desk.",
    "Selection is not a finish line, it's a door. I want to walk through it as someone I respect.",
    "Slow is smooth, smooth is fast. I'm learning to trust the process even when the scoreboard is quiet.",
    "Today I forgave myself for yesterday. That, too, is preparation.",
  ];
  return Array.from({ length: 9 }).map((_, i) => ({
    id: `ref-${i}`,
    date: agoISO(i * 6 + randInt(0, 3)),
    prompt: pick(prompts),
    content: pick(contents),
    mood: randInt(2, 5),
    gratitude: chance(0.5) ? [pick(["Family's support", "A quiet library", "Good health", "A clear morning", "Encouraging mentor"]), pick(["A small win", "Rain outside", "Hot chai", "A kind message"])] : undefined,
  }));
}

function buildReviews(): Review[] {
  return [
    { id: "rv-w1", type: "Weekly", periodLabel: "This week", startDate: agoISO(6), endDate: agoISO(0), totalHours: 54, mocksTaken: 1, rating: 4, wins: ["Crossed 50 study hours", "Finished Economy external sector"], struggles: ["Sleep slipped past midnight twice"], lessons: ["Front-load the hardest subject"], nextFocus: ["Environment revision", "2 essays"] },
    { id: "rv-w2", type: "Weekly", periodLabel: "Last week", startDate: agoISO(13), endDate: agoISO(7), totalHours: 48, mocksTaken: 2, rating: 3, wins: ["Two sectionals attempted"], struggles: ["Current affairs backlog grew"], lessons: ["A daily 30-min CA slot is non-negotiable"], nextFocus: ["Clear CA backlog"] },
    { id: "rv-m1", type: "Monthly", periodLabel: "This month", startDate: agoISO(29), endDate: agoISO(0), totalHours: 212, mocksTaken: 5, rating: 4, wins: ["Best mock score yet (138)", "Completed PSIR Paper 1 notes"], struggles: ["Health dipped mid-month"], lessons: ["Protect the morning block"], nextFocus: ["Start Mains answer writing cycle 2"] },
    { id: "rv-y1", type: "Yearly", periodLabel: "Past 12 months", startDate: agoISO(364), endDate: agoISO(0), totalHours: 2480, mocksTaken: 25, rating: 4, wins: ["Built an unshakeable daily system", "Optional notes complete", "Mock average up 60%"], struggles: ["One failed prelims attempt", "Burnout in month 7"], lessons: ["Rest is part of the plan", "Revision > new material"], nextFocus: ["Peak for CSE 2027", "Mains-first strategy"] },
  ];
}

function buildGraph(subjects: Subject[]): KnowledgeGraph {
  const nodes: GraphNode[] = subjects.map((s) => {
    const conf = Math.round(
      s.topics.reduce((a, t) => a + t.confidence, 0) / Math.max(1, s.topics.length),
    );
    return { id: s.id, label: s.name, type: "subject" as const, subjectId: s.id, strength: conf };
  });
  // a few cross-cutting concept/event nodes
  const concepts = [
    { id: "c-federalism", label: "Federalism", subj: "polity" },
    { id: "c-climate", label: "Climate Change", subj: "environment" },
    { id: "c-inflation", label: "Inflation", subj: "economy" },
    { id: "c-g20", label: "G20", subj: "ir" },
    { id: "c-ethics-case", label: "Case Studies", subj: "ethics" },
  ];
  concepts.forEach((c) =>
    nodes.push({ id: c.id, label: c.label, type: "concept" as const, subjectId: c.subj, strength: randInt(40, 90) }),
  );

  const edges = [
    { s: "polity", t: "c-federalism" },
    { s: "polity", t: "ir" },
    { s: "economy", t: "c-inflation" },
    { s: "economy", t: "environment" },
    { s: "environment", t: "c-climate" },
    { s: "ir", t: "c-g20" },
    { s: "ir", t: "economy" },
    { s: "ethics", t: "c-ethics-case" },
    { s: "modern-history", t: "polity" },
    { s: "geography", t: "environment" },
    { s: "society", t: "social-justice" },
    { s: "current-affairs", t: "economy" },
    { s: "current-affairs", t: "ir" },
    { s: "current-affairs", t: "environment" },
    { s: "psir", t: "ir" },
    { s: "psir", t: "polity" },
  ].map((e, i) => ({ id: `e-${i}`, source: e.s, target: e.t }));

  return { nodes, edges };
}

function buildSelection(): SelectionStage[] {
  return [
    { id: "s1", name: "Prelims", attempt: "CSE 2025", status: "Not Cleared", date: agoISO(300), score: "88 / 200", notes: "Missed cutoff by ~4 marks. The fire that started it all." },
    { id: "s2", name: "Prelims", attempt: "CSE 2026", status: "Cleared", date: agoISO(40), score: "121 / 200", notes: "Crossed the line with margin. Onward to Mains." },
    { id: "s3", name: "Mains", attempt: "CSE 2026", status: "Awaiting Result", date: agoISO(8), score: "—", notes: "Wrote all 9 papers. Essay went well; GS-3 was tight." },
    { id: "s4", name: "Interview", attempt: "CSE 2026", status: "Locked", notes: "The final 275 marks. DAF preparation underway." },
    { id: "s5", name: "Final Result", attempt: "CSE 2026", status: "Locked", notes: "The name in the list." },
  ];
}

/* ── Assemble ────────────────────────────────────────────────── */

export function createSeedData(): ChronicleData {
  const subjects = buildSubjects();
  return {
    profile: {
      name: "Aarav Sharma",
      tagline: "Attempt II · The arena, not the stands.",
      targetExam: "UPSC CSE 2027",
      examDate: aheadISO(345),
      attemptNumber: 2,
      optionalSubject: "Political Science & IR",
      startDate: agoISO(560),
      dailyHourTarget: 9,
    },
    subjects,
    journal: buildJournal(subjects),
    mocks: buildMocks(),
    revisions: buildRevisions(),
    currentAffairs: buildCurrentAffairs(),
    mistakes: buildMistakes(),
    habits: buildHabits(),
    sleep: buildSleep(),
    exercise: buildExercise(),
    goals: buildGoals(),
    books: buildBooks(),
    milestones: buildMilestones(),
    reflections: buildReflections(),
    reviews: buildReviews(),
    graph: buildGraph(subjects),
    selection: buildSelection(),
  };
}
