import type {
  ISODate,
  JournalEntry,
  Mistake,
  PaperCode,
  RevisionItem,
  Subject,
  Topic,
  TopicStatus,
} from "./types";
import { daysBetween, round, avg } from "./utils";

/* ════════════════════════════════════════════════════════════════
   Reading the syllabus as a whole.

   The page could show a mastery ring per subject and nothing else —
   which topics are weakest, which haven't been opened in two months, or
   which already sit on the revision queue were all invisible even though
   the data was right there. Pure functions of (subjects, data, today).
   ════════════════════════════════════════════════════════════════ */

export const STATUS_ORDER: TopicStatus[] = [
  "untouched",
  "learning",
  "revised",
  "mastered",
];

/** Nominal confidence for a status, used when no explicit number is given. */
export const STATUS_CONF: Record<TopicStatus, number> = {
  untouched: 10,
  learning: 40,
  revised: 68,
  mastered: 92,
};

export const STATUS_LABEL: Record<TopicStatus, string> = {
  untouched: "Untouched",
  learning: "Learning",
  revised: "Revised",
  mastered: "Mastered",
};

export const PAPER_ORDER: PaperCode[] = [
  "GS1",
  "GS2",
  "GS3",
  "GS4",
  "Essay",
  "CSAT",
  "Optional",
  "CurrentAffairs",
];

export const PAPER_LABEL: Record<PaperCode, string> = {
  GS1: "General Studies I",
  GS2: "General Studies II",
  GS3: "General Studies III",
  GS4: "Ethics (GS IV)",
  Essay: "Essay",
  CSAT: "CSAT",
  Optional: "Optional",
  CurrentAffairs: "Current Affairs",
};

/** A topic untouched for this long is worth flagging. */
export const STALE_AFTER_DAYS = 45;

/**
 * Revision items and mistakes reference a topic by `subjectId` plus a free-text
 * name rather than by `Topic.id`, so joining them up means comparing names.
 * Normalising both sides is what makes the join survive the two having been
 * typed on different screens.
 */
function key(subjectId: string, topicName: string): string {
  return `${subjectId}::${topicName.trim().toLowerCase()}`;
}

export type StatusCounts = Record<TopicStatus, number>;

export function statusCounts(topics: Topic[]): StatusCounts {
  const out: StatusCounts = { untouched: 0, learning: 0, revised: 0, mastered: 0 };
  for (const t of topics) out[t.status] += 1;
  return out;
}

/** Mean confidence across a subject's topics, 0 when it has none. */
export function mastery(topics: Topic[]): number {
  if (!topics.length) return 0;
  return Math.round(avg(topics.map((t) => t.confidence)));
}

/** Days since a topic was last touched; null when it never has been. */
export function daysSinceTouched(topic: Topic, today: ISODate): number | null {
  if (!topic.lastTouched) return null;
  return Math.max(0, daysBetween(topic.lastTouched, today));
}

export function isStale(topic: Topic, today: ISODate): boolean {
  // Never opened doesn't count as stale — it's simply not started, which the
  // "untouched" status already says.
  const since = daysSinceTouched(topic, today);
  return since != null && since >= STALE_AFTER_DAYS;
}

/** What else in the app points at this topic. */
export interface TopicLinkage {
  /** Scheduled revision items covering it. */
  revisions: number;
  /** Whether one of those is due on or before today. */
  revisionDue: boolean;
  /** Logged mistakes attributed to it. */
  mistakes: number;
  /** Mistakes still open. */
  openMistakes: number;
  /** Times it was named in a journal entry's completed-topics list. */
  journalMentions: number;
}

export interface LinkageIndex {
  byTopic: Map<string, TopicLinkage>;
}

/**
 * Builds every topic's linkage in one pass. Done as an index rather than a
 * per-topic lookup because the page renders hundreds of rows, and scanning the
 * revision, mistake and journal lists inside each one is quadratic.
 */
export function buildLinkage(
  revisions: RevisionItem[],
  mistakes: Mistake[],
  journal: JournalEntry[],
  today: ISODate,
): LinkageIndex {
  const byTopic = new Map<string, TopicLinkage>();
  const touch = (k: string): TopicLinkage => {
    let hit = byTopic.get(k);
    if (!hit) {
      hit = { revisions: 0, revisionDue: false, mistakes: 0, openMistakes: 0, journalMentions: 0 };
      byTopic.set(k, hit);
    }
    return hit;
  };

  for (const r of revisions) {
    const hit = touch(key(r.subjectId, r.topic));
    hit.revisions += 1;
    if (r.nextDue <= today) hit.revisionDue = true;
  }
  for (const m of mistakes) {
    const hit = touch(key(m.subjectId, m.topic));
    hit.mistakes += 1;
    if (m.status !== "Mastered") hit.openMistakes += 1;
  }
  /* Journal entries name completed topics without a subject, so a mention is
     credited to that name under every subject — the alternative is dropping the
     signal entirely, and a topic name is specific enough in practice. */
  for (const e of journal) {
    for (const name of e.topicsCompleted ?? []) {
      const n = name.trim().toLowerCase();
      if (!n) continue;
      const hit = touch(`*::${n}`);
      hit.journalMentions += 1;
    }
  }
  return { byTopic };
}

const EMPTY_LINKAGE: TopicLinkage = {
  revisions: 0,
  revisionDue: false,
  mistakes: 0,
  openMistakes: 0,
  journalMentions: 0,
};

export function linkageFor(
  index: LinkageIndex,
  subjectId: string,
  topicName: string,
): TopicLinkage {
  const own = index.byTopic.get(key(subjectId, topicName));
  const mentions = index.byTopic.get(`*::${topicName.trim().toLowerCase()}`);
  if (!own && !mentions) return EMPTY_LINKAGE;
  return {
    revisions: own?.revisions ?? 0,
    revisionDue: own?.revisionDue ?? false,
    mistakes: own?.mistakes ?? 0,
    openMistakes: own?.openMistakes ?? 0,
    journalMentions: mentions?.journalMentions ?? 0,
  };
}

export interface SubjectRollup {
  subject: Subject;
  mastery: number;
  counts: StatusCounts;
  topics: number;
  hours: number;
  /** Topics not touched for a while. */
  stale: number;
  /** Topics with an open mistake against them. */
  withOpenMistakes: number;
  /** Topics already on the revision queue. */
  onRevisionQueue: number;
  /** Topics whose revision is due now. */
  revisionDue: number;
  /** The weakest topic, when the subject has any. */
  weakest: Topic | null;
}

export function rollupSubject(
  subject: Subject,
  hours: number,
  linkage: LinkageIndex,
  today: ISODate,
): SubjectRollup {
  const ranked = [...subject.topics].sort((a, b) => a.confidence - b.confidence);
  let withOpenMistakes = 0;
  let onRevisionQueue = 0;
  let revisionDue = 0;
  for (const t of subject.topics) {
    const l = linkageFor(linkage, subject.id, t.name);
    if (l.openMistakes > 0) withOpenMistakes += 1;
    if (l.revisions > 0) onRevisionQueue += 1;
    if (l.revisionDue) revisionDue += 1;
  }
  return {
    subject,
    mastery: mastery(subject.topics),
    counts: statusCounts(subject.topics),
    topics: subject.topics.length,
    hours: round(hours, 1),
    stale: subject.topics.filter((t) => isStale(t, today)).length,
    withOpenMistakes,
    onRevisionQueue,
    revisionDue,
    weakest: ranked[0] ?? null,
  };
}

export interface WeakTopic {
  subjectId: string;
  subjectName: string;
  topic: Topic;
  linkage: TopicLinkage;
  staleDays: number | null;
}

/**
 * The topics most in need of attention: lowest confidence first, but an open
 * mistake against a topic pulls it forward — a thing you have actually got wrong
 * is a stronger signal than a number you set yourself.
 */
export function weakestTopics(
  subjects: Subject[],
  linkage: LinkageIndex,
  today: ISODate,
  limit = 8,
): WeakTopic[] {
  const rows: WeakTopic[] = [];
  for (const s of subjects) {
    for (const t of s.topics) {
      rows.push({
        subjectId: s.id,
        subjectName: s.name,
        topic: t,
        linkage: linkageFor(linkage, s.id, t.name),
        staleDays: daysSinceTouched(t, today),
      });
    }
  }
  /* Each open mistake counts as 8 points of confidence you don't really have. */
  const score = (r: WeakTopic) => r.topic.confidence - r.linkage.openMistakes * 8;
  return rows
    .sort((a, b) => score(a) - score(b) || a.topic.name.localeCompare(b.topic.name))
    .slice(0, limit);
}

/** Topics gone cold, oldest first. */
export function staleTopics(
  subjects: Subject[],
  today: ISODate,
  limit = 8,
): WeakTopic[] {
  const rows: WeakTopic[] = [];
  for (const s of subjects) {
    for (const t of s.topics) {
      if (!isStale(t, today)) continue;
      rows.push({
        subjectId: s.id,
        subjectName: s.name,
        topic: t,
        linkage: EMPTY_LINKAGE,
        staleDays: daysSinceTouched(t, today),
      });
    }
  }
  return rows.sort((a, b) => (b.staleDays ?? 0) - (a.staleDays ?? 0)).slice(0, limit);
}

export interface PaperCoverage {
  paper: PaperCode;
  label: string;
  subjects: number;
  topics: number;
  mastered: number;
  mastery: number;
}

export function coverageByPaper(subjects: Subject[]): PaperCoverage[] {
  return PAPER_ORDER.filter((p) => subjects.some((s) => s.paper === p)).map((paper) => {
    const subs = subjects.filter((s) => s.paper === paper);
    const topics = subs.flatMap((s) => s.topics);
    return {
      paper,
      label: PAPER_LABEL[paper],
      subjects: subs.length,
      topics: topics.length,
      mastered: topics.filter((t) => t.status === "mastered").length,
      mastery: mastery(topics),
    };
  });
}

export interface SyllabusStats {
  subjects: number;
  topics: number;
  mastery: number;
  counts: StatusCounts;
  mastered: number;
  untouched: number;
  stale: number;
  /** Share of topics at "revised" or better, 0–1. */
  solidShare: number;
}

export function syllabusStats(subjects: Subject[], today: ISODate): SyllabusStats {
  const topics = subjects.flatMap((s) => s.topics);
  const counts = statusCounts(topics);
  return {
    subjects: subjects.length,
    topics: topics.length,
    mastery: mastery(topics),
    counts,
    mastered: counts.mastered,
    untouched: counts.untouched,
    stale: topics.filter((t) => isStale(t, today)).length,
    solidShare: topics.length
      ? round((counts.revised + counts.mastered) / topics.length, 4)
      : 0,
  };
}
