"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";

type SimNode = SimulationNodeDatum & { id: string };
interface SimLink {
  source: string;
  target: string;
}

export interface ForceInputNode {
  id: string;
}
export interface ForceInputLink {
  source: string;
  target: string;
}

export interface ForceLayout {
  /** Live position lookup, mutated in place each tick. */
  positions: Map<string, { x: number; y: number }>;
  tick: number;
  pin: (id: string, x: number, y: number) => void;
  release: (id: string) => void;
  reheat: (alpha?: number) => void;
  setDragging: (active: boolean) => void;
}

/**
 * Runs a d3-force simulation headlessly and exposes live node positions.
 * Positions persist across rebuilds by id, so filtering or adding a link
 * nudges the layout rather than reshuffling it.
 */
export function useForceLayout(
  nodes: ForceInputNode[],
  links: ForceInputLink[],
  opts: {
    width: number;
    height: number;
    charge?: number;
    linkDistance?: number;
    enabled?: boolean;
  },
): ForceLayout {
  const { width, height, charge = -170, linkDistance = 44, enabled = true } = opts;

  const positions = useRef(new Map<string, { x: number; y: number }>());
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const [tick, setTick] = useState(0);

  // Rebuild only when the node/link sets actually change.
  const sig = useMemo(
    () =>
      nodes.map((n) => n.id).join(",") +
      "|" +
      links.map((l) => `${l.source}>${l.target}`).join(","),
    [nodes, links],
  );

  useEffect(() => {
    if (!enabled || !width || !height) return;
    const cx = width / 2;
    const cy = height / 2;

    const simNodes: SimNode[] = nodes.map((n) => {
      const prev = positions.current.get(n.id);
      return {
        id: n.id,
        x: prev?.x ?? cx + (Math.random() - 0.5) * width * 0.7,
        y: prev?.y ?? cy + (Math.random() - 0.5) * height * 0.7,
      };
    });
    const simLinks: SimLink[] = links.map((l) => ({
      source: l.source,
      target: l.target,
    }));
    simNodesRef.current = simNodes;

    const commit = () => {
      for (const sn of simNodes) {
        positions.current.set(sn.id, { x: sn.x ?? cx, y: sn.y ?? cy });
      }
      setTick((t) => t + 1);
    };

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength(0.35),
      )
      .force("charge", forceManyBody<SimNode>().strength(charge).distanceMax(460))
      .force("center", forceCenter(cx, cy))
      .force("collide", forceCollide<SimNode>().radius(15))
      .force("x", forceX<SimNode>(cx).strength(0.045))
      .force("y", forceY<SimNode>(cy).strength(0.045))
      .alpha(0.9)
      .alphaDecay(0.04);

    sim.on("tick", commit);
    sim.on("end", commit);
    simRef.current = sim;

    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, width, height, enabled, charge, linkDistance]);

  const pin = useCallback((id: string, x: number, y: number) => {
    const sn = simNodesRef.current.find((n) => n.id === id);
    if (sn) {
      sn.fx = x;
      sn.fy = y;
      positions.current.set(id, { x, y });
    }
    setTick((t) => t + 1);
  }, []);

  const release = useCallback((id: string) => {
    const sn = simNodesRef.current.find((n) => n.id === id);
    if (sn) {
      sn.fx = null;
      sn.fy = null;
    }
  }, []);

  const reheat = useCallback((alpha = 0.5) => {
    simRef.current?.alphaTarget(0).alpha(alpha).restart();
  }, []);

  const setDragging = useCallback((active: boolean) => {
    if (!simRef.current) return;
    simRef.current.alphaTarget(active ? 0.18 : 0).restart();
  }, []);

  return { positions: positions.current, tick, pin, release, reheat, setDragging };
}
