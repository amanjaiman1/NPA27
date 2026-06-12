"use client";

import { useMemo } from "react";
import { Check, X, Repeat, CalendarClock, Gauge, Layers } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { toISODate, daysBetween, formatDate, cn, avg, round } from "@/lib/utils";

function ConfidencePips({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < value ? "bg-paper" : "bg-paper/15",
          )}
        />
      ))}
    </span>
  );
}

export default function RevisionPage() {
  const hydrated = useHasHydrated();
  const revisions = useChronicle((s) => s.revisions);
  const subjects = useChronicle((s) => s.subjects);
  const revise = useChronicle((s) => s.reviseItem);

  const today = toISODate(new Date());
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  const { due, upcoming, stats } = useMemo(() => {
    const due = revisions
      .filter((r) => r.nextDue <= today)
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    const upcoming = revisions
      .filter((r) => r.nextDue > today)
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    const weekAway = upcoming.filter(
      (r) => daysBetween(today, r.nextDue) <= 7,
    ).length;
    return {
      due,
      upcoming,
      stats: {
        due: due.length,
        week: weekAway,
        confidence: round(avg(revisions.map((r) => r.confidence)), 1),
        total: revisions.length,
      },
    };
  }, [revisions, today]);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revision Tracker"
        title="The exam is won in revision."
        description="Spaced repetition turns fragile memory into permanent recall. Review what's due, and the system schedules the next pass for you."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Repeat, label: "Due now", value: stats.due },
          { icon: CalendarClock, label: "Next 7 days", value: stats.week },
          { icon: Gauge, label: "Avg confidence", value: `${stats.confidence}/5` },
          { icon: Layers, label: "Total items", value: stats.total },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <s.icon className="h-4 w-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-paper">
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Due now */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-snugg text-paper">
          Due for review
        </h2>
        {due.length === 0 ? (
          <EmptyState
            icon={<Check className="h-5 w-5" />}
            title="Inbox zero on revision"
            description="Nothing is due right now. Come back when the next item ripens."
          />
        ) : (
          <div className="space-y-2.5">
            {due.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper/[0.06] text-[0.6rem] font-semibold text-paper/60">
                      R{r.repetitions}
                    </span>
                    <p className="min-w-0 truncate text-sm font-medium text-paper">
                      {r.topic}
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-9 text-[0.7rem] text-paper/45">
                    <span>{name(r.subjectId)}</span>
                    <ConfidencePips value={r.confidence} />
                    <span>last: {r.lastRevised ? formatDate(r.lastRevised) : "never"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => revise(r.id, false)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-paper/12 px-3 py-1.5 text-xs font-medium text-paper/60 transition-colors hover:border-paper/30 hover:text-paper"
                  >
                    <X className="h-3.5 w-3.5" /> Forgot
                  </button>
                  <button
                    onClick={() => revise(r.id, true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-opacity hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" /> Recalled
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-snugg text-paper">
            Scheduled ahead
          </h2>
          <Card className="divide-y divide-paper/[0.05]">
            {upcoming.map((r) => {
              const inDays = daysBetween(today, r.nextDue);
              return (
                <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-paper/80">{r.topic}</p>
                    <p className="text-[0.7rem] text-paper/40">{name(r.subjectId)}</p>
                  </div>
                  <ConfidencePips value={r.confidence} />
                  <Badge tone="outline">
                    in {inDays}d · {formatDate(r.nextDue)}
                  </Badge>
                </div>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}
