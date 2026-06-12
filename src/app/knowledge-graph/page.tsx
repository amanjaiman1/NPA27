"use client";

import { useMemo, useState } from "react";
import { Network, Sparkles } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const W = 900;
const H = 560;
const CX = W / 2;
const CY = H / 2;

export default function KnowledgeGraphPage() {
  const hydrated = useHasHydrated();
  const graph = useChronicle((s) => s.graph);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const subs = graph.nodes.filter((n) => n.type === "subject");
    const concepts = graph.nodes.filter((n) => n.type !== "subject");
    subs.forEach((n, i) => {
      const a = (i / subs.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.id, { x: CX + Math.cos(a) * 210, y: CY + Math.sin(a) * 210 });
    });
    concepts.forEach((n, i) => {
      const a = (i / Math.max(concepts.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.id, { x: CX + Math.cos(a) * 95, y: CY + Math.sin(a) * 95 });
    });
    return pos;
  }, [graph]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graph.edges.forEach((e) => {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    });
    return map;
  }, [graph]);

  const focus = hover ?? selected;
  const neighbors = focus ? adjacency.get(focus) ?? new Set() : null;
  const nodeById = (id: string) => graph.nodes.find((n) => n.id === id);

  const sortedByStrength = [...graph.nodes]
    .filter((n) => n.type === "subject")
    .sort((a, b) => b.strength - a.strength);

  if (!hydrated) return <Loading />;

  const selNode = selected ? nodeById(selected) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="UPSC Knowledge Graph"
        title="The syllabus is a web, not a list."
        description="Every subject connects to others. Hover a node to trace its links; click to inspect. Brighter nodes mean stronger mastery."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full"
            style={{ minHeight: 380 }}
          >
            {/* edges */}
            {graph.edges.map((e) => {
              const a = positions.get(e.source);
              const b = positions.get(e.target);
              if (!a || !b) return null;
              const active =
                focus && (e.source === focus || e.target === focus);
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="rgb(var(--paper))"
                  strokeOpacity={active ? 0.5 : focus ? 0.05 : 0.12}
                  strokeWidth={active ? 1.5 : 1}
                />
              );
            })}

            {/* nodes */}
            {graph.nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const isSubject = n.type === "subject";
              const r = isSubject ? 7 + (n.strength / 100) * 9 : 5 + (n.strength / 100) * 5;
              const dim = focus && focus !== n.id && !neighbors?.has(n.id);
              const op = 0.25 + (n.strength / 100) * 0.75;
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(selected === n.id ? null : n.id)}
                  className="cursor-pointer"
                  style={{ opacity: dim ? 0.2 : 1, transition: "opacity 0.2s" }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill="rgb(var(--paper))"
                    fillOpacity={isSubject ? op : 0.15}
                    stroke="rgb(var(--paper))"
                    strokeOpacity={isSubject ? 0.9 : op}
                    strokeWidth={isSubject ? 0 : 1.5}
                  />
                  {(isSubject || focus === n.id || neighbors?.has(n.id)) && (
                    <text
                      x={p.x}
                      y={p.y + r + 12}
                      textAnchor="middle"
                      fill="rgb(var(--paper))"
                      fillOpacity={0.6}
                      style={{ fontSize: 11 }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            {selNode ? (
              <>
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-paper/45" />
                  <h3 className="text-base font-semibold text-paper">
                    {selNode.label}
                  </h3>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone="outline" className="capitalize">
                    {selNode.type}
                  </Badge>
                  <Badge tone="default">{selNode.strength}% mastery</Badge>
                </div>
                <p className="mt-4 text-[0.7rem] font-medium uppercase tracking-wider text-paper/40">
                  Connected to
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...(adjacency.get(selNode.id) ?? [])].map((id) => (
                    <button
                      key={id}
                      onClick={() => setSelected(id)}
                      className="rounded-full border border-paper/12 px-2.5 py-1 text-xs text-paper/60 transition-colors hover:border-paper/30 hover:text-paper"
                    >
                      {nodeById(id)?.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper text-ink">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-paper">
                    Explore the web
                  </h3>
                  <p className="mt-1 text-sm text-paper/50">
                    Click any node to see its mastery and connections. The strongest
                    subjects anchor the whole graph.
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-3">Mastery ranking</p>
            <ul className="space-y-2.5">
              {sortedByStrength.map((n) => (
                <li key={n.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-paper/70">
                    {n.label}
                  </span>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper/10">
                    <div
                      className="h-full rounded-full bg-paper"
                      style={{ width: `${n.strength}%` }}
                    />
                  </div>
                  <span className="tabular w-8 text-right text-xs text-paper/45">
                    {n.strength}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
