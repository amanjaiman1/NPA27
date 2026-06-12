"use client";

import { useMemo, useState } from "react";
import { Search, Eye, Focus, ChevronDown } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { buildGraph } from "@/lib/graph";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { SectionHeader, Chip } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ForceGraph } from "@/components/graph/force-graph";
import { NodeDetail } from "@/components/graph/node-detail";
import { KnowledgeDensity } from "@/components/graph/analytics";

const STATUS_DOT: Record<string, string> = {
  untouched: "bg-paper/15",
  learning: "bg-paper/35",
  revised: "bg-paper/65",
  mastered: "bg-paper",
};

export default function KnowledgeGraphPage() {
  const hydrated = useHasHydrated();
  const subjects = useChronicle((s) => s.subjects);
  const topicLinks = useChronicle((s) => s.topicLinks);

  const graph = useMemo(
    () => buildGraph(subjects, topicLinks),
    [subjects, topicLinks],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [showTopics, setShowTopics] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes
      .filter((n) => n.label.toLowerCase().includes(q))
      .sort((a, b) => {
        // subjects first, then by label
        if (a.type !== b.type) return a.type === "subject" ? -1 : 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 8);
  }, [query, graph]);

  const searchMatches = useMemo(
    () => (query.trim() ? new Set(matches.map((m) => m.id)) : null),
    [query, matches],
  );

  function pick(id: string) {
    const n = graph.byId.get(id);
    if (n?.type === "topic") {
      setShowTopics(true);
      setSubjectFilter("all");
      setLocalOnly(false);
    }
    setSelectedId(id);
    setFocusId(id);
    setFocusNonce((x) => x + 1);
    setQuery("");
  }

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="UPSC Knowledge Graph"
        title="The syllabus is a web, not a list."
        description="An Obsidian-style map of every topic and how it connects. Polity → Parliament → Constitutional Bodies; History → 1857 → the National Movement. Trace links, find backlinks, and wire new connections as you learn."
      />

      {/* Controls */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* search */}
          <div className="relative lg:w-80">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics & subjects…"
              className="pl-10"
            />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-paper/12 bg-ink p-1 shadow-glow">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => pick(m.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-paper/[0.06]"
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          m.type === "subject"
                            ? "bg-paper"
                            : STATUS_DOT[m.status ?? "untouched"],
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-paper/80">
                        {m.label}
                      </span>
                      <span className="shrink-0 text-[0.65rem] text-paper/35">
                        {m.type === "subject" ? "Subject" : m.subjectName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* subject filter */}
          <div className="relative">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              disabled={!showTopics}
              className={cn(
                "h-10 appearance-none rounded-xl border border-paper/12 bg-paper/[0.03] pl-3.5 pr-9 text-sm text-paper focus:border-paper/30 focus:outline-none disabled:opacity-40",
              )}
            >
              <option value="all">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
          </div>

          {/* toggles */}
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Chip active={showTopics} onClick={() => setShowTopics((v) => !v)}>
              <Eye className="mr-1 inline h-3.5 w-3.5" />
              {showTopics ? "Topics" : "Subjects only"}
            </Chip>
            <Chip
              active={localOnly}
              onClick={() => setLocalOnly((v) => !v)}
            >
              <Focus className="mr-1 inline h-3.5 w-3.5" />
              Local graph
            </Chip>
          </div>
        </div>
        {localOnly && !selectedId && (
          <p className="text-[0.7rem] text-paper/40">
            Local graph shows the neighbourhood of the selected node — pick a node to focus.
          </p>
        )}
      </Card>

      {/* Graph + detail */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <ForceGraph
            graph={graph}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showTopics={showTopics}
            subjectFilter={subjectFilter}
            localOnly={localOnly}
            focusId={focusId}
            focusNonce={focusNonce}
            searchMatches={searchMatches}
            height={isDesktop ? 600 : 440}
          />
        </Card>
        <div className="lg:col-span-1">
          <NodeDetail
            graph={graph}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) {
                setFocusId(id);
                setFocusNonce((x) => x + 1);
              }
            }}
          />
        </div>
      </div>

      {/* Analytics */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Knowledge density"
          title="How connected is your understanding?"
          description="A sparse graph means siloed knowledge. The denser and more revised the web, the more exam-ready you are."
        />
        <KnowledgeDensity graph={graph} onSelect={pick} />
      </section>
    </div>
  );
}
