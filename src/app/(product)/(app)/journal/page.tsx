"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { Loading } from "@/components/ui/loading";
import { JournalList } from "@/components/journal/journal-list";
import { CaptureWorkspace } from "@/components/capture/capture-workspace";
import { AccomplishedModal } from "@/components/celebrate/accomplished-modal";
import type { JournalCelebration } from "@/components/journal/journal-editor";
import { daysBetween, toISODate } from "@/lib/utils";

/** `?new=1` (the "Log today" links) opens the form again, even with the page already open. */
function OpenOnLink({ onOpen }: { onOpen: () => void }) {
  const fresh = useSearchParams().get("new") === "1";
  useEffect(() => {
    if (fresh) onOpen();
  }, [fresh, onOpen]);
  return null;
}

/**
 * Daily Journal: the journal, with the Daily Capture form (journal, life,
 * goals and habits in four tabs) opening over it. Closing the form shows the
 * journal; "Capture today" opens it again. /journal/history is the journal alone.
 */
export default function JournalPage() {
  const hydrated = useHasHydrated();
  const profile = useChronicle((s) => s.profile);
  const [open, setOpen] = useState<boolean | null>(null);
  const [celebration, setCelebration] = useState<JournalCelebration | null>(null);

  // The journal's own views (?tab=topics|analysis) open without the form over them.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    setOpen(tab !== "topics" && tab !== "analysis");
  }, []);

  const openForm = useCallback(() => setOpen(true), []);
  const closeForm = useCallback(() => {
    setOpen(false);
    window.history.replaceState(null, "", "/journal");
  }, []);

  if (!hydrated) return <Loading />;
  return (
    <>
      <JournalList onCapture={openForm} />
      <Suspense fallback={null}>
        <OpenOnLink onOpen={openForm} />
        {open && <CaptureWorkspace onClose={closeForm} onCelebrate={setCelebration} />}
      </Suspense>
      {celebration && (
        <AccomplishedModal
          open
          onClose={() => setCelebration(null)}
          date={celebration.date}
          journeyDay={daysBetween(profile.startDate, celebration.date)}
          streak={celebration.streak}
          totalAccomplished={celebration.total}
          hoursToday={celebration.hours}
          daysToExam={daysBetween(toISODate(new Date()), profile.examDate)}
        />
      )}
    </>
  );
}
