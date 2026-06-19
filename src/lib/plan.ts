/* ════════════════════════════════════════════════════════════════
   THE ROADMAP — a subject-wise micro-plan for CSE 2027
   ────────────────────────────────────────────────────────────────
   A static, typed study plan that turns "do or die" into a concrete,
   week-by-week path from foundation → prelims → mains. It is pure
   reference data (it never mutates the synced Chronicle), so the
   Roadmap page always renders the same plan regardless of logged
   progress. Progress against it is tracked organically through the
   Journal, Goals, Books, Subjects and Revision features.

   Order of attack (the candidate's chosen sequence):
        GS2  →  GS3  →  GS1  →  GS4 ,  Sociology running alongside.

   Hours ramp honestly from the current ~6h pace toward 10h, instead
   of pretending day one is a 10-hour day.

   Pure data + small date helpers only. No React, no store.
   ════════════════════════════════════════════════════════════════ */

import type { ISODate } from "./types";
import { fromISODate, toISODate, daysBetween } from "./utils";

/* ── The anchor: Monday of the week prep "properly" began ─────── */
/** Week 1 begins here. Today (mid-Jun 2026) falls inside week 1. */
export const PLAN_START: ISODate = "2026-06-15";

/** Estimated exam windows — exact dates arrive with the Feb-2027 notification. */
export const PRELIMS_DATE: ISODate = "2027-05-24";
export const MAINS_DATE: ISODate = "2027-09-17";

/* ════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════ */

export type PhaseId = "foundation" | "completion" | "prelims" | "mains" | "interview";

export interface PlanTask {
  /** The subject/track this task belongs to, e.g. "GS2 · Polity". */
  track: string;
  /** What to actually do this week. */
  label: string;
  /** Optional source / chapter / page hint. */
  detail?: string;
}

export interface PlanWeek {
  week: number; // 1-indexed, global from PLAN_START
  startDate: ISODate;
  endDate: ISODate;
  phaseId: PhaseId;
  /** Headline subject focus for the week, e.g. "GS2 · Polity". */
  primary: string;
  /** Daily hours target for the week (the honest ramp). */
  hoursTarget: number;
  /** One-line theme for the week. */
  focus: string;
  tasks: PlanTask[];
  /** Sociology optional note running alongside GS. */
  optional?: string;
  /** A checkpoint reached at the end of this week. */
  milestone?: string;
}

export interface PhaseBlock {
  label: string;
  points: string[];
}

export interface PlanPhase {
  id: PhaseId;
  name: string;
  subtitle: string;
  startDate: ISODate;
  endDate: ISODate;
  mission: string;
  /** Month-level objectives (used for phases without weekly granularity). */
  blocks: PhaseBlock[];
}

export interface SourceItem {
  paper: string;
  subject: string;
  source: string;
  note?: string;
}

/* ════════════════════════════════════════════════════════════════
   Phases
   ════════════════════════════════════════════════════════════════ */

export const phases: PlanPhase[] = [
  {
    id: "foundation",
    name: "Foundation & Notes",
    subtitle: "GS2 + GS3 · own your notes",
    startDate: "2026-06-15",
    endDate: "2026-09-27",
    mission:
      "Cover GS2 then GS3 with your OWN revisable notes, lock the daily newspaper habit, and start Sociology.",
    blocks: [
      {
        label: "GS2 — Polity & Governance (Jun–Jul)",
        points: [
          "Second, note-making read of Laxmikanth (first read ≠ owned).",
          "Governance, IR & Social Justice built from notes + current affairs.",
          "Newspaper habit locked from week 1 (one paper, 60–75 min).",
        ],
      },
      {
        label: "GS3 — Economy & Environment (Aug–Sep)",
        points: [
          "Economy via Mrunal/NCERT + Ramesh Singh; Environment via Shankar IAS.",
          "Science & Tech + Internal Security from notes + current affairs.",
          "Begin light answer writing (1 GS answer/day).",
        ],
      },
      {
        label: "Sociology optional (from 20 Jul)",
        points: [
          "Coaching starts — revise + note EACH class within 48 hours.",
          "Paper 1 thinkers and theory built airtight as you go.",
        ],
      },
    ],
  },
  {
    id: "completion",
    name: "Completion & Answer Writing",
    subtitle: "GS1 + GS4 · syllabus covered by Dec",
    startDate: "2026-09-28",
    endDate: "2026-12-27",
    mission:
      "Finish GS1 and GS4, complete Sociology Paper 1, and make daily answer writing a habit. By 31 Dec: every subject has YOUR notes.",
    blocks: [
      {
        label: "GS1 — History, Geography, Art & Culture, Society (Oct–Nov)",
        points: [
          "Modern History (Spectrum), Geography (NCERT + GC Leong).",
          "Art & Culture (Nitin Singhania), Indian Society (NCERT + CA).",
        ],
      },
      {
        label: "GS4 — Ethics (Dec)",
        points: [
          "Lexicon / G. Subba Rao + a personal case-study bank.",
          "Ethics rewards practice — write case studies weekly.",
        ],
      },
      {
        label: "Milestone — 31 Dec 2026",
        points: [
          "Static GS syllabus covered once with notes.",
          "Sociology Paper 1 done. Answer writing underway.",
        ],
      },
    ],
  },
  {
    id: "prelims",
    name: "Prelims Grind",
    subtitle: "Jan – late May 2027 · clear the gate",
    startDate: "2026-12-28",
    endDate: "2027-05-24",
    mission:
      "Pivot HARD to Prelims: revise notes 2–3×, full-length test series, CSAT, and 12+ months of current affairs consolidated. Nothing else matters here.",
    blocks: [
      {
        label: "Revision cycles",
        points: [
          "Revise the full static notes 2–3 times across this window.",
          "Revision beats new material this close to the exam.",
        ],
      },
      {
        label: "Test series & PYQs",
        points: [
          "30–40 full-length Prelims mocks; analyse every one in the Mistake Tracker.",
          "Solve & topic-map the last 10 years of Prelims PYQs.",
        ],
      },
      {
        label: "CSAT — do NOT ignore",
        points: [
          "3–4 hrs/week from January; clear 33% (~66/200) comfortably.",
          "10 years of CSAT PYQs; fix weak areas early.",
        ],
      },
      {
        label: "Current affairs",
        points: [
          "Consolidate 12–14 months via one monthly compilation + a prelims CA booklet.",
        ],
      },
    ],
  },
  {
    id: "mains",
    name: "Mains Intensive",
    subtitle: "Jun – Sep 2027 · ~100 days of writing",
    startDate: "2027-05-25",
    endDate: "2027-09-17",
    mission:
      "Start the day after Prelims (don't wait for results). 70% answer writing, 30% revision. Optional + essay can decide the rank.",
    blocks: [
      {
        label: "Answer writing daily",
        points: [
          "GS1–GS4 answer writing every day; get scripts evaluated.",
          "Build intros, conclusions, diagrams, value-additions.",
        ],
      },
      {
        label: "Optional (Sociology)",
        points: [
          "Full Paper 1 + Paper 2 revision; link Paper 2 to current affairs.",
          "Thinker quotes, diagrams and current examples bank.",
        ],
      },
      {
        label: "Essay + test series",
        points: [
          "One full essay per week.",
          "Full-length Mains GS + optional + essay test series.",
        ],
      },
    ],
  },
  {
    id: "interview",
    name: "Interview & Personality",
    subtitle: "Late 2027 / early 2028",
    startDate: "2027-12-01",
    endDate: "2028-02-28",
    mission:
      "DAF-based preparation, mock interviews, and a calm, honest personality. The final 275 marks.",
    blocks: [
      {
        label: "DAF & mocks",
        points: [
          "Deep DAF preparation; current affairs of the interview window.",
          "Multiple mock interviews; work on clarity and composure.",
        ],
      },
    ],
  },
];

/* ════════════════════════════════════════════════════════════════
   Weekly micro-plan (foundation + completion: weeks 1–28)
   Dates are computed from PLAN_START so they can never drift.
   ════════════════════════════════════════════════════════════════ */

type WeekSeed = Omit<PlanWeek, "week" | "startDate" | "endDate">;

const SOCIO_INTRO =
  "Sociology coaching begins 20 Jul — from here, revise + note each class within 48h.";

const weekSeeds: WeekSeed[] = [
  /* ── GS2 · Polity & Governance (weeks 1–7) ── */
  {
    phaseId: "foundation",
    primary: "GS2 · Polity",
    hoursTarget: 6,
    focus: "Constitutional framework — and lock the newspaper habit.",
    tasks: [
      { track: "GS2 · Polity", label: "Laxmikanth 2nd read + notes: Historical background, Making of the Constitution, Salient Features, Preamble", detail: "Laxmikanth Ch 1–5" },
      { track: "Habit", label: "Start the daily newspaper (one paper, 60–75 min) + same-day CA note", detail: "The Hindu or Indian Express" },
      { track: "System", label: "Set up your digital note system (folders by GS paper → subject)" },
    ],
  },
  {
    phaseId: "foundation",
    primary: "GS2 · Polity",
    hoursTarget: 6,
    focus: "Rights, duties and the directive principles.",
    tasks: [
      { track: "GS2 · Polity", label: "Notes: Union & its Territory, Citizenship, Fundamental Rights, DPSP, Fundamental Duties", detail: "Laxmikanth Ch 6–11" },
      { track: "Revision", label: "Active recall of week 1 before starting (close book, write from memory)" },
      { track: "CA", label: "Daily newspaper + CA note appended under the relevant Polity topic" },
    ],
  },
  {
    phaseId: "foundation",
    primary: "GS2 · Polity",
    hoursTarget: 7,
    focus: "Amendments, federalism and the basic structure.",
    tasks: [
      { track: "GS2 · Polity", label: "Notes: Amendment & Basic Structure, Parliamentary & Federal systems, Centre–State & Inter-State relations", detail: "Laxmikanth Ch 12–16" },
      { track: "PYQ", label: "Read last 5 years of Polity prelims PYQs to see what's actually asked" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
  },
  {
    phaseId: "foundation",
    primary: "GS2 · Polity",
    hoursTarget: 7,
    focus: "The Union executive and Parliament.",
    tasks: [
      { track: "GS2 · Polity", label: "Notes: President, Vice-President, PM & Council of Ministers, Attorney General, Parliament", detail: "Laxmikanth Ch 17–22" },
      { track: "Revision", label: "Weekly revision: redraw the Union government structure from memory" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
  },
  {
    phaseId: "foundation",
    primary: "GS2 · Polity",
    hoursTarget: 7,
    focus: "Judiciary and the state government.",
    tasks: [
      { track: "GS2 · Polity", label: "Notes: Supreme Court, High Courts, subordinate courts; Governor, CM & State legislature", detail: "Laxmikanth Ch 23–30" },
      { track: "CA", label: "Daily newspaper + CA note (track key SC judgments)" },
    ],
  },
  {
    phaseId: "foundation",
    primary: "GS2 · Polity + Sociology start",
    hoursTarget: 7,
    focus: "Local government, constitutional bodies — Sociology begins.",
    tasks: [
      { track: "GS2 · Polity", label: "Notes: Panchayati Raj, Municipalities, UTs, Constitutional bodies (EC, UPSC, CAG, Finance Commission)", detail: "Laxmikanth Ch 31–40" },
      { track: "Optional · Sociology", label: "Coaching starts (20 Jul): attend + revise + note each class within 48 hours" },
    ],
    optional: SOCIO_INTRO,
    milestone: "Laxmikanth fully re-read with your own notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS2 · Governance / IR / Social Justice",
    hoursTarget: 7,
    focus: "Close out GS2 — the current-affairs-heavy parts.",
    tasks: [
      { track: "GS2 · Polity", label: "Notes: Non-constitutional bodies, NITI Aayog, rights & governance basics" },
      { track: "GS2 · IR", label: "IR overview: India & neighbours, groupings, global institutions (notes + CA-driven)" },
      { track: "GS2 · Social Justice", label: "Welfare schemes, health, education, vulnerable sections (map each scheme → ministry)" },
      { track: "Consolidate", label: "GS2 PYQ analysis + first GS2 mains answers (2–3)" },
    ],
    optional: "Sociology: thinkers begin (Comte, Spencer) — note in your words.",
    milestone: "GS2 covered end-to-end with notes.",
  },

  /* ── GS3 · Economy & Environment (weeks 8–15) ── */
  {
    phaseId: "foundation",
    primary: "GS3 · Economy",
    hoursTarget: 8,
    focus: "Economy foundations — start answer writing.",
    tasks: [
      { track: "GS3 · Economy", label: "National income, growth vs development, basic concepts", detail: "Mrunal lectures / NCERT + Ramesh Singh" },
      { track: "Answer Writing", label: "Begin 1 GS answer/day (rough is fine — the habit matters)" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: Durkheim (social facts, division of labour) — notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Economy",
    hoursTarget: 8,
    focus: "Money, banking and monetary policy.",
    tasks: [
      { track: "GS3 · Economy", label: "Money & banking, RBI, monetary policy tools, financial markets", detail: "Ramesh Singh + Mrunal" },
      { track: "Revision", label: "Revise GS2 Polity notes (cycle 1) — keep it warm" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: Weber (verstehen, authority, bureaucracy) — notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Economy",
    hoursTarget: 8,
    focus: "Public finance — budget and taxation.",
    tasks: [
      { track: "GS3 · Economy", label: "Fiscal policy, Budget, taxation (direct/indirect, GST), public finance", detail: "Ramesh Singh + Budget highlights" },
      { track: "Answer Writing", label: "1 GS answer/day" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: Marx (class, alienation) — notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Economy",
    hoursTarget: 8,
    focus: "Inflation and the external sector.",
    tasks: [
      { track: "GS3 · Economy", label: "Inflation & indices, external sector, BoP, trade, exchange rate", detail: "Ramesh Singh + Mrunal" },
      { track: "Revision", label: "Weekly revision + monthly self-test on Economy so far" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: Parsons & Merton (functionalism) — notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Economy",
    hoursTarget: 8,
    focus: "The real economy — agriculture and industry.",
    tasks: [
      { track: "GS3 · Economy", label: "Agriculture, food security, subsidies, MSP; industry, infrastructure, investment models" },
      { track: "Consolidate", label: "Economy PYQ analysis + 3 mains answers" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: stratification & mobility — notes.",
    milestone: "Economy covered with notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Environment",
    hoursTarget: 8,
    focus: "Ecology and biodiversity.",
    tasks: [
      { track: "GS3 · Environment", label: "Ecology, ecosystems, biodiversity, food chains/webs", detail: "Shankar IAS Environment" },
      { track: "Revision", label: "Revise GS3 Economy notes (cycle 1)" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: research methods & techniques — notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Environment",
    hoursTarget: 8,
    focus: "Climate, conservation and agreements.",
    tasks: [
      { track: "GS3 · Environment", label: "Climate change, conservation, pollution, environmental agreements & institutions", detail: "Shankar IAS + CA" },
      { track: "Answer Writing", label: "1 GS answer/day" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: power, politics & social movements (Paper 1) — notes.",
  },
  {
    phaseId: "foundation",
    primary: "GS3 · Sci-Tech & Security",
    hoursTarget: 8,
    focus: "Close out GS3.",
    tasks: [
      { track: "GS3 · Sci & Tech", label: "Space, defence tech, biotech, IT — notes from CA + standard sources" },
      { track: "GS3 · Security", label: "Internal security overview: challenges, cyber, border, LWE (notes + CA)" },
      { track: "Consolidate", label: "GS3 PYQ analysis + consolidate the full paper" },
    ],
    optional: "Sociology: Paper 1 thinkers revision (Comte → Merton).",
    milestone: "GS3 covered end-to-end with notes.",
  },

  /* ── GS1 · History, Geography, Art & Culture, Society (weeks 16–23) ── */
  {
    phaseId: "completion",
    primary: "GS1 · Modern History",
    hoursTarget: 8,
    focus: "The arrival of the British.",
    tasks: [
      { track: "GS1 · Modern History", label: "Advent of Europeans, 18th-century India, expansion & consolidation of British power", detail: "Spectrum Ch 1–4" },
      { track: "Revision", label: "Revise GS3 Environment notes (cycle 1)" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology Paper 2: Indian society — perspectives & social structure.",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Modern History",
    hoursTarget: 8,
    focus: "1857 and the age of reform.",
    tasks: [
      { track: "GS1 · Modern History", label: "Revolt of 1857, socio-religious reform movements, peasant & tribal movements", detail: "Spectrum Ch 5–7" },
      { track: "Answer Writing", label: "1 GS answer/day (history GS1)" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology Paper 2: caste, class, agrarian structure.",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Modern History",
    hoursTarget: 9,
    focus: "The national movement takes shape.",
    tasks: [
      { track: "GS1 · Modern History", label: "INC moderates & extremists, Swadeshi, the start of the Gandhian era", detail: "Spectrum Ch 8–10" },
      { track: "Revision", label: "Weekly revision + monthly self-test" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology Paper 2: kinship, family, religion in India.",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Modern History",
    hoursTarget: 9,
    focus: "Freedom and after.",
    tasks: [
      { track: "GS1 · Modern History", label: "Gandhian movements (NCM, CDM, QIM), revolutionaries, Partition, independence, post-1947 consolidation", detail: "Spectrum Ch 11–end" },
      { track: "Consolidate", label: "Modern History PYQ analysis + president↔session table" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology Paper 2: social movements (peasant, women, backward classes).",
    milestone: "Modern History covered with notes.",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Geography",
    hoursTarget: 9,
    focus: "Physical geography.",
    tasks: [
      { track: "GS1 · Geography", label: "Geomorphology, climatology, oceanography", detail: "NCERT (11–12) + GC Leong" },
      { track: "Revision", label: "Revise GS1 Modern History notes (cycle 1)" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology Paper 1: revision of stratification + mobility.",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Geography",
    hoursTarget: 9,
    focus: "Indian geography and mapping.",
    tasks: [
      { track: "GS1 · Geography", label: "Indian physiography, drainage, monsoon, resources + map practice", detail: "NCERT + atlas" },
      { track: "Answer Writing", label: "1 GS answer/day (geography)" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: answer writing begins (1 optional answer/day).",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Art & Culture",
    hoursTarget: 9,
    focus: "Art, culture and heritage.",
    tasks: [
      { track: "GS1 · Art & Culture", label: "Architecture, sculpture, painting, dance, music, literature, traditions", detail: "Nitin Singhania" },
      { track: "Revision", label: "Weekly revision" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology Paper 1 + 2 alternating revision.",
  },
  {
    phaseId: "completion",
    primary: "GS1 · Indian Society",
    hoursTarget: 9,
    focus: "Close out GS1.",
    tasks: [
      { track: "GS1 · Society", label: "Salient features, diversity, urbanisation, globalisation, women, population, communalism", detail: "NCERT Sociology + CA" },
      { track: "Consolidate", label: "GS1 PYQ analysis + consolidate the full paper" },
    ],
    optional: "Sociology: link Paper 2 society topics with GS1 society.",
    milestone: "GS1 covered end-to-end with notes.",
  },

  /* ── GS4 · Ethics (weeks 24–27) ── */
  {
    phaseId: "completion",
    primary: "GS4 · Ethics",
    hoursTarget: 10,
    focus: "Foundations of ethics.",
    tasks: [
      { track: "GS4 · Ethics", label: "Ethics & human interface, attitude, foundational values", detail: "Lexicon / G. Subba Rao" },
      { track: "GS4 · Case Studies", label: "Start a personal case-study bank; write 2 case studies" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: full Paper 1 revision sweep.",
  },
  {
    phaseId: "completion",
    primary: "GS4 · Ethics",
    hoursTarget: 10,
    focus: "Emotional intelligence and thinkers.",
    tasks: [
      { track: "GS4 · Ethics", label: "Emotional intelligence, moral & political thinkers, aptitude & civil-service values" },
      { track: "Answer Writing", label: "Daily ethics answer / 1 case study" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: full Paper 2 revision sweep.",
  },
  {
    phaseId: "completion",
    primary: "GS4 · Ethics",
    hoursTarget: 10,
    focus: "Probity in governance.",
    tasks: [
      { track: "GS4 · Ethics", label: "Probity, public/civil-service values, RTI, codes of conduct & ethics" },
      { track: "GS4 · Case Studies", label: "3–4 case studies under the timer" },
      { track: "CA", label: "Daily newspaper + CA note" },
    ],
    optional: "Sociology: thinker quotes + diagram bank for answers.",
  },
  {
    phaseId: "completion",
    primary: "GS4 + Full GS revision",
    hoursTarget: 10,
    focus: "Year-end consolidation.",
    tasks: [
      { track: "GS4 · Ethics", label: "Ethics PYQ analysis + consolidate the paper" },
      { track: "Revision", label: "Full GS revision sweep (GS1–GS4 notes) before the prelims pivot" },
      { track: "Consolidate", label: "Confirm: every subject now has YOUR notes" },
    ],
    optional: "Sociology Paper 1 complete; Paper 2 reading well underway.",
    milestone: "31 Dec — Static syllabus covered + notes made. Pivot to Prelims next.",
  },
];

/* ════════════════════════════════════════════════════════════════
   Assemble weeks with computed, drift-proof dates
   ════════════════════════════════════════════════════════════════ */

function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export const weeks: PlanWeek[] = weekSeeds.map((seed, i) => {
  const startDate = addDays(PLAN_START, i * 7);
  return {
    ...seed,
    week: i + 1,
    startDate,
    endDate: addDays(startDate, 6),
  };
});

/* ════════════════════════════════════════════════════════════════
   Daily & weekly templates, sources, principles, anti-patterns
   ════════════════════════════════════════════════════════════════ */

export interface DailySlot {
  time: string;
  label: string;
}

export const dailyTemplate: DailySlot[] = [
  { time: "07:00–08:30", label: "Hardest subject first (brain freshest)" },
  { time: "08:30–09:30", label: "Newspaper + same-day current-affairs note" },
  { time: "10:30–13:00", label: "Static subject #2 + note-making" },
  { time: "14:30–16:30", label: "Sociology (class days) / optional revision" },
  { time: "16:30–18:00", label: "Answer writing / MCQs / revision" },
  { time: "19:30–21:00", label: "Revise today's notes + plan tomorrow" },
];

export const weeklyRhythm: string[] = [
  "Mon–Sat: new content + notes in the morning, practice in the evening.",
  "One fixed slot daily: newspaper → same-day CA note.",
  "Sunday: weekly revision + a self-test + plan next week + real rest.",
  "Week 4 of every month = revision week (no heavy new material).",
];

export const dailyNonNegotiables: string[] = [
  "Make the note the same day you study the topic — never 'later'.",
  "Revise yesterday's material before starting today's.",
  "One newspaper, 60–75 min, every single day.",
  "Sleep 7 hours — memory consolidates while you sleep.",
];

export const sources: SourceItem[] = [
  { paper: "GS2", subject: "Polity", source: "M. Laxmikanth — Indian Polity" },
  { paper: "GS3", subject: "Economy", source: "Mrunal lectures / Ramesh Singh", note: "+ Budget & Economic Survey highlights" },
  { paper: "GS3", subject: "Environment", source: "Shankar IAS — Environment" },
  { paper: "GS1", subject: "Modern History", source: "Spectrum — A Brief History of Modern India" },
  { paper: "GS1", subject: "Geography", source: "NCERT (11–12) + GC Leong + atlas" },
  { paper: "GS1", subject: "Art & Culture", source: "Nitin Singhania" },
  { paper: "GS1", subject: "Society", source: "NCERT Sociology + current affairs" },
  { paper: "GS4", subject: "Ethics", source: "Lexicon / G. Subba Rao + own case-study bank" },
  { paper: "CSAT", subject: "Aptitude", source: "PYQs + targeted practice (from Jan)" },
  { paper: "Optional", subject: "Sociology", source: "Coaching + Haralambos + IGNOU + answer practice" },
  { paper: "All", subject: "Current Affairs", source: "One newspaper + one monthly magazine" },
];

export const principles: string[] = [
  "Limited sources, revised many times — not many sources read once.",
  "Study integrated (prelims + mains), then switch to prelims-only ~3.5 months out.",
  "Answer writing is a separate skill — trained over months, not in the exam hall.",
  "PYQ-driven: reverse-engineer the exam instead of trusting coverage.",
  "Test series for both stages — performance under pressure is its own muscle.",
  "Consistency over heroics. Be steady for 14 months, not on fire for 14 days.",
];

export const antiPatterns: string[] = [
  "Attending lectures without revising → revise within 48h, every time.",
  "Incomplete or no notes → one-touch, same-day, revisable notes.",
  "Passive reading → active recall + answer writing.",
  "Treating a first read as 'done' → ownership comes on reads 2–3 + self-test.",
  "Hoarding resources → stick to one fixed list.",
];

/* ════════════════════════════════════════════════════════════════
   Helpers — date → current position in the plan
   ════════════════════════════════════════════════════════════════ */

/** The 1-indexed plan week number for a given date (>=1). */
export function weekNumberFor(date: ISODate): number {
  const diff = daysBetween(PLAN_START, date);
  return Math.floor(diff / 7) + 1;
}

/** The PlanWeek covering `date`, if it falls within the detailed window. */
export function currentWeek(date: ISODate): PlanWeek | undefined {
  const n = weekNumberFor(date);
  return weeks.find((w) => w.week === n);
}

/** The phase covering `date` (falls back to the nearest by range). */
export function currentPhase(date: ISODate): PlanPhase {
  const within = phases.find((p) => date >= p.startDate && date <= p.endDate);
  if (within) return within;
  // before the plan starts → foundation; after the last → interview
  return date < phases[0].startDate ? phases[0] : phases[phases.length - 1];
}

/** Whole weeks remaining until the (estimated) Prelims. */
export function weeksToPrelims(date: ISODate): number {
  return Math.max(0, Math.ceil(daysBetween(date, PRELIMS_DATE) / 7));
}

/** Days remaining until the (estimated) Prelims. */
export function daysToPrelims(date: ISODate): number {
  return Math.max(0, daysBetween(date, PRELIMS_DATE));
}

/** Group the detailed weeks by phase, for sectioned rendering. */
export function weeksByPhase(): { phase: PlanPhase; weeks: PlanWeek[] }[] {
  return phases
    .map((phase) => ({
      phase,
      weeks: weeks.filter((w) => w.phaseId === phase.id),
    }))
    .filter((g) => g.weeks.length > 0);
}
