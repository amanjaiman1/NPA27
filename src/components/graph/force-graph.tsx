"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Minus, Maximize, Locate } from "lucide-react";
import { useMeasure } from "@/lib/hooks";
import { neighborhood, type Graph, type GLink, type GNode } from "@/lib/graph";
import { useForceLayout } from "./use-force-layout";

const STATUS_RING: Record<string, number> = {
  mastered: 1,
  revised: 0.7,
  learning: 0.42,
  untouched: 0.18,
};

interface Transform {
  x: number;
  y: number;
  k: number;
}

export function ForceGraph({
  graph,
  selectedId,
  onSelect,
  showTopics,
  subjectFilter,
  localOnly,
  focusId,
  focusNonce,
  searchMatches,
  height = 560,
}: {
  graph: Graph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showTopics: boolean;
  subjectFilter: string; // "all" | subjectId
  localOnly: boolean;
  focusId: string | null;
  focusNonce?: number;
  searchMatches: Set<string> | null;
  height?: number;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    mode: "pan" | "node";
    id?: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  /* Visible subset based on the active view mode. */
  const view = useMemo(() => {
    let nodeIds: Set<string>;
    let links: GLink[];

    if (!showTopics) {
      const subjIds = graph.nodes
        .filter((n) => n.type === "subject")
        .map((n) => n.id);
      nodeIds = new Set(subjIds);
      const agg = new Map<string, GLink>();
      for (const l of graph.links) {
        if (l.kind !== "related") continue;
        const a = graph.byId.get(l.source)?.subjectId;
        const b = graph.byId.get(l.target)?.subjectId;
        if (!a || !b || a === b) continue;
        const key = [a, b].sort().join("|");
        if (!agg.has(key))
          agg.set(key, { id: `agg:${key}`, source: a, target: b, kind: "related" });
      }
      links = [...agg.values()];
    } else if (subjectFilter !== "all") {
      const base = new Set<string>([subjectFilter]);
      graph.nodes.forEach((n) => {
        if (n.type === "topic" && n.subjectId === subjectFilter) base.add(n.id);
      });
      graph.links.forEach((l) => {
        if (l.kind !== "related") return;
        if (base.has(l.source)) base.add(l.target);
        if (base.has(l.target)) base.add(l.source);
      });
      nodeIds = base;
      links = graph.links.filter(
        (l) => nodeIds.has(l.source) && nodeIds.has(l.target),
      );
    } else if (localOnly && selectedId) {
      nodeIds = neighborhood(graph, selectedId, 1);
      links = graph.links.filter(
        (l) => nodeIds.has(l.source) && nodeIds.has(l.target),
      );
    } else {
      nodeIds = new Set(graph.nodes.map((n) => n.id));
      links = graph.links;
    }

    const nodes = graph.nodes.filter((n) => nodeIds.has(n.id));
    return { nodes, links };
  }, [graph, showTopics, subjectFilter, localOnly, selectedId]);

  const { positions, tick, pin, release, setDragging } = useForceLayout(
    view.nodes,
    view.links,
    { width, height, enabled: width > 0 },
  );

  const focus = hovered ?? selectedId;
  const focusNeighbors = useMemo(
    () => (focus ? graph.all.get(focus) ?? new Set<string>() : null),
    [focus, graph],
  );

  /* Center the view on a focused (searched) node when explicitly requested. */
  useEffect(() => {
    if (!focusId || !width) return;
    const p = positions.get(focusId);
    if (!p) return;
    const k = 1.5;
    setT({ k, x: width / 2 - p.x * k, y: height / 2 - p.y * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  /* Non-passive wheel zoom. */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setT((prev) => {
        const k = Math.min(Math.max(prev.k * factor, 0.3), 3.5);
        return {
          k,
          x: px - (px - prev.x) * (k / prev.k),
          y: py - (py - prev.y) * (k / prev.k),
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const localPoint = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const toGraph = (lx: number, ly: number) => ({
    x: (lx - t.x) / t.k,
    y: (ly - t.y) / t.k,
  });

  const onNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "node",
      id,
      sx: e.clientX,
      sy: e.clientY,
      ox: 0,
      oy: 0,
      moved: false,
    };
    setDragging(true);
  };
  const onBgDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "pan",
      sx: e.clientX,
      sy: e.clientY,
      ox: t.x,
      oy: t.y,
      moved: false,
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.mode === "pan") {
      setT((prev) => ({ ...prev, x: d.ox + dx, y: d.oy + dy }));
    } else if (d.mode === "node" && d.id) {
      const lp = localPoint(e.clientX, e.clientY);
      const g = toGraph(lp.x, lp.y);
      pin(d.id, g.x, g.y);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.mode === "node" && d.id) {
      if (!d.moved) onSelect(selectedId === d.id ? null : d.id);
      release(d.id);
      setDragging(false);
    } else if (d.mode === "pan" && !d.moved) {
      onSelect(null);
    }
  };

  const zoomBy = (factor: number) =>
    setT((prev) => {
      const k = Math.min(Math.max(prev.k * factor, 0.3), 3.5);
      const px = width / 2;
      const py = height / 2;
      return {
        k,
        x: px - (px - prev.x) * (k / prev.k),
        y: py - (py - prev.y) * (k / prev.k),
      };
    });

  const fit = useCallback(() => {
    const pts = view.nodes
      .map((n) => positions.get(n.id))
      .filter((p): p is { x: number; y: number } => !!p);
    if (!pts.length || !width) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 50;
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const k = Math.min(
      Math.max(Math.min((width - pad * 2) / bw, (height - pad * 2) / bh), 0.3),
      2,
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setT({ k, x: width / 2 - cx * k, y: height / 2 - cy * k });
  }, [view.nodes, positions, width, height]);

  function nodeRadius(n: GNode) {
    if (n.type === "subject") return 11 + Math.min(n.degree, 10) * 0.5;
    return 4 + Math.min(n.degree, 6) * 1.1;
  }

  const hasSearch = !!searchMatches && searchMatches.size > 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {/* Controls */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        {[
          { icon: Plus, fn: () => zoomBy(1.2), label: "Zoom in" },
          { icon: Minus, fn: () => zoomBy(1 / 1.2), label: "Zoom out" },
          { icon: Maximize, fn: fit, label: "Fit" },
          { icon: Locate, fn: () => setT({ x: 0, y: 0, k: 1 }), label: "Reset" },
        ].map((b, i) => (
          <button
            key={i}
            onClick={b.fn}
            title={b.label}
            className="grid h-8 w-8 place-items-center rounded-lg border border-paper/12 bg-ink/70 text-paper/60 backdrop-blur transition-colors hover:border-paper/25 hover:text-paper"
          >
            <b.icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {width > 0 && (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="touch-none select-none"
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{ cursor: dragRef.current?.mode === "pan" ? "grabbing" : "grab" }}
        >
          <rect width={width} height={height} fill="transparent" />
          <g data-tick={tick} transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
            {/* links */}
            {view.links.map((l) => {
              const a = positions.get(l.source);
              const b = positions.get(l.target);
              if (!a || !b) return null;
              const active =
                focus && (l.source === focus || l.target === focus);
              return (
                <line
                  key={l.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="rgb(var(--paper))"
                  strokeOpacity={
                    active ? 0.55 : focus ? 0.05 : l.kind === "contains" ? 0.07 : 0.16
                  }
                  strokeWidth={(active ? 1.6 : l.kind === "contains" ? 0.8 : 1) / t.k}
                  strokeDasharray={l.kind === "contains" ? `${3 / t.k} ${3 / t.k}` : undefined}
                />
              );
            })}

            {/* nodes */}
            {view.nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const r = nodeRadius(n);
              const isSubject = n.type === "subject";
              const dimByFocus =
                focus && focus !== n.id && !focusNeighbors?.has(n.id);
              const dimBySearch = hasSearch && !searchMatches!.has(n.id);
              const dim = dimByFocus || dimBySearch;
              const selected = selectedId === n.id;
              const showLabel =
                isSubject ||
                selected ||
                hovered === n.id ||
                focusNeighbors?.has(n.id) ||
                t.k >= 1.45 ||
                (hasSearch && searchMatches!.has(n.id));
              const fillOp = isSubject ? 0.92 : 0.22 + (n.confidence / 100) * 0.6;
              const ringOp = isSubject
                ? 0
                : STATUS_RING[n.status ?? "untouched"] ?? 0.2;

              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  onPointerDown={(e) => onNodeDown(e, n.id)}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    opacity: dim ? 0.15 : 1,
                    transition: "opacity 0.2s",
                    cursor: "pointer",
                  }}
                >
                  {selected && (
                    <circle
                      r={(r + 5) }
                      fill="none"
                      stroke="rgb(var(--paper))"
                      strokeOpacity={0.9}
                      strokeWidth={1.5 / t.k}
                    />
                  )}
                  <circle
                    r={r}
                    fill="rgb(var(--paper))"
                    fillOpacity={fillOp}
                    stroke="rgb(var(--paper))"
                    strokeOpacity={ringOp}
                    strokeWidth={1.6 / t.k}
                  />
                  {showLabel && (
                    <text
                      y={r + 11 / t.k}
                      textAnchor="middle"
                      fill="rgb(var(--paper))"
                      fillOpacity={isSubject ? 0.85 : 0.6}
                      style={{
                        fontSize: (isSubject ? 12 : 10) / t.k,
                        fontWeight: isSubject ? 600 : 400,
                        pointerEvents: "none",
                      }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6rem] text-paper/40">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-paper" /> Subject
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-paper bg-paper/40" />
          Topic · brighter = higher confidence
        </span>
      </div>
    </div>
  );
}
