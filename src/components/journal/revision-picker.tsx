"use client";

import { useMemo } from "react";
import { Check, Repeat, AlarmClock, RotateCcw } from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { RevisionSession } from "@/lib/types";
import { ListEditor } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { bucketRevisions, describeSchedule } from "@/lib/revision";
import { cn } from "@/lib/utils";
import { mergeByKey } from "@/components/journal/constants";

function ConfidencePips({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", i < value ? "bg-accent" : "bg-paper/15")}
        />
      ))}
    </span>
  );
}

/**
 * The revision queue, inside the journal.
 *
 * Revision sessions used to be free text, which meant the schedule and the diary
 * never met: you could write "revised Fundamental Rights" and the item sitting
 * overdue in the queue stayed overdue. Picking from the queue here records the
 * item's id on the entry, and saving the day advances its spaced-repetition
 * schedule. Free text still works for anything not on the queue.
 */
export function RevisionPicker({
  date,
  sessions,
  onChange,
}: {
  /** The day being logged — what counts as "due" is relative to it. */
  date: string;
  sessions: RevisionSession[];
  onChange: (next: RevisionSession[]) => void;
}) {
  const revisions = useChronicle((s) => s.revisions);
  const subjects = useChronicle((s) => s.subjects);

  const linked = useMemo(() => sessions.filter((s) => s.revisionItemId), [sessions]);
  const free = useMemo(() => sessions.filter((s) => !s.revisionItemId), [sessions]);
  const pickedIds = useMemo(
    () => new Set(linked.map((s) => s.revisionItemId)),
    [linked],
  );

  /**
   * What to offer. Everything due as of this date, plus anything already picked —
   * that second half matters on an edit: saving pushes an item's `nextDue` into
   * the future, so without it a re-opened entry would show nothing selected and
   * silently drop the link on the next save.
   */
  const offered = useMemo(() => {
    const { overdue, dueToday } = bucketRevisions(revisions, date);
    const due = [...overdue, ...dueToday];
    const extras = revisions.filter(
      (r) => pickedIds.has(r.id) && !due.some((d) => d.id === r.id),
    );
    return [...due, ...extras];
  }, [revisions, date, pickedIds]);

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? id;

  function toggle(itemId: string, topic: string, subjectId: string) {
    if (pickedIds.has(itemId)) {
      onChange(sessions.filter((s) => s.revisionItemId !== itemId));
    } else {
      onChange([...sessions, { revisionItemId: itemId, topic, subjectId, recalled: true }]);
    }
  }

  function setRecalled(itemId: string, recalled: boolean) {
    onChange(
      sessions.map((s) =>
        s.revisionItemId === itemId ? { ...s, recalled } : s,
      ),
    );
  }

  return (
    <div className="space-y-3">
      {offered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper/15 px-4 py-3 text-[0.8rem] text-paper/45">
          Nothing on the revision queue is due for this date. Anything you type
          below is still recorded on the day.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.75rem] text-paper/45">
              Tick what you actually revised — saving reschedules it.
            </p>
            {linked.length > 0 && (
              <Badge tone="accent">
                {linked.length} selected
              </Badge>
            )}
          </div>

          <ul className="space-y-1.5">
            {offered.map((r) => {
              const picked = pickedIds.has(r.id);
              const session = linked.find((s) => s.revisionItemId === r.id);
              const recalled = session ? session.recalled !== false : true;
              const late = r.nextDue < date;
              const alreadyLogged = r.lastRevised === date;
              return (
                <li key={r.id}>
                  <div
                    className={cn(
                      "rounded-xl border transition-colors",
                      picked
                        ? "border-accent/40 bg-accent/[0.07]"
                        : "border-line bg-paper/[0.02] hover:border-paper/20",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(r.id, r.topic, r.subjectId)}
                      aria-pressed={picked}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                          picked
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-paper/25",
                        )}
                      >
                        {picked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-paper">
                          {r.topic}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.68rem] text-paper/45">
                          <span className="truncate">{subjectName(r.subjectId)}</span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              late && "text-danger",
                            )}
                          >
                            {late && <AlarmClock className="h-3 w-3" />}
                            {describeSchedule(r, date)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Repeat className="h-3 w-3" />R{r.repetitions}
                          </span>
                          {alreadyLogged && (
                            <span className="text-paper/35">already logged today</span>
                          )}
                        </span>
                      </span>
                      <ConfidencePips value={r.confidence} />
                    </button>

                    {/* How it went decides which way the ladder moves, so it is
                        asked here rather than assumed. */}
                    {picked && (
                      <div className="flex items-center gap-1.5 border-t border-accent/20 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setRecalled(r.id, true)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
                            recalled
                              ? "bg-positive/15 text-positive"
                              : "text-paper/45 hover:text-paper",
                          )}
                        >
                          <Check className="h-3 w-3" /> Recalled
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecalled(r.id, false)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
                            !recalled
                              ? "bg-danger/15 text-danger"
                              : "text-paper/45 hover:text-paper",
                          )}
                        >
                          <RotateCcw className="h-3 w-3" /> Didn&rsquo;t stick
                        </button>
                        <span className="ml-auto text-[0.66rem] text-paper/35">
                          {recalled
                            ? "interval steps up"
                            : "back to a 1-day interval"}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div>
        <p className="mb-1.5 text-[0.7rem] font-medium uppercase tracking-wider text-paper/40">
          Anything else revised
        </p>
        <ListEditor
          variant="chips"
          items={free.map((r) => r.topic)}
          onChange={(items) => onChange([...linked, ...mergeByKey(items, free, "topic")])}
          placeholder="Topic revised"
        />
      </div>
    </div>
  );
}
