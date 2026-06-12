"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Layers } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { PaperCode, TopicStatus, Subject } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadialProgress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/misc";
import { subjectMastery, hoursBySubject } from "@/lib/selectors";
import { toISODate, cn } from "@/lib/utils";

const PAPER_ORDER: PaperCode[] = [
  "GS1",
  "GS2",
  "GS3",
  "GS4",
  "Essay",
  "CSAT",
  "Optional",
  "CurrentAffairs",
];
const PAPER_LABEL: Record<PaperCode, string> = {
  GS1: "General Studies I",
  GS2: "General Studies II",
  GS3: "General Studies III",
  GS4: "Ethics (GS IV)",
  Essay: "Essay",
  CSAT: "CSAT",
  Optional: "Optional",
  CurrentAffairs: "Current Affairs",
};

const STATUS_ORDER: TopicStatus[] = [
  "untouched",
  "learning",
  "revised",
  "mastered",
];
const STATUS_CONF: Record<TopicStatus, number> = {
  untouched: 10,
  learning: 40,
  revised: 68,
  mastered: 92,
};
const STATUS_SHADE: Record<TopicStatus, string> = {
  untouched: "bg-paper/10",
  learning: "bg-paper/35",
  revised: "bg-paper/65",
  mastered: "bg-paper",
};

function SubjectCard({ subject, hours }: { subject: Subject; hours: number }) {
  const updateTopic = useChronicle((s) => s.updateTopic);
  const [open, setOpen] = useState(false);
  const mastery = subjectMastery(subject);
  const counts = subject.topics.reduce(
    (acc, t) => {
      acc[t.status]++;
      return acc;
    },
    { untouched: 0, learning: 0, revised: 0, mastered: 0 } as Record<TopicStatus, number>,
  );

  function cycle(topicId: string, current: TopicStatus) {
    const next =
      STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    updateTopic(subject.id, topicId, {
      status: next,
      confidence: STATUS_CONF[next],
      lastTouched: toISODate(new Date()),
    });
  }

  return (
    <Card hover className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 p-5 text-left"
      >
        <RadialProgress value={mastery} size={56} stroke={5} label={`${mastery}`} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-paper">
            {subject.name}
          </h3>
          <p className="mt-0.5 text-xs text-paper/40">
            {subject.topics.length} topics · {Math.round(hours)}h studied
          </p>
          {/* status mini-bar */}
          <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-paper/[0.06]">
            {STATUS_ORDER.map((st) =>
              counts[st] ? (
                <div
                  key={st}
                  className={STATUS_SHADE[st]}
                  style={{
                    width: `${(counts[st] / subject.topics.length) * 100}%`,
                  }}
                />
              ) : null,
            )}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-paper/30 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-paper/[0.06] px-5 py-4">
          <p className="mb-3 text-[0.7rem] text-paper/40">
            Tap a topic to advance its status →
          </p>
          <div className="space-y-1.5">
            {subject.topics.map((t) => (
              <button
                key={t.id}
                onClick={() => cycle(t.id, t.status)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper/[0.04]"
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-sm",
                    STATUS_SHADE[t.status],
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                  {t.name}
                </span>
                <span className="text-[0.65rem] capitalize text-paper/40">
                  {t.status}
                </span>
                <span className="tabular w-9 text-right text-[0.7rem] text-paper/50">
                  {t.confidence}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SubjectsPage() {
  const hydrated = useHasHydrated();
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const [filter, setFilter] = useState<"all" | PaperCode>("all");

  const hoursMap = useMemo(() => {
    const m = new Map<string, number>();
    hoursBySubject(journal, subjects).forEach((s) => m.set(s.subjectId, s.hours));
    return m;
  }, [journal, subjects]);

  const overall = useMemo(() => {
    const all = subjects.flatMap((s) => s.topics);
    if (!all.length) return 0;
    return Math.round(all.reduce((a, t) => a + t.confidence, 0) / all.length);
  }, [subjects]);

  const mastered = useMemo(
    () =>
      subjects
        .flatMap((s) => s.topics)
        .filter((t) => t.status === "mastered").length,
    [subjects],
  );
  const totalTopics = useMemo(
    () => subjects.flatMap((s) => s.topics).length,
    [subjects],
  );

  const visiblePapers = PAPER_ORDER.filter(
    (p) => filter === "all" || p === filter,
  ).filter((p) => subjects.some((s) => s.paper === p));

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subject Progress"
        title="The syllabus, mastered piece by piece."
        description="Track every subject from untouched to mastered. Confidence is earned through revision, not first contact."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-5">
          <RadialProgress
            value={overall}
            size={72}
            stroke={6}
            label={`${overall}%`}
            sublabel="overall"
          />
          <div>
            <p className="text-sm font-semibold text-paper">Syllabus confidence</p>
            <p className="text-xs text-paper/45">
              Weighted across all topics
            </p>
          </div>
        </Card>
        <Card className="flex flex-col justify-center p-5">
          <p className="tabular text-2xl font-semibold text-paper">
            {mastered}/{totalTopics}
          </p>
          <p className="mt-1 text-xs text-paper/45">topics mastered</p>
        </Card>
        <Card className="flex flex-col justify-center p-5">
          <p className="tabular text-2xl font-semibold text-paper">
            {subjects.length}
          </p>
          <p className="mt-1 text-xs text-paper/45">subjects tracked</p>
        </Card>
      </div>

      <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as "all" | PaperCode)}
          options={[
            { label: "All", value: "all" },
            ...PAPER_ORDER.filter((p) =>
              subjects.some((s) => s.paper === p),
            ).map((p) => ({ label: p, value: p })),
          ]}
        />
      </div>

      <div className="space-y-8">
        {visiblePapers.map((paper) => {
          const subs = subjects.filter((s) => s.paper === paper);
          return (
            <div key={paper}>
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-paper/40" />
                <h2 className="text-sm font-semibold tracking-snugg text-paper">
                  {PAPER_LABEL[paper]}
                </h2>
                <Badge tone="ghost">{subs.length}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {subs.map((s) => (
                  <SubjectCard
                    key={s.id}
                    subject={s}
                    hours={hoursMap.get(s.id) ?? 0}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
