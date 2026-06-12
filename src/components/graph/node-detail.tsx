"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Network,
  Sparkles,
  RotateCw,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Plus,
  Search,
  ChevronRight,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import {
  topicLinksFor,
  relatedSuggestions,
  type Graph,
} from "@/lib/graph";
import type { TopicStatus } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/form";
import { formatDate, cn } from "@/lib/utils";

const STATUSES: TopicStatus[] = ["untouched", "learning", "revised", "mastered"];
const STATUS_DOT: Record<TopicStatus, string> = {
  untouched: "bg-paper/15",
  learning: "bg-paper/35",
  revised: "bg-paper/65",
  mastered: "bg-paper",
};

function StatusDot({ status }: { status?: TopicStatus }) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_DOT[status ?? "untouched"])}
    />
  );
}

export function NodeDetail({
  graph,
  selectedId,
  onSelect,
}: {
  graph: Graph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const reviseTopic = useChronicle((s) => s.reviseTopic);
  const setStatus = useChronicle((s) => s.setTopicStatusById);
  const addTopicLink = useChronicle((s) => s.addTopicLink);
  const removeTopicLink = useChronicle((s) => s.removeTopicLink);
  const [linkQuery, setLinkQuery] = useState("");

  const node = selectedId ? graph.byId.get(selectedId) : null;

  if (!node) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper text-ink">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-paper">Explore the web</h3>
            <p className="mt-1 text-sm leading-relaxed text-paper/50">
              Click any node to inspect it — its mastery, revision history, links
              and backlinks — and to wire it to related topics.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (node.type === "subject") {
    const topics = graph.nodes.filter(
      (n) => n.type === "topic" && n.subjectId === node.id,
    );
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-paper/45" />
          <h3 className="text-base font-semibold text-paper">{node.label}</h3>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone="outline">{node.paper}</Badge>
          <Badge tone="default">{node.confidence}% mastery</Badge>
          <Badge tone="ghost">{topics.length} topics</Badge>
        </div>
        <div className="mt-4 space-y-1">
          {topics.map((tp) => (
            <button
              key={tp.id}
              onClick={() => onSelect(tp.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.05]"
            >
              <StatusDot status={tp.status} />
              <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                {tp.label}
              </span>
              <span className="tabular text-[0.7rem] text-paper/40">
                {tp.degree} links
              </span>
            </button>
          ))}
        </div>
        <Link
          href="/subjects"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-paper/60 hover:text-paper"
        >
          Open in Subject Progress <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    );
  }

  // topic node
  const { outgoing, incoming } = topicLinksFor(graph, node.id);
  const suggestions = relatedSuggestions(graph, node.id, 6);
  const linked = new Set<string>([
    node.id,
    ...(graph.related.get(node.id) ?? []),
  ]);
  const q = linkQuery.trim().toLowerCase();
  const candidates = q
    ? graph.nodes
        .filter(
          (n) =>
            n.type === "topic" &&
            !linked.has(n.id) &&
            n.label.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];

  const otherId = (l: { source: string; target: string }) =>
    l.source === node.id ? l.target : l.source;

  return (
    <Card className="flex flex-col gap-5 p-5">
      {/* header */}
      <div>
        <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
          {node.subjectName}
        </p>
        <h3 className="mt-0.5 text-lg font-semibold text-paper">{node.label}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/12 px-2.5 py-1 text-xs text-paper/70">
            <StatusDot status={node.status} />
            <span className="capitalize">{node.status}</span>
          </span>
          <span className="rounded-full bg-paper/[0.06] px-2.5 py-1 text-xs text-paper/70">
            {node.degree} connections
          </span>
        </div>
      </div>

      {/* confidence + revision */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-paper/45">
            <span>Confidence</span>
            <span className="tabular">{node.confidence}%</span>
          </div>
          <Progress value={node.confidence} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-paper/[0.08] bg-paper/[0.03] px-3 py-2.5">
          <div>
            <p className="tabular text-sm font-semibold text-paper">
              {node.revisionCount} revisions
            </p>
            <p className="text-[0.7rem] text-paper/40">
              {node.lastTouched ? `last ${formatDate(node.lastTouched)}` : "never revised"}
            </p>
          </div>
          <button
            onClick={() => reviseTopic(node.id)}
            className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-opacity hover:opacity-90"
          >
            <RotateCw className="h-3.5 w-3.5" /> Mark revised
          </button>
        </div>
      </div>

      {/* status control */}
      <div>
        <p className="mb-1.5 text-[0.7rem] uppercase tracking-wider text-paper/40">
          Set status
        </p>
        <div className="grid grid-cols-4 gap-1">
          {STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => setStatus(node.id, st)}
              className={cn(
                "rounded-lg border px-1 py-1.5 text-[0.65rem] capitalize transition-all",
                node.status === st
                  ? "border-paper/30 bg-paper text-ink"
                  : "border-paper/12 text-paper/45 hover:border-paper/25",
              )}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* outgoing links */}
      {outgoing.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wider text-paper/40">
            <ArrowUpRight className="h-3.5 w-3.5" /> Links out
          </p>
          <ul className="space-y-1">
            {outgoing.map((l) => {
              const o = graph.byId.get(otherId(l));
              if (!o) return null;
              return (
                <li key={l.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => onSelect(o.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.05]"
                  >
                    <StatusDot status={o.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                      {o.label}
                    </span>
                    {l.relation && (
                      <span className="shrink-0 text-[0.6rem] text-paper/35">
                        {l.relation}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => removeTopicLink(l.id)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-paper/25 opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* backlinks */}
      {incoming.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wider text-paper/40">
            <ArrowDownLeft className="h-3.5 w-3.5" /> Backlinks
          </p>
          <ul className="space-y-1">
            {incoming.map((l) => {
              const o = graph.byId.get(otherId(l));
              if (!o) return null;
              return (
                <li key={l.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => onSelect(o.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.05]"
                  >
                    <StatusDot status={o.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                      {o.label}
                    </span>
                    {l.relation && (
                      <span className="shrink-0 text-[0.6rem] text-paper/35">
                        {l.relation}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => removeTopicLink(l.id)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-paper/25 opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* related suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[0.7rem] uppercase tracking-wider text-paper/40">
            Suggested links
          </p>
          <ul className="space-y-1">
            {suggestions.map((s) => (
              <li key={s.node.id} className="flex items-center gap-2">
                <button
                  onClick={() => onSelect(s.node.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.05]"
                >
                  <StatusDot status={s.node.status} />
                  <span className="min-w-0 flex-1 truncate text-sm text-paper/70">
                    {s.node.label}
                  </span>
                  <span className="shrink-0 text-[0.6rem] text-paper/35">
                    {s.reason}
                  </span>
                </button>
                <button
                  onClick={() => addTopicLink(node.id, s.node.id)}
                  title="Create link"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-paper/40 transition-colors hover:bg-paper/10 hover:text-paper"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* add link search */}
      <div>
        <p className="mb-2 text-[0.7rem] uppercase tracking-wider text-paper/40">
          Link to a topic
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
          <Input
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            placeholder="Search topics to link…"
            className="pl-9"
          />
        </div>
        {candidates.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 rounded-xl border border-paper/10 bg-paper/[0.02] p-1">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    addTopicLink(node.id, c.id);
                    setLinkQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.06]"
                >
                  <StatusDot status={c.status} />
                  <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                    {c.label}
                  </span>
                  <span className="shrink-0 text-[0.6rem] text-paper/35">
                    {c.subjectName}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper/30" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
