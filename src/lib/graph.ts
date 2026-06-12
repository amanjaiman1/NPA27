import type { Subject, TopicLink, TopicStatus } from "./types";
import { round, sum } from "./utils";

/* ════════════════════════════════════════════════════════════════
   Knowledge-graph derivations. The render graph is built from the
   syllabus (subjects → topics) plus stored topic links, so node
   styling (status, confidence, revision) always reflects live data.
   ════════════════════════════════════════════════════════════════ */

export type GNodeType = "subject" | "topic";

export interface GNode {
  id: string;
  label: string;
  type: GNodeType;
  subjectId: string;
  subjectName: string;
  paper?: string;
  status?: TopicStatus;
  confidence: number; // 0-100 (subject = avg mastery)
  revisionCount: number;
  lastTouched?: string;
  degree: number; // related-link degree (topics) / topic count (subjects)
}

export interface GLink {
  id: string;
  source: string;
  target: string;
  kind: "contains" | "related";
  relation?: string;
}

export interface Graph {
  nodes: GNode[];
  links: GLink[];
  byId: Map<string, GNode>;
  related: Map<string, Set<string>>; // topic↔topic adjacency
  all: Map<string, Set<string>>; // incl. subject↔topic containment
}

function addAdj(m: Map<string, Set<string>>, a: string, b: string) {
  if (!m.has(a)) m.set(a, new Set());
  m.get(a)!.add(b);
}

export function buildGraph(subjects: Subject[], topicLinks: TopicLink[]): Graph {
  const nodes: GNode[] = [];
  const byId = new Map<string, GNode>();
  const topicExists = new Set<string>();
  const links: GLink[] = [];
  const related = new Map<string, Set<string>>();
  const all = new Map<string, Set<string>>();

  for (const s of subjects) {
    const mastery = s.topics.length
      ? Math.round(s.topics.reduce((a, t) => a + t.confidence, 0) / s.topics.length)
      : 0;
    const subjNode: GNode = {
      id: s.id,
      label: s.name,
      type: "subject",
      subjectId: s.id,
      subjectName: s.name,
      paper: s.paper,
      confidence: mastery,
      revisionCount: s.topics.reduce((a, t) => a + t.revisionCount, 0),
      degree: s.topics.length,
    };
    nodes.push(subjNode);
    byId.set(subjNode.id, subjNode);

    for (const t of s.topics) {
      const n: GNode = {
        id: t.id,
        label: t.name,
        type: "topic",
        subjectId: s.id,
        subjectName: s.name,
        paper: s.paper,
        status: t.status,
        confidence: t.confidence,
        revisionCount: t.revisionCount,
        lastTouched: t.lastTouched,
        degree: 0,
      };
      nodes.push(n);
      byId.set(n.id, n);
      topicExists.add(t.id);

      const cid = `c:${t.id}`;
      links.push({ id: cid, source: s.id, target: t.id, kind: "contains" });
      addAdj(all, s.id, t.id);
      addAdj(all, t.id, s.id);
    }
  }

  for (const l of topicLinks) {
    if (!topicExists.has(l.source) || !topicExists.has(l.target)) continue;
    links.push({
      id: l.id,
      source: l.source,
      target: l.target,
      kind: "related",
      relation: l.relation,
    });
    addAdj(related, l.source, l.target);
    addAdj(related, l.target, l.source);
    addAdj(all, l.source, l.target);
    addAdj(all, l.target, l.source);
    const a = byId.get(l.source);
    const b = byId.get(l.target);
    if (a) a.degree++;
    if (b) b.degree++;
  }

  return { nodes, links, byId, related, all };
}

/* ── Backlinks (incoming vs outgoing related links) ──────────── */

export function topicLinksFor(graph: Graph, id: string) {
  const outgoing = graph.links.filter(
    (l) => l.kind === "related" && l.source === id,
  );
  const incoming = graph.links.filter(
    (l) => l.kind === "related" && l.target === id,
  );
  return { outgoing, incoming };
}

/* ── Related-topic suggestions ───────────────────────────────── */

export interface Suggestion {
  node: GNode;
  score: number;
  reason: string;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
}

export function relatedSuggestions(
  graph: Graph,
  id: string,
  limit = 6,
): Suggestion[] {
  const node = graph.byId.get(id);
  if (!node || node.type !== "topic") return [];
  const linked = graph.related.get(id) ?? new Set<string>();
  const twoHop = new Set<string>();
  linked.forEach((nb) =>
    (graph.related.get(nb) ?? new Set()).forEach((x) => twoHop.add(x)),
  );
  const tokens = tokenize(node.label);

  const out: Suggestion[] = [];
  for (const cand of graph.nodes) {
    if (cand.type !== "topic" || cand.id === id || linked.has(cand.id)) continue;
    let score = 0;
    let reason = "";
    if (cand.subjectId === node.subjectId) {
      score += 3;
      reason = "Same subject";
    }
    if (twoHop.has(cand.id)) {
      score += 2;
      if (!reason) reason = "Shares a connection";
    }
    const overlap = tokenize(cand.label).filter((t) => tokens.includes(t));
    if (overlap.length) {
      score += overlap.length;
      if (!reason) reason = "Similar wording";
    }
    if (score > 0) out.push({ node: cand, score, reason });
  }
  return out
    .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
    .slice(0, limit);
}

/* ── Local graph / neighborhood ──────────────────────────────── */

export function neighborhood(graph: Graph, id: string, depth = 1): Set<string> {
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const x of frontier) {
      (graph.all.get(x) ?? new Set()).forEach((nb) => {
        if (!seen.has(nb)) {
          seen.add(nb);
          next.push(nb);
        }
      });
    }
    frontier = next;
  }
  return seen;
}

/* ── Density & completion analytics ──────────────────────────── */

export interface GraphDensity {
  subjects: number;
  topics: number;
  relatedLinks: number;
  avgDegree: number;
  linkDensity: number; // related links per topic
  connectedPct: number;
  orphanCount: number;
}

export function graphDensity(graph: Graph): GraphDensity {
  const topics = graph.nodes.filter((n) => n.type === "topic");
  const relatedLinks = graph.links.filter((l) => l.kind === "related").length;
  const degrees = topics.map((t) => t.degree);
  const connected = topics.filter((t) => t.degree > 0).length;
  return {
    subjects: graph.nodes.filter((n) => n.type === "subject").length,
    topics: topics.length,
    relatedLinks,
    avgDegree: topics.length ? round(sum(degrees) / topics.length, 1) : 0,
    linkDensity: topics.length ? round(relatedLinks / topics.length, 2) : 0,
    connectedPct: topics.length
      ? Math.round((connected / topics.length) * 100)
      : 0,
    orphanCount: topics.length - connected,
  };
}

export function hubs(graph: Graph, n = 6): GNode[] {
  return graph.nodes
    .filter((x) => x.type === "topic")
    .sort((a, b) => b.degree - a.degree || b.confidence - a.confidence)
    .slice(0, n);
}

export function orphans(graph: Graph): GNode[] {
  return graph.nodes.filter((x) => x.type === "topic" && x.degree === 0);
}

export function completionBreakdown(
  graph: Graph,
): Record<TopicStatus, number> {
  const counts: Record<TopicStatus, number> = {
    untouched: 0,
    learning: 0,
    revised: 0,
    mastered: 0,
  };
  graph.nodes.forEach((n) => {
    if (n.type === "topic" && n.status) counts[n.status]++;
  });
  return counts;
}

export interface RevisionCoverage {
  total: number;
  revisedAtLeastOnce: number;
  coveredPct: number;
  least: GNode[];
}

export function revisionCoverage(graph: Graph, leastN = 6): RevisionCoverage {
  const topics = graph.nodes.filter((n) => n.type === "topic");
  const revised = topics.filter((t) => t.revisionCount >= 1).length;
  const least = [...topics]
    .sort((a, b) => a.revisionCount - b.revisionCount || a.confidence - b.confidence)
    .slice(0, leastN);
  return {
    total: topics.length,
    revisedAtLeastOnce: revised,
    coveredPct: topics.length ? Math.round((revised / topics.length) * 100) : 0,
    least,
  };
}

/** Per-subject connectivity for the density panel. */
export interface SubjectConnectivity {
  id: string;
  name: string;
  topics: number;
  links: number; // related links incident to this subject's topics
  mastery: number;
}

export function subjectConnectivity(graph: Graph): SubjectConnectivity[] {
  const map = new Map<string, SubjectConnectivity>();
  for (const n of graph.nodes) {
    if (n.type !== "subject") continue;
    map.set(n.id, {
      id: n.id,
      name: n.label,
      topics: n.degree, // subject.degree == topic count
      links: 0,
      mastery: n.confidence,
    });
  }
  for (const l of graph.links) {
    if (l.kind !== "related") continue;
    const a = graph.byId.get(l.source);
    const b = graph.byId.get(l.target);
    if (a && map.has(a.subjectId)) map.get(a.subjectId)!.links++;
    if (b && map.has(b.subjectId)) map.get(b.subjectId)!.links++;
  }
  return [...map.values()].sort((a, b) => b.links - a.links);
}
