"use client";

import { useChronicle, useHasHydrated } from "@/lib/store";
import { activePlans } from "@/lib/roadmap";
import { Loading } from "@/components/ui/loading";
import { cn } from "@/lib/utils";
import {
  ActivityPanel,
  CoachNudge,
  FocusPanel,
  GoalsPanel,
  MetricGrid,
  MilestonesPanel,
  MockPanel,
  RevisionPanel,
  TodayPanel,
  TrendPanel,
  WelcomePanel,
} from "@/components/dashboard/widgets";
import { RoadmapWeekCard } from "@/components/roadmap/dashboard-card";

/**
 * The Command Center. One twelve-column grid whose proportions follow what
 * matters: the greeting and the headline numbers, then the year of activity
 * beside today, then study performance, then revision, mocks and goals, then
 * the plan and the milestones.
 *
 * The source order is the phone's reading order (today and revision come
 * early); from `md` the `order-*` classes arrange the same panels for wider
 * screens, so nothing is rendered twice.
 */
export default function CommandCenter() {
  const hydrated = useHasHydrated();
  const hasPlans = useChronicle((s) => activePlans(s.plans).length > 0);
  if (!hydrated) return <Loading />;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12 xl:gap-5">
      <WelcomePanel className="h-full md:order-1 md:col-span-12 xl:col-span-5" />
      <MetricGrid className="md:order-2 md:col-span-12 xl:col-span-7" />
      <TodayPanel className="h-full md:order-4 md:col-span-6 xl:col-span-4" />
      <RevisionPanel className="h-full md:order-5 md:col-span-6 xl:order-7 xl:col-span-4" />
      <ActivityPanel className="h-full md:order-3 md:col-span-12 xl:col-span-8" />
      <TrendPanel className="h-full md:order-6 md:col-span-6 xl:order-5 xl:col-span-7" />
      <FocusPanel className="h-full md:order-7 md:col-span-6 xl:order-6 xl:col-span-5" />
      <MockPanel className="h-full md:order-8 md:col-span-6 xl:col-span-4" />
      <GoalsPanel className="h-full md:order-9 md:col-span-6 xl:col-span-4" />
      {hasPlans && (
        <div className="md:order-10 md:col-span-6 xl:col-span-4 [&>*]:h-full">
          <RoadmapWeekCard />
        </div>
      )}
      <MilestonesPanel className={cn("h-full md:order-11 md:col-span-6", hasPlans ? "xl:col-span-4" : "xl:col-span-6")} />
      <CoachNudge className={cn("h-full md:order-12", hasPlans ? "md:col-span-12 xl:col-span-4" : "md:col-span-6 xl:col-span-6")} />
    </div>
  );
}
