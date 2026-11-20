"use client";

import { Suspense } from "react";
import { useHasHydrated } from "@/lib/store";
import { Loading } from "@/components/ui/loading";
import { CaptureWorkspace } from "@/components/capture/capture-workspace";

/**
 * Daily Journal opens Daily Capture: the day's journal, life readings, goals
 * and habits in one workspace. Past entries are on /journal/history.
 */
export default function JournalPage() {
  const hydrated = useHasHydrated();
  if (!hydrated) return <Loading />;
  return (
    <Suspense fallback={<Loading />}>
      <CaptureWorkspace />
    </Suspense>
  );
}
