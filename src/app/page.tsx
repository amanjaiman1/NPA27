"use client";

import { useHasHydrated } from "@/lib/store";
import { Loading } from "@/components/ui/loading";
import {
  CommandPanel,
  StatStrip,
  HeatmapCard,
  TrendCard,
  TodayCard,
  FocusDonut,
  RevisionDueCard,
  MockMomentumCard,
  GoalsCard,
  MilestonesMini,
  CoachNudge,
  ThisWeekCard,
} from "@/components/dashboard/widgets";

export default function CommandCenter() {
  const hydrated = useHasHydrated();
  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-4">
      <CommandPanel />
      {/* Phones only: above `sm` these four numbers sit inside the panel. */}
      <StatStrip />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <HeatmapCard />
          <div className="grid gap-4 sm:grid-cols-2">
            <TrendCard />
            <FocusDonut />
          </div>
          <CoachNudge />
        </div>

        <div className="space-y-4">
          <TodayCard />
          <ThisWeekCard />
          <MockMomentumCard />
          <RevisionDueCard />
          <GoalsCard />
          <MilestonesMini />
        </div>
      </div>
    </div>
  );
}
