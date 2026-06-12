# UPSC Knowledge Graph — Module Design

> An Obsidian-style map of the entire syllabus. Every topic is a node; every
> relationship is a link. **Polity → Parliament → Constitutional Bodies →
> Governance**, **Modern History → Revolt of 1857 → INC & Moderates → Gandhian
> Era → Partition** — the candidate sees the syllabus as a connected web, not a
> flat checklist, and can wire in new connections as understanding deepens.

## 1. Architecture

The graph is **derived, not duplicated**. Nodes come from the live syllabus
(`subjects[].topics[]`) and links from a small stored relationship list. This
keeps node styling — completion status, confidence, revision count — perfectly
in sync with the Subject Progress and Daily Journal modules.

```
subjects[] (source of truth: status, confidence, revisionCount, lastTouched)
        +
topicLinks[] (stored topic↔topic relationships, curated + user-created)
        │
        ▼  buildGraph()  (src/lib/graph.ts — pure)
   ┌──────────────────────────────────────────────┐
   │ Graph { nodes, links, byId, related, all }    │
   │  • subject nodes + topic nodes                │
   │  • "contains" links (subject→topic, derived)  │
   │  • "related" links (from topicLinks)          │
   │  • adjacency maps for highlight / local graph │
   └──────────────────────────────────────────────┘
        │                         │                       │
        ▼                         ▼                       ▼
  useForceLayout()          NodeDetail              KnowledgeDensity
  (d3-force, headless)   backlinks · suggestions    analytics & coverage
        ▼
   ForceGraph (SVG: pan / zoom / drag / hover / select)
```

- **Layout**: `d3-force` runs headlessly in `useForceLayout` (charge, link,
  center, collide, x/y forces). Positions persist by id across rebuilds, so
  filtering or adding a link nudges the map instead of reshuffling it.
- **Rendering**: hand-built SVG (grayscale), so styling stays on-theme and the
  graph degrades gracefully. Interaction (pan/zoom/drag) is custom.
- **Derivations** (`src/lib/graph.ts`): `buildGraph`, `topicLinksFor`
  (backlinks), `relatedSuggestions`, `neighborhood` (local graph), `graphDensity`,
  `hubs`, `orphans`, `completionBreakdown`, `revisionCoverage`,
  `subjectConnectivity` — all pure and unit-testable.

## 2. Database design

```
Topic (on Subject)                 TopicLink (ChronicleData.topicLinks[])
├─ id        "<subj>-t<index>"     ├─ id
├─ name                            ├─ source     → Topic.id
├─ status    untouched|learning|   ├─ target     → Topic.id
│            revised|mastered      ├─ relation   "leads to"|"related"|
├─ confidence 0–100                │             "prerequisite"|"contrast"
├─ revisionCount                   └─ createdOn   ISODate
└─ lastTouched ISODate
```

- **Containment** (subject→topic) is computed at render time, never stored.
- **Links are undirected in meaning** but stored with a `source`/`target` so the
  curated chains keep a readable direction (used to split *Links out* vs
  *Backlinks*).
- **Migration**: persist `version: 3` introduces `topicLinks` (backfilled from
  the curated seed for returning users) and retires the old subject-level
  `graph` snapshot. Topic ids are deterministic, so seeded and user links stay
  valid across reloads.

### Relational mapping (future backend)

```
topic_links(id, user_id, source_topic_id, target_topic_id, relation, created_on)
-- nodes & completion already live in subjects/topics tables
```

## 3. User interface

```
┌──────────────────────────────────────────────────────────────────┐
│  UPSC KNOWLEDGE GRAPH — "The syllabus is a web, not a list."       │
├──────────────────────────────────────────────────────────────────┤
│ [🔍 Search topics & subjects ▾]  [Subject ▾]   (Topics)(Local graph)│
├───────────────────────────────────────────┬──────────────────────┤
│                                      [+][-]│  Fundamental Rights   │
│            ●───────●  (force-directed)[▢][⊕]│  Polity · revised      │
│         ●──┼──●   ●                         │  Confidence ▓▓▓▓▓▓░ 78%│
│      ●     ●    ●──●        ● subjects       │  3 revisions · last…   │
│        ●     ●      ● topics (brightness =   │  [Mark revised]        │
│   ● Subject  ○ topic   confidence)          │  Status: ▢▢▣▢          │
│                                             │  ↑ Links out (3)       │
│                                             │  ↓ Backlinks (2)       │
│                                             │  ✦ Suggested (6) [+]   │
│                                             │  [🔍 Link to a topic…] │
├───────────────────────────────────────────┴──────────────────────┤
│  KNOWLEDGE DENSITY: topics · links · avg degree · density ·        │
│  connected% · orphans | Completion bar | Revision ring | Hubs |    │
│  Density by subject | Orphan topics                                │
└──────────────────────────────────────────────────────────────────┘
```

- **Nodes**: subjects are large/bright; topics are sized by degree and
  **brightness encodes confidence**; an outer ring encodes completion status
  (untouched → mastered).
- **Detail panel**: status + confidence, **revision tracking** (count, last
  revised, one-tap *Mark revised*), status setter, *Links out*, *Backlinks*,
  *Suggested links*, and an add-link search.
- **Analytics**: knowledge-density stats, completion distribution, revision
  coverage (with "needs revision" shortcuts), most-connected hubs, per-subject
  density, and orphan topics.

## 4. Graph interaction logic

- **Pan** — drag the background. **Zoom** — wheel (to cursor) or the +/−/fit/reset
  controls. **Drag a node** — pins it in the simulation (gently reheats), then
  releases on drop. A small movement threshold distinguishes a *drag* from a
  *click*.
- **Hover** highlights a node, its neighbours and incident links, dimming the
  rest. **Click** selects (opens the detail panel); clicking empty space clears.
- **View modes**:
  - *Topics* (default) — full topic graph.
  - *Subjects only* — collapses to subject nodes with aggregated cross-subject
    links (a bird's-eye view).
  - *Subject filter* — an ego-network: a subject, its topics, and any
    cross-subject topics they link to.
  - *Local graph* — only the selected node's 1-hop neighbourhood (Obsidian's
    local-graph pane).
- **Node linking** — add via *Suggested links* (`+`), the add-link search, or
  remove via the `×` on any link/backlink. Links are de-duplicated and
  symmetric; self-links are rejected.

## 5. Search system

- The search box matches topics **and** subjects by label; results are ranked
  (subjects first, then alphabetical) in a dropdown.
- While typing, the graph **dims non-matches** so hits stand out in context.
- Picking a result selects it, ensures it's visible (switches to topic view /
  clears filters as needed), and **smoothly centres & zooms** the canvas on it
  via an explicit focus token (so it never fights the live simulation or the
  user's panning).
- Detail-panel link/backlink/suggestion/hub/orphan items are all clickable,
  making the entire module navigable by traversal as well as search.

## Requirements coverage

| Requirement | Where |
| --- | --- |
| Interactive graph visualization | `ForceGraph` + `useForceLayout` (d3-force) |
| Node linking | add/remove links in `NodeDetail`; `addTopicLink`/`removeTopicLink` |
| Backlinks | `topicLinksFor` → *Backlinks* list |
| Related topic suggestions | `relatedSuggestions` (subject, shared-neighbour, wording) |
| Knowledge density analytics | `graphDensity`, `subjectConnectivity`, hubs, orphans |
| Topic completion status | node ring + status setter (`setTopicStatusById`) |
| Revision frequency tracking | `revisionCoverage` + *Mark revised* (`reviseTopic`) |
| Search system | controls-bar search with dim-in-context + focus-to-centre |
