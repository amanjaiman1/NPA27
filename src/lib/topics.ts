import type {
  ISODate,
  JournalEntry,
  Mistake,
  RevisionItem,
  Subject,
  TopicCompletion,
  TopicStatus,
} from "./types";

/* ════════════════════════════════════════════════════════════════
   COMPLETED TOPICS
   What the journal says you finished, joined to the syllabus, the
   revision queue and the mistake notebook. Pure functions: the composer's
   picker and the Topics explorer both read from here.

   Topics used to be free text on each day, which meant "Fundamental
   Rights" in the journal and "Fundamental Rights" in the syllabus never
   met. A completion now carries the syllabus topic's id when it was picked
   from there; free text still works for anything the syllabus doesn't list.
   ════════════════════════════════════════════════════════════════ */

export function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A deterministic id for a completion read from the old free-text list. */
function legacyId(name: string, i: number): string {
  let h = 0;
  for (const ch of normName(name)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `tc_l${i}_${(h >>> 0).toString(36)}`;
}

/** The day's completed topics, whichever version saved them. */
export function completedTopicsOf(
  entry: Pick<JournalEntry, "completedTopics" | "topicsCompleted">,
): TopicCompletion[] {
  if (entry.completedTopics) return entry.completedTopics;
  return (entry.topicsCompleted ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, i) => ({ id: legacyId(name, i), name }));
}

export function countCompletedTopics(entry: Pick<JournalEntry, "completedTopics" | "topicsCompleted">): number {
  return completedTopicsOf(entry).length;
}

/**
 * The syllabus topic a free-text name refers to: a case-insensitive exact match
 * that is unique, within `subjectId` when given or across the whole syllabus.
 * An ambiguous name ("Introduction" in four subjects) stays unlinked rather
 * than being guessed.
 */
export function matchSyllabusTopic(
  name: string,
  subjects: Subject[],
  subjectId?: string,
): { subjectId: string; topicId: string; name: string } | null {
  const n = normName(name);
  if (!n) return null;
  const hits: { subjectId: string; topicId: string; name: string }[] = [];
  for (const s of subjects) {
    if (subjectId && s.id !== subjectId) continue;
    for (const t of s.topics) if (normName(t.name) === n) hits.push({ subjectId: s.id, topicId: t.id, name: t.name });
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Moves an entry's old free-text topics onto linked completions. Idempotent:
 * an entry already on the new shape comes back unchanged (same object).
 */
export function upgradeEntryTopics(entry: JournalEntry, subjects: Subject[]): JournalEntry {
  if (entry.completedTopics && !entry.topicsCompleted) return entry;
  if (!entry.completedTopics && !entry.topicsCompleted?.length) {
    if (!("topicsCompleted" in entry)) return entry;
    const next = { ...entry };
    delete next.topicsCompleted;
    return next;
  }
  const link = (c: TopicCompletion): TopicCompletion => {
    const hit = matchSyllabusTopic(c.name, subjects);
    return hit ? { ...c, name: hit.name, subjectId: hit.subjectId, topicId: hit.topicId } : c;
  };
  const legacy = completedTopicsOf({ topicsCompleted: entry.topicsCompleted }).map(link);
  // Both present only when a device on an older version added free text after
  // the upgrade: keep every completion, and any name the new list lacks.
  const completedTopics = entry.completedTopics
    ? [
        ...entry.completedTopics,
        ...legacy.filter(
          (l) => !entry.completedTopics!.some((c) => (l.topicId && c.topicId === l.topicId) || normName(c.name) === normName(l.name)),
        ),
      ]
    : legacy;
  const next: JournalEntry = { ...entry, completedTopics };
  delete next.topicsCompleted;
  return next;
}

/** Finds a topic by id anywhere in the syllabus. */
export function findTopic(subjects: Subject[], topicId: string) {
  for (const s of subjects) {
    const t = s.topics.find((x) => x.id === topicId);
    if (t) return { subject: s, topic: t };
  }
  return null;
}

/* ── the picker ──────────────────────────────────────────────── */

export interface TopicOption {
  /** `topicId` for syllabus topics, `custom:<name>` for saved free text. */
  key: string;
  name: string;
  source: "syllabus" | "saved";
  subjectId?: string;
  topicId?: string;
  subjectName?: string;
  status?: TopicStatus;
  /** How many journal days already record it. */
  timesDone: number;
  lastDone?: ISODate;
}

interface History {
  times: number;
  last?: ISODate;
}

/** How often each topic (by syllabus id, or by name for free text) has been recorded. */
function historyIndex(journal: JournalEntry[]) {
  const byTopic = new Map<string, History>();
  const custom = new Map<string, { name: string; subjectId?: string } & History>();
  for (const e of journal) {
    for (const c of completedTopicsOf(e)) {
      if (c.topicId) {
        const h = byTopic.get(c.topicId) ?? { times: 0 };
        h.times += 1;
        if (!h.last || e.date > h.last) h.last = e.date;
        byTopic.set(c.topicId, h);
      } else {
        const k = normName(c.name);
        if (!k) continue;
        const h = custom.get(k) ?? { name: c.name, subjectId: c.subjectId, times: 0 };
        h.times += 1;
        if (!h.last || e.date > h.last) {
          h.last = e.date;
          h.name = c.name;
        }
        custom.set(k, h);
      }
    }
  }
  return { byTopic, custom };
}

/** Each query word must appear in the name or subject; earlier, whole-word matches rank higher. */
function score(q: string[], name: string, subject: string): number {
  if (!q.length) return 1;
  const n = normName(name);
  const s = normName(subject);
  let total = 0;
  for (const w of q) {
    if (n.startsWith(w)) total += 4;
    else if (n.split(" ").some((part) => part.startsWith(w))) total += 3;
    else if (n.includes(w)) total += 2;
    else if (s.includes(w)) total += 1;
    else return 0;
  }
  return total;
}

/**
 * Options for the composer's topic field: the syllabus, plus the free-text
 * topics already saved on earlier days, so a custom topic typed once can be
 * picked again instead of retyped. Empty query → topics finished recently.
 */
export function searchTopicOptions(
  query: string,
  subjects: Subject[],
  journal: JournalEntry[],
  opts: {
    subjectId?: string;
    exclude?: Set<string>;
    limit?: number;
    /** Subjects studied today: their topics rank first. */
    prefer?: Set<string>;
  } = {},
): TopicOption[] {
  const limit = opts.limit ?? 30;
  const q = normName(query).split(" ").filter(Boolean);
  const { byTopic, custom } = historyIndex(journal);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const scored: { o: TopicOption; s: number }[] = [];

  for (const s of subjects) {
    if (opts.subjectId && s.id !== opts.subjectId) continue;
    for (const t of s.topics) {
      if (opts.exclude?.has(t.id)) continue;
      const sc = score(q, t.name, s.name);
      if (!sc) continue;
      const h = byTopic.get(t.id);
      scored.push({
        s: sc + (opts.prefer?.has(s.id) ? 1.5 : 0),
        o: {
          key: t.id,
          name: t.name,
          source: "syllabus",
          subjectId: s.id,
          topicId: t.id,
          subjectName: s.name,
          status: t.status,
          timesDone: h?.times ?? 0,
          lastDone: h?.last,
        },
      });
    }
  }
  for (const [k, h] of custom) {
    const key = `custom:${k}`;
    if (opts.exclude?.has(key)) continue;
    if (opts.subjectId && h.subjectId && h.subjectId !== opts.subjectId) continue;
    // A saved name that now exists in the syllabus is offered as the syllabus topic instead.
    if (matchSyllabusTopic(h.name, subjects, h.subjectId)) continue;
    const sc = score(q, h.name, h.subjectId ? (subjectName.get(h.subjectId) ?? "") : "");
    if (!sc) continue;
    scored.push({
      // Saved topics are ones you've used before: lift them a little.
      s: sc + 0.5,
      o: {
        key,
        name: h.name,
        source: "saved",
        subjectId: h.subjectId,
        subjectName: h.subjectId ? subjectName.get(h.subjectId) : undefined,
        timesDone: h.times,
        lastDone: h.last,
      },
    });
  }

  if (!q.length) {
    // Nothing typed yet. With subjects studied today: their topics not yet
    // done, in syllabus order. Otherwise what was finished most recently.
    if (opts.prefer?.size) {
      const rank: Record<string, number> = { untouched: 0, learning: 1, revised: 2, mastered: 3 };
      return scored
        .filter((x) => x.o.subjectId && opts.prefer!.has(x.o.subjectId))
        .sort((a, b) => (rank[a.o.status ?? "untouched"] ?? 0) - (rank[b.o.status ?? "untouched"] ?? 0))
        .slice(0, limit)
        .map((x) => x.o);
    }
    return scored
      .sort(
        (a, b) =>
          (b.o.lastDone ?? "").localeCompare(a.o.lastDone ?? "") ||
          a.o.name.localeCompare(b.o.name),
      )
      .slice(0, limit)
      .map((x) => x.o);
  }
  return scored
    .sort((a, b) => b.s - a.s || b.o.timesDone - a.o.timesDone || a.o.name.localeCompare(b.o.name))
    .slice(0, limit)
    .map((x) => x.o);
}

/* ── the explorer ────────────────────────────────────────────── */

export type RevisionState = "due" | "queued" | "none";

/** One topic, with everything the journal and the rest of the app know about it. */
export interface TopicRecord {
  /** `topicId` for syllabus topics, `custom:<name>` otherwise. */
  key: string;
  name: string;
  source: "syllabus" | "custom";
  subjectId?: string;
  topicId?: string;
  /** Every day it was recorded, oldest first. */
  dates: ISODate[];
  first: ISODate;
  last: ISODate;
  status?: TopicStatus;
  confidence?: number;
  revisionCount?: number;
  /** The scheduled revision covering it, if any. */
  revision: Pick<RevisionItem, "id" | "nextDue" | "repetitions" | "lastRevised"> | null;
  revisionState: RevisionState;
  openMistakes: number;
}

export function buildTopicIndex(
  journal: JournalEntry[],
  subjects: Subject[],
  revisions: RevisionItem[],
  mistakes: Mistake[],
  today: ISODate,
): TopicRecord[] {
  const records = new Map<string, TopicRecord>();
  const revByKey = new Map<string, RevisionItem>();
  for (const r of revisions) revByKey.set(`${r.subjectId}::${normName(r.topic)}`, r);
  const openByKey = new Map<string, number>();
  for (const m of mistakes) {
    if (m.status === "Mastered") continue;
    const k = `${m.subjectId}::${normName(m.topic)}`;
    openByKey.set(k, (openByKey.get(k) ?? 0) + 1);
  }

  for (const e of journal) {
    for (const c of completedTopicsOf(e)) {
      const key = c.topicId ?? `custom:${normName(c.name)}`;
      if (key === "custom:") continue;
      let rec = records.get(key);
      if (!rec) {
        const found = c.topicId ? findTopic(subjects, c.topicId) : null;
        const subjectId = found?.subject.id ?? c.subjectId;
        const name = found?.topic.name ?? c.name;
        const rk = subjectId ? `${subjectId}::${normName(name)}` : null;
        const revision = rk ? (revByKey.get(rk) ?? null) : null;
        rec = {
          key,
          name,
          source: found ? "syllabus" : "custom",
          subjectId,
          topicId: found?.topic.id,
          dates: [],
          first: e.date,
          last: e.date,
          status: found?.topic.status,
          confidence: found?.topic.confidence,
          revisionCount: found?.topic.revisionCount,
          revision: revision
            ? {
                id: revision.id,
                nextDue: revision.nextDue,
                repetitions: revision.repetitions,
                lastRevised: revision.lastRevised,
              }
            : null,
          revisionState: revision ? (revision.nextDue <= today ? "due" : "queued") : "none",
          openMistakes: rk ? (openByKey.get(rk) ?? 0) : 0,
        };
        records.set(key, rec);
      }
      if (!rec.dates.includes(e.date)) rec.dates.push(e.date);
    }
  }
  for (const rec of records.values()) {
    rec.dates.sort();
    rec.first = rec.dates[0];
    rec.last = rec.dates[rec.dates.length - 1];
  }
  return [...records.values()];
}

export type TopicSort = "recent" | "oldest" | "name" | "count" | "subject";

export interface TopicQuery {
  q: string;
  subjectId: string | "all";
  source: "all" | "syllabus" | "custom";
  status: "all" | TopicStatus;
  revision: "all" | RevisionState;
  /** Keep topics recorded at least once in this span (inclusive). */
  from?: ISODate;
  to?: ISODate;
  sort: TopicSort;
}

export const EMPTY_TOPIC_QUERY: TopicQuery = {
  q: "",
  subjectId: "all",
  source: "all",
  status: "all",
  revision: "all",
  sort: "recent",
};

export function activeTopicFilters(query: TopicQuery): number {
  return (
    (query.subjectId !== "all" ? 1 : 0) +
    (query.source !== "all" ? 1 : 0) +
    (query.status !== "all" ? 1 : 0) +
    (query.revision !== "all" ? 1 : 0) +
    (query.from ? 1 : 0) +
    (query.to ? 1 : 0)
  );
}

/** Search covers the topic, its subject and the subject's paper. */
export function filterTopics(records: TopicRecord[], query: TopicQuery, subjects: Subject[]): TopicRecord[] {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const words = normName(query.q).split(" ").filter(Boolean);
  const list = records.filter((r) => {
    if (query.subjectId !== "all" && r.subjectId !== query.subjectId) return false;
    if (query.source !== "all" && r.source !== query.source) return false;
    if (query.status !== "all" && r.status !== query.status) return false;
    if (query.revision !== "all" && r.revisionState !== query.revision) return false;
    if (query.from || query.to) {
      const inSpan = r.dates.some((d) => (!query.from || d >= query.from) && (!query.to || d <= query.to));
      if (!inSpan) return false;
    }
    if (!words.length) return true;
    const s = r.subjectId ? bySubject.get(r.subjectId) : undefined;
    const hay = normName(`${r.name} ${s?.name ?? ""} ${s?.paper ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
  const name = (id?: string) => (id ? (bySubject.get(id)?.name ?? "") : "~");
  switch (query.sort) {
    case "oldest":
      return list.sort((a, b) => a.first.localeCompare(b.first) || a.name.localeCompare(b.name));
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "count":
      return list.sort((a, b) => b.dates.length - a.dates.length || b.last.localeCompare(a.last));
    case "subject":
      return list.sort((a, b) => name(a.subjectId).localeCompare(name(b.subjectId)) || a.name.localeCompare(b.name));
    default:
      return list.sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
  }
}

/** Summary line for the explorer's header. */
export function topicSummary(records: TopicRecord[]) {
  return {
    total: records.length,
    syllabus: records.filter((r) => r.source === "syllabus").length,
    custom: records.filter((r) => r.source === "custom").length,
    due: records.filter((r) => r.revisionState === "due").length,
    unscheduled: records.filter((r) => r.revisionState === "none" && r.source === "syllabus").length,
  };
}
