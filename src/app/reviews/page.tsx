"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Flag,
  Clock,
  Star,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { ReviewType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Segmented, EmptyState } from "@/components/ui/misc";
import { formatDate, cn } from "@/lib/utils";

const LISTS = [
  { key: "wins", label: "Wins", icon: Trophy },
  { key: "struggles", label: "Struggles", icon: AlertTriangle },
  { key: "lessons", label: "Lessons", icon: Lightbulb },
  { key: "nextFocus", label: "Next focus", icon: Flag },
] as const;

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < value ? "fill-paper text-paper" : "text-paper/20",
          )}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const hydrated = useHasHydrated();
  const reviews = useChronicle((s) => s.reviews);
  const [type, setType] = useState<ReviewType>("Weekly");

  const filtered = useMemo(
    () =>
      [...reviews]
        .filter((r) => r.type === type)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [reviews, type],
  );

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reviews"
        title="Zoom out. See the arc."
        description="The daily grind hides the progress. Weekly, monthly and yearly reviews are where you connect the dots and recalibrate."
      />

      <Segmented
        value={type}
        onChange={(v) => setType(v as ReviewType)}
        options={[
          { label: "Weekly", value: "Weekly" },
          { label: "Monthly", value: "Monthly" },
          { label: "Yearly", value: "Yearly" },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-5 w-5" />}
          title={`No ${type.toLowerCase()} reviews yet`}
          description="Reviews appear here as you reflect on each period."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <Card key={r.id} className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper/[0.06] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-paper">
                      {r.periodLabel}
                    </h3>
                    <Badge tone="outline">{r.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-paper/40">
                    {formatDate(r.startDate)} — {formatDate(r.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {r.totalHours !== undefined && (
                    <div className="flex items-center gap-1.5 text-sm text-paper/60">
                      <Clock className="h-4 w-4 text-paper/40" />
                      <span className="tabular">{r.totalHours}h</span>
                    </div>
                  )}
                  {r.mocksTaken !== undefined && (
                    <div className="text-sm text-paper/60">
                      <span className="tabular">{r.mocksTaken}</span> mocks
                    </div>
                  )}
                  {r.rating !== undefined && <Stars value={r.rating} />}
                </div>
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {LISTS.map(({ key, label, icon: Icon }) => {
                  const items = r[key] as string[] | undefined;
                  if (!items?.length) return null;
                  return (
                    <div key={key}>
                      <div className="mb-2 flex items-center gap-2 text-paper/45">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-[0.7rem] font-medium uppercase tracking-wider">
                          {label}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((it, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm leading-relaxed text-paper/65"
                          >
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-paper/40" />
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
