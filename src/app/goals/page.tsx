"use client";

import { useMemo, useState } from "react";
import { Plus, Target, Check, Trash2 } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Goal, GoalHorizon, GoalStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/form";
import { formatDate, toISODate, uid, cn } from "@/lib/utils";

const HORIZONS: GoalHorizon[] = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Long-term",
];
const STATUSES: GoalStatus[] = ["Active", "Completed", "Missed", "Paused"];

function emptyGoal(): Goal {
  return {
    id: uid("g"),
    title: "",
    horizon: "Weekly",
    metricLabel: "",
    target: 1,
    current: 0,
    unit: "",
    status: "Active",
    createdOn: toISODate(new Date()),
  };
}

export default function GoalsPage() {
  const hydrated = useHasHydrated();
  const goals = useChronicle((s) => s.goals);
  const upsert = useChronicle((s) => s.upsertGoal);
  const remove = useChronicle((s) => s.deleteGoal);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Goal>(emptyGoal());

  const grouped = useMemo(() => {
    return HORIZONS.map((h) => ({
      horizon: h,
      items: goals.filter((g) => g.horizon === h),
    })).filter((g) => g.items.length);
  }, [goals]);

  const activeCount = goals.filter((g) => g.status === "Active").length;
  const doneCount = goals.filter((g) => g.status === "Completed").length;

  function cycleStatus(g: Goal) {
    const next = STATUSES[(STATUSES.indexOf(g.status) + 1) % STATUSES.length];
    upsert({ ...g, status: next });
  }

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Goal Tracking"
        title="Ambition, broken into the achievable."
        description="The dream of selection lives at the top. Beneath it, a ladder of daily, weekly and monthly goals you can actually climb."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyGoal());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">Active</p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">{activeCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
            Completed
          </p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">{doneCount}</p>
        </Card>
        <Card className="col-span-2 p-5 sm:col-span-1">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">Total</p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {goals.length}
          </p>
        </Card>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title="No goals set"
          description="Define what you're chasing — start with this week."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.horizon}>
              <h2 className="mb-3 text-sm font-semibold tracking-snugg text-paper">
                {group.horizon}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {group.items.map((g) => {
                  const pct =
                    g.target && g.target > 0
                      ? Math.round(((g.current ?? 0) / g.target) * 100)
                      : g.status === "Completed"
                        ? 100
                        : 0;
                  return (
                    <Card key={g.id} className="group p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium leading-snug text-paper">
                          {g.title}
                        </p>
                        <button
                          onClick={() => remove(g.id)}
                          className="text-paper/25 opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {g.target ? (
                        <>
                          <div className="mt-3 flex items-center justify-between text-xs text-paper/45">
                            <span className="tabular">
                              {g.current ?? 0} / {g.target} {g.unit}
                            </span>
                            <span className="tabular">{pct}%</span>
                          </div>
                          <Progress value={pct} className="mt-1.5" />
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-paper/40">
                          {g.metricLabel ?? "Long-term aspiration"}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between">
                        <button
                          onClick={() => cycleStatus(g)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                            g.status === "Completed"
                              ? "border-paper/30 bg-paper text-ink"
                              : g.status === "Missed"
                                ? "border-paper/15 text-paper/40"
                                : g.status === "Paused"
                                  ? "border-paper/15 text-paper/45"
                                  : "border-paper/20 text-paper/70 hover:border-paper/35",
                          )}
                        >
                          {g.status === "Completed" && <Check className="h-3 w-3" />}
                          {g.status}
                        </button>
                        {g.deadline && (
                          <span className="text-[0.7rem] text-paper/35">
                            by {formatDate(g.deadline)}
                          </span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New goal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft.title.trim()) return;
                upsert(draft);
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Goal">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Finish Economy syllabus"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Horizon">
              <Select
                value={draft.horizon}
                onChange={(e) =>
                  setDraft({ ...draft, horizon: e.target.value as GoalHorizon })
                }
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline">
              <Input
                type="date"
                value={draft.deadline ?? ""}
                onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Current">
              <Input
                type="number"
                value={draft.current ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, current: parseFloat(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Target">
              <Input
                type="number"
                value={draft.target ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, target: parseFloat(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Unit">
              <Input
                value={draft.unit ?? ""}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                placeholder="hrs"
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
