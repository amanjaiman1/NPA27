"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Route } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { WEEKDAY_NAMES, normalizeWeekStart, isISODate, isMonthKey } from "@/lib/roadmap";
import { Loading } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { PlanForm, type PlanFormRequest } from "@/components/roadmap/plan-form";
import { PlanView } from "@/components/roadmap/plan-view";
import { RoadmapIntro, RoadmapOverview } from "@/components/roadmap/overview";
import { PlanList } from "@/components/roadmap/plan-lists";
import { RoadmapSearch } from "@/components/roadmap/search";
import { useRoadmapNav, type RoadmapTab } from "@/components/roadmap/shared";

const TABS: { label: string; value: RoadmapTab }[] = [
  { label: "Overview", value: "overview" },
  { label: "Yearly", value: "years" },
  { label: "Monthly", value: "months" },
  { label: "Weekly", value: "weeks" },
  { label: "Find", value: "find" },
];

export default function RoadmapPage() {
  // The address says which plan or tab is open, which Next only reads inside a boundary.
  return (
    <Suspense fallback={<Loading />}>
      <Roadmap />
    </Suspense>
  );
}

/**
 * The Roadmap: your own plans for the year, the month and the week. It
 * starts empty, and every plan in it is one you made.
 */
function Roadmap() {
  const hydrated = useHasHydrated();
  const plans = useChronicle((s) => s.plans);
  const weekStart = useChronicle((s) => normalizeWeekStart(s.profile.weekStart));
  const updateProfile = useChronicle((s) => s.updateProfile);
  const params = useSearchParams();
  const nav = useRoadmapNav();
  const [form, setForm] = useState<PlanFormRequest | null>(null);

  const planId = params.get("plan");
  const rawTab = params.get("tab");
  const tab: RoadmapTab = TABS.some((t) => t.value === rawTab) ? (rawTab as RoadmapTab) : "overview";
  const highlight = params.get("item") ?? undefined;
  const plan = planId ? plans.find((p) => p.id === planId) : undefined;

  // `/roadmap?new=week&start=…` (from the dashboard) opens the form once.
  useEffect(() => {
    if (!hydrated) return;
    const level = params.get("new");
    if (level !== "year" && level !== "month" && level !== "week") return;
    const start = params.get("start");
    const month = params.get("month");
    setForm({
      level,
      ...(isISODate(start) ? { start } : {}),
      ...(isMonthKey(month) ? { month } : {}),
    });
    nav({ tab }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) return <Loading />;

  const formEl = (
    <PlanForm
      request={form}
      onClose={() => setForm(null)}
      onSaved={(id) => {
        setForm(null);
        nav({ plan: id });
      }}
    />
  );

  if (planId) {
    return (
      <div className="space-y-6">
        {plan ? (
          <PlanView plan={plan} highlightItem={highlight} onEditPlan={(p) => setForm({ plan: p })} onCreate={setForm} />
        ) : (
          <EmptyState
            icon={<Route className="h-5 w-5" />}
            title="This plan isn't here any more"
            description="It may have been deleted, on this device or another."
            action={
              <Button variant="ghost" onClick={() => nav({ tab: "overview" }, { replace: true })}>
                Back to the Roadmap
              </Button>
            }
          />
        )}
        {formEl}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Roadmap"
        title="My Roadmap"
        description="Plan your preparation year by year, month by month and week by week."
        actions={
          <Button onClick={() => setForm({ level: "week", chooseLevel: true })}>
            <Plus className="h-4 w-4" /> Create a plan
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={(v) => nav({ tab: v }, { replace: true })} options={TABS} className="w-fit" compact />
        {tab === "weeks" && (
          <label className="ml-auto flex items-center gap-2 text-[0.78rem] text-paper/70">
            Weeks start on
            <Select
              value={String(weekStart)}
              onChange={(e) => updateProfile({ weekStart: Number(e.target.value) })}
              className="w-auto py-1.5 text-[0.8rem]"
            >
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {tab === "overview" &&
        (plans.length === 0 ? (
          <RoadmapIntro onCreate={setForm} />
        ) : (
          <RoadmapOverview onCreate={setForm} onFind={(overdue) => nav({ tab: "find", overdue })} />
        ))}
      {tab === "years" && <PlanList level="year" onCreate={setForm} />}
      {tab === "months" && <PlanList level="month" onCreate={setForm} />}
      {tab === "weeks" && <PlanList level="week" onCreate={setForm} />}
      {tab === "find" && <RoadmapSearch key={params.get("overdue") ?? "all"} startWithOverdue={params.get("overdue") === "1"} />}

      {formEl}
    </div>
  );
}
