"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Flag,
  CalendarClock,
  Trophy,
  Layers,
  Heart,
  TriangleAlert,
  Award,
  Plus,
  Pin,
  Trash2,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Milestone, MilestoneType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Stat } from "@/components/ui/misc";
import { toISODate, formatDate, daysBetween, uid, cn } from "@/lib/utils";

const META: Record<MilestoneType, { icon: typeof Flag }> = {
  Start: { icon: Flag },
  Exam: { icon: CalendarClock },
  Achievement: { icon: Trophy },
  Phase: { icon: Layers },
  Personal: { icon: Heart },
  Setback: { icon: TriangleAlert },
  Selection: { icon: Award },
};
const TYPES = Object.keys(META) as MilestoneType[];

function emptyMilestone(): Milestone {
  return {
    id: uid("ms"),
    date: toISODate(new Date()),
    title: "",
    type: "Achievement",
    description: "",
  };
}

export default function TimelinePage() {
  const hydrated = useHasHydrated();
  const milestones = useChronicle((s) => s.milestones);
  const profile = useChronicle((s) => s.profile);
  const upsert = useChronicle((s) => s.upsertMilestone);
  const remove = useChronicle((s) => s.deleteMilestone);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Milestone>(emptyMilestone());

  const today = toISODate(new Date());
  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.date.localeCompare(b.date)),
    [milestones],
  );

  const journeyDays = daysBetween(profile.startDate, today);
  const daysToExam = daysBetween(today, profile.examDate);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Milestone Timeline"
        title="The journey, as a single line."
        description="From the day you began to the day your name appears in the list. Every checkpoint, victory and setback, in sequence."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyMilestone());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add milestone
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-paper/[0.08] bg-paper/[0.03] p-5">
          <Stat label="Journey day" value={journeyDays} hint="since Day Zero" />
        </div>
        <div className="rounded-2xl border border-paper/[0.08] bg-paper/[0.03] p-5">
          <Stat label="Days to exam" value={daysToExam} hint={profile.targetExam} />
        </div>
        <div className="rounded-2xl border border-paper/[0.08] bg-paper/[0.03] p-5">
          <Stat label="Milestones" value={milestones.length} hint="logged moments" />
        </div>
        <div className="rounded-2xl border border-paper/[0.08] bg-paper/[0.03] p-5">
          <Stat
            label="Attempt"
            value={`#${profile.attemptNumber}`}
            hint={profile.optionalSubject}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-2">
        <div className="absolute bottom-2 left-[1.07rem] top-2 w-px bg-gradient-to-b from-paper/30 via-paper/15 to-transparent" />
        <ol className="space-y-6">
          {sorted.map((m, i) => {
            const Icon = META[m.type].icon;
            const future = m.date > today;
            return (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.4 }}
                className="group relative flex gap-5"
              >
                <span
                  className={cn(
                    "relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                    future
                      ? "border-dashed border-paper/25 bg-ink text-paper/40"
                      : "border-paper/15 bg-paper text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={cn(
                        "text-base font-semibold tracking-snugg",
                        future ? "text-paper/55" : "text-paper",
                      )}
                    >
                      {m.title}
                    </h3>
                    {m.pinned && (
                      <Pin className="h-3.5 w-3.5 text-paper/40" />
                    )}
                    <Badge tone={future ? "outline" : "default"}>{m.type}</Badge>
                    {future && <Badge tone="ghost">upcoming</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-paper/40">{formatDate(m.date)}</p>
                  {m.description && (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-paper/55">
                      {m.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => remove(m.id)}
                  className="h-8 w-8 shrink-0 place-items-center rounded-lg text-paper/30 opacity-0 transition-opacity hover:bg-paper/[0.06] hover:text-paper group-hover:opacity-100 sm:grid"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            );
          })}
        </ol>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add milestone"
        description="Mark a moment worth remembering."
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
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Crossed 130 in a full-length mock"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as MilestoneType })
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="What made this moment matter?"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
