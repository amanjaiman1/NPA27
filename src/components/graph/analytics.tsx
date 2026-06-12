"use client";

import {
  Share2,
  Gauge,
  Sparkles,
  Unlink,
  RotateCw,
  Layers,
} from "lucide-react";
import {
  graphDensity,
  completionBreakdown,
  revisionCoverage,
  hubs,
  orphans,
  subjectConnectivity,
  type Graph,
} from "@/lib/graph";
import type { TopicStatus } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { RadialProgress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STATUS_SHADE: Record<TopicStatus, string> = {
  untouched: "bg-paper/15",
  learning: "bg-paper/35",
  revised: "bg-paper/65",
  mastered: "bg-paper",
};
const STATUS_ORDER: TopicStatus[] = ["mastered", "revised", "learning", "untouched"];

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-paper/40">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[0.65rem] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="tabular mt-2 text-2xl font-semibold text-paper">{value}</p>
      {hint && <p className="mt-0.5 text-[0.7rem] text-paper/40">{hint}</p>}
    </Card>
  );
}

export function KnowledgeDensity({
  graph,
  onSelect,
}: {
  graph: Graph;
  onSelect: (id: string) => void;
}) {
  const d = graphDensity(graph);
  const completion = completionBreakdown(graph);
  const revision = revisionCoverage(graph, 6);
  const topHubs = hubs(graph, 6);
  const orphanList = orphans(graph);
  const subjects = subjectConnectivity(graph);
  const totalTopics = d.topics || 1;

  return (
    <div className="space-y-4">
      {/* density stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat icon={Layers} label="Topics" value={`${d.topics}`} hint={`${d.subjects} subjects`} />
        <MiniStat icon={Share2} label="Links" value={`${d.relatedLinks}`} hint="topic ↔ topic" />
        <MiniStat icon={Gauge} label="Avg degree" value={`${d.avgDegree}`} hint="links per topic" />
        <MiniStat icon={Gauge} label="Density" value={`${d.linkDensity}`} hint="links / topic" />
        <MiniStat icon={Share2} label="Connected" value={`${d.connectedPct}%`} hint="topics linked" />
        <MiniStat icon={Unlink} label="Orphans" value={`${d.orphanCount}`} hint="no links yet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* completion distribution */}
        <Card className="p-5">
          <p className="eyebrow mb-3">Completion</p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper/[0.06]">
            {STATUS_ORDER.map((st) =>
              completion[st] ? (
                <div
                  key={st}
                  className={STATUS_SHADE[st]}
                  style={{ width: `${(completion[st] / totalTopics) * 100}%` }}
                  title={`${st}: ${completion[st]}`}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-3 space-y-1.5">
            {STATUS_ORDER.map((st) => (
              <li key={st} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_SHADE[st])} />
                <span className="flex-1 capitalize text-paper/65">{st}</span>
                <span className="tabular text-paper/45">{completion[st]}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* revision coverage */}
        <Card className="p-5">
          <p className="eyebrow mb-3">Revision coverage</p>
          <div className="flex items-center gap-4">
            <RadialProgress
              value={revision.coveredPct}
              size={72}
              stroke={6}
              label={`${revision.coveredPct}%`}
            />
            <div className="text-sm text-paper/55">
              <p>
                <span className="tabular font-semibold text-paper">
                  {revision.revisedAtLeastOnce}
                </span>{" "}
                of {revision.total} topics
              </p>
              <p className="text-xs text-paper/40">revised at least once</p>
            </div>
          </div>
          <p className="mt-4 mb-1.5 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wider text-paper/40">
            <RotateCw className="h-3 w-3" /> Needs revision
          </p>
          <div className="flex flex-wrap gap-1.5">
            {revision.least.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className="rounded-full border border-paper/12 px-2.5 py-1 text-xs text-paper/60 transition-colors hover:border-paper/30 hover:text-paper"
              >
                {n.label}
              </button>
            ))}
          </div>
        </Card>

        {/* hubs */}
        <Card className="p-5">
          <p className="eyebrow mb-3 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Most connected
          </p>
          <ul className="space-y-1">
            {topHubs.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onSelect(n.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.05]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                    {n.label}
                  </span>
                  <span className="text-[0.65rem] text-paper/40">{n.subjectName}</span>
                  <span className="tabular w-6 text-right text-xs font-semibold text-paper">
                    {n.degree}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* subject connectivity */}
      <Card className="p-5">
        <p className="eyebrow mb-3">Knowledge density by subject</p>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.04]"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-paper/70">
                {s.name}
              </span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper/10">
                <div
                  className="h-full rounded-full bg-paper"
                  style={{ width: `${s.mastery}%` }}
                />
              </div>
              <span className="tabular w-14 shrink-0 text-right text-[0.7rem] text-paper/45">
                {s.links} links
              </span>
            </button>
          ))}
        </div>
        {orphanList.length > 0 && (
          <div className="mt-4 border-t border-paper/[0.06] pt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wider text-paper/40">
              <Unlink className="h-3 w-3" /> Orphan topics · {orphanList.length}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {orphanList.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  onClick={() => onSelect(n.id)}
                  className="rounded-full border border-dashed border-paper/15 px-2.5 py-1 text-xs text-paper/55 transition-colors hover:border-paper/30 hover:text-paper"
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
