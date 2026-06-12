"use client";

import { useState } from "react";
import { Plus, Flame, Check } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Habit } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { habitAdherence, habitStreak } from "@/lib/selectors";
import { toISODate, cn } from "@/lib/utils";

const DAYS = 49; // 7 weeks

function MiniGrid({ habit }: { habit: Habit }) {
  const cells: { date: string; done: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = toISODate(d);
    cells.push({ date: iso, done: !!habit.log[iso] });
  }
  return (
    <div className="flex flex-wrap gap-1">
      {cells.map((c) => (
        <span
          key={c.date}
          title={c.date}
          className={cn(
            "h-3 w-3 rounded-[3px]",
            c.done ? "bg-paper" : "bg-paper/[0.07]",
          )}
        />
      ))}
    </div>
  );
}

export default function HabitsPage() {
  const hydrated = useHasHydrated();
  const habits = useChronicle((s) => s.habits);
  const toggle = useChronicle((s) => s.toggleHabit);
  const addHabit = useChronicle((s) => s.addHabit);
  const confirm = useConfirm();

  const [name, setName] = useState("");
  const today = toISODate(new Date());

  async function submitHabit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      await confirm({
        title: "Add this habit?",
        description: `"${trimmed}" will be added as a new daily discipline to track.`,
        tone: "default",
        confirmLabel: "Add habit",
      })
    ) {
      addHabit(trimmed);
      setName("");
    }
  }

  if (!hydrated) return <Loading />;

  const active = habits.filter((h) => !h.archived);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Habit Tracking"
        title="You don't rise to your goals. You fall to your systems."
        description="Selection is the sum of small disciplines repeated daily. Build the systems; the results follow."
      />

      {/* Quick toggle row */}
      <Card className="p-5">
        <p className="eyebrow mb-3">Today · {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
        <div className="flex flex-wrap gap-2">
          {active.map((h) => {
            const done = !!h.log[today];
            return (
              <button
                key={h.id}
                onClick={() => toggle(h.id, today)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                  done
                    ? "border-paper/30 bg-paper text-ink"
                    : "border-paper/12 text-paper/60 hover:border-paper/25 hover:text-paper",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 place-items-center rounded-full border",
                    done ? "border-ink/30 bg-ink/10" : "border-paper/30",
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                </span>
                {h.name}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Habit cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {active.map((h) => {
          const streak = habitStreak(h);
          const adh30 = habitAdherence(h, 30);
          return (
            <Card key={h.id} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-paper">{h.name}</h3>
                  <p className="mt-0.5 text-xs capitalize text-paper/40">
                    {h.cadence} habit
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/[0.05] px-2.5 py-1 text-xs text-paper/70">
                  <Flame className="h-3.5 w-3.5" /> {streak}d
                </span>
              </div>

              <div className="mt-4 flex items-end gap-6">
                <div>
                  <p className="tabular text-2xl font-semibold text-paper">
                    {adh30}%
                  </p>
                  <p className="text-[0.7rem] text-paper/40">30-day rate</p>
                </div>
                <div className="flex-1">
                  <MiniGrid habit={h} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add habit */}
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              void submitHabit();
            }
          }}
          placeholder="Add a new daily discipline…"
          className="flex-1"
        />
        <Button onClick={() => void submitHabit()}>
          <Plus className="h-4 w-4" /> Add habit
        </Button>
      </Card>
    </div>
  );
}
